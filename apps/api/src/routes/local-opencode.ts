import type { FastifyPluginAsync } from "fastify";
import Docker from "dockerode";
import path from "node:path";
import fs from "node:fs/promises";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const CONTAINER_NAME = "whizan-local-opencode";
const IMAGE_NAME = "whizan-local-opencode:latest";

function getWorkspaceDir() {
  const root = process.cwd().includes("apps/api")
    ? path.resolve(process.cwd(), "../..")
    : process.cwd();
  return path.resolve(root, "opencode-workspace");
}

export const localOpencodeRoutes: FastifyPluginAsync = async (fastify) => {
  // ── GET /status — Get container status ──────────────────────────────────────
  fastify.get("/status", async () => {
    try {
      const container = docker.getContainer(CONTAINER_NAME);
      const inspect = await container.inspect();
      return {
        exists: true,
        running: inspect.State?.Running || false,
        status: inspect.State?.Status || "unknown",
        containerId: inspect.Id?.slice(0, 12),
        image: inspect.Config?.Image,
        workspace: getWorkspaceDir(),
      };
    } catch {
      return {
        exists: false,
        running: false,
        status: "stopped",
        workspace: getWorkspaceDir(),
      };
    }
  });

  // ── POST /start — Ensure container is created and running ──────────────────
  fastify.post("/start", async (request: any, reply) => {
    const { apiKey } = (request.body as { apiKey?: string }) || {};
    const workspaceDir = getWorkspaceDir();
    await fs.mkdir(workspaceDir, { recursive: true });

    try {
      const container = docker.getContainer(CONTAINER_NAME);
      const inspect = await container.inspect().catch(() => null);

      if (inspect) {
        if (!inspect.State?.Running) {
          await container.start();
        }
        return reply.send({ success: true, message: "Container started", containerId: inspect.Id.slice(0, 12) });
      }
    } catch {}

    // Container does not exist, create it
    try {
      const PRIMARY_KEY   = "AQ.Ab8RN6Jey2BrJP1cYOJdhuvK7BvOVUi_haNSGUEEKp4JioHpZQ";
      const FALLBACK_KEY  = "AQ.Ab8RN6LqJFX-KBWqb-ZozXjzh0GmM3WaTWAb8sexKCn-bgsd7Q";
      const envVars = [
        "TERM=xterm-256color",
        "COLORTERM=truecolor",
        `GEMINI_API_KEY=${PRIMARY_KEY}`,
        `GOOGLE_GENERATIVE_AI_API_KEY=${PRIMARY_KEY}`,
        `GEMINI_API_KEY_PRIMARY=${PRIMARY_KEY}`,
        `GEMINI_API_KEY_FALLBACK=${FALLBACK_KEY}`,
      ];

      const newContainer = await docker.createContainer({
        Image: IMAGE_NAME,
        name: CONTAINER_NAME,
        Tty: true,
        OpenStdin: true,
        WorkingDir: "/workspace",
        Env: envVars,
        HostConfig: {
          Binds: [`${workspaceDir}:/workspace`],
          RestartPolicy: { Name: "unless-stopped" },
        },
        Cmd: ["sleep", "infinity"],
      });

      await newContainer.start();
      return reply.code(201).send({ success: true, message: "Container created and started", containerId: newContainer.id.slice(0, 12) });
    } catch (err: any) {
      return reply.code(500).send({ error: `Failed to create/start container: ${err.message}` });
    }
  });

  // ── POST /stop — Stop container ────────────────────────────────────────────
  fastify.post("/stop", async (request, reply) => {
    try {
      const container = docker.getContainer(CONTAINER_NAME);
      await container.stop({ t: 2 }).catch(() => {});
      return reply.send({ success: true, message: "Container stopped" });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // ── GET /terminal — WebSocket PTY Bridge to Local Docker ───────────────────
  fastify.get("/terminal", { websocket: true }, async (connection: any, request: any) => {
    const socket = connection?.socket || connection;
    const cols = Math.max(20, Math.min(300, Number((request.query as any)?.cols) || 100));
    const rows = Math.max(5, Math.min(100, Number((request.query as any)?.rows) || 30));

    let container: any;
    try {
      container = docker.getContainer(CONTAINER_NAME);
      const inspect = await container.inspect();
      if (!inspect.State?.Running) {
        await container.start();
      }
    } catch (err: any) {
      socket.send(`\r\n\x1b[31m[OpenCode Error] Local container '${CONTAINER_NAME}' is not running.\x1b[0m\r\n`);
      socket.send(`\x1b[33mClick 'Start Container' above to launch it.\x1b[0m\r\n`);
      socket.close();
      return;
    }

    try {
      const exec = await container.exec({
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        ConsoleSize: [rows, cols],
        Cmd: [
          "bash",
          "-c",
          "echo -e '\\033[1;36m┌────────────────────────────────────────────────────────────┐\\033[0m'; " +
          "echo -e '\\033[1;36m│          ⚡ OpenCode AI Local Container Ready              │\\033[0m'; " +
          "echo -e '\\033[1;36m│  Workspace: /workspace                                    │\\033[0m'; " +
          "echo -e '\\033[1;36m│  Model:     google/gemini-3.5-flash-lite                  │\\033[0m'; " +
          "echo -e '\\033[1;36m│  Launch:    opencode -m google/gemini-3.5-flash-lite       │\\033[0m'; " +
          "echo -e '\\033[1;36m└────────────────────────────────────────────────────────────┘\\033[0m\\n'; " +
          "exec bash --rcfile /root/.bashrc",
        ],
        WorkingDir: "/workspace",
        Env: [
          "TERM=xterm-256color",
          "COLORTERM=truecolor",
          "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
          "GEMINI_API_KEY=AQ.Ab8RN6Jey2BrJP1cYOJdhuvK7BvOVUi_haNSGUEEKp4JioHpZQ",
          "GOOGLE_GENERATIVE_AI_API_KEY=AQ.Ab8RN6Jey2BrJP1cYOJdhuvK7BvOVUi_haNSGUEEKp4JioHpZQ",
          "GEMINI_API_KEY_PRIMARY=AQ.Ab8RN6Jey2BrJP1cYOJdhuvK7BvOVUi_haNSGUEEKp4JioHpZQ",
          "GEMINI_API_KEY_FALLBACK=AQ.Ab8RN6LqJFX-KBWqb-ZozXjzh0GmM3WaTWAb8sexKCn-bgsd7Q",
        ],
      });

      const stream = await exec.start({
        hijack: true,
        stdin: true,
        Tty: true,
      });

      // Stream container output -> WebSocket client
      stream.on("data", (chunk: Buffer) => {
        if (socket.readyState === 1) {
          socket.send(chunk);
        }
      });

      stream.on("end", () => {
        if (socket.readyState === 1) {
          socket.close();
        }
      });

      // Stream WebSocket client input -> Container PTY stdin
      socket.on("message", (data: any) => {
        try {
          const str = data.toString();
          if (str.startsWith("{")) {
            const parsed = JSON.parse(str);
            if (parsed.type === "resize" && parsed.cols && parsed.rows) {
              exec.resize({ h: parsed.rows, w: parsed.cols }).catch(() => {});
              return;
            }
            if (parsed.type === "input" && typeof parsed.data === "string") {
              stream.write(parsed.data);
              return;
            }
          }
        } catch {}

        if (Buffer.isBuffer(data)) {
          stream.write(data);
        } else {
          stream.write(Buffer.from(data));
        }
      });

      socket.on("close", () => {
        try {
          stream.end();
        } catch {}
      });
    } catch (execErr: any) {
      socket.send(`\r\n\x1b[31m[Error starting terminal session]: ${execErr.message}\x1b[0m\r\n`);
      socket.close();
    }
  });
};
