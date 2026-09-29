import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { randomUUID } from "crypto";
import { redisClient, redisSub } from "../lib/redis.js";
import { evaluateCommandSecurity } from "../lib/container-security.js";
import { parseDockerStats } from "../lib/container-metrics.js";
import { getAuthenticatedGitUrl } from "../lib/github-utils.js";

const serviceQueue = new Queue("service-build", {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export const INSTANCE_TIERS: Record<string, { cpu: number; memory: number; label: string; spinDown: boolean }> = {
  free: { cpu: 0.1, memory: 512, label: "Free Tier (0.1 vCPU / 512MB RAM — Auto Spin-Down)", spinDown: true },
  starter: { cpu: 0.5, memory: 512, label: "Starter (0.5 vCPU / 512MB RAM — Always-On)", spinDown: false },
  standard: { cpu: 1.0, memory: 1024, label: "Standard (1.0 vCPU / 1GB RAM — Always-On)", spinDown: false },
  pro: { cpu: 2.0, memory: 2048, label: "Pro (2.0 vCPU / 2GB RAM — Always-On)", spinDown: false },
  pro_plus: { cpu: 4.0, memory: 4096, label: "Pro Plus (4.0 vCPU / 4GB RAM — Always-On)", spinDown: false },
};

const CreateServiceSchema = z.object({
  name: z.string().min(1).max(60),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  githubRepoUrl: z.union([z.string().url(), z.literal("direct-upload"), z.literal("")]).default("direct-upload"),
  branch: z.string().default("main"),
  language: z.enum(["NODEJS", "PYTHON", "GO", "DOCKERFILE"]).default("NODEJS"),
  rootDir: z.string().default("."),
  installCommand: z.string().default("npm install"),
  startCommand: z.string().default("npm start"),
  internalPort: z.number().int().default(8000),
  isPublic: z.boolean().default(false),
  autoSleep: z.boolean().default(false),
  instanceType: z.enum(["free", "starter", "standard", "pro", "pro_plus"]).default("starter"),
  cpuLimit: z.number().min(0.1).max(8.0).optional(),
  memoryLimit: z.number().int().min(256).max(16384).optional(),
});

const UpdateServiceSchema = CreateServiceSchema.partial().omit({ slug: true });

export async function serviceRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", async (request, reply) => {
    // SSE log, SSE metrics stream, and WebSocket exec endpoints send auth token in query params
    if (request.url.includes("/logs") || request.url.includes("/exec") || request.url.includes("/metrics/stream") || request.url.includes("/plans")) return;
    await fastify.authenticate(request, reply);
  });

  // GET /api/services/plans
  fastify.get("/plans", async () => {
    return INSTANCE_TIERS;
  });

  // GET /api/services
  fastify.get("/", async (request) => {
    const { userId } = request.user;
    return prisma.backendService.findMany({
      where: { userId },
      include: { deployments: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
  });

  // POST /api/services
  fastify.post("/", async (request, reply) => {
    const body = CreateServiceSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const { userId } = request.user;
    let finalSlug = body.data.slug;
    let slugTaken = await prisma.backendService.findUnique({ where: { slug: finalSlug } });
    
    // Also ensure slug doesn't conflict with frontend projects
    let projectSlugTaken = await prisma.project.findUnique({ where: { slug: finalSlug } });
    
    if (slugTaken || projectSlugTaken) {
      finalSlug = `${finalSlug}-${userId.replace(/-/g, '').substring(0, 5)}`;
      let secondCheck = await prisma.backendService.findUnique({ where: { slug: finalSlug } });
      if (secondCheck) {
        finalSlug = `${finalSlug}-${Math.random().toString(36).substring(2, 6)}`;
      }
    }

    let instanceType = body.data.instanceType || "starter";
    let cpuLimit = body.data.cpuLimit;
    let memoryLimit = body.data.memoryLimit;

    // Free Tier enforcement:
    // If autoSleep (spin-down) is enabled, it strictly locks to 0.1 vCPU and 512MB RAM
    if (body.data.autoSleep) {
      instanceType = "free";
      cpuLimit = 0.1;
      memoryLimit = 512;
    } else {
      const tier = INSTANCE_TIERS[instanceType] || INSTANCE_TIERS.starter;
      if (!cpuLimit) cpuLimit = tier.cpu;
      if (!memoryLimit) memoryLimit = tier.memory;
    }

    const service = await prisma.backendService.create({
      data: {
        ...body.data,
        slug: finalSlug,
        instanceType,
        cpuLimit,
        memoryLimit,
        userId,
      },
    });
    return reply.code(201).send(service);
  });

  // GET /api/services/:id
  fastify.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;
    const service = await prisma.backendService.findFirst({
      where: { id, userId },
      include: {
        deployments: { orderBy: { createdAt: "desc" }, take: 10 },
        envVariables: { select: { id: true, key: true, createdAt: true, isSecret: true } }, // Do not return raw values
      },
    });
    if (!service) return reply.code(404).send({ error: "Service not found" });
    return service;
  });

  // PUT /api/services/:id
  fastify.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;
    const body = UpdateServiceSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const existing = await prisma.backendService.findFirst({ where: { id, userId } });
    if (!existing) return reply.code(404).send({ error: "Service not found" });

    const patchData: any = { ...body.data };

    // When spin-down (autoSleep) is enabled, enforce 0.1 vCPU and 512MB RAM
    if (patchData.autoSleep === true) {
      patchData.instanceType = "free";
      patchData.cpuLimit = 0.1;
      patchData.memoryLimit = 512;
    } else if (patchData.autoSleep === false && existing.autoSleep === true) {
      // Switching from Free Tier to Dedicated Always-On
      if (!patchData.instanceType || patchData.instanceType === "free") {
        patchData.instanceType = "starter";
      }
      const tier = INSTANCE_TIERS[patchData.instanceType] || INSTANCE_TIERS.starter;
      patchData.cpuLimit = patchData.cpuLimit || tier.cpu;
      patchData.memoryLimit = patchData.memoryLimit || tier.memory;
    } else if (patchData.instanceType && INSTANCE_TIERS[patchData.instanceType]) {
      const tier = INSTANCE_TIERS[patchData.instanceType];
      patchData.cpuLimit = patchData.cpuLimit || tier.cpu;
      patchData.memoryLimit = patchData.memoryLimit || tier.memory;
    }

    const updated = await prisma.backendService.update({
      where: { id },
      data: patchData,
    });
    return updated;
  });

  // DELETE /api/services/:id
  fastify.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;
    const existing = await prisma.backendService.findFirst({ where: { id, userId } });
    if (!existing) return reply.code(404).send({ error: "Service not found" });

    try {
      // 1. Cleanup Docker Container
      const Docker = (await import("dockerode")).default;
      const docker = new Docker({ socketPath: "/var/run/docker.sock" });
      const allContainers = await docker.listContainers({ all: true }).catch(() => []);
      const matches = allContainers.filter(c =>
        c.Names?.some(n => n === `/service-${existing.slug}` || n.startsWith(`/service-${existing.slug}-`)) ||
        c.Labels?.["serviceId"] === id
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

      // 2. Clear Edge Router Cache
      await redisClient.del(`deployment:${existing.slug}`);
    } catch (cleanupErr) {
      console.error(`Failed to cleanup docker/redis for service ${existing.slug}`, cleanupErr);
    }

    // 3. Database Deletion (Cascades to Deployments & EnvVars)
    await prisma.backendService.delete({ where: { id } });
    return reply.code(204).send();
  });

  // POST /api/services/:id/deploy
  fastify.post("/:id/deploy", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;

    const service = await prisma.backendService.findFirst({ where: { id, userId } });
    if (!service) return reply.code(404).send({ error: "Service not found" });

    const inProgress = await prisma.serviceDeployment.findFirst({
      where: { serviceId: id, status: { in: ["QUEUED", "BUILDING"] } },
    });
    if (inProgress) {
      return reply.code(409).send({ error: "A deployment is already in progress", deployment: inProgress });
    }

    const deployment = await prisma.serviceDeployment.create({
      data: {
        serviceId: id,
        commitHash: "manual",
        commitMessage: "Manual deploy",
        branch: service.branch,
        status: "QUEUED",
      },
    });

    const repoUrl = await getAuthenticatedGitUrl(service.githubRepoUrl, userId);

    await serviceQueue.add("service-build", {
      deploymentId: deployment.id,
      serviceId: service.id,
      repoUrl,
      branch: service.branch,
      language: service.language,
      rootDir: service.rootDir,
      installCommand: service.installCommand,
      startCommand: service.startCommand,
      internalPort: service.internalPort,
      slug: service.slug,
      autoSleep: service.autoSleep,
      instanceType: service.instanceType,
      cpuLimit: service.cpuLimit,
      memoryLimit: service.memoryLimit,
    });

    return reply.code(201).send(deployment);
  });

  // POST /api/services/:id/deploy/upload
  // Direct tarball upload from IDE / CLI without requiring GitHub
  fastify.post("/:id/deploy/upload", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;

    const service = await prisma.backendService.findFirst({ where: { id, userId } });
    if (!service) return reply.code(404).send({ error: "Service not found" });

    const inProgress = await prisma.serviceDeployment.findFirst({
      where: { serviceId: id, status: { in: ["QUEUED", "BUILDING"] } },
    });
    if (inProgress) {
      return reply.code(409).send({ error: "A deployment is already in progress", deployment: inProgress });
    }

    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: "No archive file uploaded. Send as multipart/form-data field 'file'." });
    }

    const buffer = await data.toBuffer();
    if (buffer.length === 0) {
      return reply.code(400).send({ error: "Uploaded archive is empty." });
    }

    const deployment = await prisma.serviceDeployment.create({
      data: {
        serviceId: id,
        commitHash: "direct",
        commitMessage: "Direct IDE upload",
        branch: "main",
        status: "QUEUED",
        uploadType: "direct",
      },
    });

    // Save base64 payload in Redis with 15m TTL
    await redisClient.set(`upload:${deployment.id}`, buffer.toString("base64"), "EX", 900);

    await serviceQueue.add("service-build", {
      deploymentId: deployment.id,
      serviceId: service.id,
      repoUrl: "direct-upload",
      branch: "main",
      language: service.language,
      rootDir: service.rootDir,
      installCommand: service.installCommand,
      startCommand: service.startCommand,
      internalPort: service.internalPort,
      slug: service.slug,
      autoSleep: service.autoSleep,
      instanceType: service.instanceType,
      cpuLimit: service.cpuLimit,
      memoryLimit: service.memoryLimit,
      isDirectUpload: true,
    } as any);

    return reply.code(201).send(deployment);
  });

  // ─── Environment Variables ───────────────────────────────────────────────────

  const EnvSchema = z.object({
    key: z.string().min(1).regex(/^[A-Z0-9_]+$/, "Keys must be uppercase with underscores"),
    value: z.string(),
    isSecret: z.boolean().default(true),
  });

  // GET /api/services/:id/env
  fastify.get("/:id/env", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;
    const service = await prisma.backendService.findFirst({ where: { id, userId } });
    if (!service) return reply.code(404).send({ error: "Service not found" });

    const vars = await prisma.serviceEnvVariable.findMany({ where: { serviceId: id } });
    const { decrypt } = await import("../lib/crypto.js");

    return vars.map(v => ({
      id: v.id,
      key: v.key,
      value: v.isSecret ? "***" : decrypt(v.value),
      isSecret: v.isSecret,
      createdAt: v.createdAt,
    }));
  });

  // POST /api/services/:id/env
  fastify.post("/:id/env", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;
    const body = EnvSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const service = await prisma.backendService.findFirst({ where: { id, userId } });
    if (!service) return reply.code(404).send({ error: "Service not found" });

    const { encrypt } = await import("../lib/crypto.js");
    const encryptedValue = encrypt(body.data.value);

    const envVar = await prisma.serviceEnvVariable.upsert({
      where: { serviceId_key: { serviceId: id, key: body.data.key } },
      update: { value: encryptedValue, isSecret: body.data.isSecret },
      create: { serviceId: id, key: body.data.key, value: encryptedValue, isSecret: body.data.isSecret },
    });

    return reply.code(201).send({ id: envVar.id, key: envVar.key, isSecret: envVar.isSecret });
  });

  // DELETE /api/services/:id/env/:key
  fastify.delete("/:id/env/:key", async (request, reply) => {
    const { id, key } = request.params as { id: string; key: string };
    const { userId } = request.user;
    const service = await prisma.backendService.findFirst({ where: { id, userId } });
    if (!service) return reply.code(404).send({ error: "Service not found" });

    await prisma.serviceEnvVariable.deleteMany({ where: { serviceId: id, key } });
    return reply.code(204).send();
  });

  // GET /api/services/deployments/:dId
  fastify.get("/deployments/:dId", async (request, reply) => {
    const { dId } = request.params as { dId: string };
    const { userId } = request.user;
    const deployment = await prisma.serviceDeployment.findUnique({ where: { id: dId } });
    if (!deployment) return reply.code(404).send({ error: "Deployment not found" });

    const service = await prisma.backendService.findUnique({ where: { id: deployment.serviceId } });
    if (!service || service.userId !== userId) return reply.code(404).send({ error: "Not found" });

    return reply.send(deployment);
  });

  // GET /api/services/deployments/:dId/logs — SSE (token auth)
  fastify.get("/deployments/:dId/logs", async (request, reply) => {
    const { dId } = request.params as { dId: string };
    const { token, live } = request.query as { token?: string; live?: string };
    const isLiveRequested = live === "true";

    if (!token) return reply.code(401).send({ error: "Missing token" });
    try {
      await request.jwtVerify({ onlyCookie: false });
    } catch {
      try {
        fastify.jwt.verify(token);
      } catch {
        return reply.code(401).send({ error: "Invalid token" });
      }
    }

    const channel = `logs:${dId}`;
    const listKey = `build-logs:${dId}`;

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    });

    const sendEvent = (line: string) => {
      reply.raw.write(`data: ${JSON.stringify({ log: line })}\n\n`);
    };

    const stored = await redisClient.lrange(listKey, 0, -1);
    // Send historical logs but omit the raw __DONE__ marker so client doesn't prematurely disconnect
    for (const line of stored) {
      if (line !== "__DONE__") sendEvent(line);
    }

    const deployment = await prisma.serviceDeployment.findUnique({ where: { id: dId } });

    // If deployment definitively failed or was cancelled, end the stream immediately
    if (deployment && ["FAILED", "CANCELLED"].includes(deployment.status)) {
      sendEvent("__DONE__");
      reply.raw.end();
      return;
    }

    // If live tail was NOT requested AND the deployment is already READY and older than 30s:
    // end immediately (user only requested static historical logs)
    if (
      !isLiveRequested &&
      deployment?.status === "READY" &&
      deployment.buildFinishedAt &&
      Date.now() - new Date(deployment.buildFinishedAt).getTime() > 30000
    ) {
      sendEvent("__DONE__");
      reply.raw.end();
      return;
    }

    const sub = redisSub.duplicate();
    await sub.subscribe(channel);

    sub.on("message", (_ch: string, message: string) => {
      if (message === "__DONE__") {
        // If client requested continuous live tailing, do NOT terminate the connection!
        // The service container is still alive and will output runtime logs on requests/wakeups.
        if (!isLiveRequested) {
          sendEvent("__DONE__");
          sub.unsubscribe(channel).catch(() => {});
          sub.quit().catch(() => {});
          reply.raw.end();
        }
      } else {
        sendEvent(message);
      }
    });

    request.raw.on("close", () => {
      sub.unsubscribe(channel).catch(() => {});
      sub.quit().catch(() => {});
    });
  });

  // GET /api/services/:id/metrics — Snapshot & recent history
  fastify.get("/:id/metrics", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;

    const service = await prisma.backendService.findFirst({ where: { id, userId } });
    if (!service) return reply.code(404).send({ error: "Service not found" });

    // Retrieve recent history from Redis (last 60 points)
    const rawHistory = await redisClient.lrange(`metrics:service:${id}`, 0, 59).catch(() => []);
    const history = rawHistory
      .map((item) => {
        try {
          return JSON.parse(item);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();

    const activeDeployment = await prisma.serviceDeployment.findFirst({
      where: { serviceId: id, status: "READY" },
      orderBy: { createdAt: "desc" },
    });

    if (!activeDeployment) {
      return reply.send({
        container: null,
        status: "stopped",
        current: history.length > 0 ? history[history.length - 1] : null,
        history,
      });
    }

    // 1. Check Redis for active container status pushed by VM worker
    const rawStatus = await redisClient.get(`service:status:${id}`).catch(() => null);
    if (rawStatus) {
      try {
        const statusData = JSON.parse(rawStatus);
        if (statusData.status === "running") {
          return reply.send({
            container: statusData.container || `service-${service.slug}`,
            status: "running",
            current: history.length > 0 ? history[history.length - 1] : null,
            history,
          });
        }
      } catch {}
    }

    // 2. If recent metric exists in history (< 60s old), the VM worker is actively reporting it
    if (history.length > 0) {
      const latest = history[history.length - 1];
      const ageMs = Date.now() - new Date(latest.timestamp).getTime();
      if (ageMs < 60_000) {
        return reply.send({
          container: `service-${service.slug}`,
          status: "running",
          current: latest,
          history,
        });
      }
    }

    // 3. Fallback to local Docker (if running locally)
    try {
      const Docker = (await import("dockerode")).default;
      const docker = new Docker({ socketPath: "/var/run/docker.sock" });
      const allContainers = await docker.listContainers({ all: true }).catch(() => []);

      const shortId = activeDeployment.id.slice(0, 8);
      const target = allContainers.find(
        (c) =>
          (c.Names?.some((n) => n === `/service-${service.slug}-${shortId}` || n === `/service-${service.slug}`) ||
            (c.Labels?.["serviceId"] === service.id && c.Labels?.["deploymentId"] === activeDeployment.id))
      );

      if (target && target.State === "running") {
        const container = docker.getContainer(target.Id);
        const stats = await container.stats({ stream: false });
        const { metric } = parseDockerStats(stats);
        const containerName = target.Names?.[0]?.replace(/^\//, "") || `service-${service.slug}-${shortId}`;

        return reply.send({
          container: containerName,
          status: "running",
          current: metric,
          history: history.length > 0 ? history : [metric],
        });
      }
    } catch {}

    // 4. If neither reports running, mark as sleeping
    return reply.send({
      container: null,
      status: "sleeping",
      current: history.length > 0 ? history[history.length - 1] : null,
      history,
    });
  });

  // GET /api/services/:id/metrics/stream — Real-Time Resource Metrics SSE (1.5s interval)
  fastify.get("/:id/metrics/stream", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { token } = request.query as { token?: string };

    let userId: string;
    if (token) {
      try {
        const decoded = fastify.jwt.verify(token) as any;
        userId = decoded.userId;
      } catch {
        return reply.code(401).send({ error: "Invalid token" });
      }
    } else if ((request as any).user?.userId) {
      userId = (request as any).user.userId;
    } else {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const service = await prisma.backendService.findFirst({ where: { id, userId } });
    if (!service) return reply.code(404).send({ error: "Service not found" });

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    });

    const sendEvent = (data: any) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Load initial history from Redis
    const rawHistory = await redisClient.lrange(`metrics:service:${id}`, 0, 59).catch(() => []);
    const history = rawHistory
      .map((item) => {
        try {
          return JSON.parse(item);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();

    const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
    const sub = new Redis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
    sub.on("error", () => {});

    let isClosed = false;

    // Send initial snapshot event
    sendEvent({
      type: "init",
      history,
      current: history.length > 0 ? history[history.length - 1] : null,
      slug: service.slug,
    });

    // Subscribe to live metrics ticks from VM worker
    await sub.subscribe(`metrics:tick:${id}`).catch(() => {});

    let lastTickAt = Date.now();
    sub.on("message", (channel, message) => {
      if (channel === `metrics:tick:${id}` && !isClosed) {
        try {
          const payload = JSON.parse(message);
          lastTickAt = Date.now();
          sendEvent({
            type: "tick",
            status: payload.status || "running",
            container: payload.container,
            metric: payload.metric,
          });
        } catch {}
      }
    });

    // Periodic check to detect sleep/inactive state
    const interval = setInterval(async () => {
      if (isClosed) return;
      const rawStatus = await redisClient.get(`service:status:${id}`).catch(() => null);
      if (!rawStatus && Date.now() - lastTickAt > 15_000) {
        sendEvent({
          type: "status",
          status: "sleeping",
          message: "Service container is sleeping. Send a web request to wake it up."
        });
      }
    }, 5000);

    request.raw.on("close", () => {
      isClosed = true;
      clearInterval(interval);
      sub.unsubscribe().catch(() => {});
      sub.quit().catch(() => {});
    });
  });

  // ─── Web Shell Exec (docker exec via WebSocket) ───────────────────────────
  fastify.get("/:id/exec", { websocket: true }, async (connection: any, request: any) => {
    const socket = connection?.socket || connection;
    const { id } = request.params as { id: string };

    // 1. Authenticate via token query parameter
    const token = (request.query as any)?.token;
    if (!token) {
      socket.send(JSON.stringify({ type: "error", message: "Unauthorized: Missing authentication token." }));
      socket.close(4001, "Unauthorized");
      return;
    }

    let userId: string;
    try {
      const decoded = fastify.jwt.verify(token) as any;
      userId = decoded.userId;
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "Unauthorized: Invalid or expired token." }));
      socket.close(4001, "Unauthorized");
      return;
    }

    // 2. Strict Service Ownership Check (User's own service ONLY)
    const service = await prisma.backendService.findFirst({
      where: { id, userId },
    });
    if (!service) {
      socket.send(JSON.stringify({
        type: "error",
        message: "Forbidden: Backend service not found or does not belong to your account."
      }));
      socket.close(4003, "Forbidden");
      return;
    }

    // 3. Strict Target Container Resolution (Active READY container ONLY)
    const activeDeployment = await prisma.serviceDeployment.findFirst({
      where: { serviceId: service.id, status: "READY" },
      orderBy: { createdAt: "desc" },
    });

    if (!activeDeployment) {
      socket.send(JSON.stringify({
        type: "error",
        message: "No active running deployment found for this service. Please deploy the service first."
      }));
      socket.close(4004, "No active deployment");
      return;
    }

    const cols = Math.max(20, Math.min(300, Number((request.query as any)?.cols) || 100));
    const rows = Math.max(5, Math.min(100, Number((request.query as any)?.rows) || 24));

    // Check if local Docker has the container (e.g. during local development)
    let localTarget: any = null;
    let localDocker: any = null;
    try {
      const Docker = (await import("dockerode")).default;
      localDocker = new Docker({ socketPath: "/var/run/docker.sock" });
      const allContainers = await localDocker.listContainers({ all: true }).catch(() => []);
      const shortId = activeDeployment.id.slice(0, 8);
      localTarget = allContainers.find((c: any) =>
        c.State === "running" &&
        (
          c.Names?.some((n: string) => n === `/service-${service.slug}-${shortId}` || n === `/service-${service.slug}`) ||
          (c.Labels?.["serviceId"] === service.id && c.Labels?.["deploymentId"] === activeDeployment.id)
        )
      );
    } catch {}

    if (localTarget && localDocker) {
      // 4a. Local Docker Exec Session
      try {
        const container = localDocker.getContainer(localTarget.Id);
        const shortId = activeDeployment.id.slice(0, 8);
        const containerName = localTarget.Names?.[0]?.replace(/^\//, "") || `service-${service.slug}-${shortId}`;
        const cleanRoot = (service.rootDir || ".").replace(/^\/+|\/+$/g, "");
        const workingDir = cleanRoot && cleanRoot !== "." ? `/app/${cleanRoot}` : "/app";

        const exec = await container.exec({
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          ConsoleSize: [rows, cols],
          Cmd: ["sh", "-c", "if [ -x /bin/bash ]; then exec /bin/bash; elif [ -x /bin/sh ]; then exec /bin/sh; else exec sh; fi"],
          WorkingDir: workingDir,
          Env: ["TERM=xterm-256color", "COLORTERM=truecolor"],
        });

        const stream = await exec.start({
          hijack: true,
          stdin: true,
          Tty: true,
        });

        socket.send(JSON.stringify({
          type: "connected",
          container: containerName,
          workingDir,
          slug: service.slug,
        }));

        stream.on("data", (chunk: Buffer) => {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({ type: "output", data: chunk.toString("utf8") }));
          }
        });

        let lineBuffer = "";

        socket.on("message", async (raw: any) => {
          try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === "input" && typeof msg.data === "string") {
              const data: string = msg.data;
              if (data.includes("\r") || data.includes("\n")) {
                const fullCommand = (lineBuffer + data.replace(/[\r\n]/g, "")).trim();
                lineBuffer = "";
                if (fullCommand) {
                  const securityCheck = evaluateCommandSecurity(fullCommand);
                  if (!securityCheck.allowed && securityCheck.rule) {
                    stream.write("\x03");
                    const alertBanner =
                      `\r\n\x1b[1;31m🚨 [SECURITY POLICY] Action Blocked: ${securityCheck.rule.name}\x1b[0m\r\n` +
                      `\x1b[33mReason: ${securityCheck.rule.reason}\x1b[0m\r\n` +
                      `\x1b[90mCommand attempted: ${fullCommand}\x1b[0m\r\n\r\n`;
                    if (socket.readyState === 1) {
                      socket.send(JSON.stringify({ type: "output", data: alertBanner }));
                    }
                    return;
                  }
                }
                stream.write(data);
                return;
              }
              if (data === "\x7f" || data === "\x08") {
                lineBuffer = lineBuffer.slice(0, -1);
                stream.write(data);
                return;
              }
              if (data === "\x03" || data === "\x15") {
                lineBuffer = "";
                stream.write(data);
                return;
              }
              if (!data.startsWith("\x1b")) lineBuffer += data;
              stream.write(data);
            } else if (msg.type === "resize" && typeof msg.cols === "number" && typeof msg.rows === "number") {
              await exec.resize({ w: msg.cols, h: msg.rows }).catch(() => {});
            }
          } catch {
            stream.write(raw.toString());
          }
        });

        const cleanup = () => {
          try { stream.destroy(); } catch {}
        };
        stream.on("end", () => {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({ type: "exit", message: "Process exited." }));
            socket.close(1000, "Process exited");
          }
        });
        socket.on("close", cleanup);
        socket.on("error", cleanup);
        return;
      } catch (execErr: any) {
        // Fall back to remote bridge
      }
    }

    // 4b. Remote Exec Bridge to Azure VM Worker via Redis Pub/Sub
    const sessionId = `exec_${randomUUID()}`;
    const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
    const sessionSub = new Redis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
    sessionSub.on("error", () => {});

    let isSessionActive = true;
    let lineBuffer = "";

    const cleanupBridge = async () => {
      if (!isSessionActive) return;
      isSessionActive = false;
      await redisClient.publish(`exec:close:${sessionId}`, "1").catch(() => {});
      try {
        await sessionSub.unsubscribe();
        await sessionSub.quit();
      } catch {}
    };

    await sessionSub.subscribe(
      `exec:ready:${sessionId}`,
      `exec:out:${sessionId}`,
      `exec:error:${sessionId}`,
      `exec:exit:${sessionId}`
    );

    const timeoutTimer = setTimeout(() => {
      if (isSessionActive) {
        socket.send(JSON.stringify({
          type: "error",
          message: `Connection timeout: Build worker did not respond. If the container is sleeping, wake it up first.`
        }));
        socket.close(4004, "Worker timeout");
        cleanupBridge();
      }
    }, 12_000);

    sessionSub.on("message", (subChan, subMsg) => {
      if (!isSessionActive) return;

      if (subChan === `exec:ready:${sessionId}`) {
        clearTimeout(timeoutTimer);
        try {
          const data = JSON.parse(subMsg);
          socket.send(JSON.stringify({
            type: "connected",
            container: data.container,
            workingDir: data.workingDir,
            slug: service.slug,
          }));
        } catch {}
      } else if (subChan === `exec:out:${sessionId}`) {
        try {
          const text = Buffer.from(subMsg, "base64").toString("utf8");
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({ type: "output", data: text }));
          }
        } catch {}
      } else if (subChan === `exec:exit:${sessionId}`) {
        clearTimeout(timeoutTimer);
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: "exit" }));
          socket.close(1000, "Process exited");
        }
        cleanupBridge();
      } else if (subChan === `exec:error:${sessionId}`) {
        clearTimeout(timeoutTimer);
        try {
          const errData = JSON.parse(subMsg);
          socket.send(JSON.stringify({
            type: "error",
            message: errData.error || "Failed to start exec session on VM",
          }));
        } catch {
          socket.send(JSON.stringify({ type: "error", message: subMsg }));
        }
        socket.close(4004, "Exec error");
        cleanupBridge();
      }
    });

    socket.on("message", async (raw: any) => {
      if (!isSessionActive) return;
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "input" && typeof msg.data === "string") {
          const data: string = msg.data;

          if (data.includes("\r") || data.includes("\n")) {
            const fullCommand = (lineBuffer + data.replace(/[\r\n]/g, "")).trim();
            lineBuffer = "";

            if (fullCommand) {
              const securityCheck = evaluateCommandSecurity(fullCommand);
              if (!securityCheck.allowed && securityCheck.rule) {
                await redisClient.publish(`exec:in:${sessionId}`, Buffer.from("\x03").toString("base64")).catch(() => {});

                const alertBanner =
                  `\r\n\x1b[1;31m🚨 [SECURITY POLICY] Action Blocked: ${securityCheck.rule.name}\x1b[0m\r\n` +
                  `\x1b[33mReason: ${securityCheck.rule.reason}\x1b[0m\r\n` +
                  `\x1b[90mCommand attempted: ${fullCommand}\x1b[0m\r\n\r\n`;

                if (socket.readyState === 1) {
                  socket.send(JSON.stringify({ type: "output", data: alertBanner }));
                }
                fastify.log.warn(`[Security Guardrail] Blocked restricted command on service "${service.slug}": "${fullCommand}"`);
                return;
              }
            }
          } else if (data === "\x7f" || data === "\x08") {
            lineBuffer = lineBuffer.slice(0, -1);
          } else if (data === "\x03" || data === "\x15") {
            lineBuffer = "";
          } else if (!data.startsWith("\x1b")) {
            lineBuffer += data;
            if (lineBuffer.length > 2048) lineBuffer = lineBuffer.slice(-2048);
          }

          await redisClient.publish(`exec:in:${sessionId}`, Buffer.from(data).toString("base64")).catch(() => {});
        } else if (msg.type === "resize" && typeof msg.cols === "number" && typeof msg.rows === "number") {
          const rCols = Math.max(20, Math.min(300, msg.cols));
          const rRows = Math.max(5, Math.min(100, msg.rows));
          await redisClient.publish(`exec:resize:${sessionId}`, JSON.stringify({ cols: rCols, rows: rRows })).catch(() => {});
        }
      } catch {}
    });

    socket.on("close", () => {
      clearTimeout(timeoutTimer);
      cleanupBridge();
    });

    socket.on("error", () => {
      clearTimeout(timeoutTimer);
      cleanupBridge();
    });

    // Send open session request to Azure VM Worker
    await redisClient.publish("exec:open", JSON.stringify({
      sessionId,
      serviceId: service.id,
      deploymentId: activeDeployment.id,
      slug: service.slug,
      rootDir: service.rootDir,
      cols,
      rows,
    }));
  });

  // ─── Private Service Mesh & Service Discovery ─────────────────────────────

  // GET /api/services/mesh/catalog
  fastify.get("/mesh/catalog", async (request) => {
    const { userId } = request.user;
    const services = await prisma.backendService.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      include: {
        deployments: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const Docker = (await import("dockerode")).default;
    const docker = new Docker({ socketPath: "/var/run/docker.sock" });
    const allContainers = await docker.listContainers({ all: true }).catch(() => []);

    const catalog = services.map((s) => {
      const latestDeploy = s.deployments[0];
      const match = allContainers.find((c) =>
        c.Names?.some((n) =>
          n === `/service-${s.slug}-${latestDeploy?.id?.slice(0, 8)}` ||
          n === `/service-${s.slug}` ||
          (n.startsWith(`/service-${s.slug}-`) && c.Labels?.["serviceId"] === s.id)
        )
      );

      const isRunning = match && match.State === "running";
      let status: "running" | "sleeping" | "stopped" = "stopped";
      if (isRunning) {
        status = "running";
      } else if (s.autoSleep && latestDeploy?.status === "READY") {
        status = "sleeping";
      }

      const meshNetwork = "whizan-internal-network";
      const networkConfig = match?.NetworkSettings?.Networks?.[meshNetwork];
      const ipAddress = networkConfig?.IPAddress || null;

      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        internalPort: s.internalPort,
        internalUrl: `http://${s.slug}:${s.internalPort}`,
        networkAlias: s.slug,
        meshNetwork,
        status,
        ipAddress,
        isPublic: s.isPublic,
        autoSleep: s.autoSleep,
        instanceType: s.instanceType,
        cpuLimit: s.cpuLimit,
        memoryLimit: s.memoryLimit,
      };
    });

    return catalog;
  });

  // POST /api/services/mesh/ping
  const MeshPingSchema = z.object({
    targetSlug: z.string().min(1),
    targetPort: z.number().int().positive().default(8000),
    path: z.string().default("/"),
  });

  fastify.post("/mesh/ping", async (request, reply) => {
    const parseResult = MeshPingSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues[0]?.message });
    }

    const { targetSlug, targetPort, path: rawPath } = parseResult.data;
    const cleanPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
    const targetUrl = `http://${targetSlug}:${targetPort}${cleanPath}`;
    const meshNetwork = "whizan-internal-network";

    const Docker = (await import("dockerode")).default;
    const { PassThrough } = await import("stream");
    const docker = new Docker({ socketPath: "/var/run/docker.sock" });

    // Check if the target container exists and whether it is running or sleeping
    const allContainers = await docker.listContainers({ all: true }).catch(() => []);
    const targetContainer = allContainers.find((c) =>
      c.Names?.some((n) => n === `/service-${targetSlug}` || n.startsWith(`/service-${targetSlug}-`)) ||
      c.Labels?.["slug"] === targetSlug
    );

    if (targetContainer && targetContainer.State !== "running") {
      return reply.send({
        success: false,
        targetUrl,
        targetSlug,
        targetPort,
        statusCode: 0,
        latencyMs: 0,
        resolvedIp: "",
        dnsOk: false,
        timeDnsMs: 0,
        timeConnectMs: 0,
        headers: {},
        bodyPreview: "",
        errorMessage: `Target service "${targetSlug}" is currently asleep (scale-to-zero) or stopped. Send traffic to its endpoint or trigger wake-up to activate it.`,
        network: meshNetwork,
      });
    }

    const stream = new PassThrough();
    let rawOutput = "";
    stream.on("data", (chunk) => {
      rawOutput += chunk.toString();
    });

    try {
      const [res] = await docker.run(
        "curlimages/curl:latest",
        [
          "-s",
          "-i",
          "-w",
          "\n---HOSTIFY_PING_STATS---\nHTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}\nREMOTE_IP:%{remote_ip}\nTIME_NAMELOOKUP:%{time_namelookup}\nTIME_CONNECT:%{time_connect}\n",
          "-m",
          "5",
          targetUrl,
        ],
        stream,
        {
          HostConfig: {
            NetworkMode: meshNetwork,
            AutoRemove: true,
          },
        }
      );

      const cleanOutput = rawOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\r/g, "");
      const parts = cleanOutput.split("---HOSTIFY_PING_STATS---");
      const httpPayload = parts[0]?.trim() || "";
      const statsBlock = parts[1]?.trim() || "";

      // Parse stats
      const getStat = (key: string) => {
        const match = statsBlock.match(new RegExp(`${key}:([^\n]+)`));
        return match ? match[1].trim() : "";
      };

      const httpCodeStr = getStat("HTTP_CODE");
      const timeTotalStr = getStat("TIME_TOTAL");
      const remoteIp = getStat("REMOTE_IP");
      const timeDnsStr = getStat("TIME_NAMELOOKUP");
      const timeConnectStr = getStat("TIME_CONNECT");

      const statusCode = parseInt(httpCodeStr, 10) || 0;
      const latencyMs = Math.round((parseFloat(timeTotalStr) || 0) * 1000);
      const timeDnsMs = Number(((parseFloat(timeDnsStr) || 0) * 1000).toFixed(1));
      const timeConnectMs = Number(((parseFloat(timeConnectStr) || 0) * 1000).toFixed(1));

      // Parse headers and body
      const [headerSection, ...bodyParts] = httpPayload.split(/\n\n/);
      const body = bodyParts.join("\n\n");
      const headers: Record<string, string> = {};

      if (headerSection) {
        const lines = headerSection.split(/\n/);
        for (const line of lines.slice(1)) {
          const colonIdx = line.indexOf(":");
          if (colonIdx > 0) {
            const hKey = line.slice(0, colonIdx).trim().toLowerCase();
            const hVal = line.slice(colonIdx + 1).trim();
            headers[hKey] = hVal;
          }
        }
      }

      let errorMessage: string | undefined;
      const exitCode = res.StatusCode;

      if (exitCode === 6) {
        errorMessage = `Could not resolve host "${targetSlug}" on internal DNS (127.0.0.11). Ensure the container is attached to ${meshNetwork}.`;
      } else if (exitCode === 7) {
        errorMessage = `Connection refused at ${targetSlug}:${targetPort}. The host exists, but nothing is accepting connections on port ${targetPort}.`;
      } else if (exitCode === 28) {
        errorMessage = `Connection timed out after 5000ms. Service took too long to respond.`;
      } else if (statusCode === 0 && exitCode !== 0) {
        errorMessage = `Internal probe exited with code ${exitCode}.`;
      }

      const success = (exitCode === 0 && statusCode > 0);

      return reply.send({
        success,
        targetUrl,
        targetSlug,
        targetPort,
        statusCode,
        latencyMs,
        resolvedIp: remoteIp || "",
        dnsOk: Boolean(remoteIp),
        timeDnsMs,
        timeConnectMs,
        headers,
        bodyPreview: body.slice(0, 300).trim(),
        errorMessage,
        network: meshNetwork,
      });

    } catch (runErr: any) {
      console.error("[Mesh Ping] Docker probe failed:", runErr);
      return reply.status(500).send({
        success: false,
        targetUrl,
        targetSlug,
        targetPort,
        statusCode: 0,
        latencyMs: 0,
        resolvedIp: "",
        dnsOk: false,
        timeDnsMs: 0,
        timeConnectMs: 0,
        headers: {},
        bodyPreview: "",
        errorMessage: `Mesh ping failed to execute: ${runErr.message}`,
        network: meshNetwork,
      });
    }
  });
}

