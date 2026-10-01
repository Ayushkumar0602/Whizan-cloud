import "dotenv/config";
import http from "http";
import httpProxy from "http-proxy";
import serveStatic from "serve-static";
import finalhandler from "finalhandler";
import Redis from "ioredis";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// ─── Config ──────────────────────────────────────────────────────────────────

const ROUTER_PORT = Number(process.env.ROUTER_PORT) || 8080;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const BASE_DOMAIN = process.env.BASE_DOMAIN || "20.2.136.11.nip.io";
const FUNCTION_RUNTIME_PORT = Number(process.env.FUNCTION_RUNTIME_PORT) || 9090;
const API_PORT = Number(process.env.PORT || process.env.API_PORT) || 8000;
const API_URL = process.env.API_URL || "https://whizan-cloud-service.onrender.com";

async function queryControlPlaneApi(endpoint: string, options?: any) {
  // 1. Try local VM port 8000 if running
  try {
    const localRes = await fetch(`http://127.0.0.1:${API_PORT}${endpoint}`, options).catch(() => null);
    if (localRes && localRes.ok) return localRes;
  } catch {}

  // 2. Resilient fallback to Render Control Plane API
  try {
    const remoteRes = await fetch(`${API_URL}${endpoint}`, options).catch(() => null);
    if (remoteRes && remoteRes.ok) return remoteRes;
  } catch {}

  return null;
}

// ─── Redis ───────────────────────────────────────────────────────────────────

const redis = new Redis(REDIS_URL, {
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
});
redis.on("error", (err) => console.error("[Router Redis] Error:", err.message));

interface DeploymentInfo {
  type: "static" | "ssr" | "hybrid" | "service";
  staticDir?: string;
  containerPort?: number;
  deploymentId: string;
}

// ── In-Memory Deployment Cache (Prevents hammering Upstash on every asset request) ──
interface CachedDeployment {
  info: DeploymentInfo | null;
  timestamp: number;
}
const deploymentCache = new Map<string, CachedDeployment>();
const DEPLOYMENT_CACHE_TTL = 15_000; // 15 seconds

async function lookupDeployment(slug: string): Promise<DeploymentInfo | null> {
  const cached = deploymentCache.get(slug);
  const now = Date.now();
  if (cached && (now - cached.timestamp < DEPLOYMENT_CACHE_TTL)) {
    return cached.info;
  }
  const raw = await redis.get(`deployment:${slug}`);
  const info: DeploymentInfo | null = raw ? JSON.parse(raw) : null;
  deploymentCache.set(slug, { info, timestamp: now });
  return info;
}

function invalidateDeploymentCache(slug: string) {
  deploymentCache.delete(slug);
}

// ── Throttled Access Time Tracking (Scale-to-zero idle detection) ────────────
const lastAccessMap = new Map<string, number>();
function trackAccess(deploymentId: string) {
  const now = Date.now();
  const last = lastAccessMap.get(deploymentId) || 0;
  // Scale-to-zero threshold is 10-20 minutes, so updating Redis once every 60s is plenty
  if (now - last > 60_000) {
    lastAccessMap.set(deploymentId, now);
    redis.set(`access:${deploymentId}`, now).catch(() => {});
  }
}

// ── Buffered In-Memory Analytics (Batches writes to prevent Redis overload) ──
let analyticsBuffer: any[] = [];
function bufferAnalyticsEvent(event: any) {
  // Only track HTML/page views, ignore static files (.css, .js, .png, etc.)
  const isPageView = !event.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|map|webp|avif)$/i);
  if (!isPageView) return;

  analyticsBuffer.push(event);
  if (analyticsBuffer.length >= 25) {
    flushAnalytics();
  }
}

function flushAnalytics() {
  if (analyticsBuffer.length === 0) return;
  const batch = analyticsBuffer.splice(0, 50);
  const strings = batch.map((e) => JSON.stringify(e));
  redis.rpush("analytics:buffer", ...strings).catch(() => {});
}

// Periodic flush every 30 seconds
setInterval(flushAnalytics, 30_000);

// ─── Proxy ───────────────────────────────────────────────────────────────────

const proxy = httpProxy.createProxyServer({
  changeOrigin: true,
  proxyTimeout: 30_000,
  timeout: 30_000,
  ws: true, // Enable WebSockets support
});

proxy.on("error", (err, req, res) => {
  console.error(`[Router] Proxy error for ${req.headers.host}${req.url}:`, err.message);
  
  // Extract slug to trigger a cold-start (wakeup)
  const host = req.headers.host || "";
  let slug = "";
  if (host.endsWith(`.${BASE_DOMAIN}`) || host.endsWith(`.${BASE_DOMAIN}:${ROUTER_PORT}`)) {
    slug = host.split(".")[0];
  } else {
    slug = host.replace(/:.*$/, "");
  }

  // Invalidate cache immediately on proxy error
  invalidateDeploymentCache(slug);

  // Look up deployment ID from Redis and trigger a wakeup
  lookupDeployment(slug).then(async (dep) => {
    if (dep) {
      if (dep.type === "static") return; // Static deployments are file-based and never run proxy containers
      console.log(`[Router] Container missing for ${slug} (proxy error). Triggering wakeup...`);
      const acquiredLock = await redis.set(`wakeup:inflight:${slug}`, "1", "EX", 30, "NX").catch(() => null);
      if (acquiredLock) {
        redis.publish("wakeup", JSON.stringify({
          slug,
          deploymentId: dep.deploymentId,
          type: dep.type || (dep as any).deploymentType || "service"
        })).catch(() => {});
      }
    }
  }).catch(() => {});

  if ("writeHead" in res && !res.headersSent) {
    if (
      req.url?.startsWith("/_internal/runtime") ||
      req.url === "/bundle" ||
      req.url === "/invoke" ||
      req.headers.accept?.includes("application/json")
    ) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "RUNTIME_UNAVAILABLE", message: "Whizan Function Runtime is temporarily unreachable" }));
      return;
    }
    const isHtml = req.headers.accept?.includes("text/html");
    if (isHtml) {
      res.writeHead(502, { "Content-Type": "text/html" });
      res.end(loadingScreenHtml("Starting Application...", "Your app is spinning up. This page will auto-refresh."));
    } else {
      res.writeHead(502);
      res.end("Bad Gateway - Application Starting");
    }
  } else if ("destroy" in res) {
    // It's a raw Socket
    res.destroy();
  }
});

// ─── Static file servers (cached per staticDir) ───────────────────────────────

const staticServers = new Map<string, ReturnType<typeof serveStatic>>();

function getStaticServer(staticDir: string) {
  if (!staticServers.has(staticDir)) {
    staticServers.set(staticDir, serveStatic(staticDir, { index: ["index.html"] }));
  }
  return staticServers.get(staticDir)!;
}

// ─── Main HTTP Server ─────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // ── Internal Runtime Bridge (Secure VM bridge for Control Plane / API) ────
  if (req.url?.startsWith("/_internal/runtime/")) {
    const internalSecret = req.headers["x-whizan-internal"];
    const validSecrets = [
      process.env.INTERNAL_SECRET,
      process.env.JWT_SECRET,
      "whizan-internal-runtime-mesh-key-9b8c7d6e",
      "81a56b57528ea5d96551b49394cf1877434d40ad5a33c9c349f5869da5e0489f",
    ].filter(Boolean);

    if (!internalSecret || !validSecrets.includes(internalSecret as string)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "UNAUTHORIZED_INTERNAL_CALL", message: "Invalid or missing internal secret" }));
      return;
    }

    // Rewrite URL to strip /_internal/runtime
    req.url = req.url.replace(/^\/_internal\/runtime/, "") || "/";
    proxy.web(req, res, { target: `http://127.0.0.1:${FUNCTION_RUNTIME_PORT}` });
    return;
  }

  const host = req.headers.host || "";

  // Extract slug from subdomain: my-app.localhost → my-app
  // Also handles custom domains
  let slug: string;
  if (host.endsWith(`.${BASE_DOMAIN}`) || host.endsWith(`.${BASE_DOMAIN}:${ROUTER_PORT}`)) {
    slug = host.split(".")[0];
  } else {
    // Treat the whole host as a custom domain key
    slug = host.replace(/:.*$/, ""); // strip port
  }
  // Sanitize slug against malicious characters / CRLF / path traversal
  slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");

  if (!slug) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Bad Request: Invalid Host");
    return;
  }

  // ── Edge Functions Routing (.fn.<domain> or /fn/<slug>) ───────────────────
  if (host.includes(".fn.") || (req.url && req.url.startsWith("/fn/"))) {
    let fnSlug = slug;
    let targetPath = req.url || "/";

    if (host.includes(".fn.")) {
      fnSlug = host.split(".fn.")[0].toLowerCase().replace(/[^a-z0-9-]/g, "");
    } else if (req.url && req.url.startsWith("/fn/")) {
      const parts = req.url.split("/");
      fnSlug = parts[2]?.toLowerCase().replace(/[^a-z0-9-]/g, "") || "";
      targetPath = "/" + parts.slice(3).join("/");
    }

    if (fnSlug) {
      await handleFunctionRequest(fnSlug, req, res, targetPath);
      return;
    }
  }

  // ── Lookup deployment from Redis ──────────────────────────────────────────
  const deployment = await lookupDeployment(slug).catch(() => null);

  if (!deployment) {
    // Check if this slug is an Edge Function without .fn. prefix
    const isFn = await redis.exists(`fn:service:${slug}`).catch(() => 0);
    if (isFn) {
      await handleFunctionRequest(slug, req, res, req.url || "/");
      return;
    }

    // Try API resolve fallback for function before failing with 404
    try {
      const apiRes = await queryControlPlaneApi(`/api/functions/internal/resolve/${slug}`);
      if (apiRes && apiRes.ok) {
        await handleFunctionRequest(slug, req, res, req.url || "/");
        return;
      }
    } catch {}

    res.writeHead(404, { "Content-Type": "text/html" });
    res.end(`
      <html><body style="font-family:sans-serif;text-align:center;padding:4rem">
        <h1>404 — Not Found</h1>
        <p>No deployment found for <strong>${slug}</strong></p>
        <p><a href="${process.env.DASHBOARD_URL || 'https://whizan-cloud-service-dashboard-pzb235rqo.vercel.app'}">Back to Dashboard</a></p>
      </body></html>
    `);
    return;
  }

  // Track access time for scale-to-zero idle detection (throttled to once per 60s per deployment)
  trackAccess(deployment.deploymentId);
  (req as any).__deploymentInfo = deployment;

  const { type, staticDir, containerPort } = deployment;
  const requestPath = req.url || "/";

  // ── STATIC: Serve files directly from disk ─────────────────────────────────
  if (type === "static" && staticDir) {
    const indexHtml = path.join(staticDir, "index.html");
    if (!fs.existsSync(staticDir) || !fs.existsSync(indexHtml)) {
      console.warn(`[Router] Static directory or index.html missing on disk for ${slug} (${staticDir}). Triggering cold-start rebuild...`);
      await handleWakeupAndProxy(deployment, req, res, slug);
      return;
    }
    const serve = getStaticServer(staticDir);
    const startBytes = res.socket?.bytesWritten || 0;
    serve(req as any, res as any, finalhandler(req, res) as any);
    res.on("finish", () => {
      const bytesSent = Math.max(0, (res.socket?.bytesWritten || 0) - startBytes);
      const event = {
        projectId: (deployment as any).projectId,
        date: new Date().toISOString().split("T")[0],
        path: req.url || "/",
        bytesSent,
        ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "0.0.0.0",
      };
      bufferAnalyticsEvent(event);
    });
    return;
  }

  // ── HYBRID: Static assets go to disk, dynamic routes go to container ───────
  if (type === "hybrid") {
    const isStaticAsset =
      requestPath.startsWith("/_next/static/") ||
      requestPath.startsWith("/static/") ||
      /\.(css|js|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|map)$/.test(requestPath);

    if (isStaticAsset && staticDir) {
      // Map /_next/static/* to the actual static dir on disk
      const actualPath = path.join(staticDir, requestPath.replace("/_next/static", ""));
      if (fs.existsSync(actualPath)) {
        const serve = getStaticServer(staticDir);
        // Rewrite the URL so serve-static can find it
        req.url = requestPath.replace("/_next/static", "");
        serve(req as any, res as any, () => {
          // Fallback to container if file not found on disk
          if (containerPort) {
            proxy.web(req, res, { target: `http://127.0.0.1:${containerPort}` });
          } else {
            res.writeHead(404); res.end("Not found");
          }
        });
        return;
      }
    }

    // Dynamic request → forward to SSR container
    if (containerPort) {
      proxy.web(req, res, { target: `http://127.0.0.1:${containerPort}` });
      return;
    } else {
      // Scale-to-zero wakeup
      await handleWakeupAndProxy(deployment, req, res, slug);
      return;
    }
  }

  // ── SSR & SERVICE: All traffic → container ───────────────────────────────
  if (type === "ssr" || type === "service") {
    if (containerPort) {
      proxy.web(req, res, { target: `http://127.0.0.1:${containerPort}` });
      // The proxy handles the response, so we track analytics in proxy.on('proxyRes')
      return;
    } else {
      // Scale-to-zero wakeup
      await handleWakeupAndProxy(deployment, req, res, slug);
      return;
    }
  }

  res.writeHead(503);
  res.end("Service Unavailable");
});

// ─── Edge Function Handler ───────────────────────────────────────────────────

async function handleFunctionRequest(
  slug: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  targetPath = "/"
) {
  // 1. Resolve Function Metadata from Redis or API fallback
  let rawMeta = await redis.get(`fn:service:${slug}`).catch(() => null);
  let fnMeta: any = null;

  if (rawMeta) {
    try {
      fnMeta = JSON.parse(rawMeta);
    } catch {}
  }

  // Fallback to internal API if cache missed (e.g. after VM reboot or Redis flush)
  if (!fnMeta) {
    try {
      const apiRes = await queryControlPlaneApi(`/api/functions/internal/resolve/${slug}`);
      if (apiRes && apiRes.ok) {
        fnMeta = await apiRes.json();
      }
    } catch (e: any) {
      console.warn(`[Router] Internal resolve failed for fn ${slug}:`, e.message);
    }
  }

  if (!fnMeta) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "NOT_FOUND", message: `No Edge Function found for slug '${slug}'` }));
    return;
  }

  // 2. Handle CORS Preflight & Headers
  const corsAllowed = fnMeta.corsOrigins?.includes("*") || fnMeta.corsOrigins?.includes(req.headers.origin);
  const originHeader = corsAllowed ? (req.headers.origin || "*") : (fnMeta.corsOrigins?.[0] || "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": originHeader,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  // 3. Authentication & Rate Limiting
  if (!fnMeta.isPublic) {
    const keyHeader = req.headers["x-api-key"] as string | undefined;
    const authHeader = req.headers["authorization"] as string | undefined;
    const rawUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const queryKey = rawUrl.searchParams.get("apiKey") || rawUrl.searchParams.get("api_key");
    const rawKey = keyHeader || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null) || queryKey;

    if (!rawKey) {
      res.writeHead(401, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": originHeader,
      });
      res.end(JSON.stringify({
        error: "UNAUTHORIZED",
        message: "Missing required Function API Key. Provide 'x-api-key: whz_fn_live_...' or 'Authorization: Bearer whz_fn_live_...' header.",
      }));
      return;
    }

    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    let keyMetaRaw = await redis.get(`fn:key:${keyHash}`).catch(() => null);
    let keyMeta: any = null;

    if (keyMetaRaw) {
      try { keyMeta = JSON.parse(keyMetaRaw); } catch {}
    }

    // Fallback to internal API verification on cache miss
    if (!keyMeta) {
      try {
        const verifyRes = await queryControlPlaneApi(`/api/functions/internal/verify-key`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyHash, serviceId: fnMeta.serviceId }),
        });
        if (verifyRes && verifyRes.ok) {
          keyMeta = await verifyRes.json();
        }
      } catch (e: any) {
        console.warn(`[Router] API Key fallback verification failed:`, e.message);
      }
    }

    if (!keyMeta || keyMeta.serviceId !== fnMeta.serviceId) {
      res.writeHead(401, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": originHeader,
      });
      res.end(JSON.stringify({ error: "UNAUTHORIZED", message: "Invalid or expired Function API Key." }));
      return;
    }

    // Rate Limiting: Atomic Token Bucket in Redis
    const minuteBucket = Math.floor(Date.now() / 60000);
    const rateKey = `fn:rate:${keyHash}:${minuteBucket}`;
    const currentCount = await redis.incr(rateKey).catch(() => 1);
    if (currentCount === 1) {
      redis.expire(rateKey, 70).catch(() => {});
    }

    const limit = keyMeta.rateLimitRpm || 600;
    if (currentCount > limit) {
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": "60",
        "Access-Control-Allow-Origin": originHeader,
      });
      res.end(JSON.stringify({ error: "TOO_MANY_REQUESTS", message: `Rate limit of ${limit} req/min exceeded.` }));
      return;
    }

    // IP Whitelist
    if (keyMeta.ipWhitelist && keyMeta.ipWhitelist.length > 0) {
      const clientIp = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";
      const isAllowed = keyMeta.ipWhitelist.some((ip: string) => clientIp.includes(ip));
      if (!isAllowed) {
        res.writeHead(403, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": originHeader,
        });
        res.end(JSON.stringify({ error: "FORBIDDEN", message: "Client IP not permitted by API Key policy." }));
        return;
      }
    }
  }

  // 4. Read Request Body
  let bodyBuffer: Buffer | null = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      bodyBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        req.on("data", (chunk) => {
          totalBytes += chunk.length;
          if (totalBytes > 10 * 1024 * 1024) { // 10MB limit
            reject(new Error("PAYLOAD_TOO_LARGE"));
          }
          chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
      });
    } catch (err: any) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "PAYLOAD_TOO_LARGE", message: "Max payload size is 10MB." }));
      return;
    }
  }

  let parsedBody: any = null;
  if (bodyBuffer && bodyBuffer.length > 0) {
    const cType = (req.headers["content-type"] || "").toLowerCase();
    if (cType.includes("application/json")) {
      try { parsedBody = JSON.parse(bodyBuffer.toString("utf8")); } catch { parsedBody = bodyBuffer.toString("utf8"); }
    } else {
      parsedBody = bodyBuffer.toString("utf8");
    }
  }

  // 5. Forward to Function Runtime Engine
  const parsedUrl = new URL(targetPath, `http://${req.headers.host || "localhost"}`);
  const queryObj: Record<string, string> = {};
  parsedUrl.searchParams.forEach((v, k) => { queryObj[k] = v; });

  const clientIp = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";

  const invocationPayload = {
    serviceId: fnMeta.serviceId,
    slug: fnMeta.slug,
    version: fnMeta.version,
    bundlePath: fnMeta.bundlePath,
    routePath: parsedUrl.pathname,
    method: req.method,
    headers: req.headers,
    query: queryObj,
    body: parsedBody,
    clientIp,
    timeoutMs: fnMeta.timeoutMs,
    memoryLimit: fnMeta.memoryLimit,
    envVars: fnMeta.decryptedEnv || {},
  };

  try {
    const runtimeRes = await fetch(`http://127.0.0.1:${FUNCTION_RUNTIME_PORT}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invocationPayload),
    });

    const result: any = await runtimeRes.json();

    const responseHeaders: Record<string, any> = {
      ...(result.headers || {}),
      "Access-Control-Allow-Origin": originHeader,
      "X-Whizan-Runtime": "Edge-V8",
      "X-Whizan-Duration-Ms": String(result.durationMs ?? 0),
      "X-Whizan-Memory-Mb": String(result.memoryMb ?? 0),
    };

    res.writeHead(result.statusCode || 200, responseHeaders);

    if (result.isBase64 && result.body) {
      res.end(Buffer.from(result.body, "base64"));
    } else {
      res.end(result.body || "");
    }

    // Asynchronously buffer invocation telemetry
    const telemetryEvent = {
      serviceId: fnMeta.serviceId,
      endpoint: parsedUrl.pathname,
      httpMethod: req.method || "GET",
      statusCode: result.statusCode || 200,
      durationMs: result.durationMs || 0,
      memoryMb: result.memoryMb || 0,
      clientIp,
      timestamp: new Date().toISOString(),
    };
    redis.rpush("fn:invocations:buffer", JSON.stringify(telemetryEvent)).catch(() => {});
  } catch (err: any) {
    console.error(`[Router] Error proxying to Function Runtime:`, err.message);
    res.writeHead(502, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": originHeader,
    });
    res.end(JSON.stringify({
      error: "BAD_GATEWAY",
      message: "Function Runtime Engine unavailable. Please ensure whizan-functions is running.",
    }));
  }
}

// ── Analytics Tracking ────────────────────────────────────────────────────────
proxy.on("proxyRes", (proxyRes, req, res) => {
  const host = req.headers.host || "";
  let slug = "";
  if (host.endsWith(`.${BASE_DOMAIN}`) || host.endsWith(`.${BASE_DOMAIN}:${ROUTER_PORT}`)) {
    slug = host.split(".")[0];
  } else {
    slug = host.replace(/:.*$/, "");
  }

  // Count bytes written
  let bytesSent = 0;
  proxyRes.on("data", (chunk) => { bytesSent += chunk.length; });

  proxyRes.on("end", () => {
    const dep: any = (req as any).__deploymentInfo || deploymentCache.get(slug)?.info;
    if (dep && dep.projectId) {
      const event = {
        projectId: dep.projectId,
        date: new Date().toISOString().split("T")[0],
        path: req.url || "/",
        bytesSent,
        ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "0.0.0.0",
      };
      bufferAnalyticsEvent(event);
    }
  });
});

async function handleWakeupAndProxy(deployment: DeploymentInfo, req: http.IncomingMessage, res: http.ServerResponse, slug: string) {
  // Deduplicate wakeups: don't publish another wakeup if one was requested in the last 20 seconds
  const acquiredLock = await redis.set(`wakeup:inflight:${slug}`, "1", "EX", 20, "NX").catch(() => null);
  if (acquiredLock) {
    console.log(`[Router] Cold start: waking up deployment ${deployment.deploymentId} for ${slug}...`);
    redis.publish("wakeup", JSON.stringify({ 
      slug, 
      deploymentId: deployment.deploymentId, 
      type: deployment.type || (deployment as any).deploymentType || "service"
    })).catch(() => {});
  }

  // Instantly return the loading screen so the user sees feedback immediately, instead of a hanging browser tab
  const isHtml = req.headers.accept?.includes("text/html");
  if (isHtml) {
    res.writeHead(202, { "Content-Type": "text/html" });
    res.end(loadingScreenHtml("Waking up...", "Your app was asleep to save resources. It is spinning up now..."));
  } else {
    res.writeHead(202);
    res.end("Application is waking up. Please retry in a few seconds.");
  }
}

function loadingScreenHtml(title: string, message: string) {
  return `
    <html>
      <head>
        <title>${title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&family=JetBrains+Mono:wght@400;500&display=swap');
          
          * { box-sizing: border-box; }
          body { 
            font-family: 'Inter', sans-serif; 
            margin: 0; 
            padding: 0; 
            min-height: 100vh; 
            background: #000; 
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          
          .bg-grid {
            position: absolute;
            width: 200vw;
            height: 200vh;
            background-size: 50px 50px;
            background-image: 
              linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
            transform: perspective(500px) rotateX(60deg) translateY(-100px) translateZ(-200px);
            animation: pan 20s linear infinite;
            z-index: 0;
          }

          @keyframes pan {
            0% { transform: perspective(500px) rotateX(60deg) translateY(0) translateZ(-200px); }
            100% { transform: perspective(500px) rotateX(60deg) translateY(50px) translateZ(-200px); }
          }

          .container {
            position: relative;
            z-index: 10;
            text-align: center;
            padding: 3rem;
            background: rgba(15, 23, 42, 0.6);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            box-shadow: 0 0 40px rgba(56, 189, 248, 0.1), inset 0 0 20px rgba(255, 255, 255, 0.02);
            max-width: 500px;
            width: 90%;
          }

          .glowing-orb {
            position: absolute;
            top: -50px;
            left: 50%;
            transform: translateX(-50%);
            width: 150px;
            height: 150px;
            background: radial-gradient(circle, rgba(56, 189, 248, 0.4) 0%, transparent 70%);
            border-radius: 50%;
            z-index: -1;
            animation: pulse 3s ease-in-out infinite alternate;
          }

          @keyframes pulse {
            0% { opacity: 0.5; transform: translateX(-50%) scale(1); }
            100% { opacity: 1; transform: translateX(-50%) scale(1.2); }
          }

          .loader {
            position: relative;
            width: 64px;
            height: 64px;
            margin: 0 auto 2rem;
          }

          .loader svg {
            animation: spin 2s linear infinite;
            width: 100%;
            height: 100%;
            stroke: #38bdf8;
            stroke-width: 2;
            fill: none;
            stroke-linecap: round;
          }

          @keyframes spin {
            100% { transform: rotate(360deg); }
          }

          h1 {
            font-size: 1.75rem;
            font-weight: 600;
            margin: 0 0 1rem;
            background: linear-gradient(to right, #fff, #94a3b8);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: -0.025em;
          }

          p {
            color: #94a3b8;
            font-size: 1rem;
            line-height: 1.6;
            margin: 0 0 2rem;
          }

          .terminal {
            background: #050505;
            border: 1px solid #1e293b;
            border-radius: 12px;
            padding: 1rem;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem;
            color: #10b981;
            text-align: left;
            position: relative;
            overflow: hidden;
          }

          .terminal::before {
            content: "";
            position: absolute;
            top: 0; left: 0; right: 0; height: 3px;
            background: linear-gradient(90deg, transparent, #38bdf8, transparent);
            animation: scan 2s linear infinite;
          }

          @keyframes scan {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }

          .blink { animation: blink 1s step-end infinite; }
          @keyframes blink { 50% { opacity: 0; } }
        </style>
      </head>
      <body>
        <div class="bg-grid"></div>
        <div class="container">
          <div class="glowing-orb"></div>
          <div class="loader">
            <svg viewBox="0 0 50 50">
              <circle cx="25" cy="25" r="20" stroke-dasharray="31.4 100" />
              <circle cx="25" cy="25" r="12" stroke-dasharray="18.8 100" style="stroke: #818cf8; animation-direction: reverse;" />
            </svg>
          </div>
          <h1>${title}</h1>
          <p>${message}</p>
          <div class="terminal">
            <span style="color:#64748b">></span> [System] Connecting to container...<br/>
            <span style="color:#64748b">></span> [Docker] Restoring memory state...<br/>
            <span style="color:#64748b">></span> [Edge] Awaiting HTTP readiness<span class="blink">_</span>
          </div>
        </div>
        <script>
          // Exponential backoff polling
          let attempts = 0;
          const maxDelay = 2000;
          
          function checkHealth() {
            attempts++;
            const delay = Math.min(500 * Math.pow(1.2, attempts), maxDelay);
            
            setTimeout(() => {
              fetch(window.location.href, { method: 'HEAD', cache: 'no-store' })
                .then(res => {
                  if (res.status !== 502 && res.status !== 202 && res.status !== 503) {
                    document.querySelector('.terminal').innerHTML += '<br/><span style="color:#64748b">></span> [Network] 200 OK. Reloading...';
                    setTimeout(() => window.location.reload(true), 300);
                  } else {
                    checkHealth();
                  }
                }).catch(() => checkHealth());
            }, delay);
          }
          
          // Start polling
          checkHealth();
        </script>
      </body>
    </html>
  `;
}

// ─── WebSocket Support (Upgrade Event) ────────────────────────────────────────

server.on("upgrade", async (req, socket, head) => {
  const host = req.headers.host || "";
  let slug: string;
  
  if (host.endsWith(`.${BASE_DOMAIN}`) || host.endsWith(`.${BASE_DOMAIN}:${ROUTER_PORT}`)) {
    slug = host.split(".")[0];
  } else {
    slug = host.replace(/:.*$/, "");
  }
  slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");

  if (!slug) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  const deployment = await lookupDeployment(slug).catch(() => null);
  
  if (!deployment) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  // Update access time for scale-to-zero tracking
  redis.set(`access:${deployment.deploymentId}`, Date.now().toString(), "EX", 30 * 24 * 60 * 60).catch(() => {});

  if (deployment.type === "static" || (deployment as any).deploymentType === "STATIC") {
    // Static sites don't support WebSockets
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  if (deployment.containerPort) {
    // Container is awake! Proxy the WebSocket connection directly
    proxy.ws(req, socket, head, { target: `http://127.0.0.1:${deployment.containerPort}` });
  } else {
    // Cold start for WebSockets. We can't render an auto-refresh HTML screen on a raw TCP socket.
    // We publish a wakeup event, then instantly reject the socket so the client app's reconnection logic kicks in.
    console.log(`[Router] Cold start (WS): waking up deployment ${deployment.deploymentId}...`);
    redis.publish("wakeup", JSON.stringify({ 
      slug, 
      deploymentId: deployment.deploymentId, 
      type: deployment.type || (deployment as any).deploymentType 
    })).catch(() => {});
    socket.write('HTTP/1.1 503 Service Unavailable\r\nRetry-After: 3\r\n\r\n');
    socket.destroy();
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

server.listen(ROUTER_PORT, () => {
  console.log(`[Router] Edge Router running on port ${ROUTER_PORT}`);
  console.log(`[Router] Base domain: *.${BASE_DOMAIN}`);
  console.log(`[Router] Redis: ${REDIS_URL}`);
});

process.on("SIGTERM", () => {
  server.close(() => {
    redis.quit();
    process.exit(0);
  });
});
