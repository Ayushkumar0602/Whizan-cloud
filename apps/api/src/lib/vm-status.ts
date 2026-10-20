import { redisClient } from "./redis.js";
import { triggerVmWake } from "./vm-wake.js";

export interface VmStatusResult {
  vmOnline: boolean;
  status: "ONLINE" | "WAKING_UP" | "STANDBY" | "MAINTENANCE";
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
    : "https://dashboard.whizan.cloud/contact";

// ── In-Memory Active Probe Debouncing ─────────────────────────────────────────
let lastProbeAt = 0;
let lastProbeOnline = false;

async function probeVmEdgeRouter(timeoutMs = 1200): Promise<boolean> {
  const now = Date.now();
  // Reuse successful probe result if checked within the last 2000ms
  if (now - lastProbeAt < 2000 && lastProbeOnline) {
    return true;
  }

  const vmIp = process.env.VM_IP || "20.2.136.11";

  try {
    const res = await fetch(`http://${vmIp}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      lastProbeAt = Date.now();
      lastProbeOnline = true;
      return true;
    }
  } catch {
    lastProbeOnline = false;
  }
  return false;
}

/**
 * Checks whether the cloud compute worker node is online.
 * 
 * Performance & Detection Architecture:
 * 1. Checks Redis for telemetry published by build-worker or edge-router.
 * 2. If Redis telemetry is missing or stale, actively probes http://<vm-ip>/health.
 *    The moment the Azure VM's edge-router answers on port 80 (in ~20-25s from power-on),
 *    this active probe detects it immediately (< 1s latency, eliminating the old 60s wait).
 * 3. Passive by default (autoWake: false): Checking status from Dashboard will NEVER auto-wake the VM.
 *    Only explicit user actions or live incoming traffic to a deployment URL triggers autoWake.
 */
export async function checkVmOnline(options: { autoWake?: boolean; reason?: string } = { autoWake: false }): Promise<VmStatusResult> {
  const contactUrl = DEFAULT_CONTACT_URL;
  let vmOnline = false;
  let vmHost = "azure-compute-vm";
  let lastSeenMs: number | undefined;

  // Step 1: Read telemetry from Redis
  try {
    const raw = await redisClient.get("vm:stats");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.hostname) vmHost = parsed.hostname;
      const reportedAt = typeof parsed.timestamp === "number" ? parsed.timestamp : Date.now();
      lastSeenMs = Date.now() - reportedAt;
      // Fresh within 45 seconds
      if (lastSeenMs < 45_000) {
        vmOnline = true;
      }
    }
  } catch (err: any) {
    console.warn("[vm-status] Failed to read vm:stats from Redis:", err?.message || err);
  }

  // Step 2: Active HTTP Probing (Sub-Second Online Detection)
  // If Redis stats haven't arrived yet (e.g. during boot), actively probe Edge Router on port 80
  if (!vmOnline && process.env.FORCE_VM_MAINTENANCE !== "true") {
    const isLive = await probeVmEdgeRouter(1200);
    if (isLive) {
      vmOnline = true;
      lastSeenMs = 50;
      // Immediately clear wake lock and persist synthetic heartbeat
      await redisClient.del("vm:wake:in_progress").catch(() => {});
      await redisClient.set("vm:stats", JSON.stringify({
        hostname: "azure-vm",
        timestamp: Date.now(),
        activeProbe: true,
      }), "EX", 45).catch(() => {});
    }
  }

  // Step 3: Platform Maintenance Override Check
  if (process.env.FORCE_VM_MAINTENANCE === "true") {
    vmOnline = false;
  }

  if (vmOnline) {
    // VM is confirmed online: Ensure wake locks are purged
    await redisClient.del("vm:wake:in_progress").catch(() => {});

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

  // Step 4: Handle Sleeping / Waking State
  let isWakingUp = false;
  let etaSeconds = 45;

  try {
    const wakeVal = await redisClient.get("vm:wake:in_progress");
    if (wakeVal) {
      isWakingUp = true;
      const startedAt = parseInt(wakeVal, 10) || Date.now();
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      etaSeconds = Math.max(5, 45 - elapsed);
    } else if (options.autoWake === true) {
      // ONLY trigger Azure Automation if autoWake is explicitly true (e.g. live traffic visit)
      const wakeRes = await triggerVmWake(options.reason || "status_check");
      if (wakeRes.success && (wakeRes.action === "triggered" || wakeRes.action === "already_waking")) {
        isWakingUp = true;
        etaSeconds = wakeRes.etaSeconds ?? 45;
      }
    }
  } catch (err: any) {
    console.warn("[vm-status] Auto-wake check error:", err?.message || err);
  }

  const isMaintenance = process.env.FORCE_VM_MAINTENANCE === "true";

  return {
    vmOnline: false,
    status: isMaintenance ? "MAINTENANCE" : isWakingUp ? "WAKING_UP" : "STANDBY",
    message: isMaintenance
      ? "The administration has temporarily stopped new deployments and serving active applications until further notice."
      : isWakingUp
        ? `Cloud compute node is waking from eco-standby. Initializing Azure VM (ETA: ~${etaSeconds}s)...`
        : "Cloud compute node is resting in eco-standby ($0.00/hr state). All containers and disk data are safely preserved.",
    contactEmail: ADMIN_CONTACT_EMAIL,
    contactUrl,
    vmHost,
    timestamp: Date.now(),
    lastSeenMs,
    isWakingUp,
    etaSeconds: isWakingUp ? etaSeconds : undefined,
  };
}
