// ─── Whizan Cloud Storage — Cloudflare R2 Client Provider ─────────────────────

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";

let cachedClient: S3Client | null = null;

export function getR2Client(): S3Client {
  if (cachedClient) return cachedClient;

  const endpoint =
    process.env.R2_ENDPOINT ||
    (process.env.R2_ACCOUNT_ID
      ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : undefined);

  if (!endpoint) {
    throw new Error(
      "Cloudflare R2 configuration missing: R2_ENDPOINT or R2_ACCOUNT_ID is required."
    );
  }

  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Cloudflare R2 credentials missing: R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required."
    );
  }

  cachedClient = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    // R2 requires path style addressing disabled or standard virtual host depending on endpoint
    forcePathStyle: true,
  });

  return cachedClient;
}

export function getR2BucketName(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) {
    return "whizan-cloud-storage";
  }
  return bucket;
}

/**
 * Direct server-side upload of a file buffer to Cloudflare R2.
 */
export async function uploadObjectDirect(params: {
  r2Key: string;
  body: Buffer | Uint8Array;
  contentType?: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
  contentDisposition?: string;
}): Promise<{ etag?: string; size: number }> {
  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.r2Key,
    Body: params.body,
    ContentType: params.contentType || "application/octet-stream",
    Metadata: params.metadata,
    CacheControl: params.cacheControl,
    ContentDisposition: params.contentDisposition,
  });

  const response = await client.send(command);
  return {
    etag: response.ETag?.replace(/"/g, ""),
    size: params.body.length,
  };
}

/**
 * Direct server-side download stream from Cloudflare R2.
 */
export async function downloadObjectStream(r2Key: string): Promise<{
  stream: Readable;
  contentType: string;
  contentLength?: number;
  etag?: string;
  cacheControl?: string;
  contentDisposition?: string;
}> {
  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: r2Key,
  });

  const response = await client.send(command);
  if (!response.Body) {
    throw new Error("Object body empty from R2 provider");
  }

  return {
    stream: response.Body as Readable,
    contentType: response.ContentType || "application/octet-stream",
    contentLength: response.ContentLength,
    etag: response.ETag?.replace(/"/g, ""),
    cacheControl: response.CacheControl,
    contentDisposition: response.ContentDisposition,
  };
}

/**
 * Head an object to inspect metadata and size in R2.
 */
export async function headObjectR2(r2Key: string): Promise<{
  size: number;
  etag?: string;
  contentType?: string;
  lastModified?: Date;
} | null> {
  const client = getR2Client();
  const bucket = getR2BucketName();

  try {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: r2Key,
    });
    const response = await client.send(command);
    return {
      size: response.ContentLength ?? 0,
      etag: response.ETag?.replace(/"/g, ""),
      contentType: response.ContentType,
      lastModified: response.LastModified,
    };
  } catch (err: any) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Delete a single object from Cloudflare R2.
 */
export async function deleteObjectR2(r2Key: string): Promise<void> {
  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: r2Key,
  });

  await client.send(command);
}

/**
 * Delete multiple objects from Cloudflare R2 in batch.
 */
export async function deleteObjectsR2(r2Keys: string[]): Promise<void> {
  if (r2Keys.length === 0) return;
  const client = getR2Client();
  const bucket = getR2BucketName();

  // R2 batch delete supports up to 1000 keys per call
  for (let i = 0; i < r2Keys.length; i += 1000) {
    const chunk = r2Keys.slice(i, i + 1000);
    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: chunk.map((Key) => ({ Key })),
        Quiet: true,
      },
    });
    await client.send(command);
  }
}

/**
 * Copy an object within R2.
 */
export async function copyObjectR2(srcR2Key: string, destR2Key: string): Promise<{ etag?: string }> {
  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new CopyObjectCommand({
    Bucket: bucket,
    CopySource: `${bucket}/${encodeURIComponent(srcR2Key)}`,
    Key: destR2Key,
  });

  const response = await client.send(command);
  return {
    etag: response.CopyObjectResult?.ETag?.replace(/"/g, ""),
  };
}

/**
 * Generate a short-lived presigned URL for direct client upload (PUT).
 */
export async function generatePresignedUploadUrl(params: {
  r2Key: string;
  contentType?: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.r2Key,
    ContentType: params.contentType || "application/octet-stream",
  });

  return getSignedUrl(client, command, {
    expiresIn: params.expiresInSeconds || 900,
  });
}

/**
 * Generate a short-lived presigned URL for direct client download (GET).
 */
export async function generatePresignedDownloadUrl(params: {
  r2Key: string;
  expiresInSeconds?: number;
  contentDisposition?: string;
}): Promise<string> {
  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: params.r2Key,
    ResponseContentDisposition: params.contentDisposition,
  });

  return getSignedUrl(client, command, {
    expiresIn: params.expiresInSeconds || 900,
  });
}

/**
 * Initiate a multipart upload in Cloudflare R2.
 */
export async function initiateMultipartUploadR2(params: {
  r2Key: string;
  contentType?: string;
}): Promise<string> {
  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: params.r2Key,
    ContentType: params.contentType || "application/octet-stream",
  });

  const response = await client.send(command);
  if (!response.UploadId) {
    throw new Error("Cloudflare R2 failed to return an UploadId for multipart upload");
  }
  return response.UploadId;
}

/**
 * Generate a presigned URL to upload a specific part of a multipart upload.
 */
export async function generatePresignedPartUploadUrl(params: {
  r2Key: string;
  uploadId: string;
  partNumber: number;
  expiresInSeconds?: number;
}): Promise<string> {
  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new UploadPartCommand({
    Bucket: bucket,
    Key: params.r2Key,
    UploadId: params.uploadId,
    PartNumber: params.partNumber,
  });

  return getSignedUrl(client, command, {
    expiresIn: params.expiresInSeconds || 900,
  });
}

/**
 * Complete a multipart upload in Cloudflare R2.
 */
export async function completeMultipartUploadR2(params: {
  r2Key: string;
  uploadId: string;
  parts: Array<{ PartNumber: number; ETag: string }>;
}): Promise<{ etag?: string }> {
  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new CompleteMultipartUploadCommand({
    Bucket: bucket,
    Key: params.r2Key,
    UploadId: params.uploadId,
    MultipartUpload: {
      Parts: params.parts.sort((a, b) => a.PartNumber - b.PartNumber),
    },
  });

  const response = await client.send(command);
  return {
    etag: response.ETag?.replace(/"/g, ""),
  };
}

/**
 * Abort a multipart upload in Cloudflare R2.
 */
export async function abortMultipartUploadR2(params: {
  r2Key: string;
  uploadId: string;
}): Promise<void> {
  const client = getR2Client();
  const bucket = getR2BucketName();

  const command = new AbortMultipartUploadCommand({
    Bucket: bucket,
    Key: params.r2Key,
    UploadId: params.uploadId,
  });

  await client.send(command);
}
