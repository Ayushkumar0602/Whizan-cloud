"use client";

import { useState, useEffect } from "react";
import {
  Trash2,
  RotateCcw,
  Clock,
  AlertTriangle,
  RefreshCw,
  HardDrive,
  File as FileIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  storageApi,
  type StorageBucketItem,
  type StorageObjectItem,
} from "@/lib/api";

interface StorageTrashBinProps {
  buckets: StorageBucketItem[];
  selectedBucket: StorageBucketItem | null;
  onObjectRestored: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1000;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function StorageTrashBin({
  buckets,
  selectedBucket,
  onObjectRestored,
}: StorageTrashBinProps) {
  const [activeBucketId, setActiveBucketId] = useState<string>(
    selectedBucket?.id || buckets[0]?.id || ""
  );
  const [trashObjects, setTrashObjects] = useState<StorageObjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [purging, setPurging] = useState(false);
  const [restoringPath, setRestoringPath] = useState<string | null>(null);

  const activeBucket = buckets.find((b) => b.id === activeBucketId) || selectedBucket;

  const loadTrash = async (bucketId: string) => {
    if (!bucketId) return;
    setLoading(true);
    try {
      const data = await storageApi.listTrash(bucketId);
      setTrashObjects(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load trash bin");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBucket?.id && selectedBucket.id !== activeBucketId) {
      setActiveBucketId(selectedBucket.id);
    }
  }, [selectedBucket?.id]);

  useEffect(() => {
    if (activeBucketId) {
      loadTrash(activeBucketId);
    }
  }, [activeBucketId]);

  const handleRestore = async (path: string) => {
    if (!activeBucketId) return;
    setRestoringPath(path);
    try {
      await storageApi.restoreFromTrash(activeBucketId, path);
      toast.success(`Restored '${path}' successfully.`);
      setTrashObjects((prev) => prev.filter((o) => o.name !== path));
      onObjectRestored();
    } catch (err: any) {
      toast.error(err.message || "Failed to restore object");
    } finally {
      setRestoringPath(null);
    }
  };

  const handlePurge = async () => {
    if (!activeBucketId) return;
    const days = activeBucket?.trashRetentionDays ?? 30;
    if (
      !confirm(
        `Permanently purge all deleted objects older than ${days} days from bucket '${activeBucket?.name}'? This action cannot be undone.`
      )
    ) {
      return;
    }

    setPurging(true);
    try {
      const res = await storageApi.purgeTrash(activeBucketId, days);
      toast.success(`Purged ${res.purgedCount} expired object(s) permanently.`);
      await loadTrash(activeBucketId);
      onObjectRestored();
    } catch (err: any) {
      toast.error(err.message || "Failed to purge trash");
    } finally {
      setPurging(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Top Header Card */}
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
          <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 600 }}>
            Trash Bin Target Bucket
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
            <select
              value={activeBucketId}
              onChange={(e) => setActiveBucketId(e.target.value)}
              style={{
                padding: "0.4rem 0.75rem",
                borderRadius: "0.375rem",
                border: "1px solid var(--border)",
                background: "var(--bg-inset)",
                fontWeight: 600,
                fontSize: "0.9rem",
              }}
            >
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.isPublic ? "Public" : "Private"})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => loadTrash(activeBucketId)}
            className="btn btn-secondary"
            style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handlePurge}
            disabled={purging || trashObjects.length === 0}
            className="btn btn-secondary"
            style={{
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              color: "var(--danger)",
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {purging ? "Purging..." : "Purge Expired Trash"}
          </button>
        </div>
      </div>

      {/* Retention Policy Banner */}
      <div
        style={{
          padding: "1rem 1.25rem",
          borderRadius: "0.5rem",
          background: "rgba(79, 70, 229, 0.05)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          fontSize: "0.85rem",
        }}
      >
        <Clock className="w-5 h-5 text-indigo-400 flex-shrink-0" />
        <div>
          <span style={{ fontWeight: 600 }}>Soft-Delete Safety Net Active: </span>
          <span style={{ color: "var(--muted)" }}>
            Objects deleted from this bucket remain soft-deleted for {activeBucket?.trashRetentionDays ?? 30} days. During this window, files can be restored instantly without data loss.
          </span>
        </div>
      </div>

      {/* Trash Items Table */}
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
          <h3 style={{ fontSize: "1.05rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <Trash2 className="w-4 h-4 text-slate-400" />
            Deleted Objects in Trash ({trashObjects.length})
          </h3>
        </div>

        {loading ? (
          <div style={{ padding: "4rem 0", textAlign: "center", color: "var(--muted)" }}>
            Loading trash bin contents...
          </div>
        ) : trashObjects.length === 0 ? (
          <div
            style={{
              padding: "4rem 2rem",
              textAlign: "center",
              border: "1px dashed var(--border)",
              borderRadius: "0.5rem",
              background: "var(--bg-inset)",
            }}
          >
            <Trash2 className="w-8 h-8 text-slate-400" style={{ margin: "0 auto 0.5rem" }} />
            <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>Trash bin is empty</p>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              No soft-deleted objects found in bucket '{activeBucket?.name}'.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "0.6rem", fontWeight: 600 }}>Object Name</th>
                  <th style={{ padding: "0.6rem", fontWeight: 600 }}>Size</th>
                  <th style={{ padding: "0.6rem", fontWeight: 600 }}>Content-Type</th>
                  <th style={{ padding: "0.6rem", fontWeight: 600 }}>Deleted At</th>
                  <th style={{ padding: "0.6rem", fontWeight: 600, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {trashObjects.map((obj) => (
                  <tr key={obj.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "0.6rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <FileIcon className="w-4 h-4 text-slate-400" />
                        <span style={{ fontWeight: 500, fontFamily: "monospace" }}>{obj.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "0.6rem", color: "var(--muted)" }}>{formatBytes(obj.size)}</td>
                    <td style={{ padding: "0.6rem", color: "var(--muted)" }}>{obj.mimeType}</td>
                    <td style={{ padding: "0.6rem", color: "var(--muted)" }}>
                      {obj.deletedAt ? new Date(obj.deletedAt).toLocaleString() : "Recently"}
                    </td>
                    <td style={{ padding: "0.6rem", textAlign: "right" }}>
                      <button
                        onClick={() => handleRestore(obj.name)}
                        disabled={restoringPath === obj.name}
                        className="btn btn-secondary"
                        style={{
                          fontSize: "0.75rem",
                          padding: "0.25rem 0.6rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          color: "var(--success)",
                        }}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {restoringPath === obj.name ? "Restoring..." : "Restore"}
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
