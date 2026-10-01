import type { FastifyInstance } from "fastify";
import { z } from "zod";
import cronParser from "cron-parser";
import { prisma } from "../lib/prisma.js";
import { redisClient, redisSub } from "../lib/redis.js";

const INTERNAL_MESH_TOKEN = process.env.INTERNAL_MESH_TOKEN || "whizan_mesh_sec_2026_x89q";

// Zod schemas for Cron creation & updates
const TargetConfigSchema = z.discriminatedUnion("targetType", [
  z.object({
    targetType: z.literal("FUNCTION"),
    serviceId: z.string().min(1),
    endpointPath: z.string().default("/"),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
    payload: z.any().optional(),
  }),
  z.object({
    targetType: z.literal("PROJECT"),
    projectId: z.string().min(1),
    routePath: z.string().default("/"),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
    payload: z.any().optional(),
  }),
  z.object({
    targetType: z.literal("SERVICE"),
    serviceId: z.string().min(1),
    routePath: z.string().default("/"),
    port: z.number().int().positive().optional(),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
    payload: z.any().optional(),
  }),
  z.object({
    targetType: z.literal("CONTAINER_EXEC"),
    serviceId: z.string().min(1),
    command: z.union([z.string(), z.array(z.string())]),
    workDir: z.string().optional(),
    user: z.string().optional(),
  }),
  z.object({
    targetType: z.literal("WEBHOOK"),
    url: z.string().url(),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
    headers: z.record(z.string()).optional(),
    body: z.any().optional(),
  }),
]);

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

export async function cronRoutes(app: FastifyInstance) {
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
      return reply.code(400).send({ error: "Validation error", details: parsed.error.format() });
    }

    const { target, schedule, timezone, ...rest } = parsed.data;
    const nextRunAt = rest.enabled ? calculateNextRun(schedule, timezone) : null;

    const cronJob = await prisma.cronJob.create({
      data: {
        userId,
        name: rest.name,
        description: rest.description,
        schedule,
        timezone,
        targetType: target.targetType,
        targetConfig: target as any,
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
      return reply.code(400).send({ error: "Validation error", details: parsed.error.format() });
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
      schedule: finalSchedule,
      timezone: finalTimezone,
      enabled: finalEnabled,
      nextRunAt,
    };

    if (target) {
      updateData.targetType = target.targetType;
      updateData.targetConfig = target;
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

    await prisma.cronJob.delete({ where: { id } });

    // Clean up Redis ZSET and cache
    await redisClient.zrem("cron:schedule:zset", id);
    await redisClient.del(`cron:job:${id}`);
    await redisClient.publish("cron:reschedule", JSON.stringify({ action: "DELETE", jobId: id }));

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
  app.get("/:id/executions/:execId/logs/stream", async (request: any, reply) => {
    const { execId } = request.params;

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders?.();

    const channel = `cron:logs:${execId}`;
    const onMessage = (chan: string, message: string) => {
      if (chan === channel) {
        reply.raw.write(`data: ${message}\n\n`);
      }
    };

    await redisSub.subscribe(channel);
    redisSub.on("message", onMessage);

    request.raw.on("close", async () => {
      redisSub.removeListener("message", onMessage);
      await redisSub.unsubscribe(channel).catch(() => {});
    });
  });

  // ─── 10. SYSTEM DISASTER RECOVERY & VM REBOOT REHYDRATION (Internal) ─────────
  app.get("/sync", async (request: any, reply) => {
    const authHeader = request.headers.authorization;
    const meshTokenHeader = request.headers["x-mesh-token"];
    const isAuthorized =
      meshTokenHeader === INTERNAL_MESH_TOKEN ||
      authHeader === `Bearer ${INTERNAL_MESH_TOKEN}`;

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
    if (meshTokenHeader !== INTERNAL_MESH_TOKEN) {
      return reply.code(403).send({ error: "Forbidden" });
    }

    const { executions } = request.body as { executions: any[] };
    if (!Array.isArray(executions) || executions.length === 0) {
      return reply.send({ ok: true, inserted: 0 });
    }

    // Insert batch of executions in one single query
    const result = await prisma.cronExecution.createMany({
      data: executions.map((exec) => ({
        id: exec.id,
        cronJobId: exec.cronJobId,
        triggerType: exec.triggerType || "SCHEDULED",
        status: exec.status || "SUCCESS",
        startedAt: new Date(exec.startedAt),
        finishedAt: exec.finishedAt ? new Date(exec.finishedAt) : null,
        durationMs: exec.durationMs,
        exitCode: exec.exitCode,
        httpStatusCode: exec.httpStatusCode,
        errorMessage: exec.errorMessage,
        stdout: exec.stdout,
        stderr: exec.stderr,
        memoryMbPeak: exec.memoryMbPeak,
        cpuMs: exec.cpuMs,
        retryAttempt: exec.retryAttempt || 0,
      })),
      skipDuplicates: true,
    });

    // Also update parent cron jobs' lastStatus and lastRunAt
    for (const exec of executions) {
      await prisma.cronJob.update({
        where: { id: exec.cronJobId },
        data: {
          lastRunAt: new Date(exec.startedAt),
          lastStatus: exec.status || "SUCCESS",
        },
      }).catch(() => {});
    }

    return reply.send({ ok: true, inserted: result.count });
  });
}
