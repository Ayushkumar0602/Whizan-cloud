"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { useAuth } from "@/lib/auth";
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

const STACK = [
  "Next.js", "React", "Vite", "Astro", "Node.js", "Python", "Go",
  "Rust", "Java", "PHP", "Ruby", ".NET", "Docker", "PostgreSQL", "Redis",
];

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

/* ─── Clouds ─────────────────────────────────────────────────────── */

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

// Volumetric-looking cloud: feathered gradient lobes are torn apart by
// fractal noise (feTurbulence + feDisplacementMap) for wispy edges, then
// shaded with a cool underside and a sunlit top.
function PaintedCloud({ shape, seed = 3 }: { shape: keyof typeof CLOUD_SHAPES; seed?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { w, h, lobes } = CLOUD_SHAPES[shape];
  const id = (name: string) => `${name}-${uid}`;
  const k = w / 640; // keeps noise detail consistent across shape sizes

  const ellipses = (fill: string, opts: { dy?: number; scale?: number } = {}) =>
    lobes.map(([cx, cy, rx, ry], i) => (
      <ellipse
        key={i}
        cx={cx}
        cy={cy + (opts.dy ?? 0) * ry}
        rx={rx * (opts.scale ?? 1)}
        ry={ry * (opts.scale ?? 1)}
        fill={fill}
      />
    ));

  const tear = (name: string, freq: number, octaves: number, scale: number, blur: number, s: number) => (
    <filter id={id(name)} x="-30%" y="-40%" width="160%" height="180%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency={freq / k} numOctaves={octaves} seed={s} result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale={scale * k} xChannelSelector="R" yChannelSelector="G" result="torn" />
      <feGaussianBlur in="torn" stdDeviation={blur * k} />
    </filter>
  );

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="cloud-svg" aria-hidden>
      <defs>
        <radialGradient id={id("body")}>
          <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.96" />
          <stop offset="0.78" stopColor="#f3f7fd" stopOpacity="0.55" />
          <stop offset="1" stopColor="#eef4fc" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("shade")} cy="62%">
          <stop offset="0" stopColor="#7d93b8" stopOpacity="0.5" />
          <stop offset="0.6" stopColor="#93a8c9" stopOpacity="0.22" />
          <stop offset="1" stopColor="#a9bad6" stopOpacity="0" />
        </radialGradient>
        {tear("shade", 0.009, 4, 90, 9, seed + 3)}

        {/* Body: torn silhouette, lit like a volume. The noise doubles as a
            height map so a light from above shades each billow. */}
        <filter id={id("lit")} x="-30%" y="-40%" width="160%" height="180%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency={0.011 / k} numOctaves={5} seed={seed} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={130 * k} xChannelSelector="R" yChannelSelector="G" result="torn" />
          <feGaussianBlur in="torn" stdDeviation={0.7 * k} result="shape" />
          <feGaussianBlur in="shape" stdDeviation={16 * k} result="dome" />
          <feTurbulence type="fractalNoise" baseFrequency={0.028 / k} numOctaves={4} seed={seed + 9} result="detail" />
          <feColorMatrix in="detail" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.9 0 0 0 0" result="detailAlpha" />
          <feComposite in="dome" in2="detailAlpha" operator="arithmetic" k1="0" k2="1" k3="0.45" k4="0" result="height" />
          <feDiffuseLighting in="height" surfaceScale={7} diffuseConstant={1.15} lightingColor="#ffffff" result="light">
            <feDistantLight azimuth={-95} elevation={58} />
          </feDiffuseLighting>
          <feComponentTransfer in="light" result="tinted">
            <feFuncR type="linear" slope="0.36" intercept="0.66" />
            <feFuncG type="linear" slope="0.29" intercept="0.72" />
            <feFuncB type="linear" slope="0.17" intercept="0.84" />
          </feComponentTransfer>
          <feComposite in="tinted" in2="shape" operator="in" />
        </filter>
      </defs>

      <g filter={`url(#${id("lit")})`}>{ellipses(`url(#${id("body")})`)}</g>
      <g filter={`url(#${id("shade")})`} opacity="0.32">{ellipses(`url(#${id("shade")})`, { dy: 0.45, scale: 0.7 })}</g>
    </svg>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────── */

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Reveals [data-reveal] elements as they scroll into view
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

// Writes the pointer position into CSS variables for parallax and tilt
function usePointerParallax(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width - 0.5).toFixed(3));
        el.style.setProperty("--my", ((e.clientY - rect.top) / rect.height - 0.5).toFixed(3));
      });
    };
    el.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", onMove);
    };
  }, [ref]);
}

// Minimal JSON highlighting: keys and string values
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

// Shell highlighting: prompt plus the command name
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

// Small product screens arranged on a curved 3D arc around the viewer.
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

/* ─── Page ───────────────────────────────────────────────────────── */

export default function LandingPage() {
  const { user, loading } = useAuth();
  const ctaHref = !loading && user ? "/dashboard" : "/register";
  const ctaLabel = !loading && user ? "Open console" : "Start for free";
  const [devTab, setDevTab] = useState<"cli" | "mcp">("cli");
  const [copied, setCopied] = useState(false);
  const heroRef = useRef<HTMLElement>(null);

  useScrollReveal();
  usePointerParallax(heroRef);

  const copySnippet = () => {
    navigator.clipboard.writeText(devTab === "cli" ? CLI_SNIPPET : MCP_CONFIG);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="lp">
      {/* Hero */}
      <div className="hero-shell">
        <section className="hero" ref={heroRef}>
          <div className="sky" aria-hidden />
          <div className="hero-cloud hc-1" aria-hidden><div className="float" style={cssVars({ "--dur": "14s" })}><PaintedCloud shape="c" seed={11} /></div></div>
          <div className="hero-cloud hc-2" aria-hidden><div className="float" style={cssVars({ "--dur": "16s", "--delay": "-6s" })}><PaintedCloud shape="c" seed={17} /></div></div>
          <div className="hero-cloud hc-3" aria-hidden><div className="float" style={cssVars({ "--dur": "11s" })}><PaintedCloud shape="a" seed={3} /></div></div>
          <div className="hero-cloud hc-4" aria-hidden><div className="float" style={cssVars({ "--dur": "13s", "--delay": "-4s" })}><PaintedCloud shape="b" seed={8} /></div></div>

          {/* Nav */}
          <header className="nav">
            <BrandMark compact className="nav-brand" />
            <nav className="nav-links mono">
              <a href="#why">Why Whizan</a>
              <a href="#products">Products</a>
              <a href="#how">How it works</a>
              <a href="#developers">Developers</a>
              <a href="#plans">Plans</a>
            </nav>
            <div className="nav-cta">
              {user ? (
                <Link href="/dashboard" className="btn btn-sun btn-sm mono">Console</Link>
              ) : (
                <>
                  <Link href="/login" className="nav-signin mono">Sign in</Link>
                  <Link href="/register" className="btn btn-sun btn-sm mono">Get started</Link>
                </>
              )}
            </div>
          </header>

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

      {/* Stack marquee */}
      <section className="stack" aria-label="Supported languages and frameworks">
        <div className="marquee">
          <div className="marquee-track">
            {[0, 1].map(copy => (
              <div key={copy} className="marquee-group" aria-hidden={copy === 1}>
                {STACK.map(name => (
                  <span key={name} className="stack-item">
                    <span className="stack-glyph" />{name}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why */}
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

      {/* Products */}
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

      {/* How it works */}
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

      {/* Developers: CLI and MCP */}
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

      {/* Plans */}
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

      {/* Closing */}
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

      {/* Footer */}
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

      <style>{`
        /* The landing page keeps its own palette so it stays white
           regardless of the dashboard theme setting. */
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
          --mx: 0;
          --my: 0;
          position: relative;
          overflow: hidden;
          border-radius: 28px;
          min-height: 880px;
          display: flex;
          flex-direction: column;
          align-items: center;
          isolation: isolate;
        }
        .sky {
          position: absolute;
          inset: 0;
          z-index: -2;
          background:
            radial-gradient(70% 45% at 50% 0%, rgba(255, 255, 255, 0.22), transparent 70%),
            radial-gradient(50% 40% at 80% 20%, rgba(130, 190, 255, 0.45), transparent 70%),
            linear-gradient(180deg, #0f5ad8 0%, #1f74ea 28%, #4597f2 55%, #8cc3f8 78%, #d9ecfd 100%);
        }
        .hero-cloud {
          position: absolute;
          z-index: -1;
          pointer-events: none;
          transform: translate3d(calc(var(--mx) * var(--depth, 20px)), calc(var(--my) * var(--depth, 20px)), 0);
          transition: transform 0.6s cubic-bezier(0.2, 0.7, 0.2, 1);
        }
        .hc-1 { left: 8%; top: 120px; width: 180px; opacity: 0.55; --depth: -10px; }
        .hc-2 { right: 10%; top: 210px; width: 150px; opacity: 0.5; --depth: -12px; }
        .hc-3 { left: -4%; top: 440px; width: min(34vw, 520px); opacity: 0.95; --depth: -30px; }
        .hc-4 { right: -5%; top: 400px; width: min(32vw, 480px); opacity: 0.95; --depth: -26px; }
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

        /* ── Nav ── */
        .nav {
          position: relative;
          z-index: 5;
          width: 100%;
          max-width: 1240px;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 1rem;
          padding: 1.1rem 1.75rem;
        }
        .lp .nav-brand .brand-logo-img { filter: brightness(0) invert(1); }
        .nav-links { display: flex; gap: 2rem; }
        .nav-links a {
          font-size: 0.74rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.85);
          transition: color 0.15s ease;
        }
        .nav-links a:hover { color: #ffffff; }
        .nav-cta { display: flex; justify-content: flex-end; align-items: center; gap: 1.1rem; }
        .nav-signin {
          font-size: 0.74rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.9);
        }
        .nav-signin:hover { color: #ffffff; }

        /* ── Hero copy ── */
        .hero-copy {
          position: relative;
          z-index: 4;
          max-width: 1000px;
          padding: 4rem 1.5rem 0;
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
        .hero-line-soft { color: rgba(255, 255, 255, 0.68); }
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
          animation: lpFadeUp 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
          animation-delay: var(--d, 0ms);
        }

        /* ── Card arc ── */
        .hero-arc { position: relative; z-index: 2; width: 100%; margin-top: 3rem; }
        .arc {
          position: relative;
          height: 250px;
          perspective: 1500px;
          perspective-origin: 50% 40%;
        }
        .arc-tilt {
          position: absolute;
          inset: 0;
          transform-style: preserve-3d;
          transform: rotateY(calc(var(--mx) * 10deg)) rotateX(calc(var(--my) * -6deg));
          transition: transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1);
        }
        .arc-sway {
          position: absolute;
          inset: 0;
          transform-style: preserve-3d;
          animation: lpSway 14s ease-in-out infinite alternate;
        }
        .arc-card {
          --r: 1150px;
          position: absolute;
          left: 50%;
          top: 10px;
          width: 152px;
          min-height: 178px;
          margin-left: -76px;
          padding: 0.85rem;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 24px 50px -24px rgba(8, 38, 110, 0.55), 0 2px 6px rgba(8, 38, 110, 0.12);
          transform: translateZ(var(--r)) rotateY(var(--a)) translateZ(calc(var(--r) * -1));
          backface-visibility: hidden;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          color: var(--ink);
          font-size: 0.7rem;
        }
        .arc-card-dark { background: #0b1530; color: #ffffff; justify-content: flex-end; }
        .arc-card-glass {
          background: linear-gradient(160deg, rgba(37, 99, 235, 0.85), rgba(20, 80, 200, 0.7));
          border: 1px solid rgba(255, 255, 255, 0.35);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: #ffffff;
          align-items: center;
          justify-content: center;
          text-align: center;
        }
        .mini-label {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.66rem;
          font-weight: 600;
          color: var(--muted);
          margin-bottom: 0.2rem;
        }
        .mini-big { font-size: 1.35rem; font-weight: 600; letter-spacing: -0.03em; }
        .mini-mono { font-family: var(--font-geist-mono), ui-monospace, monospace; }
        .mini-text { color: var(--ink-2); }
        .mini-row { display: flex; justify-content: space-between; align-items: center; padding: 0.22rem 0; border-bottom: 1px solid #eef2f8; }
        .mini-row:last-child { border-bottom: none; }
        .mini-chip {
          align-self: flex-start;
          display: inline-flex;
          padding: 0.12rem 0.45rem;
          border-radius: 999px;
          font-size: 0.6rem;
          font-weight: 600;
        }
        .mini-chip-ok { background: #ecfdf3; color: var(--green); }
        .mini-chip-busy { background: #eff6ff; color: var(--blue); }
        .mini-chart { width: 100%; height: auto; margin-top: auto; }
        .mini-log { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.6rem; color: var(--ink-2); white-space: nowrap; }
        .mini-log span { color: var(--faint); margin-right: 0.3rem; }
        .mini-table { font-size: 0.62rem; color: var(--ink-2); }
        .mini-bar { height: 6px; border-radius: 999px; background: var(--sky-100); overflow: hidden; margin-top: auto; }
        .mini-bar span { display: block; height: 100%; border-radius: 999px; background: var(--blue); }
        .mini-dark-title { font-size: 0.95rem; line-height: 1.3; font-weight: 500; letter-spacing: -0.02em; }
        .mini-dot { display: inline-block; width: 9px; height: 9px; margin: 0 0.15rem; border-radius: 50%; background: var(--sun); box-shadow: 0 0 0 3px rgba(255, 216, 77, 0.3); }
        .mini-dim { color: rgba(255, 255, 255, 0.55); }
        .mini-plus {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #ffffff;
          color: var(--blue);
          margin-bottom: 0.5rem;
          box-shadow: 0 6px 20px -6px rgba(11, 21, 48, 0.4);
        }
        .mini-glass-title { font-size: 0.95rem; font-weight: 600; }
        .mini-glass-sub { font-size: 0.7rem; color: rgba(255, 255, 255, 0.8); }

        .hero-foot {
          position: relative;
          z-index: 4;
          margin: 1.75rem 0 7rem;
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(11, 21, 48, 0.6);
        }

        /* ── Stack marquee ── */
        .stack { padding: 2.25rem 0 1rem; }
        .marquee {
          overflow: hidden;
          -webkit-mask-image: linear-gradient(to right, transparent, #000 10%, #000 90%, transparent);
          mask-image: linear-gradient(to right, transparent, #000 10%, #000 90%, transparent);
        }
        .marquee-track { display: flex; width: max-content; animation: lpMarquee 44s linear infinite; }
        .marquee:hover .marquee-track { animation-play-state: paused; }
        .marquee-group { display: flex; }
        .stack-item {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0.5rem 2rem;
          font-size: 1.05rem;
          font-weight: 600;
          color: #a3adbd;
          white-space: nowrap;
        }
        .stack-glyph { width: 18px; height: 18px; border-radius: 6px; background: linear-gradient(135deg, #c7d2e2, #e3e9f2); }

        /* ── Sections ── */
        .section { max-width: 1200px; margin: 0 auto; padding: 7rem 1.5rem 1rem; }
        .eyebrow {
          font-size: 0.72rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-2);
        }
        .section-head { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 1.1rem; margin-bottom: 3.5rem; }
        .section-title {
          margin: 0;
          max-width: 44rem;
          font-size: clamp(2rem, 4vw, 3.1rem);
          line-height: 1.08;
          letter-spacing: -0.045em;
          font-weight: 550;
          text-wrap: balance;
        }
        .section-sub { margin: 1rem 0 0; font-size: 1.02rem; line-height: 1.65; color: var(--muted); }

        .lp [data-reveal] {
          opacity: 0;
          transform: translateY(18px);
          transition: opacity 0.8s cubic-bezier(0.2, 0.7, 0.2, 1), transform 0.8s cubic-bezier(0.2, 0.7, 0.2, 1);
          transition-delay: var(--d, 0ms);
        }
        .lp [data-reveal].is-in { opacity: 1; transform: none; }

        /* ── Why ── */
        .why-head { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 1.4rem; margin-bottom: 3.5rem; }
        .why-title {
          margin: 0;
          max-width: 52rem;
          font-size: clamp(2rem, 4.2vw, 3.3rem);
          line-height: 1.12;
          letter-spacing: -0.045em;
          font-weight: 550;
          text-wrap: balance;
        }
        .why-soft { color: #9aa6b8; }
        .nowrap { white-space: nowrap; }
        .inline-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.05em;
          height: 1.05em;
          border-radius: 50%;
          vertical-align: -0.12em;
          margin: 0 0.04em;
        }
        .badge-blue { background: #38bdf8; color: #ffffff; }
        .badge-sun { background: var(--sun); color: var(--ink); }

        .bento {
          display: grid;
          grid-template-columns: 1fr 1.2fr 1.05fr;
          gap: 1rem;
          min-height: 400px;
        }
        .bento > *, .bento-col > * { border-radius: 24px; overflow: hidden; position: relative; }
        .bento-label { font-size: 0.85rem; color: inherit; opacity: 0.75; }
        .bento-num { font-size: clamp(2.4rem, 4vw, 3.4rem); font-weight: 500; letter-spacing: -0.05em; line-height: 1; }
        .bento-text { margin: 0; font-size: 0.9rem; line-height: 1.5; }

        .bento-sky {
          background: linear-gradient(180deg, #1f74ea 0%, #5aa6f5 60%, #bfe0fc 100%);
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          padding: 1rem;
          min-height: 400px;
        }
        .bento-sky-cloud { position: absolute; left: -15%; top: 18%; width: 130%; opacity: 0.95; }
        .bento-sky-tag {
          position: absolute;
          top: 1.2rem;
          left: 1.3rem;
          font-size: 0.85rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          color: #ffffff;
        }
        .bento-sky-card {
          position: relative;
          background: #ffffff;
          border-radius: 18px;
          padding: 1.4rem;
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
          color: var(--ink);
        }
        .bento-sky-card .bento-text { color: var(--ink-2); }

        .bento-grey {
          background: var(--grey);
          padding: 1.6rem;
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }
        .bento-grey-foot { margin-top: auto; display: flex; flex-direction: column; gap: 1rem; }
        .runtime-stack { display: flex; }
        .runtime-dot {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          margin-left: -8px;
          border-radius: 50%;
          border: 3px solid var(--grey);
          background: #ffffff;
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--blue);
        }
        .runtime-dot:first-child { margin-left: 0; }
        .bento-quote { margin: 0; font-size: 0.98rem; line-height: 1.5; color: var(--ink); }

        .bento-col { display: grid; grid-template-rows: 1.4fr 0.6fr; gap: 1rem; }
        .bento-sun {
          background: var(--sun);
          padding: 1.6rem;
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }
        .bento-sun .bento-text { margin-top: auto; }
        .bento-dark {
          background: var(--ink);
          color: #ffffff;
          padding: 1.4rem 1.6rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .bento-dark .bento-num { font-size: 2.2rem; }

        /* ── Products ── */
        .products { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; }
        .product {
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          border-radius: 22px;
          background: var(--grey);
          transition: background 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
        }
        .product:hover { background: #ffffff; transform: translateY(-3px); box-shadow: 0 30px 60px -36px rgba(37, 99, 235, 0.45), 0 0 0 1px var(--line); }
        .product-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2.2rem; }
        .product-icon {
          width: 42px;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: #ffffff;
          color: var(--blue);
        }
        .product-go {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: var(--ink);
          color: #ffffff;
          opacity: 0;
          transform: scale(0.7);
          transition: all 0.25s ease;
        }
        .product:hover .product-go { opacity: 1; transform: none; }
        .product-name { font-size: 1.08rem; font-weight: 600; letter-spacing: -0.02em; }
        .product-tagline { margin-top: 0.2rem; font-size: 0.8rem; color: var(--faint); }
        .product-desc { margin: 0.9rem 0 0; font-size: 0.9rem; line-height: 1.55; color: var(--muted); }

        /* ── How it works ── */
        .how { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: 3.5rem; align-items: center; margin-bottom: 3rem; }
        .how-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
        .how-step { display: flex; gap: 1.4rem; padding: 1.4rem 0; border-bottom: 1px solid var(--line); }
        .how-step:first-child { padding-top: 0; }
        .how-num { font-size: 0.8rem; color: var(--blue); padding-top: 0.25rem; }
        .how-title { font-size: 1.15rem; font-weight: 600; letter-spacing: -0.02em; }
        .how-body { margin: 0.35rem 0 0; font-size: 0.94rem; line-height: 1.55; color: var(--muted); }

        .deploy {
          background: #ffffff;
          border: 1px solid var(--line);
          border-radius: 22px;
          overflow: hidden;
          box-shadow: 0 40px 80px -45px rgba(11, 21, 48, 0.4);
        }
        .deploy-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.95rem 1.2rem;
          border-bottom: 1px solid var(--line);
        }
        .deploy-title { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
        .deploy-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 8px;
          background: var(--sky-100);
          color: var(--blue);
        }
        .deploy-name { font-weight: 600; font-size: 0.92rem; }
        .deploy-ref { font-size: 0.75rem; color: var(--muted); white-space: nowrap; }
        .deploy-meta { display: flex; align-items: center; gap: 0.75rem; }
        .deploy-time { font-size: 0.75rem; color: var(--muted); }
        .deploy-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0.22rem 0.65rem;
          border: 1px solid;
          border-radius: 999px;
          transition: all 0.3s ease;
        }
        .pill-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .pill-queued { color: #b45309; background: #fffbeb; border-color: #fde68a; }
        .pill-building { color: var(--blue); background: #eff6ff; border-color: #bfdbfe; }
        .pill-building .pill-dot { animation: lpPulse 1s ease-in-out infinite; }
        .pill-ready { color: var(--green); background: #f0fdf4; border-color: #bbf7d0; }
        .deploy-steps {
          list-style: none;
          margin: 0;
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 0.6rem;
          padding: 1rem 1.2rem 0.95rem;
          border-bottom: 1px solid var(--line);
        }
        .deploy-step { display: flex; flex-direction: column; gap: 0.45rem; min-width: 0; }
        .step-label { font-size: 0.72rem; font-weight: 500; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: color 0.3s ease; }
        .step-bar { position: relative; height: 4px; border-radius: 999px; background: var(--sky-100); overflow: hidden; }
        .step-bar span {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: var(--blue);
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.5s cubic-bezier(0.2, 0.7, 0.2, 1);
        }
        .step-done .step-label, .step-active .step-label { color: var(--ink); }
        .step-done .step-bar span { transform: scaleX(1); }
        .step-active .step-bar span { animation: lpIndeterminate 1.1s ease-in-out infinite; }
        .deploy-log {
          background: var(--sky-50);
          padding: 0.95rem 1.2rem;
          height: calc(7 * 1.75em + 1.9rem);
          font-size: 0.78rem;
          line-height: 1.75;
          color: var(--ink-2);
          overflow: hidden;
        }
        .log-row { display: flex; gap: 0.9rem; animation: lpLogIn 0.35s ease-out; }
        .log-row > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .log-ts { color: var(--faint); flex-shrink: 0; }
        .log-final { color: var(--green); font-weight: 600; }
        .log-caret { display: inline-block; width: 7px; height: 1em; background: var(--ink); vertical-align: middle; animation: lpBlink 1s steps(1) infinite; }

        .facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; }
        .fact { padding: 1.5rem; border-radius: 22px; background: var(--grey); }
        .fact-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #ffffff;
          color: var(--blue);
          margin-bottom: 1rem;
        }
        .fact-title { font-size: 0.96rem; font-weight: 600; }
        .fact-body { margin: 0.35rem 0 0; font-size: 0.87rem; line-height: 1.55; color: var(--muted); }

        /* ── Developers ── */
        .dev { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4rem; align-items: center; }
        .dev .eyebrow { display: block; margin-bottom: 1.1rem; }
        .dev .section-title { text-align: left; }
        .code { margin-top: 2rem; border-radius: 22px; background: var(--grey); overflow: hidden; }
        .code-head { display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 0.7rem 0.55rem 0.55rem; }
        .code-tabs { display: flex; gap: 0.25rem; }
        .code-tab {
          background: transparent;
          border: none;
          border-radius: 999px;
          color: var(--muted);
          font-size: 0.76rem;
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          padding: 0.35rem 0.85rem;
          cursor: pointer;
          transition: color 0.15s ease, background 0.15s ease;
        }
        .code-tab:hover { color: var(--ink); }
        .code-tab.active { background: #ffffff; color: var(--ink); }
        .code-copy {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          background: #ffffff;
          border: none;
          border-radius: 999px;
          color: var(--ink);
          font-size: 0.74rem;
          font-family: inherit;
          padding: 0.32rem 0.75rem;
          cursor: pointer;
        }
        .code-body {
          margin: 0;
          padding: 0.6rem 1.3rem 1.3rem;
          min-height: 15rem;
          font-size: 0.78rem;
          line-height: 1.7;
          color: var(--ink-2);
          overflow-x: auto;
          background: transparent;
          border: none;
        }
        .tok-key { color: var(--blue); }
        .tok-str { color: #047857; }
        .tok-prompt { color: var(--faint); }

        .agent {
          border-radius: 24px;
          background: linear-gradient(180deg, #1f74ea 0%, #5aa6f5 100%);
          padding: 1.1rem;
          box-shadow: 0 40px 80px -45px rgba(37, 99, 235, 0.7);
        }
        .agent-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.2rem 0.4rem 0.9rem; font-size: 0.76rem; color: rgba(255, 255, 255, 0.85); }
        .agent-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--sun); }
        .agent-body { background: #ffffff; border-radius: 18px; padding: 1.2rem; display: flex; flex-direction: column; gap: 1rem; }
        .agent-msg { font-size: 0.92rem; line-height: 1.5; }
        .agent-user { align-self: flex-end; background: var(--ink); color: #ffffff; padding: 0.6rem 0.95rem; border-radius: 16px 16px 4px 16px; }
        .agent-calls { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; border-radius: 14px; background: var(--grey); overflow: hidden; }
        .agent-call {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 0.65rem;
          padding: 0.6rem 0.85rem;
          font-size: 0.76rem;
          border-bottom: 1px solid #e6eaf0;
        }
        .agent-call:last-child { border-bottom: none; }
        .agent-check { color: var(--green); }
        .agent-tool { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .agent-result { color: var(--muted); white-space: nowrap; }
        .agent-reply { align-self: flex-start; color: var(--ink); background: var(--sun); padding: 0.6rem 0.95rem; border-radius: 16px 16px 16px 4px; }
        .agent-call, .agent-reply {
          opacity: 0;
          transform: translateX(-6px);
          transition: opacity 0.4s ease, transform 0.4s ease;
          transition-delay: calc(var(--i) * 0.32s + 0.5s);
        }
        .agent.is-in .agent-call, .agent.is-in .agent-reply { opacity: 1; transform: none; }

        /* ── Plans ── */
        .plans { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; max-width: 980px; margin: 0 auto; }
        .plan { display: flex; flex-direction: column; padding: 2.3rem; border-radius: 26px; background: var(--grey); }
        .plan-pro { background: var(--ink); color: #ffffff; }
        .plan-name { font-size: 0.86rem; font-weight: 600; opacity: 0.7; }
        .plan-price { margin-top: 0.5rem; font-size: 2.4rem; font-weight: 550; letter-spacing: -0.045em; }
        .plan-list { list-style: none; margin: 1.75rem 0 2.2rem; padding: 0; display: flex; flex-direction: column; gap: 0.8rem; flex: 1; }
        .plan-list li { position: relative; padding-left: 1.6rem; font-size: 0.94rem; line-height: 1.5; opacity: 0.88; }
        .plan-list li::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0.4em;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--blue);
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }
        .plan-pro .plan-list li::before { background: var(--sun); box-shadow: 0 0 0 3px rgba(255, 216, 77, 0.2); }
        .plan-btn { align-self: flex-start; }

        /* ── Closing ── */
        .closing-shell { padding: 7rem 12px 0; }
        .closing {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          border-radius: 28px;
          padding: 8rem 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .closing-cloud { position: absolute; z-index: -1; pointer-events: none; }
        .cc-l { left: -5%; bottom: -14%; width: min(40vw, 560px); }
        .cc-r { right: -6%; top: 6%; width: min(30vw, 400px); opacity: 0.85; }
        .closing-title {
          margin: 0;
          font-size: clamp(2.4rem, 5.2vw, 4.2rem);
          line-height: 1.05;
          letter-spacing: -0.05em;
          font-weight: 550;
          color: #ffffff;
          text-wrap: balance;
          text-shadow: 0 2px 30px rgba(11, 40, 110, 0.18);
        }
        .closing-sub { margin: 1.2rem 0 2.2rem; font-size: 1.05rem; color: rgba(255, 255, 255, 0.86); }

        /* ── Footer ── */
        .footer { max-width: 1200px; margin: 0 auto; padding: 4.5rem 1.5rem 3rem; display: grid; grid-template-columns: 1fr auto; gap: 2.5rem 4rem; }
        .footer-tag { margin: 0.85rem 0 0; font-size: 0.88rem; color: var(--muted); max-width: 22rem; }
        .footer-cols { display: flex; gap: 4rem; }
        .footer-col { display: flex; flex-direction: column; gap: 0.6rem; }
        .footer-head { font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--faint); margin-bottom: 0.35rem; }
        .footer-col a { font-size: 0.88rem; color: var(--ink-2); transition: color 0.15s ease; }
        .footer-col a:hover { color: var(--blue); }
        .footer-copy { grid-column: 1 / -1; padding-top: 1.5rem; border-top: 1px solid var(--line); font-size: 0.8rem; color: var(--faint); }

        /* ── Keyframes ── */
        @keyframes lpFadeUp { to { opacity: 1; transform: none; filter: blur(0); } }
        @keyframes lpFloat { 0% { transform: translate3d(0, 0, 0); } 100% { transform: translate3d(14px, -14px, 0); } }
        @keyframes lpBank { 0% { transform: translateX(-1.5%); } 100% { transform: translateX(1.5%); } }
        @keyframes lpSway { 0% { transform: rotateY(-4deg); } 100% { transform: rotateY(4deg); } }
        @keyframes lpLogIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @keyframes lpBlink { 50% { opacity: 0; } }
        @keyframes lpPulse { 50% { opacity: 0.35; } }
        @keyframes lpIndeterminate { 0% { transform: translateX(-100%) scaleX(0.4); } 100% { transform: translateX(250%) scaleX(0.4); } }
        @keyframes lpMarquee { to { transform: translateX(-50%); } }

        /* ── Responsive ── */
        @media (max-width: 1100px) {
          .products { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .nav-links { gap: 1.2rem; }
          .bento { grid-template-columns: 1fr 1fr; }
          .bento-col { grid-column: 1 / -1; grid-template-rows: auto; grid-template-columns: 1.4fr 0.6fr; }
        }
        @media (max-width: 1000px) {
          .how, .dev { grid-template-columns: 1fr; gap: 3rem; }
          .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .arc { transform: scale(0.82); transform-origin: 50% 0; }
        }
        @media (max-width: 860px) {
          .nav { grid-template-columns: 1fr auto; }
          .nav-links { display: none; }
        }
        @media (max-width: 640px) {
          .hero-shell, .closing-shell { padding-left: 8px; padding-right: 8px; }
          .hero { min-height: 0; border-radius: 22px; }
          .nav { padding: 0.9rem 1rem; }
          .nav-signin { display: none; }
          .hero-copy { padding-top: 3rem; }
          .hero-arc { margin-top: 2.5rem; }
          .arc { height: 210px; transform: scale(0.62); transform-origin: 50% 0; }
          .arc-card:nth-child(1), .arc-card:nth-child(9) { display: none; }
          .hero-foot { margin: 0 0 5rem; text-align: center; padding: 0 1rem; }
          .hc-1, .hc-2 { display: none; }
          .hc-3 { width: 70vw; left: -25%; top: 55%; }
          .hc-4 { width: 65vw; right: -25%; top: 50%; }
          .bank-back { width: 320%; }
          .bank-front { width: 280%; bottom: -40px; }
          .section { padding: 5rem 1.25rem 1rem; }
          .why-title { font-size: 1.75rem; }
          .bento { grid-template-columns: 1fr; }
          .bento-col { grid-template-columns: 1fr; }
          .bento-sky { min-height: 340px; }
          .products, .facts, .plans { grid-template-columns: 1fr; }
          .plan { padding: 1.8rem; }
          .deploy-ref { display: none; }
          .step-label { font-size: 0.64rem; }
          .closing { padding: 5.5rem 1.25rem; border-radius: 22px; }
          .cc-l { width: 80vw; left: -30%; }
          .cc-r { width: 55vw; right: -25%; }
          .footer { grid-template-columns: 1fr; }
          .footer-cols { gap: 2.5rem; flex-wrap: wrap; }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-fade { animation: none; opacity: 1; transform: none; filter: none; }
          .float, .bank .cloud-svg, .marquee-track, .arc-sway { animation: none; }
          .hero-cloud, .arc-tilt { transition: none; transform: none; }
          .lp [data-reveal] { opacity: 1; transform: none; transition: none; }
          .agent-call, .agent-reply { opacity: 1; transform: none; transition: none; }
          .log-row { animation: none; }
          .product, .btn { transition: none; }
        }
      `}</style>
    </div>
  );
}
