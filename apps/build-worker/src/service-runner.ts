import Docker from "dockerode";
import path from "path";
import fs from "fs/promises";
import net from "net";

export interface ServiceBuildJob {
  deploymentId: string;
  serviceId: string;
  repoUrl: string;
  branch: string;
  language: string;
  rootDir: string;
  installCommand: string;
  startCommand: string;
  internalPort: number;
  slug: string;
  autoSleep?: boolean;
  instanceType?: string;
  cpuLimit?: number;
  memoryLimit?: number;
}

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

// Tuned for 2 vCPU / 4 GB RAM VMs:
// Defaults to 1.0 vCPU (guaranteeing 50% CPU headroom for OS, Edge Router, Postgres, Redis)
// and 768 MB RAM (guaranteeing >3.2 GB RAM headroom for host)
const DEPLOY_BURST_CPU = parseFloat(process.env.DEPLOY_BURST_CPU || "1.0");
const DEPLOY_BURST_MEM_MB = parseInt(process.env.DEPLOY_BURST_MEM_MB || "768", 10);

export class ServiceRunner {
  
  /**
   * Stops and removes all service containers matching this slug
   */
  async stopService(slug: string): Promise<void> {
    try {
      const containers = await docker.listContainers({ all: true }).catch(() => []);
      const matches = containers.filter((c) =>
        c.Names?.some((n) => n === `/service-${slug}` || n.startsWith(`/service-${slug}-`))
      );
      for (const info of matches) {
        try {
          const container = docker.getContainer(info.Id);
          if (info.State === "running") {
            await container.stop({ t: 2 }).catch(() => {});
          }
          await container.remove({ force: true }).catch(() => {});
        } catch {}
      }
    } catch (err: any) {
      console.error(`Failed to stop service containers for ${slug}:`, err);
    }
  }

  /**
   * Starts a service container with Zero-Downtime Blue/Green strategy.
   * Keeps existing container running until new container passes health check.
   */
  async startService(
    job: ServiceBuildJob,
    buildDir: string,
    envVars: Record<string, string>,
    onLog: (line: string) => Promise<void>
  ): Promise<{ hostPort: number; containerName: string }> {
    // 1. Determine Image based on Language
    let image = "node:20-slim";
    if (job.language === "PYTHON") image = "python:3.11-slim";
    if (job.language === "GO") image = "golang:1.21-alpine";
    if (job.language === "DOCKERFILE") {
      throw new Error("Dockerfile builds are not yet implemented.");
    }

    // 2. Ensure image exists
    await onLog(`Ensuring base image ${image} is available...`);
    const stream = await docker.pull(image);
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
    });

    // 3. Find a free host port for the new (green) container
    const hostPort = await this.findFreePort();

    // 4. Resolve root directory & verify if folder exists
    let cleanRootDir = job.rootDir && job.rootDir !== "." ? job.rootDir.replace(/^\/+|\/+$/g, "") : "";
    if (cleanRootDir) {
      const fullSubPath = path.join(buildDir, cleanRootDir);
      try {
        const stat = await fs.stat(fullSubPath);
        if (!stat.isDirectory()) {
          await onLog(`⚠️ Root directory '${cleanRootDir}' is not a directory. Falling back to repository root.`);
          cleanRootDir = "";
        }
      } catch {
        await onLog(`⚠️ Root directory '${cleanRootDir}' was not found in cloned repository. Falling back to repository root.`);
        cleanRootDir = "";
      }
    }
    const workingDir = cleanRootDir ? `/app/${cleanRootDir}` : "/app";
    const hostWorkDir = cleanRootDir ? path.join(buildDir, cleanRootDir) : buildDir;

    // 5. Intelligent runtime command adjustments (Python, Node, Go)
    let effectiveInstallCommand = job.installCommand;
    let effectiveStartCommand = job.startCommand;

    if (job.language === "PYTHON") {
      // Prevent crash if requirements.txt doesn't exist
      if (effectiveInstallCommand === "pip install -r requirements.txt") {
        effectiveInstallCommand = "if [ -f requirements.txt ]; then pip install -r requirements.txt; else echo 'No requirements.txt found, skipping pip install'; fi";
      }

      // Check if main.py defines a Flask app without app.run()
      try {
        const mainPyPath = path.join(hostWorkDir, "main.py");
        const mainContent = await fs.readFile(mainPyPath, "utf-8").catch(() => "");
        if (mainContent.includes("Flask(") || mainContent.includes("from flask import")) {
          if (!mainContent.includes("app.run(") && !mainContent.includes("__main__")) {
            if (effectiveStartCommand === "python main.py" || effectiveStartCommand === "python3 main.py") {
              effectiveStartCommand = `python -m flask --app main run --host 0.0.0.0 --port ${job.internalPort}`;
              await onLog(`💡 Flask app detected without app.run() in main.py. Running with Flask CLI on port ${job.internalPort}.`);
            }
          }
        }
      } catch {}
    }

    // 6. Construct the Docker run command (Install once + Start)
    const cmd = [
      "sh",
      "-c",
      `set -e && if [ ! -f .hostify_installed ]; then echo "--- Installing Dependencies ---" && ${effectiveInstallCommand} && touch .hostify_installed; fi && echo "--- Starting Service ---" && ${effectiveStartCommand}`
    ];

    const env = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);
    // Inject the internal port so the app knows what to bind to
    env.push(`PORT=${job.internalPort}`);
    env.push(`HOSTNAME=0.0.0.0`);
    env.push(`HOST=0.0.0.0`);
    if (job.language === "PYTHON") {
      env.push(`PYTHONUNBUFFERED=1`);
      env.push(`FLASK_APP=main.py`);
      env.push(`FLASK_RUN_HOST=0.0.0.0`);
      env.push(`FLASK_RUN_PORT=${job.internalPort}`);
    }

    // Unique blue/green container name
    const shortId = job.deploymentId.slice(0, 8);
    const containerName = `service-${job.slug}-${shortId}`;

    // Compute runtime resource allocation:
    // When spin-down (autoSleep) is enabled -> Free Tier: 0.1 vCPU and 512MB RAM
    // When spin-down is disabled -> Dedicated Tier with user-selected cpuLimit and memoryLimit
    const isSpinDown = Boolean(job.autoSleep);
    const runtimeCpuQuota = isSpinDown ? 0.1 : (job.cpuLimit || 0.5);
    const runtimeMemoryQuotaMB = isSpinDown ? 512 : (job.memoryLimit || 512);

    const runtimeNanoCpus = Math.round(runtimeCpuQuota * 1_000_000_000); // 0.1 vCPU = 100,000,000 NanoCPUs
    const runtimeMemoryBytes = runtimeMemoryQuotaMB * 1024 * 1024;

    // Fast Burstable Deployment Resources (Build bursting):
    // Allocate 1.0 vCPU and 768MB RAM during dependency installation and startup
    // so builds and package unpacking complete in seconds without overwhelming a 2 vCPU / 4 GB VM.
    const burstNanoCpus = Math.round(DEPLOY_BURST_CPU * 1_000_000_000);
    const burstMemoryBytes = DEPLOY_BURST_MEM_MB * 1024 * 1024;
    const deployNanoCpus = Math.max(runtimeNanoCpus, burstNanoCpus);
    const deployMemoryBytes = Math.max(runtimeMemoryBytes, burstMemoryBytes);

    await onLog(
      isSpinDown
        ? `⚡ Target Runtime Plan: Free Tier (Spin Down enabled) — 0.1 vCPU & 512MB RAM limit`
        : `⚡ Target Runtime Plan: Dedicated Tier (Always-On) — ${runtimeCpuQuota} vCPU & ${runtimeMemoryQuotaMB}MB RAM limit`
    );

    if (deployNanoCpus > runtimeNanoCpus || deployMemoryBytes > runtimeMemoryBytes) {
      await onLog(`🚀 Provisioning burst compute (${DEPLOY_BURST_CPU} vCPU & ${DEPLOY_BURST_MEM_MB}MB RAM) for rapid dependency installation & startup...`);
    }

    await onLog(`Starting container ${containerName} (Blue/Green Zero-Downtime)...`);
    
    // We attach it to a global network so frontends can reach it
    const networkName = "whizan-internal-network";

    // Auto-create the Docker network if it doesn't exist
    try {
      const net = docker.getNetwork(networkName);
      await net.inspect();
    } catch (netErr: any) {
      if (netErr?.statusCode === 404 || netErr?.message?.includes("not found")) {
        try {
          await docker.createNetwork({
            Name: networkName,
            Driver: "bridge",
            CheckDuplicate: true,
          });
          await onLog(`🌐 Created internal mesh network (${networkName})`);
        } catch {}
      }
    }

    // Clean up any stale container with the same name if it somehow exists from a previous run
    try {
      const existing = docker.getContainer(containerName);
      await existing.remove({ force: true }).catch(() => {});
    } catch {}

    const container = await docker.createContainer({
      name: containerName,
      Image: image,
      Cmd: cmd,
      WorkingDir: workingDir,
      Env: env,
      Labels: {
        serviceId: job.serviceId,
        deploymentId: job.deploymentId,
        slug: job.slug,
        type: "service",
        autoSleep: isSpinDown ? "true" : "false",
        cpuLimit: String(runtimeCpuQuota),
        memoryLimit: String(runtimeMemoryQuotaMB),
      },
      ExposedPorts: { [`${job.internalPort}/tcp`]: {} },
      HostConfig: {
        Binds: [`${path.resolve(buildDir)}:/app`],
        PortBindings: {
          [`${job.internalPort}/tcp`]: [{ HostPort: String(hostPort) }],
        },
        Memory: deployMemoryBytes,
        NanoCpus: deployNanoCpus,
        PidsLimit: 128, // 128 process limit (kills fork bombs & mass process floods)
        CapDrop: [
          "NET_ADMIN", // No modifying network routes or interfaces
          "SYS_ADMIN", // No mounting filesystems or kernel tampering
          "SYS_RAWIO", // No raw IO access
          "SYS_PTRACE", // No process tracing/hijacking
          "DAC_OVERRIDE", // Strict filesystem permission enforcement
        ],
        SecurityOpt: ["no-new-privileges:true"], // Prevent setuid privilege escalation
        RestartPolicy: { Name: "unless-stopped" },
        NetworkMode: networkName, // Attach to the internal mesh network
      },
      // Explicit network aliases for mesh communication
      NetworkingConfig: {
        EndpointsConfig: {
          [networkName]: {
            Aliases: [job.slug, containerName]
          }
        }
      }
    });

    // Attach to container logs asynchronously to pipe output to Redis indefinitely
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
          lines.forEach(l => onLog(l).catch(() => {}));
        }
      } as any,
      {
        write(chunk: Buffer) {
          const lines = chunk.toString().split("\n").filter(Boolean);
          lines.forEach(l => onLog(`[stderr] ${l}`).catch(() => {}));
        }
      } as any
    );

    await container.start();
    await onLog(`Waiting for service to bind to port ${job.internalPort}...`);

    try {
      await this.waitForPort(container, hostPort, job.internalPort, 300000); // 5 min timeout
      await onLog(`✓ Service running and healthy. Mapped internal port ${job.internalPort} -> host port ${hostPort}`);

      // Dynamic Runtime Clamping:
      // If burst resources were granted during build/boot, immediately clamp down to target runtime quota
      if (deployNanoCpus > runtimeNanoCpus || deployMemoryBytes > runtimeMemoryBytes) {
        try {
          await container.update({
            NanoCpus: runtimeNanoCpus,
            Memory: runtimeMemoryBytes,
          });
          await onLog(
            isSpinDown
              ? `🔒 Runtime Resource Enforcement: Successfully clamped container to Free Tier (0.1 vCPU & 512MB RAM).`
              : `🔒 Runtime Resource Enforcement: Successfully clamped container to ${runtimeCpuQuota} vCPU & ${runtimeMemoryQuotaMB}MB RAM.`
          );
        } catch (updateErr: any) {
          console.warn(`[ServiceRunner] Failed to clamp container resources: ${updateErr.message}`);
          await onLog(`⚠️ Warning: Failed to clamp runtime resources: ${updateErr.message}`);
        }
      }

      return { hostPort, containerName };
    } catch (err: any) {
      // 1. Give 1 second for attached streams to finish processing any in-flight logs
      await new Promise((r) => setTimeout(r, 1000));

      // 2. Fetch last container logs directly from Docker engine to ensure complete visibility in terminal
      try {
        const rawLogs = await container.logs({
          stdout: true,
          stderr: true,
          tail: 40,
          timestamps: false,
        });
        const recentLines = this.parseDockerLogs(Buffer.isBuffer(rawLogs) ? rawLogs : Buffer.from(rawLogs));
        if (recentLines.length > 0) {
          await onLog(`\n📋 --- Container Output Before Failure ---`);
          for (const line of recentLines.slice(-30)) {
            await onLog(`  ${line}`);
          }
          await onLog(`📋 ---------------------------------------\n`);
        }
      } catch (logErr) {
        // Ignore failure fetching raw logs
      }

      await onLog(`❌ Service startup failed: ${err.message}`);
      if (err.message.includes("Timeout")) {
        await onLog(`💡 Tip: Ensure your app listens on 0.0.0.0 and binds to process.env.PORT (${job.internalPort}).`);
      }
      await onLog(`🧹 Removing failed container ${containerName}...`);
      await container.stop({ t: 2 }).catch(() => {});
      await container.remove({ force: true }).catch(() => {});
      throw err;
    }
  }

  /**
   * Parse Docker multiplexed log stream buffer into clean lines
   */
  private parseDockerLogs(buf: Buffer): string[] {
    const lines: string[] = [];
    if (!Buffer.isBuffer(buf) || buf.length === 0) return lines;

    // Check if buffer has Docker multiplex header (Stream type 1 or 2, followed by 3 zero bytes)
    const isMultiplexed =
      buf.length >= 8 &&
      (buf[0] === 1 || buf[0] === 2) &&
      buf[1] === 0 &&
      buf[2] === 0 &&
      buf[3] === 0;

    if (isMultiplexed) {
      let offset = 0;
      while (offset + 8 <= buf.length) {
        const type = buf.readUInt8(offset);
        const size = buf.readUInt32BE(offset + 4);
        offset += 8;
        if (offset + size > buf.length) {
          const chunk = buf.subarray(offset).toString("utf8");
          chunk.split("\n").filter(Boolean).forEach((l) => lines.push((type === 2 ? "[stderr] " : "") + l.trim()));
          break;
        }
        const chunk = buf.subarray(offset, offset + size).toString("utf8");
        offset += size;
        chunk.split("\n").filter(Boolean).forEach((l) => lines.push((type === 2 ? "[stderr] " : "") + l.trim()));
      }
    } else {
      const text = buf.toString("utf8").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
      text.split("\n").filter(Boolean).forEach((l) => lines.push(l.trim()));
    }
    return lines;
  }

  private async waitForPort(
    container: any,
    port: number,
    internalPort: number,
    timeoutMs: number = 300000
  ): Promise<void> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      let isSettled = false;
      const interval = setInterval(async () => {
        if (isSettled) return;

        // 1. Fail fast if container exited unexpectedly or is in a crash/restart loop
        try {
          const info = await container.inspect();
          if (!info.State.Running || info.State.Restarting) {
            isSettled = true;
            clearInterval(interval);
            const exitCode = info.State.ExitCode;
            const oomKilled = info.State.OOMKilled;
            let reason = `exit code ${exitCode}`;
            if (oomKilled) reason += " (Out of Memory - 512MB RAM limit exceeded)";
            if (info.State.Error) reason += ` - ${info.State.Error}`;
            reject(
              new Error(
                `Service container exited or crashed unexpectedly (${reason})`
              )
            );
            return;
          }
        } catch {
          // If inspection temporarily fails, continue polling
        }

        // 2. Probe HTTP endpoint with a strict per-request timeout
        try {
          await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1500) });
          isSettled = true;
          clearInterval(interval);
          resolve();
          return;
        } catch {
          // Try fallback to localhost
          try {
            await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(1500) });
            isSettled = true;
            clearInterval(interval);
            resolve();
            return;
          } catch {
            // Service not yet responding to HTTP requests
          }
        }

        // 3. Check overall timeout
        if (Date.now() - start > timeoutMs) {
          isSettled = true;
          clearInterval(interval);
          reject(
            new Error(
              `Timeout waiting for HTTP service on port ${port} (internal port ${internalPort}) to become healthy after ${Math.round(
                timeoutMs / 1000
              )}s.`
            )
          );
        }
      }, 2000);
    });
  }

  private async findFreePort(preferredPort?: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on("error", (err: any) => {
        if (preferredPort && err.code === 'EADDRINUSE') {
          // If preferred port is taken, try a random one
          const randomServer = net.createServer();
          randomServer.listen(0, () => {
            const port = (randomServer.address() as net.AddressInfo).port;
            randomServer.close(() => resolve(port));
          });
        } else {
          reject(err);
        }
      });
      server.listen(preferredPort || 0, () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close(() => resolve(port));
      });
    });
  }
}
