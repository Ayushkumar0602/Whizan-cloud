"use client";

import { useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import type { StorageBucketItem, StorageObjectItem } from "@/lib/api";

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

  // Image Transform Playground State
  const publicBuckets = buckets.filter((b) => b.isPublic);
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

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    toast.success("Snippet copied to clipboard");
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

  const generatedTransformUrl = `${baseUrl}/public/${encodeURIComponent(
    selectedTransformBucket
  )}/${transformPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}?w=${transformWidth}&h=${transformHeight}&format=${transformFormat}&q=${transformQuality}&fit=${transformFit}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
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
              Official TypeScript/JavaScript client library for Whizan Cloud Storage with browser and Node.js support.
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
                  Initialize the client using your project URL and Live API Key.
                </p>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `import { createStorageClient } from "@whizan/storage-js";\n\nexport const storage = createStorageClient({\n  projectUrl: "${baseUrl}",\n  apiKey: process.env.WHIZAN_API_KEY!,\n});`,
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
  apiKey: process.env.WHIZAN_API_KEY!,
});`}</pre>
          </div>

          {/* File Upload Snippet */}
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
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>1. Upload Object</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Upload a buffer, file, or blob directly to a bucket with optional cache headers.
                </p>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `const { data, error } = await storage\n  .from("${selectedBucket?.name || "documents"}")\n  .upload("invoices/2026/january.pdf", fileBuffer, {\n    contentType: "application/pdf",\n    cacheControl: "public, max-age=86400",\n    upsert: true,\n  });\n\nif (error) {\n  console.error("Upload error:", error.message);\n} else {\n  console.log("Uploaded successfully:", data.path, data.size);\n}`,
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
  .from("${selectedBucket?.name || "documents"}")
  .upload("invoices/2026/january.pdf", fileBuffer, {
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

          {/* Public CDN URL & Transformations Snippet */}
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
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>2. Public CDN URL & Transformations</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Retrieve an Edge CDN URL with on-the-fly Sharp image optimizations.
                </p>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `const { data } = storage\n  .from("${publicBuckets[0]?.name || "public-assets"}")\n  .getPublicUrl("avatars/user.png", {\n    transform: {\n      width: 400,\n      height: 400,\n      format: "webp",\n      quality: 80,\n      fit: "cover",\n    },\n  });\n\nconsole.log("Public URL:", data.publicUrl);`,
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
  .from("${publicBuckets[0]?.name || "public-assets"}")
  .getPublicUrl("avatars/user.png", {
    transform: {
      width: 400,
      height: 400,
      format: "webp",
      quality: 80,
      fit: "cover",
    },
  });

console.log("Public URL:", data.publicUrl);`}</pre>
          </div>

          {/* Signed URL Snippet */}
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
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700 }}>3. Temporary Presigned Download URL</h4>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Generate an authenticated, time-limited URL for secure private downloads.
                </p>
              </div>
              <button
                onClick={() =>
                  copyToClipboard(
                    `const { data, error } = await storage\n  .from("${selectedBucket?.name || "private-docs"}")\n  .createSignedUrl("contracts/nda.pdf", 3600, {\n    download: "signed-nda.pdf",\n  });\n\nif (data?.signedUrl) {\n  console.log("Temporary download URL:", data.signedUrl);\n}`,
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
  .from("${selectedBucket?.name || "private-docs"}")
  .createSignedUrl("contracts/nda.pdf", 3600, {
    download: "signed-nda.pdf",
  });

if (data?.signedUrl) {
  console.log("Temporary download URL:", data.signedUrl);
}`}</pre>
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
                  whz_live_your_key_id
                </div>
              </div>

              <div style={{ padding: "0.75rem", background: "var(--bg-inset)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>SECRET ACCESS KEY</div>
                <div style={{ fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 700, marginTop: "0.25rem" }}>
                  whz_live_your_secret_key
                </div>
              </div>
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
                    `# Configure credentials\naws configure set aws_access_key_id "whz_live_your_key_id"\naws configure set aws_secret_access_key "whz_live_your_secret_key"\naws configure set default.region "auto"\n\n# List objects in bucket\naws s3 ls s3://${selectedBucket?.name || "my-bucket"}/ --endpoint-url ${baseUrl}/api/storage/v1/s3\n\n# Upload file to bucket\naws s3 cp ./file.png s3://${selectedBucket?.name || "my-bucket"}/assets/file.png \\\n  --endpoint-url ${baseUrl}/api/storage/v1/s3`,
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
aws configure set aws_access_key_id "whz_live_your_key_id"
aws configure set aws_secret_access_key "whz_live_your_secret_key"
aws configure set default.region "auto"

# List objects in bucket
aws s3 ls s3://${selectedBucket?.name || "my-bucket"}/ --endpoint-url ${baseUrl}/api/storage/v1/s3

# Upload file to bucket
aws s3 cp ./file.png s3://${selectedBucket?.name || "my-bucket"}/assets/file.png \\
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
                    `import boto3\n\ns3 = boto3.client(\n    "s3",\n    endpoint_url="${baseUrl}/api/storage/v1/s3",\n    aws_access_key_id="whz_live_your_key_id",\n    aws_secret_access_key="whz_live_your_secret_key",\n    region_name="auto",\n)\n\n# Upload dataset file\ns3.upload_file("dataset.parquet", "${selectedBucket?.name || "analytics"}", "data/dataset.parquet")\n\n# Download file\ns3.download_file("${selectedBucket?.name || "analytics"}", "data/dataset.parquet", "local.parquet")`,
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
    aws_access_key_id="whz_live_your_key_id",
    aws_secret_access_key="whz_live_your_secret_key",
    region_name="auto",
)

# Upload dataset file
s3.upload_file("dataset.parquet", "${selectedBucket?.name || "analytics"}", "data/dataset.parquet")

# Download file
s3.download_file("${selectedBucket?.name || "analytics"}", "data/dataset.parquet", "local.parquet")`}</pre>
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
                        `curl -X POST "${baseUrl}/api/storage/v1/buckets/${selectedBucket?.id || ":bucketId"}/objects/upload" \\\n  -H "Authorization: Bearer $WHIZAN_API_KEY" \\\n  -F "objectPath=documents/notes.txt" \\\n  -F "file=@notes.txt"`,
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
                >{`curl -X POST "${baseUrl}/api/storage/v1/buckets/${selectedBucket?.id || ":bucketId"}/objects/upload" \\
  -H "Authorization: Bearer $WHIZAN_API_KEY" \\
  -F "objectPath=documents/notes.txt" \\
  -F "file=@notes.txt"`}</pre>
              </div>

              {/* cURL Download URL */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>POST /api/storage/v1/buckets/:id/objects/download-url</span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        `curl -X POST "${baseUrl}/api/storage/v1/buckets/${selectedBucket?.id || ":bucketId"}/objects/download-url" \\\n  -H "Authorization: Bearer $WHIZAN_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"objectPath": "documents/notes.txt", "expiresInSeconds": 3600}'`,
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
                >{`curl -X POST "${baseUrl}/api/storage/v1/buckets/${selectedBucket?.id || ":bucketId"}/objects/download-url" \\
  -H "Authorization: Bearer $WHIZAN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"objectPath": "documents/notes.txt", "expiresInSeconds": 3600}'`}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
