"use client";

import { useEffect, useState, type ReactNode } from "react";
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
  Copy,
  Check,
  Layers,
  Sparkles,
  Cpu,
  CheckCircle2
} from "lucide-react";

/* ─── Static content ─────────────────────────────────────────────── */

const DEPLOY_STEPS = ["Clone", "Install", "Build", "Health check", "Live"];

const DEPLOY_LOG = [
  { step: 0, text: "Cloning acme/api-gateway at main" },
  { step: 0, text: "Checked out 4f8e2c1" },
  { step: 1, text: "npm ci · 412 packages installed" },
  { step: 2, text: "Synthesizing Alpine multi-stage container" },
  { step: 2, text: "Image built · 148 MB" },
  { step: 3, text: "GET /health → 200 OK (passed in 12ms)" },
  { step: 4, text: "Traffic smoothly cut over to new version" },
];

const DEPLOY_HOLD = 6;

const PRODUCTS = [
  {
    id: "hosting",
    icon: Globe,
    name: "Frontend Hosting",
    tagline: "Next.js, React, Vite, Astro",
    description: "Deploy from Git. Every push builds and goes live on its own URL with Cloudflare wildcard SSL.",
    href: "/dashboard/hosting",
    badge: "Sub-5ms Edge",
  },
  {
    id: "backend",
    icon: Server,
    name: "Backend Services",
    tagline: "Node.js, Python, Go, Rust, Java, Docker",
    description: "APIs and queue workers in isolated containers. Zero-Docker synthesis with automatic 0.0.0.0 binding.",
    href: "/dashboard/backend",
    badge: "Zero-Downtime Mesh",
  },
  {
    id: "functions",
    icon: Zap,
    name: "Edge Functions",
    tagline: "TypeScript and JavaScript handlers",
    description: "Serverless endpoints and webhooks on V8 isolates with sub-5ms cold starts and 0 Docker ports.",
    href: "/dashboard/functions",
    badge: "V8 Serverless",
  },
  {
    id: "databases",
    icon: Database,
    name: "Databases",
    tagline: "PostgreSQL and Redis",
    description: "Dedicated instances with connection pooling, automatic backups, and an in-browser SQL console.",
    href: "/dashboard/databases",
    badge: "PgBouncer + TLS",
  },
  {
    id: "storage",
    icon: HardDrive,
    name: "Cloud Storage",
    tagline: "S3-compatible object buckets",
    description: "Private and public asset storage with fine-grained API keys and instant CDN distribution.",
    href: "/dashboard/storage",
    badge: "S3 Compatible",
  },
  {
    id: "cron",
    icon: Clock,
    name: "Cron Jobs",
    tagline: "Scheduled tasks and queue triggers",
    description: "Run automated jobs against your microservices and edge functions without keeping idle servers awake.",
    href: "/dashboard/cron",
    badge: "Reliable Cron",
  },
  {
    id: "flow",
    icon: Workflow,
    name: "Whizan Flow",
    tagline: "Visual deployment pipelines",
    description: "Automate build, test, canary rollout, and multi-service release dependencies visually.",
    href: "/dashboard/flows",
    badge: "Automated DAG",
  },
  {
    id: "devtools",
    icon: Terminal,
    name: "CLI and MCP Server",
    tagline: "Terminal and AI Agent DevOps",
    description: "Deploy and inspect services with @whizan/cli or interact natively from Cursor, Windsurf, and Claude.",
    href: "/dashboard/cli",
    badge: "Model Context Protocol",
  },
];

const HOW_STEPS = [
  { num: "01", title: "Connect Repository", body: "Select any GitHub repository and branch, or run whizan deploy directly from your workspace." },
  { num: "02", title: "Smart Synthesis", body: "Whizan's AI engine automatically discovers your stack, selects the port, and injects AES-256 secrets." },
  { num: "03", title: "Isolated Container Build", body: "Build in hardened multi-stage containers with zero Dockerfile requirement and live log streaming." },
  { num: "04", title: "Zero-Downtime Cutover", body: "Deep HTTP 200 readiness checks probe the new deployment before cleanly shifting global traffic." },
];

const FACTS = [
  { icon: ShieldCheck, title: "Automatic Wildcard SSL", body: "Every deployment gets its own secure HTTPS domain with zero configuration." },
  { icon: Activity, title: "Full Telemetry & Logs", body: "Live streaming container stdout/stderr, CPU and memory metrics per service." },
  { icon: KeyRound, title: "Hardware-Encrypted Secrets", body: "Environment variables and API keys stored encrypted using AES-256-GCM." },
  { icon: RotateCcw, title: "Blue/Green Zero-Downtime", body: "The previous deployment continues serving live traffic until the new build reports 200 OK." },
];

const AGENT_CALLS = [
  { tool: "whizan_analyze_workspace", result: "Next.js app · port 3000 detected" },
  { tool: "whizan_set_env_vars", result: "2 secrets encrypted & injected" },
  { tool: "whizan_create_project", result: "Web project provisioned" },
  { tool: "whizan_deploy_direct", result: "Source archive uploaded & enqueued" },
  { tool: "whizan_get_build_logs", result: "Build READY (took 18.4s)" },
  { tool: "whizan_check_health", result: "HTTP 200 OK · Production Active" },
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
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
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
  const statusLabel = { queued: "Queued", building: "Building", ready: "Ready · 200 OK" }[status];
  const elapsed = `0:${String(shown * 6).padStart(2, "0")}`;

  return (
    <div className="deploy-card" aria-label="Live deployment simulator">
      <div className="deploy-window-head">
        <div className="deploy-dots">
          <span className="dot dot-red" />
          <span className="dot dot-amber" />
          <span className="dot dot-green" />
        </div>
        <div className="deploy-title mono">
          <Server size={13} className="text-blue" />
          <span>acme-api-gateway</span>
          <span className="deploy-branch">main · 4f8e2c1</span>
        </div>
        <div className="deploy-meta">
          <span className="deploy-time mono">{elapsed}</span>
          <span className={`deploy-pill pill-${status}`}>
            <span className="pill-pulse" />
            {statusLabel}
          </span>
        </div>
      </div>

      <ol className="deploy-steps">
        {DEPLOY_STEPS.map((label, i) => {
          const state = finished || i < current ? "done" : i === current ? "active" : "pending";
          return (
            <li key={label} className={`deploy-step step-${state}`}>
              <div className="step-indicator">
                {state === "done" ? <Check size={11} /> : <span>{i + 1}</span>}
              </div>
              <span className="step-label">{label}</span>
              <span className="step-line" />
            </li>
          );
        })}
      </ol>

      <div className="deploy-terminal mono">
        <div className="terminal-header">
          <span>STDOUT / TELEMETRY</span>
          <span className="terminal-live-tag">LIVE STREAM</span>
        </div>
        <div className="terminal-body">
          {DEPLOY_LOG.slice(0, shown).map((line, i) => (
            <div key={i} className={`log-row ${i === DEPLOY_LOG.length - 1 ? "log-latest" : ""}`}>
              <span className="log-ts">00:{String(i * 6).padStart(2, "0")}</span>
              <span className="log-text">{line.text}</span>
            </div>
          ))}
          {!finished && <span className="log-cursor" />}
        </div>
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

  useScrollReveal();

  const copySnippet = () => {
    navigator.clipboard.writeText(devTab === "cli" ? CLI_SNIPPET : MCP_CONFIG);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="lp">
      {/* ── Top Navigation Bar ── */}
      <header className="lp-nav-wrap">
        <div className="lp-nav">
          <div className="nav-brand-container">
            <BrandMark compact />
          </div>

          <nav className="lp-nav-links">
            <a href="#why">Why Whizan</a>
            <a href="#products">Products</a>
            <a href="#how">How it works</a>
            <a href="#developers">Developers</a>
            <a href="#plans">Plans</a>
            <Link href="/docs">Docs</Link>
          </nav>

          <div className="lp-nav-cta">
            {user ? (
              <Link href="/dashboard" className="lp-btn lp-btn-primary lp-btn-sm">
                Console <ArrowRight size={14} />
              </Link>
            ) : (
              <>
                <Link href="/login" className="lp-btn lp-btn-ghost lp-btn-sm">
                  Sign in
                </Link>
                <Link href="/register" className="lp-btn lp-btn-primary lp-btn-sm">
                  Get started <ArrowRight size={14} />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="hero">
        <div className="hero-atmosphere" aria-hidden />
        <div className="hero-soft-cloud cloud-left" aria-hidden />
        <div className="hero-soft-cloud cloud-right" aria-hidden />

        <div className="hero-inner">
          <div className="hero-copy">
            <div className="hero-kicker" data-reveal>
              <span className="kicker-pulse" />
              <span>Whizan Cloud 2.0 · Universal Infrastructure</span>
            </div>

            <h1 className="hero-title" data-reveal>
              Your whole stack,
              <br />
              <span className="hero-gradient-text">deployed from one console.</span>
            </h1>

            <p className="hero-sub" data-reveal>
              Deploy frontend web apps, containerized backend APIs, serverless edge functions,
              PostgreSQL databases, and S3-compatible cloud storage with automated 200 OK health checks.
            </p>

            <div className="hero-ctas" data-reveal>
              <Link href={ctaHref} className="lp-btn lp-btn-primary lp-btn-lg" id="hero-cta-btn">
                {ctaLabel} <ArrowRight size={16} />
              </Link>
              <a href="#how" className="lp-btn lp-btn-secondary lp-btn-lg">
                Explore How It Works
              </a>
            </div>

            <div className="hero-highlights" data-reveal>
              <div className="highlight-pill">
                <CheckCircle2 size={14} className="text-blue" />
                <span>Zero-Docker Synthesis</span>
              </div>
              <div className="highlight-pill">
                <CheckCircle2 size={14} className="text-green" />
                <span>Blue/Green Deployments</span>
              </div>
              <div className="highlight-pill">
                <CheckCircle2 size={14} className="text-indigo" />
                <span>Free Hobby Plan</span>
              </div>
            </div>
          </div>

          <div className="hero-visual" data-reveal>
            <DeployPreview />
          </div>
        </div>
      </section>

      {/* ── Supported Tech Stack Marquee with Authentic Logos ── */}
      <section className="stack-marquee-section" aria-label="Supported languages and frameworks">
        <div className="stack-header">
          <span className="stack-title-pill">RUNS ANY STACK</span>
          <p className="stack-subtitle">Stack-independent architecture with native support for modern runtimes</p>
        </div>

        <div className="marquee">
          <div className="marquee-track">
            {[0, 1, 2].map(copyIdx => (
              <div key={copyIdx} className="marquee-group" aria-hidden={copyIdx > 0}>
                {ALL_TECH_STACK.map(tech => {
                  const Icon = tech.Icon;
                  return (
                    <div key={`${copyIdx}-${tech.id}`} className="stack-card">
                      <span className="stack-icon-wrapper">
                        <Icon />
                      </span>
                      <span className="stack-name">{tech.name}</span>
                      <span className="stack-category">{tech.category}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Whizan Bento Grid ── */}
      <section id="why" className="section">
        <div className="section-head" data-reveal>
          <div className="eyebrow mono">WHY WHIZAN</div>
          <h2 className="section-title">Built for instant shipping with absolute serenity.</h2>
          <p className="section-sub">Eliminate fragmented tools, complex Kubernetes YAML, and risky manual releases.</p>
        </div>

        <div className="bento-grid">
          {/* Bento Card 1 */}
          <div className="bento-box bento-gradient-1" data-reveal>
            <div className="bento-top">
              <span className="bento-tag">ALL-IN-ONE CONSOLE</span>
              <span className="bento-number">08</span>
            </div>
            <h3 className="bento-heading">Complete Cloud Primitives</h3>
            <p className="bento-description">
              Frontends, containerized APIs, edge functions, Postgres, Redis, S3 object storage, cron jobs, and CI/CD pipelines managed under a unified dashboard.
            </p>
            <div className="bento-tags-row">
              <span className="bento-mini-chip">Frontend</span>
              <span className="bento-mini-chip">Backends</span>
              <span className="bento-mini-chip">Functions</span>
              <span className="bento-mini-chip">Databases</span>
              <span className="bento-mini-chip">Storage</span>
              <span className="bento-mini-chip">Cron</span>
            </div>
          </div>

          {/* Bento Card 2 */}
          <div className="bento-box bento-dark" data-reveal>
            <div className="bento-top">
              <span className="bento-tag">ZERO REGRESSIONS</span>
              <span className="bento-status-badge">
                <span className="pill-pulse-green" /> 200 OK
              </span>
            </div>
            <h3 className="bento-heading">Deep HTTP Health Checks</h3>
            <p className="bento-description">
              New releases only take production traffic after passing HTTP readiness probes. If a build crashes or fails health checks, the previous container keeps serving without downtime.
            </p>
            <div className="bento-code-pill mono">
              <span>GET /health</span>
              <span className="text-green">HTTP 200 (Cutover Verified)</span>
            </div>
          </div>

          {/* Bento Card 3 */}
          <div className="bento-box bento-white" data-reveal>
            <div className="bento-top">
              <span className="bento-tag">ZERO-DOCKER SYNTHESIS</span>
              <Cpu size={20} className="text-blue" />
            </div>
            <h3 className="bento-heading">Deploy Any Code Instantly</h3>
            <p className="bento-description">
              Bring any repository in Node, Python, Go, Rust, Java, PHP, or Ruby. Our cloud build worker automatically synthesizes optimized production multi-stage containers without requiring a Dockerfile.
            </p>
          </div>

          {/* Bento Card 4 */}
          <div className="bento-box bento-indigo" data-reveal>
            <div className="bento-top">
              <span className="bento-tag">HOBBY TIER</span>
              <Sparkles size={20} className="text-indigo" />
            </div>
            <h3 className="bento-heading">Generous Free Plan</h3>
            <p className="bento-description">
              Start building for $0. Frontend CDN hosting, 0.1 vCPU auto-sleeping backend microservices, and starter Postgres instances with zero credit card required.
            </p>
          </div>
        </div>
      </section>

      {/* ── Products Section ── */}
      <section id="products" className="section">
        <div className="section-head" data-reveal>
          <div className="eyebrow mono">PRODUCTS</div>
          <h2 className="section-title">Everything your stack needs to run globally.</h2>
          <p className="section-sub">A single CLI, a single unified API, and seamless integration between components.</p>
        </div>

        <div className="products-grid">
          {PRODUCTS.map((p, i) => {
            const Icon = p.icon;
            return (
              <Link
                key={p.id}
                href={user ? p.href : "/register"}
                className="product-card"
                data-reveal
              >
                <div className="product-top">
                  <div className="product-icon-wrap">
                    <Icon size={20} />
                  </div>
                  <span className="product-badge mono">{p.badge}</span>
                </div>
                <div className="product-name">
                  <span>{p.name}</span>
                  <ArrowUpRight size={16} className="product-arrow" />
                </div>
                <div className="product-tagline">{p.tagline}</div>
                <p className="product-desc">{p.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section id="how" className="section">
        <div className="section-head" data-reveal>
          <div className="eyebrow mono">WORKFLOW</div>
          <h2 className="section-title">From Git commit to global production in minutes.</h2>
          <p className="section-sub">Simple, deterministic, and self-healing deployment lifecycle.</p>
        </div>

        <div className="how-grid">
          <div className="how-steps">
            {HOW_STEPS.map((s) => (
              <div key={s.num} className="how-step-card" data-reveal>
                <div className="how-step-number mono">{s.num}</div>
                <div className="how-step-content">
                  <h4 className="how-step-title">{s.title}</h4>
                  <p className="how-step-body">{s.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="facts-grid">
            {FACTS.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="fact-card" data-reveal>
                  <div className="fact-icon">
                    <Icon size={18} />
                  </div>
                  <div className="fact-content">
                    <h5 className="fact-title">{f.title}</h5>
                    <p className="fact-body">{f.body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Developer Tools & MCP ── */}
      <section id="developers" className="section">
        <div className="dev-layout">
          <div className="dev-copy" data-reveal>
            <div className="eyebrow mono">DEVELOPER FIRST</div>
            <h2 className="section-title">Deploy from your terminal or AI IDE.</h2>
            <p className="section-sub">
              Use the official <code className="mono">@whizan/cli</code> for git-push workflows, or connect the
              MCP DevOps server directly to Cursor, Windsurf, or Claude for autonomous agents.
            </p>

            <div className="code-container">
              <div className="code-tabs-bar">
                <div className="code-tabs">
                  <button
                    type="button"
                    className={`code-tab ${devTab === "cli" ? "active" : ""}`}
                    onClick={() => setDevTab("cli")}
                  >
                    Terminal CLI
                  </button>
                  <button
                    type="button"
                    className={`code-tab ${devTab === "mcp" ? "active" : ""}`}
                    onClick={() => setDevTab("mcp")}
                  >
                    mcp.json (AI Agent)
                  </button>
                </div>
                <button type="button" className="copy-btn" onClick={copySnippet}>
                  {copied ? <Check size={14} className="text-green" /> : <Copy size={14} />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>

              <pre className="code-content mono">
                {devTab === "cli" ? highlightShell(CLI_SNIPPET) : highlightJson(MCP_CONFIG)}
              </pre>
            </div>
          </div>

          <div className="agent-session-card" data-reveal>
            <div className="agent-header">
              <span className="agent-status-dot" />
              <span className="mono">AI AGENT WORKFLOW</span>
              <span className="agent-model-tag mono">@whizan/mcp-devops</span>
            </div>
            <div className="agent-body">
              <div className="agent-message user-msg">
                <span>Deploy this repository to Whizan Cloud and verify health.</span>
              </div>
              <ul className="agent-tool-list mono">
                {AGENT_CALLS.map((c) => (
                  <li key={c.tool} className="agent-tool-item">
                    <Check size={13} className="text-green" />
                    <span className="agent-tool-name">{c.tool}</span>
                    <span className="agent-tool-result">{c.result}</span>
                  </li>
                ))}
              </ul>
              <div className="agent-message reply-msg">
                <span>Deployment complete. Live URL verified with HTTP 200 OK.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Plans Section ── */}
      <section id="plans" className="section">
        <div className="section-head" data-reveal>
          <div className="eyebrow mono">PRICING TIERS</div>
          <h2 className="section-title">Start free. Scale on dedicated compute.</h2>
          <p className="section-sub">Predictable resource allocations with zero hidden fees.</p>
        </div>

        <div className="plans-grid">
          <div className="plan-card" data-reveal>
            <div className="plan-header">
              <div className="plan-name">Hobby</div>
              <div className="plan-cost">$0 <span>/ month</span></div>
              <p className="plan-desc">Perfect for personal side projects, prototypes, and hobby developers.</p>
            </div>
            <ul className="plan-features">
              <li><Check size={16} className="text-green" /> Global Edge CDN frontend hosting</li>
              <li><Check size={16} className="text-green" /> 0.1 vCPU & 512 MB RAM microservices</li>
              <li><Check size={16} className="text-green" /> Automatic idle spin-down after 15m</li>
              <li><Check size={16} className="text-green" /> Dedicated starter PostgreSQL database</li>
              <li><Check size={16} className="text-green" /> Full @whizan/cli and MCP devops tooling</li>
            </ul>
            <Link href={ctaHref} className="lp-btn lp-btn-secondary plan-cta">
              {ctaLabel} <ArrowRight size={15} />
            </Link>
          </div>

          <div className="plan-card plan-card-featured" data-reveal>
            <div className="featured-pill mono">RECOMMENDED</div>
            <div className="plan-header">
              <div className="plan-name">Professional</div>
              <div className="plan-cost">Custom Compute <span>/ usage</span></div>
              <p className="plan-desc">For production business applications requiring 24/7 always-on uptime.</p>
            </div>
            <ul className="plan-features">
              <li><Check size={16} className="text-blue" /> Up to 4.0 vCPU and 4.0 GB RAM per container</li>
              <li><Check size={16} className="text-blue" /> Always-on services with zero spin-down</li>
              <li><Check size={16} className="text-blue" /> High-concurrency Postgres & Redis pools</li>
              <li><Check size={16} className="text-blue" /> S3 cloud storage with custom bucket policies</li>
              <li><Check size={16} className="text-blue" /> Priority build queue & real-time telemetry</li>
            </ul>
            <Link href={user ? "/dashboard/settings" : "/register"} className="lp-btn lp-btn-primary plan-cta">
              {user ? "Upgrade in Settings" : "Create Account"} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section className="closing-section" data-reveal>
        <div className="closing-inner">
          <h2 className="closing-title">Ready to deploy your next application?</h2>
          <p className="closing-sub">Connect your GitHub account and launch your full stack in under 2 minutes.</p>
          <div className="closing-ctas">
            <Link href={ctaHref} className="lp-btn lp-btn-primary lp-btn-lg">
              {ctaLabel} <ArrowRight size={16} />
            </Link>
            <Link href="/docs" className="lp-btn lp-btn-secondary lp-btn-lg">
              Read Documentation
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="footer-top">
          <div className="footer-brand-col">
            <BrandMark compact />
            <p className="footer-tagline">
              Modern cloud hosting for frontends, APIs, serverless functions, databases, and object storage.
            </p>
            <div className="footer-status-pill">
              <span className="pill-pulse-green" />
              <span>All Systems Operational</span>
            </div>
          </div>

          <div className="footer-links-grid">
            <div className="footer-col">
              <h5 className="footer-col-title mono">Products</h5>
              <Link href="/dashboard/hosting">Frontend Hosting</Link>
              <Link href="/dashboard/backend">Backend Services</Link>
              <Link href="/dashboard/functions">Edge Functions</Link>
              <Link href="/dashboard/databases">Databases</Link>
              <Link href="/dashboard/storage">Cloud Storage</Link>
            </div>

            <div className="footer-col">
              <h5 className="footer-col-title mono">Developers</h5>
              <Link href="/docs">Documentation</Link>
              <Link href="/dashboard/cli">CLI Reference</Link>
              <Link href="/dashboard/mcp">MCP DevOps Tooling</Link>
              <Link href="/dashboard/flows">Whizan Flow</Link>
              <Link href="/dashboard/cron">Cron Scheduler</Link>
            </div>

            <div className="footer-col">
              <h5 className="footer-col-title mono">Company</h5>
              <Link href="/contact">Contact Support</Link>
              <Link href="/terms">Terms of Service</Link>
              <Link href="/login">Account Sign In</Link>
              <Link href="/register">Create Account</Link>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} Whizan Cloud Services Inc. All rights reserved.</p>
          <div className="footer-legal-links">
            <Link href="/terms">Privacy Policy</Link>
            <span>·</span>
            <Link href="/terms">Terms of Service</Link>
            <span>·</span>
            <Link href="/docs">API Status</Link>
          </div>
        </div>
      </footer>

      {/* ── Scoped Luxury Styles (0% CPU strain, 120 FPS buttery smooth) ── */}
      <style>{`
        .lp {
          --ink: #0b1530;
          --ink-muted: #475569;
          --ink-faint: #94a3b8;
          --border: #e2e8f0;
          --border-subtle: #f1f5f9;
          --bg-wash: #f8fafc;
          --blue: #2563eb;
          --blue-hover: #1d4ed8;
          --blue-subtle: #eff6ff;
          --green: #10b981;
          --indigo: #6366f1;
          --card-bg: #ffffff;
          min-height: 100vh;
          background: #ffffff;
          color: var(--ink);
          color-scheme: light;
          font-family: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          letter-spacing: -0.012em;
          overflow-x: hidden;
        }

        .lp *, .lp *::before, .lp *::after { box-sizing: border-box; }
        .lp a { color: inherit; text-decoration: none; }
        .lp .mono { font-family: var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace; }
        .lp .text-blue { color: var(--blue); }
        .lp .text-green { color: var(--green); }
        .lp .text-indigo { color: var(--indigo); }

        /* ── Buttons ── */
        .lp-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.65rem 1.2rem;
          font-size: 0.875rem;
          font-weight: 550;
          border-radius: 9999px;
          border: 1px solid transparent;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .lp-btn-sm { padding: 0.45rem 0.95rem; font-size: 0.8125rem; }
        .lp-btn-lg { padding: 0.8rem 1.6rem; font-size: 0.95rem; }
        
        .lp-btn-primary {
          background: var(--blue);
          color: #ffffff;
          box-shadow: 0 1px 2px rgba(37, 99, 235, 0.2), 0 4px 12px rgba(37, 99, 235, 0.18);
        }
        .lp-btn-primary:hover {
          background: var(--blue-hover);
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(37, 99, 235, 0.28);
        }

        .lp-btn-secondary {
          background: #ffffff;
          color: var(--ink);
          border-color: var(--border);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .lp-btn-secondary:hover {
          background: var(--bg-wash);
          border-color: #cbd5e1;
          transform: translateY(-1px);
        }

        .lp-btn-ghost {
          background: transparent;
          color: var(--ink-muted);
        }
        .lp-btn-ghost:hover {
          color: var(--ink);
          background: var(--bg-wash);
        }

        /* ── Top Navigation Bar ── */
        .lp-nav-wrap {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: saturate(180%) blur(16px);
          -webkit-backdrop-filter: saturate(180%) blur(16px);
          border-bottom: 1px solid var(--border);
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
        .nav-brand-container {
          display: flex;
          align-items: center;
        }
        .lp-nav-links {
          display: flex;
          align-items: center;
          gap: 2rem;
        }
        .lp-nav-links a {
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--ink-muted);
          transition: color 0.15s ease;
        }
        .lp-nav-links a:hover {
          color: var(--ink);
        }
        .lp-nav-cta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        /* ── Hero Section ── */
        .hero {
          position: relative;
          padding: 5rem 1.5rem 5.5rem;
          overflow: hidden;
          background: linear-gradient(180deg, #ffffff 0%, #f9fbfe 100%);
        }
        .hero-atmosphere {
          position: absolute;
          inset: 0;
          background-image: 
            radial-gradient(ellipse 900px 500px at 50% -80px, rgba(37, 99, 235, 0.12), transparent 70%),
            linear-gradient(to right, rgba(226, 232, 240, 0.4) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(226, 232, 240, 0.4) 1px, transparent 1px);
          background-size: 100% 100%, 48px 48px, 48px 48px;
          pointer-events: none;
        }
        .hero-soft-cloud {
          position: absolute;
          border-radius: 9999px;
          filter: blur(60px);
          pointer-events: none;
          opacity: 0.6;
          animation: ambientFloat 14s ease-in-out infinite alternate;
        }
        .cloud-left {
          width: 500px;
          height: 300px;
          background: rgba(191, 219, 254, 0.45);
          top: 10%;
          left: -150px;
        }
        .cloud-right {
          width: 550px;
          height: 320px;
          background: rgba(224, 231, 255, 0.45);
          top: 25%;
          right: -180px;
          animation-delay: -7s;
        }

        @keyframes ambientFloat {
          0% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -14px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }

        .hero-inner {
          position: relative;
          max-width: 1240px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
          gap: 4rem;
          align-items: center;
        }
        .hero-kicker {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.35rem 0.85rem;
          border-radius: 9999px;
          background: #ffffff;
          border: 1px solid var(--border);
          font-size: 0.8125rem;
          font-weight: 550;
          color: var(--ink-muted);
          margin-bottom: 1.5rem;
          box-shadow: 0 1px 2px rgba(0,0,0,0.03);
        }
        .kicker-pulse {
          width: 7px;
          height: 7px;
          border-radius: 9999px;
          background: var(--blue);
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
        }
        .hero-title {
          font-size: clamp(2.6rem, 5.2vw, 4.2rem);
          line-height: 1.05;
          letter-spacing: -0.04em;
          font-weight: 700;
          margin: 0 0 1.25rem;
          color: var(--ink);
        }
        .hero-gradient-text {
          background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #4f46e5 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero-sub {
          font-size: 1.125rem;
          line-height: 1.55;
          color: var(--ink-muted);
          max-width: 540px;
          margin: 0 0 2rem;
        }
        .hero-ctas {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          margin-bottom: 2.25rem;
          flex-wrap: wrap;
        }
        .hero-highlights {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          flex-wrap: wrap;
        }
        .highlight-pill {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--ink-muted);
        }

        /* ── Deploy Window / Simulator ── */
        .deploy-card {
          background: #0f172a;
          color: #f8fafc;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 20px 45px -10px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.1);
          overflow: hidden;
        }
        .deploy-window-head {
          padding: 0.85rem 1.2rem;
          background: #1e293b;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }
        .deploy-dots {
          display: flex;
          gap: 6px;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 9999px;
        }
        .dot-red { background: #ef4444; }
        .dot-amber { background: #f59e0b; }
        .dot-green { background: #10b981; }

        .deploy-title {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          font-size: 0.8125rem;
          font-weight: 500;
          color: #cbd5e1;
        }
        .deploy-branch {
          color: #64748b;
        }
        .deploy-meta {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .deploy-time {
          font-size: 0.75rem;
          color: #94a3b8;
        }
        .deploy-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.2rem 0.6rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 550;
        }
        .pill-queued { background: rgba(148, 163, 184, 0.2); color: #cbd5e1; }
        .pill-building { background: rgba(59, 130, 246, 0.2); color: #93c5fd; }
        .pill-ready { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; }
        .pill-pulse {
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          background: currentColor;
          animation: pulseDot 1.5s infinite;
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }

        .deploy-steps {
          list-style: none;
          margin: 0;
          padding: 1.25rem 1.25rem 1rem;
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(15, 23, 42, 0.6);
        }
        .deploy-step {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          position: relative;
        }
        .step-indicator {
          width: 20px;
          height: 20px;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          font-weight: 600;
          background: #334155;
          color: #94a3b8;
        }
        .step-label {
          font-size: 0.75rem;
          font-weight: 500;
          color: #64748b;
        }
        .step-done .step-indicator { background: var(--green); color: #ffffff; }
        .step-done .step-label { color: #f1f5f9; }
        .step-active .step-indicator { background: var(--blue); color: #ffffff; box-shadow: 0 0 0 3px rgba(37,99,235,0.3); }
        .step-active .step-label { color: #93c5fd; font-weight: 600; }

        .deploy-terminal {
          padding: 1.2rem;
          font-size: 0.8125rem;
        }
        .terminal-header {
          display: flex;
          justify-content: space-between;
          font-size: 0.7rem;
          letter-spacing: 0.06em;
          color: #64748b;
          margin-bottom: 0.75rem;
        }
        .terminal-live-tag {
          color: var(--green);
        }
        .terminal-body {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          min-height: 140px;
        }
        .log-row {
          display: flex;
          gap: 0.85rem;
          color: #94a3b8;
        }
        .log-ts {
          color: #475569;
          user-select: none;
        }
        .log-latest {
          color: #f8fafc;
        }
        .log-cursor {
          display: inline-block;
          width: 8px;
          height: 15px;
          background: var(--blue);
          animation: blinkCursor 0.8s infinite;
        }
        @keyframes blinkCursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        /* ── Stack Marquee Section (With Real Logos) ── */
        .stack-marquee-section {
          padding: 3.5rem 0 4rem;
          background: #ffffff;
          border-bottom: 1px solid var(--border);
          overflow: hidden;
        }
        .stack-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        .stack-title-pill {
          display: inline-block;
          font-size: 0.75rem;
          font-weight: 650;
          letter-spacing: 0.08em;
          color: var(--blue);
          background: var(--blue-subtle);
          padding: 0.25rem 0.75rem;
          border-radius: 9999px;
          margin-bottom: 0.5rem;
        }
        .stack-subtitle {
          font-size: 0.95rem;
          color: var(--ink-muted);
          margin: 0;
        }
        .marquee {
          position: relative;
          overflow: hidden;
          mask-image: linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%);
          -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%);
        }
        .marquee-track {
          display: flex;
          width: max-content;
          animation: marqueeScroll 45s linear infinite;
        }
        .marquee:hover .marquee-track {
          animation-play-state: paused;
        }
        @keyframes marqueeScroll {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-33.3333%, 0, 0); }
        }
        .marquee-group {
          display: flex;
          gap: 1.25rem;
          padding: 0 0.625rem;
        }
        .stack-card {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.6rem 1.15rem;
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.03);
          transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
          white-space: nowrap;
        }
        .stack-card:hover {
          transform: translateY(-2px);
          border-color: #cbd5e1;
          box-shadow: 0 4px 12px rgba(0,0,0,0.06);
        }
        .stack-icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
        }
        .stack-name {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--ink);
        }
        .stack-category {
          font-size: 0.6875rem;
          font-weight: 500;
          color: var(--ink-faint);
          background: var(--bg-wash);
          padding: 0.15rem 0.45rem;
          border-radius: 6px;
        }

        /* ── Common Section Structure ── */
        .section {
          max-width: 1240px;
          margin: 0 auto;
          padding: 6.5rem 1.5rem;
        }
        .section-head {
          max-width: 700px;
          margin: 0 auto 3.5rem;
          text-align: center;
        }
        .eyebrow {
          font-size: 0.75rem;
          font-weight: 650;
          letter-spacing: 0.08em;
          color: var(--blue);
          text-transform: uppercase;
          margin-bottom: 0.75rem;
        }
        .section-title {
          font-size: clamp(2rem, 3.8vw, 2.75rem);
          line-height: 1.15;
          letter-spacing: -0.035em;
          font-weight: 700;
          margin: 0 0 1rem;
          color: var(--ink);
        }
        .section-sub {
          font-size: 1.0625rem;
          line-height: 1.6;
          color: var(--ink-muted);
          margin: 0;
        }

        /* ── Bento Grid ── */
        .bento-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1.5rem;
        }
        .bento-box {
          border-radius: 20px;
          padding: 2.25rem 2rem;
          position: relative;
          border: 1px solid var(--border);
          box-shadow: 0 1px 3px rgba(0,0,0,0.03);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .bento-box:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px -5px rgba(0,0,0,0.06);
        }
        .bento-gradient-1 {
          grid-column: span 2;
          background: linear-gradient(135deg, #ffffff 0%, #f0f6ff 100%);
          border-color: #dbeafe;
        }
        .bento-dark {
          background: #0f172a;
          color: #ffffff;
          border-color: #1e293b;
        }
        .bento-white {
          background: #ffffff;
        }
        .bento-indigo {
          background: linear-gradient(135deg, #ffffff 0%, #eef2ff 100%);
          border-color: #e0e7ff;
        }
        .bento-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.25rem;
        }
        .bento-tag {
          font-size: 0.6875rem;
          font-weight: 650;
          letter-spacing: 0.08em;
          color: var(--ink-muted);
        }
        .bento-dark .bento-tag { color: #94a3b8; }
        .bento-number {
          font-size: 2.5rem;
          font-weight: 750;
          color: var(--blue);
          line-height: 1;
        }
        .bento-heading {
          font-size: 1.375rem;
          font-weight: 650;
          letter-spacing: -0.02em;
          margin: 0 0 0.75rem;
        }
        .bento-description {
          font-size: 0.95rem;
          line-height: 1.55;
          color: var(--ink-muted);
          margin: 0 0 1.5rem;
        }
        .bento-dark .bento-description { color: #94a3b8; }
        .bento-tags-row {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .bento-mini-chip {
          font-size: 0.75rem;
          font-weight: 550;
          padding: 0.25rem 0.65rem;
          background: #ffffff;
          border: 1px solid #bfdbfe;
          color: var(--blue);
          border-radius: 6px;
        }
        .bento-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: #10b981;
          background: rgba(16, 185, 129, 0.15);
          padding: 0.25rem 0.65rem;
          border-radius: 9999px;
        }
        .pill-pulse-green {
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          background: #10b981;
        }
        .bento-code-pill {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.6rem 0.85rem;
          background: #1e293b;
          border-radius: 8px;
          font-size: 0.8125rem;
        }

        /* ── Products Grid ── */
        .products-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 1.5rem;
        }
        .product-card {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 1.75rem 1.5rem;
          display: flex;
          flex-direction: column;
          box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .product-card:hover {
          transform: translateY(-3px);
          border-color: #cbd5e1;
          box-shadow: 0 12px 24px -6px rgba(0,0,0,0.06);
        }
        .product-card:hover .product-arrow {
          transform: translate(2px, -2px);
          color: var(--blue);
        }
        .product-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.25rem;
        }
        .product-icon-wrap {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: var(--blue-subtle);
          color: var(--blue);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .product-badge {
          font-size: 0.6875rem;
          font-weight: 600;
          color: var(--ink-faint);
          background: var(--bg-wash);
          padding: 0.15rem 0.5rem;
          border-radius: 6px;
        }
        .product-name {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 1.125rem;
          font-weight: 650;
          color: var(--ink);
          margin-bottom: 0.35rem;
        }
        .product-arrow {
          color: var(--ink-faint);
          transition: transform 0.2s ease, color 0.2s ease;
        }
        .product-tagline {
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--blue);
          margin-bottom: 0.75rem;
        }
        .product-desc {
          font-size: 0.875rem;
          line-height: 1.55;
          color: var(--ink-muted);
          margin: 0;
        }

        /* ── How It Works ── */
        .how-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3rem;
          align-items: start;
        }
        .how-steps {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .how-step-card {
          display: flex;
          gap: 1.25rem;
          padding: 1.5rem;
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 16px;
        }
        .how-step-number {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--blue);
          line-height: 1;
        }
        .how-step-title {
          font-size: 1.0625rem;
          font-weight: 650;
          margin: 0 0 0.35rem;
          color: var(--ink);
        }
        .how-step-body {
          font-size: 0.875rem;
          line-height: 1.55;
          color: var(--ink-muted);
          margin: 0;
        }

        .facts-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1.25rem;
        }
        .fact-card {
          display: flex;
          gap: 1.25rem;
          padding: 1.5rem;
          background: var(--bg-wash);
          border: 1px solid var(--border);
          border-radius: 16px;
        }
        .fact-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: #ffffff;
          border: 1px solid var(--border);
          color: var(--blue);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .fact-title {
          font-size: 1rem;
          font-weight: 650;
          margin: 0 0 0.35rem;
          color: var(--ink);
        }
        .fact-body {
          font-size: 0.875rem;
          line-height: 1.55;
          color: var(--ink-muted);
          margin: 0;
        }

        /* ── Developer Tools & MCP ── */
        .dev-layout {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3.5rem;
          align-items: start;
        }
        .code-container {
          background: #0f172a;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden;
          margin-top: 1.75rem;
        }
        .code-tabs-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 1rem;
          background: #1e293b;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .code-tabs {
          display: flex;
          gap: 0.5rem;
        }
        .code-tab {
          padding: 0.4rem 0.85rem;
          font-size: 0.8125rem;
          font-weight: 550;
          color: #94a3b8;
          background: transparent;
          border: none;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.15s ease;
        }
        .code-tab.active {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.1);
        }
        .copy-btn {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.75rem;
          color: #94a3b8;
          background: transparent;
          border: none;
          cursor: pointer;
        }
        .copy-btn:hover { color: #ffffff; }
        .code-content {
          padding: 1.25rem;
          font-size: 0.8125rem;
          line-height: 1.6;
          color: #cbd5e1;
          margin: 0;
          overflow-x: auto;
        }
        .tok-prompt { color: #64748b; }
        .tok-key { color: #60a5fa; }
        .tok-str { color: #34d399; }

        .agent-session-card {
          background: #0f172a;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden;
        }
        .agent-header {
          padding: 0.85rem 1.25rem;
          background: #1e293b;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 0.75rem;
          color: #cbd5e1;
        }
        .agent-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 9999px;
          background: var(--green);
        }
        .agent-model-tag {
          margin-left: auto;
          font-size: 0.6875rem;
          color: #94a3b8;
          background: rgba(255,255,255,0.06);
          padding: 0.15rem 0.5rem;
          border-radius: 4px;
        }
        .agent-body {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .agent-message {
          padding: 0.75rem 1rem;
          border-radius: 10px;
          font-size: 0.875rem;
          line-height: 1.5;
        }
        .user-msg {
          background: #1e293b;
          color: #f1f5f9;
        }
        .reply-msg {
          background: rgba(37, 99, 235, 0.15);
          color: #93c5fd;
          border: 1px solid rgba(37, 99, 235, 0.3);
        }
        .agent-tool-list {
          list-style: none;
          margin: 0;
          padding: 0.5rem 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .agent-tool-item {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 0.75rem;
        }
        .agent-tool-name {
          color: #60a5fa;
        }
        .agent-tool-result {
          color: #94a3b8;
          margin-left: auto;
        }

        /* ── Pricing / Plans ── */
        .plans-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 480px));
          gap: 2rem;
          justify-content: center;
        }
        .plan-card {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 2.5rem 2.25rem;
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .plan-card-featured {
          border-color: #93c5fd;
          box-shadow: 0 10px 30px -5px rgba(37, 99, 235, 0.12);
        }
        .featured-pill {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--blue);
          color: #ffffff;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          padding: 0.25rem 0.85rem;
          border-radius: 9999px;
        }
        .plan-name {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--ink);
          margin-bottom: 0.5rem;
        }
        .plan-cost {
          font-size: 2.25rem;
          font-weight: 750;
          color: var(--ink);
          margin-bottom: 0.5rem;
        }
        .plan-cost span {
          font-size: 0.95rem;
          font-weight: 500;
          color: var(--ink-muted);
        }
        .plan-desc {
          font-size: 0.875rem;
          color: var(--ink-muted);
          margin: 0 0 1.75rem;
          line-height: 1.5;
        }
        .plan-features {
          list-style: none;
          margin: 0 0 2rem;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .plan-features li {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          font-size: 0.875rem;
          color: var(--ink-muted);
        }
        .plan-cta {
          margin-top: auto;
          width: 100%;
        }

        /* ── Closing Section ── */
        .closing-section {
          background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
          padding: 6rem 1.5rem;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
        }
        .closing-inner {
          max-width: 750px;
          margin: 0 auto;
          text-align: center;
        }
        .closing-title {
          font-size: clamp(2rem, 3.5vw, 2.75rem);
          font-weight: 700;
          letter-spacing: -0.035em;
          margin: 0 0 1rem;
          color: var(--ink);
        }
        .closing-sub {
          font-size: 1.125rem;
          color: var(--ink-muted);
          margin: 0 0 2rem;
        }
        .closing-ctas {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
        }

        /* ── Footer ── */
        .lp-footer {
          max-width: 1240px;
          margin: 0 auto;
          padding: 5rem 1.5rem 3rem;
        }
        .footer-top {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 2fr);
          gap: 4rem;
          margin-bottom: 4rem;
        }
        .footer-brand-col {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .footer-tagline {
          font-size: 0.875rem;
          line-height: 1.6;
          color: var(--ink-muted);
          max-width: 320px;
          margin: 0;
        }
        .footer-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          font-weight: 550;
          color: #065f46;
          background: #ecfdf5;
          padding: 0.3rem 0.75rem;
          border-radius: 9999px;
          width: fit-content;
        }
        .footer-links-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 2rem;
        }
        .footer-col {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .footer-col-title {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: var(--ink);
          text-transform: uppercase;
          margin: 0 0 0.5rem;
        }
        .footer-col a {
          font-size: 0.875rem;
          color: var(--ink-muted);
          transition: color 0.15s ease;
        }
        .footer-col a:hover {
          color: var(--ink);
        }
        .footer-bottom {
          padding-top: 2rem;
          border-top: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.8125rem;
          color: var(--ink-faint);
        }
        .footer-legal-links {
          display: flex;
          gap: 0.85rem;
        }

        /* ── Animations & Accessibility ── */
        [data-reveal] {
          opacity: 0;
          transform: translateY(18px);
          transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }
        [data-reveal].is-in {
          opacity: 1;
          transform: translateY(0);
        }

        @media (max-width: 1024px) {
          .hero-inner { grid-template-columns: 1fr; gap: 3rem; }
          .bento-grid { grid-template-columns: 1fr 1fr; }
          .bento-gradient-1 { grid-column: span 2; }
          .products-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .how-grid, .dev-layout { grid-template-columns: 1fr; }
          .plans-grid { grid-template-columns: 1fr; }
          .footer-top { grid-template-columns: 1fr; gap: 3rem; }
        }

        @media (max-width: 768px) {
          .lp-nav-links { display: none; }
          .bento-grid { grid-template-columns: 1fr; }
          .bento-gradient-1 { grid-column: span 1; }
          .products-grid { grid-template-columns: 1fr; }
          .footer-links-grid { grid-template-columns: 1fr; }
          .footer-bottom { flex-direction: column; gap: 1rem; align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}
