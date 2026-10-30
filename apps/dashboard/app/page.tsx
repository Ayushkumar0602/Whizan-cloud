"use client";

import { useEffect, useState, type ReactNode } from "react";
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
  "Rust", "Java", "PHP", "Ruby", "Docker", "PostgreSQL", "Redis",
];

const PRODUCTS = [
  {
    id: "hosting",
    icon: Globe,
    name: "Frontend Hosting",
    tagline: "Next.js, React, Vite, Astro",
    description: "Deploy from Git. Every push builds and goes live on its own URL with HTTPS.",
    href: "/dashboard/hosting",
    specs: "Git deploys · HTTPS · Custom domains",
  },
  {
    id: "backend",
    icon: Server,
    name: "Backend Services",
    tagline: "Node.js, Python, Go, Rust, Java, Docker",
    description: "APIs and workers in isolated containers. New versions take traffic after a health check.",
    href: "/dashboard/backend",
    specs: "Blue/green releases · Logs · Metrics",
  },
  {
    id: "functions",
    icon: Zap,
    name: "Edge Functions",
    tagline: "TypeScript and JavaScript handlers",
    description: "Handlers for API routes and webhooks, each with its own URL and API keys.",
    href: "/dashboard/functions",
    specs: "Per-function keys · Live logs",
  },
  {
    id: "databases",
    icon: Database,
    name: "Databases",
    tagline: "PostgreSQL and Redis",
    description: "Dedicated instances with connection pooling, a table browser and a SQL console.",
    href: "/dashboard/databases",
    specs: "PgBouncer · TLS · SQL console",
  },
  {
    id: "storage",
    icon: HardDrive,
    name: "Cloud Storage",
    tagline: "S3-compatible object storage",
    description: "Buckets for uploads and assets, with access policies and per-project quotas.",
    href: "/dashboard/storage",
    specs: "S3 API · Policies · Quotas",
  },
  {
    id: "cron",
    icon: Clock,
    name: "Cron Jobs",
    tagline: "Scheduled tasks",
    description: "Run jobs on a schedule against your services and functions, without an always-on server.",
    href: "/dashboard/cron",
    specs: "Cron syntax · Multi-target · History",
  },
  {
    id: "flow",
    icon: Workflow,
    name: "Whizan Flow",
    tagline: "Pipelines",
    description: "Build, test and canary-deploy pipelines that recover automatically after failures.",
    href: "/dashboard/flows",
    specs: "Build · Test · Canary",
  },
  {
    id: "devtools",
    icon: Terminal,
    name: "CLI and MCP",
    tagline: "From your terminal or editor",
    description: "Deploy, read logs and manage services with the whizan CLI, or through MCP in your editor.",
    href: "/dashboard/cli",
    specs: "whizan CLI · Cursor · Windsurf · Claude",
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
          <Server size={15} />
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

  useScrollReveal();

  const copySnippet = () => {
    navigator.clipboard.writeText(devTab === "cli" ? CLI_SNIPPET : MCP_CONFIG);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const headline = [
    { text: "Your whole stack,", tone: "ink" },
    { text: "deployed from one console.", tone: "soft" },
  ];
  let wordIndex = 0;

  return (
    <div className="lp">
      {/* Nav */}
      <header className="lp-nav-wrap">
        <div className="lp-nav">
          <BrandMark compact />
          <nav className="lp-nav-links">
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
                <Link href="/login" className="lp-btn lp-btn-ghost lp-btn-sm">Sign in</Link>
                <Link href="/register" className="lp-btn lp-btn-primary lp-btn-sm">Get started</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="hero-grid-bg" aria-hidden />
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="hero-kicker mono hero-fade" style={{ ["--d" as string]: "0ms" }}>
              <span className="kicker-dot" /> Whizan Cloud
            </div>
            <h1 className="hero-title">
              {headline.map(line => (
                <span key={line.text} className={`hero-line tone-${line.tone}`}>
                  {line.text.split(" ").map(word => {
                    const i = wordIndex++;
                    return (
                      <span key={word + i} className="hero-word" style={{ ["--i" as string]: i }}>
                        {word}&nbsp;
                      </span>
                    );
                  })}
                </span>
              ))}
            </h1>
            <p className="hero-sub hero-fade" style={{ ["--d" as string]: "520ms" }}>
              Host frontends, containerized APIs, functions, databases and storage.
              Deploy from Git, from the CLI, or from your editor.
            </p>
            <div className="hero-ctas hero-fade" style={{ ["--d" as string]: "640ms" }}>
              <Link href={ctaHref} className="lp-btn lp-btn-primary lp-btn-lg" id="hero-cta-btn">
                {ctaLabel} <ArrowRight size={16} />
              </Link>
              <a href="#how" className="lp-btn lp-btn-secondary lp-btn-lg">
                How it works
              </a>
            </div>
            <div className="hero-note mono hero-fade" style={{ ["--d" as string]: "760ms" }}>
              The Hobby plan is free.
            </div>
          </div>

          <div className="hero-visual hero-fade" style={{ ["--d" as string]: "300ms" }}>
            <div className="visual-frame" aria-hidden />
            <DeployPreview />
          </div>
        </div>
      </section>

      {/* Stack marquee */}
      <section className="stack" aria-label="Supported languages and frameworks">
        <div className="stack-label mono">Runs</div>
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

      {/* Products */}
      <section id="products" className="section">
        <div className="section-head" data-reveal>
          <div className="eyebrow mono">Products</div>
          <h2 className="section-title">Everything your app runs on, in one console.</h2>
          <p className="section-sub">One account, one dashboard and one CLI for every part of your stack.</p>
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
                style={{ ["--d" as string]: `${(i % 4) * 80}ms` }}
              >
                <div className="product-top">
                  <span className="product-icon"><Icon size={18} /></span>
                  <span className="product-index mono">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div className="product-name">
                  {p.name}
                  <ArrowUpRight size={16} className="product-arrow" />
                </div>
                <div className="product-tagline">{p.tagline}</div>
                <p className="product-desc">{p.description}</p>
                <div className="product-specs mono">{p.specs}</div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="section">
        <div className="section-head" data-reveal>
          <div className="eyebrow mono">How it works</div>
          <h2 className="section-title">From repository to live URL.</h2>
        </div>

        <div className="timeline" data-reveal>
          <div className="timeline-track"><span /></div>
          <ol className="timeline-steps">
            {HOW_STEPS.map((s, i) => (
              <li key={s.title} className="timeline-step" style={{ ["--i" as string]: i }}>
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
              <div key={f.title} className="fact" data-reveal style={{ ["--d" as string]: `${i * 80}ms` }}>
                <Icon size={18} className="fact-icon" />
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
            <div className="eyebrow mono">Developers</div>
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

          <div className="agent" data-reveal style={{ ["--d" as string]: "120ms" }}>
            <div className="agent-head">
              <span className="agent-dot" />
              <span className="mono">Agent session</span>
            </div>
            <div className="agent-body">
              <div className="agent-msg agent-user">Deploy this repo to Whizan.</div>
              <ul className="agent-calls mono">
                {AGENT_CALLS.map((c, i) => (
                  <li key={c.tool} className="agent-call" style={{ ["--i" as string]: i }}>
                    <Check size={13} className="agent-check" />
                    <span className="agent-tool">{c.tool}</span>
                    <span className="agent-result">{c.result}</span>
                  </li>
                ))}
              </ul>
              <div className="agent-msg agent-reply" style={{ ["--i" as string]: AGENT_CALLS.length }}>
                Deployed. The health check passed.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section id="plans" className="section">
        <div className="section-head" data-reveal>
          <div className="eyebrow mono">Plans</div>
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
            <Link href={ctaHref} className="lp-btn lp-btn-secondary plan-btn">
              {ctaLabel} <ArrowRight size={15} />
            </Link>
          </div>

          <div className="plan plan-pro" data-reveal style={{ ["--d" as string]: "100ms" }}>
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

      {/* Closing CTA */}
      <section className="closing" data-reveal>
        <div className="closing-grid-bg" aria-hidden />
        <h2 className="closing-title">Deploy your first service today.</h2>
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
          --ink-3: #475569;
          --ink-soft: #64748b;
          --ink-faint: #94a3b8;
          --line: #e2e8f0;
          --line-soft: #f1f5f9;
          --wash: #f8fafc;
          --blue: #2563eb;
          --blue-hover: #1d4ed8;
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
        .lp-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          padding: 0.6rem 1.05rem;
          font-size: 0.875rem;
          font-weight: 550;
          font-family: inherit;
          border: 1px solid transparent;
          border-radius: 0;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .lp-btn-sm { padding: 0.4rem 0.75rem; font-size: 0.8rem; }
        .lp-btn-lg { padding: 0.8rem 1.4rem; font-size: 0.95rem; }
        .lp .lp-btn-primary { background: var(--blue); color: #ffffff; }
        .lp .lp-btn-primary:hover { background: var(--blue-hover); }
        .lp .lp-btn-secondary { background: #ffffff; color: var(--ink); border-color: var(--line); }
        .lp .lp-btn-secondary:hover { border-color: #cbd5e1; background: var(--wash); }
        .lp .lp-btn-ghost { background: transparent; color: var(--ink-3); }
        .lp .lp-btn-ghost:hover { color: var(--ink); background: var(--wash); }
        .lp-btn svg { transition: transform 0.2s ease; }
        .lp-btn:hover svg { transform: translateX(2px); }

        /* ── Nav ── */
        .lp-nav-wrap {
          position: sticky;
          top: 0;
          z-index: 30;
          background: rgba(255, 255, 255, 0.86);
          backdrop-filter: saturate(180%) blur(10px);
          -webkit-backdrop-filter: saturate(180%) blur(10px);
          border-bottom: 1px solid var(--line);
        }
        .lp-nav {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0.7rem 1.5rem;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 1rem;
        }
        .lp-nav-links { display: flex; gap: 2rem; }
        .lp-nav-links a {
          font-size: 0.875rem;
          color: var(--ink-soft);
          font-weight: 500;
          transition: color 0.15s ease;
        }
        .lp-nav-links a:hover { color: var(--ink); }
        .lp-nav-cta { display: flex; justify-content: flex-end; gap: 0.35rem; }

        /* ── Hero ── */
        .hero { position: relative; }
        .hero-grid-bg {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(to right, var(--line-soft) 1px, transparent 1px),
            linear-gradient(to bottom, var(--line-soft) 1px, transparent 1px);
          background-size: 56px 56px;
          -webkit-mask-image: radial-gradient(ellipse 80% 70% at 70% 30%, #000 30%, transparent 75%);
          mask-image: radial-gradient(ellipse 80% 70% at 70% 30%, #000 30%, transparent 75%);
          pointer-events: none;
        }
        .hero-inner {
          position: relative;
          max-width: 1200px;
          margin: 0 auto;
          padding: 6rem 1.5rem 5.5rem;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr);
          gap: 4rem;
          align-items: center;
        }
        .hero-kicker {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          letter-spacing: 0.04em;
          color: var(--ink-soft);
          text-transform: uppercase;
          margin-bottom: 1.5rem;
        }
        .kicker-dot { width: 6px; height: 6px; background: var(--blue); }
        .hero-title {
          font-size: clamp(2.4rem, 5vw, 4rem);
          line-height: 1.04;
          letter-spacing: -0.045em;
          font-weight: 650;
          margin: 0 0 1.5rem;
        }
        .hero-line { display: block; }
        .tone-ink { color: var(--ink); }
        .tone-soft { color: var(--ink-faint); }
        .hero-word {
          display: inline-block;
          opacity: 0;
          transform: translateY(0.35em);
          filter: blur(6px);
          animation: lpWordIn 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
          animation-delay: calc(var(--i) * 55ms + 80ms);
        }
        .hero-fade {
          opacity: 0;
          transform: translateY(10px);
          animation: lpFadeUp 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
          animation-delay: var(--d, 0ms);
        }
        .hero-sub {
          font-size: 1.1rem;
          line-height: 1.6;
          color: var(--ink-3);
          max-width: 33rem;
          margin: 0 0 2rem;
        }
        .hero-ctas { display: flex; gap: 0.65rem; flex-wrap: wrap; }
        .hero-note { margin-top: 1.25rem; font-size: 0.75rem; color: var(--ink-soft); }

        .hero-visual { position: relative; }
        .visual-frame {
          position: absolute;
          inset: 18px -18px -18px 18px;
          border: 1px solid var(--line);
          background: repeating-linear-gradient(135deg, transparent 0 7px, var(--line-soft) 7px 8px);
        }

        /* ── Deploy preview ── */
        .deploy {
          position: relative;
          background: #ffffff;
          border: 1px solid var(--line);
          box-shadow: 0 30px 60px -30px rgba(11, 21, 48, 0.28), 0 1px 3px rgba(11, 21, 48, 0.06);
        }
        .deploy-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.9rem 1.1rem;
          border-bottom: 1px solid var(--line);
        }
        .deploy-title { display: flex; align-items: center; gap: 0.55rem; min-width: 0; color: var(--ink-soft); }
        .deploy-name { font-weight: 600; font-size: 0.92rem; color: var(--ink); }
        .deploy-ref { font-size: 0.75rem; color: var(--ink-soft); white-space: nowrap; }
        .deploy-meta { display: flex; align-items: center; gap: 0.75rem; }
        .deploy-time { font-size: 0.75rem; color: var(--ink-soft); }
        .deploy-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0.2rem 0.55rem;
          border: 1px solid;
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
          gap: 0.5rem;
          padding: 1rem 1.1rem 0.9rem;
          border-bottom: 1px solid var(--line);
        }
        .deploy-step { display: flex; flex-direction: column; gap: 0.45rem; min-width: 0; }
        .step-label {
          font-size: 0.72rem;
          font-weight: 500;
          color: var(--ink-faint);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: color 0.3s ease;
        }
        .step-bar { position: relative; height: 3px; background: var(--line); overflow: hidden; }
        .step-bar span {
          position: absolute;
          inset: 0;
          background: var(--blue);
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.5s cubic-bezier(0.2, 0.7, 0.2, 1);
        }
        .step-done .step-label, .step-active .step-label { color: var(--ink); }
        .step-done .step-bar span { transform: scaleX(1); }
        .step-active .step-bar span { animation: lpIndeterminate 1.1s ease-in-out infinite; }

        .deploy-log {
          background: var(--wash);
          padding: 0.9rem 1.1rem;
          height: calc(7 * 1.75em + 1.8rem);
          font-size: 0.78rem;
          line-height: 1.75;
          color: var(--ink-2);
          overflow: hidden;
        }
        .log-row { display: flex; gap: 0.9rem; animation: lpLogIn 0.35s ease-out; }
        .log-row > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .log-ts { color: var(--ink-faint); flex-shrink: 0; }
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
          display: flex;
          align-items: center;
          max-width: 1200px;
          margin: 0 auto;
          border-top: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
        }
        .stack-label {
          flex-shrink: 0;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--ink-soft);
          padding: 1.4rem 1.5rem;
          border-right: 1px solid var(--line);
        }
        .marquee {
          flex: 1;
          overflow: hidden;
          -webkit-mask-image: linear-gradient(to right, transparent, #000 8%, #000 92%, transparent);
          mask-image: linear-gradient(to right, transparent, #000 8%, #000 92%, transparent);
        }
        .marquee-track { display: flex; width: max-content; animation: lpMarquee 40s linear infinite; }
        .marquee:hover .marquee-track { animation-play-state: paused; }
        .marquee-group { display: flex; }
        .stack-item {
          padding: 1.4rem 1.75rem;
          font-size: 0.95rem;
          font-weight: 550;
          color: var(--ink-3);
          white-space: nowrap;
        }

        /* ── Sections ── */
        .section {
          max-width: 1200px;
          margin: 0 auto;
          padding: 6rem 1.5rem;
          border-bottom: 1px solid var(--line);
        }
        .section-head { max-width: 42rem; margin-bottom: 3rem; }
        .eyebrow {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--blue);
          margin-bottom: 0.85rem;
        }
        .section-title {
          font-size: clamp(1.8rem, 3.2vw, 2.5rem);
          line-height: 1.12;
          letter-spacing: -0.035em;
          font-weight: 650;
          margin: 0;
          color: var(--ink);
          text-wrap: balance;
        }
        .section-sub {
          margin: 0.85rem 0 0;
          font-size: 1.02rem;
          line-height: 1.6;
          color: var(--ink-3);
        }

        .lp [data-reveal] {
          opacity: 0;
          transform: translateY(16px);
          transition: opacity 0.7s cubic-bezier(0.2, 0.7, 0.2, 1), transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1);
          transition-delay: var(--d, 0ms);
        }
        .lp [data-reveal].is-in { opacity: 1; transform: none; }

        /* ── Products ── */
        .products {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border-top: 1px solid var(--line);
          border-left: 1px solid var(--line);
        }
        .product {
          position: relative;
          display: flex;
          flex-direction: column;
          padding: 1.6rem;
          border-right: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
          background: #ffffff;
          min-height: 270px;
        }
        .product::before {
          content: "";
          position: absolute;
          left: -1px;
          top: -1px;
          height: 2px;
          width: calc(100% + 2px);
          background: var(--blue);
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1);
        }
        .product:hover { background: var(--wash); }
        .product:hover::before { transform: scaleX(1); }
        .product-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
        .product-icon {
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--line);
          color: var(--blue);
          background: #ffffff;
          transition: border-color 0.2s ease;
        }
        .product:hover .product-icon { border-color: #bfdbfe; }
        .product-index { font-size: 0.75rem; color: var(--ink-faint); }
        .product-name {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 1.08rem;
          font-weight: 620;
          letter-spacing: -0.02em;
          color: var(--ink);
        }
        .product-arrow {
          color: var(--ink-soft);
          opacity: 0;
          transform: translate(-4px, 4px);
          transition: all 0.25s ease;
        }
        .product:hover .product-arrow { opacity: 1; transform: none; color: var(--blue); }
        .product-tagline { font-size: 0.82rem; color: var(--ink-soft); margin-top: 0.2rem; }
        .product-desc {
          margin: 0.9rem 0 0;
          font-size: 0.88rem;
          line-height: 1.55;
          color: var(--ink-3);
          flex: 1;
        }
        .product-specs { margin-top: 1.25rem; font-size: 0.72rem; color: var(--ink-soft); }

        /* ── Timeline ── */
        .timeline { position: relative; margin-bottom: 4rem; }
        .timeline-track {
          position: absolute;
          top: 17px;
          left: 18px;
          right: 18px;
          height: 1px;
          background: var(--line);
        }
        .timeline-track span {
          position: absolute;
          inset: 0;
          background: var(--blue);
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
          width: 36px;
          height: 36px;
          border: 1px solid var(--line);
          background: #ffffff;
          font-size: 0.8rem;
          color: var(--ink-soft);
          margin-bottom: 1.25rem;
          transition: all 0.4s ease;
          transition-delay: calc(var(--i) * 0.4s + 0.2s);
        }
        .timeline.is-in .timeline-node { border-color: var(--blue); background: var(--blue); color: #ffffff; }
        .timeline-title { font-size: 1.02rem; font-weight: 620; letter-spacing: -0.015em; color: var(--ink); }
        .timeline-body { margin: 0.4rem 0 0; font-size: 0.9rem; line-height: 1.55; color: var(--ink-3); }

        .facts {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border: 1px solid var(--line);
        }
        .fact { padding: 1.5rem; border-right: 1px solid var(--line); }
        .fact:last-child { border-right: none; }
        .fact-icon { color: var(--blue); margin-bottom: 1rem; }
        .fact-title { font-size: 0.95rem; font-weight: 600; color: var(--ink); }
        .fact-body { margin: 0.35rem 0 0; font-size: 0.86rem; line-height: 1.55; color: var(--ink-3); }

        /* ── Developers ── */
        .dev {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 4rem;
          align-items: start;
        }
        .code { margin-top: 2rem; border: 1px solid var(--line); background: var(--wash); }
        .code-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.45rem 0.6rem 0.45rem 0.45rem;
          border-bottom: 1px solid var(--line);
        }
        .code-tabs { display: flex; gap: 0.2rem; }
        .code-tab {
          background: transparent;
          border: 1px solid transparent;
          color: var(--ink-soft);
          font-size: 0.76rem;
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          padding: 0.3rem 0.65rem;
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
          color: var(--ink);
          font-size: 0.74rem;
          font-family: inherit;
          padding: 0.25rem 0.55rem;
          cursor: pointer;
          transition: border-color 0.15s ease;
        }
        .code-copy:hover { border-color: #cbd5e1; }
        .code-body {
          margin: 0;
          padding: 1rem 1.1rem;
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
        .tok-prompt { color: var(--ink-faint); }

        .agent {
          border: 1px solid var(--line);
          background: #ffffff;
          box-shadow: 0 30px 60px -36px rgba(11, 21, 48, 0.3);
        }
        .agent-head {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.7rem 1rem;
          border-bottom: 1px solid var(--line);
          font-size: 0.76rem;
          color: var(--ink-soft);
        }
        .agent-dot { width: 7px; height: 7px; border-radius: 50%; background: #16a34a; }
        .agent-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
        .agent-msg { font-size: 0.9rem; line-height: 1.5; }
        .agent-user { align-self: flex-end; background: var(--ink); color: #ffffff; padding: 0.55rem 0.85rem; }
        .agent-calls {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--line);
        }
        .agent-call {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 0.65rem;
          padding: 0.55rem 0.8rem;
          font-size: 0.76rem;
          border-bottom: 1px solid var(--line-soft);
        }
        .agent-call:last-child { border-bottom: none; }
        .agent-check { color: var(--green); }
        .agent-tool { color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .agent-result { color: var(--ink-soft); white-space: nowrap; }
        .agent-reply { color: var(--ink-2); }
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
          border: 1px solid var(--line);
        }
        .plan { display: flex; flex-direction: column; padding: 2.25rem; }
        .plan + .plan { border-left: 1px solid var(--line); }
        .plan-pro { background: var(--wash); }
        .plan-name { font-size: 0.85rem; font-weight: 600; color: var(--ink-soft); }
        .plan-price { margin-top: 0.5rem; font-size: 2rem; font-weight: 650; letter-spacing: -0.035em; color: var(--ink); }
        .plan-list {
          list-style: none;
          margin: 1.75rem 0 2rem;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          flex: 1;
        }
        .plan-list li { position: relative; padding-left: 1.4rem; font-size: 0.92rem; line-height: 1.5; color: var(--ink-2); }
        .plan-list li::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0.55em;
          width: 8px;
          height: 8px;
          border: 1.5px solid var(--blue);
        }
        .plan-btn { align-self: flex-start; }

        /* ── Closing ── */
        .closing {
          position: relative;
          max-width: 1200px;
          margin: 0 auto;
          padding: 7rem 1.5rem;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          border-bottom: 1px solid var(--line);
        }
        .closing-grid-bg {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(to right, var(--line-soft) 1px, transparent 1px),
            linear-gradient(to bottom, var(--line-soft) 1px, transparent 1px);
          background-size: 56px 56px;
          -webkit-mask-image: radial-gradient(ellipse 60% 70% at 50% 50%, #000 20%, transparent 75%);
          mask-image: radial-gradient(ellipse 60% 70% at 50% 50%, #000 20%, transparent 75%);
          pointer-events: none;
        }
        .closing > *:not(.closing-grid-bg) { position: relative; }
        .closing-title {
          font-size: clamp(2rem, 4.2vw, 3.25rem);
          line-height: 1.08;
          letter-spacing: -0.045em;
          font-weight: 650;
          max-width: 18ch;
          margin: 0;
          color: var(--ink);
          text-wrap: balance;
        }
        .closing-sub { margin: 1rem 0 2rem; font-size: 1.05rem; color: var(--ink-3); }

        /* ── Footer ── */
        .footer {
          max-width: 1200px;
          margin: 0 auto;
          padding: 3.5rem 1.5rem 3rem;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 2.5rem 4rem;
        }
        .footer-tag { margin: 0.85rem 0 0; font-size: 0.86rem; color: var(--ink-soft); max-width: 22rem; }
        .footer-cols { display: flex; gap: 4rem; }
        .footer-col { display: flex; flex-direction: column; gap: 0.6rem; }
        .footer-head {
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--ink-faint);
          margin-bottom: 0.3rem;
        }
        .footer-col a { font-size: 0.875rem; color: var(--ink-3); transition: color 0.15s ease; }
        .footer-col a:hover { color: var(--ink); }
        .footer-copy {
          grid-column: 1 / -1;
          padding-top: 1.5rem;
          border-top: 1px solid var(--line);
          font-size: 0.8rem;
          color: var(--ink-faint);
        }

        /* ── Keyframes ── */
        @keyframes lpWordIn { to { opacity: 1; transform: none; filter: blur(0); } }
        @keyframes lpFadeUp { to { opacity: 1; transform: none; } }
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
        }
        @media (max-width: 1000px) {
          .hero-inner { grid-template-columns: 1fr; gap: 3.5rem; padding-top: 4rem; }
          .dev { grid-template-columns: 1fr; gap: 3rem; }
          .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .fact:nth-child(2) { border-right: none; }
          .fact:nth-child(-n + 2) { border-bottom: 1px solid var(--line); }
          .lp-nav-links { gap: 1.25rem; }
        }
        @media (max-width: 760px) {
          .lp-nav { grid-template-columns: 1fr auto; }
          .lp-nav-links { display: none; }
          .section { padding: 4.5rem 1.25rem; }
          .products { grid-template-columns: 1fr; }
          .product { min-height: 0; }
          .timeline-track { top: 18px; bottom: 18px; left: 17px; right: auto; width: 1px; height: auto; }
          .timeline-track span { transform: scaleY(0); transform-origin: top; }
          .timeline.is-in .timeline-track span { transform: scaleY(1); }
          .timeline-steps { grid-template-columns: 1fr; gap: 1.75rem; }
          .timeline-step { padding-left: 3.25rem; position: relative; }
          .timeline-node { position: absolute; left: 0; top: 0; margin: 0; }
          .facts { grid-template-columns: 1fr; }
          .fact { border-right: none; border-bottom: 1px solid var(--line); }
          .fact:last-child { border-bottom: none; }
          .plans { grid-template-columns: 1fr; }
          .plan + .plan { border-left: none; border-top: 1px solid var(--line); }
          .visual-frame { display: none; }
          .deploy-ref { display: none; }
          .step-label { font-size: 0.64rem; }
          .footer { grid-template-columns: 1fr; }
          .footer-cols { gap: 2.5rem; flex-wrap: wrap; }
          .stack-label { display: none; }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-word, .hero-fade { animation: none; opacity: 1; transform: none; filter: none; }
          .lp [data-reveal] { opacity: 1; transform: none; transition: none; }
          .marquee-track { animation: none; }
          .agent-call, .agent-reply { opacity: 1; transform: none; transition: none; }
          .timeline-track span, .timeline-node { transition: none; }
          .log-row { animation: none; }
        }
      `}</style>
    </div>
  );
}
