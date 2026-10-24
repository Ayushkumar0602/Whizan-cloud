# 01 — Architecture & Distributed System Design

This document details the end-to-end distributed system architecture of **Whizan Cloud Object Storage**, explaining the core storage topology, the zero-proxy direct upload protocol, strict multi-tenant quota isolation, edge image processing, and database reconciliation.

---

## 1. High-Level System Topology

Whizan Cloud Object Storage is architected as a high-throughput, horizontally scalable distributed storage service that decouples metadata operations from raw byte transfer.

```
                              ┌────────────────────────────────────────┐
                              │            Client Application          │
                              │   (@whizan/storage-js / AWS CLI / UI)  │
                              └───────┬────────────────────────┬───────┘
                                      │                        │
                    1. Get Presigned  │                        │ 2. Direct Binary PUT /
                       Upload URL     │                        │    Direct Stream GET
                                      ▼                        ▼
                       ┌──────────────────────┐      ┌──────────────────┐
                       │  Whizan API Gateway  │      │  Physical S3     │
                       │    (Fastify :3001)   │      │  Edge Storage    │
                       └──────────┬───────────┘      └──────────────────┘
                                  │                            ▲
                ┌─────────────────┴─────────────────┐          │
                ▼                                   ▼          │
      ┌──────────────────┐                ┌──────────────────┐ │
      │    PostgreSQL    │                │    Redis Cache   │ │
      │  Metadata Store  │                │  Rate & Session  │ │
      └──────────────────┘                └──────────────────┘ │
                                                               │
                                  3. On-The-Fly Sharp Transcode│
                                  ┌────────────────────────────┴────────┐
                                  │          Edge Image CDN             │
                                  │    (/public/:bucket/*?w=...&h=...)  │
                                  └─────────────────────────────────────┘
```

### Key Architectural Layers:
1. **Edge Router & CDN Layer**: High-availability Anycast edge network terminating SSL/TLS certificates and serving public assets with sub-5ms latency and edge cache headers.
2. **Control Plane & API Gateway (`apps/api`)**: Fastify-based REST server running rate limiting, bearer authentication, security policy evaluation, quota checks, and SigV4 presigned URL synthesis.
3. **Physical Storage Layer**: S3-compatible globally distributed object store (Cloudflare R2 backend) providing high durability (99.999999999%), zero egress fees, and hardware-accelerated AES-256 rest encryption.
4. **Metadata & State Store (`packages/db`)**: ACID-compliant PostgreSQL database maintaining tenant buckets, object indices, soft-deleted files, in-flight reservation leases, and security audit logs.
5. **Fast Cache Layer (Redis)**: High-speed in-memory store for rate limiting counters (sliding window 60 RPM), live command allowances, and active upload reservations.

---

## 2. Two-Phase Direct-to-Storage Upload Protocol

Traditional storage architectures proxy multi-megabyte payloads through the application server, causing severe memory bloat, socket exhaustion, and slow uploads. Whizan Cloud implements a **Zero-Proxy Two-Phase Direct Upload Protocol**:

```
Client SDK                    Whizan Gateway                      Physical Object Store
    │                               │                                     │
    │  1. POST /objects/upload-url  │                                     │
    │ ────────────────────────────► │                                     │
    │    (path, size, mimeType)     │ ── 2. Check Quota & Reserve Bytes   │
    │                               │    (used + reserved + size <= 250MB)│
    │                               │ ── 3. Synthesize AWS SigV4 URL      │
    │  4. Return Presigned URL      │                                     │
    │ ◄──────────────────────────── │                                     │
    │                                                                     │
    │  5. Direct Binary HTTP PUT (Presigned URL)                          │
    │ ──────────────────────────────────────────────────────────────────► │
    │                                                                     │ ── 6. Store Bytes
    │  7. HTTP 200 OK (from Storage)                                      │    (Encrypted AES-256)
    │ ◄────────────────────────────────────────────────────────────────── │
    │                               │                                     │
    │  8. POST /objects/confirm     │                                     │
    │ ────────────────────────────► │ ── 9. Finalize Object in Database   │
    │                               │    Atomic: usedBytes += size        │
    │                               │            reservedBytes -= size    │
    │  10. Return Object Record     │                                     │
    │ ◄──────────────────────────── │                                     │
```

### Protocol Steps Breakdown:

#### Phase 1: Reservation & Presigning
1. The client invokes `storage.from("bucket").upload(path, fileBuffer)`.
2. The SDK sends `POST /api/storage/v1/buckets/:id/objects/upload-url` containing `objectPath`, `fileSizeBytes`, and `mimeType`.
3. The gateway verifies:
   - Tenant quota: `usedBytes + reservedBytes + fileSizeBytes <= allocatedBytes` (250 MB).
   - Rate limit: Tenant has not exceeded 60 requests/min.
   - Bucket security policy: File MIME type is allowed by the bucket's whitelist.
   - Single file cap: `fileSizeBytes <= maxFileSizeMb` (25 MB default).
4. If valid, the gateway:
   - Creates an `InFlightUpload` record with a 15-minute lease.
   - Atomically increments `reservedBytes` on the tenant's quota.
   - Generates an S3 Presigned PUT URL using `@aws-sdk/s3-request-presigner` with 15-minute expiration.
5. Returns `{ uploadUrl, objectId, expiresAt }`.

#### Direct Binary Transfer
6. The client streams raw bytes directly to the physical storage endpoint using `PUT uploadUrl` with headers matching the canonical request signature (`Content-Type`, `Cache-Control`).
7. The storage engine stores the payload and returns `HTTP 200 OK`. The Whizan application server receives 0 bytes of file payload during this step.

#### Phase 2: Confirmation & Settlement
8. Upon receiving `HTTP 200`, the SDK issues `POST /api/storage/v1/buckets/:id/objects/confirm` with `{ objectId }`.
9. The gateway executes an atomic database transaction:
   - Sets `StorageObject.status = 'ACTIVE'`.
   - Increments tenant `usedBytes += fileSizeBytes`.
   - Decrements tenant `reservedBytes -= fileSizeBytes`.
   - Deletes the `InFlightUpload` lease record.
   - Appends an entry to `StorageAuditLog` (`action: 'UPLOAD'`).
10. Returns the complete `StorageObject` record to the client.

---

## 3. Strict 250 MB Quota Isolation & Anti-Exhaustion Architecture

To prevent malicious or runaway microservices from consuming excessive storage resources, Whizan Cloud enforces **Strict Quota Isolation** at the gateway boundary.

### Quota Bounds Matrix:
- **Maximum Storage Allocation**: `250 MB` (262,144,000 bytes) strict isolation per project.
- **Maximum Single File Size**: `25 MB` (26,214,400 bytes).
- **Maximum Concurrent In-Flight Transfers**: 3 simultaneous uploads.
- **Lease Timeout**: 15 minutes (900 seconds).

### Concurrency Attack Protection:
A common flaw in naive storage gateways is concurrent race conditions: a user with 5 MB remaining quota could launch ten 20 MB uploads in parallel. Without reservation locks, all ten checks would read `usedBytes = 245 MB` and issue presigned URLs, resulting in 200 MB of unauthorized data stored.

Whizan Cloud eliminates this vulnerability via **In-Flight Reservation Leases**:
```typescript
// Atomic Quota Calculation at Presign Step
const effectiveUsedBytes = quota.usedBytes + quota.reservedBytes;

if (effectiveUsedBytes + incomingBytes > quota.allocatedBytes) {
  throw new QuotaExceededError(
    `Storage quota exceeded: ${formatMb(effectiveUsedBytes + incomingBytes)} MB ` +
    `exceeds limit of ${formatMb(quota.allocatedBytes)} MB`
  );
}
```

If an upload fails, is aborted by the user, or network drops, the reservation lease automatically expires after 15 minutes and is reclaimed by the background reconciliation worker.

---

## 4. Edge Sharp Dynamic Image Processing Pipeline

For public buckets, Whizan Cloud features an integrated, real-time image processing engine powered by high-performance C++ `Sharp`.

### Endpoint Pattern:
```
GET /public/:bucketName/:objectPath?w=600&h=400&format=webp&q=85&fit=cover
```

```
               ┌───────────────────────┐
               │   Incoming HTTP GET   │
               └───────────┬───────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
    Transform Query Present?     No Query Params
             │                           │
             ▼                           ▼
    ┌──────────────────┐        ┌──────────────────┐
    │  Stream from S3  │        │ Stream Raw Bytes │
    └────────┬─────────┘        └──────────────────┘
             │
             ▼
    ┌──────────────────┐
    │ Sharp Pipeline:  │
    │ • Resize (w, h)  │
    │ • Fit (cover/etc)│
    │ • Transcode WebP │
    │ • Quality (85)   │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ Edge Response:   │
    │ Cache-Control:   │
    │ public, 1 year   │
    └──────────────────┘
```

### Supported Transformation Parameters:
| Parameter | Type | Default | Description |
|---|---|---|---|
| `w` or `width` | integer | original | Target width in pixels (10 to 3840). |
| `h` or `height` | integer | original | Target height in pixels (10 to 2160). |
| `format` | string | original | Target format: `webp`, `avif`, `jpeg`, `png`. |
| `q` or `quality` | integer | `85` | Compression quality (1 to 100). |
| `fit` | string | `cover` | Resize fit: `cover`, `contain`, `fill`, `inside`, `outside`. |

All transformed assets are served with HTTP immutable caching headers (`Cache-Control: public, max-age=31536000, immutable`), ensuring edge nodes cache subsequent requests and minimize compute overhead.

---

## 5. Storage Reconciliation & Anti-Drift Engine

In distributed storage systems, state drift can occur if network cuts off confirmation requests or files are deleted out-of-band. Whizan Cloud includes an automated **Anti-Drift Reconciliation Worker** (`storageApi.reconcile()`):

1. **Stale Lease Eviction**: Scans `InFlightUpload` table for reservations older than 15 minutes. Automatically purges dead leases and decrements `reservedBytes` on tenant quotas.
2. **PostgreSQL-to-Storage Synchronization**: Iterates active `StorageObject` records and verifies physical presence on S3. Recalculates total tenant `usedBytes = SUM(size)` directly from verified active records.
3. **Rate Limiting Reset**: Clears expired Redis sliding-window blocks.

This worker runs automatically every 6 hours and can be manually triggered on-demand with one click from the dashboard **Sync / Reconcile** button.
