import { FastifyPluginAsync } from "fastify";
import { redisClient } from "../lib/redis.js";

export const wafRoutes: FastifyPluginAsync = async (fastify) => {
  // ── 1. GET /api/waf/stats — Real-time WAF telemetry & attack metrics ──────────
  fastify.get("/stats", {
    preHandler: [(fastify as any).authenticate],
  }, async (request, reply) => {
    try {
      // 1. Try fetching live stats from Redis summary
      const raw = await redisClient.get("waf:stats:summary");
      if (raw) {
        const stats = JSON.parse(raw);
        return reply.send(stats);
      }

      // 2. Fallback: Query live Edge Router HTTP stats endpoint directly
      try {
        const edgeRes = await fetch("http://127.0.0.1:8080/_internal/waf/stats", {
          signal: AbortSignal.timeout(2000),
        });
        if (edgeRes.ok) {
          const stats = await edgeRes.json();
          return reply.send(stats);
        }
      } catch {}

      return reply.send({
        status: "ACTIVE",
        metrics: {
          totalInspected: 0,
          totalAllowed: 0,
          totalBlocked: 0,
          totalRateLimited: 0,
          totalJailed: 0,
          categoryCounts: {},
        },
        activeJailedIpsCount: 0,
        activeJailedIps: [],
        recentEvents: [],
      });
    } catch (err: any) {
      return reply.status(500).send({ error: "Failed to fetch WAF stats", message: err.message });
    }
  });

  // ── 2. GET /api/waf/events — List recent blocked/rate-limited events ──────────
  fastify.get("/events", {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply) => {
    try {
      const limit = Math.min(Number(request.query?.limit) || 50, 100);
      const rawEvents = await redisClient.lrange("waf:events", 0, limit - 1);
      const events = (rawEvents || []).map((e) => {
        try {
          return JSON.parse(e);
        } catch {
          return null;
        }
      }).filter(Boolean);

      return reply.send({ events, count: events.length });
    } catch (err: any) {
      return reply.status(500).send({ error: "Failed to fetch WAF events", message: err.message });
    }
  });

  // ── 3. GET /api/waf/config/:slug — Fetch custom WAF rules for a service/project
  fastify.get("/config/:slug", {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply) => {
    const slug = request.params.slug?.toLowerCase().trim();
    if (!slug) return reply.status(400).send({ error: "Slug is required" });

    try {
      const raw = await redisClient.get(`waf:config:${slug}`);
      const config = raw ? JSON.parse(raw) : {
        enabled: true,
        mode: "block",
        rateLimitRpm: 120,
        burstLimit: 30,
        enableSqlInjectionCheck: true,
        enableXssCheck: true,
        enablePathTraversalCheck: true,
        enableRceCheck: true,
        enableScannerCheck: true,
        customBlacklistIps: [],
        customWhitelistIps: [],
      };
      return reply.send({ slug, config });
    } catch (err: any) {
      return reply.status(500).send({ error: "Failed to fetch WAF config", message: err.message });
    }
  });

  // ── 4. POST /api/waf/config/:slug — Update custom WAF settings for a service/project
  fastify.post("/config/:slug", {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply) => {
    const slug = request.params.slug?.toLowerCase().trim();
    if (!slug) return reply.status(400).send({ error: "Slug is required" });

    const body = request.body || {};
    const config = {
      enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
      mode: body.mode === "monitor" ? "monitor" : "block",
      rateLimitRpm: Math.max(10, Math.min(Number(body.rateLimitRpm) || 120, 10000)),
      burstLimit: Math.max(5, Math.min(Number(body.burstLimit) || 30, 2000)),
      enableSqlInjectionCheck: body.enableSqlInjectionCheck !== false,
      enableXssCheck: body.enableXssCheck !== false,
      enablePathTraversalCheck: body.enablePathTraversalCheck !== false,
      enableRceCheck: body.enableRceCheck !== false,
      enableScannerCheck: body.enableScannerCheck !== false,
      customBlacklistIps: Array.isArray(body.customBlacklistIps) ? body.customBlacklistIps.map((s: string) => String(s).trim()) : [],
      customWhitelistIps: Array.isArray(body.customWhitelistIps) ? body.customWhitelistIps.map((s: string) => String(s).trim()) : [],
    };

    try {
      await redisClient.set(`waf:config:${slug}`, JSON.stringify(config));
      return reply.send({ success: true, slug, config });
    } catch (err: any) {
      return reply.status(500).send({ error: "Failed to update WAF config", message: err.message });
    }
  });

  // ── 5. POST /api/waf/jail/:ip — Manually ban/jail an abusive IP ───────────────
  fastify.post("/jail/:ip", {
    preHandler: [(fastify as any).requireAdmin],
  }, async (request: any, reply) => {
    const ip = request.params.ip?.trim();
    if (!ip) return reply.status(400).send({ error: "IP address is required" });

    const durationSec = Math.max(60, Number(request.body?.durationSec) || 3600); // Default 1 hour
    const reason = String(request.body?.reason || "Admin Manual Block");
    const until = Date.now() + durationSec * 1000;

    try {
      await redisClient.set(`waf:jail:${ip}`, JSON.stringify({ until, reason }), "EX", durationSec);
      await redisClient.publish("waf:alert", JSON.stringify({
        type: "IP_MANUALLY_JAILED",
        ip,
        reason,
        until: new Date(until).toISOString(),
      }));
      return reply.send({ success: true, ip, until: new Date(until).toISOString(), reason });
    } catch (err: any) {
      return reply.status(500).send({ error: "Failed to jail IP", message: err.message });
    }
  });

  // ── 6. DELETE /api/waf/jail/:ip — Unjail/unban an IP ─────────────────────────
  fastify.delete("/jail/:ip", {
    preHandler: [(fastify as any).requireAdmin],
  }, async (request: any, reply) => {
    const ip = request.params.ip?.trim();
    if (!ip) return reply.status(400).send({ error: "IP address is required" });

    try {
      await redisClient.del(`waf:jail:${ip}`);
      return reply.send({ success: true, message: `IP ${ip} unjailed successfully` });
    } catch (err: any) {
      return reply.status(500).send({ error: "Failed to unjail IP", message: err.message });
    }
  });
};
