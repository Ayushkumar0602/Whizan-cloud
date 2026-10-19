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
import { startVmReaper } from "./vm-reaper.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const BUILD_BASE_DIR =
  process.env.BUILD_BASE_DIR && !process.env.BUILD_BASE_DIR.startsWith("/tmp")
    ? process.env.BUILD_BASE_DIR
    : process.platform === "darwin"
      ? path.resolve(process.cwd(), ".repos")
      : "/opt/whizan/repos";

const SOURCE_BASE_DIR =
  process.env.SOURCE_BASE_DIR && !process.env.SOURCE_BASE_DIR.startsWith("/tmp")
    ? process.env.SOURCE_BASE_DIR
    : process.platform === "darwin"
      ? path.resolve(process.cwd(), ".sources")
      : "/opt/whizan/sources";
const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "20.2.136.11.nip.io";

// ─── Shared singletons ───────────────────────────────────────────────────────
import { redisPub, redisSub, redisOptions } from "./redis.js";

const prisma = new PrismaClient();

const appRunner = new AppRunner();

// Shared queue for adding jobs programmatically (reuses shared redis connection)
import { Queue } from "bullmq";
const buildQueue = new Queue<BuildJob>("build", {
  connection: redisPub as any,
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
      rootDir = ".",
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
          const cleanRootDir = rootDir && rootDir !== "." ? rootDir.replace(/^\/+|\/+$/g, "") : "";
          const checkDir = cleanRootDir ? path.join(buildDir, cleanRootDir) : buildDir;
          const stats = await fs.stat(checkDir);
          if (stats.isDirectory()) {
            const files = await fs.readdir(checkDir);
            if (files.some((f) => [".next", "dist", "build", "out", "node_modules"].includes(f))) {
              canResume = true;
            }
          }
        } catch {
          canResume = false;
        }
      }

      // ── 2. Clone repo or unpack direct upload (always start clean if fresh build or missing artifacts) ──
      const isDirectUpload = Boolean((job.data as any).isDirectUpload) || !repoUrl || repoUrl === "direct-upload" || repoUrl.trim() === "";

      if (!canResume) {
        if (isResume) {
          await log("⚠️ Previous build directory missing on disk, initiating automatic cold-start rebuild...");
        }

        // Always wipe and re-create the build dir to avoid stale leftovers
        await fs.rm(buildDir, { recursive: true, force: true }).catch(() => {});
        await fs.mkdir(buildDir, { recursive: true });

        if (isDirectUpload) {
          await log("📦 Unpacking direct uploaded code archive...");
          const persistentSourceDir = path.join(SOURCE_BASE_DIR, "projects", projectId);
          const persistentArchive = path.join(persistentSourceDir, "source.tar.gz");
          let archiveBuffer: Buffer | null = null;
          const chunksCountStr = await redisPub.get(`upload:${deploymentId}:chunks`);
          if (chunksCountStr) {
            const totalChunks = parseInt(chunksCountStr, 10);
            const chunks: Buffer[] = [];
            for (let i = 0; i < totalChunks; i++) {
              const chunkBase64 = await redisPub.get(`upload:${deploymentId}:chunk:${i}`);
              if (!chunkBase64) {
                throw new Error(`Corrupted upload: missing archive chunk ${i} of ${totalChunks}`);
              }
              chunks.push(Buffer.from(chunkBase64, "base64"));
              await redisPub.del(`upload:${deploymentId}:chunk:${i}`).catch(() => {});
            }
            await redisPub.del(`upload:${deploymentId}:chunks`).catch(() => {});
            archiveBuffer = Buffer.concat(chunks);
          } else {
            const uploadBase64 = await redisPub.get(`upload:${deploymentId}`);
            if (uploadBase64) {
              archiveBuffer = Buffer.from(uploadBase64, "base64");
              await redisPub.del(`upload:${deploymentId}`).catch(() => {});
            }
          }

          if (archiveBuffer) {
            // Persist archive permanently across VM reboots and restarts
            await fs.mkdir(persistentSourceDir, { recursive: true });
            await fs.writeFile(persistentArchive, archiveBuffer);

            const { execFile } = await import("child_process");
            const { promisify } = await import("util");
            const execFileAsync = promisify(execFile);
            await execFileAsync("tar", ["-xzf", persistentArchive, "-C", buildDir]);
            await execFileAsync("chmod", ["-R", "a+rwX", buildDir]).catch(() => {});
            await log("✓ Direct upload archive extracted successfully to persistent storage");
          } else {
            // Fallback: check if persistent source archive exists in /opt/whizan/sources
            let archiveFound = false;
            try {
              await fs.access(persistentArchive);
              archiveFound = true;
            } catch {}

            if (archiveFound) {
              await log("📦 Rebuilding from persistent direct-upload source archive...");
              const { execFile } = await import("child_process");
              const { promisify } = await import("util");
              const execFileAsync = promisify(execFile);
              await execFileAsync("tar", ["-xzf", persistentArchive, "-C", buildDir]);
              await execFileAsync("chmod", ["-R", "a+rwX", buildDir]).catch(() => {});
              await log("✓ Persistent source archive extracted successfully");
            } else {
              const existing = await fs.readdir(buildDir).catch(() => []);
              if (existing.length === 0) {
                throw new Error("Direct upload archive was not found in persistent storage or on disk. Please upload files or link a GitHub repository to redeploy.");
              }
              await log("✓ Using existing direct upload files on disk");
            }
          }
        } else {
          if (!repoUrl || repoUrl === "direct-upload") {
            throw new Error("No valid Git repository URL provided for this project. Please specify a GitHub repository or deploy via direct upload.");
          }

          await log(`Cloning ${repoUrl} (branch: ${branch})...`);
          const { simpleGit } = await import("simple-git");
          await simpleGit().clone(repoUrl, buildDir, ["--depth=1", `--branch=${branch}`]);
          await log("✓ Clone complete");
        }
      }

      // ── 3. Load & decrypt env vars ───────────────────────────────────────
      const envRows = await prisma.envVariable.findMany({ where: { projectId } });
      const { decrypt } = await import("./crypto.js");
      const envVars: Record<string, string> = {};
      for (const row of envRows) {
        envVars[row.key] = decrypt(row.value);
      }

      // ── 4. Build & Run: Check for Dockerfile vs standard Node.js builder ──
      const cleanRootDir = rootDir && rootDir !== "." ? rootDir.replace(/^\/+|\/+$/g, "") : "";
      const hostWorkDir = cleanRootDir ? path.join(buildDir, cleanRootDir) : buildDir;
      const filesInWorkDir = await fs.readdir(hostWorkDir).catch(() => [] as string[]);
      const hasDockerfile = filesInWorkDir.some((f) => f.toLowerCase() === "dockerfile");

      let containerPort: number | undefined;
      let deploymentType: "STATIC" | "SSR" | "HYBRID" = "STATIC";

      if (hasDockerfile) {
        await log("🐳 Dockerfile detected in web project. Building custom container image...");
        const shortId = deploymentId.slice(0, 8);
        const imageTag = `project-img-${slug}-${shortId}`.toLowerCase();

        // Detect exposed port if specified in Dockerfile
        let detectedPort = 3000;
        try {
          const dockerfileContent = await fs.readFile(path.join(hostWorkDir, "Dockerfile"), "utf8");
          const exposeMatch = dockerfileContent.match(/EXPOSE\s+(\d+)/i);
          if (exposeMatch) detectedPort = parseInt(exposeMatch[1], 10);
        } catch {}

        const { spawn } = await import("child_process");
        await new Promise<void>((resolve, reject) => {
          const buildArgs: string[] = [];
          for (const [k, v] of Object.entries(envVars)) {
            buildArgs.push("--build-arg", `${k}=${v}`);
          }
          const proc = spawn("docker", ["build", "-t", imageTag, ...buildArgs, "."], {
            cwd: hostWorkDir,
            env: { ...process.env, DOCKER_BUILDKIT: "1" },
          });
          proc.stdout.on("data", (data) => {
            data.toString().split("\n").filter(Boolean).forEach((l: string) => log(`[docker build] ${l}`).catch(() => {}));
          });
          proc.stderr.on("data", (data) => {
            data.toString().split("\n").filter(Boolean).forEach((l: string) => log(`[docker build] ${l}`).catch(() => {}));
          });
          proc.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Project Dockerfile build failed with exit code ${code}`));
          });
          proc.on("error", (err) => reject(err));
        });
        await log("✓ Docker image built successfully.");

        await log(`Starting container for ${slug} on port ${detectedPort}...`);
        containerPort = await appRunner.startApp(
          deploymentId,
          buildDir,
          envVars,
          undefined,
          rootDir,
          imageTag,
          detectedPort,
          slug
        );
        deploymentType = "SSR";
        await log(`✓ Web container started on host port ${containerPort}`);

        await registerDeployment(redisPub, slug, {
          type: "ssr",
          containerPort,
          deploymentId,
          projectId,
        });
      } else {
        // ── Standard Node.js build inside Docker ──────────────────────────
        if (!canResume) {
          await log("Starting build container...");
          const exitCode = await runBuild({
            projectId,
            buildDir,
            rootDir,
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

        // ── 5. Analyze output ──────────────────────────────────────────────
        await log("Analyzing build output...");
        const analysis = await analyzeOutput(buildDir, framework, rootDir, job.data.outputDir);
        await log(`✓ Detected type: ${analysis.type}`);

        // ── 6. Start SSR container if needed ──────────────────────────────
        if (analysis.type === "ssr" || analysis.type === "hybrid") {
          await log("Starting SSR container...");
          containerPort = await appRunner.startApp(
            deploymentId,
            buildDir,
            envVars,
            analysis.serverEntry,
            rootDir,
            undefined,
            3000,
            slug
          );
          await log(`✓ SSR container started on port ${containerPort}`);
        }

        deploymentType = analysis.type.toUpperCase() as "STATIC" | "SSR" | "HYBRID";

        // ── 7. Register with edge router ───────────────────────────────────
        await registerDeployment(redisPub, slug, {
          type: analysis.type,
          staticDir: analysis.staticDir ? path.join(buildDir, analysis.staticDir) : undefined,
          containerPort,
          deploymentId,
          projectId,
        });
      }

      // ── 8. Mark READY ────────────────────────────────────────────────────
      const url = `http://${slug}.${BASE_DOMAIN}`;
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: "READY",
          buildFinishedAt: new Date(),
          deploymentType,
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
            // Stop old containers matching mount source, labels, or name prefix
            const matches = containers.filter((c) =>
              c.Mounts?.some((m) => m.Source?.includes(old.id)) ||
              c.Labels?.["deploymentId"] === old.id ||
              c.Names?.some((n) => n.includes(`app-${old.id.slice(0, 8)}`))
            );
            for (const info of matches) {
              try {
                const container = docker.getContainer(info.Id);
                if (info.State === "running") await container.stop({ t: 5 });
                await container.remove({ force: true });
              } catch {}
            }
            // Delete old build files (node_modules, packages, build outputs)
            await fs.rm(path.join(BUILD_BASE_DIR, old.id), { recursive: true, force: true }).catch(() => {});
            // Clear old upload chunk keys in Redis if any lingered
            const oldChunksCount = await redisPub.get(`upload:${old.id}:chunks`);
            if (oldChunksCount) {
              const count = parseInt(oldChunksCount, 10);
              for (let i = 0; i < count; i++) {
                await redisPub.del(`upload:${old.id}:chunk:${i}`).catch(() => {});
              }
              await redisPub.del(`upload:${old.id}:chunks`).catch(() => {});
            }
            await redisPub.del(`upload:${old.id}`).catch(() => {});
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
    // If it's already READY, it just needs its container started (SSR/services only)
    if (d && (d.status === "READY" || d.status === "PAUSED")) {
      if (d.deploymentType === "STATIC") {
        // Static deployments are served directly from disk by edge-router. They never need a container.
        return;
      }

      // ── Ultra-Fast Sub-Second Cold Wake Path ──
      // If the container already exists in Docker (just stopped to save resources), wake it up in ~100ms
      try {
        const Docker = (await import("dockerode")).default;
        const docker = new Docker({ socketPath: "/var/run/docker.sock" });
        const allContainers = await docker.listContainers({ all: true }).catch(() => []);
        const shortId = d.id.slice(0, 8);
        const containerName = `app-${d.project.slug}`;
        const match = allContainers.find((c) =>
          c.Names?.some((n) => n === `/${containerName}` || n === containerName) ||
          c.Labels?.["deploymentId"] === d.id ||
          (d.project.slug && c.Labels?.["slug"] === d.project.slug) ||
          c.Names?.some((n) => n.includes(`app-${shortId}`))
        );

        if (match) {
          const container = docker.getContainer(match.Id);
          const inspect = await container.inspect().catch(() => null);
          const exposedKey = Object.keys(inspect?.HostConfig?.PortBindings || {})[0] || "3000/tcp";
          const mappedPortStr = inspect?.HostConfig?.PortBindings?.[exposedKey]?.[0]?.HostPort;

          if (inspect && mappedPortStr && !inspect.State?.Restarting) {
            const mappedPort = parseInt(mappedPortStr, 10);
            if (!inspect.State?.Running) {
              await container.start();
            }
            await registerDeployment(redisPub, d.project.slug, {
              type: (d.deploymentType?.toLowerCase() || "ssr") as any,
              containerPort: mappedPort,
              deploymentId: d.id,
              projectId: d.projectId,
            });
            await prisma.deployment.update({
              where: { id: d.id },
              data: { containerPort: mappedPort, status: "READY" }
            }).catch(() => {});
            console.log(`[Scaler] Ultra-fast sub-second cold wake for ${d.project.slug} on port ${mappedPort}!`);
            return;
          }
        }
      } catch (fastWakeErr: any) {
        console.warn(`[Scaler] Fast wake fell back to resume queue:`, fastWakeErr.message);
      }

      // Deduplicate cold start jobs in the build queue
      const existingJobs = await buildQueue.getJobs(["active", "waiting", "delayed"]).catch(() => []);
      const alreadyQueued = existingJobs.some((j) => j?.data?.deploymentId === d.id);
      if (alreadyQueued) {
        console.log(`[Scaler] Cold-start already queued for ${d.id}, skipping duplicate.`);
        return;
      }

      console.log(`[Scaler] Triggering cold-start for ${d.id}`);
      await buildQueue.add("build", {
        deploymentId: d.id,
        projectId: d.projectId,
        repoUrl: d.project.githubRepoUrl,
        branch: d.project.branch,
        rootDir: d.project.rootDir || ".",
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
      
      // Cryptographic signature check: reject unverified or forged commands
      const { verifyAdminPayload } = await import("./admin-crypto.js");
      if (!verifyAdminPayload(payload)) {
        console.warn(`[Security Alert] Rejected unverified command on admin:commands channel: action=${payload?.action}`);
        return;
      }
      
      const Docker = (await import("dockerode")).default;
      const docker = new Docker({ socketPath: "/var/run/docker.sock" });

      if (payload.action === "DELETE_SERVICE") {
        const { serviceId, slug, deploymentIds } = payload;
        console.log(`[Admin] Deleting all VM resources for service ${slug} (${serviceId})`);
        
        // 1. Stop and remove all Docker containers for this service
        const allContainers = await docker.listContainers({ all: true }).catch(() => []);
        const matches = allContainers.filter((c: any) =>
          c.Labels?.["serviceId"] === serviceId ||
          c.Labels?.["slug"] === slug ||
          c.Names?.some((n: string) => n === `/service-${slug}` || n.startsWith(`/service-${slug}-`)) ||
          (Array.isArray(deploymentIds) && c.Labels?.["deploymentId"] && deploymentIds.includes(c.Labels["deploymentId"]))
        );
        for (const info of matches) {
          try {
            const container = docker.getContainer(info.Id);
            if (info.State === "running") await container.stop({ t: 2 }).catch(() => {});
            await container.remove({ force: true }).catch(() => {});
            console.log(`[Admin] Removed service container ${info.Names?.[0] || info.Id}`);
          } catch (err: any) {
            console.error(`[Admin] Error removing container ${info.Id}:`, err.message);
          }
        }

        // 2. Remove all build and persistent source directories on VM disk
        try {
          const sourceDir = path.join(SOURCE_BASE_DIR, "services", serviceId);
          await fs.rm(sourceDir, { recursive: true, force: true }).catch(() => {});
          if (Array.isArray(deploymentIds)) {
            for (const dId of deploymentIds) {
              await fs.rm(path.join(BUILD_BASE_DIR, dId), { recursive: true, force: true }).catch(() => {});
              await redisPub.del(`build-logs:${dId}`).catch(() => {});
            }
          }
        } catch (err: any) {
          console.error(`[Admin] Error cleaning service files:`, err.message);
        }

        // 3. Clear edge-router routing key
        if (slug) {
          await redisPub.del(`deployment:${slug}`).catch(() => {});
        }
        return;
      }

      if (payload.action === "DELETE_PROJECT") {
        const { projectId, slug, deploymentIds } = payload;
        console.log(`[Admin] Deleting all VM resources for project ${slug} (${projectId})`);

        // 1. Stop and remove all Docker containers for this project
        const allContainers = await docker.listContainers({ all: true }).catch(() => []);
        const matches = allContainers.filter((c: any) =>
          c.Labels?.["projectId"] === projectId ||
          c.Labels?.["slug"] === slug ||
          (Array.isArray(deploymentIds) && c.Labels?.["deploymentId"] && deploymentIds.includes(c.Labels["deploymentId"])) ||
          c.Mounts?.some((m: any) => Array.isArray(deploymentIds) && deploymentIds.some((dId: string) => m.Source?.includes(dId)))
        );
        for (const info of matches) {
          try {
            const container = docker.getContainer(info.Id);
            if (info.State === "running") await container.stop({ t: 2 }).catch(() => {});
            await container.remove({ force: true }).catch(() => {});
            console.log(`[Admin] Removed project container ${info.Names?.[0] || info.Id}`);
          } catch (err: any) {
            console.error(`[Admin] Error removing project container:`, err.message);
          }
        }

        // 2. Remove build and persistent source directories on VM disk
        try {
          const sourceDir = path.join(SOURCE_BASE_DIR, "projects", projectId);
          await fs.rm(sourceDir, { recursive: true, force: true }).catch(() => {});
          if (Array.isArray(deploymentIds)) {
            for (const dId of deploymentIds) {
              await fs.rm(path.join(BUILD_BASE_DIR, dId), { recursive: true, force: true }).catch(() => {});
              await redisPub.del(`build-logs:${dId}`).catch(() => {});
            }
          }
        } catch (err: any) {
          console.error(`[Admin] Error cleaning project files:`, err.message);
        }

        // 3. Clear edge-router routing key
        if (slug) {
          await redisPub.del(`deployment:${slug}`).catch(() => {});
        }
        return;
      }

      if (payload.action === "STOP_CONTAINER" || payload.action === "DELETE_CONTAINER") {
        const dId = payload.deploymentId;
        const allContainers = await docker.listContainers({ all: true }).catch(() => []);
        const matches = allContainers.filter((c: any) =>
          c.Labels?.["deploymentId"] === dId ||
          c.Mounts?.some((m: any) => m.Source?.includes(dId))
        );
        for (const info of matches) {
          try {
            const container = docker.getContainer(info.Id);
            if (info.State === "running") await container.stop({ t: 2 }).catch(() => {});
            if (payload.action === "DELETE_CONTAINER") {
              await container.remove({ force: true }).catch(() => {});
            }
          } catch {}
        }
        if (payload.action === "DELETE_CONTAINER") {
          await fs.rm(path.join(BUILD_BASE_DIR, dId), { recursive: true, force: true }).catch(() => {});
        }
        return;
      }

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

      if (payload.action === "PRUNE_DOCKER") {
        const { exec } = await import("child_process");
        const util = await import("util");
        const execAsync = util.promisify(exec);
        try {
          console.log("[Admin] Running Docker system prune...");
          await execAsync("docker system prune -af && docker builder prune -af");
          console.log("[Admin] Docker system prune completed successfully");
        } catch (err: any) {
          console.error("[Admin] Failed to prune docker system", err);
        }
        return;
      }

      if (payload.action === "VM_EXEC") {
        const { exec } = await import("child_process");
        const util = await import("util");
        const execAsync = util.promisify(exec);
        const { command, cwd = "/opt/whizan", replyTo, remote } = payload;

        try {
          if (remote && remote.host) {
            const port = remote.port || 22;
            const user = remote.username || "whizan";
            const escapedCmd = (command || "").replace(/"/g, '\\"');
            let sshCmd = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8 -p ${port} ${user}@${remote.host} "${escapedCmd}"`;
            if (remote.password) {
              sshCmd = `sshpass -p '${remote.password.replace(/'/g, "'\\''")}' ${sshCmd}`;
            }
            const { stdout, stderr } = await execAsync(sshCmd, { timeout: 35000, maxBuffer: 10 * 1024 * 1024 });
            if (replyTo) {
              await redisPub.publish(replyTo, JSON.stringify({ stdout, stderr, exitCode: 0, cwd }));
            }
            return;
          }

          const trimmed = (command || "").trim();
          let newCwd = cwd;
          let cmdToRun = command;

          if (trimmed.startsWith("cd ")) {
            const dest = trimmed.slice(3).trim();
            const targetDir = path.resolve(cwd, dest || os.homedir());
            const exists = await fs.stat(targetDir).then((s) => s.isDirectory()).catch(() => false);
            if (exists) {
              newCwd = targetDir;
              cmdToRun = "pwd";
            } else {
              if (replyTo) {
                await redisPub.publish(replyTo, JSON.stringify({
                  stdout: "",
                  stderr: `bash: cd: ${dest}: No such file or directory\n`,
                  exitCode: 1,
                  cwd
                }));
              }
              return;
            }
          }

          const { stdout, stderr } = await execAsync(cmdToRun, {
            cwd: newCwd,
            timeout: 35000,
            maxBuffer: 10 * 1024 * 1024,
            shell: "/bin/bash",
            env: {
              ...process.env,
              PATH: (process.env.PATH || "") + ":/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/whizan/node_modules/.bin"
            }
          });

          if (replyTo) {
            await redisPub.publish(replyTo, JSON.stringify({
              stdout,
              stderr,
              exitCode: 0,
              cwd: newCwd
            }));
          }
        } catch (err: any) {
          if (replyTo) {
            await redisPub.publish(replyTo, JSON.stringify({
              stdout: err.stdout || "",
              stderr: err.stderr || err.message || "Command failed",
              exitCode: err.code || 1,
              cwd
            }));
          }
        }
        return;
      }

      if (payload.action === "CONTAINER_EXEC") {
        const { targetType, targetId, deploymentId, slug, command, replyTo } = payload;
        try {
          const { evaluateCommandSecurity, maskSensitiveOutput } = await import("./container-security.js");
          const guardrail = evaluateCommandSecurity(command);
          if (!guardrail.allowed) {
            if (replyTo) {
              await redisPub.publish(replyTo, JSON.stringify({
                success: false,
                error: guardrail.rule?.reason || "Restricted command.",
                stdout: "",
                stderr: guardrail.rule?.reason || "Restricted command.",
                exitCode: 1,
              }));
            }
            return;
          }

          const Docker = (await import("dockerode")).default;
          const docker = new Docker({ socketPath: "/var/run/docker.sock" });
          const allContainers = await docker.listContainers({ all: true }).catch(() => []);
          const shortId = deploymentId?.slice(0, 8);

          const target = allContainers.find((c) =>
            c.State === "running" &&
            (
              (shortId && c.Names?.some((n) => n.includes(shortId))) ||
              (slug && c.Names?.some((n) => n === `/service-${slug}` || n.startsWith(`/service-${slug}-`))) ||
              (c.Labels?.["deploymentId"] && c.Labels["deploymentId"] === deploymentId) ||
              (c.Labels?.["serviceId"] && c.Labels["serviceId"] === targetId) ||
              (c.Labels?.["projectId"] && c.Labels["projectId"] === targetId)
            )
          );

          if (!target) {
            if (replyTo) {
              await redisPub.publish(replyTo, JSON.stringify({
                success: false,
                error: `No running container found for ${targetType} '${slug || targetId}'. Container may be stopped, sleeping, or still building.`,
                stdout: "",
                stderr: "Container not running",
                exitCode: 1,
              }));
            }
            return;
          }

          const container = docker.getContainer(target.Id);
          const exec = await container.exec({
            AttachStdout: true,
            AttachStderr: true,
            Cmd: ["sh", "-c", command],
          });

          const stream = await exec.start({ hijack: true });
          const stdoutChunks: Buffer[] = [];
          const stderrChunks: Buffer[] = [];

          const { PassThrough } = await import("stream");
          const stdoutStream = new PassThrough();
          const stderrStream = new PassThrough();

          stdoutStream.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
          stderrStream.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

          docker.modem.demuxStream(stream, stdoutStream, stderrStream);

          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              try { stream.destroy(); } catch {}
              resolve();
            }, 18000);

            stream.on("end", () => {
              clearTimeout(timer);
              resolve();
            });
            stream.on("error", () => {
              clearTimeout(timer);
              resolve();
            });
          });

          const inspect = await exec.inspect().catch(() => ({ ExitCode: 0 }));
          const rawStdout = Buffer.concat(stdoutChunks).toString("utf8");
          const rawStderr = Buffer.concat(stderrChunks).toString("utf8");

          const maskedStdout = maskSensitiveOutput(rawStdout);
          const maskedStderr = maskSensitiveOutput(rawStderr);

          if (replyTo) {
            await redisPub.publish(replyTo, JSON.stringify({
              success: inspect.ExitCode === 0,
              stdout: maskedStdout,
              stderr: maskedStderr,
              exitCode: inspect.ExitCode ?? 0,
              containerName: target.Names?.[0]?.replace(/^\//, "") || target.Id.slice(0, 12),
            }));
          }
        } catch (err: any) {
          if (replyTo) {
            await redisPub.publish(replyTo, JSON.stringify({
              success: false,
              error: err.message,
              stdout: "",
              stderr: err.message,
              exitCode: 1,
            }));
          }
        }
        return;
      }

      if (payload.action === "CONTAINER_INSPECT") {
        const { targetType, targetId, deploymentId, slug, replyTo } = payload;
        try {
          const Docker = (await import("dockerode")).default;
          const docker = new Docker({ socketPath: "/var/run/docker.sock" });
          const allContainers = await docker.listContainers({ all: true }).catch(() => []);
          const shortId = deploymentId?.slice(0, 8);

          const target = allContainers.find((c) =>
            (shortId && c.Names?.some((n) => n.includes(shortId))) ||
            (slug && c.Names?.some((n) => n === `/service-${slug}` || n.startsWith(`/service-${slug}-`))) ||
            (c.Labels?.["deploymentId"] && c.Labels["deploymentId"] === deploymentId) ||
            (c.Labels?.["serviceId"] && c.Labels["serviceId"] === targetId) ||
            (c.Labels?.["projectId"] && c.Labels["projectId"] === targetId)
          );

          if (!target) {
            if (replyTo) {
              await redisPub.publish(replyTo, JSON.stringify({
                found: false,
                message: `Container not found on VM host for ${slug || targetId}.`,
              }));
            }
            return;
          }

          const container = docker.getContainer(target.Id);
          const info = await container.inspect().catch(() => null);

          if (replyTo) {
            await redisPub.publish(replyTo, JSON.stringify({
              found: true,
              containerId: target.Id.slice(0, 12),
              name: target.Names?.[0]?.replace(/^\//, ""),
              state: info?.State?.Status || target.State,
              running: info?.State?.Running || target.State === "running",
              startedAt: info?.State?.StartedAt,
              finishedAt: info?.State?.FinishedAt,
              restartCount: info?.RestartCount || 0,
              image: target.Image,
              ports: target.Ports,
              networkMode: info?.HostConfig?.NetworkMode,
              memoryLimitBytes: info?.HostConfig?.Memory,
              nanoCpus: info?.HostConfig?.NanoCpus,
              health: info?.State?.Health?.Status,
            }));
          }
        } catch (err: any) {
          if (replyTo) {
            await redisPub.publish(replyTo, JSON.stringify({
              found: false,
              error: err.message,
            }));
          }
        }
        return;
      }

      if (payload.action === "CLEAR_BUILD_CACHE") {
        try {
          console.log("[Admin] Clearing /opt/whizan-cache...");
          await fs.rm("/opt/whizan-cache", { recursive: true, force: true }).catch(() => {});
          await fs.mkdir("/opt/whizan-cache", { recursive: true }).catch(() => {});
          console.log("[Admin] Cleared /opt/whizan-cache successfully");
        } catch (err: any) {
          console.error("[Admin] Failed to clear build cache", err);
        }
        return;
      }

      if (payload.action === "DELETE_FILE") {
        const targetPath = payload.path;
        if (
          targetPath.startsWith("/opt/whizan-builds/") ||
          targetPath.startsWith("/opt/whizan-cache/") ||
          targetPath.startsWith("/tmp/hostify-builds/") ||
          targetPath.startsWith("/tmp/hostify-services/") ||
          targetPath.startsWith("/tmp/whizan-builds/") ||
          targetPath.startsWith("/opt/whizan/repos/") ||
          targetPath.startsWith("/opt/whizan/sources/") ||
          targetPath.startsWith("/opt/whizan/volumes/") ||
          targetPath.startsWith("/var/log/whizan/") ||
          targetPath.startsWith("/root/.pm2/logs/") ||
          (BUILD_BASE_DIR && targetPath.startsWith(BUILD_BASE_DIR)) ||
          (SOURCE_BASE_DIR && targetPath.startsWith(SOURCE_BASE_DIR))
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
        
        const matches = containers.filter((c) =>
          c.Labels?.["deploymentId"] === d.id ||
          (d.project.slug && c.Labels?.["slug"] === d.project.slug) ||
          c.Names?.some((n) => n === `/app-${d.project.slug}` || n.includes(`app-${d.id.slice(0, 8)}`)) ||
          c.Mounts?.some((m) => m.Source?.includes(d.id))
        );
        for (const info of matches) {
          const container = docker.getContainer(info.Id);
          if (info.State === "running") {
            await container.stop({ t: 2 }).catch(() => {});
            console.log(`[Scaler] Preserved stopped container ${info.Names?.[0] || info.Id} for rapid sub-second wakeups.`);
          }
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

let prevCpus: { idle: number; total: number }[] = [];

function getRealCpuUsage(): number {
  const cpus = os.cpus();
  if (prevCpus.length !== cpus.length) {
    prevCpus = cpus.map((c) => ({
      idle: c.times.idle,
      total: Object.values(c.times).reduce((a, b) => a + b, 0),
    }));
    const load = os.loadavg()[0];
    return Math.min(100, Math.max(0, Math.round((load / Math.max(1, cpus.length)) * 1000) / 10));
  }

  let totalDiff = 0;
  let idleDiff = 0;
  for (let i = 0; i < cpus.length; i++) {
    const curTotal = Object.values(cpus[i].times).reduce((a, b) => a + b, 0);
    const curIdle = cpus[i].times.idle;
    totalDiff += curTotal - prevCpus[i].total;
    idleDiff += curIdle - prevCpus[i].idle;
    prevCpus[i] = { idle: curIdle, total: curTotal };
  }

  if (totalDiff <= 0) return 0;
  const usage = ((totalDiff - idleDiff) / totalDiff) * 100;
  return Math.min(100, Math.max(0, Math.round(usage * 10) / 10));
}

async function getRealMemoryStats(): Promise<{
  totalMB: number;
  usedMB: number;
  freeMB: number;
  availableMB: number;
  cachedMB: number;
  buffersMB: number;
  usagePercent: number;
}> {
  try {
    const meminfo = await fs.readFile("/proc/meminfo", "utf8");
    const lines = meminfo.split("\n");
    const getKB = (key: string): number => {
      const line = lines.find((l) => l.startsWith(`${key}:`));
      if (!line) return 0;
      const parts = line.split(/\s+/);
      return parseInt(parts[1] || "0", 10);
    };

    const totalKB = getKB("MemTotal");
    const freeKB = getKB("MemFree");
    const availableKB = getKB("MemAvailable");
    const buffersKB = getKB("Buffers");
    const cachedKB = getKB("Cached") + getKB("SReclaimable");

    if (totalKB > 0 && availableKB > 0) {
      const usedKB = totalKB - availableKB;
      const totalMB = Math.round(totalKB / 1024);
      const usedMB = Math.round(usedKB / 1024);
      const availableMB = Math.round(availableKB / 1024);
      const cachedMB = Math.round(cachedKB / 1024);
      const buffersMB = Math.round(buffersKB / 1024);
      const usagePercent = Math.round((usedKB / totalKB) * 1000) / 10;

      return {
        totalMB,
        usedMB,
        freeMB: availableMB,
        availableMB,
        cachedMB,
        buffersMB,
        usagePercent,
      };
    }
  } catch {}

  // Fallback for non-Linux platforms (e.g. macOS dev)
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  return {
    totalMB: Math.round(totalMem / 1024 / 1024),
    usedMB: Math.round(usedMem / 1024 / 1024),
    freeMB: Math.round(freeMem / 1024 / 1024),
    availableMB: Math.round(freeMem / 1024 / 1024),
    cachedMB: 0,
    buffersMB: 0,
    usagePercent: Math.round((usedMem / totalMem) * 1000) / 10,
  };
}

const statsInterval = setInterval(async () => {
  try {
    const cpus = os.cpus();
    const cpuUsage = getRealCpuUsage();
    const memoryStats = await getRealMemoryStats();

    // Docker container stats
    let dockerContainers: any[] = [];
    let dockerSystem: {
      imagesSizeMB: number;
      containersSizeMB: number;
      volumesSizeMB: number;
      buildCacheSizeMB: number;
      totalMB: number;
    } | null = null;
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
            // Note: Service container metrics are handled by metrics-collector.ts to avoid duplicate Redis writes
          } catch (err) {}
        }

        const name = c.Names?.[0]?.replace(/^\//, "") ?? "unknown";
        let entityType: "service" | "database" | "frontend" | "system" = "system";
        let entityName: string | null = null;
        let entityLink: string | null = null;

        if (name.startsWith("whizan-db-") || name.startsWith("whizan-pooler-")) {
          const dbId = name.replace(/^(whizan-db-|whizan-pooler-)/, "");
          const db = await prisma.databaseService.findUnique({ where: { id: dbId } }).catch(() => null);
          if (db) {
            entityType = "database";
            entityName = `${db.name} (${db.type})`;
            entityLink = `/dashboard/databases/${db.id}`;
          } else {
            entityType = "database";
            entityName = name;
          }
        } else if (name.startsWith("service-")) {
          const parts = name.split("-");
          const sDep: any = await (prisma.serviceDeployment as any).findFirst({
            where: {
              OR: [
                { id: { in: parts } },
                { service: { slug: { in: parts } } }
              ]
            },
            include: { service: true }
          }).catch(() => null);
          if (sDep?.service) {
            entityType = "service";
            entityName = sDep.service.name;
            entityLink = `/dashboard/backend/${sDep.service.id}`;
          } else {
            const svc = await prisma.backendService.findFirst({
              where: { slug: { in: parts } }
            }).catch(() => null);
            if (svc) {
              entityType = "service";
              entityName = svc.name;
              entityLink = `/dashboard/backend/${svc.id}`;
            }
          }
        } else if (c.Mounts?.some((m: any) => m.Source?.includes("whizan-builds") || m.Source?.includes("hostify-builds"))) {
          const depId = c.Mounts.find((m: any) => m.Source?.includes("whizan-builds") || m.Source?.includes("hostify-builds"))?.Source?.split("/").pop();
          if (depId) {
            const fDep = await prisma.deployment.findUnique({
              where: { id: depId },
              include: { project: true }
            }).catch(() => null);
            if (fDep?.project) {
              entityType = "frontend";
              entityName = fDep.project.name;
              entityLink = `/dashboard/projects/${fDep.project.id}`;
            }
          }
        }

        return {
          id: c.Id.slice(0, 12),
          name,
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
          entityType,
          entityName,
          entityLink,
        };
      }));

      // Docker system disk usage
      try {
        const dfData: any = await (docker as any).df().catch(() => null);
        if (dfData && (dfData.Images?.length || dfData.Containers?.length)) {
          const imagesSize = (dfData.Images || []).reduce((acc: number, img: any) => acc + (img.Size || 0), 0);
          const containersSize = (dfData.Containers || []).reduce((acc: number, c: any) => acc + (c.SizeRw || 0), 0);
          const volumesSize = (dfData.Volumes || []).reduce((acc: number, v: any) => acc + (v.UsageData?.Size || 0), 0);
          const buildCacheSize = (dfData.BuildCache || []).reduce((acc: number, b: any) => acc + (b.Size || 0), 0);
          dockerSystem = {
            imagesSizeMB: Math.round(imagesSize / 1024 / 1024),
            containersSizeMB: Math.round(containersSize / 1024 / 1024),
            volumesSizeMB: Math.round(volumesSize / 1024 / 1024),
            buildCacheSizeMB: Math.round(buildCacheSize / 1024 / 1024),
            totalMB: Math.round((imagesSize + containersSize + volumesSize + buildCacheSize) / 1024 / 1024),
          };
        }
      } catch {}

      // Fallback via CLI if docker.df() returned null or empty
      if (!dockerSystem) {
        try {
          const { exec } = await import("child_process");
          const util = await import("util");
          const execAsync = util.promisify(exec);
          const { stdout } = await execAsync("docker system df 2>/dev/null || true");
          if (stdout) {
            let imagesMB = 0, containersMB = 0, volumesMB = 0, buildCacheMB = 0;
            const toMB = (val: string, unit: string) => {
              const num = parseFloat(val) || 0;
              const u = unit.toUpperCase();
              if (u.includes("TB") || u.includes("T")) return Math.round(num * 1024 * 1024);
              if (u.includes("GB") || u.includes("G")) return Math.round(num * 1024);
              if (u.includes("MB") || u.includes("M")) return Math.round(num);
              if (u.includes("KB") || u.includes("K")) return Math.round(num / 1024);
              if (u.includes("B")) return Math.round(num / 1024 / 1024);
              return Math.round(num);
            };

            for (const line of stdout.split("\n")) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith("TYPE")) continue;
              const match = trimmed.match(/^([A-Za-z\s]+?)\s+\d+\s+\d+\s+([\d.]+)\s*([A-Za-z]+)/i);
              if (match) {
                const type = match[1].trim().toLowerCase();
                const mb = toMB(match[2], match[3]);
                if (type.includes("image")) imagesMB = mb;
                else if (type.includes("container")) containersMB = mb;
                else if (type.includes("volume")) volumesMB = mb;
                else if (type.includes("cache")) buildCacheMB = mb;
              }
            }

            dockerSystem = {
              imagesSizeMB: imagesMB,
              containersSizeMB: containersMB,
              volumesSizeMB: volumesMB,
              buildCacheSizeMB: buildCacheMB,
              totalMB: imagesMB + containersMB + volumesMB + buildCacheMB,
            };
          }
        } catch {}
      }
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

    // Disk files (Builds, Workspaces, Volumes, Repos, and Logs)
    let diskFiles: { path: string; type: string; sizeMB: number; displayName?: string }[] = [];
    try {
      const { exec } = await import("child_process");
      const util = await import("util");
      const execAsync = util.promisify(exec);
      
      const scanDirs = [
        "/opt/whizan-cache/*",
        "/opt/whizan-builds/*",
        "/opt/whizan/sources/*",
        BUILD_BASE_DIR ? `${BUILD_BASE_DIR}/*` : "",
        SOURCE_BASE_DIR ? `${SOURCE_BASE_DIR}/*` : "",
        "/opt/whizan/volumes/*",
        "/opt/whizan/repos/*",
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
        let entityType: "service" | "database" | "frontend" | "system" = "system";
        let entityName: string | null = null;
        let entityLink: string | null = null;

        if (filePath.startsWith("/opt/whizan-cache")) {
          type = "build-cache";
          const projId = filePath.split("/").filter(Boolean).pop() || "";
          const [proj, svc] = await Promise.all([
            prisma.project.findUnique({ where: { id: projId } }).catch(() => null),
            prisma.backendService.findUnique({ where: { id: projId } }).catch(() => null)
          ]);
          if (proj) {
            entityType = "frontend";
            entityName = proj.name;
            entityLink = `/dashboard/projects/${proj.id}`;
            displayName = `${filePath} (Cache: ${proj.name})`;
          } else if (svc) {
            entityType = "service";
            entityName = svc.name;
            entityLink = `/dashboard/backend/${svc.id}`;
            displayName = `${filePath} (Cache: ${svc.name})`;
          } else {
            displayName = `${filePath} (NPM & Compiler Cache: ${projId.slice(0, 8)})`;
          }
        } else if (filePath.startsWith("/opt/whizan/volumes")) {
          type = "database-volume";
          const volName = filePath.split("/").filter(Boolean).pop() || "";
          const db = await prisma.databaseService.findFirst({
            where: { OR: [{ id: volName }, { slug: volName }, { databaseName: volName }] }
          }).catch(() => null);
          if (db) {
            entityType = "database";
            entityName = `${db.name} (${db.type})`;
            entityLink = `/dashboard/databases/${db.id}`;
            displayName = `${filePath} (${db.name} Volume)`;
          } else {
            displayName = `${filePath} (Database Volume: ${volName.slice(0, 8)})`;
          }
        } else if (filePath.startsWith("/opt/whizan/repos")) {
          type = "git-repo";
          const repoName = filePath.split("/").filter(Boolean).pop() || "";
          const [svc, proj] = await Promise.all([
            prisma.backendService.findUnique({ where: { id: repoName } }).catch(() => null),
            prisma.project.findUnique({ where: { id: repoName } }).catch(() => null)
          ]);
          if (svc) {
            entityType = "service";
            entityName = svc.name;
            entityLink = `/dashboard/backend/${svc.id}`;
            displayName = `${filePath} (${svc.name} Git Repo)`;
          } else if (proj) {
            entityType = "frontend";
            entityName = proj.name;
            entityLink = `/dashboard/projects/${proj.id}`;
            displayName = `${filePath} (${proj.name} Git Repo)`;
          } else {
            displayName = `${filePath} (Git Cache: ${repoName.slice(0, 8)})`;
          }
        } else {
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
                const sDep = await prisma.serviceDeployment.findUnique({
                  where: { id },
                  include: { service: true }
                });
                if (sDep?.service) {
                  type = "backend-service";
                  entityType = "service";
                  entityName = sDep.service.name;
                  entityLink = `/dashboard/backend/${sDep.service.id}`;
                  displayName = `${filePath} (Backend: ${sDep.service.name} • ${sDep.id.slice(0, 8)})`;
                } else {
                  const fDep = await prisma.deployment.findUnique({
                    where: { id },
                    include: { project: true }
                  });
                  if (fDep?.project) {
                    type = "frontend-build";
                    entityType = "frontend";
                    entityName = fDep.project.name;
                    entityLink = `/dashboard/projects/${fDep.project.id}`;
                    displayName = `${filePath} (Frontend: ${fDep.project.name} • ${fDep.id.slice(0, 8)})`;
                  } else {
                    type = "build-cache";
                    displayName = `${filePath} (Build Workspace)`;
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
        }
        
        return {
          path: filePath,
          displayName,
          type,
          sizeMB,
          entityType,
          entityName,
          entityLink,
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

      if (redisPub.status === "ready") {
        const pipe = redisPub.pipeline();
        pipe.set("vm:logs:worker:out", workerOut.trim() || defaultWorkerLog, "EX", 120);
        pipe.set("vm:logs:worker:err", workerErr.trim() || "No worker error logs recorded.", "EX", 120);
        pipe.set("vm:logs:router:out", routerOut.trim() || defaultRouterLog, "EX", 120);
        pipe.set("vm:logs:router:err", routerErr.trim() || "No edge router error logs recorded.", "EX", 120);
        await pipe.exec().catch(() => {});
      }
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
      memory: memoryStats,
      disk: diskStats,
      docker: {
        containers: dockerContainers,
        totalContainers: dockerContainers.length,
        runningContainers: dockerContainers.filter((c) => c.state === "running").length,
      },
      dockerSystem,
      queue: queueStats,
      files: diskFiles,
    };

    if (redisPub.status === "ready") {
      await redisPub.set("vm:stats", JSON.stringify(stats), "EX", 45);
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
startVmReaper();

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
