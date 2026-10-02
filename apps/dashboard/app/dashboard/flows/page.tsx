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
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { flowsApi, type WorkflowItem, type WorkflowRunItem } from "@/lib/api";
import { PRESET_FLOW_TEMPLATES, type FlowTemplateDef } from "@/lib/flow-templates";

export default function FlowsOverviewPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
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
      toast.error(err.message || "Failed to load workflows");
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
      // Refresh list to update run stats
      fetchWorkflows();
      if (historyWorkflow?.id === wf.id) {
        openHistoryDrawer(wf);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to trigger workflow");
    } finally {
      setTriggeringId(null);
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

  // Aggregate stats
  const totalWorkflows = workflows.length;
  const totalRuns = workflows.reduce((acc, w) => acc + (w._count?.runs || (w.runs ? w.runs.length : 0)), 0);
  const activeRuns = workflows.reduce((acc, w) => {
    const isRunning = w.runs?.some((r) => r.status === "RUNNING" || r.status === "WAITING_FOR_APPROVAL");
    return acc + (isRunning ? 1 : 0);
  }, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem", paddingBottom: "3rem" }}>
      {/* Page Header */}
      <PageHeader
        title="Whizan Flow"
        subtitle="Autonomous build, test, canary deployment, and self-healing pipelines"
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <button
              onClick={() => {
                setLoading(true);
                fetchWorkflows();
              }}
              className="btn btn-secondary btn-sm"
              title="Refresh workflows"
            >
              <RefreshCw size={14} className={loading ? "spin-icon" : ""} />
              Refresh
            </button>
            <Link href="/dashboard/flows/new" className="btn btn-primary btn-sm">
              <Plus size={15} />
              New Workflow
            </Link>
          </div>
        }
      />

      {/* Metric Cards Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
        }}
      >
        <div className="card" style={{ padding: "1.1rem 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 500 }}>Total Pipelines</span>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(99, 102, 241, 0.12)", color: "#818cf8", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <GitBranch size={16} />
            </div>
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--foreground)" }}>{totalWorkflows}</div>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>DAG workflows defined</span>
        </div>

        <div className="card" style={{ padding: "1.1rem 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 500 }}>Active In-Flight</span>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(56, 189, 248, 0.12)", color: "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Activity size={16} />
            </div>
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: activeRuns > 0 ? "#38bdf8" : "var(--foreground)" }}>
            {activeRuns}
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Executing or waiting approval</span>
        </div>

        <div className="card" style={{ padding: "1.1rem 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 500 }}>Total Pipeline Runs</span>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(16, 185, 129, 0.12)", color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Zap size={16} />
            </div>
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--foreground)" }}>{totalRuns}</div>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Buffered execution passes</span>
        </div>

        <div className="card" style={{ padding: "1.1rem 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 500 }}>Host Self-Healing</span>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(234, 179, 8, 0.12)", color: "#eab308", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ShieldCheck size={16} />
            </div>
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#10b981" }}>Active</div>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Cold-boot reconciliation enabled</span>
        </div>
      </div>

      {/* Starter Templates Banner */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Sparkles size={16} style={{ color: "#ec4899" }} />
            <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>Production Starter Blueprints</span>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Pre-configured DAG pipelines</span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "1rem",
          }}
        >
          {PRESET_FLOW_TEMPLATES.map((tmpl) => (
            <div
              key={tmpl.id}
              className="card card-hoverable"
              style={{
                padding: "1.1rem",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "0.85rem",
                position: "relative",
                overflow: "hidden",
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
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 600,
                      padding: "0.15rem 0.45rem",
                      borderRadius: 4,
                      background: "rgba(255, 255, 255, 0.08)",
                      color: "var(--muted)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {tmpl.badge}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{tmpl.nodes.length} nodes</span>
                </div>
                <div style={{ fontSize: "0.92rem", fontWeight: 650, color: "var(--foreground)", marginBottom: "0.3rem" }}>
                  {tmpl.name}
                </div>
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--muted)",
                    lineHeight: 1.45,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {tmpl.description}
                </div>
              </div>

              <button
                onClick={() => handleUseTemplate(tmpl)}
                className="btn btn-secondary btn-sm"
                style={{ width: "100%", justifyContent: "space-between", fontSize: "0.78rem" }}
              >
                <span>Use Blueprint</span>
                <ArrowRight size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.85rem",
        }}
      >
        {/* Search */}
        <div style={{ position: "relative", minWidth: 260, flex: 1, maxWidth: 400 }}>
          <Search
            size={14}
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
              padding: "0.55rem 0.75rem 0.55rem 2.2rem",
              background: "var(--bg-inset)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              color: "var(--foreground)",
              fontSize: "0.84rem",
              outline: "none",
            }}
          />
        </div>

        {/* Category Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
          {["ALL", "BUILD_DEPLOY", "CI_CD", "EDGE_OPS", "SECURITY", "CRON_MAINTENANCE"].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: "0.35rem 0.7rem",
                borderRadius: 6,
                fontSize: "0.74rem",
                fontWeight: 550,
                border: "1px solid",
                borderColor: selectedCategory === cat ? "var(--accent)" : "var(--border)",
                background: selectedCategory === cat ? "var(--accent-glow)" : "transparent",
                color: selectedCategory === cat ? "var(--foreground)" : "var(--muted)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {cat === "ALL" ? "All Flows" : cat.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Workflows List / Grid */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "4rem 0" }}>
          <div className="spinner" />
          <span style={{ marginLeft: "0.8rem", color: "var(--muted)", fontSize: "0.88rem" }}>Loading workflows...</span>
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <div
          className="card"
          style={{
            padding: "3.5rem 1.5rem",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.9rem",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "rgba(99, 102, 241, 0.12)",
              color: "#818cf8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Workflow size={28} />
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 650 }}>No workflows found</div>
          <p style={{ fontSize: "0.84rem", color: "var(--muted)", maxWidth: 440, lineHeight: 1.5 }}>
            {search || selectedCategory !== "ALL"
              ? "No pipelines match your current search and filter criteria."
              : "Create an autonomous pipeline from scratch or launch one of our production blueprints above."}
          </p>
          <Link href="/dashboard/flows/new" className="btn btn-primary btn-sm" style={{ marginTop: "0.5rem" }}>
            <Plus size={15} />
            Create First Pipeline
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "1.1rem",
          }}
        >
          {filteredWorkflows.map((wf) => {
            const lastRun = wf.runs && wf.runs.length > 0 ? wf.runs[0] : null;
            const isTriggering = triggeringId === wf.id;

            return (
              <div
                key={wf.id}
                className="card card-hoverable"
                style={{
                  padding: "1.3rem",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "1.1rem",
                  cursor: "pointer",
                }}
                onClick={() => router.push(`/dashboard/flows/${wf.id}`)}
              >
                {/* Header */}
                <div>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.4rem" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
                        <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--foreground)" }}>{wf.name}</span>
                        {!wf.enabled && (
                          <span
                            style={{
                              fontSize: "0.65rem",
                              padding: "0.1rem 0.4rem",
                              borderRadius: 4,
                              background: "rgba(244, 63, 94, 0.15)",
                              color: "#f43f5e",
                              fontWeight: 600,
                            }}
                          >
                            PAUSED
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontFamily: "monospace" }}>
                        {wf.slug}
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize: "0.68rem",
                        fontWeight: 600,
                        padding: "0.2rem 0.5rem",
                        borderRadius: 5,
                        background: "rgba(99, 102, 241, 0.12)",
                        color: "#818cf8",
                        letterSpacing: "0.03em",
                      }}
                    >
                      {wf.category || "BUILD_DEPLOY"}
                    </span>
                  </div>

                  {wf.description && (
                    <p
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--muted)",
                        lineHeight: 1.45,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        marginBottom: "0.75rem",
                      }}
                    >
                      {wf.description}
                    </p>
                  )}

                  {/* Node & Edge metadata */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.85rem",
                      fontSize: "0.74rem",
                      color: "var(--muted)",
                      paddingTop: "0.4rem",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    <span>
                      <strong style={{ color: "var(--foreground)" }}>{wf._count?.nodes ?? (wf.nodes ? wf.nodes.length : 0)}</strong> steps
                    </span>
                    <span>•</span>
                    <span>
                      <strong style={{ color: "var(--foreground)" }}>{wf._count?.edges ?? (wf.edges ? wf.edges.length : 0)}</strong> transitions
                    </span>
                    <span>•</span>
                    <span>Policy: {wf.concurrencyPolicy}</span>
                  </div>
                </div>

                {/* Last Run Status Banner */}
                <div
                  style={{
                    padding: "0.55rem 0.8rem",
                    borderRadius: 8,
                    background: "var(--bg-inset)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "0.76rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {lastRun ? (
                      <>
                        {lastRun.status === "SUCCESS" && <CheckCircle2 size={14} style={{ color: "#10b981" }} />}
                        {lastRun.status === "FAILED" && <AlertCircle size={14} style={{ color: "#f43f5e" }} />}
                        {lastRun.status === "RUNNING" && <RefreshCw size={14} className="spin-icon" style={{ color: "#38bdf8" }} />}
                        {lastRun.status === "WAITING_FOR_APPROVAL" && <Clock size={14} style={{ color: "#eab308" }} />}
                        <span style={{ fontWeight: 600 }}>{lastRun.status}</span>
                        {lastRun.durationMs && (
                          <span style={{ color: "var(--muted)" }}>({(lastRun.durationMs / 1000).toFixed(1)}s)</span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>No executions yet</span>
                    )}
                  </div>

                  <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>
                    {lastRun ? formatDistanceToNow(new Date(lastRun.startedAt), { addSuffix: true }) : "Idle"}
                  </span>
                </div>

                {/* Actions Footer */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: "0.4rem",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
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
                      title="Open visual canvas"
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
      )}

      {/* Slide-over Run History Drawer */}
      {historyWorkflow && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 1000,
            display: "flex",
            justifyContent: "flex-end",
          }}
          onClick={() => setHistoryWorkflow(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 540,
              height: "100%",
              background: "var(--background)",
              borderLeft: "1px solid var(--border)",
              boxShadow: "-10px 0 30px rgba(0, 0, 0, 0.4)",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
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
                <div style={{ fontSize: "1.05rem", fontWeight: 700 }}>Execution Runs</div>
                <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{historyWorkflow.name}</div>
              </div>
              <button onClick={() => setHistoryWorkflow(null)} className="btn btn-ghost btn-sm">
                <X size={16} />
              </button>
            </div>

            {/* Runs list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem" }}>
              {historyLoading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem 0" }}>
                  <div className="spinner" />
                </div>
              ) : historyRuns.length === 0 ? (
                <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--muted)" }}>
                  <Clock size={32} style={{ margin: "0 auto 0.75rem", opacity: 0.5 }} />
                  <div>No executions recorded yet.</div>
                  <button
                    onClick={() => handleTrigger(historyWorkflow)}
                    className="btn btn-primary btn-sm"
                    style={{ marginTop: "1rem" }}
                  >
                    <Play size={13} /> Run Pipeline Now
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {historyRuns.map((r) => (
                    <div
                      key={r.id}
                      className="card"
                      style={{
                        padding: "0.9rem 1.1rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.6rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          {r.status === "SUCCESS" && <CheckCircle2 size={15} style={{ color: "#10b981" }} />}
                          {r.status === "FAILED" && <AlertCircle size={15} style={{ color: "#f43f5e" }} />}
                          {r.status === "RUNNING" && <RefreshCw size={15} className="spin-icon" style={{ color: "#38bdf8" }} />}
                          {r.status === "WAITING_FOR_APPROVAL" && <Clock size={15} style={{ color: "#eab308" }} />}
                          <span style={{ fontWeight: 650, fontSize: "0.85rem" }}>{r.status}</span>
                        </div>
                        <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "monospace" }}>
                          {r.id.slice(0, 8)}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.76rem", color: "var(--muted)" }}>
                        <span>Source: {r.triggerSource}</span>
                        <span>{format(new Date(r.startedAt), "MMM d, HH:mm:ss")}</span>
                      </div>

                      {r.durationMs && (
                        <div style={{ fontSize: "0.74rem", color: "var(--muted)" }}>
                          Duration: {(r.durationMs / 1000).toFixed(2)}s • Steps: {r._count?.stepRuns || r.stepRuns?.length || 0}
                        </div>
                      )}

                      {r.errorMessage && (
                        <div
                          style={{
                            padding: "0.4rem 0.6rem",
                            borderRadius: 6,
                            background: "rgba(244, 63, 94, 0.1)",
                            color: "#f43f5e",
                            fontSize: "0.74rem",
                            lineHeight: 1.4,
                          }}
                        >
                          {r.errorMessage}
                        </div>
                      )}

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.2rem" }}>
                        <Link
                          href={`/dashboard/flows/${historyWorkflow.id}?runId=${r.id}`}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: "0.74rem" }}
                        >
                          <Terminal size={12} />
                          Inspect Logs
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
