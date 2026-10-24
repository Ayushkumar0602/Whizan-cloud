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
import { functionRoutes, rehydrateEdgeFunctions } from "./routes/functions.js";
import { cronRoutes } from "./routes/crons.js";
import { flowRoutes } from "./routes/flows.js";
import { agentRoutes } from "./routes/agent.js";
import { accountTerminalRoutes } from "./routes/terminal.js";
import { liveGatewayRoutes } from "./routes/live-gateway.js";
import { wafRoutes } from "./routes/waf.js";
import { storageRoutes } from "./routes/storage.js";
import { redisClient } from "./lib/redis.js";
import { prisma } from "./lib/prisma.js";
import { startAnalyticsProcessor } from "./lib/analytics-processor.js";

process.on("unhandledRejection", (reason: any) => {
  console.error("[Process] Unhandled Rejection (isolated):", reason?.message || reason);
});

process.on("uncaughtException", (err: any) => {
  console.error("[Process] Uncaught Exception (isolated):", err?.message || err);
});

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

// ─── Edge Functions Redis Rehydration ─────────────────────────────────────────
await rehydrateEdgeFunctions();

const app = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:standard" },
    },
  },
  trustProxy: true,
  bodyLimit: 100 * 1024 * 1024, // 100 MB max request body for file uploads
});

// ─── Plugins ─────────────────────────────────────────────────────────────────

await app.register(fastifyCors, {
  origin: (origin, cb) => {
    // Allow:
    // - No origin (server-to-server / curl)
    // - whizan.cloud domain and all subdomains (*.whizan.cloud)
    // - Configured DASHBOARD_URL
    // - Any *.onrender.com subdomain (Render preview deploys)
    // - Any *.vercel.app subdomain (Vercel preview deploys)
    // - Any localhost / 127.0.0.1 (local dev)
    const allowed =
      !origin ||
      origin === (process.env.DASHBOARD_URL || "http://localhost:3000") ||
      origin === "https://whizan.cloud" ||
      origin === "https://www.whizan.cloud" ||
      origin === "https://dashboard.whizan.cloud" ||
      origin === "https://api.whizan.cloud" ||
      /^https?:\/\/([a-z0-9-]+\.)*whizan\.cloud(:\d+)?$/.test(origin) ||
      /^https?:\/\/[a-z0-9-]+\.onrender\.com$/.test(origin) ||
      /^https?:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) ||
      /^http:\/\/localhost(:\d+)?$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
    cb(null, allowed);
  },
  credentials: true,
});

// Enforce HTTP Strict Transport Security (HSTS) and core security headers
app.addHook("onSend", async (request, reply) => {
  reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
});

// RFC 9116 Vulnerability Disclosure endpoint
app.get("/.well-known/security.txt", async (request, reply) => {
  reply.type("text/plain; charset=utf-8");
  return `Contact: mailto:security@whizan.cloud\nExpires: 2027-12-31T23:59:59.000Z\nPreferred-Languages: en\nCanonical: https://api.whizan.cloud/.well-known/security.txt\nPolicy: https://whizan.cloud/contact\n`;
});

import crypto from "crypto";

await app.register(fastifyCookie, {
  secret: process.env.COOKIE_SECRET!,
});

await app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET!,
  sign: { expiresIn: "7d" },
});

import { isUserAdmin, isRootAdmin } from "./lib/auth-utils.js";
import { userMetaCache } from "./lib/user-cache.js";

// Decorator so routes can use fastify.authenticate as a preHandler
// Supports both JWT tokens (cookies or Bearer) and API keys (whz_live_...)
app.decorate("authenticate", async (request: any, reply: any) => {
  const authHeader = request.headers.authorization;
  const apiKeyHeader = request.headers["x-api-key"];
  const rawKey =
    (typeof apiKeyHeader === "string" ? apiKeyHeader.trim() : null) ||
    (typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null);

  // Dedicated Storage API Keys (whz_stg_live_...)
  if (rawKey && typeof rawKey === "string" && rawKey.startsWith("whz_stg_live_")) {
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const stgKeyRecord = await prisma.storageApiKey.findUnique({
      where: { keyHash },
      include: { user: true },
    });

    if (stgKeyRecord) {
      // Storage API keys are strictly restricted to Storage routes
      const url = request.url || "";
      if (!url.startsWith("/storage/") && !url.startsWith("/api/storage/")) {
        return reply.code(403).send({ error: "Storage API keys can only access Storage endpoints." });
      }

      const user = stgKeyRecord.user;
      const isRoot = isRootAdmin(user);
      const isAdmin = isUserAdmin(user);
      request.user = {
        userId: stgKeyRecord.userId,
        email: user.email,
        subscriptionTier: (user as any).subscriptionTier || "HOBBY",
        role: isRoot ? "ROOT_ADMIN" : (isAdmin ? ((user as any).role || "ADMIN") : ((user as any).role || "USER")),
        iamPermissions: (user as any).iamPermissions || "all",
        emailVerified: (user as any).emailVerified === true,
      };
      request.storageApiKey = {
        id: stgKeyRecord.id,
        name: stgKeyRecord.name,
        bucketId: stgKeyRecord.bucketId,
        permission: stgKeyRecord.permission,
      };
      // Update lastUsedAt asynchronously
      prisma.storageApiKey.update({ where: { id: stgKeyRecord.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
      return;
    }
    return reply.code(401).send({ error: "Invalid Storage API key" });
  }

  // General IDE DevOps MCP & CLI API Keys (whz_live_...)
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
        emailVerified: (user as any).emailVerified === true,
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
      const userId = request.user.userId;
      const cached = userMetaCache.get(userId);
      let userRecord = cached && (Date.now() - cached.cachedAt < 60_000) ? cached.data : null;

      if (!userRecord) {
        userRecord = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true, subscriptionTier: true, email: true, iamPermissions: true, emailVerified: true, twoFactorEnrolled: true, twoFactorMethod: true },
        });
        if (userRecord) {
          userMetaCache.set(userId, { data: userRecord, cachedAt: Date.now() });
        }
      }

      if (userRecord) {
        const isRoot = isRootAdmin({ ...userRecord, email: request.user.email });
        const isAdmin = isUserAdmin({ ...userRecord, email: request.user.email });
        request.user.role = isRoot ? "ROOT_ADMIN" : (isAdmin ? (userRecord?.role || "ADMIN") : (userRecord?.role || "USER"));
        request.user.iamPermissions = (userRecord as any)?.iamPermissions || "all";
        request.user.subscriptionTier = userRecord?.subscriptionTier || "HOBBY";
        request.user.emailVerified = (userRecord as any)?.emailVerified === true;
        request.user.twoFactorEnrolled = (userRecord as any)?.twoFactorEnrolled === true;
        request.user.twoFactorMethod = (userRecord as any)?.twoFactorMethod || null;
      } else if (request.user.role) {
        // Fallback to claims encoded in JWT token
        const isRoot = isRootAdmin({ role: request.user.role, email: request.user.email });
        const isAdmin = isUserAdmin({ role: request.user.role, email: request.user.email });
        request.user.role = isRoot ? "ROOT_ADMIN" : (isAdmin ? request.user.role : "USER");
        request.user.emailVerified = false;
        request.user.twoFactorEnrolled = false;
        request.user.twoFactorMethod = null;
      }

      // ─── Mandatory Email Verification Enforcement ────────────────────────────
      // Unverified accounts (any role tier: User or Admin) are restricted to View-Only mode.
      // They can view (GET/HEAD/OPTIONS) but cannot mutate (POST/PUT/PATCH/DELETE).
      if (
        request.user.emailVerified === false &&
        !["GET", "HEAD", "OPTIONS"].includes(request.method)
      ) {
        const rawPath = (request.url || "").split("?")[0];
        const allowedPaths = [
          "/api/auth/send-verification-otp",
          "/api/auth/verify-email",
          "/api/auth/update-unverified-email",
          "/api/auth/enroll-2fa",
          "/api/auth/send-otp",
          "/api/auth/verify-otp",
          "/api/auth/logout",
          "/api/auth/refresh",
        ];
        if (!allowedPaths.includes(rawPath)) {
          return reply.code(403).send({
            error: "EMAIL_VERIFICATION_REQUIRED",
            message: "Email verification is mandatory to perform actions or mutations. Your account is restricted to View-Only mode until verified.",
            emailVerified: false,
          });
        }
      }
    }
  } catch {
    reply.code(401).send({ error: "Unauthorized" });
  }
});

// Decorator for platform administrative actions (Restricted strictly to ROOT_ADMIN and IAM_ADMIN/ADMIN)
app.decorate("requireAdmin", async (request: any, reply: any) => {
  await (app as any).authenticate(request, reply);
  if (reply.sent) return;

  const adminRoles = ["ROOT_ADMIN", "IAM_ADMIN", "ADMIN"];
  const isAuthorized =
    adminRoles.includes(request.user?.role) ||
    (request.user?.email && request.user.email.toLowerCase() === "aj0892829122@gmail.com");

  if (!isAuthorized) {
    return reply.code(403).send({
      error: "Forbidden: Platform administrator privileges required. Accessible to IAM and Root administrators only.",
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
await app.register(deploymentRoutes, { prefix: "/api/deployments" });
await app.register(envRoutes, { prefix: "/api/projects" });
await app.register(webhookRoutes, { prefix: "/api/webhooks" });
await app.register(adminRoutes, { prefix: "/api/admin" });
await app.register(serviceRoutes, { prefix: "/api/services" });
await app.register(databaseRoutes, { prefix: "/api/databases" });
await app.register(githubRoutes, { prefix: "/api" });
await app.register(caddyVerifyRoutes, { prefix: "/api" });
await app.register(localOpencodeRoutes, { prefix: "/api/local-opencode" });
await app.register(containerRoutes, { prefix: "/api/containers" });
await app.register(functionRoutes, { prefix: "/api/functions" });
await app.register(cronRoutes, { prefix: "/api/crons" });
await app.register(flowRoutes, { prefix: "/api/flows" });
await app.register(agentRoutes, { prefix: "/api/agent" });
await app.register(accountTerminalRoutes, { prefix: "/api/terminal" });
await app.register(wafRoutes, { prefix: "/api/waf" });
await app.register(storageRoutes, { prefix: "/api/storage/v1" });
await app.register(storageRoutes, { prefix: "/storage/v1" });
await app.register(storageRoutes); // Mounts /public/:bucketName/* and /b/:bucketId/* for storage.whizan.cloud
await app.register(liveGatewayRoutes);

import { checkVmOnline } from "./lib/vm-status.js";
import { triggerVmWake, triggerVmSleep } from "./lib/vm-wake.js";

// ─── Health Check & Root ──────────────────────────────────────────────────────

app.route({
  method: ["GET", "POST", "HEAD"],
  url: "/health",
  handler: async () => ({ status: "ok", ts: Date.now() }),
});

app.route({
  method: ["GET", "HEAD"],
  url: "/api/system/status",
  handler: async () => {
    return checkVmOnline({ autoWake: false });
  },
});

app.route({
  method: ["POST", "GET"],
  url: "/api/system/beacon",
  handler: async () => {
    await redisClient.set("vm:stats", JSON.stringify({
      timestamp: Date.now(),
      hostname: "azure-vm-beacon",
      beacon: true,
    }), "EX", 45).catch(() => {});
    await redisClient.del("vm:wake:in_progress").catch(() => {});
    return { status: "acknowledged", ts: Date.now() };
  },
});

app.route({
  method: ["GET", "HEAD"],
  url: "/api/vm/status",
  handler: async () => {
    return checkVmOnline({ autoWake: false });
  },
});

app.route({
  method: ["POST"],
  url: "/api/vm/wake",
  handler: async (request: any) => {
    const reason = request.body?.reason || "user_request";
    return triggerVmWake(reason);
  },
});

app.route({
  method: ["POST"],
  url: "/api/vm/sleep",
  handler: async (request: any, reply: any) => {
    // Only Root Admin can manually trigger immediate sleep from API
    const user = (request as any).user;
    if (user && user.email !== "aj0892829122@gmail.com" && user.role !== "ROOT_ADMIN") {
      reply.status(403);
      return { error: "Only platform administrators can manually deallocate the compute node." };
    }
    const reason = request.body?.reason || "admin_manual_sleep";
    return triggerVmSleep(reason);
  },
});

app.route({
  method: ["GET", "HEAD"],
  url: "/",
  handler: async () => ({ status: "ok", name: "Whizan Cloud Service Control Plane", ts: Date.now() }),
});

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
