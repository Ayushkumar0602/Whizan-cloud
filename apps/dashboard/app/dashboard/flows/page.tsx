"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Workflow,
  Plus,
  Play,
  RotateCcw,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Trash2,
  Sparkles,
  Zap,
  Activity,
  Layers,
  ArrowRight,
  ShieldCheck,
  Terminal,
  X,
  RefreshCw,
  GitBranch,
  Sliders,
  ChevronRight,
  Server,
  Globe,
  Radio,
  Check,
  LayoutGrid,
  List,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { flowsApi, type WorkflowItem, type WorkflowRunItem } from "@/lib/api";
import { PRESET_FLOW_TEMPLATES, type FlowTemplateDef, FLOW_NODE_TYPES } from "@/lib/flow-templates";

export default function FlowsOverviewPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"GRID" | "LIST">("GRID");
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  // Drawer for Run History
  const [historyWorkflow, setHistoryWorkflow] = useState<WorkflowItem | null>(null);
  const [historyRuns, setHistoryRuns] = useState<WorkflowRunItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchWorkflows = async () => {
    try {
      const list = await flowsApi.list();
      setWorkflows(list);
    } catch (err: any) {
      toast.error(err.message || "Failed to load pipelines");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const handleTrigger = async (wf: WorkflowItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTriggeringId(wf.id);
    try {
      const res = await flowsApi.trigger(wf.id, { source: "DASHBOARD_1_CLICK" });
      toast.success(`Pipeline triggered! Run ID: ${res.runId.slice(0, 8)}`);
      fetchWorkflows();
      if (historyWorkflow?.id === wf.id) {
        openHistoryDrawer(wf);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to trigger pipeline");
    } finally {
      setTriggeringId(null);
    }
  };

  const handleToggleEnable = async (wf: WorkflowItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = !wf.enabled;
    try {
      await flowsApi.update(wf.id, { enabled: newStatus });
      setWorkflows((prev) => prev.map((w) => (w.id === wf.id ? { ...w, enabled: newStatus } : w)));
      toast.success(newStatus ? "Pipeline resumed" : "Pipeline paused");
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle status");
    }
  };

  const handleDelete = async (wf: WorkflowItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete workflow "${wf.name}"?`)) return;
    try {
      await flowsApi.delete(wf.id);
      toast.success(`Workflow "${wf.name}" deleted.`);
      setWorkflows((prev) => prev.filter((w) => w.id !== wf.id));
      if (historyWorkflow?.id === wf.id) setHistoryWorkflow(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete workflow");
    }
  };

  const handleUseTemplate = async (template: FlowTemplateDef) => {
    const slug = `${template.slug}-${Date.now().toString(36).slice(-4)}`;
    try {
      const created = await flowsApi.create({
        name: template.name,
        slug,
        category: template.category,
        concurrencyPolicy: template.concurrencyPolicy,
        timeoutSeconds: template.timeoutSeconds,
        nodes: template.nodes,
        edges: template.edges,
      });
      toast.success(`Created workflow from template "${template.name}"!`);
      router.push(`/dashboard/flows/${created.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create workflow from template");
    }
  };

  const openHistoryDrawer = async (wf: WorkflowItem) => {
    setHistoryWorkflow(wf);
    setHistoryLoading(true);
    try {
      const data = await flowsApi.getRuns(wf.id, 1, 20);
      setHistoryRuns(data.runs || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load run history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const filteredWorkflows = useMemo(() => {
    return workflows.filter((wf) => {
      const matchesSearch =
        wf.name.toLowerCase().includes(search.toLowerCase()) ||
        wf.slug.toLowerCase().includes(search.toLowerCase()) ||
        (wf.description && wf.description.toLowerCase().includes(search.toLowerCase()));

      const matchesCat = selectedCategory === "ALL" || wf.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [workflows, search, selectedCategory]);

  const stats = useMemo(() => {
    const total = workflows.length;
    const active = workflows.filter((w) => w.enabled).length;
    const totalRuns = workflows.reduce((acc, w) => acc + (w._count?.runs || (w.runs ? w.runs.length : 0)), 0);
    const inFlight = workflows.reduce((acc, w) => {
      const isRunning = w.runs?.some((r) => r.status === "RUNNING" || r.status === "WAITING_FOR_APPROVAL");
      return acc + (isRunning ? 1 : 0);
    }, 0);
    return { total, active, totalRuns, inFlight };
  }, [workflows]);

  const getCategoryBadgeStyle = (cat: string) => {
    switch (cat) {
      case "BUILD_DEPLOY":
        return { bg: "rgba(56, 189, 248, 0.12)", color: "#38bdf8", border: "rgba(56, 189, 248, 0.25)" };
      case "CI_CD":
        return { bg: "rgba(245, 158, 11, 0.12)", color: "#fbbf24", border: "rgba(245, 158, 11, 0.25)" };
      case "EDGE_OPS":
        return { bg: "rgba(16, 185, 129, 0.12)", color: "#34d399", border: "rgba(16, 185, 129, 0.25)" };
      case "SECURITY":
        return { bg: "rgba(244, 63, 94, 0.12)", color: "#fb7185", border: "rgba(244, 63, 94, 0.25)" };
      default:
        return { bg: "rgba(99, 102, 241, 0.12)", color: "#818cf8", border: "rgba(99, 102, 241, 0.25)" };
    }
  };

  return (
    <div className="page" style={{ maxWidth: 1320, margin: "0 auto", padding: "1.75rem 1.25rem 4rem" }}>
      {/* ─── PAGE HEADER ──────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Whizan Flow"
        subtitle="Autonomous build, test, canary deployment, and self-healing pipelines with VM reboot protection."
        actions={
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              onClick={() => {
                setLoading(true);
                fetchWorkflows();
              }}
              className="btn btn-secondary"
              title="Refresh workflows"
            >
              <RefreshCw size={14} className={loading ? "spin-icon" : ""} />
              Refresh
            </button>
            <Link href="/dashboard/flows/new" className="btn btn-primary btn-lg">
              <Plus size={16} />
              New Pipeline
            </Link>
          </div>
        }
      />

      {/* ─── METRIC STAT CARDS ────────────────────────────────────────────────────── */}
      <div className="stats-grid" style={{ marginBottom: "2rem" }}>
        <div className="stat-card">
          <div className="stat-label">
            <GitBranch size={15} style={{ color: "var(--accent)" }} /> Total Pipelines
          </div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-sub">
            <span>{stats.active} enabled and ready</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Activity size={15} style={{ color: "#38bdf8" }} /> In-Flight Executions
          </div>
          <div className="stat-value" style={{ color: stats.inFlight > 0 ? "#38bdf8" : "inherit" }}>
            {stats.inFlight}
          </div>
          <div className="stat-sub">
            <span>{stats.inFlight > 0 ? "Executing or awaiting approval" : "All pipelines idle"}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Zap size={15} style={{ color: "#10b981" }} /> Pipeline Runs
          </div>
          <div className="stat-value">{stats.totalRuns}</div>
          <div className="stat-sub">
            <span>Historical buffered passes</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <ShieldCheck size={15} style={{ color: "#eab308" }} /> Self-Healing Sentinel
          </div>
          <div className="stat-value" style={{ color: "#10b981", fontSize: "1.45rem", fontWeight: 700 }}>
            Cold-Boot Ready
          </div>
          <div className="stat-sub">
            <span>Reboot reconciler armed</span>
          </div>
        </div>
      </div>

      {/* ─── STARTER BLUEPRINTS SHOWCASE ──────────────────────────────────────────── */}
      <div style={{ marginBottom: "2.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Sparkles size={18} style={{ color: "#ec4899" }} />
            <h2 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--foreground)" }}>
              Enterprise Production Blueprints
            </h2>
          </div>
          <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>1-click pre-wired DAG architectures</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {PRESET_FLOW_TEMPLATES.map((tmpl) => (
            <div
              key={tmpl.id}
              className="card card-hoverable"
              style={{
                padding: "1.35rem",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "1.1rem",
                position: "relative",
                overflow: "hidden",
                border: "1px solid var(--card-border)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: tmpl.gradient,
                }}
              />

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem" }}>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 650,
                      padding: "0.15rem 0.5rem",
                      borderRadius: 4,
                      background: "rgba(255, 255, 255, 0.08)",
                      color: "var(--muted)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {tmpl.badge}
                  </span>
                  <span style={{ fontSize: "0.74rem", color: "var(--muted)", fontWeight: 550 }}>
                    {tmpl.nodes.length} Steps Pre-Wired
                  </span>
                </div>

                <h3 style={{ fontSize: "0.98rem", fontWeight: 700, color: "var(--foreground)", marginBottom: "0.45rem", lineHeight: 1.35 }}>
                  {tmpl.name}
                </h3>

                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--muted)",
                    lineHeight: 1.5,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {tmpl.description}
                </p>

                {/* Step Flow Preview Pills */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    marginTop: "0.85rem",
                    overflowX: "auto",
                    paddingBottom: "0.2rem",
                  }}
                >
                  {tmpl.nodes.slice(0, 4).map((n, i) => (
                    <div key={n.nodeKey} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <span
                        style={{
                          fontSize: "0.66rem",
                          padding: "0.12rem 0.4rem",
                          borderRadius: 4,
                          background: "var(--bg-inset)",
                          color: "var(--foreground)",
                          whiteSpace: "nowrap",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {n.name}
                      </span>
                      {i < Math.min(tmpl.nodes.length - 1, 3) && (
                        <ChevronRight size={11} style={{ color: "var(--muted)", flexShrink: 0 }} />
                      )}
                    </div>
                  ))}
                  {tmpl.nodes.length > 4 && (
                    <span style={{ fontSize: "0.65rem", color: "var(--muted)", flexShrink: 0 }}>
                      +{tmpl.nodes.length - 4} more
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleUseTemplate(tmpl)}
                className="btn btn-secondary btn-sm"
                style={{ width: "100%", justifyContent: "space-between", fontSize: "0.82rem", padding: "0.55rem 0.85rem" }}
              >
                <span>Launch Blueprint</span>
                <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ─── PIPELINE INVENTORY HEADER & CONTROLS ─────────────────────────────────── */}
      <div style={{ marginBottom: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--foreground)" }}>
              Active Pipelines ({filteredWorkflows.length})
            </h2>
            <p style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
              Manage execution schedules, concurrency gates, and DAG configurations.
            </p>
          </div>

          {/* View Toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", background: "var(--bg-inset)", padding: "0.2rem", borderRadius: 8, border: "1px solid var(--border)" }}>
            <button
              onClick={() => setViewMode("GRID")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                padding: "0.3rem 0.6rem",
                borderRadius: 6,
                fontSize: "0.76rem",
                fontWeight: 550,
                background: viewMode === "GRID" ? "var(--card)" : "transparent",
                color: viewMode === "GRID" ? "var(--foreground)" : "var(--muted)",
                border: "none",
                cursor: "pointer",
              }}
            >
              <LayoutGrid size={13} />
              Grid
            </button>
            <button
              onClick={() => setViewMode("LIST")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                padding: "0.3rem 0.6rem",
                borderRadius: 6,
                fontSize: "0.76rem",
                fontWeight: 550,
                background: viewMode === "LIST" ? "var(--card)" : "transparent",
                color: viewMode === "LIST" ? "var(--foreground)" : "var(--muted)",
                border: "none",
                cursor: "pointer",
              }}
            >
              <List size={13} />
              Table
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ position: "relative", minWidth: 280, flex: 1, maxWidth: 420 }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--muted)",
              }}
            />
            <input
              type="text"
              placeholder="Search pipelines by name, slug, tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "0.6rem 0.8rem 0.6rem 2.3rem",
                background: "var(--bg-inset)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--foreground)",
                fontSize: "0.84rem",
                outline: "none",
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
            {["ALL", "BUILD_DEPLOY", "CI_CD", "EDGE_OPS", "SECURITY", "CRON_MAINTENANCE"].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: "0.4rem 0.75rem",
                  borderRadius: 6,
                  fontSize: "0.74rem",
                  fontWeight: 550,
                  border: "1px solid",
                  borderColor: selectedCategory === cat ? "var(--accent)" : "var(--border)",
                  background: selectedCategory === cat ? "var(--accent-glow)" : "var(--card)",
                  color: selectedCategory === cat ? "var(--foreground)" : "var(--muted)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {cat === "ALL" ? "All Categories" : cat.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── WORKFLOWS LISTING (GRID OR TABLE) ────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "4rem 0" }}>
          <div className="spinner" />
          <span style={{ marginLeft: "0.8rem", color: "var(--muted)", fontSize: "0.88rem" }}>Loading pipelines...</span>
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <div className="empty-state">
          <Workflow size={36} style={{ color: "var(--accent)", opacity: 0.8 }} />
          <h2>No pipelines found</h2>
          <p>
            {search || selectedCategory !== "ALL"
              ? "No pipelines match your search filter. Clear the search or pick another category."
              : "Launch an autonomous deployment pipeline using one of our production blueprints above or create one from scratch."}
          </p>
          <Link href="/dashboard/flows/new" className="btn btn-primary btn-lg" style={{ marginTop: "0.5rem" }}>
            <Plus size={16} />
            Create First Pipeline
          </Link>
        </div>
      ) : viewMode === "GRID" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {filteredWorkflows.map((wf) => {
            const lastRun = wf.runs && wf.runs.length > 0 ? wf.runs[0] : null;
            const isTriggering = triggeringId === wf.id;
            const badgeStyle = getCategoryBadgeStyle(wf.category);

            return (
              <div
                key={wf.id}
                className="card card-hoverable"
                style={{
                  padding: "1.4rem",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "1.2rem",
                  cursor: "pointer",
                }}
                onClick={() => router.push(`/dashboard/flows/${wf.id}`)}
              >
                {/* Header */}
                <div>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.4rem" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
                        <span style={{ fontSize: "1.02rem", fontWeight: 700, color: "var(--foreground)" }}>
                          {wf.name}
                        </span>
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontFamily: "monospace" }}>
                        {wf.slug}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 650,
                          padding: "0.18rem 0.55rem",
                          borderRadius: 5,
                          background: badgeStyle.bg,
                          color: badgeStyle.color,
                          border: `1px solid ${badgeStyle.border}`,
                          letterSpacing: "0.03em",
                        }}
                      >
                        {wf.category || "BUILD_DEPLOY"}
                      </span>

                      {/* Enable/Pause Switch */}
                      <label
                        className="switch"
                        style={{ transform: "scale(0.8)", transformOrigin: "right center" }}
                        onClick={(e) => e.stopPropagation()}
                        title={wf.enabled ? "Enabled - Click to pause" : "Paused - Click to enable"}
                      >
                        <input type="checkbox" checked={wf.enabled} onChange={(e) => handleToggleEnable(wf, e as any)} />
                        <span className="slider" />
                      </label>
                    </div>
                  </div>

                  {wf.description && (
                    <p
                      style={{
                        fontSize: "0.82rem",
                        color: "var(--muted)",
                        lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        marginBottom: "0.9rem",
                      }}
                    >
                      {wf.description}
                    </p>
                  )}

                  {/* DAG Stats Bar */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.85rem",
                      fontSize: "0.75rem",
                      color: "var(--muted)",
                      paddingTop: "0.5rem",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <span>
                      <strong style={{ color: "var(--foreground)" }}>
                        {wf._count?.nodes ?? (wf.nodes ? wf.nodes.length : 0)}
                      </strong>{" "}
                      DAG Nodes
                    </span>
                    <span>•</span>
                    <span>
                      <strong style={{ color: "var(--foreground)" }}>
                        {wf._count?.edges ?? (wf.edges ? wf.edges.length : 0)}
                      </strong>{" "}
                      Transitions
                    </span>
                    <span>•</span>
                    <span>Policy: {wf.concurrencyPolicy}</span>
                  </div>
                </div>

                {/* Last Run Status Banner */}
                <div
                  style={{
                    padding: "0.65rem 0.85rem",
                    borderRadius: 8,
                    background: "var(--bg-inset)",
                    border: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "0.78rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                    {lastRun ? (
                      <>
                        {lastRun.status === "SUCCESS" && <CheckCircle2 size={15} style={{ color: "#10b981" }} />}
                        {lastRun.status === "FAILED" && <AlertCircle size={15} style={{ color: "#f43f5e" }} />}
                        {lastRun.status === "RUNNING" && <RefreshCw size={15} className="spin-icon" style={{ color: "#38bdf8" }} />}
                        {lastRun.status === "WAITING_FOR_APPROVAL" && <Clock size={15} style={{ color: "#eab308" }} />}
                        <span style={{ fontWeight: 650 }}>{lastRun.status}</span>
                        {lastRun.durationMs && (
                          <span style={{ color: "var(--muted)" }}>({(lastRun.durationMs / 1000).toFixed(1)}s)</span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>No executions recorded</span>
                    )}
                  </div>

                  <span style={{ color: "var(--muted)", fontSize: "0.74rem" }}>
                    {lastRun ? formatDistanceToNow(new Date(lastRun.startedAt), { addSuffix: true }) : "Idle"}
                  </span>
                </div>

                {/* Action Footer */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: "0.2rem",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <button
                      onClick={(e) => handleTrigger(wf, e)}
                      disabled={isTriggering || !wf.enabled}
                      className="btn btn-primary btn-sm"
                      title="Run pipeline now"
                    >
                      <Play size={13} className={isTriggering ? "spin-icon" : ""} />
                      {isTriggering ? "Queueing..." : "Run"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openHistoryDrawer(wf);
                      }}
                      className="btn btn-secondary btn-sm"
                      title="View execution runs"
                    >
                      <Terminal size={13} />
                      Runs
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <Link
                      href={`/dashboard/flows/${wf.id}`}
                      className="btn btn-ghost btn-sm"
                      title="Open visual canvas studio"
                    >
                      <ExternalLink size={14} />
                    </Link>
                    <button
                      onClick={(e) => handleDelete(wf, e)}
                      className="btn btn-ghost btn-sm"
                      style={{ color: "var(--danger)" }}
                      title="Delete pipeline"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ─── TABLE VIEW ─────────────────────────────────────────────────────────── */
        <div className="card" style={{ padding: 0, overflow: "hidden", border: "1px solid var(--card-border)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "var(--bg-inset)", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontSize: "0.74rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                <th style={{ padding: "0.85rem 1.25rem" }}>Pipeline</th>
                <th style={{ padding: "0.85rem 1rem" }}>Category</th>
                <th style={{ padding: "0.85rem 1rem" }}>Status</th>
                <th style={{ padding: "0.85rem 1rem" }}>DAG Steps</th>
                <th style={{ padding: "0.85rem 1rem" }}>Last Execution</th>
                <th style={{ padding: "0.85rem 1.25rem", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkflows.map((wf) => {
                const lastRun = wf.runs && wf.runs.length > 0 ? wf.runs[0] : null;
                const isTriggering = triggeringId === wf.id;
                const badgeStyle = getCategoryBadgeStyle(wf.category);

                return (
                  <tr
                    key={wf.id}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.15s ease" }}
                    onClick={() => router.push(`/dashboard/flows/${wf.id}`)}
                    className="table-row-hover"
                  >
                    <td style={{ padding: "1rem 1.25rem" }}>
                      <div style={{ fontWeight: 650, color: "var(--foreground)" }}>{wf.name}</div>
                      <div style={{ fontSize: "0.74rem", color: "var(--muted)", fontFamily: "monospace" }}>{wf.slug}</div>
                    </td>
                    <td style={{ padding: "1rem 1rem" }}>
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 650,
                          padding: "0.15rem 0.5rem",
                          borderRadius: 4,
                          background: badgeStyle.bg,
                          color: badgeStyle.color,
                          border: `1px solid ${badgeStyle.border}`,
                        }}
                      >
                        {wf.category}
                      </span>
                    </td>
                    <td style={{ padding: "1rem 1rem" }}>
                      <label className="switch" style={{ transform: "scale(0.75)" }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={wf.enabled} onChange={(e) => handleToggleEnable(wf, e as any)} />
                        <span className="slider" />
                      </label>
                    </td>
                    <td style={{ padding: "1rem 1rem" }}>
                      <span style={{ fontWeight: 600 }}>{wf._count?.nodes ?? (wf.nodes ? wf.nodes.length : 0)}</span> nodes
                    </td>
                    <td style={{ padding: "1rem 1rem" }}>
                      {lastRun ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                          {lastRun.status === "SUCCESS" && <CheckCircle2 size={14} style={{ color: "#10b981" }} />}
                          {lastRun.status === "FAILED" && <AlertCircle size={14} style={{ color: "#f43f5e" }} />}
                          {lastRun.status === "RUNNING" && <RefreshCw size={14} className="spin-icon" style={{ color: "#38bdf8" }} />}
                          {lastRun.status === "WAITING_FOR_APPROVAL" && <Clock size={14} style={{ color: "#eab308" }} />}
                          <span style={{ fontWeight: 600, fontSize: "0.78rem" }}>{lastRun.status}</span>
                          <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>
                            • {formatDistanceToNow(new Date(lastRun.startedAt), { addSuffix: true })}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>None</span>
                      )}
                    </td>
                    <td style={{ padding: "1rem 1.25rem", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.4rem" }}>
                        <button
                          onClick={(e) => handleTrigger(wf, e)}
                          disabled={isTriggering || !wf.enabled}
                          className="btn btn-primary btn-sm"
                        >
                          <Play size={12} className={isTriggering ? "spin-icon" : ""} />
                          Run
                        </button>
                        <Link href={`/dashboard/flows/${wf.id}`} className="btn btn-ghost btn-sm">
                          <ExternalLink size={14} />
                        </Link>
                        <button onClick={(e) => handleDelete(wf, e)} className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── RUN HISTORY SLIDE-OVER DRAWER ────────────────────────────────────────── */}
      {historyWorkflow && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(6px)",
            zIndex: 1000,
            display: "flex",
            justifyContent: "flex-end",
          }}
          onClick={() => setHistoryWorkflow(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 560,
              height: "100%",
              background: "var(--background)",
              borderLeft: "1px solid var(--border)",
              boxShadow: "-12px 0 35px rgba(0, 0, 0, 0.5)",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--foreground)" }}>Execution History</h3>
                <p style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{historyWorkflow.name}</p>
              </div>
              <button onClick={() => setHistoryWorkflow(null)} className="btn btn-ghost btn-sm">
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>
              {historyLoading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 0" }}>
                  <div className="spinner" />
                </div>
              ) : historyRuns.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--muted)" }}>
                  <Clock size={36} style={{ margin: "0 auto 0.75rem", opacity: 0.5 }} />
                  <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>No executions recorded</div>
                  <p style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>Trigger your first execution from the console or webhook.</p>
                  <button
                    onClick={() => handleTrigger(historyWorkflow)}
                    className="btn btn-primary btn-sm"
                    style={{ marginTop: "1.25rem" }}
                  >
                    <Play size={13} /> Run Pipeline Now
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  {historyRuns.map((r) => (
                    <div
                      key={r.id}
                      className="card"
                      style={{
                        padding: "1rem 1.25rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                          {r.status === "SUCCESS" && <CheckCircle2 size={16} style={{ color: "#10b981" }} />}
                          {r.status === "FAILED" && <AlertCircle size={16} style={{ color: "#f43f5e" }} />}
                          {r.status === "RUNNING" && <RefreshCw size={16} className="spin-icon" style={{ color: "#38bdf8" }} />}
                          {r.status === "WAITING_FOR_APPROVAL" && <Clock size={16} style={{ color: "#eab308" }} />}
                          <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{r.status}</span>
                        </div>
                        <span style={{ fontSize: "0.74rem", color: "var(--muted)", fontFamily: "monospace" }}>
                          {r.id.slice(0, 8)}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--muted)" }}>
                        <span>Trigger: {r.triggerSource}</span>
                        <span>{format(new Date(r.startedAt), "MMM d, HH:mm:ss")}</span>
                      </div>

                      {r.durationMs && (
                        <div style={{ fontSize: "0.76rem", color: "var(--muted)" }}>
                          Duration: {(r.durationMs / 1000).toFixed(2)}s • Steps: {r._count?.stepRuns || r.stepRuns?.length || 0}
                        </div>
                      )}

                      {r.errorMessage && (
                        <div
                          style={{
                            padding: "0.5rem 0.75rem",
                            borderRadius: 6,
                            background: "rgba(244, 63, 94, 0.12)",
                            color: "#f43f5e",
                            fontSize: "0.76rem",
                            lineHeight: 1.45,
                            border: "1px solid rgba(244, 63, 94, 0.25)",
                          }}
                        >
                          {r.errorMessage}
                        </div>
                      )}

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
                        <Link
                          href={`/dashboard/flows/${historyWorkflow.id}?runId=${r.id}`}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: "0.78rem" }}
                        >
                          <Terminal size={13} />
                          Live Console & Logs
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
