import "dotenv/config";
import http from "http";
import httpProxy from "http-proxy";
import serveStatic from "serve-static";
import finalhandler from "finalhandler";
import Redis from "ioredis";
import path from "path";
import fs from "fs";

// ─── Config ──────────────────────────────────────────────────────────────────

const ROUTER_PORT = Number(process.env.ROUTER_PORT) || 8080;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const BASE_DOMAIN = process.env.BASE_DOMAIN || "20.2.136.11.nip.io";

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

async function lookupDeployment(slug: string): Promise<DeploymentInfo | null> {
  const raw = await redis.get(`deployment:${slug}`);
  if (!raw) return null;
  return JSON.parse(raw);
}

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

  // Look up deployment ID from Redis and trigger a wakeup
  redis.get(`deployment:${slug}`).then(async raw => {
    if (raw) {
      const dep = JSON.parse(raw);
      console.log(`[Router] Container missing for ${slug} (proxy error). Triggering wakeup...`);
      const acquiredLock = await redis.set(`wakeup:inflight:${slug}`, "1", "EX", 20, "NX").catch(() => null);
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

  // ── Lookup deployment from Redis ──────────────────────────────────────────
  const deployment = await lookupDeployment(slug).catch(() => null);

  if (!deployment) {
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

  // Track access time for scale-to-zero idle detection
  redis.set(`access:${deployment.deploymentId}`, Date.now()).catch(() => {});

  const { type, staticDir, containerPort } = deployment;
  const requestPath = req.url || "/";

  // ── STATIC: Serve files directly from disk ─────────────────────────────────
  if (type === "static" && staticDir) {
    const serve = getStaticServer(staticDir);
    const startBytes = res.socket?.bytesWritten || 0;
    serve(req as any, res as any, finalhandler(req, res) as any);
    res.on("finish", () => {
      const bytesSent = (res.socket?.bytesWritten || 0) - startBytes;
      const event = {
        projectId: (deployment as any).projectId,
        date: new Date().toISOString().split("T")[0],
        path: req.url || "/",
        bytesSent,
        ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "0.0.0.0",
      };
      redis.lpush("analytics:buffer", JSON.stringify(event)).catch(() => {});
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
    redis.get(`deployment:${slug}`).then(raw => {
      if (raw) {
        const dep = JSON.parse(raw);
        const event = {
          projectId: dep.projectId,
          date: new Date().toISOString().split("T")[0],
          path: req.url || "/",
          bytesSent,
          ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "0.0.0.0",
        };
        redis.lpush("analytics:buffer", JSON.stringify(event)).catch(() => {});
      }
    }).catch(() => {});
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
