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

      let bundlePath = invocation.bundlePath;
      const version = invocation.version || 1;

      // If bundlePath wasn't provided directly, resolve from Redis or disk
      if (!bundlePath) {
        const rawMeta = await redis.get(`fn:service:${invocation.slug}`);
        if (rawMeta) {
          const parsed = JSON.parse(rawMeta);
          bundlePath = parsed.bundlePath;
        }
      }

      // If bundlePath is missing or doesn't exist on disk, attempt on-the-fly bundling from Redis source!
      if (!bundlePath || !fs.existsSync(bundlePath)) {
        const rawCode = await redis.get(`fn:source:${invocation.serviceId}:v${version}`);
        if (rawCode) {
          console.log(`[FunctionRuntime] On-the-fly bundling for ${invocation.slug} (v${version})...`);
          try {
            const bundled = await bundler.bundleCode(invocation.serviceId, version, { rawCode });
            bundlePath = bundled.bundlePath;
            // Update Redis service meta with new bundlePath
            const currentMeta = await redis.get(`fn:service:${invocation.slug}`).catch(() => null);
            if (currentMeta) {
              try {
                const parsed = JSON.parse(currentMeta);
                parsed.bundlePath = bundlePath;
                await redis.set(`fn:service:${invocation.slug}`, JSON.stringify(parsed));
              } catch {}
            }
          } catch (compileErr: any) {
            console.error(`[FunctionRuntime] On-the-fly bundling failed:`, compileErr.message);
          }
        }
      }

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

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Whizan Function Runtime] Listening on http://0.0.0.0:${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("[Whizan Function Runtime] Shutting down gracefully...");
  pool.destroy();
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("[Whizan Function Runtime] Interrupted. Closing...");
  pool.destroy();
  server.close(() => process.exit(0));
});
