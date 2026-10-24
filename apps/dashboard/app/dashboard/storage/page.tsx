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
  ChevronRight,
  X,
  Eye,
  Edit3,
  Sliders,
  FolderPlus,
  UploadCloud,
  CheckSquare,
  Square,
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
  const [commonPrefixes, setCommonPrefixes] = useState<string[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string>("");
  const [loadingObjects, setLoadingObjects] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);

  // Inspector & Metadata
  const [inspectingObject, setInspectingObject] = useState<StorageObjectItem | null>(null);
  const [editingMetadata, setEditingMetadata] = useState<{
    cacheControl: string;
    contentDisposition: string;
    customJson: string;
  }>({ cacheControl: "", contentDisposition: "", customJson: "{}" });
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [multiUploadStatus, setMultiUploadStatus] = useState<{ current: number; total: number; filename: string } | null>(null);

  const [auditLogs, setAuditLogs] = useState<StorageAuditLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Modals
  const [createBucketModalOpen, setCreateBucketModalOpen] = useState(false);
  const [newBucketName, setNewBucketName] = useState("");
  const [newBucketDesc, setNewBucketDesc] = useState("");
  const [newBucketPublic, setNewBucketPublic] = useState(false);
  const [creatingBucket, setCreatingBucket] = useState(false);

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Load objects with virtual folder delimiter support
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

  // Fetch objects when selected bucket or folder changes
  useEffect(() => {
    if (!selectedBucket) {
      setObjects([]);
      setCommonPrefixes([]);
      setSelectedPaths(new Set());
      setCurrentFolder("");
      return;
    }

    setSelectedPaths(new Set());
    loadObjects(selectedBucket.id, currentFolder);
  }, [selectedBucket?.id, currentFolder]);

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

  const handleMultiFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedBucket) return;
    const fileArray = Array.from(files);

    const totalBytes = fileArray.reduce((acc, f) => acc + f.size, 0);
    if (usage && totalBytes > usage.quota.availableBytes) {
      toast.error(`Total file size (${formatBytes(totalBytes)}) exceeds remaining quota (${formatBytes(usage.quota.availableBytes)}).`);
      return;
    }

    setUploading(true);
    let successCount = 0;

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const objectPath = currentFolder ? `${currentFolder}${file.name}` : file.name;
      setMultiUploadStatus({ current: i + 1, total: fileArray.length, filename: file.name });
      try {
        await storageApi.uploadObject(selectedBucket.id, objectPath, file);
        successCount++;
      } catch (err: any) {
        toast.error(`Failed to upload '${file.name}': ${err.message}`);
      }
    }

    toast.success(`Successfully uploaded ${successCount} of ${fileArray.length} file(s).`);
    setUploading(false);
    setMultiUploadStatus(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await loadObjects(selectedBucket.id, currentFolder);
    const updatedUsage = await storageApi.getUsage().catch(() => null);
    if (updatedUsage) setUsage(updatedUsage);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleMultiFileUpload(e.dataTransfer.files);
    }
  };

  const toggleSelectObject = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPaths.size === filteredObjects.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(filteredObjects.map((o) => o.name)));
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedBucket || selectedPaths.size === 0) return;
    const paths = Array.from(selectedPaths);
    if (!confirm(`Delete ${paths.length} selected object(s) permanently?`)) return;

    try {
      const res = await storageApi.bulkDeleteObjects(selectedBucket.id, paths);
      toast.success(`Deleted ${res.deletedCount} object(s).`);
      setSelectedPaths(new Set());
      await loadObjects(selectedBucket.id, currentFolder);
      const updatedUsage = await storageApi.getUsage().catch(() => null);
      if (updatedUsage) setUsage(updatedUsage);
    } catch (err: any) {
      toast.error(err.message || "Bulk delete failed");
    }
  };

  const openInspector = (obj: StorageObjectItem) => {
    setInspectingObject(obj);
    setEditingMetadata({
      cacheControl: obj.cacheControl || "public, max-age=3600",
      contentDisposition: obj.contentDisposition || "inline",
      customJson: obj.metadata ? JSON.stringify(obj.metadata, null, 2) : "{}",
    });
  };

  const handleSaveMetadata = async () => {
    if (!selectedBucket || !inspectingObject) return;
    setSavingMetadata(true);
    try {
      let parsedCustom = {};
      try {
        parsedCustom = JSON.parse(editingMetadata.customJson);
      } catch {
        toast.error("Invalid JSON format for custom metadata");
        setSavingMetadata(false);
        return;
      }

      await storageApi.updateObjectMetadata(selectedBucket.id, {
        path: inspectingObject.name,
        cacheControl: editingMetadata.cacheControl,
        contentDisposition: editingMetadata.contentDisposition,
        metadata: parsedCustom,
      });

      toast.success("Object metadata saved successfully.");
      setInspectingObject((prev) =>
        prev
          ? {
              ...prev,
              cacheControl: editingMetadata.cacheControl,
              contentDisposition: editingMetadata.contentDisposition,
              metadata: parsedCustom,
            }
          : null
      );
      await loadObjects(selectedBucket.id, currentFolder);
    } catch (err: any) {
      toast.error(err.message || "Failed to update metadata");
    } finally {
      setSavingMetadata(false);
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
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: isDragging ? "2px dashed var(--accent)" : "1px solid var(--card-border)",
              borderRadius: "0.75rem",
              minHeight: 450,
              position: "relative",
              transition: "border 0.2s ease, background 0.2s ease",
            }}
          >
            {/* Drag Overlay */}
            {isDragging && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(99, 102, 241, 0.08)",
                  backdropFilter: "blur(2px)",
                  borderRadius: "0.75rem",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 20,
                  pointerEvents: "none",
                }}
              >
                <UploadCloud className="w-12 h-12 text-indigo-500 animate-bounce mb-2" />
                <p style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--accent)" }}>
                  Drop files to upload to {currentFolder ? `/${currentFolder}` : selectedBucket?.name}
                </p>
                <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                  Multi-file upload directly to Cloudflare R2
                </p>
              </div>
            )}

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
                      multiple
                      onChange={(e) => handleMultiFileUpload(e.target.files)}
                      style={{ display: "none" }}
                    />
                    <button
                      onClick={() => {
                        const folderName = prompt("Enter folder name (e.g. 'images' or 'docs'):");
                        if (folderName && folderName.trim()) {
                          const clean = folderName.trim().replace(/\/+$/, "") + "/";
                          setCurrentFolder((prev) => `${prev}${clean}`);
                        }
                      }}
                      className="btn btn-secondary"
                      style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}
                    >
                      <FolderPlus className="w-3.5 h-3.5 text-indigo-400" />
                      New Folder
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="btn btn-primary"
                      style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}
                    >
                      <Upload className={`w-3.5 h-3.5 ${uploading ? "animate-bounce" : ""}`} />
                      {uploading
                        ? multiUploadStatus
                          ? `Uploading (${multiUploadStatus.current}/${multiUploadStatus.total})...`
                          : "Uploading..."
                        : "Upload Files"}
                    </button>
                  </div>
                </div>

                {/* Breadcrumbs Navigation */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    marginBottom: "1rem",
                    padding: "0.4rem 0.75rem",
                    background: "var(--bg-inset)",
                    borderRadius: "0.5rem",
                    fontSize: "0.85rem",
                    overflowX: "auto",
                  }}
                >
                  <button
                    onClick={() => setCurrentFolder("")}
                    style={{
                      background: "none",
                      border: "none",
                      color: !currentFolder ? "var(--foreground)" : "var(--accent)",
                      fontWeight: !currentFolder ? 600 : 500,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <Folder className="w-3.5 h-3.5 text-indigo-400" />
                    <span>root</span>
                  </button>

                  {currentFolder &&
                    currentFolder
                      .split("/")
                      .filter(Boolean)
                      .map((segment, idx, arr) => {
                        const segmentPath = arr.slice(0, idx + 1).join("/") + "/";
                        const isLast = idx === arr.length - 1;
                        return (
                          <div key={segmentPath} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                            <button
                              onClick={() => setCurrentFolder(segmentPath)}
                              style={{
                                background: "none",
                                border: "none",
                                color: isLast ? "var(--foreground)" : "var(--accent)",
                                fontWeight: isLast ? 600 : 500,
                                cursor: "pointer",
                              }}
                            >
                              {segment}
                            </button>
                          </div>
                        );
                      })}
                </div>

                {/* Bulk Actions Toolbar (when items selected) */}
                {selectedPaths.size > 0 && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "0.5rem 0.75rem",
                      marginBottom: "1rem",
                      background: "rgba(99, 102, 241, 0.12)",
                      border: "1px solid var(--accent)",
                      borderRadius: "0.5rem",
                      fontSize: "0.85rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600 }}>
                      <CheckSquare className="w-4 h-4 text-indigo-500" />
                      <span>{selectedPaths.size} object(s) selected</span>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <button
                        onClick={handleBulkDelete}
                        className="btn btn-secondary"
                        style={{
                          fontSize: "0.75rem",
                          padding: "0.25rem 0.6rem",
                          color: "var(--danger)",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Selected
                      </button>
                      <button
                        onClick={() => setSelectedPaths(new Set())}
                        style={{
                          background: "none",
                          border: "none",
                          fontSize: "0.75rem",
                          color: "var(--muted)",
                          cursor: "pointer",
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}

                {/* Search Filter */}
                <div style={{ position: "relative", marginBottom: "1rem" }}>
                  <Search className="w-4 h-4 text-slate-400" style={{ position: "absolute", left: 12, top: 11 }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search objects in current folder..."
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
                ) : filteredObjects.length === 0 && commonPrefixes.length === 0 ? (
                  <div
                    style={{
                      padding: "4rem 2rem",
                      textAlign: "center",
                      border: "2px dashed var(--border)",
                      borderRadius: "0.75rem",
                      background: "var(--bg-inset)",
                    }}
                  >
                    <UploadCloud className="w-8 h-8 text-slate-400" style={{ margin: "0 auto 0.5rem" }} />
                    <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>No objects in this folder</p>
                    <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                      Drag and drop files here, or click upload to add files to this bucket.
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="btn btn-secondary"
                      style={{ marginTop: "1rem", fontSize: "0.8rem" }}
                    >
                      Select Files to Upload
                    </button>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                          <th style={{ padding: "0.6rem 0.5rem", width: 32 }}>
                            <input
                              type="checkbox"
                              checked={selectedPaths.size > 0 && selectedPaths.size === filteredObjects.length}
                              onChange={toggleSelectAll}
                            />
                          </th>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Name</th>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Size</th>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Type</th>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Updated</th>
                          <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600, textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Virtual Subfolders */}
                        {commonPrefixes.map((prefix) => {
                          const folderDisplay = prefix.slice(currentFolder.length).replace(/\/$/, "");
                          return (
                            <tr
                              key={prefix}
                              onClick={() => setCurrentFolder(prefix)}
                              style={{
                                borderBottom: "1px solid var(--border-light)",
                                cursor: "pointer",
                                transition: "background 0.1s ease",
                              }}
                              className="hover:bg-slate-500/5"
                            >
                              <td style={{ padding: "0.6rem 0.5rem" }} />
                              <td style={{ padding: "0.6rem 0.5rem" }} colSpan={4}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                  <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20" />
                                  <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{folderDisplay}/</span>
                                </div>
                              </td>
                              <td style={{ padding: "0.6rem 0.5rem", textAlign: "right" }}>
                                <ChevronRight className="w-4 h-4 text-slate-400 inline" />
                              </td>
                            </tr>
                          );
                        })}

                        {/* Files */}
                        {filteredObjects.map((obj) => {
                          const displayName = currentFolder ? obj.name.slice(currentFolder.length) : obj.name;
                          const isSelected = selectedPaths.has(obj.name);
                          return (
                            <tr
                              key={obj.id}
                              style={{
                                borderBottom: "1px solid var(--border-light)",
                                background: isSelected ? "rgba(99, 102, 241, 0.05)" : "transparent",
                                transition: "background 0.1s ease",
                              }}
                            >
                              <td style={{ padding: "0.6rem 0.5rem" }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectObject(obj.name)}
                                />
                              </td>
                              <td style={{ padding: "0.6rem 0.5rem" }}>
                                <div
                                  onClick={() => openInspector(obj)}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    cursor: "pointer",
                                  }}
                                  title="Click to inspect metadata"
                                >
                                  {getFileIcon(obj.name, obj.mimeType)}
                                  <span style={{ fontWeight: 500, color: "var(--foreground)" }} className="hover:underline">
                                    {displayName}
                                  </span>
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
                                    onClick={() => openInspector(obj)}
                                    className="btn-secondary"
                                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", borderRadius: 4 }}
                                    title="Inspect & Edit Metadata"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-indigo-400" />
                                  </button>
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
                          );
                        })}
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

            {/* Object Detail & Metadata Inspector Slide-Out */}
            {inspectingObject && selectedBucket && (
              <div
                style={{
                  position: "fixed",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  width: 420,
                  background: "var(--card-bg)",
                  borderLeft: "1px solid var(--border)",
                  boxShadow: "-4px 0 24px rgba(0,0,0,0.3)",
                  zIndex: 50,
                  padding: "1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  overflowY: "auto",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Sliders className="w-4 h-4 text-indigo-500" />
                    Object Inspector
                  </h3>
                  <button
                    onClick={() => setInspectingObject(null)}
                    style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Image Preview Thumbnail if image */}
                {inspectingObject.mimeType.startsWith("image/") && (
                  <div
                    style={{
                      background: "var(--bg-inset)",
                      borderRadius: "0.5rem",
                      padding: "0.75rem",
                      marginBottom: "1rem",
                      textAlign: "center",
                    }}
                  >
                    <img
                      src={
                        selectedBucket.isPublic
                          ? `${process.env.NEXT_PUBLIC_STORAGE_URL || "https://storage.whizan.cloud"}/public/${encodeURIComponent(selectedBucket.name)}/${inspectingObject.name.split("/").map(encodeURIComponent).join("/")}`
                          : "/placeholder-image.png"
                      }
                      alt={inspectingObject.name}
                      style={{ maxHeight: 180, maxWidth: "100%", margin: "0 auto", borderRadius: "0.25rem", objectFit: "contain" }}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  </div>
                )}

                {/* File Details */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted)" }}>Path</span>
                    <span style={{ fontWeight: 600, wordBreak: "break-all", maxWidth: "65%", textAlign: "right" }}>{inspectingObject.name}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted)" }}>Size</span>
                    <span style={{ fontWeight: 600 }}>{formatBytes(inspectingObject.size)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted)" }}>Content-Type</span>
                    <span style={{ fontWeight: 600 }}>{inspectingObject.mimeType}</span>
                  </div>
                  {inspectingObject.etag && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--muted)" }}>ETag</span>
                      <span style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{inspectingObject.etag}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted)" }}>Updated</span>
                    <span>{new Date(inspectingObject.updatedAt).toLocaleString()}</span>
                  </div>
                </div>

                {/* Metadata Editor Form */}
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <h4 style={{ fontSize: "0.9rem", fontWeight: 700 }}>HTTP Headers & Metadata</h4>

                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "0.25rem" }}>
                      Cache-Control
                    </label>
                    <input
                      type="text"
                      value={editingMetadata.cacheControl}
                      onChange={(e) => setEditingMetadata((prev) => ({ ...prev, cacheControl: e.target.value }))}
                      placeholder="e.g. public, max-age=86400"
                      style={{
                        width: "100%",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "0.375rem",
                        border: "1px solid var(--border)",
                        background: "var(--bg-inset)",
                        fontSize: "0.85rem",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "0.25rem" }}>
                      Content-Disposition
                    </label>
                    <input
                      type="text"
                      value={editingMetadata.contentDisposition}
                      onChange={(e) => setEditingMetadata((prev) => ({ ...prev, contentDisposition: e.target.value }))}
                      placeholder="e.g. inline or attachment; filename=..."
                      style={{
                        width: "100%",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "0.375rem",
                        border: "1px solid var(--border)",
                        background: "var(--bg-inset)",
                        fontSize: "0.85rem",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "0.25rem" }}>
                      Custom Metadata (JSON)
                    </label>
                    <textarea
                      rows={4}
                      value={editingMetadata.customJson}
                      onChange={(e) => setEditingMetadata((prev) => ({ ...prev, customJson: e.target.value }))}
                      style={{
                        width: "100%",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "0.375rem",
                        border: "1px solid var(--border)",
                        background: "var(--bg-inset)",
                        fontSize: "0.8rem",
                        fontFamily: "monospace",
                      }}
                    />
                  </div>

                  <button
                    onClick={handleSaveMetadata}
                    disabled={savingMetadata}
                    className="btn btn-primary"
                    style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}
                  >
                    {savingMetadata ? "Saving..." : "Save Metadata"}
                  </button>
                </div>
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
