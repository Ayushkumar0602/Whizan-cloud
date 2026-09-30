"use client";

import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { CLOUD_SERVICES } from "@/lib/services";
import { useAuth } from "@/lib/auth";
import {
  ArrowRight,
  CheckCircle2,
  Globe,
  Server,
  Database,
  Terminal,
  ShieldCheck,
  Zap,
  Activity,
  Cpu,
  Lock,
  Layers
} from "lucide-react";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const ctaHref = !loading && user ? "/dashboard" : "/register";
  const ctaLabel = !loading && user ? "Go to Console" : "Start Deploying Free";

  const getServiceIcon = (id: string) => {
    switch (id) {
      case "frontend-hosting":
        return <Globe size={22} style={{ color: "#38bdf8" }} />;
      case "backend-hosting":
        return <Server size={22} className="text-accent" />;
      case "managed-postgres":
        return <Database size={22} style={{ color: "#818cf8" }} />;
      case "managed-redis":
        return <Zap size={22} style={{ color: "#f59e0b" }} />;
      case "devops-mcp":
        return <Terminal size={22} style={{ color: "#a855f7" }} />;
      default:
        return <Layers size={22} className="text-accent" />;
    }
  };

  return (
    <div className="landing-shell">
      {/* Top Navigation */}
      <header className="landing-nav">
        <BrandMark />
        <nav className="landing-nav-links">
          <a href="#services">Services</a>
          <a href="#capabilities">Platform</a>
          <Link href="/dashboard/mcp" className="nav-text-link">MCP Server</Link>
          {user ? (
            <Link href="/dashboard" className="btn btn-primary btn-sm">
              Console <ArrowRight size={14} />
            </Link>
          ) : (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <Link href="/login" className="btn btn-secondary btn-sm">Sign in</Link>
              <Link href="/register" className="btn btn-primary btn-sm">Get started</Link>
            </div>
          )}
        </nav>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="hero-pill-badge">
          <span className="hero-pulse-dot" />
          <span>Production Cloud Platform</span>
        </div>

        <h1 className="hero-headline">
          The Cloud Platform Built for <span className="headline-gradient">Speed & Precision</span>
        </h1>

        <p className="hero-lead-text">
          Deploy Next.js & Vite frontends, containerized Docker backends, and managed databases with zero DevOps friction. Real-time observability, automated edge SSL, and sub-millisecond routing.
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
          <span className="feature-pill"><Globe size={13} /> Global Edge CDN</span>
          <span className="feature-pill"><ShieldCheck size={13} /> Automatic Wildcard SSL</span>
          <span className="feature-pill"><Cpu size={13} /> Instant Container Deploys</span>
          <span className="feature-pill"><Terminal size={13} /> AI Agent MCP Ready</span>
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
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
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
            <div className="capability-icon" style={{ background: "rgba(56, 189, 248, 0.12)", color: "#38bdf8" }}>
              <Zap size={22} />
            </div>
            <h3 className="capability-title">Zero-Downtime Cutovers</h3>
            <p className="capability-desc">
              New builds spin up in isolated containers, undergo automated HTTP health probes, and transition live traffic with zero dropped requests.
            </p>
          </div>

          <div className="card capability-card">
            <div className="capability-icon" style={{ background: "rgba(99, 102, 241, 0.12)", color: "#818cf8" }}>
              <Terminal size={22} />
            </div>
            <h3 className="capability-title">DevOps Agent MCP</h3>
            <p className="capability-desc">
              Connect your favorite AI IDE — Cursor, Windsurf, Claude — to autonomously audit, configure, and ship services via model context protocols.
            </p>
          </div>

          <div className="card capability-card">
            <div className="capability-icon" style={{ background: "rgba(16, 185, 129, 0.12)", color: "#34d399" }}>
              <ShieldCheck size={22} />
            </div>
            <h3 className="capability-title">Automated SSL & Security</h3>
            <p className="capability-desc">
              Wildcard TLS encryption, hardened container isolation, and AES-256 encrypted environment variables standard across every project.
            </p>
          </div>

          <div className="card capability-card">
            <div className="capability-icon" style={{ background: "rgba(245, 158, 11, 0.12)", color: "#fbbf24" }}>
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
      </footer>

      <style>{`
        .landing-shell {
          min-height: 100vh;
          background:
            radial-gradient(1100px 500px at 50% -10%, rgba(99, 102, 241, 0.15), transparent 60%),
            radial-gradient(800px 400px at 100% 20%, rgba(56, 189, 248, 0.08), transparent 50%),
            var(--background);
          color: var(--foreground);
        }

        .landing-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          max-width: 1200px;
          margin: 0 auto;
          padding: 1.25rem 2rem;
        }

        .landing-nav-links {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        .landing-nav-links a:not(.btn) {
          color: var(--muted);
          text-decoration: none;
          font-size: 0.88rem;
          font-weight: 500;
          transition: color 0.15s ease;
        }
        .landing-nav-links a:not(.btn):hover {
          color: var(--foreground);
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
          padding: 0.3rem 0.85rem;
          border-radius: 9999px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.25);
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--accent);
          margin-bottom: 1.25rem;
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
          font-weight: 850;
          letter-spacing: -0.04em;
          line-height: 1.08;
          color: var(--foreground);
          margin-bottom: 1.25rem;
        }
        .headline-gradient {
          background: var(--accent-gradient);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-lead-text {
          font-size: 1.1rem;
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
          color: var(--muted);
          background: var(--card);
          border: 1px solid var(--card-border);
          border-radius: 9999px;
          padding: 0.35rem 0.85rem;
          backdrop-filter: blur(12px);
        }

        /* Section Layouts */
        .landing-section {
          max-width: 1200px;
          margin: 0 auto;
          padding: 3rem 1.5rem;
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
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .showcase-title {
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin-bottom: 0.25rem;
        }
        .showcase-tagline {
          font-size: 0.8rem;
          color: var(--accent);
          font-weight: 550;
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
          color: var(--muted);
          background: var(--bg-inset);
          padding: 0.25rem 0.5rem;
          border-radius: 6px;
          border: 1px solid var(--card-border);
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
        }
        .capability-desc {
          font-size: 0.85rem;
          color: var(--muted);
          line-height: 1.55;
        }

        /* CTA Banner */
        .cta-banner-card {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(56, 189, 248, 0.08) 100%);
          border: 1px solid rgba(99, 102, 241, 0.25);
          border-radius: var(--radius-lg);
          padding: 2.75rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2rem;
          box-shadow: var(--shadow);
        }
        .cta-banner-title {
          font-size: 1.75rem;
          font-weight: 800;
          letter-spacing: -0.03em;
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
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid var(--card-border);
          gap: 1.5rem;
          flex-wrap: wrap;
        }
        .footer-links-row {
          display: flex;
          gap: 1.25rem;
        }
        .footer-link {
          color: var(--muted);
          font-size: 0.825rem;
          text-decoration: none;
          transition: color 0.15s ease;
        }
        .footer-link:hover {
          color: var(--foreground);
        }
        .footer-copy {
          color: var(--muted-fg);
          font-size: 0.78rem;
        }

        @media (max-width: 860px) {
          .landing-nav-links a:not(.btn) {
            display: none;
          }
          .cta-banner-card {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
