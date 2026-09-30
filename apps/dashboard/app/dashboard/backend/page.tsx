"use client";
import { useEffect, useState, useMemo } from "react";
import { services, type ServiceWithLatestDeploy, type AiAnalysisResponse } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Server,
  GitBranch,
  Clock,
  Globe,
  Lock,
  Search,
  Filter,
  Activity,
  Cpu,
  Terminal,
  ExternalLink,
  Copy,
  Check,
  Radio,
  Zap,
  Moon,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  ArrowRight
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

export default function BackendHostingPage() {
  const router = useRouter();
  const [list, setList] = useState<ServiceWithLatestDeploy[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "ASLEEP">("ALL");
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // AI Inspector State
  const [aiRepoUrl, setAiRepoUrl] = useState("");
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<AiAnalysisResponse["analysis"] | null>(null);
  const [aiRefused, setAiRefused] = useState(false);
  const [aiRefusalReason, setAiRefusalReason] = useState<string | null>(null);

  useEffect(() => {
    services.list()
      .then(setList)
      .catch(() => toast.error("Failed to load backend services"))
      .finally(() => setLoading(false));
  }, []);

  function handleCopy(text: string, slug: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedSlug(slug);
    toast.success("Mesh URL copied to clipboard");
    setTimeout(() => setCopiedSlug(null), 2000);
  }

  async function handleRunInspector(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const url = aiRepoUrl.trim();
    if (!url) {
      toast.error("Please enter a GitHub repository URL to analyze");
      return;
    }
    setAiAnalyzing(true);
    setAiRefused(false);
    setAiRefusalReason(null);
    setAiResult(null);

    try {
      toast.info("🤖 Gemini 3.5 Flash Lite is inspecting repository...", { duration: 3000 });
      const res = await services.analyze({ githubRepoUrl: url, branch: "main" });
      if (!res.success || !res.analysis) throw new Error("Failed to analyze repository");

      const { analysis } = res;
      setAiResult(analysis);
      if (!analysis.isDeployable) {
        setAiRefused(true);
        setAiRefusalReason(analysis.rejectionReason || "This project is not supported by Whizan Cloud.");
        toast.error("🛑 Blocked by System Guardrail: Project cannot be deployed.");
      } else {
        setAiRefused(false);
        setAiRefusalReason(null);
        toast.success(`✨ Gemini 3.5 Flash Lite verified ${analysis.stack} (${analysis.framework})!`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to analyze repository");
    } finally {
      setAiAnalyzing(false);
    }
  }

  const filtered = useMemo(() => {
    return list.filter(s => {
      const matchesSearch =
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.language.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      const latest = s.deployments[0];
      const isActive = latest?.status === "READY" && !!latest.containerPort;
      const isAsleep = latest?.status === "READY" && !latest.containerPort;

      if (statusFilter === "ACTIVE") return isActive;
      if (statusFilter === "ASLEEP") return isAsleep;
      return true;
    });
  }, [list, searchQuery, statusFilter]);

  const activeCount = list.filter(s => s.deployments[0]?.status === "READY" && !!s.deployments[0]?.containerPort).length;
  const asleepCount = list.filter(s => s.deployments[0]?.status === "READY" && !s.deployments[0]?.containerPort).length;

  return (
    <div className="page">
      <PageHeader
        title="Backend Services"
        subtitle="Deploy backend APIs, microservices, and background queue workers in any language (Node.js, Python, Go, Rust, Java, Dockerfile) with Gemini 3.5 Flash Lite AI analysis & 0.1 vCPU Free Tier."
        actions={
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.76rem", color: "#818cf8", background: "rgba(99, 102, 241, 0.12)", border: "1px solid rgba(99, 102, 241, 0.25)", padding: "0.35rem 0.75rem", borderRadius: "999px", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <Zap size={13} style={{ color: "#818cf8" }} /> Gemini 3.5 Flash Lite Guardrails Active
            </span>
            <Link href="/dashboard/backend/new" className="btn btn-primary btn-lg" id="new-service-btn">
              <Plus size={17} /> New Service
            </Link>
          </div>
        }
      />

      {/* Overview Stat Counters */}
      <div className="stats-grid" style={{ marginBottom: "1.75rem" }}>
        <div className="stat-card">
          <div className="stat-label"><Server size={14} className="text-accent" /> Total Services</div>
          <div className="stat-value">{list.length}</div>
          <div className="stat-sub">Docker isolated runtimes</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><Activity size={14} style={{ color: "#10b981" }} /> Running Containers</div>
          <div className="stat-value" style={{ color: "#10b981" }}>{activeCount}</div>
          <div className="stat-sub">Accepting live traffic</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><Moon size={14} style={{ color: "#f59e0b" }} /> Auto-Sleep (0.1 vCPU)</div>
          <div className="stat-value" style={{ color: "#f59e0b" }}>{asleepCount}</div>
          <div className="stat-sub">Scaled to zero (Free Tier)</div>
        </div>
        <div className="stat-card">
          <div className="stat-label"><Radio size={14} className="text-accent" /> Mesh Network</div>
          <div className="stat-value" style={{ fontSize: "1.25rem", fontFamily: "var(--font-geist-mono), monospace" }}>
            whizan-bridge
          </div>
          <div className="stat-sub" style={{ color: "var(--success)" }}>
            Sub-millisecond latency
          </div>
        </div>
      </div>

      {/* AI Repository Analyzer & Guardrail Inspector Banner */}
      <div className="card ai-inspector-card" style={{ marginBottom: "1.75rem", border: "1px solid rgba(99, 102, 241, 0.35)", background: "radial-gradient(ellipse at top left, rgba(99, 102, 241, 0.08) 0%, rgba(15, 23, 42, 0.4) 100%)", padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.85rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Sparkles size={17} style={{ color: "#818cf8" }} />
              <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
                AI Repository Analyzer &amp; System Guardrails
              </h3>
              <span style={{ fontSize: "0.7rem", color: "#a5b4fc", background: "rgba(99, 102, 241, 0.18)", padding: "0.15rem 0.5rem", borderRadius: "999px", border: "1px solid rgba(99, 102, 241, 0.3)", fontWeight: 600 }}>
                gemini-3.5-flash-lite
              </span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0.25rem 0 0 0" }}>
              Verify stack independence, auto-detect framework &amp; test system guardrails for any GitHub repo before deployment.
            </p>
          </div>
        </div>

        <form onSubmit={handleRunInspector} style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <input
            type="text"
            className="input mono"
            placeholder="Paste GitHub URL: https://github.com/owner/repository"
            value={aiRepoUrl}
            onChange={e => setAiRepoUrl(e.target.value)}
            style={{ flex: 1, minWidth: "260px", background: "rgba(15, 23, 42, 0.6)" }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={aiAnalyzing || !aiRepoUrl.trim()}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", whiteSpace: "nowrap" }}
          >
            {aiAnalyzing ? <Loader2 size={15} className="spin-icon" /> : <Sparkles size={15} />}
            <span>{aiAnalyzing ? "Inspecting with Gemini..." : "✨ Inspect Repository"}</span>
          </button>
        </form>

        {/* Guardrail Refusal Result */}
        {aiRefused && aiRefusalReason && (
          <div style={{ marginTop: "1rem", padding: "1rem", borderRadius: "8px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.35)", display: "flex", gap: "0.85rem", alignItems: "flex-start" }}>
            <ShieldAlert size={22} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "#f87171" }}>
                  🛑 Non-Deployable Project Blocked by System Guardrail
                </span>
                <span style={{ fontSize: "0.68rem", background: "rgba(239, 68, 68, 0.2)", color: "#fca5a5", padding: "0.15rem 0.45rem", borderRadius: "4px", fontWeight: 600 }}>
                  REFUSED
                </span>
              </div>
              <p style={{ margin: "0.4rem 0 0.5rem 0", fontSize: "0.84rem", color: "#fecaca", lineHeight: 1.45 }}>
                {aiRefusalReason}
              </p>
              <div style={{ fontSize: "0.74rem", color: "rgba(254, 202, 202, 0.8)", lineHeight: 1.4 }}>
                <strong>Whizan Cloud Policy:</strong> We host backend APIs, web microservices, and background queue workers. Desktop GUI clients (PyQt, Tkinter, Electron client), native mobile apps, and one-shot CLI scripts are not deployable.
              </div>
            </div>
          </div>
        )}

        {/* Guardrail Passed Result */}
        {!aiRefused && aiResult && aiResult.isDeployable && (
          <div style={{ marginTop: "1rem", padding: "1rem", borderRadius: "8px", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.35)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem" }}>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                <ShieldCheck size={22} style={{ color: "#10b981", flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "#34d399" }}>
                      ✅ Verified Deployable Stack: {aiResult.stack}
                    </span>
                    <span style={{ fontSize: "0.72rem", background: "rgba(16, 185, 129, 0.18)", color: "#6ee7b7", padding: "0.15rem 0.5rem", borderRadius: "4px", fontWeight: 600 }}>
                      {aiResult.framework}
                    </span>
                    {aiResult.isWorker && (
                      <span style={{ fontSize: "0.72rem", background: "rgba(168, 85, 247, 0.18)", color: "#c084fc", padding: "0.15rem 0.5rem", borderRadius: "4px", fontWeight: 600 }}>
                        WORKER
                      </span>
                    )}
                  </div>
                  <p style={{ margin: "0.35rem 0 0.5rem 0", fontSize: "0.82rem", color: "var(--foreground)", opacity: 0.9 }}>
                    {aiResult.explanation}
                  </p>
                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: "0.76rem", color: "var(--muted)" }}>
                    <span>Language: <strong className="mono" style={{ color: "var(--foreground)" }}>{aiResult.language}</strong></span>
                    <span>Port: <strong className="mono" style={{ color: "var(--foreground)" }}>{aiResult.recommendedPort}</strong></span>
                    <span>Start: <code className="mono" style={{ color: "#38bdf8" }}>{aiResult.startCommand}</code></span>
                  </div>
                </div>
              </div>

              <Link
                href={`/dashboard/backend/new?repo=${encodeURIComponent(aiRepoUrl.trim())}`}
                className="btn btn-primary btn-sm"
                style={{ alignSelf: "center", gap: "0.4rem" }}
              >
                <span>🚀 Deploy to Whizan Cloud</span>
                <ArrowRight size={13} />
              </Link>
            </div>

            {aiResult.requiredEnvVars && aiResult.requiredEnvVars.length > 0 && (
              <div style={{ marginTop: "0.85rem", paddingTop: "0.75rem", borderTop: "1px dashed rgba(16, 185, 129, 0.25)" }}>
                <span style={{ fontSize: "0.74rem", fontWeight: 600, color: "#f59e0b", display: "block", marginBottom: "0.35rem" }}>
                  ⚠️ Required Environment Variables Detected:
                </span>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {aiResult.requiredEnvVars.map(v => (
                    <span key={v.name} className="mono" style={{ fontSize: "0.72rem", padding: "0.15rem 0.45rem", borderRadius: "4px", background: "rgba(245, 158, 11, 0.12)", color: "#fbbf24", border: "1px solid rgba(245, 158, 11, 0.25)" }}>
                      {v.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="controls-bar">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search by service name, slug, or language..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-pill-group">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`filter-btn ${statusFilter === "ALL" ? "filter-btn-active" : ""}`}
          >
            All ({list.length})
          </button>
          <button
            onClick={() => setStatusFilter("ACTIVE")}
            className={`filter-btn ${statusFilter === "ACTIVE" ? "filter-btn-active" : ""}`}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter("ASLEEP")}
            className={`filter-btn ${statusFilter === "ASLEEP" ? "filter-btn-active" : ""}`}
          >
            Asleep ({asleepCount})
          </button>
        </div>
      </div>

      {/* Services Grid or Loading / Empty */}
      {loading ? (
        <div className="service-cards-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="card skeleton-card">
              <div className="skeleton" style={{ height: 26, width: "60%" }} />
              <div className="skeleton" style={{ height: 42, width: "100%", margin: "1rem 0" }} />
              <div className="skeleton" style={{ height: 20, width: "80%", marginTop: "auto" }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon-wrap">
            <Server size={32} />
          </div>
          <h2>{searchQuery || statusFilter !== "ALL" ? "No matching services found" : "No backend services yet"}</h2>
          <p>
            {searchQuery || statusFilter !== "ALL"
              ? "Try changing your search term or status filter."
              : "Deploy a Node.js API, Python Worker, or Go microservice with 0.1 vCPU spin-down and mesh connectivity."}
          </p>
          <Link href="/dashboard/backend/new" className="btn btn-primary btn-lg" style={{ marginTop: "0.5rem" }}>
            <Plus size={16} /> Deploy First Service
          </Link>
        </div>
      ) : (
        <div className="service-cards-grid">
          {filtered.map(s => {
            const latest = s.deployments[0];
            const isAsleep = latest?.status === "READY" && !latest.containerPort;
            const isActive = latest?.status === "READY" && !!latest.containerPort;
            const isBuilding = latest?.status === "BUILDING" || latest?.status === "QUEUED";

            const meshUrl = `http://${s.slug}:${s.internalPort}`;

            return (
              <Link
                href={`/dashboard/backend/${s.id}`}
                key={s.id}
                className="service-card-modern"
              >
                {/* Luminous Top Status Line */}
                <div
                  className="card-glow-strip"
                  style={{
                    background: isActive
                      ? "linear-gradient(90deg, #10b981, #34d399)"
                      : isAsleep
                      ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                      : isBuilding
                      ? "linear-gradient(90deg, #6366f1, #38bdf8)"
                      : "var(--card-border)",
                  }}
                />

                {/* Card Header */}
                <div className="card-header-row">
                  <div className="card-brand-box">
                    <Server size={18} className="text-accent" />
                  </div>
                  <div className="card-title-meta">
                    <h3 className="card-title-text">{s.name}</h3>
                    <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                      <div className="card-lang-tag mono" style={s.language === "DOCKERFILE" ? { background: "rgba(14, 165, 233, 0.12)", color: "#0ea5e9", borderColor: "rgba(14, 165, 233, 0.3)" } : undefined}>
                        {s.language === "DOCKERFILE" ? "DOCKERFILE / POLYGLOT" : s.language}
                      </div>
                      {s.internalPort === 0 && (
                        <div className="card-lang-tag mono" style={{ background: "rgba(168, 85, 247, 0.12)", color: "#c084fc", borderColor: "rgba(168, 85, 247, 0.3)" }}>
                          WORKER
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="card-status-pill">
                    {isActive && (
                      <span className="badge badge-ready">
                        <span className="pulse-indicator" />
                        RUNNING
                      </span>
                    )}
                    {isAsleep && (
                      <span className="badge badge-queued">
                        <Clock size={11} />
                        ASLEEP
                      </span>
                    )}
                    {!isActive && !isAsleep && <StatusBadge status={latest?.status || "QUEUED"} />}
                  </div>
                </div>

                {/* Private Mesh Address Pill */}
                <div className="mesh-address-box">
                  <div className="mesh-address-left">
                    <Radio size={13} className="text-accent" />
                    <span className="mesh-address-url mono">{meshUrl}</span>
                  </div>
                  <button
                    onClick={(e) => handleCopy(meshUrl, s.slug, e)}
                    className="copy-chip-btn"
                    title="Copy internal mesh address"
                  >
                    {copiedSlug === s.slug ? <Check size={12} style={{ color: "#10b981" }} /> : <Copy size={12} />}
                  </button>
                </div>

                {/* Resource Allocation & Mode */}
                <div className="resource-pill-row">
                  {s.autoSleep ? (
                    <span className="resource-chip chip-amber">
                      <Moon size={11} />
                      <span>Free Tier · 0.1 vCPU</span>
                    </span>
                  ) : (
                    <span className="resource-chip chip-green">
                      <Zap size={11} />
                      <span>Dedicated · {s.cpuLimit || 0.5} vCPU / {s.memoryLimit || 512}MB</span>
                    </span>
                  )}

                  {s.isPublic ? (
                    <span className="resource-chip chip-blue">
                      <Globe size={11} />
                      <span>Public Ingress</span>
                    </span>
                  ) : (
                    <span className="resource-chip chip-neutral">
                      <Lock size={11} />
                      <span>Mesh Only</span>
                    </span>
                  )}
                </div>

                {/* Card Footer */}
                <div className="card-footer-row">
                  <div className="footer-meta-item">
                    <GitBranch size={13} />
                    <span>{s.branch}</span>
                  </div>
                  <div className="footer-meta-item">
                    <Clock size={13} />
                    <span>
                      {latest?.createdAt
                        ? formatDistanceToNow(new Date(latest.createdAt), { addSuffix: true })
                        : "Never deployed"}
                    </span>
                  </div>
                  <div className="footer-open-hint">
                    Manage ➔
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <style>{`
        /* Controls Bar */
        .controls-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1.75rem;
          flex-wrap: wrap;
        }

        .search-box {
          position: relative;
          flex: 1;
          min-width: 260px;
          max-width: 460px;
        }
        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--muted);
          pointer-events: none;
        }
        .search-input {
          width: 100%;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: 8px;
          padding: 0.6rem 0.85rem 0.6rem 2.25rem;
          font-size: 0.84rem;
          color: var(--foreground);
          transition: all 0.15s ease;
        }
        .search-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-glow);
          background: var(--card-hover);
        }

        .filter-pill-group {
          display: flex;
          gap: 0.35rem;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          padding: 0.25rem;
          border-radius: 8px;
        }
        .filter-btn {
          padding: 0.35rem 0.75rem;
          border-radius: 6px;
          border: none;
          background: transparent;
          font-size: 0.78rem;
          font-weight: 550;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .filter-btn:hover {
          color: var(--foreground);
        }
        .filter-btn-active {
          background: var(--card);
          color: var(--foreground);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
          font-weight: 650;
        }

        /* Services Grid */
        .service-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 1.35rem;
        }

        .skeleton-card {
          min-height: 220px;
          display: flex;
          flex-direction: column;
        }

        .service-card-modern {
          display: flex;
          flex-direction: column;
          background: var(--card);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--card-border);
          border-radius: var(--radius);
          padding: 1.35rem;
          text-decoration: none;
          color: inherit;
          position: relative;
          overflow: hidden;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: var(--shadow);
        }
        .service-card-modern:hover {
          border-color: var(--card-border-hover);
          transform: translateY(-2px);
          box-shadow: var(--shadow-hover);
        }

        .card-glow-strip {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
        }

        .card-header-row {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          margin-top: 0.25rem;
          margin-bottom: 1rem;
        }
        .card-brand-box {
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
        .card-title-meta {
          flex: 1;
          min-width: 0;
        }
        .card-title-text {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--foreground);
          letter-spacing: -0.02em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .card-lang-tag {
          font-size: 0.7rem;
          color: var(--muted);
          font-weight: 600;
          text-transform: uppercase;
        }
        .card-status-pill {
          flex-shrink: 0;
        }
        .pulse-indicator {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 6px #10b981;
        }

        /* Mesh Address Box */
        .mesh-address-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: 8px;
          padding: 0.55rem 0.75rem;
          margin-bottom: 0.85rem;
          gap: 0.5rem;
        }
        .mesh-address-left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 0;
        }
        .mesh-address-url {
          font-size: 0.76rem;
          color: var(--foreground);
          font-weight: 500;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .copy-chip-btn {
          background: transparent;
          border: none;
          color: var(--muted);
          cursor: pointer;
          padding: 0.2rem;
          border-radius: 4px;
          display: flex;
          align-items: center;
          transition: all 0.15s ease;
        }
        .copy-chip-btn:hover {
          color: var(--foreground);
          background: rgba(255, 255, 255, 0.08);
        }

        /* Resource Chips */
        .resource-pill-row {
          display: flex;
          gap: 0.45rem;
          flex-wrap: wrap;
          margin-bottom: 1.15rem;
        }
        .resource-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0.2rem 0.55rem;
          border-radius: 6px;
          border: 1px solid transparent;
        }
        .chip-amber {
          background: rgba(245, 158, 11, 0.1);
          color: #f59e0b;
          border-color: rgba(245, 158, 11, 0.25);
        }
        .chip-green {
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
          border-color: rgba(16, 185, 129, 0.25);
        }
        .chip-blue {
          background: rgba(56, 189, 248, 0.1);
          color: #38bdf8;
          border-color: rgba(56, 189, 248, 0.25);
        }
        .chip-neutral {
          background: rgba(255, 255, 255, 0.05);
          color: var(--muted);
          border-color: var(--card-border);
        }

        /* Card Footer */
        .card-footer-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding-top: 0.85rem;
          border-top: 1px solid var(--card-border);
          margin-top: auto;
          font-size: 0.74rem;
          color: var(--muted);
        }
        .footer-meta-item {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }
        .footer-open-hint {
          margin-left: auto;
          color: var(--accent);
          font-weight: 600;
          transition: transform 0.15s ease;
        }
        .service-card-modern:hover .footer-open-hint {
          transform: translateX(2px);
        }

        .empty-icon-wrap {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: var(--accent-glow);
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        @media (max-width: 640px) {
          .service-cards-grid {
            grid-template-columns: 1fr;
          }
          .controls-bar {
            flex-direction: column;
            align-items: stretch;
          }
          .search-box {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
