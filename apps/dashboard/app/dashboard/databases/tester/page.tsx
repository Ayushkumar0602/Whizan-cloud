"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Database,
  Terminal,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Table as TableIcon,
  Columns,
  RefreshCw,
  FileCode,
  Upload,
  Copy,
  Check,
  ChevronRight,
  Search,
  ArrowLeft,
  Key,
  Layers,
  Zap,
  Download,
  AlertTriangle,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";
import {
  databases,
  type UrlConnectionTestResult,
  type UrlDatabaseTable,
  type DatabaseQueryResult,
  type ManagedDatabase,
} from "@/lib/api";
import { maskDatabaseUrl, isConfidentialKey, ConfidentialBadge } from "@/lib/security-mask";

export default function DatabaseUrlTesterPage() {
  // Connection states
  const [databaseUrl, setDatabaseUrl] = useState<string>("");
  const [showUrlSecret, setShowUrlSecret] = useState(false);
  const [revealQuerySecrets, setRevealQuerySecrets] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState<UrlConnectionTestResult | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Managed DB quick selector
  const [managedDbs, setManagedDbs] = useState<ManagedDatabase[]>([]);
  const [loadingManagedDbs, setLoadingManagedDbs] = useState(false);

  // Tabs: 'tables' | 'query' | 'script'
  const [activeTab, setActiveTab] = useState<"tables" | "query" | "script">("tables");

  // Tables explorer states
  const [tables, setTables] = useState<UrlDatabaseTable[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [selectedTable, setSelectedTable] = useState<UrlDatabaseTable | null>(null);

  // Query runner states
  const [sqlQuery, setSqlQuery] = useState<string>("SELECT version();");
  const [isExecutingQuery, setIsExecutingQuery] = useState(false);
  const [queryResult, setQueryResult] = useState<DatabaseQueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [resultView, setResultView] = useState<"table" | "json">("table");

  // Script runner states
  const [scriptContent, setScriptContent] = useState("");
  const [scriptFileName, setScriptFileName] = useState("");
  const [isExecutingScript, setIsExecutingScript] = useState(false);
  const [scriptResult, setScriptResult] = useState<DatabaseQueryResult | null>(null);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Copy feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Load saved database URL or fetch managed DBs on mount
  useEffect(() => {
    const savedUrl = localStorage.getItem("whizan_last_tested_db_url");
    if (savedUrl) {
      setDatabaseUrl(savedUrl);
    }

    setLoadingManagedDbs(true);
    databases
      .list()
      .then((items) => {
        setManagedDbs(items);
        // If no saved URL and user has a running database with externalUrl, suggest it
        if (!savedUrl) {
          const runningWithUrl = items.find((d) => d.status === "RUNNING" && d.externalUrl);
          if (runningWithUrl && runningWithUrl.externalUrl) {
            setDatabaseUrl(runningWithUrl.externalUrl);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingManagedDbs(false));
  }, []);

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  // Handle connection test
  async function handleConnect(urlToTest?: string) {
    const targetUrl = (urlToTest || databaseUrl).trim();
    if (!targetUrl) {
      setConnectionError("Please provide a database connection URL.");
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);
    setConnectionInfo(null);

    try {
      const res = await databases.testUrlConnection(targetUrl);
      if (res.ok) {
        setConnectionInfo(res);
        localStorage.setItem("whizan_last_tested_db_url", targetUrl);

        // If PostgreSQL, fetch tables immediately
        if (targetUrl.startsWith("postgres://") || targetUrl.startsWith("postgresql://")) {
          loadTables(targetUrl);
        }
      } else {
        setConnectionError(res.error || "Connection failed. Please check host, port, credentials, and firewall.");
      }
    } catch (err: any) {
      setConnectionError(err.message || "Failed to reach database server.");
    } finally {
      setIsConnecting(false);
    }
  }

  // Load tables for PostgreSQL
  async function loadTables(url?: string) {
    const target = url || databaseUrl;
    if (!target) return;
    setLoadingTables(true);
    try {
      const res = await databases.getUrlTables(target);
      setTables(res.tables || []);
      if (res.tables && res.tables.length > 0 && !selectedTable) {
        setSelectedTable(res.tables[0]);
      }
    } catch (err: any) {
      console.warn("Failed to load tables:", err.message);
    } finally {
      setLoadingTables(false);
    }
  }

  // Run SQL query
  async function handleRunQuery(queryToRun?: string) {
    const query = (queryToRun || sqlQuery).trim();
    if (!query) return;

    if (!databaseUrl.trim()) {
      setQueryError("Please specify a database URL first.");
      return;
    }

    setIsExecutingQuery(true);
    setQueryError(null);
    setQueryResult(null);

    try {
      const res = await databases.runUrlQuery(databaseUrl.trim(), query);
      setQueryResult(res);
      // If table DDL was run (CREATE / DROP / ALTER), refresh table list in background
      if (/create\s+table|drop\s+table|alter\s+table/i.test(query)) {
        loadTables();
      }
    } catch (err: any) {
      setQueryError(err.message || "Query execution failed.");
    } finally {
      setIsExecutingQuery(false);
    }
  }

  // File upload handler for SQL scripts
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setScriptFileName(file.name);
    setScriptError(null);
    setScriptResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setScriptContent(content || "");
    };
    reader.onerror = () => {
      setScriptError("Failed to read the uploaded SQL file.");
    };
    reader.readAsText(file);
  }

  // Execute full script
  async function handleRunScript() {
    if (!scriptContent.trim()) {
      setScriptError("Script content is empty. Please upload or paste a SQL script.");
      return;
    }
    if (!databaseUrl.trim()) {
      setScriptError("Please specify a database URL first.");
      return;
    }

    setIsExecutingScript(true);
    setScriptError(null);
    setScriptResult(null);

    try {
      const res = await databases.runUrlQuery(databaseUrl.trim(), scriptContent);
      setScriptResult(res);
      loadTables(); // refresh tables
    } catch (err: any) {
      setScriptError(err.message || "Script execution failed.");
    } finally {
      setIsExecutingScript(false);
    }
  }

  // Quick query table helper
  function queryTableHelper(tableName: string) {
    const q = `SELECT * FROM "${tableName}" LIMIT 50;`;
    setSqlQuery(q);
    setActiveTab("query");
    handleRunQuery(q);
  }

  // Quick SQL template inserter
  function insertSqlTemplate(type: string) {
    if (selectedTable) {
      if (type === "SELECT") {
        setSqlQuery(`SELECT * FROM "${selectedTable.tableName}" LIMIT 25;`);
      } else if (type === "COUNT") {
        setSqlQuery(`SELECT count(*) as total_rows FROM "${selectedTable.tableName}";`);
      } else if (type === "DESCRIBE") {
        setSqlQuery(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${selectedTable.tableName}';`);
      }
    } else {
      if (type === "SELECT") {
        setSqlQuery(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`);
      } else if (type === "CREATE") {
        setSqlQuery(`CREATE TABLE IF NOT EXISTS demo_items (\n  id SERIAL PRIMARY KEY,\n  title TEXT NOT NULL,\n  metadata JSONB,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);`);
      } else if (type === "INSERT") {
        setSqlQuery(`INSERT INTO demo_items (title, metadata) VALUES ('Sample Record', '{"source": "direct_url_tester"}') RETURNING *;`);
      }
    }
  }

  // Export query result to CSV
  function exportCsv() {
    if (!queryResult || !queryResult.rows || queryResult.rows.length === 0) return;
    const headers = queryResult.fields.map((f) => f.name);
    const rows = queryResult.rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          if (typeof val === "object") return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(",")
    );

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `query_result_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredTables = tables.filter((t) =>
    t.tableName.toLowerCase().includes(tableSearch.toLowerCase())
  );

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Navigation & Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <Link
          href="/dashboard/databases"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            color: "var(--muted)",
            fontSize: "0.85rem",
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={14} /> Back to Databases
        </Link>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.75rem",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.35rem" }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "linear-gradient(135deg, #10b981 0%, #3b82f6 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
              }}
            >
              <Zap size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: "1.65rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
                Database URL Tester & Direct Studio
              </h1>
              <span
                style={{
                  display: "inline-block",
                  padding: "0.15rem 0.5rem",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  borderRadius: 4,
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#34d399",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                }}
              >
                Direct Socket & Query Testing
              </span>
            </div>
          </div>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", maxWidth: 720 }}>
            Connect to any hosted database directly via URL. Inspect tables, view schemas, execute SQL queries,
            run batch migration scripts, and verify remote connectivity from external sources.
          </p>
        </div>

        {/* Managed DB Quick Selection */}
        {managedDbs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 500 }}>
              Quick load from your managed databases:
            </span>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              {managedDbs.map((db) => (
                <button
                  key={db.id}
                  onClick={() => {
                    if (db.externalUrl) {
                      setDatabaseUrl(db.externalUrl);
                      handleConnect(db.externalUrl);
                    }
                  }}
                  style={{
                    padding: "0.35rem 0.65rem",
                    fontSize: "0.78rem",
                    borderRadius: 6,
                    background: "var(--card-bg, #18181b)",
                    border: "1px solid var(--border-color, #27272a)",
                    color: "var(--foreground, #f4f4f5)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  <Database size={12} style={{ color: db.type === "REDIS" ? "#ef4444" : "#38bdf8" }} />
                  {db.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* URL Connection Bar Card */}
      <div
        style={{
          background: "var(--card-bg, #18181b)",
          border: "1px solid var(--border-color, #27272a)",
          borderRadius: 12,
          padding: "1.25rem",
          marginBottom: "1.5rem",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--muted)" }}>
              TARGET DATABASE URL
            </span>
            <ConfidentialBadge size="xs" label="Credentials Protected" />
          </div>
          {databaseUrl && (
            <button
              onClick={() => copyText(databaseUrl, "input-url")}
              style={{
                fontSize: "0.75rem",
                color: copiedKey === "input-url" ? "#10b981" : "var(--muted)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
              }}
            >
              {copiedKey === "input-url" ? <Check size={12} /> : <Copy size={12} />}
              {copiedKey === "input-url" ? "Copied URL!" : "Copy Raw URL"}
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 320, position: "relative" }}>
            <input
              type={showUrlSecret ? "text" : "password"}
              placeholder="postgresql://user:password@host:port/dbname?sslmode=disable or redis://..."
              value={databaseUrl}
              onChange={(e) => setDatabaseUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConnect();
              }}
              style={{
                width: "100%",
                padding: "0.75rem 2.8rem 0.75rem 1rem",
                borderRadius: 8,
                background: "var(--bg, #09090b)",
                border: "1px solid var(--border-color, #27272a)",
                color: "var(--foreground, #fafafa)",
                fontSize: "0.9rem",
                fontFamily: "monospace",
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => setShowUrlSecret(!showUrlSecret)}
              title={showUrlSecret ? "Mask secret password in URL" : "Reveal secret password in URL"}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                padding: 4,
              }}
            >
              {showUrlSecret ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <button
            onClick={() => handleConnect()}
            disabled={isConnecting || !databaseUrl.trim()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 1.4rem",
              borderRadius: 8,
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.9rem",
              border: "none",
              cursor: isConnecting || !databaseUrl.trim() ? "not-allowed" : "pointer",
              opacity: isConnecting || !databaseUrl.trim() ? 0.6 : 1,
              boxShadow: "0 2px 10px rgba(16, 185, 129, 0.3)",
              transition: "all 0.2s ease",
            }}
          >
            {isConnecting ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Play size={16} />
                Connect & Test
              </>
            )}
          </button>
        </div>

        {/* Error message */}
        {connectionError && (
          <div
            style={{
              marginTop: "0.85rem",
              padding: "0.75rem 1rem",
              borderRadius: 8,
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              color: "#f87171",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
            }}
          >
            <XCircle size={16} style={{ flexShrink: 0 }} />
            <div>
              <strong>Connection Error:</strong> {connectionError}
            </div>
          </div>
        )}

        {/* Connected Success Badge & Server Info */}
        {connectionInfo && (
          <div
            style={{
              marginTop: "1rem",
              padding: "0.85rem 1rem",
              borderRadius: 8,
              background: "rgba(16, 185, 129, 0.08)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#34d399", fontWeight: 600 }}>
                <CheckCircle2 size={18} />
                Connected ({connectionInfo.type})
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.82rem", color: "var(--muted)" }}>
                <Clock size={14} />
                Latency: <span style={{ color: "#34d399", fontWeight: 600 }}>{connectionInfo.latencyMs}ms</span>
              </div>

              {connectionInfo.database && (
                <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                  Database: <strong style={{ color: "var(--foreground)" }}>{connectionInfo.database}</strong>
                </div>
              )}

              {connectionInfo.user && (
                <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                  User: <strong style={{ color: "var(--foreground)" }}>{connectionInfo.user}</strong>
                </div>
              )}

              {connectionInfo.serverPort && (
                <div style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                  Port: <strong style={{ color: "var(--foreground)" }}>{connectionInfo.serverPort}</strong>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setConnectionInfo(null);
                setTables([]);
                setSelectedTable(null);
                setQueryResult(null);
              }}
              style={{
                fontSize: "0.75rem",
                padding: "0.25rem 0.6rem",
                borderRadius: 4,
                background: "transparent",
                border: "1px solid var(--border-color, #3f3f46)",
                color: "var(--muted)",
                cursor: "pointer",
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* Workspace Tabs Navigation */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          borderBottom: "1px solid var(--border-color, #27272a)",
          marginBottom: "1.5rem",
        }}
      >
        <button
          onClick={() => setActiveTab("tables")}
          style={{
            padding: "0.65rem 1.15rem",
            fontSize: "0.9rem",
            fontWeight: 600,
            color: activeTab === "tables" ? "#38bdf8" : "var(--muted)",
            borderBottom: activeTab === "tables" ? "2px solid #38bdf8" : "2px solid transparent",
            background: "transparent",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <TableIcon size={16} />
          Tables & Schema ({tables.length})
        </button>

        <button
          onClick={() => setActiveTab("query")}
          style={{
            padding: "0.65rem 1.15rem",
            fontSize: "0.9rem",
            fontWeight: 600,
            color: activeTab === "query" ? "#38bdf8" : "var(--muted)",
            borderBottom: activeTab === "query" ? "2px solid #38bdf8" : "2px solid transparent",
            background: "transparent",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <Terminal size={16} />
          SQL Query Runner
        </button>

        <button
          onClick={() => setActiveTab("script")}
          style={{
            padding: "0.65rem 1.15rem",
            fontSize: "0.9rem",
            fontWeight: 600,
            color: activeTab === "script" ? "#38bdf8" : "var(--muted)",
            borderBottom: activeTab === "script" ? "2px solid #38bdf8" : "2px solid transparent",
            background: "transparent",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <FileCode size={16} />
          Run SQL Script File (.sql)
        </button>
      </div>

      {/* TAB 1: Tables & Schema Explorer */}
      {activeTab === "tables" && (
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "1.5rem" }}>
          {/* Table List Column */}
          <div
            style={{
              background: "var(--card-bg, #18181b)",
              border: "1px solid var(--border-color, #27272a)",
              borderRadius: 10,
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              height: 600,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Tables</span>
              <button
                onClick={() => loadTables()}
                disabled={loadingTables || !databaseUrl.trim()}
                title="Refresh tables"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--muted)",
                  cursor: "pointer",
                }}
              >
                <RefreshCw size={14} className={loadingTables ? "animate-spin" : ""} />
              </button>
            </div>

            <div style={{ position: "relative", marginBottom: "0.75rem" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--muted)" }} />
              <input
                type="text"
                placeholder="Search tables..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.45rem 0.65rem 0.45rem 2rem",
                  fontSize: "0.8rem",
                  borderRadius: 6,
                  background: "var(--bg, #09090b)",
                  border: "1px solid var(--border-color, #27272a)",
                  color: "var(--foreground, #fafafa)",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {loadingTables ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)", fontSize: "0.85rem" }}>
                  <RefreshCw size={20} className="animate-spin" style={{ margin: "0 auto 0.5rem" }} />
                  Loading tables...
                </div>
              ) : filteredTables.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)", fontSize: "0.85rem" }}>
                  No tables found.
                  <br />
                  <span style={{ fontSize: "0.75rem" }}>Create a table or connect your DB above.</span>
                </div>
              ) : (
                filteredTables.map((t) => (
                  <button
                    key={`${t.schema}.${t.tableName}`}
                    onClick={() => setSelectedTable(t)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.5rem 0.75rem",
                      borderRadius: 6,
                      background: selectedTable?.tableName === t.tableName ? "rgba(56, 189, 248, 0.12)" : "transparent",
                      border:
                        selectedTable?.tableName === t.tableName
                          ? "1px solid rgba(56, 189, 248, 0.3)"
                          : "1px solid transparent",
                      color: selectedTable?.tableName === t.tableName ? "#38bdf8" : "var(--foreground)",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", overflow: "hidden" }}>
                      <TableIcon size={14} style={{ flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.tableName}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        padding: "0.1rem 0.35rem",
                        borderRadius: 4,
                        background: "rgba(255, 255, 255, 0.05)",
                        color: "var(--muted)",
                      }}
                    >
                      {t.columnCount} cols
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Selected Table Schema & Actions */}
          <div
            style={{
              background: "var(--card-bg, #18181b)",
              border: "1px solid var(--border-color, #27272a)",
              borderRadius: 10,
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              height: 600,
            }}
          >
            {selectedTable ? (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "1rem",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>
                      Table: <span style={{ color: "#38bdf8" }}>{selectedTable.tableName}</span>
                    </h2>
                    <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                      Schema: {selectedTable.schema} • ~{selectedTable.rowCount.toLocaleString()} rows • {selectedTable.columnCount} columns
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      onClick={() => queryTableHelper(selectedTable.tableName)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        padding: "0.45rem 0.85rem",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        borderRadius: 6,
                        background: "rgba(56, 189, 248, 0.15)",
                        color: "#38bdf8",
                        border: "1px solid rgba(56, 189, 248, 0.3)",
                        cursor: "pointer",
                      }}
                    >
                      <Play size={12} />
                      Query Records (SELECT)
                    </button>
                  </div>
                </div>

                {/* Column Table */}
                <div style={{ flex: 1, overflowY: "auto", border: "1px solid var(--border-color, #27272a)", borderRadius: 6 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                    <thead>
                      <tr style={{ background: "rgba(255, 255, 255, 0.02)", borderBottom: "1px solid var(--border-color, #27272a)" }}>
                        <th style={{ textAlign: "left", padding: "0.6rem 0.85rem", fontWeight: 600, color: "var(--muted)" }}>Column</th>
                        <th style={{ textAlign: "left", padding: "0.6rem 0.85rem", fontWeight: 600, color: "var(--muted)" }}>Type</th>
                        <th style={{ textAlign: "left", padding: "0.6rem 0.85rem", fontWeight: 600, color: "var(--muted)" }}>Nullable</th>
                        <th style={{ textAlign: "left", padding: "0.6rem 0.85rem", fontWeight: 600, color: "var(--muted)" }}>Default</th>
                        <th style={{ textAlign: "left", padding: "0.6rem 0.85rem", fontWeight: 600, color: "var(--muted)" }}>Attributes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTable.columns.map((col) => (
                        <tr
                          key={col.name}
                          style={{
                            borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                          }}
                        >
                          <td style={{ padding: "0.55rem 0.85rem", fontWeight: 600, fontFamily: "monospace" }}>
                            {col.name}
                          </td>
                          <td style={{ padding: "0.55rem 0.85rem", color: "#38bdf8", fontFamily: "monospace" }}>
                            {col.type}
                          </td>
                          <td style={{ padding: "0.55rem 0.85rem", color: col.isNullable ? "var(--muted)" : "#f87171" }}>
                            {col.isNullable ? "YES" : "NO"}
                          </td>
                          <td style={{ padding: "0.55rem 0.85rem", color: "var(--muted)", fontFamily: "monospace" }}>
                            {col.defaultValue || "—"}
                          </td>
                          <td style={{ padding: "0.55rem 0.85rem" }}>
                            {col.isPrimaryKey && (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                  padding: "0.1rem 0.4rem",
                                  borderRadius: 4,
                                  background: "rgba(234, 179, 8, 0.15)",
                                  color: "#facc15",
                                  fontSize: "0.72rem",
                                  fontWeight: 600,
                                }}
                              >
                                <Key size={10} /> PRIMARY KEY
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "var(--muted)",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <TableIcon size={32} style={{ opacity: 0.3 }} />
                <span>Select a table on the left to inspect columns & schema</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SQL Query Runner */}
      {activeTab === "query" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Query Editor Box */}
          <div
            style={{
              background: "var(--card-bg, #18181b)",
              border: "1px solid var(--border-color, #27272a)",
              borderRadius: 10,
              padding: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Terminal size={16} style={{ color: "#38bdf8" }} />
                <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>SQL / Command Editor</span>
                <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>(Press Cmd+Enter or Ctrl+Enter to execute)</span>
              </div>

              {/* Template shortcuts */}
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--muted)", alignSelf: "center" }}>Templates:</span>
                <button
                  onClick={() => insertSqlTemplate("SELECT")}
                  style={{
                    padding: "0.2rem 0.5rem",
                    fontSize: "0.75rem",
                    borderRadius: 4,
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid var(--border-color, #27272a)",
                    color: "var(--foreground)",
                    cursor: "pointer",
                  }}
                >
                  SELECT
                </button>
                <button
                  onClick={() => insertSqlTemplate("COUNT")}
                  style={{
                    padding: "0.2rem 0.5rem",
                    fontSize: "0.75rem",
                    borderRadius: 4,
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid var(--border-color, #27272a)",
                    color: "var(--foreground)",
                    cursor: "pointer",
                  }}
                >
                  COUNT
                </button>
                <button
                  onClick={() => insertSqlTemplate("CREATE")}
                  style={{
                    padding: "0.2rem 0.5rem",
                    fontSize: "0.75rem",
                    borderRadius: 4,
                    background: "rgba(255, 255, 255, 0.05)",
                    border: "1px solid var(--border-color, #27272a)",
                    color: "var(--foreground)",
                    cursor: "pointer",
                  }}
                >
                  CREATE TABLE
                </button>
              </div>
            </div>

            <textarea
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleRunQuery();
                }
              }}
              rows={6}
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                borderRadius: 8,
                background: "var(--bg, #09090b)",
                border: "1px solid var(--border-color, #27272a)",
                color: "#f4f4f5",
                fontSize: "0.9rem",
                fontFamily: "monospace",
                lineHeight: 1.5,
                outline: "none",
                resize: "vertical",
              }}
            />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                Supports standard SQL (PostgreSQL / MySQL) or Redis commands (`PING`, `GET key`, `KEYS *`)
              </span>

              <button
                onClick={() => handleRunQuery()}
                disabled={isExecutingQuery || !sqlQuery.trim()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.55rem 1.25rem",
                  borderRadius: 6,
                  background: "linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  border: "none",
                  cursor: isExecutingQuery || !sqlQuery.trim() ? "not-allowed" : "pointer",
                  opacity: isExecutingQuery || !sqlQuery.trim() ? 0.6 : 1,
                }}
              >
                {isExecutingQuery ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    Run Query
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Error Banner */}
          {queryError && (
            <div
              style={{
                padding: "0.85rem 1rem",
                borderRadius: 8,
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                color: "#f87171",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "flex-start",
                gap: "0.6rem",
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Query Error:</strong>
                <pre style={{ margin: "0.25rem 0 0", fontFamily: "monospace", fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>
                  {queryError}
                </pre>
              </div>
            </div>
          )}

          {/* Results Grid Box */}
          {queryResult && (
            <div
              style={{
                background: "var(--card-bg, #18181b)",
                border: "1px solid var(--border-color, #27272a)",
                borderRadius: 10,
                padding: "1.25rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>Results</span>
                  <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.45rem", borderRadius: 4, background: "rgba(16, 185, 129, 0.15)", color: "#34d399", fontWeight: 600 }}>
                    {queryResult.rowCount} rows
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                    Execution time: {queryResult.executionTimeMs}ms
                  </span>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={() => setRevealQuerySecrets(!revealQuerySecrets)}
                    style={{
                      padding: "0.3rem 0.6rem",
                      fontSize: "0.75rem",
                      borderRadius: 4,
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid var(--border-color, #27272a)",
                      color: revealQuerySecrets ? "#f59e0b" : "var(--foreground)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                    title={revealQuerySecrets ? "Mask confidential fields" : "Reveal confidential fields"}
                  >
                    {revealQuerySecrets ? <EyeOff size={12} /> : <Eye size={12} />}
                    {revealQuerySecrets ? "Hide Secrets" : "Reveal Secrets"}
                  </button>

                  <button
                    onClick={() => setResultView(resultView === "table" ? "json" : "table")}
                    style={{
                      padding: "0.3rem 0.6rem",
                      fontSize: "0.75rem",
                      borderRadius: 4,
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid var(--border-color, #27272a)",
                      color: "var(--foreground)",
                      cursor: "pointer",
                    }}
                  >
                    View as {resultView === "table" ? "JSON" : "Data Grid"}
                  </button>

                  <button
                    onClick={exportCsv}
                    disabled={!queryResult.rows || queryResult.rows.length === 0}
                    style={{
                      padding: "0.3rem 0.6rem",
                      fontSize: "0.75rem",
                      borderRadius: 4,
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid var(--border-color, #27272a)",
                      color: "var(--foreground)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <Download size={12} />
                    Export CSV
                  </button>

                  <button
                    onClick={() => copyText(JSON.stringify(queryResult.rows, null, 2), "query-json")}
                    style={{
                      padding: "0.3rem 0.6rem",
                      fontSize: "0.75rem",
                      borderRadius: 4,
                      background: "rgba(255, 255, 255, 0.05)",
                      border: "1px solid var(--border-color, #27272a)",
                      color: "var(--foreground)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    {copiedKey === "query-json" ? <Check size={12} /> : <Copy size={12} />}
                    {copiedKey === "query-json" ? "Copied" : "Copy JSON"}
                  </button>
                </div>
              </div>

              {resultView === "table" ? (
                <div style={{ overflowX: "auto", border: "1px solid var(--border-color, #27272a)", borderRadius: 6, maxHeight: 450 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                    <thead>
                      <tr style={{ background: "rgba(255, 255, 255, 0.03)", borderBottom: "1px solid var(--border-color, #27272a)", position: "sticky", top: 0, zIndex: 1 }}>
                        <th style={{ padding: "0.55rem 0.75rem", textAlign: "left", color: "var(--muted)", fontWeight: 600, width: 45 }}>#</th>
                        {queryResult.fields.map((f) => {
                          const isSecret = isConfidentialKey(f.name);
                          return (
                            <th key={f.name} style={{ padding: "0.55rem 0.75rem", textAlign: "left", color: "#38bdf8", fontWeight: 600, fontFamily: "monospace" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                                {f.name}
                                {isSecret && <ConfidentialBadge size="xs" label="Secret" />}
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResult.rows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          style={{
                            borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                          }}
                        >
                          <td style={{ padding: "0.5rem 0.75rem", color: "var(--muted)", fontSize: "0.75rem" }}>
                            {rIdx + 1}
                          </td>
                          {queryResult.fields.map((f) => {
                            const val = row[f.name];
                            const isSecret = isConfidentialKey(f.name);
                            const rawString = val === null ? "null" : typeof val === "object" ? JSON.stringify(val) : String(val);
                            const displayString = isSecret && !revealQuerySecrets ? "••••••••••••" : rawString;

                            return (
                              <td
                                key={f.name}
                                onClick={() => copyText(rawString, `cell-${rIdx}-${f.name}`)}
                                title={isSecret ? "Confidential field (click to copy real secret)" : "Click to copy"}
                                style={{
                                  padding: "0.5rem 0.75rem",
                                  fontFamily: "monospace",
                                  color: val === null ? "var(--muted)" : isSecret && !revealQuerySecrets ? "#f59e0b" : "var(--foreground)",
                                  whiteSpace: "nowrap",
                                  maxWidth: 320,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  cursor: "pointer",
                                }}
                              >
                                {val === null ? (
                                  <span style={{ fontStyle: "italic", opacity: 0.6 }}>null</span>
                                ) : (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                                    {isSecret && !revealQuerySecrets && <Lock size={11} />}
                                    {displayString}
                                    {copiedKey === `cell-${rIdx}-${f.name}` && <Check size={11} color="#10b981" />}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <pre
                  style={{
                    background: "var(--bg, #09090b)",
                    padding: "1rem",
                    borderRadius: 6,
                    fontSize: "0.82rem",
                    fontFamily: "monospace",
                    maxHeight: 450,
                    overflowY: "auto",
                    color: "#a1a1aa",
                  }}
                >
                  {JSON.stringify(queryResult.rows, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SQL Script Runner */}
      {activeTab === "script" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Upload / Script box */}
          <div
            style={{
              background: "var(--card-bg, #18181b)",
              border: "1px solid var(--border-color, #27272a)",
              borderRadius: 10,
              padding: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <FileCode size={16} style={{ color: "#38bdf8" }} />
                <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>Execute SQL Script File</span>
                <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>(e.g. database schema migrations or dump files)</span>
              </div>

              {/* Upload button */}
              <div>
                <input
                  type="file"
                  accept=".sql"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    padding: "0.4rem 0.8rem",
                    fontSize: "0.8rem",
                    borderRadius: 6,
                    background: "rgba(56, 189, 248, 0.15)",
                    color: "#38bdf8",
                    border: "1px solid rgba(56, 189, 248, 0.3)",
                    cursor: "pointer",
                  }}
                >
                  <Upload size={14} />
                  Upload .sql File
                </button>
              </div>
            </div>

            {scriptFileName && (
              <div
                style={{
                  marginBottom: "0.75rem",
                  padding: "0.45rem 0.75rem",
                  borderRadius: 6,
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid var(--border-color, #27272a)",
                  fontSize: "0.8rem",
                  color: "#38bdf8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>File loaded: <strong>{scriptFileName}</strong> ({scriptContent.length.toLocaleString()} chars)</span>
                <button
                  onClick={() => {
                    setScriptFileName("");
                    setScriptContent("");
                  }}
                  style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "0.75rem" }}
                >
                  Clear
                </button>
              </div>
            )}

            <textarea
              placeholder="Paste SQL script here or click 'Upload .sql File' above..."
              value={scriptContent}
              onChange={(e) => setScriptContent(e.target.value)}
              rows={12}
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                borderRadius: 8,
                background: "var(--bg, #09090b)",
                border: "1px solid var(--border-color, #27272a)",
                color: "#f4f4f5",
                fontSize: "0.85rem",
                fontFamily: "monospace",
                lineHeight: 1.5,
                outline: "none",
                resize: "vertical",
              }}
            />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                Executes all statements in order. Creates tables, schemas, indexes, and inserts initial seed data.
              </span>

              <button
                onClick={handleRunScript}
                disabled={isExecutingScript || !scriptContent.trim()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.6rem 1.4rem",
                  borderRadius: 6,
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  border: "none",
                  cursor: isExecutingScript || !scriptContent.trim() ? "not-allowed" : "pointer",
                  opacity: isExecutingScript || !scriptContent.trim() ? 0.6 : 1,
                  boxShadow: "0 2px 10px rgba(16, 185, 129, 0.3)",
                }}
              >
                {isExecutingScript ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Executing Script...
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    Execute Full Script
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Script Execution Error */}
          {scriptError && (
            <div
              style={{
                padding: "0.85rem 1rem",
                borderRadius: 8,
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                color: "#f87171",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "flex-start",
                gap: "0.6rem",
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Script Execution Error:</strong>
                <pre style={{ margin: "0.25rem 0 0", fontFamily: "monospace", fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>
                  {scriptError}
                </pre>
              </div>
            </div>
          )}

          {/* Script Success Result */}
          {scriptResult && (
            <div
              style={{
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: 10,
                padding: "1.25rem",
                color: "#34d399",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <CheckCircle2 size={20} />
                <strong style={{ fontSize: "1rem" }}>Script executed successfully!</strong>
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--foreground)" }}>
                Completed in <strong>{scriptResult.executionTimeMs}ms</strong>. Total affected/returned rows:{" "}
                <strong>{scriptResult.rowCount}</strong>.
              </div>
              <div style={{ marginTop: "0.75rem" }}>
                <button
                  onClick={() => setActiveTab("tables")}
                  style={{
                    padding: "0.4rem 0.8rem",
                    fontSize: "0.8rem",
                    borderRadius: 6,
                    background: "rgba(16, 185, 129, 0.2)",
                    border: "1px solid rgba(16, 185, 129, 0.4)",
                    color: "#34d399",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  View Created Tables & Schema →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
