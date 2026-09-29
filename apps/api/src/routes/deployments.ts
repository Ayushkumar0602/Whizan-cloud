import type { FastifyInstance } from "fastify";
import { Queue } from "bullmq";
import { prisma } from "../lib/prisma.js";
import { redisClient, redisSub } from "../lib/redis.js";
import { stopDeploymentContainer, deleteBuildDir } from "../lib/resource-cleaner.js";
import { getAuthenticatedGitUrl } from "../lib/github-utils.js";

// Shared build queue — the build-worker consumes from this
export const buildQueue = new Queue("build", {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export async function deploymentRoutes(fastify: FastifyInstance) {
  // ── GET /api/projects/:id/deployments ───────────────────────────────────────
  fastify.get(
    "/:id/deployments",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { userId } = request.user;

      const project = await prisma.project.findFirst({ where: { id, userId } });
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const deployments = await prisma.deployment.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      for (const d of deployments) {
        if (d.status === "READY" && d.deploymentType !== "STATIC") {
          const val = await redisClient.get(`access:${d.id}`);
          (d as any).lastAccessed = val ? parseInt(val) : (d.buildFinishedAt?.getTime() ?? d.createdAt.getTime());
        }
      }
      return deployments;
    }
  );

  // ── GET /api/projects/:id/deployments/:dId ──────────────────────────────────
  fastify.get(
    "/:id/deployments/:dId",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id, dId } = request.params as { id: string; dId: string };
      const { userId } = request.user;

      const project = await prisma.project.findFirst({ where: { id, userId } });
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const deployment = await prisma.deployment.findFirst({ where: { id: dId, projectId: id } });
      if (!deployment) return reply.code(404).send({ error: "Deployment not found" });

      if (deployment.status === "READY" && deployment.deploymentType !== "STATIC") {
        const val = await redisClient.get(`access:${deployment.id}`);
        (deployment as any).lastAccessed = val ? parseInt(val) : (deployment.buildFinishedAt?.getTime() ?? deployment.createdAt.getTime());
      }

      return deployment;
    }
  );

  // ── POST /api/projects/:id/deployments — Manual trigger ─────────────────────
  fastify.post(
    "/:id/deployments",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { userId } = request.user;

      let project = await prisma.project.findFirst({ where: { id, userId } });
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const body = request.body as {
        githubRepoUrl?: string;
        branch?: string;
        rootDir?: string;
        buildCommand?: string;
        installCommand?: string;
        outputDir?: string;
        commitMessage?: string;
      } | undefined;

      if (body?.githubRepoUrl !== undefined) {
        project = await prisma.project.update({
          where: { id },
          data: {
            githubRepoUrl: body.githubRepoUrl || "direct-upload",
            ...(body.branch ? { branch: body.branch } : {}),
            ...(body.rootDir ? { rootDir: body.rootDir } : {}),
            ...(body.buildCommand ? { buildCommand: body.buildCommand } : {}),
            ...(body.installCommand ? { installCommand: body.installCommand } : {}),
            ...(body.outputDir ? { outputDir: body.outputDir } : {}),
          },
        });
      }

      // Prevent double-deploy
      const inProgress = await prisma.deployment.findFirst({
        where: { projectId: id, status: { in: ["QUEUED", "BUILDING"] } },
      });
      if (inProgress) {
        return reply.code(409).send({ error: "A deployment is already in progress", deployment: inProgress });
      }

      const deployment = await prisma.deployment.create({
        data: {
          projectId: id,
          commitHash: "manual",
          commitMessage: body?.commitMessage || (body?.githubRepoUrl ? `Redeploy from ${body.githubRepoUrl}` : "Manual redeploy"),
          branch: project.branch,
          status: "QUEUED",
        },
      });

      const isDirectUpload = !project.githubRepoUrl || project.githubRepoUrl === "direct-upload" || project.githubRepoUrl.trim() === "";
      const repoUrl = isDirectUpload ? "direct-upload" : await getAuthenticatedGitUrl(project.githubRepoUrl, userId);

      await buildQueue.add("build", {
        deploymentId: deployment.id,
        projectId: project.id,
        repoUrl,
        branch: project.branch,
        rootDir: project.rootDir || ".",
        buildCommand: project.buildCommand,
        installCommand: project.installCommand,
        outputDir: project.outputDir,
        framework: project.framework,
        slug: project.slug,
        isDirectUpload,
      });

      return reply.code(201).send(deployment);
    }
  );

  // ── POST /api/projects/:id/deployments/upload ────────────────────────────────
  // Direct tarball upload from IDE / CLI without requiring GitHub
  fastify.post(
    "/:id/deployments/upload",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { userId } = request.user;

      const project = await prisma.project.findFirst({ where: { id, userId } });
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const inProgress = await prisma.deployment.findFirst({
        where: { projectId: id, status: { in: ["QUEUED", "BUILDING"] } },
        orderBy: { createdAt: "desc" },
      });
      if (inProgress) {
        const isStale = Date.now() - new Date(inProgress.createdAt).getTime() > 180_000; // 3 minutes
        const force = (request.query as any)?.force === "true" || request.headers["x-force-deploy"] === "true";
        if (isStale || force) {
          await prisma.deployment.update({
            where: { id: inProgress.id },
            data: { status: "FAILED", buildFinishedAt: new Date() },
          });
        } else {
          return reply.code(409).send({ error: "A deployment is already in progress", deployment: inProgress });
        }
      }

      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: "No archive file uploaded. Send as multipart/form-data field 'file'." });
      }

      const buffer = await data.toBuffer();
      if (buffer.length === 0) {
        return reply.code(400).send({ error: "Uploaded archive is empty." });
      }

      const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024; // 50MB
      if (buffer.length > MAX_ARCHIVE_BYTES) {
        return reply.code(413).send({
          error: `Archive payload exceeds the 50MB limit (${(buffer.length / (1024 * 1024)).toFixed(1)}MB). Please ensure venv/, node_modules, and bulky datasets are excluded in your .gitignore.`
        });
      }

      const deployment = await prisma.deployment.create({
        data: {
          projectId: id,
          commitHash: "direct",
          commitMessage: "Direct IDE upload",
          branch: "main",
          status: "QUEUED",
          uploadType: "direct",
        },
      });

      try {
        // Save payload in Redis with 15m TTL (chunked in 2MB slices to prevent Upstash ERR max request size exceeded)
        const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
        const totalChunks = Math.ceil(buffer.length / CHUNK_SIZE);
        if (totalChunks > 1) {
          for (let i = 0; i < totalChunks; i++) {
            const chunk = buffer.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            await redisClient.set(`upload:${deployment.id}:chunk:${i}`, chunk.toString("base64"), "EX", 900);
          }
          await redisClient.set(`upload:${deployment.id}:chunks`, totalChunks.toString(), "EX", 900);
        } else {
          await redisClient.set(`upload:${deployment.id}`, buffer.toString("base64"), "EX", 900);
        }
      } catch (redisErr: any) {
        await prisma.deployment.update({
          where: { id: deployment.id },
          data: { status: "FAILED", buildFinishedAt: new Date(), errorMessage: `Failed to stage archive in Redis: ${redisErr.message}` },
        });
        return reply.code(500).send({ error: "Failed to stage archive in Redis: " + redisErr.message });
      }

      await buildQueue.add("build", {
        deploymentId: deployment.id,
        projectId: project.id,
        repoUrl: "direct-upload",
        branch: "main",
        rootDir: project.rootDir || ".",
        buildCommand: project.buildCommand,
        installCommand: project.installCommand,
        outputDir: project.outputDir,
        framework: project.framework,
        slug: project.slug,
        isDirectUpload: true,
      } as any);

      return reply.code(201).send(deployment);
    }
  );

  // ── POST /api/projects/:id/deployments/:dId/cancel ──────────────────────────
  fastify.post(
    "/:id/deployments/:dId/cancel",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id, dId } = request.params as { id: string; dId: string };
      const { userId } = request.user;

      const project = await prisma.project.findFirst({ where: { id, userId } });
      if (!project) return reply.code(404).send({ error: "Project not found" });

      await prisma.deployment.updateMany({
        where: { id: dId, projectId: id, status: { in: ["QUEUED", "BUILDING"] } },
        data: { status: "CANCELLED", buildFinishedAt: new Date(), errorMessage: "Cancelled by user" },
      });

      // Tell build-worker to kill Docker build container immediately
      await redisClient.publish(`cancel:${dId}`, "CANCEL");
      // Close any SSE log streams
      await redisClient.publish(`logs:${dId}`, "__DONE__");

      return reply.send({ ok: true });
    }
  );

  // ── POST /api/projects/:id/deployments/:dId/pause ───────────────────────────
  // Stops the SSR container (releases CPU/RAM/port) but keeps all data on disk.
  // The deployment can be resumed later.
  fastify.post(
    "/:id/deployments/:dId/pause",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id, dId } = request.params as { id: string; dId: string };
      const { userId } = request.user;

      const project = await prisma.project.findFirst({ where: { id, userId } });
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const deployment = await prisma.deployment.findFirst({ where: { id: dId, projectId: id } });
      if (!deployment) return reply.code(404).send({ error: "Deployment not found" });
      if (deployment.status !== "READY") {
        return reply.code(400).send({ error: "Only READY deployments can be paused" });
      }

      // Stop the SSR Docker container — releases port + CPU/RAM
      await stopDeploymentContainer(dId);

      // Remove from edge router so traffic stops being proxied
      await redisClient.del(`deployment:${project.slug}`);

      await prisma.deployment.update({
        where: { id: dId },
        data: { status: "PAUSED" },
      });

      return reply.send({ ok: true });
    }
  );

  // ── POST /api/projects/:id/deployments/:dId/resume ──────────────────────────
  // Re-triggers a full build for a PAUSED deployment (clean restart).
  fastify.post(
    "/:id/deployments/:dId/resume",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id, dId } = request.params as { id: string; dId: string };
      const { userId } = request.user;

      const project = await prisma.project.findFirst({ where: { id, userId } });
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const deployment = await prisma.deployment.findFirst({ where: { id: dId, projectId: id } });
      if (!deployment) return reply.code(404).send({ error: "Deployment not found" });
      if (deployment.status !== "PAUSED") {
        return reply.code(400).send({ error: "Only PAUSED deployments can be resumed" });
      }

      // Reuse existing deployment ID, clear old logs, and mark QUEUED
      await prisma.deployment.update({
        where: { id: dId },
        data: { status: "QUEUED", buildFinishedAt: null, errorMessage: null },
      });
      await redisClient.del(`build-logs:${dId}`);

      await buildQueue.add("build", {
        deploymentId: dId,
        projectId: project.id,
        repoUrl: project.githubRepoUrl,
        branch: project.branch,
        rootDir: project.rootDir || ".",
        buildCommand: project.buildCommand,
        installCommand: project.installCommand,
        outputDir: project.outputDir,
        framework: project.framework,
        slug: project.slug,
        isResume: true,
      });

      const updated = await prisma.deployment.findUnique({ where: { id: dId } });
      return reply.code(201).send(updated);
    }
  );

  // ── DELETE /api/projects/:id/deployments/:dId ───────────────────────────────
  // Fully removes a deployment: DB row + Docker container + build files + Redis key
  fastify.delete(
    "/:id/deployments/:dId",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id, dId } = request.params as { id: string; dId: string };
      const { userId } = request.user;

      const project = await prisma.project.findFirst({ where: { id, userId } });
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const deployment = await prisma.deployment.findFirst({ where: { id: dId, projectId: id } });
      if (!deployment) return reply.code(404).send({ error: "Deployment not found" });

      // If it's still building — cancel it first
      if (deployment.status === "QUEUED" || deployment.status === "BUILDING") {
        await redisClient.publish(`cancel:${dId}`, "CANCEL");
        await redisClient.publish(`logs:${dId}`, "__DONE__");
      }

      // Stop container + delete build files + remove from router
      await Promise.all([
        stopDeploymentContainer(dId),
        deleteBuildDir(dId),
        redisClient.del(`deployment:${project.slug}`),
        redisClient.del(`build-logs:${dId}`),
      ]);

      // Delete from DB
      await prisma.deployment.delete({ where: { id: dId } });

      return reply.send({ ok: true });
    }
  );

  // ── GET /api/projects/deployments/:dId/logs — SSE (token auth) or JSON (API key / token) ─────────────
  fastify.get(
    "/deployments/:dId/logs",
    async (request, reply) => {
      const { dId } = request.params as { dId: string };
      const { token, apiKey, live } = request.query as { token?: string; apiKey?: string; live?: string };
      const isLiveRequested = live === "true";

      // 1. Authenticate (support JWT tokens, Bearer API keys, x-api-key header, or query params)
      let authUser: { userId: string; email?: string } | null = null;
      const authHeader = request.headers.authorization;
      const apiKeyHeader = request.headers["x-api-key"] as string | undefined;
      const rawKey =
        apiKeyHeader ||
        apiKey ||
        (authHeader?.startsWith("Bearer whz_live_") ? authHeader.slice(7) : null) ||
        (token?.startsWith("whz_live_") ? token : null);

      if (rawKey && typeof rawKey === "string" && rawKey.startsWith("whz_live_")) {
        const crypto = await import("crypto");
        const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
        const apiKeyRecord = await prisma.apiKey.findUnique({
          where: { keyHash },
          include: { user: true },
        });
        if (apiKeyRecord) {
          authUser = { userId: apiKeyRecord.userId, email: apiKeyRecord.user.email };
        }
      }

      if (!authUser) {
        const jwtToken = token || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
        if (jwtToken) {
          try {
            const decoded: any = fastify.jwt.verify(jwtToken);
            if (decoded && decoded.userId) authUser = decoded;
          } catch {}
        }
      }

      if (!authUser) {
        try {
          await request.jwtVerify({ onlyCookie: false });
          if (request.user) authUser = request.user;
        } catch {}
      }

      if (!authUser) {
        return reply.code(401).send({ error: "Unauthorized: Invalid or missing token/API key" });
      }

      // 2. Fetch deployment and verify ownership
      const deployment = await prisma.deployment.findUnique({
        where: { id: dId },
        include: { project: true },
      });
      if (!deployment || deployment.project.userId !== authUser.userId) {
        return reply.code(404).send({ error: "Deployment not found" });
      }

      const channel = `logs:${dId}`;
      const listKey = `build-logs:${dId}`;
      const stored = await redisClient.lrange(listKey, 0, -1);
      const cleanLogs = stored.filter((line) => line !== "__DONE__");

      // 3. Return JSON if caller requests JSON or if live stream was not explicitly requested
      const acceptHeader = request.headers.accept || "";
      const wantsJson = acceptHeader.includes("application/json") || (!isLiveRequested && !acceptHeader.includes("text/event-stream"));

      if (wantsJson) {
        return reply.send({
          deploymentId: dId,
          projectId: deployment.projectId,
          slug: deployment.project.slug,
          status: deployment.status,
          liveUrl: deployment.url,
          buildStartedAt: deployment.buildStartedAt,
          buildFinishedAt: deployment.buildFinishedAt,
          errorMessage: deployment.errorMessage,
          logs: cleanLogs,
        });
      }

      // 4. Otherwise stream SSE (Dashboard or live tail)
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

      for (const line of cleanLogs) {
        sendEvent(line);
      }

      if (["READY", "FAILED", "CANCELLED", "PAUSED"].includes(deployment.status)) {
        sendEvent("__DONE__");
        reply.raw.end();
        return;
      }

      const sub = redisSub.duplicate();
      await sub.subscribe(channel);

      sub.on("message", (_ch: string, message: string) => {
        if (message === "__DONE__") {
          sendEvent("__DONE__");
          sub.unsubscribe(channel).catch(() => {});
          sub.quit().catch(() => {});
          reply.raw.end();
        } else {
          sendEvent(message);
        }
      });

      request.raw.on("close", () => {
        sub.unsubscribe(channel).catch(() => {});
        sub.quit().catch(() => {});
      });
    }
  );
}
