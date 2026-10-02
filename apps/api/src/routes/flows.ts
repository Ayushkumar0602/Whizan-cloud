import type { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { redisClient, redisSub } from "../lib/redis.js";

const INTERNAL_MESH_TOKEN = process.env.INTERNAL_MESH_TOKEN || "whizan_mesh_sec_2026_x89q";

// ─── ZOD SCHEMAS ─────────────────────────────────────────────────────────────
const WorkflowNodeSchema = z.object({
  nodeKey: z.string().min(1).max(100),
  name: z.string().min(1).max(150),
  type: z.enum([
    "TRIGGER_GIT",
    "TRIGGER_CRON",
    "TRIGGER_WEBHOOK",
    "TRIGGER_MANUAL",
    "ACTION_WORKSPACE_ANALYZE",
    "ACTION_BUILD_CONTAINER",
    "ACTION_DEPLOY_EDGE",
    "ACTION_DEPLOY_SERVICE",
    "ACTION_CONTAINER_EXEC",
    "ACTION_RUN_TESTS",
    "ACTION_HEALTH_PROBE",
    "ACTION_ROUTER_CUTOVER",
    "ACTION_AUTO_ROLLBACK",
    "ACTION_V8_FUNCTION",
    "ACTION_HTTP_REQUEST",
    "ACTION_DATABASE_QUERY",
    "ACTION_AI_PROMPT",
    "ACTION_NOTIFICATION",
    "CONTROL_CONDITION",
    "CONTROL_PARALLEL",
    "CONTROL_JOIN",
    "CONTROL_DELAY",
    "CONTROL_APPROVAL",
  ]),
  config: z.record(z.any()).default({}),
  timeoutSeconds: z.number().int().positive().default(600),
  maxRetries: z.number().int().min(0).max(5).default(0),
  retryDelaySec: z.number().int().min(1).max(60).default(5),
  continueOnError: z.boolean().default(false),
  positionX: z.number().default(0),
  positionY: z.number().default(0),
});

const WorkflowEdgeSchema = z.object({
  sourceNodeKey: z.string().min(1),
  targetNodeKey: z.string().min(1),
  condition: z.string().optional().default("SUCCESS"),
});

const WorkflowTriggerSchema = z.object({
  type: z.string().default("MANUAL"),
  config: z.record(z.any()).default({}),
  enabled: z.boolean().default(true),
});

const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  projectId: z.string().uuid().optional(),
  category: z.string().default("CUSTOM"),
  concurrencyPolicy: z.enum(["FORBID", "QUEUE", "ALLOW", "REPLACE"]).default("QUEUE"),
  maxConcurrentRuns: z.number().int().min(1).max(10).default(1),
  timeoutSeconds: z.number().int().min(10).max(86400).default(3600),
  visualConfig: z.record(z.any()).optional().default({}),
  codeDefinition: z.string().optional().default(""),
  nodes: z.array(WorkflowNodeSchema).min(1, "Workflow must contain at least one node"),
  edges: z.array(WorkflowEdgeSchema).default([]),
  triggers: z.array(WorkflowTriggerSchema).default([]),
});

const UpdateWorkflowSchema = CreateWorkflowSchema.partial().extend({
  enabled: z.boolean().optional(),
});

export async function flowRoutes(app: FastifyInstance) {
  // ─── 1. LIST ALL WORKFLOWS ──────────────────────────────────────────────────
  app.get("/", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;

    const workflows = await prisma.workflow.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: { nodes: true, edges: true, runs: true },
        },
        runs: {
          take: 1,
          orderBy: { startedAt: "desc" },
          select: {
            id: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            durationMs: true,
          },
        },
      },
    });

    return reply.send({ ok: true, workflows });
  });

  // ─── 2. CREATE WORKFLOW ─────────────────────────────────────────────────────
  app.post("/", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const parsed = CreateWorkflowSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Validation error", details: parsed.error.format() });
    }

    const { nodes, edges, triggers, slug, ...rest } = parsed.data;

    // Generate unique slug if not provided
    const baseSlug = slug || rest.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const finalSlug = `${baseSlug}-${crypto.randomBytes(3).toString("hex")}`;

    const workflow = await prisma.workflow.create({
      data: {
        userId,
        slug: finalSlug,
        name: rest.name.trim(),
        description: rest.description ? rest.description.trim() : undefined,
        projectId: rest.projectId,
        category: rest.category,
        concurrencyPolicy: rest.concurrencyPolicy,
        maxConcurrentRuns: rest.maxConcurrentRuns,
        timeoutSeconds: rest.timeoutSeconds,
        visualConfig: rest.visualConfig,
        codeDefinition: rest.codeDefinition,
        nodes: {
          create: nodes.map((n) => ({
            nodeKey: n.nodeKey,
            name: n.name,
            type: n.type,
            config: n.config,
            timeoutSeconds: n.timeoutSeconds,
            maxRetries: n.maxRetries,
            retryDelaySec: n.retryDelaySec,
            continueOnError: n.continueOnError,
            positionX: n.positionX,
            positionY: n.positionY,
          })),
        },
        edges: {
          create: edges.map((e) => ({
            sourceNodeKey: e.sourceNodeKey,
            targetNodeKey: e.targetNodeKey,
            condition: e.condition,
          })),
        },
        triggers: {
          create: triggers.map((t) => ({
            type: t.type,
            config: t.config,
            enabled: t.enabled,
          })),
        },
      },
      include: {
        nodes: true,
        edges: true,
        triggers: true,
      },
    });

    // Cache definition in Redis for fast daemon ingestion
    await redisClient.set(`flow:def:${workflow.id}`, JSON.stringify(workflow), "EX", 86400 * 7);

    return reply.code(201).send({ ok: true, workflow });
  });

  // ─── 3. GET SINGLE WORKFLOW WITH DAG ────────────────────────────────────────
  app.get("/:id", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const { id } = request.params;

    const workflow = await prisma.workflow.findFirst({
      where: { id, userId },
      include: {
        nodes: true,
        edges: true,
        triggers: true,
        runs: {
          take: 10,
          orderBy: { startedAt: "desc" },
          include: {
            stepRuns: {
              orderBy: { startedAt: "asc" },
            },
          },
        },
      },
    });

    if (!workflow) {
      return reply.code(404).send({ error: "Workflow not found" });
    }

    return reply.send({ ok: true, workflow });
  });

  // ─── 4. UPDATE WORKFLOW ─────────────────────────────────────────────────────
  app.patch("/:id", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const { id } = request.params;

    const existing = await prisma.workflow.findFirst({ where: { id, userId } });
    if (!existing) {
      return reply.code(404).send({ error: "Workflow not found" });
    }

    const parsed = UpdateWorkflowSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Validation error", details: parsed.error.format() });
    }

    const { nodes, edges, triggers, ...rest } = parsed.data;

    // Use transaction if updating structural DAG nodes/edges
    const updated = await prisma.$transaction(async (tx) => {
      if (nodes) {
        await tx.workflowNode.deleteMany({ where: { workflowId: id } });
        await tx.workflowNode.createMany({
          data: nodes.map((n) => ({
            workflowId: id,
            nodeKey: n.nodeKey,
            name: n.name,
            type: n.type,
            config: n.config,
            timeoutSeconds: n.timeoutSeconds,
            maxRetries: n.maxRetries,
            retryDelaySec: n.retryDelaySec,
            continueOnError: n.continueOnError,
            positionX: n.positionX,
            positionY: n.positionY,
          })),
        });
      }

      if (edges) {
        await tx.workflowEdge.deleteMany({ where: { workflowId: id } });
        await tx.workflowEdge.createMany({
          data: edges.map((e) => ({
            workflowId: id,
            sourceNodeKey: e.sourceNodeKey,
            targetNodeKey: e.targetNodeKey,
            condition: e.condition,
          })),
        });
      }

      return tx.workflow.update({
        where: { id },
        data: {
          ...rest,
          name: rest.name ? rest.name.trim() : undefined,
          description: rest.description ? rest.description.trim() : undefined,
        },
        include: {
          nodes: true,
          edges: true,
          triggers: true,
        },
      });
    });

    // Update Redis Cache
    await redisClient.set(`flow:def:${updated.id}`, JSON.stringify(updated), "EX", 86400 * 7);

    return reply.send({ ok: true, workflow: updated });
  });

  // ─── 5. DELETE WORKFLOW ─────────────────────────────────────────────────────
  app.delete("/:id", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const { id } = request.params;

    const existing = await prisma.workflow.findFirst({ where: { id, userId } });
    if (!existing) {
      return reply.code(404).send({ error: "Workflow not found" });
    }

    await prisma.workflow.delete({ where: { id } });
    await redisClient.del(`flow:def:${id}`);

    return reply.send({ ok: true, message: "Workflow deleted successfully" });
  });

  // ─── 6. TRIGGER WORKFLOW (1-Click Run) ──────────────────────────────────────
  app.post("/:id/trigger", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const { id } = request.params;
    const { triggerMetadata } = (request.body as any) || {};

    const workflow = await prisma.workflow.findFirst({
      where: { id, userId },
      include: { nodes: true, edges: true },
    });

    if (!workflow) {
      return reply.code(404).send({ error: "Workflow not found" });
    }

    if (!workflow.enabled) {
      return reply.code(400).send({ error: "Workflow is disabled" });
    }

    // Create execution run record
    const run = await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        triggerSource: "MANUAL",
        triggerMetadata: triggerMetadata || { triggeredByUserId: userId },
        status: "RUNNING",
      },
    });

    // Cache definition in Redis
    await redisClient.set(`flow:def:${workflow.id}`, JSON.stringify(workflow), "EX", 86400 * 7);

    // Push execution task to Redis Stream
    await redisClient.xadd(
      "flow:trigger:stream",
      "*",
      "workflowId",
      workflow.id,
      "runId",
      run.id,
      "triggerMetadata",
      JSON.stringify(triggerMetadata || {})
    );

    return reply.code(202).send({
      ok: true,
      message: "Workflow run dispatched immediately",
      runId: run.id,
    });
  });

  // ─── 7. PAGINATED EXECUTION HISTORY ──────────────────────────────────────────
  app.get("/:id/runs", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const { id } = request.params;
    const page = Math.max(1, parseInt(request.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(request.query.limit || "20", 10)));
    const skip = (page - 1) * limit;

    const [runs, total] = await Promise.all([
      prisma.workflowRun.findMany({
        where: { workflowId: id, workflow: { userId } },
        orderBy: { startedAt: "desc" },
        skip,
        take: limit,
        include: {
          _count: { select: { stepRuns: true } },
        },
      }),
      prisma.workflowRun.count({
        where: { workflowId: id, workflow: { userId } },
      }),
    ]);

    return reply.send({
      ok: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      runs,
    });
  });

  // ─── 8. DEEP INSPECTION OF RUN & STEP RUNS ──────────────────────────────────
  app.get("/:id/runs/:runId", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const { id, runId } = request.params;

    const run = await prisma.workflowRun.findFirst({
      where: { id: runId, workflowId: id, workflow: { userId } },
      include: {
        stepRuns: {
          orderBy: { startedAt: "asc" },
        },
        approvals: true,
      },
    });

    if (!run) {
      return reply.code(404).send({ error: "Workflow run not found" });
    }

    return reply.send({ ok: true, run });
  });

  // ─── 9. REAL-TIME LIVE LOG STREAMING (SSE) ─────────────────────────────────
  app.get("/:id/runs/:runId/logs/stream", async (request: any, reply) => {
    const { runId } = request.params;

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders();

    const channelPattern = `flow:logs:${runId}:*`;
    const subscriber = redisSub.duplicate();
    await subscriber.psubscribe(channelPattern);

    subscriber.on("pmessage", (pattern, channel, message) => {
      reply.raw.write(`data: ${message}\n\n`);
    });

    request.raw.on("close", async () => {
      await subscriber.punsubscribe(channelPattern).catch(() => {});
      await subscriber.quit().catch(() => {});
    });
  });

  // ─── 10. HUMAN-IN-THE-LOOP APPROVAL RESPONSE ───────────────────────────────
  app.post("/approvals/:token/respond", async (request: any, reply) => {
    const { token } = request.params;
    const { approved, approvedBy, comments } = (request.body as any) || {};

    const approval = await prisma.workflowApproval.findUnique({
      where: { approvalToken: token },
      include: { workflowRun: true },
    });

    if (!approval) {
      return reply.code(404).send({ error: "Invalid approval token" });
    }

    if (approval.status !== "PENDING") {
      return reply.code(400).send({ error: `Approval already ${approval.status.toLowerCase()}` });
    }

    const updatedStatus = approved ? "APPROVED" : "REJECTED";

    await prisma.workflowApproval.update({
      where: { id: approval.id },
      data: {
        status: updatedStatus,
        approvedBy: approvedBy || "Interactive User",
        comments,
        respondedAt: new Date(),
      },
    });

    // Notify Flow Engine via Redis Pub/Sub to resume state machine
    await redisClient.publish(
      "flow:approval_events",
      JSON.stringify({
        runId: approval.runId,
        nodeKey: approval.nodeKey,
        approved: Boolean(approved),
      })
    );

    return reply.send({
      ok: true,
      message: `Workflow approval ${updatedStatus.toLowerCase()} successfully`,
    });
  });

  // ─── 11. INTERNAL MESH TELEMETRY & RUN SYNC ───────────────────────────────
  app.post("/internal/sync", async (request: any, reply) => {
    const meshToken = request.headers["x-mesh-token"];
    if (meshToken !== INTERNAL_MESH_TOKEN) {
      return reply.code(401).send({ error: "Unauthorized: Invalid internal mesh token" });
    }

    const {
      runId,
      status,
      contextData,
      errorMessage,
      durationMs,
      stepUpdates,
    } = (request.body as any) || {};

    if (!runId) {
      return reply.code(400).send({ error: "runId is required" });
    }

    try {
      // 1. Update WorkflowRun
      const isTerminal = ["SUCCESS", "FAILED", "CANCELLED", "TIMED_OUT"].includes(status);
      await prisma.workflowRun.update({
        where: { id: runId },
        data: {
          ...(status ? { status: status as any } : {}),
          ...(isTerminal ? { finishedAt: new Date() } : {}),
          ...(durationMs !== undefined ? { durationMs } : {}),
          ...(contextData ? { contextData } : {}),
          ...(errorMessage !== undefined ? { errorMessage } : {}),
        },
      });

      // 2. Process step updates if any
      if (Array.isArray(stepUpdates)) {
        for (const step of stepUpdates) {
          if (!step.nodeKey) continue;

          // Find workflowId and nodeId for relation
          const run = await prisma.workflowRun.findUnique({
            where: { id: runId },
            select: { workflowId: true },
          });

          let nodeId: string | undefined = undefined;
          if (run?.workflowId) {
            const node = await prisma.workflowNode.findUnique({
              where: {
                workflowId_nodeKey: {
                  workflowId: run.workflowId,
                  nodeKey: step.nodeKey,
                },
              },
              select: { id: true, type: true },
            });
            if (node) {
              nodeId = node.id;
              if (!step.nodeType) step.nodeType = node.type;
            }
          }

          await prisma.workflowStepRun.upsert({
            where: {
              runId_nodeKey: {
                runId,
                nodeKey: step.nodeKey,
              },
            },
            create: {
              runId,
              nodeId,
              nodeKey: step.nodeKey,
              nodeType: step.nodeType || "ACTION_HTTP_REQUEST",
              status: step.status || "RUNNING",
              outputData: step.outputData,
              exitCode: step.exitCode,
              httpStatusCode: step.httpStatusCode,
              stdout: step.stdout,
              durationMs: step.durationMs,
              errorMessage: step.errorMessage,
            },
            update: {
              status: step.status,
              finishedAt: ["SUCCESS", "FAILED", "SKIPPED", "TIMED_OUT"].includes(step.status) ? new Date() : undefined,
              outputData: step.outputData,
              exitCode: step.exitCode,
              httpStatusCode: step.httpStatusCode,
              stdout: step.stdout,
              durationMs: step.durationMs,
              errorMessage: step.errorMessage,
            },
          });

          // If step created an approval token, create WorkflowApproval record
          if (step.approvalToken) {
            await prisma.workflowApproval.upsert({
              where: { approvalToken: step.approvalToken },
              create: {
                runId,
                nodeKey: step.nodeKey,
                title: step.approvalTitle || `Approval for ${step.nodeKey}`,
                description: step.approvalDescription || "",
                status: "PENDING",
                approvalToken: step.approvalToken,
                expiresAt: new Date(Date.now() + 86400 * 1000 * 7), // 7 day default
              },
              update: {},
            });
          }
        }
      }

      return reply.send({ ok: true, synced: true });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // ─── 12. INTERNAL FETCH WORKFLOW DEFINITION (Self-Healing) ─────────────────
  app.get("/internal/workflows/:id", async (request: any, reply) => {
    const meshToken = request.headers["x-mesh-token"];
    if (meshToken !== INTERNAL_MESH_TOKEN) {
      return reply.code(401).send({ error: "Unauthorized: Invalid internal mesh token" });
    }

    const workflow = await prisma.workflow.findUnique({
      where: { id: request.params.id },
      include: { nodes: true, edges: true },
    });

    if (!workflow) {
      return reply.code(404).send({ error: "Workflow not found" });
    }

    return reply.send({ ok: true, workflow });
  });

  // ─── 13. REPLAY FROM FAILED STEP (Instant Replay) ─────────────────────────
  app.post("/:id/runs/:runId/replay", { preHandler: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user?.userId || request.user?.id;
    const { id, runId } = request.params;

    const originalRun = await prisma.workflowRun.findFirst({
      where: { id: runId, workflowId: id, workflow: { userId } },
      include: {
        workflow: { include: { nodes: true, edges: true } },
        stepRuns: true,
      },
    });

    if (!originalRun) {
      return reply.code(404).send({ error: "Original workflow run not found" });
    }

    // Create new replay execution run
    const newRun = await prisma.workflowRun.create({
      data: {
        workflowId: id,
        triggerSource: "MANUAL_REPLAY",
        triggerMetadata: {
          replayedFromRunId: runId,
          replayedAt: new Date().toISOString(),
          triggeredByUserId: userId,
        },
        status: "RUNNING",
        contextData: (originalRun.contextData as any) || {},
      },
    });

    // Seed prior successful steps into Redis step outcomes to enable memoized replay
    for (const step of originalRun.stepRuns) {
      if (step.status === "SUCCESS") {
        const stepPayload = JSON.stringify({
          runId: newRun.id,
          nodeKey: step.nodeKey,
          nodeType: step.nodeType,
          status: "SUCCESS",
          outputData: step.outputData,
          exitCode: step.exitCode,
          httpStatusCode: step.httpStatusCode,
          stdout: step.stdout,
          durationMs: step.durationMs,
          memoizationHash: step.memoizationHash,
          updatedAt: Date.now(),
        });
        await redisClient.hset(`flow:steps:${newRun.id}`, step.nodeKey, stepPayload);

        // Also duplicate step record in Postgres for continuity
        await prisma.workflowStepRun.create({
          data: {
            runId: newRun.id,
            nodeId: step.nodeId,
            nodeKey: step.nodeKey,
            nodeType: step.nodeType,
            status: "SUCCESS",
            outputData: step.outputData || undefined,
            exitCode: step.exitCode,
            httpStatusCode: step.httpStatusCode,
            stdout: step.stdout,
            durationMs: step.durationMs,
            memoizationHash: step.memoizationHash,
          },
        }).catch(() => {});
      }
    }

    // Cache workflow definition
    await redisClient.set(`flow:def:${id}`, JSON.stringify(originalRun.workflow), "EX", 86400 * 7);

    // Enqueue execution to Redis Stream
    await redisClient.xadd(
      "flow:trigger:stream",
      "*",
      "workflowId",
      id,
      "runId",
      newRun.id,
      "triggerMetadata",
      JSON.stringify({ replayedFromRunId: runId, isReplay: true })
    );

    return reply.code(202).send({
      ok: true,
      message: "Workflow replay initiated from previous checkpoint",
      runId: newRun.id,
      replayedFromRunId: runId,
    });
  });

  // ─── 14. INTERNAL COLD-BOOT RECONCILIATION SCAN ───────────────────────────
  app.post("/internal/reconcile-on-boot", async (request: any, reply) => {
    const meshToken = request.headers["x-mesh-token"];
    if (meshToken !== INTERNAL_MESH_TOKEN) {
      return reply.code(401).send({ error: "Unauthorized: Invalid internal mesh token" });
    }

    try {
      const interruptedRuns = await prisma.workflowRun.findMany({
        where: {
          status: { in: ["RUNNING", "PENDING"] },
        },
        include: {
          workflow: {
            include: { nodes: true, edges: true },
          },
        },
        take: 50,
      });

      return reply.send({ ok: true, interruptedRuns });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
