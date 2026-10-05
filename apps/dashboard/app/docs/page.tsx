"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Terminal,
  Server,
  Globe,
  Zap,
  Database,
  Clock,
  Workflow,
  Code2,
  Copy,
  Check,
  Search,
  ArrowRight,
  Sparkles,
  Bot,
  Layers,
  ChevronRight,
  ShieldCheck,
  Cpu
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand";

interface DocCard {
  slug: string;
  title: string;
  category: string;
  tagline: string;
  icon: any;
  colorClass: string;
  tags: string[];
  whenToUseSummary: string;
}

const SERVICES_DIRECTORY: DocCard[] = [
  {
    slug: "frontend",
    title: "Frontend Web Hosting",
    category: "Compute & Applications",
    tagline: "Edge CDN hosting for modern web frontends with automated build optimization, SSL, and instant preview branches.",
    icon: Globe,
    colorClass: "sky",
    tags: ["Next.js", "Vite", "React", "Astro"],
    whenToUseSummary: "Single-page apps, SSR websites, marketing landing pages, and documentation portals requiring global CDN distribution."
  },
  {
    slug: "backend",
    title: "Backend Microservices & APIs",
    category: "Compute & Applications",
    tagline: "Run containerized backend services, REST & GraphQL APIs, and background queue workers with auto-healing and logs.",
    icon: Server,
    colorClass: "indigo",
    tags: ["Node.js", "Python FastAPI", "Go", "Docker"],
    whenToUseSummary: "Persistent web backends, databases ORMs, WebSockets, background queue workers, and custom Dockerfiles."
  },
  {
    slug: "functions",
    title: "Serverless Edge Functions",
    category: "Compute & Applications",
    tagline: "Event-driven serverless functions with sub-5ms cold starts, zero ports to manage, and automatic request routing.",
    icon: Zap,
    colorClass: "violet",
    tags: ["TypeScript", "JavaScript", "V8 Isolate", "Webhooks"],
    whenToUseSummary: "Third-party webhooks (Stripe, GitHub), auth tokens, form endpoints, and lightweight mutations without running servers 24/7."
  },
  {
    slug: "databases",
    title: "Managed Persistence",
    category: "Compute & Applications",
    tagline: "Dedicated PostgreSQL clusters and high-throughput Redis instances with instant connection strings and pooling.",
    icon: Database,
    colorClass: "emerald",
    tags: ["PostgreSQL 16", "Redis 7", "PgBouncer", "TLS"],
    whenToUseSummary: "Relational business databases, transaction storage, Redis session caches, rate-limiting, and job queue brokers."
  },
  {
    slug: "cron",
    title: "Scheduled Cron Jobs",
    category: "Developer Tools",
    tagline: "Recurring schedules using standard cron syntax to trigger functions, invoke microservices, or execute CLI tasks.",
    icon: Clock,
    colorClass: "blue",
    tags: ["Cron 5-Field", "Nightly Rollups", "Maintenance"],
    whenToUseSummary: "Nightly data aggregations, periodic third-party API syncing, database cleanups, and automated notification batches."
  },
  {
    slug: "flow",
    title: "Whizan Flow (Pipelines)",
    category: "Developer Tools",
    tagline: "Build multi-step deployment pipelines, sanity test gates, automated rollbacks, and team approval workflows.",
    icon: Workflow,
    colorClass: "indigo",
    tags: ["Release Pipelines", "Step Approvals", "Rollbacks"],
    whenToUseSummary: "Multi-stage deployment workflows (Migrate DB -> Smoke Test -> Cutover -> Post Slack alert) with team approvals."
  },
  {
    slug: "cli",
    title: "Whizan CLI & DevOps MCP",
    category: "Developer Tools",
    tagline: "Deploy from your terminal or pair-program with AI coding assistants (Cursor, Windsurf, VS Code, Antigravity).",
    icon: Terminal,
    colorClass: "slate",
    tags: ["@whizan/cli", "MCP Server", "Cursor / VS Code"],
    whenToUseSummary: "Automated CI/CD terminal deployments, local workspace synchronization, and autonomous AI pair programming."
  },
  {
    slug: "api",
    title: "REST API Reference",
    category: "Developer Tools",
    tagline: "Programmatic REST API for managing projects, services, deployments, environment variables, and telemetry streams.",
    icon: Code2,
    colorClass: "indigo",
    tags: ["REST Endpoints", "Bearer Token", "JSON"],
    whenToUseSummary: "Custom internal portals, automated deployment webhooks, and programmatic infrastructure management scripts."
  }
];

export default function DocsIndexPage() {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  function copyCode(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedCmd(null), 2000);
  }

  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return SERVICES_DIRECTORY;
    return SERVICES_DIRECTORY.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.tagline.toLowerCase().includes(q) ||
        s.whenToUseSummary.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  return (
    <div className="docs-shell">
      {/* Top Header */}
      <header className="docs-nav-header">
        <div className="docs-container docs-nav-inner">
          <div className="flex items-center gap-3">
            <BrandMark href="/dashboard" />
            <span className="docs-header-pill">Documentation Hub</span>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="btn btn-secondary btn-sm">
              <ArrowLeft size={14} /> Back to Console
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="docs-container docs-main-content">
        {/* Hero Section */}
        <section className="docs-hero-section">
          <div className="docs-hero-badge">
            <BookOpen size={14} className="text-indigo-600" />
            <span>Developer Guides & Service Reference</span>
          </div>
          <h1 className="docs-hero-title">Whizan Cloud Documentation</h1>
          <p className="docs-hero-sub">
            Learn how to choose, deploy, configure, and scale cloud workloads across web frontends, backend microservices, serverless functions, and scheduled workers.
          </p>

          {/* Quick Terminal Snippets */}
          <div className="hero-snippets-row">
            <div className="hero-snippet-card">
              <span className="snippet-type-tag">CLI</span>
              <code className="snippet-code">npm install -g @whizan/cli</code>
              <button
                onClick={() => copyCode("npm install -g @whizan/cli", "cli")}
                className="snippet-copy-btn"
                aria-label="Copy CLI command"
              >
                {copiedCmd === "cli" ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
              </button>
            </div>

            <div className="hero-snippet-card">
              <span className="snippet-type-tag tag-mcp">MCP</span>
              <code className="snippet-code">npx @whizan/mcp-devops login</code>
              <button
                onClick={() => copyCode("npx @whizan/mcp-devops login", "mcp")}
                className="snippet-copy-btn"
                aria-label="Copy MCP command"
              >
                {copiedCmd === "mcp" ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="docs-search-bar">
            <Search size={16} className="text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documentation by service, framework (e.g. Next.js, FastAPI, Postgres)..."
              className="docs-search-input"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="clear-btn">
                ✕
              </button>
            )}
          </div>
        </section>

        {/* Services Directory Grid */}
        <section className="docs-directory-section">
          <div className="directory-header-row">
            <div>
              <h2 className="directory-heading">Cloud Services & Workloads</h2>
              <p className="directory-subheading">
                Explore in-depth guides on when to use each service, step-by-step deployment instructions, and code examples.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-500">
              {filteredServices.length} {filteredServices.length === 1 ? "Guide" : "Guides"}
            </span>
          </div>

          <div className="services-cards-grid">
            {filteredServices.map((service) => {
              const Icon = service.icon;
              return (
                <Link
                  key={service.slug}
                  href={`/docs/${service.slug}`}
                  className="service-doc-card"
                >
                  <div className="card-top-row">
                    <div className={`service-icon-box box-${service.colorClass}`}>
                      <Icon size={22} />
                    </div>
                    <span className="category-pill">{service.category}</span>
                  </div>

                  <h3 className="service-doc-title">{service.title}</h3>
                  <p className="service-doc-desc">{service.tagline}</p>

                  <div className="when-summary-box">
                    <span className="when-label">When to Use:</span>
                    <p className="when-text">{service.whenToUseSummary}</p>
                  </div>

                  <div className="tech-tags-list">
                    {service.tags.map((tag) => (
                      <span key={tag} className="tech-tag-chip">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="service-card-footer">
                    <span>Read Full Guide & How to Use</span>
                    <ArrowRight size={14} className="footer-arrow" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Quick Decision Comparison Table */}
        <section className="decision-matrix-section">
          <div className="matrix-card">
            <h2 className="matrix-title">Workload Comparison: When to Use Which Service</h2>
            <p className="matrix-subtitle">
              Quick reference guide to select the optimal compute model for your application requirements.
            </p>

            <div className="table-responsive-wrapper">
              <table className="decision-table">
                <thead>
                  <tr>
                    <th>Workload Type</th>
                    <th>Ideal For</th>
                    <th>Execution Model</th>
                    <th>Compute & Scaling</th>
                    <th>Guide</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <Globe size={15} className="text-sky-600" />
                        <span>Frontend Hosting</span>
                      </div>
                    </td>
                    <td>Next.js SSR, Vite, React, Astro SPAs, Landing pages</td>
                    <td>Edge CDN & Standalone Next.js</td>
                    <td>Instant global edge cache</td>
                    <td>
                      <Link href="/docs/frontend" className="table-doc-link">
                        View Docs →
                      </Link>
                    </td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <Server size={15} className="text-indigo-600" />
                        <span>Backend Microservices</span>
                      </div>
                    </td>
                    <td>APIs (Node, Python, Go), WebSockets, Database ORMs</td>
                    <td>Containerized Long-running Process</td>
                    <td>Dedicated CPU/RAM with auto-sleep</td>
                    <td>
                      <Link href="/docs/backend" className="table-doc-link">
                        View Docs →
                      </Link>
                    </td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <Zap size={15} className="text-violet-600" />
                        <span>Serverless Edge Functions</span>
                      </div>
                    </td>
                    <td>Stripe webhooks, GitHub events, micro-endpoints, auth hooks</td>
                    <td>Event-Driven V8 Runtime</td>
                    <td>Sub-5ms cold start, zero idle cost</td>
                    <td>
                      <Link href="/docs/functions" className="table-doc-link">
                        View Docs →
                      </Link>
                    </td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <Database size={15} className="text-emerald-600" />
                        <span>Managed Persistence</span>
                      </div>
                    </td>
                    <td>Relational structured records, session cache, job queues</td>
                    <td>Dedicated PostgreSQL & Redis</td>
                    <td>PgBouncer pooled connections</td>
                    <td>
                      <Link href="/docs/databases" className="table-doc-link">
                        View Docs →
                      </Link>
                    </td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <Clock size={15} className="text-blue-600" />
                        <span>Cron Jobs</span>
                      </div>
                    </td>
                    <td>Nightly rollups, periodic syncs, cleanup tasks</td>
                    <td>Event-driven Scheduler (5-field syntax)</td>
                    <td>Triggers Functions, Services, or CLI</td>
                    <td>
                      <Link href="/docs/cron" className="table-doc-link">
                        View Docs →
                      </Link>
                    </td>
                  </tr>
                  <tr>
                    <td className="font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <Workflow size={15} className="text-indigo-600" />
                        <span>Whizan Flow</span>
                      </div>
                    </td>
                    <td>Multi-step release pipelines, gated approvals, rollback triggers</td>
                    <td>Pipeline Automation Engine</td>
                    <td>Visual or TypeScript Flow DSL</td>
                    <td>
                      <Link href="/docs/flow" className="table-doc-link">
                        View Docs →
                      </Link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      <style>{`
        .docs-shell {
          min-height: 100vh;
          background: #fafbfc;
          color: #0f172a;
        }
        .docs-container {
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 2rem;
          width: 100%;
        }

        /* Nav Header */
        .docs-nav-header {
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
        }
        .docs-nav-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 0.85rem;
          padding-bottom: 0.85rem;
        }
        .docs-header-pill {
          font-size: 0.72rem;
          font-weight: 700;
          color: #4f46e5;
          background: #eef2ff;
          border: 1px solid #c7d2fe;
          border-radius: 9999px;
          padding: 0.15rem 0.55rem;
        }

        /* Hero */
        .docs-main-content {
          padding-top: 3rem;
          padding-bottom: 5rem;
        }
        .docs-hero-section {
          text-align: center;
          max-width: 780px;
          margin: 0 auto 3.5rem;
        }
        .docs-hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          font-size: 0.74rem;
          font-weight: 650;
          color: #4f46e5;
          background: #eef2ff;
          border: 1px solid #c7d2fe;
          border-radius: 9999px;
          padding: 0.25rem 0.75rem;
          margin-bottom: 1rem;
        }
        .docs-hero-title {
          font-size: 2.5rem;
          font-weight: 800;
          letter-spacing: -0.035em;
          color: var(--foreground);
          line-height: 1.15;
          margin-bottom: 0.85rem;
        }
        .docs-hero-sub {
          font-size: 1.05rem;
          color: var(--muted);
          line-height: 1.6;
        }

        /* Snippets Row */
        .hero-snippets-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          margin-top: 1.75rem;
          flex-wrap: wrap;
        }
        .hero-snippet-card {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.45rem 0.75rem;
          font-family: var(--font-geist-mono), monospace;
          font-size: 0.78rem;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
        }
        .snippet-type-tag {
          font-size: 0.65rem;
          font-weight: 700;
          padding: 0.1rem 0.35rem;
          border-radius: 4px;
          background: #f1f5f9;
          color: #475569;
        }
        .tag-mcp {
          background: #eef2ff;
          color: #4f46e5;
        }
        .snippet-code {
          color: #1e293b;
        }
        .snippet-copy-btn {
          border: none;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          padding: 0.2rem;
          display: flex;
          align-items: center;
        }
        .snippet-copy-btn:hover {
          color: #0f172a;
        }

        /* Search Bar */
        .docs-search-bar {
          position: relative;
          display: flex;
          align-items: center;
          max-width: 580px;
          margin: 1.75rem auto 0;
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 0.65rem 1rem;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
          gap: 0.75rem;
        }
        .docs-search-input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 0.88rem;
          background: transparent;
        }
        .clear-btn {
          border: none;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          font-size: 0.75rem;
        }

        /* Directory Section */
        .docs-directory-section {
          margin-bottom: 4rem;
        }
        .directory-header-row {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          margin-bottom: 1.75rem;
          gap: 1rem;
        }
        .directory-heading {
          font-size: 1.45rem;
          font-weight: 750;
          letter-spacing: -0.025em;
          color: var(--foreground);
        }
        .directory-subheading {
          font-size: 0.88rem;
          color: var(--muted);
          margin-top: 0.25rem;
        }

        /* Grid */
        .services-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
          gap: 1.5rem;
        }
        .service-doc-card {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 1.75rem;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
          transition: all 0.18s ease;
        }
        .service-doc-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.05);
          transform: translateY(-2px);
        }
        .card-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.15rem;
        }
        .service-icon-box {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .box-sky {
          background: #f0f9ff;
          color: #0284c7;
          border: 1px solid #e0f2fe;
        }
        .box-indigo {
          background: #eef2ff;
          color: #4f46e5;
          border: 1px solid #e0e7ff;
        }
        .box-violet {
          background: #f5f3ff;
          color: #7c3aed;
          border: 1px solid #ede9fe;
        }
        .box-emerald {
          background: #ecfdf5;
          color: #059669;
          border: 1px solid #d1fae5;
        }
        .box-blue {
          background: #eff6ff;
          color: #2563eb;
          border: 1px solid #dbeafe;
        }
        .box-slate {
          background: #f1f5f9;
          color: #334155;
          border: 1px solid #e2e8f0;
        }
        .category-pill {
          font-size: 0.68rem;
          font-weight: 600;
          color: #64748b;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 0.15rem 0.45rem;
        }
        .service-doc-title {
          font-size: 1.15rem;
          font-weight: 750;
          color: var(--foreground);
          letter-spacing: -0.015em;
          margin-bottom: 0.45rem;
        }
        .service-doc-desc {
          font-size: 0.835rem;
          color: var(--muted);
          line-height: 1.5;
          margin-bottom: 1.15rem;
        }
        .when-summary-box {
          background: #f8fafc;
          border: 1px solid #f1f5f9;
          border-radius: 6px;
          padding: 0.65rem 0.85rem;
          margin-bottom: 1rem;
        }
        .when-label {
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #059669;
          display: block;
          margin-bottom: 0.2rem;
        }
        .when-text {
          font-size: 0.78rem;
          color: #334155;
          line-height: 1.45;
          margin: 0;
        }
        .tech-tags-list {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex-wrap: wrap;
          margin-top: auto;
          margin-bottom: 1.25rem;
        }
        .tech-tag-chip {
          font-size: 0.68rem;
          font-weight: 600;
          color: #475569;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 0.1rem 0.4rem;
        }
        .service-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 0.85rem;
          border-top: 1px solid #f1f5f9;
          font-size: 0.82rem;
          font-weight: 650;
          color: var(--accent);
        }
        .footer-arrow {
          transition: transform 0.15s ease;
        }
        .service-doc-card:hover .footer-arrow {
          transform: translateX(3px);
        }

        /* Matrix Section */
        .decision-matrix-section {
          margin-top: 2rem;
        }
        .matrix-card {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 2rem 2.25rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }
        .matrix-title {
          font-size: 1.25rem;
          font-weight: 750;
          letter-spacing: -0.02em;
          color: var(--foreground);
        }
        .matrix-subtitle {
          font-size: 0.85rem;
          color: var(--muted);
          margin-top: 0.25rem;
          margin-bottom: 1.5rem;
        }
        .table-responsive-wrapper {
          overflow-x: auto;
        }
        .decision-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.82rem;
          min-width: 680px;
        }
        .decision-table th {
          background: #f8fafc;
          padding: 0.75rem 1rem;
          text-align: left;
          font-weight: 650;
          color: #475569;
          border-bottom: 1px solid var(--border);
        }
        .decision-table td {
          padding: 0.85rem 1rem;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
          vertical-align: middle;
        }
        .decision-table tr:last-child td {
          border-bottom: none;
        }
        .table-doc-link {
          font-weight: 600;
          color: var(--accent);
          text-decoration: none;
          white-space: nowrap;
        }
        .table-doc-link:hover {
          text-decoration: underline;
        }

        @media (max-width: 768px) {
          .services-cards-grid {
            grid-template-columns: 1fr;
          }
          .docs-hero-title {
            font-size: 1.95rem;
          }
          .matrix-card {
            padding: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}
