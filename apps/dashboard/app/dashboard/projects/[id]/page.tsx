"use client";
import { useEffect, useState } from "react";
import { projects, deployments as deploymentsApi, type ProjectWithDeployments, type Deployment } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Globe,
  GitBranch,
  Play,
  Clock,
  Zap,
  ExternalLink,
  Settings2,
  Trash2,
  Loader2,
  Copy,
  Check,
  BarChart2,
  Github
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { DeployPipeline } from "@/components/deploy-pipeline";
import { formatDeployedUrl, getServiceIngressUrl } from "@/lib/domains";
import { useSystemStatus } from "@/hooks/useSystemStatus";
import { VmOfflineModal } from "@/components/vm-offline-modal";

function buildDuration(d: Deployment) {
  if (!d.buildStartedAt) return null;
  const end = d.buildFinishedAt ? new Date(d.buildFinishedAt) : new Date();
  const secs = Math.round((end.getTime() - new Date(d.buildStartedAt).getTime()) / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { vmOnline } = useSystemStatus();
  const [project, setProject] = useState<ProjectWithDeployments | null>(null);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedEdge, setCopiedEdge] = useState(false);
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  const [offlineAction, setOfflineAction] = useState<"deploy" | "visit" | "general">("general");

  async function load() {
    try {
      const p = await projects.get(id);
      setProject(p);
    } catch {
      toast.error("Project not found");
      router.push("/dashboard/hosting");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    const active = project?.deployments.some(
      d => d.status === "QUEUED" || d.status === "BUILDING"
    );
    if (!active) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [project]);

  async function triggerDeploy() {
    setDeploying(true);
    try {
      const d = await deploymentsApi.trigger(id);
      toast.success("Build queued — follow the pipeline");
      await load();
      router.push(`/dashboard/projects/${id}/deployments/${d.id}`);
    } catch (err: any) {
      toast.error(err.message || "Deploy failed");
    } finally {
      setDeploying(false);
    }
  }

  async function handleDeleteProject() {
    if (!confirm(`Delete "${project?.name}"? All deployments, containers, and build files will be permanently wiped.`)) return;
    setDeleting(true);
    try {
      await projects.delete(id);
      toast.success("Project deleted");
      router.push("/dashboard/hosting");
    } catch (err: any) {
      toast.error(err.message || "Delete failed");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Loading project...</span>
      </div>
    );
  }
  if (!project) return null;

  const latestDeploy = project.deployments[0];
  const isActive = latestDeploy?.status === "QUEUED" || latestDeploy?.status === "BUILDING";
  const liveUrl = formatDeployedUrl(latestDeploy?.url, project.slug, project.customDomain);
  const edgeUrl = getServiceIngressUrl(project.slug);

  function copyUrl() {
    navigator.clipboard.writeText(liveUrl);
    setCopiedUrl(true);
    toast.success("Live Gateway URL copied");
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  function copyEdgeUrl() {
    navigator.clipboard.writeText(edgeUrl);
    setCopiedEdge(true);
    toast.success("Direct Edge URL copied");
    setTimeout(() => setCopiedEdge(false), 2000);
  }

  return (
    <div className="page">
      <Link href="/dashboard/hosting" className="breadcrumb">
        <ArrowLeft size={15} /> Back to Frontend Hosting
      </Link>

      {/* Project Header Card */}
      <div className="proj-hero-card">
        <div className="proj-hero-top">
          <div className="proj-brand-group">
            <div className="proj-icon-box">
              {project.name[0].toUpperCase()}
            </div>
            <div>
              <div className="proj-kicker">Frontend Application</div>
              <div className="proj-title-row">
                <h1 className="proj-title">{project.name}</h1>
                {latestDeploy && <StatusBadge status={latestDeploy.status} />}
              </div>
              <div className="proj-meta-row">
                <span className="proj-meta-chip">
                  <GitBranch size={13} /> {project.branch}
                </span>
                <span className="proj-meta-chip">
                  <Zap size={13} /> {project.framework}
                </span>
                <span className="proj-meta-chip mono">
                  /{project.slug}
                </span>
              </div>
            </div>
          </div>

          <div className="proj-actions-group">
            {latestDeploy?.status === "READY" && (
              <a
                href={liveUrl}
                target={vmOnline ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="btn btn-secondary btn-lg"
                id="visit-site-btn"
                onClick={(e) => {
                  if (!vmOnline) {
                    e.preventDefault();
                    setOfflineAction("visit");
                    setOfflineModalOpen(true);
                  }
                }}
              >
                <Globe size={15} /> Visit Site {vmOnline ? <ExternalLink size={13} /> : <span style={{ fontSize: "0.75rem", color: "#f59e0b", marginLeft: 4 }}>(Paused)</span>}
              </a>
            )}
            <Link href={`/dashboard/projects/${id}/analytics`} className="btn btn-secondary btn-lg">
              <BarChart2 size={15} /> Analytics
            </Link>
            <Link href={`/dashboard/projects/${id}/settings`} className="btn btn-secondary btn-lg">
              <Settings2 size={15} /> Settings
            </Link>
            <button
              id="deploy-btn"
              className="btn btn-primary btn-lg"
              onClick={() => {
                if (!vmOnline) {
                  setOfflineAction("deploy");
                  setOfflineModalOpen(true);
                  return;
                }
                triggerDeploy();
              }}
              disabled={deploying || isActive}
            >
              {deploying || isActive ? (
                <>
                  <Loader2 size={15} className="spin-icon" /> Deploying...
                </>
              ) : (
                <>
                  <Play size={15} fill="currentColor" /> Deploy Now
                </>
              )}
            </button>
            <button
              id="delete-project-btn"
              className="btn btn-danger btn-lg"
              onClick={handleDeleteProject}
              disabled={deleting}
              title="Delete project"
            >
              {deleting ? <Loader2 size={15} className="spin-icon" /> : <Trash2 size={15} />}
            </button>
          </div>
        </div>

        {/* Live URL Bar */}
        {latestDeploy?.status === "READY" && (
          <div className="proj-url-bar" style={{ display: "flex", flexDirection: "column", gap: "0.85rem", alignItems: "stretch" }}>
            {/* Always-On Universal Gateway (Primary) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
              <div className="proj-url-info">
                <span className="proj-url-label" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span>Always-On Live Gateway</span>
                  <span style={{ fontSize: "0.68rem", padding: "0.1rem 0.45rem", borderRadius: "9999px", background: "rgba(99, 102, 241, 0.2)", color: "#a5b4fc", border: "1px solid rgba(99, 102, 241, 0.35)", fontWeight: 600 }}>
                    ⚡ 24/7 Auto-Wake
                  </span>
                </span>
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="proj-url-link mono"
                  style={{ color: "#818cf8" }}
                >
                  {liveUrl} <ExternalLink size={13} />
                </a>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary btn-sm"
                  style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
                >
                  <Globe size={13} /> Visit Gateway
                </a>
                <button onClick={copyUrl} className="btn btn-secondary btn-sm">
                  {copiedUrl ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
                  <span>{copiedUrl ? "Copied" : "Copy Live URL"}</span>
                </button>
              </div>
            </div>

            {/* Direct High-Speed Edge Ingress */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", paddingTop: "0.65rem", borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <div className="proj-url-info">
                <span className="proj-url-label" style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--muted)" }}>
                  <span>Direct Edge Ingress (When Host Active)</span>
                  <span style={{ fontSize: "0.68rem", padding: "0.1rem 0.45rem", borderRadius: "9999px", background: "rgba(16, 185, 129, 0.15)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                    &lt;1ms
                  </span>
                </span>
                <a
                  href={edgeUrl}
                  target={vmOnline ? "_blank" : undefined}
                  rel="noreferrer"
                  className="proj-url-link mono"
                  style={{ fontSize: "0.82rem", color: "var(--muted)" }}
                  onClick={(e) => {
                    if (!vmOnline) {
                      e.preventDefault();
                      setOfflineAction("visit");
                      setOfflineModalOpen(true);
                    }
                  }}
                >
                  {edgeUrl} <ExternalLink size={12} />
                  {!vmOnline && (
                    <span style={{ fontSize: "0.68rem", padding: "0.12rem 0.45rem", borderRadius: "9999px", background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.3)", marginLeft: "0.5rem" }}>
                      Host Asleep
                    </span>
                  )}
                </a>
              </div>
              <button onClick={copyEdgeUrl} className="btn btn-secondary btn-sm" style={{ opacity: 0.85 }}>
                {copiedEdge ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
                <span>{copiedEdge ? "Copied" : "Copy Edge URL"}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pipeline Status */}
      <div style={{ margin: "2rem 0 1.5rem" }}>
        {latestDeploy ? (
          <div>
            <DeployPipeline
              status={latestDeploy.status}
              isDirectUpload={
                !project.githubRepoUrl ||
                project.githubRepoUrl === "direct-upload" ||
                latestDeploy.uploadType === "direct" ||
                latestDeploy.commitHash === "direct"
              }
            />
            {isActive && (
              <p className="pipeline-watch-hint">
                Build in progress. Follow live build steps and terminal logs in real time.{" "}
                <Link href={`/dashboard/projects/${id}/deployments/${latestDeploy.id}`} className="pipeline-link">
                  Open Live Build Stream →
                </Link>
              </p>
            )}
          </div>
        ) : (
          <div className="card ready-deploy-box">
            <div style={{ fontWeight: 650, fontSize: "1rem" }}>Ready to deploy</div>
            <p style={{ color: "var(--muted)", fontSize: "0.86rem", marginTop: "0.25rem" }}>
              Press <strong>Deploy now</strong> to trigger your first container build and publish edge routes.
            </p>
          </div>
        )}
      </div>

      {/* Project KPI Cards */}
      <div className="stats-grid" style={{ marginBottom: "2rem" }}>
        <div className="stat-card">
          <div className="stat-label">Source Code</div>
          {project.githubRepoUrl && project.githubRepoUrl !== "direct-upload" ? (
            <a href={project.githubRepoUrl} target="_blank" rel="noopener" className="stat-repo-link mono">
              <Github size={14} />
              <span>{project.githubRepoUrl.replace("https://github.com/", "")}</span>
              <ExternalLink size={12} />
            </a>
          ) : (
            <div className="stat-repo-link mono" style={{ color: "var(--muted)" }}>
              <span>Direct Upload Archive</span>
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Deployments</div>
          <div className="stat-value">{project.deployments.length}</div>
          <div className="stat-sub">Across all revisions</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Updated</div>
          <div className="stat-value" style={{ fontSize: "1.25rem" }}>
            {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
          </div>
          <div className="stat-sub">Automated sync</div>
        </div>
      </div>

      {/* Deployment History Section */}
      <div>
        <h2 className="block-title">Deployment History</h2>

        {project.deployments.length === 0 ? (
          <div className="empty-state" style={{ padding: "3rem 1.5rem" }}>
            <Clock size={28} />
            <p>No deployments recorded yet. Hit Deploy now to start.</p>
          </div>
        ) : (
          <div className="deploy-history-card">
            {project.deployments.map((d, idx) => (
              <Link
                key={d.id}
                href={`/dashboard/projects/${id}/deployments/${d.id}`}
                className="deploy-row-modern"
                id={`deployment-${d.id}`}
              >
                <div className="deploy-row-left">
                  <StatusBadge status={d.status} />
                  <div>
                    <div className="deploy-commit-line mono">
                      <span>{d.commitHash === "manual" ? "Manual deploy" : d.commitHash.slice(0, 7)}</span>
                      {idx === 0 && <span className="latest-pill">Latest</span>}
                    </div>
                    {d.commitMessage && (
                      <div className="deploy-msg-text">{d.commitMessage.split("\n")[0].slice(0, 75)}</div>
                    )}
                  </div>
                </div>

                <div className="deploy-row-right">
                  {d.deploymentType && (
                    <span className="deploy-type-chip mono">{d.deploymentType}</span>
                  )}
                  {buildDuration(d) && (
                    <span className="deploy-meta-sub">
                      <Clock size={12} /> {buildDuration(d)}
                    </span>
                  )}
                  <span className="deploy-meta-sub">
                    {format(new Date(d.createdAt), "MMM d, HH:mm")}
                  </span>
                  <span className="deploy-arrow">➔</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <style>{`
        /* Hero Card */
        .proj-hero-card {
          background: var(--card);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-lg);
          padding: 1.75rem;
          box-shadow: var(--shadow);
        }
        .proj-hero-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1.5rem;
          flex-wrap: wrap;
        }
        .proj-brand-group {
          display: flex;
          align-items: center;
          gap: 1.25rem;
        }
        .proj-icon-box {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          background: rgba(56, 189, 248, 0.1);
          border: 1px solid rgba(56, 189, 248, 0.25);
          color: #38bdf8;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 1.35rem;
          flex-shrink: 0;
        }
        .proj-kicker {
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted);
          font-weight: 700;
        }
        .proj-title-row {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          margin-top: 0.25rem;
          flex-wrap: wrap;
        }
        .proj-title {
          font-size: 1.85rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--foreground);
        }
        .proj-meta-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.45rem;
          flex-wrap: wrap;
        }
        .proj-meta-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.76rem;
          color: var(--muted);
          background: var(--bg-inset);
          padding: 0.2rem 0.55rem;
          border-radius: 6px;
          border: 1px solid var(--card-border);
        }
        .proj-actions-group {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-wrap: wrap;
        }

        /* URL Bar */
        .proj-url-bar {
          margin-top: 1.5rem;
          padding: 0.85rem 1.25rem;
          background: rgba(16, 185, 129, 0.06);
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .proj-url-info {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .proj-url-label {
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--muted);
          font-weight: 650;
        }
        .proj-url-link {
          font-size: 0.94rem;
          font-weight: 600;
          color: #10b981;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          text-decoration: none;
        }

        .pipeline-watch-hint {
          font-size: 0.85rem;
          color: var(--muted);
          margin-top: 0.75rem;
        }
        .pipeline-link {
          color: var(--accent);
          font-weight: 600;
          text-decoration: none;
        }

        .ready-deploy-box {
          padding: 1.5rem;
          border-left: 3px solid var(--accent);
        }

        .stat-repo-link {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          color: var(--accent);
          text-decoration: none;
          font-size: 0.88rem;
          font-weight: 550;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .stat-repo-link:hover {
          color: var(--accent-hover);
        }

        /* Deployment History List */
        .deploy-history-card {
          border: 1px solid var(--card-border);
          border-radius: var(--radius);
          background: var(--card);
          box-shadow: var(--shadow);
          overflow: hidden;
        }
        .deploy-row-modern {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.35rem;
          border-bottom: 1px solid var(--card-border);
          text-decoration: none;
          color: inherit;
          transition: background 0.15s ease;
          gap: 1rem;
        }
        .deploy-row-modern:last-child {
          border-bottom: none;
        }
        .deploy-row-modern:hover {
          background: var(--card-hover);
        }

        .deploy-row-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .deploy-commit-line {
          font-size: 0.88rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .latest-pill {
          font-size: 0.65rem;
          font-weight: 700;
          background: rgba(99, 102, 241, 0.15);
          color: var(--accent);
          padding: 0.1rem 0.45rem;
          border-radius: 4px;
          font-family: inherit;
        }
        .deploy-msg-text {
          font-size: 0.78rem;
          color: var(--muted);
          margin-top: 2px;
        }

        .deploy-row-right {
          display: flex;
          align-items: center;
          gap: 1.15rem;
          flex-shrink: 0;
        }
        .deploy-type-chip {
          font-size: 0.7rem;
          padding: 0.15rem 0.5rem;
          border-radius: 4px;
          background: var(--bg-inset);
          color: var(--muted);
          border: 1px solid var(--card-border);
        }
        .deploy-meta-sub {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.76rem;
          color: var(--muted);
        }
        .deploy-arrow {
          color: var(--muted);
          transition: transform 0.15s ease;
        }
        .deploy-row-modern:hover .deploy-arrow {
          transform: translateX(3px);
          color: var(--accent);
        }

        @media (max-width: 1024px) {
          .proj-hero-top {
            flex-direction: column;
            align-items: stretch;
          }
          .proj-actions-group {
            width: 100%;
          }
          .proj-actions-group .btn {
            flex: 1;
          }
          .deploy-row-modern {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
          }
          .deploy-row-right {
            width: 100%;
            justify-content: space-between;
          }
        }
      `}</style>

      <VmOfflineModal
        isOpen={offlineModalOpen}
        onClose={() => setOfflineModalOpen(false)}
        actionType={offlineAction}
        targetName={project.name}
      />
    </div>
  );
}
