# @whizan/storage-js

> Official JavaScript & TypeScript Client SDK for **Whizan Cloud Storage**. Fast, zero-dependency, S3-compatible object storage with Supabase parity and edge-native image transformations.

[![npm version](https://img.shields.io/npm/v/@whizan/storage-js.svg?style=flat-square)](https://www.npmjs.com/package/@whizan/storage-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## ⚡ Highlights

- **Supabase-Compatible API**: Familiar `.from(bucket).upload()`, `.download()`, and `.list()` methods. Drop-in migration.
- **Zero Heavy Dependencies**: Lightweight, tree-shakeable ESM client that works in Node.js, Next.js, Cloudflare Workers, Deno, and modern browsers.
- **High Performance**: Direct streaming uploads and Cloudflare R2 global CDN edge delivery with sub-10ms latency.
- **On-the-Fly Image Optimization**: Resize, crop, convert format (`webp`, `avif`), and set quality dynamically at the edge.
- **S3 Gateway Interoperability**: Built-in helper to connect AWS S3 SDK, MinIO, or Cyberduck using your Whizan Storage API keys.
- **Strict Quota & In-Flight Protection**: Atomic quota reservation preventing over-allocation or dangling failed uploads.

---

## 📦 Installation

```bash
# npm
npm install @whizan/storage-js

# pnpm
pnpm add @whizan/storage-js

# yarn
yarn add @whizan/storage-js
```

---

## 🚀 Quick Start

Generate your dedicated **Storage API Key** (`whz_stg_live_...`) in the [Whizan Dashboard](https://whizan.cloud/dashboard/storage) under the **Developer API** tab.

```typescript
import { createClient } from "@whizan/storage-js";

const storage = createClient(
  "https://api.whizan.cloud",
  process.env.WHIZAN_STORAGE_KEY! // whz_stg_live_...
);

// 1. Upload a file
const fileBuffer = Buffer.from("Hello from Whizan Cloud Storage!");
const { data, error } = await storage
  .from("my-bucket")
  .upload("documents/hello.txt", fileBuffer, {
    contentType: "text/plain",
    cacheControl: "public, max-age=3600",
  });

if (error) {
  console.error("Upload failed:", error.message);
} else {
  console.log("Uploaded successfully:", data.path, `${data.size} bytes`);
}
```

---

## 📖 API Reference

### 1. Upload Files (`upload`)

Supports `Buffer`, `Blob`, `Uint8Array`, `ArrayBuffer`, or `string`.

```typescript
const { data, error } = await storage
  .from("assets")
  .upload("avatars/user-123.png", avatarBuffer, {
    contentType: "image/png",
    cacheControl: "public, max-age=86400",
    metadata: {
      userId: "123",
      uploadedVia: "web-client",
    },
  });

// data -> { path: "avatars/user-123.png", id: "obj_abc123", size: 45200 }
```

### 2. Download Files (`download`)

Downloads the object and returns a standard Web `Blob`.

```typescript
const { data: blob, error } = await storage
  .from("assets")
  .download("avatars/user-123.png");

if (blob) {
  // In Node.js:
  const buffer = Buffer.from(await blob.arrayBuffer());
  
  // In Browser:
  const url = URL.createObjectURL(blob);
}
```

### 3. List Objects (`list`)

List and paginate objects with filtering and sorting.

```typescript
const { data: objects, error } = await storage
  .from("assets")
  .list("avatars/", {
    limit: 50,
    offset: 0,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

for (const obj of objects ?? []) {
  console.log(obj.name, obj.size, obj.mimeType);
}
```

### 4. Public CDN URLs & Image Transforms (`getPublicUrl`)

Generate instant CDN URLs for public buckets, with optional edge image transformations.

```typescript
// Standard Public URL
const { data } = storage.from("public-media").getPublicUrl("banners/hero.jpg");
console.log(data.publicUrl);
// -> https://api.whizan.cloud/public/public-media/banners/hero.jpg

// Dynamic Image Optimization (Resize, WebP, Quality)
const { data: optimized } = storage.from("public-media").getPublicUrl("banners/hero.jpg", {
  width: 800,
  height: 600,
  format: "webp",
  quality: 85,
  resize: "cover",
});
console.log(optimized.publicUrl);
// -> https://api.whizan.cloud/api/storage/v1/render/image/public/public-media/banners/hero.jpg?width=800&height=600&format=webp&quality=85&resize=cover
```

### 5. Presigned Download URLs (`createSignedUrl`)

Create time-limited secure download links for private bucket assets.

```typescript
const { data, error } = await storage
  .from("private-docs")
  .createSignedUrl("invoices/2026-q1.pdf", 300, {
    download: "invoice_january.pdf", // Optional custom download filename
  });

console.log("Temporary download link (expires in 5 min):", data?.signedUrl);
```

### 6. Copy & Move Files (`copy`, `move`)

Perform atomic moves or file copies within or across buckets.

```typescript
// Copy file
await storage.from("uploads").copy("temp/report.pdf", "archive/report.pdf");

// Move / Rename file atomically
await storage.from("uploads").move("drafts/post.md", "published/post.md");
```

### 7. Delete Objects (`remove`)

Delete one or multiple objects in a single batch call.

```typescript
const { data, error } = await storage
  .from("assets")
  .remove(["temp/image1.png", "temp/image2.png"]);

console.log(`Deleted ${data?.deletedCount} objects.`);
```

### 8. Object Metadata (`getMetadata`, `updateMetadata`)

Inspect or update object metadata, `Cache-Control`, and headers without re-uploading bytes.

```typescript
// Get metadata
const { data: meta } = await storage.from("assets").getMetadata("images/logo.png");
console.log("MIME:", meta?.mimeType, "ETag:", meta?.etag);

// Update metadata
await storage.from("assets").updateMetadata("images/logo.png", {
  cacheControl: "public, max-age=31536000, immutable",
  metadata: { verified: true },
});
```

---

## 🗄️ Bucket Management

Manage buckets programmatically directly from the client:

```typescript
// List all buckets
const { data: buckets } = await storage.listBuckets();

// Create a new private or public bucket
await storage.createBucket("user-uploads", {
  public: false,
  fileSizeLimit: 25 * 1024 * 1024, // 25 MB max per file
  allowedMimeTypes: ["image/png", "image/jpeg", "application/pdf"],
});

// Delete a bucket
await storage.deleteBucket("user-uploads", false); // pass true to force delete non-empty bucket

// Get storage quota allocation and used bytes
const { data: usage } = await storage.getUsage();
console.log(`Used: ${usage.quota.usedMb} MB / ${usage.quota.allocatedMb} MB`);
```

---

## 🌐 AWS S3 SDK Compatibility

Want to use `@aws-sdk/client-s3` instead? Retrieve connection config in one line:

```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@whizan/storage-js";

const storage = createClient("https://api.whizan.cloud", "whz_stg_live_...");
const s3Config = storage.getS3Config();

const s3 = new S3Client({
  endpoint: s3Config.endpoint,
  region: s3Config.region,
  credentials: s3Config.credentials,
});

await s3.send(
  new PutObjectCommand({
    Bucket: "my-bucket",
    Key: "file.txt",
    Body: "Hello via AWS S3 SDK!",
  })
);
```

---

## 🔒 Authentication Best Practices

Always store your storage keys in environment variables:

```env
WHIZAN_API_URL=https://api.whizan.cloud
WHIZAN_STORAGE_KEY=whz_stg_live_...
```

Whizan Cloud separates developer permissions:
- **`whz_stg_live_...` Keys**: Dedicated for storage bucket access, automated CI/CD scripts, and frontend/backend SDK integrations. They are scoped strictly to storage endpoints and protected by 2FA review in the Whizan Dashboard.
- **`whz_live_...` Keys**: Master account tokens intended for CLI and IDE MCP deployments.

---

## 📄 License

MIT © [Whizan Cloud Services](https://whizan.cloud)
