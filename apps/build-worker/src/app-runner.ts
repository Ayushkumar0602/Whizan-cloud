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
   * Starts a Next.js SSR server inside a Docker container.
   * Returns the host port number.
   */
  async startApp(
    deploymentId: string,
    buildDir: string,
    envVars: Record<string, string>,
    serverEntry?: string,
    rootDir?: string
  ): Promise<number> {
    // Stop any old container for this deployment
    await this.stopApp(deploymentId);

    const cleanRootDir = rootDir && rootDir !== "." ? rootDir.replace(/^\/+|\/+$/g, "") : "";
    const workingDir = cleanRootDir ? `/app/${cleanRootDir}` : "/app";

    const port = await this.findFreePort();
    const env = Object.entries(envVars).map(([k, v]) => `${k}=${v}`);
    env.push(`PORT=3000`);
    env.push(`HOSTNAME=0.0.0.0`);

    const cmd = serverEntry && serverEntry.endsWith("server.js")
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

    const container = await docker.createContainer({
      Image: SSR_IMAGE,
      Cmd: cmd,
      WorkingDir: workingDir,
      Env: env,
      ExposedPorts: { "3000/tcp": {} },
      HostConfig: {
        Binds: [`${path.resolve(buildDir)}:/app:ro`], // Read-only for security
        PortBindings: {
          "3000/tcp": [{ HostPort: String(port) }],
        },
        Memory: 256 * 1024 * 1024, // 256 MB for the running app
        RestartPolicy: { Name: "unless-stopped" },
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
    await this.waitForReady(port);

    return port;
  }

  /**
   * Stops and removes the container for a given deployment.
   */
  async stopApp(deploymentId: string): Promise<void> {
    const app = this.runningApps.get(deploymentId);
    if (!app) return;

    try {
      const container = docker.getContainer(app.containerId);
      await container.stop({ t: 5 }); // 5 second grace period
      await container.remove();
    } catch {
      // Container may already be gone
    }

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
   */
  private async waitForReady(
    port: number,
    timeoutMs = 30_000
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ready = await new Promise<boolean>((resolve) => {
        const socket = net.connect(port, "127.0.0.1");
        socket.on("connect", () => { socket.destroy(); resolve(true); });
        socket.on("error", () => resolve(false));
      });
      if (ready) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`App on port ${port} did not become ready within ${timeoutMs}ms`);
  }
}
