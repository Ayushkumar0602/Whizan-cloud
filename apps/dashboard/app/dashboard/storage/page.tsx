"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  HardDrive,
  Plus,
  Search,
  Upload,
  Download,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Globe,
  Lock,
  RefreshCw,
  Folder,
  File as FileIcon,
  FileText,
  FileCode,
  FileArchive,
  Image as ImageIcon,
  Activity,
  Layers,
  Sparkles,
  Info,
  AlertTriangle,
  Move,
  Clock,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  storageApi,
  type StorageBucketItem,
  type StorageObjectItem,
  type StorageUsageResponse,
  type StorageAuditLogItem,
} from "@/lib/api";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1000;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getFileIcon(name: string, mime: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext || "") || mime.startsWith("image/")) {
    return <ImageIcon className="w-4 h-4 text-sky-500" />;
  }
  if (["ts", "tsx", "js", "jsx", "json", "py", "go", "rs", "html", "css"].includes(ext || "")) {
    return <FileCode className="w-4 h-4 text-emerald-500" />;
  }
  if (["zip", "tar", "gz", "7z", "rar"].includes(ext || "")) {
    return <FileArchive className="w-4 h-4 text-amber-500" />;
  }
  if (["pdf", "txt", "md", "csv", "doc", "docx"].includes(ext || "")) {
    return <FileText className="w-4 h-4 text-indigo-500" />;
  }
  return <FileIcon className="w-4 h-4 text-slate-400" />;
}

export default function StorageDashboardPage() {
  const [activeTab, setActiveTab] = useState<"EXPLORER" | "LIMITS" | "LOGS">("EXPLORER");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [usage, setUsage] = useState<StorageUsageResponse | null>(null);
  const [buckets, setBuckets] = useState<StorageBucketItem[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<StorageBucketItem | null>(null);

  const [objects, setObjects] = useState<StorageObjectItem[]>([]);
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [auditLogs, setAuditLogs] = useState<StorageAuditLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Modals
  const [createBucketModalOpen, setCreateBucketModalOpen] = useState(false);
  const [newBucketName, setNewBucketName] = useState("");
  const [newBucketDesc, setNewBucketDesc] = useState("");
  const [newBucketPublic, setNewBucketPublic] = useState(false);
  const [creatingBucket, setCreatingBucket] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Load initial data
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

  // Fetch objects when selected bucket changes
  useEffect(() => {
    if (!selectedBucket) {
      setObjects([]);
      return;
    }

    let isMounted = true;
    setLoadingObjects(true);

    storageApi
      .listObjects(selectedBucket.id, { limit: 100 })
      .then((res) => {
        if (isMounted) setObjects(res.objects || []);
      })
      .catch((err) => {
        if (isMounted) toast.error(err.message || "Failed to load bucket objects");
      })
      .finally(() => {
        if (isMounted) setLoadingObjects(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedBucket?.id]);

  // Fetch audit logs when tab selected
  useEffect(() => {
    if (activeTab === "LOGS") {
      setLoadingLogs(true);
      storageApi
        .getAuditLogs(50)
        .then((res) => setAuditLogs(res))
        .catch(() => {})
        .finally(() => setLoadingLogs(false));
    }
  }, [activeTab]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    if (selectedBucket) {
      const res = await storageApi.listObjects(selectedBucket.id).catch(() => null);
      if (res) setObjects(res.objects || []);
    }
    toast.success("Storage state refreshed");
    setRefreshing(false);
  };

  const handleReconcile = async () => {
    setRefreshing(true);
    try {
      const res = await storageApi.reconcile();
      toast.success("Storage quota and active reservations reconciled successfully.");
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to reconcile storage");
    } finally {
      setRefreshing(false);
    }
  };

  const handleCreateBucket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBucketName.trim()) return;

    setCreatingBucket(true);
    try {
      const res = await storageApi.createBucket({
        name: newBucketName.trim(),
        description: newBucketDesc.trim() || undefined,
        isPublic: newBucketPublic,
      });
      toast.success(`Bucket '${res.bucket.name}' created successfully.`);
      setCreateBucketModalOpen(false);
      setNewBucketName("");
      setNewBucketDesc("");
      setNewBucketPublic(false);
      await fetchData();
      setSelectedBucket(res.bucket);
    } catch (err: any) {
      toast.error(err.message || "Failed to create bucket");
    } finally {
      setCreatingBucket(false);
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

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedBucket) return;
    const file = files[0];

    // Check size against remaining quota
    if (usage && file.size > usage.quota.availableBytes) {
      toast.error(`File size (${formatBytes(file.size)}) exceeds remaining quota (${formatBytes(usage.quota.availableBytes)}).`);
      return;
    }

    setUploading(true);
    try {
      await storageApi.uploadObject(selectedBucket.id, file.name, file);
      toast.success(`File '${file.name}' uploaded successfully to ${selectedBucket.name}.`);
      // Reload objects and usage
      const res = await storageApi.listObjects(selectedBucket.id);
      setObjects(res.objects || []);
      const updatedUsage = await storageApi.getUsage().catch(() => null);
      if (updatedUsage) setUsage(updatedUsage);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteObject = async (obj: StorageObjectItem) => {
    if (!selectedBucket || !confirm(`Delete '${obj.name}' permanently from storage?`)) return;

    try {
      await storageApi.deleteObject(selectedBucket.id, obj.name);
      toast.success(`Deleted '${obj.name}'.`);
      setObjects((prev) => prev.filter((o) => o.id !== obj.id));
      const updatedUsage = await storageApi.getUsage().catch(() => null);
      if (updatedUsage) setUsage(updatedUsage);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete object");
    }
  };

  const handleDownloadObject = async (obj: StorageObjectItem) => {
    if (!selectedBucket) return;

    try {
      const res = await storageApi.getDownloadUrl(selectedBucket.id, obj.name, 900, obj.name.split("/").pop());
      window.open(res.downloadUrl, "_blank");
      toast.success("Download started");
    } catch (err: any) {
      toast.error(err.message || "Failed to initiate download");
    }
  };

  const handleCopyUrl = async (obj: StorageObjectItem) => {
    if (!selectedBucket) return;

    try {
      if (selectedBucket.isPublic) {
        // Public CDN URL with proper URI component encoding
        const encodedPath = obj.name.split("/").map(encodeURIComponent).join("/");
        const isStorageDomain = typeof window !== "undefined" && window.location.hostname.includes("whizan.cloud");
        const baseOrigin = process.env.NEXT_PUBLIC_STORAGE_URL 
          ? process.env.NEXT_PUBLIC_STORAGE_URL 
          : (isStorageDomain ? "https://storage.whizan.cloud" : window.location.origin);
        const publicUrl = `${baseOrigin}/public/${encodeURIComponent(selectedBucket.name)}/${encodedPath}`;
        await navigator.clipboard.writeText(publicUrl);
        setCopiedKey(obj.id);
        toast.success("Public URL copied to clipboard");
        setTimeout(() => setCopiedKey(null), 2000);
      } else {
        // Generate signed URL
        const res = await storageApi.getDownloadUrl(selectedBucket.id, obj.name, 3600);
        await navigator.clipboard.writeText(res.downloadUrl);
        setCopiedKey(obj.id);
        toast.success("Signed URL (1 hr) copied to clipboard");
        setTimeout(() => setCopiedKey(null), 2000);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to copy URL");
    }
  };

  const filteredObjects = useMemo(() => {
    if (!searchQuery.trim()) return objects;
    const q = searchQuery.toLowerCase();
    return objects.filter((o) => o.name.toLowerCase().includes(q) || o.mimeType.toLowerCase().includes(q));
  }, [objects, searchQuery]);

  const quotaPercent = usage?.quota.usagePercent || 0;

  return (
    <div className="page" style={{ maxWidth: 1280, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <PageHeader
        title="Cloud Storage"
        subtitle="Global S3-compatible object storage powered by Cloudflare R2 Edge CDN with strict 250 MB quota isolation and Supabase-like DX."
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
                <span style={{ fontSize: "1.2rem", fontWeight: 700 }}>Cloudflare R2</span>
              </div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "rgba(217, 119, 6, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Globe className="w-5 h-5 text-amber-500" />
            </div>
          </div>

          <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--muted)", lineHeight: 1.6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Egress Fees:</span>
              <span style={{ fontWeight: 600, color: "var(--success)" }}>$0.00 / Free</span>
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
            cursor: "pointer",
          }}
        >
          <Folder className="w-4 h-4" />
          Bucket & File Explorer
        </button>

        <button
          onClick={() => setActiveTab("LIMITS")}
          style={{
            padding: "0.75rem 0.25rem",
            borderBottom: activeTab === "LIMITS" ? "2px solid var(--accent)" : "2px solid transparent",
            color: activeTab === "LIMITS" ? "var(--foreground)" : "var(--muted)",
            fontWeight: activeTab === "LIMITS" ? 600 : 500,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "none",
            cursor: "pointer",
          }}
        >
          <Zap className="w-4 h-4" />
          Plan Limits & Tier Matrix
        </button>

        <button
          onClick={() => setActiveTab("LOGS")}
          style={{
            padding: "0.75rem 0.25rem",
            borderBottom: activeTab === "LOGS" ? "2px solid var(--accent)" : "2px solid transparent",
            color: activeTab === "LOGS" ? "var(--foreground)" : "var(--muted)",
            fontWeight: activeTab === "LOGS" ? 600 : 500,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "none",
            cursor: "pointer",
          }}
        >
          <Clock className="w-4 h-4" />
          Audit & Security Logs
        </button>
      </div>

      {/* ── Tab 1: Bucket & File Explorer ───────────────────────────────────── */}
      {activeTab === "EXPLORER" && (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "1.5rem", alignItems: "start" }}>
          {/* Left Column: Buckets List */}
          <div
            className="card"
            style={{
              padding: "1rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" }}>
                Buckets ({buckets.length})
              </span>
              <button
                onClick={() => setCreateBucketModalOpen(true)}
                className="btn-secondary"
                style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", borderRadius: "0.375rem" }}
              >
                + Add
              </button>
            </div>

            {buckets.length === 0 ? (
              <div style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
                No buckets yet. Click "+ Add" to create your first bucket.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {buckets.map((b) => {
                  const isSelected = selectedBucket?.id === b.id;
                  return (
                    <div
                      key={b.id}
                      onClick={() => setSelectedBucket(b)}
                      style={{
                        padding: "0.75rem",
                        borderRadius: "0.5rem",
                        cursor: "pointer",
                        background: isSelected ? "var(--accent-glow)" : "transparent",
                        border: isSelected ? "1px solid var(--accent)" : "1px solid transparent",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span style={{ fontWeight: isSelected ? 600 : 500, fontSize: "0.9rem" }}>{b.name}</span>
                          {b.isPublic ? (
                            <span style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem", borderRadius: 4, background: "rgba(217, 119, 6, 0.15)", color: "var(--warning)" }}>
                              PUBLIC
                            </span>
                          ) : (
                            <span style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem", borderRadius: 4, background: "rgba(16, 185, 129, 0.15)", color: "var(--success)" }}>
                              PRIVATE
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                          {b._count?.objects ?? b.fileCount ?? 0} files · {formatBytes(Number(b.totalBytes || 0))}
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBucket(b);
                        }}
                        style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: "0.25rem" }}
                        title="Delete bucket"
                      >
                        <Trash2 className="w-3.5 h-3.5 hover:text-rose-500" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Object Explorer */}
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
              minHeight: 450,
            }}
          >
            {selectedBucket ? (
              <div>
                {/* Bucket Controls Header */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "1rem",
                    paddingBottom: "1rem",
                    borderBottom: "1px solid var(--border)",
                    marginBottom: "1rem",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <h2 style={{ fontSize: "1.25rem", fontWeight: 700 }}>{selectedBucket.name}</h2>
                      {selectedBucket.isPublic ? (
                        <span style={{ fontSize: "0.7rem", padding: "0.15rem 0.5rem", borderRadius: 999, background: "rgba(217, 119, 6, 0.15)", color: "var(--warning)", fontWeight: 600 }}>
                          Public Bucket
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.7rem", padding: "0.15rem 0.5rem", borderRadius: 999, background: "rgba(16, 185, 129, 0.15)", color: "var(--success)", fontWeight: 600 }}>
                          Private Bucket
                        </span>
                      )}
                    </div>
                    {selectedBucket.description && (
                      <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                        {selectedBucket.description}
                      </p>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => handleFileUpload(e.target.files)}
                      style={{ display: "none" }}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="btn btn-primary"
                      style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}
                    >
                      <Upload className={`w-3.5 h-3.5 ${uploading ? "animate-bounce" : ""}`} />
                      {uploading ? "Uploading..." : "Upload File"}
                    </button>
                  </div>
                </div>

                {/* Search Filter */}
                <div style={{ position: "relative", marginBottom: "1rem" }}>
                  <Search className="w-4 h-4 text-slate-400" style={{ position: "absolute", left: 12, top: 11 }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search objects by name or MIME type..."
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem 0.5rem 2.25rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border)",
                      background: "var(--bg-inset)",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>

                {/* Objects Table */}
                {loadingObjects ? (
                  <div style={{ padding: "4rem 0", textAlign: "center", color: "var(--muted)" }}>
                    <div className="spinner" style={{ margin: "0 auto 0.75rem" }} />
                    Loading objects...
                  </div>
                ) : filteredObjects.length === 0 ? (
                  <div
                    style={{
                      padding: "4rem 2rem",
                      textAlign: "center",
                      border: "2px dashed var(--border)",
                      borderRadius: "0.75rem",
                      background: "var(--bg-inset)",
                    }}
                  >
                    <Upload className="w-8 h-8 text-slate-400" style={{ margin: "0 auto 0.5rem" }} />
                    <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>No objects in this bucket</p>
                    <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                      Upload images, documents, or data files to store them globally on Cloudflare R2.
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="btn btn-secondary"
                      style={{ marginTop: "1rem", fontSize: "0.8rem" }}
                    >
                      Select File to Upload
                    </button>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Name</th>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Size</th>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Type</th>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Updated</th>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600, textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredObjects.map((obj) => (
                          <tr
                            key={obj.id}
                            style={{
                              borderBottom: "1px solid var(--border-light)",
                              transition: "background 0.1s ease",
                            }}
                          >
                            <td style={{ padding: "0.6rem 0.5rem" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                {getFileIcon(obj.name, obj.mimeType)}
                                <span style={{ fontWeight: 500 }}>{obj.name}</span>
                              </div>
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", color: "var(--muted)" }}>{formatBytes(obj.size)}</td>
                            <td style={{ padding: "0.6rem 0.5rem", color: "var(--muted)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {obj.mimeType}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", color: "var(--muted)" }}>
                              {new Date(obj.updatedAt).toLocaleDateString()}
                            </td>
                            <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                              <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end", alignItems: "center" }}>
                                <button
                                  onClick={() => handleCopyUrl(obj)}
                                  className="btn-secondary"
                                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", borderRadius: 4 }}
                                  title={selectedBucket.isPublic ? "Copy Public CDN URL" : "Copy Temporary Signed URL"}
                                >
                                  {copiedKey === obj.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  onClick={() => handleDownloadObject(obj)}
                                  className="btn-secondary"
                                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", borderRadius: 4 }}
                                  title="Download File"
                                >
                                  <Download className="w-3.5 h-3.5 text-sky-500" />
                                </button>
                                <button
                                  onClick={() => handleDeleteObject(obj)}
                                  className="btn-secondary"
                                  style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", borderRadius: 4 }}
                                  title="Delete File"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: "4rem 2rem", textAlign: "center", color: "var(--muted)" }}>
                <Folder className="w-10 h-10 text-slate-400" style={{ margin: "0 auto 0.5rem" }} />
                <p style={{ fontWeight: 600 }}>No Bucket Selected</p>
                <p style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                  Create or select a bucket from the left menu to view its files.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab 2: Plan Limits & Tier Matrix ─────────────────────────────────── */}
      {activeTab === "LIMITS" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div
            className="card"
            style={{
              padding: "1.5rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Whizan Cloud Storage Tiers
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
              Storage command quotas and rate limits are configured server-side based on your active subscription tier.
            </p>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                    <th style={{ padding: "0.75rem", fontWeight: 700 }}>Feature / Limit</th>
                    <th style={{ padding: "0.75rem", fontWeight: 700, color: "var(--accent)" }}>Hobby (Tier A)</th>
                    <th style={{ padding: "0.75rem", fontWeight: 700, color: "var(--success)" }}>Professional (Tier B)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "0.75rem", fontWeight: 500 }}>Default Storage Quota</td>
                    <td style={{ padding: "0.75rem" }}>250 MB (Strict)</td>
                    <td style={{ padding: "0.75rem" }}>250 MB (Customizable)</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "0.75rem", fontWeight: 500 }}>Max File Size Per Upload</td>
                    <td style={{ padding: "0.75rem" }}>25 MB</td>
                    <td style={{ padding: "0.75rem" }}>100 MB</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "0.75rem", fontWeight: 500 }}>Request Rate Limit</td>
                    <td style={{ padding: "0.75rem" }}>60 req / minute</td>
                    <td style={{ padding: "0.75rem" }}>300 req / minute</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "0.75rem", fontWeight: 500 }}>Daily Command Allowance</td>
                    <td style={{ padding: "0.75rem" }}>2,000 commands / day</td>
                    <td style={{ padding: "0.75rem" }}>50,000 commands / day</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "0.75rem", fontWeight: 500 }}>Max Storage Buckets</td>
                    <td style={{ padding: "0.75rem" }}>10 Buckets</td>
                    <td style={{ padding: "0.75rem" }}>100 Buckets</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "0.75rem", fontWeight: 500 }}>Concurrent Uploads</td>
                    <td style={{ padding: "0.75rem" }}>3 In-Flight Transfers</td>
                    <td style={{ padding: "0.75rem" }}>10 In-Flight Transfers</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
                    <td style={{ padding: "0.75rem", fontWeight: 500 }}>Presigned URL Expiry</td>
                    <td style={{ padding: "0.75rem" }}>15 Minutes</td>
                    <td style={{ padding: "0.75rem" }}>30 Minutes</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "0.75rem", fontWeight: 500 }}>Cloudflare Edge Routing</td>
                    <td style={{ padding: "0.75rem", color: "var(--success)" }}>Included (Free Egress)</td>
                    <td style={{ padding: "0.75rem", color: "var(--success)" }}>Included (Free Egress)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 3: Audit & Security Logs ────────────────────────────────────── */}
      {activeTab === "LOGS" && (
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
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Storage Security & Audit Trail</h3>
            <button onClick={() => storageApi.getAuditLogs(50).then(setAuditLogs)} className="btn-secondary" style={{ fontSize: "0.75rem" }}>
              Refresh Logs
            </button>
          </div>

          {loadingLogs ? (
            <div style={{ padding: "3rem 0", textAlign: "center", color: "var(--muted)" }}>Loading audit logs...</div>
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
                    <th style={{ padding: "0.6rem", fontWeight: 600 }}>Object</th>
                    <th style={{ padding: "0.6rem", fontWeight: 600 }}>Size</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: "1px solid var(--border-light)" }}>
                      <td style={{ padding: "0.6rem", color: "var(--muted)" }}>{new Date(log.createdAt).toLocaleString()}</td>
                      <td style={{ padding: "0.6rem" }}>
                        <span
                          style={{
                            fontSize: "0.75rem",
                            padding: "0.15rem 0.4rem",
                            borderRadius: 4,
                            fontWeight: 600,
                            background: log.action.includes("DELETE")
                              ? "rgba(225, 29, 72, 0.1)"
                              : log.action.includes("UPLOAD")
                              ? "rgba(16, 185, 129, 0.1)"
                              : "rgba(79, 70, 229, 0.1)",
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
                      <td style={{ padding: "0.6rem" }}>{log.objectName || "—"}</td>
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
      )}

      {/* ── Create Bucket Modal ────────────────────────────────────────────── */}
      {createBucketModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setCreateBucketModalOpen(false)}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 480,
              padding: "1.5rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" }}>Create New Storage Bucket</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
              Buckets are top-level containers in Cloudflare R2 for storing your objects.
            </p>

            <form onSubmit={handleCreateBucket}>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Bucket Name
                </label>
                <input
                  type="text"
                  required
                  pattern="[a-z0-9][a-z0-9-]{1,61}[a-z0-9]"
                  value={newBucketName}
                  onChange={(e) => setNewBucketName(e.target.value.toLowerCase())}
                  placeholder="e.g. user-avatars or project-assets"
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border)",
                    background: "var(--bg-inset)",
                    fontSize: "0.85rem",
                  }}
                />
                <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                  Lowercase alphanumeric characters and hyphens only (3-63 chars).
                </span>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={newBucketDesc}
                  onChange={(e) => setNewBucketDesc(e.target.value)}
                  placeholder="e.g. Profile photos and brand identity assets"
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border)",
                    background: "var(--bg-inset)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              <div
                style={{
                  padding: "0.75rem",
                  background: "var(--bg-inset)",
                  borderRadius: "0.5rem",
                  marginBottom: "1.5rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>Public Bucket</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                    Files are publicly readable via CDN URL without authentication tokens.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={newBucketPublic}
                  onChange={(e) => setNewBucketPublic(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setCreateBucketModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: "0.85rem" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingBucket || !newBucketName.trim()}
                  className="btn btn-primary"
                  style={{ fontSize: "0.85rem" }}
                >
                  {creatingBucket ? "Creating..." : "Create Bucket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
