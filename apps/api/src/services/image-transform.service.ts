// ─── Whizan Cloud Storage — Image Transformation Service (Sharp/libvips) ─────

import crypto from "crypto";
import sharp from "sharp";
import { redisClient } from "../lib/redis.js";
import { downloadObjectStream as r2DownloadStream } from "../lib/r2-client.js";
import { StorageService, StorageError, NotFoundError } from "./storage.service.js";
import { Readable } from "stream";

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  format?: "webp" | "avif" | "png" | "jpeg";
  quality?: number;
  resize?: "cover" | "contain" | "fill" | "inside" | "outside";
}

export class ImageTransformService {
  private static MAX_DIMENSION = 4000; // Protection against decompression bombs
  private static MAX_CACHE_BYTES = 5_000_000; // 5 MB max per cached transformed variant

  /**
   * Generates a deterministic Redis cache key based on sorted transform options.
   */
  static getCacheKey(bucketName: string, objectPath: string, options: ImageTransformOptions): string {
    const sortedKeys = Object.keys(options).sort() as (keyof ImageTransformOptions)[];
    const normalized: Record<string, any> = {};
    for (const key of sortedKeys) {
      if (options[key] !== undefined) {
        normalized[key] = options[key];
      }
    }
    const hash = crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 16);
    return `storage:img:${bucketName.toLowerCase()}:${objectPath}:${hash}`;
  }

  /**
   * Transforms an in-memory image buffer with dimension safety checks.
   */
  static async transformBuffer(
    inputBuffer: Buffer,
    options: ImageTransformOptions
  ): Promise<{ buffer: Buffer; mimeType: string; format: string }> {
    // Dimension validation
    if (options.width !== undefined) {
      if (options.width <= 0) {
        throw new StorageError("Invalid dimension: width must be greater than 0", 400, "INVALID_DIMENSION");
      }
      if (options.width > this.MAX_DIMENSION) {
        throw new StorageError(
          `Dimension exceeds maximum allowed limit (${this.MAX_DIMENSION}px)`,
          400,
          "DIMENSION_EXCEEDED"
        );
      }
    }

    if (options.height !== undefined) {
      if (options.height <= 0) {
        throw new StorageError("Invalid dimension: height must be greater than 0", 400, "INVALID_DIMENSION");
      }
      if (options.height > this.MAX_DIMENSION) {
        throw new StorageError(
          `Dimension exceeds maximum allowed limit (${this.MAX_DIMENSION}px)`,
          400,
          "DIMENSION_EXCEEDED"
        );
      }
    }

    let pipeline = sharp(inputBuffer);

    // Apply Resize
    if (options.width || options.height) {
      pipeline = pipeline.resize({
        width: options.width,
        height: options.height,
        fit: options.resize || "cover",
        withoutEnlargement: false,
      });
    }

    // Apply Format & Quality
    const targetFormat = options.format || "webp";
    const quality = options.quality ? Math.max(1, Math.min(100, options.quality)) : 80;

    switch (targetFormat) {
      case "webp":
        pipeline = pipeline.webp({ quality });
        break;
      case "avif":
        pipeline = pipeline.avif({ quality });
        break;
      case "png":
        pipeline = pipeline.png({ quality: Math.min(100, quality) });
        break;
      case "jpeg":
        pipeline = pipeline.jpeg({ quality });
        break;
    }

    const outputBuffer = await pipeline.toBuffer();
    const mimeType = `image/${targetFormat}`;

    return {
      buffer: outputBuffer,
      mimeType,
      format: targetFormat,
    };
  }

  /**
   * Fetches an image from storage, applies on-the-fly transformations, and caches the result.
   */
  static async transformStorageImage(
    bucketIdentifier: string,
    objectPath: string,
    options: ImageTransformOptions
  ): Promise<{ buffer: Buffer; mimeType: string; format: string; isCached: boolean }> {
    const cacheKey = this.getCacheKey(bucketIdentifier, objectPath, options);

    // 1. Check Redis Cache
    try {
      const cached = await redisClient.getBuffer(cacheKey);
      if (cached) {
        const targetFormat = options.format || "webp";
        return {
          buffer: cached,
          mimeType: `image/${targetFormat}`,
          format: targetFormat,
          isCached: true,
        };
      }
    } catch {
      // Ignore Redis cache miss or error
    }

    // 2. Fetch original image from Storage
    const { object, stream } = await StorageService.downloadObjectStream({
      bucketIdentifier,
      objectPath,
    });

    if (!object.isPublic) {
      throw new StorageError("Access denied: transformed image is from a private bucket", 403, "FORBIDDEN");
    }

    // Read stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const sourceBuffer = Buffer.concat(chunks);

    // 3. Transform image
    const transformed = await this.transformBuffer(sourceBuffer, options);

    // 4. Cache in Redis for 24 hours if within size limit
    if (transformed.buffer.length <= this.MAX_CACHE_BYTES) {
      try {
        await redisClient.setex(cacheKey, 86400, transformed.buffer);
      } catch {
        // Cache error non-fatal
      }
    }

    return {
      ...transformed,
      isCached: false,
    };
  }
}
