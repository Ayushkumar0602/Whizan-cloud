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
import { analyzeRepositoryWithAI } from "../lib/gemini-analyzer.js";
import { checkVmOnline } from "../lib/vm-status.js";

export const serviceQueue = new Queue("service-build", {
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

const BaseServiceSchema = z.object({
  name: z.string().min(1).max(60),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/, "Slug must be lowercase alphanumeric with internal hyphens (cannot start or end with a hyphen)"),
  githubRepoUrl: z.union([z.string().url(), z.literal("direct-upload"), z.literal("")]).default("direct-upload"),
  branch: z.string().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._\-\/]*$/, "Invalid git branch name. Must start with alphanumeric and not contain shell metacharacters").default("main"),
  language: z.enum(["NODEJS", "PYTHON", "GO", "DOCKERFILE"]).default("NODEJS"),
  rootDir: z.string().max(200).default("."),
  installCommand: z.string().max(500).default("npm install"),
  startCommand: z.string().max(500).default("npm start"),
  internalPort: z.number().int().min(0).max(65535).default(8000),
  isWorker: z.boolean().default(false),
  isPublic: z.boolean().default(false),
  autoSleep: z.boolean().default(false),
  instanceType: z.enum(["free", "starter", "standard", "pro", "pro_plus"]).default("starter"),
  cpuLimit: z.number().min(0.1).max(8.0).optional(),
  memoryLimit: z.number().int().min(256).max(16384).optional(),
  guardrailRejectReason: z.string().optional(),
});

const CreateServiceSchema = BaseServiceSchema.extend({
  envVars: z.record(z.string(), z.any()).optional(),
});

const UpdateServiceSchema = BaseServiceSchema.partial().omit({ slug: true });

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
    const { userId, role } = request.user;
    const query = request.query as { all?: string };
    const whereClause = role === "ADMIN" && query?.all === "true" ? {} : { userId };
    return prisma.backendService.findMany({
      where: whereClause,
      include: { deployments: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
  });

  // POST /api/services/analyze (AI Repository Analyzer with Gemini 3.5 Flash Lite)
  fastify.post("/analyze", async (request, reply) => {
    const input = (request.body as any) || {};
    let { githubRepoUrl, branch = "main", readme, fileList, packageJson, requirementsTxt, dockerfile, envExample, manifestFiles } = input;

    // Automatically inspect remote GitHub repositories
    if (githubRepoUrl && githubRepoUrl.includes("github.com")) {
      try {
        const cleanUrl = githubRepoUrl.replace(/\.git$/, "").replace(/\/+$/, "");
        const match = cleanUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (match) {
          const [, owner, repo] = match;
          const headers: Record<string, string> = { "User-Agent": "Whizan-Cloud-Service" };
          if (process.env.GITHUB_TOKEN) {
            headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
          }

          const branchesToTry = [branch, "main", "master"];
          let foundBranch = branch;

          for (const b of branchesToTry) {
            const check = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${b}/README.md`, { headers }).catch(() => null);
            if (check && check.ok) {
              foundBranch = b;
              if (!readme) readme = await check.text();
              break;
            }
          }

          if (!readme) {
            const rstCheck = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${foundBranch}/README.rst`, { headers }).catch(() => null);
            if (rstCheck && rstCheck.ok) readme = await rstCheck.text();
          }

          const [pkgRes, reqRes, dockRes, envRes, treeRes] = await Promise.all([
            !packageJson ? fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${foundBranch}/package.json`, { headers }).catch(() => null) : null,
            !requirementsTxt ? fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${foundBranch}/requirements.txt`, { headers }).catch(() => null) : null,
            !dockerfile ? fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${foundBranch}/Dockerfile`, { headers }).catch(() => null) : null,
            !envExample ? fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${foundBranch}/.env.example`, { headers }).catch(() => null) : null,
            !fileList ? fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${foundBranch}?recursive=1`, { headers }).catch(() => null) : null,
          ]);

          if (pkgRes && pkgRes.ok) packageJson = await pkgRes.text();
          if (reqRes && reqRes.ok) requirementsTxt = await reqRes.text();
          if (dockRes && dockRes.ok) dockerfile = await dockRes.text();
          if (envRes && envRes.ok) envExample = await envRes.text();
          if (treeRes && treeRes.ok) {
            const treeData: any = await treeRes.json();
            if (Array.isArray(treeData?.tree)) {
              fileList = treeData.tree.map((t: any) => t.path);
            }
          }
        }
      } catch (ghErr: any) {
        console.warn(`[analyze] Failed to fetch remote github files: ${ghErr.message}`);
      }
    }

    try {
      const result = await analyzeRepositoryWithAI({
        readme,
        fileList,
        packageJson,
        requirementsTxt,
        dockerfile,
        envExample,
        manifestFiles,
      });
      return { success: true, analysis: result };
    } catch (err: any) {
      return reply.code(500).send({
        success: false,
        error: `Failed to analyze repository: ${err.message}`,
      });
    }
  });

  // POST /api/services
  fastify.post("/", async (request, reply) => {
    const body = CreateServiceSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    if (body.data.guardrailRejectReason) {
      return reply.code(422).send({
        error: "Deployment refused by Whizan System Guardrail.",
        rejectionReason: body.data.guardrailRejectReason,
      });
    }

    const { userId } = request.user;
    let finalSlug = body.data.slug;
    let slugTaken = await prisma.backendService.findUnique({ where: { slug: finalSlug } });
    
    // Check if user already owns this service slug
    if (slugTaken && slugTaken.userId === userId) {
      return reply.code(409).send({
        error: `Service with slug '${finalSlug}' already exists in your account.`,
        existingService: slugTaken,
        instructions: `To deploy to this existing service, call whizan_deploy_direct with targetType: 'service' and targetId: '${slugTaken.id}'.`,
      });
    }

    // Also ensure slug doesn't conflict with frontend projects
    let projectSlugTaken = await prisma.project.findUnique({ where: { slug: finalSlug } });
    
    if (slugTaken || projectSlugTaken) {
      finalSlug = `${finalSlug}-${userId.replace(/-/g, '').substring(0, 5)}`;
      let secondCheck = await prisma.backendService.findUnique({ where: { slug: finalSlug } });
      if (secondCheck) {
        finalSlug = `${finalSlug}-${Math.random().toString(36).substring(2, 6)}`;
      }
    }

    // Subscription Tier Enforcement:
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true },
    });
    const isProfessional = (userRecord as any)?.subscriptionTier === "PROFESSIONAL";

    let instanceType = body.data.instanceType || (isProfessional ? "starter" : "free");
    let cpuLimit = body.data.cpuLimit;
    let memoryLimit = body.data.memoryLimit;
    let autoSleep = body.data.autoSleep ?? (!isProfessional);

    if (!isProfessional) {
      // Strict Hobby Tier enforcement:
      // Agents and users on Hobby Plan are locked to free tier: 0.1 vCPU, 512MB RAM, autoSleep = true
      instanceType = "free";
      cpuLimit = 0.1;
      memoryLimit = 512;
      autoSleep = true;
    } else {
      // Professional users can customize compute
      if (autoSleep) {
        instanceType = "free";
        cpuLimit = 0.1;
        memoryLimit = 512;
      } else {
        const tier = INSTANCE_TIERS[instanceType] || INSTANCE_TIERS.starter;
        if (!cpuLimit) cpuLimit = tier.cpu;
        if (!memoryLimit) memoryLimit = tier.memory;
      }
    }

    const { envVars, isWorker, guardrailRejectReason, ...serviceFields } = body.data;

    let internalPort = serviceFields.internalPort ?? 8000;
    if (isWorker) {
      internalPort = 0;
    }

    try {
      const service = await prisma.backendService.create({
        data: {
          ...serviceFields,
          internalPort,
          slug: finalSlug,
          instanceType,
          cpuLimit,
          memoryLimit,
          userId,
        },
      });

      if (envVars && Object.keys(envVars).length > 0) {
        try {
          const { encrypt } = await import("../lib/crypto.js");
          const operations = Object.entries(envVars).map(([rawKey, rawVal]) => {
            const key = String(rawKey).trim();
            const valStr = typeof rawVal === "object" && rawVal !== null ? JSON.stringify(rawVal) : String(rawVal ?? "");
            const encryptedValue = encrypt(valStr);
            return prisma.serviceEnvVariable.upsert({
              where: { serviceId_key: { serviceId: service.id, key } },
              update: { value: encryptedValue, isSecret: true },
              create: { serviceId: service.id, key, value: encryptedValue, isSecret: true },
            });
          });
          await prisma.$transaction(operations);
        } catch (err: any) {
          fastify.log.error(`Failed to batch save initial envVars for service ${service.id}: ${err.message}`);
        }
      }

      return reply.code(201).send(service);
    } catch (createErr: any) {
      fastify.log.error(`[POST /api/services] Failed to create service: ${createErr.message}`);
      return reply.code(500).send({
        error: "Failed to create service",
        message: createErr.message,
      });
    }
  });

  // GET /api/services/:id
  fastify.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.user;
    const service = await prisma.backendService.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
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
    delete patchData.isWorker;
    delete patchData.guardrailRejectReason;
    if (body.data.isWorker !== undefined) {
      if (body.data.isWorker) patchData.internalPort = 0;
    }

    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true },
    });
    const isProfessional = (userRecord as any)?.subscriptionTier === "PROFESSIONAL";

    // Hobby plan is strictly locked to free tier
    if (!isProfessional) {
      patchData.instanceType = "free";
      patchData.cpuLimit = 0.1;
      patchData.memoryLimit = 512;
      patchData.autoSleep = true;
    } else {
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
    }

    try {
      const updated = await prisma.backendService.update({
        where: { id },
        data: patchData,
      });
      return updated;
    } catch (updateErr: any) {
      fastify.log.error(`[PUT /api/services/${id}] Failed to update service: ${updateErr.message}`);
      return reply.code(500).send({
        error: "Failed to update service",
        message: updateErr.message,
      });
    }
  });

  // DELETE /api/services/:id
  fastify.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;
    const existing = await prisma.backendService.findFirst({ where: { id, userId } });
    if (!existing) return reply.code(404).send({ error: "Service not found" });

    try {
      const deployments = await prisma.serviceDeployment.findMany({
        where: { serviceId: id },
        select: { id: true },
      });
      const deploymentIds = deployments.map(d => d.id);

      const { cleanupServiceResources } = await import("../lib/resource-cleaner.js");
      await cleanupServiceResources(id, existing.slug, deploymentIds);
    } catch (cleanupErr) {
      console.error(`Failed to cleanup resources for service ${existing.slug}`, cleanupErr);
    }

    // Database Deletion (Cascades to Deployments & EnvVars)
    await prisma.backendService.delete({ where: { id } });
    return reply.code(204).send();
  });

  // POST /api/services/:id/deploy
  fastify.post("/:id/deploy", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;

    let service = await prisma.backendService.findFirst({ where: { id, userId } });
    if (!service) return reply.code(404).send({ error: "Service not found" });

    // Allow user or MCP to optionally update repository details on redeploy
    const body = request.body as {
      githubRepoUrl?: string;
      branch?: string;
      rootDir?: string;
      installCommand?: string;
      startCommand?: string;
      commitMessage?: string;
    } | undefined;

    if (body?.githubRepoUrl !== undefined) {
      service = await prisma.backendService.update({
        where: { id },
        data: {
          githubRepoUrl: body.githubRepoUrl || "direct-upload",
          ...(body.branch ? { branch: body.branch } : {}),
          ...(body.rootDir ? { rootDir: body.rootDir } : {}),
          ...(body.installCommand ? { installCommand: body.installCommand } : {}),
          ...(body.startCommand ? { startCommand: body.startCommand } : {}),
        },
      });
    }

    const vmStatus = await checkVmOnline();
    if (!vmStatus.vmOnline) {
      const userName = (request.user as any)?.name || request.user?.email?.split("@")[0] || "Developer";
      return reply.code(503).send({
        error: "VM_OFFLINE_MAINTENANCE",
        code: "MAINTENANCE_PAUSED",
        message: `Dear ${userName}, the request cannot be processed because the administration has temporarily stopped new deployments and serving existing applications until further notice.`,
        contactEmail: vmStatus.contactEmail,
        contactUrl: vmStatus.contactUrl,
      });
    }

    const inProgress = await prisma.serviceDeployment.findFirst({
      where: { serviceId: id, status: { in: ["QUEUED", "BUILDING"] } },
      orderBy: { createdAt: "desc" },
    });
    if (inProgress) {
      const isStale = Date.now() - new Date(inProgress.createdAt).getTime() > 180_000; // 3 minutes
      const force = (request.query as any)?.force === "true" || request.headers["x-force-deploy"] === "true";
      if (isStale || force) {
        await prisma.serviceDeployment.update({
          where: { id: inProgress.id },
          data: { status: "FAILED", buildFinishedAt: new Date(), errorMessage: "Deployment timed out or was superseded" },
        }).catch(() => {});
      } else {
        return reply.code(409).send({ error: "A deployment is already in progress", deployment: inProgress });
      }
    }

    const deployment = await prisma.serviceDeployment.create({
      data: {
        serviceId: id,
        commitHash: "manual",
        commitMessage: body?.commitMessage || (body?.githubRepoUrl ? `Redeploy from ${body.githubRepoUrl}` : "Manual redeploy"),
        branch: service.branch,
        status: "QUEUED",
      },
    });

    const isDirectUpload = !service.githubRepoUrl || service.githubRepoUrl === "direct-upload" || service.githubRepoUrl.trim() === "";
    const repoUrl = isDirectUpload ? "direct-upload" : await getAuthenticatedGitUrl(service.githubRepoUrl, userId);

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
      isDirectUpload,
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

    const vmStatus = await checkVmOnline();
    if (!vmStatus.vmOnline) {
      const userName = (request.user as any)?.name || request.user?.email?.split("@")[0] || "Developer";
      return reply.code(503).send({
        error: "VM_OFFLINE_MAINTENANCE",
        code: "MAINTENANCE_PAUSED",
        message: `Dear ${userName}, the request cannot be processed because the administration has temporarily stopped new deployments and serving existing applications until further notice.`,
        contactEmail: vmStatus.contactEmail,
        contactUrl: vmStatus.contactUrl,
      });
    }

    const inProgress = await prisma.serviceDeployment.findFirst({
      where: { serviceId: id, status: { in: ["QUEUED", "BUILDING"] } },
      orderBy: { createdAt: "desc" },
    });
    if (inProgress) {
      const isStale = Date.now() - new Date(inProgress.createdAt).getTime() > 180_000; // 3 minutes
      const force = (request.query as any)?.force === "true" || request.headers["x-force-deploy"] === "true";
      if (isStale || force) {
        await prisma.serviceDeployment.update({
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
        error: `Archive payload exceeds the 50MB limit (${(buffer.length / (1024 * 1024)).toFixed(1)}MB). Please ensure venv/, virtual environments, and bulky datasets are excluded in your .gitignore.`
      });
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
      await prisma.serviceDeployment.update({
        where: { id: deployment.id },
        data: { status: "FAILED", buildFinishedAt: new Date(), errorMessage: `Failed to stage archive in Redis: ${redisErr.message}` },
      });
      return reply.code(500).send({ error: "Failed to stage archive in Redis: " + redisErr.message });
    }

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

  const FlexibleEnvValue = z.any().transform((v) => {
    if (typeof v === "object" && v !== null) return JSON.stringify(v);
    return String(v ?? "");
  });

  const EnvSchema = z.object({
    key: z.string().min(1).regex(/^[a-zA-Z0-9_.-]+$/, "Keys must contain alphanumeric characters, underscores, hyphens, or dots"),
    value: FlexibleEnvValue,
    isSecret: z.boolean().default(true),
  });

  const BulkEnvSchema = z.object({
    envVars: z.record(z.string(), z.any()),
    isSecret: z.boolean().default(true),
  });

  // GET /api/services/:id/env
  fastify.get("/:id/env", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.user;
    const service = await prisma.backendService.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId }
    });
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
    const { userId, role } = request.user;
    const body = EnvSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const service = await prisma.backendService.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId }
    });
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

  // POST /api/services/:id/env/bulk
  fastify.post("/:id/env/bulk", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.user;
    const body = BulkEnvSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const service = await prisma.backendService.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId }
    });
    if (!service) return reply.code(404).send({ error: "Service not found" });

    const { encrypt } = await import("../lib/crypto.js");
    const isSecret = body.data.isSecret ?? true;
    const entries = Object.entries(body.data.envVars);

    const savedKeys: string[] = [];
    const operations = entries.map(([rawKey, rawVal]) => {
      const key = String(rawKey).trim();
      const valStr = typeof rawVal === "object" && rawVal !== null ? JSON.stringify(rawVal) : String(rawVal ?? "");
      const encryptedValue = encrypt(valStr);
      savedKeys.push(key);
      return prisma.serviceEnvVariable.upsert({
        where: { serviceId_key: { serviceId: id, key } },
        update: { value: encryptedValue, isSecret },
        create: { serviceId: id, key, value: encryptedValue, isSecret },
      });
    });

    if (operations.length > 0) {
      await prisma.$transaction(operations);
    }

    return reply.code(200).send({
      success: true,
      count: savedKeys.length,
      keys: savedKeys,
    });
  });

  // DELETE /api/services/:id/env/:key
  fastify.delete("/:id/env/:key", async (request, reply) => {
    const { id, key } = request.params as { id: string; key: string };
    const { userId, role } = request.user;
    const service = await prisma.backendService.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId }
    });
    if (!service) return reply.code(404).send({ error: "Service not found" });

    await prisma.serviceEnvVariable.deleteMany({ where: { serviceId: id, key } });
    return reply.code(204).send();
  });

  // GET /api/services/deployments/:dId
  fastify.get("/deployments/:dId", async (request, reply) => {
    const { dId } = request.params as { id: string; dId: string };
    const { userId, role } = request.user;
    const deployment = await prisma.serviceDeployment.findUnique({ where: { id: dId } });
    if (!deployment) return reply.code(404).send({ error: "Deployment not found" });

    const service = await prisma.backendService.findUnique({ where: { id: deployment.serviceId } });
    if (!service || (service.userId !== userId && role !== "ADMIN")) return reply.code(404).send({ error: "Not found" });

    return reply.send(deployment);
  });

  // GET /api/services/deployments/:dId/logs — SSE (token auth) or JSON (API key / token)
  fastify.get("/deployments/:dId/logs", async (request, reply) => {
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
    const deployment = await prisma.serviceDeployment.findUnique({
      where: { id: dId },
      include: { service: true },
    });
    const isUserAnAdmin = (authUser as any).role === "ADMIN";
    if (!deployment || (!isUserAnAdmin && deployment.service.userId !== authUser.userId)) {
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
      const BASE_DOMAIN = process.env.BASE_DOMAIN || "20.2.136.11.nip.io";
      const liveUrl = deployment.containerPort ? `http://${deployment.service.slug}.${BASE_DOMAIN}` : null;
      return reply.send({
        deploymentId: dId,
        serviceId: deployment.serviceId,
        slug: deployment.service.slug,
        status: deployment.status,
        liveUrl,
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

    if (["FAILED", "CANCELLED"].includes(deployment.status)) {
      sendEvent("__DONE__");
      reply.raw.end();
      return;
    }

    if (
      !isLiveRequested &&
      deployment.status === "READY" &&
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

    const tickChan = `metrics:tick:${id}`;
    let isClosed = false;

    // Send initial snapshot event
    sendEvent({
      type: "init",
      history,
      current: history.length > 0 ? history[history.length - 1] : null,
      slug: service.slug,
    });

    let lastTickAt = Date.now();
    const onTickMessage = (channel: string, message: string) => {
      if (channel === tickChan && !isClosed) {
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
    };

    redisSub.on("message", onTickMessage);
    await redisSub.subscribe(tickChan).catch(() => {});

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
      redisSub.off("message", onTickMessage);
      redisSub.unsubscribe(tickChan).catch(() => {});
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

    // 4b. Remote Exec Bridge to Compute Worker via Redis Pub/Sub
    const sessionId = `exec_${randomUUID()}`;
    const readyChan = `exec:ready:${sessionId}`;
    const outChan = `exec:out:${sessionId}`;
    const errorChan = `exec:error:${sessionId}`;
    const exitChan = `exec:exit:${sessionId}`;

    let isSessionActive = true;
    let lineBuffer = "";

    let timeoutTimer: NodeJS.Timeout | null = null;

    const onSessionMessage = (subChan: string, subMsg: string) => {
      if (!isSessionActive) return;

      if (subChan === readyChan) {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        try {
          const data = JSON.parse(subMsg);
          socket.send(JSON.stringify({
            type: "connected",
            container: data.container,
            workingDir: data.workingDir,
            slug: service.slug,
          }));
        } catch {}
      } else if (subChan === outChan) {
        try {
          const text = Buffer.from(subMsg, "base64").toString("utf8");
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({ type: "output", data: text }));
          }
        } catch {}
      } else if (subChan === exitChan) {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: "exit" }));
          socket.close(1000, "Process exited");
        }
        cleanupBridge();
      } else if (subChan === errorChan) {
        if (timeoutTimer) clearTimeout(timeoutTimer);
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
    };

    const cleanupBridge = async () => {
      if (!isSessionActive) return;
      isSessionActive = false;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      await redisClient.publish(`exec:close:${sessionId}`, "1").catch(() => {});
      redisSub.off("message", onSessionMessage);
      await redisSub.unsubscribe(readyChan, outChan, errorChan, exitChan).catch(() => {});
    };

    redisSub.on("message", onSessionMessage);
    await redisSub.subscribe(readyChan, outChan, errorChan, exitChan).catch(() => {});

    timeoutTimer = setTimeout(() => {
      if (isSessionActive) {
        socket.send(JSON.stringify({
          type: "error",
          message: `Connection timeout: Build worker did not respond. If the container is sleeping, wake it up first.`
        }));
        socket.close(4004, "Worker timeout");
        cleanupBridge();
      }
    }, 12_000);

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

    // Send open session request to Compute Worker
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
    targetSlug: z.string().min(1).max(60).regex(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/, "Invalid target slug format"),
    targetPort: z.number().int().min(1).max(65535).default(8000),
    path: z.string().max(200).default("/"),
  });

  fastify.post("/mesh/ping", async (request, reply) => {
    const parseResult = MeshPingSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues[0]?.message });
    }

    const { targetSlug, targetPort, path: rawPath } = parseResult.data;
    const { userId, role } = request.user;

    // Prevent cross-tenant probing or SSRF
    if (role !== "ADMIN") {
      const owned = await prisma.backendService.findFirst({
        where: { slug: targetSlug, userId },
      });
      if (!owned) {
        return reply.status(403).send({ error: `Forbidden: Service '${targetSlug}' not found in your account.` });
      }
    }

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

