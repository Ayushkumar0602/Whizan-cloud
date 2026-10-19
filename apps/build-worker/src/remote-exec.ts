import Docker from "dockerode";
import { redisPub, redisSub } from "./redis.js";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

interface ActiveExecSession {
  sessionId: string;
  exec: any;
  stream: any;
  onMessage: (channel: string, message: string) => void;
}

const activeSessions = new Map<string, ActiveExecSession>();

export function getActiveSessionCount(): number {
  return activeSessions.size;
}

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

      const inChan = `exec:in:${sessionId}`;
      const resizeChan = `exec:resize:${sessionId}`;
      const closeChan = `exec:close:${sessionId}`;

      const onSessionMessage = (subChan: string, subMsg: string) => {
        if (subChan === inChan) {
          try {
            const buf = Buffer.from(subMsg, "base64");
            stream.write(buf);
          } catch {}
        } else if (subChan === resizeChan) {
          try {
            const dims = JSON.parse(subMsg);
            if (dims.cols && dims.rows) {
              exec.resize({ h: dims.rows, w: dims.cols }).catch(() => {});
            }
          } catch {}
        } else if (subChan === closeChan) {
          cleanupSession().catch(() => {});
        }
      };

      const session: ActiveExecSession = {
        sessionId,
        exec,
        stream,
        onMessage: onSessionMessage,
      };
      activeSessions.set(sessionId, session);

      // Handle container stream output -> publish to Redis
      stream.on("data", (chunk: Buffer) => {
        redisPub.publish(`exec:out:${sessionId}`, chunk.toString("base64")).catch(() => {});
      });

      const cleanupSession = async () => {
        if (!activeSessions.has(sessionId)) return;
        activeSessions.delete(sessionId);
        redisSub.off("message", onSessionMessage);
        await redisSub.unsubscribe(inChan, resizeChan, closeChan).catch(() => {});
        try {
          stream.destroy();
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

      // Subscribe to input, resize, close channels for this session using shared subscriber
      redisSub.on("message", onSessionMessage);
      await redisSub.subscribe(inChan, resizeChan, closeChan).catch(() => {});

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
