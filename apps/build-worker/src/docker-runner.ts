import Docker from "dockerode";
import path from "path";

export interface BuildJob {
  deploymentId: string;
  projectId: string;
  repoUrl: string;
  branch: string;
  rootDir?: string;
  buildCommand: string;
  installCommand: string;
  outputDir: string;
  framework: string;
  slug: string;
  isResume?: boolean;
}

interface RunBuildOptions {
  projectId: string;
  buildDir: string;
  rootDir?: string;
  installCommand: string;
  buildCommand: string;
  envVars: Record<string, string>;
  onLog: (line: string) => Promise<void>;
  abortSignal?: AbortSignal;
}

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const BUILD_IMAGE = "node:20-slim";
const BUILD_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max per build

/**
 * Runs the user's build inside an isolated Docker container.
 * Returns the container exit code (0 = success).
 */
export async function runBuild(opts: RunBuildOptions): Promise<number> {
  let { projectId, buildDir, rootDir, installCommand, buildCommand, envVars, onLog, abortSignal } = opts;
  const cleanRootDir = rootDir && rootDir !== "." ? rootDir.replace(/^\/+|\/+$/g, "") : "";
  const workingDir = cleanRootDir ? `/app/${cleanRootDir}` : "/app";

  // Force Node to garbage collect and not use excessive RAM
  envVars["NODE_OPTIONS"] = "--max_old_space_size=2048";
  
  if (installCommand === "npm install" || installCommand === "npm i") {
    // Prevent network hang-ups and RAM bloat during install, and ensure devDependencies are included for compile tools (tsc, vite)
    installCommand = "npm install --include=dev --no-fund --no-audit";
  }

  // Format env vars for Docker
  const env = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);

  const steps: string[] = ["chmod -R 777 /app 2>/dev/null || true", "set -e"];
  if (cleanRootDir) {
    steps.push(`cd "/app/${cleanRootDir}"`);
  }
  const hasInstall = installCommand && installCommand.trim() !== "" && installCommand.trim().toLowerCase() !== "none";
  const hasBuild = buildCommand && buildCommand.trim() !== "" && buildCommand.trim().toLowerCase() !== "none";

  if (hasInstall) {
    steps.push(`echo "--- Installing dependencies ---"`);
    steps.push(installCommand.trim());
  }
  if (hasBuild) {
    steps.push(`echo "--- Building ---"`);
    steps.push(buildCommand.trim());
  }
  if (!hasInstall && !hasBuild) {
    steps.push(`echo "--- No install or build step required ---"`);
  }

  const cmd = [
    "sh",
    "-c",
    steps.join(" && "),
  ];

  await onLog(`Container image: ${BUILD_IMAGE}`);
  if (cleanRootDir) {
    await onLog(`Root directory: ${cleanRootDir}`);
  }
  await onLog(`Command: ${installCommand} && ${buildCommand}`);

  // Pull image if not present
  await ensureImage(BUILD_IMAGE);

  // Setup persistent cache directories
  const fs = await import("fs/promises");
  const cacheBase = process.env.CACHE_BASE_DIR ?? "/opt/whizan-cache";
  const npmCache = path.join(cacheBase, projectId, "npm");
  const nextCache = path.join(cacheBase, projectId, "next");
  await fs.mkdir(npmCache, { recursive: true }).catch(() => {});
  await fs.mkdir(nextCache, { recursive: true }).catch(() => {});

  const nextCacheContainerPath = cleanRootDir ? `/app/${cleanRootDir}/.next/cache` : `/app/.next/cache`;

  const container = await docker.createContainer({
    Image: BUILD_IMAGE,
    Cmd: cmd,
    WorkingDir: workingDir,
    Env: env,
    HostConfig: {
      // Mount the cloned repo and persistent caches
      Binds: [
        `${path.resolve(buildDir)}:/app`,
        `${npmCache}:/root/.npm`,
        `${nextCache}:${nextCacheContainerPath}`
      ],
      // We explicitly removed the 2GB Memory cap so Docker is allowed to use 
      // the VM's free 3GB of RAM and the Swap file you created.
      NetworkMode: "host", // Bypass Docker bridge to fix MTU packet drops / NPM hangs
      // Security hardening
      ReadonlyRootfs: false,            // Build needs to write node_modules
      CapDrop: ["ALL"],                 // Drop all Linux capabilities
      CapAdd: [],
      // Use default network mode so npm install can reach the internet
      AutoRemove: false,                // We remove manually after log capture
    },
    // Run as root so we can write to the host-mounted /app directory
    User: "root",
  });

  try {
    // Attach to container logs before starting so we don't miss early output
    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });

    await container.start();

    // Stream logs line by line
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        container.kill().catch(() => {});
        reject(new Error(`Build timed out after ${BUILD_TIMEOUT_MS / 60000} minutes`));
      }, BUILD_TIMEOUT_MS);

      docker.modem.demuxStream(
        stream,
        // stdout handler
        {
          write(chunk: Buffer) {
            const lines = chunk.toString().split("\n").filter(Boolean);
            lines.forEach((l) => onLog(l));
          },
        } as any,
        // stderr handler
        {
          write(chunk: Buffer) {
            const lines = chunk.toString().split("\n").filter(Boolean);
            lines.forEach((l) => onLog(`[stderr] ${l}`));
          },
        } as any
      );

      stream.on("end", () => { clearTimeout(timeout); resolve(); });
      stream.on("error", (err: Error) => { clearTimeout(timeout); reject(err); });

      if (abortSignal) {
        abortSignal.addEventListener("abort", () => {
          clearTimeout(timeout);
          container.kill().catch(() => {});
          reject(new Error("Build cancelled by user"));
        }, { once: true });
      }
    });

    const info = await container.inspect();
    return info.State.ExitCode;
  } finally {
    await container.remove({ force: true }).catch(() => {});
    // Enforce LRU cache quota after build completes
    enforceCacheLruQuota(cacheBase).catch(() => {});
  }
}

/**
 * LRU Cache Quota Manager (Pillar 2):
 * Keeps /opt/whizan-cache bounded (default 1.5 GB).
 * If total cache usage exceeds maxBytes, evicts the oldest project cache directories
 * until usage drops under targetBytes (default 1.0 GB).
 */
export async function enforceCacheLruQuota(
  cacheBaseDir: string = process.env.CACHE_BASE_DIR ?? "/opt/whizan-cache",
  maxBytes: number = 1500 * 1024 * 1024,
  targetBytes: number = 1000 * 1024 * 1024
): Promise<void> {
  const fs = await import("fs/promises");
  try {
    const entries = await fs.readdir(cacheBaseDir, { withFileTypes: true }).catch(() => []);
    const projectDirs: { name: string; fullPath: string; mtimeMs: number; sizeBytes: number }[] = [];

    let totalBytes = 0;

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const fullPath = path.join(cacheBaseDir, ent.name);
      try {
        const stats = await getDirStats(fullPath);
        totalBytes += stats.size;
        projectDirs.push({
          name: ent.name,
          fullPath,
          mtimeMs: stats.mtimeMs,
          sizeBytes: stats.size,
        });
      } catch {}
    }

    if (totalBytes > maxBytes) {
      console.log(`[Cache LRU] Total cache ${(totalBytes / (1024 * 1024)).toFixed(1)}MB exceeds limit ${(maxBytes / (1024 * 1024)).toFixed(1)}MB. Evicting oldest entries...`);
      // Sort oldest mtime first
      projectDirs.sort((a, b) => a.mtimeMs - b.mtimeMs);

      for (const p of projectDirs) {
        if (totalBytes <= targetBytes) break;
        console.log(`[Cache LRU] Evicting project cache: ${p.name} (${(p.sizeBytes / (1024 * 1024)).toFixed(1)}MB)`);
        await fs.rm(p.fullPath, { recursive: true, force: true }).catch(() => {});
        totalBytes -= p.sizeBytes;
      }
      console.log(`[Cache LRU] Cache usage normalized to ${(Math.max(0, totalBytes) / (1024 * 1024)).toFixed(1)}MB.`);
    }
  } catch (err: any) {
    console.warn(`[Cache LRU] Failed to enforce cache quota:`, err.message);
  }
}

async function getDirStats(dirPath: string): Promise<{ size: number; mtimeMs: number }> {
  const fs = await import("fs/promises");
  let total = 0;
  let latestMtime = 0;

  async function walk(current: string) {
    const items = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const item of items) {
      const p = path.join(current, item.name);
      try {
        const s = await fs.stat(p);
        if (s.mtimeMs > latestMtime) latestMtime = s.mtimeMs;
        if (item.isDirectory()) {
          await walk(p);
        } else {
          total += s.size;
        }
      } catch {}
    }
  }

  await walk(dirPath);
  return { size: total, mtimeMs: latestMtime };
}

/**
 * Pulls a Docker image if it's not already available locally.
 */
async function ensureImage(imageName: string): Promise<void> {
  try {
    await docker.getImage(imageName).inspect();
  } catch {
    // Image not found locally — pull it
    await new Promise<void>((resolve, reject) => {
      docker.pull(imageName, (err: Error, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }
}
