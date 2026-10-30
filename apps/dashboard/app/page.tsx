"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { Instrument_Serif } from "next/font/google";
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
  GitBranch,
  Copy,
  Check,
  X
} from "lucide-react";

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif-display",
});

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
  "Rust", "Java", "PHP", "Ruby", "Docker", "PostgreSQL", "Redis",
];

const PROBLEMS = [
  {
    title: "Too many dashboards",
    body: "Frontend on one host, the API on another, the database somewhere else. Each with its own login and bill.",
  },
  {
    title: "Releases that break things",
    body: "A bad deploy takes the site down, and you find out from your users while you scramble to roll back.",
  },
  {
    title: "Setup before shipping",
    body: "Dockerfiles, YAML and DNS records stand between you and the first request your app serves.",
  },
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

/* ─── Watercolor clouds ──────────────────────────────────────────── */

type Puff = [number, number, number];

const CLOUD_SHAPES: Record<"a" | "b" | "c" | "bank", { w: number; h: number; base: number; puffs: Puff[] }> = {
  a: {
    w: 520, h: 300, base: 252,
    puffs: [[150, 186, 80], [238, 140, 100], [336, 160, 86], [408, 200, 60], [96, 212, 52], [262, 206, 90], [190, 220, 66], [352, 222, 64]],
  },
  b: {
    w: 520, h: 300, base: 250,
    puffs: [[130, 200, 66], [210, 150, 86], [300, 124, 98], [392, 172, 78], [452, 214, 46], [252, 210, 84], [352, 220, 70], [84, 224, 42]],
  },
  c: {
    w: 360, h: 200, base: 168,
    puffs: [[96, 128, 48], [160, 96, 64], [236, 112, 54], [292, 140, 36], [180, 136, 56], [60, 146, 30]],
  },
  bank: {
    w: 1400, h: 260, base: 300,
    puffs: [
      [40, 190, 90], [150, 160, 110], [280, 175, 95], [400, 150, 120], [540, 180, 100], [680, 160, 115],
      [820, 185, 95], [960, 155, 120], [1100, 180, 100], [1230, 160, 110], [1360, 190, 90],
      [90, 235, 90], [330, 235, 100], [600, 238, 110], [880, 235, 100], [1150, 238, 105], [1330, 240, 80],
    ],
  },
};

// Painterly cloud drawn with SVG filters: rough pigment edges,
// a soft blue belly, white highlights and paper grain.
function WatercolorCloud({ shape, seed = 3 }: { shape: keyof typeof CLOUD_SHAPES; seed?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { w, h, base, puffs } = CLOUD_SHAPES[shape];
  const id = (name: string) => `${name}-${uid}`;
  const circles = (extra: { dx?: number; dy?: number; scale?: number; inset?: number } = {}) =>
    puffs.map(([cx, cy, r], i) => (
      <circle
        key={i}
        cx={cx + (extra.dx ?? 0)}
        cy={cy + (extra.dy ?? 0)}
        r={Math.max(0, r * (extra.scale ?? 1) - (extra.inset ?? 0))}
      />
    ));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="wc-cloud" aria-hidden>
      <defs>
        <clipPath id={id("cut")}>
          <rect x="0" y="0" width={w} height={base} />
        </clipPath>
        <clipPath id={id("shape")}>{circles()}</clipPath>
        <radialGradient id={id("body")} cx="45%" cy="25%" r="80%">
          <stop offset="0" stopColor="#f7faff" />
          <stop offset="0.45" stopColor="#d9e7ff" />
          <stop offset="0.8" stopColor="#a9c6f7" />
          <stop offset="1" stopColor="#7fa6ee" />
        </radialGradient>
        <filter id={id("rough")} x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="3" seed={seed} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="20" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id={id("soft")} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <filter id={id("grain")}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={seed + 7} />
          <feColorMatrix type="matrix" values="0 0 0 0 0.15  0 0 0 0 0.3  0 0 0 0 0.75  0 0 0 0.9 -0.35" />
        </filter>
      </defs>

      <g filter={`url(#${id("rough")})`}>
        <g clipPath={`url(#${id("cut")})`}>
          {/* Pigment pooled at the outer edge, then the body painted just inside it */}
          <g fill="#8db0ef" opacity="0.85">{circles()}</g>
          <g fill={`url(#${id("body")})`}>{circles({ inset: 3.5 })}</g>

          {/* Blue belly shading pooled at the bottom */}
          <g clipPath={`url(#${id("shape")})`}>
            <g fill="#5d8ce8" opacity="0.32" filter={`url(#${id("soft")})`}>{circles({ dx: 6, dy: 34, scale: 0.92 })}</g>
            <rect x="0" y="0" width={w} height={h} filter={`url(#${id("grain")})`} opacity="0.22" />
            {/* Highlights where light hits the tops */}
            <g fill="#ffffff" opacity="0.75" filter={`url(#${id("soft")})`}>{circles({ dx: -10, dy: -30, scale: 0.55 })}</g>
          </g>

        </g>
      </g>
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

// Writes the pointer position into CSS variables for cloud parallax
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
  const [bannerOpen, setBannerOpen] = useState(true);
  const heroRef = useRef<HTMLElement>(null);

  useScrollReveal();
  usePointerParallax(heroRef);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("wz-cli-banner") === "closed") setBannerOpen(false);
    } catch {}
  }, []);

  const closeBanner = () => {
    setBannerOpen(false);
    try { sessionStorage.setItem("wz-cli-banner", "closed"); } catch {}
  };

  const copySnippet = () => {
    navigator.clipboard.writeText(devTab === "cli" ? CLI_SNIPPET : MCP_CONFIG);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`lp ${serif.variable}`}>
      {/* Announcement */}
      {bannerOpen && (
        <div className="banner">
          <span>
            The Whizan CLI is here. Deploy from your terminal with <code className="mono">whizan deploy</code>.{" "}
            <Link href="/docs" className="banner-link">Read the docs</Link>
          </span>
          <button type="button" className="banner-close" onClick={closeBanner} aria-label="Dismiss announcement">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Nav */}
      <header className="lp-nav-wrap">
        <div className="lp-nav">
          <BrandMark compact />
          <nav className="lp-nav-links">
            <a href="#problem">Why Whizan</a>
            <a href="#products">Products</a>
            <a href="#how">How it works</a>
            <a href="#developers">Developers</a>
            <a href="#plans">Plans</a>
          </nav>
          <div className="lp-nav-cta">
            {user ? (
              <Link href="/dashboard" className="lp-btn lp-btn-primary lp-btn-sm">
                Console <ArrowRight size={14} />
              </Link>
            ) : (
              <>
                <Link href="/login" className="lp-btn lp-btn-ghost lp-btn-sm">Sign in</Link>
                <Link href="/register" className="lp-btn lp-btn-primary lp-btn-sm">Get started</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="hero" ref={heroRef}>
        <div className="sky" aria-hidden />

        <div className="hero-cloud hero-cloud-far-l" aria-hidden><div className="float" style={cssVars({ "--dur": "13s" })}><WatercolorCloud shape="c" seed={11} /></div></div>
        <div className="hero-cloud hero-cloud-far-r" aria-hidden><div className="float" style={cssVars({ "--dur": "15s", "--delay": "-4s" })}><WatercolorCloud shape="c" seed={17} /></div></div>

        <div className="hero-cloud hero-cloud-left">
          <div className="float" style={cssVars({ "--dur": "9s" })}>
            <WatercolorCloud shape="a" seed={3} />
            <div className="cloud-chip chip-left mono">
              <GitBranch size={12} /> git push · main
            </div>
          </div>
        </div>
        <div className="hero-cloud hero-cloud-right">
          <div className="float" style={cssVars({ "--dur": "11s", "--delay": "-3s" })}>
            <WatercolorCloud shape="b" seed={8} />
            <div className="cloud-chip chip-right mono">
              <span className="chip-dot" /> api-gateway is live
            </div>
          </div>
        </div>

        <div className="hero-copy">
          <div className="pill-label hero-fade" style={cssVars({ "--d": "0ms" })}>
            <span className="pill-label-dot" /> The Hobby plan is free
          </div>
          <h1 className="hero-title">
            <span className="hero-line hero-fade" style={cssVars({ "--d": "120ms" })}>Shipping to the cloud</span>
            <span className="hero-line hero-serif hero-fade" style={cssVars({ "--d": "260ms" })}>shouldn&apos;t feel stormy.</span>
          </h1>
          <p className="hero-sub hero-fade" style={cssVars({ "--d": "420ms" })}>
            Whizan hosts your frontends, APIs, functions, databases and storage in one place,
            and every release goes live only after it passes a health check.
          </p>
          <div className="hero-ctas hero-fade" style={cssVars({ "--d": "540ms" })}>
            <Link href={ctaHref} className="lp-btn lp-btn-primary lp-btn-lg" id="hero-cta-btn">
              {ctaLabel} <ArrowRight size={16} />
            </Link>
            <a href="#how" className="lp-btn lp-btn-secondary lp-btn-lg">
              See how it works
            </a>
          </div>
        </div>

        <div className="hero-stage hero-fade" style={cssVars({ "--d": "700ms" })}>
          <div className="bank bank-back" aria-hidden><WatercolorCloud shape="bank" seed={21} /></div>
          <DeployPreview />
          <div className="bank bank-front" aria-hidden><WatercolorCloud shape="bank" seed={5} /></div>
        </div>
      </section>

      {/* Stack marquee */}
      <section className="stack" aria-label="Supported languages and frameworks">
        <div className="pill-label">Runs your stack</div>
        <div className="marquee">
          <div className="marquee-track">
            {[0, 1].map(copy => (
              <div key={copy} className="marquee-group" aria-hidden={copy === 1}>
                {STACK.map(name => (
                  <span key={name} className="stack-item">{name}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem */}
      <section id="problem" className="section section-center">
        <div className="section-head" data-reveal>
          <div className="pill-label">The problem</div>
          <h2 className="section-title">
            Your app is simple. <span className="serif-accent">Hosting it rarely is.</span>
          </h2>
        </div>

        <div className="problems">
          {PROBLEMS.map((p, i) => (
            <div key={p.title} className="problem" data-reveal style={cssVars({ "--d": `${i * 100}ms` })}>
              <span className="problem-index mono">0{i + 1}</span>
              <h3 className="problem-title">{p.title}</h3>
              <p className="problem-body">{p.body}</p>
            </div>
          ))}
        </div>

        <p className="answer" data-reveal>
          Whizan keeps all of it in <span className="serif-accent">one calm console.</span>
        </p>
      </section>

      {/* Products */}
      <section id="products" className="section">
        <div className="section-head section-head-center" data-reveal>
          <div className="pill-label">The platform</div>
          <h2 className="section-title">
            Everything your app runs on, <span className="serif-accent">under one sky.</span>
          </h2>
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
                <span className="product-icon"><Icon size={18} /></span>
                <div className="product-name">
                  {p.name}
                  <ArrowUpRight size={16} className="product-arrow" />
                </div>
                <div className="product-tagline">{p.tagline}</div>
                <p className="product-desc">{p.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="section">
        <div className="section-head section-head-center" data-reveal>
          <div className="pill-label">How it works</div>
          <h2 className="section-title">
            From repository <span className="serif-accent">to live URL.</span>
          </h2>
        </div>

        <div className="timeline" data-reveal>
          <div className="timeline-track"><span /></div>
          <ol className="timeline-steps">
            {HOW_STEPS.map((s, i) => (
              <li key={s.title} className="timeline-step" style={cssVars({ "--i": i })}>
                <span className="timeline-node mono">{i + 1}</span>
                <div className="timeline-title">{s.title}</div>
                <p className="timeline-body">{s.body}</p>
              </li>
            ))}
          </ol>
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
            <div className="pill-label">For developers</div>
            <h2 className="section-title">
              Deploy from your terminal <span className="serif-accent">or your editor.</span>
            </h2>
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
        <div className="section-head section-head-center" data-reveal>
          <div className="pill-label">Plans</div>
          <h2 className="section-title">
            Start free. <span className="serif-accent">Grow when you need to.</span>
          </h2>
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
            <Link href={ctaHref} className="lp-btn lp-btn-secondary plan-btn">
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
            <Link href={user ? "/dashboard/settings" : "/register"} className="lp-btn lp-btn-primary plan-btn">
              {user ? "Upgrade in Settings" : "Create account"} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="closing" data-reveal>
        <div className="closing-cloud closing-cloud-l" aria-hidden>
          <div className="float" style={cssVars({ "--dur": "10s" })}><WatercolorCloud shape="a" seed={14} /></div>
        </div>
        <div className="closing-cloud closing-cloud-r" aria-hidden>
          <div className="float" style={cssVars({ "--dur": "12s", "--delay": "-5s" })}><WatercolorCloud shape="c" seed={9} /></div>
        </div>
        <h2 className="closing-title">
          Clear skies <span className="serif-accent">for every deploy.</span>
        </h2>
        <p className="closing-sub">Connect a repository and go live in a few minutes.</p>
        <Link href={ctaHref} className="lp-btn lp-btn-primary lp-btn-lg">
          {ctaLabel} <ArrowRight size={16} />
        </Link>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-brand">
          <BrandMark compact />
          <p className="footer-tag">Frontends, APIs, functions, databases and storage in one console.</p>
        </div>
        <div className="footer-cols">
          <div className="footer-col">
            <div className="footer-head">Products</div>
            <Link href="/dashboard/hosting">Frontend</Link>
            <Link href="/dashboard/backend">Backend</Link>
            <Link href="/dashboard/functions">Functions</Link>
            <Link href="/dashboard/databases">Databases</Link>
            <Link href="/dashboard/storage">Storage</Link>
          </div>
          <div className="footer-col">
            <div className="footer-head">Developers</div>
            <Link href="/docs">Docs</Link>
            <Link href="/dashboard/cli">CLI</Link>
            <Link href="/dashboard/mcp">MCP</Link>
            <Link href="/dashboard/flows">Flow</Link>
            <Link href="/dashboard/cron">Cron</Link>
          </div>
          <div className="footer-col">
            <div className="footer-head">Company</div>
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
          --ink-3: #4b5b72;
          --muted: #64748b;
          --faint: #94a3b8;
          --line: #e3ebf7;
          --sky-50: #f6f9ff;
          --sky-100: #ecf3ff;
          --sky-200: #d7e6ff;
          --blue: #2563eb;
          --blue-hover: #1d4ed8;
          --green: #15803d;
          --serif: var(--font-serif-display), "Instrument Serif", Georgia, serif;
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
        .serif-accent {
          font-family: var(--serif);
          font-style: italic;
          font-weight: 400;
          letter-spacing: -0.01em;
          color: var(--blue);
        }

        /* ── Buttons ── */
        .lp-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          padding: 0.62rem 1.15rem;
          font-size: 0.9rem;
          font-weight: 550;
          font-family: inherit;
          border: 1px solid transparent;
          border-radius: 999px;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }
        .lp-btn-sm { padding: 0.45rem 0.95rem; font-size: 0.84rem; }
        .lp-btn-lg { padding: 0.85rem 1.6rem; font-size: 1rem; }
        .lp .lp-btn-primary {
          background: var(--blue);
          color: #ffffff;
          box-shadow: 0 10px 24px -10px rgba(37, 99, 235, 0.6);
        }
        .lp .lp-btn-primary:hover { background: var(--blue-hover); transform: translateY(-1px); }
        .lp .lp-btn-secondary { background: #ffffff; color: var(--ink); border-color: var(--line); }
        .lp .lp-btn-secondary:hover { border-color: #c4d5f2; background: var(--sky-50); }
        .lp .lp-btn-ghost { background: transparent; color: var(--ink-3); }
        .lp .lp-btn-ghost:hover { color: var(--ink); }
        .lp-btn svg { transition: transform 0.2s ease; }
        .lp-btn:hover svg { transform: translateX(2px); }

        /* ── Pill label ── */
        .pill-label {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.38rem 0.9rem;
          border: 1px solid var(--line);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.85);
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-3);
        }
        .pill-label-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--blue); box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12); }

        /* ── Announcement ── */
        .banner {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.6rem 3rem;
          background: var(--blue-hover);
          color: #e8f0ff;
          font-size: 0.86rem;
          text-align: center;
        }
        .banner code { background: rgba(255, 255, 255, 0.14); padding: 0.1rem 0.4rem; border-radius: 6px; font-size: 0.8rem; color: #ffffff; }
        .banner-link { color: #ffffff; text-decoration: underline !important; text-underline-offset: 3px; font-weight: 550; }
        .banner-close {
          position: absolute;
          right: 1rem;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          background: transparent;
          border: none;
          color: #e8f0ff;
          cursor: pointer;
          padding: 0.25rem;
          border-radius: 999px;
        }
        .banner-close:hover { background: rgba(255, 255, 255, 0.14); }

        /* ── Nav ── */
        .lp-nav-wrap {
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(255, 255, 255, 0.82);
          backdrop-filter: saturate(180%) blur(12px);
          -webkit-backdrop-filter: saturate(180%) blur(12px);
          border-bottom: 1px solid rgba(227, 235, 247, 0.7);
        }
        .lp-nav {
          max-width: 1240px;
          margin: 0 auto;
          padding: 0.75rem 1.5rem;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 1rem;
        }
        .lp-nav-links {
          display: flex;
          gap: 0.25rem;
          padding: 0.3rem;
          border: 1px solid var(--line);
          border-radius: 999px;
          background: #ffffff;
          box-shadow: 0 6px 20px -12px rgba(11, 21, 48, 0.15);
        }
        .lp-nav-links a {
          font-size: 0.86rem;
          color: var(--ink-3);
          font-weight: 500;
          padding: 0.4rem 0.9rem;
          border-radius: 999px;
          transition: color 0.15s ease, background 0.15s ease;
        }
        .lp-nav-links a:hover { color: var(--ink); background: var(--sky-50); }
        .lp-nav-cta { display: flex; justify-content: flex-end; align-items: center; gap: 0.35rem; }

        /* ── Hero ── */
        .hero {
          --mx: 0;
          --my: 0;
          position: relative;
          overflow: hidden;
          padding: 6.5rem 1.5rem 0;
        }
        .sky {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(60% 50% at 50% 0%, rgba(214, 230, 255, 0.85), transparent 70%),
            radial-gradient(40% 40% at 15% 35%, rgba(236, 243, 255, 0.9), transparent 70%),
            radial-gradient(40% 40% at 85% 30%, rgba(236, 243, 255, 0.9), transparent 70%),
            linear-gradient(to bottom, #f8fbff 0%, #ffffff 70%);
          pointer-events: none;
        }
        .hero-cloud {
          position: absolute;
          z-index: 1;
          pointer-events: none;
          transform: translate3d(calc(var(--mx) * var(--depth, 20px)), calc(var(--my) * var(--depth, 20px)), 0);
          transition: transform 0.6s cubic-bezier(0.2, 0.7, 0.2, 1);
        }
        .hero-cloud-left { left: -3%; top: 8rem; width: min(31vw, 470px); --depth: -34px; }
        .hero-cloud-right { right: -3%; top: 4.5rem; width: min(29vw, 440px); --depth: -26px; }
        .hero-cloud-far-l { left: 22%; top: 2rem; width: min(12vw, 170px); opacity: 0.55; --depth: -10px; }
        .hero-cloud-far-r { right: 20%; top: 17rem; width: min(10vw, 140px); opacity: 0.45; --depth: -8px; }
        .float {
          position: relative;
          animation: lpFloat var(--dur, 10s) ease-in-out var(--delay, 0s) infinite alternate;
          will-change: transform;
        }
        .wc-cloud { display: block; width: 100%; height: auto; overflow: visible; }
        .hero-cloud-left .wc-cloud, .hero-cloud-right .wc-cloud { filter: drop-shadow(0 24px 30px rgba(37, 99, 235, 0.12)); }

        .cloud-chip {
          position: absolute;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.38rem 0.75rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid var(--line);
          box-shadow: 0 10px 24px -14px rgba(11, 21, 48, 0.35);
          font-size: 0.72rem;
          color: var(--ink-2);
          white-space: nowrap;
          pointer-events: auto;
        }
        .chip-left { left: 32%; bottom: 4%; color: var(--blue); }
        .chip-right { right: 30%; bottom: 6%; }
        .chip-dot { width: 7px; height: 7px; border-radius: 50%; background: #16a34a; animation: lpPulse 1.6s ease-in-out infinite; }

        .hero-copy {
          position: relative;
          z-index: 2;
          max-width: 780px;
          margin: 0 auto;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .hero-title {
          margin: 1.75rem 0 1.4rem;
          font-size: clamp(2.6rem, 5.6vw, 4.6rem);
          line-height: 1.02;
          letter-spacing: -0.045em;
          font-weight: 600;
          color: var(--ink);
        }
        .hero-line { display: block; text-wrap: balance; }
        .hero-serif {
          font-family: var(--serif);
          font-style: italic;
          font-weight: 400;
          font-size: 1.14em;
          letter-spacing: -0.02em;
          line-height: 1;
          color: var(--blue);
          padding-bottom: 0.08em;
        }
        .hero-fade {
          opacity: 0;
          transform: translateY(14px);
          filter: blur(6px);
          animation: lpFadeUp 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
          animation-delay: var(--d, 0ms);
        }
        .hero-sub {
          max-width: 38rem;
          font-size: 1.12rem;
          line-height: 1.65;
          color: var(--muted);
          margin: 0 0 2.2rem;
          text-wrap: balance;
        }
        .hero-ctas { display: flex; gap: 0.75rem; flex-wrap: wrap; justify-content: center; }

        .hero-stage {
          position: relative;
          z-index: 2;
          max-width: 880px;
          margin: 5rem auto 0;
          padding-bottom: 3.5rem;
        }
        .bank {
          position: absolute;
          left: 50%;
          pointer-events: none;
          -webkit-mask-image: radial-gradient(ellipse 50% 100% at 50% 20%, #000 55%, transparent 100%);
          mask-image: radial-gradient(ellipse 50% 100% at 50% 20%, #000 55%, transparent 100%);
        }
        .bank-back { width: 150%; bottom: -1rem; transform: translateX(-50%); opacity: 0.75; z-index: 0; }
        .bank-front { width: 135%; bottom: -5.5rem; transform: translateX(-46%); z-index: 3; }
        .bank .wc-cloud { animation: lpBank 18s ease-in-out infinite alternate; }

        /* ── Deploy preview ── */
        .deploy {
          position: relative;
          z-index: 2;
          background: #ffffff;
          border: 1px solid var(--line);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 40px 80px -40px rgba(11, 21, 48, 0.35), 0 1px 3px rgba(11, 21, 48, 0.06);
          text-align: left;
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
        .deploy-name { font-weight: 600; font-size: 0.92rem; color: var(--ink); }
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
        .step-label {
          font-size: 0.72rem;
          font-weight: 500;
          color: var(--faint);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: color 0.3s ease;
        }
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
          padding: 0.95rem 1.2rem 3.6rem;
          height: calc(7 * 1.75em + 4.6rem);
          font-size: 0.78rem;
          line-height: 1.75;
          color: var(--ink-2);
          overflow: hidden;
        }
        .log-row { display: flex; gap: 0.9rem; animation: lpLogIn 0.35s ease-out; }
        .log-row > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .log-ts { color: var(--faint); flex-shrink: 0; }
        .log-final { color: var(--green); font-weight: 600; }
        .log-caret {
          display: inline-block;
          width: 7px;
          height: 1em;
          background: var(--ink);
          vertical-align: middle;
          animation: lpBlink 1s steps(1) infinite;
        }

        /* ── Stack marquee ── */
        .stack {
          position: relative;
          z-index: 4;
          max-width: 1100px;
          margin: 0 auto;
          padding: 4.5rem 1.5rem 1rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.5rem;
        }
        .marquee {
          width: 100%;
          overflow: hidden;
          -webkit-mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent);
          mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent);
        }
        .marquee-track { display: flex; width: max-content; animation: lpMarquee 42s linear infinite; }
        .marquee:hover .marquee-track { animation-play-state: paused; }
        .marquee-group { display: flex; }
        .stack-item {
          padding: 0.6rem 1.9rem;
          font-size: 1.05rem;
          font-weight: 550;
          color: var(--faint);
          white-space: nowrap;
          transition: color 0.2s ease;
        }
        .stack-item:hover { color: var(--ink); }

        /* ── Sections ── */
        .section {
          max-width: 1180px;
          margin: 0 auto;
          padding: 7rem 1.5rem 2rem;
        }
        .section-center { text-align: center; }
        .section-head { display: flex; flex-direction: column; align-items: flex-start; gap: 1.4rem; margin-bottom: 3.5rem; }
        .section-center .section-head, .section-head-center { align-items: center; text-align: center; }
        .section-title {
          max-width: 46rem;
          font-size: clamp(2rem, 4vw, 3.2rem);
          line-height: 1.08;
          letter-spacing: -0.04em;
          font-weight: 600;
          margin: 0;
          color: var(--ink);
          text-wrap: balance;
        }
        .section-title .serif-accent { font-size: 1.1em; }
        .section-sub {
          margin: 1rem 0 0;
          font-size: 1.04rem;
          line-height: 1.65;
          color: var(--muted);
        }

        .lp [data-reveal] {
          opacity: 0;
          transform: translateY(18px);
          transition: opacity 0.8s cubic-bezier(0.2, 0.7, 0.2, 1), transform 0.8s cubic-bezier(0.2, 0.7, 0.2, 1);
          transition-delay: var(--d, 0ms);
        }
        .lp [data-reveal].is-in { opacity: 1; transform: none; }

        /* ── Problem ── */
        .problems {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1.25rem;
          text-align: left;
        }
        .problem {
          padding: 2rem;
          border-radius: 22px;
          background: var(--sky-50);
          border: 1px solid #edf2fb;
        }
        .problem-index { font-size: 0.78rem; color: var(--blue); }
        .problem-title { margin: 1.4rem 0 0.6rem; font-size: 1.15rem; font-weight: 600; letter-spacing: -0.02em; color: var(--ink); }
        .problem-body { margin: 0; font-size: 0.95rem; line-height: 1.6; color: var(--muted); }
        .answer {
          margin: 4rem auto 0;
          font-size: clamp(1.4rem, 2.6vw, 2rem);
          letter-spacing: -0.03em;
          font-weight: 550;
          color: var(--ink);
        }
        .answer .serif-accent { font-size: 1.15em; }

        /* ── Products ── */
        .products {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 1rem;
        }
        .product {
          position: relative;
          display: flex;
          flex-direction: column;
          padding: 1.6rem;
          border-radius: 22px;
          border: 1px solid var(--line);
          background: #ffffff;
          overflow: hidden;
          transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
        }
        .product::after {
          content: "";
          position: absolute;
          right: -40%;
          top: -50%;
          width: 90%;
          height: 90%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(215, 230, 255, 0.9), transparent 65%);
          opacity: 0;
          transition: opacity 0.35s ease;
          pointer-events: none;
        }
        .product:hover {
          border-color: #c9daf6;
          box-shadow: 0 24px 50px -30px rgba(37, 99, 235, 0.45);
          transform: translateY(-3px);
        }
        .product:hover::after { opacity: 1; }
        .product > * { position: relative; z-index: 1; }
        .product-icon {
          width: 42px;
          height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          color: var(--blue);
          background: var(--sky-100);
          margin-bottom: 1.6rem;
        }
        .product-name {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 1.06rem;
          font-weight: 600;
          letter-spacing: -0.02em;
          color: var(--ink);
        }
        .product-arrow {
          color: var(--blue);
          opacity: 0;
          transform: translate(-4px, 4px);
          transition: all 0.25s ease;
        }
        .product:hover .product-arrow { opacity: 1; transform: none; }
        .product-tagline { font-size: 0.82rem; color: var(--faint); margin-top: 0.2rem; }
        .product-desc { margin: 0.9rem 0 0; font-size: 0.9rem; line-height: 1.55; color: var(--muted); }

        /* ── Timeline ── */
        .timeline { position: relative; margin-bottom: 3rem; }
        .timeline-track {
          position: absolute;
          top: 21px;
          left: 22px;
          right: 22px;
          height: 2px;
          border-radius: 999px;
          background: var(--sky-100);
        }
        .timeline-track span {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: linear-gradient(90deg, #93b8f8, var(--blue));
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 1.6s cubic-bezier(0.4, 0, 0.2, 1) 0.2s;
        }
        .timeline.is-in .timeline-track span { transform: scaleX(1); }
        .timeline-steps {
          list-style: none;
          margin: 0;
          padding: 0;
          position: relative;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 2rem;
        }
        .timeline-node {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 1px solid var(--line);
          background: #ffffff;
          font-size: 0.85rem;
          color: var(--muted);
          margin-bottom: 1.3rem;
          transition: all 0.45s ease;
          transition-delay: calc(var(--i) * 0.4s + 0.2s);
        }
        .timeline.is-in .timeline-node {
          border-color: var(--blue);
          background: var(--blue);
          color: #ffffff;
          box-shadow: 0 0 0 6px rgba(37, 99, 235, 0.12);
        }
        .timeline-title { font-size: 1.05rem; font-weight: 600; letter-spacing: -0.015em; color: var(--ink); }
        .timeline-body { margin: 0.4rem 0 0; font-size: 0.92rem; line-height: 1.55; color: var(--muted); }

        .facts {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 1rem;
        }
        .fact { padding: 1.5rem; border-radius: 20px; background: var(--sky-50); }
        .fact-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #ffffff;
          color: var(--blue);
          margin-bottom: 1rem;
          box-shadow: 0 4px 12px -6px rgba(37, 99, 235, 0.4);
        }
        .fact-title { font-size: 0.96rem; font-weight: 600; color: var(--ink); }
        .fact-body { margin: 0.35rem 0 0; font-size: 0.87rem; line-height: 1.55; color: var(--muted); }

        /* ── Developers ── */
        .dev {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 4rem;
          align-items: center;
        }
        .code { margin-top: 2rem; border: 1px solid var(--line); border-radius: 18px; background: var(--sky-50); overflow: hidden; }
        .code-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.65rem 0.5rem 0.5rem;
          border-bottom: 1px solid var(--line);
        }
        .code-tabs { display: flex; gap: 0.25rem; }
        .code-tab {
          background: transparent;
          border: 1px solid transparent;
          border-radius: 999px;
          color: var(--muted);
          font-size: 0.76rem;
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          padding: 0.3rem 0.8rem;
          cursor: pointer;
          transition: color 0.15s ease, background 0.15s ease;
        }
        .code-tab:hover { color: var(--ink); }
        .code-tab.active { background: #ffffff; border-color: var(--line); color: var(--ink); }
        .code-copy {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          background: #ffffff;
          border: 1px solid var(--line);
          border-radius: 999px;
          color: var(--ink);
          font-size: 0.74rem;
          font-family: inherit;
          padding: 0.28rem 0.7rem;
          cursor: pointer;
          transition: border-color 0.15s ease;
        }
        .code-copy:hover { border-color: #c4d5f2; }
        .code-body {
          margin: 0;
          padding: 1.1rem 1.2rem;
          min-height: 15.5rem;
          font-size: 0.78rem;
          line-height: 1.7;
          color: var(--ink-3);
          overflow-x: auto;
          background: transparent;
          border: none;
        }
        .tok-key { color: var(--blue); }
        .tok-str { color: #047857; }
        .tok-prompt { color: var(--faint); }

        .agent {
          border: 1px solid var(--line);
          border-radius: 22px;
          background: #ffffff;
          overflow: hidden;
          box-shadow: 0 40px 80px -45px rgba(37, 99, 235, 0.45);
        }
        .agent-head {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.8rem 1.1rem;
          border-bottom: 1px solid var(--line);
          font-size: 0.76rem;
          color: var(--muted);
        }
        .agent-dot { width: 7px; height: 7px; border-radius: 50%; background: #16a34a; }
        .agent-body { padding: 1.3rem; display: flex; flex-direction: column; gap: 1rem; }
        .agent-msg { font-size: 0.92rem; line-height: 1.5; }
        .agent-user {
          align-self: flex-end;
          background: var(--blue);
          color: #ffffff;
          padding: 0.6rem 0.95rem;
          border-radius: 16px 16px 4px 16px;
        }
        .agent-calls {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--line);
          border-radius: 14px;
          overflow: hidden;
        }
        .agent-call {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 0.65rem;
          padding: 0.6rem 0.85rem;
          font-size: 0.76rem;
          border-bottom: 1px solid #f0f4fb;
        }
        .agent-call:last-child { border-bottom: none; }
        .agent-check { color: var(--green); }
        .agent-tool { color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .agent-result { color: var(--muted); white-space: nowrap; }
        .agent-reply {
          align-self: flex-start;
          color: var(--ink-2);
          background: var(--sky-50);
          padding: 0.6rem 0.95rem;
          border-radius: 16px 16px 16px 4px;
        }
        .agent-call, .agent-reply {
          opacity: 0;
          transform: translateX(-6px);
          transition: opacity 0.4s ease, transform 0.4s ease;
          transition-delay: calc(var(--i) * 0.32s + 0.5s);
        }
        .agent.is-in .agent-call, .agent.is-in .agent-reply { opacity: 1; transform: none; }

        /* ── Plans ── */
        .plans {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1.25rem;
          max-width: 980px;
          margin: 0 auto;
        }
        .plan {
          display: flex;
          flex-direction: column;
          padding: 2.4rem;
          border-radius: 24px;
          border: 1px solid var(--line);
          background: #ffffff;
        }
        .plan-pro {
          background:
            radial-gradient(80% 60% at 100% 0%, rgba(215, 230, 255, 0.9), transparent 70%),
            var(--sky-50);
          border-color: #cfe0fb;
        }
        .plan-name { font-size: 0.86rem; font-weight: 600; color: var(--muted); }
        .plan-price { margin-top: 0.5rem; font-size: 2.2rem; font-weight: 600; letter-spacing: -0.04em; color: var(--ink); }
        .plan-list {
          list-style: none;
          margin: 1.75rem 0 2.2rem;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
          flex: 1;
        }
        .plan-list li { position: relative; padding-left: 1.6rem; font-size: 0.94rem; line-height: 1.5; color: var(--ink-2); }
        .plan-list li::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0.32em;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--sky-100) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4.5 8.2l2.2 2.2 4.8-4.8' fill='none' stroke='%232563eb' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 14px no-repeat;
        }
        .plan-btn { align-self: flex-start; }

        /* ── Closing ── */
        .closing {
          position: relative;
          overflow: hidden;
          margin: 7rem auto 0;
          max-width: 1180px;
          padding: 8rem 1.5rem;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          border-radius: 36px;
          background:
            radial-gradient(60% 70% at 50% 100%, rgba(215, 230, 255, 0.9), transparent 70%),
            linear-gradient(to bottom, #ffffff, var(--sky-50));
          border: 1px solid #edf2fb;
        }
        .closing-cloud { position: absolute; pointer-events: none; }
        .closing-cloud-l { left: -6%; bottom: -10%; width: min(36vw, 460px); }
        .closing-cloud-r { right: -3%; top: 8%; width: min(20vw, 260px); opacity: 0.8; }
        .closing > *:not(.closing-cloud) { position: relative; z-index: 1; }
        .closing-title {
          font-size: clamp(2.3rem, 5vw, 4rem);
          line-height: 1.05;
          letter-spacing: -0.045em;
          font-weight: 600;
          margin: 0;
          color: var(--ink);
          text-wrap: balance;
        }
        .closing-title .serif-accent { font-size: 1.12em; display: block; }
        .closing-sub { margin: 1.2rem 0 2.2rem; font-size: 1.08rem; color: var(--muted); }

        /* ── Footer ── */
        .footer {
          max-width: 1180px;
          margin: 0 auto;
          padding: 4.5rem 1.5rem 3rem;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 2.5rem 4rem;
        }
        .footer-tag { margin: 0.85rem 0 0; font-size: 0.88rem; color: var(--muted); max-width: 22rem; }
        .footer-cols { display: flex; gap: 4rem; }
        .footer-col { display: flex; flex-direction: column; gap: 0.6rem; }
        .footer-head { font-size: 0.8rem; font-weight: 600; color: var(--ink); margin-bottom: 0.35rem; }
        .footer-col a { font-size: 0.88rem; color: var(--muted); transition: color 0.15s ease; }
        .footer-col a:hover { color: var(--blue); }
        .footer-copy {
          grid-column: 1 / -1;
          padding-top: 1.5rem;
          border-top: 1px solid var(--line);
          font-size: 0.8rem;
          color: var(--faint);
        }

        /* ── Keyframes ── */
        @keyframes lpFadeUp { to { opacity: 1; transform: none; filter: blur(0); } }
        @keyframes lpFloat {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(14px, -16px, 0); }
        }
        @keyframes lpBank {
          0% { transform: translateX(-1.5%); }
          100% { transform: translateX(1.5%); }
        }
        @keyframes lpLogIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        @keyframes lpBlink { 50% { opacity: 0; } }
        @keyframes lpPulse { 50% { opacity: 0.35; } }
        @keyframes lpIndeterminate {
          0% { transform: translateX(-100%) scaleX(0.4); }
          100% { transform: translateX(250%) scaleX(0.4); }
        }
        @keyframes lpMarquee { to { transform: translateX(-50%); } }

        /* ── Responsive ── */
        @media (max-width: 1100px) {
          .products { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .lp-nav-links a { padding: 0.4rem 0.65rem; }
        }
        @media (max-width: 1000px) {
          .dev { grid-template-columns: 1fr; gap: 3rem; }
          .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .problems { grid-template-columns: 1fr; }
          .hero-cloud-left { width: 34vw; top: 10rem; }
          .hero-cloud-right { width: 32vw; }
          .cloud-chip { display: none; }
        }
        @media (max-width: 860px) {
          .lp-nav { grid-template-columns: 1fr auto; }
          .lp-nav-links { display: none; }
        }
        @media (max-width: 760px) {
          .banner { padding: 0.6rem 2.75rem 0.6rem 1rem; font-size: 0.8rem; }
          .hero { padding-top: 4.5rem; }
          .hero-cloud-left { left: -18%; top: 0.5rem; width: 62vw; opacity: 0.55; }
          .hero-cloud-right { right: -22%; top: auto; bottom: 46%; width: 58vw; opacity: 0.5; }
          .hero-cloud-far-l, .hero-cloud-far-r { display: none; }
          .hero-stage { margin-top: 3.5rem; }
          .bank-back { width: 320%; bottom: 0; }
          .bank-front { width: 280%; bottom: -3rem; }
          .deploy-log { padding-bottom: 2.6rem; height: calc(7 * 1.75em + 3.6rem); }
          .section { padding: 5rem 1.25rem 1rem; }
          .products { grid-template-columns: 1fr; }
          .timeline-track { top: 22px; bottom: 22px; left: 21px; right: auto; width: 2px; height: auto; }
          .timeline-track span { transform: scaleY(0); transform-origin: top; background: linear-gradient(180deg, #93b8f8, var(--blue)); }
          .timeline.is-in .timeline-track span { transform: scaleY(1); }
          .timeline-steps { grid-template-columns: 1fr; gap: 1.75rem; }
          .timeline-step { padding-left: 3.75rem; position: relative; }
          .timeline-node { position: absolute; left: 0; top: 0; margin: 0; }
          .facts { grid-template-columns: 1fr; }
          .plans { grid-template-columns: 1fr; }
          .plan { padding: 1.8rem; }
          .deploy-ref { display: none; }
          .step-label { font-size: 0.64rem; }
          .closing { margin: 5rem 1rem 0; padding: 5.5rem 1.25rem; border-radius: 28px; }
          .closing-cloud-l { width: 70vw; left: -25%; bottom: -12%; opacity: 0.7; }
          .closing-cloud-r { width: 40vw; opacity: 0.5; }
          .footer { grid-template-columns: 1fr; }
          .footer-cols { gap: 2.5rem; flex-wrap: wrap; }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-fade { animation: none; opacity: 1; transform: none; filter: none; }
          .float, .bank .wc-cloud, .marquee-track, .chip-dot { animation: none; }
          .hero-cloud { transition: none; transform: none; }
          .lp [data-reveal] { opacity: 1; transform: none; transition: none; }
          .agent-call, .agent-reply { opacity: 1; transform: none; transition: none; }
          .timeline-track span, .timeline-node { transition: none; }
          .log-row { animation: none; }
          .product, .lp-btn { transition: none; }
        }
      `}</style>
    </div>
  );
}
