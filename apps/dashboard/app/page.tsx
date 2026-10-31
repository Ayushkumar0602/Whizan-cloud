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
  Check
} from "lucide-react";

/* ─── Static content ─────────────────────────────────────────────── */

const DEPLOY_STEPS = ["Clone", "Install", "Build", "Health check", "Live"];

const DEPLOY_LOG = [
  { step: 0, text: "Cloning acme/api-gateway at main" },
  { step: 0, text: "Checked out 4f8e2c1" },
  { step: 1, text: "npm ci · 412 packages installed" },
  { step: 2, text: "npm run build" },
  { step: 2, text: "Image built · 148 MB" },
  { step: 3, text: "GET /health → 200 OK" },
  { step: 4, text: "Traffic moved to the new version" },
];

// Ticks to hold the finished state before the loop restarts
const DEPLOY_HOLD = 6;

const PRODUCTS = [
  {
    id: "hosting",
    icon: Globe,
    name: "Frontend Hosting",
    tagline: "Next.js, React, Vite, Astro",
    description: "Deploy from Git. Every push builds and goes live on its own URL with HTTPS.",
    href: "/dashboard/hosting",
  },
  {
    id: "backend",
    icon: Server,
    name: "Backend Services",
    tagline: "Node.js, Python, Go, Rust, Java, Docker",
    description: "APIs and workers in isolated containers. New versions take traffic after a health check.",
    href: "/dashboard/backend",
  },
  {
    id: "functions",
    icon: Zap,
    name: "Edge Functions",
    tagline: "TypeScript and JavaScript",
    description: "Handlers for API routes and webhooks, each with its own URL and API keys.",
    href: "/dashboard/functions",
  },
  {
    id: "databases",
    icon: Database,
    name: "Databases",
    tagline: "PostgreSQL and Redis",
    description: "Dedicated instances with connection pooling, a table browser and a SQL console.",
    href: "/dashboard/databases",
  },
  {
    id: "storage",
    icon: HardDrive,
    name: "Cloud Storage",
    tagline: "S3-compatible objects",
    description: "Buckets for uploads and assets, with access policies and per-project quotas.",
    href: "/dashboard/storage",
  },
  {
    id: "cron",
    icon: Clock,
    name: "Cron Jobs",
    tagline: "Scheduled tasks",
    description: "Run jobs on a schedule against your services and functions, without an always-on server.",
    href: "/dashboard/cron",
  },
  {
    id: "flow",
    icon: Workflow,
    name: "Whizan Flow",
    tagline: "Pipelines",
    description: "Build, test and canary-deploy pipelines that recover automatically after failures.",
    href: "/dashboard/flows",
  },
  {
    id: "devtools",
    icon: Terminal,
    name: "CLI and MCP",
    tagline: "Terminal and editor",
    description: "Deploy, read logs and manage services with the whizan CLI, or through MCP in your editor.",
    href: "/dashboard/cli",
  },
];

const HOW_STEPS = [
  { title: "Connect", body: "Pick a GitHub repository and branch, or run whizan deploy." },
  { title: "Configure", body: "Set the port, environment variables and instance size." },
  { title: "Build", body: "Each push builds in an isolated container. Logs stream as it runs." },
  { title: "Go live", body: "Traffic moves to the new version once its health check returns 200." },
];

const FACTS = [
  { icon: ShieldCheck, title: "HTTPS by default", body: "Every deployment gets its own URL and certificate." },
  { icon: Activity, title: "Logs and metrics", body: "Build logs, runtime logs, CPU and memory per service." },
  { icon: KeyRound, title: "Encrypted variables", body: "Environment variables are stored encrypted with AES-256." },
  { icon: RotateCcw, title: "Safe releases", body: "The previous version keeps serving until the new one passes." },
];

const AGENT_CALLS = [
  { tool: "whizan_analyze_workspace", result: "Next.js app · port 3000" },
  { tool: "whizan_set_env_vars", result: "2 variables set" },
  { tool: "whizan_create_project", result: "project created" },
  { tool: "whizan_deploy_direct", result: "deployment queued" },
  { tool: "whizan_get_build_logs", result: "READY" },
  { tool: "whizan_check_health", result: "200 OK" },
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
        "WHIZAN_API_KEY": "whz_live_your_key"
      }
    }
  }
}`;

/* ─── Clouds (Pure GPU-Accelerated Feathered Volumes) ─────────────── */

// Each lobe is [cx, cy, rx, ry]. Wide, flat lobes form the base;
// rounder ones build the billowing top.
type Lobe = [number, number, number, number];

const CLOUD_SHAPES: Record<"a" | "b" | "c" | "bank", { w: number; h: number; lobes: Lobe[] }> = {
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
    lobes: [[260, 168, 210, 46], [220, 128, 104, 64], [320, 136, 96, 58], [150, 158, 70, 36], [380, 160, 74, 34]],
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
        <radialGradient id={id("body")} cx="50%" cy="38%" r="56%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.98" />
          <stop offset="48%" stopColor="#ffffff" stopOpacity="0.92" />
          <stop offset="78%" stopColor="#f0f6fe" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#e2ecfb" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("shade")} cx="50%" cy="68%" r="52%">
          <stop offset="0%" stopColor="#8fa9ce" stopOpacity="0.36" />
          <stop offset="60%" stopColor="#b2c6e2" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#cad7ea" stopOpacity="0" />
        </radialGradient>
        <filter id={id("soft")} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={6 * k} />
        </filter>
      </defs>

      <g filter={`url(#${id("soft")})`}>
        {lobes.map(([cx, cy, rx, ry], i) => (
          <ellipse
            key={`s-${i}`}
            cx={cx}
            cy={cy + 0.35 * ry}
            rx={rx * 0.95}
            ry={ry * 0.85}
            fill={`url(#${id("shade")})`}
            opacity="0.8"
          />
        ))}
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

/* ─── Hero card arc ──────────────────────────────────────────────── */

const ARC_CARDS: { key: string; tone?: "dark" | "glass"; body: ReactNode }[] = [
  {
    key: "cron",
    body: (
      <>
        <div className="mini-label"><Clock size={11} /> Cron</div>
        <div className="mini-mono mini-big">0 3 * * *</div>
        <div className="mini-text">Nightly backup</div>
        <div className="mini-chip mini-chip-ok">Next run 03:00</div>
      </>
    ),
  },
  {
    key: "deploys",
    body: (
      <>
        <div className="mini-label"><Rocket size={11} /> Deployments</div>
        {[
          ["web", "Ready", "ok"],
          ["api", "Ready", "ok"],
          ["worker", "Building", "busy"],
          ["docs", "Ready", "ok"],
        ].map(([name, state, tone]) => (
          <div key={name} className="mini-row">
            <span className="mini-mono">{name}</span>
            <span className={`mini-chip mini-chip-${tone}`}>{state}</span>
          </div>
        ))}
      </>
    ),
  },
  {
    key: "metrics",
    body: (
      <>
        <div className="mini-label"><Activity size={11} /> CPU · api-gateway</div>
        <div className="mini-big">12%</div>
        <svg viewBox="0 0 140 56" className="mini-chart" aria-hidden>
          <defs>
            <linearGradient id="arc-chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2563eb" stopOpacity="0.35" />
              <stop offset="1" stopColor="#2563eb" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 44 L14 40 L28 42 L42 30 L56 34 L70 22 L84 26 L98 14 L112 20 L126 10 L140 16 L140 56 L0 56 Z" fill="url(#arc-chart-fill)" />
          <path d="M0 44 L14 40 L28 42 L42 30 L56 34 L70 22 L84 26 L98 14 L112 20 L126 10 L140 16" fill="none" stroke="#2563eb" strokeWidth="2" />
        </svg>
      </>
    ),
  },
  {
    key: "logs",
    body: (
      <>
        <div className="mini-label"><Terminal size={11} /> Runtime logs</div>
        <div className="mini-log mini-mono">
          <div><span>12:04</span> GET /users 200</div>
          <div><span>12:04</span> GET /plans 200</div>
          <div><span>12:05</span> POST /orders 201</div>
          <div><span>12:05</span> GET /health 200</div>
        </div>
      </>
    ),
  },
  {
    key: "console",
    tone: "dark",
    body: (
      <>
        <div className="mini-dark-title">
          Frontends, APIs <span className="mini-dot" /> and databases
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
        <div className="mini-glass-title">New deployment</div>
        <div className="mini-glass-sub">from GitHub</div>
      </>
    ),
  },
  {
    key: "db",
    body: (
      <>
        <div className="mini-label"><Database size={11} /> users</div>
        <div className="mini-table mini-mono">
          {[["1", "ana@…"], ["2", "raj@…"], ["3", "li@…"], ["4", "sam@…"]].map(([id, email]) => (
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
        <div className="mini-label"><HardDrive size={11} /> Storage</div>
        <div className="mini-mono mini-text">assets</div>
        <div className="mini-big">1.2 GB</div>
        <div className="mini-bar"><span style={{ width: "38%" }} /></div>
      </>
    ),
  },
  {
    key: "mcp",
    body: (
      <>
        <div className="mini-label"><Terminal size={11} /> MCP</div>
        <div className="mini-mono mini-text">whizan_check_health</div>
        <div className="mini-chip mini-chip-ok">200 OK</div>
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

/* ─── Deploy animation ───────────────────────────────────────────── */

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
  const statusLabel = { queued: "Queued", building: "Building", ready: "Ready" }[status];
  const elapsed = `0:${String(shown * 6).padStart(2, "0")}`;

  return (
    <div className="deploy" aria-label="Example deployment">
      <div className="deploy-head">
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
  const ctaLabel = !loading && user ? "Open console" : "Start for free";
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
      {/* ── Top Sticky Header (Authentic Logo in Rightful Place) ── */}
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

          {/* Calming, floating clouds (Decoupled from mouse cursor) */}
          <div className="hero-cloud hc-1" aria-hidden><div className="float" style={cssVars({ "--dur": "14s" })}><PaintedCloud shape="c" seed={11} /></div></div>
          <div className="hero-cloud hc-2" aria-hidden><div className="float" style={cssVars({ "--dur": "16s", "--delay": "-6s" })}><PaintedCloud shape="c" seed={17} /></div></div>
          <div className="hero-cloud hc-3" aria-hidden><div className="float" style={cssVars({ "--dur": "11s" })}><PaintedCloud shape="a" seed={3} /></div></div>
          <div className="hero-cloud hc-4" aria-hidden><div className="float" style={cssVars({ "--dur": "13s", "--delay": "-4s" })}><PaintedCloud shape="b" seed={8} /></div></div>

          <div className="hero-copy">
            <h1 className="hero-title">
              <span className="hero-line hero-fade" style={cssVars({ "--d": "80ms" })}>Your whole stack,</span>
              <span className="hero-line hero-line-soft hero-fade" style={cssVars({ "--d": "200ms" })}>deployed from one console</span>
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
            8 products · 1 console · Free Hobby plan
          </div>

          <div className="bank bank-back" aria-hidden><PaintedCloud shape="bank" seed={21} /></div>
          <div className="bank bank-front" aria-hidden><PaintedCloud shape="bank" seed={5} /></div>
        </section>
      </div>

      {/* ── Stack marquee (All Official Language & Framework Logos) ── */}
      <section className="stack" aria-label="Supported languages and frameworks">
        <div className="stack-badge mono">RUNS ANY STACK</div>
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
            <div className="bento-sky-tag mono">WHIZAN</div>
            <div className="bento-sky-card">
              <div className="bento-num">8</div>
              <p className="bento-text">Products in one console: hosting, backends, functions, databases, storage, cron, pipelines and MCP.</p>
            </div>
          </div>

          <div className="bento-grey" data-reveal style={cssVars({ "--d": "100ms" })}>
            <div className="bento-label">Every release is checked</div>
            <div className="bento-num">200 OK</div>
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
              <span className="mono">Agent session</span>
            </div>
            <div className="agent-body">
              <div className="agent-msg agent-user">Deploy this repo to Whizan.</div>
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
                Deployed. The health check passed.
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
              <li>Frontend apps</li>
              <li>Backend services with 0.1 vCPU and 512 MB RAM</li>
              <li>Services sleep after 15 minutes idle</li>
              <li>Starter databases with 512 MB RAM</li>
            </ul>
            <Link href={ctaHref} className="btn btn-outline mono plan-btn">
              {ctaLabel} <ArrowRight size={15} />
            </Link>
          </div>

          <div className="plan plan-pro" data-reveal style={cssVars({ "--d": "100ms" })}>
            <div className="plan-name">Professional</div>
            <div className="plan-price">More compute</div>
            <ul className="plan-list">
              <li>Starter, Standard or Pro sizes, up to 4 vCPU and 4 GB RAM</li>
              <li>Services stay on, with no sleep</li>
              <li>Larger Postgres and Redis sizes</li>
              <li>Size chosen per service when you deploy</li>
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
          <div className="closing-cloud cc-l" aria-hidden><div className="float" style={cssVars({ "--dur": "11s" })}><PaintedCloud shape="a" seed={14} /></div></div>
          <div className="closing-cloud cc-r" aria-hidden><div className="float" style={cssVars({ "--dur": "13s", "--delay": "-5s" })}><PaintedCloud shape="b" seed={9} /></div></div>
          <h2 className="closing-title">
            Clear skies
            <span className="hero-line-soft"> for every deploy.</span>
          </h2>
          <p className="closing-sub">Connect a repository and go live in a few minutes.</p>
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
          <p className="footer-tag">Frontends, APIs, functions, databases and storage in one console.</p>
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
        <div className="footer-copy">© {new Date().getFullYear()} Whizan Cloud</div>
      </footer>

      {/* ── Scoped Styling (Buttery Smooth 120 FPS, No Invert Filter, Real Logos) ── */}
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

        /* ── Buttons ── */
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          padding: 0.8rem 1.35rem;
          border-radius: 999px;
          border: 1px solid transparent;
          font-size: 0.8rem;
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          white-space: nowrap;
          cursor: pointer;
          transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
        }
        .btn-sm { padding: 0.55rem 1.05rem; font-size: 0.74rem; }
        .lp .btn-sun { background: var(--sun); color: var(--ink); box-shadow: 0 10px 30px -12px rgba(245, 197, 24, 0.9); }
        .lp .btn-sun:hover { background: var(--sun-deep); transform: translateY(-1px); }
        .lp .btn-glass {
          background: rgba(11, 21, 48, 0.28);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.22);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .lp .btn-glass:hover { background: rgba(11, 21, 48, 0.4); }
        .lp .btn-outline { background: #ffffff; color: var(--ink); border-color: var(--line); }
        .lp .btn-outline:hover { border-color: #c9d6ea; }
        .btn-arrow { padding-right: 0.4rem; }
        .btn-arrow-dot {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: var(--ink);
          color: #ffffff;
          transition: transform 0.25s ease;
        }
        .btn-arrow:hover .btn-arrow-dot { transform: rotate(45deg); }

        /* ── Hero shell ── */
        .hero-shell { padding: 12px; }
        .hero {
          position: relative;
          overflow: hidden;
          border-radius: 28px;
          min-height: 840px;
          display: flex;
          flex-direction: column;
          align-items: center;
          isolation: isolate;
        }
        .sky {
          position: absolute;
          inset: 0;
          z-index: -3;
          background:
            radial-gradient(70% 45% at 50% 0%, rgba(255, 255, 255, 0.22), transparent 70%),
            radial-gradient(50% 40% at 80% 20%, rgba(130, 190, 255, 0.45), transparent 70%),
            linear-gradient(180deg, #0f5ad8 0%, #1f74ea 28%, #4597f2 55%, #8cc3f8 78%, #d9ecfd 100%);
        }
        /* Clouds decoupled from mouse cursor - pure serene CSS float */
        .hero-cloud {
          position: absolute;
          z-index: -1;
          pointer-events: none;
        }
        .hc-1 { left: 8%; top: 60px; width: 180px; opacity: 0.55; }
        .hc-2 { right: 10%; top: 120px; width: 150px; opacity: 0.5; }
        .hc-3 { left: -4%; top: 380px; width: min(34vw, 520px); opacity: 0.95; }
        .hc-4 { right: -5%; top: 340px; width: min(32vw, 480px); opacity: 0.95; }
        .float {
          position: relative;
          animation: lpFloat var(--dur, 10s) ease-in-out var(--delay, 0s) infinite alternate;
          will-change: transform;
        }
        .cloud-svg { display: block; width: 100%; height: auto; overflow: visible; }
        .bank { position: absolute; left: 50%; pointer-events: none; }
        .bank-back { width: 160%; bottom: 40px; transform: translateX(-50%); opacity: 0.85; z-index: -1; }
        .bank-front { width: 140%; bottom: -170px; transform: translateX(-48%); z-index: 3; }
        .bank .cloud-svg { animation: lpBank 20s ease-in-out infinite alternate; }

        /* ── Hero copy ── */
        .hero-copy {
          position: relative;
          z-index: 4;
          max-width: 1000px;
          padding: 4.5rem 1.5rem 0;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .hero-title {
          margin: 0 0 1.4rem;
          font-size: clamp(2.5rem, 5.2vw, 4.25rem);
          line-height: 1.04;
          letter-spacing: -0.05em;
          font-weight: 550;
          color: #ffffff;
          text-shadow: 0 2px 30px rgba(11, 40, 110, 0.18);
        }
        .hero-line { display: block; text-wrap: balance; }
        .hero-line-soft { color: rgba(255, 255, 255, 0.72); }
        .hero-sub {
          max-width: 34rem;
          margin: 0 0 2.1rem;
          font-size: 1.02rem;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.86);
          text-wrap: balance;
        }
        .hero-ctas { display: flex; gap: 0.7rem; flex-wrap: wrap; justify-content: center; }
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

        /* ── 3D Card Arc (Pure CSS 3D Transforms, 120 FPS) ── */
        .hero-arc {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 1200px;
          height: 380px;
          margin-top: 1.5rem;
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
          width: 190px;
          height: 140px;
          margin-left: -95px;
          background: #ffffff;
          border-radius: 14px;
          padding: 0.95rem;
          box-shadow: 0 20px 45px -10px rgba(11, 40, 110, 0.28), 0 2px 6px rgba(11, 40, 110, 0.08);
          transform-origin: 50% 380px;
          transform: rotateZ(var(--a)) translateY(-18px) translateZ(calc(120px - abs(var(--i) - 4) * 22px));
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          font-size: 0.72rem;
          color: var(--ink);
          user-select: none;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .arc-card:hover {
          transform: rotateZ(var(--a)) translateY(-32px) translateZ(160px) scale(1.04);
          box-shadow: 0 30px 60px -12px rgba(11, 40, 110, 0.38);
        }
        .arc-card-dark {
          background: var(--ink);
          color: #ffffff;
          box-shadow: 0 22px 50px -10px rgba(0, 0, 0, 0.45);
        }
        .arc-card-glass {
          background: rgba(255, 255, 255, 0.6);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.7);
        }
        .mini-label {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--muted);
          font-weight: 500;
        }
        .mini-big { font-size: 1.4rem; font-weight: 600; letter-spacing: -0.03em; line-height: 1; margin: 0.35rem 0; }
        .mini-text { font-size: 0.7rem; color: var(--muted); }
        .mini-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.68rem; margin: 0.15rem 0; }
        .mini-chip {
          display: inline-block;
          font-size: 0.6rem;
          padding: 0.1rem 0.4rem;
          border-radius: 999px;
          font-weight: 500;
        }
        .mini-chip-ok { background: #dcfce7; color: var(--green); }
        .mini-chip-busy { background: #dbeafe; color: var(--blue); }
        .mini-chart { width: 100%; height: 38px; display: block; margin-top: auto; }
        .mini-log { font-size: 0.6rem; line-height: 1.45; color: var(--muted); margin-top: 0.2rem; }
        .mini-log span { color: var(--faint); }
        .mini-dark-title { font-size: 0.85rem; line-height: 1.35; font-weight: 500; margin: auto 0; }
        .mini-dot { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--sun); vertical-align: middle; margin: 0 0.15rem; }
        .mini-dim { color: rgba(255, 255, 255, 0.55); }
        .mini-plus {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 4px 12px rgba(11, 40, 110, 0.1);
          color: var(--blue);
        }
        .mini-glass-title { font-size: 0.8rem; font-weight: 600; margin-top: 0.4rem; }
        .mini-glass-sub { font-size: 0.68rem; color: var(--muted); }
        .mini-table { font-size: 0.64rem; line-height: 1.4; color: var(--muted); margin-top: 0.25rem; }
        .mini-table span:first-child { color: var(--faint); width: 12px; }
        .mini-bar { height: 4px; border-radius: 2px; background: var(--grey); overflow: hidden; margin-top: 0.35rem; }
        .mini-bar span { display: block; height: 100%; background: var(--blue); }

        .hero-foot {
          position: relative;
          z-index: 4;
          margin-top: auto;
          padding: 1.5rem 1rem 1.8rem;
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.9);
          text-shadow: 0 1px 12px rgba(11, 40, 110, 0.25);
        }

        /* ── Stack marquee (Language Logos) ── */
        .stack {
          padding: 3rem 0 3.5rem;
          border-bottom: 1px solid var(--line);
          background: #ffffff;
          overflow: hidden;
          text-align: center;
        }
        .stack-badge {
          display: inline-block;
          font-size: 0.7rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--blue);
          background: var(--sky-100);
          padding: 0.25rem 0.75rem;
          border-radius: 999px;
          margin-bottom: 1.5rem;
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
          gap: 0.65rem;
          font-size: 0.85rem;
          color: var(--ink);
          font-weight: 500;
          white-space: nowrap;
          padding: 0.55rem 1.15rem;
          border-radius: 999px;
          border: 1px solid var(--line);
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(11, 40, 110, 0.03);
          transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .stack-item:hover {
          transform: translateY(-2px);
          border-color: #cbd5e1;
          box-shadow: 0 4px 12px rgba(11, 40, 110, 0.06);
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
        .stack-tech-name {
          font-weight: 550;
        }

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
        }
        .bento-sky-cloud {
          position: absolute;
          left: 50%;
          top: -20px;
          width: 120%;
          transform: translateX(-50%);
          pointer-events: none;
        }
        .bento-sky-tag {
          font-size: 0.68rem;
          letter-spacing: 0.08em;
          color: rgba(255, 255, 255, 0.8);
          font-weight: 500;
        }
        .bento-sky-card {
          position: relative;
          z-index: 2;
          background: rgba(255, 255, 255, 0.16);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.25);
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
          font-weight: 500;
        }

        .bento-grey {
          background: var(--grey);
          border-radius: 24px;
          padding: 1.75rem;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 340px;
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
        }
        .bento-quote { font-size: 0.82rem; line-height: 1.55; color: var(--ink-2); margin: 0; }

        .bento-col { display: flex; flex-direction: column; gap: 1rem; }
        .bento-sun {
          background: var(--sun);
          border-radius: 24px;
          padding: 1.5rem 1.6rem;
          color: var(--ink);
          flex: 1;
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
        }
        .bento-dark .bento-label { color: var(--faint); margin: 0; }
        .bento-dark .bento-num { color: var(--sun); margin: 0; font-size: 2rem; }

        /* ── Products grid ── */
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
          transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
        }
        .product:hover {
          border-color: #cbd5e1;
          transform: translateY(-2px);
          box-shadow: 0 12px 30px -10px rgba(11, 40, 110, 0.08);
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

        /* ── Deploy window (in How it works) ── */
        .deploy {
          background: #ffffff;
          border: 1px solid var(--line);
          border-radius: 20px;
          box-shadow: 0 20px 50px -15px rgba(11, 40, 110, 0.08);
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
        .log-final { color: var(--green); font-weight: 500; }
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
        }
        .agent-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }
        .agent-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 0.85rem; font-size: 0.82rem; }
        .agent-msg { padding: 0.65rem 0.95rem; border-radius: 12px; }
        .agent-user { background: var(--grey); color: var(--ink); align-self: flex-start; }
        .agent-reply { background: var(--sky-100); color: var(--blue-deep); align-self: flex-start; }
        .agent-calls { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.45rem; }
        .agent-call {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.72rem;
          padding: 0.3rem 0.5rem;
          border-radius: 8px;
          background: var(--sky-50);
          color: var(--ink-2);
        }
        .agent-check { color: var(--green); flex-shrink: 0; }
        .agent-tool { font-weight: 500; }
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
          background: linear-gradient(180deg, #ffffff 0%, var(--sky-50) 100%);
          border-color: #bcd4f5;
          box-shadow: 0 16px 40px -15px rgba(37, 99, 235, 0.15);
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
          border-radius: 28px;
          min-height: 480px;
          padding: 5rem 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: #ffffff;
          isolation: isolate;
        }
        .closing-cloud { position: absolute; pointer-events: none; }
        .cc-l { left: -6%; bottom: -40px; width: min(34vw, 500px); opacity: 0.95; }
        .cc-r { right: -6%; top: -30px; width: min(32vw, 460px); opacity: 0.85; }
        .closing-title {
          font-size: clamp(2.4rem, 4.8vw, 3.8rem);
          line-height: 1.06;
          letter-spacing: -0.05em;
          font-weight: 550;
          margin: 0 0 1rem;
          text-shadow: 0 2px 30px rgba(11, 40, 110, 0.2);
        }
        .closing-sub {
          font-size: 1.05rem;
          color: rgba(255, 255, 255, 0.85);
          margin: 0 0 2rem;
          max-width: 28rem;
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

        /* ── Animations ── */
        @keyframes lpFloat {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(0, -12px, 0); }
        }
        @keyframes lpBank {
          0% { transform: translateX(-50%) translate3d(0, 0, 0); }
          100% { transform: translateX(-50%) translate3d(0, -16px, 0); }
        }
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
