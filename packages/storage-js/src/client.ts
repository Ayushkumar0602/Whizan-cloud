// ─── Whizan Cloud Storage — WhizanStorageClient ───────────────────────────────

import { StorageBucketApi } from "./bucket.js";
import type { StorageBucket, StorageResponse } from "./types.js";

export class WhizanStorageClient {
  private readonly baseUrl: string;

  constructor(
    url: string,
    private readonly apiKey: string
  ) {
    this.baseUrl = url.replace(/\/+$/, "");
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "x-api-key": this.apiKey,
    };
  }

  /**
   * Scopes operations to a specific bucket, identical to Supabase Storage client.
   */
  from(bucketIdOrName: string): StorageBucketApi {
    return new StorageBucketApi(this.baseUrl, this.apiKey, bucketIdOrName);
  }

  /**
   * List all buckets belonging to the authenticated account.
   */
  async listBuckets(): Promise<StorageResponse<StorageBucket[]>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/storage/v1/buckets`, {
        headers: this.headers,
      });

      if (!res.ok) {
        throw new Error(`Failed to list buckets: HTTP ${res.status}`);
      }

      const data = await res.json();
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Get details for a specific bucket.
   */
  async getBucket(id: string): Promise<StorageResponse<StorageBucket>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/storage/v1/buckets/${encodeURIComponent(id)}`, {
        headers: this.headers,
      });

      if (!res.ok) {
        throw new Error(`Failed to get bucket: HTTP ${res.status}`);
      }

      const data = await res.json();
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Create a new bucket.
   */
  async createBucket(
    id: string,
    options?: {
      public?: boolean;
      fileSizeLimit?: number;
      allowedMimeTypes?: string[];
    }
  ): Promise<StorageResponse<{ name: string }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/storage/v1/buckets`, {
        method: "POST",
        headers: {
          ...this.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: id,
          isPublic: options?.public ?? false,
          maxFileSize: options?.fileSizeLimit,
          allowedMimeTypes: options?.allowedMimeTypes,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to create bucket: HTTP ${res.status}`);
      }

      const json = await res.json();
      return { data: { name: json.bucket?.name || id }, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Delete a bucket.
   */
  async deleteBucket(id: string, force = false): Promise<StorageResponse<{ message: string }>> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/storage/v1/buckets/${encodeURIComponent(id)}?force=${force}`,
        {
          method: "DELETE",
          headers: this.headers,
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to delete bucket: HTTP ${res.status}`);
      }

      const json = await res.json();
      return { data: json, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Get quota and usage statistics.
   */
  async getUsage(): Promise<StorageResponse<any>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/storage/v1/usage`, {
        headers: this.headers,
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch storage usage: HTTP ${res.status}`);
      }

      const data = await res.json();
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: err };
    }
  }

  /**
   * Returns S3 endpoint and credentials configuration for AWS SDK / S3 clients.
   */
  getS3Config() {
    return {
      endpoint: `${this.baseUrl}/storage/v1/s3`,
      region: "auto",
      credentials: {
        accessKeyId: this.apiKey,
        secretAccessKey: this.apiKey,
      },
    };
  }
}
