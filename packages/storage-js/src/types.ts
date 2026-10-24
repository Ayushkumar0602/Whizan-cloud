// ─── Whizan Cloud Storage — SDK Type Definitions ───────────────────────────

export interface StorageResponse<T> {
  data: T | null;
  error: Error | null;
}

export interface UploadOptions {
  cacheControl?: string;
  contentType?: string;
  upsert?: boolean;
  metadata?: Record<string, any>;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  sortBy?: "name" | "createdAt" | "size";
  sortOrder?: "asc" | "desc";
  search?: string;
  delimiter?: string;
}

export interface TransformOptions {
  width?: number;
  height?: number;
  format?: "webp" | "avif" | "png" | "jpeg";
  quality?: number;
  resize?: "cover" | "contain" | "fill" | "inside" | "outside";
}

export interface StorageObject {
  id: string;
  bucketId: string;
  name: string;
  size: number;
  mimeType: string;
  etag?: string | null;
  cacheControl?: string | null;
  contentDisposition?: string | null;
  metadata?: Record<string, any>;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StorageBucket {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  isPublic: boolean;
  maxFileSize?: number | null;
  allowedMimeTypes: string[];
  corsOrigins?: string[];
  corsMaxAge?: number;
  versioningEnabled: boolean;
  trashEnabled: boolean;
  trashRetentionDays: number;
  fileCount: number;
  totalBytes: number;
  createdAt: string;
  updatedAt: string;
}
