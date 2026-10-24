"use client";

import { useState, useMemo, useRef } from "react";
import {
  Folder,
  FolderPlus,
  File as FileIcon,
  FileText,
  FileCode,
  FileArchive,
  Image as ImageIcon,
  UploadCloud,
  Upload,
  Download,
  Trash2,
  Copy,
  Check,
  Eye,
  ChevronRight,
  Sliders,
  X,
  Search,
  CheckSquare,
  Square,
  LayoutGrid,
  List,
  Settings,
  Plus,
  HardDrive,
  Globe,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import {
  storageApi,
  type StorageBucketItem,
  type StorageObjectItem,
  type StorageUsageResponse,
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
  if (
    ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext || "") ||
    mime.startsWith("image/")
  ) {
    return <ImageIcon className="w-4 h-4 text-sky-500" />;
  }
  if (
    ["ts", "tsx", "js", "jsx", "json", "py", "go", "rs", "html", "css"].includes(
      ext || ""
    )
  ) {
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

interface StorageExplorerProps {
  buckets: StorageBucketItem[];
  selectedBucket: StorageBucketItem | null;
  onSelectBucket: (bucket: StorageBucketItem) => void;
  onOpenCreateBucket: () => void;
  onOpenBucketSettings: (bucket: StorageBucketItem) => void;
  onDeleteBucket: (bucket: StorageBucketItem) => void;
  objects: StorageObjectItem[];
  commonPrefixes: string[];
  currentFolder: string;
  onChangeFolder: (folder: string) => void;
  loadingObjects: boolean;
  onRefreshObjects: () => void;
  usage: StorageUsageResponse | null;
}

export function StorageExplorer({
  buckets,
  selectedBucket,
  onSelectBucket,
  onOpenCreateBucket,
  onOpenBucketSettings,
  onDeleteBucket,
  objects,
  commonPrefixes,
  currentFolder,
  onChangeFolder,
  loadingObjects,
  onRefreshObjects,
  usage,
}: StorageExplorerProps) {
  const [viewMode, setViewMode] = useState<"TABLE" | "GRID">("TABLE");
  const [searchQuery, setSearchQuery] = useState("");
  const [bucketSearch, setBucketSearch] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [multiUploadStatus, setMultiUploadStatus] = useState<{
    current: number;
    total: number;
    filename: string;
  } | null>(null);

  // Inspector & Metadata State
  const [inspectingObject, setInspectingObject] = useState<StorageObjectItem | null>(null);
  const [editingMetadata, setEditingMetadata] = useState<{
    cacheControl: string;
    contentDisposition: string;
    customJson: string;
  }>({ cacheControl: "", contentDisposition: "", customJson: "{}" });
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [signedUrlDuration, setSignedUrlDuration] = useState<number>(3600);
  const [signedDownloadFilename, setSignedDownloadFilename] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredBuckets = useMemo(() => {
    if (!bucketSearch.trim()) return buckets;
    const q = bucketSearch.toLowerCase();
    return buckets.filter((b) => b.name.toLowerCase().includes(q));
  }, [buckets, bucketSearch]);

  const filteredObjects = useMemo(() => {
    if (!searchQuery.trim()) return objects;
    const q = searchQuery.toLowerCase();
    return objects.filter(
      (o) => o.name.toLowerCase().includes(q) || o.mimeType.toLowerCase().includes(q)
    );
  }, [objects, searchQuery]);

  const handleMultiFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedBucket) return;
    const fileArray = Array.from(files);

    const totalBytes = fileArray.reduce((acc, f) => acc + f.size, 0);
    if (usage && totalBytes > usage.quota.availableBytes) {
      toast.error(
        `Total file size (${formatBytes(totalBytes)}) exceeds remaining quota (${formatBytes(
          usage.quota.availableBytes
        )}).`
      );
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
    onRefreshObjects();
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
    if (!confirm(`Delete ${paths.length} selected object(s)? Files will be moved to the trash bin.`)) return;

    try {
      const res = await storageApi.bulkDeleteObjects(selectedBucket.id, paths);
      toast.success(`Moved ${res.deletedCount} object(s) to trash.`);
      setSelectedPaths(new Set());
      onRefreshObjects();
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
    setSignedDownloadFilename(obj.name.split("/").pop() || "");
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

      toast.success("Object metadata saved.");
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
      onRefreshObjects();
    } catch (err: any) {
      toast.error(err.message || "Failed to update metadata");
    } finally {
      setSavingMetadata(false);
    }
  };

  const handleDeleteObject = async (obj: StorageObjectItem) => {
    if (!selectedBucket || !confirm(`Delete '${obj.name}'? File will be moved to the trash bin.`)) return;

    try {
      await storageApi.deleteObject(selectedBucket.id, obj.name);
      toast.success(`Deleted '${obj.name}'.`);
      onRefreshObjects();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete object");
    }
  };

  const handleDownloadObject = async (obj: StorageObjectItem) => {
    if (!selectedBucket) return;
    try {
      const res = await storageApi.getDownloadUrl(
        selectedBucket.id,
        obj.name,
        900,
        obj.name.split("/").pop()
      );
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
        const encodedPath = obj.name.split("/").map(encodeURIComponent).join("/");
        const isStorageDomain =
          typeof window !== "undefined" && window.location.hostname.includes("whizan.cloud");
        const baseOrigin = isStorageDomain
          ? "https://api.whizan.cloud"
          : window.location.origin;
        const publicUrl = `${baseOrigin}/public/${encodeURIComponent(
          selectedBucket.name
        )}/${encodedPath}`;
        await navigator.clipboard.writeText(publicUrl);
        setCopiedKey(obj.id);
        toast.success("Public CDN URL copied");
        setTimeout(() => setCopiedKey(null), 2000);
      } else {
        const res = await storageApi.getDownloadUrl(selectedBucket.id, obj.name, 3600);
        await navigator.clipboard.writeText(res.downloadUrl);
        setCopiedKey(obj.id);
        toast.success("Signed URL (1 hr) copied");
        setTimeout(() => setCopiedKey(null), 2000);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to copy URL");
    }
  };

  const handleGenerateCustomSignedUrl = async () => {
    if (!selectedBucket || !inspectingObject) return;
    try {
      const res = await storageApi.getDownloadUrl(
        selectedBucket.id,
        inspectingObject.name,
        signedUrlDuration,
        signedDownloadFilename.trim() || undefined
      );
      await navigator.clipboard.writeText(res.downloadUrl);
      toast.success(`Signed URL (${signedUrlDuration / 60}m) copied to clipboard.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to generate signed URL");
    }
  };

  return (
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
            onClick={onOpenCreateBucket}
            className="btn-secondary"
            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", borderRadius: "0.375rem" }}
          >
            + Add
          </button>
        </div>

        {/* Bucket Filter */}
        <div style={{ position: "relative", marginBottom: "0.75rem" }}>
          <Search className="w-3.5 h-3.5 text-slate-400" style={{ position: "absolute", left: 10, top: 9 }} />
          <input
            type="text"
            value={bucketSearch}
            onChange={(e) => setBucketSearch(e.target.value)}
            placeholder="Search buckets..."
            style={{
              width: "100%",
              padding: "0.4rem 0.5rem 0.4rem 2rem",
              borderRadius: "0.375rem",
              border: "1px solid var(--border)",
              background: "var(--bg-inset)",
              fontSize: "0.8rem",
            }}
          />
        </div>

        {filteredBuckets.length === 0 ? (
          <div style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
            No buckets match search.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {filteredBuckets.map((b) => {
              const isSelected = selectedBucket?.id === b.id;
              return (
                <div
                  key={b.id}
                  onClick={() => onSelectBucket(b)}
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

                  <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenBucketSettings(b);
                      }}
                      style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: "0.25rem" }}
                      title="Bucket Settings"
                    >
                      <Settings className="w-3.5 h-3.5 hover:text-indigo-400" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteBucket(b);
                      }}
                      style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: "0.25rem" }}
                      title="Delete bucket"
                    >
                      <Trash2 className="w-3.5 h-3.5 hover:text-rose-500" />
                    </button>
                  </div>
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
          minHeight: 480,
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
              Multi-file direct-to-storage high-speed transfer
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
                  <button
                    onClick={() => onOpenBucketSettings(selectedBucket)}
                    className="btn-secondary"
                    style={{ padding: "0.15rem 0.4rem", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                  >
                    <Settings className="w-3 h-3 text-slate-400" />
                    Settings
                  </button>
                </div>
                {selectedBucket.description && (
                  <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                    {selectedBucket.description}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                {/* View Switcher */}
                <div
                  style={{
                    display: "flex",
                    background: "var(--bg-inset)",
                    borderRadius: "0.375rem",
                    padding: "0.15rem",
                    border: "1px solid var(--border)",
                  }}
                >
                  <button
                    onClick={() => setViewMode("TABLE")}
                    style={{
                      background: viewMode === "TABLE" ? "var(--card-bg)" : "none",
                      border: "none",
                      padding: "0.3rem 0.4rem",
                      borderRadius: "0.25rem",
                      cursor: "pointer",
                      color: viewMode === "TABLE" ? "var(--accent)" : "var(--muted)",
                    }}
                    title="Table View"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode("GRID")}
                    style={{
                      background: viewMode === "GRID" ? "var(--card-bg)" : "none",
                      border: "none",
                      padding: "0.3rem 0.4rem",
                      borderRadius: "0.25rem",
                      cursor: "pointer",
                      color: viewMode === "GRID" ? "var(--accent)" : "var(--muted)",
                    }}
                    title="Grid View"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                </div>

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
                      onChangeFolder(`${currentFolder}${clean}`);
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
                onClick={() => onChangeFolder("")}
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
                          onClick={() => onChangeFolder(segmentPath)}
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

            {/* Bulk Actions Toolbar */}
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

            {/* Content Rendering: Table or Grid */}
            {loadingObjects ? (
              <div style={{ padding: "4rem 0", textAlign: "center", color: "var(--muted)" }}>
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
                  Drag and drop files here or click upload to store files in this bucket.
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-secondary"
                  style={{ marginTop: "1rem", fontSize: "0.8rem" }}
                >
                  Select Files to Upload
                </button>
              </div>
            ) : viewMode === "TABLE" ? (
              /* TABLE VIEW */
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
                    {/* Folders */}
                    {commonPrefixes.map((prefix) => {
                      const folderDisplay = prefix.slice(currentFolder.length).replace(/\/$/, "");
                      return (
                        <tr
                          key={prefix}
                          onClick={() => onChangeFolder(prefix)}
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
                              style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}
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
                            <div style={{ display: "flex", gap: "0.35rem", justifyContent: "flex-end", alignItems: "center" }}>
                              <button
                                onClick={() => openInspector(obj)}
                                className="btn-secondary"
                                style={{ padding: "0.25rem 0.45rem", fontSize: "0.75rem", borderRadius: 4 }}
                                title="Inspect & Edit Metadata"
                              >
                                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                              </button>
                              <button
                                onClick={() => handleCopyUrl(obj)}
                                className="btn-secondary"
                                style={{ padding: "0.25rem 0.45rem", fontSize: "0.75rem", borderRadius: 4 }}
                                title={selectedBucket.isPublic ? "Copy Public CDN URL" : "Copy Signed URL"}
                              >
                                {copiedKey === obj.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => handleDownloadObject(obj)}
                                className="btn-secondary"
                                style={{ padding: "0.25rem 0.45rem", fontSize: "0.75rem", borderRadius: 4 }}
                                title="Download File"
                              >
                                <Download className="w-3.5 h-3.5 text-sky-500" />
                              </button>
                              <button
                                onClick={() => handleDeleteObject(obj)}
                                className="btn-secondary"
                                style={{ padding: "0.25rem 0.45rem", fontSize: "0.75rem", borderRadius: 4 }}
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
            ) : (
              /* GRID VIEW */
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: "1rem",
                }}
              >
                {/* Folders in Grid */}
                {commonPrefixes.map((prefix) => {
                  const folderDisplay = prefix.slice(currentFolder.length).replace(/\/$/, "");
                  return (
                    <div
                      key={prefix}
                      onClick={() => onChangeFolder(prefix)}
                      style={{
                        padding: "1rem",
                        background: "var(--bg-inset)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.5rem",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "0.5rem",
                        textAlign: "center",
                      }}
                      className="hover:border-indigo-400"
                    >
                      <Folder className="w-10 h-10 text-amber-500 fill-amber-500/20" />
                      <span style={{ fontWeight: 600, fontSize: "0.85rem", wordBreak: "break-all" }}>
                        {folderDisplay}/
                      </span>
                    </div>
                  );
                })}

                {/* Files in Grid */}
                {filteredObjects.map((obj) => {
                  const displayName = currentFolder ? obj.name.slice(currentFolder.length) : obj.name;
                  const isSelected = selectedPaths.has(obj.name);
                  return (
                    <div
                      key={obj.id}
                      onClick={() => openInspector(obj)}
                      style={{
                        padding: "0.85rem",
                        background: isSelected ? "var(--accent-glow)" : "var(--bg-inset)",
                        border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                        borderRadius: "0.5rem",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: "0.5rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ padding: "0.4rem", borderRadius: "0.35rem", background: "var(--card-bg)" }}>
                          {getFileIcon(obj.name, obj.mimeType)}
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleSelectObject(obj.name)}
                        />
                      </div>

                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: "0.85rem",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={displayName}
                        >
                          {displayName}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.15rem" }}>
                          {formatBytes(obj.size)}
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.3rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border-light)" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyUrl(obj);
                          }}
                          className="btn-secondary"
                          style={{ padding: "0.2rem 0.4rem", fontSize: "0.7rem" }}
                          title="Copy URL"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadObject(obj);
                          }}
                          className="btn-secondary"
                          style={{ padding: "0.2rem 0.4rem", fontSize: "0.7rem" }}
                          title="Download"
                        >
                          <Download className="w-3 h-3 text-sky-500" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteObject(obj);
                          }}
                          className="btn-secondary"
                          style={{ padding: "0.2rem 0.4rem", fontSize: "0.7rem" }}
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3 text-rose-500" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: "4rem 2rem", textAlign: "center", color: "var(--muted)" }}>
            <Folder className="w-10 h-10 text-slate-400" style={{ margin: "0 auto 0.5rem" }} />
            <p style={{ fontWeight: 600 }}>No Bucket Selected</p>
            <p style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
              Select a bucket from the left menu or create a new bucket to view and manage files.
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
              width: 440,
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

            {/* Thumbnail Preview for Images */}
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
                      ? `${
                          typeof window !== "undefined" && window.location.hostname.includes("whizan.cloud")
                            ? "https://api.whizan.cloud"
                            : window.location.origin
                        }/public/${encodeURIComponent(selectedBucket.name)}/${inspectingObject.name
                          .split("/")
                          .map(encodeURIComponent)
                          .join("/")}`
                      : ""
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
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
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

            {/* Presigned Download Generator Card */}
            <div
              style={{
                background: "var(--bg-inset)",
                borderRadius: "0.5rem",
                padding: "1rem",
                border: "1px solid var(--border)",
                marginBottom: "1.25rem",
              }}
            >
              <h4 style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.5rem" }}>
                Generate Temporary Signed URL
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <div>
                  <label style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600, display: "block" }}>
                    Expiry Duration
                  </label>
                  <select
                    value={signedUrlDuration}
                    onChange={(e) => setSignedUrlDuration(parseInt(e.target.value, 10))}
                    style={{
                      width: "100%",
                      padding: "0.35rem 0.5rem",
                      borderRadius: "0.25rem",
                      border: "1px solid var(--border)",
                      background: "var(--card-bg)",
                      fontSize: "0.8rem",
                      marginTop: "0.2rem",
                    }}
                  >
                    <option value={900}>15 Minutes</option>
                    <option value={3600}>1 Hour</option>
                    <option value={21600}>6 Hours</option>
                    <option value={86400}>24 Hours</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600, display: "block" }}>
                    Download Filename
                  </label>
                  <input
                    type="text"
                    value={signedDownloadFilename}
                    onChange={(e) => setSignedDownloadFilename(e.target.value)}
                    placeholder="custom-name.ext"
                    style={{
                      width: "100%",
                      padding: "0.35rem 0.5rem",
                      borderRadius: "0.25rem",
                      border: "1px solid var(--border)",
                      background: "var(--card-bg)",
                      fontSize: "0.8rem",
                      marginTop: "0.2rem",
                    }}
                  />
                </div>
              </div>

              <button
                onClick={handleGenerateCustomSignedUrl}
                className="btn btn-secondary"
                style={{ width: "100%", fontSize: "0.8rem", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.3rem" }}
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Signed URL
              </button>
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
  );
}
