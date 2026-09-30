"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
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
  Globe,
  Zap,
  Search,
  Filter,
  Play,
  Terminal,
  ShieldCheck,
  Radio,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle
} from "lucide-react";
import { useAdminStats } from "../../../hooks/useAdminStats";
import { StatusBadge } from "@/components/status-badge";
import { formatDeployedUrl } from "@/lib/domains";
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
          width: `${Math.min(Math.max(percent, 0), 100)}%`,
          height: "100%",
          background: color,
          borderRadius: "9999px",
          transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
    </div>
  );
}

export default function AdminOverviewPage() {
  const { stats, loading, fetchStats } = useAdminStats();
  const [activeTab, setActiveTab] = useState<"all" | "frontend" | "backend" | "database" | "containers">("all");
  const [search, setSearch] = useState("");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Frontend Deployment Actions
  const handleStopDeployment = async (id: string) => {
    setActionInProgress(id);
    try {
      await admin.stopContainer(id);
      toast.success("Stop command issued to worker");
      fetchStats();
    } catch {
      toast.error("Failed to stop deployment");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteDeployment = async (id: string) => {
    if (!confirm("Delete this deployment and wipe its container/files?")) return;
    setActionInProgress(id);
    try {
      await admin.deleteDeployment(id);
      toast.success("Deployment deleted");
      fetchStats();
    } catch {
      toast.error("Failed to delete deployment");
    } finally {
      setActionInProgress(null);
    }
  };

  // Backend Service Actions
  const handleStopBackend = async (id: string) => {
    setActionInProgress(id);
    try {
      await admin.stopBackendService(id);
      toast.success("Backend service stop command sent");
      fetchStats();
    } catch {
      toast.error("Failed to stop backend service");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteBackend = async (id: string) => {
    if (!confirm("Permanently delete this backend service and all containers?")) return;
    setActionInProgress(id);
    try {
      await admin.deleteBackendService(id);
      toast.success("Backend service deleted");
      fetchStats();
    } catch {
      toast.error("Failed to delete backend service");
    } finally {
      setActionInProgress(null);
    }
  };

  // Database Actions
  const handleStopDatabase = async (id: string) => {
    setActionInProgress(id);
    try {
      await admin.stopDatabase(id);
      toast.success("Database stop command issued");
      fetchStats();
    } catch {
      toast.error("Failed to stop database");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteDatabase = async (id: string) => {
    if (!confirm("⚠️ PERMANENT ACTION: Delete this database and wipe its storage volume?")) return;
    setActionInProgress(id);
    try {
      await admin.deleteDatabase(id);
      toast.success("Database removed");
      fetchStats();
    } catch {
      toast.error("Failed to delete database");
    } finally {
      setActionInProgress(null);
    }
  };

  // Container Action
  const handleKillContainer = async (containerId: string) => {
    if (!confirm(`Force kill container ${containerId.slice(0, 12)}?`)) return;
    setActionInProgress(containerId);
    try {
      await admin.killContainer(containerId);
      toast.success("Container killed");
      fetchStats();
    } catch {
      toast.error("Failed to kill container");
    } finally {
      setActionInProgress(null);
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

  const vm = stats?.vmStats;
  const isWorkerOnline = vm && (Date.now() - vm.timestamp) < 60_000;

  // Unified Multi-Hosting Data Source
  const allHostingItems = useMemo(() => {
    const list: any[] = [];

    // 1. Frontend deployments
    (stats?.allDeployments || []).forEach((d: any) => {
      list.push({
        id: d.id,
        targetId: d.project?.id || d.projectId,
        name: d.project?.name || "Frontend App",
        slug: d.project?.slug || d.id.slice(0, 8),
        category: "frontend",
        badgeLabel: "Frontend App",
        subType: d.deploymentType || d.project?.framework || "STATIC",
        status: d.status,
        url: d.status === "READY" ? formatDeployedUrl(d.url, d.project?.slug || d.slug || d.id) : null,
        detailHref: `/dashboard/projects/${d.project?.id || d.projectId}`,
        port: d.containerPort,
        branch: d.branch,
        createdAt: new Date(d.createdAt).getTime(),
        quota: d.containerPort ? "SSR / Hybrid" : "Edge CDN Static",
        raw: d,
      });
    });

    // 2. Backend services
    (stats?.allBackendServices || []).forEach((s: any) => {
      const latest = s.deployments?.[0];
      const status = latest?.status || (s.autoSleep ? "READY" : "RUNNING");
      list.push({
        id: s.id,
        targetId: s.id,
        name: s.name,
        slug: s.slug,
        category: "backend",
        badgeLabel: "Backend Service",
        subType: s.language,
        status: status,
        url: latest?.status === "READY" ? formatDeployedUrl(latest.url, s.slug) : null,
        detailHref: `/dashboard/backend/${s.id}`,
        port: s.internalPort,
        branch: s.branch,
        createdAt: new Date(s.createdAt).getTime(),
        quota: `${s.cpuLimit || 0.5} vCPU • ${s.memoryLimit || 512}MB RAM`,
        raw: s,
      });
    });

    // 3. Databases
    (stats?.allDatabases || []).forEach((db: any) => {
      list.push({
        id: db.id,
        targetId: db.id,
        name: db.name,
        slug: db.slug,
        category: "database",
        badgeLabel: "Managed DB",
        subType: `${db.type} ${db.version}`,
        status: db.status,
        url: null,
        detailHref: `/dashboard/databases/${db.id}`,
        port: db.externalPort || db.internalPort,
        poolerPort: db.poolerPort,
        createdAt: new Date(db.createdAt).getTime(),
        quota: `${db.cpuLimit || 0.5} vCPU • ${db.memoryLimit || 512}MB RAM`,
        raw: db,
      });
    });

    // Sort by creation date descending
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [stats]);

  // Filtered Items
  const filteredHosting = useMemo(() => {
    return allHostingItems.filter(item => {
      if (activeTab !== "all" && item.category !== activeTab) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q) ||
        item.subType.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q)
      );
    });
  }, [allHostingItems, activeTab, search]);

  // Raw Docker Containers from Host Daemon
  const rawContainers = vm?.docker?.containers || [];
  const filteredContainers = useMemo(() => {
    if (!search.trim()) return rawContainers;
    const q = search.toLowerCase();
    return rawContainers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.image.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    );
  }, [rawContainers, search]);

  if (loading && !stats) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Connecting to infrastructure telemetry...</span>
      </div>
    );
  }

  const frontendCount = stats?.projects || (stats?.allDeployments ? new Set(stats.allDeployments.map((d: any) => d.projectId)).size : 0);
  const backendCount  = stats?.backendServices ?? (stats?.allBackendServices?.length || 0);
  const databaseCount = stats?.databases ?? (stats?.allDatabases?.length || 0);
  const totalContainers = vm?.docker?.totalContainers ?? 0;
  const runningContainers = vm?.docker?.runningContainers ?? 0;

  return (
    <div className="admin-container">
      {/* Worker Telemetry Banner */}
      <div className={`worker-banner ${isWorkerOnline ? "banner-online" : "banner-offline"}`}>
        <div className="banner-left">
          <div className="status-orb-box">
            {isWorkerOnline ? <Wifi size={22} color="#10b981" /> : <WifiOff size={22} color="#f43f5e" />}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
              <span className="banner-title">
                {isWorkerOnline ? "Whizan Cloud Worker & Edge Mesh Online" : "Cloud Worker Telemetry Offline"}
              </span>
              <span className={`status-pill ${isWorkerOnline ? "pill-green" : "pill-red"}`}>
                {isWorkerOnline ? "HEALTHY & ROUTING" : "OFFLINE"}
              </span>
              <span className="host-ip-pill mono">
                20.2.136.11
              </span>
            </div>
            <div className="banner-sub">
              {vm
                ? `${vm.hostname} • ${vm.platform} • Host Uptime: ${formatUptime(vm.uptime)} • ${vm.cpu.cores} CPU Cores • Docker ${runningContainers}/${totalContainers} containers active`
                : "No telemetry heartbeat received within last 60 seconds."}
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

      {/* KPI Stats Grid — All Hosting Types */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">
            <Globe size={15} className="text-accent" /> Frontend Apps
          </div>
          <div className="stat-value">{frontendCount}</div>
          <div className="stat-sub">{stats?.deployments ?? 0} lifetime builds</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Zap size={15} style={{ color: "#38bdf8" }} /> Backend Services
          </div>
          <div className="stat-value">{backendCount}</div>
          <div className="stat-sub">Docker Node, Python, Go containers</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Database size={15} style={{ color: "#ec4899" }} /> Managed Databases
          </div>
          <div className="stat-value">{databaseCount}</div>
          <div className="stat-sub">PostgreSQL, Redis &amp; MySQL</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Layers size={15} style={{ color: "#10b981" }} /> Live Containers
          </div>
          <div className="stat-value">
            {runningContainers} <span style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 500 }}>/ {totalContainers}</span>
          </div>
          <div className="stat-sub">
            {vm?.queue ? `${vm.queue.waiting} queued • ${vm.queue.active} active` : "Daemon healthy"}
          </div>
        </div>
      </div>

      {/* VM Hardware Resources: CPU & Memory & Disk */}
      {vm && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                Host Hardware Telemetry
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", color: "#10b981", fontWeight: 600 }}>
              <span className="live-stream-dot" style={{ width: 7, height: 7, background: "#10b981", borderRadius: "50%", display: "inline-block", boxShadow: "0 0 8px #10b981" }} />
              <span>Realtime (3s sync)</span>
            </div>
          </div>

          <div className="vm-gauges-grid">
            <div className="card gauge-card">
              <div className="gauge-header">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Cpu size={16} className="text-accent" />
                  <span style={{ fontWeight: 650, fontSize: "0.88rem" }}>Host CPU Utilization</span>
                </div>
                <span className="gauge-percent mono">{vm.cpu.usagePercent}%</span>
              </div>
              <ProgressBar
                percent={vm.cpu.usagePercent}
                color={vm.cpu.usagePercent > 80 ? "#f43f5e" : vm.cpu.usagePercent > 50 ? "#f59e0b" : "#10b981"}
              />
              <div className="gauge-footer mono">
                {vm.cpu.cores} Cores • {vm.cpu.model.slice(0, 36)} • Realtime Delta
              </div>
            </div>

            <div className="card gauge-card">
              <div className="gauge-header">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <HardDrive size={16} className="text-accent" />
                  <span style={{ fontWeight: 650, fontSize: "0.88rem" }}>Host RAM Allocation</span>
                </div>
                <span className="gauge-percent mono">{vm.memory.usagePercent}%</span>
              </div>
              <ProgressBar
                percent={vm.memory.usagePercent}
                color={vm.memory.usagePercent > 80 ? "#f43f5e" : vm.memory.usagePercent > 50 ? "#f59e0b" : "#10b981"}
              />
              <div className="gauge-footer mono">
                {vm.memory.usedMB} MB used / {vm.memory.totalMB} MB total ({vm.memory.freeMB || vm.memory.availableMB} MB available{vm.memory.cachedMB ? ` • ${vm.memory.cachedMB}MB cache` : ""})
              </div>
            </div>

            {vm.disk && (
              <div className="card gauge-card">
                <div className="gauge-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Server size={16} className="text-accent" />
                    <span style={{ fontWeight: 650, fontSize: "0.88rem" }}>Persistent NVMe Disk</span>
                  </div>
                  <span className="gauge-percent mono">{vm.disk.usagePercent}%</span>
                </div>
                <ProgressBar
                  percent={vm.disk.usagePercent}
                  color={vm.disk.usagePercent > 85 ? "#f43f5e" : vm.disk.usagePercent > 65 ? "#f59e0b" : "#38bdf8"}
                />
                <div className="gauge-footer mono">
                  {Math.round(vm.disk.usedMB / 1024)}GB used / {Math.round(vm.disk.totalMB / 1024)}GB total ({vm.disk.freeMB > 0 ? `${Math.round(vm.disk.freeMB / 1024)}GB free` : ""})
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unified Multi-Hosting Management Section */}
      <div className="card hosting-section-card">
        {/* Section Header with Tabs & Search */}
        <div className="hosting-section-header">
          <div className="hosting-header-left">
            <h2 className="section-title">All Platform Hosted Services</h2>
            <p className="section-sub">Comprehensive overview of all frontend web apps, backend microservices, and databases</p>
          </div>

          <div className="hosting-search-wrap">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              className="input search-input"
              placeholder="Search services, slugs, ports..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Tab Filters */}
        <div className="hosting-tabs-row">
          <button
            className={`hosting-tab-btn ${activeTab === "all" ? "hosting-tab-active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            <span>All Services</span>
            <span className="tab-badge">{allHostingItems.length}</span>
          </button>

          <button
            className={`hosting-tab-btn ${activeTab === "frontend" ? "hosting-tab-active" : ""}`}
            onClick={() => setActiveTab("frontend")}
          >
            <Globe size={13} />
            <span>Frontend Apps</span>
            <span className="tab-badge">{stats?.allDeployments?.length || 0}</span>
          </button>

          <button
            className={`hosting-tab-btn ${activeTab === "backend" ? "hosting-tab-active" : ""}`}
            onClick={() => setActiveTab("backend")}
          >
            <Zap size={13} color="#38bdf8" />
            <span>Backend Services</span>
            <span className="tab-badge">{backendCount}</span>
          </button>

          <button
            className={`hosting-tab-btn ${activeTab === "database" ? "hosting-tab-active" : ""}`}
            onClick={() => setActiveTab("database")}
          >
            <Database size={13} color="#ec4899" />
            <span>Databases</span>
            <span className="tab-badge">{databaseCount}</span>
          </button>

          <button
            className={`hosting-tab-btn ${activeTab === "containers" ? "hosting-tab-active" : ""}`}
            onClick={() => setActiveTab("containers")}
          >
            <Layers size={13} color="#10b981" />
            <span>Host Containers</span>
            <span className="tab-badge">{rawContainers.length}</span>
          </button>
        </div>

        {/* Tab Content: Standard Hosting Items */}
        {activeTab !== "containers" ? (
          filteredHosting.length === 0 ? (
            <div className="empty-state-box">
              <Server size={32} style={{ opacity: 0.3, marginBottom: "0.5rem" }} />
              <p>No hosting records found matching current filter.</p>
            </div>
          ) : (
            <div className="hosting-table">
              {filteredHosting.map(item => {
                const isFrontend = item.category === "frontend";
                const isBackend  = item.category === "backend";
                const isDatabase = item.category === "database";

                return (
                  <div key={`${item.category}-${item.id}`} className="hosting-row">
                    <div className="hosting-row-left">
                      <div className="service-icon-box">
                        {isFrontend && <Globe size={18} className="text-accent" />}
                        {isBackend && <Zap size={18} style={{ color: "#38bdf8" }} />}
                        {isDatabase && <Database size={18} style={{ color: "#ec4899" }} />}
                      </div>

                      <div className="service-info-wrap">
                        <div className="service-title-row">
                          <Link href={item.detailHref} className="service-title-link">
                            {item.name}
                          </Link>

                          <span className={`category-tag cat-${item.category}`}>
                            {item.badgeLabel}
                          </span>

                          <span className="subtype-tag mono">
                            {item.subType}
                          </span>

                          <StatusBadge status={item.status} />
                        </div>

                        <div className="service-meta-row mono">
                          <span className="meta-item">id: {item.id.slice(0, 8)}</span>
                          <span className="meta-sep">•</span>
                          {item.slug && (
                            <>
                              <span className="meta-item">dns: {item.slug}</span>
                              <span className="meta-sep">•</span>
                            </>
                          )}
                          {item.port && (
                            <>
                              <span className="meta-item">port: {item.port}</span>
                              <span className="meta-sep">•</span>
                            </>
                          )}
                          <span className="meta-item" style={{ color: "var(--foreground)" }}>{item.quota}</span>
                          {item.url && (
                            <>
                              <span className="meta-sep">•</span>
                              <a href={item.url} target="_blank" rel="noreferrer" className="service-ext-link">
                                {item.url.replace(/^https?:\/\//, "")} <ExternalLink size={10} />
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="hosting-row-actions">
                      <Link href={item.detailHref} className="btn btn-secondary btn-sm">
                        View
                      </Link>

                      {isFrontend && item.status === "READY" && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleStopDeployment(item.id)}
                          disabled={actionInProgress === item.id}
                        >
                          <PowerOff size={12} /> Pause
                        </button>
                      )}

                      {isFrontend && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteDeployment(item.id)}
                          disabled={actionInProgress === item.id}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}

                      {isBackend && (
                        <>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleStopBackend(item.id)}
                            disabled={actionInProgress === item.id}
                          >
                            <PowerOff size={12} /> Pause
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteBackend(item.id)}
                            disabled={actionInProgress === item.id}
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}

                      {isDatabase && (
                        <>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleStopDatabase(item.id)}
                            disabled={actionInProgress === item.id}
                          >
                            <PowerOff size={12} /> Stop
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteDatabase(item.id)}
                            disabled={actionInProgress === item.id}
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Tab Content: Raw Host Docker Containers */
          filteredContainers.length === 0 ? (
            <div className="empty-state-box">
              <Layers size={32} style={{ opacity: 0.3, marginBottom: "0.5rem" }} />
              <p>No active Docker containers discovered on host daemon.</p>
            </div>
          ) : (
            <div className="hosting-table">
              {filteredContainers.map(c => (
                <div key={c.id} className="hosting-row">
                  <div className="hosting-row-left">
                    <div className="service-icon-box" style={{ background: "rgba(16, 185, 129, 0.1)" }}>
                      <Layers size={18} color="#10b981" />
                    </div>

                    <div className="service-info-wrap">
                      <div className="service-title-row">
                        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                          {c.name.replace(/^\//, "")}
                        </span>

                        <span className="category-tag mono" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
                          {c.state.toUpperCase()}
                        </span>

                        <span className="subtype-tag mono">
                          {c.image.slice(0, 32)}
                        </span>
                      </div>

                      <div className="service-meta-row mono">
                        <span>id: {c.id.slice(0, 12)}</span>
                        <span>•</span>
                        <span>status: {c.status}</span>
                        {c.memUsageMB !== undefined && (
                          <>
                            <span>•</span>
                            <span>mem: {c.memUsageMB}MB</span>
                          </>
                        )}
                        {c.ports?.length > 0 && (
                          <>
                            <span>•</span>
                            <span>ports: {c.ports.join(", ")}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="hosting-row-actions">
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleKillContainer(c.id)}
                      disabled={actionInProgress === c.id}
                      title="Force kill container"
                    >
                      <Trash2 size={12} /> Kill
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <style jsx>{`
        .admin-container {
          max-width: 1300px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        /* ─── Telemetry Banner ─── */
        .worker-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 1.6rem;
          border-radius: var(--radius-lg);
          border: 1px solid var(--card-border);
          gap: 1.5rem;
          flex-wrap: wrap;
          backdrop-filter: blur(12px);
        }
        .banner-online {
          background: rgba(16, 185, 129, 0.05);
          border-left: 4px solid #10b981;
        }
        .banner-offline {
          background: rgba(244, 63, 94, 0.05);
          border-left: 4px solid #f43f5e;
        }
        .banner-left {
          display: flex;
          align-items: center;
          gap: 1.1rem;
        }
        .status-orb-box {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .banner-title {
          font-weight: 750;
          font-size: 1.05rem;
          color: var(--foreground);
          letter-spacing: -0.01em;
        }
        .banner-sub {
          color: var(--muted);
          font-size: 0.78rem;
          margin-top: 0.25rem;
          line-height: 1.4;
        }
        .status-pill {
          font-size: 0.68rem;
          font-weight: 750;
          padding: 0.15rem 0.5rem;
          border-radius: 9999px;
          letter-spacing: 0.03em;
        }
        .pill-green {
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .pill-red {
          background: rgba(244, 63, 94, 0.15);
          color: #f43f5e;
          border: 1px solid rgba(244, 63, 94, 0.3);
        }
        .host-ip-pill {
          font-size: 0.72rem;
          padding: 0.12rem 0.5rem;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: 6px;
          color: var(--foreground);
        }
        .banner-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        /* ─── Stats Grid ─── */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
        }
        .stat-card {
          background: var(--card);
          border: 1px solid var(--card-border);
          border-radius: var(--radius);
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          transition: transform 0.18s ease, border-color 0.18s ease;
        }
        .stat-card:hover {
          transform: translateY(-2px);
          border-color: var(--muted-fg);
        }
        .stat-label {
          font-size: 0.8rem;
          font-weight: 650;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 0.45rem;
        }
        .stat-value {
          font-size: 1.85rem;
          font-weight: 800;
          color: var(--foreground);
          letter-spacing: -0.02em;
        }
        .stat-sub {
          font-size: 0.72rem;
          color: var(--muted);
        }

        /* ─── Gauges Grid ─── */
        .vm-gauges-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 1rem;
        }
        .gauge-card {
          padding: 1.15rem 1.35rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .gauge-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .gauge-percent {
          font-weight: 750;
          font-size: 0.88rem;
          color: var(--foreground);
        }
        .gauge-footer {
          font-size: 0.72rem;
          color: var(--muted);
        }

        /* ─── Hosting Section ─── */
        .hosting-section-card {
          padding: 0;
          overflow: hidden;
        }
        .hosting-section-header {
          padding: 1.4rem 1.6rem;
          border-bottom: 1px solid var(--card-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.25rem;
          flex-wrap: wrap;
        }
        .section-title {
          font-size: 1.1rem;
          font-weight: 750;
          color: var(--foreground);
          letter-spacing: -0.01em;
        }
        .section-sub {
          font-size: 0.76rem;
          color: var(--muted);
          margin-top: 0.15rem;
        }
        .hosting-search-wrap {
          position: relative;
          width: 300px;
          max-width: 100%;
        }
        .search-icon {
          position: absolute;
          left: 0.8rem;
          top: 50%;
          transform: translateY(-50%);
          color: var(--muted);
        }
        .search-input {
          padding-left: 2.3rem;
          font-size: 0.82rem;
          width: 100%;
        }

        /* ─── Tabs ─── */
        .hosting-tabs-row {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.75rem 1.6rem;
          border-bottom: 1px solid var(--card-border);
          background: rgba(255, 255, 255, 0.015);
          overflow-x: auto;
        }
        .hosting-tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.42rem 0.8rem;
          border-radius: 8px;
          font-size: 0.78rem;
          font-weight: 650;
          background: transparent;
          border: 1px solid transparent;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .hosting-tab-btn:hover {
          color: var(--foreground);
          background: var(--bg-inset);
        }
        .hosting-tab-active {
          background: var(--card) !important;
          color: var(--foreground) !important;
          border-color: var(--card-border) !important;
          box-shadow: 0 1px 4px rgba(0,0,0,0.15);
        }
        .tab-badge {
          font-size: 0.68rem;
          padding: 0.05rem 0.4rem;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.08);
          color: var(--foreground);
        }

        /* ─── Table & Rows ─── */
        .hosting-table {
          display: flex;
          flex-direction: column;
        }
        .hosting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.95rem 1.6rem;
          border-bottom: 1px solid var(--card-border);
          gap: 1.25rem;
          transition: background 0.15s ease;
        }
        .hosting-row:last-child {
          border-bottom: none;
        }
        .hosting-row:hover {
          background: rgba(255, 255, 255, 0.02);
        }
        .hosting-row-left {
          display: flex;
          align-items: center;
          gap: 1rem;
          min-width: 0;
          flex: 1;
        }
        .service-icon-box {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .service-info-wrap {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          min-width: 0;
        }
        .service-title-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
        }
        .service-title-link {
          font-weight: 750;
          font-size: 0.95rem;
          color: var(--foreground);
          text-decoration: none;
        }
        .service-title-link:hover {
          color: var(--accent);
          text-decoration: underline;
        }
        .category-tag {
          font-size: 0.68rem;
          font-weight: 700;
          padding: 0.12rem 0.45rem;
          border-radius: 6px;
        }
        .cat-frontend {
          background: rgba(99, 102, 241, 0.12);
          color: var(--accent);
          border: 1px solid rgba(99, 102, 241, 0.25);
        }
        .cat-backend {
          background: rgba(56, 189, 248, 0.12);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.25);
        }
        .cat-database {
          background: rgba(236, 72, 153, 0.12);
          color: #ec4899;
          border: 1px solid rgba(236, 72, 153, 0.25);
        }
        .subtype-tag {
          font-size: 0.68rem;
          padding: 0.1rem 0.4rem;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: 4px;
          color: var(--muted);
        }
        .service-meta-row {
          font-size: 0.72rem;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-wrap: wrap;
        }
        .meta-sep {
          opacity: 0.4;
        }
        .service-ext-link {
          color: var(--accent);
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          text-decoration: none;
        }
        .service-ext-link:hover {
          text-decoration: underline;
        }
        .hosting-row-actions {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          flex-shrink: 0;
        }
        .empty-state-box {
          padding: 3.5rem 1.5rem;
          text-align: center;
          color: var(--muted);
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        /* ─── Responsive ─── */
        @media (max-width: 1024px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 640px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
          .hosting-row {
            flex-direction: column;
            align-items: flex-start;
          }
          .hosting-row-actions {
            width: 100%;
            justify-content: flex-end;
          }
        }
      `}</style>
    </div>
  );
}
