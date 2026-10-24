// ─── Whizan Cloud Storage — Fastify Routes (v1 API) ───────────────────────────

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  StorageService,
  StorageError,
  QuotaExceededError,
  RateLimitExceededError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from "../services/storage.service.js";
import { getStorageTierConfig } from "../config/storage-tiers.js";

// ── Validation Schemas ────────────────────────────────────────────────────────

const CreateBucketSchema = z.object({
  name: z.string().min(3).max(63),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().default(false),
  maxFileSize: z.union([z.number(), z.string()]).optional(),
  allowedMimeTypes: z.array(z.string()).optional(),
});

const UpdateBucketSchema = z.object({
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
  maxFileSize: z.union([z.number(), z.string()]).optional(),
  allowedMimeTypes: z.array(z.string()).optional(),
});

const PresignedUploadUrlSchema = z.object({
  objectPath: z.string().min(1),
  expectedSizeBytes: z.union([z.number().int().positive(), z.string()]),
  mimeType: z.string().optional(),
});

const ConfirmUploadSchema = z.object({
  reservationId: z.string().uuid(),
  mimeType: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const PresignedDownloadUrlSchema = z.object({
  expiresInSeconds: z.number().int().min(30).max(86400).optional(),
  downloadFilename: z.string().optional(),
});

const CopyMoveObjectSchema = z.object({
  destBucket: z.string().min(1),
  destPath: z.string().min(1),
});

const MultipartInitSchema = z.object({
  objectPath: z.string().min(1),
  expectedSizeBytes: z.union([z.number().int().positive(), z.string()]),
  mimeType: z.string().optional(),
});

const MultipartPartUrlSchema = z.object({
  reservationId: z.string().uuid(),
  partNumber: z.number().int().min(1).max(10000),
  expiresInSeconds: z.number().int().min(30).max(3600).optional(),
});

const MultipartCompleteSchema = z.object({
  reservationId: z.string().uuid(),
  parts: z.array(
    z.object({
      PartNumber: z.number().int().min(1),
      ETag: z.string().min(1),
    })
  ).min(1),
  mimeType: z.string().optional(),
});

// ── Helper to format BigInt in JSON responses ────────────────────────────────

function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return Number(obj);
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === "object" && !(obj instanceof Date)) {
    const res: any = {};
    for (const key of Object.keys(obj)) {
      res[key] = serializeBigInt(obj[key]);
    }
    return res;
  }
  return obj;
}

export async function storageRoutes(fastify: FastifyInstance) {
  // ── Error handler for storage domain errors ────────────────────────────────
  const handleError = (error: any, reply: FastifyReply) => {
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: "VALIDATION_ERROR",
        message: "Invalid request payload",
        issues: error.issues,
      });
    }

    if (error instanceof StorageError) {
      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        details: error.details,
      });
    }

    fastify.log.error(error);
    return reply.code(500).send({
      error: "INTERNAL_STORAGE_ERROR",
      message: error.message || "An unexpected error occurred in Whizan Cloud Storage.",
    });
  };

  // ── Public Access (No Auth required) ───────────────────────────────────────
  // GET /public/:bucketName/* (e.g. /public/avatars/user-123/profile.png)
  fastify.get("/public/:bucketName/*", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { bucketName } = request.params as { bucketName: string };
      const rawWildcard = (request.params as any)["*"] as string;

      const { object, stream, contentType, contentLength, etag, cacheControl, contentDisposition } =
        await StorageService.downloadObjectStream({
          bucketIdentifier: bucketName,
          objectPath: rawWildcard,
        });

      if (!object.isPublic) {
        return reply.code(403).send({ error: "FORBIDDEN", message: "This object is in a private bucket." });
      }

      reply.header("Content-Type", contentType);
      if (contentLength) reply.header("Content-Length", contentLength);
      if (etag) reply.header("ETag", `"${etag}"`);
      reply.header("Cache-Control", cacheControl || "public, max-age=3600, s-maxage=86400");
      if (contentDisposition) reply.header("Content-Disposition", contentDisposition);

      return reply.send(stream);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // ── Authenticated Route Guard ──────────────────────────────────────────────
  fastify.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for public asset stream
    if (request.url.includes("/public/")) return;

    await (fastify as any).authenticate(request, reply);
    if (reply.sent) return;

    // Rate limiting per user subscription tier
    const user = (request as any).user;
    if (user?.userId) {
      await StorageService.enforceRateLimit(
        user.userId,
        user.subscriptionTier || "HOBBY",
        request.method + " " + request.routerPath
      );
    }
  });

  // ── Usage & Limits ─────────────────────────────────────────────────────────

  fastify.get("/usage", async (request: any, reply: any) => {
    try {
      const { userId, subscriptionTier } = request.user;
      const usage = await StorageService.getUsage(userId, subscriptionTier);
      return serializeBigInt(usage);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.get("/limits", async (request: any, reply: any) => {
    try {
      const { subscriptionTier } = request.user;
      const tierConfig = getStorageTierConfig(subscriptionTier);
      return serializeBigInt(tierConfig);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.post("/reconcile", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const res = await StorageService.reconcileQuota(userId);
      return serializeBigInt({ success: true, reconciled: res });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.get("/audit-logs", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const query = request.query as { limit?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 50;
      const logs = await StorageService.getAuditLogs(userId, limit);
      return serializeBigInt(logs);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // ── Bucket Endpoints ───────────────────────────────────────────────────────

  fastify.post("/buckets", async (request: any, reply: any) => {
    try {
      const { userId, email, subscriptionTier } = request.user;
      const parsed = CreateBucketSchema.parse(request.body);

      const bucket = await StorageService.createBucket({
        userId,
        subscriptionTier,
        name: parsed.name,
        description: parsed.description,
        isPublic: parsed.isPublic,
        maxFileSize: parsed.maxFileSize ? BigInt(parsed.maxFileSize) : undefined,
        allowedMimeTypes: parsed.allowedMimeTypes,
        actorEmail: email,
      });

      return serializeBigInt({ success: true, bucket });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.get("/buckets", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const buckets = await StorageService.listBuckets(userId);
      return serializeBigInt(buckets);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.get("/buckets/:bucketId", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const bucket = await StorageService.getBucket(userId, bucketId);
      return serializeBigInt(bucket);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.patch("/buckets/:bucketId", async (request: any, reply: any) => {
    try {
      const { userId, email } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const parsed = UpdateBucketSchema.parse(request.body);

      const bucket = await StorageService.updateBucket({
        userId,
        bucketId,
        description: parsed.description,
        isPublic: parsed.isPublic,
        maxFileSize: parsed.maxFileSize ? BigInt(parsed.maxFileSize) : undefined,
        allowedMimeTypes: parsed.allowedMimeTypes,
        actorEmail: email,
      });

      return serializeBigInt({ success: true, bucket });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.delete("/buckets/:bucketId", async (request: any, reply: any) => {
    try {
      const { userId, email } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const query = request.query as { force?: string };
      const force = query?.force === "true";

      const res = await StorageService.deleteBucket(userId, bucketId, force, email);
      return res;
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // ── Object Endpoints ───────────────────────────────────────────────────────

  // Server-mediated file upload
  fastify.post("/buckets/:bucketId/objects/upload", async (request: any, reply: any) => {
    try {
      const { userId, email, subscriptionTier } = request.user;
      const { bucketId } = request.params as { bucketId: string };

      let fileBuffer: Buffer | null = null;
      let objectPath = "";
      let mimeType = "application/octet-stream";
      let cacheControl: string | undefined;
      let contentDisposition: string | undefined;

      // Check if multipart form upload or JSON payload
      if (request.isMultipart()) {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            fileBuffer = await part.toBuffer();
            mimeType = part.mimetype || mimeType;
            if (!objectPath) {
              objectPath = part.filename;
            }
          } else {
            // Form fields
            if (part.fieldname === "path" || part.fieldname === "objectPath") {
              objectPath = part.value as string;
            } else if (part.fieldname === "cacheControl") {
              cacheControl = part.value as string;
            } else if (part.fieldname === "contentDisposition") {
              contentDisposition = part.value as string;
            }
          }
        }
      } else {
        const body = request.body as any;
        if (!body || !body.data || !body.objectPath) {
          return reply.code(400).send({
            error: "INVALID_REQUEST",
            message: "Missing 'data' (base64 string) or 'objectPath'",
          });
        }
        objectPath = body.objectPath;
        mimeType = body.mimeType || mimeType;
        cacheControl = body.cacheControl;
        contentDisposition = body.contentDisposition;
        fileBuffer = Buffer.from(body.data, "base64");
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.code(400).send({ error: "EMPTY_FILE", message: "File contents cannot be empty." });
      }

      const object = await StorageService.uploadObject({
        userId,
        subscriptionTier,
        bucketIdentifier: bucketId,
        objectPath,
        data: fileBuffer,
        mimeType,
        cacheControl,
        contentDisposition,
        actorEmail: email,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return serializeBigInt({ success: true, object });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Presigned Direct Upload URL creation (Client -> R2)
  fastify.post("/buckets/:bucketId/objects/upload-url", async (request: any, reply: any) => {
    try {
      const { userId, email, subscriptionTier } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const parsed = PresignedUploadUrlSchema.parse(request.body);

      const size = BigInt(parsed.expectedSizeBytes);
      const res = await StorageService.createPresignedUploadUrl({
        userId,
        subscriptionTier,
        bucketIdentifier: bucketId,
        objectPath: parsed.objectPath,
        expectedSizeBytes: size,
        mimeType: parsed.mimeType,
        actorEmail: email,
      });

      return serializeBigInt({ success: true, ...res });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Confirm direct upload after client PUT to R2
  fastify.post("/buckets/:bucketId/objects/confirm-upload", async (request: any, reply: any) => {
    try {
      const { userId, email } = request.user;
      const parsed = ConfirmUploadSchema.parse(request.body);

      const object = await StorageService.confirmDirectUpload({
        userId,
        reservationId: parsed.reservationId,
        mimeType: parsed.mimeType,
        metadata: parsed.metadata,
        actorEmail: email,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      return serializeBigInt({ success: true, object });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // List & paginate objects in a bucket
  fastify.get("/buckets/:bucketId/objects", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const query = request.query as any;

      const result = await StorageService.listObjects({
        userId,
        bucketIdentifier: bucketId,
        prefix: query.prefix,
        search: query.search,
        limit: query.limit ? parseInt(query.limit, 10) : 50,
        offset: query.offset ? parseInt(query.offset, 10) : 0,
        sortBy: query.sortBy || "createdAt",
        sortOrder: query.sortOrder || "desc",
      });

      return serializeBigInt(result);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Presigned Download URL creation
  fastify.post("/buckets/:bucketId/objects/download-url", async (request: any, reply: any) => {
    try {
      const { userId, subscriptionTier } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const body = request.body as any;
      const objectPath = body.objectPath || body.path;

      if (!objectPath) {
        return reply.code(400).send({ error: "MISSING_PATH", message: "objectPath is required in request body" });
      }

      const res = await StorageService.createPresignedDownloadUrl({
        userId,
        subscriptionTier,
        bucketIdentifier: bucketId,
        objectPath,
        expiresInSeconds: body.expiresInSeconds,
        downloadFilename: body.downloadFilename,
      });

      return serializeBigInt({ success: true, ...res });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Direct download / streaming of object with auth verification
  fastify.get("/buckets/:bucketId/objects/download", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const query = request.query as { path: string };

      if (!query.path) {
        return reply.code(400).send({ error: "MISSING_PATH", message: "Query parameter 'path' is required" });
      }

      const { stream, contentType, contentLength, etag, cacheControl, contentDisposition } =
        await StorageService.downloadObjectStream({
          userId,
          bucketIdentifier: bucketId,
          objectPath: query.path,
        });

      reply.header("Content-Type", contentType);
      if (contentLength) reply.header("Content-Length", contentLength);
      if (etag) reply.header("ETag", `"${etag}"`);
      if (cacheControl) reply.header("Cache-Control", cacheControl);
      if (contentDisposition) reply.header("Content-Disposition", contentDisposition);

      return reply.send(stream);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Delete object
  fastify.delete("/buckets/:bucketId/objects", async (request: any, reply: any) => {
    try {
      const { userId, email } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const query = request.query as { path: string };
      const body = (request.body || {}) as { path?: string; objectPath?: string };
      const objectPath = query?.path || body?.path || body?.objectPath;

      if (!objectPath) {
        return reply.code(400).send({ error: "MISSING_PATH", message: "Parameter 'path' is required." });
      }

      const res = await StorageService.deleteObject({
        userId,
        bucketIdentifier: bucketId,
        objectPath,
        actorEmail: email,
      });

      return res;
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Copy object
  fastify.post("/buckets/:bucketId/objects/copy", async (request: any, reply: any) => {
    try {
      const { userId, email, subscriptionTier } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const body = request.body as any;
      const srcPath = body.srcPath || body.objectPath;
      const destBucket = body.destBucket || bucketId;
      const destPath = body.destPath;

      if (!srcPath || !destPath) {
        return reply.code(400).send({ error: "MISSING_FIELDS", message: "srcPath and destPath are required." });
      }

      const obj = await StorageService.copyObject({
        userId,
        subscriptionTier,
        srcBucketIdentifier: bucketId,
        srcObjectPath: srcPath,
        destBucketIdentifier: destBucket,
        destObjectPath: destPath,
        actorEmail: email,
      });

      return serializeBigInt({ success: true, object: obj });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Move object
  fastify.post("/buckets/:bucketId/objects/move", async (request: any, reply: any) => {
    try {
      const { userId, email, subscriptionTier } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const body = request.body as any;
      const srcPath = body.srcPath || body.objectPath;
      const destBucket = body.destBucket || bucketId;
      const destPath = body.destPath;

      if (!srcPath || !destPath) {
        return reply.code(400).send({ error: "MISSING_FIELDS", message: "srcPath and destPath are required." });
      }

      const obj = await StorageService.moveObject({
        userId,
        subscriptionTier,
        srcBucketIdentifier: bucketId,
        srcObjectPath: srcPath,
        destBucketIdentifier: destBucket,
        destObjectPath: destPath,
        actorEmail: email,
      });

      return serializeBigInt({ success: true, object: obj });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // ── Multipart Upload Lifecycle ──────────────────────────────────────────────

  fastify.post("/buckets/:bucketId/multipart/init", async (request: any, reply: any) => {
    try {
      const { userId, subscriptionTier } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const parsed = MultipartInitSchema.parse(request.body);

      const res = await StorageService.initiateMultipartUpload({
        userId,
        subscriptionTier,
        bucketIdentifier: bucketId,
        objectPath: parsed.objectPath,
        expectedSizeBytes: BigInt(parsed.expectedSizeBytes),
        mimeType: parsed.mimeType,
      });

      return serializeBigInt({ success: true, ...res });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.post("/buckets/:bucketId/multipart/part-url", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const parsed = MultipartPartUrlSchema.parse(request.body);

      const res = await StorageService.getMultipartPartUploadUrl({
        userId,
        reservationId: parsed.reservationId,
        partNumber: parsed.partNumber,
        expiresInSeconds: parsed.expiresInSeconds,
      });

      return serializeBigInt({ success: true, ...res });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.post("/buckets/:bucketId/multipart/complete", async (request: any, reply: any) => {
    try {
      const { userId, email } = request.user;
      const parsed = MultipartCompleteSchema.parse(request.body);

      const obj = await StorageService.completeMultipartUpload({
        userId,
        reservationId: parsed.reservationId,
        parts: parsed.parts,
        mimeType: parsed.mimeType,
        actorEmail: email,
      });

      return serializeBigInt({ success: true, object: obj });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.post("/buckets/:bucketId/multipart/abort", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const body = request.body as { reservationId: string };
      if (!body?.reservationId) {
        return reply.code(400).send({ error: "MISSING_RESERVATION", message: "reservationId is required" });
      }

      const res = await StorageService.abortMultipartUpload(userId, body.reservationId);
      return res;
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
