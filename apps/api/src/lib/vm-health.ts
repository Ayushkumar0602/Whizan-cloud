import { redisClient } from "./redis.js";

let cachedStatus: { online: boolean; timestamp: number } | null = null;
const CACHE_TTL_MS = 10_000; // 10 seconds cache

/**
 * Checks if the Azure VM (Edge Router + Build Worker + Redis) is currently running.
 * Cached for 10 seconds to avoid latency overhead on every request.
 */
export async function isVmOnline(): Promise<boolean> {
  const now = Date.now();
  if (cachedStatus && now - cachedStatus.timestamp < CACHE_TTL_MS) {
    return cachedStatus.online;
  }

  // 1. Check Redis heartbeat from build-worker
  try {
    const raw = await redisClient.get("vm:stats");
    if (raw) {
      const stats = JSON.parse(raw);
      if (stats && stats.timestamp && now - stats.timestamp < 120_000) {
        cachedStatus = { online: true, timestamp: now };
        return true;
      }
    }
  } catch {}

  // 2. Fallback direct HTTP probe to Azure VM port 80
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);
    const res = await fetch("http://20.2.136.11/health", {
      method: "GET",
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeout);

    if (res && (res.status === 200 || res.status < 500)) {
      cachedStatus = { online: true, timestamp: now };
      return true;
    }
  } catch {}

  cachedStatus = { online: false, timestamp: now };
  return false;
}

export function maintenanceResponse() {
  return {
    statusCode: 503,
    error: "Cloud infrastructure is currently under maintenance for Free Tier users. We will be back online soon!",
    code: "INFRA_MAINTENANCE",
    maintenance: true,
    message: "Our compute nodes and build workers are currently undergoing scheduled maintenance. All persistent databases, deployments, and code archives are 100% safe. We will be back soon!",
  };
}
