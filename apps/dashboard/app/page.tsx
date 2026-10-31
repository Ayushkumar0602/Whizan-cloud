"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { useAuth } from "@/lib/auth";
import { ALL_TECH_STACK } from "@/components/landing/tech-logos";
import {
  ArrowRight,
  ArrowUpRight,
  Globe,
  Server,
  Database,
  Terminal,
  ShieldCheck,
  Zap,
  Activity,
  KeyRound,
  RotateCcw,
  HardDrive,
  Clock,
  Workflow,
  Plus,
  Rocket,
  Moon,
  Copy,
  Check,
  Cpu,
  Layers,
  Sparkles
} from "lucide-react";

/* ─── Static content ─────────────────────────────────────────────── */

const DEPLOY_STEPS = ["Clone", "Install", "Build", "Health check", "Live"];

const DEPLOY_LOG = [
  { step: 0, text: "Cloning acme/api-gateway at main" },
  { step: 0, text: "Checked out 4f8e2c1" },
  { step: 1, text: "npm ci · 412 packages installed" },
  { step: 2, text: "npm run build" },
  { step: 2, text: "Container image synthesized · 148 MB" },
  { step: 3, text: "Deep health check: GET /health → 200 OK" },
  { step: 4, text: "Traffic seamlessly shifted to live version" },
];

// Ticks to hold the finished state before the loop restarts
const DEPLOY_HOLD = 6;

const PRODUCTS = [
  {
    id: "hosting",
    icon: Globe,
    badge: "EDGE CDN · SPA & SSR",
    name: "Frontend Hosting",
    tagline: "Next.js, React, Vite, Astro, Static HTML",
    description: "Deploy directly from Git. Every commit automatically builds and goes live on a global Edge CDN with automated SSL.",
    href: "/dashboard/hosting",
  },
  {
    id: "backend",
    icon: Server,
    badge: "CONTAINERS · ZERO-DOCKER",
    name: "Backend Services",
    tagline: "Node.js, Python, Go, Rust, Java, Docker",
    description: "APIs and queue workers running in isolated production containers. Zero-downtime cutover after readiness probes.",
    href: "/dashboard/backend",
  },
  {
    id: "functions",
    icon: Zap,
    badge: "SUB-5MS · V8 RUNTIME",
    name: "Edge Functions",
    tagline: "TypeScript and JavaScript",
    description: "Serverless handlers for API routes, webhooks, and microservices with granular public and API-key protected endpoints.",
    href: "/dashboard/functions",
  },
  {
    id: "databases",
    icon: Database,
    badge: "MANAGED · ACID COMPLIANT",
    name: "Databases",
    tagline: "PostgreSQL and Redis",
    description: "Dedicated instances with automated connection pooling, visual table explorer, and interactive SQL terminal.",
    href: "/dashboard/databases",
  },
  {
    id: "storage",
    icon: HardDrive,
    badge: "S3-COMPATIBLE · MULTI-BUCKET",
    name: "Cloud Storage",
    tagline: "High-throughput object storage",
    description: "S3-compatible buckets for media, file uploads, and assets with granular key scoping and CDN asset caching.",
    href: "/dashboard/storage",
  },
  {
    id: "cron",
    icon: Clock,
    badge: "SERVERLESS · CRON ENGINE",
    name: "Cron Jobs",
    tagline: "Automated task schedules",
    description: "Execute scheduled background jobs against your services and edge endpoints without running costly 24/7 idle servers.",
    href: "/dashboard/cron",
  },
  {
    id: "flow",
    icon: Workflow,
    badge: "PIPELINES · AUTONOMOUS CI/CD",
    name: "Whizan Flow",
    tagline: "Multi-stage deployment pipelines",
    description: "Build, test, canary-deploy, and rollback pipelines that self-heal and orchestrate multi-tier deployments cleanly.",
    href: "/dashboard/flows",
  },
  {
    id: "devtools",
    icon: Terminal,
    badge: "AI-READY · AGENT DEVOPS",
    name: "CLI and MCP",
    tagline: "Terminal CLI and IDE Agent Integration",
    description: "Manage infrastructure directly via terminal or connect Cursor, Windsurf, and Claude via @whizan/mcp-devops.",
    href: "/dashboard/cli",
  },
];

const HOW_STEPS = [
  { title: "Connect", body: "Select a GitHub repository and branch, or run whizan deploy directly from your local terminal." },
  { title: "Configure", body: "Set environment variables, target internal ports, and choose instance sizing in one simple pane." },
  { title: "Build", body: "Every push compiles in an isolated sandbox. Real-time build logs stream live as assets build." },
  { title: "Go live", body: "Traffic transitions seamlessly to the new version only after its deep health check returns 200 OK." },
];

const FACTS = [
  { icon: ShieldCheck, title: "Universal Wildcard SSL", body: "Zero-maintenance HTTPS certificates provisioned and rotated automatically for every domain." },
  { icon: Activity, title: "Real-time Telemetry", body: "Live streaming build logs, container stdout/stderr, CPU, and memory utilization analytics." },
  { icon: KeyRound, title: "Encrypted Vault Secrets", body: "Production environment variables stored securely with AES-256 military-grade encryption." },
  { icon: RotateCcw, title: "Zero-Downtime Blue/Green", body: "Previous releases continue serving live traffic uninterrupted until new containers report healthy." },
];

const AGENT_CALLS = [
  { tool: "whizan_analyze_workspace", result: "Next.js 15 · port 3000 · V8 verified" },
  { tool: "whizan_set_env_vars", result: "2 production secrets vaulted" },
  { tool: "whizan_create_project", result: "production project provisioned" },
  { tool: "whizan_deploy_direct", result: "build job enqueued" },
  { tool: "whizan_get_build_logs", result: "READY (18.4s build time)" },
  { tool: "whizan_check_health", result: "200 OK · Edge route live" },
];

const CLI_SNIPPET = `npm install -g @whizan/cli

whizan login
whizan deploy
whizan logs --tail`;

const MCP_CONFIG = `{
  "mcpServers": {
    "whizan": {
      "command": "npx",
      "args": ["-y", "@whizan/mcp-devops"],
      "env": {
        "WHIZAN_API_URL": "https://api.whizan.cloud",
        "WHIZAN_API_KEY": "whz_live_your_secret_key"
      }
    }
  }
}`;

/* ─── Realistic Atmospheric Clouds (Pure GPU 120 FPS Volumetric SVG) ── */

type Lobe = [number, number, number, number];

const CLOUD_SHAPES: Record<"a" | "b" | "c" | "wisp" | "bank", { w: number; h: number; lobes: Lobe[] }> = {
  a: {
    w: 640, h: 340,
    lobes: [
      [320, 236, 250, 62], [200, 196, 120, 84], [330, 150, 150, 118], [460, 196, 118, 82],
      [140, 228, 90, 50], [520, 230, 90, 46], [262, 120, 80, 70], [400, 128, 86, 72],
    ],
  },
  b: {
    w: 640, h: 340,
    lobes: [
      [320, 240, 260, 58], [250, 160, 150, 112], [400, 180, 126, 90], [160, 206, 100, 66],
      [500, 218, 92, 54], [320, 112, 92, 76], [200, 128, 70, 58],
    ],
  },
  c: {
    w: 520, h: 240,
    lobes: [
      [260, 168, 210, 46], [220, 128, 104, 64], [320, 136, 96, 58], [150, 158, 70, 36], [380, 160, 74, 34]
    ],
  },
  wisp: {
    w: 560, h: 200,
    lobes: [
      [280, 120, 240, 42], [200, 95, 110, 55], [340, 90, 120, 58], [120, 115, 75, 34], [440, 115, 80, 36]
    ],
  },
  bank: {
    w: 1600, h: 380,
    lobes: [
      [800, 330, 860, 80],
      [90, 250, 160, 110], [270, 220, 180, 130], [470, 240, 170, 115], [660, 200, 190, 140],
      [860, 230, 180, 125], [1060, 205, 190, 138], [1250, 235, 175, 118], [1450, 225, 180, 125],
      [180, 300, 220, 80], [560, 300, 240, 85], [960, 300, 240, 85], [1360, 300, 230, 80],
    ],
  },
};

function PaintedCloud({ shape }: { shape: keyof typeof CLOUD_SHAPES; seed?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { w, h, lobes } = CLOUD_SHAPES[shape];
  const id = (name: string) => `${name}-${uid}`;
  const k = w / 640;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="cloud-svg" aria-hidden>
      <defs>
        {/* Sunlit top highlight - direct sunlight crest */}
        <radialGradient id={id("highlight")} cx="50%" cy="20%" r="55%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        {/* Volumetric body scatter */}
        <radialGradient id={id("body")} cx="50%" cy="36%" r="58%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.99" />
          <stop offset="42%" stopColor="#ffffff" stopOpacity="0.94" />
          <stop offset="76%" stopColor="#f0f6fe" stopOpacity="0.68" />
          <stop offset="100%" stopColor="#e0ecfc" stopOpacity="0" />
        </radialGradient>
        {/* Natural atmospheric Rayleigh underbelly shadow */}
        <radialGradient id={id("shade")} cx="50%" cy="72%" r="52%">
          <stop offset="0%" stopColor="#809ecb" stopOpacity="0.42" />
          <stop offset="58%" stopColor="#a8c1e4" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#c5d7ee" stopOpacity="0" />
        </radialGradient>
        {/* Smooth GPU-friendly Gaussian blur filter */}
        <filter id={id("soft")} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={5.5 * k} />
        </filter>
      </defs>

      <g filter={`url(#${id("soft")})`}>
        {/* Base shadow layer */}
        {lobes.map(([cx, cy, rx, ry], i) => (
          <ellipse
            key={`s-${i}`}
            cx={cx}
            cy={cy + 0.32 * ry}
            rx={rx * 0.96}
            ry={ry * 0.84}
            fill={`url(#${id("shade")})`}
            opacity="0.85"
          />
        ))}
        {/* Main cloud body */}
        {lobes.map(([cx, cy, rx, ry], i) => (
          <ellipse
            key={`b-${i}`}
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fill={`url(#${id("body")})`}
          />
        ))}
        {/* Sunlit top rim highlights */}
        {lobes.slice(0, Math.ceil(lobes.length * 0.75)).map(([cx, cy, rx, ry], i) => (
          <ellipse
            key={`h-${i}`}
            cx={cx}
            cy={cy - 0.16 * ry}
            rx={rx * 0.78}
            ry={ry * 0.58}
            fill={`url(#${id("highlight")})`}
            opacity="0.9"
          />
        ))}
      </g>
    </svg>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────── */

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useScrollReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      els.forEach(el => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function highlightJson(src: string): ReactNode[] {
  return src.split("\n").map((line, i) => {
    const parts: ReactNode[] = [];
    let last = 0;
    const re = /"[^"]*"(\s*:)?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      const isKey = !!m[1];
      const str = isKey ? m[0].slice(0, m[0].length - m[1].length) : m[0];
      parts.push(<span key={m.index} className={isKey ? "tok-key" : "tok-str"}>{str}</span>);
      if (isKey) parts.push(m[1]);
      last = m.index + m[0].length;
    }
    parts.push(line.slice(last));
    return <div key={i}>{parts}</div>;
  });
}

function highlightShell(src: string): ReactNode[] {
  return src.split("\n").map((line, i) => {
    if (!line.trim()) return <div key={i}>&nbsp;</div>;
    const [cmd, ...rest] = line.split(" ");
    return (
      <div key={i}>
        <span className="tok-prompt">$ </span>
        <span className="tok-key">{cmd}</span> {rest.join(" ")}
      </div>
    );
  });
}

const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties;

/* ─── Hero card arc (Enterprise Ceramic Finish & 3D Layering) ──── */

const ARC_CARDS: { key: string; tone?: "dark" | "glass"; body: ReactNode }[] = [
  {
    key: "cron",
    body: (
      <>
        <div className="mini-label"><Clock size={12} className="mini-label-icon text-amber-500" /> Scheduled Cron</div>
        <div className="mini-mono mini-big">0 3 * * *</div>
        <div className="mini-text">Nightly database backup</div>
        <div className="mini-chip mini-chip-ok"><span className="mini-pulse-dot" /> Next run 03:00</div>
      </>
    ),
  },
  {
    key: "deploys",
    body: (
      <>
        <div className="mini-label"><Rocket size={12} className="mini-label-icon text-blue-500" /> Deployments</div>
        {[
          ["web", "Ready", "ok"],
          ["api", "Ready", "ok"],
          ["worker", "Building", "busy"],
          ["docs", "Ready", "ok"],
        ].map(([name, state, tone]) => (
          <div key={name} className="mini-row">
            <span className="mini-mono">{name}</span>
            <span className={`mini-chip mini-chip-${tone}`}>
              {tone === "ok" && <span className="mini-pulse-dot" />}
              {state}
            </span>
          </div>
        ))}
      </>
    ),
  },
  {
    key: "metrics",
    body: (
      <>
        <div className="mini-label"><Activity size={12} className="mini-label-icon text-emerald-500" /> CPU · api-gateway</div>
        <div className="mini-big">12.4%</div>
        <svg viewBox="0 0 140 56" className="mini-chart" aria-hidden>
          <defs>
            <linearGradient id="arc-chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 44 L14 40 L28 42 L42 30 L56 34 L70 22 L84 26 L98 14 L112 20 L126 10 L140 16 L140 56 L0 56 Z" fill="url(#arc-chart-fill)" />
          <path d="M0 44 L14 40 L28 42 L42 30 L56 34 L70 22 L84 26 L98 14 L112 20 L126 10 L140 16" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="126" cy="10" r="3.5" fill="#2563eb" stroke="#ffffff" strokeWidth="1.5" />
        </svg>
      </>
    ),
  },
  {
    key: "logs",
    body: (
      <>
        <div className="mini-label"><Terminal size={12} className="mini-label-icon text-indigo-500" /> Live Stream</div>
        <div className="mini-log mini-mono">
          <div><span>12:04:18</span> <span className="mini-log-code">GET</span> /users 200</div>
          <div><span>12:04:22</span> <span className="mini-log-code">GET</span> /plans 200</div>
          <div><span>12:05:01</span> <span className="mini-log-code post">POST</span> /orders 201</div>
          <div><span>12:05:09</span> <span className="mini-log-code">GET</span> /health 200</div>
        </div>
      </>
    ),
  },
  {
    key: "console",
    tone: "dark",
    body: (
      <>
        <div className="mini-dark-badge">
          <span className="mini-dark-pip" />
          <span>UNIFIED CONTROL PLANE</span>
        </div>
        <div className="mini-dark-title">
          Frontends, APIs <span className="mini-dot" /> &amp; databases
          <span className="mini-dim"> in one console.</span>
        </div>
      </>
    ),
  },
  {
    key: "new",
    tone: "glass",
    body: (
      <>
        <span className="mini-plus"><Plus size={18} /></span>
        <div className="mini-glass-title">Instant Deploy</div>
        <div className="mini-glass-sub">GitHub · Gitlab · CLI · MCP</div>
      </>
    ),
  },
  {
    key: "db",
    body: (
      <>
        <div className="mini-label"><Database size={12} className="mini-label-icon text-cyan-600" /> Postgres · users</div>
        <div className="mini-table mini-mono">
          {[["1", "ana@company.com"], ["2", "raj@enterprise.io"], ["3", "li@startup.dev"], ["4", "sam@whizan.cloud"]].map(([id, email]) => (
            <div key={id} className="mini-row"><span>{id}</span><span>{email}</span></div>
          ))}
        </div>
      </>
    ),
  },
  {
    key: "storage",
    body: (
      <>
        <div className="mini-label"><HardDrive size={12} className="mini-label-icon text-violet-500" /> S3 Storage</div>
        <div className="mini-mono mini-text">production-assets</div>
        <div className="mini-big">1.48 GB</div>
        <div className="mini-bar"><span style={{ width: "44%" }} /></div>
      </>
    ),
  },
  {
    key: "mcp",
    body: (
      <>
        <div className="mini-label"><Terminal size={12} className="mini-label-icon text-emerald-600" /> DevOps MCP</div>
        <div className="mini-mono mini-text">whizan_check_health</div>
        <div className="mini-chip mini-chip-ok"><span className="mini-pulse-dot" /> 200 OK · Healthy</div>
      </>
    ),
  },
];

function CardArc() {
  const mid = (ARC_CARDS.length - 1) / 2;
  return (
    <div className="arc" aria-hidden>
      <div className="arc-tilt">
        <div className="arc-sway">
          {ARC_CARDS.map((card, i) => (
            <div
              key={card.key}
              className={`arc-card ${card.tone ? `arc-card-${card.tone}` : ""}`}
              style={cssVars({ "--a": `${(mid - i) * 9.5}deg`, "--i": i })}
            >
              {card.body}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Deploy animation (macOS Glass Window & Live Stream) ────────── */

function DeployPreview() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setTick(DEPLOY_LOG.length);
      return;
    }
    const id = setInterval(() => {
      setTick(t => (t >= DEPLOY_LOG.length + DEPLOY_HOLD ? 0 : t + 1));
    }, 750);
    return () => clearInterval(id);
  }, []);

  const shown = Math.min(tick, DEPLOY_LOG.length);
  const finished = tick >= DEPLOY_LOG.length;
  const current = shown === 0 ? -1 : DEPLOY_LOG[shown - 1].step;
  const status = tick === 0 ? "queued" : finished ? "ready" : "building";
  const statusLabel = { queued: "Queued", building: "Building", ready: "Ready · 200 OK" }[status];
  const elapsed = `0:${String(shown * 6).padStart(2, "0")}`;

  return (
    <div className="deploy" aria-label="Example deployment">
      <div className="deploy-head">
        <div className="deploy-traffic-lights" aria-hidden>
          <span className="dot dot-red" />
          <span className="dot dot-yellow" />
          <span className="dot dot-green" />
        </div>
        <div className="deploy-title">
          <span className="deploy-icon"><Server size={14} /></span>
          <span className="deploy-name">api-gateway</span>
          <span className="deploy-ref mono">main · 4f8e2c1</span>
        </div>
        <div className="deploy-meta">
          <span className="deploy-time mono">{elapsed}</span>
          <span className={`deploy-pill pill-${status}`}>
            <span className="pill-dot" />
            {statusLabel}
          </span>
        </div>
      </div>

      <ol className="deploy-steps">
        {DEPLOY_STEPS.map((label, i) => {
          const state = finished || i < current ? "done" : i === current ? "active" : "pending";
          return (
            <li key={label} className={`deploy-step step-${state}`}>
              <span className="step-label">{label}</span>
              <span className="step-bar"><span /></span>
            </li>
          );
        })}
      </ol>

      <div className="deploy-log mono">
        {DEPLOY_LOG.slice(0, shown).map((line, i) => (
          <div key={i} className={`log-row ${i === DEPLOY_LOG.length - 1 ? "log-final" : ""}`}>
            <span className="log-ts">00:{String(i * 6).padStart(2, "0")}</span>
            <span>{line.text}</span>
          </div>
        ))}
        {!finished && <span className="log-caret" />}
      </div>
    </div>
  );
}

/* ─── Main Landing Page ─────────────────────────────────────────── */

export default function LandingPage() {
  const { user, loading } = useAuth();
  const ctaHref = !loading && user ? "/dashboard" : "/register";
  const ctaLabel = !loading && user ? "Open Console" : "Start for Free";
  const [devTab, setDevTab] = useState<"cli" | "mcp">("cli");
  const [copied, setCopied] = useState(false);
  const heroRef = useRef<HTMLElement>(null);

  useScrollReveal();

  const copySnippet = () => {
    navigator.clipboard.writeText(devTab === "cli" ? CLI_SNIPPET : MCP_CONFIG);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="lp">
      {/* ── Top Sticky Header (Authentic Brandmark in Rightful Place) ── */}
      <header className="lp-nav-wrap">
        <div className="lp-nav">
          <BrandMark compact className="lp-brand-logo" />

          <nav className="lp-nav-links mono">
            <a href="#why">Why Whizan</a>
            <a href="#products">Products</a>
            <a href="#how">How it works</a>
            <a href="#developers">Developers</a>
            <a href="#plans">Plans</a>
            <Link href="/docs">Docs</Link>
          </nav>

          <div className="lp-nav-cta">
            {user ? (
              <Link href="/dashboard" className="btn btn-sun btn-sm mono">
                Console <ArrowRight size={14} />
              </Link>
            ) : (
              <>
                <Link href="/login" className="lp-nav-signin mono">Sign in</Link>
                <Link href="/register" className="btn btn-sun btn-sm mono">
                  Get started <ArrowRight size={14} />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero Shell (Saubhagya's Sky Panel & 3D Card Arc) ── */}
      <div className="hero-shell">
        <section className="hero" ref={heroRef}>
          <div className="sky" aria-hidden />

          {/* Authentic Multi-Layered Atmospheric Wind-Drift Clouds (GPU-accelerated, 120 FPS) */}
          <div className="hero-cloud hc-1" aria-hidden>
            <div className="cloud-drift-h1"><PaintedCloud shape="c" seed={11} /></div>
          </div>
          <div className="hero-cloud hc-2" aria-hidden>
            <div className="cloud-drift-h2"><PaintedCloud shape="c" seed={17} /></div>
          </div>
          <div className="hero-cloud hc-wisp" aria-hidden>
            <div className="cloud-drift-wisp"><PaintedCloud shape="wisp" seed={29} /></div>
          </div>
          <div className="hero-cloud hc-3" aria-hidden>
            <div className="cloud-billow-left"><PaintedCloud shape="a" seed={3} /></div>
          </div>
          <div className="hero-cloud hc-4" aria-hidden>
            <div className="cloud-billow-right"><PaintedCloud shape="b" seed={8} /></div>
          </div>

          <div className="hero-copy">
            {/* Enterprise Kicker Badge */}
            <div className="hero-kicker hero-fade" style={cssVars({ "--d": "40ms" })}>
              <span className="hero-kicker-dot" />
              <span className="hero-kicker-badge">Whizan Cloud 2.0</span>
              <span className="hero-kicker-sep">·</span>
              <span className="hero-kicker-desc">Universal Multi-Runtime Infrastructure</span>
              <ArrowRight size={13} className="hero-kicker-arrow" />
            </div>

            <h1 className="hero-title">
              <span className="hero-line hero-fade" style={cssVars({ "--d": "100ms" })}>Your whole stack,</span>
              <span className="hero-line hero-line-soft hero-fade" style={cssVars({ "--d": "220ms" })}>deployed from one console</span>
            </h1>

            <p className="hero-sub hero-fade" style={cssVars({ "--d": "340ms" })}>
              Host frontends, APIs, functions, databases and storage in one place.
              Every release goes live only after it passes a health check.
            </p>

            <div className="hero-ctas hero-fade" style={cssVars({ "--d": "460ms" })}>
              <a href="#how" className="btn btn-glass mono">How it works</a>
              <Link href={ctaHref} className="btn btn-sun btn-arrow mono" id="hero-cta-btn">
                {ctaLabel}
                <span className="btn-arrow-dot"><ArrowUpRight size={15} /></span>
              </Link>
            </div>
          </div>

          <div className="hero-arc hero-fade" style={cssVars({ "--d": "600ms" })}>
            <CardArc />
          </div>

          <div className="hero-foot mono hero-fade" style={cssVars({ "--d": "800ms" })}>
            <div className="hero-foot-pill">
              <span className="hero-foot-item">8 Cloud Products</span>
              <span className="hero-foot-bullet">•</span>
              <span className="hero-foot-item">1 Unified Console</span>
              <span className="hero-foot-bullet">•</span>
              <span className="hero-foot-item">Sub-5ms Edge Routing</span>
              <span className="hero-foot-bullet">•</span>
              <span className="hero-foot-item">Zero-Docker Synthesis</span>
              <span className="hero-foot-bullet">•</span>
              <span className="hero-foot-item highlight">Free Hobby Plan</span>
            </div>
          </div>

          <div className="bank bank-back" aria-hidden>
            <div className="cloud-bank-back"><PaintedCloud shape="bank" seed={21} /></div>
          </div>
          <div className="bank bank-front" aria-hidden>
            <div className="cloud-bank-front"><PaintedCloud shape="bank" seed={5} /></div>
          </div>
        </section>
      </div>

      {/* ── Stack marquee (All Official Language & Framework Logos) ── */}
      <section className="stack" aria-label="Supported languages and frameworks">
        <div className="stack-badge mono">RUNS ANY STACK · ZERO-DOCKER ARCHITECTURE</div>
        <div className="marquee">
          <div className="marquee-track">
            {[0, 1, 2].map(copy => (
              <div key={copy} className="marquee-group" aria-hidden={copy > 0}>
                {ALL_TECH_STACK.map(tech => {
                  const TechIcon = tech.Icon;
                  return (
                    <span key={tech.id} className="stack-item">
                      <span className="stack-tech-icon"><TechIcon /></span>
                      <span className="stack-tech-name">{tech.name}</span>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Whizan Bento Grid ── */}
      <section id="why" className="section">
        <div className="why-head" data-reveal>
          <div className="eyebrow mono">• Why Whizan</div>
          <h2 className="why-title">
            One cloud platform built to make shipping{" "}
            <span className="nowrap"><span className="inline-badge badge-blue"><Zap size={20} /></span> faster</span>
            <span className="why-soft">
              {" "}and{" "}
              <span className="nowrap"><span className="inline-badge badge-sun"><Moon size={20} /></span> calmer</span>
            </span>
          </h2>
        </div>

        <div className="bento">
          <div className="bento-sky" data-reveal>
            <div className="bento-sky-cloud" aria-hidden><PaintedCloud shape="b" seed={4} /></div>
            <div className="bento-sky-tag mono">
              <span className="bento-sky-pill">ALL-IN-ONE CLOUD</span>
            </div>
            <div className="bento-sky-card">
              <div className="bento-num">8</div>
              <p className="bento-text">Products in one console: hosting, backends, functions, databases, storage, cron, pipelines and MCP.</p>
            </div>
          </div>

          <div className="bento-grey" data-reveal style={cssVars({ "--d": "100ms" })}>
            <div className="bento-label">Every release is checked</div>
            <div className="bento-num">
              <span className="bento-ok-dot" /> 200 OK
            </div>
            <div className="bento-grey-foot">
              <div className="runtime-stack">
                {["N", "Py", "Go", "Rs", "J"].map(r => <span key={r} className="runtime-dot mono">{r}</span>)}
              </div>
              <p className="bento-quote">
                New versions take traffic only after their health check passes. Until then, the previous version keeps serving.
              </p>
            </div>
          </div>

          <div className="bento-col">
            <div className="bento-sun" data-reveal style={cssVars({ "--d": "200ms" })}>
              <div className="bento-label">Dockerfiles needed</div>
              <div className="bento-num">0</div>
              <p className="bento-text">Whizan builds Node.js, Python, Go, Rust, Java, PHP, Ruby and .NET apps without one, or uses yours.</p>
            </div>
            <div className="bento-dark" data-reveal style={cssVars({ "--d": "300ms" })}>
              <span className="bento-label">Hobby plan</span>
              <span className="bento-num">Free</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Products Section ── */}
      <section id="products" className="section">
        <div className="section-head" data-reveal>
          <div className="eyebrow mono">• Products</div>
          <h2 className="section-title">Everything your app runs on.</h2>
        </div>

        <div className="products">
          {PRODUCTS.map((p, i) => {
            const Icon = p.icon;
            return (
              <Link
                key={p.id}
                href={user ? p.href : "/register"}
                className="product"
                data-reveal
                style={cssVars({ "--d": `${(i % 4) * 80}ms` })}
              >
                <div className="product-top">
                  <span className="product-icon"><Icon size={18} /></span>
                  <span className="product-tag-pill mono">{p.badge}</span>
                  <span className="product-go"><ArrowUpRight size={15} /></span>
                </div>
                <div className="product-name">{p.name}</div>
                <div className="product-tagline">{p.tagline}</div>
                <p className="product-desc">{p.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="section">
        <div className="section-head" data-reveal>
          <div className="eyebrow mono">• How it works</div>
          <h2 className="section-title">From repository to live URL.</h2>
        </div>

        <div className="how">
          <ol className="how-steps">
            {HOW_STEPS.map((s, i) => (
              <li key={s.title} className="how-step" data-reveal style={cssVars({ "--d": `${i * 90}ms` })}>
                <span className="how-num mono">0{i + 1}</span>
                <div>
                  <div className="how-title">{s.title}</div>
                  <p className="how-body">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="how-visual" data-reveal style={cssVars({ "--d": "150ms" })}>
            <DeployPreview />
          </div>
        </div>

        <div className="facts">
          {FACTS.map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="fact" data-reveal style={cssVars({ "--d": `${i * 80}ms` })}>
                <span className="fact-icon"><Icon size={17} /></span>
                <div className="fact-title">{f.title}</div>
                <p className="fact-body">{f.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Developers: CLI and MCP ── */}
      <section id="developers" className="section">
        <div className="dev">
          <div className="dev-copy" data-reveal>
            <div className="eyebrow mono">• Developers</div>
            <h2 className="section-title">Deploy from your terminal or your editor.</h2>
            <p className="section-sub">
              Use the whizan CLI, or add the MCP server to Cursor, Windsurf or Claude so your agent
              can inspect the repository, set variables, deploy and check health.
            </p>

            <div className="code">
              <div className="code-head">
                <div className="code-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={devTab === "cli"}
                    className={`code-tab ${devTab === "cli" ? "active" : ""}`}
                    onClick={() => setDevTab("cli")}
                  >
                    Terminal
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={devTab === "mcp"}
                    className={`code-tab ${devTab === "mcp" ? "active" : ""}`}
                    onClick={() => setDevTab("mcp")}
                  >
                    mcp.json
                  </button>
                </div>
                <button type="button" className="code-copy" onClick={copySnippet} title="Copy">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <pre className="code-body mono">
                {devTab === "cli" ? highlightShell(CLI_SNIPPET) : highlightJson(MCP_CONFIG)}
              </pre>
            </div>
          </div>

          <div className="agent" data-reveal style={cssVars({ "--d": "120ms" })}>
            <div className="agent-head">
              <span className="agent-dot" />
              <span className="mono">Agent session (Cursor / Claude / Windsurf)</span>
            </div>
            <div className="agent-body">
              <div className="agent-msg agent-user">Deploy this repository to Whizan Cloud.</div>
              <ul className="agent-calls mono">
                {AGENT_CALLS.map((c, i) => (
                  <li key={c.tool} className="agent-call" style={cssVars({ "--i": i })}>
                    <Check size={13} className="agent-check" />
                    <span className="agent-tool">{c.tool}</span>
                    <span className="agent-result">{c.result}</span>
                  </li>
                ))}
              </ul>
              <div className="agent-msg agent-reply" style={cssVars({ "--i": AGENT_CALLS.length })}>
                Successfully deployed. The health check passed with HTTP 200 OK.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Plans ── */}
      <section id="plans" className="section">
        <div className="section-head" data-reveal>
          <div className="eyebrow mono">• Plans</div>
          <h2 className="section-title">Start free. Upgrade when you need more.</h2>
        </div>

        <div className="plans">
          <div className="plan" data-reveal>
            <div className="plan-name">Hobby</div>
            <div className="plan-price">Free</div>
            <ul className="plan-list">
              <li>Global Edge CDN frontend hosting</li>
              <li>Backend services with 0.1 vCPU and 512 MB RAM</li>
              <li>Services sleep after 15 minutes of inactivity</li>
              <li>Dedicated starter Postgres &amp; Redis databases</li>
              <li>S3-compatible object storage buckets</li>
            </ul>
            <Link href={ctaHref} className="btn btn-outline mono plan-btn">
              {ctaLabel} <ArrowRight size={15} />
            </Link>
          </div>

          <div className="plan plan-pro" data-reveal style={cssVars({ "--d": "100ms" })}>
            <div className="plan-badge mono">PRO INFRASTRUCTURE</div>
            <div className="plan-name">Professional</div>
            <div className="plan-price">Always On</div>
            <ul className="plan-list">
              <li>Upgraded instance tiers up to 4 vCPU and 4 GB RAM</li>
              <li>Always-on services with zero sleep latency</li>
              <li>High-capacity Postgres and Redis clusters</li>
              <li>Granular compute allocated per microservice</li>
              <li>Dedicated priority build workers &amp; custom domains</li>
            </ul>
            <Link href={user ? "/dashboard/settings" : "/register"} className="btn btn-sun btn-arrow mono plan-btn">
              {user ? "Upgrade in Settings" : "Create account"}
              <span className="btn-arrow-dot"><ArrowUpRight size={15} /></span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Closing ── */}
      <div className="closing-shell">
        <section className="closing" data-reveal>
          <div className="sky" aria-hidden />
          <div className="closing-cloud cc-l" aria-hidden>
            <div className="cloud-billow-left"><PaintedCloud shape="a" seed={14} /></div>
          </div>
          <div className="closing-cloud cc-r" aria-hidden>
            <div className="cloud-billow-right"><PaintedCloud shape="b" seed={9} /></div>
          </div>
          <h2 className="closing-title">
            Clear skies
            <span className="hero-line-soft"> for every deploy.</span>
          </h2>
          <p className="closing-sub">Connect your repository and go live with enterprise resilience in seconds.</p>
          <Link href={ctaHref} className="btn btn-sun btn-arrow mono">
            {ctaLabel}
            <span className="btn-arrow-dot"><ArrowUpRight size={15} /></span>
          </Link>
        </section>
      </div>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="footer-brand">
          <BrandMark compact />
          <p className="footer-tag">Frontends, APIs, functions, databases and storage in one unified console.</p>
        </div>
        <div className="footer-cols">
          <div className="footer-col">
            <div className="footer-head mono">Products</div>
            <Link href="/dashboard/hosting">Frontend</Link>
            <Link href="/dashboard/backend">Backend</Link>
            <Link href="/dashboard/functions">Functions</Link>
            <Link href="/dashboard/databases">Databases</Link>
            <Link href="/dashboard/storage">Storage</Link>
          </div>
          <div className="footer-col">
            <div className="footer-head mono">Developers</div>
            <Link href="/docs">Docs</Link>
            <Link href="/dashboard/cli">CLI</Link>
            <Link href="/dashboard/mcp">MCP</Link>
            <Link href="/dashboard/flows">Flow</Link>
            <Link href="/dashboard/cron">Cron</Link>
          </div>
          <div className="footer-col">
            <div className="footer-head mono">Company</div>
            <Link href="/contact">Contact</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/login">Sign in</Link>
            <Link href="/register">Create account</Link>
          </div>
        </div>
        <div className="footer-copy">© {new Date().getFullYear()} Whizan Cloud Services. All rights reserved.</div>
      </footer>

      {/* ── Scoped Styling (Butter-Smooth 120 FPS, GPU-Accelerated, Real Logos) ── */}
      <style>{`
        .lp {
          --ink: #0b1530;
          --ink-2: #334155;
          --muted: #64748b;
          --faint: #94a3b8;
          --line: #e7edf6;
          --grey: #f2f4f7;
          --sky-50: #f5f9ff;
          --sky-100: #eaf2ff;
          --blue: #2563eb;
          --blue-deep: #1450c8;
          --sun: #ffd84d;
          --sun-deep: #f5c518;
          --green: #15803d;
          min-height: 100vh;
          background: #ffffff;
          color: var(--ink);
          color-scheme: light;
          font-family: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          letter-spacing: -0.01em;
          overflow-x: hidden;
        }
        .lp *, .lp *::before, .lp *::after { box-sizing: border-box; }
        .lp a { color: inherit; text-decoration: none; }
        .lp .mono { font-family: var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace; }
        .lp .brand-logo-img { height: 38px; width: auto; }

        /* ── Top Sticky Navbar ── */
        .lp-nav-wrap {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(255, 255, 255, 0.88);
          backdrop-filter: saturate(180%) blur(16px);
          -webkit-backdrop-filter: saturate(180%) blur(16px);
          border-bottom: 1px solid var(--line);
        }
        .lp-nav {
          max-width: 1240px;
          margin: 0 auto;
          padding: 0.75rem 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.5rem;
        }
        .lp-nav-links {
          display: flex;
          align-items: center;
          gap: 1.75rem;
        }
        .lp-nav-links a {
          font-size: 0.74rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
          transition: color 0.15s ease;
        }
        .lp-nav-links a:hover {
          color: var(--ink);
        }
        .lp-nav-cta {
          display: flex;
          align-items: center;
          gap: 1.1rem;
        }
        .lp-nav-signin {
          font-size: 0.74rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
          transition: color 0.15s ease;
        }
        .lp-nav-signin:hover {
          color: var(--ink);
        }

        /* ── Buttons (Enterprise Luxury Finish) ── */
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.65rem;
          padding: 0.85rem 1.45rem;
          border-radius: 999px;
          border: 1px solid transparent;
          font-size: 0.82rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          white-space: nowrap;
          cursor: pointer;
          transition: background 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                      border-color 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                      transform 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                      box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .btn-sm { padding: 0.55rem 1.15rem; font-size: 0.74rem; }
        .lp .btn-sun {
          background: linear-gradient(180deg, #ffe066 0%, #f5c518 100%);
          color: var(--ink);
          border: 1px solid rgba(255, 255, 255, 0.45);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7),
                      0 14px 34px -8px rgba(245, 197, 24, 0.75),
                      0 2px 6px rgba(11, 21, 48, 0.1);
        }
        .lp .btn-sun:hover {
          background: linear-gradient(180deg, #ffea80 0%, #fab005 100%);
          transform: translateY(-2px);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8),
                      0 18px 40px -8px rgba(245, 197, 24, 0.85),
                      0 4px 10px rgba(11, 21, 48, 0.15);
        }
        .lp .btn-glass {
          background: rgba(11, 21, 48, 0.26);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.35);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25),
                      0 10px 25px -5px rgba(11, 40, 110, 0.2);
        }
        .lp .btn-glass:hover {
          background: rgba(11, 21, 48, 0.4);
          border-color: rgba(255, 255, 255, 0.55);
          transform: translateY(-2px);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35),
                      0 14px 30px -5px rgba(11, 40, 110, 0.28);
        }
        .lp .btn-outline { background: #ffffff; color: var(--ink); border-color: var(--line); }
        .lp .btn-outline:hover { border-color: #c9d6ea; transform: translateY(-1px); }
        .btn-arrow { padding-right: 0.45rem; }
        .btn-arrow-dot {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--ink);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s ease;
        }
        .btn-arrow:hover .btn-arrow-dot {
          transform: rotate(45deg);
          background: #000000;
        }

        /* ── Hero shell ── */
        .hero-shell { padding: 12px; }
        .hero {
          position: relative;
          overflow: hidden;
          border-radius: 30px;
          min-height: 860px;
          display: flex;
          flex-direction: column;
          align-items: center;
          isolation: isolate;
          box-shadow: 0 20px 60px -20px rgba(11, 40, 110, 0.15);
        }
        .sky {
          position: absolute;
          inset: 0;
          z-index: -3;
          background:
            radial-gradient(ellipse 65% 45% at 50% -5%, rgba(255, 255, 255, 0.45) 0%, rgba(255, 248, 225, 0.22) 35%, transparent 70%),
            radial-gradient(60% 45% at 85% 15%, rgba(147, 197, 253, 0.35), transparent 65%),
            radial-gradient(55% 45% at 15% 25%, rgba(186, 230, 253, 0.3), transparent 65%),
            linear-gradient(180deg, #0d59d6 0%, #1a6fe4 24%, #3b8cf0 52%, #7abdf8 76%, #d8ecfe 100%);
        }

        /* ── Authentic Atmospheric Clouds (Pure GPU Keyframes) ── */
        .hero-cloud {
          position: absolute;
          z-index: -1;
          pointer-events: none;
        }
        .hc-1 { left: 6%; top: 45px; width: 200px; opacity: 0.65; }
        .hc-2 { right: 8%; top: 110px; width: 175px; opacity: 0.6; }
        .hc-wisp { left: 24%; top: 220px; width: 340px; opacity: 0.52; }
        .hc-3 { left: -4%; top: 360px; width: min(36vw, 540px); opacity: 0.98; }
        .hc-4 { right: -5%; top: 320px; width: min(34vw, 500px); opacity: 0.98; }

        .cloud-drift-h1 {
          will-change: transform;
          animation: lpCloudDriftH1 54s ease-in-out infinite alternate;
        }
        @keyframes lpCloudDriftH1 {
          0% { transform: translate3d(-40px, 0, 0) scale(0.96); }
          50% { transform: translate3d(50px, -8px, 0) scale(1.02); }
          100% { transform: translate3d(95px, -3px, 0) scale(0.98); }
        }

        .cloud-drift-h2 {
          will-change: transform;
          animation: lpCloudDriftH2 62s ease-in-out -14s infinite alternate;
        }
        @keyframes lpCloudDriftH2 {
          0% { transform: translate3d(50px, 0, 0) scale(1.02); }
          50% { transform: translate3d(-35px, 8px, 0) scale(0.98); }
          100% { transform: translate3d(-80px, 2px, 0) scale(1.01); }
        }

        .cloud-drift-wisp {
          will-change: transform;
          animation: lpCloudDriftWisp 72s ease-in-out -26s infinite alternate;
        }
        @keyframes lpCloudDriftWisp {
          0% { transform: translate3d(-60px, 0, 0) scale(0.97); opacity: 0.42; }
          50% { transform: translate3d(40px, -10px, 0) scale(1.03); opacity: 0.62; }
          100% { transform: translate3d(85px, -4px, 0) scale(1.0); opacity: 0.48; }
        }

        .cloud-billow-left {
          will-change: transform;
          animation: lpCloudBillowLeft 34s ease-in-out infinite alternate;
        }
        @keyframes lpCloudBillowLeft {
          0% { transform: translate3d(-20px, 0, 0) scale(0.98); }
          50% { transform: translate3d(32px, -14px, 0) scale(1.035); }
          100% { transform: translate3d(55px, -6px, 0) scale(1.01); }
        }

        .cloud-billow-right {
          will-change: transform;
          animation: lpCloudBillowRight 38s ease-in-out -8s infinite alternate;
        }
        @keyframes lpCloudBillowRight {
          0% { transform: translate3d(24px, 0, 0) scale(1.02); }
          50% { transform: translate3d(-28px, -16px, 0) scale(0.985); }
          100% { transform: translate3d(-60px, -7px, 0) scale(1.03); }
        }

        .cloud-svg { display: block; width: 100%; height: auto; overflow: visible; }
        .bank { position: absolute; left: 50%; pointer-events: none; }
        .bank-back { width: 160%; bottom: 35px; transform: translateX(-50%); opacity: 0.88; z-index: -1; }
        .bank-front { width: 145%; bottom: -170px; transform: translateX(-48%); z-index: 3; }

        .cloud-bank-back {
          will-change: transform;
          animation: lpBankBackDrift 44s ease-in-out infinite alternate;
        }
        @keyframes lpBankBackDrift {
          0% { transform: translate3d(-35px, 0, 0) scale(1); }
          50% { transform: translate3d(25px, -8px, 0) scale(1.015); }
          100% { transform: translate3d(48px, -3px, 0) scale(1); }
        }

        .cloud-bank-front {
          will-change: transform;
          animation: lpBankFrontDrift 30s ease-in-out -6s infinite alternate;
        }
        @keyframes lpBankFrontDrift {
          0% { transform: translate3d(35px, 0, 0) scale(1.01); }
          50% { transform: translate3d(-25px, -12px, 0) scale(0.99); }
          100% { transform: translate3d(-48px, -5px, 0) scale(1.015); }
        }

        /* ── Hero copy ── */
        .hero-copy {
          position: relative;
          z-index: 4;
          max-width: 1040px;
          padding: 4.2rem 1.5rem 0;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .hero-kicker {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.38rem 0.95rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.22);
          border: 1px solid rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 4px 20px rgba(11, 40, 110, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.45);
          font-size: 0.74rem;
          color: #ffffff;
          margin-bottom: 1.35rem;
          letter-spacing: 0.02em;
          font-weight: 500;
          transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
          user-select: none;
        }
        .hero-kicker:hover {
          background: rgba(255, 255, 255, 0.32);
          border-color: rgba(255, 255, 255, 0.6);
          transform: translateY(-1px);
        }
        .hero-kicker-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--sun);
          box-shadow: 0 0 10px var(--sun);
          animation: kickerPulse 2s ease-in-out infinite;
        }
        @keyframes kickerPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.85); }
        }
        .hero-kicker-badge {
          font-weight: 600;
          color: #ffffff;
          font-family: var(--font-geist-mono), monospace;
        }
        .hero-kicker-sep { opacity: 0.5; }
        .hero-kicker-desc { color: rgba(255, 255, 255, 0.95); }
        .hero-kicker-arrow {
          opacity: 0.8;
          margin-left: 0.15rem;
          transition: transform 0.2s ease;
        }
        .hero-kicker:hover .hero-kicker-arrow { transform: translateX(2px); }

        .hero-title {
          margin: 0 0 1.35rem;
          font-size: clamp(2.6rem, 5.4vw, 4.35rem);
          line-height: 1.04;
          letter-spacing: -0.05em;
          font-weight: 600;
          color: #ffffff;
          text-shadow: 0 2px 30px rgba(11, 40, 110, 0.22);
        }
        .hero-line { display: block; text-wrap: balance; }
        .hero-line-soft { color: rgba(255, 255, 255, 0.74); }
        .hero-sub {
          max-width: 35rem;
          margin: 0 0 2.2rem;
          font-size: 1.05rem;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.9);
          text-wrap: balance;
        }
        .hero-ctas { display: flex; gap: 0.85rem; flex-wrap: wrap; justify-content: center; }
        .hero-fade {
          opacity: 0;
          transform: translateY(14px);
          filter: blur(6px);
          animation: lpFadeUp 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          animation-delay: var(--d, 0ms);
        }
        @keyframes lpFadeUp {
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }

        /* ── 3D Card Arc (High-Craft Ceramic Finish, 120 FPS) ── */
        .hero-arc {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 1200px;
          height: 380px;
          margin-top: 1.25rem;
          perspective: 1200px;
          overflow: visible;
        }
        .arc { position: absolute; inset: 0; }
        .arc-tilt {
          position: absolute;
          inset: 0;
          transform-style: preserve-3d;
        }
        .arc-sway {
          position: absolute;
          inset: 0;
          transform-style: preserve-3d;
          animation: lpArcSway 14s ease-in-out infinite alternate;
        }
        @keyframes lpArcSway {
          0% { transform: rotateY(-3.5deg) rotateX(1deg); }
          100% { transform: rotateY(3.5deg) rotateX(-1deg); }
        }
        .arc-card {
          position: absolute;
          left: 50%;
          bottom: 20px;
          width: 196px;
          height: 144px;
          margin-left: -98px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          border: 1px solid rgba(255, 255, 255, 0.95);
          border-radius: 16px;
          padding: 1rem;
          box-shadow: inset 0 1px 0 #ffffff,
                      0 24px 50px -12px rgba(11, 40, 110, 0.24),
                      0 3px 8px rgba(11, 40, 110, 0.06);
          transform-origin: 50% 390px;
          transform: rotateZ(var(--a)) translateY(-18px) translateZ(calc(120px - abs(var(--i) - 4) * 22px));
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          font-size: 0.72rem;
          color: var(--ink);
          user-select: none;
          transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                      box-shadow 0.35s cubic-bezier(0.16, 1, 0.3, 1),
                      border-color 0.25s ease;
        }
        .arc-card:hover {
          transform: rotateZ(var(--a)) translateY(-36px) translateZ(175px) scale(1.05);
          box-shadow: inset 0 1px 0 #ffffff,
                      0 32px 70px -12px rgba(37, 99, 235, 0.38),
                      0 0 0 1px rgba(37, 99, 235, 0.35);
          border-color: rgba(37, 99, 235, 0.4);
          z-index: 10;
        }
        .arc-card-dark {
          background: linear-gradient(145deg, #0b132b 0%, #1c2541 100%);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.16);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25),
                      0 28px 65px -10px rgba(0, 0, 0, 0.55);
        }
        .arc-card-dark:hover {
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35),
                      0 36px 80px -12px rgba(0, 0, 0, 0.65),
                      0 0 0 1px rgba(255, 216, 77, 0.4);
        }
        .mini-dark-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.58rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          color: var(--sun);
          text-transform: uppercase;
        }
        .mini-dark-pip {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--sun);
          box-shadow: 0 0 6px var(--sun);
        }
        .arc-card-glass {
          background: rgba(255, 255, 255, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.9);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8),
                      0 20px 45px -10px rgba(11, 40, 110, 0.18);
        }
        .mini-label {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--muted);
          font-weight: 600;
        }
        .mini-big { font-size: 1.45rem; font-weight: 600; letter-spacing: -0.03em; line-height: 1; margin: 0.35rem 0; }
        .mini-text { font-size: 0.7rem; color: var(--muted); }
        .mini-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.68rem; margin: 0.18rem 0; }
        .mini-chip {
          display: inline-flex;
          align-items: center;
          font-size: 0.62rem;
          padding: 0.12rem 0.45rem;
          border-radius: 999px;
          font-weight: 550;
        }
        .mini-chip-ok { background: #dcfce7; color: var(--green); }
        .mini-chip-busy { background: #dbeafe; color: var(--blue); }
        .mini-pulse-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: currentColor;
          margin-right: 0.3rem;
          animation: miniPulse 1.8s ease-in-out infinite;
        }
        @keyframes miniPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        .mini-chart { width: 100%; height: 40px; display: block; margin-top: auto; }
        .mini-log { font-size: 0.6rem; line-height: 1.5; color: var(--muted); margin-top: 0.2rem; }
        .mini-log span { color: var(--faint); }
        .mini-log-code { font-weight: 600; color: #16a34a !important; }
        .mini-log-code.post { color: #2563eb !important; }
        .mini-dark-title { font-size: 0.88rem; line-height: 1.35; font-weight: 550; margin: auto 0; }
        .mini-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--sun); vertical-align: middle; margin: 0 0.15rem; }
        .mini-dim { color: rgba(255, 255, 255, 0.6); }
        .mini-plus {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 4px 14px rgba(11, 40, 110, 0.12);
          color: var(--blue);
        }
        .mini-glass-title { font-size: 0.82rem; font-weight: 600; margin-top: 0.45rem; }
        .mini-glass-sub { font-size: 0.66rem; color: var(--muted); }
        .mini-table { font-size: 0.64rem; line-height: 1.45; color: var(--muted); margin-top: 0.25rem; }
        .mini-table span:first-child { color: var(--faint); width: 12px; }
        .mini-bar { height: 4px; border-radius: 2px; background: var(--grey); overflow: hidden; margin-top: 0.35rem; }
        .mini-bar span { display: block; height: 100%; background: var(--blue); }

        .hero-foot {
          position: relative;
          z-index: 4;
          margin-top: auto;
          padding: 1.5rem 1rem 1.8rem;
          display: flex;
          justify-content: center;
        }
        .hero-foot-pill {
          display: inline-flex;
          align-items: center;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.65rem;
          padding: 0.55rem 1.25rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.24);
          border: 1px solid rgba(255, 255, 255, 0.45);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 8px 25px -5px rgba(11, 40, 110, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.4);
          font-size: 0.74rem;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.95);
          text-shadow: 0 1px 8px rgba(11, 40, 110, 0.25);
        }
        .hero-foot-bullet { color: var(--sun); opacity: 0.85; }
        .hero-foot-item.highlight { color: var(--sun); font-weight: 600; }

        /* ── Stack marquee (All Official Logos) ── */
        .stack {
          padding: 3.2rem 0 3.8rem;
          border-bottom: 1px solid var(--line);
          background: #ffffff;
          overflow: hidden;
          text-align: center;
        }
        .stack-badge {
          display: inline-block;
          font-size: 0.72rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--blue);
          background: var(--sky-100);
          padding: 0.3rem 0.85rem;
          border-radius: 999px;
          margin-bottom: 1.75rem;
          font-weight: 600;
        }
        .marquee {
          overflow: hidden;
          display: flex;
          mask-image: linear-gradient(to right, transparent, #000 8%, #000 92%, transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, #000 8%, #000 92%, transparent);
        }
        .marquee-track {
          display: flex;
          width: max-content;
          animation: lpMarquee 38s linear infinite;
        }
        .marquee:hover .marquee-track { animation-play-state: paused; }
        @keyframes lpMarquee {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-33.3333%, 0, 0); }
        }
        .marquee-group { display: flex; gap: 1rem; padding: 0 0.5rem; }
        .stack-item {
          display: inline-flex;
          align-items: center;
          gap: 0.7rem;
          font-size: 0.85rem;
          color: var(--ink);
          font-weight: 550;
          white-space: nowrap;
          padding: 0.55rem 1.25rem;
          border-radius: 999px;
          border: 1px solid var(--line);
          background: #ffffff;
          box-shadow: 0 2px 5px rgba(11, 40, 110, 0.03);
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
                      border-color 0.2s ease,
                      box-shadow 0.2s ease;
        }
        .stack-item:hover {
          transform: translateY(-3px);
          border-color: #94a3b8;
          box-shadow: 0 8px 20px -4px rgba(11, 40, 110, 0.08);
        }
        .stack-tech-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
        }
        .stack-tech-icon svg {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .stack-tech-name { font-weight: 550; }

        /* ── Common section styles ── */
        .section {
          max-width: 1200px;
          margin: 0 auto;
          padding: 5.5rem 1.5rem;
        }
        .section-head { margin-bottom: 2.75rem; }
        .eyebrow {
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--blue);
          font-weight: 600;
          margin-bottom: 0.85rem;
        }
        .section-title {
          font-size: clamp(1.9rem, 3.8vw, 2.75rem);
          line-height: 1.12;
          letter-spacing: -0.04em;
          font-weight: 600;
          margin: 0 0 0.75rem;
        }
        .section-sub {
          font-size: 1rem;
          color: var(--muted);
          max-width: 38rem;
          line-height: 1.55;
          margin: 0;
        }

        /* ── Why Whizan: Bento grid ── */
        .why-head { margin-bottom: 2.5rem; max-width: 48rem; }
        .why-title {
          font-size: clamp(2rem, 4vw, 3rem);
          line-height: 1.15;
          letter-spacing: -0.04em;
          font-weight: 550;
          margin: 0;
        }
        .why-soft { color: var(--muted); }
        .nowrap { white-space: nowrap; }
        .inline-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          vertical-align: -5px;
          margin: 0 0.2rem;
        }
        .badge-blue { background: var(--blue); color: #ffffff; }
        .badge-sun { background: var(--sun); color: var(--ink); }

        .bento {
          display: grid;
          grid-template-columns: 1.35fr 1fr 1fr;
          gap: 1rem;
        }
        .bento-sky {
          position: relative;
          overflow: hidden;
          background: linear-gradient(180deg, #1f74ea 0%, #4597f2 55%, #8cc3f8 100%);
          border-radius: 24px;
          padding: 1.75rem;
          color: #ffffff;
          min-height: 340px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: 0 10px 30px -10px rgba(31, 116, 234, 0.3);
        }
        .bento-sky-cloud {
          position: absolute;
          left: 50%;
          top: -20px;
          width: 120%;
          transform: translateX(-50%);
          pointer-events: none;
        }
        .bento-sky-pill {
          display: inline-block;
          font-size: 0.65rem;
          letter-spacing: 0.08em;
          padding: 0.2rem 0.6rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          font-weight: 600;
        }
        .bento-sky-card {
          position: relative;
          z-index: 2;
          background: rgba(255, 255, 255, 0.18);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 16px;
          padding: 1.25rem;
        }
        .bento-num {
          font-size: 2.8rem;
          font-weight: 600;
          letter-spacing: -0.04em;
          line-height: 1;
          margin-bottom: 0.6rem;
        }
        .bento-ok-dot {
          display: inline-block;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--green);
          box-shadow: 0 0 10px rgba(21, 128, 61, 0.6);
          vertical-align: 2px;
          margin-right: 0.4rem;
        }
        .bento-text {
          font-size: 0.875rem;
          line-height: 1.5;
          margin: 0;
          color: rgba(255, 255, 255, 0.95);
        }
        .bento-label {
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 0.6rem;
          font-weight: 600;
        }

        .bento-grey {
          background: var(--grey);
          border-radius: 24px;
          padding: 1.75rem;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 340px;
          border: 1px solid var(--line);
        }
        .bento-grey .bento-num { color: var(--blue); }
        .runtime-stack { display: flex; gap: 0.35rem; margin-bottom: 0.75rem; }
        .runtime-dot {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #ffffff;
          font-size: 0.65rem;
          font-weight: 600;
          color: var(--ink);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
          border: 1px solid var(--line);
        }
        .bento-quote { font-size: 0.82rem; line-height: 1.55; color: var(--ink-2); margin: 0; }

        .bento-col { display: flex; flex-direction: column; gap: 1rem; }
        .bento-sun {
          background: linear-gradient(180deg, #ffe066 0%, #ffd84d 100%);
          border-radius: 24px;
          padding: 1.5rem 1.6rem;
          color: var(--ink);
          flex: 1;
          box-shadow: 0 10px 25px -10px rgba(255, 216, 77, 0.4);
        }
        .bento-sun .bento-label { color: rgba(11, 21, 48, 0.65); }
        .bento-sun .bento-text { color: var(--ink-2); font-size: 0.82rem; }
        .bento-dark {
          background: var(--ink);
          color: #ffffff;
          border-radius: 24px;
          padding: 1.25rem 1.6rem;
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          box-shadow: 0 10px 25px -10px rgba(11, 21, 48, 0.3);
        }
        .bento-dark .bento-label { color: var(--faint); margin: 0; }
        .bento-dark .bento-num { color: var(--sun); margin: 0; font-size: 2rem; }

        /* ── Products grid (8 Unified Products) ── */
        .products {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
        }
        .product {
          background: #ffffff;
          border: 1px solid var(--line);
          border-radius: 20px;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          transition: border-color 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease;
        }
        .product:hover {
          border-color: #94a3b8;
          transform: translateY(-3px);
          box-shadow: 0 14px 35px -10px rgba(11, 40, 110, 0.1);
        }
        .product:hover .product-go { transform: translate(2px, -2px); color: var(--blue); }
        .product-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.1rem;
        }
        .product-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: var(--sky-100);
          color: var(--blue);
        }
        .product-tag-pill {
          font-size: 0.62rem;
          letter-spacing: 0.05em;
          color: var(--muted);
          background: var(--grey);
          padding: 0.15rem 0.45rem;
          border-radius: 4px;
        }
        .product-go { color: var(--faint); transition: transform 0.2s ease, color 0.2s ease; }
        .product-name { font-size: 1.05rem; font-weight: 600; margin-bottom: 0.25rem; }
        .product-tagline { font-size: 0.78rem; color: var(--blue); margin-bottom: 0.65rem; font-weight: 500; }
        .product-desc { font-size: 0.84rem; line-height: 1.55; color: var(--muted); margin: 0; }

        /* ── How it works ── */
        .how {
          display: grid;
          grid-template-columns: 1fr 1.08fr;
          gap: 2.75rem;
          align-items: center;
          margin-bottom: 3.5rem;
        }
        .how-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1.5rem; }
        .how-step { display: flex; gap: 1.25rem; align-items: flex-start; }
        .how-num {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--blue);
          background: var(--sky-100);
          padding: 0.35rem 0.6rem;
          border-radius: 8px;
          line-height: 1;
        }
        .how-title { font-size: 1.05rem; font-weight: 600; margin-bottom: 0.25rem; }
        .how-body { font-size: 0.88rem; line-height: 1.55; color: var(--muted); margin: 0; }

        /* ── Deploy window (macOS Terminal Header) ── */
        .deploy {
          background: #ffffff;
          border: 1px solid var(--line);
          border-radius: 20px;
          box-shadow: 0 20px 50px -15px rgba(11, 40, 110, 0.1);
          overflow: hidden;
        }
        .deploy-head {
          padding: 0.85rem 1.15rem;
          border-bottom: 1px solid var(--line);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #ffffff;
        }
        .deploy-traffic-lights {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .deploy-traffic-lights .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .dot-red { background: #ef4444; }
        .dot-yellow { background: #eab308; }
        .dot-green { background: #22c55e; }
        .deploy-title { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; font-weight: 500; }
        .deploy-icon { color: var(--blue); display: inline-flex; }
        .deploy-ref { font-size: 0.74rem; color: var(--faint); }
        .deploy-meta { display: flex; align-items: center; gap: 0.65rem; }
        .deploy-time { font-size: 0.74rem; color: var(--muted); }
        .deploy-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.18rem 0.55rem;
          border-radius: 999px;
          font-size: 0.7rem;
          font-weight: 500;
        }
        .pill-queued { background: var(--grey); color: var(--muted); }
        .pill-building { background: #dbeafe; color: var(--blue); }
        .pill-ready { background: #dcfce7; color: var(--green); }
        .pill-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .deploy-steps {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          list-style: none;
          margin: 0;
          padding: 0.85rem 1.15rem;
          gap: 0.5rem;
          background: var(--sky-50);
          border-bottom: 1px solid var(--line);
        }
        .deploy-step { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.7rem; }
        .step-label { color: var(--faint); font-weight: 500; }
        .step-bar { height: 3px; border-radius: 2px; background: #d7e3f4; overflow: hidden; }
        .step-bar span { display: block; height: 100%; width: 0; background: var(--blue); transition: width 0.3s ease; }
        .step-active .step-label { color: var(--blue); font-weight: 600; }
        .step-active .step-bar span { width: 60%; }
        .step-done .step-label { color: var(--ink); }
        .step-done .step-bar span { width: 100%; background: var(--green); }
        .deploy-log {
          padding: 0.85rem 1.15rem;
          font-size: 0.74rem;
          line-height: 1.6;
          min-height: 140px;
          background: #ffffff;
          color: var(--ink-2);
        }
        .log-row { display: flex; gap: 0.85rem; }
        .log-ts { color: var(--faint); }
        .log-final { color: var(--green); font-weight: 550; }
        .log-caret { display: inline-block; width: 6px; height: 11px; background: var(--blue); vertical-align: -1px; animation: lpCaret 0.9s infinite; }
        @keyframes lpCaret { 50% { opacity: 0; } }

        .facts {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
        }
        .fact {
          background: var(--grey);
          border-radius: 20px;
          padding: 1.35rem;
          border: 1px solid var(--line);
        }
        .fact-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: #ffffff;
          color: var(--blue);
          margin-bottom: 0.85rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        .fact-title { font-size: 0.92rem; font-weight: 600; margin-bottom: 0.35rem; }
        .fact-body { font-size: 0.82rem; line-height: 1.5; color: var(--muted); margin: 0; }

        /* ── Developers: CLI and MCP ── */
        .dev {
          display: grid;
          grid-template-columns: 1.15fr 1fr;
          gap: 2.5rem;
          align-items: start;
        }
        .code {
          background: var(--ink);
          border-radius: 20px;
          overflow: hidden;
          color: #ffffff;
          margin-top: 1.75rem;
          box-shadow: 0 20px 45px -15px rgba(11, 21, 48, 0.4);
        }
        .code-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0.75rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .code-tabs { display: flex; gap: 0.25rem; }
        .code-tab {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-family: inherit;
          font-size: 0.75rem;
          padding: 0.35rem 0.7rem;
          border-radius: 8px;
          cursor: pointer;
        }
        .code-tab.active { background: rgba(255, 255, 255, 0.1); color: #ffffff; }
        .code-copy {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 0.72rem;
          font-family: inherit;
          cursor: pointer;
          padding: 0.3rem 0.5rem;
          border-radius: 6px;
        }
        .code-copy:hover { color: #ffffff; }
        .code-body { margin: 0; padding: 1.15rem; font-size: 0.78rem; line-height: 1.6; overflow-x: auto; }
        .tok-prompt { color: rgba(255, 255, 255, 0.4); }
        .tok-key { color: #60a5fa; }
        .tok-str { color: #34d399; }

        .agent {
          background: #ffffff;
          border: 1px solid var(--line);
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 16px 40px -15px rgba(11, 40, 110, 0.08);
        }
        .agent-head {
          padding: 0.75rem 1.15rem;
          border-bottom: 1px solid var(--line);
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.74rem;
          color: var(--muted);
          background: var(--sky-50);
        }
        .agent-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); box-shadow: 0 0 6px rgba(22, 163, 74, 0.6); }
        .agent-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 0.85rem; font-size: 0.82rem; }
        .agent-msg { padding: 0.65rem 0.95rem; border-radius: 12px; }
        .agent-user { background: var(--grey); color: var(--ink); align-self: flex-start; }
        .agent-reply { background: var(--sky-100); color: var(--blue-deep); align-self: flex-start; font-weight: 500; }
        .agent-calls { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.45rem; }
        .agent-call {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.72rem;
          padding: 0.35rem 0.55rem;
          border-radius: 8px;
          background: var(--sky-50);
          color: var(--ink-2);
          border: 1px solid var(--line);
        }
        .agent-check { color: var(--green); flex-shrink: 0; }
        .agent-tool { font-weight: 600; }
        .agent-result { color: var(--faint); margin-left: auto; }

        /* ── Plans ── */
        .plans {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.25rem;
          max-width: 900px;
        }
        .plan {
          background: #ffffff;
          border: 1px solid var(--line);
          border-radius: 24px;
          padding: 2.25rem;
          display: flex;
          flex-direction: column;
        }
        .plan-pro {
          position: relative;
          background: linear-gradient(180deg, #ffffff 0%, var(--sky-50) 100%);
          border-color: #bcd4f5;
          box-shadow: 0 16px 40px -15px rgba(37, 99, 235, 0.18);
        }
        .plan-badge {
          display: inline-block;
          font-size: 0.65rem;
          letter-spacing: 0.08em;
          color: var(--blue);
          background: var(--sky-100);
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          margin-bottom: 0.8rem;
          align-self: flex-start;
          font-weight: 600;
        }
        .plan-name { font-size: 1.15rem; font-weight: 600; margin-bottom: 0.35rem; }
        .plan-price { font-size: 2.2rem; font-weight: 600; letter-spacing: -0.04em; margin-bottom: 1.25rem; color: var(--blue); }
        .plan-list { list-style: none; margin: 0 0 2rem; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.88rem; color: var(--ink-2); }
        .plan-list li::before { content: "✓"; color: var(--blue); font-weight: 600; margin-right: 0.6rem; }
        .plan-btn { margin-top: auto; }

        /* ── Closing ── */
        .closing-shell { padding: 12px; }
        .closing {
          position: relative;
          overflow: hidden;
          border-radius: 30px;
          min-height: 480px;
          padding: 5rem 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: #ffffff;
          isolation: isolate;
          box-shadow: 0 20px 60px -20px rgba(11, 40, 110, 0.15);
        }
        .closing-cloud { position: absolute; pointer-events: none; }
        .cc-l { left: -6%; bottom: -40px; width: min(34vw, 500px); opacity: 0.95; }
        .cc-r { right: -6%; top: -30px; width: min(32vw, 460px); opacity: 0.85; }
        .closing-title {
          font-size: clamp(2.4rem, 4.8vw, 3.8rem);
          line-height: 1.06;
          letter-spacing: -0.05em;
          font-weight: 600;
          margin: 0 0 1rem;
          text-shadow: 0 2px 30px rgba(11, 40, 110, 0.2);
        }
        .closing-sub {
          font-size: 1.05rem;
          color: rgba(255, 255, 255, 0.88);
          margin: 0 0 2rem;
          max-width: 30rem;
        }

        /* ── Footer ── */
        .footer {
          max-width: 1200px;
          margin: 0 auto;
          padding: 4.5rem 1.5rem 3rem;
          display: grid;
          grid-template-columns: 1.4fr 2fr;
          gap: 3rem;
        }
        .footer-tag { font-size: 0.85rem; color: var(--muted); margin: 0.85rem 0 0; max-width: 20rem; line-height: 1.55; }
        .footer-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; }
        .footer-col { display: flex; flex-direction: column; gap: 0.65rem; }
        .footer-head { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--faint); margin-bottom: 0.35rem; }
        .footer-col a { font-size: 0.84rem; color: var(--muted); transition: color 0.15s ease; }
        .footer-col a:hover { color: var(--ink); }
        .footer-copy {
          grid-column: 1 / -1;
          padding-top: 2rem;
          border-top: 1px solid var(--line);
          font-size: 0.76rem;
          color: var(--faint);
        }

        /* ── Reveal & Accessibility ── */
        [data-reveal] {
          opacity: 0;
          transform: translateY(16px);
          transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }
        [data-reveal].is-in {
          opacity: 1;
          transform: translateY(0);
        }

        /* ── Responsive ── */
        @media (max-width: 1024px) {
          .lp-nav-links { display: none; }
          .bento { grid-template-columns: 1fr; }
          .products { grid-template-columns: repeat(2, 1fr); }
          .how { grid-template-columns: 1fr; }
          .dev { grid-template-columns: 1fr; }
          .facts { grid-template-columns: repeat(2, 1fr); }
          .footer { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          .products { grid-template-columns: 1fr; }
          .plans { grid-template-columns: 1fr; }
          .facts { grid-template-columns: 1fr; }
          .footer-cols { grid-template-columns: 1fr; }
          .hero-shell { padding: 6px; }
          .hero { border-radius: 20px; min-height: 720px; }
        }
      `}</style>
    </div>
  );
}
