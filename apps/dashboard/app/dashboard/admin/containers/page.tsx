"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { admin } from "@/lib/api";
import { Container, Terminal, X, RefreshCw, Trash2, PowerOff, Copy, Check, ExternalLink } from "lucide-react";
import { useAdminStats } from "../../../../hooks/useAdminStats";
import { toast } from "sonner";

function StatusBadge({ status }: { status: string }) {
  const isRunning = status === "running";
  const isExited = status === "exited";
  return (
    <span
      className="badge"
      style={{
        background: isRunning ? "rgba(16, 185, 129, 0.1)" : isExited ? "rgba(244, 63, 94, 0.1)" : "rgba(245, 158, 11, 0.1)",
        color: isRunning ? "#10b981" : isExited ? "#f43f5e" : "#f59e0b",
        borderColor: isRunning ? "rgba(16, 185, 129, 0.25)" : isExited ? "rgba(244, 63, 94, 0.25)" : "rgba(245, 158, 11, 0.25)",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "currentColor",
          display: "inline-block",
        }}
      />
      {status}
    </span>
  );
}

export default function ContainersPage() {
  const { stats, loading, fetchStats } = useAdminStats();
  const [containerLogsModal, setContainerLogsModal] = useState<{ id: string; name: string } | null>(null);
  const [containerLogs, setContainerLogs] = useState<string>("Loading...");
  const [copied, setCopied] = useState(false);

  const fetchContainerLogs = async (id: string) => {
    setContainerLogs("Streaming logs from Docker daemon...");
    try {
      const res = await admin.getContainerLogs(id);
      setContainerLogs(res.logs || "No logs output recorded");
    } catch {
      setContainerLogs("Failed to fetch container logs");
    }
  };

  useEffect(() => {
    if (containerLogsModal) fetchContainerLogs(containerLogsModal.id);
  }, [containerLogsModal]);

  const handleKillContainer = async (id: string) => {
    if (!confirm(`Force kill and purge container ${id}?`)) return;
    try {
      await admin.killContainer(id);
      toast.success("Kill signal sent");
      fetchStats();
    } catch {
      toast.error("Failed to kill container");
    }
  };

  function copyLogs() {
    navigator.clipboard.writeText(containerLogs);
    setCopied(true);
    toast.success("Logs copied");
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading && !stats) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Loading Docker stats...</span>
      </div>
    );
  }

  const vm = stats?.vmStats;

  return (
    <>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="containers-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <Container size={18} className="text-accent" />
            <h2 className="card-title" style={{ fontSize: "1.05rem" }}>Live Docker Containers</h2>
            {vm && (
              <span className="containers-count-badge mono">
                {vm.docker.runningContainers} running / {vm.docker.totalContainers} total
              </span>
            )}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={fetchStats}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {!vm || vm.docker.containers.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}>
            {!vm ? "Worker offline — cannot connect to Docker socket" : "No active containers running on host"}
          </div>
        ) : (
          <div className="table-responsive-wrap">
            <table className="modern-table">
              <thead>
                <tr>
                  {["ID", "Name", "Image", "State", "Status", "CPU", "RAM", "Actions"].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vm.docker.containers.map(c => {
                  const d = stats?.allDeployments?.find((deploy: any) => deploy.id === c.deploymentId);
                  return (
                    <tr key={c.id}>
                      <td className="mono" style={{ color: "var(--muted)" }}>{c.id.slice(0, 10)}</td>
                      <td>
                        <div style={{ fontWeight: 650, color: "var(--foreground)", fontSize: "0.85rem" }}>{c.name}</div>
                        {c.entityLink && c.entityName ? (
                          <Link
                            href={c.entityLink}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                              fontSize: "0.73rem",
                              color: "var(--accent)",
                              textDecoration: "none",
                              marginTop: "0.25rem",
                              fontWeight: 550,
                            }}
                          >
                            <span>{c.entityType === "database" ? "🗄️" : c.entityType === "service" ? "⚙️" : "🌐"} {c.entityName}</span>
                            <ExternalLink size={10} />
                          </Link>
                        ) : d ? (
                          <Link
                            href={`/dashboard/projects/${d.project.id}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                              fontSize: "0.73rem",
                              color: "var(--accent)",
                              textDecoration: "none",
                              marginTop: "0.25rem",
                              fontWeight: 550,
                            }}
                          >
                            <span>🌐 {d.project.name}</span>
                            <ExternalLink size={10} />
                          </Link>
                        ) : (
                          <span style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.2rem", display: "inline-block" }}>
                            Host Core Daemon
                          </span>
                        )}
                      </td>
                      <td className="mono" style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                        {c.image.slice(0, 28)}
                      </td>
                      <td><StatusBadge status={c.state} /></td>
                      <td style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{c.status}</td>
                      <td className="mono" style={{ fontWeight: 600 }}>
                        {c.cpuPercent !== undefined ? (
                          <span style={{ color: c.cpuPercent > 80 ? "var(--danger)" : "inherit" }}>
                            {c.cpuPercent.toFixed(1)}%
                          </span>
                        ) : "—"}
                      </td>
                      <td className="mono" style={{ fontWeight: 600 }}>
                        {c.memUsageMB !== undefined ? (
                          <span style={{ color: c.memPercent && c.memPercent > 80 ? "var(--danger)" : "inherit" }}>
                            {c.memUsageMB.toFixed(0)} MB
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setContainerLogsModal({ id: c.id, name: c.name })}
                          >
                            <Terminal size={12} /> Logs
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleKillContainer(c.id)}
                            title="Force kill container"
                          >
                            Kill
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
      </div>

      {/* Container Logs Modal */}
      {containerLogsModal && (
        <div className="modal-backdrop" onClick={() => setContainerLogsModal(null)}>
          <div className="modal-content-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Terminal size={18} className="text-accent" />
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
                  Logs: <span className="mono">{containerLogsModal.name}</span>
                </h3>
              </div>

              <div style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
                <button className="btn btn-secondary btn-sm" onClick={copyLogs}>
                  {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => fetchContainerLogs(containerLogsModal.id)}>
                  <RefreshCw size={12} /> Refresh
                </button>
                <button className="btn-icon" onClick={() => setContainerLogsModal(null)}>
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="modal-body-terminal">
              <pre className="terminal-pre mono">{containerLogs}</pre>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .containers-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.15rem 1.35rem;
          border-bottom: 1px solid var(--card-border);
          background: #fafbfc;
        }
        .containers-count-badge {
          font-size: 0.74rem;
          color: var(--muted);
          background: var(--bg-inset);
          padding: 0.15rem 0.5rem;
          border-radius: 6px;
          border: 1px solid var(--card-border);
        }

        .table-responsive-wrap {
          overflow-x: auto;
          width: 100%;
        }
        .modern-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.8125rem;
          text-align: left;
        }
        .modern-table th {
          padding: 0.75rem 1.25rem;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--muted);
          font-weight: 650;
          border-bottom: 1px solid var(--card-border);
          background: var(--bg-inset);
        }
        .modern-table td {
          padding: 0.85rem 1.25rem;
          border-bottom: 1px solid var(--card-border);
        }
        .modern-table tr:last-child td {
          border-bottom: none;
        }
        .modern-table tr:hover td {
          background: var(--card-hover);
        }

        /* Modal */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(6px);
          z-index: 999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
        }
        .modal-content-card {
          width: 100%;
          max-width: 900px;
          max-height: 85vh;
          background: var(--card);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: var(--shadow-hover);
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--card-border);
          background: var(--bg-inset);
        }
        .modal-body-terminal {
          padding: 1rem;
          overflow-y: auto;
          background: #0f172a;
          flex: 1;
        }
        .terminal-pre {
          color: #34d399;
          font-size: 0.8rem;
          line-height: 1.55;
          white-space: pre-wrap;
          word-break: break-word;
          margin: 0;
        }
      `}</style>
    </>
  );
}
