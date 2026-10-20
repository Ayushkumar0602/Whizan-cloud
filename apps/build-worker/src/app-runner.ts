import Docker from "dockerode";
import net from "net";
import path from "path";

interface RunningApp {
  containerId: string;
  port: number;
  deploymentId: string;
}

const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const SSR_IMAGE = "node:20-slim";

/**
 * Manages long-running SSR application containers.
 * Each deployment gets its own container mapped to a unique host port.
 */
export class AppRunner {
  private runningApps = new Map<string, RunningApp>(); // deploymentId → RunningApp

  /**
   * Starts a Next.js SSR server or containerized web app inside a Docker container.
   * Returns the host port number.
   */
  async startApp(
    deploymentId: string,
    buildDir: string,
    envVars: Record<string, string>,
    serverEntry?: string,
    rootDir?: string,
    customImage?: string,
    internalPort: number = 3000,
    slug?: string
  ): Promise<number> {
    const shortId = deploymentId.slice(0, 8);
    const containerName = slug ? `app-${slug}` : `app-${shortId}`;
    const exposedPortKey = `${internalPort}/tcp`;

    // 1. Check if a container with this deterministic name already exists in Docker
    const allContainers = await docker.listContainers({ all: true }).catch(() => []);
    const existing = allContainers.find((c) =>
      c.Names?.some((n) => n === `/${containerName}` || n === containerName) ||
      c.Labels?.["deploymentId"] === deploymentId ||
      (slug && c.Labels?.["slug"] === slug)
    );

    if (existing) {
      const container = docker.getContainer(existing.Id);
      const inspect = await container.inspect().catch(() => null);

      if (inspect) {
        const existingHostPort =
          inspect.NetworkSettings?.Ports?.[exposedPortKey]?.[0]?.HostPort ||
          inspect.HostConfig?.PortBindings?.[exposedPortKey]?.[0]?.HostPort;

        // If already running and healthy, reuse instantly
        if (inspect.State?.Running && existingHostPort) {
          const port = parseInt(existingHostPort, 10);
          console.log(`[AppRunner] Reusing already running healthy container ${containerName} on port ${port}`);
          this.runningApps.set(deploymentId, { containerId: existing.Id, port, deploymentId });
          return port;
        }

        // Fast-path cold wake: if container is just stopped (from scale-to-zero), start it in ~100ms
        if (!inspect.State?.Running && !inspect.State?.Restarting && existingHostPort) {
          const port = parseInt(existingHostPort, 10);
          console.log(`[AppRunner] Fast-waking stopped container ${containerName} on port ${port}...`);
          try {
            await container.start();
            await this.waitForReady(container, port);
            this.runningApps.set(deploymentId, { containerId: existing.Id, port, deploymentId });
            return port;
          } catch (startErr: any) {
            console.warn(`[AppRunner] Fast wake failed for ${containerName} (${startErr.message}), recreating...`);
          }
        }

        // If corrupted, dead, or couldn't restart cleanly, force remove before recreation
        await container.stop({ t: 2 }).catch(() => {});
        await container.remove({ force: true }).catch(() => {});
      }
    }

    // 2. Stop any remaining stale containers for this deployment
    await this.stopApp(deploymentId, slug);

    const cleanRootDir = rootDir && rootDir !== "." ? rootDir.replace(/^\/+|\/+$/g, "") : "";
    const workingDir = cleanRootDir ? `/app/${cleanRootDir}` : "/app";

    const port = await this.findFreePort();
    const env = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);
    env.push(`PORT=${internalPort}`);
    env.push(`HOSTNAME=0.0.0.0`);
    env.push(`HOST=0.0.0.0`);
    env.push(`NODE_ENV=production`);

    const image = customImage || SSR_IMAGE;
    const cmd = customImage
      ? undefined
      : serverEntry && serverEntry.endsWith("server.js")
      ? ["node", cleanRootDir ? ".next/standalone/server.js" : serverEntry]
      : ["npm", "run", "start"];

    // Ensure internal service mesh network exists
    try {
      const net = docker.getNetwork("whizan-internal-network");
      await net.inspect();
    } catch (netErr: any) {
      if (netErr?.statusCode === 404 || netErr?.message?.includes("not found")) {
        try {
          await docker.createNetwork({
            Name: "whizan-internal-network",
            Driver: "bridge",
            CheckDuplicate: true,
          });
        } catch {}
      }
    }

    const hostBinds = customImage
      ? []
      : [`${path.resolve(buildDir)}:/app:ro`];

    // Ensure image exists locally before creating container
    await this.ensureImage(image);

    const container = await docker.createContainer({
      name: containerName,
      Image: image,
      Cmd: cmd,
      WorkingDir: customImage ? undefined : workingDir,
      Env: env,
      Labels: {
        deploymentId,
        slug: slug || "",
        managedBy: "whizan-worker",
      },
      ExposedPorts: { [exposedPortKey]: {} },
      HostConfig: {
        Binds: hostBinds,
        PortBindings: {
          [exposedPortKey]: [{ HostPort: String(port) }],
        },
        Memory: 512 * 1024 * 1024, // 512 MB for running web app
        RestartPolicy: { Name: "on-failure", MaximumRetryCount: 3 },
        NetworkMode: "whizan-internal-network", // Join the internal service mesh
      },
    });

    await container.start();

    this.runningApps.set(deploymentId, {
      containerId: container.id,
      port,
      deploymentId,
    });

    // Wait for the app to be ready (health check)
    await this.waitForReady(container, port);

    return port;
  }

  /**
   * Stops and removes the container for a given deployment.
   * Cleans up both memory map and any live Docker containers.
   */
  async stopApp(deploymentId: string, slug?: string): Promise<void> {
    const shortId = deploymentId.slice(0, 8);
    const containerName = slug ? `app-${slug}` : `app-${shortId}`;
    try {
      const containers = await docker.listContainers({ all: true }).catch(() => []);
      const matches = containers.filter((c: any) =>
        c.Labels?.["deploymentId"] === deploymentId ||
        (slug && c.Labels?.["slug"] === slug) ||
        c.Names?.some((n: string) => n === `/${containerName}` || n === containerName || n.includes(`app-${shortId}`))
      );
      for (const info of matches) {
        try {
          const container = docker.getContainer(info.Id);
          if (info.State === "running" || info.State === "restarting") {
            await container.stop({ t: 2 }).catch(() => {});
          }
          await container.remove({ force: true }).catch(() => {});
        } catch {}
      }
    } catch {}

    this.runningApps.delete(deploymentId);
  }

  /**
   * Finds a free TCP port on the host machine.
   */
  private findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as net.AddressInfo;
        server.close(() => resolve(address.port));
      });
      server.on("error", reject);
    });
  }

  /**
   * Polls the SSR container's port until it starts accepting connections.
   * If the container crashes or exits prematurely, fails fast and extracts logs.
   */
  private async waitForReady(
    container: Docker.Container,
    port: number,
    timeoutMs = 20_000
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      // Check if container died or failed to run
      try {
        const inspect = await container.inspect();
        if (!inspect.State.Running && inspect.State.ExitCode !== 0) {
          const logsBuffer = await container.logs({ stdout: true, stderr: true, tail: 20 }).catch(() => "");
          throw new Error(`Web container exited unexpectedly with code ${inspect.State.ExitCode}: ${logsBuffer.toString()}`);
        }
      } catch (err: any) {
        if (err.message?.includes("exited unexpectedly")) throw err;
      }

      const ready = await new Promise<boolean>((resolve) => {
        const socket = net.connect(port, "127.0.0.1");
        socket.on("connect", () => { socket.destroy(); resolve(true); });
        socket.on("error", () => resolve(false));
      });
      if (ready) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Web application on port ${port} did not become ready within ${timeoutMs / 1000}s`);
  }

  /**
   * Pulls a Docker image if it's not already available locally.
   */
  private async ensureImage(imageName: string): Promise<void> {
    try {
      await docker.getImage(imageName).inspect();
    } catch {
      console.log(`[AppRunner] Image '${imageName}' not found locally. Auto-pulling...`);
      await new Promise<void>((resolve, reject) => {
        docker.pull(imageName, (err: Error, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
      console.log(`[AppRunner] ✓ Successfully pulled '${imageName}'.`);
    }
  }
}
