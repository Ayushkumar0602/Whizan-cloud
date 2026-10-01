"use client";

import { useEffect, useState } from "react";
import { projects, services, functionsApi, type ProjectWithLatestDeploy, type ServiceWithLatestDeploy, type FunctionServiceItem } from "@/lib/api";
import { formatDeployedUrl, getBaseRouterDomain, getServiceIngressUrl, getFunctionIngressUrl } from "@/lib/domains";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import {
  ArrowRight,
  Plus,
  Activity,
  GitPullRequest,
  Server,
  Globe,
  ExternalLink,
  Clock,
  Layers,
  ShieldCheck,
  Zap,
  Radio,
  Terminal,
  Database
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export default function ConsolePage() {
  const { user } = useAuth();
  const [frontendList, setFrontendList] = useState<ProjectWithLatestDeploy[]>([]);
  const [backendList, setBackendList] = useState<ServiceWithLatestDeploy[]>([]);
  const [functionList, setFunctionList] = useState<FunctionServiceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const firstName = (user?.name || user?.email || "Developer").split(" ")[0];
  const baseDomain = getBaseRouterDomain();

  useEffect(() => {
    Promise.all([
      projects.list().catch(() => []),
      services.list().catch(() => []),
      functionsApi.list().catch(() => []),
    ])
      .then(([fList, bList, fnList]) => {
        setFrontendList(fList);
        setBackendList(bList);
        setFunctionList(fnList);
      })
      .catch(() => toast.error("Could not load cloud assets"))
      .finally(() => setLoading(false));
  }, []);

  const totalDeployments =
    frontendList.reduce((acc, p) => acc + p.deployments.length, 0) +
    backendList.reduce((acc, s) => acc + s.deployments.length, 0);

  const activeBackends = backendList.filter(
    s => s.deployments[0]?.status === "READY" && !!s.deployments[0]?.containerPort
  ).length;

  const liveFrontends = frontendList.filter(
    p => p.deployments[0]?.status === "READY"
  ).length;

  return (
    <div className="page">
      {/* Premium Welcome Header */}
      <div className="console-hero">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="live-dot-pulse" />
            <span>Whizan Cloud Platform</span>
          </div>
          <h1 className="hero-title">
            Welcome back, <span className="hero-name-gradient">{firstName}</span>
          </h1>
          <p className="hero-subtitle">
            Deploy frontend applications, containerized backend services, and manage edge routing from a unified developer console.
          </p>
        </div>

        <div className="hero-actions">
          <Link href="/dashboard/projects/new" className="btn btn-primary btn-lg" id="deploy-frontend-btn">
            <Globe size={16} /> Deploy Frontend
          </Link>
          <Link href="/dashboard/backend/new" className="btn btn-secondary btn-lg" id="deploy-backend-btn">
            <Server size={16} /> Deploy Service
          </Link>
          <Link
            href="/dashboard/functions/new"
            className="btn btn-lg"
            id="deploy-function-btn"
            style={{
              background: "var(--accent-glow)",
              color: "var(--accent)",
              border: "1px solid var(--accent)",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              fontWeight: 700,
            }}
          >
            <Zap size={16} /> New Edge Function
          </Link>
        </div>
      </div>

      {/* High-Signal Telemetry Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">
            <Globe size={14} className="text-accent" /> Frontend Apps
          </div>
          <div className="stat-value">{frontendList.length}</div>
          <div className="stat-sub" style={{ color: "var(--success)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
            {liveFrontends} live on Edge CDN
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Server size={14} className="text-accent" /> Backend Services
          </div>
          <div className="stat-value">{backendList.length}</div>
          <div className="stat-sub">
            {activeBackends} active / {backendList.length - activeBackends} asleep
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Zap size={14} style={{ color: "var(--accent)" }} /> Edge Functions
          </div>
          <div className="stat-value">{functionList.length}</div>
          <div className="stat-sub" style={{ color: "#10b981" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
            Sub-5ms Serverless V8
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Radio size={14} className="text-accent" /> Cloud Ingress
          </div>
          <div className="stat-value" style={{ fontSize: "1.25rem", fontFamily: "var(--font-geist-mono), monospace" }}>
            {baseDomain}
          </div>
          <div className="stat-sub" style={{ color: "var(--success)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
            Operational • Port 80
          </div>
        </div>
      </div>

      {/* Main Console Split Layout */}
      <div className="console-split-layout">
        {/* Left Column: Active Frontends & Services */}
        <div className="console-main-col">
          {/* Frontend Applications Snippet */}
          <div className="section-card">
            <div className="section-card-header">
              <div>
                <h2 className="section-card-title">Frontend Applications</h2>
                <p className="section-card-desc">Production web applications with live edge domain routing</p>
              </div>
              <Link href="/dashboard/hosting" className="view-all-link">
                View all ({frontendList.length}) <ArrowRight size={13} />
              </Link>
            </div>

            {loading ? (
              <div className="skeleton" style={{ height: 140 }} />
            ) : frontendList.length === 0 ? (
              <div className="empty-inner">
                <Globe size={28} className="text-muted" />
                <div style={{ fontWeight: 600, marginTop: "0.5rem" }}>No frontend applications deployed</div>
                <p style={{ fontSize: "0.825rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                  Connect your repository to deploy Next.js, Vite, or React apps in seconds.
                </p>
                <Link href="/dashboard/projects/new" className="btn btn-primary btn-sm" style={{ marginTop: "0.85rem" }}>
                  <Plus size={14} /> Deploy Frontend App
                </Link>
              </div>
            ) : (
              <div className="items-list">
                {frontendList.slice(0, 4).map(p => {
                  const latest = p.deployments[0];
                  const liveUrl = formatDeployedUrl(latest?.url, p.slug, p.customDomain);
                  const isReady = latest?.status === "READY";

                  return (
                    <div key={p.id} className="item-row">
                      <Link href={`/dashboard/projects/${p.id}`} className="item-details-link">
                        <div className="item-icon-box">
                          <Globe size={18} style={{ color: "#38bdf8" }} />
                        </div>
                        <div className="item-details">
                          <div className="item-name-row">
                            <span className="item-name">{p.name}</span>
                            <span className="item-mesh-alias mono">/{p.slug}</span>
                          </div>
                          <div className="item-sub-row">
                            <span>{p.framework}</span>
                            <span>•</span>
                            <span>branch: {p.branch}</span>
                            <span>•</span>
                            <span className="item-time">
                              {formatDistanceToNow(new Date(p.updatedAt), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </Link>

                      <div className="item-status-col">
                        {latest ? <StatusBadge status={latest.status} /> : <span className="badge badge-queued">No deploys</span>}
                        {isReady && (
                          <a
                            href={liveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="live-external-btn"
                            title={`Open live site: ${liveUrl}`}
                          >
                            <span>Live</span>
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Backend Services Snippet */}
          <div className="section-card" style={{ marginTop: "1.5rem" }}>
            <div className="section-card-header">
              <div>
                <h2 className="section-card-title">Backend Services</h2>
                <p className="section-card-desc">Containerized APIs, microservices, and background queue workers</p>
              </div>
              <Link href="/dashboard/backend" className="view-all-link">
                View all ({backendList.length}) <ArrowRight size={13} />
              </Link>
            </div>

            {loading ? (
              <div className="skeleton" style={{ height: 140 }} />
            ) : backendList.length === 0 ? (
              <div className="empty-inner">
                <Server size={28} className="text-muted" />
                <div style={{ fontWeight: 600, marginTop: "0.5rem" }}>No backend services deployed</div>
                <p style={{ fontSize: "0.825rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                  Deploy your Node.js, Python, or Go services with automated health checks.
                </p>
                <Link href="/dashboard/backend/new" className="btn btn-primary btn-sm" style={{ marginTop: "0.85rem" }}>
                  <Plus size={14} /> Deploy Backend Service
                </Link>
              </div>
            ) : (
              <div className="items-list">
                {backendList.slice(0, 4).map(s => {
                  const latest = s.deployments[0];
                  const isActive = latest?.status === "READY" && !!latest.containerPort;
                  const isAsleep = latest?.status === "READY" && !latest.containerPort;
                  const liveUrl = getServiceIngressUrl(s.slug);

                  return (
                    <div key={s.id} className="item-row">
                      <Link href={`/dashboard/backend/${s.id}`} className="item-details-link">
                        <div className="item-icon-box">
                          <Server size={18} className="text-accent" />
                        </div>
                        <div className="item-details">
                          <div className="item-name-row">
                            <span className="item-name">{s.name}</span>
                            <span className="item-mesh-alias mono">/{s.slug}</span>
                          </div>
                          <div className="item-sub-row">
                            <span className="mono">{s.language}</span>
                            <span>•</span>
                            <span>branch: {s.branch}</span>
                            <span>•</span>
                            <span className="item-time">
                              {latest?.createdAt ? formatDistanceToNow(new Date(latest.createdAt), { addSuffix: true }) : "recent"}
                            </span>
                          </div>
                        </div>
                      </Link>

                      <div className="item-status-col">
                        {isActive && (
                          <span className="badge badge-ready">
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                            ACTIVE
                          </span>
                        )}
                        {isAsleep && (
                          <span className="badge badge-queued">
                            <Clock size={11} />
                            ASLEEP (0.1 vCPU)
                          </span>
                        )}
                        {!isActive && !isAsleep && <StatusBadge status={latest?.status || "QUEUED"} />}

                        {isActive && (
                          <a
                            href={liveUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="live-external-btn"
                            title={`Open live endpoint: ${liveUrl}`}
                          >
                            <span>Live</span>
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Platform Navigation & Endpoints */}
        <div className="console-side-col">
          <div className="section-card">
            <h3 className="section-card-title" style={{ marginBottom: "1rem" }}>
              Quick Actions
            </h3>
            <div className="quick-actions-stack">
              <Link href="/dashboard/projects/new" className="quick-card">
                <div className="quick-card-icon" style={{ background: "rgba(56, 189, 248, 0.12)", color: "#38bdf8" }}>
                  <Globe size={18} />
                </div>
                <div>
                  <div className="quick-card-title">New Frontend Application</div>
                  <div className="quick-card-sub">Next.js, Vite, React on Edge CDN</div>
                </div>
              </Link>

              <Link href="/dashboard/backend/new" className="quick-card">
                <div className="quick-card-icon" style={{ background: "rgba(99, 102, 241, 0.12)", color: "#818cf8" }}>
                  <Server size={18} />
                </div>
                <div>
                  <div className="quick-card-title">New Backend Service</div>
                  <div className="quick-card-sub">Docker, Node.js, Python, or Go</div>
                </div>
              </Link>

              <Link href="/dashboard/databases" className="quick-card">
                <div className="quick-card-icon" style={{ background: "rgba(16, 185, 129, 0.12)", color: "#34d399" }}>
                  <Database size={18} />
                </div>
                <div>
                  <div className="quick-card-title">Managed Databases</div>
                  <div className="quick-card-sub">PostgreSQL & Redis clusters</div>
                </div>
              </Link>

              <Link href="/dashboard/mcp" className="quick-card">
                <div className="quick-card-icon" style={{ background: "rgba(168, 85, 247, 0.12)", color: "#c084fc" }}>
                  <Terminal size={18} />
                </div>
                <div>
                  <div className="quick-card-title">DevOps Agent MCP</div>
                  <div className="quick-card-sub">Autonomous deployment tooling</div>
                </div>
              </Link>
            </div>
          </div>

          {/* Cloud Ingress & Edge Router Status */}
          <div className="section-card" style={{ marginTop: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
              <h3 className="section-card-title" style={{ margin: 0 }}>
                Cloud Ingress
              </h3>
              <span className="badge badge-ready">
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                Operational
              </span>
            </div>

            <div className="ingress-info-stack">
              <div className="ingress-info-row">
                <span className="ingress-key">Edge Ingress IP</span>
                <span className="ingress-val mono">20.2.136.11</span>
              </div>
              <div className="ingress-info-row">
                <span className="ingress-key">Wildcard Gateway</span>
                <span className="ingress-val mono">*.{baseDomain}</span>
              </div>
              <div className="ingress-info-row">
                <span className="ingress-key">Traffic Protocol</span>
                <span className="ingress-val">HTTP / Port 80</span>
              </div>
              <div className="ingress-info-row">
                <span className="ingress-key">Zero-Downtime Cutover</span>
                <span className="ingress-val" style={{ color: "#10b981" }}>Enabled</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        /* Hero Banner */
        .console-hero {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(56, 189, 248, 0.05) 50%, rgba(16, 185, 129, 0.04) 100%);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-lg);
          padding: 2.25rem;
          margin-bottom: 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2rem;
          position: relative;
          overflow: hidden;
          box-shadow: var(--shadow);
        }
        .console-hero::before {
          content: "";
          position: absolute;
          top: -50%;
          left: -20%;
          width: 60%;
          height: 200%;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, transparent 70%);
          pointer-events: none;
        }

        .hero-content {
          position: relative;
          z-index: 1;
        }
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.25rem 0.75rem;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--accent);
          margin-bottom: 0.85rem;
        }
        .live-dot-pulse {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 6px #10b981;
        }
        .hero-title {
          font-size: 2.1rem;
          font-weight: 800;
          letter-spacing: -0.035em;
          color: var(--foreground);
          line-height: 1.15;
        }
        .hero-name-gradient {
          background: var(--accent-gradient);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero-subtitle {
          color: var(--muted);
          font-size: 0.94rem;
          max-width: 44rem;
          margin-top: 0.5rem;
          line-height: 1.55;
        }
        .hero-actions {
          display: flex;
          gap: 0.75rem;
          flex-shrink: 0;
          position: relative;
          z-index: 1;
        }

        /* 2-Column Console Layout */
        .console-split-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr);
          gap: 2rem;
          align-items: start;
        }

        .section-card {
          background: var(--card);
          backdrop-filter: blur(16px);
          border: 1px solid var(--card-border);
          border-radius: var(--radius);
          padding: 1.5rem;
          box-shadow: var(--shadow);
        }
        .section-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1.25rem;
        }
        .section-card-title {
          font-size: 1.125rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--foreground);
        }
        .section-card-desc {
          font-size: 0.8125rem;
          color: var(--muted);
          margin-top: 0.2rem;
        }

        .view-all-link {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.8125rem;
          color: var(--accent);
          font-weight: 550;
          transition: opacity 0.15s ease;
          white-space: nowrap;
        }
        .view-all-link:hover {
          opacity: 0.8;
        }

        .items-list {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }

        .item-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.85rem 1rem;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: 10px;
          transition: all 0.15s ease;
        }
        .item-row:hover {
          border-color: var(--card-border-hover);
          background: var(--card-hover);
        }

        .item-details-link {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          flex: 1;
          min-width: 0;
          text-decoration: none;
          color: inherit;
        }

        .item-icon-box {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--card-border);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .item-details {
          flex: 1;
          min-width: 0;
        }

        .item-name-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .item-name {
          font-weight: 650;
          font-size: 0.925rem;
          color: var(--foreground);
        }
        .item-mesh-alias {
          font-size: 0.75rem;
          color: var(--muted);
          background: rgba(255, 255, 255, 0.04);
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
        }

        .item-sub-row {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          font-size: 0.78rem;
          color: var(--muted);
          margin-top: 0.2rem;
        }

        .item-status-col {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-shrink: 0;
        }

        .live-external-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.25rem 0.6rem;
          border-radius: 6px;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
          color: #10b981;
          font-size: 0.72rem;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.15s ease;
        }
        .live-external-btn:hover {
          background: rgba(16, 185, 129, 0.2);
          border-color: rgba(16, 185, 129, 0.4);
          transform: translateY(-1px);
        }

        .empty-inner {
          padding: 2.5rem 1rem;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        /* Quick cards */
        .quick-actions-stack {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .quick-card {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 0.85rem;
          border-radius: 10px;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          text-decoration: none;
          color: inherit;
          transition: all 0.15s ease;
        }
        .quick-card:hover {
          border-color: var(--card-border-hover);
          background: var(--card-hover);
          transform: translateX(2px);
        }
        .quick-card-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .quick-card-title {
          font-size: 0.88rem;
          font-weight: 650;
          color: var(--foreground);
        }
        .quick-card-sub {
          font-size: 0.75rem;
          color: var(--muted);
          margin-top: 0.15rem;
        }

        /* Ingress details */
        .ingress-info-stack {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .ingress-info-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0;
          border-bottom: 1px solid var(--card-border);
          font-size: 0.8125rem;
        }
        .ingress-info-row:last-child {
          border-bottom: none;
        }
        .ingress-key {
          color: var(--muted);
        }
        .ingress-val {
          font-weight: 550;
          color: var(--foreground);
        }

        @media (max-width: 1024px) {
          .console-split-layout {
            grid-template-columns: 1fr;
          }
          .console-hero {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
