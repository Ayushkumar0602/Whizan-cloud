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
        activeJailedCount: 0,
        activeJailedEntries: [],
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
      const slugFilter = request.query?.slug?.toLowerCase()?.trim();
      const rawEvents = await redisClient.lrange("waf:events", 0, limit * 2);
      let events = (rawEvents || []).map((e) => {
        try {
          return JSON.parse(e);
        } catch {
          return null;
        }
      }).filter(Boolean);

      if (slugFilter) {
        events = events.filter((e: any) => e.slug === slugFilter);
      }

      return reply.send({ events: events.slice(0, limit), count: events.length });
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

  // ── 5. POST /api/waf/jail/:slug/:ip — Manually jail an abusive IP for a specific deployment
  fastify.post("/jail/:slug/:ip", {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply) => {
    const slug = request.params.slug?.toLowerCase().trim();
    const ip = request.params.ip?.trim();
    if (!slug || !ip) return reply.status(400).send({ error: "Slug and IP are required" });

    const durationSec = Math.max(60, Number(request.body?.durationSec) || 3600); // Default 1 hour
    const reason = String(request.body?.reason || "Admin Manual Block on " + slug);
    const until = Date.now() + durationSec * 1000;
    const jailKey = `${slug}:${ip}`;

    try {
      const payload = {
        until,
        reason,
        slug,
        ip,
        jailedAt: new Date().toISOString(),
      };
      await redisClient.set(`waf:jail:${jailKey}`, JSON.stringify(payload), "EX", durationSec);
      await redisClient.publish("waf:alert", JSON.stringify({
        type: "SLUG_IP_JAILED",
        slug,
        ip,
        reason,
        until: new Date(until).toISOString(),
      }));
      return reply.send({ success: true, slug, ip, until: new Date(until).toISOString(), reason });
    } catch (err: any) {
      return reply.status(500).send({ error: "Failed to jail IP on deployment", message: err.message });
    }
  });

  // ── 6. DELETE /api/waf/jail/:slug/:ip — Unjail an IP for a specific deployment
  fastify.delete("/jail/:slug/:ip", {
    preHandler: [(fastify as any).authenticate],
  }, async (request: any, reply) => {
    const slug = request.params.slug?.toLowerCase().trim();
    const ip = request.params.ip?.trim();
    if (!slug || !ip) return reply.status(400).send({ error: "Slug and IP are required" });

    try {
      const keys = await redisClient.keys(`waf:jail:${slug}:${ip}*`);
      for (const k of keys) {
        await redisClient.del(k);
      }
      await redisClient.publish("waf:unjail", JSON.stringify({ slug, ip }));
      return reply.send({ success: true, message: `IP ${ip} unjailed successfully on ${slug}` });
    } catch (err: any) {
      return reply.status(500).send({ error: "Failed to unjail IP", message: err.message });
    }
  });

  // ── 7. DELETE /api/waf/jail/:ip — Global Admin Unjail across all deployments ──
  fastify.delete("/jail/:ip", {
    preHandler: [(fastify as any).requireAdmin],
  }, async (request: any, reply) => {
    const ip = request.params.ip?.trim();
    if (!ip) return reply.status(400).send({ error: "IP address is required" });

    try {
      const keys = await redisClient.keys(`waf:jail:*${ip}*`);
      for (const k of keys) {
        await redisClient.del(k);
      }
      await redisClient.del(`waf:jail:${ip}`);
      await redisClient.publish("waf:unjail", JSON.stringify({ ip, global: true }));
      return reply.send({ success: true, message: `IP ${ip} completely unjailed across all deployments` });
    } catch (err: any) {
      return reply.status(500).send({ error: "Failed to globally unjail IP", message: err.message });
    }
  });
};
