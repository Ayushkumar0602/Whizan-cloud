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
import { redisClient } from "../lib/redis.js";
import { ImageTransformService } from "../services/image-transform.service.js";
import { StorageS3Service } from "../services/storage-s3.service.js";
import { storageEvents } from "../services/storage-events.service.js";
import { StorageCleanupEngine } from "../cron/storage-cleanup.js";

// ── Validation Schemas ────────────────────────────────────────────────────────

const CreateBucketSchema = z.object({
  name: z.string().min(3).max(63),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().default(false),
  maxFileSize: z.union([z.number(), z.string()]).optional(),
  allowedMimeTypes: z.array(z.string()).optional(),
  corsOrigins: z.array(z.string()).optional(),
  corsMaxAge: z.number().int().positive().optional(),
});

const UpdateBucketSchema = z.object({
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
  maxFileSize: z.union([z.number(), z.string()]).optional(),
  allowedMimeTypes: z.array(z.string()).optional(),
  corsOrigins: z.array(z.string()).optional(),
  corsMaxAge: z.number().int().positive().optional(),
});

const CreatePolicySchema = z.object({
  name: z.string().min(1).max(100),
  operation: z.enum(["SELECT", "INSERT", "UPDATE", "DELETE"]),
  definition: z.record(z.any()),
  isEnabled: z.boolean().optional(),
});

const UpdatePolicySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  operation: z.enum(["SELECT", "INSERT", "UPDATE", "DELETE"]).optional(),
  definition: z.record(z.any()).optional(),
  isEnabled: z.boolean().optional(),
});

const CreateWebhookSchema = z.object({
  bucketId: z.string().uuid().nullable().optional(),
  events: z.array(z.enum(["OBJECT_UPLOAD", "OBJECT_DELETE", "BUCKET_CREATE", "BUCKET_DELETE"])).min(1),
  url: z.string().url(),
  secret: z.string().min(8).optional(),
});

const UpdateWebhookSchema = z.object({
  bucketId: z.string().uuid().nullable().optional(),
  events: z.array(z.enum(["OBJECT_UPLOAD", "OBJECT_DELETE", "BUCKET_CREATE", "BUCKET_DELETE"])).optional(),
  url: z.string().url().optional(),
  secret: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
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
  expectedEtag: z.string().optional(),
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
  // GET /public/:bucketName/* or /b/:bucketIdentifier/*
  const handlePublicDownload = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as any;
      const bucketIdentifier = params.bucketName || params.bucketId;
      const rawWildcard = params["*"] as string;

      const { object, stream, contentType, contentLength, etag, cacheControl, contentDisposition } =
        await StorageService.downloadObjectStream({
          bucketIdentifier,
          objectPath: rawWildcard,
        });

      if (!object.isPublic) {
        return reply.code(403).send({ error: "FORBIDDEN", message: "This object is in a private bucket." });
      }

      // Security headers against Stored XSS and MIME confusion attacks
      reply.header("X-Content-Type-Options", "nosniff");
      const reqOrigin = request.headers.origin as string;
      const bucketOrigins = (object as any).bucket?.corsOrigins || ["*"];
      const allowOrigin = bucketOrigins.includes("*")
        ? "*"
        : (reqOrigin && bucketOrigins.includes(reqOrigin))
        ? reqOrigin
        : bucketOrigins[0] || "*";
      reply.header("Access-Control-Allow-Origin", allowOrigin);
      reply.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      reply.header("Access-Control-Max-Age", String((object as any).bucket?.corsMaxAge || 3600));

      // Sandbox active browser execution for HTML, SVG, and XML files in public storage
      const lowerMime = (contentType || "").toLowerCase();
      if (
        lowerMime.includes("html") ||
        lowerMime.includes("svg") ||
        lowerMime.includes("xml") ||
        lowerMime.includes("javascript")
      ) {
        reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
        if (lowerMime.includes("html")) {
          // Force download for raw HTML to prevent phishing / cookie-theft under storage domain
          reply.header(
            "Content-Disposition",
            contentDisposition || `attachment; filename="${object.name.split("/").pop() || "download"}"`
          );
        }
      }

      reply.header("Content-Type", contentType);
      if (contentLength) reply.header("Content-Length", contentLength);
      if (etag) reply.header("ETag", `"${etag}"`);
      reply.header("Cache-Control", cacheControl || "public, max-age=3600, s-maxage=86400");
      if (contentDisposition && !lowerMime.includes("html")) {
        reply.header("Content-Disposition", contentDisposition);
      }

      return reply.send(stream);
    } catch (err) {
      return handleError(err, reply);
    }
  };

  const publicRateLimit = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const ip = request.ip || (request.headers["x-forwarded-for"] as string) || "unknown";
      const key = `storage:rate:public:${ip}`;
      const count = await redisClient.incr(key);
      if (count === 1) {
        await redisClient.expire(key, 60);
      }
      if (count > 200) {
        reply.header("Retry-After", "60");
        return reply.code(429).send({
          error: "TOO_MANY_REQUESTS",
          message: "Rate limit exceeded for public asset downloads. Please retry in a minute.",
        });
      }
    } catch {
      // Allow through if Redis is temporarily unreachable
    }
  };

  fastify.get("/public/:bucketName/*", { preHandler: publicRateLimit }, handlePublicDownload);
  fastify.get("/b/:bucketId/*", { preHandler: publicRateLimit }, handlePublicDownload);
  fastify.head("/public/:bucketName/*", { preHandler: publicRateLimit }, handlePublicDownload);
  fastify.head("/b/:bucketId/*", { preHandler: publicRateLimit }, handlePublicDownload);

  // ── On-the-Fly Image Transform Endpoint ──────────────────────────────────
  fastify.get(
    "/render/image/public/:bucketName/*",
    { preHandler: publicRateLimit },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as any;
        const bucketName = params.bucketName;
        const rawWildcard = params["*"] as string;
        const query = request.query as any;

        const width = query.width ? parseInt(query.width, 10) : undefined;
        const height = query.height ? parseInt(query.height, 10) : undefined;
        const quality = query.quality ? parseInt(query.quality, 10) : undefined;
        const format = query.format as any;
        const resize = query.resize as any;

        const result = await ImageTransformService.transformStorageImage(bucketName, rawWildcard, {
          width,
          height,
          quality,
          format,
          resize,
        });

        reply.header("Content-Type", result.mimeType);
        reply.header("Content-Length", result.buffer.length);
        reply.header("Cache-Control", "public, max-age=86400, s-maxage=604800, immutable");
        reply.header("X-Image-Cached", result.isCached ? "HIT" : "MISS");
        reply.header("Access-Control-Allow-Origin", "*");

        return reply.send(result.buffer);
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // ── Authenticated Route Guard ──────────────────────────────────────────────
  fastify.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for public asset streams and transformed images
    const url = request.url;
    if (
      url.includes("/public/") ||
      url.startsWith("/b/") ||
      url.includes("/storage/v1/b/") ||
      url.includes("/render/image/")
    )
      return;

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
        corsOrigins: parsed.corsOrigins,
        corsMaxAge: parsed.corsMaxAge,
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
        corsOrigins: parsed.corsOrigins,
        corsMaxAge: parsed.corsMaxAge,
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

  // ── Bucket RLS Policy Endpoints ──────────────────────────────────────────

  fastify.get("/buckets/:bucketId/policies", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const policies = await StorageService.listPolicies(bucketId, userId);
      return serializeBigInt(policies);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.post("/buckets/:bucketId/policies", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const parsed = CreatePolicySchema.parse(request.body);

      const policy = await StorageService.createPolicy({
        bucketId,
        userId,
        name: parsed.name,
        operation: parsed.operation,
        definition: parsed.definition,
        isEnabled: parsed.isEnabled,
      });

      return serializeBigInt({ success: true, policy });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.patch("/buckets/:bucketId/policies/:policyId", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { policyId } = request.params as { policyId: string };
      const parsed = UpdatePolicySchema.parse(request.body);

      const policy = await StorageService.updatePolicy(policyId, userId, parsed);
      return serializeBigInt({ success: true, policy });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.delete("/buckets/:bucketId/policies/:policyId", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { policyId } = request.params as { policyId: string };

      await StorageService.deletePolicy(policyId, userId);
      return { success: true, message: "Policy deleted successfully." };
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // ── Storage Webhook Endpoints ─────────────────────────────────────────────

  fastify.get("/webhooks", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const webhooks = await StorageService.listWebhooks(userId);
      return serializeBigInt(webhooks);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.post("/webhooks", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const parsed = CreateWebhookSchema.parse(request.body);

      const webhook = await StorageService.createWebhook({
        userId,
        bucketId: parsed.bucketId,
        events: parsed.events,
        url: parsed.url,
        secret: parsed.secret,
      });

      return serializeBigInt({ success: true, webhook });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.patch("/webhooks/:webhookId", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { webhookId } = request.params as { webhookId: string };
      const parsed = UpdateWebhookSchema.parse(request.body);

      const webhook = await StorageService.updateWebhook(webhookId, userId, parsed);
      return serializeBigInt({ success: true, webhook });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.delete("/webhooks/:webhookId", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { webhookId } = request.params as { webhookId: string };

      await StorageService.deleteWebhook(webhookId, userId);
      return { success: true, message: "Webhook deleted successfully." };
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

      const tierConfig = getStorageTierConfig(subscriptionTier);
      const contentLengthHeader = request.headers["content-length"];
      if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (!isNaN(contentLength) && BigInt(contentLength) > BigInt(tierConfig.maxFileSizeBytes)) {
          return reply.code(413).send({
            error: "FILE_TOO_LARGE",
            message: `Uploaded file size (${contentLength} bytes) exceeds the maximum allowed file size of ${Number(tierConfig.maxFileSizeBytes / 1000000n)} MB for ${tierConfig.displayName}.`,
          });
        }
      }

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
  const handlePresignedUpload = async (request: any, reply: any) => {
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
  };

  fastify.post("/buckets/:bucketId/objects/upload-url", handlePresignedUpload);
  fastify.post("/buckets/:bucketId/objects/presigned-upload", handlePresignedUpload);

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
        expectedEtag: parsed.expectedEtag,
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
        delimiter: query.delimiter,
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

  // Bulk delete objects
  fastify.post("/buckets/:bucketId/objects/bulk-delete", async (request: any, reply: any) => {
    try {
      const { userId, email } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const body = request.body as { paths: string[] };

      if (!body.paths || !Array.isArray(body.paths)) {
        return reply.code(400).send({ error: "INVALID_REQUEST", message: "paths must be an array of strings." });
      }

      const res = await StorageService.bulkDeleteObjects({
        userId,
        bucketIdentifier: bucketId,
        paths: body.paths,
        actorEmail: email,
      });

      return serializeBigInt(res);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Bulk move objects
  fastify.post("/buckets/:bucketId/objects/bulk-move", async (request: any, reply: any) => {
    try {
      const { userId, email, subscriptionTier } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const body = request.body as { paths: string[]; destBucket?: string; destPrefix?: string };

      if (!body.paths || !Array.isArray(body.paths)) {
        return reply.code(400).send({ error: "INVALID_REQUEST", message: "paths must be an array of strings." });
      }

      const res = await StorageService.bulkMoveObjects({
        userId,
        subscriptionTier,
        srcBucketIdentifier: bucketId,
        destBucketIdentifier: body.destBucket || bucketId,
        paths: body.paths,
        destPrefix: body.destPrefix,
        actorEmail: email,
      });

      return serializeBigInt(res);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Update object metadata
  fastify.post("/buckets/:bucketId/objects/metadata", async (request: any, reply: any) => {
    try {
      const { userId, email } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const body = request.body as {
        path: string;
        cacheControl?: string;
        contentDisposition?: string;
        metadata?: Record<string, any>;
      };

      if (!body.path) {
        return reply.code(400).send({ error: "MISSING_PATH", message: "path is required." });
      }

      const res = await StorageService.updateObjectMetadata({
        userId,
        bucketIdentifier: bucketId,
        path: body.path,
        cacheControl: body.cacheControl,
        contentDisposition: body.contentDisposition,
        metadata: body.metadata,
        actorEmail: email,
      });

      return serializeBigInt({ success: true, object: res });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // Get object metadata without download
  fastify.get("/buckets/:bucketId/objects/metadata", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const query = request.query as { path: string };

      if (!query.path) {
        return reply.code(400).send({ error: "MISSING_PATH", message: "query parameter 'path' is required." });
      }

      const res = await StorageService.getObjectMetadata({
        userId,
        bucketIdentifier: bucketId,
        path: query.path,
      });

      return serializeBigInt({ success: true, object: res });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // ── Object Versioning Endpoints ──────────────────────────────────────────

  fastify.get("/buckets/:bucketId/objects/versions", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const query = request.query as { path: string };

      if (!query.path) {
        return reply.code(400).send({ error: "MISSING_PATH", message: "Query parameter 'path' is required." });
      }

      const versions = await StorageService.listObjectVersions(bucketId, query.path, userId);
      return serializeBigInt(versions);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.post("/buckets/:bucketId/objects/versions/restore", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const body = request.body as { path: string; version: number };

      if (!body.path || body.version === undefined) {
        return reply.code(400).send({ error: "MISSING_FIELDS", message: "path and version are required." });
      }

      const restored = await StorageService.restoreObjectVersion(bucketId, body.path, body.version, userId);
      return serializeBigInt({ success: true, object: restored });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // ── Trash / Soft-Delete Endpoints ─────────────────────────────────────────

  fastify.get("/buckets/:bucketId/trash", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const trash = await StorageService.listTrash(bucketId, userId);
      return serializeBigInt(trash);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.post("/buckets/:bucketId/trash/restore", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const body = request.body as { path: string };

      if (!body.path) {
        return reply.code(400).send({ error: "MISSING_PATH", message: "path is required." });
      }

      const restored = await StorageService.restoreFromTrash(bucketId, body.path, userId);
      return serializeBigInt({ success: true, object: restored });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  fastify.delete("/buckets/:bucketId/trash", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { bucketId } = request.params as { bucketId: string };
      const query = request.query as { retentionDays?: string };
      const retentionDays = query.retentionDays ? parseInt(query.retentionDays, 10) : undefined;

      const res = await StorageService.purgeTrash(bucketId, userId, retentionDays);
      return serializeBigInt({ success: true, ...res });
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

  // ── S3-Compatible API Gateway ──────────────────────────────────────────────

  // S3 ListObjectsV2: GET /s3/:bucket
  fastify.get("/s3/:bucket", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { bucket } = request.params;
      const query = request.query as any;

      const res = await StorageS3Service.listObjectsV2({
        userId,
        bucketName: bucket,
        prefix: query.prefix,
        delimiter: query.delimiter,
        maxKeys: query["max-keys"] ? parseInt(query["max-keys"], 10) : undefined,
      });

      reply.type("application/xml");
      return reply.send(res.xml);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // S3 PutObject: PUT /s3/:bucket/*
  fastify.put("/s3/:bucket/*", async (request: any, reply: any) => {
    try {
      const { userId, subscriptionTier } = request.user;
      const { bucket } = request.params;
      const key = request.params["*"];
      const contentType = request.headers["content-type"];

      const tierConfig = getStorageTierConfig(subscriptionTier || "HOBBY");
      const contentLengthHeader = request.headers["content-length"];
      if (contentLengthHeader) {
        const contentLength = parseInt(contentLengthHeader, 10);
        if (!isNaN(contentLength) && BigInt(contentLength) > BigInt(tierConfig.maxFileSizeBytes)) {
          return reply.code(413).send({
            error: "FILE_TOO_LARGE",
            message: `Uploaded file size (${contentLength} bytes) exceeds maximum allowed file size of ${Number(tierConfig.maxFileSizeBytes / 1000000n)} MB for ${tierConfig.displayName}.`,
          });
        }
      }

      let bodyData: Buffer;
      if (Buffer.isBuffer(request.body)) {
        bodyData = request.body;
      } else if (typeof request.body === "string") {
        bodyData = Buffer.from(request.body);
      } else {
        bodyData = Buffer.from(JSON.stringify(request.body || {}));
      }

      const res = await StorageS3Service.putObject({
        userId,
        bucketName: bucket,
        key,
        data: bodyData,
        contentType,
      });

      if (res.etag) {
        reply.header("ETag", `"${res.etag.replace(/"/g, "")}"`);
      }
      return reply.code(200).send();
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // S3 HeadObject: HEAD /s3/:bucket/*
  fastify.head("/s3/:bucket/*", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { bucket } = request.params;
      const key = request.params["*"];

      const res = await StorageS3Service.headObject({
        userId,
        bucketName: bucket,
        key,
      });

      if (res.etag) reply.header("ETag", res.etag);
      if (res.contentType) reply.header("Content-Type", res.contentType);
      if (res.contentLength !== undefined) reply.header("Content-Length", res.contentLength.toString());
      if (res.lastModified) reply.header("Last-Modified", res.lastModified.toUTCString());
      if (res.cacheControl) reply.header("Cache-Control", res.cacheControl);
      if (res.contentDisposition) reply.header("Content-Disposition", res.contentDisposition);

      return reply.code(200).send();
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // S3 GetObject: GET /s3/:bucket/*
  fastify.get("/s3/:bucket/*", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { bucket } = request.params;
      const key = request.params["*"];

      const res = await StorageS3Service.getObject({
        userId,
        bucketName: bucket,
        key,
      });

      if (res.etag) reply.header("ETag", res.etag);
      if (res.contentType) reply.header("Content-Type", res.contentType);
      if (res.contentLength !== undefined) reply.header("Content-Length", res.contentLength.toString());
      if (res.cacheControl) reply.header("Cache-Control", res.cacheControl);
      if (res.contentDisposition) reply.header("Content-Disposition", res.contentDisposition);

      return reply.send(res.stream);
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // S3 DeleteObject: DELETE /s3/:bucket/*
  fastify.delete("/s3/:bucket/*", async (request: any, reply: any) => {
    try {
      const { userId } = request.user;
      const { bucket } = request.params;
      const key = request.params["*"];

      await StorageS3Service.deleteObject({
        userId,
        bucketName: bucket,
        key,
      });

      return reply.code(204).send();
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // ── Real-Time Storage Events WebSocket ──────────────────────────────────────
  fastify.get("/events", { websocket: true }, (connection: any, request: any) => {
    const userId = request.user?.userId || request.query?.userId;
    if (!userId) {
      connection.socket.close(1008, "Unauthorized");
      return;
    }

    const unsubscribe = storageEvents.onUserEvent(userId, (event) => {
      try {
        connection.socket.send(JSON.stringify(event));
      } catch {}
    });

    connection.socket.on("close", () => {
      unsubscribe();
    });
  });

  // ── Storage Background Cleanup Trigger ──────────────────────────────────────
  fastify.post("/admin/cleanup", async (request: any, reply: any) => {
    try {
      const [reservations, trash, quotas] = await Promise.all([
        StorageCleanupEngine.expireStaleReservations(),
        StorageCleanupEngine.purgeExpiredTrash(),
        StorageCleanupEngine.reconcileAllUserQuotas(),
      ]);

      return {
        success: true,
        expiredReservations: reservations.expiredCount,
        purgedTrashObjects: trash.purgedCount,
        reconciledQuotas: quotas.reconciledCount,
      };
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
