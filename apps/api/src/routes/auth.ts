import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { redisClient } from "../lib/redis.js";
import crypto from "crypto";
import { isUserAdmin, isRootAdmin } from "../lib/auth-utils.js";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateRefreshToken() {
  return crypto.randomBytes(48).toString("hex");
}

const REFRESH_TOKEN_TTL_DAYS = 7;
const COOKIE_NAME = "refreshToken";

async function issueTokens(
  fastify: FastifyInstance,
  reply: any,
  userId: string,
  email: string
) {
  // Access token — short-lived JWT
  const accessToken = fastify.jwt.sign({ userId, email });

  // Refresh token — opaque, stored in DB + HttpOnly cookie
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  await prisma.refreshToken.create({
    data: { userId, token: refreshToken, expiresAt },
  });

  reply.setCookie(COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: true, // Must be true for sameSite none
    sameSite: "none", // Required for cross-domain cookies (Vercel frontend -> Render API)
    path: "/",
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  });

  return { accessToken };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function authRoutes(fastify: FastifyInstance) {
  // POST /api/auth/register
  fastify.post("/register", async (request, reply) => {
    const body = RegisterSchema.safeParse(request.body);
    if (!body.success)
      return reply.code(400).send({ error: body.error.flatten() });

    const { email, password, name } = body.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return reply.code(409).send({ error: "Email already in use" });

    const passwordHash = await bcrypt.hash(password, 12);
    const isRoot = isRootAdmin({ email });
    const isAdmin = isUserAdmin({ email });
    const assignedRole = isRoot ? "ROOT_ADMIN" : (isAdmin ? "ADMIN" : "USER");
    const user = await prisma.user.create({
      data: { email, passwordHash, name, role: assignedRole },
    });

    const { accessToken } = await issueTokens(fastify, reply, user.id, user.email);
    return reply.code(201).send({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscriptionTier: (user as any).subscriptionTier || "HOBBY",
        role: assignedRole,
      },
    });
  });

  // POST /api/auth/login
  fastify.post("/login", async (request, reply) => {
    const body = LoginSchema.safeParse(request.body);
    if (!body.success)
      return reply.code(400).send({ error: body.error.flatten() });

    const { email, password } = body.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash)
      return reply.code(401).send({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return reply.code(401).send({ error: "Invalid credentials" });

    const isRoot = isRootAdmin(user);
    const isAdmin = isUserAdmin(user);
    const resolvedRole = isRoot ? "ROOT_ADMIN" : (isAdmin ? ((user as any).role || "ADMIN") : ((user as any).role || "USER"));
    const { accessToken } = await issueTokens(fastify, reply, user.id, user.email);
    return reply.send({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        subscriptionTier: (user as any).subscriptionTier || "HOBBY",
        role: resolvedRole,
      },
    });
  });

  // POST /api/auth/refresh
  fastify.post("/refresh", async (request, reply) => {
    const token = request.cookies[COOKIE_NAME];
    if (!token) return reply.code(401).send({ error: "No refresh token" });

    const stored = await prisma.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.expiresAt < new Date()) {
      return reply.code(401).send({ error: "Invalid or expired refresh token" });
    }

    // Rotate the refresh token
    await prisma.refreshToken.delete({ where: { token } });

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) return reply.code(401).send({ error: "User not found" });

    const { accessToken } = await issueTokens(fastify, reply, user.id, user.email);
    return reply.send({ accessToken });
  });

  // POST /api/auth/logout
  fastify.post("/logout", async (request, reply) => {
    const token = request.cookies[COOKIE_NAME];
    if (token) {
      await prisma.refreshToken.deleteMany({ where: { token } }).catch(() => {});
    }
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return reply.send({ ok: true });
  });

  // GET /api/auth/me
  fastify.get(
    "/me",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, avatarUrl: true, subscriptionTier: true, role: true, createdAt: true },
      });
      if (!user) return reply.code(404).send({ error: "User not found" });
      const isRoot = isRootAdmin(user);
      const isAdmin = isUserAdmin(user);
      const resolvedRole = isRoot ? "ROOT_ADMIN" : (isAdmin ? ((user as any).role || "ADMIN") : ((user as any).role || "USER"));
      return reply.send({
        ...user,
        subscriptionTier: (user as any).subscriptionTier || "HOBBY",
        role: resolvedRole,
        iamPermissions: (user as any).iamPermissions || "all",
      });
    }
  );

  // PATCH /api/auth/subscription
  fastify.patch(
    "/subscription",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      const body = request.body as { subscriptionTier?: string };
      const rawTier = (body?.subscriptionTier || "").toUpperCase();
      if (rawTier !== "HOBBY" && rawTier !== "PROFESSIONAL") {
        return reply.code(400).send({ error: "Invalid subscription tier. Must be 'HOBBY' or 'PROFESSIONAL'" });
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { subscriptionTier: rawTier },
        select: { id: true, email: true, name: true, subscriptionTier: true },
      });

      return reply.send({
        success: true,
        subscriptionTier: updated.subscriptionTier,
        message: `Compute policy updated to ${rawTier === "HOBBY" ? "Hobby Plan (Free Tier locked)" : "Professional Plan (Custom compute unlocked)"}`,
      });
    }
  );

  // ─── API Key Management (for IDE MCP & CLI) ────────────────────────────────

  // POST /api/auth/api-keys
  fastify.post(
    "/api-keys",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      const body = request.body as { name?: string };
      const name = body?.name?.trim() || "IDE MCP Key";

      const rawSecret = crypto.randomBytes(24).toString("hex");
      const fullKey = `whz_live_${rawSecret}`;
      const keyPrefix = `whz_live_${rawSecret.slice(0, 6)}...`;
      const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");

      const apiKey = await prisma.apiKey.create({
        data: {
          userId,
          name,
          keyHash,
          keyPrefix,
        },
      });

      // Return the plaintext key ONCE
      return reply.code(201).send({
        id: apiKey.id,
        name: apiKey.name,
        key: fullKey,
        keyPrefix: apiKey.keyPrefix,
        createdAt: apiKey.createdAt,
      });
    }
  );

  // GET /api/auth/api-keys
  fastify.get(
    "/api-keys",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      const keys = await prisma.apiKey.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          lastUsedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
      return reply.send(keys);
    }
  );

  // DELETE /api/auth/api-keys/:id
  fastify.delete(
    "/api-keys/:id",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      const { id } = request.params as { id: string };

      const existing = await prisma.apiKey.findFirst({
        where: { id, userId },
      });
      if (!existing) return reply.code(404).send({ error: "API key not found" });

      await prisma.apiKey.delete({ where: { id } });
      return reply.send({ ok: true });
    }
  );
}
