import "dotenv/config";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyWebsocket from "@fastify/websocket";
import fastifyMultipart from "@fastify/multipart";

import { authRoutes } from "./routes/auth.js";
import { projectRoutes, caddyVerifyRoutes } from "./routes/projects.js";
import { deploymentRoutes } from "./routes/deployments.js";
import { envRoutes } from "./routes/env.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { adminRoutes } from "./routes/admin.js";
import { serviceRoutes } from "./routes/services.js";
import { databaseRoutes } from "./routes/databases.js";
import { githubRoutes } from "./routes/github.js";
import { localOpencodeRoutes } from "./routes/local-opencode.js";
import { containerRoutes } from "./routes/containers.js";
import { redisClient } from "./lib/redis.js";
import { prisma } from "./lib/prisma.js";
import { startAnalyticsProcessor } from "./lib/analytics-processor.js";

startAnalyticsProcessor();

// ─── Startup Cleanup Routine ──────────────────────────────────────────────────
// If the VM crashes or reboots while a deployment is BUILDING or QUEUED, it will
// be stuck in that state forever. This resets them to FAILED so they can be redeployed.
try {
  const result = await prisma.deployment.updateMany({
    where: { status: { in: ["BUILDING", "QUEUED"] } },
    data: {
      status: "FAILED",
      errorMessage: "Build interrupted by system reboot or crash.",
      buildFinishedAt: new Date(),
    },
  });
  if (result.count > 0) {
    console.log(`[System] Reset ${result.count} stuck deployment(s) to FAILED.`);
  }
} catch (err) {
  console.error("[System] Failed to run startup cleanup routine:", err);
}

const app = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:standard" },
    },
  },
  trustProxy: true,
});

// ─── Plugins ─────────────────────────────────────────────────────────────────

await app.register(fastifyCors, {
  origin: (origin, cb) => {
    // Allow:
    // - No origin (server-to-server / curl)
    // - Configured DASHBOARD_URL (e.g. Render production URL)
    // - Any *.onrender.com subdomain (Render preview deploys)
    // - Any localhost / 127.0.0.1 (local dev)
    const allowed =
      !origin ||
      origin === (process.env.DASHBOARD_URL || "http://localhost:3000") ||
      /^https?:\/\/[a-z0-9-]+\.onrender\.com$/.test(origin) ||
      /^https?:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) ||
      /^http:\/\/localhost(:\d+)?$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
    cb(null, allowed);
  },
  credentials: true,
});

import crypto from "crypto";

await app.register(fastifyCookie, {
  secret: process.env.COOKIE_SECRET!,
});

await app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET!,
  sign: { expiresIn: "15m" },
});

import { isUserAdmin, isRootAdmin } from "./lib/auth-utils.js";

// Decorator so routes can use fastify.authenticate as a preHandler
// Supports both JWT tokens (cookies or Bearer) and API keys (whz_live_...)
app.decorate("authenticate", async (request: any, reply: any) => {
  const authHeader = request.headers.authorization;
  const apiKeyHeader = request.headers["x-api-key"];
  const rawKey = apiKeyHeader || (authHeader?.startsWith("Bearer whz_live_") ? authHeader.slice(7) : null);

  if (rawKey && typeof rawKey === "string" && rawKey.startsWith("whz_live_")) {
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    });

    if (apiKeyRecord) {
      const user = apiKeyRecord.user;
      const isRoot = isRootAdmin(user);
      const isAdmin = isUserAdmin(user);
      request.user = {
        userId: apiKeyRecord.userId,
        email: user.email,
        subscriptionTier: (user as any).subscriptionTier || "HOBBY",
        role: isRoot ? "ROOT_ADMIN" : (isAdmin ? ((user as any).role || "ADMIN") : ((user as any).role || "USER")),
        iamPermissions: (user as any).iamPermissions || "all",
      };
      // Update lastUsedAt asynchronously
      prisma.apiKey.update({ where: { id: apiKeyRecord.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
      return;
    }
    return reply.code(401).send({ error: "Invalid API key" });
  }

  try {
    await request.jwtVerify();
    if (request.user && request.user.userId) {
      const userRecord = await prisma.user.findUnique({
        where: { id: request.user.userId },
        select: { role: true, subscriptionTier: true, email: true, iamPermissions: true },
      });
      const isRoot = isRootAdmin({ ...userRecord, email: request.user.email });
      const isAdmin = isUserAdmin({ ...userRecord, email: request.user.email });
      request.user.role = isRoot ? "ROOT_ADMIN" : (isAdmin ? (userRecord?.role || "ADMIN") : (userRecord?.role || "USER"));
      request.user.iamPermissions = (userRecord as any)?.iamPermissions || "all";
      request.user.subscriptionTier = userRecord?.subscriptionTier || "HOBBY";
    }
  } catch {
    reply.code(401).send({ error: "Unauthorized" });
  }
});

// Decorator for platform administrative actions (ROOT_ADMIN, ADMIN, DEVOPS_ADMIN, SUPPORT_ADMIN)
app.decorate("requireAdmin", async (request: any, reply: any) => {
  await (app as any).authenticate(request, reply);
  if (reply.sent) return;

  const adminRoles = ["ROOT_ADMIN", "ADMIN", "DEVOPS_ADMIN", "SUPPORT_ADMIN"];
  if (!adminRoles.includes(request.user?.role)) {
    return reply.code(403).send({
      error: "Forbidden: Platform administrator privileges required.",
      code: "ADMIN_REQUIRED",
    });
  }
});

// Decorator for Root Admin (Super Admin) actions only (e.g. promoting/demoting other admins)
app.decorate("requireRootAdmin", async (request: any, reply: any) => {
  await (app as any).authenticate(request, reply);
  if (reply.sent) return;

  if (request.user?.role !== "ROOT_ADMIN" && !isRootAdmin(request.user)) {
    return reply.code(403).send({
      error: "Forbidden: Root Platform Administrator (Super Admin) privileges required.",
      code: "ROOT_ADMIN_REQUIRED",
    });
  }
});

await app.register(fastifyRateLimit, {
  max: 100,
  timeWindow: "1 minute",
  redis: redisClient,
});

await app.register(fastifyWebsocket);

await app.register(fastifyMultipart, {
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB max for direct code archives
  },
});

// ─── Routes ──────────────────────────────────────────────────────────────────

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(projectRoutes, { prefix: "/api/projects" });
await app.register(deploymentRoutes, { prefix: "/api/projects" });
await app.register(envRoutes, { prefix: "/api/projects" });
await app.register(webhookRoutes, { prefix: "/api/webhooks" });
await app.register(adminRoutes, { prefix: "/api/admin" });
await app.register(serviceRoutes, { prefix: "/api/services" });
await app.register(databaseRoutes, { prefix: "/api/databases" });
await app.register(githubRoutes, { prefix: "/api" });
await app.register(caddyVerifyRoutes, { prefix: "/api" });
await app.register(localOpencodeRoutes, { prefix: "/api/local-opencode" });
await app.register(containerRoutes, { prefix: "/api/containers" });

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get("/health", async () => ({ status: "ok", ts: Date.now() }));

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT || process.env.API_PORT) || 8000;

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`API running on http://0.0.0.0:${PORT}`);
} catch (err) {
  app.log.error(err);
  await prisma.$disconnect();
  process.exit(1);
}
