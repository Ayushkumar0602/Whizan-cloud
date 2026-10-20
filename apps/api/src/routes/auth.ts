import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { redisClient } from "../lib/redis.js";
import crypto from "crypto";
import { isUserAdmin, isRootAdmin } from "../lib/auth-utils.js";
import { sendOtpEmail } from "../lib/email-service.js";
import { userMetaCache } from "../lib/user-cache.js";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
  passcode: z.string().min(6).max(6).optional(),
});

const SendOtpSchema = z.object({
  email: z.string().email(),
});

const VerifyOtpSchema = z.object({
  email: z.string().email().optional(),
  passcode: z.string().trim().min(6).max(6),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().optional(),
  passcode: z.string().min(6).max(6).optional(),
});

// ─── OTP In-Memory Store ─────────────────────────────────────────────────────

interface OtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
}
const otpMemoryStore = new Map<string, OtpRecord>();

function generateNumericOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateRefreshToken() {
  return crypto.randomBytes(48).toString("hex");
}

const REFRESH_TOKEN_TTL_DAYS = 30;
const COOKIE_NAME = "refreshToken";

// 30-second token rotation grace cache: allows concurrent in-flight requests from the same client to succeed
const rotatedTokensGraceCache = new Map<string, { accessToken: string; expiresAt: number; user: any }>();

function cleanupGraceCache() {
  const now = Date.now();
  for (const [key, val] of rotatedTokensGraceCache.entries()) {
    if (val.expiresAt < now) {
      rotatedTokensGraceCache.delete(key);
    }
  }
}

async function issueTokens(
  fastify: FastifyInstance,
  reply: any,
  userId: string,
  email: string,
  extra?: { role?: string; subscriptionTier?: string; iamPermissions?: string }
) {
  // Access token with embedded role and tier for zero-DB-hit fast validation
  const jwtPayload: any = { userId, email };
  if (extra?.role) jwtPayload.role = extra.role;
  if (extra?.subscriptionTier) jwtPayload.subscriptionTier = extra.subscriptionTier;
  if (extra?.iamPermissions) jwtPayload.iamPermissions = extra.iamPermissions;

  const accessToken = fastify.jwt.sign(jwtPayload);

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
  // POST /api/auth/send-otp — Sends a 6-digit OTP via EmailJS
  fastify.post("/send-otp", async (request, reply) => {
    const body = SendOtpSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid email format" });
    }
    const email = body.data.email.trim().toLowerCase();

    // Check if account already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ error: "An account with this email already exists. Please log in." });
    }

    const code = generateNumericOtp();
    const expiresAt = Date.now() + 15 * 60 * 1000;
    otpMemoryStore.set(email, { code, expiresAt, attempts: 0 });

    try {
      await redisClient.setex(`otp:${email}`, 900, code);
    } catch {}

    const xForwardedFor = request.headers["x-forwarded-for"];
    const cfConnectingIp = request.headers["cf-connecting-ip"];
    const clientIp = (typeof cfConnectingIp === "string" ? cfConnectingIp : (typeof xForwardedFor === "string" ? xForwardedFor.split(",")[0].trim() : request.ip)) || "127.0.0.1";
    const userAgent = (request.headers["user-agent"] as string) || "Browser / Web Client";
    const country = (request.headers["cf-ipcountry"] as string) || "Global";
    const requestTime = new Date().toUTCString();
    const expiryTimeString = new Date(expiresAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

    const sendRes = await sendOtpEmail({
      email,
      passcode: code,
      time: `${expiryTimeString} (15 minutes)`,
      requestTime,
      clientIp,
      deviceInfo: userAgent,
      location: country,
      requestId: request.id || `req_${Date.now().toString(36)}`,
      companyName: "Whizan Cloud Services",
    });

    if (!sendRes.success) {
      return reply.code(500).send({ error: sendRes.error || "Failed to dispatch verification email." });
    }

    return reply.send({
      ok: true,
      message: "Verification code sent to email",
      expiresIn: 900,
    });
  });

  // POST /api/auth/verify-otp — Verifies the 6-digit OTP
  fastify.post("/verify-otp", async (request, reply) => {
    const body = VerifyOtpSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid passcode format. Must be 6 digits." });
    }
    const { passcode } = body.data;
    const email = body.data.email || (request.body as any)?.email;
    if (!email) {
      return reply.code(400).send({ error: "Email is required for OTP verification." });
    }
    const normalizedEmail = email.trim().toLowerCase();

    const entry = otpMemoryStore.get(normalizedEmail);
    let storedCode = entry?.code;
    let isExpired = entry ? entry.expiresAt < Date.now() : true;

    if (!storedCode) {
      try {
        const redisCode = await redisClient.get(`otp:${normalizedEmail}`);
        if (redisCode) {
          storedCode = redisCode;
          isExpired = false;
        }
      } catch {}
    }

    if (!storedCode || isExpired) {
      return reply.code(400).send({ error: "Verification code expired. Please request a new code." });
    }

    if (storedCode !== passcode.trim()) {
      return reply.code(400).send({ error: "Invalid verification code. Please check your email." });
    }

    return reply.send({ ok: true, verified: true });
  });

  // POST /api/auth/register
  fastify.post("/register", async (request, reply) => {
    const body = RegisterSchema.safeParse(request.body);
    if (!body.success)
      return reply.code(400).send({ error: body.error.flatten() });

    const { email, password, name, passcode } = body.data;
    const normalizedEmail = email.trim().toLowerCase();

    // If passcode is provided, strictly verify OTP before account creation
    if (passcode) {
      const entry = otpMemoryStore.get(normalizedEmail);
      let storedCode = entry?.code;
      let isExpired = entry ? entry.expiresAt < Date.now() : true;

      if (!storedCode) {
        try {
          const redisCode = await redisClient.get(`otp:${normalizedEmail}`);
          if (redisCode) {
            storedCode = redisCode;
            isExpired = false;
          }
        } catch {}
      }

      if (!storedCode || isExpired) {
        return reply.code(400).send({ error: "Verification code expired. Please request a new code." });
      }

      if (storedCode !== passcode.trim()) {
        return reply.code(400).send({ error: "Invalid verification code. Please check your email." });
      }

      // Consume OTP
      otpMemoryStore.delete(normalizedEmail);
      try {
        await redisClient.del(`otp:${normalizedEmail}`);
      } catch {}
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) return reply.code(409).send({ error: "Email already in use" });

    const passwordHash = await bcrypt.hash(password, 12);
    const isRoot = isRootAdmin({ email: normalizedEmail });
    const isAdmin = isUserAdmin({ email: normalizedEmail });
    const assignedRole = isRoot ? "ROOT_ADMIN" : (isAdmin ? "ADMIN" : "USER");
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name,
        role: assignedRole,
        emailVerified: !!passcode,
        emailVerifiedAt: passcode ? new Date() : null,
      },
    });

    const { accessToken } = await issueTokens(fastify, reply, user.id, user.email, {
      role: assignedRole,
      subscriptionTier: (user as any).subscriptionTier || "HOBBY",
      iamPermissions: (user as any).iamPermissions || "all",
    });
    return reply.code(201).send({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        subscriptionTier: (user as any).subscriptionTier || "HOBBY",
        role: assignedRole,
        emailVerified: user.emailVerified,
      },
    });
  });

  // POST /api/auth/login
  fastify.post("/login", async (request, reply) => {
    const body = LoginSchema.safeParse(request.body);
    if (!body.success)
      return reply.code(400).send({ error: body.error.flatten() });

    const { email, password, passcode } = body.data;
    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user)
      return reply.code(401).send({ error: "Invalid credentials" });

    if (passcode) {
      const entry = otpMemoryStore.get(normalizedEmail);
      let storedCode = entry?.code;
      let isExpired = entry ? entry.expiresAt < Date.now() : true;

      if (!storedCode) {
        try {
          const redisCode = await redisClient.get(`otp:${normalizedEmail}`);
          if (redisCode) {
            storedCode = redisCode;
            isExpired = false;
          }
        } catch {}
      }

      if (!storedCode || isExpired) {
        return reply.code(400).send({ error: "Verification code expired. Please request a new code." });
      }

      if (storedCode.trim() !== passcode.trim()) {
        return reply.code(400).send({ error: "Invalid verification code. Please check your email." });
      }

      // Consume OTP
      otpMemoryStore.delete(normalizedEmail);
      try {
        await redisClient.del(`otp:${normalizedEmail}`);
      } catch {}
    } else if (password) {
      if (!user.passwordHash) {
        return reply.code(401).send({ error: "Please sign in using One-Time Email OTP." });
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return reply.code(401).send({ error: "Invalid credentials" });
    } else {
      return reply.code(400).send({ error: "Password or 6-digit passcode is required." });
    }

    const isRoot = isRootAdmin(user);
    const isAdmin = isUserAdmin(user);
    const resolvedRole = isRoot ? "ROOT_ADMIN" : (isAdmin ? ((user as any).role || "ADMIN") : ((user as any).role || "USER"));
    const { accessToken } = await issueTokens(fastify, reply, user.id, user.email, {
      role: resolvedRole,
      subscriptionTier: (user as any).subscriptionTier || "HOBBY",
      iamPermissions: (user as any).iamPermissions || "all",
    });
    return reply.send({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        subscriptionTier: (user as any).subscriptionTier || "HOBBY",
        role: resolvedRole,
        emailVerified: (user as any).emailVerified ?? false,
      },
    });
  });

  // POST /api/auth/refresh
  fastify.post("/refresh", async (request, reply) => {
    const token = request.cookies[COOKIE_NAME];
    if (!token) return reply.code(401).send({ error: "No refresh token" });

    // Check grace cache to protect concurrent requests from being locked out
    cleanupGraceCache();
    const grace = rotatedTokensGraceCache.get(token);
    if (grace && grace.expiresAt > Date.now()) {
      return reply.send({ accessToken: grace.accessToken, user: grace.user });
    }

    const stored = await prisma.refreshToken.findUnique({ where: { token } });
    if (!stored || stored.expiresAt < new Date()) {
      return reply.code(401).send({ error: "Invalid or expired refresh token" });
    }

    const user = await prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) return reply.code(401).send({ error: "User not found" });

    const isRoot = isRootAdmin(user);
    const isAdmin = isUserAdmin(user);
    const resolvedRole = isRoot ? "ROOT_ADMIN" : (isAdmin ? ((user as any).role || "ADMIN") : ((user as any).role || "USER"));
    const userPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      subscriptionTier: (user as any).subscriptionTier || "HOBBY",
      role: resolvedRole,
      emailVerified: (user as any).emailVerified ?? false,
    };

    // Rotate the refresh token
    await prisma.refreshToken.delete({ where: { token } }).catch(() => {});

    const { accessToken } = await issueTokens(fastify, reply, user.id, user.email, {
      role: resolvedRole,
      subscriptionTier: userPayload.subscriptionTier,
      iamPermissions: (user as any).iamPermissions || "all",
    });

    // Save old token into grace cache for 30s to satisfy concurrent in-flight requests
    rotatedTokensGraceCache.set(token, {
      accessToken,
      user: userPayload,
      expiresAt: Date.now() + 30_000,
    });

    return reply.send({ accessToken, user: userPayload });
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
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          subscriptionTier: true,
          role: true,
          createdAt: true,
          emailVerified: true,
          emailVerifiedAt: true,
        },
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
        emailVerified: (user as any).emailVerified ?? false,
        emailVerifiedAt: (user as any).emailVerifiedAt ?? null,
      });
    }
  );

  // POST /api/auth/send-verification-otp — Dispatches OTP for in-dashboard email verification
  fastify.post(
    "/send-verification-otp",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { userId, email } = request.user;
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return reply.code(404).send({ error: "User not found" });
      if ((user as any).emailVerified) {
        return reply.send({ ok: true, alreadyVerified: true, message: "Email is already verified." });
      }

      const code = generateNumericOtp();
      const expiresAt = Date.now() + 15 * 60 * 1000;
      otpMemoryStore.set(email.toLowerCase(), { code, expiresAt, attempts: 0 });
      try {
        await redisClient.setex(`otp:${email.toLowerCase()}`, 900, code);
      } catch {}

      const xForwardedFor = request.headers["x-forwarded-for"];
      const cfConnectingIp = request.headers["cf-connecting-ip"];
      const clientIp = (typeof cfConnectingIp === "string" ? cfConnectingIp : (typeof xForwardedFor === "string" ? xForwardedFor.split(",")[0].trim() : request.ip)) || "127.0.0.1";
      const userAgent = (request.headers["user-agent"] as string) || "Browser / Web Client";
      const country = (request.headers["cf-ipcountry"] as string) || "Global";
      const requestTime = new Date().toUTCString();
      const expiryTimeString = new Date(expiresAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

      const sendRes = await sendOtpEmail({
        email,
        passcode: code,
        time: `${expiryTimeString} (15 minutes)`,
        requestTime,
        clientIp,
        deviceInfo: userAgent,
        location: country,
        requestId: request.id || `ver_${Date.now().toString(36)}`,
        companyName: "Whizan Cloud Services",
      });

      if (!sendRes.success) {
        return reply.code(500).send({ error: sendRes.error || "Failed to dispatch verification email." });
      }

      return reply.send({ ok: true, message: "Verification OTP dispatched to email", expiresIn: 900 });
    }
  );

  // POST /api/auth/verify-email — Verifies the OTP and unlocks full console mutation access
  fastify.post(
    "/verify-email",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = VerifyOtpSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Invalid passcode format. Must be 6 digits." });
      }
      const { passcode } = body.data;
      const { userId, email } = request.user;
      const targetEmail = (body.data.email || email || "").trim().toLowerCase();

      const entry = otpMemoryStore.get(targetEmail);
      let storedCode = entry?.code;
      let isExpired = entry ? entry.expiresAt < Date.now() : true;

      if (!storedCode) {
        try {
          const redisCode = await redisClient.get(`otp:${targetEmail}`);
          if (redisCode) {
            storedCode = redisCode;
            isExpired = false;
          }
        } catch {}
      }

      if (!storedCode || isExpired) {
        return reply.code(400).send({ error: "Verification code expired. Please request a new code." });
      }

      if (storedCode !== passcode.trim()) {
        return reply.code(400).send({ error: "Invalid verification code. Please check your email." });
      }

      // Consume OTP
      otpMemoryStore.delete(targetEmail);
      try {
        await redisClient.del(`otp:${targetEmail}`);
      } catch {}

      // Mark email as verified in DB
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
        select: { id: true, email: true, name: true, emailVerified: true, emailVerifiedAt: true },
      });

      // Clear cache so authenticate immediately recognizes verified status
      userMetaCache.delete(userId);

      return reply.send({
        ok: true,
        message: "Email verified successfully! Full console mutation access unlocked.",
        user: updated,
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

      // Restrict upgrading to PROFESSIONAL tier: only an administrator can grant PROFESSIONAL tier
      if (rawTier === "PROFESSIONAL") {
        const caller = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true, email: true },
        });
        if (!isUserAdmin(caller)) {
          return reply.code(403).send({
            error: "Upgrading to Professional Plan requires platform administrator authorization.",
          });
        }
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
