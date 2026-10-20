"use client";

import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { CLOUD_SERVICES } from "@/lib/services";
import { useAuth } from "@/lib/auth";
import {
  ArrowRight,
  Globe,
  Server,
  Database,
  Terminal,
  ShieldCheck,
  Zap,
  Activity,
  Cpu,
  Layers,
  Sparkles,
  CheckCircle2,
  Lock,
  ArrowUpRight
} from "lucide-react";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const ctaHref = !loading && user ? "/dashboard" : "/register";
  const ctaLabel = !loading && user ? "Go to Console" : "Start Deploying Free";

  const getServiceIcon = (id: string) => {
    switch (id) {
      case "frontend-hosting":
        return <Globe size={20} className="text-sky-600" />;
      case "backend-hosting":
        return <Server size={20} className="text-indigo-600" />;
      case "managed-postgres":
        return <Database size={20} className="text-violet-600" />;
      case "managed-redis":
        return <Zap size={20} className="text-amber-600" />;
      case "devops-mcp":
        return <Terminal size={20} className="text-purple-600" />;
      default:
        return <Layers size={20} className="text-indigo-600" />;
    }
  };

  return (
    <div className="landing-shell aurora-bg">
      {/* Top Glass Navigation */}
      <header className="landing-nav-wrapper">
        <div className="landing-nav">
          <BrandMark href="/" />
          
          <nav className="landing-nav-links">
            <a href="#services" className="nav-link-item">Services</a>
            <a href="#architecture" className="nav-link-item">Architecture</a>
            <a href="#capabilities" className="nav-link-item">Platform</a>
            <Link href="/dashboard/mcp" className="nav-link-item flex items-center gap-1">
              MCP Server
              <span className="nav-sub-badge">AI</span>
            </Link>
          </nav>

          <div className="landing-nav-cta">
            {user ? (
              <Link href="/dashboard" className="btn btn-primary btn-sm">
                Console <ArrowRight size={14} />
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" className="btn btn-secondary btn-sm">Sign in</Link>
                <Link href="/register" className="btn btn-primary btn-sm">Get started</Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="hero-pill-badge">
          <span className="hero-pulse-dot" />
          <span className="font-semibold text-slate-800">Production Cloud Platform</span>
          <span className="text-slate-400">•</span>
          <span className="text-indigo-600 font-medium">Sub-5ms Edge Routing</span>
        </div>

        <h1 className="hero-headline">
          The Cloud Platform Built for <br />
          <span className="headline-gradient">Speed & Precision</span>
        </h1>

        <p className="hero-lead-text">
          Deploy Next.js & Vite frontends, containerized Docker microservices, and managed relational databases with zero DevOps friction. Real-time telemetry, automated edge SSL, and native AI agent tooling.
        </p>

        <div className="hero-cta-row">
          <Link href={ctaHref} className="btn btn-primary btn-lg" id="hero-cta-btn">
            {ctaLabel} <ArrowRight size={16} />
          </Link>
          <Link href="/dashboard/hosting" className="btn btn-secondary btn-lg">
            Explore Deployments
          </Link>
        </div>

        <div className="hero-feature-pills">
          <span className="feature-pill"><Globe size={13} className="text-sky-600" /> Global Edge CDN</span>
          <span className="feature-pill"><ShieldCheck size={13} className="text-emerald-600" /> Automated TLS 1.3</span>
          <span className="feature-pill"><Cpu size={13} className="text-indigo-600" /> Instant Containers</span>
          <span className="feature-pill"><Terminal size={13} className="text-purple-600" /> AI Agent MCP Ready</span>
        </div>
      </section>

      {/* Interactive Architecture Snapshot */}
      <section id="architecture" className="landing-section">
        <div className="architecture-card">
          <div className="architecture-header">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="font-mono text-xs font-semibold text-slate-600">WHIZAN CLOUD SERVICE MESH</span>
            </div>
            <div className="text-xs text-slate-400 font-mono">whizan.cloud • HTTP / HTTPS EDGE PROXY</div>
          </div>
          
          <div className="architecture-grid">
            <div className="arch-node">
              <div className="arch-node-icon bg-sky-50 text-sky-600">
                <Globe size={18} />
              </div>
              <div className="arch-node-title">Edge Router</div>
              <div className="arch-node-desc">Sub-millisecond SSL termination & path routing</div>
            </div>

            <div className="arch-connector">
              <div className="connector-line" />
              <div className="connector-badge">REST / WS</div>
            </div>

            <div className="arch-node arch-node-highlight">
              <div className="arch-node-icon bg-indigo-50 text-indigo-600">
                <Server size={18} />
              </div>
              <div className="arch-node-title">Docker Runtimes</div>
              <div className="arch-node-desc">Isolated multi-stage containers with health checks</div>
            </div>

            <div className="arch-connector">
              <div className="connector-line" />
              <div className="connector-badge">TCP Mesh</div>
            </div>

            <div className="arch-node">
              <div className="arch-node-icon bg-violet-50 text-violet-600">
                <Database size={18} />
              </div>
              <div className="arch-node-title">PostgreSQL & Redis</div>
              <div className="arch-node-desc">Dedicated persistence with pooling & low latency</div>
            </div>
          </div>
        </div>
      </section>

      {/* Cloud Suite Grid */}
      <section id="services" className="landing-section">
        <div className="section-header-block">
          <div className="section-eyebrow">Cloud Infrastructure</div>
          <h2 className="section-title">Everything your application needs to scale</h2>
          <p className="section-desc">Unified control plane across edge runtimes, isolated containers, and relational databases.</p>
        </div>

        <div className="services-grid">
          {CLOUD_SERVICES.map(svc => (
            <div key={svc.id} className="card card-hoverable service-showcase-card">
              <div className="service-card-top">
                <div className="service-icon-box">
                  {getServiceIcon(svc.id)}
                </div>
                <span className="badge badge-ready">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Live
                </span>
              </div>

              <h3 className="showcase-title">{svc.name}</h3>
              <div className="showcase-tagline">{svc.tagline}</div>
              <p className="showcase-desc">{svc.description}</p>

              <div className="showcase-specs mono">{svc.specs}</div>

              <div style={{ marginTop: "auto", paddingTop: "1rem" }}>
                <Link href={ctaHref} className="btn btn-secondary btn-sm" style={{ width: "100%" }}>
                  <span>Deploy {svc.name.split(" ")[0]}</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Platform Capabilities */}
      <section id="capabilities" className="landing-section">
        <div className="section-header-block">
          <div className="section-eyebrow">Developer Experience</div>
          <h2 className="section-title">Designed for engineering teams</h2>
          <p className="section-desc">Move from git push to production in seconds with zero server maintenance.</p>
        </div>

        <div className="capabilities-grid">
          <div className="card capability-card">
            <div className="capability-icon bg-sky-50 text-sky-600">
              <Zap size={22} />
            </div>
            <h3 className="capability-title">Zero-Downtime Cutovers</h3>
            <p className="capability-desc">
              New builds spin up in isolated containers, undergo automated HTTP health probes, and transition live traffic with zero dropped requests.
            </p>
          </div>

          <div className="card capability-card">
            <div className="capability-icon bg-indigo-50 text-indigo-600">
              <Terminal size={22} />
            </div>
            <h3 className="capability-title">DevOps Agent MCP</h3>
            <p className="capability-desc">
              Connect your favorite AI IDE — Cursor, Windsurf, Claude — to autonomously audit, configure, and ship services via model context protocols.
            </p>
          </div>

          <div className="card capability-card">
            <div className="capability-icon bg-emerald-50 text-emerald-600">
              <ShieldCheck size={22} />
            </div>
            <h3 className="capability-title">Automated SSL & Security</h3>
            <p className="capability-desc">
              Wildcard TLS encryption, hardened container isolation, and AES-256 encrypted environment variables standard across every project.
            </p>
          </div>

          <div className="card capability-card">
            <div className="capability-icon bg-amber-50 text-amber-600">
              <Activity size={22} />
            </div>
            <h3 className="capability-title">Real-Time Telemetry</h3>
            <p className="capability-desc">
              Live streaming build terminals, container memory/CPU metrics, and web query runners keep you in total control of your cloud runtime.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Callout */}
      <section className="landing-section" style={{ paddingBottom: "4.5rem" }}>
        <div className="cta-banner-card">
          <div className="cta-banner-content">
            <h2 className="cta-banner-title">Start deploying on Whizan Cloud today</h2>
            <p className="cta-banner-desc">
              Connect your GitHub repository and experience seamless, lightning-fast edge hosting and backend microservices.
            </p>
          </div>
          <div className="cta-banner-actions">
            <Link href={ctaHref} className="btn btn-primary btn-lg">
              {ctaLabel} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <BrandMark />
          <div className="footer-links-row">
            <Link href="/dashboard" className="footer-link">Console</Link>
            <Link href="/dashboard/hosting" className="footer-link">Frontend</Link>
            <Link href="/dashboard/backend" className="footer-link">Backend</Link>
            <Link href="/dashboard/databases" className="footer-link">Databases</Link>
            <Link href="/dashboard/mcp" className="footer-link">MCP</Link>
          </div>
          <div className="footer-copy">
            © {new Date().getFullYear()} Whizan Cloud Services. All rights reserved.
          </div>
        </div>
      </footer>

      <style>{`
        .landing-shell {
          min-height: 100vh;
          color: var(--foreground);
        }

        .landing-nav-wrapper {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(226, 232, 240, 0.8);
        }

        .landing-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          max-width: 1200px;
          margin: 0 auto;
          padding: 1rem 1.75rem;
        }

        .landing-nav-links {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        .nav-link-item {
          color: var(--muted);
          text-decoration: none;
          font-size: 0.88rem;
          font-weight: 500;
          transition: color 0.15s ease;
        }
        .nav-link-item:hover {
          color: var(--foreground);
        }
        .nav-sub-badge {
          font-size: 0.62rem;
          font-weight: 700;
          background: rgba(79, 70, 229, 0.1);
          color: var(--accent);
          padding: 0.1rem 0.35rem;
          border-radius: 4px;
        }

        /* Hero */
        .landing-hero {
          max-width: 880px;
          margin: 0 auto;
          padding: 5rem 1.5rem 3.5rem;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .hero-pill-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.35rem 0.95rem;
          border-radius: 9999px;
          background: #ffffff;
          border: 1px solid rgba(79, 70, 229, 0.2);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
          font-size: 0.78rem;
          margin-bottom: 1.5rem;
        }
        .hero-pulse-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 6px #10b981;
        }

        .hero-headline {
          font-size: clamp(2.4rem, 5.5vw, 4rem);
          font-weight: 800;
          letter-spacing: -0.04em;
          line-height: 1.1;
          color: var(--foreground);
          margin-bottom: 1.25rem;
        }
        .headline-gradient {
          background: linear-gradient(135deg, #1e1b4b 0%, #4338ca 40%, #0284c7 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-lead-text {
          font-size: 1.08rem;
          color: var(--muted);
          line-height: 1.6;
          max-width: 44rem;
          margin-bottom: 2rem;
        }

        .hero-cta-row {
          display: flex;
          gap: 0.85rem;
          margin-bottom: 2.25rem;
          flex-wrap: wrap;
          justify-content: center;
        }

        .hero-feature-pills {
          display: flex;
          gap: 0.65rem;
          flex-wrap: wrap;
          justify-content: center;
        }
        .feature-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--muted);
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 9999px;
          padding: 0.35rem 0.85rem;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
        }

        /* Architecture Card */
        .architecture-card {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 1.75rem;
          box-shadow: var(--shadow-md);
        }
        .architecture-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 1.25rem;
          border-bottom: 1px solid var(--border);
          margin-bottom: 1.5rem;
        }
        .architecture-grid {
          display: grid;
          grid-template-columns: 1fr auto 1fr auto 1fr;
          align-items: center;
          gap: 1rem;
        }
        .arch-node {
          background: var(--bg-inset);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.25rem 1rem;
          text-align: center;
        }
        .arch-node-highlight {
          background: rgba(79, 70, 229, 0.04);
          border-color: rgba(79, 70, 229, 0.3);
        }
        .arch-node-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 0.6rem;
        }
        .arch-node-title {
          font-size: 0.92rem;
          font-weight: 650;
          color: var(--foreground);
          margin-bottom: 0.25rem;
        }
        .arch-node-desc {
          font-size: 0.76rem;
          color: var(--muted);
          line-height: 1.4;
        }
        .arch-connector {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
        }
        .connector-line {
          width: 30px;
          height: 2px;
          background: #cbd5e1;
        }
        .connector-badge {
          font-size: 0.62rem;
          font-family: var(--font-geist-mono), monospace;
          background: #f1f5f9;
          color: #64748b;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
          border: 1px solid #e2e8f0;
        }

        /* Section Layouts */
        .landing-section {
          max-width: 1200px;
          margin: 0 auto;
          padding: 3.5rem 1.5rem;
        }

        .section-header-block {
          text-align: center;
          max-width: 680px;
          margin: 0 auto 2.5rem;
        }
        .section-eyebrow {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--accent);
          margin-bottom: 0.5rem;
        }
        .section-title {
          font-size: 2rem;
          font-weight: 750;
          letter-spacing: -0.03em;
          color: var(--foreground);
          margin-bottom: 0.5rem;
        }
        .section-desc {
          font-size: 0.95rem;
          color: var(--muted);
          line-height: 1.55;
        }

        /* Services Showcase */
        .services-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 1.25rem;
        }
        .service-showcase-card {
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          border-radius: var(--radius);
          background: #ffffff;
        }
        .service-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.25rem;
        }
        .service-icon-box {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          background: #f8fafc;
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .showcase-title {
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin-bottom: 0.25rem;
          color: var(--foreground);
        }
        .showcase-tagline {
          font-size: 0.8rem;
          color: var(--accent);
          font-weight: 600;
          margin-bottom: 0.65rem;
        }
        .showcase-desc {
          font-size: 0.84rem;
          color: var(--muted);
          line-height: 1.5;
          margin-bottom: 1rem;
        }
        .showcase-specs {
          font-size: 0.72rem;
          color: #475569;
          background: #f1f5f9;
          padding: 0.25rem 0.55rem;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          margin-bottom: 0.75rem;
          display: inline-block;
        }

        /* Capabilities */
        .capabilities-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 1.25rem;
        }
        .capability-card {
          padding: 1.75rem;
          border-radius: var(--radius);
          background: #ffffff;
        }
        .capability-icon {
          width: 46px;
          height: 46px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1.25rem;
        }
        .capability-title {
          font-size: 1.05rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin-bottom: 0.5rem;
          color: var(--foreground);
        }
        .capability-desc {
          font-size: 0.85rem;
          color: var(--muted);
          line-height: 1.55;
        }

        /* CTA Banner */
        .cta-banner-card {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 2.75rem 2.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2rem;
          box-shadow: var(--shadow-md);
        }
        .cta-banner-title {
          font-size: 1.75rem;
          font-weight: 750;
          letter-spacing: -0.03em;
          color: var(--foreground);
          margin-bottom: 0.5rem;
        }
        .cta-banner-desc {
          font-size: 0.95rem;
          color: var(--muted);
          max-width: 36rem;
          line-height: 1.5;
        }

        /* Footer */
        .landing-footer {
          border-top: 1px solid var(--border);
          background: #ffffff;
          padding: 2.5rem 1.5rem;
        }
        .landing-footer-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1.5rem;
        }
        .footer-links-row {
          display: flex;
          gap: 1.5rem;
        }
        .footer-link {
          font-size: 0.85rem;
          color: var(--muted);
          text-decoration: none;
          transition: color 0.15s ease;
        }
        .footer-link:hover {
          color: var(--foreground);
        }
        .footer-copy {
          font-size: 0.8rem;
          color: var(--muted-fg);
        }

        /* Responsive Breakpoints */
        @media (max-width: 900px) {
          .architecture-grid {
            grid-template-columns: 1fr;
            gap: 0.75rem;
          }
          .connector-line {
            width: 2px;
            height: 20px;
          }
          .cta-banner-card {
            flex-direction: column;
            text-align: center;
          }
          .landing-nav-links {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
