// ─── Whizan Cloud Storage — Core Storage Service ──────────────────────────────

import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { redisClient } from "../lib/redis.js";
import { getStorageTierConfig, type StorageTierConfig } from "../config/storage-tiers.js";
import {
  uploadObjectDirect as r2UploadDirect,
  downloadObjectStream as r2DownloadStream,
  headObjectR2,
  deleteObjectR2,
  deleteObjectsR2,
  copyObjectR2,
  generatePresignedUploadUrl as r2PresignedUploadUrl,
  generatePresignedDownloadUrl as r2PresignedDownloadUrl,
  initiateMultipartUploadR2,
  generatePresignedPartUploadUrl,
  completeMultipartUploadR2,
  abortMultipartUploadR2,
} from "../lib/r2-client.js";

// Custom Error Classes with standard HTTP status codes
export class StorageError extends Error {
  statusCode: number;
  code: string;
  details?: any;

  constructor(message: string, statusCode = 400, code = "STORAGE_ERROR", details?: any) {
    super(message);
    this.name = "StorageError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class QuotaExceededError extends StorageError {
  constructor(message: string, details?: any) {
    super(message, 413, "STORAGE_QUOTA_EXCEEDED", details);
  }
}

export class RateLimitExceededError extends StorageError {
  constructor(message: string, details?: any) {
    super(message, 429, "RATE_LIMIT_EXCEEDED", details);
  }
}

export class NotFoundError extends StorageError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
  }
}

export class ForbiddenError extends StorageError {
  constructor(message: string) {
    super(message, 403, "FORBIDDEN");
  }
}

export class ConflictError extends StorageError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

/**
 * Normalizes and validates an object path.
 * Rejects path traversal (e.g. "../", null bytes, control characters).
 */
export function normalizeObjectPath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== "string") {
    throw new StorageError("Object path is required and must be a string", 400, "INVALID_PATH");
  }

  // Check for null bytes or control characters
  if (/[\x00-\x1f\x7f]/.test(rawPath)) {
    throw new StorageError("Object path contains invalid control characters", 400, "INVALID_PATH");
  }

  // Replace backslashes with forward slashes
  let normalized = rawPath.replace(/\\/g, "/");

  // Prevent path traversal sequences
  const segments = normalized.split("/");
  for (const seg of segments) {
    if (seg === ".." || seg === ".") {
      throw new StorageError("Path traversal sequences are strictly forbidden", 400, "PATH_TRAVERSAL_DETECTED");
    }
  }

  // Remove leading and trailing slashes and collapse duplicate slashes
  normalized = normalized.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");

  if (!normalized || normalized.length === 0) {
    throw new StorageError("Object path cannot be empty", 400, "INVALID_PATH");
  }

  if (normalized.length > 1024) {
    throw new StorageError("Object path cannot exceed 1024 characters", 400, "PATH_TOO_LONG");
  }

  return normalized;
}

/**
 * Validates a bucket name according to Cloudflare/S3 naming standards.
 */
export function validateBucketName(name: string): void {
  if (!name || typeof name !== "string") {
    throw new StorageError("Bucket name is required", 400, "INVALID_BUCKET_NAME");
  }

  const trimmed = name.trim().toLowerCase();
  if (trimmed.length < 3 || trimmed.length > 63) {
    throw new StorageError("Bucket name must be between 3 and 63 characters", 400, "INVALID_BUCKET_NAME");
  }

  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(trimmed)) {
    throw new StorageError(
      "Bucket name must contain only lowercase letters, numbers, and hyphens, and start/end with an alphanumeric character",
      400,
      "INVALID_BUCKET_NAME"
    );
  }

  const reserved = ["admin", "api", "internal", "public", "system", "whizan", "storage", "default"];
  if (reserved.includes(trimmed)) {
    throw new StorageError(`Bucket name '${trimmed}' is reserved by the platform`, 400, "RESERVED_BUCKET_NAME");
  }
}

/**
 * Server-controlled internal R2 key generator.
 * Enforces strong multi-tenant isolation.
 */
export function generateR2Key(userId: string, bucketId: string, objectName: string): string {
  const safePath = normalizeObjectPath(objectName);
  return `users/${userId}/${bucketId}/${safePath}`;
}

export class StorageService {
  /**
   * Enforces command rate limits and daily quotas using Redis sliding windows.
   */
  static async enforceRateLimit(userId: string, subscriptionTier: string | null, actionName: string): Promise<void> {
    const tierConfig = getStorageTierConfig(subscriptionTier);

    const now = Date.now();
    const minuteWindow = Math.floor(now / 60000);
    const dayWindow = new Date().toISOString().slice(0, 10);

    const rpmKey = `storage:rate:${userId}:${minuteWindow}`;
    const dailyKey = `storage:cmd:${userId}:${dayWindow}`;

    try {
      const pipeline = redisClient.pipeline();
      pipeline.incr(rpmKey);
      pipeline.expire(rpmKey, 70);
      pipeline.incr(dailyKey);
      pipeline.expire(dailyKey, 86400 * 2);
      const results = await pipeline.exec();

      const currentRpm = (results?.[0]?.[1] as number) || 1;
      const currentDaily = (results?.[2]?.[1] as number) || 1;

      if (currentRpm > tierConfig.rateLimitRpm) {
        throw new RateLimitExceededError(
          `Storage request rate limit exceeded (${tierConfig.rateLimitRpm} req/min for ${tierConfig.displayName}). Please retry in a moment.`,
          {
            limit: tierConfig.rateLimitRpm,
            window: "1m",
            tier: tierConfig.tier,
          }
        );
      }

      if (currentDaily > tierConfig.dailyCommandsQuota) {
        throw new RateLimitExceededError(
          `Daily storage command limit exceeded (${tierConfig.dailyCommandsQuota} commands/day for ${tierConfig.displayName}).`,
          {
            limit: tierConfig.dailyCommandsQuota,
            window: "1d",
            tier: tierConfig.tier,
          }
        );
      }
    } catch (err: any) {
      if (err instanceof StorageError) throw err;
      // If Redis has a temporary network blip, log and allow request through safely
      console.warn(`[StorageService] Redis rate limit check error (bypassed): ${err.message}`);
    }
  }

  /**
   * Retrieves or initializes the StorageUserQuota record for a user.
   */
  static async getOrCreateUserQuota(userId: string, subscriptionTier?: string | null) {
    const tierConfig = getStorageTierConfig(subscriptionTier);

    let quota = await prisma.storageUserQuota.findUnique({
      where: { userId },
    });

    if (!quota) {
      quota = await prisma.storageUserQuota.create({
        data: {
          userId,
          allocatedBytes: tierConfig.defaultQuotaBytes,
          usedBytes: 0n,
          reservedBytes: 0n,
          objectsCount: 0,
          lastReconciledAt: new Date(),
        },
      });
    }

    return quota;
  }

  /**
   * Atomically reserves upload quota for a file prior to uploading.
   * Concurrency-safe: utilizes SQL conditional update to prevent race conditions.
   */
  static async reserveUploadQuota(params: {
    userId: string;
    bucketId: string;
    objectName: string;
    requestedBytes: bigint;
    uploadType: "DIRECT" | "MULTIPART" | "SERVER";
    uploadId?: string;
    subscriptionTier?: string | null;
  }): Promise<{ reservationId: string; reservedBytes: bigint }> {
    const { userId, bucketId, objectName, requestedBytes, uploadType, uploadId, subscriptionTier } = params;
    const tierConfig = getStorageTierConfig(subscriptionTier);

    if (requestedBytes <= 0n) {
      throw new StorageError("Upload size must be greater than 0 bytes", 400, "INVALID_SIZE");
    }

    if (requestedBytes > tierConfig.maxFileSizeBytes) {
      throw new StorageError(
        `File size (${Number(requestedBytes)} bytes) exceeds the maximum allowed file size of ${Number(tierConfig.maxFileSizeBytes)} bytes for your plan (${tierConfig.displayName}).`,
        413,
        "FILE_TOO_LARGE",
        {
          requestedBytes: Number(requestedBytes),
          maxFileSizeBytes: Number(tierConfig.maxFileSizeBytes),
        }
      );
    }

    // Ensure user quota record exists
    await this.getOrCreateUserQuota(userId, subscriptionTier);

    // Check if replacing an existing object in the bucket
    const existingObj = await prisma.storageObject.findUnique({
      where: {
        bucketId_name: {
          bucketId,
          name: objectName,
        },
      },
    });

    // Net delta required
    const existingSize = existingObj ? existingObj.size : 0n;
    const delta = requestedBytes > existingSize ? requestedBytes - existingSize : 0n;

    // Check active concurrent reservations for this user
    const activeReservationsCount = await prisma.storageReservation.count({
      where: {
        userId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });

    if (activeReservationsCount >= tierConfig.maxConcurrentUploads) {
      throw new StorageError(
        `Maximum concurrent in-flight uploads (${tierConfig.maxConcurrentUploads}) reached for your plan. Wait for active uploads to complete.`,
        429,
        "CONCURRENT_UPLOADS_EXCEEDED"
      );
    }

    // Concurrency-safe atomic reservation using Prisma interactive transaction
    const reservation = await prisma.$transaction(async (tx) => {
      // Clean up any stale expired reservations for this user first
      await tx.storageReservation.updateMany({
        where: {
          userId,
          status: "PENDING",
          expiresAt: { lt: new Date() },
        },
        data: { status: "EXPIRED" },
      });

      // Recalculate pending reservations
      const currentQuota = await tx.storageUserQuota.findUnique({
        where: { userId },
      });

      if (!currentQuota) {
        throw new StorageError("Quota record not found", 500, "QUOTA_NOT_FOUND");
      }

      const totalProjected = currentQuota.usedBytes + currentQuota.reservedBytes + delta;
      if (totalProjected > currentQuota.allocatedBytes) {
        const availableBytes = currentQuota.allocatedBytes - (currentQuota.usedBytes + currentQuota.reservedBytes);
        throw new QuotaExceededError(
          `Upload of ${Number(requestedBytes)} bytes exceeds available storage quota (${Number(availableBytes > 0n ? availableBytes : 0n)} bytes remaining out of ${Number(currentQuota.allocatedBytes)} bytes).`,
          {
            allocatedBytes: Number(currentQuota.allocatedBytes),
            usedBytes: Number(currentQuota.usedBytes),
            reservedBytes: Number(currentQuota.reservedBytes),
            availableBytes: Number(availableBytes > 0n ? availableBytes : 0n),
            requestedBytes: Number(requestedBytes),
          }
        );
      }

      // Atomically increment reservedBytes
      if (delta > 0n) {
        await tx.storageUserQuota.update({
          where: { userId },
          data: {
            reservedBytes: { increment: delta },
          },
        });
      }

      // Create reservation with TTL (30 minutes)
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const resRecord = await tx.storageReservation.create({
        data: {
          userId,
          bucketId,
          objectName,
          reservedBytes: delta,
          uploadType,
          uploadId,
          status: "PENDING",
          expiresAt,
        },
      });

      return resRecord;
    });

    return {
      reservationId: reservation.id,
      reservedBytes: delta,
    };
  }

  /**
   * Releases an uncommitted or cancelled reservation.
   */
  static async releaseReservation(reservationId: string, reason = "CANCELLED"): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const res = await tx.storageReservation.findUnique({
        where: { id: reservationId },
      });

      if (!res || res.status !== "PENDING") return;

      if (res.reservedBytes > 0n) {
        await tx.storageUserQuota.update({
          where: { userId: res.userId },
          data: {
            reservedBytes: {
              decrement: res.reservedBytes,
            },
          },
        });
      }

      await tx.storageReservation.update({
        where: { id: reservationId },
        data: { status: reason === "EXPIRED" ? "EXPIRED" : "CANCELLED" },
      });
    });
  }

  /**
   * Commits an upload reservation upon verified completion in Cloudflare R2.
   */
  static async commitUpload(params: {
    reservationId: string;
    actualBytes: bigint;
    mimeType?: string;
    etag?: string;
    checksum?: string;
    metadata?: Record<string, any>;
    cacheControl?: string;
    contentDisposition?: string;
    actorEmail?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const {
      reservationId,
      actualBytes,
      mimeType,
      etag,
      checksum,
      metadata,
      cacheControl,
      contentDisposition,
      actorEmail,
      ipAddress,
      userAgent,
    } = params;

    return await prisma.$transaction(async (tx) => {
      const res = await tx.storageReservation.findUnique({
        where: { id: reservationId },
        include: { bucket: true },
      });

      if (!res) {
        throw new NotFoundError("Upload reservation not found");
      }

      if (res.status === "COMMITTED") {
        // Idempotent retry: return existing object
        const existing = await tx.storageObject.findUnique({
          where: {
            bucketId_name: {
              bucketId: res.bucketId,
              name: res.objectName,
            },
          },
        });
        if (existing) return existing;
      }

      if (res.status !== "PENDING") {
        throw new StorageError(`Upload reservation is in ${res.status} state`, 409, "INVALID_RESERVATION_STATE");
      }

      // Check existing object to compute byte adjustments
      const existingObj = await tx.storageObject.findUnique({
        where: {
          bucketId_name: {
            bucketId: res.bucketId,
            name: res.objectName,
          },
        },
      });

      const oldSize = existingObj ? existingObj.size : 0n;
      const isNewObject = !existingObj;

      // Net change in committed storage
      const netUsedChange = actualBytes - oldSize;

      // Update User Quota atomically
      await tx.storageUserQuota.update({
        where: { userId: res.userId },
        data: {
          usedBytes: { increment: netUsedChange },
          reservedBytes: { decrement: res.reservedBytes },
          objectsCount: isNewObject ? { increment: 1 } : undefined,
        },
      });

      // Mark reservation committed
      await tx.storageReservation.update({
        where: { id: reservationId },
        data: { status: "COMMITTED" },
      });

      const r2Key = generateR2Key(res.userId, res.bucketId, res.objectName);

      // Upsert StorageObject
      const objectRecord = await tx.storageObject.upsert({
        where: {
          bucketId_name: {
            bucketId: res.bucketId,
            name: res.objectName,
          },
        },
        create: {
          bucketId: res.bucketId,
          userId: res.userId,
          name: res.objectName,
          r2Key,
          size: actualBytes,
          mimeType: mimeType || "application/octet-stream",
          etag,
          checksum,
          metadata: metadata || {},
          cacheControl,
          contentDisposition,
          isPublic: res.bucket.isPublic,
        },
        update: {
          size: actualBytes,
          mimeType: mimeType || "application/octet-stream",
          etag,
          checksum,
          metadata: metadata || {},
          cacheControl,
          contentDisposition,
          isPublic: res.bucket.isPublic,
          updatedAt: new Date(),
        },
      });

      // Update bucket summary stats
      await tx.storageBucket.update({
        where: { id: res.bucketId },
        data: {
          totalBytes: { increment: netUsedChange },
          fileCount: isNewObject ? { increment: 1 } : undefined,
        },
      });

      // Write Audit Log
      await tx.storageAuditLog.create({
        data: {
          userId: res.userId,
          actorEmail,
          action: isNewObject ? "OBJECT_UPLOAD" : "OBJECT_REPLACE",
          bucketId: res.bucketId,
          bucketName: res.bucket.name,
          objectName: res.objectName,
          bytesAffected: actualBytes,
          ipAddress,
          userAgent,
          metadata: {
            etag,
            mimeType,
            uploadType: res.uploadType,
          },
        },
      });

      return objectRecord;
    });
  }

  // ─── Bucket Operations ──────────────────────────────────────────────────────

  static async createBucket(params: {
    userId: string;
    subscriptionTier?: string | null;
    name: string;
    description?: string;
    isPublic?: boolean;
    maxFileSize?: bigint;
    allowedMimeTypes?: string[];
    actorEmail?: string;
  }) {
    const { userId, subscriptionTier, name, description, isPublic, maxFileSize, allowedMimeTypes, actorEmail } = params;
    const tierConfig = getStorageTierConfig(subscriptionTier);

    validateBucketName(name);

    // Check bucket limit for user plan
    const currentBucketsCount = await prisma.storageBucket.count({
      where: { userId },
    });

    if (currentBucketsCount >= tierConfig.maxBuckets) {
      throw new StorageError(
        `Maximum bucket limit reached (${tierConfig.maxBuckets} buckets for ${tierConfig.displayName}).`,
        400,
        "BUCKET_LIMIT_EXCEEDED"
      );
    }

    // Check duplicate bucket name for this user
    const existing = await prisma.storageBucket.findUnique({
      where: {
        userId_name: {
          userId,
          name: name.toLowerCase(),
        },
      },
    });

    if (existing) {
      throw new ConflictError(`Bucket with name '${name}' already exists in your account.`);
    }

    const bucket = await prisma.storageBucket.create({
      data: {
        userId,
        name: name.toLowerCase(),
        description,
        isPublic: isPublic ?? false, // Private by default
        maxFileSize,
        allowedMimeTypes: allowedMimeTypes || [],
      },
    });

    await prisma.storageAuditLog.create({
      data: {
        userId,
        actorEmail,
        action: "BUCKET_CREATE",
        bucketId: bucket.id,
        bucketName: bucket.name,
        metadata: { isPublic: bucket.isPublic },
      },
    });

    return bucket;
  }

  static async listBuckets(userId: string) {
    return prisma.storageBucket.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { objects: true },
        },
      },
    });
  }

  static async getBucket(userId: string, bucketIdentifier: string) {
    const bucket = await prisma.storageBucket.findFirst({
      where: {
        userId,
        OR: [{ id: bucketIdentifier }, { name: bucketIdentifier.toLowerCase() }],
      },
      include: {
        _count: {
          select: { objects: true },
        },
      },
    });

    if (!bucket) {
      throw new NotFoundError("Bucket not found or access denied");
    }

    return bucket;
  }

  static async updateBucket(params: {
    userId: string;
    bucketId: string;
    description?: string;
    isPublic?: boolean;
    maxFileSize?: bigint;
    allowedMimeTypes?: string[];
    actorEmail?: string;
  }) {
    const { userId, bucketId, description, isPublic, maxFileSize, allowedMimeTypes, actorEmail } = params;

    const bucket = await this.getBucket(userId, bucketId);

    const updated = await prisma.storageBucket.update({
      where: { id: bucket.id },
      data: {
        description: description !== undefined ? description : bucket.description,
        isPublic: isPublic !== undefined ? isPublic : bucket.isPublic,
        maxFileSize: maxFileSize !== undefined ? maxFileSize : bucket.maxFileSize,
        allowedMimeTypes: allowedMimeTypes !== undefined ? allowedMimeTypes : bucket.allowedMimeTypes,
      },
    });

    // If public status changed, cascade to existing objects
    if (isPublic !== undefined && isPublic !== bucket.isPublic) {
      await prisma.storageObject.updateMany({
        where: { bucketId: bucket.id },
        data: { isPublic },
      });

      await prisma.storageAuditLog.create({
        data: {
          userId,
          actorEmail,
          action: "PUBLIC_ACCESS_TOGGLE",
          bucketId: bucket.id,
          bucketName: bucket.name,
          metadata: { isPublic },
        },
      });
    }

    return updated;
  }

  static async deleteBucket(userId: string, bucketIdentifier: string, force = false, actorEmail?: string) {
    const bucket = await this.getBucket(userId, bucketIdentifier);

    const objectCount = await prisma.storageObject.count({
      where: { bucketId: bucket.id },
    });

    if (objectCount > 0 && !force) {
      throw new StorageError(
        `Bucket '${bucket.name}' is not empty (${objectCount} objects). Delete all objects first or specify force=true.`,
        400,
        "BUCKET_NOT_EMPTY"
      );
    }

    if (objectCount > 0 && force) {
      // Find all object r2 keys and delete from R2 provider
      const objects = await prisma.storageObject.findMany({
        where: { bucketId: bucket.id },
        select: { id: true, r2Key: true, size: true },
      });

      const r2Keys = objects.map((o) => o.r2Key);
      await deleteObjectsR2(r2Keys);

      const totalSize = objects.reduce((sum, o) => sum + o.size, 0n);

      // Decrement User Quota
      await prisma.storageUserQuota.update({
        where: { userId },
        data: {
          usedBytes: { decrement: totalSize },
          objectsCount: { decrement: objects.length },
        },
      });
    }

    await prisma.storageBucket.delete({
      where: { id: bucket.id },
    });

    await prisma.storageAuditLog.create({
      data: {
        userId,
        actorEmail,
        action: "BUCKET_DELETE",
        bucketId: bucket.id,
        bucketName: bucket.name,
        metadata: { force, objectsDeleted: objectCount },
      },
    });

    return { success: true, message: `Bucket '${bucket.name}' deleted successfully.` };
  }

  // ─── Object Operations ──────────────────────────────────────────────────────

  /**
   * Direct server-mediated upload of a Buffer/Uint8Array.
   */
  static async uploadObject(params: {
    userId: string;
    subscriptionTier?: string | null;
    bucketIdentifier: string;
    objectPath: string;
    data: Buffer | Uint8Array;
    mimeType?: string;
    metadata?: Record<string, any>;
    cacheControl?: string;
    contentDisposition?: string;
    actorEmail?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const {
      userId,
      subscriptionTier,
      bucketIdentifier,
      objectPath,
      data,
      mimeType,
      metadata,
      cacheControl,
      contentDisposition,
      actorEmail,
      ipAddress,
      userAgent,
    } = params;

    const bucket = await this.getBucket(userId, bucketIdentifier);
    const safePath = normalizeObjectPath(objectPath);
    const size = BigInt(data.length);

    // Validate MIME type if bucket restricted
    const resolvedMime = mimeType || "application/octet-stream";
    if (bucket.allowedMimeTypes.length > 0) {
      const allowed = bucket.allowedMimeTypes.some((pattern) => {
        if (pattern.endsWith("/*")) {
          return resolvedMime.startsWith(pattern.slice(0, -1));
        }
        return resolvedMime.toLowerCase() === pattern.toLowerCase();
      });
      if (!allowed) {
        throw new StorageError(
          `Content-Type '${resolvedMime}' is not permitted in bucket '${bucket.name}'. Allowed: ${bucket.allowedMimeTypes.join(", ")}`,
          400,
          "DISALLOWED_MIME_TYPE"
        );
      }
    }

    // Step 1: Concurrency-safe atomic quota reservation
    const { reservationId } = await this.reserveUploadQuota({
      userId,
      bucketId: bucket.id,
      objectName: safePath,
      requestedBytes: size,
      uploadType: "SERVER",
      subscriptionTier,
    });

    try {
      // Step 2: Upload directly to Cloudflare R2
      const r2Key = generateR2Key(userId, bucket.id, safePath);
      const uploadRes = await r2UploadDirect({
        r2Key,
        body: data,
        contentType: resolvedMime,
        cacheControl,
        contentDisposition,
        metadata: metadata ? Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k, String(v)])) : undefined,
      });

      // Step 3: Commit quota and save object record
      const objectRecord = await this.commitUpload({
        reservationId,
        actualBytes: size,
        mimeType: resolvedMime,
        etag: uploadRes.etag,
        metadata,
        cacheControl,
        contentDisposition,
        actorEmail,
        ipAddress,
        userAgent,
      });

      return objectRecord;
    } catch (err) {
      // Release reservation immediately on upload failure
      await this.releaseReservation(reservationId, "FAILED").catch(() => {});
      throw err;
    }
  }

  /**
   * Generates a presigned URL for direct client-to-R2 upload with pre-reserved quota.
   */
  static async createPresignedUploadUrl(params: {
    userId: string;
    subscriptionTier?: string | null;
    bucketIdentifier: string;
    objectPath: string;
    expectedSizeBytes: bigint;
    mimeType?: string;
    actorEmail?: string;
  }) {
    const { userId, subscriptionTier, bucketIdentifier, objectPath, expectedSizeBytes, mimeType } = params;

    const bucket = await this.getBucket(userId, bucketIdentifier);
    const safePath = normalizeObjectPath(objectPath);
    const tierConfig = getStorageTierConfig(subscriptionTier);

    // Validate MIME type against bucket policy
    const resolvedMime = mimeType || "application/octet-stream";
    if (bucket.allowedMimeTypes.length > 0) {
      const allowed = bucket.allowedMimeTypes.some((pattern) => {
        if (pattern.endsWith("/*")) return resolvedMime.startsWith(pattern.slice(0, -1));
        return resolvedMime.toLowerCase() === pattern.toLowerCase();
      });
      if (!allowed) {
        throw new StorageError(
          `Content-Type '${resolvedMime}' is not permitted in bucket '${bucket.name}'. Allowed: ${bucket.allowedMimeTypes.join(", ")}`,
          400,
          "DISALLOWED_MIME_TYPE"
        );
      }
    }

    // Atomically reserve quota
    const { reservationId } = await this.reserveUploadQuota({
      userId,
      bucketId: bucket.id,
      objectName: safePath,
      requestedBytes: expectedSizeBytes,
      uploadType: "DIRECT",
      subscriptionTier,
    });

    const r2Key = generateR2Key(userId, bucket.id, safePath);
    const uploadUrl = await r2PresignedUploadUrl({
      r2Key,
      contentType: resolvedMime,
      expiresInSeconds: tierConfig.presignedUrlTtlSeconds,
    });

    return {
      uploadUrl,
      reservationId,
      expiresInSeconds: tierConfig.presignedUrlTtlSeconds,
      r2Key,
      bucketId: bucket.id,
      objectName: safePath,
      expectedSizeBytes: Number(expectedSizeBytes),
    };
  }

  /**
   * Confirms a direct presigned upload after client finishes PUT request to R2.
   */
  static async confirmDirectUpload(params: {
    userId: string;
    reservationId: string;
    mimeType?: string;
    metadata?: Record<string, any>;
    actorEmail?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const { userId, reservationId, mimeType, metadata, actorEmail, ipAddress, userAgent } = params;

    const reservation = await prisma.storageReservation.findUnique({
      where: { id: reservationId },
      include: { bucket: true },
    });

    if (!reservation || reservation.userId !== userId) {
      throw new NotFoundError("Upload reservation not found or unauthorized");
    }

    if (reservation.status === "COMMITTED") {
      const existing = await prisma.storageObject.findUnique({
        where: {
          bucketId_name: {
            bucketId: reservation.bucketId,
            name: reservation.objectName,
          },
        },
      });
      if (existing) return existing;
    }

    const r2Key = generateR2Key(userId, reservation.bucketId, reservation.objectName);
    const head = await headObjectR2(r2Key);

    if (!head) {
      await this.releaseReservation(reservationId, "NOT_FOUND");
      throw new StorageError("Object was not found in storage. Ensure direct upload succeeded.", 404, "OBJECT_NOT_UPLOADED");
    }

    const actualSize = BigInt(head.size);

    return await this.commitUpload({
      reservationId,
      actualBytes: actualSize,
      mimeType: mimeType || head.contentType || "application/octet-stream",
      etag: head.etag,
      metadata,
      actorEmail,
      ipAddress,
      userAgent,
    });
  }

  /**
   * Streams an object directly from Cloudflare R2.
   */
  static async downloadObjectStream(params: {
    userId?: string;
    bucketIdentifier: string;
    objectPath: string;
  }) {
    const { userId, bucketIdentifier, objectPath } = params;
    const safePath = normalizeObjectPath(objectPath);

    // Look up bucket
    const bucket = await prisma.storageBucket.findFirst({
      where: {
        OR: [{ id: bucketIdentifier }, { name: bucketIdentifier.toLowerCase() }],
      },
    });

    if (!bucket) {
      throw new NotFoundError("Bucket not found");
    }

    // Access control: If bucket is private, userId MUST match owner
    if (!bucket.isPublic && (!userId || bucket.userId !== userId)) {
      throw new ForbiddenError("Object is private. Authenticated bucket owner credentials required.");
    }

    const object = await prisma.storageObject.findUnique({
      where: {
        bucketId_name: {
          bucketId: bucket.id,
          name: safePath,
        },
      },
    });

    if (!object) {
      throw new NotFoundError("Object not found");
    }

    const streamData = await r2DownloadStream(object.r2Key);
    return {
      object,
      ...streamData,
    };
  }

  /**
   * Generates a short-lived presigned download URL for an object.
   */
  static async createPresignedDownloadUrl(params: {
    userId: string;
    subscriptionTier?: string | null;
    bucketIdentifier: string;
    objectPath: string;
    expiresInSeconds?: number;
    downloadFilename?: string;
  }) {
    const { userId, subscriptionTier, bucketIdentifier, objectPath, expiresInSeconds, downloadFilename } = params;
    const bucket = await this.getBucket(userId, bucketIdentifier);
    const safePath = normalizeObjectPath(objectPath);
    const tierConfig = getStorageTierConfig(subscriptionTier);

    const object = await prisma.storageObject.findUnique({
      where: {
        bucketId_name: {
          bucketId: bucket.id,
          name: safePath,
        },
      },
    });

    if (!object) {
      throw new NotFoundError("Object not found in this bucket");
    }

    const contentDisposition = downloadFilename
      ? `attachment; filename="${encodeURIComponent(downloadFilename)}"`
      : undefined;

    const downloadUrl = await r2PresignedDownloadUrl({
      r2Key: object.r2Key,
      expiresInSeconds: expiresInSeconds || tierConfig.presignedUrlTtlSeconds,
      contentDisposition,
    });

    return {
      downloadUrl,
      expiresInSeconds: expiresInSeconds || tierConfig.presignedUrlTtlSeconds,
      object,
    };
  }

  /**
   * Paginated listing of objects within a bucket.
   */
  static async listObjects(params: {
    userId: string;
    bucketIdentifier: string;
    prefix?: string;
    search?: string;
    limit?: number;
    offset?: number;
    sortBy?: "name" | "createdAt" | "size";
    sortOrder?: "asc" | "desc";
  }) {
    const { userId, bucketIdentifier, prefix, search, limit = 50, offset = 0, sortBy = "createdAt", sortOrder = "desc" } = params;

    const bucket = await this.getBucket(userId, bucketIdentifier);
    const safeLimit = Math.min(Math.max(1, limit), 100);

    const where: any = {
      bucketId: bucket.id,
    };

    if (prefix) {
      where.name = { startsWith: prefix };
    }

    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    const [total, objects] = await Promise.all([
      prisma.storageObject.count({ where }),
      prisma.storageObject.findMany({
        where,
        take: safeLimit,
        skip: offset,
        orderBy: { [sortBy]: sortOrder },
      }),
    ]);

    return {
      bucket,
      objects: objects.map((obj) => ({
        ...obj,
        size: Number(obj.size),
      })),
      pagination: {
        total,
        limit: safeLimit,
        offset,
        hasMore: offset + objects.length < total,
      },
    };
  }

  /**
   * Deletes an object from R2 and removes database accounting.
   */
  static async deleteObject(params: {
    userId: string;
    bucketIdentifier: string;
    objectPath: string;
    actorEmail?: string;
  }) {
    const { userId, bucketIdentifier, objectPath, actorEmail } = params;
    const bucket = await this.getBucket(userId, bucketIdentifier);
    const safePath = normalizeObjectPath(objectPath);

    const object = await prisma.storageObject.findUnique({
      where: {
        bucketId_name: {
          bucketId: bucket.id,
          name: safePath,
        },
      },
    });

    if (!object) {
      throw new NotFoundError("Object not found in bucket");
    }

    // Delete from Cloudflare R2
    await deleteObjectR2(object.r2Key);

    // Update DB & Quota atomically
    await prisma.$transaction([
      prisma.storageObject.delete({
        where: { id: object.id },
      }),
      prisma.storageUserQuota.update({
        where: { userId },
        data: {
          usedBytes: { decrement: object.size },
          objectsCount: { decrement: 1 },
        },
      }),
      prisma.storageBucket.update({
        where: { id: bucket.id },
        data: {
          totalBytes: { decrement: object.size },
          fileCount: { decrement: 1 },
        },
      }),
      prisma.storageAuditLog.create({
        data: {
          userId,
          actorEmail,
          action: "OBJECT_DELETE",
          bucketId: bucket.id,
          bucketName: bucket.name,
          objectName: object.name,
          bytesAffected: object.size,
        },
      }),
    ]);

    return { success: true, message: `Object '${safePath}' deleted successfully.` };
  }

  /**
   * Copies an object within user storage.
   */
  static async copyObject(params: {
    userId: string;
    subscriptionTier?: string | null;
    srcBucketIdentifier: string;
    srcObjectPath: string;
    destBucketIdentifier: string;
    destObjectPath: string;
    actorEmail?: string;
  }) {
    const {
      userId,
      subscriptionTier,
      srcBucketIdentifier,
      srcObjectPath,
      destBucketIdentifier,
      destObjectPath,
      actorEmail,
    } = params;

    const srcBucket = await this.getBucket(userId, srcBucketIdentifier);
    const destBucket = await this.getBucket(userId, destBucketIdentifier);

    const safeSrc = normalizeObjectPath(srcObjectPath);
    const safeDest = normalizeObjectPath(destObjectPath);

    const srcObj = await prisma.storageObject.findUnique({
      where: {
        bucketId_name: {
          bucketId: srcBucket.id,
          name: safeSrc,
        },
      },
    });

    if (!srcObj) {
      throw new NotFoundError("Source object not found");
    }

    // Reserve quota in destination
    const { reservationId } = await this.reserveUploadQuota({
      userId,
      bucketId: destBucket.id,
      objectName: safeDest,
      requestedBytes: srcObj.size,
      uploadType: "SERVER",
      subscriptionTier,
    });

    const destR2Key = generateR2Key(userId, destBucket.id, safeDest);

    try {
      // Copy inside Cloudflare R2
      const copyResult = await copyObjectR2(srcObj.r2Key, destR2Key);

      // Commit
      const newObj = await this.commitUpload({
        reservationId,
        actualBytes: srcObj.size,
        mimeType: srcObj.mimeType,
        etag: copyResult.etag || srcObj.etag || undefined,
        metadata: (srcObj.metadata as any) || {},
        cacheControl: srcObj.cacheControl || undefined,
        contentDisposition: srcObj.contentDisposition || undefined,
        actorEmail,
      });

      return newObj;
    } catch (err) {
      await this.releaseReservation(reservationId, "FAILED").catch(() => {});
      throw err;
    }
  }

  /**
   * Moves an object (copy + verified delete).
   */
  static async moveObject(params: {
    userId: string;
    subscriptionTier?: string | null;
    srcBucketIdentifier: string;
    srcObjectPath: string;
    destBucketIdentifier: string;
    destObjectPath: string;
    actorEmail?: string;
  }) {
    const copied = await this.copyObject(params);
    await this.deleteObject({
      userId: params.userId,
      bucketIdentifier: params.srcBucketIdentifier,
      objectPath: params.srcObjectPath,
      actorEmail: params.actorEmail,
    });
    return copied;
  }

  // ─── Multipart Upload Lifecycle ─────────────────────────────────────────────

  static async initiateMultipartUpload(params: {
    userId: string;
    subscriptionTier?: string | null;
    bucketIdentifier: string;
    objectPath: string;
    expectedSizeBytes: bigint;
    mimeType?: string;
  }) {
    const { userId, subscriptionTier, bucketIdentifier, objectPath, expectedSizeBytes, mimeType } = params;
    const bucket = await this.getBucket(userId, bucketIdentifier);
    const safePath = normalizeObjectPath(objectPath);
    const resolvedMime = mimeType || "application/octet-stream";

    // Step 1: Reserve expected total size
    const { reservationId } = await this.reserveUploadQuota({
      userId,
      bucketId: bucket.id,
      objectName: safePath,
      requestedBytes: expectedSizeBytes,
      uploadType: "MULTIPART",
      subscriptionTier,
    });

    const r2Key = generateR2Key(userId, bucket.id, safePath);

    try {
      // Step 2: Initiate in Cloudflare R2
      const uploadId = await initiateMultipartUploadR2({
        r2Key,
        contentType: resolvedMime,
      });

      // Update reservation with uploadId
      await prisma.storageReservation.update({
        where: { id: reservationId },
        data: { uploadId },
      });

      return {
        uploadId,
        reservationId,
        bucketId: bucket.id,
        objectName: safePath,
        r2Key,
      };
    } catch (err) {
      await this.releaseReservation(reservationId, "FAILED").catch(() => {});
      throw err;
    }
  }

  static async getMultipartPartUploadUrl(params: {
    userId: string;
    reservationId: string;
    partNumber: number;
    expiresInSeconds?: number;
  }) {
    const { userId, reservationId, partNumber, expiresInSeconds } = params;

    const reservation = await prisma.storageReservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation || reservation.userId !== userId || !reservation.uploadId) {
      throw new NotFoundError("Multipart upload session not found or unauthorized");
    }

    if (reservation.status !== "PENDING") {
      throw new StorageError("Multipart upload session is not active", 409, "INVALID_SESSION_STATE");
    }

    const r2Key = generateR2Key(userId, reservation.bucketId, reservation.objectName);
    const partUrl = await generatePresignedPartUploadUrl({
      r2Key,
      uploadId: reservation.uploadId,
      partNumber,
      expiresInSeconds: expiresInSeconds || 900,
    });

    return {
      partUrl,
      partNumber,
      expiresInSeconds: expiresInSeconds || 900,
    };
  }

  static async completeMultipartUpload(params: {
    userId: string;
    reservationId: string;
    parts: Array<{ PartNumber: number; ETag: string }>;
    mimeType?: string;
    actorEmail?: string;
  }) {
    const { userId, reservationId, parts, mimeType, actorEmail } = params;

    const reservation = await prisma.storageReservation.findUnique({
      where: { id: reservationId },
      include: { bucket: true },
    });

    if (!reservation || reservation.userId !== userId || !reservation.uploadId) {
      throw new NotFoundError("Multipart upload session not found or unauthorized");
    }

    const r2Key = generateR2Key(userId, reservation.bucketId, reservation.objectName);

    // Complete in Cloudflare R2
    const completeRes = await completeMultipartUploadR2({
      r2Key,
      uploadId: reservation.uploadId,
      parts,
    });

    // Inspect final completed object in R2 to verify true size
    const head = await headObjectR2(r2Key);
    const finalSize = head ? BigInt(head.size) : reservation.reservedBytes;

    return await this.commitUpload({
      reservationId,
      actualBytes: finalSize,
      mimeType: mimeType || head?.contentType,
      etag: completeRes.etag || head?.etag,
      actorEmail,
    });
  }

  static async abortMultipartUpload(userId: string, reservationId: string) {
    const reservation = await prisma.storageReservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation || reservation.userId !== userId || !reservation.uploadId) {
      throw new NotFoundError("Multipart upload session not found");
    }

    const r2Key = generateR2Key(userId, reservation.bucketId, reservation.objectName);
    await abortMultipartUploadR2({
      r2Key,
      uploadId: reservation.uploadId,
    }).catch(() => {});

    await this.releaseReservation(reservationId, "ABORTED");
    return { success: true, message: "Multipart upload session aborted." };
  }

  // ─── Usage, Limits & Reconcile ──────────────────────────────────────────────

  static async getUsage(userId: string, subscriptionTier?: string | null) {
    const quota = await this.getOrCreateUserQuota(userId, subscriptionTier);
    const tierConfig = getStorageTierConfig(subscriptionTier);

    const dayWindow = new Date().toISOString().slice(0, 10);
    const minuteWindow = Math.floor(Date.now() / 60000);

    const rpmRaw = await redisClient.get(`storage:rate:${userId}:${minuteWindow}`).catch(() => null);
    const dailyRaw = await redisClient.get(`storage:cmd:${userId}:${dayWindow}`).catch(() => null);

    const usedBytes = Number(quota.usedBytes);
    const reservedBytes = Number(quota.reservedBytes);
    const allocatedBytes = Number(quota.allocatedBytes);
    const availableBytes = Math.max(0, allocatedBytes - (usedBytes + reservedBytes));
    const usagePercent = allocatedBytes > 0 ? Number(((usedBytes / allocatedBytes) * 100).toFixed(2)) : 0;

    return {
      tier: tierConfig.tier,
      tierDisplayName: tierConfig.displayName,
      quota: {
        allocatedBytes,
        allocatedMb: Number((allocatedBytes / (1000 * 1000)).toFixed(2)),
        usedBytes,
        usedMb: Number((usedBytes / (1000 * 1000)).toFixed(2)),
        reservedBytes,
        reservedMb: Number((reservedBytes / (1000 * 1000)).toFixed(2)),
        availableBytes,
        availableMb: Number((availableBytes / (1000 * 1000)).toFixed(2)),
        usagePercent,
        objectsCount: quota.objectsCount,
        lastReconciledAt: quota.lastReconciledAt,
      },
      commandLimits: {
        currentRpm: Number(rpmRaw || 0),
        rateLimitRpm: tierConfig.rateLimitRpm,
        currentDailyCommands: Number(dailyRaw || 0),
        dailyCommandsQuota: tierConfig.dailyCommandsQuota,
        maxFileSizeBytes: Number(tierConfig.maxFileSizeBytes),
        maxFileSizeMb: Number(tierConfig.maxFileSizeBytes / 1_000_000n),
        maxBuckets: tierConfig.maxBuckets,
        maxConcurrentUploads: tierConfig.maxConcurrentUploads,
      },
    };
  }

  /**
   * Reconciles database storage accounting with actual object data.
   * Auto-purges expired reservations.
   */
  static async reconcileQuota(userId: string) {
    return await prisma.$transaction(async (tx) => {
      // 1. Expire outdated reservations
      await tx.storageReservation.updateMany({
        where: {
          userId,
          status: "PENDING",
          expiresAt: { lt: new Date() },
        },
        data: { status: "EXPIRED" },
      });

      // 2. Sum valid active reservations
      const pendingReservations = await tx.storageReservation.findMany({
        where: {
          userId,
          status: "PENDING",
          expiresAt: { gte: new Date() },
        },
        select: { reservedBytes: true },
      });
      const activeReservedBytes = pendingReservations.reduce((sum, r) => sum + r.reservedBytes, 0n);

      // 3. Sum all active stored objects
      const allObjects = await tx.storageObject.findMany({
        where: { userId },
        select: { size: true, bucketId: true },
      });
      const totalUsedBytes = allObjects.reduce((sum, o) => sum + o.size, 0n);

      // 4. Update User Quota
      const updated = await tx.storageUserQuota.upsert({
        where: { userId },
        create: {
          userId,
          allocatedBytes: 250_000_000n,
          usedBytes: totalUsedBytes,
          reservedBytes: activeReservedBytes,
          objectsCount: allObjects.length,
          lastReconciledAt: new Date(),
        },
        update: {
          usedBytes: totalUsedBytes,
          reservedBytes: activeReservedBytes,
          objectsCount: allObjects.length,
          lastReconciledAt: new Date(),
        },
      });

      return {
        usedBytes: Number(updated.usedBytes),
        reservedBytes: Number(updated.reservedBytes),
        objectsCount: updated.objectsCount,
        lastReconciledAt: updated.lastReconciledAt,
      };
    });
  }

  static async getAuditLogs(userId: string, limit = 50) {
    const logs = await prisma.storageAuditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
    });

    return logs.map((log) => ({
      ...log,
      bytesAffected: log.bytesAffected ? Number(log.bytesAffected) : null,
    }));
  }
}
