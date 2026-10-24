import type { FastifyPluginAsync } from "fastify";
import { checkVmOnline } from "../lib/vm-status.js";
import { triggerVmWake } from "../lib/vm-wake.js";
import { getBaseDomain } from "../lib/domain.js";

export const liveGatewayRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Universal Live Gateway Handler ──────────────────────────────────────────
  const handleLiveRequest = async (request: any, reply: any) => {
    let slug = request.params?.slug || "";
    slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "");

    if (!slug) {
      return reply.code(400).send({ error: "INVALID_SLUG", message: "A valid deployment slug is required." });
    }

    const wildcard = request.params["*"] || "";
    const remainingPath = wildcard ? (wildcard.startsWith("/") ? wildcard : `/${wildcard}`) : "";
    const isFn = request.url.includes("/live/fn/");
    const baseDomain = getBaseDomain();
    const targetHost = `${slug}.${baseDomain}`;
    const targetProto = baseDomain.includes("whizan.cloud") ? "https" : "http";
    const targetUrl = `${targetProto}://${targetHost}${remainingPath}`;

    // 1. Check VM online state (autoWake triggers Azure VM start if deallocated)
    const vmStatus = await checkVmOnline({ autoWake: true, reason: `gateway_${slug}` });

    if (vmStatus.status !== "ONLINE") {
      // Azure VM is powered off ($0.00/hr state) or booting
      const isHtml = request.headers.accept?.includes("text/html");

      if (isHtml) {
        reply.code(202).type("text/html; charset=utf-8");
        return reply.send(renderGatewayBootScreen(slug, targetUrl, vmStatus.status));
      }

      // API / CLI / curl / client response
      return reply
        .code(202)
        .header("Retry-After", "5")
        .header("X-Whizan-Status", "ALLOCATING_RESOURCES")
        .type("application/json")
        .send({
          status: 202,
          state: "ALLOCATING_RESOURCES",
          message: "Compute node is booting up from eco-standby ($0.00/hr state). Resources are being allocated.",
          vm: vmStatus.status,
          slug,
          targetUrl,
          retryAfter: 5,
        });
    }

    // 2. VM is ONLINE: Fast transparent cutover
    const isBrowser = request.headers.accept?.includes("text/html");
    const forceProxy = Boolean(request.query?.proxy);

    if (isBrowser && !forceProxy) {
      // Instant 307 Temporary Redirect directly to Edge Router on Azure VM (< 1ms edge routing)
      return reply.redirect(307, targetUrl);
    }

    // 3. Reverse Proxy for API clients or explicit proxy requests
    try {
      const upstreamUrl = targetUrl + (request.url.includes("?") ? `?${request.url.split("?")[1]}` : "");
      const outgoingHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(request.headers)) {
        if (typeof v === "string" && !["host", "connection", "content-length"].includes(k.toLowerCase())) {
          outgoingHeaders[k] = v;
        }
      }
      // Critical Origin & Host Alignment: Downstream app containers verify Origin against Host / X-Forwarded-Host
      outgoingHeaders["host"] = targetHost;
      outgoingHeaders["x-forwarded-host"] = targetHost;
      outgoingHeaders["x-forwarded-proto"] = targetProto;
      outgoingHeaders["x-forwarded-port"] = targetProto === "https" ? "443" : "80";
      outgoingHeaders["x-whizan-gateway"] = "render-control-plane";
      outgoingHeaders["x-whizan-client-host"] = request.headers.host || "";

      const upstreamRes = await fetch(upstreamUrl, {
        method: request.method,
        headers: outgoingHeaders,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "manual",
      });

      reply.code(upstreamRes.status);
      upstreamRes.headers.forEach((val, key) => {
        reply.header(key, val);
      });

      const buffer = await upstreamRes.arrayBuffer();
      return reply.send(Buffer.from(buffer));
    } catch (proxyErr: any) {
      return reply.code(202).header("Retry-After", "3").type("application/json").send({
        status: 202,
        state: "ALLOCATING_RESOURCES",
        message: "VM is online; private edge routing and container ports are binding. Please retry in 3 seconds.",
        slug,
        retryAfter: 3,
      });
    }
  };

  // Route bindings
  fastify.all("/live/:slug", handleLiveRequest);
  fastify.all("/live/:slug/*", handleLiveRequest);
  fastify.all("/live/fn/:slug", handleLiveRequest);
  fastify.all("/live/fn/:slug/*", handleLiveRequest);
};

function renderGatewayBootScreen(slug: string, targetUrl: string, vmStatus: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Allocating Cloud Resources • ${slug} • Whizan</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #090714;
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
    .vignette {
      position: fixed;
      inset: 0;
      z-index: 2;
      pointer-events: none;
      background: radial-gradient(circle at 50% 50%, rgba(9, 7, 20, 0.25) 0%, rgba(9, 7, 20, 0.85) 75%, rgba(9, 7, 20, 0.98) 100%);
    }
    .card {
      position: relative;
      z-index: 10;
      width: 90%;
      max-width: 480px;
      background: rgba(14, 11, 30, 0.82);
      backdrop-filter: blur(36px) saturate(190%);
      -webkit-backdrop-filter: blur(36px) saturate(190%);
      border: 1px solid rgba(79, 70, 229, 0.35);
      border-radius: 24px;
      padding: 2.5rem 2.2rem 2.2rem;
      text-align: center;
      box-shadow:
        0 25px 70px -10px rgba(0, 0, 0, 0.85),
        0 0 50px rgba(79, 70, 229, 0.25),
        inset 0 1px 0 rgba(255, 255, 255, 0.12);
      transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .card.is-ready {
      border-color: rgba(99, 102, 241, 0.8);
      box-shadow: 0 30px 80px -10px rgba(0, 0, 0, 0.9), 0 0 80px rgba(99, 102, 241, 0.5);
      transform: scale(1.02);
    }
    .pill-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(79, 70, 229, 0.22);
      border: 1px solid rgba(99, 102, 241, 0.45);
      border-radius: 9999px;
      padding: 0.3rem 0.85rem;
      margin-bottom: 1.25rem;
    }
    .pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #818cf8;
      box-shadow: 0 0 10px #818cf8;
      animation: dotPulse 1.6s ease-in-out infinite alternate;
    }
    @keyframes dotPulse {
      0% { transform: scale(0.85); opacity: 0.5; }
      100% { transform: scale(1.25); opacity: 1; }
    }
    .pill-text {
      font-size: 0.74rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #a5b4fc;
    }
    h1 {
      font-size: 1.6rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      margin-bottom: 0.6rem;
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
      padding: 0 0.5rem;
    }
    .domain-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(79, 70, 229, 0.35);
      border-radius: 8px;
      padding: 0.4rem 0.85rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
      color: #e2e8f0;
      margin-bottom: 1.5rem;
      word-break: break-all;
    }
    .progress-bar {
      height: 4px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 9999px;
      overflow: hidden;
      margin-bottom: 1.2rem;
    }
    .progress-fill {
      height: 100%;
      width: 15%;
      border-radius: 9999px;
      background: linear-gradient(90deg, #4f46e5, #6366f1, #38bdf8);
      box-shadow: 0 0 14px rgba(99, 102, 241, 0.9);
      transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .stage-step {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(10, 7, 24, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 0.75rem 1rem;
      font-size: 0.82rem;
      color: #e2e8f0;
    }
    .step-left {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      text-align: left;
    }
    .timer-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.76rem;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.06);
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <canvas id="fibers-canvas"></canvas>
  <div class="vignette"></div>

  <main class="card" id="main-card">
    <div class="pill-badge">
      <span class="pulse-dot"></span>
      <span class="pill-text">Allocating Cloud Resources</span>
    </div>

    <h1>Awakening Compute Node</h1>
    <p class="subtitle">
      This service was resting in eco-standby to save compute resources. Warming up memory, vCPU quota, and edge routing now.
    </p>

    <div class="domain-chip">
      <span style="color: #818cf8;">⚡</span>
      <span>${slug}.${getBaseDomain()}</span>
    </div>

    <div class="progress-bar">
      <div class="progress-fill" id="progress-fill"></div>
    </div>

    <div class="stage-step">
      <div class="step-left">
        <span id="step-icon">⚡</span>
        <span id="step-text" style="font-weight: 500;">Powering on Azure compute node...</span>
      </div>
      <div class="timer-badge" id="elapsed-timer">0.0s</div>
    </div>
  </main>

  <script>
    // ── Ghost Fibers Visual Simulation ──
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
      function draw() {
        time += 0.012;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#090714';
        ctx.fillRect(0, 0, w, h);
        const cx = w * 0.5, cy = h * 0.5;
        const radial = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) * 0.65);
        radial.addColorStop(0, 'rgba(79, 70, 229, 0.28)');
        radial.addColorStop(0.5, 'rgba(20, 14, 53, 0.35)');
        radial.addColorStop(1, 'rgba(9, 7, 20, 0.9)');
        ctx.fillStyle = radial;
        ctx.fillRect(0, 0, w, h);
        for (let l = 1; l <= 4; l++) {
          for (let f = 0; f < 16; f++) {
            const angleOffset = (f / 16) * Math.PI * 2 + time * 0.15 * (l % 2 === 0 ? 1 : -1);
            ctx.beginPath();
            for (let i = 0; i <= 45; i++) {
              const r = (i / 45) * Math.min(w, h) * 0.72;
              const twist = Math.sin(r * 0.008 - time * 0.8 + l) * 0.35;
              const wave = Math.sin(r * 0.02 + time * 0.4 + l) * 18;
              const theta = angleOffset + twist;
              const px = cx + Math.cos(theta) * (r + wave);
              const py = cy + Math.sin(theta) * (r + wave);
              if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            const alpha = (0.28 / l) * (1 - (f % 3) * 0.2);
            ctx.strokeStyle = f % 2 === 0 ? 'rgba(79, 70, 229, ' + alpha + ')' : 'rgba(99, 102, 241, ' + (alpha * 0.75) + ')';
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
        }
        requestAnimationFrame(draw);
      }
      requestAnimationFrame(draw);
    })();

    // ── Live Stopwatch & VM Poll ──
    const start = Date.now();
    const timer = document.getElementById('elapsed-timer');
    const stepText = document.getElementById('step-text');
    const stepIcon = document.getElementById('step-icon');
    const progressFill = document.getElementById('progress-fill');
    const card = document.getElementById('main-card');
    const targetUrl = "${targetUrl}";

    const interval = setInterval(function() {
      const ms = Date.now() - start;
      if (timer) timer.textContent = (ms / 1000).toFixed(1) + 's';

      if (ms < 6000) {
        if (stepText) stepText.textContent = 'Awakening Azure VM compute node...';
        if (stepIcon) stepIcon.textContent = '⚡';
        if (progressFill) progressFill.style.width = '25%';
      } else if (ms < 14000) {
        if (stepText) stepText.textContent = 'Allocating memory & vCPU quota...';
        if (stepIcon) stepIcon.textContent = '📦';
        if (progressFill) progressFill.style.width = '55%';
      } else if (ms < 22000) {
        if (stepText) stepText.textContent = 'Rehydrating private edge routing mesh...';
        if (stepIcon) stepIcon.textContent = '🌐';
        if (progressFill) progressFill.style.width = '80%';
      } else {
        if (stepText) stepText.textContent = 'Probing HTTP 200 health readiness...';
        if (stepIcon) stepIcon.textContent = '✨';
        if (progressFill) progressFill.style.width = '92%';
      }
    }, 100);

    function checkReady() {
      fetch('/api/system/status', { method: 'GET', cache: 'no-store' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data && data.status === 'ONLINE') {
            // VM is online! Now probe target deployment URL
            fetch(targetUrl, { method: 'HEAD', cache: 'no-store', mode: 'no-cors' })
              .then(function() {
                clearInterval(interval);
                if (progressFill) progressFill.style.width = '100%';
                if (card) card.classList.add('is-ready');
                if (stepText) stepText.textContent = 'Compute online! Launching application...';
                if (stepIcon) stepIcon.textContent = '✅';
                setTimeout(function() {
                  window.location.href = targetUrl;
                }, 400);
              })
              .catch(function() {
                setTimeout(checkReady, 1200);
              });
          } else {
            setTimeout(checkReady, 1500);
          }
        })
        .catch(function() {
          setTimeout(checkReady, 1500);
        });
    }

    setTimeout(checkReady, 1500);
  </script>
</body>
</html>`;
}
