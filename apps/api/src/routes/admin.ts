import { FastifyInstance } from "fastify";
import { PrismaClient } from "@hostify/db";
import { Redis } from "ioredis";
import { signAdminPayload } from "../lib/auth-utils.js";

const prisma = new PrismaClient();
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });

async function publishAdminCommand(payload: Record<string, any>) {
  const signed = signAdminPayload(payload);
  await redis.publish("admin:commands", JSON.stringify(signed));
}

export const adminRoutes = async function (fastify: FastifyInstance) {
  // Strict Platform Administrator Authentication & RBAC Check
  fastify.addHook("preHandler", (fastify as any).requireAdmin);

  // 1. Get overall system stats + VM health from worker
  fastify.get("/stats", async (request, reply) => {
    const [
      usersCount,
      projectsCount,
      deploymentsCount,
      backendServicesCount,
      databasesCount,
      allDeployments,
      allBackendServices,
      allDatabases,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.deployment.count(),
      prisma.backendService.count(),
      prisma.databaseService.count(),
      prisma.deployment.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          project: {
            select: { id: true, name: true, slug: true, framework: true, userId: true },
          },
        },
        take: 50,
      }),
      prisma.backendService.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          deployments: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          user: {
            select: { id: true, email: true, name: true },
          },
        },
        take: 50,
      }),
      prisma.databaseService.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
        },
        take: 50,
      }),
    ]);

    // Read VM stats published by the worker every 15s
    let vmStats = null;
    try {
      const raw = await redis.get("vm:stats");
      if (raw) vmStats = JSON.parse(raw);
    } catch {}

    // Sanitize database objects (never leak password ciphertext in stats)
    const sanitizedDatabases = allDatabases.map((db) => {
      const { password, readonlyPassword, ...safeDb } = db as any;
      return safeDb;
    });

    return {
      users: usersCount,
      projects: projectsCount,
      deployments: deploymentsCount,
      backendServices: backendServicesCount,
      databases: databasesCount,
      allDeployments,
      allBackendServices,
      allDatabases: sanitizedDatabases,
      vmStats,
    };
  });

  // ─── User Management (Admin Only) ──────────────────────────────────────────

  // GET /api/admin/users — List all platform users with resource statistics
  fastify.get("/users", async () => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        subscriptionTier: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            projects: true,
            backendServices: true,
            databaseServices: true,
            apiKeys: true,
          },
        },
      },
    });
    return users;
  });

  // PATCH /api/admin/users/:id — Upgrade/downgrade subscription or change user role
  fastify.patch("/users/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { role, subscriptionTier } = request.body as {
      role?: string;
      subscriptionTier?: string;
    };

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) return reply.code(404).send({ error: "User not found" });

    const updateData: any = {};
    if (role && (role.toUpperCase() === "USER" || role.toUpperCase() === "ADMIN")) {
      updateData.role = role.toUpperCase();
    }
    if (
      subscriptionTier &&
      (subscriptionTier.toUpperCase() === "HOBBY" || subscriptionTier.toUpperCase() === "PROFESSIONAL")
    ) {
      updateData.subscriptionTier = subscriptionTier.toUpperCase();
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, subscriptionTier: true },
    });
    return updated;
  });

  // DELETE /api/admin/users/:id — Terminate and cascade-delete a user and all their resources
  fastify.delete("/users/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const targetUser = await prisma.user.findUnique({
      where: { id },
      include: {
        projects: { select: { id: true, slug: true } },
        backendServices: { select: { id: true, slug: true } },
        databaseServices: { select: { id: true, slug: true } },
      },
    });
    if (!targetUser) return reply.code(404).send({ error: "User not found" });

    // Clean up all resources for this user on the host VM
    for (const p of targetUser.projects) {
      await publishAdminCommand({ action: "DELETE_PROJECT", projectId: p.id, slug: p.slug });
    }
    for (const s of targetUser.backendServices) {
      await publishAdminCommand({ action: "DELETE_SERVICE", serviceId: s.id, slug: s.slug });
    }
    for (const d of targetUser.databaseServices) {
      await publishAdminCommand({ action: "DELETE_CONTAINER", containerId: `whizan-db-${d.id}` });
    }

    await prisma.user.delete({ where: { id } });
    return { success: true };
  });

  // ─── Container Management ──────────────────────────────────────────────────

  // 2. Stop/Pause a project deployment container
  fastify.post("/deployments/:id/stop", async (request, reply) => {
    const { id } = request.params as { id: string };

    const deployment = await prisma.deployment.findUnique({ where: { id } });
    if (!deployment) return reply.code(404).send({ error: "Not found" });

    await prisma.deployment.update({
      where: { id },
      data: { status: "PAUSED", containerPort: null },
    });

    const project = await prisma.project.findUnique({ where: { id: deployment.projectId } });
    if (project) {
      const routerKey = `deployment:${project.slug}`;
      const raw = await redis.get(routerKey);
      if (raw) {
        const info = JSON.parse(raw);
        delete info.containerPort;
        await redis.set(routerKey, JSON.stringify(info));
      }
    }

    await publishAdminCommand({
      action: "STOP_CONTAINER",
      deploymentId: id,
    });

    return { success: true };
  });

  // 3. Delete a deployment completely
  fastify.delete("/deployments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    await publishAdminCommand({
      action: "DELETE_CONTAINER",
      deploymentId: id,
    });

    await prisma.deployment.delete({ where: { id } }).catch(() => {});
    return { success: true };
  });

  // 4. Force-kill a specific Docker container by its container ID
  fastify.delete("/containers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    await publishAdminCommand({
      action: "KILL_CONTAINER_BY_ID",
      containerId: id,
    });

    return { success: true };
  });

  // 4b. Stop / pause backend service
  fastify.post("/services/:id/stop", async (request, reply) => {
    const { id } = request.params as { id: string };
    const service = await prisma.backendService.findUnique({
      where: { id },
      include: { deployments: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!service) return reply.code(404).send({ error: "Service not found" });

    const latest = service.deployments[0];
    if (latest) {
      await prisma.serviceDeployment.update({
        where: { id: latest.id },
        data: { status: "PAUSED", containerPort: null },
      });
      await publishAdminCommand({
        action: "STOP_CONTAINER",
        deploymentId: latest.id,
      });
    }
    return { success: true };
  });

  // 4c. Delete backend service
  fastify.delete("/services/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const service = await prisma.backendService.findUnique({
      where: { id },
      include: { deployments: true },
    });
    if (!service) return reply.code(404).send({ error: "Service not found" });

    for (const d of service.deployments) {
      await publishAdminCommand({
        action: "DELETE_CONTAINER",
        deploymentId: d.id,
      });
    }
    await prisma.backendService.delete({ where: { id } }).catch(() => {});
    return { success: true };
  });

  // 4d. Stop / pause database
  fastify.post("/databases/:id/stop", async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = await prisma.databaseService.findUnique({ where: { id } });
    if (!db) return reply.code(404).send({ error: "Database not found" });

    await prisma.databaseService.update({ where: { id }, data: { status: "STOPPED" } });
    await publishAdminCommand({
      action: "STOP_CONTAINER",
      containerId: `whizan-db-${id}`,
    });
    return { success: true };
  });

  // 4e. Delete database
  fastify.delete("/databases/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = await prisma.databaseService.findUnique({ where: { id } });
    if (!db) return reply.code(404).send({ error: "Database not found" });

    await publishAdminCommand({
      action: "DELETE_CONTAINER",
      containerId: `whizan-db-${id}`,
    });
    await prisma.databaseService.delete({ where: { id } }).catch(() => {});
    return { success: true };
  });

  // 4f. Fetch logs from a specific container (RPC)
  fastify.get("/containers/:id/logs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const replyChannel = `admin:rpc:logs:${id}:${Date.now()}`;

    return new Promise((resolve) => {
      let timeout = setTimeout(() => {
        sub.unsubscribe(replyChannel).catch(() => {});
        sub.quit().catch(() => {});
        resolve({ logs: "Timeout waiting for VM worker. Is it online?" });
      }, 5000);

      const sub = redis.duplicate();
      sub.subscribe(replyChannel, () => {
        publishAdminCommand({
          action: "GET_CONTAINER_LOGS",
          containerId: id,
          replyTo: replyChannel,
        });
      });

      sub.on("message", (channel, message) => {
        if (channel === replyChannel) {
          clearTimeout(timeout);
          sub.unsubscribe(replyChannel).catch(() => {});
          sub.quit().catch(() => {});
          resolve({ logs: message });
        }
      });
    });
  });

  // 5. Delete specific file/directory on VM
  fastify.post("/files/delete", async (request, reply) => {
    const { path } = request.body as { path: string };

    if (!path) return reply.code(400).send({ error: "Path required" });

    // Sanitize path against root deletions
    const cleanPath = path.trim();
    if (cleanPath === "/" || cleanPath === "/*" || cleanPath === "/root" || cleanPath === "/home") {
      return reply.code(400).send({ error: "Protected system path cannot be deleted." });
    }

    await publishAdminCommand({
      action: "DELETE_FILE",
      path: cleanPath,
    });

    return { success: true };
  });

  // 5b. Prune unused Docker system layers & buildkit cache
  fastify.post("/system/prune-docker", async () => {
    await publishAdminCommand({
      action: "PRUNE_DOCKER",
    });
    return { success: true };
  });

  // 5c. Clear global build and npm cache (/opt/whizan-cache)
  fastify.post("/system/clear-cache", async () => {
    await publishAdminCommand({
      action: "CLEAR_BUILD_CACHE",
    });
    return { success: true };
  });

  // 5d. Interactive VM Terminal Command Exec (Admin Only on Host VM & Remote VM)
  fastify.post("/terminal/exec", async (request, reply) => {
    const { command, cwd, remote } = request.body as {
      command: string;
      cwd?: string;
      remote?: { host: string; port?: number; username: string; password?: string; privateKey?: string };
    };

    if (command === undefined || command === null) {
      return reply.code(400).send({ error: "Command required" });
    }

    const replyChannel = `admin:rpc:terminal:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    const sub = redis.duplicate();

    return new Promise((resolve) => {
      let timeout = setTimeout(() => {
        sub.unsubscribe(replyChannel).catch(() => {});
        sub.quit().catch(() => {});
        resolve({
          stdout: "",
          stderr: "Command execution timed out after 35 seconds. Process may still be running in background.",
          exitCode: 124,
          cwd: cwd || "/opt/whizan",
        });
      }, 36000);

      sub.subscribe(replyChannel, () => {
        publishAdminCommand({
          action: "VM_EXEC",
          command,
          cwd: cwd || "/opt/whizan",
          remote,
          replyTo: replyChannel,
        });
      });

      sub.on("message", (channel, message) => {
        if (channel === replyChannel) {
          clearTimeout(timeout);
          sub.unsubscribe(replyChannel).catch(() => {});
          sub.quit().catch(() => {});
          try {
            resolve(JSON.parse(message));
          } catch {
            resolve({ stdout: message, stderr: "", exitCode: 0, cwd: cwd || "/opt/whizan" });
          }
        }
      });
    });
  });

  // 6. Get logs
  fastify.get("/logs/:service/:type", async (request) => {
    const { service, type } = request.params as { service: string; type: string };
    const logs = await redis.get(`vm:logs:${service}:${type}`);
    return { logs: logs || "No logs available" };
  });

  // 7. Restart services
  fastify.post("/restart/:service", async (request) => {
    const { service } = request.params as { service: string };
    if (service === "worker") {
      await publishAdminCommand({ action: "RESTART_WORKER" });
    } else if (service === "router") {
      await publishAdminCommand({ action: "RESTART_ROUTER" });
    }
    return { success: true };
  });

  // 8. Database Stats
  fastify.get("/database/stats", async () => {
    let redisStats = null;
    try {
      const info = await redis.info();
      const getVal = (key: string) => {
        const match = info.match(new RegExp(`^${key}:(.*)`, "m"));
        return match ? match[1].trim() : null;
      };
      redisStats = {
        version: getVal("redis_version"),
        uptime: getVal("uptime_in_days"),
        connectedClients: getVal("connected_clients"),
        usedMemory: getVal("used_memory_human"),
        peakMemory: getVal("used_memory_peak_human"),
      };
    } catch {}

    let pgStats = null;
    try {
      const dbSizeRes: any = await prisma.$queryRawUnsafe(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`);
      const connRes: any = await prisma.$queryRawUnsafe(`SELECT count(*) as connections FROM pg_stat_activity`);
      pgStats = {
        size: dbSizeRes?.[0]?.size || "Unknown",
        connections: Number(connRes?.[0]?.connections || 0),
      };
    } catch {}

    return { redis: redisStats, postgres: pgStats };
  });
};
