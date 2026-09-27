"use client";

import { admin } from "@/lib/api";
import { HardDrive, Trash2, RefreshCw, Folder } from "lucide-react";
import { useAdminStats } from "../../../../hooks/useAdminStats";
import { toast } from "sonner";

export default function StoragePage() {
  const { stats, loading, fetchStats } = useAdminStats();

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

  if (loading && !stats) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Inspecting disk storage...</span>
      </div>
    );
  }

  const vm = stats?.vmStats;

  return (
    <>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="storage-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <HardDrive size={18} className="text-accent" />
            <h2 className="card-title" style={{ fontSize: "1.05rem" }}>Build Cache & Workspace Storage</h2>
            {vm?.files && (
              <span className="storage-count-pill mono">
                {vm.files.length} items
              </span>
            )}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={fetchStats}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {!vm || !vm.files || vm.files.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}>
            No build cache or dangling log files found on the host.
          </div>
        ) : (
          <div className="table-responsive-wrap">
            <table className="modern-table">
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Classification</th>
                  <th>Size</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vm.files.map((file, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Folder size={15} className="text-muted" />
                        <span className="mono" style={{ color: "var(--foreground)" }}>
                          {(file as any).displayName || file.path}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: file.type === "frontend-build" ? "rgba(56, 189, 248, 0.1)" : "rgba(16, 185, 129, 0.1)",
                          color: file.type === "frontend-build" ? "#38bdf8" : "#10b981",
                          borderColor: file.type === "frontend-build" ? "rgba(56, 189, 248, 0.25)" : "rgba(16, 185, 129, 0.25)",
                        }}
                      >
                        {file.type}
                      </span>
                    </td>
                    <td className="mono" style={{ fontWeight: 600 }}>{file.sizeMB} MB</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleFileDelete(file.path)}
                      >
                        <Trash2 size={12} /> Purge
                      </button>
                    </td>
                  </tr>
                ))}
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
          padding: 1.15rem 1.35rem;
          border-bottom: 1px solid var(--card-border);
          background: rgba(255, 255, 255, 0.02);
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
    </>
  );
}
