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
  AlertCircle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Zap,
  ShieldCheck,
  Lock,
  Globe,
  Loader2,
  Radio,
  FileCode,
  Layers,
  Sparkles,
  ChevronDown
} from "lucide-react";
import { databases, type ManagedDatabase, type DatabaseMetrics, type UrlConnectionTestResult } from "@/lib/api";
import DatabaseQueryRunner from "@/components/database-query-runner";
import DatabaseTableVisualizer from "@/components/database-table-visualizer";
import DatabaseRedisExplorer from "@/components/database-redis-explorer";
import DatabaseInsightsPanel from "@/components/database-insights-panel";
import DatabaseSecurityPanel from "@/components/database-security-panel";
import { maskDatabaseUrl, ConfidentialBadge } from "@/lib/security-mask";
import { toast } from "sonner";

export default function DatabaseDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();

  const [db, setDb] = useState<ManagedDatabase | null>(null);
  const [metrics, setMetrics] = useState<DatabaseMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Active tab navigation
  const [activeTab, setActiveTab] = useState<
    "overview" | "explorer" | "query" | "insights" | "metrics" | "security" | "logs" | "settings"
  >("overview");

  // Connection mode: pooled, direct, ssl, readonly
  const [urlMode, setUrlMode] = useState<"pooled" | "direct" | "ssl" | "readonly">("pooled");

  // Show/hide passwords & secrets
  const [showInternalSecret, setShowInternalSecret] = useState(false);
  const [showExternalSecret, setShowExternalSecret] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Snippet language
  const [snippetLang, setSnippetLang] = useState<"prisma" | "nodejs" | "python" | "go" | "gui">("prisma");

  // Live Connection Diagnostic state
  const [testingConnection, setTestingConnection] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<UrlConnectionTestResult | null>(null);

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
    }, 8000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    if (activeTab === "metrics") {
      loadMetrics();
      const interval = setInterval(loadMetrics, 5000);
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

  function copy(text: string, key: string, label: string = "Copied to clipboard") {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(label);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  // Run Connection Diagnostic
  async function runConnectionProbe(urlToTest: string) {
    setTestingConnection(true);
    try {
      const res = await databases.testUrlConnection(urlToTest);
      setDiagnosticResult(res);
      if (res.ok) {
        toast.success(`Probe healthy! Latency: ${res.latencyMs}ms (${res.version || "Connected"})`);
      } else {
        toast.error(`Probe failed: ${res.error || "Connection timed out"}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to execute connection probe");
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleRestart() {
    if (!confirm("Are you sure you want to restart this database? Active connections will be briefly reset.")) return;
    setActionLoading("restart");
    try {
      await databases.restart(id);
      toast.success("Database restart sequence initiated");
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to restart database");
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
        toast.success("Database stopped");
      } else {
        await databases.start(id);
        toast.success("Database started");
      }
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Action failed");
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
      toast.success("Database deleted");
      router.push("/dashboard/databases");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete database");
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Connecting to managed database telemetry...</p>
      </div>
    );
  }

  if (error || !db) {
    return (
      <div className="error-container">
        <div className="card error-card">
          <AlertCircle size={28} color="#ef4444" />
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Database cluster unavailable</h3>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{error || "Could not load database."}</p>
          <Link href="/dashboard/databases" className="btn btn-secondary btn-sm" style={{ marginTop: "1rem" }}>
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

  // Compute Active Selected Connection URL
  const activeDisplayUrl =
    isPostgres && urlMode === "pooled"
      ? (db.pooledUrl || db.externalUrl)
      : isPostgres && urlMode === "ssl"
      ? (db.sslUrl || `${db.externalUrl}?sslmode=require`)
      : isPostgres && urlMode === "readonly"
      ? (db.readonlyUrl || "Read-only role not generated yet. Visit Security & Access tab.")
      : db.externalUrl;

  return (
    <div className="db-page">
      {/* Top Breadcrumb */}
      <div className="db-topbar">
        <Link href="/dashboard/databases" className="breadcrumb" style={{ marginBottom: 0 }}>
          <ArrowLeft size={15} /> Back to Databases
        </Link>
        <span className="mesh-dns-indicator mono">
          <Radio size={12} color="#38bdf8" />
          <span>{db.slug}:{db.internalPort}</span>
        </span>
      </div>

      {/* Main Hero Card */}
      <div className="db-hero-card">
        <div className="hero-top">
          <div className="hero-brand">
            <div className={`engine-icon-box engine-${db.type.toLowerCase()}`}>
              {isPostgres ? "PG" : isRedis ? "RD" : "MY"}
            </div>

            <div>
              <div className="hero-kicker">Managed Stateful Database</div>
              <div className="hero-title-row">
                <h1 className="hero-title">{db.name}</h1>

                <span className={`status-pill pill-${db.status.toLowerCase()}`}>
                  <span className="pulse-dot" />
                  {db.status}
                </span>

                <span className="spec-tag mono">
                  {db.type} {db.version}
                </span>

                <span className="spec-tag mono">
                  {db.instanceType?.toUpperCase()} ({db.cpuLimit} vCPU • {db.memoryLimit}MB RAM)
                </span>
              </div>

              <div className="hero-meta-row mono">
                <span>Mesh DNS: <strong>{db.slug}:{db.internalPort}</strong></span>
                {db.externalPort && (
                  <>
                    <span>•</span>
                    <span>Direct Port: <strong>{db.externalPort}</strong></span>
                  </>
                )}
                {db.poolerPort && (
                  <>
                    <span>•</span>
                    <span>PgBouncer Port: <strong>{db.poolerPort}</strong></span>
                  </>
                )}
                <span>•</span>
                <span>Created {new Date(db.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="hero-actions">
            <button
              onClick={handleRestart}
              disabled={actionLoading !== null || !isRunning}
              className="btn btn-secondary btn-sm"
            >
              {actionLoading === "restart" ? <Loader2 size={13} className="spin-icon" /> : <RotateCcw size={13} />}
              <span>Restart</span>
            </button>

            <button
              onClick={handleStopStart}
              disabled={actionLoading !== null || isTransitioning}
              className="btn btn-secondary btn-sm"
            >
              {isRunning ? <Square size={13} /> : <Play size={13} />}
              <span>{isRunning ? "Stop" : "Start"}</span>
            </button>

            <button
              onClick={handleDelete}
              disabled={actionLoading !== null}
              className="btn btn-danger btn-sm"
              title="Delete database"
            >
              {actionLoading === "delete" ? <Loader2 size={13} className="spin-icon" /> : <Trash2 size={13} />}
            </button>
          </div>
        </div>

        {/* Tab Navigation Row */}
        <div className="tab-bar">
          {(
            [
              { id: "overview", label: "Overview & Connect", icon: Globe },
              { id: "explorer", label: isRedis ? "Key-Value Browser" : "Table Explorer & Data", icon: Database },
              { id: "query", label: isRedis ? "Redis CLI Console" : "SQL Query Console", icon: Terminal },
              ...(isPostgres ? [{ id: "insights", label: "Query Insights & Locks", icon: Activity }] : []),
              { id: "metrics", label: "Metrics & Usage", icon: Cpu },
              ...(isPostgres ? [{ id: "security", label: "Security & Access", icon: ShieldCheck }] : []),
              { id: "logs", label: "Live Server Logs", icon: Clock },
              { id: "settings", label: "Settings & Storage", icon: HardDrive },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`tab-btn ${isActive ? "tab-btn-active" : ""}`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── TAB 1: OVERVIEW & CONNECTION STRINGS ─────────────────────────── */}
      {activeTab === "overview" && (
        <div className="tab-content-wrap">
          {/* Quick Metrics & Engine Summary */}
          <div className="quick-stats-grid">
            <div className="card quick-stat-card">
              <span className="qstat-label"><Database size={13} className="text-accent" /> Engine Type</span>
              <span className="qstat-value">{db.type} {db.version}</span>
              <span className="qstat-sub mono">{isPostgres ? "Transaction-journaled WAL" : isRedis ? "AOF persistence" : "InnoDB storage"}</span>
            </div>

            <div className="card quick-stat-card">
              <span className="qstat-label"><Cpu size={13} style={{ color: "#38bdf8" }} /> Compute Allocation</span>
              <span className="qstat-value">{db.cpuLimit} vCPU • {db.memoryLimit}MB</span>
              <span className="qstat-sub mono">{db.instanceType?.toUpperCase()} Instance</span>
            </div>

            <div className="card quick-stat-card">
              <span className="qstat-label"><Radio size={13} style={{ color: "#10b981" }} /> Internal Mesh DNS</span>
              <span className="qstat-value mono" style={{ fontSize: "1.1rem" }}>{db.slug}</span>
              <span className="qstat-sub mono">Port: {db.internalPort} (whizan-internal)</span>
            </div>

            <div className="card quick-stat-card">
              <span className="qstat-label"><Shield size={13} style={{ color: "#ec4899" }} /> Security &amp; Encryption</span>
              <span className="qstat-value" style={{ fontSize: "1.1rem" }}>
                {db.sslEnabled !== false ? "TLS 1.3 Active" : "Plaintext"}
              </span>
              <span className="qstat-sub mono">
                {db.poolerPort ? "PgBouncer sidecar enabled" : "Direct socket access"}
              </span>
            </div>
          </div>

          {/* Internal Private Mesh Connection Card */}
          <div className="card connection-card">
            <div className="card-header-flex">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <h3 className="card-title">Internal Mesh Connection String</h3>
                  <ConfidentialBadge label="Private • Zero Latency" />
                </div>
                <p className="card-subtitle">
                  Use this URL in your Backend Services, APIs, and microservices hosted on Whizan. Traffic stays within the private Docker mesh network with 0ms egress fees.
                </p>
              </div>
              <span className="badge badge-ready">
                Private Network DNS
              </span>
            </div>

            <div className="connection-url-box">
              <code className="url-code mono">
                {maskDatabaseUrl(db.internalUrl, showInternalSecret) || "Generating internal connection URL..."}
              </code>
              <div className="url-box-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowInternalSecret(!showInternalSecret)}
                  title={showInternalSecret ? "Hide secret" : "Reveal credentials"}
                >
                  {showInternalSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                  <span>{showInternalSecret ? "Hide" : "Reveal"}</span>
                </button>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => copy(db.internalUrl, "internalUrl", "Internal URL copied")}
                >
                  {copiedKey === "internalUrl" ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                  <span>{copiedKey === "internalUrl" ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* External Connection String Card with Mode Switcher & Real-time Diagnostic */}
          {db.externalUrl && (
            <div className="card connection-card">
              <div className="card-header-flex">
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <h3 className="card-title">External Client Connection String</h3>
                    <ConfidentialBadge label="Public Host Access" />
                  </div>
                  <p className="card-subtitle">
                    {isPostgres && urlMode === "pooled"
                      ? `Transaction-mode pooling via PgBouncer on port ${db.poolerPort || db.externalPort}. Highly recommended for Next.js, Vercel, and high-concurrency apps.`
                      : isPostgres && urlMode === "ssl"
                      ? "Direct socket connection enforcing TLS 1.3 encryption in transit (sslmode=require)."
                      : isPostgres && urlMode === "readonly"
                      ? "Restricted read-only role (SELECT only) for Metabase, analytics, and reporting."
                      : "Direct socket connection. Ideal for database migrations, Prisma CLI, and GUI tools."}
                  </p>
                </div>

                {/* Mode Selector for PostgreSQL */}
                {isPostgres && (
                  <div className="mode-toggle-group">
                    <button
                      className={`mode-btn ${urlMode === "pooled" ? "mode-btn-active" : ""}`}
                      onClick={() => setUrlMode("pooled")}
                    >
                      <Zap size={11} /> ⚡ Pooled (PgBouncer)
                    </button>
                    <button
                      className={`mode-btn ${urlMode === "direct" ? "mode-btn-active" : ""}`}
                      onClick={() => setUrlMode("direct")}
                    >
                      🔌 Direct Socket
                    </button>
                    <button
                      className={`mode-btn ${urlMode === "ssl" ? "mode-btn-active" : ""}`}
                      onClick={() => setUrlMode("ssl")}
                    >
                      🔒 SSL Enforced
                    </button>
                    <button
                      className={`mode-btn ${urlMode === "readonly" ? "mode-btn-active" : ""}`}
                      onClick={() => setUrlMode("readonly")}
                    >
                      👁️ Read-Only
                    </button>
                  </div>
                )}
              </div>

              {/* Display active selected URL */}
              <div className="connection-url-box">
                <code className="url-code mono">
                  {maskDatabaseUrl(activeDisplayUrl, showExternalSecret)}
                </code>

                <div className="url-box-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowExternalSecret(!showExternalSecret)}
                  >
                    {showExternalSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                    <span>{showExternalSecret ? "Hide" : "Reveal"}</span>
                  </button>

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => copy(activeDisplayUrl, "externalUrl", "Connection string copied")}
                  >
                    {copiedKey === "externalUrl" ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                    <span>{copiedKey === "externalUrl" ? "Copied" : "Copy URL"}</span>
                  </button>

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => copy(`DATABASE_URL="${activeDisplayUrl}"`, "envCopy", ".env snippet copied")}
                    title="Copy formatted for .env file"
                  >
                    {copiedKey === "envCopy" ? <Check size={13} color="#10b981" /> : <FileCode size={13} />}
                    <span>.env</span>
                  </button>

                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => runConnectionProbe(activeDisplayUrl)}
                    disabled={testingConnection}
                  >
                    {testingConnection ? <Loader2 size={13} className="spin-icon" /> : <Zap size={13} />}
                    <span>{testingConnection ? "Testing..." : "Test Connection"}</span>
                  </button>
                </div>
              </div>

              {/* Real-Time Diagnostic Test Banner */}
              {diagnosticResult && (
                <div className={`diag-result-box ${diagnosticResult.ok ? "diag-success" : "diag-error"}`}>
                  <div className="diag-header">
                    {diagnosticResult.ok ? (
                      <CheckCircle2 size={16} color="#10b981" />
                    ) : (
                      <XCircle size={16} color="#f43f5e" />
                    )}
                    <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>
                      {diagnosticResult.ok ? "Connection Probe Verified Healthy" : "Connection Probe Failed"}
                    </span>
                    <span className="diag-chip mono">
                      {diagnosticResult.latencyMs}ms latency
                    </span>
                    {diagnosticResult.version && (
                      <span className="diag-chip mono">
                        {diagnosticResult.version.split(" ")[0]} {diagnosticResult.version.split(" ")[1]}
                      </span>
                    )}
                  </div>
                  {diagnosticResult.error && (
                    <p className="diag-error-text mono">{diagnosticResult.error}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Application Usage & Code Snippets Guide */}
          <div className="card snippets-card">
            <div className="card-header-flex" style={{ marginBottom: "1rem" }}>
              <div>
                <h3 className="card-title">Application Usage &amp; Integration Guide</h3>
                <p className="card-subtitle">Drop-in configuration snippets for your frameworks and GUI clients</p>
              </div>

              <div className="snippet-tabs-row">
                <button
                  className={`snippet-tab ${snippetLang === "prisma" ? "snippet-tab-active" : ""}`}
                  onClick={() => setSnippetLang("prisma")}
                >
                  Prisma ORM
                </button>
                <button
                  className={`snippet-tab ${snippetLang === "nodejs" ? "snippet-tab-active" : ""}`}
                  onClick={() => setSnippetLang("nodejs")}
                >
                  Node.js / Next.js
                </button>
                <button
                  className={`snippet-tab ${snippetLang === "python" ? "snippet-tab-active" : ""}`}
                  onClick={() => setSnippetLang("python")}
                >
                  Python (SQLAlchemy)
                </button>
                <button
                  className={`snippet-tab ${snippetLang === "go" ? "snippet-tab-active" : ""}`}
                  onClick={() => setSnippetLang("go")}
                >
                  Go (pgx)
                </button>
                <button
                  className={`snippet-tab ${snippetLang === "gui" ? "snippet-tab-active" : ""}`}
                  onClick={() => setSnippetLang("gui")}
                >
                  DBeaver / TablePlus
                </button>
              </div>
            </div>

            {/* Snippet Content */}
            <div className="snippet-code-box">
              {snippetLang === "prisma" && (
                <pre className="code-pre mono">
{`// schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL") // ${urlMode === "pooled" ? "Pooled URL for serverless queries" : "Direct URL"}
${urlMode === "pooled" && db.externalUrl ? `  directUrl = env("DIRECT_URL")   // Direct port ${db.externalPort} for migrations\n` : ""}}

// .env
DATABASE_URL="${activeDisplayUrl}"
${urlMode === "pooled" && db.externalUrl ? `DIRECT_URL="${db.externalUrl}?sslmode=require"` : ""}`}
                </pre>
              )}

              {snippetLang === "nodejs" && (
                <pre className="code-pre mono">
{`import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "${activeDisplayUrl}",
  ssl: { rejectUnauthorized: false }, // Enforces SSL in transit
  max: 20,                            // Maximum connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export default pool;`}
                </pre>
              )}

              {snippetLang === "python" && (
                <pre className="code-pre mono">
{`from sqlalchemy import create_engine

# For SQLAlchemy / psycopg2 / asyncpg:
DATABASE_URL = "${activeDisplayUrl}"

engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True
)`}
                </pre>
              )}

              {snippetLang === "go" && (
                <pre className="code-pre mono">
{`package main

import (
    "context"
    "os"
    "github.com/jackc/pgx/v5/pgxpool"
)

func main() {
    dbUrl := os.Getenv("DATABASE_URL")
    if dbUrl == "" {
        dbUrl = "${activeDisplayUrl}"
    }
    pool, err := pgxpool.New(context.Background(), dbUrl)
    if err != nil {
        panic(err)
    }
    defer pool.Close()
}`}
                </pre>
              )}

              {snippetLang === "gui" && (
                <div className="gui-params-grid">
                  <div className="gui-param-item">
                    <span className="gui-label">Host</span>
                    <span className="gui-val mono">{db.externalHost || "db.whizan.cloud"}</span>
                  </div>
                  <div className="gui-param-item">
                    <span className="gui-label">Port</span>
                    <span className="gui-val mono">{urlMode === "pooled" ? (db.poolerPort || db.externalPort) : db.externalPort}</span>
                  </div>
                  <div className="gui-param-item">
                    <span className="gui-label">Database</span>
                    <span className="gui-val mono">{db.databaseName}</span>
                  </div>
                  <div className="gui-param-item">
                    <span className="gui-label">Username</span>
                    <span className="gui-val mono">{db.username}</span>
                  </div>
                  <div className="gui-param-item">
                    <span className="gui-label">SSL Mode</span>
                    <span className="gui-val mono">Require / Allow (rejectUnauthorized: false)</span>
                  </div>
                  <div className="gui-param-item">
                    <span className="gui-label">Password</span>
                    <span className="gui-val mono">{db.decryptedPassword ? "•••••••• (Revealed above)" : "Set at creation"}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: TABLE EXPLORER & DATA ─────────────────────────────────── */}
      {activeTab === "explorer" && (
        <div className="tab-content-wrap">
          {isRedis ? (
            <DatabaseRedisExplorer database={db} />
          ) : (
            <DatabaseTableVisualizer database={db} />
          )}
        </div>
      )}

      {/* ─── TAB 3: SQL / REDIS QUERY CONSOLE ─────────────────────────────── */}
      {activeTab === "query" && (
        <div className="tab-content-wrap">
          <DatabaseQueryRunner database={db} />
        </div>
      )}

      {/* ─── TAB 4: QUERY INSIGHTS & LOCKS ────────────────────────────────── */}
      {activeTab === "insights" && isPostgres && (
        <div className="tab-content-wrap">
          <DatabaseInsightsPanel databaseId={db.id} db={db} />
        </div>
      )}

      {/* ─── TAB 5: REAL-TIME METRICS & UTILIZATION ───────────────────────── */}
      {activeTab === "metrics" && (
        <div className="tab-content-wrap">
          <div className="card">
            <div className="card-header-flex" style={{ marginBottom: "1.25rem" }}>
              <div>
                <h3 className="card-title">Live Hardware Metrics &amp; Telemetry</h3>
                <p className="card-subtitle">Real-time resource utilization directly from Docker cgroups</p>
              </div>
              <span className="badge badge-ready">Updated every 2.5s</span>
            </div>

            {metrics ? (
              <div className="quick-stats-grid" style={{ marginBottom: 0 }}>
                <div className="card quick-stat-card">
                  <span className="qstat-label"><Cpu size={13} className="text-accent" /> Container CPU</span>
                  <span className="qstat-value">{metrics.cpuPercent}%</span>
                  <span className="qstat-sub mono">Quota: {db.cpuLimit} vCPU</span>
                </div>

                <div className="card quick-stat-card">
                  <span className="qstat-label"><HardDrive size={13} style={{ color: "#38bdf8" }} /> Memory Usage</span>
                  <span className="qstat-value">{metrics.memoryMB} MB</span>
                  <span className="qstat-sub mono">
                    Limit: {metrics.memoryLimitMB} MB ({metrics.memoryLimitMB ? Math.round((metrics.memoryMB / metrics.memoryLimitMB) * 100) : 0}%)
                  </span>
                </div>

                <div className="card quick-stat-card">
                  <span className="qstat-label"><Activity size={13} style={{ color: "#10b981" }} /> Engine Status</span>
                  <span className="qstat-value" style={{ textTransform: "capitalize" }}>{metrics.status}</span>
                  <span className="qstat-sub mono">{metrics.isRunning ? "Container Active" : "Container Paused"}</span>
                </div>

                <div className="card quick-stat-card">
                  <span className="qstat-label"><Server size={13} style={{ color: "#ec4899" }} /> Storage Allocation</span>
                  <span className="qstat-value">
                    {db.instanceType === "pro" ? "50 GB" : db.instanceType === "standard" ? "20 GB" : "10 GB"}
                  </span>
                  <span className="qstat-sub mono">Persistent NVMe Volume</span>
                </div>
              </div>
            ) : (
              <div className="page-loading" style={{ padding: "2rem" }}>
                <div className="spinner" />
                <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>Collecting container telemetry...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 6: SECURITY & ACCESS CONTROL ─────────────────────────────── */}
      {activeTab === "security" && isPostgres && (
        <div className="tab-content-wrap">
          <DatabaseSecurityPanel databaseId={db.id} db={db} onRefresh={loadData} />
        </div>
      )}

      {/* ─── TAB 7: LIVE SERVER LOGS ──────────────────────────────────────── */}
      {activeTab === "logs" && (
        <div className="tab-content-wrap">
          <div className="card" style={{ padding: "1.25rem" }}>
            <div className="card-header-flex" style={{ marginBottom: "1rem" }}>
              <div>
                <h3 className="card-title">Live Engine Log Stream</h3>
                <p className="card-subtitle">Real-time STDOUT &amp; STDERR output from database engine container</p>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setLogLines([])}
              >
                Clear Terminal
              </button>
            </div>

            <div ref={logTerminalRef} className="log-terminal mono">
              {logLines.length === 0 ? (
                <div style={{ color: "var(--muted)", textAlign: "center", marginTop: "4rem" }}>
                  Listening for real-time logs from {db.slug}...
                </div>
              ) : (
                logLines.map((line, idx) => (
                  <div key={idx} className="log-line">
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 8: SETTINGS & STORAGE DANGER ZONE ────────────────────────── */}
      {activeTab === "settings" && (
        <div className="tab-content-wrap">
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: "0.5rem" }}>Storage Volume Allocation</h3>
            <p className="card-subtitle" style={{ marginBottom: "1rem" }}>
              Dedicated host filesystem volume mount. Database transactions are synced directly to disk via atomic write-ahead logging.
            </p>
            <div className="connection-url-box mono" style={{ fontSize: "0.85rem" }}>
              {db.volumePath || `/var/lib/whizan/volumes/db-${db.id}/data`}
            </div>
          </div>

          <div className="card danger-card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--danger)", marginBottom: "0.5rem" }}>
              <AlertTriangle size={18} />
              <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Permanent Destruction Zone</h3>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
              Deleting this database cluster will immediately stop and wipe the container, destroy all schemas and tables, and shred all persistent volume files on disk. This action is irreversible.
            </p>
            <button
              onClick={handleDelete}
              className="btn btn-danger"
              disabled={actionLoading !== null}
            >
              <Trash2 size={14} />
              <span>Permanently Delete Database</span>
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .db-page {
          max-width: 1250px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          padding-bottom: 3rem;
        }

        .db-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .mesh-dns-indicator {
          font-size: 0.75rem;
          color: var(--muted);
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background: var(--bg-inset);
          padding: 0.2rem 0.6rem;
          border-radius: 6px;
          border: 1px solid var(--card-border);
        }

        /* ─── Hero Card ─── */
        .db-hero-card {
          background: var(--card);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-lg);
          padding: 1.6rem 1.8rem 0;
          box-shadow: 0 4px 20px rgba(0,0,0,0.12);
        }

        .hero-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1.5rem;
          flex-wrap: wrap;
          padding-bottom: 1.5rem;
        }

        .hero-brand {
          display: flex;
          align-items: center;
          gap: 1.25rem;
        }

        .engine-icon-box {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 850;
          font-size: 1.2rem;
          flex-shrink: 0;
        }
        .engine-postgresql {
          background: rgba(59, 130, 246, 0.15);
          color: #3b82f6;
          border: 1px solid rgba(59, 130, 246, 0.35);
        }
        .engine-redis {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.35);
        }
        .engine-mysql {
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.35);
        }

        .hero-kicker {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--accent);
          margin-bottom: 0.15rem;
        }

        .hero-title-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .hero-title {
          font-size: 1.55rem;
          font-weight: 800;
          color: var(--foreground);
          letter-spacing: -0.02em;
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.2rem 0.65rem;
          border-radius: 9999px;
          font-size: 0.72rem;
          font-weight: 750;
          letter-spacing: 0.02em;
        }
        .pill-running {
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .pill-stopped {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .pill-provisioning, .pill-restarting {
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .pulse-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 6px currentColor;
        }

        .spec-tag {
          font-size: 0.72rem;
          padding: 0.15rem 0.5rem;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: 6px;
          color: var(--muted);
        }

        .hero-meta-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.45rem;
          font-size: 0.76rem;
          color: var(--muted);
          flex-wrap: wrap;
        }

        .hero-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        /* ─── Tab Bar ─── */
        .tab-bar {
          display: flex;
          gap: 0.35rem;
          border-top: 1px solid var(--card-border);
          padding: 0.5rem 0 0.8rem;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .tab-bar::-webkit-scrollbar {
          display: none;
        }

        .tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.55rem 0.95rem;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 8px;
          font-size: 0.82rem;
          font-weight: 650;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          font-family: inherit;
        }
        .tab-btn:hover {
          color: var(--foreground);
          background: var(--bg-inset);
        }
        .tab-btn-active {
          background: var(--bg-inset) !important;
          color: var(--foreground) !important;
          border-color: var(--card-border) !important;
          box-shadow: 0 1px 4px rgba(0,0,0,0.15);
        }

        /* ─── Tab Content ─── */
        .tab-content-wrap {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          animation: fadeIn 0.18s ease;
        }

        /* ─── Quick Stats Grid ─── */
        .quick-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
        }
        .quick-stat-card {
          padding: 1.15rem;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .qstat-label {
          font-size: 0.74rem;
          font-weight: 650;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }
        .qstat-value {
          font-size: 1.35rem;
          font-weight: 800;
          color: var(--foreground);
          letter-spacing: -0.01em;
        }
        .qstat-sub {
          font-size: 0.7rem;
          color: var(--muted);
        }

        /* ─── Connection Card ─── */
        .connection-card {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .connection-url-box {
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-sm);
          padding: 0.85rem 1.15rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .url-code {
          font-size: 0.84rem;
          color: var(--foreground);
          word-break: break-all;
          line-height: 1.5;
          flex: 1;
          min-width: 250px;
        }
        .url-box-actions {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-shrink: 0;
        }

        .mode-toggle-group {
          display: flex;
          gap: 0.25rem;
          background: var(--bg-inset);
          padding: 3px;
          border-radius: 8px;
          border: 1px solid var(--card-border);
        }
        .mode-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.28rem 0.65rem;
          border-radius: 6px;
          font-size: 0.74rem;
          font-weight: 650;
          border: none;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: inherit;
        }
        .mode-btn:hover {
          color: var(--foreground);
        }
        .mode-btn-active {
          background: var(--card) !important;
          color: var(--foreground) !important;
          box-shadow: 0 1px 4px rgba(0,0,0,0.2);
        }

        /* ─── Diagnostic Banner ─── */
        .diag-result-box {
          border-radius: var(--radius-sm);
          padding: 0.85rem 1.15rem;
          border: 1px solid transparent;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          animation: fadeIn 0.2s ease;
        }
        .diag-success {
          background: rgba(16, 185, 129, 0.08);
          border-color: rgba(16, 185, 129, 0.25);
          color: #10b981;
        }
        .diag-error {
          background: rgba(244, 63, 94, 0.08);
          border-color: rgba(244, 63, 94, 0.25);
          color: #f43f5e;
        }
        .diag-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .diag-chip {
          font-size: 0.7rem;
          padding: 0.1rem 0.45rem;
          border-radius: 4px;
          background: rgba(0,0,0,0.2);
          color: inherit;
        }
        .diag-error-text {
          font-size: 0.76rem;
          color: #f43f5e;
          line-height: 1.4;
        }

        /* ─── Snippets Card ─── */
        .snippets-card {
          padding: 1.5rem;
        }
        .snippet-tabs-row {
          display: flex;
          gap: 0.3rem;
          background: var(--bg-inset);
          padding: 3px;
          border-radius: 8px;
          border: 1px solid var(--card-border);
          overflow-x: auto;
        }
        .snippet-tab {
          padding: 0.3rem 0.75rem;
          border-radius: 6px;
          font-size: 0.76rem;
          font-weight: 650;
          border: none;
          background: transparent;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          font-family: inherit;
        }
        .snippet-tab:hover {
          color: var(--foreground);
        }
        .snippet-tab-active {
          background: var(--card) !important;
          color: var(--foreground) !important;
          box-shadow: 0 1px 4px rgba(0,0,0,0.15);
        }

        .snippet-code-box {
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-sm);
          padding: 1rem 1.25rem;
        }
        .code-pre {
          font-size: 0.8rem;
          line-height: 1.6;
          color: var(--foreground);
          margin: 0;
          overflow-x: auto;
        }

        .gui-params-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 0.75rem;
        }
        .gui-param-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding: 0.65rem 0.85rem;
          background: var(--card);
          border: 1px solid var(--card-border);
          border-radius: 6px;
        }
        .gui-label {
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--muted);
        }
        .gui-val {
          font-size: 0.82rem;
          color: var(--foreground);
          word-break: break-all;
        }

        /* ─── Log Terminal ─── */
        .log-terminal {
          background: #090d16;
          border: 1px solid var(--card-border);
          border-radius: var(--radius-sm);
          padding: 1rem 1.25rem;
          font-size: 0.78rem;
          color: #38bdf8;
          height: 480px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          line-height: 1.5;
        }
        .log-line {
          white-space: pre-wrap;
          word-break: break-all;
        }

        /* ─── Danger Card ─── */
        .danger-card {
          background: rgba(239, 68, 68, 0.04);
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: var(--radius);
          padding: 1.5rem;
        }

        /* ─── Responsive ─── */
        @media (max-width: 1024px) {
          .quick-stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 640px) {
          .quick-stats-grid {
            grid-template-columns: 1fr;
          }
          .hero-top {
            flex-direction: column;
            align-items: flex-start;
          }
          .hero-actions {
            width: 100%;
          }
          .hero-actions .btn {
            flex: 1;
          }
          .connection-url-box {
            flex-direction: column;
            align-items: flex-start;
          }
          .url-box-actions {
            width: 100%;
            justify-content: flex-end;
          }
        }
      `}</style>
    </div>
  );
}
