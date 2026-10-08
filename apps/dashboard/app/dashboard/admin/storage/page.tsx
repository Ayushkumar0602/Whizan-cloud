"use client";

import { useState } from "react";
import Link from "next/link";
import { admin } from "@/lib/api";
import {
  HardDrive,
  Trash2,
  RefreshCw,
  Folder,
  Layers,
  Sparkles,
  AlertTriangle,
  Database,
  GitBranch,
  Terminal,
  Server,
  Box,
  RotateCcw,
  ExternalLink
} from "lucide-react";
import { useAdminStats } from "../../../../hooks/useAdminStats";
import { toast } from "sonner";

export default function StoragePage() {
  const { stats, loading, fetchStats } = useAdminStats();
  const [pruning, setPruning] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");

  const handleFileDelete = async (path: string) => {
    if (!confirm(`Permanently delete ${path}? This cannot be undone.`)) return;
    try {
      await admin.deleteFile(path);
      toast.success("File deleted from host");
      fetchStats();
    } catch {
      toast.error("Failed to delete file");
    }
  };

  const handleDockerPrune = async () => {
    if (!confirm("Prune all unused Docker images, dangling layers, and build cache? Active containers and running databases will NOT be affected.")) return;
    setPruning(true);
    try {
      await admin.pruneDocker();
      toast.success("Docker prune command dispatched. Cache is being cleared.");
      setTimeout(() => {
        fetchStats();
        setPruning(false);
      }, 3000);
    } catch {
      toast.error("Failed to run Docker prune");
      setPruning(false);
    }
  };

  const handleClearCache = async () => {
    if (!confirm("Clear global NPM and compiler build cache (/opt/whizan-cache)? This can safely reclaim gigabytes of disk space without affecting running services.")) return;
    setClearingCache(true);
    try {
      await admin.clearBuildCache();
      toast.success("Build cache cleared from host");
      setTimeout(() => {
        fetchStats();
        setClearingCache(false);
      }, 2500);
    } catch {
      toast.error("Failed to clear build cache");
      setClearingCache(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Inspecting VM disk & storage...</span>
      </div>
    );
  }

  const vm = stats?.vmStats;
  const disk = vm?.disk;
  const dockerSys = vm?.dockerSystem;

  const files = vm?.files || [];
  const cacheTotalMB = files
    .filter((f) => f.type === "build-cache")
    .reduce((acc, f) => acc + (f.sizeMB || 0), 0);

  const filteredFiles = files.filter((f) => {
    if (filterType === "all") return true;
    if (filterType === "cache") return f.type === "build-cache";
    if (filterType === "databases") return f.type === "database-volume";
    if (filterType === "repos") return f.type === "git-repo";
    if (filterType === "frontend") return f.type === "frontend-build";
    if (filterType === "backend") return f.type === "backend-service";
    if (filterType === "logs") return f.type === "system-log" || f.type === "log";
    return true;
  });

  const diskUsagePercent = disk?.usagePercent || 0;
  const isHighDisk = diskUsagePercent >= 75;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* ─── Top Telemetry Cards ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
        {/* Card 1: Root OS Disk */}
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <HardDrive size={16} className={isHighDisk ? "text-danger" : "text-accent"} />
              <span style={{ fontWeight: 650, fontSize: "0.85rem" }}>Cloud Host Root Partition (/)</span>
            </div>
            {isHighDisk && (
              <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.3)" }}>
                <AlertTriangle size={11} style={{ marginRight: 3 }} /> Warning High
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.6rem" }}>
            <span style={{ fontSize: "1.65rem", fontWeight: 700, letterSpacing: "-0.03em" }}>
              {disk ? `${(disk.usedMB / 1024).toFixed(1)} GB` : "..."}
            </span>
            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
              of {disk ? `${(disk.totalMB / 1024).toFixed(1)} GB` : "..."} ({diskUsagePercent}%)
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 99, overflow: "hidden", marginBottom: "0.6rem" }}>
            <div
              style={{
                width: `${Math.min(diskUsagePercent, 100)}%`,
                height: "100%",
                background: isHighDisk ? "#ef4444" : diskUsagePercent > 50 ? "#f59e0b" : "#3b82f6",
                transition: "width 0.4s ease",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--muted)" }}>
            <span>Free: {disk ? `${(disk.freeMB / 1024).toFixed(1)} GB` : "..."}</span>
            <span>Swap: ~4.1 GB reserved</span>
          </div>
        </div>

        {/* Card 2: Docker Footprint */}
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Box size={16} style={{ color: "#38bdf8" }} />
              <span style={{ fontWeight: 650, fontSize: "0.85rem" }}>Docker Daemon Footprint</span>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleDockerPrune}
              disabled={pruning}
              style={{ fontSize: "0.72rem", padding: "0.2rem 0.6rem", height: 26 }}
            >
              <Sparkles size={11} /> {pruning ? "Pruning..." : "Prune Images"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.6rem" }}>
            <span style={{ fontSize: "1.65rem", fontWeight: 700, letterSpacing: "-0.03em" }}>
              {dockerSys && dockerSys.totalMB > 0
                ? `${(dockerSys.totalMB / 1024).toFixed(2)} GB`
                : dockerSys && dockerSys.totalMB === 0
                ? "0.00 GB"
                : "Awaiting Host..."}
            </span>
            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
              Engine Images &amp; Layers
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", fontSize: "0.74rem" }}>
            <div style={{ background: "var(--bg-inset)", padding: "0.35rem 0.55rem", borderRadius: 6 }}>
              <span style={{ color: "var(--muted)" }}>Images: </span>
              <span className="mono" style={{ fontWeight: 600 }}>
                {dockerSys ? `${(dockerSys.imagesSizeMB / 1024).toFixed(2)} GB` : "0 GB"}
              </span>
            </div>
            <div style={{ background: "var(--bg-inset)", padding: "0.35rem 0.55rem", borderRadius: 6 }}>
              <span style={{ color: "var(--muted)" }}>BuildKit: </span>
              <span className="mono" style={{ fontWeight: 600 }}>
                {dockerSys ? `${dockerSys.buildCacheSizeMB} MB` : "0 MB"}
              </span>
            </div>
            <div style={{ background: "var(--bg-inset)", padding: "0.35rem 0.55rem", borderRadius: 6 }}>
              <span style={{ color: "var(--muted)" }}>Containers: </span>
              <span className="mono" style={{ fontWeight: 600 }}>
                {dockerSys ? `${dockerSys.containersSizeMB} MB` : "0 MB"}
              </span>
            </div>
            <div style={{ background: "var(--bg-inset)", padding: "0.35rem 0.55rem", borderRadius: 6 }}>
              <span style={{ color: "var(--muted)" }}>Volumes: </span>
              <span className="mono" style={{ fontWeight: 600 }}>
                {dockerSys ? `${dockerSys.volumesSizeMB} MB` : "0 MB"}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Build & Package Cache */}
        <div className="card" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Sparkles size={16} style={{ color: "#eab308" }} />
              <span style={{ fontWeight: 650, fontSize: "0.85rem" }}>NPM &amp; Compiler Cache</span>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleClearCache}
              disabled={clearingCache}
              style={{ fontSize: "0.72rem", padding: "0.2rem 0.6rem", height: 26 }}
            >
              <RotateCcw size={11} /> {clearingCache ? "Clearing..." : "Clear Cache"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.6rem" }}>
            <span style={{ fontSize: "1.65rem", fontWeight: 700, letterSpacing: "-0.03em" }}>
              {cacheTotalMB >= 1024
                ? `${(cacheTotalMB / 1024).toFixed(2)} GB`
                : `${cacheTotalMB} MB`}
            </span>
            <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
              /opt/whizan-cache
            </span>
          </div>

          <p style={{ fontSize: "0.74rem", color: "var(--muted)", margin: 0, lineHeight: 1.4 }}>
            Speed-up cache for Next.js builds &amp; NPM tarballs. Safe to wipe at any time to free up multiple gigabytes.
          </p>
        </div>
      </div>

      {/* ─── Scanned Items Table ────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="storage-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <Folder size={18} className="text-accent" />
            <h2 className="card-title" style={{ fontSize: "1.02rem" }}>Host Workspaces, Volumes &amp; Repositories</h2>
            <span className="storage-count-pill mono">
              {filteredFiles.length} items
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div className="tab-pills" style={{ display: "flex", gap: "0.25rem", background: "var(--bg-inset)", padding: "0.2rem", borderRadius: 8 }}>
              {[
                { id: "all", label: "All" },
                { id: "cache", label: "Build Cache" },
                { id: "databases", label: "DB Volumes" },
                { id: "repos", label: "Git Repos" },
                { id: "frontend", label: "Frontend" },
                { id: "backend", label: "Backend" },
                { id: "logs", label: "Logs" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterType(tab.id)}
                  style={{
                    background: filterType === tab.id ? "rgba(255,255,255,0.08)" : "transparent",
                    color: filterType === tab.id ? "var(--foreground)" : "var(--muted)",
                    border: "none",
                    padding: "0.25rem 0.65rem",
                    borderRadius: 6,
                    fontSize: "0.72rem",
                    fontWeight: filterType === tab.id ? 650 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button className="btn btn-secondary btn-sm" onClick={fetchStats}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        {filteredFiles.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
            No storage items matched the selected category.
          </div>
        ) : (
          <div className="table-responsive-wrap">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Path &amp; Description</th>
                  <th>Classification</th>
                  <th>Size</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file, i) => {
                  let badgeBg = "rgba(168, 85, 247, 0.1)";
                  let badgeColor = "#c084fc";
                  let badgeBorder = "rgba(168, 85, 247, 0.25)";
                  let icon = <Folder size={14} className="text-muted" />;

                  if (file.type === "frontend-build") {
                    badgeBg = "rgba(56, 189, 248, 0.1)";
                    badgeColor = "#38bdf8";
                    badgeBorder = "rgba(56, 189, 248, 0.25)";
                    icon = <Layers size={14} style={{ color: "#38bdf8" }} />;
                  } else if (file.type === "backend-service") {
                    badgeBg = "rgba(16, 185, 129, 0.1)";
                    badgeColor = "#10b981";
                    badgeBorder = "rgba(16, 185, 129, 0.25)";
                    icon = <Server size={14} style={{ color: "#10b981" }} />;
                  } else if (file.type === "build-cache") {
                    badgeBg = "rgba(234, 179, 8, 0.15)";
                    badgeColor = "#eab308";
                    badgeBorder = "rgba(234, 179, 8, 0.3)";
                    icon = <Sparkles size={14} style={{ color: "#eab308" }} />;
                  } else if (file.type === "database-volume") {
                    badgeBg = "rgba(168, 85, 247, 0.15)";
                    badgeColor = "#c084fc";
                    badgeBorder = "rgba(168, 85, 247, 0.3)";
                    icon = <Database size={14} style={{ color: "#c084fc" }} />;
                  } else if (file.type === "git-repo") {
                    badgeBg = "rgba(14, 165, 233, 0.15)";
                    badgeColor = "#38bdf8";
                    badgeBorder = "rgba(14, 165, 233, 0.3)";
                    icon = <GitBranch size={14} style={{ color: "#38bdf8" }} />;
                  } else if (file.type === "system-log" || file.type === "log") {
                    badgeBg = "rgba(245, 158, 11, 0.1)";
                    badgeColor = "#f59e0b";
                    badgeBorder = "rgba(245, 158, 11, 0.25)";
                    icon = <Terminal size={14} style={{ color: "#f59e0b" }} />;
                  }

                  return (
                    <tr key={i}>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                            {icon}
                            <span className="mono" style={{ color: "var(--foreground)", fontSize: "0.8rem", fontWeight: 600 }}>
                              {(file as any).displayName || file.path}
                            </span>
                          </div>
                          {file.entityLink && file.entityName ? (
                            <Link
                              href={file.entityLink}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.3rem",
                                fontSize: "0.72rem",
                                color: "var(--accent)",
                                textDecoration: "none",
                                marginLeft: "1.45rem",
                                fontWeight: 550,
                              }}
                            >
                              <span>{file.entityType === "database" ? "🗄️" : file.entityType === "service" ? "⚙️" : "🌐"} {file.entityName}</span>
                              <ExternalLink size={10} />
                            </Link>
                          ) : (
                            <span className="mono" style={{ fontSize: "0.7rem", color: "var(--muted)", marginLeft: "1.45rem" }}>
                              {file.path}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: badgeBg,
                            color: badgeColor,
                            borderColor: badgeBorder,
                            textTransform: "capitalize",
                          }}
                        >
                          {file.type.replace("-", " ")}
                        </span>
                      </td>
                      <td className="mono" style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                        {file.sizeMB >= 1024
                          ? `${(file.sizeMB / 1024).toFixed(2)} GB`
                          : `${file.sizeMB} MB`}
                      </td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleFileDelete(file.path)}
                          style={{ height: 26, padding: "0 0.55rem", fontSize: "0.72rem" }}
                        >
                          <Trash2 size={11} /> Purge
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .storage-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.35rem;
          border-bottom: 1px solid var(--card-border);
          background: #fafbfc;
          flex-wrap: wrap;
          gap: 0.75rem;
        }
        .storage-count-pill {
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
      `}</style>
    </div>
  );
}
