import "dotenv/config";
import http from "http";
import fs from "fs";
import { Redis } from "ioredis";
import { FunctionLogger } from "./logger.js";
import { FunctionSandbox } from "./sandbox.js";
import { FunctionPool } from "./pool.js";
import { FunctionBundler } from "./bundler.js";
import { InvocationRequest } from "./types.js";

const PORT = Number(process.env.FUNCTION_RUNTIME_PORT) || 9090;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const redis = new Redis(REDIS_URL, {
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
});
redis.on("error", (err: any) => console.error("[FunctionRuntime Redis] Error:", err.message));

const logger = new FunctionLogger(redis);
const sandbox = new FunctionSandbox(logger);
const pool = new FunctionPool(sandbox, redis);
const bundler = new FunctionBundler();
const CONTROL_PLANE_URL = process.env.CONTROL_PLANE_URL || process.env.API_URL || "https://api.whizan.cloud";

/**
 * Ensures an executable bundle is present on disk for the given function.
 * Self-healing tiers:
 * Tier 1: Check existing bundle on local disk (/opt/whizan/apps/function-runtime/functions-storage/...)
 * Tier 2: Check Redis raw source code cache (fn:source:<serviceId>:v<version>)
 * Tier 3: Query Control Plane API to fetch persistent source code directly from PostgreSQL
 * Compiles on-the-fly via esbuild, writes to disk, and repopulates Redis cache.
 */
async function ensureBundle(serviceId: string, slug: string, version: number, initialBundlePath?: string): Promise<string | null> {
  let bundlePath = initialBundlePath;
  if (!bundlePath) {
    const rawMeta = await redis.get(`fn:service:${slug}`).catch(() => null);
    if (rawMeta) {
      try {
        const parsed = JSON.parse(rawMeta);
        bundlePath = parsed.bundlePath;
      } catch {}
    }
  }

  if (bundlePath && fs.existsSync(bundlePath)) {
    return bundlePath;
  }

  // Tier 2: Check Redis source cache
  let rawCode = await redis.get(`fn:source:${serviceId}:v${version}`).catch(() => null);

  // Tier 3: Disaster recovery fallback - query Control Plane API for persistent PostgreSQL source code
  if (!rawCode) {
    try {
      console.log(`[FunctionRuntime] Bundle missing on disk & Redis for ${slug} (v${version}). Fetching persistent source from control plane...`);
      const res = await fetch(`${CONTROL_PLANE_URL}/api/functions/${serviceId}/code`);
      if (res.ok) {
        const data = (await res.json()) as any;
        if (data && typeof data.sourceCode === "string") {
          const fetchedCode: string = data.sourceCode;
          rawCode = fetchedCode;
          // Re-cache source in Redis (7 days TTL)
          await redis.set(`fn:source:${serviceId}:v${version}`, fetchedCode, "EX", 86400 * 7).catch(() => {});
          console.log(`[FunctionRuntime] Successfully restored source code from control plane for ${slug} (${fetchedCode.length} bytes)`);
        }
      } else {
        console.warn(`[FunctionRuntime] Control plane responded with HTTP ${res.status} when fetching code for ${serviceId}`);
      }
    } catch (fetchErr: any) {
      console.warn(`[FunctionRuntime] Control plane source fetch failed:`, fetchErr.message);
    }
  }

  // Compile bundle on-the-fly if source code is available
  if (rawCode) {
    try {
      console.log(`[FunctionRuntime] Compiling on-the-fly bundle for ${slug} (v${version})...`);
      const bundled = await bundler.bundleCode(serviceId, version, { rawCode });
      bundlePath = bundled.bundlePath;

      // Update Redis service meta with new bundlePath
      const currentMeta = await redis.get(`fn:service:${slug}`).catch(() => null);
      if (currentMeta) {
        try {
          const parsed = JSON.parse(currentMeta);
          parsed.bundlePath = bundlePath;
          await redis.set(`fn:service:${slug}`, JSON.stringify(parsed));
        } catch {}
      }
      return bundlePath;
    } catch (compileErr: any) {
      console.error(`[FunctionRuntime] On-the-fly bundle compilation failed:`, compileErr.message);
    }
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  // Helper to send JSON
  const sendJson = (status: number, data: any) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };

  // ── Health Check ────────────────────────────────────────────────────────────
  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(200, {
      status: "ok",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pool: pool.getStats(),
    });
  }

  // Helper to read request body
  const readBody = async (): Promise<any> => {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e: any) {
          reject(new Error(`Invalid JSON body: ${e.message}`));
        }
      });
      req.on("error", reject);
    });
  };

  // ── Invocation Endpoint ─────────────────────────────────────────────────────
  if (req.method === "POST" && url.pathname === "/invoke") {
    try {
      const invocation = (await readBody()) as InvocationRequest & { bundlePath?: string };

      if (!invocation.serviceId || !invocation.slug) {
        return sendJson(400, { error: "Missing required fields: serviceId and slug" });
      }

      const version = invocation.version || 1;
      const bundlePath = await ensureBundle(invocation.serviceId, invocation.slug, version, invocation.bundlePath);

      if (!bundlePath || !fs.existsSync(bundlePath)) {
        return sendJson(404, {
          error: "BUNDLE_NOT_FOUND",
          message: `No active deployment bundle found for function service '${invocation.slug}'. Please deploy your code first.`,
        });
      }

      const bundle = await pool.getOrLoadBundle(invocation.serviceId, version, bundlePath);
      const result = await sandbox.execute(bundle, invocation);

      return sendJson(200, result);
    } catch (err: any) {
      console.error("[FunctionRuntime] Invocation error:", err);
      return sendJson(500, {
        error: "INTERNAL_RUNTIME_ERROR",
        message: err?.message || "Internal function runtime error",
      });
    }
  }

  // ── Bundling Endpoint ───────────────────────────────────────────────────────
  if (req.method === "POST" && url.pathname === "/bundle") {
    try {
      const body = await readBody();
      const { serviceId, version, rawCode, entryFilePath } = body;

      if (!serviceId || !version) {
        return sendJson(400, { error: "Missing required fields: serviceId and version" });
      }

      const result = await bundler.bundleCode(serviceId, version, { rawCode, entryFilePath });
      // Evict old cache
      pool.evict(serviceId, version);

      // Cache raw code in Redis for on-the-fly compilation resilience
      if (rawCode) {
        await redis.set(`fn:source:${serviceId}:v${version}`, rawCode).catch(() => {});
      }

      return sendJson(200, result);
    } catch (err: any) {
      return sendJson(400, { error: "BUNDLING_FAILED", message: err?.message });
    }
  }

  // ── Eviction Endpoint ───────────────────────────────────────────────────────
  if (req.method === "POST" && url.pathname === "/evict") {
    try {
      const { serviceId, version } = await readBody();
      if (!serviceId) {
        return sendJson(400, { error: "Missing serviceId" });
      }
      pool.evict(serviceId, version);
      return sendJson(200, { success: true });
    } catch (err: any) {
      return sendJson(400, { error: err.message });
    }
  }

  return sendJson(404, { error: "Endpoint not found" });
});

// ── Redis RPC Bridge (Resilient cross-cloud invocation & bundling) ───────────
const redisSub = redis.duplicate();
redisSub.on("error", (err: any) => console.error("[FunctionRuntime Redis Sub] Error:", err.message));

redisSub.subscribe("fn:rpc:bundle", "fn:rpc:invoke", "fn:reload", (err) => {
  if (err) console.error("[FunctionRuntime] Failed to subscribe to RPC channels:", err.message);
  else console.log("[FunctionRuntime] Subscribed to Redis RPC channels: fn:rpc:bundle, fn:rpc:invoke, fn:reload");
});

redisSub.on("message", async (channel: string, message: string) => {
  try {
    const payload = JSON.parse(message);

    if (channel === "fn:reload") {
      const { serviceId, version, rawCode } = payload;
      if (serviceId) {
        pool.evict(serviceId, version);
        if (rawCode && version) {
          bundler.bundleCode(serviceId, version, { rawCode }).catch(() => {});
        }
      }
      return;
    }

    if (channel === "fn:rpc:bundle") {
      const { requestId, serviceId, version, rawCode, entryFilePath } = payload;
      if (!requestId || !serviceId || !version) return;
      try {
        const result = await bundler.bundleCode(serviceId, version, { rawCode, entryFilePath });
        pool.evict(serviceId, version);
        if (rawCode) {
          await redis.set(`fn:source:${serviceId}:v${version}`, rawCode).catch(() => {});
        }
        await redis.publish(`fn:rpc:response:${requestId}`, JSON.stringify({ success: true, result }));
      } catch (err: any) {
        await redis.publish(`fn:rpc:response:${requestId}`, JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (channel === "fn:rpc:invoke") {
      const { requestId, invocation } = payload;
      if (!requestId || !invocation?.serviceId || !invocation?.slug) return;
      try {
        const version = invocation.version || 1;
        const bundlePath = await ensureBundle(invocation.serviceId, invocation.slug, version, invocation.bundlePath);

        if (!bundlePath || !fs.existsSync(bundlePath)) {
          await redis.publish(`fn:rpc:response:${requestId}`, JSON.stringify({
            success: false,
            statusCode: 404,
            error: "BUNDLE_NOT_FOUND",
            message: `No active deployment bundle found for '${invocation.slug}'. Please deploy your code first.`
          }));
          return;
        }

        const bundle = await pool.getOrLoadBundle(invocation.serviceId, version, bundlePath);
        const result = await sandbox.execute(bundle, invocation);
        await redis.publish(`fn:rpc:response:${requestId}`, JSON.stringify({ success: true, result }));
      } catch (err: any) {
        await redis.publish(`fn:rpc:response:${requestId}`, JSON.stringify({ success: false, error: err.message }));
      }
    }
  } catch (parseErr: any) {
    console.error("[FunctionRuntime] Redis RPC processing error:", parseErr.message);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Whizan Function Runtime] Listening on http://0.0.0.0:${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("[Whizan Function Runtime] Shutting down gracefully...");
  pool.destroy();
  redisSub.disconnect();
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("[Whizan Function Runtime] Interrupted. Closing...");
  pool.destroy();
  redisSub.disconnect();
  server.close(() => process.exit(0));
});
