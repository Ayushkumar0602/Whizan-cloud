import Docker from "dockerode";
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const docker = new Docker({ socketPath: "/var/run/docker.sock" });

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
  console.warn("[RemoteExec Pub warn]", err.message);
});

const redisSub = new Redis(REDIS_URL, redisOptions);
redisSub.on("error", (err) => {
  if (err.message?.includes("Connection is closed")) return;
  console.warn("[RemoteExec Sub warn]", err.message);
});

interface ActiveExecSession {
  sessionId: string;
  exec: any;
  stream: any;
  sub: Redis;
}

const activeSessions = new Map<string, ActiveExecSession>();

export async function initRemoteExec(): Promise<void> {
  await redisSub.subscribe("exec:open");
  console.log("[Remote Exec] Listening for remote web terminal sessions on 'exec:open'...");

  redisSub.on("message", async (channel, message) => {
    if (channel !== "exec:open") return;

    let payload: {
      sessionId: string;
      serviceId: string;
      deploymentId: string;
      slug: string;
      rootDir?: string;
      cols?: number;
      rows?: number;
    };

    try {
      payload = JSON.parse(message);
    } catch {
      return;
    }

    const { sessionId, serviceId, deploymentId, slug, rootDir, cols = 100, rows = 24 } = payload;
    if (!sessionId || !serviceId) return;

    try {
      const allContainers = await docker.listContainers({ all: true }).catch(() => []);
      const shortId = deploymentId?.slice(0, 8);

      const target = allContainers.find((c) =>
        c.State === "running" &&
        (
          c.Names?.some((n) => n === `/service-${slug}-${shortId}` || n === `/service-${slug}`) ||
          (c.Labels?.["serviceId"] === serviceId && (!deploymentId || c.Labels?.["deploymentId"] === deploymentId))
        )
      );

      if (!target) {
        await redisPub.publish(
          `exec:error:${sessionId}`,
          JSON.stringify({ error: `Container for service "${slug}" is not currently running on host.` })
        );
        return;
      }

      const container = docker.getContainer(target.Id);
      const containerName = target.Names?.[0]?.replace(/^\//, "") || `service-${slug}-${shortId}`;
      const cleanRoot = (rootDir || ".").replace(/^\/+|\/+$/g, "");
      const workingDir = cleanRoot && cleanRoot !== "." ? `/app/${cleanRoot}` : "/app";

      const exec = await container.exec({
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        ConsoleSize: [rows, cols],
        Cmd: ["sh", "-c", "if [ -x /bin/bash ]; then exec /bin/bash; elif [ -x /bin/sh ]; then exec /bin/sh; else exec sh; fi"],
        WorkingDir: workingDir,
        Env: [
          "TERM=xterm-256color",
          "COLORTERM=truecolor",
        ],
      });

      const stream = await exec.start({
        hijack: true,
        stdin: true,
        Tty: true,
      });

      // Dedicated Redis subscriber for this session
      const sessionSub = new Redis(REDIS_URL, redisOptions);
      sessionSub.on("error", () => {});

      const session: ActiveExecSession = {
        sessionId,
        exec,
        stream,
        sub: sessionSub,
      };
      activeSessions.set(sessionId, session);

      // Handle container stream output -> publish to Redis
      stream.on("data", (chunk: Buffer) => {
        redisPub.publish(`exec:out:${sessionId}`, chunk.toString("base64")).catch(() => {});
      });

      const cleanupSession = async () => {
        if (!activeSessions.has(sessionId)) return;
        activeSessions.delete(sessionId);
        try {
          stream.destroy();
        } catch {}
        try {
          await sessionSub.unsubscribe();
          await sessionSub.quit();
        } catch {}
      };

      stream.on("end", async () => {
        await redisPub.publish(`exec:exit:${sessionId}`, JSON.stringify({ code: 0 })).catch(() => {});
        await cleanupSession();
      });

      stream.on("error", async (err: any) => {
        await redisPub.publish(`exec:error:${sessionId}`, JSON.stringify({ error: err.message })).catch(() => {});
        await cleanupSession();
      });

      // Subscribe to input, resize, close channels for this session
      await sessionSub.subscribe(
        `exec:in:${sessionId}`,
        `exec:resize:${sessionId}`,
        `exec:close:${sessionId}`
      );

      sessionSub.on("message", async (subChan, subMsg) => {
        if (subChan === `exec:in:${sessionId}`) {
          try {
            const buf = Buffer.from(subMsg, "base64");
            stream.write(buf);
          } catch {}
        } else if (subChan === `exec:resize:${sessionId}`) {
          try {
            const dims = JSON.parse(subMsg);
            if (dims.cols && dims.rows) {
              exec.resize({ h: dims.rows, w: dims.cols }).catch(() => {});
            }
          } catch {}
        } else if (subChan === `exec:close:${sessionId}`) {
          await cleanupSession();
        }
      });

      // Notify Render API that session is ready
      await redisPub.publish(
        `exec:ready:${sessionId}`,
        JSON.stringify({
          container: containerName,
          workingDir,
          slug,
        })
      );
    } catch (err: any) {
      await redisPub.publish(
        `exec:error:${sessionId}`,
        JSON.stringify({ error: err.message || "Failed to start exec session" })
      );
    }
  });
}
