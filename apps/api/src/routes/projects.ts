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
    const { userId } = request.user;
    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) return reply.code(404).send({ error: "Project not found" });

    // Fetch the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const analytics = await prisma.projectAnalytics.findMany({
      where: { projectId: id, date: { gte: thirtyDaysAgo } },
      orderBy: { date: "asc" }
    });

    return analytics;
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
