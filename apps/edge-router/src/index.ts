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
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 2500,
  commandTimeout: 2000,
  retryStrategy(times) {
    return Math.min(times * 200, 3000);
  },
});
redis.on("error", (err) => {
  if (!err.message?.includes("ECONNREFUSED") && !err.message?.includes("ETIMEDOUT")) {
    console.error("[Router Redis] Error:", err.message);
  }
});

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
const DEPLOYMENT_CACHE_TTL = 15_000; // 15 seconds nominal cache

async function lookupDeployment(slug: string): Promise<DeploymentInfo | null> {
  const cached = deploymentCache.get(slug);
  const now = Date.now();
  if (cached && (now - cached.timestamp < DEPLOYMENT_CACHE_TTL)) {
    return cached.info;
  }
  try {
    const raw = await redis.get(`deployment:${slug}`);
    const info: DeploymentInfo | null = raw ? JSON.parse(raw) : null;
    deploymentCache.set(slug, { info, timestamp: now });
    return info;
  } catch (err) {
    return cached?.info || null;
  }
}

function invalidateDeploymentCache(slug: string) {
  deploymentCache.delete(slug);
}

// ── Throttled Access Time Tracking (Scale-to-zero idle detection) ────────────
const lastAccessMap = new Map<string, number>();
function trackAccess(deploymentId: string) {
  const now = Date.now();
  const last = lastAccessMap.get(deploymentId) || 0;
  // Scale-to-zero threshold is 10-20 minutes, so updating Redis once every 60s is nominal
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
      res.end(loadingScreenHtml("Starting Application", "Your service is spinning up. This page will auto-refresh.", slug));
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
  // ── Top-level Router Health & Ping ───────────────────────────────────────
  if (req.url === "/health" || req.url === "/ping" || req.url === "/_internal/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "edge-router", timestamp: new Date().toISOString() }));
    return;
  }

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

  // 3. Resolve Endpoint & Granular Security Policy
  const parsedTarget = new URL(targetPath, `http://${req.headers.host || "localhost"}`);
  const cleanPath = parsedTarget.pathname.startsWith("/") ? parsedTarget.pathname : `/${parsedTarget.pathname}`;
  const normalizedPath = (cleanPath.length > 1 && cleanPath.endsWith("/")) ? cleanPath.slice(0, -1) : cleanPath;

  let matchedEndpoint: any = null;
  if (Array.isArray(fnMeta.endpoints) && fnMeta.endpoints.length > 0) {
    // 1. Exact match (case-insensitive)
    matchedEndpoint = fnMeta.endpoints.find((ep: any) => {
      const epPath = ep.routePath.startsWith("/") ? ep.routePath : `/${ep.routePath}`;
      const epNorm = (epPath.length > 1 && epPath.endsWith("/")) ? epPath.slice(0, -1) : epPath;
      return epNorm.toLowerCase() === normalizedPath.toLowerCase();
    });

    // 2. Prefix match (e.g. /courses matching /courses/123)
    if (!matchedEndpoint) {
      matchedEndpoint = fnMeta.endpoints.find((ep: any) => {
        const epPath = ep.routePath.startsWith("/") ? ep.routePath : `/${ep.routePath}`;
        return epPath !== "/" && normalizedPath.toLowerCase().startsWith(epPath.toLowerCase() + "/");
      });
    }

    // 3. Dynamic parameter match (e.g. /users/:id)
    if (!matchedEndpoint) {
      matchedEndpoint = fnMeta.endpoints.find((ep: any) => {
        if (!ep.routePath.includes(":") && !ep.routePath.includes("*")) return false;
        const regexPattern = "^" + ep.routePath
          .replace(/:[a-zA-Z0-9_]+/g, "[^/]+")
          .replace(/\*/g, ".*") + "$";
        try {
          return new RegExp(regexPattern, "i").test(normalizedPath);
        } catch {
          return false;
        }
      });
    }
  }

  // HTTP Method Check
  if (matchedEndpoint && Array.isArray(matchedEndpoint.httpMethods) && matchedEndpoint.httpMethods.length > 0) {
    const allowedMethods = matchedEndpoint.httpMethods.map((m: string) => m.toUpperCase());
    if (req.method && req.method !== "OPTIONS" && !allowedMethods.includes(req.method.toUpperCase())) {
      res.writeHead(405, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": originHeader,
        "Allow": allowedMethods.join(", "),
      });
      res.end(JSON.stringify({
        error: "METHOD_NOT_ALLOWED",
        message: `HTTP ${req.method} is not allowed for endpoint '${matchedEndpoint.routePath}'. Allowed methods: ${allowedMethods.join(", ")}`,
      }));
      return;
    }
  }

  // Determine if authentication is required:
  // Explicit endpoint setting takes precedence; if unspecified, fallback to service-level isPublic.
  const isEndpointPublic = (matchedEndpoint && typeof matchedEndpoint.isPublic === "boolean")
    ? matchedEndpoint.isPublic
    : Boolean(fnMeta.isPublic);

  const requiresAuth = !isEndpointPublic;

  // Authentication & Rate Limiting (when requiresAuth is true)
  if (requiresAuth) {
    const keyHeader = req.headers["x-api-key"] as string | undefined;
    const authHeader = req.headers["authorization"] as string | undefined;
    const queryKey = parsedTarget.searchParams.get("apiKey") || parsedTarget.searchParams.get("api_key");
    const rawKey = keyHeader || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null) || queryKey;

    if (!rawKey) {
      res.writeHead(401, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": originHeader,
      });
      res.end(JSON.stringify({
        error: "UNAUTHORIZED",
        message: `Authentication required for ${matchedEndpoint ? `endpoint '${matchedEndpoint.routePath}'` : `function service '${slug}'`}. Provide 'x-api-key: whz_fn_live_...' or 'Authorization: Bearer whz_fn_live_...' header.`,
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
    timeoutMs: matchedEndpoint?.timeoutMs || (matchedEndpoint?.timeoutSeconds ? matchedEndpoint.timeoutSeconds * 1000 : fnMeta.timeoutMs),
    memoryLimit: matchedEndpoint?.memoryLimit || fnMeta.memoryLimit,
    handlerName: matchedEndpoint?.handlerName || undefined,
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
    res.end(loadingScreenHtml("Awakening Application", "Your service was in eco-standby to save compute resources. Warming up memory & edge routing now...", slug));
  } else {
    res.writeHead(202);
    res.end("Application is waking up. Please retry in a few seconds.");
  }
}

function loadingScreenHtml(title: string, message: string, slug?: string) {
  const displaySlug = slug ? `${slug}.20.2.136.11.nip.io` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || "Awakening Service"} • Whizan</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      background: #0c0a18;
      color: #ffffff;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
      -webkit-font-smoothing: antialiased;
    }

    #fibers-canvas {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      z-index: 1;
      pointer-events: none;
    }

    /* Vignette Depth */
    .vignette {
      position: fixed;
      inset: 0;
      z-index: 2;
      pointer-events: none;
      background: radial-gradient(circle at 50% 50%, rgba(12, 10, 24, 0.25) 0%, rgba(12, 10, 24, 0.8) 75%, rgba(12, 10, 24, 0.98) 100%);
    }

    /* Precise Centerpiece Card */
    .card {
      position: relative;
      z-index: 10;
      width: 90%;
      max-width: 460px;
      background: rgba(16, 13, 33, 0.76);
      backdrop-filter: blur(32px) saturate(180%);
      -webkit-backdrop-filter: blur(32px) saturate(180%);
      border: 1px solid rgba(52, 55, 160, 0.35);
      border-radius: 24px;
      padding: 2.4rem 2rem 2rem;
      text-align: center;
      box-shadow:
        0 25px 70px -10px rgba(0, 0, 0, 0.85),
        0 0 50px rgba(52, 55, 160, 0.25),
        inset 0 1px 0 rgba(255, 255, 255, 0.12);
      transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .card.is-ready {
      border-color: rgba(99, 102, 241, 0.7);
      box-shadow:
        0 30px 80px -10px rgba(0, 0, 0, 0.9),
        0 0 80px rgba(52, 55, 160, 0.5),
        inset 0 1px 0 rgba(99, 102, 241, 0.4);
      transform: scale(1.02);
    }

    .card-rim {
      position: absolute;
      top: 0;
      left: 25%;
      right: 25%;
      height: 2px;
      background: linear-gradient(90deg, transparent, #3437A0, #6366f1, transparent);
      border-radius: 2px;
      filter: blur(0.5px);
    }

    /* Badge */
    .pill-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      background: rgba(52, 55, 160, 0.2);
      border: 1px solid rgba(52, 55, 160, 0.45);
      border-radius: 9999px;
      padding: 0.28rem 0.8rem;
      margin-bottom: 1.2rem;
    }

    .pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #818cf8;
      box-shadow: 0 0 8px #818cf8;
      animation: dotPulse 1.8s ease-in-out infinite alternate;
    }

    @keyframes dotPulse {
      0% { transform: scale(0.85); opacity: 0.6; }
      100% { transform: scale(1.2); opacity: 1; }
    }

    .pill-text {
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #a5b4fc;
    }

    h1 {
      font-size: 1.55rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      margin-bottom: 0.55rem;
      background: linear-gradient(135deg, #ffffff 40%, #c7d2fe 75%, #818cf8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      line-height: 1.25;
    }

    .subtitle {
      font-size: 0.88rem;
      color: #94a3b8;
      line-height: 1.55;
      margin-bottom: 1.4rem;
      padding: 0 0.4rem;
    }

    /* Domain Chip */
    .domain-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(52, 55, 160, 0.35);
      border-radius: 8px;
      padding: 0.35rem 0.75rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
      color: #e2e8f0;
      margin-bottom: 1.5rem;
    }

    /* Progress Bar */
    .progress-bar {
      height: 4px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 9999px;
      overflow: hidden;
      margin-bottom: 1.2rem;
    }

    .progress-fill {
      height: 100%;
      width: 25%;
      border-radius: 9999px;
      background: linear-gradient(90deg, #3437A0, #6366f1, #38bdf8);
      box-shadow: 0 0 14px rgba(99, 102, 241, 0.9);
      transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Live Step Feed */
    .stage-step {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(10, 8, 22, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 0.65rem 0.9rem;
      font-size: 0.8rem;
      color: #e2e8f0;
    }

    .step-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      text-align: left;
    }

    .timer-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.74rem;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.06);
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <!-- Ghost Fibers Wave Simulation Canvas -->
  <canvas id="fibers-canvas"></canvas>

  <div class="vignette"></div>

  <!-- Precise Centerpiece Card -->
  <main class="card" id="main-card">
    <div class="card-rim"></div>

    <div class="pill-badge">
      <span class="pulse-dot"></span>
      <span class="pill-text" id="status-pill-text">Whizan Scale-to-Zero</span>
    </div>

    <h1 id="headline">Awakening Service</h1>
    <p class="subtitle" id="subtext">
      Your container was in eco-standby to save compute resources. Warming up memory & edge routing now.
    </p>

    ${displaySlug ? `
    <div class="domain-chip">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10z"></path>
      </svg>
      <span>${displaySlug}</span>
    </div>` : ""}

    <div class="progress-bar">
      <div class="progress-fill" id="progress-fill"></div>
    </div>

    <div class="stage-step">
      <div class="step-left">
        <span id="step-icon">⚡</span>
        <span id="step-text" style="color: #cbd5e1;">Awakening compute container...</span>
      </div>
      <span class="timer-badge" id="elapsed-timer">0.0s</span>
    </div>
  </main>

  <script>
    // ── Ghost Fibers Visual Wave Simulation ──
    (function() {
      const canvas = document.getElementById('fibers-canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      let w = canvas.width = window.innerWidth;
      let h = canvas.height = window.innerHeight;

      window.addEventListener('resize', function() {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
      });

      let time = 0;
      const layers = 4;

      function draw() {
        time += 0.012;
        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = '#0c0a18';
        ctx.fillRect(0, 0, w, h);

        const cx = w * 0.5;
        const cy = h * 0.5;

        // Radial atmosphere glow
        const radial = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) * 0.65);
        radial.addColorStop(0, 'rgba(52, 55, 160, 0.28)');
        radial.addColorStop(0.5, 'rgba(20, 14, 53, 0.35)');
        radial.addColorStop(1, 'rgba(12, 10, 24, 0.9)');
        ctx.fillStyle = radial;
        ctx.fillRect(0, 0, w, h);

        for (let l = 1; l <= layers; l++) {
          const fi = l;
          const numFibers = 16;
          for (let f = 0; f < numFibers; f++) {
            const angleOffset = (f / numFibers) * Math.PI * 2 + time * 0.15 * (l % 2 === 0 ? 1 : -1);
            ctx.beginPath();

            const points = 45;
            for (let i = 0; i <= points; i++) {
              const r = (i / points) * Math.min(w, h) * 0.72;
              const twist = Math.sin(r * 0.008 - time * 0.8 + fi) * 0.35;
              const wave = Math.sin(r * 0.02 + time * 0.4 + fi) * 18;
              const theta = angleOffset + twist;

              const px = cx + Math.cos(theta) * (r + wave);
              const py = cy + Math.sin(theta) * (r + wave);

              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }

            const alpha = (0.28 / fi) * (1 - (f % 3) * 0.2);
            ctx.strokeStyle = f % 2 === 0 ? 'rgba(52, 55, 160, ' + alpha + ')' : 'rgba(99, 102, 241, ' + (alpha * 0.75) + ')';
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
        }

        requestAnimationFrame(draw);
      }

    })();

    // ── Live Stopwatch & Polling ──
    const start = Date.now();
    const timer = document.getElementById('elapsed-timer');
    const stepText = document.getElementById('step-text');
    const stepIcon = document.getElementById('step-icon');
    const progressFill = document.getElementById('progress-fill');
    const card = document.getElementById('main-card');

    const interval = setInterval(function() {
      const ms = Date.now() - start;
      if (timer) timer.textContent = (ms / 1000).toFixed(1) + 's';

      if (ms < 1600) {
        if (stepText) stepText.textContent = 'Awakening compute container...';
        if (stepIcon) stepIcon.textContent = '⚡';
        if (progressFill) progressFill.style.width = '25%';
      } else if (ms < 3600) {
        if (stepText) stepText.textContent = 'Rehydrating memory & image layers...';
        if (stepIcon) stepIcon.textContent = '📦';
        if (progressFill) progressFill.style.width = '55%';
      } else if (ms < 5800) {
        if (stepText) stepText.textContent = 'Binding private edge routing mesh...';
        if (stepIcon) stepIcon.textContent = '🌐';
        if (progressFill) progressFill.style.width = '80%';
      } else {
        if (stepText) stepText.textContent = 'Probing HTTP 200 health readiness...';
        if (stepIcon) stepIcon.textContent = '✨';
        if (progressFill) progressFill.style.width = '92%';
      }
    }, 100);

    function check() {
      fetch(window.location.href, { method: 'HEAD', cache: 'no-store' })
        .then(function(r) {
          if (r.status !== 502 && r.status !== 202 && r.status !== 503) {
            clearInterval(interval);
            if (progressFill) progressFill.style.width = '100%';
            if (card) card.classList.add('is-ready');
            if (stepText) stepText.textContent = 'Application online! Launching...';
            if (stepIcon) stepIcon.textContent = '✅';
            setTimeout(function() {
              window.location.reload(true);
            }, 350);
          } else {
            setTimeout(check, 800);
          }
        })
        .catch(function() {
          setTimeout(check, 800);
        });
    }

    setTimeout(check, 600);
  </script>
</body>
</html>`;
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
