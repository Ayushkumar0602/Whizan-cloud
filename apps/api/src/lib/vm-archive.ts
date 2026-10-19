import { redisClient } from "./redis.js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "whizan-deployments";

const BASE_DOMAIN = process.env.BASE_DOMAIN || "20.2.136.11";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || process.env.JWT_SECRET || "whizan_internal_secret";

export interface VmArchiveUploadResult {
  ok: boolean;
  archiveUrl?: string;
  path?: string;
  bytesWritten?: number;
  error?: string;
  stagedInRedis?: boolean;
}

/**
 * Stores deployment archives in Supabase S3 Object Storage with automatic fallback
 * to the direct VM SSD bridge and Redis.
 *
 * This completely eliminates the 30MB Redis Cloud memory limit, avoids base64 inflation,
 * and allows rapid CDN-accelerated downloads on compute worker nodes.
 */
export async function uploadArchiveToVm(params: {
  targetType: "project" | "service";
  targetId: string;
  deploymentId: string;
  buffer: Buffer;
}): Promise<VmArchiveUploadResult> {
  const { targetType, targetId, deploymentId, buffer } = params;

  // ── Strategy 1: Supabase S3 Object Storage (Industry standard, 0 Redis footprint) ──
  if (SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const storagePath = `${targetType}s/${targetId}/${deploymentId}.tar.gz`;
      const uploadUrl = `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}/${storagePath}`;

      console.log(`[storage-archive] Uploading ${targetType} archive (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) to Supabase Storage: ${storagePath}...`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/gzip",
          "x-upsert": "true",
        },
        body: buffer,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (res.ok) {
        // Also update latest source.tar.gz asynchronously
        const latestPath = `${targetType}s/${targetId}/source.tar.gz`;
        const latestUrl = `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}/${latestPath}`;
        fetch(latestUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/gzip",
            "x-upsert": "true",
          },
          body: buffer,
        }).catch(() => {});

        const publicArchiveUrl = `${SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${storagePath}`;
        console.log(`[storage-archive] ✓ Successfully stored archive in Supabase Storage: ${publicArchiveUrl}`);

        return {
          ok: true,
          archiveUrl: publicArchiveUrl,
          bytesWritten: buffer.length,
          stagedInRedis: false,
        };
      } else {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        console.warn(`[storage-archive] Supabase Storage returned ${res.status}: ${errText}`);
      }
    } catch (err: any) {
      console.warn(`[storage-archive] Supabase Storage upload error: ${err.message}`);
    }
  }

  // ── Strategy 2: Direct VM HTTP Storage Bridge (Bypasses Redis) ──
  const edgeRouterUrl = `http://20.2.136.11/_internal/upload?targetType=${targetType}&targetId=${targetId}&deploymentId=${deploymentId}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(edgeRouterUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/gzip",
        "x-whizan-internal": INTERNAL_SECRET,
        "x-target-type": targetType,
        "x-target-id": targetId,
        "x-deployment-id": deploymentId,
      },
      body: buffer,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (res.ok) {
      const data: any = await res.json().catch(() => ({ ok: true }));
      console.log(`[storage-archive] ✓ Stored archive via VM HTTP bridge: ${data.path}`);
      return { ok: true, path: data.path, bytesWritten: buffer.length, stagedInRedis: false };
    }
  } catch (err: any) {
    console.warn(`[storage-archive] Direct VM HTTP bridge failed: ${err.message}`);
  }

  // ── Strategy 3: Safe Redis Fallback for small archives (<= 5MB) ──
  if (buffer.length <= 5 * 1024 * 1024) {
    try {
      await redisClient.set(`upload:${deploymentId}`, buffer, "EX", 900);
      return { ok: true, bytesWritten: buffer.length, stagedInRedis: true };
    } catch (redisErr: any) {
      return { ok: false, error: redisErr.message };
    }
  }

  return {
    ok: false,
    error: `Storage upload failed and archive payload (${(buffer.length / (1024 * 1024)).toFixed(1)} MB) exceeds the 5MB safety limit for in-memory Redis staging.`,
  };
}
