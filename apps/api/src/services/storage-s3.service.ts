import { StorageService } from "./storage.service.js";

export interface S3ListObjectsParams {
  bucketName: string;
  prefix?: string;
  delimiter?: string;
  maxKeys?: number;
  isTruncated?: boolean;
  objects: Array<{
    name: string;
    size: bigint | number;
    etag?: string | null;
    updatedAt?: Date;
  }>;
  commonPrefixes?: string[];
}

export function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export class StorageS3Service {
  /**
   * Generates AWS S3-compliant XML for ListBucketResult / ListObjectsV2
   */
  static buildListBucketResultXml(params: S3ListObjectsParams): string {
    const {
      bucketName,
      prefix = "",
      delimiter = "",
      maxKeys = 1000,
      isTruncated = false,
      objects,
      commonPrefixes = [],
    } = params;

    const contentsXml = objects
      .map((o) => {
        const cleanEtag = (o.etag || "").replace(/"/g, "");
        return `<Contents><Key>${escapeXml(o.name)}</Key><LastModified>${(o.updatedAt || new Date()).toISOString()}</LastModified><ETag>"${escapeXml(cleanEtag)}"</ETag><Size>${o.size.toString()}</Size><StorageClass>STANDARD</StorageClass></Contents>`;
      })
      .join("");

    const commonPrefixesXml = commonPrefixes
      .map((p) => `<CommonPrefixes><Prefix>${escapeXml(p)}</Prefix></CommonPrefixes>`)
      .join("");

    return `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${escapeXml(bucketName)}</Name><Prefix>${escapeXml(prefix)}</Prefix><KeyCount>${objects.length}</KeyCount><MaxKeys>${maxKeys}</MaxKeys><Delimiter>${escapeXml(delimiter)}</Delimiter><IsTruncated>${isTruncated ? "true" : "false"}</IsTruncated>${contentsXml}${commonPrefixesXml}</ListBucketResult>`;
  }

  /**
   * S3 PutObject (PUT /{bucket}/{key})
   */
  static async putObject(params: {
    userId: string;
    bucketName: string;
    key: string;
    data: Buffer;
    contentType?: string;
  }) {
    const { userId, bucketName, key, data, contentType } = params;
    const uploaded = await StorageService.uploadObject({
      userId,
      bucketIdentifier: bucketName,
      objectPath: key,
      data,
      mimeType: contentType || "application/octet-stream",
    });

    return {
      etag: uploaded.etag,
      size: Number(uploaded.size),
      objectName: uploaded.name,
    };
  }

  /**
   * S3 HeadObject (HEAD /{bucket}/{key})
   */
  static async headObject(params: {
    userId: string;
    bucketName: string;
    key: string;
  }) {
    const { userId, bucketName, key } = params;
    const meta = await StorageService.getObjectMetadata({
      userId,
      bucketIdentifier: bucketName,
      path: key,
    });

    return {
      contentLength: Number(meta.size),
      contentType: meta.mimeType || "application/octet-stream",
      etag: meta.etag ? `"${meta.etag.replace(/"/g, "")}"` : undefined,
      lastModified: meta.updatedAt,
      metadata: meta.metadata,
      cacheControl: meta.cacheControl,
      contentDisposition: meta.contentDisposition,
    };
  }

  /**
   * S3 GetObject (GET /{bucket}/{key})
   */
  static async getObject(params: {
    userId: string;
    bucketName: string;
    key: string;
  }) {
    const { userId, bucketName, key } = params;
    const downloaded = await StorageService.downloadObjectStream({
      userId,
      bucketIdentifier: bucketName,
      objectPath: key,
    });

    return {
      stream: downloaded.stream,
      contentLength: Number(downloaded.object.size),
      contentType: downloaded.object.mimeType,
      etag: downloaded.object.etag ? `"${downloaded.object.etag.replace(/"/g, "")}"` : undefined,
      cacheControl: downloaded.object.cacheControl,
      contentDisposition: downloaded.object.contentDisposition,
    };
  }

  /**
   * S3 DeleteObject (DELETE /{bucket}/{key})
   */
  static async deleteObject(params: {
    userId: string;
    bucketName: string;
    key: string;
  }) {
    const { userId, bucketName, key } = params;
    return StorageService.deleteObject({
      userId,
      bucketIdentifier: bucketName,
      objectPath: key,
      permanent: true,
    });
  }

  /**
   * S3 ListObjectsV2 (GET /{bucket}?list-type=2)
   */
  static async listObjectsV2(params: {
    userId: string;
    bucketName: string;
    prefix?: string;
    delimiter?: string;
    maxKeys?: number;
  }) {
    const { userId, bucketName, prefix = "", delimiter, maxKeys = 1000 } = params;
    const listRes = await StorageService.listObjects({
      userId,
      bucketIdentifier: bucketName,
      prefix,
      delimiter,
      limit: maxKeys,
    });

    const xml = this.buildListBucketResultXml({
      bucketName,
      prefix,
      delimiter,
      maxKeys,
      isTruncated: false,
      objects: listRes.objects,
      commonPrefixes: listRes.commonPrefixes,
    });

    return {
      xml,
      objects: listRes.objects,
      commonPrefixes: listRes.commonPrefixes,
    };
  }
}
