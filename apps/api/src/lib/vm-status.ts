import { redisClient } from "./redis.js";
import { triggerVmWake } from "./vm-wake.js";

export interface VmStatusResult {
  vmOnline: boolean;
  status: "ONLINE" | "WAKING_UP" | "MAINTENANCE";
  message: string;
  contactEmail: string;
  contactUrl: string;
  vmHost: string;
  timestamp: number;
  lastSeenMs?: number;
  isWakingUp?: boolean;
  etaSeconds?: number;
}

export const ADMIN_CONTACT_EMAIL = "ayushkumarjais0602@gmail.com";
export const DEFAULT_CONTACT_URL =
  process.env.DASHBOARD_URL
    ? `${process.env.DASHBOARD_URL.replace(/\/+$/, "")}/contact`
    : "https://whizan-cloud-service-dashboard.vercel.app/contact";

/**
 * Checks whether the cloud compute worker node is actively reporting telemetry to Redis.
 * The build-worker publishes `vm:stats` every 15s with a 45s TTL.
 * If the VM is offline and autoWake is enabled, it automatically triggers Azure Automation.
 */
export async function checkVmOnline(options: { autoWake?: boolean; reason?: string } = { autoWake: true }): Promise<VmStatusResult> {
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

  if (vmOnline) {
    return {
      vmOnline: true,
      status: "ONLINE",
      message: "Cloud compute infrastructure and build worker nodes are active and operational.",
      contactEmail: ADMIN_CONTACT_EMAIL,
      contactUrl,
      vmHost,
      timestamp: Date.now(),
      lastSeenMs,
      isWakingUp: false,
    };
  }

  // Check if a wake operation is currently in progress
  let isWakingUp = false;
  let etaSeconds = 55;
  try {
    const wakeVal = await redisClient.get("vm:wake:in_progress");
    if (wakeVal) {
      isWakingUp = true;
      const startedAt = parseInt(wakeVal, 10) || Date.now();
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      etaSeconds = Math.max(5, 60 - elapsed);
    } else if (options.autoWake !== false) {
      // Trigger wake via Azure Automation
      const wakeRes = await triggerVmWake(options.reason || "status_check");
      if (wakeRes.success && (wakeRes.action === "triggered" || wakeRes.action === "already_waking")) {
        isWakingUp = true;
        etaSeconds = wakeRes.etaSeconds ?? 55;
      }
    }
  } catch (err: any) {
    console.warn("[vm-status] Auto-wake check error:", err?.message || err);
  }

  return {
    vmOnline: false,
    status: isWakingUp ? "WAKING_UP" : "MAINTENANCE",
    message: isWakingUp
      ? `Cloud compute node is sleeping to conserve resources. Automatically waking Azure VM (ETA: ~${etaSeconds}s)...`
      : "The administration has temporarily stopped new deployments and serving active applications until further notice.",
    contactEmail: ADMIN_CONTACT_EMAIL,
    contactUrl,
    vmHost,
    timestamp: Date.now(),
    lastSeenMs,
    isWakingUp,
    etaSeconds: isWakingUp ? etaSeconds : undefined,
  };
}
