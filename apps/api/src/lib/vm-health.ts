import { redisClient } from "./redis.js";

let cachedStatus: { online: boolean; timestamp: number } | null = null;
const CACHE_TTL_MS = 25_000; // 25 seconds cache

/**
 * Checks if the Azure VM (Edge Router + Build Worker + Redis) is currently running.
 * Cached for 15 seconds to ensure zero latency overhead on API requests.
 * Uses strict 800ms abort signals so Render NEVER hangs even when VM is powered off.
 */
export async function isVmOnline(): Promise<boolean> {
  const now = Date.now();
  if (cachedStatus && now - cachedStatus.timestamp < CACHE_TTL_MS) {
    return cachedStatus.online;
  }

  // 1. Direct HTTP probe to Azure VM Port 80 (Edge Router /health) with strict 800ms timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
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

  // 2. Only check Redis if connection is already ACTIVE and READY (never blocks when VM is off)
  if (redisClient.status === "ready") {
    try {
      const raw = await Promise.race([
        redisClient.get("vm:stats"),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 300)),
      ]);
      if (raw) {
        const stats = JSON.parse(raw);
        if (stats && stats.timestamp && now - stats.timestamp < 120_000) {
          cachedStatus = { online: true, timestamp: now };
          return true;
        }
      }
    } catch {}
  }

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
