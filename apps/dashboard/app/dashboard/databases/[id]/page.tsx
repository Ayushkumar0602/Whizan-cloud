"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Database,
  ArrowLeft,
  Server,
  HardDrive,
  Copy,
  Check,
  RotateCcw,
  Square,
  Play,
  Trash2,
  Activity,
  Cpu,
  Eye,
  EyeOff,
  Terminal,
  Shield,
  Clock,
  Code2,
  AlertTriangle,
  ExternalLink,
  Zap,
  ShieldCheck,
  Lock,
  Globe,
} from "lucide-react";
import { databases, type ManagedDatabase, type DatabaseMetrics } from "@/lib/api";
import DatabaseQueryRunner from "@/components/database-query-runner";
import DatabaseTableVisualizer from "@/components/database-table-visualizer";
import DatabaseRedisExplorer from "@/components/database-redis-explorer";
import DatabaseInsightsPanel from "@/components/database-insights-panel";
import DatabaseSecurityPanel from "@/components/database-security-panel";
import { maskDatabaseUrl, ConfidentialBadge } from "@/lib/security-mask";

export default function DatabaseDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [db, setDb] = useState<ManagedDatabase | null>(null);
  const [metrics, setMetrics] = useState<DatabaseMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Active tab
  const [activeTab, setActiveTab] = useState<
    "overview" | "explorer" | "query" | "insights" | "metrics" | "security" | "logs" | "settings"
  >("overview");
  const [urlMode, setUrlMode] = useState<"pooled" | "direct" | "ssl" | "readonly">("pooled");
  const [activeSqlPreset, setActiveSqlPreset] = useState<string>("");

  // Show/hide passwords & secrets
  const [showPassword, setShowPassword] = useState(false);
  const [showInternalSecret, setShowInternalSecret] = useState(false);
  const [showExternalSecret, setShowExternalSecret] = useState(false);
  const [showSnippetSecret, setShowSnippetSecret] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Snippet language
  const [snippetLang, setSnippetLang] = useState<"nodejs" | "python" | "cli">("nodejs");

  // Logs state
  const [logLines, setLogLines] = useState<string[]>([]);
  const logTerminalRef = useRef<HTMLDivElement>(null);

  // Load database details
  async function loadData() {
    try {
      const data = await databases.get(id);
      setDb(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load database details");
    } finally {
      setLoading(false);
    }
  }

  // Load live metrics
  async function loadMetrics() {
    try {
      const data = await databases.getMetrics(id);
      setMetrics(data);
    } catch {}
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData();
    }, 4000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    if (activeTab === "metrics") {
      loadMetrics();
      const interval = setInterval(loadMetrics, 2500);
      return () => clearInterval(interval);
    }
  }, [id, activeTab]);

  // Connect to SSE Log Stream when Logs tab is active
  useEffect(() => {
    if (activeTab !== "logs") return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = databases.streamLogs(id);
      eventSource.addEventListener("log", (e: any) => {
        try {
          const data = JSON.parse(e.data);
          if (data.line) {
            setLogLines((prev) => [...prev, data.line]);
          }
        } catch {}
      });
      eventSource.onerror = () => {
        // SSE auto-reconnects
      };
    } catch {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [id, activeTab]);

  // Auto-scroll logs
  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [logLines]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  async function handleRestart() {
    if (!confirm("Are you sure you want to restart this database? Active connections will be briefly reset.")) return;
    setActionLoading("restart");
    try {
      await databases.restart(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || "Failed to restart database");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleStopStart() {
    if (!db) return;
    const isStopping = db.status === "RUNNING";
    setActionLoading(isStopping ? "stop" : "start");
    try {
      if (isStopping) {
        await databases.stop(id);
      } else {
        await databases.start(id);
      }
      await loadData();
    } catch (err: any) {
      alert(err.message || "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        "⚠️ DANGER: Are you sure you want to permanently delete this database?\nAll persistent volume data will be completely erased. This cannot be undone."
      )
    )
      return;
    setActionLoading("delete");
    try {
      await databases.delete(id);
      router.push("/dashboard/databases");
    } catch (err: any) {
      alert(err.message || "Failed to delete database");
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "4rem 2rem", textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto 1rem" }} />
        <p style={{ color: "var(--muted)" }}>Connecting to database cluster...</p>
      </div>
    );
  }

  if (error || !db) {
    return (
      <div style={{ maxWidth: 800, margin: "2rem auto", padding: "2rem" }}>
        <div
          style={{
            padding: "2rem",
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: "var(--radius)",
            color: "#ef4444",
          }}
        >
          <h3>Database cluster unavailable</h3>
          <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>{error || "Could not load database."}</p>
          <Link
            href="/dashboard/databases"
            style={{
              display: "inline-block",
              marginTop: "1rem",
              color: "var(--foreground)",
              fontWeight: 600,
            }}
          >
            ← Return to Databases
          </Link>
        </div>
      </div>
    );
  }

  const isPostgres = db.type === "POSTGRESQL";
  const isRedis = db.type === "REDIS";
  const isRunning = db.status === "RUNNING";
  const isTransitioning = db.status === "PROVISIONING" || db.status === "RESTARTING";

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Back button */}
      <Link
        href="/dashboard/databases"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          color: "var(--muted)",
          fontSize: "0.875rem",
          fontWeight: 500,
          marginBottom: "1.25rem",
          textDecoration: "none",
        }}
      >
        <ArrowLeft size={16} /> Back to Databases
      </Link>

      {/* Main Header Card */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--card-border)",
          borderRadius: "var(--radius-lg)",
          padding: "1.75rem",
          marginBottom: "2rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1.5rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
                background: isPostgres
                  ? "rgba(59, 130, 246, 0.15)"
                  : isRedis
                  ? "rgba(239, 68, 68, 0.15)"
                  : "rgba(245, 158, 11, 0.15)",
                border: `1px solid ${isPostgres ? "#3b82f640" : "#ef444440"}`,
                color: isPostgres ? "#3b82f6" : "#ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: "1.1rem",
              }}
            >
              {isPostgres ? "PG" : isRedis ? "RD" : "MY"}
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em" }}>{db.name}</h1>

                {/* Status Badge */}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "3px 10px",
                    borderRadius: 9999,
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    background: isRunning
                      ? "rgba(16, 185, 129, 0.15)"
                      : isTransitioning
                      ? "rgba(245, 158, 11, 0.15)"
                      : "rgba(239, 68, 68, 0.15)",
                    color: isRunning ? "#10b981" : isTransitioning ? "#f59e0b" : "#ef4444",
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "currentColor",
                    }}
                  />
                  {db.status}
                </span>

                <span
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--muted)",
                    background: "var(--bg-inset)",
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                  }}
                >
                  {db.type} {db.version}
                </span>

                <span
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--muted)",
                    background: "var(--bg-inset)",
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                  }}
                >
                  {db.instanceType?.toUpperCase()} ({db.cpuLimit} vCPU, {db.memoryLimit}MB RAM)
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1.25rem",
                  marginTop: "0.5rem",
                  fontSize: "0.85rem",
                  color: "var(--muted)",
                  flexWrap: "wrap",
                }}
              >
                <span>
                  Mesh DNS: <code style={{ color: "var(--foreground)" }}>{db.slug}:{db.internalPort}</code>
                </span>
                {db.externalPort && (
                  <span>
                    External: <code style={{ color: "var(--foreground)" }}>{db.externalHost}:{db.externalPort}</code>
                  </span>
                )}
                <span>
                  Created: {new Date(db.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons Toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <button
              onClick={handleRestart}
              disabled={actionLoading !== null || !isRunning}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.55rem 0.9rem",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-inset)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                opacity: !isRunning || actionLoading ? 0.6 : 1,
              }}
            >
              <RotateCcw size={15} />
              {actionLoading === "restart" ? "Restarting..." : "Restart"}
            </button>

            <button
              onClick={handleStopStart}
              disabled={actionLoading !== null || isTransitioning}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.55rem 0.9rem",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-inset)",
                border: "1px solid var(--border)",
                color: isRunning ? "var(--muted)" : "var(--success)",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {isRunning ? <Square size={15} /> : <Play size={15} />}
              {isRunning ? "Stop" : "Start"}
            </button>

            <button
              onClick={handleDelete}
              disabled={actionLoading !== null}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.55rem 0.9rem",
                borderRadius: "var(--radius-sm)",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                color: "#ef4444",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Trash2 size={15} />
              Delete
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            marginTop: "1.75rem",
            borderBottom: "1px solid var(--border)",
            paddingBottom: "0.5rem",
          }}
        >
          {(
            [
              { id: "overview", label: "Overview & Connect" },
              { id: "explorer", label: isRedis ? "Key-Value Browser" : "Table Explorer & Data" },
              { id: "query", label: isRedis ? "Redis CLI Console" : "SQL Query Console" },
              ...(isPostgres ? [{ id: "insights", label: "Query Insights & Locks" }] : []),
              { id: "metrics", label: "Metrics & Performance" },
              ...(isPostgres ? [{ id: "security", label: "Security & Access" }] : []),
              { id: "logs", label: "Live Server Logs" },
              { id: "settings", label: "Settings & Storage" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                background: "transparent",
                border: "none",
                fontSize: "0.9rem",
                fontWeight: 600,
                color: activeTab === tab.id ? "var(--accent)" : "var(--muted)",
                borderBottom: activeTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
                paddingBottom: "0.6rem",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── TAB 1: OVERVIEW & CONNECTION STRINGS ─────────────────────────── */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Internal URL Card */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--card-border)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Internal Connection String</h3>
                  <ConfidentialBadge label="Confidential • Secret" />
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                  Use this URL in your Backend Services and APIs hosted on Whizan. Traffic stays within the private isolated mesh network at zero latency.
                </p>
              </div>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "var(--success)",
                  background: "rgba(16, 185, 129, 0.12)",
                  padding: "3px 8px",
                  borderRadius: 4,
                }}
              >
                Zero Latency • Private Mesh
              </span>
            </div>

            <div
              style={{
                background: "var(--bg-inset)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "0.75rem 1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <code style={{ fontSize: "0.85rem", color: "var(--foreground)", wordBreak: "break-all", fontFamily: "monospace" }}>
                {maskDatabaseUrl(db.internalUrl, showInternalSecret) || "Generating internal connection URL..."}
              </code>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                <button
                  onClick={() => setShowInternalSecret(!showInternalSecret)}
                  title={showInternalSecret ? "Hide confidential credentials" : "Show confidential credentials"}
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    padding: "0.4rem 0.75rem",
                    color: "var(--muted)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                  }}
                >
                  {showInternalSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showInternalSecret ? "Hide" : "Reveal"}
                </button>
                <button
                  onClick={() => copy(db.internalUrl, "internalUrl")}
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    padding: "0.4rem 0.8rem",
                    color: copiedKey === "internalUrl" ? "var(--success)" : "var(--foreground)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                  }}
                >
                  {copiedKey === "internalUrl" ? <Check size={14} /> : <Copy size={14} />}
                  {copiedKey === "internalUrl" ? "Copied Secret!" : "Copy"}
                </button>
              </div>
            </div>
          </div>

          {/* External URL Card with Multi-Mode Selector */}
          {db.externalUrl && (
            <div
              style={{
                background: "var(--card)",
                border: "1px solid var(--card-border)",
                borderRadius: "var(--radius)",
                padding: "1.5rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>External Connection String</h3>
                    <ConfidentialBadge label="Confidential • Secret" />
                  </div>
                  <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                    {isPostgres && urlMode === "pooled"
                      ? `Transaction-mode pooling via PgBouncer on port ${db.poolerPort || db.externalPort}. Recommended for Next.js, Vercel, and high-concurrency apps.`
                      : isPostgres && urlMode === "ssl"
                      ? "Direct socket connection enforcing TLS 1.3 encryption in transit (sslmode=require)."
                      : isPostgres && urlMode === "readonly"
                      ? "Restricted read-only role (SELECT only) for BI, Metabase, and reporting."
                      : "Direct socket connection. Ideal for database migrations and CLI schema pushes."}
                  </p>
                </div>

                {/* Connection Mode Selector for PostgreSQL */}
                {isPostgres && (
                  <div style={{ display: "flex", gap: "0.35rem", background: "var(--bg-inset)", padding: "3px", borderRadius: 8 }}>
                    <button
                      onClick={() => setUrlMode("pooled")}
                      style={{
                        padding: "0.25rem 0.65rem",
                        borderRadius: 6,
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                        background: urlMode === "pooled" ? "var(--card)" : "transparent",
                        color: urlMode === "pooled" ? "var(--foreground)" : "var(--muted)",
                        boxShadow: urlMode === "pooled" ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
                      }}
                    >
                      ⚡ Pooled (PgBouncer)
                    </button>
                    <button
                      onClick={() => setUrlMode("direct")}
                      style={{
                        padding: "0.25rem 0.65rem",
                        borderRadius: 6,
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                        background: urlMode === "direct" ? "var(--card)" : "transparent",
                        color: urlMode === "direct" ? "var(--foreground)" : "var(--muted)",
                        boxShadow: urlMode === "direct" ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
                      }}
                    >
                      Direct
                    </button>
                    <button
                      onClick={() => setUrlMode("ssl")}
                      style={{
                        padding: "0.25rem 0.65rem",
                        borderRadius: 6,
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                        background: urlMode === "ssl" ? "var(--card)" : "transparent",
                        color: urlMode === "ssl" ? "var(--foreground)" : "var(--muted)",
                        boxShadow: urlMode === "ssl" ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
                      }}
                    >
                      🔒 SSL Direct
                    </button>
                    <button
                      onClick={() => setUrlMode("readonly")}
                      style={{
                        padding: "0.25rem 0.65rem",
                        borderRadius: 6,
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                        background: urlMode === "readonly" ? "var(--card)" : "transparent",
                        color: urlMode === "readonly" ? "var(--foreground)" : "var(--muted)",
                        boxShadow: urlMode === "readonly" ? "0 1px 4px rgba(0,0,0,0.2)" : "none",
                      }}
                    >
                      Read-Only
                    </button>
                  </div>
                )}
              </div>

              {/* Display active selected URL */}
              {(() => {
                const activeDisplayUrl =
                  isPostgres && urlMode === "pooled"
                    ? (db.pooledUrl || db.externalUrl)
                    : isPostgres && urlMode === "ssl"
                    ? (db.sslUrl || `${db.externalUrl}?sslmode=require`)
                    : isPostgres && urlMode === "readonly"
                    ? (db.readonlyUrl || "Read-only role not yet generated. Switch to Security & Access tab to generate it.")
                    : db.externalUrl;

                const isUrlValid = activeDisplayUrl.startsWith("postgres") || activeDisplayUrl.startsWith("redis");

                return (
                  <div
                    style={{
                      background: "var(--bg-inset)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.75rem 1rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "1rem",
                    }}
                  >
                    <code style={{ fontSize: "0.85rem", color: "var(--foreground)", wordBreak: "break-all", fontFamily: "monospace" }}>
                      {maskDatabaseUrl(activeDisplayUrl, showExternalSecret)}
                    </code>
                    {isUrlValid ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                        <button
                          onClick={() => setShowExternalSecret(!showExternalSecret)}
                          title={showExternalSecret ? "Hide confidential credentials" : "Show confidential credentials"}
                          style={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            padding: "0.4rem 0.75rem",
                            color: "var(--muted)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                          }}
                        >
                          {showExternalSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                          {showExternalSecret ? "Hide" : "Reveal"}
                        </button>
                        <button
                          onClick={() => copy(activeDisplayUrl, "externalUrl")}
                          style={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            padding: "0.4rem 0.8rem",
                            color: copiedKey === "externalUrl" ? "var(--success)" : "var(--foreground)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.4rem",
                            fontSize: "0.8rem",
                            fontWeight: 600,
                          }}
                        >
                          {copiedKey === "externalUrl" ? <Check size={14} /> : <Copy size={14} />}
                          {copiedKey === "externalUrl" ? "Copied Secret!" : "Copy"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Connection Parameters Breakdown Table */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--card-border)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
            }}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>
              Connection Parameters
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
              {/* Host */}
              <div style={{ padding: "0.85rem", background: "var(--bg-inset)", borderRadius: "var(--radius-sm)" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>HOST</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.3rem" }}>
                  <code style={{ fontSize: "0.85rem" }}>{db.slug}</code>
                  <button onClick={() => copy(db.slug, "host")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)" }}>
                    {copiedKey === "host" ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {/* Port */}
              <div style={{ padding: "0.85rem", background: "var(--bg-inset)", borderRadius: "var(--radius-sm)" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>INTERNAL PORT / EXTERNAL PORT</span>
                <div style={{ marginTop: "0.3rem", fontSize: "0.85rem" }}>
                  <code>{db.internalPort}</code> (Mesh) / <code>{db.externalPort || "None"}</code> (Public)
                </div>
              </div>

              {/* Username */}
              <div style={{ padding: "0.85rem", background: "var(--bg-inset)", borderRadius: "var(--radius-sm)" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>USER</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.3rem" }}>
                  <code style={{ fontSize: "0.85rem" }}>{db.username}</code>
                  <button onClick={() => copy(db.username, "user")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)" }}>
                    {copiedKey === "user" ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {/* Database Name */}
              {isPostgres && (
                <div style={{ padding: "0.85rem", background: "var(--bg-inset)", borderRadius: "var(--radius-sm)" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>DATABASE NAME</span>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.3rem" }}>
                    <code style={{ fontSize: "0.85rem" }}>{db.databaseName}</code>
                    <button onClick={() => copy(db.databaseName, "dbname")} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)" }}>
                      {copiedKey === "dbname" ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Password */}
              <div style={{ padding: "0.85rem", background: "var(--bg-inset)", borderRadius: "var(--radius-sm)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>PASSWORD</span>
                    <ConfidentialBadge size="xs" label="Secret" />
                  </div>
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    {showPassword ? "Hide" : "Reveal"}
                  </button>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.3rem" }}>
                  <code style={{ fontSize: "0.85rem", fontFamily: "monospace" }}>
                    {showPassword ? db.decryptedPassword : "••••••••••••••••••••••••"}
                  </code>
                  <button
                    onClick={() => copy(db.decryptedPassword || "", "password")}
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: copiedKey === "password" ? "var(--success)" : "var(--muted)" }}
                    title="Copy secret password"
                  >
                    {copiedKey === "password" ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Connect Code Snippets */}
          {(() => {
            function getCodeSnippet(lang: "nodejs" | "python" | "cli", reveal = false) {
              const rawInternal = db?.internalUrl || "";
              const internal = reveal ? rawInternal : maskDatabaseUrl(rawInternal, false);
              const rawExternal = db?.externalUrl || "";
              const external = reveal ? rawExternal : maskDatabaseUrl(rawExternal, false);

              if (lang === "nodejs") {
                return isPostgres
                  ? `// .env\nDATABASE_URL="${internal}"\n\n// schema.prisma\ndatasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}`
                  : `// Redis connection\nimport { Redis } from "ioredis";\nconst redis = new Redis("${internal}");`;
              }
              if (lang === "python") {
                return isPostgres
                  ? `# Python SQLAlchemy\nimport os\nfrom sqlalchemy import create_engine\n\nDATABASE_URL = "${internal}"\nengine = create_engine(DATABASE_URL)`
                  : `# Python Redis\nimport redis\nr = redis.from_url("${internal}")\nr.set("ping", "pong")`;
              }
              return isPostgres
                ? `# Connect using psql CLI on your laptop:\npsql "${external}"`
                : `# Connect using redis-cli on your laptop:\nredis-cli -u "${external}"`;
            }

            return (
              <div
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--card-border)",
                  borderRadius: "var(--radius)",
                  padding: "1.5rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <Code2 size={18} style={{ color: "var(--accent)" }} />
                    <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Quick Connect Snippets</h3>
                    <ConfidentialBadge size="xs" label="Protected" />
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    {(["nodejs", "python", "cli"] as const).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => setSnippetLang(lang)}
                        style={{
                          padding: "0.3rem 0.75rem",
                          borderRadius: 4,
                          border: "none",
                          background: snippetLang === lang ? "var(--accent)" : "var(--bg-inset)",
                          color: snippetLang === lang ? "#fff" : "var(--muted)",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {lang === "nodejs" ? "Node.js (Prisma/pg)" : lang === "python" ? "Python" : "CLI Terminal"}
                      </button>
                    ))}

                    <button
                      onClick={() => setShowSnippetSecret(!showSnippetSecret)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0.3rem 0.65rem",
                        borderRadius: 4,
                        background: "var(--bg-inset)",
                        border: "1px solid var(--border)",
                        color: "var(--muted)",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                      title={showSnippetSecret ? "Hide confidential credentials" : "Reveal confidential credentials"}
                    >
                      {showSnippetSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                      {showSnippetSecret ? "Hide Secrets" : "Reveal Secrets"}
                    </button>

                    <button
                      onClick={() => copy(getCodeSnippet(snippetLang, true), `snippet-${snippetLang}`)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        padding: "0.3rem 0.75rem",
                        borderRadius: 4,
                        background: "var(--bg-inset)",
                        border: "1px solid var(--border)",
                        color: copiedKey === `snippet-${snippetLang}` ? "var(--success)" : "var(--foreground)",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {copiedKey === `snippet-${snippetLang}` ? <Check size={13} /> : <Copy size={13} />}
                      {copiedKey === `snippet-${snippetLang}` ? "Copied Snippet!" : "Copy Snippet"}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    background: "#0d1117",
                    borderRadius: "var(--radius-sm)",
                    padding: "1rem",
                    color: "#e6edf3",
                    fontSize: "0.85rem",
                    fontFamily: "monospace",
                    overflowX: "auto",
                    position: "relative",
                  }}
                >
                  <pre style={{ margin: 0 }}>
                    {getCodeSnippet(snippetLang, showSnippetSecret)}
                  </pre>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ─── TAB 2: TABLE EXPLORER & DATA VISUALIZER ─────────────────────── */}
      {activeTab === "explorer" && (
        isRedis ? (
          <DatabaseRedisExplorer
            database={db}
            onOpenCli={(cmd) => {
              setActiveSqlPreset(cmd);
              setActiveTab("query");
            }}
          />
        ) : (
          <DatabaseTableVisualizer
            database={db}
            onOpenQuery={(sql) => {
              setActiveSqlPreset(sql);
              setActiveTab("query");
            }}
          />
        )
      )}

      {/* ─── TAB 3: SQL / REDIS QUERY CONSOLE ─────────────────────────────── */}
      {activeTab === "query" && (
        <DatabaseQueryRunner
          database={db}
          initialQuery={activeSqlPreset}
        />
      )}

      {/* ─── TAB 4: LIVE METRICS ─────────────────────────────────────────── */}
      {activeTab === "metrics" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            {/* CPU Gauge */}
            <div
              style={{
                background: "var(--card)",
                border: "1px solid var(--card-border)",
                borderRadius: "var(--radius)",
                padding: "1.5rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <span style={{ fontSize: "0.9rem", color: "var(--muted)", fontWeight: 600 }}>CPU USAGE</span>
                <Cpu size={20} style={{ color: "var(--accent)" }} />
              </div>
              <div style={{ fontSize: "2.5rem", fontWeight: 800, marginBottom: "0.5rem" }}>
                {metrics ? `${metrics.cpuPercent}%` : "0.0%"}
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: "var(--bg-inset)",
                  overflow: "hidden",
                  marginTop: "1rem",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, (metrics?.cpuPercent || 0) * 2)}%`,
                    background: "var(--accent)",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.5rem" }}>
                Allocation: {db.cpuLimit} vCPU limit enforced
              </div>
            </div>

            {/* Memory Gauge */}
            <div
              style={{
                background: "var(--card)",
                border: "1px solid var(--card-border)",
                borderRadius: "var(--radius)",
                padding: "1.5rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <span style={{ fontSize: "0.9rem", color: "var(--muted)", fontWeight: 600 }}>MEMORY USAGE</span>
                <Activity size={20} style={{ color: "var(--success)" }} />
              </div>
              <div style={{ fontSize: "2.5rem", fontWeight: 800, marginBottom: "0.5rem" }}>
                {metrics ? `${metrics.memoryMB} MB` : "0 MB"}{" "}
                <span style={{ fontSize: "1rem", color: "var(--muted)", fontWeight: 400 }}>
                  / {db.memoryLimit} MB
                </span>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: "var(--bg-inset)",
                  overflow: "hidden",
                  marginTop: "1rem",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, ((metrics?.memoryMB || 0) / db.memoryLimit) * 100)}%`,
                    background: "var(--success)",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.5rem" }}>
                Max headroom: {db.memoryLimit - (metrics?.memoryMB || 0)} MB remaining
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB: QUERY INSIGHTS & LOCKS ─────────────────────────────────── */}
      {activeTab === "insights" && (
        <DatabaseInsightsPanel databaseId={id} db={db} />
      )}

      {/* ─── TAB: SECURITY & ACCESS CONTROL ──────────────────────────────── */}
      {activeTab === "security" && (
        <DatabaseSecurityPanel databaseId={id} db={db} onRefresh={loadData} />
      )}

      {/* ─── TAB: LIVE SERVER LOGS ───────────────────────────────────────── */}
      {activeTab === "logs" && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: "var(--radius)",
            padding: "1.5rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Terminal size={18} style={{ color: "var(--accent)" }} />
              <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Database Output & Query Logs</h3>
            </div>
            <button
              onClick={() => setLogLines([])}
              style={{
                background: "var(--bg-inset)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "0.3rem 0.75rem",
                fontSize: "0.8rem",
                color: "var(--muted)",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>

          <div
            ref={logTerminalRef}
            style={{
              background: "#090d16",
              borderRadius: "var(--radius-sm)",
              padding: "1rem",
              fontFamily: "monospace",
              fontSize: "0.8rem",
              color: "#38bdf8",
              height: 480,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "0.25rem",
            }}
          >
            {logLines.length === 0 ? (
              <div style={{ color: "#64748b", textAlign: "center", marginTop: "4rem" }}>
                Listening for logs from database container...
              </div>
            ) : (
              logLines.map((line, idx) => (
                <div key={idx} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 4: SETTINGS & DANGER ZONE ───────────────────────────────── */}
      {activeTab === "settings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Storage Volume Info */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--card-border)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
            }}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Storage Volume Allocation
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1rem" }}>
              Physical volume mount on host disk. Data is committed directly to disk using transaction journaling.
            </p>
            <div
              style={{
                background: "var(--bg-inset)",
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.85rem",
                fontFamily: "monospace",
              }}
            >
              {db.volumePath || "Mounted to dedicated container host volume"}
            </div>
          </div>

          {/* Danger Zone */}
          <div
            style={{
              background: "rgba(239, 68, 68, 0.05)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#ef4444", marginBottom: "0.5rem" }}>
              <AlertTriangle size={18} />
              <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Danger Zone</h3>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
              Deleting this database will permanently stop the container and destroy all data on the disk volume. There is no recovery.
            </p>
            <button
              onClick={handleDelete}
              style={{
                padding: "0.6rem 1.25rem",
                borderRadius: "var(--radius-sm)",
                background: "#ef4444",
                border: "none",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              Permanently Delete Database
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
