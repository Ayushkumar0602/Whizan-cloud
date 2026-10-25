import type { FastifyInstance } from "fastify";
import { z } from "zod";
import cronParser from "cron-parser";
import { prisma } from "../lib/prisma.js";
import { redisClient, redisSub } from "../lib/redis.js";

const INTERNAL_MESH_TOKEN = process.env.INTERNAL_MESH_TOKEN || "whizan_mesh_sec_2026_x89q";

function isAuthorizedMeshToken(token?: string | null): boolean {
  if (!token) return false;
  const validTokens = [
    INTERNAL_MESH_TOKEN,
    "whizan_mesh_sec_2026_x89q",
    process.env.INTERNAL_SECRET,
    process.env.JWT_SECRET,
  ].filter(Boolean);
  return validTokens.includes(token);
}

function normalizeTargetConfig(val: unknown): unknown {
  if (!val || typeof val !== "object") return val;
  const obj = { ...(val as Record<string, any>) };
  const rawType = obj.targetType || obj.type || obj.pipeline;
  if (!rawType || typeof rawType !== "string") return val;

  const type = rawType.toUpperCase();
  obj.targetType = type;

  if (type === "FUNCTION") {
    obj.serviceId = obj.serviceId || obj.functionId || obj.id;
    obj.endpointPath = obj.endpointPath || obj.endpoint || obj.path || "/";
    obj.method = (obj.method || "POST").toUpperCase();
  } else if (type === "SERVICE") {
    obj.serviceId = obj.serviceId || obj.id;
    obj.routePath = obj.routePath || obj.path || obj.endpoint || "/";
    obj.method = (obj.method || "POST").toUpperCase();
  } else if (type === "PROJECT") {
    obj.projectId = obj.projectId || obj.id;
    obj.routePath = obj.routePath || obj.path || "/";
    obj.method = (obj.method || "GET").toUpperCase();
  } else if (type === "CONTAINER_EXEC") {
    obj.serviceId = obj.serviceId || obj.id;
    obj.command = obj.command || obj.cmd || "echo 'cron'";
  } else if (type === "WEBHOOK") {
    obj.url = obj.url || obj.target || obj.targetVal;
    obj.method = (obj.method || "POST").toUpperCase();
  }

  return obj;
}

// Zod schemas for Cron creation & updates
const TargetConfigSchema = z.preprocess(
  normalizeTargetConfig,
  z.discriminatedUnion("targetType", [
    z.object({
      targetType: z.literal("FUNCTION"),
      serviceId: z.string().min(1, "serviceId or functionId is required"),
      endpointPath: z.string().default("/"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
      headers: z.record(z.string()).optional(),
      payload: z.any().optional(),
    }),
    z.object({
      targetType: z.literal("PROJECT"),
      projectId: z.string().min(1, "projectId is required"),
      projectSlug: z.string().optional(),
      routePath: z.string().default("/"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
      headers: z.record(z.string()).optional(),
      payload: z.any().optional(),
    }),
    z.object({
      targetType: z.literal("SERVICE"),
      serviceId: z.string().min(1, "serviceId is required"),
      serviceSlug: z.string().optional(),
      routePath: z.string().default("/"),
      port: z.number().int().positive().optional(),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
      headers: z.record(z.string()).optional(),
      payload: z.any().optional(),
    }),
    z.object({
      targetType: z.literal("CONTAINER_EXEC"),
      serviceId: z.string().min(1, "serviceId is required"),
      command: z.union([z.string(), z.array(z.string())]),
      workDir: z.string().optional(),
      user: z.string().optional(),
    }),
    z.object({
      targetType: z.literal("WEBHOOK"),
      url: z.string().url("Valid target URL is required"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
      headers: z.record(z.string()).optional(),
      body: z.any().optional(),
    }),
  ])
);

const CreateCronJobSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  schedule: z.string().min(1).refine((val) => {
    try {
      cronParser.parseExpression(val);
      return true;
    } catch {
      return false;
    }
  }, { message: "Invalid cron expression. Must follow standard 5-part format, e.g. '0 0 * * *' or '*/15 * * * *'" }),
  timezone: z.string().default("UTC").refine((tz) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, { message: "Invalid IANA timezone identifier (e.g. 'America/New_York', 'Asia/Kolkata', 'UTC')" }),
  target: TargetConfigSchema,
  misfirePolicy: z.enum(["SKIP", "FIRE_LATEST_ONCE", "CATCH_UP_ALL"]).default("SKIP"),
  concurrencyPolicy: z.enum(["FORBID", "ALLOW", "REPLACE", "QUEUE_SERIALIZE"]).default("FORBID"),
  maxConcurrentRuns: z.number().int().min(1).max(20).default(1),
  timeoutSeconds: z.number().int().min(1).max(3600).default(300),
  maxRetries: z.number().int().min(0).max(10).default(3),
  retryDelaySeconds: z.number().int().min(1).max(300).default(10),
  enabled: z.boolean().default(true),
});

const UpdateCronJobSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional().nullable(),
  schedule: z.string().min(1).optional().refine((val) => {
    if (!val) return true;
    try {
      cronParser.parseExpression(val);
      return true;
    } catch {
      return false;
    }
  }, { message: "Invalid cron expression" }),
  timezone: z.string().optional().refine((tz) => {
    if (!tz) return true;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, { message: "Invalid IANA timezone identifier" }),
  target: TargetConfigSchema.optional(),
  misfirePolicy: z.enum(["SKIP", "FIRE_LATEST_ONCE", "CATCH_UP_ALL"]).optional(),
  concurrencyPolicy: z.enum(["FORBID", "ALLOW", "REPLACE", "QUEUE_SERIALIZE"]).optional(),
  maxConcurrentRuns: z.number().int().min(1).max(20).optional(),
  timeoutSeconds: z.number().int().min(1).max(3600).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  retryDelaySeconds: z.number().int().min(1).max(300).optional(),
  enabled: z.boolean().optional(),
});

function calculateNextRun(schedule: string, timezone = "UTC"): Date {
  const interval = cronParser.parseExpression(schedule, { tz: timezone });
  return interval.next().toDate();
}

async function enrichTargetConfigWithSlug(target: any): Promise<any> {
  if (!target || typeof target !== "object") return target;
  const enriched = { ...target };

  if (enriched.targetType === "SERVICE" && enriched.serviceId) {
    try {
      const svc = await prisma.backendService.findFirst({
        where: { OR: [{ id: enriched.serviceId }, { slug: enriched.serviceId }] },
        select: { id: true, slug: true, internalPort: true },
      });
      if (svc) {
        enriched.serviceSlug = svc.slug;
        if (!enriched.port && svc.internalPort) {
          enriched.port = svc.internalPort;
        }
      }
    } catch {}
  } else if (enriched.targetType === "PROJECT" && enriched.projectId) {
    try {
      const proj = await prisma.project.findFirst({
        where: { OR: [{ id: enriched.projectId }, { slug: enriched.projectId }] },
        select: { id: true, slug: true },
      });
      if (proj) {
        enriched.projectSlug = proj.slug;
      }
    } catch {}
  }

  return enriched;
}

export async function cronRoutes(app: FastifyInstance) {
  // ─── 0. RESOLVE TARGET SLUG & MESH INFO (Internal Mesh) ──────────────────────
  app.get("/resolve-target", async (request: any, reply) => {
    const meshTokenHeader = request.headers["x-mesh-token"];
    const authHeader = request.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!isAuthorizedMeshToken(meshTokenHeader) && !isAuthorizedMeshToken(bearerToken)) {
      return reply.code(403).send({ error: "Forbidden: Internal Mesh Token required" });
    }

    const { type, id } = request.query as { type?: string; id?: string };
    if (!id) {
      return reply.code(400).send({ error: "Target id is required" });
    }

    const targetType = (type || "SERVICE").toUpperCase();

    if (targetType === "SERVICE" || targetType === "CONTAINER_EXEC") {
      const svc = await prisma.backendService.findFirst({
        where: { OR: [{ id }, { slug: id }] },
        select: { id: true, slug: true, internalPort: true, name: true },
      });
      if (svc) {
        return reply.send({ ok: true, id: svc.id, slug: svc.slug, port: svc.internalPort, type: "SERVICE" });
      }
    } else if (targetType === "PROJECT") {
      const proj = await prisma.project.findFirst({
        where: { OR: [{ id }, { slug: id }] },
        select: { id: true, slug: true, name: true },
      });
      if (proj) {
        return reply.send({ ok: true, id: proj.id, slug: proj.slug, port: 3000, type: "PROJECT" });
      }
    }

    return reply.code(404).send({ error: "Target resource not found", id, type: targetType });
  });

  // ─── 1. LIST CRON JOBS ───────────────────────────────────────────────────────
  app.get("/", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const cronJobs = await prisma.cronJob.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        executions: {
          take: 5,
          orderBy: { startedAt: "desc" },
          select: {
            id: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            durationMs: true,
            exitCode: true,
            httpStatusCode: true,
            triggerType: true,
          },
        },
        _count: {
          select: { executions: true, deadLetters: true },
        },
      },
    });

    return reply.send({ ok: true, cronJobs });
  });

  // ─── 2. CREATE CRON JOB ──────────────────────────────────────────────────────
  app.post("/", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const parsed = CreateCronJobSchema.safeParse(request.body);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
      return reply.code(400).send({ error: "Validation error", message, details: parsed.error.format() });
    }

    const { target, schedule, timezone, ...rest } = parsed.data;
    const nextRunAt = rest.enabled ? calculateNextRun(schedule, timezone) : null;

    // Sanitize target config: Strip payload/body if method is GET or HEAD, and enrich with slug
    const sanitizedTarget = await enrichTargetConfigWithSlug({ ...target });
    if (sanitizedTarget.method && ["GET", "HEAD"].includes(sanitizedTarget.method.toUpperCase())) {
      delete sanitizedTarget.body;
      delete sanitizedTarget.payload;
    }

    const cronJob = await prisma.cronJob.create({
      data: {
        userId,
        name: rest.name.trim(),
        description: rest.description ? rest.description.trim() : undefined,
        schedule,
        timezone,
        targetType: sanitizedTarget.targetType,
        targetConfig: sanitizedTarget as any,
        misfirePolicy: rest.misfirePolicy,
        concurrencyPolicy: rest.concurrencyPolicy,
        maxConcurrentRuns: rest.maxConcurrentRuns,
        timeoutSeconds: rest.timeoutSeconds,
        maxRetries: rest.maxRetries,
        retryDelaySeconds: rest.retryDelaySeconds,
        enabled: rest.enabled,
        nextRunAt,
      },
    });

    // Super Resource Optimization: Push next tick to Redis Sorted Set
    if (cronJob.enabled && nextRunAt) {
      await redisClient.zadd("cron:schedule:zset", nextRunAt.getTime(), cronJob.id);
      // Cache job execution config in Redis (TTL: 24h)
      await redisClient.set(
        `cron:job:${cronJob.id}`,
        JSON.stringify(cronJob),
        "EX",
        86400
      );
      // Wake up the scheduler daemon if sleeping
      await redisClient.publish("cron:reschedule", JSON.stringify({ action: "CREATE", jobId: cronJob.id }));
    }

    return reply.code(201).send({ ok: true, cronJob });
  });

  // ─── 3. GET SINGLE CRON JOB DETAILS ──────────────────────────────────────────
  app.get("/:id", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const { id } = request.params;

    const cronJob = await prisma.cronJob.findFirst({
      where: { id, userId },
      include: {
        executions: {
          take: 20,
          orderBy: { startedAt: "desc" },
        },
        deadLetters: {
          where: { status: "UNRESOLVED" },
          take: 10,
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: { executions: true, deadLetters: true },
        },
      },
    });

    if (!cronJob) {
      return reply.code(404).send({ error: "Cron job not found" });
    }

    return reply.send({ ok: true, cronJob });
  });

  // ─── 4. UPDATE CRON JOB ──────────────────────────────────────────────────────
  app.patch("/:id", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const { id } = request.params;

    const existing = await prisma.cronJob.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.code(404).send({ error: "Cron job not found" });
    }

    const parsed = UpdateCronJobSchema.safeParse(request.body);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
      return reply.code(400).send({ error: "Validation error", message, details: parsed.error.format() });
    }

    const { target, schedule, timezone, enabled, ...rest } = parsed.data;

    const finalSchedule = schedule ?? existing.schedule;
    const finalTimezone = timezone ?? existing.timezone;
    const finalEnabled = enabled !== undefined ? enabled : existing.enabled;

    let nextRunAt = existing.nextRunAt;
    if (finalEnabled) {
      if (schedule || timezone || !existing.nextRunAt || (!existing.enabled && finalEnabled)) {
        nextRunAt = calculateNextRun(finalSchedule, finalTimezone);
      }
    } else {
      nextRunAt = null;
    }

    const updateData: any = {
      ...rest,
      name: rest.name ? rest.name.trim() : undefined,
      description: rest.description ? rest.description.trim() : undefined,
      schedule: finalSchedule,
      timezone: finalTimezone,
      enabled: finalEnabled,
      nextRunAt,
    };

    if (target) {
      const sanitizedTarget = await enrichTargetConfigWithSlug({ ...target });
      if (sanitizedTarget.method && ["GET", "HEAD"].includes(sanitizedTarget.method.toUpperCase())) {
        delete sanitizedTarget.body;
        delete sanitizedTarget.payload;
      }
      updateData.targetType = sanitizedTarget.targetType;
      updateData.targetConfig = sanitizedTarget;
    } else if (existing.targetConfig) {
      const existingConfig = await enrichTargetConfigWithSlug({ ...(existing.targetConfig as any) });
      if (existingConfig.method && ["GET", "HEAD"].includes(existingConfig.method.toUpperCase())) {
        delete existingConfig.body;
        delete existingConfig.payload;
      }
      updateData.targetConfig = existingConfig;
    }

    const updated = await prisma.cronJob.update({
      where: { id },
      data: updateData,
    });

    // Update Redis Macro-Scheduler ZSET
    if (updated.enabled && updated.nextRunAt) {
      await redisClient.zadd("cron:schedule:zset", updated.nextRunAt.getTime(), updated.id);
      await redisClient.set(`cron:job:${updated.id}`, JSON.stringify(updated), "EX", 86400);
    } else {
      await redisClient.zrem("cron:schedule:zset", updated.id);
      await redisClient.del(`cron:job:${updated.id}`);
    }

    await redisClient.publish("cron:reschedule", JSON.stringify({ action: "UPDATE", jobId: updated.id }));

    return reply.send({ ok: true, cronJob: updated });
  });

  // ─── 5. DELETE CRON JOB ──────────────────────────────────────────────────────
  app.delete("/:id", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const { id } = request.params;

    const existing = await prisma.cronJob.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      return reply.code(404).send({ error: "Cron job not found" });
    }

    // 1. Clean up Redis ZSET, cache, and reschedule event
    await redisClient.zrem("cron:schedule:zset", id);
    await redisClient.del(`cron:job:${id}`);
    await redisClient.publish("cron:reschedule", JSON.stringify({ action: "DELETE", jobId: id }));

    // 2. Delete database record only after Redis resources are cleared
    await prisma.cronJob.delete({ where: { id } });

    return reply.send({ ok: true, message: "Cron job deleted successfully" });
  });

  // ─── 6. MANUAL 1-CLICK TRIGGER ───────────────────────────────────────────────
  app.post("/:id/trigger", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const { id } = request.params;

    const cronJob = await prisma.cronJob.findFirst({
      where: { id, userId },
    });
    if (!cronJob) {
      return reply.code(404).send({ error: "Cron job not found" });
    }

    // Create execution record
    const execution = await prisma.cronExecution.create({
      data: {
        cronJobId: cronJob.id,
        triggerType: "MANUAL",
        status: "SCHEDULED",
      },
    });

    // Ensure job metadata is cached in Redis for immediate worker execution
    await redisClient.set(`cron:job:${cronJob.id}`, JSON.stringify(cronJob), "EX", 86400).catch(() => {});

    // Dispatch directly to Redis Stream for immediate worker execution
    await redisClient.xadd(
      "cron:dispatch:stream",
      "*",
      "jobId",
      cronJob.id,
      "executionId",
      execution.id,
      "triggerType",
      "MANUAL"
    );

    // Wake up daemon immediately via pub/sub
    await redisClient.publish("cron:reschedule", JSON.stringify({ action: "DISPATCH", jobId: cronJob.id, executionId: execution.id })).catch(() => {});

    return reply.code(202).send({
      ok: true,
      message: "Cron execution triggered immediately",
      executionId: execution.id,
    });
  });

  // ─── 7. PAGINATED EXECUTION HISTORY ──────────────────────────────────────────
  app.get("/:id/executions", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const { id } = request.params;
    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(request.query.limit) || 15));
    const skip = (page - 1) * limit;

    const cronJob = await prisma.cronJob.findFirst({
      where: { id, userId },
      select: { id: true, name: true },
    });
    if (!cronJob) {
      return reply.code(404).send({ error: "Cron job not found" });
    }

    const [total, executions] = await Promise.all([
      prisma.cronExecution.count({ where: { cronJobId: id } }),
      prisma.cronExecution.findMany({
        where: { cronJobId: id },
        orderBy: { startedAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return reply.send({
      ok: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      executions,
    });
  });

  // ─── 8. GET SINGLE EXECUTION DETAILS & LOGS ─────────────────────────────────
  app.get("/:id/executions/:execId", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const { id, execId } = request.params;

    const cronJob = await prisma.cronJob.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!cronJob) {
      return reply.code(404).send({ error: "Cron job not found" });
    }

    const execution = await prisma.cronExecution.findFirst({
      where: { id: execId, cronJobId: id },
    });
    if (!execution) {
      return reply.code(404).send({ error: "Execution not found" });
    }

    return reply.send({ ok: true, execution });
  });

  // ─── 9. LIVE LOG SSE STREAM ──────────────────────────────────────────────────
  app.options("/:id/executions/:execId/logs/stream", async (request: any, reply) => {
    const origin = request.headers.origin || "https://dashboard.whizan.cloud";
    return reply
      .header("Access-Control-Allow-Origin", origin)
      .header("Access-Control-Allow-Credentials", "true")
      .header("Access-Control-Allow-Methods", "GET, OPTIONS")
      .header("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept")
      .send();
  });

  app.get("/:id/executions/:execId/logs/stream", async (request: any, reply) => {
    const { execId } = request.params;
    const origin = request.headers.origin || "https://dashboard.whizan.cloud";

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
      "X-Accel-Buffering": "no",
    });

    const channel = `cron:logs:${execId}`;
    const subscriber = redisSub.duplicate();
    await subscriber.subscribe(channel);

    subscriber.on("message", (chan: string, message: string) => {
      if (chan === channel) {
        reply.raw.write(`data: ${message}\n\n`);
      }
    });

    request.raw.on("close", async () => {
      await subscriber.quit().catch(() => {});
    });
  });

  // ─── 9B. DEAD LETTER QUEUE (DLQ) MANAGEMENT ─────────────────────────────────
  app.get("/:id/dead-letters", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const { id } = request.params;

    const cronJob = await prisma.cronJob.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!cronJob) {
      return reply.code(404).send({ error: "Cron job not found" });
    }

    const deadLetters = await prisma.cronDeadLetter.findMany({
      where: { cronJobId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return reply.send({ ok: true, deadLetters });
  });

  app.post("/:id/dead-letters/:dlqId/replay", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const { id, dlqId } = request.params;

    const cronJob = await prisma.cronJob.findFirst({
      where: { id, userId },
    });
    if (!cronJob) {
      return reply.code(404).send({ error: "Cron job not found" });
    }

    const dlq = await prisma.cronDeadLetter.findFirst({
      where: { id: dlqId, cronJobId: id },
    });
    if (!dlq) {
      return reply.code(404).send({ error: "Dead letter record not found" });
    }

    const execution = await prisma.cronExecution.create({
      data: {
        cronJobId: cronJob.id,
        triggerType: "RETRY",
        status: "SCHEDULED",
      },
    });

    await prisma.cronDeadLetter.update({
      where: { id: dlqId },
      data: {
        status: "REPLAYED",
        resolvedAt: new Date(),
        retryCount: { increment: 1 },
      },
    });

    // Ensure job metadata is cached in Redis for immediate worker execution
    await redisClient.set(`cron:job:${cronJob.id}`, JSON.stringify(cronJob), "EX", 86400).catch(() => {});

    await redisClient.xadd(
      "cron:dispatch:stream",
      "*",
      "jobId",
      cronJob.id,
      "executionId",
      execution.id,
      "triggerType",
      "RETRY"
    );

    await redisClient.publish("cron:reschedule", JSON.stringify({ action: "DISPATCH", jobId: cronJob.id, executionId: execution.id })).catch(() => {});

    return reply.send({ ok: true, message: "Dead letter replayed successfully", executionId: execution.id });
  });

  app.post("/:id/dead-letters/:dlqId/discard", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const { id, dlqId } = request.params;

    const cronJob = await prisma.cronJob.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!cronJob) {
      return reply.code(404).send({ error: "Cron job not found" });
    }

    await prisma.cronDeadLetter.update({
      where: { id: dlqId },
      data: {
        status: "DISCARDED",
        resolvedAt: new Date(),
      },
    });

    return reply.send({ ok: true, message: "Dead letter marked as discarded" });
  });

  // ─── 10. SYSTEM DISASTER RECOVERY & VM REBOOT REHYDRATION (Internal) ─────────
  app.get("/sync", async (request: any, reply) => {
    const authHeader = request.headers.authorization;
    const meshTokenHeader = request.headers["x-mesh-token"];
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const isAuthorized =
      isAuthorizedMeshToken(meshTokenHeader) ||
      isAuthorizedMeshToken(bearerToken);

    if (!isAuthorized) {
      return reply.code(403).send({ error: "Forbidden: Internal Mesh Token required" });
    }

    // Fetch all active enabled cron jobs
    const activeJobs = await prisma.cronJob.findMany({
      where: { enabled: true },
      select: {
        id: true,
        schedule: true,
        timezone: true,
        nextRunAt: true,
        targetType: true,
        targetConfig: true,
        misfirePolicy: true,
        concurrencyPolicy: true,
        maxConcurrentRuns: true,
        timeoutSeconds: true,
        maxRetries: true,
        retryDelaySeconds: true,
      },
    });

    const now = Date.now();
    const pipeline = redisClient.pipeline();

    for (const job of activeJobs) {
      let nextRun = job.nextRunAt ? new Date(job.nextRunAt).getTime() : 0;
      if (!nextRun || nextRun < now) {
        try {
          nextRun = calculateNextRun(job.schedule, job.timezone).getTime();
        } catch {
          nextRun = now + 60000;
        }
      }
      pipeline.zadd("cron:schedule:zset", nextRun, job.id);
      pipeline.set(`cron:job:${job.id}`, JSON.stringify(job), "EX", 86400);
    }

    await pipeline.exec();

    return reply.send({
      ok: true,
      syncedCount: activeJobs.length,
      timestamp: now,
    });
  });

  // ─── 11. ASYNCHRONOUS BATCH TELEMETRY FLUSHER (Internal) ─────────────────────
  app.post("/telemetry/batch", async (request: any, reply) => {
    const meshTokenHeader = request.headers["x-mesh-token"];
    const authHeader = request.headers.authorization;
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!isAuthorizedMeshToken(meshTokenHeader) && !isAuthorizedMeshToken(bearerToken)) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const { executions } = request.body as { executions: any[] };
    if (!Array.isArray(executions) || executions.length === 0) {
      return reply.send({ ok: true, inserted: 0 });
    }

    // Upsert batch of executions (properly updates pre-allocated IDs from manual/replay triggers)
    for (const exec of executions) {
      const execData = {
        cronJobId: exec.cronJobId,
        triggerType: exec.triggerType || "SCHEDULED",
        status: exec.status || "SUCCESS",
        startedAt: new Date(exec.startedAt),
        finishedAt: exec.finishedAt ? new Date(exec.finishedAt) : new Date(),
        durationMs: exec.durationMs,
        exitCode: exec.exitCode,
        httpStatusCode: exec.httpStatusCode,
        errorMessage: exec.errorMessage,
        stdout: exec.stdout,
        stderr: exec.stderr,
        memoryMbPeak: exec.memoryMbPeak,
        cpuMs: exec.cpuMs,
        retryAttempt: exec.retryAttempt || 0,
      };

      await prisma.cronExecution.upsert({
        where: { id: exec.id },
        create: {
          id: exec.id,
          ...execData,
        },
        update: execData,
      }).catch(() => {});

      // Also update parent cron jobs' lastStatus and lastRunAt & record Dead Letters on failure
      await prisma.cronJob.update({
        where: { id: exec.cronJobId },
        data: {
          lastRunAt: new Date(exec.startedAt),
          lastStatus: exec.status || "SUCCESS",
        },
      }).catch(() => {});

      if (exec.status === "FAILED" || exec.status === "TIMED_OUT") {
        await prisma.cronDeadLetter.create({
          data: {
            cronJobId: exec.cronJobId,
            executionId: exec.id,
            failureReason: exec.errorMessage || `Process failed with exit code ${exec.exitCode ?? -1}`,
            status: "UNRESOLVED",
          },
        }).catch(() => {});
      }
    }

    return reply.send({ ok: true, processed: executions.length });
  });
}
