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
            Synchronizes stored byte counts across PostgreSQL and Cloudflare R2, releases stale in-flight reservations (&gt;15 min old), and refreshes Redis rate counters.
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

      {/* Plan Limits & Tier Matrix */}
      <div
        className="card"
        style={{
          padding: "1.5rem",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "0.75rem",
        }}
      >
        <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.4rem" }}>
          Whizan Storage Tier Matrix
        </h3>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
          Current subscription tier: <span style={{ fontWeight: 700, color: "var(--accent)" }}>{usage?.tierDisplayName || "Hobby Tier"}</span>. Limits are enforced automatically by the API gateway.
        </p>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "0.75rem", fontWeight: 700 }}>Feature / Parameter</th>
                <th style={{ padding: "0.75rem", fontWeight: 700, color: "var(--accent)" }}>Hobby (Tier A)</th>
                <th style={{ padding: "0.75rem", fontWeight: 700, color: "var(--success)" }}>Professional (Tier B)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                <td style={{ padding: "0.75rem", fontWeight: 500 }}>Default Quota Isolation</td>
                <td style={{ padding: "0.75rem" }}>250 MB (Strict)</td>
                <td style={{ padding: "0.75rem" }}>250 MB (Expandable)</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                <td style={{ padding: "0.75rem", fontWeight: 500 }}>Max File Size Per Upload</td>
                <td style={{ padding: "0.75rem" }}>25 MB</td>
                <td style={{ padding: "0.75rem" }}>100 MB</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                <td style={{ padding: "0.75rem", fontWeight: 500 }}>Rate Limit (Requests / Min)</td>
                <td style={{ padding: "0.75rem" }}>60 RPM</td>
                <td style={{ padding: "0.75rem" }}>300 RPM</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                <td style={{ padding: "0.75rem", fontWeight: 500 }}>Daily Command Allowance</td>
                <td style={{ padding: "0.75rem" }}>2,000 commands / day</td>
                <td style={{ padding: "0.75rem" }}>50,000 commands / day</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                <td style={{ padding: "0.75rem", fontWeight: 500 }}>Max Concurrent In-Flight Transfers</td>
                <td style={{ padding: "0.75rem" }}>3 Transfers</td>
                <td style={{ padding: "0.75rem" }}>10 Transfers</td>
              </tr>
              <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                <td style={{ padding: "0.75rem", fontWeight: 500 }}>Presigned URL Max Expiry</td>
                <td style={{ padding: "0.75rem" }}>15 Minutes</td>
                <td style={{ padding: "0.75rem" }}>30 Minutes</td>
              </tr>
              <tr>
                <td style={{ padding: "0.75rem", fontWeight: 500 }}>Cloudflare Edge CDN Egress</td>
                <td style={{ padding: "0.75rem", color: "var(--success)" }}>$0.00 / Free</td>
                <td style={{ padding: "0.75rem", color: "var(--success)" }}>$0.00 / Free</td>
              </tr>
            </tbody>
          </table>
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
