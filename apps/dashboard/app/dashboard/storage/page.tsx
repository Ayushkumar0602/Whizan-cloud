"use client";

import { useEffect, useState } from "react";
import {
  Folder,
  Code2,
  ShieldCheck,
  Trash2,
  Zap,
  Activity,
  Plus,
  RefreshCw,
  HardDrive,
  Globe,
  Layers,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  storageApi,
  type StorageBucketItem,
  type StorageObjectItem,
  type StorageUsageResponse,
} from "@/lib/api";
import { StorageExplorer } from "./components/storage-explorer";
import { StorageDeveloperDocs } from "./components/storage-developer-docs";
import { StoragePolicies } from "./components/storage-policies";
import { StorageTrashBin } from "./components/storage-trash-bin";
import { StorageWebhooks } from "./components/storage-webhooks";
import { StorageUsageHealth } from "./components/storage-usage-health";
import { CreateBucketModal, BucketSettingsModal } from "./components/storage-modals";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1000;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function StorageDashboardPage() {
  const [activeTab, setActiveTab] = useState<
    "EXPLORER" | "DEVELOPER_DOCS" | "POLICIES" | "TRASH_BIN" | "WEBHOOKS" | "USAGE_HEALTH"
  >("EXPLORER");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Global State
  const [usage, setUsage] = useState<StorageUsageResponse | null>(null);
  const [buckets, setBuckets] = useState<StorageBucketItem[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<StorageBucketItem | null>(null);

  // Explorer Objects State
  const [objects, setObjects] = useState<StorageObjectItem[]>([]);
  const [commonPrefixes, setCommonPrefixes] = useState<string[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string>("");
  const [loadingObjects, setLoadingObjects] = useState(false);

  // Modals
  const [createBucketModalOpen, setCreateBucketModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [targetSettingsBucket, setTargetSettingsBucket] = useState<StorageBucketItem | null>(null);

  // Fetch objects for a specific bucket and folder
  const loadObjects = async (bucketId: string, folder = "") => {
    setLoadingObjects(true);
    try {
      const res = await storageApi.listObjects(bucketId, {
        prefix: folder || undefined,
        delimiter: "/",
        limit: 100,
      });
      setObjects(res.objects || []);
      setCommonPrefixes(res.commonPrefixes || []);
    } catch (err: any) {
      toast.error(err.message || "Failed to load bucket objects");
    } finally {
      setLoadingObjects(false);
    }
  };

  // Fetch initial data (usage + buckets)
  const fetchData = async () => {
    try {
      const [usageData, bucketsData] = await Promise.all([
        storageApi.getUsage().catch(() => null),
        storageApi.listBuckets().catch(() => []),
      ]);
      setUsage(usageData);
      setBuckets(bucketsData);

      if (bucketsData.length > 0 && !selectedBucket) {
        setSelectedBucket(bucketsData[0]);
      } else if (selectedBucket) {
        // Keep updated bucket reference
        const updated = bucketsData.find((b) => b.id === selectedBucket.id);
        if (updated) setSelectedBucket(updated);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load storage data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Reload objects when selected bucket or folder changes
  useEffect(() => {
    if (!selectedBucket) {
      setObjects([]);
      setCommonPrefixes([]);
      setCurrentFolder("");
      return;
    }
    loadObjects(selectedBucket.id, currentFolder);
  }, [selectedBucket?.id, currentFolder]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    if (selectedBucket) {
      await loadObjects(selectedBucket.id, currentFolder);
    }
    toast.success("Storage state refreshed");
    setRefreshing(false);
  };

  const handleReconcile = async () => {
    setRefreshing(true);
    try {
      await storageApi.reconcile();
      toast.success("Storage quota and active reservations reconciled successfully.");
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to reconcile storage");
    } finally {
      setRefreshing(false);
    }
  };

  const handleDeleteBucket = async (bucket: StorageBucketItem) => {
    const hasFiles = (bucket._count?.objects || bucket.fileCount || 0) > 0;
    const confirmMsg = hasFiles
      ? `Bucket '${bucket.name}' contains files. Delete bucket and ALL files inside it permanently?`
      : `Delete bucket '${bucket.name}'?`;

    if (!confirm(confirmMsg)) return;

    try {
      await storageApi.deleteBucket(bucket.id, hasFiles);
      toast.success(`Bucket '${bucket.name}' deleted.`);
      const remaining = buckets.filter((b) => b.id !== bucket.id);
      setBuckets(remaining);
      setSelectedBucket(remaining[0] || null);
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete bucket");
    }
  };

  const quotaPercent = usage?.quota.usagePercent || 0;

  return (
    <div className="page" style={{ maxWidth: 1280, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <PageHeader
        title="Cloud Storage"
        subtitle="High-performance, S3-compatible global object storage with edge caching, automated security policies, and granular quota isolation."
        actions={
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="btn btn-secondary"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Sync
            </button>
            <button
              onClick={handleReconcile}
              disabled={refreshing}
              className="btn btn-secondary"
              title="Reconciles database records with stored bytes and auto-releases expired upload reservations"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}
            >
              <Activity className="w-3.5 h-3.5 text-indigo-500" />
              Reconcile
            </button>
            {selectedBucket && (
              <button
                onClick={() => {
                  setTargetSettingsBucket(selectedBucket);
                  setSettingsModalOpen(true);
                }}
                className="btn btn-secondary"
                style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}
              >
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                Bucket Settings
              </button>
            )}
            <button
              onClick={() => setCreateBucketModalOpen(true)}
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}
            >
              <Plus className="w-4 h-4" />
              New Bucket
            </button>
          </div>
        }
      />

      {/* ── Quota & Metrics Overview ────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1rem",
          marginTop: "1.5rem",
          marginBottom: "2rem",
        }}
      >
        {/* Card 1: 250 MB Quota Progress */}
        <div
          className="card"
          style={{
            padding: "1.25rem",
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "0.75rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
            <div>
              <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 600 }}>
                Storage Allocation
              </span>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem" }}>
                {usage ? `${usage.quota.usedMb} MB` : "—"}
                <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--muted)", marginLeft: "0.35rem" }}>
                  / {usage ? `${usage.quota.allocatedMb} MB` : "250 MB"}
                </span>
              </div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "var(--accent-glow)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <HardDrive className="w-5 h-5 text-indigo-500" />
            </div>
          </div>

          <div>
            <div
              style={{
                width: "100%",
                height: 8,
                background: "var(--border-light)",
                borderRadius: 4,
                overflow: "hidden",
                margin: "0.5rem 0",
              }}
            >
              <div
                style={{
                  width: `${Math.min(quotaPercent, 100)}%`,
                  height: "100%",
                  background:
                    quotaPercent > 90
                      ? "var(--danger)"
                      : quotaPercent > 75
                      ? "var(--warning)"
                      : "var(--accent-gradient)",
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--muted)" }}>
              <span>{quotaPercent}% used</span>
              <span>{usage ? `${usage.quota.availableMb} MB available` : "—"}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Tier & Request Limits */}
        <div
          className="card"
          style={{
            padding: "1.25rem",
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "0.75rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 600 }}>
                Entitlement Tier
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                <span style={{ fontSize: "1.35rem", fontWeight: 700 }}>{usage?.tierDisplayName || "Hobby Plan"}</span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "9999px",
                    fontWeight: 600,
                    background: usage?.tier === "PROFESSIONAL" ? "rgba(16, 185, 129, 0.15)" : "rgba(79, 70, 229, 0.15)",
                    color: usage?.tier === "PROFESSIONAL" ? "var(--success)" : "var(--accent)",
                  }}
                >
                  {usage?.tier || "HOBBY"}
                </span>
              </div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "rgba(5, 150, 105, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
            </div>
          </div>

          <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Rate Limit:</span>
              <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{usage?.commandLimits.rateLimitRpm || 60} req/min</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Daily Commands:</span>
              <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
                {usage?.commandLimits.currentDailyCommands || 0} / {(usage?.commandLimits.dailyCommandsQuota || 2000).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Storage Objects & Buckets */}
        <div
          className="card"
          style={{
            padding: "1.25rem",
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "0.75rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 600 }}>
                Inventory
              </span>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem" }}>
                {usage?.quota.objectsCount || 0}
                <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--muted)", marginLeft: "0.35rem" }}>
                  Objects in {buckets.length} Buckets
                </span>
              </div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "rgba(2, 132, 199, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Layers className="w-5 h-5 text-sky-500" />
            </div>
          </div>

          <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Max Single File:</span>
              <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{usage ? `${usage.commandLimits.maxFileSizeMb} MB` : "25 MB"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>In-Flight Reserved:</span>
              <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{usage ? formatBytes(usage.quota.reservedBytes) : "0 B"}</span>
            </div>
          </div>
        </div>

        {/* Card 4: Global Edge Infrastructure */}
        <div
          className="card"
          style={{
            padding: "1.25rem",
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "0.75rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 600 }}>
                Edge Infrastructure
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.25rem" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                <span style={{ fontSize: "1.2rem", fontWeight: 700 }}>Global Edge CDN</span>
              </div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "rgba(16, 185, 129, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Globe className="w-5 h-5 text-emerald-500" />
            </div>
          </div>

          <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Egress Fees:</span>
              <span style={{ fontWeight: 600, color: "var(--success)" }}>Zero Egress Fees</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Encryption:</span>
              <span style={{ fontWeight: 600, color: "var(--foreground)" }}>AES-256 at Rest</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          marginBottom: "1.5rem",
          gap: "1.5rem",
          overflowX: "auto",
        }}
      >
        <button
          onClick={() => setActiveTab("EXPLORER")}
          style={{
            padding: "0.75rem 0.25rem",
            borderBottom: activeTab === "EXPLORER" ? "2px solid var(--accent)" : "2px solid transparent",
            color: activeTab === "EXPLORER" ? "var(--foreground)" : "var(--muted)",
            fontWeight: activeTab === "EXPLORER" ? 600 : 500,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
            fontSize: "0.9rem",
            whiteSpace: "nowrap",
          }}
        >
          <Folder className="w-4 h-4 text-indigo-400" />
          Explorer
        </button>

        <button
          onClick={() => setActiveTab("DEVELOPER_DOCS")}
          style={{
            padding: "0.75rem 0.25rem",
            borderBottom: activeTab === "DEVELOPER_DOCS" ? "2px solid var(--accent)" : "2px solid transparent",
            color: activeTab === "DEVELOPER_DOCS" ? "var(--foreground)" : "var(--muted)",
            fontWeight: activeTab === "DEVELOPER_DOCS" ? 600 : 500,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
            fontSize: "0.9rem",
            whiteSpace: "nowrap",
          }}
        >
          <Code2 className="w-4 h-4 text-sky-400" />
          Developer Guide & SDK
        </button>

        <button
          onClick={() => setActiveTab("POLICIES")}
          style={{
            padding: "0.75rem 0.25rem",
            borderBottom: activeTab === "POLICIES" ? "2px solid var(--accent)" : "2px solid transparent",
            color: activeTab === "POLICIES" ? "var(--foreground)" : "var(--muted)",
            fontWeight: activeTab === "POLICIES" ? 600 : 500,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
            fontSize: "0.9rem",
            whiteSpace: "nowrap",
          }}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Access Control & Policies (RLS)
        </button>

        <button
          onClick={() => setActiveTab("TRASH_BIN")}
          style={{
            padding: "0.75rem 0.25rem",
            borderBottom: activeTab === "TRASH_BIN" ? "2px solid var(--accent)" : "2px solid transparent",
            color: activeTab === "TRASH_BIN" ? "var(--foreground)" : "var(--muted)",
            fontWeight: activeTab === "TRASH_BIN" ? 600 : 500,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
            fontSize: "0.9rem",
            whiteSpace: "nowrap",
          }}
        >
          <Trash2 className="w-4 h-4 text-rose-400" />
          Trash Bin
        </button>

        <button
          onClick={() => setActiveTab("WEBHOOKS")}
          style={{
            padding: "0.75rem 0.25rem",
            borderBottom: activeTab === "WEBHOOKS" ? "2px solid var(--accent)" : "2px solid transparent",
            color: activeTab === "WEBHOOKS" ? "var(--foreground)" : "var(--muted)",
            fontWeight: activeTab === "WEBHOOKS" ? 600 : 500,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
            fontSize: "0.9rem",
            whiteSpace: "nowrap",
          }}
        >
          <Zap className="w-4 h-4 text-amber-400" />
          Webhooks & Events
        </button>

        <button
          onClick={() => setActiveTab("USAGE_HEALTH")}
          style={{
            padding: "0.75rem 0.25rem",
            borderBottom: activeTab === "USAGE_HEALTH" ? "2px solid var(--accent)" : "2px solid transparent",
            color: activeTab === "USAGE_HEALTH" ? "var(--foreground)" : "var(--muted)",
            fontWeight: activeTab === "USAGE_HEALTH" ? 600 : 500,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
            fontSize: "0.9rem",
            whiteSpace: "nowrap",
          }}
        >
          <Activity className="w-4 h-4 text-purple-400" />
          Usage & Engine Health
        </button>
      </div>

      {/* ── Sub-View Renders ─────────────────────────────────────────────────── */}
      {activeTab === "EXPLORER" && (
        <StorageExplorer
          buckets={buckets}
          selectedBucket={selectedBucket}
          onSelectBucket={(b) => setSelectedBucket(b)}
          onOpenCreateBucket={() => setCreateBucketModalOpen(true)}
          onOpenBucketSettings={(b) => {
            setTargetSettingsBucket(b);
            setSettingsModalOpen(true);
          }}
          onDeleteBucket={handleDeleteBucket}
          objects={objects}
          commonPrefixes={commonPrefixes}
          currentFolder={currentFolder}
          onChangeFolder={(f) => setCurrentFolder(f)}
          loadingObjects={loadingObjects}
          onRefreshObjects={() => {
            if (selectedBucket) loadObjects(selectedBucket.id, currentFolder);
            storageApi.getUsage().then(setUsage).catch(() => {});
          }}
          usage={usage}
        />
      )}

      {activeTab === "DEVELOPER_DOCS" && (
        <StorageDeveloperDocs
          buckets={buckets}
          selectedBucket={selectedBucket}
          objects={objects}
        />
      )}

      {activeTab === "POLICIES" && (
        <StoragePolicies
          buckets={buckets}
          selectedBucket={selectedBucket}
          onBucketUpdated={fetchData}
        />
      )}

      {activeTab === "TRASH_BIN" && (
        <StorageTrashBin
          buckets={buckets}
          selectedBucket={selectedBucket}
          onObjectRestored={() => {
            if (selectedBucket) loadObjects(selectedBucket.id, currentFolder);
            fetchData();
          }}
        />
      )}

      {activeTab === "WEBHOOKS" && <StorageWebhooks buckets={buckets} />}

      {activeTab === "USAGE_HEALTH" && (
        <StorageUsageHealth
          usage={usage}
          onReconciled={fetchData}
        />
      )}

      {/* ── Global Modals ────────────────────────────────────────────────────── */}
      <CreateBucketModal
        isOpen={createBucketModalOpen}
        onClose={() => setCreateBucketModalOpen(false)}
        onSuccess={(b) => {
          setBuckets((prev) => [...prev, b]);
          setSelectedBucket(b);
          fetchData();
        }}
      />

      <BucketSettingsModal
        isOpen={settingsModalOpen}
        bucket={targetSettingsBucket}
        onClose={() => {
          setSettingsModalOpen(false);
          setTargetSettingsBucket(null);
        }}
        onSuccess={fetchData}
      />
    </div>
  );
}
