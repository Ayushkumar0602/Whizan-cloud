import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { generateWebhookSecret } from "../lib/crypto.js";
import { redisClient } from "../lib/redis.js";
import { stopDeploymentContainer, deleteBuildDir } from "../lib/resource-cleaner.js";

const BaseProjectSchema = z.object({
  name: z.string().min(1).max(60),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/, "Slug must be lowercase alphanumeric with internal hyphens (cannot start or end with a hyphen)"),
  githubRepoUrl: z.union([z.string().url(), z.literal("direct-upload"), z.literal("")]).default("direct-upload"),
  branch: z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._\-\/]*$/, "Invalid git branch name. Must start with alphanumeric and not contain shell metacharacters").default("main"),
  rootDir: z.string().max(200).default("."),
  buildCommand: z.string().max(500).default("npm run build"),
  installCommand: z.string().max(500).default("npm install"),
  outputDir: z.string().max(200).default(".next"),
  framework: z.enum(["NEXTJS", "REACT", "VITE", "ASTRO", "CUSTOM"]).default("NEXTJS"),
});

const CreateProjectSchema = BaseProjectSchema.extend({
  envVars: z.record(z.string(), z.any()).optional(),
});

const UpdateProjectSchema = BaseProjectSchema.partial().omit({ slug: true });

export async function projectRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  // GET /api/projects
  fastify.get("/", async (request) => {
    const { userId, role } = request.user;
    const query = request.query as { all?: string };
    const whereClause = role === "ADMIN" && query?.all === "true" ? {} : { userId };
    return prisma.project.findMany({
      where: whereClause,
      include: { deployments: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
  });

  // POST /api/projects
  fastify.post("/", async (request, reply) => {
    const body = CreateProjectSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const { userId } = request.user;
    let finalSlug = body.data.slug;
    let slugTaken = await prisma.project.findUnique({ where: { slug: finalSlug } });
    if (slugTaken) {
      if (slugTaken.userId === userId) {
        return reply.code(409).send({
          error: `Project with slug '${finalSlug}' already exists in your account.`,
          existingProject: slugTaken,
          instructions: `To deploy to this existing project, call whizan_deploy_direct with targetType: 'project' and targetId: '${slugTaken.id}'.`,
        });
      }
      finalSlug = `${finalSlug}-${userId.replace(/-/g, '').substring(0, 5)}`;
      let secondCheck = await prisma.project.findUnique({ where: { slug: finalSlug } });
      if (secondCheck) {
        finalSlug = `${finalSlug}-${Math.random().toString(36).substring(2, 6)}`;
      }
    }

    const { envVars, ...projectData } = body.data;

    const project = await prisma.project.create({
      data: { ...projectData, slug: finalSlug, userId, webhookSecret: generateWebhookSecret() },
    });

    if (envVars && Object.keys(envVars).length > 0) {
      try {
        const { encrypt } = await import("../lib/crypto.js");
        const operations = Object.entries(envVars).map(([rawKey, rawVal]) => {
          const key = String(rawKey).trim();
          const valStr = typeof rawVal === "object" && rawVal !== null ? JSON.stringify(rawVal) : String(rawVal ?? "");
          const encryptedValue = encrypt(valStr);
          return prisma.envVariable.upsert({
            where: { projectId_key: { projectId: project.id, key } },
            update: { value: encryptedValue, isSecret: true },
            create: { projectId: project.id, key, value: encryptedValue, isSecret: true },
          });
        });
        await prisma.$transaction(operations);
      } catch (err: any) {
        fastify.log.error(`Failed to batch save initial envVars for project ${project.id}: ${err.message}`);
      }
    }

    return reply.code(201).send(project);
  });

  // GET /api/projects/:id
  fastify.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.user;
    const project = await prisma.project.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
      include: { deployments: { orderBy: { createdAt: "desc" }, take: 10 } },
    });
    if (!project) return reply.code(404).send({ error: "Project not found" });
    return project;
  });

  // GET /api/projects/:id/analytics
  fastify.get("/:id/analytics", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.user;
    const { timeframe, format } = request.query as { timeframe?: string; format?: string };

    const project = await prisma.project.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
    });
    if (!project) return reply.code(404).send({ error: "Project not found" });

    // Fetch the last 30 days from Postgres for daily trend records
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dbAnalytics = await prisma.projectAnalytics.findMany({
      where: { projectId: id, date: { gte: thirtyDaysAgo } },
      orderBy: { date: "asc" },
    });

    // If legacy request without timeframe or format=advanced, return array
    if (!timeframe && format !== "advanced") {
      return dbAnalytics;
    }

    // Advanced analytics calculation
    const tf = timeframe || "24h";
    const now = Date.now();
    let startTime = now - 24 * 60 * 60 * 1000;
    let groupIntervalMs = 15 * 60 * 1000;

    if (tf === "1h") {
      startTime = now - 60 * 60 * 1000;
      groupIntervalMs = 60 * 1000;
    } else if (tf === "7d") {
      startTime = now - 7 * 24 * 60 * 60 * 1000;
      groupIntervalMs = 60 * 60 * 1000;
    } else if (tf === "30d") {
      startTime = now - 30 * 24 * 60 * 60 * 1000;
      groupIntervalMs = 4 * 60 * 60 * 1000;
    }

    // 1. Fetch time-series buckets from Redis Sorted Set
    const rawBuckets = await redisClient.zrangebyscore(`analytics:ts:${id}`, startTime, now).catch(() => []);

    // 2. Fetch recent requests from Redis List
    const rawRecent = await redisClient.lrange(`analytics:recent:${id}`, 0, 39).catch(() => []);
    const recentRequests = rawRecent
      .map((r) => {
        try {
          return JSON.parse(r);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    // 3. Generate equidistant slots
    const slotMap = new Map<
      number,
      {
        timestamp: number;
        requests: number;
        status2xx: number;
        status3xx: number;
        status4xx: number;
        status5xx: number;
        totalDurationMs: number;
        maxDurationMs: number;
        bytesSent: number;
        wafMitigations: number;
      }
    >();

    const startSlot = Math.floor(startTime / groupIntervalMs) * groupIntervalMs;
    const endSlot = Math.floor(now / groupIntervalMs) * groupIntervalMs;
    for (let t = startSlot; t <= endSlot; t += groupIntervalMs) {
      slotMap.set(t, {
        timestamp: t,
        requests: 0,
        status2xx: 0,
        status3xx: 0,
        status4xx: 0,
        status5xx: 0,
        totalDurationMs: 0,
        maxDurationMs: 0,
        bytesSent: 0,
        wafMitigations: 0,
      });
    }

    let totalRequests = 0;
    let status2xx = 0;
    let status3xx = 0;
    let status4xx = 0;
    let status5xx = 0;
    let totalBytesSent = 0;
    let totalDurationMs = 0;
    let maxLatency = 0;
    const allLatencies: number[] = [];
    let wafMitigations = 0;
    const pathCounts: Record<string, number> = {};
    const methodCounts: Record<string, number> = {};
    let uniqueIps = 0;

    for (const item of rawBuckets) {
      try {
        const b = JSON.parse(item);
        const reqs = b.requests || 0;
        totalRequests += reqs;
        status2xx += b.status2xx || 0;
        status3xx += b.status3xx || 0;
        status4xx += b.status4xx || 0;
        status5xx += b.status5xx || 0;
        totalBytesSent += b.bytesSent || 0;
        totalDurationMs += b.totalDurationMs || 0;
        wafMitigations += b.wafMitigations || 0;
        uniqueIps += b.uniqueIpsCount || 0;

        if ((b.maxDurationMs || 0) > maxLatency) maxLatency = b.maxDurationMs;
        if (reqs > 0) {
          const avgBucket = Math.round((b.totalDurationMs || 0) / reqs);
          allLatencies.push(avgBucket);
        }

        if (b.methods) {
          for (const [m, count] of Object.entries(b.methods)) {
            methodCounts[m] = (methodCounts[m] || 0) + (count as number);
          }
        }

        if (b.topPaths) {
          for (const [p, count] of Object.entries(b.topPaths)) {
            pathCounts[p] = (pathCounts[p] || 0) + (count as number);
          }
        }

        const slotKey = Math.floor(b.timestamp / groupIntervalMs) * groupIntervalMs;
        const slot = slotMap.get(slotKey);
        if (slot) {
          slot.requests += reqs;
          slot.status2xx += b.status2xx || 0;
          slot.status3xx += b.status3xx || 0;
          slot.status4xx += b.status4xx || 0;
          slot.status5xx += b.status5xx || 0;
          slot.totalDurationMs += b.totalDurationMs || 0;
          if ((b.maxDurationMs || 0) > slot.maxDurationMs) slot.maxDurationMs = b.maxDurationMs;
          slot.bytesSent += b.bytesSent || 0;
          slot.wafMitigations += b.wafMitigations || 0;
        }
      } catch {}
    }

    // Fallback: If no real-time Redis buckets yet, use historical projectAnalytics
    if (totalRequests === 0 && dbAnalytics.length > 0) {
      for (const da of dbAnalytics) {
        totalRequests += da.pageViews;
        status2xx += da.pageViews;
        totalBytesSent += da.bandwidth;
        uniqueIps += da.visitors;
      }
    }

    allLatencies.sort((a, b) => a - b);
    const p95Idx = Math.floor(allLatencies.length * 0.95);
    const p99Idx = Math.floor(allLatencies.length * 0.99);
    const p95Latency = allLatencies.length > 0 ? allLatencies[p95Idx] || allLatencies[allLatencies.length - 1] : 0;
    const p99Latency = allLatencies.length > 0 ? allLatencies[p99Idx] || allLatencies[allLatencies.length - 1] : 0;
    const avgLatency = totalRequests > 0 ? Math.round(totalDurationMs / totalRequests) : 0;

    const successfulRequests = status2xx + status3xx;
    const successRate = totalRequests > 0 ? parseFloat(((successfulRequests / totalRequests) * 100).toFixed(2)) : 100;
    const errorRate = totalRequests > 0 ? parseFloat((((status4xx + status5xx) / totalRequests) * 100).toFixed(2)) : 0;

    const elapsedMinutes = Math.max(1, Math.round((now - startTime) / 60000));
    const requestRatePerMin = parseFloat((totalRequests / elapsedMinutes).toFixed(2));

    const timeSeries = Array.from(slotMap.values()).map((item) => ({
      timestamp: item.timestamp,
      isoTime: new Date(item.timestamp).toISOString(),
      requests: item.requests,
      status2xx: item.status2xx,
      status3xx: item.status3xx,
      status4xx: item.status4xx,
      status5xx: item.status5xx,
      avgDurationMs: item.requests > 0 ? Math.round(item.totalDurationMs / item.requests) : 0,
      maxDurationMs: item.maxDurationMs,
      bytesSent: item.bytesSent,
      wafMitigations: item.wafMitigations,
    }));

    const topEndpoints = Object.entries(pathCounts)
      .map(([path, count]) => ({
        path,
        requests: count,
        percentage: totalRequests > 0 ? parseFloat(((count / totalRequests) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    return reply.send({
      targetId: id,
      targetType: "project",
      slug: project.slug,
      projectName: project.name,
      framework: project.framework,
      timeframe: tf,
      kpis: {
        totalRequests,
        requestRatePerMin,
        avgLatencyMs: avgLatency,
        p95LatencyMs: p95Latency,
        p99LatencyMs: p99Latency,
        maxLatencyMs: maxLatency,
        successRate,
        errorRate,
        totalBandwidthBytes: totalBytesSent,
        uniqueIps,
        wafMitigations,
      },
      statusBreakdown: {
        status2xx,
        status3xx,
        status4xx,
        status5xx,
      },
      methodBreakdown: methodCounts,
      timeSeries,
      topEndpoints,
      recentRequests,
      dailyLogs: dbAnalytics,
    });
  });

  // PATCH /api/projects/:id
  fastify.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;
    const body = UpdateProjectSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) return reply.code(404).send({ error: "Project not found" });
    return prisma.project.update({ where: { id }, data: body.data });
  });

  // GET /api/projects/:id/domains
  fastify.get("/:id/domains", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;
    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) return reply.code(404).send({ error: "Project not found" });
    return prisma.customDomain.findMany({ where: { projectId: id } });
  });

  // POST /api/projects/:id/domains
  fastify.post("/:id/domains", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;
    const { domain } = request.body as { domain: string };
    
    if (!domain || !domain.includes(".")) return reply.code(400).send({ error: "Invalid domain" });

    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) return reply.code(404).send({ error: "Project not found" });

    const existing = await prisma.customDomain.findUnique({ where: { domain } });
    if (existing) return reply.code(409).send({ error: "Domain already in use" });

    const cd = await prisma.customDomain.create({ data: { projectId: id, domain } });
    return reply.code(201).send(cd);
  });

  // DELETE /api/projects/:id/domains/:domain
  fastify.delete("/:id/domains/:domain", async (request, reply) => {
    const { id, domain } = request.params as { id: string, domain: string };
    const { userId } = request.user;
    
    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) return reply.code(404).send({ error: "Project not found" });

    await prisma.customDomain.deleteMany({ where: { projectId: id, domain } });
    return reply.send({ ok: true });
  });

  // DELETE /api/projects/:id — Confirmed two-phase cascade: VM containers + images + cache + disk + Supabase + Redis + DB
  fastify.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.user;

    const project = await prisma.project.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
      include: { deployments: true },
    });
    if (!project) return reply.code(404).send({ error: "Project not found" });

    const deploymentIds = project.deployments.map((d: any) => d.id);
    const { cleanupProjectResources } = await import("../lib/resource-cleaner.js");

    try {
      // 1. Two-phase teardown: Stop & remove containers, remove Docker images, prune BuildKit cache, delete disk files, purge Supabase & Redis
      const cleanupResult = await cleanupProjectResources(id, project.slug, deploymentIds);

      // 2. Strict Verification Guard: If ANY resource is still attached, DO NOT DELETE FROM DB
      if (!cleanupResult.verified) {
        return reply.code(409).send({
          error: "Project deletion aborted: resources could not be detached or verified.",
          details: cleanupResult.error || "Some VM containers, disk files, or storage objects could not be released.",
          remaining: cleanupResult.remainingResources,
        });
      }

      // 3. Database Deletion (only executed after verified release of all attached resources)
      await prisma.project.delete({ where: { id } });

      return reply.send({
        ok: true,
        message: `Project ${project.slug} and all attached VM containers, images, disk files, Supabase archives, and Redis keys were completely released and verified.`,
        audit: cleanupResult,
      });
    } catch (err: any) {
      return reply.code(500).send({
        error: "Failed to release project resources",
        details: err.message,
      });
    }
  });
}

// Global hook exception for Caddy Verify Endpoint
export async function caddyVerifyRoutes(fastify: FastifyInstance) {
  // GET /api/verify-domain?domain=...
  // Called by Caddy on-demand TLS to authorize SSL certificate issuance
  fastify.get("/verify-domain", async (request, reply) => {
    const { domain } = request.query as { domain?: string };
    if (!domain) return reply.code(400).send("Missing domain");

    const exists = await prisma.customDomain.findUnique({ where: { domain } });
    if (exists) {
      return reply.code(200).send("OK");
    } else {
      return reply.code(404).send("Not Found");
    }
  });
}
