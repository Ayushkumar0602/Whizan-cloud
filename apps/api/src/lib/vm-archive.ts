import { redisClient } from "./redis.js";

const BASE_DOMAIN = process.env.BASE_DOMAIN || "20.2.136.11.nip.io";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || process.env.JWT_SECRET || "whizan_internal_secret";

export interface VmArchiveUploadResult {
  ok: boolean;
  path?: string;
  bytesWritten?: number;
  error?: string;
  stagedInRedis?: boolean;
}

/**
 * Streams or uploads source code archives directly to the Azure VM persistent SSD storage
 * via the Edge Router /_internal/upload bridge.
 *
 * This completely eliminates the 30MB Redis Cloud memory bottleneck and prevents
 * volatile-lru chunk evictions that previously corrupted multi-megabyte direct uploads.
 */
export async function uploadArchiveToVm(params: {
  targetType: "project" | "service";
  targetId: string;
  deploymentId: string;
  buffer: Buffer;
}): Promise<VmArchiveUploadResult> {
  const { targetType, targetId, deploymentId, buffer } = params;

  // 1. Direct VM HTTP Upload Bridge (Zero Redis footprint)
  const edgeRouterUrl = `http://${BASE_DOMAIN}/_internal/upload?targetType=${targetType}&targetId=${targetId}&deploymentId=${deploymentId}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout for large uploads

    console.log(`[vm-archive] Streaming ${targetType} archive (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) directly to VM SSD at ${edgeRouterUrl}...`);

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
      console.log(`[vm-archive] ✓ Successfully stored archive on VM SSD: ${data.path || "persisted"}`);
      return { ok: true, path: data.path, bytesWritten: buffer.length, stagedInRedis: false };
    } else {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      console.warn(`[vm-archive] VM upload bridge returned ${res.status}: ${errText}`);
    }
  } catch (err: any) {
    console.warn(`[vm-archive] Direct VM upload HTTP bridge failed: ${err.message}`);
  }

  // 2. Safe Fallback: If VM bridge failed and archive is small (<= 5MB), stage in Redis as a single binary buffer
  // Note: Binary buffers do NOT have base64 overhead, and we avoid splitting into multi-keys to prevent partial LRU eviction
  if (buffer.length <= 5 * 1024 * 1024) {
    try {
      console.log(`[vm-archive] VM bridge unreachable. Staging small archive (${(buffer.length / 1024).toFixed(1)} KB) in Redis buffer fallback...`);
      await redisClient.set(`upload:${deploymentId}`, buffer, "EX", 900);
      return { ok: true, bytesWritten: buffer.length, stagedInRedis: true };
    } catch (redisErr: any) {
      console.error(`[vm-archive] Redis fallback stage failed:`, redisErr);
      return { ok: false, error: redisErr.message };
    }
  }

  return {
    ok: false,
    error: `Cloud compute node was unreachable on port 80 and archive payload (${(buffer.length / (1024 * 1024)).toFixed(1)} MB) exceeds the 5MB safety limit for in-memory Redis staging. Please verify the VM is running and accessible at http://${BASE_DOMAIN}.`,
  };
}
