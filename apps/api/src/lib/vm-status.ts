import { redisClient } from "./redis.js";

export interface VmStatusResult {
  vmOnline: boolean;
  status: "ONLINE" | "MAINTENANCE";
  message: string;
  contactEmail: string;
  contactUrl: string;
  vmHost: string;
  timestamp: number;
  lastSeenMs?: number;
}

export const ADMIN_CONTACT_EMAIL = "ayushkumarjais0602@gmail.com";
export const DEFAULT_CONTACT_URL =
  process.env.DASHBOARD_URL
    ? `${process.env.DASHBOARD_URL.replace(/\/+$/, "")}/contact`
    : "https://whizan-cloud-service-dashboard.vercel.app/contact";

/**
 * Checks whether the cloud compute worker node is actively reporting telemetry to Redis.
 * The build-worker publishes `vm:stats` every 15s with a 45s TTL.
 */
export async function checkVmOnline(): Promise<VmStatusResult> {
  const contactUrl = DEFAULT_CONTACT_URL;
  let vmOnline = false;
  let vmHost = "compute-cluster-1";
  let lastSeenMs: number | undefined;

  try {
    const raw = await redisClient.get("vm:stats");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.hostname) vmHost = parsed.hostname;
      const reportedAt = typeof parsed.timestamp === "number" ? parsed.timestamp : Date.now();
      lastSeenMs = Date.now() - reportedAt;
      // Fresh within 60 seconds
      if (lastSeenMs < 60_000) {
        vmOnline = true;
      }
    }
  } catch (err: any) {
    console.warn("[vm-status] Failed to read vm:stats from Redis:", err?.message || err);
  }

  // Allow optional explicit maintenance override via environment variable if desired
  if (process.env.FORCE_VM_MAINTENANCE === "true") {
    vmOnline = false;
  }

  return {
    vmOnline,
    status: vmOnline ? "ONLINE" : "MAINTENANCE",
    message: vmOnline
      ? "Cloud compute infrastructure and build worker nodes are active and operational."
      : "The administration has temporarily stopped new deployments and serving active applications until further notice.",
    contactEmail: ADMIN_CONTACT_EMAIL,
    contactUrl,
    vmHost,
    timestamp: Date.now(),
    lastSeenMs,
  };
}
