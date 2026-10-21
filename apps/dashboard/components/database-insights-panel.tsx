"use client";

import React, { useState, useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  HardDrive,
  RefreshCw,
  Zap,
  StopCircle,
  CheckCircle2,
  Copy,
  Check,
  RotateCcw,
} from "lucide-react";
import { databases, type DatabaseInsights, type ManagedDatabase } from "@/lib/api";

interface DatabaseInsightsPanelProps {
  databaseId: string;
  db: ManagedDatabase;
}

export default function DatabaseInsightsPanel({ databaseId, db }: DatabaseInsightsPanelProps) {
  const [insights, setInsights] = useState<DatabaseInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [killingPid, setKillingPid] = useState<number | null>(null);
  const [resetting, setResetting] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  async function loadInsights(isBackground = false) {
    if (!isBackground) setLoading(true);
    setError(null);
    try {
      const data = await databases.getInsights(databaseId);
      setInsights(data);
    } catch (err: any) {
      if (!isBackground) {
        setError(err.message || "Failed to load database insights");
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  }

  useEffect(() => {
    loadInsights(false);
    const interval = setInterval(() => loadInsights(true), 6000);
    return () => clearInterval(interval);
  }, [databaseId]);

  async function handleKillQuery(pid: number) {
    if (!confirm(`Are you sure you want to terminate query process PID ${pid}?`)) return;
    setKillingPid(pid);
    try {
      await databases.killQuery(databaseId, pid);
      loadInsights();
    } catch (err: any) {
      alert(`Failed to terminate query: ${err.message}`);
    } finally {
      setKillingPid(null);
    }
  }

  async function handleResetStats() {
    if (!confirm("Are you sure you want to reset all query execution statistics?")) return;
    setResetting(true);
    try {
      await databases.resetStats(databaseId);
      loadInsights();
    } catch (err: any) {
      alert(`Failed to reset stats: ${err.message}`);
    } finally {
      setResetting(false);
    }
  }

  function copyText(text: string, index: number) {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  if (loading && !insights) {
    return (
      <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--muted)" }}>
        <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 0.75rem" }} />
        <p>Loading database performance insights & lock telemetry...</p>
      </div>
    );
  }

  if (error && !insights) {
    return (
      <div
        style={{
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.25)",
          borderRadius: 8,
          padding: "1.25rem",
          color: "#f87171",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <AlertTriangle size={20} />
        <div>
          <strong>Unable to load query insights:</strong> {error}
        </div>
      </div>
    );
  }

  if (insights?.booting) {
    return (
      <div
        style={{
          background: "rgba(79, 70, 229, 0.08)",
          border: "1px solid rgba(79, 70, 229, 0.2)",
          borderRadius: 8,
          padding: "1.5rem",
          color: "var(--foreground)",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <RefreshCw size={24} className="animate-spin text-accent" />
        <div>
          <strong style={{ display: "block", marginBottom: 4 }}>Database connection initializing</strong>
          <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
            PostgreSQL is establishing connection. Telemetry and query performance insights will stream in automatically.
          </span>
        </div>
      </div>
    );
  }

  const cacheHit = insights?.cacheHitRatio ?? 100;
  const isCacheHealthy = cacheHit >= 98;
  const totalConnections = (insights?.connectionBreakdown || []).reduce((acc, c) => acc + c.count, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Top KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
        }}
      >
        {/* Cache Hit Ratio */}
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: 10,
            padding: "1.25rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 600 }}>BUFFER CACHE HIT RATIO</span>
            <Zap size={16} style={{ color: isCacheHealthy ? "#10b981" : "#f59e0b" }} />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: isCacheHealthy ? "#059669" : "#d97706" }}>
            {cacheHit}%
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.35rem" }}>
            {isCacheHealthy ? "✓ Optimal: Reads served directly from memory" : "⚠ Disk reads occurring; consider upgrading RAM"}
          </p>
        </div>

        {/* Database Disk Size */}
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: 10,
            padding: "1.25rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 600 }}>DATABASE DISK SIZE</span>
            <HardDrive size={16} style={{ color: "#0284c7" }} />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--foreground)" }}>
            {insights?.databaseSize || "0 MB"}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.35rem" }}>
            Active physical disk footprint on volume
          </p>
        </div>

        {/* Active Connections */}
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: 10,
            padding: "1.25rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 600 }}>ACTIVE CLIENT SESSIONS</span>
            <Activity size={16} style={{ color: "var(--accent)" }} />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--foreground)" }}>
            {totalConnections}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.35rem" }}>
            {(insights?.connectionBreakdown || [])
              .map((c) => `${c.count} ${c.state}`)
              .join(", ") || "No active connections"}
          </p>
        </div>
      </div>

      {/* Live Running Queries & Locks */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--card-border)",
          borderRadius: 10,
          padding: "1.25rem",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Active Running Queries & Lock Watcher</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.2rem" }}>
              Monitors queries currently executing on the database. Terminate stuck or runaway transactions.
            </p>
          </div>
          <button
            onClick={() => loadInsights()}
            disabled={loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.35rem 0.75rem",
              borderRadius: 6,
              background: "#f1f5f9",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {(!insights?.runningQueries || insights.runningQueries.length === 0) ? (
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              color: "var(--muted)",
              fontSize: "0.85rem",
              background: "var(--bg-inset)",
              borderRadius: 6,
            }}
          >
            <CheckCircle2 size={24} style={{ color: "#10b981", margin: "0 auto 0.5rem" }} />
            No slow or blocking queries currently running. Database is completely idle.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--muted)", textAlign: "left" }}>
                  <th style={{ padding: "0.5rem 0.75rem" }}>PID</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>User</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Duration</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Query</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Wait Event</th>
                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {insights.runningQueries.map((q) => (
                  <tr key={q.pid} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "0.55rem 0.75rem", fontFamily: "monospace", fontWeight: 600 }}>{q.pid}</td>
                    <td style={{ padding: "0.55rem 0.75rem", color: "var(--muted)" }}>{q.usename}</td>
                    <td style={{ padding: "0.55rem 0.75rem", color: q.duration_seconds > 5 ? "#ef4444" : "#f59e0b", fontWeight: 600 }}>
                      {q.duration_seconds}s
                    </td>
                    <td style={{ padding: "0.55rem 0.75rem", fontFamily: "monospace", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {q.query}
                    </td>
                    <td style={{ padding: "0.55rem 0.75rem", color: "var(--muted)", fontSize: "0.75rem" }}>
                      {q.wait_event !== "None" ? `${q.wait_event_type}: ${q.wait_event}` : "Running (CPU)"}
                    </td>
                    <td style={{ padding: "0.55rem 0.75rem", textAlign: "right" }}>
                      <button
                        onClick={() => handleKillQuery(q.pid)}
                        disabled={killingPid === q.pid}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          padding: "0.25rem 0.6rem",
                          borderRadius: 4,
                          background: "rgba(239, 68, 68, 0.15)",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          color: "#ef4444",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        <StopCircle size={12} />
                        {killingPid === q.pid ? "Terminating..." : "Kill"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Top 15 Slowest Queries (pg_stat_statements) */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--card-border)",
          borderRadius: 10,
          padding: "1.25rem",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Top Slowest Queries (pg_stat_statements)</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.2rem" }}>
              Identifies query bottlenecks, execution frequency, and cumulative CPU time across all client connections.
            </p>
          </div>
          <button
            onClick={handleResetStats}
            disabled={resetting}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.35rem 0.75rem",
              borderRadius: 6,
              background: "#f1f5f9",
              border: "1px solid var(--border)",
              color: "var(--muted)",
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            <RotateCcw size={12} /> Reset Statistics
          </button>
        </div>

        {(!insights?.slowQueries || insights.slowQueries.length === 0) ? (
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              color: "var(--muted)",
              fontSize: "0.85rem",
              background: "var(--bg-inset)",
              borderRadius: 6,
            }}
          >
            No slow query metrics recorded yet. Run queries from your applications to populate telemetry.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--muted)", textAlign: "left" }}>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Query Statement</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Calls</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Mean Time</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Total Time</th>
                  <th style={{ padding: "0.5rem 0.75rem" }}>Total Rows</th>
                  <th style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>Copy</th>
                </tr>
              </thead>
              <tbody>
                {insights.slowQueries.map((sq, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td
                      style={{
                        padding: "0.55rem 0.75rem",
                        fontFamily: "monospace",
                        maxWidth: 420,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "var(--foreground)",
                      }}
                    >
                      {sq.query}
                    </td>
                    <td style={{ padding: "0.55rem 0.75rem", color: "var(--muted)" }}>{sq.calls.toLocaleString()}</td>
                    <td style={{ padding: "0.55rem 0.75rem", color: "#38bdf8", fontWeight: 600 }}>
                      {sq.mean_time_ms}ms
                    </td>
                    <td style={{ padding: "0.55rem 0.75rem", color: "var(--muted)" }}>{sq.total_time_ms}ms</td>
                    <td style={{ padding: "0.55rem 0.75rem", color: "var(--muted)" }}>{sq.total_rows.toLocaleString()}</td>
                    <td style={{ padding: "0.55rem 0.75rem", textAlign: "right" }}>
                      <button
                        onClick={() => copyText(sq.query, idx)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: copiedIndex === idx ? "#10b981" : "var(--muted)",
                          cursor: "pointer",
                        }}
                      >
                        {copiedIndex === idx ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
