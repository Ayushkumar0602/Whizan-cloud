"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Code2,
  Copy,
  Check,
  Sliders,
  Terminal,
  ExternalLink,
  Layers,
  Sparkles,
  Info,
  Globe,
  HardDrive,
  FileCode,
  Image as ImageIcon,
  Key,
  ShieldCheck,
  Plus,
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Download,
  Trash2,
  FolderSync,
  FileText,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  apiKeysApi,
  type StorageBucketItem,
  type StorageObjectItem,
  type ApiKeyItem,
  type CreatedApiKey,
} from "@/lib/api";

interface StorageDeveloperDocsProps {
  buckets: StorageBucketItem[];
  selectedBucket: StorageBucketItem | null;
  objects: StorageObjectItem[];
}

export function StorageDeveloperDocs({
  buckets,
  selectedBucket,
  objects,
}: StorageDeveloperDocsProps) {
  const [activeSubTab, setActiveSubTab] = useState<
    "SDK_JS" | "S3_GATEWAY" | "IMAGE_TRANSFORMS" | "REST_API"
  >("SDK_JS");
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // API Key Management State
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [useRealKeyInCode, setUseRealKeyInCode] = useState(false);

  // Bucket categorization
  const publicBuckets = buckets.filter((b) => b.isPublic);

  // Snippet Template Customizer State
  const [sampleBucketMode, setSampleBucketMode] = useState<"standard" | "custom">("standard");
  const [customBucketName, setCustomBucketName] = useState<string>(
    buckets[0]?.name || "my-bucket"
  );

  const targetBucket =
    sampleBucketMode === "standard" ? "my-bucket" : (customBucketName || "my-bucket");
  const targetPublicBucket =
    sampleBucketMode === "standard"
      ? "my-public-bucket"
      : (publicBuckets[0]?.name || targetBucket);
  const targetBucketId =
    sampleBucketMode === "standard"
      ? ":bucketId"
      : (buckets.find((b) => b.name === customBucketName)?.id || ":bucketId");

  // Image Transform Playground State
  const [selectedTransformBucket, setSelectedTransformBucket] = useState<string>(
    publicBuckets[0]?.name || selectedBucket?.name || "public-assets"
  );
  const [transformPath, setTransformPath] = useState<string>(
    objects.find((o) => o.mimeType.startsWith("image/"))?.name || "photos/banner.png"
  );
  const [transformWidth, setTransformWidth] = useState<number>(600);
  const [transformHeight, setTransformHeight] = useState<number>(400);
  const [transformFormat, setTransformFormat] = useState<string>("webp");
  const [transformQuality, setTransformQuality] = useState<number>(85);
  const [transformFit, setTransformFit] = useState<string>("cover");

  const loadApiKeys = async () => {
    setLoadingKeys(true);
    try {
      const keys = await apiKeysApi.list();
      setApiKeys(keys || []);
    } catch {
      // ignore
    } finally {
      setLoadingKeys(false);
    }
  };

  useEffect(() => {
    loadApiKeys();
  }, []);

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingKey(true);
    try {
      const label = newKeyLabel.trim() || "Storage Client Key";
      const created = await apiKeysApi.create(label);
      setNewKey(created);
      setNewKeyLabel("");
      setShowKeyForm(false);
      setUseRealKeyInCode(true);
      toast.success(`API Key '${label}' generated successfully.`);
      await loadApiKeys();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate API Key");
    } finally {
      setCreatingKey(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const getStorageBaseUrl = () => {
    if (typeof window !== "undefined") {
      if (window.location.hostname.includes("whizan.cloud")) {
        return "https://api.whizan.cloud";
      }
      return window.location.origin;
    }
    return "https://api.whizan.cloud";
  };

  const baseUrl = getStorageBaseUrl();

  // Active Key representation for code snippets
  const activeSecretKey =
    newKey && useRealKeyInCode
      ? newKey.key
      : apiKeys[0]?.keyPrefix && useRealKeyInCode
      ? `${apiKeys[0].keyPrefix}`
      : "whz_live_your_api_key_here";

  const activeEnvKey =
    newKey && useRealKeyInCode ? `"${newKey.key}"` : "process.env.WHIZAN_API_KEY!";

  const generatedTransformUrl = `${baseUrl}/public/${encodeURIComponent(
    selectedTransformBucket
  )}/${transformPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}?w=${transformWidth}&h=${transformHeight}&format=${transformFormat}&q=${transformQuality}&fit=${transformFit}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* ── Prominent API Key Origin & Management Assistant ──────────────────── */}
      <div
        className="card"
        style={{
          padding: "1.25rem",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "0.75rem",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "rgba(79, 70, 229, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Key className="w-4 h-4 text-indigo-500" />
              </div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>
                API Keys & Authentication Setup
              </h3>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.35rem", maxWidth: 720 }}>
              All client SDK requests (<code style={{ fontSize: "0.8rem", color: "var(--accent)" }}>@whizan/storage-js</code>), AWS S3 gateway commands, and REST API calls require an authenticated Whizan API key (<code style={{ fontSize: "0.8rem" }}>whz_live_...</code>).
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              onClick={() => setShowKeyForm((prev) => !prev)}
              className="btn btn-primary"
              style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Plus className="w-3.5 h-3.5" />
              {showKeyForm ? "Cancel" : "Generate Storage Key"}
            </button>
            <Link
              href="/dashboard/settings"
              className="btn btn-secondary"
              style={{ fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              Manage in Settings
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </Link>
          </div>
        </div>

        {/* New Key Alert Banner */}
        {newKey && (
          <div
            style={{
              marginTop: "1rem",
              background: "rgba(16, 185, 129, 0.08)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: "0.5rem",
              padding: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--success)" }}>
                Active API Key Generated ({newKey.name})
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--warning)", fontWeight: 600 }}>
                Save this key now — for security, it cannot be displayed again!
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <code
                style={{
                  flex: 1,
                  background: "var(--bg-inset)",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.375rem",
                  fontSize: "0.85rem",
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                  color: "var(--foreground)",
                }}
              >
                {newKey.key}
              </code>
              <button
                onClick={() => copyToClipboard(newKey.key, "new-key")}
                className="btn btn-secondary"
                style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem", display: "flex", gap: "0.35rem", alignItems: "center" }}
              >
                {copiedSnippet === "new-key" ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                Copy Key
              </button>
            </div>
          </div>
        )}

        {/* Quick Key Generator Inline Form */}
        {showKeyForm && (
          <form
            onSubmit={handleCreateApiKey}
            style={{
              marginTop: "1rem",
              padding: "1rem",
              background: "var(--bg-inset)",
              borderRadius: "0.5rem",
              border: "1px solid var(--border)",
              display: "flex",
              gap: "0.75rem",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              placeholder="Key label (e.g. Next.js Production, Backend S3 Worker)"
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              style={{
                flex: 1,
                padding: "0.5rem 0.75rem",
                borderRadius: "0.375rem",
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                fontSize: "0.85rem",
              }}
            />
            <button
              type="submit"
              disabled={creatingKey}
              className="btn btn-primary"
              style={{ fontSize: "0.82rem", whiteSpace: "nowrap" }}
            >
              {creatingKey ? "Generating..." : "Create Live Key"}
            </button>
          </form>
        )}

        {/* Existing Keys Summary & Snippet Toggle */}
        <div
          style={{
            marginTop: "1rem",
            paddingTop: "0.75rem",
            borderTop: "1px solid var(--border-light)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            fontSize: "0.8rem",
            color: "var(--muted)",
          }}
        >
          <div>
            <span>Your Active API Keys: </span>
            <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
              {apiKeys.length} configured in{" "}
              <Link href="/dashboard/settings" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                Settings &gt; API Keys
              </Link>
            </span>
            {apiKeys.length > 0 && (
              <span style={{ marginLeft: "0.5rem", fontFamily: "monospace", fontSize: "0.75rem" }}>
                ({apiKeys.map((k) => k.name).join(", ")})
              </span>
            )}
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              cursor: "pointer",
              userSelect: "none",
              fontWeight: 500,
            }}
          >
            <input
              type="checkbox"
              checked={useRealKeyInCode}
              onChange={(e) => setUseRealKeyInCode(e.target.checked)}
            />
            <span>Insert my active key in code snippets below</span>
          </label>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          gap: "1rem",
        }}
      >
        <button
          onClick={() => setActiveSubTab("SDK_JS")}
          style={{
            padding: "0.6rem 0.25rem",
            borderBottom:
              activeSubTab === "SDK_JS"
                ? "2px solid var(--accent)"
                : "2px solid transparent",
            color:
              activeSubTab === "SDK_JS"
                ? "var(--foreground)"
                : "var(--muted)",
            fontWeight: activeSubTab === "SDK_JS" ? 600 : 500,
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          <Code2 className="w-4 h-4 text-indigo-400" />
          @whizan/storage-js SDK
        </button>

        <button
          onClick={() => setActiveSubTab("S3_GATEWAY")}
          style={{
            padding: "0.6rem 0.25rem",
            borderBottom:
              activeSubTab === "S3_GATEWAY"
                ? "2px solid var(--accent)"
                : "2px solid transparent",
            color:
              activeSubTab === "S3_GATEWAY"
                ? "var(--foreground)"
                : "var(--muted)",
            fontWeight: activeSubTab === "S3_GATEWAY" ? 600 : 500,
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          <Terminal className="w-4 h-4 text-emerald-400" />
          AWS S3 Gateway Protocol
        </button>

        <button
          onClick={() => setActiveSubTab("IMAGE_TRANSFORMS")}
          style={{
            padding: "0.6rem 0.25rem",
            borderBottom:
              activeSubTab === "IMAGE_TRANSFORMS"
                ? "2px solid var(--accent)"
                : "2px solid transparent",
            color:
              activeSubTab === "IMAGE_TRANSFORMS"
                ? "var(--foreground)"
                : "var(--muted)",
            fontWeight: activeSubTab === "IMAGE_TRANSFORMS" ? 600 : 500,
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          <Sliders className="w-4 h-4 text-sky-400" />
          Image Transformations Playground
        </button>

        <button
          onClick={() => setActiveSubTab("REST_API")}
          style={{
            padding: "0.6rem 0.25rem",
            borderBottom:
              activeSubTab === "REST_API"
                ? "2px solid var(--accent)"
                : "2px solid transparent",
            color:
              activeSubTab === "REST_API"
                ? "var(--foreground)"
                : "var(--muted)",
            fontWeight: activeSubTab === "REST_API" ? 600 : 500,
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          <Globe className="w-4 h-4 text-amber-400" />
          REST API & cURL
        </button>
      </div>

      {/* ── Sub-Tab 1: @whizan/storage-js SDK ─────────────────────────────────── */}
      {activeSubTab === "SDK_JS" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Quick Install Banner */}
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.4rem" }}>
              Install Client SDK
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
              Official TypeScript/JavaScript client library for Whizan Cloud Storage with Node.js and modern browser support.
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.6rem 1rem",
                background: "var(--bg-inset)",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                fontFamily: "monospace",
                fontSize: "0.85rem",
              }}
            >
              <span>npm install @whizan/storage-js</span>
              <button
                onClick={() => copyToClipboard("npm install @whizan/storage-js", "install")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--muted)",
                }}
              >
                {copiedSnippet === "install" ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4 hover:text-indigo-400" />
                )}
              </button>
            </div>
          </div>

          {/* Snippet Context Customizer Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.75rem 1rem",
              background: "var(--bg-inset)",
              borderRadius: "0.5rem",
              border: "1px solid var(--border)",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--muted)" }}>
                Code Template Mode:
              </span>
              <div
                style={{
                  display: "inline-flex",
                  background: "var(--card-bg)",
                  padding: 2,
                  borderRadius: "0.375rem",
                  border: "1px solid var(--border)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setSampleBucketMode("standard")}
                  style={{
                    padding: "0.25rem 0.6rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    borderRadius: 4,
                    border: "none",
                    cursor: "pointer",
                    background: sampleBucketMode === "standard" ? "var(--accent)" : "transparent",
                    color: sampleBucketMode === "standard" ? "#fff" : "var(--muted)",
                  }}
                >
                  Standard Template (&quot;my-bucket&quot;)
                </button>
                <button
                  type="button"
                  onClick={() => setSampleBucketMode("custom")}
                  style={{
                    padding: "0.25rem 0.6rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    borderRadius: 4,
                    border: "none",
                    cursor: "pointer",
                    background: sampleBucketMode === "custom" ? "var(--accent)" : "transparent",
                    color: sampleBucketMode === "custom" ? "#fff" : "var(--muted)",
                  }}
                >
                  Workspace Buckets ({buckets.length})
                </button>
              </div>
            </div>

            {sampleBucketMode === "custom" && buckets.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Target Bucket:</span>
                <select
                  value={customBucketName}
                  onChange={(e) => setCustomBucketName(e.target.value)}
                  style={{
                    padding: "0.25rem 0.6rem",
                    fontSize: "0.8rem",
                    borderRadius: "0.375rem",
                    border: "1px solid var(--border)",
                    background: "var(--card-bg)",
                    color: "var(--foreground)",
                    fontWeight: 600,
                  }}
                >
                  {buckets.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name} ({b.isPublic ? "Public" : "Private"})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Active bucket in snippets:</span>
              <code
                style={{
                  fontSize: "0.75rem",
                  padding: "0.15rem 0.45rem",
                  borderRadius: 4,
                  background: "var(--card-bg)",
                  border: "1px solid var(--border)",
                  color: "var(--accent)",
                  fontFamily: "monospace",
                  fontWeight: 600,
                }}
              >
                &quot;{targetBucket}&quot;
              </code>
            </div>
          </div>

          {/* Client Initialization */}
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>Client Initialization</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Pass your Whizan Cloud API URL and API Key from your environment.
                </p>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `import { createStorageClient } from "@whizan/storage-js";\n\nexport const storage = createStorageClient({\n  projectUrl: "${baseUrl}",\n  apiKey: ${activeEnvKey},\n});`,
                    "init"
                  )
                }
                className="btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              >
                {copiedSnippet === "init" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Code
              </button>
            </div>

            <pre
              style={{
                padding: "1rem",
                background: "var(--bg-inset)",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                fontSize: "0.8rem",
                fontFamily: "monospace",
                overflowX: "auto",
                margin: 0,
                color: "var(--foreground)",
              }}
            >{`import { createStorageClient } from "@whizan/storage-js";

export const storage = createStorageClient({
  projectUrl: "${baseUrl}",
  apiKey: ${activeEnvKey},
});`}</pre>
          </div>

          {/* 1. File Upload Snippet */}
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>1. Direct Presigned Upload</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  High-speed upload directly to edge storage with optional MIME type, caching headers, and upsert.
                </p>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `const { data, error } = await storage\n  .from("${targetBucket}")\n  .upload("documents/report.pdf", fileBuffer, {\n    contentType: "application/pdf",\n    cacheControl: "public, max-age=86400",\n    upsert: true,\n  });\n\nif (error) {\n  console.error("Upload error:", error.message);\n} else {\n  console.log("Uploaded successfully:", data.path, data.size);\n}`,
                    "upload"
                  )
                }
                className="btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              >
                {copiedSnippet === "upload" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Code
              </button>
            </div>

            <pre
              style={{
                padding: "1rem",
                background: "var(--bg-inset)",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                fontSize: "0.8rem",
                fontFamily: "monospace",
                overflowX: "auto",
                margin: 0,
                color: "var(--foreground)",
              }}
            >{`const { data, error } = await storage
  .from("${targetBucket}")
  .upload("documents/report.pdf", fileBuffer, {
    contentType: "application/pdf",
    cacheControl: "public, max-age=86400",
    upsert: true,
  });

if (error) {
  console.error("Upload error:", error.message);
} else {
  console.log("Uploaded successfully:", data.path, data.size);
}`}</pre>
          </div>

          {/* 2. Download Snippet */}
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>2. Download Object</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Download file contents directly as a Blob (browser) or stream/buffer (Node.js).
                </p>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `const { data, error } = await storage\n  .from("${targetBucket}")\n  .download("documents/report.pdf");\n\nif (error) {\n  console.error("Download failed:", error.message);\n} else {\n  // In browser: const text = await data.text(); or URL.createObjectURL(data);\n  // In Node.js: Buffer.from(await data.arrayBuffer());\n  console.log("Downloaded bytes:", data.size);\n}`,
                    "download"
                  )
                }
                className="btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              >
                {copiedSnippet === "download" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Code
              </button>
            </div>

            <pre
              style={{
                padding: "1rem",
                background: "var(--bg-inset)",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                fontSize: "0.8rem",
                fontFamily: "monospace",
                overflowX: "auto",
                margin: 0,
                color: "var(--foreground)",
              }}
            >{`const { data, error } = await storage
  .from("${targetBucket}")
  .download("documents/report.pdf");

if (error) {
  console.error("Download failed:", error.message);
} else {
  // In browser: const text = await data.text(); or URL.createObjectURL(data);
  // In Node.js: Buffer.from(await data.arrayBuffer());
  console.log("Downloaded bytes:", data.size);
}`}</pre>
          </div>

          {/* 3. Update Metadata Snippet */}
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>3. Update Object Metadata</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Update Cache-Control, Content-Disposition, and custom JSON metadata without re-uploading file body.
                </p>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `const { data, error } = await storage\n  .from("${targetBucket}")\n  .updateMetadata("documents/report.pdf", {\n    cacheControl: "public, max-age=31536000, immutable",\n    contentDisposition: 'attachment; filename="annual-report-2026.pdf"',\n    metadata: {\n      department: "finance",\n      audited: true,\n      retentionYears: 7,\n    },\n  });\n\nif (error) {\n  console.error("Metadata update error:", error.message);\n} else {\n  console.log("Updated metadata successfully:", data);\n}`,
                    "updateMetadata"
                  )
                }
                className="btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              >
                {copiedSnippet === "updateMetadata" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Code
              </button>
            </div>

            <pre
              style={{
                padding: "1rem",
                background: "var(--bg-inset)",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                fontSize: "0.8rem",
                fontFamily: "monospace",
                overflowX: "auto",
                margin: 0,
                color: "var(--foreground)",
              }}
            >{`const { data, error } = await storage
  .from("${targetBucket}")
  .updateMetadata("documents/report.pdf", {
    cacheControl: "public, max-age=31536000, immutable",
    contentDisposition: 'attachment; filename="annual-report-2026.pdf"',
    metadata: {
      department: "finance",
      audited: true,
      retentionYears: 7,
    },
  });

if (error) {
  console.error("Metadata update error:", error.message);
} else {
  console.log("Updated metadata successfully:", data);
}`}</pre>
          </div>

          {/* 4. Get Metadata Snippet */}
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>4. Retrieve Object Metadata</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Inspect file size, MIME type, and custom key-value tags without downloading object payload.
                </p>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `const { data, error } = await storage\n  .from("${targetBucket}")\n  .getMetadata("documents/report.pdf");\n\nif (error) {\n  console.error("Metadata lookup error:", error.message);\n} else {\n  console.log("Content-Type:", data.mimeType);\n  console.log("File Size:", data.size, "bytes");\n  console.log("Custom Tags:", data.metadata);\n}`,
                    "getMetadata"
                  )
                }
                className="btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              >
                {copiedSnippet === "getMetadata" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Code
              </button>
            </div>

            <pre
              style={{
                padding: "1rem",
                background: "var(--bg-inset)",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                fontSize: "0.8rem",
                fontFamily: "monospace",
                overflowX: "auto",
                margin: 0,
                color: "var(--foreground)",
              }}
            >{`const { data, error } = await storage
  .from("${targetBucket}")
  .getMetadata("documents/report.pdf");

if (error) {
  console.error("Metadata lookup error:", error.message);
} else {
  console.log("Content-Type:", data.mimeType);
  console.log("File Size:", data.size, "bytes");
  console.log("Custom Tags:", data.metadata);
}`}</pre>
          </div>

          {/* 5. Signed URL Snippet */}
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>5. Temporary Presigned Download URL</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Generate an authenticated, time-limited URL for secure private downloads with custom attachment headers.
                </p>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `const { data, error } = await storage\n  .from("${targetBucket}")\n  .createSignedUrl("documents/report.pdf", 900, {\n    download: "annual-report-2026.pdf",\n  });\n\nif (data?.signedUrl) {\n  console.log("Temporary download URL (expires in 15m):", data.signedUrl);\n}`,
                    "signedUrl"
                  )
                }
                className="btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              >
                {copiedSnippet === "signedUrl" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Code
              </button>
            </div>

            <pre
              style={{
                padding: "1rem",
                background: "var(--bg-inset)",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                fontSize: "0.8rem",
                fontFamily: "monospace",
                overflowX: "auto",
                margin: 0,
                color: "var(--foreground)",
              }}
            >{`const { data, error } = await storage
  .from("${targetBucket}")
  .createSignedUrl("documents/report.pdf", 900, {
    download: "annual-report-2026.pdf",
  });

if (data?.signedUrl) {
  console.log("Temporary download URL (expires in 15m):", data.signedUrl);
}`}</pre>
          </div>

          {/* 6. Public CDN URL & Transformations Snippet */}
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>6. Public CDN URL & Real-Time Transformations</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Retrieve an Edge CDN URL with on-the-fly Sharp image optimization (resize, format, quality, crop).
                </p>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `const { data } = storage\n  .from("${targetPublicBucket}")\n  .getPublicUrl("avatars/user.png", {\n    transform: {\n      width: 400,\n      height: 400,\n      format: "webp",\n      quality: 80,\n      fit: "cover",\n    },\n  });\n\nconsole.log("Public CDN URL:", data.publicUrl);`,
                    "publicUrl"
                  )
                }
                className="btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              >
                {copiedSnippet === "publicUrl" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Code
              </button>
            </div>

            <pre
              style={{
                padding: "1rem",
                background: "var(--bg-inset)",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                fontSize: "0.8rem",
                fontFamily: "monospace",
                overflowX: "auto",
                margin: 0,
                color: "var(--foreground)",
              }}
            >{`const { data } = storage
  .from("${targetPublicBucket}")
  .getPublicUrl("avatars/user.png", {
    transform: {
      width: 400,
      height: 400,
      format: "webp",
      quality: 80,
      fit: "cover",
    },
  });

console.log("Public CDN URL:", data.publicUrl);`}</pre>
          </div>

          {/* 7. Copy & Move Snippet */}
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>7. Copy & Move Objects</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Duplicate an object across folder paths or perform an atomic rename/move operation.
                </p>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `// 1. Copy object\nconst copyResult = await storage\n  .from("${targetBucket}")\n  .copy("documents/report.pdf", "archive/2026-report.pdf");\n\n// 2. Move or rename object (source is purged after transfer)\nconst moveResult = await storage\n  .from("${targetBucket}")\n  .move("archive/2026-report.pdf", "vault/2026-final.pdf");`,
                    "copyMove"
                  )
                }
                className="btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              >
                {copiedSnippet === "copyMove" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Code
              </button>
            </div>

            <pre
              style={{
                padding: "1rem",
                background: "var(--bg-inset)",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                fontSize: "0.8rem",
                fontFamily: "monospace",
                overflowX: "auto",
                margin: 0,
                color: "var(--foreground)",
              }}
            >{`// 1. Copy object
const copyResult = await storage
  .from("${targetBucket}")
  .copy("documents/report.pdf", "archive/2026-report.pdf");

// 2. Move or rename object (source is purged after transfer)
const moveResult = await storage
  .from("${targetBucket}")
  .move("archive/2026-report.pdf", "vault/2026-final.pdf");`}</pre>
          </div>

          {/* 8. Remove Objects Snippet */}
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>8. Bulk Remove Objects</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Safely delete one or multiple files in a single batch request (moved to soft-delete bin).
                </p>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `const { data, error } = await storage\n  .from("${targetBucket}")\n  .remove([\n    "documents/draft-report.pdf",\n    "temp/scratch-upload.tmp",\n  ]);\n\nif (error) {\n  console.error("Deletion error:", error.message);\n} else {\n  console.log("Successfully removed objects:", data.length);\n}`,
                    "remove"
                  )
                }
                className="btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              >
                {copiedSnippet === "remove" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Code
              </button>
            </div>

            <pre
              style={{
                padding: "1rem",
                background: "var(--bg-inset)",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                fontSize: "0.8rem",
                fontFamily: "monospace",
                overflowX: "auto",
                margin: 0,
                color: "var(--foreground)",
              }}
            >{`const { data, error } = await storage
  .from("${targetBucket}")
  .remove([
    "documents/draft-report.pdf",
    "temp/scratch-upload.tmp",
  ]);

if (error) {
  console.error("Deletion error:", error.message);
} else {
  console.log("Successfully removed objects:", data.length);
}`}</pre>
          </div>

          {/* 9. Bucket Lifecycle & Quota Snippet */}
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>9. Bucket Lifecycle & Quota Inspection</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Programmatically provision buckets, configure MIME whitelists, and monitor quota metrics.
                </p>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `// 1. List accessible buckets\nconst { data: buckets } = await storage.listBuckets();\n\n// 2. Provision new bucket with strict MIME-type isolation\nconst { data: newBucket } = await storage.createBucket("backups", {\n  public: false,\n  allowedMimeTypes: ["application/gzip", "application/zip"],\n});\n\n// 3. Inspect real-time storage quota\nconst { data: usage } = await storage.getUsage();\nconsole.log(\`Storage used: \${usage.quota.usedMb} MB / \${usage.quota.allocatedMb} MB\`);`,
                    "bucketOps"
                  )
                }
                className="btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              >
                {copiedSnippet === "bucketOps" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Code
              </button>
            </div>

            <pre
              style={{
                padding: "1rem",
                background: "var(--bg-inset)",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                fontSize: "0.8rem",
                fontFamily: "monospace",
                overflowX: "auto",
                margin: 0,
                color: "var(--foreground)",
              }}
            >{`// 1. List accessible buckets
const { data: buckets } = await storage.listBuckets();

// 2. Provision new bucket with strict MIME-type isolation
const { data: newBucket } = await storage.createBucket("backups", {
  public: false,
  allowedMimeTypes: ["application/gzip", "application/zip"],
});

// 3. Inspect real-time storage quota
const { data: usage } = await storage.getUsage();
console.log(\`Storage used: \${usage.quota.usedMb} MB / \${usage.quota.allocatedMb} MB\`);`}</pre>
          </div>
        </div>
      )}

      {/* ── Sub-Tab 2: AWS S3 Gateway Protocol ────────────────────────────────── */}
      {activeSubTab === "S3_GATEWAY" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Gateway Credentials Card */}
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.4rem" }}>
              S3 Gateway Connection Details
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
              Standard AWS S3-compatible REST gateway. Compatible with AWS CLI, boto3, MinIO client, Cyberduck, and rclone.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "1rem",
              }}
            >
              <div style={{ padding: "0.75rem", background: "var(--bg-inset)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>S3 ENDPOINT URL</div>
                <div style={{ fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 700, marginTop: "0.25rem", wordBreak: "break-all" }}>
                  {baseUrl}/api/storage/v1/s3
                </div>
              </div>

              <div style={{ padding: "0.75rem", background: "var(--bg-inset)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>REGION</div>
                <div style={{ fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 700, marginTop: "0.25rem" }}>
                  auto (or us-east-1)
                </div>
              </div>

              <div style={{ padding: "0.75rem", background: "var(--bg-inset)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>ACCESS KEY ID</div>
                <div style={{ fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 700, marginTop: "0.25rem" }}>
                  {apiKeys[0]?.id || "whz_key_id"}
                </div>
              </div>

              <div style={{ padding: "0.75rem", background: "var(--bg-inset)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>SECRET ACCESS KEY</div>
                <div style={{ fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 700, marginTop: "0.25rem", wordBreak: "break-all" }}>
                  {activeSecretKey}
                </div>
              </div>
            </div>

            <div style={{ marginTop: "1rem", fontSize: "0.75rem", color: "var(--muted)" }}>
              💡 Need a new S3 secret key? Click <strong>Generate Storage Key</strong> above or visit{" "}
              <Link href="/dashboard/settings" style={{ color: "var(--accent)", textDecoration: "underline" }}>
                Settings &gt; API Keys
              </Link>
              .
            </div>
          </div>

          {/* AWS CLI Configuration */}
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>AWS CLI Configuration & Usage</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Configure your environment and transfer files using standard aws s3 commands.
                </p>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `# Configure credentials\naws configure set aws_access_key_id "${apiKeys[0]?.id || "whz_key_id"}"\naws configure set aws_secret_access_key "${activeSecretKey}"\naws configure set default.region "auto"\n\n# List objects in bucket\naws s3 ls s3://${targetBucket}/ --endpoint-url ${baseUrl}/api/storage/v1/s3\n\n# Upload file to bucket\naws s3 cp ./report.pdf s3://${targetBucket}/documents/report.pdf \\\n  --endpoint-url ${baseUrl}/api/storage/v1/s3`,
                    "awscli"
                  )
                }
                className="btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              >
                {copiedSnippet === "awscli" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy CLI Commands
              </button>
            </div>

            <pre
              style={{
                padding: "1rem",
                background: "var(--bg-inset)",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                fontSize: "0.8rem",
                fontFamily: "monospace",
                overflowX: "auto",
                margin: 0,
                color: "var(--foreground)",
              }}
            >{`# Configure credentials
aws configure set aws_access_key_id "${apiKeys[0]?.id || "whz_key_id"}"
aws configure set aws_secret_access_key "${activeSecretKey}"
aws configure set default.region "auto"

# List objects in bucket
aws s3 ls s3://${targetBucket}/ --endpoint-url ${baseUrl}/api/storage/v1/s3

# Upload file to bucket
aws s3 cp ./report.pdf s3://${targetBucket}/documents/report.pdf \\
  --endpoint-url ${baseUrl}/api/storage/v1/s3`}</pre>
          </div>

          {/* Python Boto3 Configuration */}
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <div>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>Python (boto3) SDK</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Connect with Python backend services or machine learning pipelines.
                </p>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `import boto3\n\ns3 = boto3.client(\n    "s3",\n    endpoint_url="${baseUrl}/api/storage/v1/s3",\n    aws_access_key_id="${apiKeys[0]?.id || "whz_key_id"}",\n    aws_secret_access_key="${activeSecretKey}",\n    region_name="auto",\n)\n\n# Upload dataset file\ns3.upload_file("dataset.parquet", "${targetBucket}", "data/dataset.parquet")\n\n# Download file\ns3.download_file("${targetBucket}", "data/dataset.parquet", "local.parquet")`,
                    "boto3"
                  )
                }
                className="btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              >
                {copiedSnippet === "boto3" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy Python Code
              </button>
            </div>

            <pre
              style={{
                padding: "1rem",
                background: "var(--bg-inset)",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                fontSize: "0.8rem",
                fontFamily: "monospace",
                overflowX: "auto",
                margin: 0,
                color: "var(--foreground)",
              }}
            >{`import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="${baseUrl}/api/storage/v1/s3",
    aws_access_key_id="${apiKeys[0]?.id || "whz_key_id"}",
    aws_secret_access_key="${activeSecretKey}",
    region_name="auto",
)

# Upload dataset file
s3.upload_file("dataset.parquet", "${targetBucket}", "data/dataset.parquet")

# Download file
s3.download_file("${targetBucket}", "data/dataset.parquet", "local.parquet")`}</pre>
          </div>
        </div>
      )}

      {/* ── Sub-Tab 3: Image Transformations Playground ─────────────────────── */}
      {activeSubTab === "IMAGE_TRANSFORMS" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.35rem" }}>
              Sharp Engine Image Transformation Playground
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
              Public buckets natively support on-the-fly edge image transcoding, resizing, and compression via URL parameters.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", alignItems: "start" }}>
              {/* Controls Column */}
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "0.35rem" }}>
                    Source Public Bucket
                  </label>
                  <select
                    value={selectedTransformBucket}
                    onChange={(e) => setSelectedTransformBucket(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border)",
                      background: "var(--bg-inset)",
                      fontSize: "0.85rem",
                    }}
                  >
                    {publicBuckets.length === 0 ? (
                      <option value="public-assets">No public buckets (select any public bucket)</option>
                    ) : (
                      publicBuckets.map((b) => (
                        <option key={b.id} value={b.name}>
                          {b.name} (Public)
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "0.35rem" }}>
                    Image Object Path
                  </label>
                  <input
                    type="text"
                    value={transformPath}
                    onChange={(e) => setTransformPath(e.target.value)}
                    placeholder="e.g. photos/banner.png"
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border)",
                      background: "var(--bg-inset)",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "0.35rem" }}>
                      Width: {transformWidth}px
                    </label>
                    <input
                      type="range"
                      min={50}
                      max={1920}
                      step={10}
                      value={transformWidth}
                      onChange={(e) => setTransformWidth(parseInt(e.target.value, 10))}
                      style={{ width: "100%", accentColor: "var(--accent)" }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "0.35rem" }}>
                      Height: {transformHeight}px
                    </label>
                    <input
                      type="range"
                      min={50}
                      max={1080}
                      step={10}
                      value={transformHeight}
                      onChange={(e) => setTransformHeight(parseInt(e.target.value, 10))}
                      style={{ width: "100%", accentColor: "var(--accent)" }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "0.35rem" }}>
                      Output Format
                    </label>
                    <select
                      value={transformFormat}
                      onChange={(e) => setTransformFormat(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.5rem 0.75rem",
                        borderRadius: "0.5rem",
                        border: "1px solid var(--border)",
                        background: "var(--bg-inset)",
                        fontSize: "0.85rem",
                      }}
                    >
                      <option value="webp">WebP (High Compression)</option>
                      <option value="avif">AVIF (Next-Gen Ultra)</option>
                      <option value="png">PNG (Lossless)</option>
                      <option value="jpeg">JPEG</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "0.35rem" }}>
                      Quality ({transformQuality}%)
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={transformQuality}
                      onChange={(e) => setTransformQuality(parseInt(e.target.value, 10))}
                      style={{ width: "100%", accentColor: "var(--accent)" }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "0.35rem" }}>
                    Resizing Fit Strategy
                  </label>
                  <select
                    value={transformFit}
                    onChange={(e) => setTransformFit(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                      border: "1px solid var(--border)",
                      background: "var(--bg-inset)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="cover">cover (Crop to fill dimensions)</option>
                    <option value="contain">contain (Letterbox within bounds)</option>
                    <option value="fill">fill (Stretch to exact bounds)</option>
                    <option value="inside">inside (Preserve aspect, downscale only)</option>
                    <option value="outside">outside (Preserve aspect, cover bounds)</option>
                  </select>
                </div>
              </div>

              {/* Preview Column */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  background: "var(--bg-inset)",
                  padding: "1rem",
                  borderRadius: "0.75rem",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" }}>
                    Live Preview Output
                  </span>
                  <button
                    onClick={() => copyToClipboard(generatedTransformUrl, "url")}
                    className="btn-secondary"
                    style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                  >
                    {copiedSnippet === "url" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy URL
                  </button>
                </div>

                <div
                  style={{
                    minHeight: 220,
                    maxHeight: 320,
                    background: "var(--card-bg)",
                    border: "1px dashed var(--border)",
                    borderRadius: "0.5rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <img
                    src={generatedTransformUrl}
                    alt="Transformed Preview"
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--muted)",
                      fontSize: "0.8rem",
                      pointerEvents: "none",
                      padding: "1rem",
                      textAlign: "center",
                    }}
                  >
                    <ImageIcon className="w-8 h-8 text-slate-400 mb-2" />
                    <span>Upload an image to a public bucket to view live transformations.</span>
                  </div>
                </div>

                <div
                  style={{
                    padding: "0.5rem 0.75rem",
                    background: "var(--card-bg)",
                    borderRadius: "0.375rem",
                    border: "1px solid var(--border)",
                    fontFamily: "monospace",
                    fontSize: "0.75rem",
                    wordBreak: "break-all",
                    color: "var(--accent)",
                  }}
                >
                  {generatedTransformUrl}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub-Tab 4: REST API & cURL Reference ──────────────────────────────── */}
      {activeSubTab === "REST_API" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div
            className="card"
            style={{
              padding: "1.25rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.35rem" }}>
              Direct HTTP REST Endpoints
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
              Whizan Cloud Storage provides standard HTTP JSON endpoints authenticated via Bearer API keys.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* cURL Upload */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>POST /api/storage/v1/buckets/:id/objects/upload</span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `curl -X POST "${baseUrl}/api/storage/v1/buckets/${targetBucketId}/objects/upload" \\\n  -H "Authorization: Bearer ${activeSecretKey}" \\\n  -F "objectPath=documents/report.pdf" \\\n  -F "file=@report.pdf"`,
                        "curlUpload"
                      )
                    }
                    className="btn-secondary"
                    style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                  >
                    {copiedSnippet === "curlUpload" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy cURL
                  </button>
                </div>
                <pre
                  style={{
                    padding: "0.75rem 1rem",
                    background: "var(--bg-inset)",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border)",
                    fontSize: "0.8rem",
                    fontFamily: "monospace",
                    margin: 0,
                  }}
                >{`curl -X POST "${baseUrl}/api/storage/v1/buckets/${targetBucketId}/objects/upload" \\
  -H "Authorization: Bearer ${activeSecretKey}" \\
  -F "objectPath=documents/report.pdf" \\
  -F "file=@report.pdf"`}</pre>
              </div>

              {/* cURL Download URL */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>POST /api/storage/v1/buckets/:id/objects/download-url</span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `curl -X POST "${baseUrl}/api/storage/v1/buckets/${targetBucketId}/objects/download-url" \\\n  -H "Authorization: Bearer ${activeSecretKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"objectPath": "documents/report.pdf", "expiresInSeconds": 900}'`,
                        "curlDownload"
                      )
                    }
                    className="btn-secondary"
                    style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                  >
                    {copiedSnippet === "curlDownload" ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy cURL
                  </button>
                </div>
                <pre
                  style={{
                    padding: "0.75rem 1rem",
                    background: "var(--bg-inset)",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border)",
                    fontSize: "0.8rem",
                    fontFamily: "monospace",
                    margin: 0,
                  }}
                >{`curl -X POST "${baseUrl}/api/storage/v1/buckets/${targetBucketId}/objects/download-url" \\
  -H "Authorization: Bearer ${activeSecretKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"objectPath": "documents/report.pdf", "expiresInSeconds": 900}'`}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
