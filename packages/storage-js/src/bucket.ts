// ─── Whizan Cloud Storage — StorageBucketApi (Supabase Parity) ───────────────

import type {
  StorageResponse,
  UploadOptions,
  ListOptions,
  TransformOptions,
  StorageObject,
} from "./types.js";

export class StorageBucketApi {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly bucketIdOrName: string
  ) {}

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "x-api-key": this.apiKey,
    };
  }

  /**
   * Upload a file (Blob, Buffer, or Uint8Array) to Whizan Cloud Storage.
   */
  async upload(
    path: string,
    file: Blob | Buffer | Uint8Array | ArrayBuffer | string,
    options?: UploadOptions
  ): Promise<StorageResponse<{ path: string; id: string; size: number }>> {
    try {
      const cleanPath = path.replace(/^\/+/, "");
      let body: any = file;
      let byteLength = 0;

      if (typeof file === "string") {
        body = new TextEncoder().encode(file);
        byteLength = body.byteLength;
      } else if (file instanceof ArrayBuffer) {
        body = new Uint8Array(file);
        byteLength = body.byteLength;
      } else if (Buffer.isBuffer(file) || file instanceof Uint8Array) {
        byteLength = file.byteLength;
      } else if (typeof Blob !== "undefined" && file instanceof Blob) {
        byteLength = file.size;
      }

      // Step 1: Request presigned upload URL
      const presignUrl = `${this.baseUrl}/api/storage/v1/buckets/${encodeURIComponent(
        this.bucketIdOrName
      )}/objects/presigned-upload`;

      const presignRes = await fetch(presignUrl, {
        method: "POST",
        headers: {
          ...this.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          objectPath: cleanPath,
          expectedSizeBytes: byteLength,
          mimeType: options?.contentType || "application/octet-stream",
        }),
      });

      if (!presignRes.ok) {
        const errJson = await presignRes.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to initiate upload: HTTP ${presignRes.status}`);
      }

      const { uploadUrl, reservationId } = await presignRes.json();

      // Step 2: Upload payload directly to storage endpoint
      const uploadHeaders: Record<string, string> = {
        "Content-Type": options?.contentType || "application/octet-stream",
      };
      if (options?.cacheControl) {
        uploadHeaders["Cache-Control"] = options.cacheControl;
      }

      const directRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: uploadHeaders,
        body,
      });

      if (!directRes.ok) {
        throw new Error(`Direct storage upload failed with HTTP ${directRes.status}`);
      }

      const etag = directRes.headers.get("etag")?.replace(/"/g, "") || undefined;

      // Step 3: Confirm upload and commit quota
      const confirmUrl = `${this.baseUrl}/api/storage/v1/buckets/${encodeURIComponent(
        this.bucketIdOrName
      )}/objects/confirm-upload`;

      const confirmRes = await fetch(confirmUrl, {
        method: "POST",
        headers: {
          ...this.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reservationId,
          mimeType: options?.contentType,
          metadata: options?.metadata,
        }),
      });

      if (!confirmRes.ok) {
        const errJson = await confirmRes.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to commit upload: HTTP ${confirmRes.status}`);
      }

      const confirmData = await confirmRes.json();
      return {
        data: {
          path: cleanPath,
          id: confirmData.object?.id || reservationId,
          size: confirmData.object?.size || byteLength,
        },
        error: null,
      };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Download a file as a Blob.
   */
  async download(path: string): Promise<StorageResponse<Blob>> {
    try {
      const cleanPath = path.replace(/^\/+/, "");
      const url = `${this.baseUrl}/api/storage/v1/buckets/${encodeURIComponent(
        this.bucketIdOrName
      )}/objects/download?path=${encodeURIComponent(cleanPath)}`;

      const res = await fetch(url, {
        headers: this.headers,
      });

      if (!res.ok) {
        throw new Error(`Download failed: HTTP ${res.status}`);
      }

      const blob = await res.blob();
      return { data: blob, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Delete one or more objects from the bucket.
   */
  async remove(paths: string[]): Promise<StorageResponse<{ deletedCount: number }>> {
    try {
      const url = `${this.baseUrl}/api/storage/v1/buckets/${encodeURIComponent(
        this.bucketIdOrName
      )}/objects/bulk-delete`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...this.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paths }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to delete objects: HTTP ${res.status}`);
      }

      const json = await res.json();
      return { data: json, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * List objects within the bucket.
   */
  async list(path = "", options?: ListOptions): Promise<StorageResponse<StorageObject[]>> {
    try {
      const params = new URLSearchParams();
      if (path) params.set("prefix", path);
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.offset) params.set("offset", String(options.offset));
      if (options?.sortBy) params.set("sortBy", options.sortBy);
      if (options?.sortOrder) params.set("sortOrder", options.sortOrder);
      if (options?.search) params.set("search", options.search);
      if (options?.delimiter) params.set("delimiter", options.delimiter);

      const url = `${this.baseUrl}/api/storage/v1/buckets/${encodeURIComponent(
        this.bucketIdOrName
      )}/objects?${params.toString()}`;

      const res = await fetch(url, {
        headers: this.headers,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to list objects: HTTP ${res.status}`);
      }

      const json = await res.json();
      return { data: json.objects || [], error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Move an object from one path to another.
   */
  async move(
    fromPath: string,
    toPath: string,
    destBucket?: string
  ): Promise<StorageResponse<{ message: string }>> {
    try {
      const url = `${this.baseUrl}/api/storage/v1/buckets/${encodeURIComponent(
        this.bucketIdOrName
      )}/objects/move`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...this.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          srcPath: fromPath,
          destPath: toPath,
          destBucket: destBucket || this.bucketIdOrName,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to move object: HTTP ${res.status}`);
      }

      return { data: { message: "Successfully moved" }, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Copy an object from one path to another.
   */
  async copy(
    fromPath: string,
    toPath: string,
    destBucket?: string
  ): Promise<StorageResponse<{ message: string }>> {
    try {
      const url = `${this.baseUrl}/api/storage/v1/buckets/${encodeURIComponent(
        this.bucketIdOrName
      )}/objects/copy`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...this.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          srcPath: fromPath,
          destPath: toPath,
          destBucket: destBucket || this.bucketIdOrName,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to copy object: HTTP ${res.status}`);
      }

      return { data: { message: "Successfully copied" }, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Create a signed URL for temporary downloading of private assets.
   */
  async createSignedUrl(
    path: string,
    expiresIn = 3600
  ): Promise<StorageResponse<{ signedUrl: string }>> {
    try {
      const cleanPath = path.replace(/^\/+/, "");
      const url = `${this.baseUrl}/api/storage/v1/buckets/${encodeURIComponent(
        this.bucketIdOrName
      )}/objects/presigned-download?path=${encodeURIComponent(cleanPath)}&expiresIn=${expiresIn}`;

      const res = await fetch(url, {
        headers: this.headers,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to create signed URL: HTTP ${res.status}`);
      }

      const json = await res.json();
      return { data: { signedUrl: json.downloadUrl }, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Get the publicly accessible URL of an asset with optional on-the-fly image transformations.
   */
  getPublicUrl(
    path: string,
    transform?: TransformOptions
  ): { data: { publicUrl: string } } {
    const cleanPath = path.replace(/^\/+/, "");
    if (transform && Object.keys(transform).length > 0) {
      const params = new URLSearchParams();
      if (transform.width) params.set("width", String(transform.width));
      if (transform.height) params.set("height", String(transform.height));
      if (transform.format) params.set("format", transform.format);
      if (transform.quality) params.set("quality", String(transform.quality));
      if (transform.resize) params.set("resize", transform.resize);

      return {
        data: {
          publicUrl: `${this.baseUrl}/api/storage/v1/render/image/public/${encodeURIComponent(
            this.bucketIdOrName
          )}/${cleanPath}?${params.toString()}`,
        },
      };
    }

    return {
      data: {
        publicUrl: `${this.baseUrl}/api/storage/v1/public/${encodeURIComponent(
          this.bucketIdOrName
        )}/${cleanPath}`,
      },
    };
  }
}
