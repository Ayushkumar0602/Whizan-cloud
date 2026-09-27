"use client";
import { useEffect, useState } from "react";
import { projects, services, type ProjectWithLatestDeploy, type ServiceWithLatestDeploy } from "@/lib/api";
import { CLOUD_SERVICES } from "@/lib/services";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  ArrowRight,
  Plus,
  Activity,
  HardDrive,
  Cpu,
  CreditCard,
  BookOpen,
  GitPullRequest,
  Server,
  Globe,
  Radio,
  ExternalLink,
  Clock,
  Sparkles,
  Layers
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export default function ConsolePage() {
  const { user } = useAuth();
  const [frontendList, setFrontendList] = useState<ProjectWithLatestDeploy[]>([]);
  const [backendList, setBackendList] = useState<ServiceWithLatestDeploy[]>([]);
  const [loading, setLoading] = useState(true);

  const firstName = (user?.name || user?.email || "Developer").split(" ")[0];

  useEffect(() => {
    Promise.all([
      projects.list().catch(() => []),
      services.list().catch(() => []),
    ])
      .then(([fList, bList]) => {
        setFrontendList(fList);
        setBackendList(bList);
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

  return (
    <div className="page">
      {/* Welcome Hero Banner */}
      <div className="console-hero">
        <div className="hero-content">
          <div className="hero-badge">
            <Sparkles size={13} className="text-accent" />
            <span>Whizan Cloud Mesh Platform</span>
          </div>
          <h1 className="hero-title">
            Welcome back, <span className="hero-name-gradient">{firstName}</span>
          </h1>
          <p className="hero-subtitle">
            Orchestrate your Next.js frontends, Dockerized backend services, and private service mesh discovery in real time.
          </p>
        </div>

        <div className="hero-actions">
          <Link href="/dashboard/backend/new" className="btn btn-primary btn-lg">
            <Server size={17} /> Deploy Backend
          </Link>
          <Link href="/dashboard/projects/new" className="btn btn-secondary btn-lg">
            <Globe size={17} /> Deploy Frontend
          </Link>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">
            <Activity size={14} className="text-accent" /> Total Cloud Bandwidth
          </div>
          <div className="stat-value">0.82 GB</div>
          <div className="stat-sub" style={{ color: "var(--success)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
            Edge routing optimal
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <GitPullRequest size={14} className="text-accent" /> Deployments
          </div>
          <div className="stat-value">{totalDeployments}</div>
          <div className="stat-sub">
            Across {frontendList.length} sites & {backendList.length} services
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Server size={14} className="text-accent" /> Live Containers
          </div>
          <div className="stat-value">
            {activeBackends} <span style={{ fontSize: "1rem", color: "var(--muted)", fontWeight: 500 }}>/ {backendList.length}</span>
          </div>
          <div className="stat-sub">
            {backendList.some(s => s.autoSleep) ? "Auto-Sleep enabled" : "Always-On dedicated"}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Radio size={14} className="text-accent" /> Private Mesh DNS
          </div>
          <div className="stat-value" style={{ fontSize: "1.4rem", fontFamily: "var(--font-geist-mono), monospace" }}>
            whizan-mesh
          </div>
          <div className="stat-sub" style={{ color: "var(--success)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
            Internal bridge healthy
          </div>
        </div>
      </div>

      {/* Two Column Section */}
      <div className="console-split-layout">
        {/* Left Column: Recent Services & Sites */}
        <div className="console-main-col">
          {/* Backend Services Snippet */}
          <div className="section-card">
            <div className="section-card-header">
              <div>
                <h2 className="section-card-title">Backend Services</h2>
                <p className="section-card-desc">Long-running Docker containers with internal mesh endpoints</p>
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
                  Deploy your Node.js, Python, or Go APIs in seconds.
                </p>
                <Link href="/dashboard/backend/new" className="btn btn-primary btn-sm" style={{ marginTop: "0.85rem" }}>
                  <Plus size={14} /> Create Backend Service
                </Link>
              </div>
            ) : (
              <div className="items-list">
                {backendList.slice(0, 4).map(s => {
                  const latest = s.deployments[0];
                  const isActive = latest?.status === "READY" && !!latest.containerPort;
                  const isAsleep = latest?.status === "READY" && !latest.containerPort;

                  return (
                    <Link key={s.id} href={`/dashboard/backend/${s.id}`} className="item-row">
                      <div className="item-icon-box">
                        <Server size={18} className="text-accent" />
                      </div>
                      <div className="item-details">
                        <div className="item-name-row">
                          <span className="item-name">{s.name}</span>
                          <span className="item-mesh-alias mono">
                            http://{s.slug}:{s.internalPort}
                          </span>
                        </div>
                        <div className="item-sub-row">
                          <span className="mono">{s.language}</span>
                          <span>•</span>
                          <span>branch: {s.branch}</span>
                        </div>
                      </div>
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
                        <span className="item-time">
                          {latest?.createdAt ? formatDistanceToNow(new Date(latest.createdAt), { addSuffix: true }) : "recent"}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Frontend Sites Snippet */}
          <div className="section-card" style={{ marginTop: "1.5rem" }}>
            <div className="section-card-header">
              <div>
                <h2 className="section-card-title">Frontend Applications</h2>
                <p className="section-card-desc">Production Next.js, React, and Vite web apps</p>
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
                <div style={{ fontWeight: 600, marginTop: "0.5rem" }}>No frontend apps deployed</div>
                <p style={{ fontSize: "0.825rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                  Connect your GitHub repo to deploy in one click.
                </p>
                <Link href="/dashboard/projects/new" className="btn btn-primary btn-sm" style={{ marginTop: "0.85rem" }}>
                  <Plus size={14} /> Deploy Frontend App
                </Link>
              </div>
            ) : (
              <div className="items-list">
                {frontendList.slice(0, 4).map(p => {
                  const latest = p.deployments[0];
                  return (
                    <Link key={p.id} href={`/dashboard/projects/${p.id}`} className="item-row">
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
                          <span>{p.branch}</span>
                        </div>
                      </div>
                      <div className="item-status-col">
                        {latest ? <StatusBadge status={latest.status} /> : <span className="badge badge-queued">No deploys</span>}
                        <span className="item-time">
                          {formatDistanceToNow(new Date(p.updatedAt), { addSuffix: true })}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Quick Launchers & Cloud Services */}
        <div className="console-side-col">
          <div className="section-card">
            <h3 className="section-card-title" style={{ marginBottom: "1rem" }}>
              Quick Actions
            </h3>
            <div className="quick-actions-stack">
              <Link href="/dashboard/backend/new" className="quick-card">
                <div className="quick-card-icon" style={{ background: "rgba(99, 102, 241, 0.12)", color: "#818cf8" }}>
                  <Server size={18} />
                </div>
                <div>
                  <div className="quick-card-title">Deploy Docker Container</div>
                  <div className="quick-card-sub">Node, Python, Go with Auto-Sleep</div>
                </div>
              </Link>

              <Link href="/dashboard/projects/new" className="quick-card">
                <div className="quick-card-icon" style={{ background: "rgba(56, 189, 248, 0.12)", color: "#38bdf8" }}>
                  <GitPullRequest size={18} />
                </div>
                <div>
                  <div className="quick-card-title">Deploy From GitHub</div>
                  <div className="quick-card-sub">Automatic build and live edge SSL</div>
                </div>
              </Link>

              <Link href="/dashboard/services" className="quick-card">
                <div className="quick-card-icon" style={{ background: "rgba(16, 185, 129, 0.12)", color: "#34d399" }}>
                  <Layers size={18} />
                </div>
                <div>
                  <div className="quick-card-title">Service Discovery Catalog</div>
                  <div className="quick-card-sub">Explore internal mesh endpoints</div>
                </div>
              </Link>

              <Link href="/dashboard/admin" className="quick-card">
                <div className="quick-card-icon" style={{ background: "rgba(245, 158, 11, 0.12)", color: "#fbbf24" }}>
                  <Cpu size={18} />
                </div>
                <div>
                  <div className="quick-card-title">VM Resource Monitor</div>
                  <div className="quick-card-sub">Inspect CPU, RAM, Docker & Redis</div>
                </div>
              </Link>
            </div>
          </div>

          <div className="section-card" style={{ marginTop: "1.5rem" }}>
            <h3 className="section-card-title" style={{ marginBottom: "0.5rem" }}>
              Compute Topology
            </h3>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "1rem", lineHeight: 1.45 }}>
              Isolated Docker containers communicate over the secure internal bridge network.
            </p>
            <div className="mesh-mini-preview">
              <div className="mesh-mini-node">
                <Globe size={14} />
                <span>Frontend (:8080)</span>
              </div>
              <div className="mesh-mini-connector">
                <span className="mesh-mini-arrow">➔</span>
                <span className="mesh-mini-ping">DNS Discovery</span>
              </div>
              <div className="mesh-mini-node">
                <Server size={14} />
                <span>Backend (:8000)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        /* Hero Banner */
        .console-hero {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(56, 189, 248, 0.06) 50%, rgba(16, 185, 129, 0.05) 100%);
          border: 1px solid rgba(99, 102, 241, 0.2);
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
          background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
          pointer-events: none;
        }

        .hero-content {
          position: relative;
          z-index: 1;
        }
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.25rem 0.65rem;
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.25);
          border-radius: 9999px;
          font-size: 0.74rem;
          font-weight: 600;
          color: var(--accent);
          margin-bottom: 0.85rem;
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
          font-weight: 600;
          color: var(--accent);
          text-decoration: none;
          transition: color 0.15s ease;
        }
        .view-all-link:hover {
          color: var(--accent-hover);
        }

        .empty-inner {
          padding: 2.5rem 1.5rem;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px dashed var(--card-border);
          border-radius: 10px;
          background: var(--bg-inset);
        }

        .items-list {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--card-border);
          border-radius: 10px;
          overflow: hidden;
          background: var(--card);
        }
        .item-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--card-border);
          text-decoration: none;
          color: inherit;
          transition: background 0.15s ease;
        }
        .item-row:last-child {
          border-bottom: none;
        }
        .item-row:hover {
          background: var(--card-hover);
        }
        .item-icon-box {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          background: var(--bg-inset);
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
          font-size: 0.92rem;
          font-weight: 650;
          color: var(--foreground);
        }
        .item-mesh-alias {
          font-size: 0.75rem;
          color: var(--muted);
          background: var(--bg-inset);
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
          border: 1px solid var(--card-border);
        }
        .item-sub-row {
          font-size: 0.75rem;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 0.45rem;
          margin-top: 0.25rem;
        }
        .item-status-col {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.35rem;
          flex-shrink: 0;
        }
        .item-time {
          font-size: 0.72rem;
          color: var(--muted);
        }

        /* Quick Action Stack */
        .quick-actions-stack {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .quick-card {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 0.85rem 1rem;
          border-radius: 10px;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          text-decoration: none;
          color: inherit;
          transition: all 0.15s ease;
        }
        .quick-card:hover {
          background: var(--card-hover);
          border-color: var(--card-border-hover);
          transform: translateY(-1px);
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
          font-size: 0.86rem;
          font-weight: 600;
          color: var(--foreground);
        }
        .quick-card-sub {
          font-size: 0.74rem;
          color: var(--muted);
          margin-top: 0.15rem;
        }

        /* Mesh Mini Preview */
        .mesh-mini-preview {
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: 8px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .mesh-mini-node {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--foreground);
          background: var(--card);
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          border: 1px solid var(--card-border);
        }
        .mesh-mini-connector {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding-left: 1.25rem;
          font-size: 0.72rem;
          color: var(--muted);
          font-family: var(--font-geist-mono), monospace;
        }
        .mesh-mini-arrow {
          color: var(--accent);
        }
        .mesh-mini-ping {
          color: #10b981;
        }

        /* Responsive Breakpoints */
        @media (max-width: 1024px) {
          .console-hero {
            flex-direction: column;
            align-items: stretch;
            gap: 1.25rem;
            padding: 1.75rem;
          }
          .hero-actions {
            width: 100%;
          }
          .hero-actions .btn {
            flex: 1;
          }
          .console-split-layout {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }
        }

        @media (max-width: 640px) {
          .hero-title {
            font-size: 1.6rem;
          }
          .hero-actions {
            flex-direction: column;
          }
          .item-row {
            padding: 0.85rem 1rem;
          }
          .item-name-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.2rem;
          }
        }
      `}</style>
    </div>
  );
}
