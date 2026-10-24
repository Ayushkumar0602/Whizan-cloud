# 02 — Client SDK Specification & API Reference

This document provides the complete API specification and technical reference for the official **`@whizan/storage-js`** client library, S3 Gateway compatibility, and direct HTTP REST endpoints.

---

## 1. `@whizan/storage-js` Client SDK

The `@whizan/storage-js` client provides a typed, promise-based API modeled after standard modern storage patterns (Supabase Storage equivalent). It is fully compatible with **Node.js 18+**, modern web browsers, Next.js (App Router & Pages Router), Remix, Astro, and Cloudflare Workers.

### Installation

```bash
npm install @whizan/storage-js
```

### Client Initialization

```typescript
import { createStorageClient } from "@whizan/storage-js";

export const storage = createStorageClient({
  projectUrl: "https://api.whizan.cloud",
  apiKey: process.env.WHIZAN_API_KEY!,
});
```

---

## 2. Bucket Management API

### `storage.listBuckets()`
Lists all accessible buckets in the account.

```typescript
const { data: buckets, error } = await storage.listBuckets();

// data: Array<StorageBucket>
// [
//   {
//     id: "5a97e037-891a-4823-a424-3e8b77192baa",
//     name: "documents",
//     isPublic: false,
//     totalFiles: 14,
//     totalSizeBytes: 1245800,
//     allowedMimeTypes: ["application/pdf", "image/*"],
//     createdAt: "2026-03-12T10:00:00Z"
//   }
// ]
```

### `storage.getBucket(idOrName: string)`
Retrieves metadata and current file count for a specific bucket.

```typescript
const { data: bucket, error } = await storage.getBucket("documents");
```

### `storage.createBucket(name: string, options?: CreateBucketOptions)`
Provisions a new isolated bucket with security constraints.

```typescript
const { data: newBucket, error } = await storage.createBucket("secure-vault", {
  public: false,
  allowedMimeTypes: ["application/pdf", "application/zip"],
  maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB per file limit
});
```

### `storage.deleteBucket(idOrName: string, force?: boolean)`
Deletes a bucket. If `force` is true, deletes all contents before removing the bucket container.

```typescript
const { data, error } = await storage.deleteBucket("temporary-bucket", true);
```

---

## 3. Object Operations API (`storage.from(bucket)`)

All object operations are scoped to a bucket instance created via `storage.from("bucket-name")`.

### 1. `upload(path: string, file: Buffer | Blob | Uint8Array, options?: UploadOptions)`
Performs an atomic direct presigned upload directly to edge physical storage.

```typescript
const { data, error } = await storage
  .from("documents")
  .upload("invoices/2026/invoice-101.pdf", fileBuffer, {
    contentType: "application/pdf",
    cacheControl: "public, max-age=86400",
    upsert: true,
  });

if (error) {
  console.error("Upload failed:", error.message);
} else {
  console.log("Uploaded successfully:", data.path, data.size, data.id);
}
```

### 2. `download(path: string)`
Downloads an object body as a `Blob` (in browsers) or byte stream/buffer (in Node.js).

```typescript
const { data, error } = await storage
  .from("documents")
  .download("invoices/2026/invoice-101.pdf");

if (error) {
  console.error("Download error:", error.message);
} else {
  // In Browser:
  const text = await data.text();
  // In Node.js:
  const buffer = Buffer.from(await data.arrayBuffer());
}
```

### 3. `updateMetadata(path: string, options: UpdateMetadataOptions)`
Updates HTTP caching headers, download disposition, or custom JSON metadata without re-uploading the file binary.

```typescript
const { data, error } = await storage
  .from("documents")
  .updateMetadata("invoices/2026/invoice-101.pdf", {
    cacheControl: "public, max-age=31536000, immutable",
    contentDisposition: 'attachment; filename="invoice-101.pdf"',
    metadata: {
      client: "Acme Corp",
      paid: true,
      auditedAt: "2026-10-24",
    },
  });
```

### 4. `getMetadata(path: string)`
Fetches object metadata, MIME type, size, and custom tags without downloading the file payload.

```typescript
const { data, error } = await storage
  .from("documents")
  .getMetadata("invoices/2026/invoice-101.pdf");

console.log("File size:", data.size);
console.log("MIME type:", data.mimeType);
console.log("Custom metadata:", data.metadata);
```

### 5. `createSignedUrl(path: string, expiresInSeconds: number, options?: SignedUrlOptions)`
Generates a temporary AWS SigV4 authenticated URL for secure, time-limited private downloads.

```typescript
const { data, error } = await storage
  .from("documents")
  .createSignedUrl("contracts/nda.pdf", 900, {
    download: "signed-nda.pdf", // Forces attachment download with filename
  });

console.log("Temporary download URL:", data.signedUrl);
```

### 6. `getPublicUrl(path: string, options?: PublicUrlOptions)`
Generates an Edge CDN URL for public buckets, with optional real-time Sharp image transformations.

```typescript
const { data } = storage
  .from("public-assets")
  .getPublicUrl("avatars/user-99.png", {
    transform: {
      width: 400,
      height: 400,
      format: "webp",
      quality: 85,
      fit: "cover",
    },
  });

console.log("Edge CDN URL:", data.publicUrl);
// Output: https://api.whizan.cloud/public/public-assets/avatars/user-99.png?w=400&h=400&format=webp&q=85&fit=cover
```

### 7. `copy(fromPath: string, toPath: string)`
Duplicates an existing object to a new path within the bucket.

```typescript
const { data, error } = await storage
  .from("documents")
  .copy("templates/base.pdf", "invoices/2026/new-invoice.pdf");
```

### 8. `move(fromPath: string, toPath: string)`
Atomically renames or moves an object to a new destination, automatically purging the source path.

```typescript
const { data, error } = await storage
  .from("documents")
  .move("invoices/2026/draft.pdf", "invoices/2026/final.pdf");
```

### 9. `remove(paths: string[])`
Performs bulk soft-deletion of multiple objects. Deleted files are retained in the Trash Bin for 30 days before permanent physical purge.

```typescript
const { data, error } = await storage
  .from("documents")
  .remove([
    "invoices/2026/old-draft.pdf",
    "invoices/2026/temp.tmp",
  ]);

console.log("Deleted count:", data.length);
```

### 10. `storage.getUsage()`
Returns real-time account storage quota and command allowance metrics.

```typescript
const { data: usage } = await storage.getUsage();

console.log(`Used: ${usage.quota.usedMb} MB / ${usage.quota.allocatedMb} MB`);
console.log(`Daily Commands: ${usage.commandLimits.currentDailyCommands} / ${usage.commandLimits.dailyCommandsQuota}`);
```

---

## 4. AWS S3 Gateway Protocol

Whizan Cloud includes an S3-compatible REST gateway allowing seamless integration with existing tools, CI/CD scripts, and machine learning pipelines.

### Gateway Connection Details
- **S3 Endpoint URL**: `https://api.whizan.cloud/api/storage/v1/s3`
- **Region**: `auto` (or `us-east-1`)
- **Access Key ID**: Your API Key ID (e.g. `whz_live_...`)
- **Secret Access Key**: Your Whizan Secret API Key

### AWS CLI Configuration & Commands

```bash
# 1. Configure credentials
aws configure set aws_access_key_id "whz_live_your_key_id"
aws configure set aws_secret_access_key "whz_live_your_secret_key"
aws configure set default.region "auto"

# 2. List objects in bucket
aws s3 ls s3://my-bucket/ \
  --endpoint-url https://api.whizan.cloud/api/storage/v1/s3

# 3. Upload file
aws s3 cp ./report.pdf s3://my-bucket/documents/report.pdf \
  --endpoint-url https://api.whizan.cloud/api/storage/v1/s3

# 4. Sync directory
aws s3 sync ./dist/ s3://my-bucket/static/ \
  --endpoint-url https://api.whizan.cloud/api/storage/v1/s3
```

### Python (`boto3`) Integration

```python
import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="https://api.whizan.cloud/api/storage/v1/s3",
    aws_access_key_id="whz_live_your_key_id",
    aws_secret_access_key="whz_live_your_secret_key",
    region_name="auto",
)

# Upload dataset file
s3.upload_file("dataset.parquet", "analytics", "data/dataset.parquet")

# Download file
s3.download_file("analytics", "data/dataset.parquet", "local-dataset.parquet")
```

---

## 5. Direct HTTP REST API Reference

For languages without native SDK support (Go, Rust, PHP, C#), Whizan Cloud exposes standard HTTP JSON endpoints authenticated via `Authorization: Bearer <API_KEY>`.

### 1. Request Presigned Upload URL
`POST /api/storage/v1/buckets/:bucketIdOrName/objects/upload-url`
*(Alias: `/api/storage/v1/buckets/:bucketIdOrName/objects/presigned-upload`)*

**Request Headers:**
```http
Authorization: Bearer whz_live_...
Content-Type: application/json
```

**Request Body:**
```json
{
  "objectPath": "documents/report.pdf",
  "fileSizeBytes": 1048576,
  "mimeType": "application/pdf"
}
```

**Response (200 OK):**
```json
{
  "uploadUrl": "https://<storage-cluster>.r2.cloudflarestorage.com/whizan/...?X-Amz-Signature=...",
  "objectId": "6f86954c-5bc1-4c65-930f-431ad4925c14",
  "expiresAt": "2026-10-24T15:15:00.000Z"
}
```

### 2. Confirm Upload Settlement
`POST /api/storage/v1/buckets/:bucketIdOrName/objects/confirm`

**Request Body:**
```json
{
  "objectId": "6f86954c-5bc1-4c65-930f-431ad4925c14"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "object": {
    "id": "6f86954c-5bc1-4c65-930f-431ad4925c14",
    "name": "documents/report.pdf",
    "size": 1048576,
    "mimeType": "application/pdf",
    "status": "ACTIVE"
  }
}
```

### 3. Generate Temporary Download URL
`POST /api/storage/v1/buckets/:bucketIdOrName/objects/download-url`

**Request Body:**
```json
{
  "objectPath": "documents/report.pdf",
  "expiresInSeconds": 900,
  "downloadFilename": "annual-report.pdf"
}
```

**Response (200 OK):**
```json
{
  "signedUrl": "https://<storage-cluster>.r2.cloudflarestorage.com/whizan/...&response-content-disposition=attachment..."
}
```
