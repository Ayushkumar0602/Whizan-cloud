import type { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma.js";
import { redisClient } from "../lib/redis.js";
import { encrypt, decrypt } from "../lib/crypto.js";

const FUNCTIONS_BASE_DIR =
  process.env.FUNCTIONS_BASE_DIR ||
  (process.env.NODE_ENV === "production" ? "/opt/whizan/functions" : path.resolve(process.cwd(), "../../functions-storage"));

if (!fs.existsSync(FUNCTIONS_BASE_DIR)) {
  fs.mkdirSync(FUNCTIONS_BASE_DIR, { recursive: true });
}

const RUNTIME_PORT = Number(process.env.FUNCTION_RUNTIME_PORT) || 9090;

const CreateFunctionSchema = z.object({
  name: z.string().min(1).max(60),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/, "Slug must be lowercase alphanumeric with internal hyphens"),
  runtime: z.enum(["EDGE_TYPESCRIPT", "NODEJS_20", "PYTHON_311", "GOLANG_122"]).default("EDGE_TYPESCRIPT"),
  entryFile: z.string().default("index.ts"),
  timeoutMs: z.number().int().min(100).max(60000).default(10000),
  memoryLimit: z.number().int().min(64).max(1024).default(128),
  minInstances: z.number().int().min(0).max(10).default(0),
  maxConcurrency: z.number().int().min(1).max(50).default(10),
  isPublic: z.boolean().default(false),
  corsOrigins: z.array(z.string()).default(["*"]),
  envVars: z.record(z.string(), z.any()).optional(),
  initialCode: z.string().optional(),
});

const UpdateFunctionSchema = CreateFunctionSchema.partial().omit({ slug: true });

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(60).default("Production Key"),
  scopes: z.array(z.string()).default(["EXECUTE"]),
  rateLimitRpm: z.number().int().min(10).max(10000).default(600),
  ipWhitelist: z.array(z.string()).default([]),
});

const DeployCodeSchema = z.object({
  code: z.string().min(1, "Function code cannot be empty"),
});

/**
 * Re-hydrates Redis routing keys and API key caches on boot or VM restart.
 */
export async function rehydrateEdgeFunctions(): Promise<void> {
  try {
    const services = await prisma.functionService.findMany({
      include: {
        deployments: { where: { status: "READY" }, orderBy: { version: "desc" }, take: 1 },
        apiKeys: true,
        envVariables: true,
      },
    });

    let keysCount = 0;
    for (const service of services) {
      const activeDep = service.deployments[0];
      if (activeDep) {
        // Decrypt env vars for runtime
        const decryptedEnv: Record<string, string> = {};
        for (const ev of service.envVariables) {
          try {
            decryptedEnv[ev.key] = decrypt(ev.value);
          } catch {}
        }

        const meta = {
          serviceId: service.id,
          slug: service.slug,
          version: activeDep.version,
          bundlePath: activeDep.bundlePath,
          isPublic: service.isPublic,
          timeoutMs: service.timeoutMs,
          memoryLimit: service.memoryLimit,
          corsOrigins: service.corsOrigins,
          decryptedEnv,
        };

        await redisClient.set(`fn:service:${service.slug}`, JSON.stringify(meta));
      }

      // Cache API Keys
      for (const key of service.apiKeys) {
        const keyMeta = {
          serviceId: service.id,
          slug: service.slug,
          scopes: key.scopes,
          rateLimitRpm: key.rateLimitRpm,
          ipWhitelist: key.ipWhitelist,
          expiresAt: key.expiresAt,
        };
        await redisClient.set(`fn:key:${key.keyHash}`, JSON.stringify(keyMeta), "EX", 28800);
        keysCount++;
      }
    }

    console.log(`[Whizan Edge Functions] Rehydration complete: ${services.length} services and ${keysCount} API keys restored to Redis.`);
  } catch (err: any) {
    console.error(`[Whizan Edge Functions] Error during rehydration:`, err.message);
  }
}

export async function functionRoutes(fastify: FastifyInstance) {
  // ── Public / Internal Endpoints (No JWT required) ──────────────────────────

  // Internal route for Edge Router cache-miss fallback
  fastify.get("/internal/resolve/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const service = await prisma.functionService.findUnique({
      where: { slug },
      include: {
        deployments: { where: { status: "READY" }, orderBy: { version: "desc" }, take: 1 },
        envVariables: true,
      },
    });

    if (!service || !service.deployments[0]) {
      return reply.code(404).send({ error: "SERVICE_NOT_FOUND" });
    }

    const activeDep = service.deployments[0];
    const decryptedEnv: Record<string, string> = {};
    for (const ev of service.envVariables) {
      try {
        decryptedEnv[ev.key] = decrypt(ev.value);
      } catch {}
    }

    const meta = {
      serviceId: service.id,
      slug: service.slug,
      version: activeDep.version,
      bundlePath: activeDep.bundlePath,
      isPublic: service.isPublic,
      timeoutMs: service.timeoutMs,
      memoryLimit: service.memoryLimit,
      corsOrigins: service.corsOrigins,
      decryptedEnv,
    };

    // Hydrate Redis with 10-minute TTL
    await redisClient.set(`fn:service:${slug}`, JSON.stringify(meta), "EX", 600);
    return meta;
  });

  // Internal route for Edge Router API key verification fallback
  fastify.post("/internal/verify-key", async (request, reply) => {
    const { keyHash, serviceId } = request.body as { keyHash: string; serviceId: string };
    const key = await prisma.functionApiKey.findFirst({
      where: { keyHash, serviceId },
      include: { service: { select: { slug: true } } },
    });

    if (!key) {
      return reply.code(401).send({ error: "INVALID_KEY" });
    }

    // Check expiration
    if (key.expiresAt && new Date() > key.expiresAt) {
      return reply.code(401).send({ error: "KEY_EXPIRED" });
    }

    const keyMeta = {
      serviceId: key.serviceId,
      slug: key.service.slug,
      scopes: key.scopes,
      rateLimitRpm: key.rateLimitRpm,
      ipWhitelist: key.ipWhitelist,
      expiresAt: key.expiresAt,
    };

    // Hydrate Redis with 8-hour TTL
    await redisClient.set(`fn:key:${keyHash}`, JSON.stringify(keyMeta), "EX", 28800);
    // Update lastUsedAt asynchronously
    prisma.functionApiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

    return keyMeta;
  });

  // ── Authenticated User Routes ──────────────────────────────────────────────

  fastify.addHook("preHandler", async (request, reply) => {
    if (request.url.startsWith("/api/functions/internal") || request.url.includes("/logs")) return;
    await fastify.authenticate(request, reply);
  });

  // GET /api/functions - List user functions
  fastify.get("/", async (request) => {
    const { userId, role } = request.user;
    const query = request.query as { all?: string };
    const whereClause = role === "ADMIN" && query?.all === "true" ? {} : { userId };

    const functions = await prisma.functionService.findMany({
      where: whereClause,
      include: {
        deployments: { orderBy: { version: "desc" }, take: 1 },
        endpoints: true,
        apiKeys: { select: { id: true, name: true, keyPrefix: true, rateLimitRpm: true, lastUsedAt: true } },
        _count: { select: { invocations: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return functions;
  });

  // POST /api/functions - Create a new Function Service
  fastify.post("/", async (request, reply) => {
    const { userId } = request.user;
    const body = CreateFunctionSchema.parse(request.body);

    // Slug collision validation across Projects, Backend Services, and Function Services
    const [existingProject, existingService, existingFn] = await Promise.all([
      prisma.project.findUnique({ where: { slug: body.slug } }),
      prisma.backendService.findUnique({ where: { slug: body.slug } }),
      prisma.functionService.findUnique({ where: { slug: body.slug } }),
    ]);

    if (existingProject || existingService || existingFn) {
      return reply.code(409).send({
        error: "SLUG_CONFLICT",
        message: `The slug '${body.slug}' is already taken on Whizan Cloud. Please choose a unique name.`,
      });
    }

    const functionService = await prisma.functionService.create({
      data: {
        userId,
        name: body.name,
        slug: body.slug,
        runtime: body.runtime,
        entryFile: body.entryFile,
        timeoutMs: body.timeoutMs,
        memoryLimit: body.memoryLimit,
        minInstances: body.minInstances,
        maxConcurrency: body.maxConcurrency,
        isPublic: body.isPublic,
        corsOrigins: body.corsOrigins,
        endpoints: {
          create: {
            name: "default",
            routePath: "/",
            httpMethods: ["GET", "POST", "PUT", "DELETE"],
            handlerName: "default",
            isPublic: body.isPublic,
          },
        },
      },
    });

    // Store encrypted env vars if supplied
    if (body.envVars) {
      for (const [k, v] of Object.entries(body.envVars)) {
        if (v !== undefined && v !== null) {
          await prisma.functionEnvVariable.create({
            data: {
              serviceId: functionService.id,
              key: k,
              value: encrypt(String(v)),
              isSecret: true,
            },
          });
        }
      }
    }

    // Automatically generate a primary Function API Key
    const rawSecret = crypto.randomBytes(32).toString("hex");
    const fullKey = `whz_fn_live_${rawSecret}`;
    const keyPrefix = `whz_fn_live_${rawSecret.slice(0, 6)}...`;
    const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");

    const apiKey = await prisma.functionApiKey.create({
      data: {
        serviceId: functionService.id,
        name: "Default API Key",
        keyHash,
        keyPrefix,
        scopes: ["EXECUTE", "READ_LOGS"],
        rateLimitRpm: 600,
      },
    });

    // Cache key in Redis
    await redisClient.set(
      `fn:key:${keyHash}`,
      JSON.stringify({
        serviceId: functionService.id,
        slug: functionService.slug,
        scopes: apiKey.scopes,
        rateLimitRpm: apiKey.rateLimitRpm,
        ipWhitelist: apiKey.ipWhitelist,
      }),
      "EX",
      28800
    );

    // Deploy starter template code if initialCode provided or by default
    const starterCode =
      body.initialCode ||
      `// Whizan Edge Function: ${functionService.slug}\n` +
      `export default async function handler(req: Request, context: any) {\n` +
      `  const url = new URL(req.url);\n` +
      `  return Response.json({\n` +
      `    message: "Hello from Whizan Edge Function '${functionService.slug}'!",\n` +
      `    method: req.method,\n` +
      `    pathname: url.pathname,\n` +
      `    timestamp: new Date().toISOString()\n` +
      `  });\n` +
      `}\n`;

    let deploymentResult: any = null;
    try {
      const bundleRes: any = await fetch(`http://127.0.0.1:${RUNTIME_PORT}/bundle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: functionService.id,
          version: 1,
          rawCode: starterCode,
        }),
      }).then((r) => r.json());

      if (bundleRes?.bundlePath) {
        const deployment = await prisma.functionDeployment.create({
          data: {
            serviceId: functionService.id,
            version: 1,
            bundlePath: bundleRes.bundlePath,
            bundleHash: bundleRes.bundleHash,
            bundleSizeBytes: bundleRes.bundleSizeBytes,
            status: "READY",
          },
        });

        // Register route in Redis
        await redisClient.set(
          `fn:service:${functionService.slug}`,
          JSON.stringify({
            serviceId: functionService.id,
            slug: functionService.slug,
            version: 1,
            bundlePath: bundleRes.bundlePath,
            isPublic: functionService.isPublic,
            timeoutMs: functionService.timeoutMs,
            memoryLimit: functionService.memoryLimit,
            corsOrigins: functionService.corsOrigins,
            decryptedEnv: body.envVars || {},
          })
        );

        deploymentResult = deployment;
      }
    } catch (e: any) {
      console.warn(`[FunctionService] Initial bundling deferred or failed:`, e.message);
    }

    return reply.code(201).send({
      service: functionService,
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        key: fullKey, // Return plaintext ONCE
        keyPrefix: apiKey.keyPrefix,
      },
      deployment: deploymentResult,
      invocationUrl: `http://${functionService.slug}.fn.${process.env.BASE_DOMAIN || "localhost:8080"}`,
    });
  });

  // GET /api/functions/:id - Get function details
  fastify.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.user;

    const fn = await prisma.functionService.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
      include: {
        deployments: { orderBy: { version: "desc" } },
        endpoints: true,
        apiKeys: { select: { id: true, name: true, keyPrefix: true, rateLimitRpm: true, lastUsedAt: true, scopes: true, createdAt: true } },
        envVariables: { select: { id: true, key: true, createdAt: true } },
        triggers: true,
      },
    });

    if (!fn) {
      return reply.code(404).send({ error: "Function not found" });
    }

    return fn;
  });

  // PATCH /api/functions/:id - Update function configuration
  fastify.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.user;
    const body = UpdateFunctionSchema.parse(request.body);

    const existing = await prisma.functionService.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
      include: { deployments: { where: { status: "READY" }, orderBy: { version: "desc" }, take: 1 } },
    });

    if (!existing) {
      return reply.code(404).send({ error: "Function not found" });
    }

    const updated = await prisma.functionService.update({
      where: { id },
      data: body,
    });

    // Update Redis routing metadata
    const activeDep = existing.deployments[0];
    if (activeDep) {
      const rawMeta = await redisClient.get(`fn:service:${updated.slug}`);
      const meta = rawMeta ? JSON.parse(rawMeta) : {};
      const newMeta = {
        ...meta,
        serviceId: updated.id,
        slug: updated.slug,
        isPublic: updated.isPublic,
        timeoutMs: updated.timeoutMs,
        memoryLimit: updated.memoryLimit,
        corsOrigins: updated.corsOrigins,
      };
      await redisClient.set(`fn:service:${updated.slug}`, JSON.stringify(newMeta));
    }

    return updated;
  });

  // DELETE /api/functions/:id - Cascade delete Function Service
  fastify.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.user;

    const fn = await prisma.functionService.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
      include: { apiKeys: true },
    });

    if (!fn) {
      return reply.code(404).send({ error: "Function not found" });
    }

    // 1. Purge Redis routing and API keys
    await redisClient.del(`fn:service:${fn.slug}`);
    for (const key of fn.apiKeys) {
      await redisClient.del(`fn:key:${key.keyHash}`);
    }
    await redisClient.del(`fn:logs:${fn.id}`);
    await redisClient.del(`fn:logs:history:${fn.id}`);

    // 2. Signal runtime to evict bundles
    await redisClient.publish("fn:reload", JSON.stringify({ serviceId: fn.id }));

    // 3. Wipe bundle files from disk
    const serviceDiskPath = path.join(FUNCTIONS_BASE_DIR, fn.id);
    if (fs.existsSync(serviceDiskPath)) {
      try {
        fs.rmSync(serviceDiskPath, { recursive: true, force: true });
      } catch (err: any) {
        console.warn(`[FunctionService] Failed to remove disk directory:`, err.message);
      }
    }

    // 4. Delete database records
    await prisma.functionService.delete({ where: { id } });

    return { success: true, message: `Function '${fn.name}' cleanly deleted.` };
  });

  // POST /api/functions/:id/deploy - Deploy new version of code
  fastify.post("/:id/deploy", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.user;
    const body = DeployCodeSchema.parse(request.body);

    const fn = await prisma.functionService.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
      include: {
        deployments: { orderBy: { version: "desc" }, take: 1 },
        envVariables: true,
      },
    });

    if (!fn) {
      return reply.code(404).send({ error: "Function not found" });
    }

    const nextVersion = (fn.deployments[0]?.version || 0) + 1;

    // Call runtime bundler endpoint
    const bundleRes: any = await fetch(`http://127.0.0.1:${RUNTIME_PORT}/bundle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: fn.id,
        version: nextVersion,
        rawCode: body.code,
      }),
    }).then(async (r) => {
      if (!r.ok) {
        const errJson: any = await r.json().catch(() => ({}));
        throw new Error(errJson?.message || `Bundling failed with status ${r.status}`);
      }
      return r.json();
    });

    // Create Deployment record
    const deployment = await prisma.functionDeployment.create({
      data: {
        serviceId: fn.id,
        version: nextVersion,
        bundlePath: bundleRes.bundlePath,
        bundleHash: bundleRes.bundleHash,
        bundleSizeBytes: bundleRes.bundleSizeBytes,
        status: "READY",
      },
    });

    // Decrypt env vars for Redis caching
    const decryptedEnv: Record<string, string> = {};
    for (const ev of fn.envVariables) {
      try {
        decryptedEnv[ev.key] = decrypt(ev.value);
      } catch {}
    }

    // Update Redis route
    await redisClient.set(
      `fn:service:${fn.slug}`,
      JSON.stringify({
        serviceId: fn.id,
        slug: fn.slug,
        version: nextVersion,
        bundlePath: bundleRes.bundlePath,
        isPublic: fn.isPublic,
        timeoutMs: fn.timeoutMs,
        memoryLimit: fn.memoryLimit,
        corsOrigins: fn.corsOrigins,
        decryptedEnv,
      })
    );

    // Notify runtime to reload
    await redisClient.publish("fn:reload", JSON.stringify({ serviceId: fn.id, version: nextVersion }));

    return reply.code(201).send(deployment);
  });

  // POST /api/functions/:id/test - In-dashboard test console invocation
  fastify.post("/:id/test", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.user;
    const input = (request.body as any) || {};

    const fn = await prisma.functionService.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
      include: {
        deployments: { where: { status: "READY" }, orderBy: { version: "desc" }, take: 1 },
        envVariables: true,
      },
    });

    if (!fn || !fn.deployments[0]) {
      return reply.code(404).send({ error: "Function has no active deployment. Deploy code first." });
    }

    const activeDep = fn.deployments[0];
    const decryptedEnv: Record<string, string> = {};
    for (const ev of fn.envVariables) {
      try {
        decryptedEnv[ev.key] = decrypt(ev.value);
      } catch {}
    }

    const testPayload = {
      serviceId: fn.id,
      slug: fn.slug,
      version: activeDep.version,
      bundlePath: activeDep.bundlePath,
      routePath: input.path || "/",
      method: input.method || "POST",
      headers: input.headers || {},
      query: input.query || {},
      body: input.body || {},
      clientIp: request.ip || "127.0.0.1",
      timeoutMs: fn.timeoutMs,
      memoryLimit: fn.memoryLimit,
      envVars: decryptedEnv,
    };

    const res = await fetch(`http://127.0.0.1:${RUNTIME_PORT}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testPayload),
    }).then((r) => r.json());

    return res;
  });

  // GET /api/functions/:id/keys - List API Keys
  fastify.get("/:id/keys", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.user;

    const fn = await prisma.functionService.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
      select: { id: true },
    });
    if (!fn) return reply.code(404).send({ error: "Function not found" });

    return prisma.functionApiKey.findMany({
      where: { serviceId: id },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        rateLimitRpm: true,
        ipWhitelist: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  });

  // POST /api/functions/:id/keys - Generate a new API Key
  fastify.post("/:id/keys", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.user;
    const body = CreateApiKeySchema.parse(request.body);

    const fn = await prisma.functionService.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
    });
    if (!fn) return reply.code(404).send({ error: "Function not found" });

    const rawSecret = crypto.randomBytes(32).toString("hex");
    const fullKey = `whz_fn_live_${rawSecret}`;
    const keyPrefix = `whz_fn_live_${rawSecret.slice(0, 6)}...`;
    const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");

    const apiKey = await prisma.functionApiKey.create({
      data: {
        serviceId: fn.id,
        name: body.name,
        keyHash,
        keyPrefix,
        scopes: body.scopes,
        rateLimitRpm: body.rateLimitRpm,
        ipWhitelist: body.ipWhitelist,
      },
    });

    // Cache in Redis with 8h TTL
    await redisClient.set(
      `fn:key:${keyHash}`,
      JSON.stringify({
        serviceId: fn.id,
        slug: fn.slug,
        scopes: apiKey.scopes,
        rateLimitRpm: apiKey.rateLimitRpm,
        ipWhitelist: apiKey.ipWhitelist,
      }),
      "EX",
      28800
    );

    return reply.code(201).send({
      id: apiKey.id,
      name: apiKey.name,
      key: fullKey, // Return plaintext ONCE
      keyPrefix: apiKey.keyPrefix,
      createdAt: apiKey.createdAt,
    });
  });

  // DELETE /api/functions/:id/keys/:keyId - Revoke API Key
  fastify.delete("/:id/keys/:keyId", async (request, reply) => {
    const { id, keyId } = request.params as { id: string; keyId: string };
    const { userId, role } = request.user;

    const fn = await prisma.functionService.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
    });
    if (!fn) return reply.code(404).send({ error: "Function not found" });

    const key = await prisma.functionApiKey.findFirst({
      where: { id: keyId, serviceId: id },
    });
    if (!key) return reply.code(404).send({ error: "API Key not found" });

    // Purge from Redis immediately
    await redisClient.del(`fn:key:${key.keyHash}`);
    await prisma.functionApiKey.delete({ where: { id: keyId } });

    return { success: true, message: `API Key '${key.name}' revoked.` };
  });

  // GET /api/functions/:id/logs - Real-time SSE Log Stream
  fastify.get("/:id/logs", async (request, reply) => {
    const { id } = request.params as { id: string };

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("Access-Control-Allow-Origin", "*");

    // 1. Replay past 100 log lines from Redis list
    const history = await redisClient.lrange(`fn:logs:history:${id}`, -100, -1);
    for (const item of history) {
      reply.raw.write(`data: ${item}\n\n`);
    }

    // 2. Subscribe to real-time logs via dedicated subscriber
    const sub = redisClient.duplicate();
    await sub.subscribe(`fn:logs:${id}`);

    sub.on("message", (channel, message) => {
      if (channel === `fn:logs:${id}`) {
        reply.raw.write(`data: ${message}\n\n`);
      }
    });

    request.raw.on("close", () => {
      sub.unsubscribe();
      sub.disconnect();
    });
  });
}
