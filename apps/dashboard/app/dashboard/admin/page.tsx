"use client";

import { admin } from "@/lib/api";
import {
  Activity,
  Database,
  Server,
  Trash2,
  PowerOff,
  RefreshCw,
  Cpu,
  HardDrive,
  Wifi,
  WifiOff,
  Layers,
  ExternalLink,
  Clock
} from "lucide-react";
import { useAdminStats } from "../../../hooks/useAdminStats";
import { StatusBadge } from "@/components/status-badge";
import { toast } from "sonner";

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div style={{ width: "100%", height: "8px", background: "var(--bg-inset)", borderRadius: "9999px", overflow: "hidden" }}>
      <div
        style={{
          width: `${Math.min(percent, 100)}%`,
          height: "100%",
          background: color,
          borderRadius: "9999px",
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

export default function AdminOverviewPage() {
  const { stats, loading, fetchStats } = useAdminStats();

  const handleStop = async (id: string) => {
    try {
      await admin.stopContainer(id);
      toast.success("Stop command sent to worker");
      fetchStats();
    } catch {
      toast.error("Failed to stop container");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this deployment and wipe its container/files?")) return;
    try {
      await admin.deleteDeployment(id);
      toast.success("Deployment deleted");
      fetchStats();
    } catch {
      toast.error("Failed to delete deployment");
    }
  };

  const handleRestartService = async (service: "worker" | "router") => {
    if (!confirm(`Restart the ${service}?`)) return;
    try {
      await admin.restartService(service);
      toast.success(`${service} restart command sent to PM2`);
    } catch {
      toast.error(`Failed to restart ${service}`);
    }
  };

  if (loading && !stats) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Loading infrastructure metrics...</span>
      </div>
    );
  }

  const vm = stats?.vmStats;
  const isWorkerOnline = vm && (Date.now() - vm.timestamp) < 60_000;

  return (
    <>
      {/* Worker Status Banner */}
      <div className={`worker-banner ${isWorkerOnline ? "banner-online" : "banner-offline"}`}>
        <div className="banner-left">
          {isWorkerOnline ? <Wifi size={20} color="#10b981" /> : <WifiOff size={20} color="#f43f5e" />}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                {isWorkerOnline ? "Cloud Worker Online" : "Cloud Worker Disconnected"}
              </span>
              <span className={`status-pill ${isWorkerOnline ? "pill-green" : "pill-red"}`}>
                {isWorkerOnline ? "OPERATIONAL" : "OFFLINE"}
              </span>
            </div>
            <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "2px" }}>
              {vm ? `${vm.hostname} • ${vm.platform} • Host Uptime: ${formatUptime(vm.uptime)}` : "No telemetry heartbeat received"}
            </div>
          </div>
        </div>

        <div className="banner-actions">
          <button className="btn btn-secondary btn-sm" onClick={fetchStats}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleRestartService("worker")}>
            Restart Worker
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleRestartService("router")}>
            Restart Edge Router
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">
            <Activity size={14} className="text-accent" /> Platform Users
          </div>
          <div className="stat-value">{stats?.users ?? 0}</div>
          <div className="stat-sub">Active workspace accounts</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Database size={14} className="text-accent" /> Total Projects
          </div>
          <div className="stat-value">{stats?.projects ?? 0}</div>
          <div className="stat-sub">Across all teams</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Server size={14} className="text-accent" /> Total Deployments
          </div>
          <div className="stat-value">{stats?.deployments ?? 0}</div>
          <div className="stat-sub">Lifetime container builds</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Layers size={14} className="text-accent" /> BullMQ Build Queue
          </div>
          <div className="stat-value">
            {vm ? `${vm.queue.waiting}w / ${vm.queue.active}a` : "—"}
          </div>
          <div className="stat-sub">
            {vm ? `${vm.queue.completed} completed • ${vm.queue.failed} failed` : "Queue idle"}
          </div>
        </div>
      </div>

      {/* VM Resources: CPU & Memory */}
      {vm && (
        <div className="vm-gauges-grid">
          <div className="card">
            <div className="gauge-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Cpu size={18} className="text-accent" />
                <span style={{ fontWeight: 650 }}>Host CPU Utilization</span>
              </div>
              <span className="gauge-percent mono">{vm.cpu.usagePercent}%</span>
            </div>
            <ProgressBar
              percent={vm.cpu.usagePercent}
              color={vm.cpu.usagePercent > 80 ? "#f43f5e" : vm.cpu.usagePercent > 50 ? "#f59e0b" : "#10b981"}
            />
            <div className="gauge-footer mono">
              {vm.cpu.cores} Cores • {vm.cpu.model.slice(0, 45)}
            </div>
          </div>

          <div className="card">
            <div className="gauge-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <HardDrive size={18} className="text-accent" />
                <span style={{ fontWeight: 650 }}>Host RAM Allocation</span>
              </div>
              <span className="gauge-percent mono">{vm.memory.usagePercent}%</span>
            </div>
            <ProgressBar
              percent={vm.memory.usagePercent}
              color={vm.memory.usagePercent > 80 ? "#f43f5e" : vm.memory.usagePercent > 50 ? "#f59e0b" : "#10b981"}
            />
            <div className="gauge-footer mono">
              {vm.memory.usedMB} MB used / {vm.memory.totalMB} MB total ({vm.memory.freeMB} MB free)
            </div>
          </div>
        </div>
      )}

      {/* All Deployments Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--card-border)", background: "rgba(255,255,255,0.02)" }}>
          <h2 className="card-title" style={{ fontSize: "1.05rem" }}>
            Platform Active & Recent Deployments
          </h2>
        </div>

        {!stats?.allDeployments || stats.allDeployments.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}>
            No deployments active.
          </div>
        ) : (
          <div className="deployments-table-wrap">
            {stats.allDeployments.map((deploy: any) => (
              <div key={deploy.id} className="admin-deploy-row">
                <div className="admin-deploy-left">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                      {deploy.project?.name || "Service Container"}
                    </span>
                    <StatusBadge status={deploy.status} />
                    {deploy.deploymentType && (
                      <span className="deploy-type-tag mono">
                        {deploy.deploymentType}
                      </span>
                    )}
                  </div>

                  <div className="admin-deploy-sub mono">
                    <span className="mono-chip">{deploy.id.slice(0, 8)}</span>
                    <span>•</span>
                    <span>branch: {deploy.branch}</span>
                    {deploy.url && (
                      <>
                        <span>•</span>
                        <a href={deploy.url} target="_blank" rel="noreferrer" className="admin-deploy-link">
                          {deploy.url} <ExternalLink size={11} />
                        </a>
                      </>
                    )}
                    {deploy.errorMessage && (
                      <>
                        <span>•</span>
                        <span style={{ color: "var(--danger)" }}>{deploy.errorMessage.slice(0, 50)}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="admin-deploy-actions">
                  {deploy.status === "READY" && (
                    <button className="btn btn-secondary btn-sm" onClick={() => handleStop(deploy.id)}>
                      <PowerOff size={13} /> Pause
                    </button>
                  )}
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(deploy.id)}>
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .worker-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.15rem 1.5rem;
          border-radius: var(--radius);
          border: 1px solid var(--card-border);
          gap: 1.5rem;
          flex-wrap: wrap;
        }
        .banner-online {
          background: rgba(16, 185, 129, 0.06);
          border-left: 4px solid #10b981;
        }
        .banner-offline {
          background: rgba(244, 63, 94, 0.06);
          border-left: 4px solid #f43f5e;
        }
        .banner-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .status-pill {
          font-size: 0.65rem;
          font-weight: 700;
          padding: 0.1rem 0.45rem;
          border-radius: 4px;
          letter-spacing: 0.05em;
        }
        .pill-green {
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
        }
        .pill-red {
          background: rgba(244, 63, 94, 0.15);
          color: #f43f5e;
        }
        .banner-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .vm-gauges-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.25rem;
        }
        .gauge-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.85rem;
        }
        .gauge-percent {
          font-size: 1.25rem;
          font-weight: 750;
          color: var(--foreground);
        }
        .gauge-footer {
          font-size: 0.76rem;
          color: var(--muted);
          margin-top: 0.65rem;
        }

        /* Deployments Table */
        .deployments-table-wrap {
          display: flex;
          flex-direction: column;
        }
        .admin-deploy-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid var(--card-border);
          gap: 1rem;
          flex-wrap: wrap;
        }
        .admin-deploy-row:last-child {
          border-bottom: none;
        }
        .admin-deploy-left {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .deploy-type-tag {
          font-size: 0.68rem;
          padding: 0.1rem 0.45rem;
          border-radius: 4px;
          background: var(--bg-inset);
          color: var(--muted);
          border: 1px solid var(--card-border);
        }
        .admin-deploy-sub {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.78rem;
          color: var(--muted);
          flex-wrap: wrap;
        }
        .mono-chip {
          background: rgba(255, 255, 255, 0.05);
          padding: 0.1rem 0.35rem;
          border-radius: 4px;
        }
        .admin-deploy-link {
          color: var(--accent);
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }
        .admin-deploy-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        @media (max-width: 768px) {
          .vm-gauges-grid {
            grid-template-columns: 1fr;
          }
          .admin-deploy-row {
            flex-direction: column;
            align-items: flex-start;
          }
          .admin-deploy-actions {
            width: 100%;
            justify-content: flex-end;
          }
        }
      `}</style>
    </>
  );
}
