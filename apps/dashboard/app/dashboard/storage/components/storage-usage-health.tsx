"use client";

import { useState, useEffect } from "react";
import {
  Activity,
  ShieldCheck,
  Clock,
  HardDrive,
  RefreshCw,
  Zap,
  Layers,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  storageApi,
  type StorageUsageResponse,
  type StorageAuditLogItem,
} from "@/lib/api";

interface StorageUsageHealthProps {
  usage: StorageUsageResponse | null;
  onReconciled: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1000;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function StorageUsageHealth({
  usage,
  onReconciled,
}: StorageUsageHealthProps) {
  const [auditLogs, setAuditLogs] = useState<StorageAuditLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const data = await storageApi.getAuditLogs(50);
      setAuditLogs(data);
    } catch {
      // ignore
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      await storageApi.reconcile();
      toast.success("Storage database records and active reservations reconciled successfully.");
      onReconciled();
      await fetchLogs();
    } catch (err: any) {
      toast.error(err.message || "Failed to reconcile storage");
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Reconcile Action Banner */}
      <div
        className="card"
        style={{
          padding: "1.25rem",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "0.75rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h3 style={{ fontSize: "1.05rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Activity className="w-4 h-4 text-indigo-500" />
            Storage Engine & Quota Reconciliation
          </h3>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.2rem" }}>
            Synchronizes stored byte counts across database records and edge storage, releases stale in-flight reservations (&gt;15 min old), and refreshes rate counters.
          </p>
        </div>

        <button
          onClick={handleReconcile}
          disabled={reconciling}
          className="btn btn-primary"
          style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${reconciling ? "animate-spin" : ""}`} />
          {reconciling ? "Reconciling..." : "Reconcile Quota"}
        </button>
      </div>

      {/* Active Storage Limits & Configuration */}
      <div
        className="card"
        style={{
          padding: "1.5rem",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "0.75rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Active Storage Limits & Configuration
            </h3>
            <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              Operational limits enforced directly at the API gateway and Edge CDN layer.
            </p>
          </div>
          <span
            style={{
              fontSize: "0.75rem",
              padding: "0.25rem 0.6rem",
              borderRadius: "0.375rem",
              background: "rgba(16, 185, 129, 0.1)",
              color: "var(--success)",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
            System Healthy & Enforced
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "0.85rem",
          }}
        >
          <div style={{ padding: "0.85rem 1rem", background: "var(--bg-inset)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>MAX SINGLE FILE SIZE</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "0.3rem" }}>
              {usage ? `${usage.commandLimits.maxFileSizeMb} MB` : "25 MB"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.2rem" }}>Direct presigned upload limit</div>
          </div>

          <div style={{ padding: "0.85rem 1rem", background: "var(--bg-inset)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>API RATE LIMIT</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "0.3rem" }}>
              {usage ? `${usage.commandLimits.rateLimitRpm} RPM` : "60 RPM"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.2rem" }}>Requests per minute per key</div>
          </div>

          <div style={{ padding: "0.85rem 1rem", background: "var(--bg-inset)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>DAILY COMMAND ALLOWANCE</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "0.3rem" }}>
              {usage ? `${usage.commandLimits.dailyCommandsQuota.toLocaleString()} / day` : "2,000 / day"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.2rem" }}>
              {usage ? `${usage.commandLimits.currentDailyCommands} used today` : "0 used today"}
            </div>
          </div>

          <div style={{ padding: "0.85rem 1rem", background: "var(--bg-inset)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>CONCURRENT IN-FLIGHT</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "0.3rem" }}>
              {usage ? `${usage.commandLimits.maxConcurrentUploads} Slots` : "3 Slots"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.2rem" }}>Simultaneous active uploads</div>
          </div>

          <div style={{ padding: "0.85rem 1rem", background: "var(--bg-inset)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>SIGNED URL EXPIRY</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "0.3rem" }}>
              15 Minutes
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.2rem" }}>Maximum temporary token TTL</div>
          </div>

          <div style={{ padding: "0.85rem 1rem", background: "var(--bg-inset)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>GLOBAL EDGE CDN</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: "0.3rem", color: "var(--success)" }}>
              Zero Egress Fee
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.2rem" }}>Included with public buckets</div>
          </div>
        </div>
      </div>

      {/* Security & Audit Trail */}
      <div
        className="card"
        style={{
          padding: "1.25rem",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "0.75rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Clock className="w-4 h-4 text-slate-400" />
            Security & Audit Activity Trail
          </h3>
          <button onClick={fetchLogs} className="btn-secondary" style={{ fontSize: "0.75rem" }}>
            Refresh Logs
          </button>
        </div>

        {loadingLogs ? (
          <div style={{ padding: "3rem 0", textAlign: "center", color: "var(--muted)" }}>
            Loading audit logs...
          </div>
        ) : auditLogs.length === 0 ? (
          <div style={{ padding: "3rem 0", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
            No audit logs recorded yet.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "0.6rem", fontWeight: 600 }}>Timestamp</th>
                  <th style={{ padding: "0.6rem", fontWeight: 600 }}>Action</th>
                  <th style={{ padding: "0.6rem", fontWeight: 600 }}>Bucket</th>
                  <th style={{ padding: "0.6rem", fontWeight: 600 }}>Target Object</th>
                  <th style={{ padding: "0.6rem", fontWeight: 600 }}>Bytes</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "0.6rem", color: "var(--muted)" }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "0.6rem" }}>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          padding: "0.15rem 0.4rem",
                          borderRadius: 4,
                          fontWeight: 700,
                          background: log.action.includes("DELETE")
                            ? "rgba(225, 29, 72, 0.15)"
                            : log.action.includes("UPLOAD")
                            ? "rgba(16, 185, 129, 0.15)"
                            : "rgba(79, 70, 229, 0.15)",
                          color: log.action.includes("DELETE")
                            ? "var(--danger)"
                            : log.action.includes("UPLOAD")
                            ? "var(--success)"
                            : "var(--accent)",
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem" }}>{log.bucketName || "—"}</td>
                    <td style={{ padding: "0.6rem", fontFamily: "monospace", fontSize: "0.8rem" }}>
                      {log.objectName || "—"}
                    </td>
                    <td style={{ padding: "0.6rem", color: "var(--muted)" }}>
                      {log.bytesAffected ? formatBytes(log.bytesAffected) : "—"}
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
