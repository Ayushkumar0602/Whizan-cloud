"use client";

import { useState, useEffect } from "react";
import {
  Play,
  RotateCcw,
  Download,
  Copy,
  Check,
  Clock,
  Database,
  Table,
  Terminal,
  AlertCircle,
  FileCode,
  Sparkles,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";
import { databases, type ManagedDatabase, type DatabaseQueryResult } from "@/lib/api";
import { isConfidentialKey, ConfidentialBadge } from "@/lib/security-mask";

interface Props {
  database: ManagedDatabase;
  initialQuery?: string;
  onTableSelected?: (tableName: string) => void;
}

const PG_TEMPLATES = [
  {
    name: "Select all from table",
    sql: "SELECT * FROM test_users LIMIT 50;",
  },
  {
    name: "Count total rows",
    sql: "SELECT count(*)::int AS total_records FROM test_users;",
  },
  {
    name: "Create sample table",
    sql: `CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  in_stock BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
  },
  {
    name: "Insert sample record",
    sql: `INSERT INTO test_users (name)
VALUES ('New Customer')
RETURNING *;`,
  },
  {
    name: "Database disk usage & size",
    sql: `SELECT
  table_name,
  pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) AS total_size
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY pg_total_relation_size(quote_ident(table_name)) DESC;`,
  },
  {
    name: "Active connections",
    sql: `SELECT pid, usename, client_addr, state, query_start
FROM pg_stat_activity
WHERE datname = current_database();`,
  },
];

const REDIS_TEMPLATES = [
  { name: "List all keys", sql: "KEYS *" },
  { name: "Server info", sql: "INFO" },
  { name: "Database size", sql: "DBSIZE" },
  { name: "Set string key", sql: 'SET welcome_msg "Hello from Whizan Cloud"' },
  { name: "Get string key", sql: "GET welcome_msg" },
];

export default function DatabaseQueryRunner({ database, initialQuery, onTableSelected }: Props) {
  const isRedis = database.type === "REDIS";
  const defaultSql = isRedis
    ? "KEYS *"
    : "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';";

  const [query, setQuery] = useState(initialQuery || defaultSql);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DatabaseQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [revealSecrets, setRevealSecrets] = useState(false);

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  async function handleRunQuery() {
    if (!query.trim() || running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await databases.query(database.id, query.trim());
      if ((res as any).booting) {
        setError("⚡ Database was asleep to save resources and is spinning up. Auto-executing query in 3 seconds...");
        setTimeout(() => {
          handleRunQuery();
        }, 3000);
        return;
      }
      setResult(res);
      // Append to history
      setHistory((prev) => [query.trim(), ...prev.filter((q) => q !== query.trim())].slice(0, 15));
    } catch (err: any) {
      setError(err.message || "Query execution failed");
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleRunQuery();
    }
  }

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedCell(id);
    setTimeout(() => setCopiedCell(null), 1500);
  }

  function exportCSV() {
    if (!result || !result.rows || result.rows.length === 0) return;
    const headers = Object.keys(result.rows[0]);
    const csvRows = [
      headers.join(","),
      ...result.rows.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            const str = val === null || val === undefined ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
            return `"${str.replace(/"/g, '""')}"`;
          })
          .join(",")
      ),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `query-result-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    if (!result || !result.rows) return;
    const blob = new Blob([JSON.stringify(result.rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `query-result-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const templates = isRedis ? REDIS_TEMPLATES : PG_TEMPLATES;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Editor & Control Card */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--card-border)",
          borderRadius: "var(--radius)",
          overflow: "hidden",
        }}
      >
        {/* Editor Toolbar */}
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "var(--bg-inset)",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                fontSize: "0.85rem",
                fontWeight: 700,
                color: "var(--foreground)",
              }}
            >
              <Terminal size={15} style={{ color: "var(--accent)" }} />
              {isRedis ? "Redis Command Runner" : "Interactive SQL Console"}
            </span>

            {/* Template Selector */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setShowTemplates((prev) => !prev)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.3rem 0.65rem",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  borderRadius: 6,
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  cursor: "pointer",
                }}
              >
                <Sparkles size={13} style={{ color: "#f59e0b" }} />
                Snippets & Templates
                <ChevronDown size={12} />
              </button>

              {showTemplates && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: 6,
                    width: 260,
                    background: "var(--card)",
                    border: "1px solid var(--card-border)",
                    borderRadius: "var(--radius-sm)",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
                    zIndex: 50,
                    padding: "0.4rem",
                  }}
                >
                  <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--muted)", padding: "0.3rem 0.5rem" }}>
                    PRESET TEMPLATES
                  </div>
                  {templates.map((tpl, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setQuery(tpl.sql);
                        setShowTemplates(false);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "0.45rem 0.6rem",
                        fontSize: "0.8rem",
                        borderRadius: 4,
                        border: "none",
                        background: "transparent",
                        color: "var(--foreground)",
                        cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-inset)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>⌘ + Enter to execute</span>

            <button
              onClick={() => setQuery("")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                padding: "0.4rem 0.75rem",
                fontSize: "0.8rem",
                fontWeight: 600,
                borderRadius: 6,
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--muted)",
                cursor: "pointer",
              }}
            >
              <RotateCcw size={13} />
              Clear
            </button>

            <button
              onClick={handleRunQuery}
              disabled={running || !query.trim()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.45rem 1rem",
                fontSize: "0.85rem",
                fontWeight: 700,
                borderRadius: 6,
                background: running ? "var(--muted)" : "var(--accent)",
                color: "#ffffff",
                border: "none",
                cursor: running || !query.trim() ? "not-allowed" : "pointer",
                boxShadow: "0 2px 8px rgba(99, 102, 241, 0.35)",
              }}
            >
              {running ? (
                <>
                  <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Running...
                </>
              ) : (
                <>
                  <Play size={14} fill="currentColor" />
                  Run Query
                </>
              )}
            </button>
          </div>
        </div>

        {/* Query Input Area */}
        <div style={{ position: "relative" }}>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isRedis
                ? "Enter Redis command (e.g. KEYS *, GET mykey, SET foo bar)..."
                : "Enter SQL query (e.g. SELECT * FROM users LIMIT 10;)..."
            }
            rows={5}
            style={{
              width: "100%",
              padding: "1rem",
              background: "#090d16",
              color: "#e2e8f0",
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
              fontSize: "0.9rem",
              lineHeight: 1.5,
              border: "none",
              outline: "none",
              resize: "vertical",
            }}
          />
        </div>

        {/* History Bar */}
        {history.length > 0 && (
          <div
            style={{
              padding: "0.5rem 1rem",
              background: "var(--bg-inset)",
              borderTop: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              overflowX: "auto",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)" }}>RECENT:</span>
            {history.slice(0, 6).map((h, i) => (
              <button
                key={i}
                onClick={() => setQuery(h)}
                style={{
                  fontSize: "0.75rem",
                  padding: "0.2rem 0.5rem",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  color: "var(--foreground)",
                  cursor: "pointer",
                  maxWidth: 180,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={h}
              >
                {h}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error Callout */}
      {error && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            borderRadius: "var(--radius)",
            padding: "1rem 1.25rem",
            color: "#ef4444",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.75rem",
          }}
        >
          <AlertCircle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>Query Execution Error</div>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: "0.85rem",
                marginTop: "0.35rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {error}
            </div>
          </div>
        </div>
      )}

      {/* Query Results */}
      {result && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: "var(--radius)",
            overflow: "hidden",
          }}
        >
          {/* Results Summary Bar */}
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "var(--bg-inset)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#10b981",
                }}
              >
                {result.command || "SUCCESS"}
              </span>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  fontSize: "0.8rem",
                  color: "var(--muted)",
                }}
              >
                <Clock size={13} />
                {result.executionTimeMs} ms
              </span>

              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                {result.rowCount} {result.rowCount === 1 ? "row" : "rows"}
              </span>
            </div>

            {/* Export Toolbar */}
            {result.rows && result.rows.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  onClick={() => setRevealSecrets(!revealSecrets)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    padding: "0.3rem 0.6rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    borderRadius: 4,
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    color: revealSecrets ? "#f59e0b" : "var(--foreground)",
                    cursor: "pointer",
                  }}
                  title={revealSecrets ? "Mask confidential columns" : "Reveal confidential columns"}
                >
                  {revealSecrets ? <EyeOff size={12} /> : <Eye size={12} />}
                  {revealSecrets ? "Hide Secrets" : "Reveal Secrets"}
                </button>

                <button
                  onClick={exportCSV}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    padding: "0.3rem 0.6rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    borderRadius: 4,
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    cursor: "pointer",
                  }}
                >
                  <Download size={12} />
                  Export CSV
                </button>

                <button
                  onClick={exportJSON}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    padding: "0.3rem 0.6rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    borderRadius: 4,
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    cursor: "pointer",
                  }}
                >
                  <Download size={12} />
                  Export JSON
                </button>
              </div>
            )}
          </div>

          {/* Result Data Grid */}
          {result.rows && result.rows.length > 0 ? (
            <div style={{ overflowX: "auto", maxHeight: 480 }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  textAlign: "left",
                  fontSize: "0.85rem",
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                }}
              >
                <thead>
                  <tr style={{ background: "rgba(255, 255, 255, 0.03)", borderBottom: "1px solid var(--border)" }}>
                    <th style={{ padding: "0.6rem 0.75rem", color: "var(--muted)", width: 40, fontWeight: 700 }}>#</th>
                    {Object.keys(result.rows[0]).map((col) => {
                      const isSecret = isConfidentialKey(col);
                      return (
                        <th
                          key={col}
                          style={{
                            padding: "0.6rem 0.75rem",
                            color: "var(--foreground)",
                            fontWeight: 700,
                            borderRight: "1px solid rgba(255,255,255,0.05)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                            {col}
                            {isSecret && <ConfidentialBadge size="xs" label="Secret" />}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, rowIdx) => (
                    <tr
                      key={rowIdx}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        background: rowIdx % 2 === 0 ? "transparent" : "rgba(255, 255, 255, 0.015)",
                      }}
                    >
                      <td style={{ padding: "0.55rem 0.75rem", color: "var(--muted)", fontSize: "0.75rem" }}>
                        {rowIdx + 1}
                      </td>
                      {Object.keys(row).map((col) => {
                        const val = row[col];
                        const cellId = `${rowIdx}-${col}`;
                        const isNull = val === null || val === undefined;
                        const isBool = typeof val === "boolean";
                        const isSecret = isConfidentialKey(col);
                        const rawString = isNull
                          ? "NULL"
                          : typeof val === "object"
                          ? JSON.stringify(val)
                          : String(val);
                        const displayVal = isSecret && !revealSecrets ? "••••••••••••" : rawString;

                        return (
                          <td
                            key={col}
                            onClick={() => copyText(rawString, cellId)}
                            style={{
                              padding: "0.55rem 0.75rem",
                              maxWidth: 320,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              borderRight: "1px solid rgba(255,255,255,0.05)",
                              cursor: "pointer",
                              color: isNull
                                ? "var(--muted)"
                                : isSecret && !revealSecrets
                                ? "#f59e0b"
                                : isBool
                                ? val
                                  ? "#10b981"
                                  : "#ef4444"
                                : typeof val === "number"
                                ? "#60a5fa"
                                : "var(--foreground)",
                              fontStyle: isNull ? "italic" : "normal",
                            }}
                            title={isSecret ? "Confidential field (click to copy real secret)" : "Click to copy value"}
                          >
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                              {isSecret && !revealSecrets && <Lock size={11} />}
                              {displayVal}
                              {copiedCell === cellId && <Check size={11} style={{ color: "#10b981" }} />}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--muted)" }}>
              <FileCode size={32} style={{ margin: "0 auto 0.5rem", opacity: 0.5 }} />
              <p style={{ fontWeight: 600 }}>Query executed successfully with 0 rows returned.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
