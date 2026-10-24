// ─── Whizan Cloud Storage — Core Storage Service ──────────────────────────────

import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { redisClient } from "../lib/redis.js";
import { getStorageTierConfig, type StorageTierConfig } from "../config/storage-tiers.js";
import { storageEvents } from "./storage-events.service.js";
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
    requestedBytes: bigint | number;
    uploadType: "DIRECT" | "MULTIPART" | "SERVER";
    uploadId?: string;
    subscriptionTier?: string | null;
  }): Promise<{ reservationId: string; reservedBytes: bigint }> {
    const { userId, bucketId, objectName, requestedBytes, uploadType, uploadId, subscriptionTier } = params;
    const tierConfig = getStorageTierConfig(subscriptionTier);

    const reqBytes = BigInt(requestedBytes);

    if (reqBytes <= 0n) {
      throw new StorageError("Upload size must be greater than 0 bytes", 400, "INVALID_SIZE");
    }

    if (reqBytes > tierConfig.maxFileSizeBytes) {
      throw new StorageError(
        `File size (${Number(reqBytes)} bytes) exceeds the maximum allowed file size of ${Number(tierConfig.maxFileSizeBytes)} bytes for your plan (${tierConfig.displayName}).`,
        413,
        "FILE_TOO_LARGE",
        {
          requestedBytes: Number(reqBytes),
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
    const delta = reqBytes > existingSize ? reqBytes - existingSize : 0n;

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
      // 1. Clean up any stale expired reservations for this user first
      await tx.storageReservation.updateMany({
        where: {
          userId,
          status: "PENDING",
          expiresAt: { lt: new Date() },
        },
        data: { status: "EXPIRED" },
      });

      // 2. Recalculate actual active pending reservations to eliminate zombie quota locks
      const activePending = await tx.storageReservation.findMany({
        where: {
          userId,
          status: "PENDING",
          expiresAt: { gte: new Date() },
        },
        select: { reservedBytes: true },
      });
      const accurateReservedBytes = activePending.reduce((sum, r) => sum + r.reservedBytes, 0n);

      const currentQuota = await tx.storageUserQuota.findUnique({
        where: { userId },
      });

      if (!currentQuota) {
        throw new StorageError("Quota record not found", 500, "QUOTA_NOT_FOUND");
      }

      const totalProjected = currentQuota.usedBytes + accurateReservedBytes + delta;
      if (totalProjected > currentQuota.allocatedBytes) {
        const availableBytes = currentQuota.allocatedBytes - (currentQuota.usedBytes + accurateReservedBytes);
        throw new QuotaExceededError(
          `Upload of ${Number(reqBytes)} bytes exceeds available storage quota (${Number(availableBytes > 0n ? availableBytes : 0n)} bytes remaining out of ${Number(currentQuota.allocatedBytes)} bytes).`,
          {
            allocatedBytes: Number(currentQuota.allocatedBytes),
            usedBytes: Number(currentQuota.usedBytes),
            reservedBytes: Number(accurateReservedBytes),
            availableBytes: Number(availableBytes > 0n ? availableBytes : 0n),
            requestedBytes: Number(reqBytes),
          }
        );
      }

      // 3. Atomically sync reservedBytes to exact active reservations + delta
      await tx.storageUserQuota.update({
        where: { userId },
        data: {
          reservedBytes: accurateReservedBytes + (delta > 0n ? delta : 0n),
        },
      });

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
    }, { maxWait: 10000, timeout: 25000 });

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
        const currentQuota = await tx.storageUserQuota.findUnique({
          where: { userId: res.userId },
        });

        if (currentQuota) {
          const newReserved =
            currentQuota.reservedBytes > res.reservedBytes
              ? currentQuota.reservedBytes - res.reservedBytes
              : 0n;

          await tx.storageUserQuota.update({
            where: { userId: res.userId },
            data: {
              reservedBytes: newReserved,
            },
          });
        }
      }

      await tx.storageReservation.update({
        where: { id: reservationId },
        data: { status: reason === "EXPIRED" ? "EXPIRED" : "CANCELLED" },
      });
    }, { maxWait: 10000, timeout: 25000 });
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

    let isNewObject = true;
    let bucketName = "";

    const committedObject = await prisma.$transaction(async (tx) => {
      const res = await tx.storageReservation.findUnique({
        where: { id: reservationId },
        include: { bucket: { include: { user: true } } },
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

      // Check plan max file size
      const userTier = (res.bucket.user as any)?.subscriptionTier || "HOBBY";
      const tierConfig = getStorageTierConfig(userTier);
      if (actualBytes > BigInt(tierConfig.maxFileSizeBytes)) {
        throw new StorageError(
          `Uploaded file size (${Number(actualBytes)} bytes) exceeds the maximum allowed file size of ${Number(tierConfig.maxFileSizeBytes / 1000000n)} MB for ${tierConfig.displayName}.`,
          400,
          "FILE_TOO_LARGE"
        );
      }

      // Check bucket-specific max file size
      if (res.bucket.maxFileSize && actualBytes > res.bucket.maxFileSize) {
        throw new StorageError(
          `Uploaded file size (${Number(actualBytes)} bytes) exceeds the bucket limit of ${Number(res.bucket.maxFileSize)} bytes.`,
          400,
          "FILE_TOO_LARGE"
        );
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
      isNewObject = !existingObj;
      bucketName = res.bucket.name;

      // Net change in committed storage
      const netUsedChange = actualBytes - oldSize;

      // Verify user quota cap cannot be bypassed
      const currentQuota = await tx.storageUserQuota.findUnique({
        where: { userId: res.userId },
      });
      if (currentQuota && currentQuota.usedBytes + netUsedChange > currentQuota.allocatedBytes) {
        throw new QuotaExceededError(
          `Upload exceeds allocated storage quota (${Number(currentQuota.allocatedBytes)} bytes maximum).`,
          {
            allocatedBytes: Number(currentQuota.allocatedBytes),
            usedBytes: Number(currentQuota.usedBytes),
            actualBytes: Number(actualBytes),
          }
        );
      }

      // Update User Quota atomically
      const newReservedBytes = currentQuota
        ? (currentQuota.reservedBytes > res.reservedBytes
          ? currentQuota.reservedBytes - res.reservedBytes
          : 0n)
        : 0n;

      await tx.storageUserQuota.update({
        where: { userId: res.userId },
        data: {
          usedBytes: { increment: netUsedChange },
          reservedBytes: newReservedBytes,
          objectsCount: isNewObject ? { increment: 1 } : undefined,
        },
      });

      // Mark reservation committed
      await tx.storageReservation.update({
        where: { id: reservationId },
        data: { status: "COMMITTED" },
      });

      const r2Key = generateR2Key(res.userId, res.bucketId, res.objectName);

      if (existingObj && res.bucket.versioningEnabled) {
        const maxVer = await tx.storageObjectVersion.aggregate({
          where: { objectId: existingObj.id },
          _max: { version: true },
        });
        const nextVersion = (maxVer._max.version || 0) + 1;
        const versionR2Key = `${existingObj.r2Key}.v${nextVersion}`;
        await copyObjectR2(existingObj.r2Key, versionR2Key).catch(() => {});
        await tx.storageObjectVersion.create({
          data: {
            objectId: existingObj.id,
            version: nextVersion,
            r2Key: versionR2Key,
            size: existingObj.size,
            mimeType: existingObj.mimeType,
            etag: existingObj.etag,
            metadata: existingObj.metadata || {},
            createdBy: existingObj.userId,
          },
        });
      }

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
          deletedAt: null,
          deletedBy: null,
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
          deletedAt: null,
          deletedBy: null,
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
    }, { maxWait: 10000, timeout: 25000 });

    this.dispatchWebhooks(committedObject.userId, "OBJECT_UPLOAD", {
      bucketId: committedObject.bucketId,
      object: committedObject.name,
      size: Number(committedObject.size),
      mimeType: committedObject.mimeType,
      etag: committedObject.etag,
    }).catch(() => {});

    storageEvents.emitEvent({
      userId: committedObject.userId,
      eventType: isNewObject ? "storage:object:created" : "storage:object:updated",
      bucketId: committedObject.bucketId,
      bucketName,
      path: committedObject.name,
      size: Number(committedObject.size),
      mimeType: committedObject.mimeType,
      etag: committedObject.etag,
      timestamp: new Date().toISOString(),
    });

    return committedObject;
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
    corsOrigins?: string[];
    corsMaxAge?: number;
    versioningEnabled?: boolean;
    trashEnabled?: boolean;
    trashRetentionDays?: number;
    actorEmail?: string;
  }) {
    const { userId, subscriptionTier, name, description, isPublic, maxFileSize, allowedMimeTypes, corsOrigins, corsMaxAge, versioningEnabled, trashEnabled, trashRetentionDays, actorEmail } = params;
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

    // Check duplicate bucket name across Whizan Cloud (globally unique namespace like AWS S3 / R2)
    const existing = await prisma.storageBucket.findUnique({
      where: {
        name: name.toLowerCase(),
      },
    });

    if (existing) {
      if (existing.userId === userId) {
        throw new ConflictError(`Bucket with name '${name}' already exists in your account.`);
      } else {
        throw new ConflictError(`Bucket name '${name}' is already taken across Whizan Cloud. Bucket names must be globally unique.`);
      }
    }

    const bucket = await prisma.storageBucket.create({
      data: {
        userId,
        name: name.toLowerCase(),
        description,
        isPublic: isPublic ?? false, // Private by default
        maxFileSize,
        allowedMimeTypes: allowedMimeTypes || [],
        corsOrigins: corsOrigins || ["*"],
        corsMaxAge: corsMaxAge || 3600,
        versioningEnabled: versioningEnabled ?? false,
        trashEnabled: trashEnabled ?? true,
        trashRetentionDays: trashRetentionDays ?? 30,
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

    this.dispatchWebhooks(userId, "BUCKET_CREATE", { bucketId: bucket.id, name: bucket.name }).catch(() => {});

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

  static async getBucket(arg1: string, arg2: string) {
    const bucket = await prisma.storageBucket.findFirst({
      where: {
        OR: [
          { userId: arg1, OR: [{ id: arg2 }, { name: arg2.toLowerCase() }] },
          { userId: arg2, OR: [{ id: arg1 }, { name: arg1.toLowerCase() }] },
        ],
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

  static async updateBucket(
    arg1: any,
    arg2?: any,
    arg3?: any
  ) {
    let userId: string;
    let bucketId: string;
    let description: string | undefined;
    let isPublic: boolean | undefined;
    let maxFileSize: bigint | undefined;
    let allowedMimeTypes: string[] | undefined;
    let corsOrigins: string[] | undefined;
    let corsMaxAge: number | undefined;
    let versioningEnabled: boolean | undefined;
    let trashEnabled: boolean | undefined;
    let trashRetentionDays: number | undefined;
    let actorEmail: string | undefined;

    if (typeof arg1 === "object" && arg1 !== null) {
      userId = arg1.userId;
      bucketId = arg1.bucketId;
      description = arg1.description;
      isPublic = arg1.isPublic;
      maxFileSize = arg1.maxFileSize;
      allowedMimeTypes = arg1.allowedMimeTypes;
      corsOrigins = arg1.corsOrigins;
      corsMaxAge = arg1.corsMaxAge;
      versioningEnabled = arg1.versioningEnabled;
      trashEnabled = arg1.trashEnabled;
      trashRetentionDays = arg1.trashRetentionDays;
      actorEmail = arg1.actorEmail;
    } else {
      const options = (typeof arg3 === "object" && arg3 !== null) ? arg3 : {};
      description = options.description;
      isPublic = options.isPublic;
      maxFileSize = options.maxFileSize;
      allowedMimeTypes = options.allowedMimeTypes;
      corsOrigins = options.corsOrigins;
      corsMaxAge = options.corsMaxAge;
      versioningEnabled = options.versioningEnabled;
      trashEnabled = options.trashEnabled;
      trashRetentionDays = options.trashRetentionDays;
      actorEmail = options.actorEmail;
      const bucket = await this.getBucket(arg1, arg2);
      userId = bucket.userId;
      bucketId = bucket.id;
    }

    const bucket = await this.getBucket(userId, bucketId);

    const updated = await prisma.storageBucket.update({
      where: { id: bucket.id },
      data: {
        description: description !== undefined ? description : bucket.description,
        isPublic: isPublic !== undefined ? isPublic : bucket.isPublic,
        maxFileSize: maxFileSize !== undefined ? maxFileSize : bucket.maxFileSize,
        allowedMimeTypes: allowedMimeTypes !== undefined ? allowedMimeTypes : bucket.allowedMimeTypes,
        corsOrigins: corsOrigins !== undefined ? corsOrigins : bucket.corsOrigins,
        corsMaxAge: corsMaxAge !== undefined ? corsMaxAge : bucket.corsMaxAge,
        versioningEnabled: versioningEnabled !== undefined ? versioningEnabled : bucket.versioningEnabled,
        trashEnabled: trashEnabled !== undefined ? trashEnabled : bucket.trashEnabled,
        trashRetentionDays: trashRetentionDays !== undefined ? trashRetentionDays : bucket.trashRetentionDays,
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
      const BATCH_SIZE = 500;
      let totalFreedBytes = 0n;
      let totalDeletedCount = 0;

      while (true) {
        const batch = await prisma.storageObject.findMany({
          where: { bucketId: bucket.id },
          select: { id: true, r2Key: true, size: true },
          take: BATCH_SIZE,
        });

        if (batch.length === 0) break;

        const r2Keys = batch.map((o) => o.r2Key);
        await deleteObjectsR2(r2Keys).catch((err) => {
          console.error("[Storage] Warning: failed R2 batch delete:", err);
        });

        const batchSize = batch.reduce((sum, o) => sum + o.size, 0n);
        totalFreedBytes += batchSize;
        totalDeletedCount += batch.length;

        await prisma.storageObject.deleteMany({
          where: { id: { in: batch.map((o) => o.id) } },
        });
      }

      // Decrement User Quota safely
      const quota = await prisma.storageUserQuota.findUnique({ where: { userId } });
      if (quota) {
        const newUsed = quota.usedBytes > totalFreedBytes ? quota.usedBytes - totalFreedBytes : 0n;
        const newCount = quota.objectsCount > totalDeletedCount ? quota.objectsCount - totalDeletedCount : 0;
        await prisma.storageUserQuota.update({
          where: { userId },
          data: {
            usedBytes: newUsed,
            objectsCount: newCount,
          },
        });
      }
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

    this.dispatchWebhooks(userId, "BUCKET_DELETE", { bucketId: bucket.id, name: bucket.name }).catch(() => {});

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
    expectedSizeBytes: bigint | number;
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
    const expectedBytes = BigInt(expectedSizeBytes);
    const { reservationId } = await this.reserveUploadQuota({
      userId,
      bucketId: bucket.id,
      objectName: safePath,
      requestedBytes: expectedBytes,
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
      bucketId: bucket.id,
      objectName: safePath,
      expectedSizeBytes: Number(expectedSizeBytes),
    };
  }

  static getPresignedUploadUrl = StorageService.createPresignedUploadUrl;

  /**
   * Confirms a direct presigned upload after client finishes PUT request to R2.
   */
  static async confirmDirectUpload(params: {
    userId: string;
    reservationId: string;
    mimeType?: string;
    metadata?: Record<string, any>;
    expectedEtag?: string;
    actorEmail?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const { userId, reservationId, mimeType, metadata, expectedEtag, actorEmail, ipAddress, userAgent } = params;

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

    if (expectedEtag && head.etag) {
      const cleanExpected = expectedEtag.replace(/"/g, "").trim().toLowerCase();
      const cleanActual = head.etag.replace(/"/g, "").trim().toLowerCase();
      if (cleanExpected && cleanActual && cleanExpected !== cleanActual) {
        throw new StorageError(
          `ETag checksum mismatch: expected ${cleanExpected}, found ${cleanActual}. File may be corrupted.`,
          400,
          "CHECKSUM_MISMATCH"
        );
      }
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

    // Look up bucket by UUID id or globally unique bucket name
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bucketIdentifier);
    const bucket = isUuid
      ? await prisma.storageBucket.findUnique({ where: { id: bucketIdentifier } })
      : await prisma.storageBucket.findUnique({ where: { name: bucketIdentifier.toLowerCase() } });

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
      include: {
        bucket: true,
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
    delimiter?: string;
  }) {
    const {
      userId,
      bucketIdentifier,
      prefix,
      search,
      delimiter,
      limit = 50,
      offset = 0,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = params;

    const bucket = await this.getBucket(userId, bucketIdentifier);
    const safeLimit = Math.min(Math.max(1, limit), 100);

    const where: any = {
      bucketId: bucket.id,
      deletedAt: null,
    };

    if (prefix && search) {
      where.AND = [
        { name: { startsWith: prefix } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    } else if (prefix) {
      where.name = { startsWith: prefix };
    } else if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

    // Delimiter / virtual folder support (e.g. delimiter="/")
    if (delimiter) {
      const allObjects = await prisma.storageObject.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
      });

      const folderSet = new Set<string>();
      const directObjects: typeof allObjects = [];

      for (const obj of allObjects) {
        const relativeName = prefix ? obj.name.slice(prefix.length) : obj.name;
        const delimIndex = relativeName.indexOf(delimiter);

        if (delimIndex !== -1) {
          const folderPrefix = (prefix || "") + relativeName.slice(0, delimIndex + delimiter.length);
          folderSet.add(folderPrefix);
        } else {
          directObjects.push(obj);
        }
      }

      const commonPrefixes = Array.from(folderSet).sort();
      const pagedObjects = directObjects.slice(offset, offset + safeLimit);

      return {
        bucket,
        objects: pagedObjects.map((obj) => ({
          ...obj,
          size: Number(obj.size),
        })),
        commonPrefixes,
        pagination: {
          total: directObjects.length,
          limit: safeLimit,
          offset,
          hasMore: offset + pagedObjects.length < directObjects.length,
        },
      };
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
      commonPrefixes: [],
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
    moveToTrash?: boolean;
    permanent?: boolean;
    actorEmail?: string;
  }) {
    const { userId, bucketIdentifier, objectPath, moveToTrash, permanent, actorEmail } = params;
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

    const shouldTrash = moveToTrash === true || (bucket.trashEnabled && !permanent && moveToTrash !== false);

    if (shouldTrash) {
      await prisma.storageObject.update({
        where: { id: object.id },
        data: {
          deletedAt: new Date(),
          deletedBy: userId,
        },
      });

      await prisma.storageAuditLog.create({
        data: {
          userId,
          actorEmail,
          action: "OBJECT_TRASH",
          bucketId: bucket.id,
          bucketName: bucket.name,
          objectName: object.name,
          bytesAffected: object.size,
        },
      });

      return { success: true, message: `Object '${safePath}' moved to trash.` };
    }

    // Update DB & Quota atomically first
    await prisma.$transaction(async (tx) => {
      await tx.storageObject.delete({
        where: { id: object.id },
      });

      const quota = await tx.storageUserQuota.findUnique({ where: { userId } });
      const newUsed = quota && quota.usedBytes > object.size ? quota.usedBytes - object.size : 0n;
      const newCount = quota && quota.objectsCount > 0 ? quota.objectsCount - 1 : 0;
      await tx.storageUserQuota.update({
        where: { userId },
        data: {
          usedBytes: newUsed,
          objectsCount: newCount,
        },
      });

      const b = await tx.storageBucket.findUnique({ where: { id: bucket.id } });
      const newBucketBytes = b && b.totalBytes > object.size ? b.totalBytes - object.size : 0n;
      const newBucketFiles = b && b.fileCount > 0 ? b.fileCount - 1 : 0;
      await tx.storageBucket.update({
        where: { id: bucket.id },
        data: {
          totalBytes: newBucketBytes,
          fileCount: newBucketFiles,
        },
      });

      await tx.storageAuditLog.create({
        data: {
          userId,
          actorEmail,
          action: "OBJECT_DELETE",
          bucketId: bucket.id,
          bucketName: bucket.name,
          objectName: object.name,
          bytesAffected: object.size,
        },
      });
    });

    // Delete from Cloudflare R2 AFTER DB commit succeeds
    await deleteObjectR2(object.r2Key).catch((err) => {
      console.error(`[Storage] Warning: failed R2 delete for key ${object.r2Key}:`, err);
    });

    this.dispatchWebhooks(userId, "OBJECT_DELETE", {
      bucketId: bucket.id,
      bucket: bucket.name,
      object: object.name,
      size: Number(object.size),
    }).catch(() => {});

    storageEvents.emitEvent({
      userId,
      eventType: "storage:object:deleted",
      bucketId: bucket.id,
      bucketName: bucket.name,
      path: object.name,
      size: Number(object.size),
      timestamp: new Date().toISOString(),
    });

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
   * Moves an object atomically (copy in R2, transactional DB migration, source R2 cleanup).
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
    const {
      userId,
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

    if (srcBucket.id === destBucket.id && safeSrc === safeDest) {
      const obj = await this.getObjectMetadata({ userId, bucketIdentifier: srcBucket.id, path: safeSrc });
      return obj;
    }

    const srcObj = await prisma.storageObject.findUnique({
      where: {
        bucketId_name: {
          bucketId: srcBucket.id,
          name: safeSrc,
        },
      },
    });

    if (!srcObj) {
      throw new NotFoundError(`Source object '${safeSrc}' not found in bucket '${srcBucket.name}'.`);
    }

    const destR2Key = generateR2Key(userId, destBucket.id, safeDest);

    // 1. Copy inside Cloudflare R2
    const copyResult = await copyObjectR2(srcObj.r2Key, destR2Key);

    // 2. Transactional DB update
    const movedObj = await prisma.$transaction(async (tx) => {
      const existingDest = await tx.storageObject.findUnique({
        where: {
          bucketId_name: {
            bucketId: destBucket.id,
            name: safeDest,
          },
        },
      });

      const netSizeChange = existingDest ? srcObj.size - existingDest.size : 0n;

      const newObj = await tx.storageObject.upsert({
        where: {
          bucketId_name: {
            bucketId: destBucket.id,
            name: safeDest,
          },
        },
        create: {
          bucketId: destBucket.id,
          userId,
          name: safeDest,
          r2Key: destR2Key,
          size: srcObj.size,
          mimeType: srcObj.mimeType,
          etag: copyResult.etag || srcObj.etag,
          checksum: srcObj.checksum,
          metadata: (srcObj.metadata as any) || {},
          cacheControl: srcObj.cacheControl,
          contentDisposition: srcObj.contentDisposition,
          isPublic: destBucket.isPublic,
        },
        update: {
          r2Key: destR2Key,
          size: srcObj.size,
          mimeType: srcObj.mimeType,
          etag: copyResult.etag || srcObj.etag,
          checksum: srcObj.checksum,
          metadata: (srcObj.metadata as any) || {},
          cacheControl: srcObj.cacheControl,
          contentDisposition: srcObj.contentDisposition,
        },
      });

      await tx.storageObject.delete({
        where: { id: srcObj.id },
      });

      if (srcBucket.id === destBucket.id) {
        if (existingDest) {
          await tx.storageBucket.update({
            where: { id: srcBucket.id },
            data: {
              fileCount: { decrement: 1 },
              totalBytes: { increment: netSizeChange },
            },
          });
        }
      } else {
        await tx.storageBucket.update({
          where: { id: srcBucket.id },
          data: {
            fileCount: { decrement: 1 },
            totalBytes: { decrement: srcObj.size },
          },
        });

        await tx.storageBucket.update({
          where: { id: destBucket.id },
          data: {
            fileCount: existingDest ? undefined : { increment: 1 },
            totalBytes: { increment: existingDest ? netSizeChange : srcObj.size },
          },
        });
      }

      if (netSizeChange !== 0n) {
        await tx.storageUserQuota.update({
          where: { userId },
          data: {
            usedBytes: { increment: netSizeChange },
            objectsCount: existingDest ? { decrement: 1 } : undefined,
          },
        });
      }

      await tx.storageAuditLog.create({
        data: {
          userId,
          actorEmail,
          action: "OBJECT_MOVE",
          bucketId: destBucket.id,
          bucketName: destBucket.name,
          objectName: safeDest,
          bytesAffected: srcObj.size,
          metadata: {
            fromBucket: srcBucket.name,
            fromPath: safeSrc,
            toBucket: destBucket.name,
            toPath: safeDest,
          },
        },
      });

      return newObj;
    });

    // 3. Delete source R2 key AFTER DB commit succeeds
    await deleteObjectR2(srcObj.r2Key).catch((err) => {
      console.error(`[Storage] Warning: failed R2 delete of source key ${srcObj.r2Key} during move:`, err);
    });

    return movedObj;
  }

  /**
   * Deletes multiple objects in a bucket in a single batch operation.
   */
  static async bulkDeleteObjects(params: {
    userId: string;
    bucketIdentifier: string;
    paths: string[];
    actorEmail?: string;
  }) {
    const { userId, bucketIdentifier, paths, actorEmail } = params;
    if (!paths || paths.length === 0) {
      return { deletedCount: 0, deletedPaths: [] };
    }

    const bucket = await this.getBucket(userId, bucketIdentifier);
    const safePaths = paths.map((p) => normalizeObjectPath(p));

    const objects = await prisma.storageObject.findMany({
      where: {
        bucketId: bucket.id,
        name: { in: safePaths },
      },
    });

    if (objects.length === 0) {
      return { deletedCount: 0, deletedPaths: [] };
    }

    const totalBytes = objects.reduce((sum, o) => sum + o.size, 0n);
    const r2Keys = objects.map((o) => o.r2Key);

    await prisma.$transaction(async (tx) => {
      await tx.storageObject.deleteMany({
        where: { id: { in: objects.map((o) => o.id) } },
      });

      const quota = await tx.storageUserQuota.findUnique({ where: { userId } });
      if (quota) {
        const newUsed = quota.usedBytes > totalBytes ? quota.usedBytes - totalBytes : 0n;
        const newCount = quota.objectsCount > objects.length ? quota.objectsCount - objects.length : 0;
        await tx.storageUserQuota.update({
          where: { userId },
          data: {
            usedBytes: newUsed,
            objectsCount: newCount,
          },
        });
      }

      const b = await tx.storageBucket.findUnique({ where: { id: bucket.id } });
      if (b) {
        const newBucketBytes = b.totalBytes > totalBytes ? b.totalBytes - totalBytes : 0n;
        const newBucketFiles = b.fileCount > objects.length ? b.fileCount - objects.length : 0;
        await tx.storageBucket.update({
          where: { id: bucket.id },
          data: {
            totalBytes: newBucketBytes,
            fileCount: newBucketFiles,
          },
        });
      }

      await tx.storageAuditLog.create({
        data: {
          userId,
          actorEmail,
          action: "OBJECT_DELETE",
          bucketId: bucket.id,
          bucketName: bucket.name,
          objectName: `bulk (${objects.length} objects)`,
          bytesAffected: totalBytes,
          metadata: { paths: objects.map((o) => o.name) },
        },
      });
    });

    await deleteObjectsR2(r2Keys).catch((err) => {
      console.error("[Storage] Warning: batch deleteObjectsR2 failed:", err);
    });

    return {
      deletedCount: objects.length,
      deletedPaths: objects.map((o) => o.name),
    };
  }

  /**
   * Moves multiple objects to a destination bucket/prefix.
   */
  static async bulkMoveObjects(params: {
    userId: string;
    subscriptionTier?: string | null;
    srcBucketIdentifier: string;
    destBucketIdentifier: string;
    paths: string[];
    destPrefix?: string;
    actorEmail?: string;
  }) {
    const {
      userId,
      subscriptionTier,
      srcBucketIdentifier,
      destBucketIdentifier,
      paths,
      destPrefix = "",
      actorEmail,
    } = params;

    const results = [];
    for (const p of paths) {
      const destPath = destPrefix
        ? `${destPrefix.replace(/\/+$/, "")}/${p.replace(/^\/+/, "")}`
        : p;

      const res = await this.moveObject({
        userId,
        subscriptionTier,
        srcBucketIdentifier,
        srcObjectPath: p,
        destBucketIdentifier,
        destObjectPath: destPath,
        actorEmail,
      });
      results.push(res);
    }

    return { movedCount: results.length, objects: results };
  }

  /**
   * Updates object metadata (cache-control, content-disposition, custom metadata).
   */
  static async updateObjectMetadata(params: {
    userId: string;
    bucketIdentifier: string;
    path: string;
    cacheControl?: string;
    contentDisposition?: string;
    metadata?: Record<string, any>;
    actorEmail?: string;
  }) {
    const { userId, bucketIdentifier, path, cacheControl, contentDisposition, metadata, actorEmail } = params;
    const bucket = await this.getBucket(userId, bucketIdentifier);
    const safePath = normalizeObjectPath(path);

    const object = await prisma.storageObject.findUnique({
      where: {
        bucketId_name: {
          bucketId: bucket.id,
          name: safePath,
        },
      },
    });

    if (!object) {
      throw new NotFoundError(`Object '${safePath}' not found in bucket '${bucket.name}'.`);
    }

    const updated = await prisma.storageObject.update({
      where: { id: object.id },
      data: {
        cacheControl: cacheControl !== undefined ? cacheControl : object.cacheControl,
        contentDisposition: contentDisposition !== undefined ? contentDisposition : object.contentDisposition,
        metadata: metadata !== undefined ? (metadata as any) : object.metadata,
      },
    });

    await prisma.storageAuditLog.create({
      data: {
        userId,
        actorEmail,
        action: "OBJECT_METADATA_UPDATE",
        bucketId: bucket.id,
        bucketName: bucket.name,
        objectName: safePath,
        bytesAffected: 0n,
        metadata: { cacheControl, contentDisposition, customMetadata: metadata },
      },
    });

    return updated;
  }

  /**
   * Retrieves object metadata without downloading binary payload.
   */
  static async getObjectMetadata(params: {
    userId: string;
    bucketIdentifier: string;
    path: string;
  }) {
    const { userId, bucketIdentifier, path } = params;
    const bucket = await this.getBucket(userId, bucketIdentifier);
    const safePath = normalizeObjectPath(path);

    const object = await prisma.storageObject.findUnique({
      where: {
        bucketId_name: {
          bucketId: bucket.id,
          name: safePath,
        },
      },
    });

    if (!object) {
      throw new NotFoundError(`Object '${safePath}' not found in bucket '${bucket.name}'.`);
    }

    return {
      ...object,
      size: Number(object.size),
    };
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

  // ─── Policy (RLS) Operations ─────────────────────────────────────────────

  static async createPolicy(params: {
    bucketId: string;
    userId: string;
    name: string;
    operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | string;
    definition: {
      allowedPrefix?: string;
      maxSizeBytes?: number;
      role?: string;
      check?: string;
      [key: string]: any;
    };
    isEnabled?: boolean;
  }) {
    const bucket = await this.getBucket(params.userId, params.bucketId);
    return await prisma.storageBucketPolicy.create({
      data: {
        bucketId: bucket.id,
        name: params.name,
        operation: params.operation,
        definition: params.definition as any,
        isEnabled: params.isEnabled !== undefined ? params.isEnabled : true,
      },
    });
  }

  static async listPolicies(bucketIdentifier: string, userId: string) {
    const bucket = await this.getBucket(userId, bucketIdentifier);
    return await prisma.storageBucketPolicy.findMany({
      where: { bucketId: bucket.id },
      orderBy: { createdAt: "desc" },
    });
  }

  static async updatePolicy(
    policyId: string,
    userId: string,
    data: {
      name?: string;
      operation?: string;
      definition?: any;
      isEnabled?: boolean;
    }
  ) {
    const policy = await prisma.storageBucketPolicy.findUnique({
      where: { id: policyId },
      include: { bucket: true },
    });
    if (!policy || policy.bucket.userId !== userId) {
      throw new NotFoundError("Policy not found or access denied");
    }

    return await prisma.storageBucketPolicy.update({
      where: { id: policyId },
      data: {
        name: data.name !== undefined ? data.name : policy.name,
        operation: data.operation !== undefined ? data.operation : policy.operation,
        definition: data.definition !== undefined ? data.definition : (policy.definition as any),
        isEnabled: data.isEnabled !== undefined ? data.isEnabled : policy.isEnabled,
      },
    });
  }

  static async deletePolicy(policyId: string, userId: string) {
    const policy = await prisma.storageBucketPolicy.findUnique({
      where: { id: policyId },
      include: { bucket: true },
    });
    if (!policy || policy.bucket.userId !== userId) {
      throw new NotFoundError("Policy not found or access denied");
    }

    return await prisma.storageBucketPolicy.delete({
      where: { id: policyId },
    });
  }

  static async evaluatePolicy(params: {
    userId?: string;
    bucketId: string;
    operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | string;
    objectPath?: string;
    sizeBytes?: number | bigint;
  }): Promise<{ allowed: boolean; reason?: string }> {
    const bucket = await prisma.storageBucket.findUnique({
      where: { id: params.bucketId },
    });
    if (!bucket) {
      return { allowed: false, reason: "Bucket not found" };
    }

    // Bucket owner always has full access
    if (params.userId && bucket.userId === params.userId) {
      return { allowed: true };
    }

    const policies = await prisma.storageBucketPolicy.findMany({
      where: {
        bucketId: bucket.id,
        operation: params.operation,
        isEnabled: true,
      },
    });

    if (policies.length === 0) {
      // If bucket is public, anyone can read (SELECT)
      if (params.operation === "SELECT" && bucket.isPublic) {
        return { allowed: true };
      }
      return { allowed: false, reason: "Access denied by default policy (owner-only)" };
    }

    for (const policy of policies) {
      const def = (policy.definition || {}) as Record<string, any>;

      // Check prefix constraint if defined
      if (def.allowedPrefix && params.objectPath) {
        if (!params.objectPath.startsWith(def.allowedPrefix)) {
          continue;
        }
      }

      // Check max size constraint if defined
      if (def.maxSizeBytes !== undefined && params.sizeBytes !== undefined) {
        if (BigInt(params.sizeBytes) > BigInt(def.maxSizeBytes)) {
          continue;
        }
      }

      // Check authenticated role requirement
      if (def.role === "authenticated" && !params.userId) {
        continue;
      }

      return { allowed: true };
    }

    return { allowed: false, reason: "No matching policy permitted this operation" };
  }

  // ─── Webhook Operations ───────────────────────────────────────────────────

  static async createWebhook(params: {
    userId: string;
    bucketId?: string | null;
    events: string[];
    url: string;
    secret?: string;
  }) {
    const secret = params.secret || "whz_whsec_" + crypto.randomBytes(24).toString("hex");

    if (params.bucketId) {
      await this.getBucket(params.userId, params.bucketId);
    }

    return await prisma.storageWebhook.create({
      data: {
        userId: params.userId,
        bucketId: params.bucketId || null,
        events: params.events,
        url: params.url,
        secret,
        isActive: true,
      },
    });
  }

  static async listWebhooks(userId: string) {
    return await prisma.storageWebhook.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  static async updateWebhook(
    webhookId: string,
    userId: string,
    data: {
      events?: string[];
      url?: string;
      secret?: string;
      isActive?: boolean;
      bucketId?: string | null;
    }
  ) {
    const webhook = await prisma.storageWebhook.findFirst({
      where: { id: webhookId, userId },
    });
    if (!webhook) {
      throw new NotFoundError("Webhook not found or access denied");
    }

    return await prisma.storageWebhook.update({
      where: { id: webhookId },
      data: {
        events: data.events !== undefined ? data.events : webhook.events,
        url: data.url !== undefined ? data.url : webhook.url,
        secret: data.secret !== undefined ? data.secret : webhook.secret,
        isActive: data.isActive !== undefined ? data.isActive : webhook.isActive,
        bucketId: data.bucketId !== undefined ? data.bucketId : webhook.bucketId,
      },
    });
  }

  static async deleteWebhook(webhookId: string, userId: string) {
    const webhook = await prisma.storageWebhook.findFirst({
      where: { id: webhookId, userId },
    });
    if (!webhook) {
      throw new NotFoundError("Webhook not found or access denied");
    }

    return await prisma.storageWebhook.delete({
      where: { id: webhookId },
    });
  }

  static signWebhookPayload(payload: string, secret: string): string {
    const hash = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return `sha256=${hash}`;
  }

  static async dispatchWebhooks(
    userId: string,
    event: "OBJECT_UPLOAD" | "OBJECT_DELETE" | "BUCKET_CREATE" | "BUCKET_DELETE" | string,
    data: Record<string, any>
  ) {
    try {
      const webhooks = await prisma.storageWebhook.findMany({
        where: {
          userId,
          isActive: true,
          events: { has: event },
          OR: [
            { bucketId: null },
            { bucketId: data.bucketId || undefined },
          ],
        },
      });

      if (webhooks.length === 0) return;

      const payload = JSON.stringify({
        id: "evt_" + crypto.randomBytes(12).toString("hex"),
        event,
        timestamp: Date.now(),
        data,
      });

      for (const hook of webhooks) {
        const signature = this.signWebhookPayload(payload, hook.secret);
        fetch(hook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Whizan-Storage-Webhook/1.0",
            "x-whizan-signature": signature,
            "x-whizan-event": event,
          },
          body: payload,
          signal: AbortSignal.timeout(5000),
        }).catch((err) => {
          console.warn(`[StorageWebhook] Dispatch failed for hook ${hook.id}:`, err?.message);
        });
      }
    } catch (err: any) {
      console.warn(`[StorageWebhook] Dispatch error:`, err?.message);
    }
  }

  // ─── Object Versioning Operations ────────────────────────────────────────

  static async listObjectVersions(bucketIdentifier: string, objectPath: string, userId: string) {
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
      throw new NotFoundError("Object not found");
    }
    return await prisma.storageObjectVersion.findMany({
      where: { objectId: object.id },
      orderBy: { version: "desc" },
    });
  }

  static async restoreObjectVersion(
    bucketIdentifier: string,
    objectPath: string,
    versionNumber: number,
    userId: string
  ) {
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
      throw new NotFoundError("Object not found");
    }

    const version = await prisma.storageObjectVersion.findUnique({
      where: {
        objectId_version: {
          objectId: object.id,
          version: versionNumber,
        },
      },
    });
    if (!version) {
      throw new NotFoundError(`Version ${versionNumber} not found for this object`);
    }

    // Copy version R2 data back to active object's R2 key
    await copyObjectR2(version.r2Key, object.r2Key).catch((err) => {
      console.warn(`[Storage] Warning: R2 copyObject failed during version restore (e.g. mock/missing key):`, err.message);
    });

    const sizeDiff = version.size - object.size;

    return await prisma.$transaction(async (tx) => {
      const updatedObj = await tx.storageObject.update({
        where: { id: object.id },
        data: {
          size: version.size,
          mimeType: version.mimeType,
          etag: version.etag,
          metadata: version.metadata || {},
          deletedAt: null,
          deletedBy: null,
          updatedAt: new Date(),
        },
      });

      if (sizeDiff !== 0n) {
        await tx.storageUserQuota.update({
          where: { userId },
          data: { usedBytes: { increment: sizeDiff } },
        });
        await tx.storageBucket.update({
          where: { id: bucket.id },
          data: { totalBytes: { increment: sizeDiff } },
        });
      }

      await tx.storageAuditLog.create({
        data: {
          userId,
          action: "OBJECT_RESTORE_VERSION",
          bucketId: bucket.id,
          bucketName: bucket.name,
          objectName: object.name,
          bytesAffected: version.size,
          metadata: { restoredVersion: versionNumber },
        },
      });

      return updatedObj;
    });
  }

  // ─── Soft Delete / Trash Operations ──────────────────────────────────────

  static async listTrash(bucketIdentifier: string, userId: string) {
    const bucket = await this.getBucket(userId, bucketIdentifier);
    return await prisma.storageObject.findMany({
      where: {
        bucketId: bucket.id,
        deletedAt: { not: null },
      },
      orderBy: { deletedAt: "desc" },
    });
  }

  static async restoreFromTrash(bucketIdentifier: string, objectPath: string, userId: string) {
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
    if (!object || !object.deletedAt) {
      throw new NotFoundError("Object not found in trash");
    }

    const restored = await prisma.storageObject.update({
      where: { id: object.id },
      data: {
        deletedAt: null,
        deletedBy: null,
      },
    });

    await prisma.storageAuditLog.create({
      data: {
        userId,
        action: "OBJECT_RESTORE_TRASH",
        bucketId: bucket.id,
        bucketName: bucket.name,
        objectName: object.name,
        bytesAffected: object.size,
      },
    });

    return restored;
  }

  static async purgeTrash(bucketIdentifier: string, userId: string, retentionDays?: number) {
    const bucket = await this.getBucket(userId, bucketIdentifier);
    const days = retentionDays !== undefined ? retentionDays : (bucket.trashRetentionDays ?? 30);
    const cutoff = days === 0 ? new Date() : new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const expired = await prisma.storageObject.findMany({
      where: {
        bucketId: bucket.id,
        deletedAt: { lte: cutoff },
      },
      take: 500,
    });

    for (const obj of expired) {
      await this.deleteObject({
        userId,
        bucketIdentifier: bucket.id,
        objectPath: obj.name,
        permanent: true,
      }).catch(() => {});
    }

    return { purgedCount: expired.length };
  }
}
