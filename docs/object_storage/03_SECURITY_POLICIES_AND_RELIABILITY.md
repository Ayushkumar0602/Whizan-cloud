# 03 — Security, Policies & Reliability

This document outlines the multi-layered security architecture, access policy engine, anti-abuse guardrails, soft-delete data protection, and operational reliability mechanisms of **Whizan Cloud Object Storage**.

---

## 1. Authentication & API Key Lifecycle

All storage interactions (except anonymous reads from public buckets) require cryptographically authenticated credentials.

```
                    ┌───────────────────────────────┐
                    │      Client HTTP Request      │
                    │ Authorization: Bearer whz_live│
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │     Gateway Auth Interceptor  │
                    │   1. Extract 'whz_live_' key  │
                    │   2. Compute SHA-256 Hash     │
                    │   3. Prefix Match in Database │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
            Key Valid & Active               Key Invalid / Expired
                    │                               │
                    ▼                               ▼
       Attach Tenant Context &               Return HTTP 401
       Proceed to Policy Check              {"error": "Unauthorized"}
```

### Security Properties:
- **One-Way Cryptographic Hashing**: API keys are generated using 32 bytes of cryptographically secure random entropy (`crypto.randomBytes(32)`), prefixed with `whz_live_`. Only the SHA-256 hash and a 12-character display prefix are stored in PostgreSQL. Raw secret keys are never stored on disk.
- **Tenant Scope Isolation**: Every API key maps strictly to a single `userId` / `projectId`. Cross-tenant bucket or object enumeration is mathematically impossible at the database query layer.
- **Dual Credential Role**: The same API key acts as the Bearer token for `@whizan/storage-js` and the HTTP REST API, as well as the Secret Access Key for AWS S3 Gateway calls.

---

## 2. Granular Bucket Security Policies & RLS

Whizan Cloud enforces access control at both the bucket container and object path level.

### 1. Public vs. Private Buckets
- **Private Buckets (`isPublic: false`) — Default & Mandatory for Sensitive Data**:
  - Direct anonymous HTTP GET requests are rejected with `HTTP 403 Forbidden`.
  - Object download requires an authenticated SDK call with valid API key or a temporary presigned URL generated with SigV4 expiration.
- **Public Buckets (`isPublic: true`)**:
  - Anonymous GET requests are permitted exclusively via the Edge CDN route: `https://api.whizan.cloud/public/:bucketName/:path`.
  - All write, modify, copy, and delete operations still require full authentication.

### 2. Strict MIME-Type Whitelisting
To prevent malicious users from using storage as a malware distribution host or hosting executable phishing files, buckets can be locked to specific MIME types:

```typescript
await storage.createBucket("secure-documents", {
  public: false,
  allowedMimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png",
    "image/jpeg",
  ],
});
```
When an upload presign request arrives, the gateway inspects `mimeType`. If the MIME type is not explicitly covered by the whitelist, the request is immediately rejected with `HTTP 400 Bad Request`.

### 3. File Size Enforcement
Each bucket can specify a custom `maxFileSizeBytes` ceiling (up to the global tier cap of 25 MB). If an upload specifies a payload exceeding the bucket's rule, presigning is aborted.

---

## 3. Anti-Abuse & Rate Limiting Architecture

The storage gateway incorporates strict denial-of-service (DoS) and quota bypass protections enforced via Redis:

```
                            Incoming Storage Request
                                       │
                                       ▼
                       ┌───────────────────────────────┐
                       │   Sliding Window Rate Limit   │
                       │   (60 Requests / Minute / Key)│
                       └───────────────┬───────────────┘
                                       │
                         [Within 60 RPM Threshold]
                                       │
                                       ▼
                       ┌───────────────────────────────┐
                       │    Daily Command Allowance    │
                       │     (2,000 Operations / Day)  │
                       └───────────────┬───────────────┘
                                       │
                         [Within Daily Command Cap]
                                       │
                                       ▼
                       ┌───────────────────────────────┐
                       │ Concurrent In-Flight Check    │
                       │     (Max 3 Active Uploads)    │
                       └───────────────┬───────────────┘
                                       │
                                       ▼
                              Execute Operation
```

1. **Sliding Window Rate Limiter**: 
   - Tracks requests per API key in a 60-second rolling Redis window.
   - Caps throughput at 60 RPM per key to prevent API hammering. Exceeding requests receive `HTTP 429 Too Many Requests` with a `Retry-After` header.
2. **Daily Command Quotas**:
   - Every operation (presign, confirm, delete, list, copy, move) increments the tenant's daily command counter.
   - Free/Hobby accounts are capped at 2,000 commands/day, preventing persistent automated scraper loops.
3. **Concurrent Transfer Slots**:
   - Caps simultaneous active uploads at 3 slots per tenant.
   - Prevents microservices from launching hundreds of parallel presigned uploads to flood physical storage buffers.

---

## 4. Soft-Delete Trash Bin & 30-Day Recovery Architecture

Accidental file deletions can be catastrophic for production applications. Whizan Cloud implements a non-destructive **Soft-Delete Trash Bin**:

```
                       User Deletes Object (remove / rm)
                                       │
                                       ▼
                       ┌───────────────────────────────┐
                       │     Atomic Soft Deletion      │
                       │   status = 'DELETED'          │
                       │   deletedAt = CURRENT_TIME    │
                       └───────────────┬───────────────┘
                                       │
                      Excluded from Active SDK Listings
                      Quota Decremented (usedBytes -= size)
                                       │
                                       ▼
                       ┌───────────────────────────────┐
                       │       30-Day Retention Bin    │
                       └───────┬───────────────┬───────┘
                               │               │
                     Within 30 Days?     After 30 Days
                               │               │
                               ▼               ▼
                       ┌───────────────┐ ┌───────────────┐
                       │ Restore File  │ │ Permanent S3  │
                       │ (One-Click)   │ │ Physical Wipe │
                       └───────────────┘ └───────────────┘
```

### Technical Workflow:
1. When `storage.from("bkt").remove([path])` is invoked:
   - The database updates the record: `status = 'DELETED'`, `deletedAt = NOW()`.
   - The tenant's active quota is credited: `usedBytes -= file.size`.
   - The object is immediately excluded from `storage.from("bkt").list()` and downloads.
2. **Dashboard Recovery**:
   - The file appears in the **Trash Bin** tab (`/dashboard/storage?tab=TRASH`).
   - The developer can inspect deletion timestamp, original path, and restore the file to active status at any time within 30 days.
3. **Permanent Deletion**:
   - Developers can click "Permanently Delete" in the Trash Bin to trigger an immediate physical wipe on S3.
   - A daily cron job automatically scans for deleted records older than 30 days and triggers physical deletion on S3 and row purge in PostgreSQL.

---

## 5. Security Audit Activity Trail

Every state mutation is permanently recorded in the `StorageAuditLog` table for compliance, forensics, and operational debugging.

### Recorded Metadata:
- `timestamp`: Millisecond-precision ISO timestamp.
- `action`: `UPLOAD`, `DELETE`, `METADATA_UPDATE`, `COPY`, `MOVE`, `RESTORE`, `PERMANENT_PURGE`.
- `bucketName`: Target bucket.
- `objectName`: Relative object path.
- `bytesAffected`: Payload size in bytes.
- `ipAddress`: Request origin IP address.
- `apiKeyId`: The specific API key that authorized the action.

The last 50 audit records are displayed in real-time under the **Usage & System Health** tab in the developer console.
