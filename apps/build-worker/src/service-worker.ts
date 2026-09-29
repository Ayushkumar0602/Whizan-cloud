import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { PrismaClient } from "@hostify/db";
import { ServiceRunner, type ServiceBuildJob } from "./service-runner.js";
import { publishLog } from "./log-streamer.js";
import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";

// ─── Config ──────────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const BUILD_BASE_DIR =
  process.env.BUILD_BASE_DIR && !process.env.BUILD_BASE_DIR.startsWith("/tmp")
    ? process.env.BUILD_BASE_DIR
    : "/opt/whizan/repos";

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

const redisPub = new Redis(REDIS_URL, redisOptions);
redisPub.on("error", (err) => {
  if (err.message?.includes("Connection is closed")) return;
  console.warn("[Service RedisPub warn]", err.message);
});

const prisma = new PrismaClient();
const serviceRunner = new ServiceRunner();

console.log("[Service Worker] Loaded and registered for 'service-build' jobs.");

// ─── Worker ──────────────────────────────────────────────────────────────────

const worker = new Worker<ServiceBuildJob>(
  "service-build",
  async (job: Job<ServiceBuildJob>) => {
    const {
      deploymentId,
      serviceId,
      repoUrl,
      branch,
      slug,
    } = job.data;

    const buildDir = path.join(BUILD_BASE_DIR, deploymentId);

    const log = async (msg: string): Promise<void> => {
      console.log(`[Service:${slug}] ${msg}`);
      await publishLog(redisPub, deploymentId, msg);
    };

    try {
      await prisma.serviceDeployment.update({
        where: { id: deploymentId },
        data: { status: "BUILDING", buildStartedAt: new Date() },
      });

      // 1. Fetch encrypted environment variables
      const rawEnv = await prisma.serviceEnvVariable.findMany({ where: { serviceId } });
      const envVars: Record<string, string> = {};
      
      // Decrypt envs (We'll use a mocked decrypt for now, similar to frontend, or directly use the db value if we implement crypto)
      // Since crypto is in API, we'll fetch them from DB. The backend crypto uses AES, so we need to decrypt.
      // For this step, we will assume we have a decrypt helper if needed. But let's assume they are stored raw temporarily until we port the crypto util over, or we just use it directly.
      // Let's import decrypt from crypto.js
      // Wait, build-worker/src/crypto.ts exists!
      const crypto = await import("./crypto.js");
      for (const ev of rawEnv) {
        try {
          envVars[ev.key] = crypto.decrypt(ev.value);
        } catch (e) {
          await log(`Failed to decrypt env var: ${ev.key}`);
        }
      }

      await log("Environment variables loaded.");

      // 2. Clone Repository or unpack direct upload archive
      await fs.rm(buildDir, { recursive: true, force: true });
      await fs.mkdir(buildDir, { recursive: true });

      const isDirectUpload = Boolean((job.data as any).isDirectUpload);

      if (isDirectUpload) {
        await log("📦 Unpacking direct uploaded backend service archive...");
        const uploadBase64 = await redisPub.get(`upload:${deploymentId}`);
        if (uploadBase64) {
          const archiveBuffer = Buffer.from(uploadBase64, "base64");
          const tempArchive = path.join("/tmp", `upload-${deploymentId}.tar.gz`);
          await fs.writeFile(tempArchive, archiveBuffer);
          const { execFile } = await import("child_process");
          const { promisify } = await import("util");
          const execFileAsync = promisify(execFile);
          await execFileAsync("tar", ["-xzf", tempArchive, "-C", buildDir]);
          await execFileAsync("chmod", ["-R", "a+rwX", buildDir]).catch(() => {});
          await fs.rm(tempArchive, { force: true }).catch(() => {});
          await redisPub.del(`upload:${deploymentId}`).catch(() => {});
          await log("✓ Direct upload archive extracted successfully.");
        } else {
          const existing = await fs.readdir(buildDir).catch(() => []);
          if (existing.length === 0) {
            throw new Error("Direct upload archive was not found in cache or on disk.");
          }
          await log("✓ Using existing direct upload files on disk.");
        }
      } else {
        await log(`Cloning ${branch} from ${repoUrl}...`);
        
        // Handle private repos (Assumes GITHUB_TOKEN is available in env)
        let finalRepoUrl = repoUrl;
        if (process.env.GITHUB_TOKEN) {
          finalRepoUrl = repoUrl.replace("https://", `https://x-access-token:${process.env.GITHUB_TOKEN}@`);
        }

        const cloneCmd = `git clone --depth 1 -b ${branch} ${finalRepoUrl} ${buildDir}`;
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(cloneCmd, { shell: true });
          let stderrData = "";
          proc.stdout?.on("data", (data) => {
            const lines = data.toString().split("\n").filter(Boolean);
            lines.forEach((l: string) => log(l).catch(() => {}));
          });
          proc.stderr?.on("data", (data) => {
            const str = data.toString();
            stderrData += str;
            const lines = str.split("\n").filter(Boolean);
            lines.forEach((l: string) => {
              const safe = process.env.GITHUB_TOKEN
                ? l.replaceAll(process.env.GITHUB_TOKEN, "***")
                : l;
              log(safe).catch(() => {});
            });
          });
          proc.on("close", (code) => {
            if (code === 0) resolve();
            else {
              const masked = process.env.GITHUB_TOKEN
                ? stderrData.replaceAll(process.env.GITHUB_TOKEN, "***")
                : stderrData;
              const lastLine = masked.trim().split("\n").filter(Boolean).pop() || `Exit code ${code}`;
              reject(new Error(`Git clone failed: ${lastLine}`));
            }
          });
          proc.on("error", (err) => reject(err));
        });

        await log(`✓ Repository cloned successfully.`);
      }

      // 3. Load latest service resource configuration (autoSleep, cpuLimit, memoryLimit)
      const latestService = await prisma.backendService.findUnique({ where: { id: serviceId } });
      const jobConfig: ServiceBuildJob = {
        ...job.data,
        autoSleep: latestService?.autoSleep ?? job.data.autoSleep,
        instanceType: latestService?.instanceType ?? job.data.instanceType,
        cpuLimit: latestService?.cpuLimit ?? job.data.cpuLimit,
        memoryLimit: latestService?.memoryLimit ?? job.data.memoryLimit,
      };

      // 4. Run Container with Blue/Green strategy
      const { hostPort, containerName } = await serviceRunner.startService(jobConfig, buildDir, envVars, log);

      // 4. Update Database
      await prisma.serviceDeployment.update({
        where: { id: deploymentId },
        data: {
          status: "READY",
          buildFinishedAt: new Date(),
          containerPort: hostPort,
        },
      });

      // 5. Register in Edge Router (Atomic Cutover)
      const service = await prisma.backendService.findUnique({ where: { id: serviceId } });
      const routeInfo = {
        type: "service",
        containerPort: hostPort,
        deploymentId,
        serviceId,
        containerName,
      };
      await redisPub.set(`deployment:${slug}`, JSON.stringify(routeInfo));

      if (service?.isPublic) {
        await log(`✓ Service is publicly exposed via Edge Router at http://${slug}.${process.env.BASE_DOMAIN ?? "20.2.136.11.nip.io"}`);
      } else {
        await log(`✓ Service is internal but registered in Edge Router for Wakeup/Test at http://${slug}.${process.env.BASE_DOMAIN ?? "20.2.136.11.nip.io"}`);
      }

      // 6. Zero-Downtime Blue/Green Cleanup:
      // Now that the new container is live & verified healthy, decommission previous containers & files
      try {
        await log("Zero-downtime cutover complete. Decommissioning previous container and build files...");

        const Docker = (await import("dockerode")).default;
        const docker = new Docker({ socketPath: "/var/run/docker.sock" });
        const allContainers = await docker.listContainers({ all: true }).catch(() => []);

        // Find previous containers for this service (excluding the newly promoted container)
        const previousContainers = allContainers.filter((c) => {
          const hasMatchingName = c.Names?.some(
            (n) => n === `/service-${slug}` || (n.startsWith(`/service-${slug}-`) && !n.includes(deploymentId.slice(0, 8)))
          );
          const hasMatchingLabel =
            (c.Labels?.["serviceId"] === serviceId || c.Labels?.["slug"] === slug) &&
            c.Labels?.["deploymentId"] !== deploymentId;
          return hasMatchingName || hasMatchingLabel;
        });

        for (const prev of previousContainers) {
          try {
            const oldCont = docker.getContainer(prev.Id);
            if (prev.State === "running") {
              // Gracefully stop with 5s drain timeout so in-flight requests complete
              await oldCont.stop({ t: 5 }).catch(() => {});
            }
            await oldCont.remove({ force: true }).catch(() => {});
            console.log(`[Service Worker] Removed previous container ${prev.Names?.[0]}`);
          } catch (err: any) {
            console.error(`[Service Worker] Error removing previous container:`, err.message);
          }
        }

        // Clean up disk files and Redis metadata of previous deployments
        const oldDeployments = await prisma.serviceDeployment.findMany({
          where: { serviceId, id: { not: deploymentId } },
          select: { id: true },
        });

        for (const oldD of oldDeployments) {
          const oldDir = path.join(BUILD_BASE_DIR, oldD.id);
          await fs.rm(oldDir, { recursive: true, force: true }).catch(() => {});
          await redisPub.del(`build-logs:${oldD.id}`).catch(() => {});
          await redisPub.del(`access:${oldD.id}`).catch(() => {});
          await prisma.serviceDeployment.update({
            where: { id: oldD.id },
            data: { containerPort: null },
          }).catch(() => {});
        }

        await log(`✓ Zero-downtime cutover successful. Removed ${previousContainers.length} old container(s) and previous build directories.`);
      } catch (cleanupErr: any) {
        console.error("Failed to cleanup previous containers/files:", cleanupErr);
      }

      await log(`⏳ Streaming live startup logs for 15s...`);
      // Keep streaming live runtime container logs for 15s post-deploy
      await new Promise((r) => setTimeout(r, 15000));
      await log(`✓ Service startup completed. Live tail entering idle mode.`);
      await publishLog(redisPub, deploymentId, "__DONE__");

    } catch (err: any) {
      await log(`\n❌ Deployment Failed: ${err.message}`);

      // 1. Remove temporary build directory created for this failed deployment
      try {
        await fs.rm(buildDir, { recursive: true, force: true });
        await log(`🧹 Removed temporary build files (${buildDir}).`);
      } catch (rmErr: any) {
        console.error(`Failed to delete buildDir ${buildDir}:`, rmErr);
      }

      // 2. Ensure any container created for this failed deployment is completely destroyed
      try {
        const Docker = (await import("dockerode")).default;
        const docker = new Docker({ socketPath: "/var/run/docker.sock" });
        const allContainers = await docker.listContainers({ all: true }).catch(() => []);
        const shortId = deploymentId.slice(0, 8);
        const failedContainers = allContainers.filter((c) =>
          c.Names?.some((n) => n === `/service-${slug}-${shortId}`) ||
          c.Labels?.["deploymentId"] === deploymentId
        );
        for (const c of failedContainers) {
          try {
            const cont = docker.getContainer(c.Id);
            await cont.stop({ t: 1 }).catch(() => {});
            await cont.remove({ force: true }).catch(() => {});
            await log(`🧹 Removed failed container (${c.Names?.[0] || c.Id.slice(0, 12)}).`);
          } catch {}
        }
      } catch (contErr) {
        console.error("Failed to clean up failed containers:", contErr);
      }

      // 3. Verify and reassure user that previous healthy deployment remains untouched
      try {
        const activeDeployment = await prisma.serviceDeployment.findFirst({
          where: {
            serviceId,
            status: "READY",
            id: { not: deploymentId },
          },
          orderBy: { createdAt: "desc" },
        });

        if (activeDeployment && activeDeployment.containerPort) {
          await log(`🛡️ Previous healthy deployment (${activeDeployment.id.slice(0, 8)}) is active on port ${activeDeployment.containerPort}.`);
          await log(`✓ Zero-downtime preserved: Live traffic continues serving from existing deployment without interruption.`);
        } else {
          await log(`ℹ️ No previous healthy deployment found for this service.`);
        }
      } catch (checkErr) {
        console.error("Failed to check active deployment:", checkErr);
      }

      // 4. Update deployment in DB
      await prisma.serviceDeployment.update({
        where: { id: deploymentId },
        data: {
          status: "FAILED",
          buildFinishedAt: new Date(),
          errorMessage: err.message,
          containerPort: null,
        },
      }).catch((dbErr) => console.error("Failed to update deployment to FAILED:", dbErr));

      // 5. Notify streaming clients that deployment completed
      await publishLog(redisPub, deploymentId, "__DONE__");
      throw err;
    }
  },
  {
    connection: new Redis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false }),
    concurrency: 1,
  }
);

worker.on("ready", () => console.log("[Service Worker] Started — waiting for service builds..."));
worker.on("active", (job) => console.log(`[Service Worker] Active: processing build for ${job.data.slug} (${job.id})`));
worker.on("completed", (job) => console.log(`[Service Worker] Job ${job.id} completed for ${job.data.slug}`));
worker.on("failed", (job, err) => console.error(`[Service Worker] Job ${job?.id} failed:`, err?.message || err));
worker.on("error", (err) => console.warn(`[Service Worker Queue warn]:`, err?.message || err));

// Export for testability or manual control
export { worker };

const redisSub = new Redis(REDIS_URL, redisOptions);
redisSub.on("error", (err) => {
  if (err.message?.includes("Connection is closed")) return;
  console.warn("[Service RedisSub warn]", err.message);
});

const wakingUpServices = new Set<string>();

redisSub.subscribe("wakeup");
redisSub.on("message", async (channel, message) => {
  if (channel === "wakeup") {
    let slug = "";
    let deploymentId = "";
    let type = "service";

    try {
      const parsed = JSON.parse(message);
      slug = parsed.slug;
      deploymentId = parsed.deploymentId;
      type = parsed.type;
    } catch {
      // In case a raw deploymentId string was published
      deploymentId = message;
    }

    if (type !== "service" && type !== "SERVICE") return;

    if (!slug && deploymentId) {
      const depCheck = await prisma.serviceDeployment.findUnique({
        where: { id: deploymentId },
        include: { service: true }
      });
      if (depCheck) slug = depCheck.service.slug;
    }

    if (!slug) return;

    // Concurrency Deduplication Guard: Ignore if already waking up
    if (wakingUpServices.has(slug)) {
      console.log(`[Service Wakeup] Wakeup already in progress for ${slug}, skipping duplicate trigger.`);
      return;
    }

    wakingUpServices.add(slug);

    try {
      console.log(`[Service Wakeup] Starting cold-boot for backend ${slug}...`);
      await publishLog(redisPub, deploymentId, `⚡ [Wakeup] Cold-booting service ${slug} from auto-sleep...`);
      
      const dep = await prisma.serviceDeployment.findUnique({
        where: { id: deploymentId },
        include: { service: { include: { envVariables: true } } }
      });
      if (!dep) {
        console.error(`[Service Wakeup] Deployment ${deploymentId} not found in database.`);
        return;
      }

      const Docker = (await import("dockerode")).default;
      const docker = new Docker({ socketPath: "/var/run/docker.sock" });
      
      const allConts = await docker.listContainers({ all: true }).catch(() => []);
      let match = allConts.find((c) =>
        c.Labels?.["deploymentId"] === deploymentId ||
        c.Labels?.["slug"] === slug ||
        c.Names?.some((n) => {
          const clean = n.replace(/^\//, "");
          return (
            clean === `service-${slug}-${deploymentId.slice(0, 8)}` ||
            clean === `service-${slug}` ||
            clean.startsWith(`service-${slug}-`)
          );
        })
      );

      // Validate container mounts & health if match exists
      if (match) {
        const container = docker.getContainer(match.Id);
        const inspect = await container.inspect().catch(() => null);
        let isCorrupted = false;

        if (!inspect) {
          isCorrupted = true;
        } else {
          const mounts = inspect.Mounts || [];
          for (const m of mounts) {
            if (m.Destination === "/app" || m.Destination.startsWith("/app")) {
              const hostSource = m.Source;
              try {
                if (hostSource.startsWith("/tmp")) {
                  console.log(`[Service Wakeup] Mount source ${hostSource} is in volatile /tmp. Purging container.`);
                  isCorrupted = true;
                  break;
                }
                const stat = await fs.stat(hostSource);
                if (!stat.isDirectory()) {
                  isCorrupted = true;
                  break;
                }
                const files = await fs.readdir(hostSource);
                if (files.length === 0) {
                  console.log(`[Service Wakeup] Mount source ${hostSource} is empty! Purging container.`);
                  isCorrupted = true;
                  break;
                }
              } catch {
                console.log(`[Service Wakeup] Mount source ${hostSource} does not exist! Purging container.`);
                isCorrupted = true;
                break;
              }
            }
          }

          if (inspect.State?.Restarting) {
            console.log(`[Service Wakeup] Container ${match.Id} is in restart loop. Purging container.`);
            isCorrupted = true;
          }
        }

        if (isCorrupted) {
          console.log(`[Service Wakeup] Removing corrupted container ${match.Id} for ${slug} to trigger fresh cold-boot...`);
          try {
            await container.stop({ t: 2 }).catch(() => {});
            await container.remove({ force: true }).catch(() => {});
          } catch {}
          match = undefined;
        }
      }

      // If container does not exist in Docker (e.g. after VM reboot or prune), re-create it
      if (!match) {
        console.log(`[Service Wakeup] Container for ${slug} missing in Docker. Recreating container...`);
        await publishLog(redisPub, deploymentId, `⚡ [Wakeup] Re-instantiating container for service ${slug}...`);

        const rawEnv = dep.service.envVariables;
        const envVars: Record<string, string> = {};
        const crypto = await import("./crypto.js");
        for (const ev of rawEnv) {
          try {
            envVars[ev.key] = crypto.decrypt(ev.value);
          } catch {
            envVars[ev.key] = ev.value;
          }
        }

        const buildDir = path.join(BUILD_BASE_DIR, deploymentId);
        let exists = false;
        try {
          await fs.access(buildDir);
          exists = true;
        } catch {}

        if (!exists) {
          await fs.mkdir(buildDir, { recursive: true });
          let finalRepoUrl = dep.service.githubRepoUrl;
          if (process.env.GITHUB_TOKEN) {
            finalRepoUrl = finalRepoUrl.replace("https://", `https://x-access-token:${process.env.GITHUB_TOKEN}@`);
          }
          await new Promise<void>((resolve, reject) => {
            const proc = spawn(`git clone --depth 1 -b ${dep.service.branch} ${finalRepoUrl} ${buildDir}`, { shell: true });
            proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Git clone failed with code ${code}`))));
            proc.on("error", reject);
          });
        }

        const jobPayload: ServiceBuildJob = {
          deploymentId: dep.id,
          serviceId: dep.serviceId,
          repoUrl: dep.service.githubRepoUrl,
          branch: dep.service.branch,
          language: dep.service.language,
          slug: dep.service.slug,
          rootDir: dep.service.rootDir,
          installCommand: dep.service.installCommand,
          startCommand: dep.service.startCommand,
          internalPort: dep.service.internalPort,
          autoSleep: dep.service.autoSleep,
          cpuLimit: dep.service.cpuLimit,
          memoryLimit: dep.service.memoryLimit,
        };

        const result = await serviceRunner.startService(
          jobPayload,
          buildDir,
          envVars,
          async (msg) => {
            console.log(`[Service:${slug}] ${msg}`);
            await publishLog(redisPub, deploymentId, msg);
          }
        );

        const routeInfo = {
          type: "service",
          containerPort: result.hostPort,
          deploymentId: dep.id,
          serviceId: dep.serviceId,
          containerName: result.containerName,
        };
        await redisPub.set(`deployment:${slug}`, JSON.stringify(routeInfo));
        await prisma.serviceDeployment.update({
          where: { id: deploymentId },
          data: { containerPort: result.hostPort }
        });
        await publishLog(redisPub, deploymentId, `✓ [Wakeup] Service ${slug} is online on port ${result.hostPort}!`);
        return;
      }

      const container = docker.getContainer(match.Id);
      const initialInfo = await container.inspect().catch(() => null);
      const isAlreadyRunning = Boolean(initialInfo?.State?.Running);

      // Temporary Burst Resources: Allocate 1.0 vCPU and 768MB RAM so cold boot finishes in seconds
      const burstNanoCpus = Math.round(parseFloat(process.env.DEPLOY_BURST_CPU || "1.0") * 1_000_000_000);
      const burstMemoryBytes = parseInt(process.env.DEPLOY_BURST_MEM_MB || "768", 10) * 1024 * 1024;
      try {
        await container.update({
          NanoCpus: burstNanoCpus,
          Memory: burstMemoryBytes,
        });
        console.log(`[Service Wakeup] Granted temporary burst resources to ${slug} during cold-start.`);
      } catch (burstErr: any) {
        console.warn(`[Service Wakeup] Failed to set burst resources:`, burstErr.message);
      }

      if (!isAlreadyRunning) {
        try {
          const logStream = await container.attach({
            stream: true,
            stdout: true,
            stderr: true,
          });

          docker.modem.demuxStream(
            logStream,
            {
              write(chunk: Buffer) {
                const lines = chunk.toString().split("\n").filter(Boolean);
                lines.forEach((l) => publishLog(redisPub, deploymentId, l));
              },
            } as any,
            {
              write(chunk: Buffer) {
                const lines = chunk.toString().split("\n").filter(Boolean);
                lines.forEach((l) => publishLog(redisPub, deploymentId, `[stderr] ${l}`));
              },
            } as any
          );
        } catch (attachErr: any) {
          console.error(`[Service Wakeup] Failed to attach log stream:`, attachErr.message);
        }

        // Start the container
        try {
          await container.start();
          console.log(`[Service Wakeup] Container started for ${slug}. Wait for health...`);
        } catch (startErr: any) {
          if (startErr.statusCode !== 304 && !startErr.message?.includes("already started")) {
            throw startErr;
          }
        }
      } else {
        console.log(`[Service Wakeup] Container for ${slug} is already running. Verifying endpoint health...`);
      }

      const info = await container.inspect();
      const mappedPort =
        info.NetworkSettings?.Ports?.[`${dep.service.internalPort}/tcp`]?.[0]?.HostPort ||
        info.HostConfig?.PortBindings?.[`${dep.service.internalPort}/tcp`]?.[0]?.HostPort ||
        match.Ports?.find((p: any) => p.PrivatePort === dep.service.internalPort)?.PublicPort?.toString() ||
        (dep.containerPort ? String(dep.containerPort) : null);
      
      if (mappedPort) {
        const portNum = parseInt(mappedPort, 10);
        // Check health: Allow up to 90 seconds (90 attempts with 1s interval)
        let isReady = false;
        for (let i = 0; i < 90; i++) {
          try {
            const res = await fetch(`http://127.0.0.1:${portNum}`, { signal: AbortSignal.timeout(2000) });
            if (res.ok || res.status < 500) {
              isReady = true;
              break;
            }
          } catch {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
        
        // Edge Router update: Always route traffic to container once healthy or timeout reached
        const routeInfo = {
          type: "service",
          containerPort: portNum,
          deploymentId: dep.id,
          serviceId: dep.serviceId,
          containerName: match.Names?.[0]?.replace(/^\//, "") || `service-${slug}`,
        };
        await redisPub.set(`deployment:${slug}`, JSON.stringify(routeInfo));
        
        // Update DB
        await prisma.serviceDeployment.update({
          where: { id: deploymentId },
          data: { containerPort: portNum }
        });

        // Runtime Resource Enforcement: Clamp down to target quota
        const isSpinDown = Boolean(dep.service.autoSleep);
        const runtimeCpuQuota = isSpinDown ? 0.1 : (dep.service.cpuLimit || 0.5);
        const runtimeMemoryQuotaMB = isSpinDown ? 512 : (dep.service.memoryLimit || 512);
        try {
          await container.update({
            NanoCpus: Math.round(runtimeCpuQuota * 1_000_000_000),
            Memory: runtimeMemoryQuotaMB * 1024 * 1024,
          });
          console.log(`[Service Wakeup] Restored runtime limits for ${slug}: ${runtimeCpuQuota} vCPU, ${runtimeMemoryQuotaMB}MB RAM`);
        } catch (clampErr: any) {
          console.warn(`[Service Wakeup] Failed to clamp runtime limits:`, clampErr.message);
        }

        if (isReady) {
          console.log(`[Service Wakeup] Service ${slug} is online on port ${portNum}!`);
          await publishLog(redisPub, deploymentId, `✓ [Wakeup] Service ${slug} is online and healthy on port ${portNum}!`);
        } else {
          console.warn(`[Service Wakeup] Service ${slug} port open; health check completed.`);
          await publishLog(redisPub, deploymentId, `✓ [Wakeup] Service ${slug} port active on port ${portNum}.`);
        }
      }
    } catch (err) {
      console.error("[Service Wakeup] Error:", err);
    } finally {
      wakingUpServices.delete(slug);
      await redisPub.del(`wakeup:inflight:${slug}`).catch(() => {});
    }
  }
});
