import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { PrismaClient } from "@hostify/db";
import { runBuild, type BuildJob } from "./docker-runner.js";
import { analyzeOutput } from "./output-analyzer.js";
import { registerDeployment } from "./router-registrar.js";
import { AppRunner } from "./app-runner.js";
import { publishLog } from "./log-streamer.js";
import path from "path";
import fs from "fs/promises";
import os from "os";

// ─── Import the Backend Services & Database Workers so they run concurrently ──
import "./service-worker.js";
import "./database-worker.js";
import { initRemoteExec } from "./remote-exec.js";
import { startMetricsCollector } from "./metrics-collector.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const BUILD_BASE_DIR =
  process.env.BUILD_BASE_DIR && !process.env.BUILD_BASE_DIR.startsWith("/tmp")
    ? process.env.BUILD_BASE_DIR
    : "/opt/whizan/repos";
const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "20.2.136.11.nip.io";

// ─── Shared singletons ───────────────────────────────────────────────────────

const redisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times: number) {
    return Math.min(times * 100, 3000);
  },
  reconnectOnError() {
    return true;
  },
};

// redisPub: used for publishing logs + cancel signals
const redisPub = new Redis(REDIS_URL, redisOptions);
redisPub.on("error", (err) => {
  // Suppress uncaught error events when idle connections drop
  if (err.message?.includes("Connection is closed")) return;
  console.warn("[RedisPub warn]", err.message);
});

// redisSub: dedicated subscriber connection (ioredis requirement)
const redisSub = new Redis(REDIS_URL, redisOptions);
redisSub.on("error", (err) => {
  if (err.message?.includes("Connection is closed")) return;
  console.warn("[RedisSub warn]", err.message);
});

const prisma = new PrismaClient();

const appRunner = new AppRunner();

// Shared queue for adding jobs programmatically
import { Queue } from "bullmq";
const buildQueue = new Queue<BuildJob>("build", {
  connection: new Redis(REDIS_URL, redisOptions),
});

// ─── Worker ──────────────────────────────────────────────────────────────────

const worker = new Worker<BuildJob>(
  "build",
  async (job: Job<BuildJob>) => {
    const {
      deploymentId,
      projectId,
      repoUrl,
      branch,
      buildCommand,
      installCommand,
      framework,
      slug,
      isResume,
    } = job.data;

    const buildDir = path.join(BUILD_BASE_DIR, deploymentId);

    // ── Helpers ─────────────────────────────────────────────────────────────

    const log = async (msg: string): Promise<void> => {
      console.log(`[${deploymentId.slice(0, 8)}] ${msg}`);
      await publishLog(redisPub, deploymentId, msg);
    };

    const markFailed = async (msg: string): Promise<void> => {
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: "FAILED", buildFinishedAt: new Date(), errorMessage: msg },
      });
    };

    // ── Cancellation via Redis Pub/Sub ───────────────────────────────────────

    const abortController = new AbortController();
    const cancelChannel = `cancel:${deploymentId}`;

    const onCancelMessage = (channel: string, message: string): void => {
      if (channel === cancelChannel && message === "CANCEL") {
        abortController.abort();
      }
    };

    await redisSub.subscribe(cancelChannel);
    redisSub.on("message", onCancelMessage);

    try {
      // ── 1. Mark BUILDING ─────────────────────────────────────────────────
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: "BUILDING", buildStartedAt: new Date() },
      });

      // ── Determine if existing build artifacts on disk can be resumed ───
      let canResume = false;
      if (isResume) {
        try {
          const stats = await fs.stat(buildDir);
          if (stats.isDirectory()) {
            const files = await fs.readdir(buildDir);
            if (files.some((f) => [".next", "dist", "build", "out", "node_modules"].includes(f))) {
              canResume = true;
            }
          }
        } catch {
          canResume = false;
        }
      }

      // ── 2. Clone repo (always start clean if fresh build or missing artifacts) ──
      if (!canResume) {
        if (isResume) {
          await log("⚠️ Previous build directory missing on disk, initiating automatic cold-start rebuild...");
        }
        await log(`Cloning ${repoUrl} (branch: ${branch})...`);
        const { simpleGit } = await import("simple-git");

        // Always wipe and re-create the build dir to avoid stale leftovers
        await fs.rm(buildDir, { recursive: true, force: true }).catch(() => {});
        await fs.mkdir(buildDir, { recursive: true });

        await simpleGit().clone(repoUrl, buildDir, ["--depth=1", `--branch=${branch}`]);
        await log("✓ Clone complete");
      }

      // ── 3. Load & decrypt env vars ───────────────────────────────────────
      const envRows = await prisma.envVariable.findMany({ where: { projectId } });
      const { decrypt } = await import("./crypto.js");
      const envVars: Record<string, string> = {};
      for (const row of envRows) {
        envVars[row.key] = decrypt(row.value);
      }

      // ── 4. Build inside Docker ───────────────────────────────────────────
      if (!canResume) {
        await log("Starting build container...");
        const exitCode = await runBuild({
          projectId,
          buildDir,
          installCommand,
          buildCommand,
          envVars,
          onLog: log,
          abortSignal: abortController.signal,
        });

        if (exitCode !== 0) {
          throw new Error(`Build failed with exit code ${exitCode}`);
        }
        await log("✓ Build successful");
      } else {
        await log("✓ Build skipped (resuming existing build artifacts on disk)");
      }

      // ── 5. Analyze output ────────────────────────────────────────────────
      await log("Analyzing build output...");
      const analysis = await analyzeOutput(buildDir, framework);
      await log(`✓ Detected type: ${analysis.type}`);

      // ── 6. Start SSR container if needed ────────────────────────────────
      let containerPort: number | undefined;
      if (analysis.type === "ssr" || analysis.type === "hybrid") {
        await log("Starting SSR container...");
        containerPort = await appRunner.startApp(
          deploymentId,
          buildDir,
          envVars,
          analysis.serverEntry
        );
        await log(`✓ SSR container started on port ${containerPort}`);
      }

      // ── 7. Register with edge router ─────────────────────────────────────
      await registerDeployment(redisPub, slug, {
        type: analysis.type,
        staticDir: analysis.staticDir ? path.join(buildDir, analysis.staticDir) : undefined,
        containerPort,
        deploymentId,
        projectId,
      });

      // ── 8. Mark READY ────────────────────────────────────────────────────
      const url = `http://${slug}.${BASE_DOMAIN}`;
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "READY",
          buildFinishedAt: new Date(),
          deploymentType: analysis.type.toUpperCase() as "STATIC" | "SSR" | "HYBRID",
          url,
          containerPort,
          errorMessage: null,
        },
      });

      await log(`✓ Deployment live at ${url}`);

      // ── 9. Zero-downtime cleanup of old deployments ──────────────────────
      if (!isResume) {
        await log("Cleaning up previous deployments...");
        const oldDeployments = await prisma.deployment.findMany({
          where: { projectId, id: { not: deploymentId } },
        });

        if (oldDeployments.length > 0) {
          const Docker = (await import("dockerode")).default;
          const docker = new Docker({ socketPath: "/var/run/docker.sock" });
          const containers = await docker.listContainers({ all: true }).catch(() => []);

          for (const old of oldDeployments) {
            // Stop old containers
            const matches = containers.filter((c) => c.Mounts?.some((m) => m.Source?.includes(old.id)));
            for (const info of matches) {
              try {
                const container = docker.getContainer(info.Id);
                if (info.State === "running") await container.stop({ t: 5 });
                await container.remove({ force: true });
              } catch {}
            }
            // Delete old build files
            await fs.rm(path.join(BUILD_BASE_DIR, old.id), { recursive: true, force: true }).catch(() => {});
            // Clear old logs
            await redisPub.del(`build-logs:${old.id}`);
            // Remove from DB to enforce 1-build rule
            await prisma.deployment.delete({ where: { id: old.id } }).catch(() => {});
          }
          await log(`✓ Cleaned up ${oldDeployments.length} old deployment(s)`);
        }
      }

      await publishLog(redisPub, deploymentId, "__DONE__");

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      const wasCancelled = abortController.signal.aborted;

      await log(wasCancelled ? "⚡ Deployment cancelled by user" : `✗ Build failed: ${msg}`);
      await publishLog(redisPub, deploymentId, "__DONE__");
      await markFailed(wasCancelled ? "Cancelled by user" : msg);

      // Clean up build dir on failure / cancellation (no app to serve)
      if (!isResume) {
        await fs.rm(buildDir, { recursive: true, force: true }).catch(() => {});
      }

      if (!wasCancelled) {
        throw err; // Re-throw so BullMQ marks job as failed
      }
    } finally {
      // Always unsubscribe from cancel channel to free Redis resources
      redisSub.off("message", onCancelMessage);
      await redisSub.unsubscribe(cancelChannel).catch(() => {});
    }
  },
  {
    connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false }),
    concurrency: 1, // Strictly 1 build at a time
    limiter: { max: 10, duration: 60_000 },
  }
);

// ─── Worker events ───────────────────────────────────────────────────────────

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

// ─── Scale-to-Zero Idle Scaler & Wakeup ──────────────────────────────────────

// 1. Listen for wakeups from Edge Router
redisSub.subscribe("wakeup", "admin:commands").catch(() => {});
redisSub.on("message", async (channel, message) => {
  if (channel === "wakeup") {
    let dId = message;
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === "service" || parsed.type === "SERVICE") return; // Handled by service-worker.ts
      dId = parsed.deploymentId || message;
    } catch {
      // Raw string ID
    }
    const d = await prisma.deployment.findUnique({
      where: { id: dId },
      include: { project: true }
    });
    // If it's already READY, it just needs its container started
    if (d && (d.status === "READY" || d.status === "PAUSED")) {
      console.log(`[Scaler] Triggering cold-start for ${d.id}`);
      await buildQueue.add("build", {
        deploymentId: d.id,
        projectId: d.projectId,
        repoUrl: d.project.githubRepoUrl,
        branch: d.project.branch,
        buildCommand: d.project.buildCommand,
        installCommand: d.project.installCommand,
        outputDir: d.project.outputDir,
        framework: d.project.framework,
        slug: d.project.slug,
        isResume: true,
      });
    }
  }

  if (channel === "admin:commands") {
    try {
      const payload = JSON.parse(message);
      
      const Docker = (await import("dockerode")).default;
      const docker = new Docker({ socketPath: "/var/run/docker.sock" });

      if (payload.action === "KILL_CONTAINER_BY_ID") {
        const cId = payload.containerId;
        console.log(`[Admin] Killing orphaned container ${cId}`);
        const container = docker.getContainer(cId);
        try {
          const info = await container.inspect();
          if (info.State.Running) await container.stop({ t: 2 }).catch(() => {});
          await container.remove({ force: true }).catch(() => {});
          console.log(`[Admin] Successfully removed container ${cId}`);
        } catch (err) {
          console.error(`[Admin] Failed to kill container ${cId}`, err);
        }
        return;
      }

      if (payload.action === "RESTART_WORKER") {
        const { exec } = await import("child_process");
        console.log("[Admin] Restarting worker via PM2...");
        exec("pm2 restart whizan-worker", () => {});
        return;
      }

      if (payload.action === "GET_CONTAINER_LOGS") {
        const { exec } = await import("child_process");
        const util = await import("util");
        const execAsync = util.promisify(exec);
        try {
          const { stdout, stderr } = await execAsync(`docker logs --tail 200 ${payload.containerId}`);
          const logs = [stdout, stderr].filter(Boolean).join("\n").trim();
          await redisPub.publish(payload.replyTo, logs || "Container has no logs yet.");
        } catch (err: any) {
          await redisPub.publish(payload.replyTo, `Failed to fetch logs: ${err.message}`);
        }
        return;
      }

      if (payload.action === "RESTART_ROUTER") {
        const { exec } = await import("child_process");
        console.log("[Admin] Restarting router via PM2...");
        exec("pm2 restart whizan-router", () => {});
        return;
      }

      if (payload.action === "DELETE_FILE") {
        const targetPath = payload.path;
        if (
          targetPath.startsWith("/opt/whizan-builds/") ||
          targetPath.startsWith("/tmp/hostify-builds/") ||
          targetPath.startsWith("/tmp/hostify-services/") ||
          targetPath.startsWith("/tmp/whizan-builds/") ||
          targetPath.startsWith("/var/log/whizan/") ||
          targetPath.startsWith("/root/.pm2/logs/") ||
          (BUILD_BASE_DIR && targetPath.startsWith(BUILD_BASE_DIR))
        ) {
          console.log(`[Admin] Deleting file/directory: ${targetPath}`);
          await fs.rm(targetPath, { recursive: true, force: true }).catch(() => {});
        }
        return;
      }

      if (payload.action === "STOP_CONTAINER" || payload.action === "DELETE_CONTAINER") {
        const dId = payload.deploymentId;
        console.log(`[Admin] Received ${payload.action} for deployment ${dId}`);
        
        const containers = await docker.listContainers({ all: true }).catch(() => []);
        
        const matches = containers.filter((c) => c.Mounts?.some((m) => m.Source?.includes(dId)));
        for (const info of matches) {
          const container = docker.getContainer(info.Id);
          if (info.State === "running") await container.stop({ t: 2 }).catch(() => {});
          await container.remove({ force: true }).catch(() => {});
          console.log(`[Admin] Removed container ${info.Id} for deployment ${dId}`);
        }

        if (payload.action === "DELETE_CONTAINER") {
          await fs.rm(path.join(BUILD_BASE_DIR, dId), { recursive: true, force: true }).catch(() => {});
          await redisPub.del(`build-logs:${dId}`);
          console.log(`[Admin] Cleaned up files for deployment ${dId}`);
        }
      }
    } catch (err) {
      console.error("[Admin] Error executing command:", err);
    }
  }
});

// 2. Idle Scaler (Checks every minute)
const scalerInterval = setInterval(async () => {
  try {
    const activeDeploys = await prisma.deployment.findMany({
      where: { status: "READY", deploymentType: { in: ["SSR", "HYBRID"] } },
      include: { project: true }
    });

    for (const d of activeDeploys) {
      const lastAccessRaw = await redisPub.get(`access:${d.id}`);
      // Default to buildFinishedAt if never accessed yet
      const lastAccess = lastAccessRaw ? parseInt(lastAccessRaw) : (d.buildFinishedAt?.getTime() ?? d.createdAt.getTime());
      const idleMs = Date.now() - lastAccess;

      // Spin down if idle for > 10 minutes
      if (idleMs > 10 * 60 * 1000) {
        console.log(`[Scaler] Deployment ${d.id} idle for ${Math.round(idleMs/60000)}m. Scaling to zero...`);
        
        const Docker = (await import("dockerode")).default;
        const docker = new Docker({ socketPath: "/var/run/docker.sock" });
        const containers = await docker.listContainers({ all: true }).catch(() => []);
        
        const matches = containers.filter((c) => c.Mounts?.some((m) => m.Source?.includes(d.id)));
        for (const info of matches) {
          const container = docker.getContainer(info.Id);
          if (info.State === "running") await container.stop({ t: 2 }).catch(() => {});
          await container.remove({ force: true }).catch(() => {});
        }

        // Remove containerPort from Edge Router to trigger wakeup on next request
        const routerKey = `deployment:${d.project.slug}`;
        const raw = await redisPub.get(routerKey);
        if (raw) {
          const info = JSON.parse(raw);
          delete info.containerPort;
          await redisPub.set(routerKey, JSON.stringify(info));
        }

        // Remove containerPort from DB so the Dashboard UI knows it is spun down
        await prisma.deployment.update({
          where: { id: d.id },
          data: { containerPort: null }
        }).catch(() => {});
      }
    }
    // Backend Auto-Sleep Scaler
    const activeBackendDeploys = await prisma.serviceDeployment.findMany({
      where: { status: "READY", service: { autoSleep: true } },
      include: { service: true }
    });

    for (const d of activeBackendDeploys) {
      if (!d.containerPort) continue; // already asleep

      const lastAccessRaw = await redisPub.get(`access:${d.id}`);
      const lastAccess = lastAccessRaw ? parseInt(lastAccessRaw) : (d.buildFinishedAt?.getTime() ?? d.createdAt.getTime());
      const idleMs = Date.now() - lastAccess;

      // Spin down if idle for > 15 minutes
      if (idleMs > 15 * 60 * 1000) {
        console.log(`[Scaler] Backend Service ${d.service.slug} idle for ${Math.round(idleMs/60000)}m. Stopping container...`);
        await publishLog(redisPub, d.id, `💤 [Auto-Sleep] Service ${d.service.slug} was idle for ${Math.round(idleMs / 60000)}m. Container stopped to save resources.`);
        
        const Docker = (await import("dockerode")).default;
        const docker = new Docker({ socketPath: "/var/run/docker.sock" });
        
        const allConts = await docker.listContainers({ all: true }).catch(() => []);
        const match = allConts.find((c) =>
          c.Names?.some(
            (n) =>
              n === `/service-${d.service.slug}-${d.id.slice(0, 8)}` ||
              n === `/service-${d.service.slug}` ||
              (n.startsWith(`/service-${d.service.slug}-`) && c.Labels?.["deploymentId"] === d.id)
          )
        );
        if (match && match.State === "running") {
          const container = docker.getContainer(match.Id);
          // Only STOP the container to preserve state for instant wakeups
          await container.stop({ t: 2 }).catch(() => {});
        }

        // Remove containerPort from Edge Router to trigger wakeup on next request
        const routerKey = `deployment:${d.service.slug}`;
        const raw = await redisPub.get(routerKey);
        if (raw) {
          const info = JSON.parse(raw);
          delete info.containerPort;
          await redisPub.set(routerKey, JSON.stringify(info));
        }

        // Remove containerPort from DB so the Dashboard UI knows it is spun down
        await prisma.serviceDeployment.update({
          where: { id: d.id },
          data: { containerPort: null }
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[Scaler] Error:", err);
  }
}, 60 * 1000);


// ─── VM Health Stats Reporter ────────────────────────────────────────────────

const statsInterval = setInterval(async () => {
  try {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // CPU usage averaged across all cores
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + ((total - idle) / total) * 100;
    }, 0) / cpus.length;

    // Docker container stats
    let dockerContainers: any[] = [];
    try {
      const Docker = (await import("dockerode")).default;
      const docker = new Docker({ socketPath: "/var/run/docker.sock" });
      const containers = await docker.listContainers({ all: true });
      
      dockerContainers = await Promise.all(containers.map(async (c) => {
        let cpuPercent = 0;
        let memUsageMB = 0;
        let memLimitMB = 0;
        let memPercent = 0;
        
        if (c.State === "running") {
          try {
            const container = docker.getContainer(c.Id);
            const stats = await container.stats({ stream: false });
            
            // Calculate CPU percent
            const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - (stats.precpu_stats?.cpu_usage?.total_usage || 0);
            const systemDelta = stats.cpu_stats.system_cpu_usage - (stats.precpu_stats?.system_cpu_usage || 0);
            const onlineCpus = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1;
            if (systemDelta > 0 && cpuDelta > 0) {
              cpuPercent = (cpuDelta / systemDelta) * onlineCpus * 100.0;
            }
            
            // Calculate Memory
            memUsageMB = (stats.memory_stats.usage || 0) / 1024 / 1024;
            memLimitMB = (stats.memory_stats.limit || 0) / 1024 / 1024;
            if (memLimitMB > 0) {
              memPercent = (memUsageMB / memLimitMB) * 100.0;
            }

            let rxBytes = 0;
            let txBytes = 0;
            if (stats.networks) {
              for (const net of Object.values(stats.networks) as any[]) {
                rxBytes += net.rx_bytes || 0;
                txBytes += net.tx_bytes || 0;
              }
            }

            const serviceId = c.Labels?.["serviceId"];
            if (serviceId) {
              const metricPoint = {
                timestamp: new Date().toISOString(),
                cpuPercent: Number(cpuPercent.toFixed(2)),
                memUsageMB: Number(memUsageMB.toFixed(2)),
                memLimitMB: Number(memLimitMB.toFixed(2)),
                memPercent: Number(memPercent.toFixed(2)),
                rxBytes,
                txBytes,
                rxRateKbps: 0,
                txRateKbps: 0,
                pids: stats.pids_stats?.current || 0,
                pidsLimit: stats.pids_stats?.limit || 128,
              };
              await redisPub.lpush(`metrics:service:${serviceId}`, JSON.stringify(metricPoint)).catch(() => {});
              await redisPub.ltrim(`metrics:service:${serviceId}`, 0, 59).catch(() => {});
              await redisPub.expire(`metrics:service:${serviceId}`, 3600).catch(() => {});
            }
          } catch (err) {}
        }

        return {
          id: c.Id.slice(0, 12),
          name: c.Names?.[0]?.replace(/^\//, "") ?? "unknown",
          image: c.Image,
          state: c.State,
          status: c.Status,
          created: c.Created,
          ports: c.Ports?.map((p: any) => `${p.PublicPort || "?"}:${p.PrivatePort}`).filter(Boolean),
          deploymentId: c.Mounts?.find((m: any) => m.Source?.includes("hostify-services") || m.Source?.includes("whizan-builds"))?.Source?.split("/")?.pop() || null,
          cpuPercent: Number(cpuPercent.toFixed(2)),
          memUsageMB: Number(memUsageMB.toFixed(2)),
          memLimitMB: Number(memLimitMB.toFixed(2)),
          memPercent: Number(memPercent.toFixed(2)),
        };
      }));
    } catch (e) {
      console.error("[Stats] Failed to fetch docker stats", e);
    }

    // BullMQ queue stats
    let queueStats = { waiting: 0, active: 0, completed: 0, failed: 0 };
    try {
      queueStats = {
        waiting: await buildQueue.getWaitingCount(),
        active: await buildQueue.getActiveCount(),
        completed: await buildQueue.getCompletedCount(),
        failed: await buildQueue.getFailedCount(),
      };
    } catch {}

    // Disk space stats
    let diskStats = { totalMB: 0, usedMB: 0, freeMB: 0, usagePercent: 0 };
    try {
      const disk = await fs.statfs("/");
      const totalMB = Math.round((disk.blocks * disk.bsize) / 1024 / 1024);
      const freeMB = Math.round((disk.bfree * disk.bsize) / 1024 / 1024);
      const usedMB = totalMB - freeMB;
      diskStats = {
        totalMB,
        usedMB,
        freeMB,
        usagePercent: totalMB > 0 ? Math.round((usedMB / totalMB) * 1000) / 10 : 0,
      };
    } catch {}

    // Disk files (Builds, Workspaces, and Logs)
    let diskFiles: { path: string; type: string; sizeMB: number; displayName?: string }[] = [];
    try {
      const { exec } = await import("child_process");
      const util = await import("util");
      const execAsync = util.promisify(exec);
      
      const scanDirs = [
        "/opt/whizan-builds/*",
        "/tmp/hostify-builds/*",
        "/tmp/hostify-services/*",
        "/tmp/whizan-builds/*",
        BUILD_BASE_DIR ? `${BUILD_BASE_DIR}/*` : "",
        "/var/log/whizan/*",
        "/root/.pm2/logs/*",
      ].filter(Boolean).join(" ");

      const { stdout } = await execAsync(`du -sm ${scanDirs} 2>/dev/null || true`);
      const diskFileEntries = stdout.trim().split("\n").filter(Boolean);
      diskFiles = await Promise.all(diskFileEntries.map(async (line) => {
        const [sizeStr, filePath] = line.split(/\s+/);
        const sizeMB = parseInt(sizeStr) || 0;
        let type = "log";
        let displayName = filePath;

        const isBuild =
          filePath.startsWith("/opt/whizan-builds") ||
          filePath.startsWith("/tmp/hostify-builds") ||
          filePath.startsWith("/tmp/hostify-services") ||
          filePath.startsWith("/tmp/whizan-builds") ||
          (BUILD_BASE_DIR && filePath.startsWith(BUILD_BASE_DIR));

        if (isBuild) {
          const id = filePath.split("/").filter(Boolean).pop();
          if (id) {
            try {
              // 1. Check if it's a backend service deployment
              const sDep = await prisma.serviceDeployment.findUnique({
                where: { id },
                include: { service: true }
              });
              if (sDep?.service) {
                type = "backend-service";
                displayName = `${filePath} (Backend: ${sDep.service.name} • ${sDep.id.slice(0, 8)})`;
              } else {
                // 2. Check if it's a frontend deployment
                const fDep = await prisma.deployment.findUnique({
                  where: { id },
                  include: { project: true }
                });
                if (fDep?.project) {
                  type = "frontend-build";
                  displayName = `${filePath} (Frontend: ${fDep.project.name} • ${fDep.id.slice(0, 8)})`;
                } else {
                  type = "build-cache";
                  displayName = `${filePath} (Build Cache / Workspace)`;
                }
              }
            } catch (e) {
              type = "build-cache";
              displayName = `${filePath} (Build Workspace)`;
            }
          }
        } else if (filePath.includes(".pm2/logs") || filePath.startsWith("/var/log")) {
          type = "system-log";
          const fileName = filePath.split("/").filter(Boolean).pop();
          displayName = `${filePath} (${fileName})`;
        }
        
        return {
          path: filePath,
          displayName,
          type,
          sizeMB,
        };
      }));
      diskFiles.sort((a, b) => b.sizeMB - a.sizeMB);
    } catch {}

    // Read tail of logs and store in redis
    try {
      const { exec } = await import("child_process");
      const util = await import("util");
      const execAsync = util.promisify(exec);
      
      const [workerOut, workerErr, routerOut, routerErr] = await Promise.all([
        execAsync("cat /root/.pm2/logs/whizan-worker*out*.log /var/log/whizan/worker-out*.log 2>/dev/null | tail -n 100 || true").then(r => r.stdout).catch(() => ""),
        execAsync("cat /root/.pm2/logs/whizan-worker*error*.log /var/log/whizan/worker-error*.log 2>/dev/null | tail -n 100 || true").then(r => r.stdout).catch(() => ""),
        execAsync("cat /root/.pm2/logs/whizan-router*out*.log /var/log/whizan/router-out*.log 2>/dev/null | tail -n 100 || true").then(r => r.stdout).catch(() => ""),
        execAsync("cat /root/.pm2/logs/whizan-router*error*.log /var/log/whizan/router-error*.log 2>/dev/null | tail -n 100 || true").then(r => r.stdout).catch(() => ""),
      ]);

      const defaultWorkerLog = `[${new Date().toISOString()}] Local build-worker active on ${os.hostname()} (${os.platform()})\n[BullMQ] Worker listening for build and deployment jobs.\n[Docker] Connected to Docker socket.\n[Status] Operational`;
      const defaultRouterLog = `[${new Date().toISOString()}] Local edge-router active on port 8080.\n[Status] Operational`;

      await redisPub.set("vm:logs:worker:out", workerOut.trim() || defaultWorkerLog, "EX", 60);
      await redisPub.set("vm:logs:worker:err", workerErr.trim() || "No worker error logs recorded.", "EX", 60);
      await redisPub.set("vm:logs:router:out", routerOut.trim() || defaultRouterLog, "EX", 60);
      await redisPub.set("vm:logs:router:err", routerErr.trim() || "No edge router error logs recorded.", "EX", 60);
    } catch {}

    const stats = {
      timestamp: Date.now(),
      hostname: os.hostname(),
      platform: os.platform(),
      uptime: os.uptime(),
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model ?? "unknown",
        usagePercent: Math.round(cpuUsage * 10) / 10,
      },
      memory: {
        totalMB: Math.round(totalMem / 1024 / 1024),
        usedMB: Math.round(usedMem / 1024 / 1024),
        freeMB: Math.round(freeMem / 1024 / 1024),
        usagePercent: Math.round((usedMem / totalMem) * 1000) / 10,
      },
      disk: diskStats,
      docker: {
        containers: dockerContainers,
        totalContainers: dockerContainers.length,
        runningContainers: dockerContainers.filter((c) => c.state === "running").length,
      },
      queue: queueStats,
      files: diskFiles,
    };

    if (redisPub.status === "ready") {
      await redisPub.set("vm:stats", JSON.stringify(stats), "EX", 60);
    }
  } catch (err: any) {
    if (!err?.message?.includes("Connection is closed")) {
      console.warn("[Stats] Notice:", err?.message || err);
    }
  }
}, 15_000);

// ─── Startup ─────────────────────────────────────────────────────────────────

console.log("[Worker] Build worker started — waiting for jobs...");
initRemoteExec().catch((e) => console.error("[Remote Exec Error]", e));
startMetricsCollector();

// ── Database Reconciliation on VM Startup ──────────────────────────────────
(async () => {
  try {
    const runningDbs = await prisma.databaseService.findMany({
      where: { status: "RUNNING" },
    });
    if (runningDbs.length > 0) {
      console.log(`[Reconciler] Found ${runningDbs.length} running database(s) in DB. Verifying Docker containers...`);
      const Docker = (await import("dockerode")).default;
      const docker = new Docker({ socketPath: "/var/run/docker.sock" });
      const containers = await docker.listContainers({ all: true }).catch(() => []);

      for (const db of runningDbs) {
        const cName = `whizan-db-${db.id}`;
        const match = containers.find((c) => c.Names?.some((n) => n === `/${cName}`));
        if (match && match.State !== "running") {
          console.log(`[Reconciler] Resuming stopped container ${cName} on VM startup...`);
          const c = docker.getContainer(match.Id);
          await c.start().catch((e: any) => console.warn(`[Reconciler] Start notice for ${cName}:`, e.message));
          await redisPub.set(`db:access:${db.id}`, Date.now()).catch(() => {});
        }
      }
    }
  } catch (err: any) {
    console.warn("[Reconciler] Database startup check notice:", err.message);
  }
})();

// ─── Graceful shutdown ───────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  console.log("[Worker] Shutting down gracefully...");
  clearInterval(scalerInterval);
  await worker.close();
  await redisPub.quit();
  await redisSub.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
