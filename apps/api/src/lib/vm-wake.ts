import { redisClient } from "./redis.js";

export const AZURE_VM_WAKE_WEBHOOK_URL = process.env.AZURE_VM_WAKE_WEBHOOK_URL || "";
export const AZURE_VM_SLEEP_WEBHOOK_URL = process.env.AZURE_VM_SLEEP_WEBHOOK_URL || "";

export interface WakeTriggerResult {
  success: boolean;
  action: "triggered" | "already_waking" | "online" | "disabled" | "error";
  message: string;
  jobId?: string;
  wakingStartedAt?: number;
  etaSeconds?: number;
}

/**
 * Triggers Azure Automation to start the Azure VM (Scale-to-Zero wake-up).
 * Implements a 180s Redis deduplication lock to avoid spamming the webhook
 * when multiple concurrent requests arrive while the VM is booting.
 */
export async function triggerVmWake(reason: string = "demand"): Promise<WakeTriggerResult> {
  if (process.env.DISABLE_VM_AUTO_WAKE === "true") {
    return {
      success: false,
      action: "disabled",
      message: "VM auto-wake is disabled by configuration.",
    };
  }

  // 1. Check if VM is already online
  const rawStats = await redisClient.get("vm:stats").catch(() => null);
  if (rawStats) {
    try {
      const parsed = JSON.parse(rawStats);
      const reportedAt = typeof parsed.timestamp === "number" ? parsed.timestamp : Date.now();
      if (Date.now() - reportedAt < 60_000) {
        return {
          success: true,
          action: "online",
          message: "VM compute cluster is already online and operational.",
        };
      }
    } catch {}
  }

  // 2. Check if a wake operation was already triggered recently (180s lock)
  const existingWake = await redisClient.get("vm:wake:in_progress").catch(() => null);
  if (existingWake) {
    const startedAt = parseInt(existingWake, 10) || Date.now();
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
    const remainingSec = Math.max(0, 60 - elapsedSec);
    return {
      success: true,
      action: "already_waking",
      message: `Azure VM is currently booting up (elapsed: ${elapsedSec}s, ETA: ~${remainingSec}s).`,
      wakingStartedAt: startedAt,
      etaSeconds: remainingSec,
    };
  }

  // 3. Dispatch the Azure Automation Webhook
  if (!AZURE_VM_WAKE_WEBHOOK_URL) {
    console.error("[VM Wake] AZURE_VM_WAKE_WEBHOOK_URL is not configured in environment variables.");
    return {
      success: false,
      action: "error",
      message: "AZURE_VM_WAKE_WEBHOOK_URL environment variable is missing on the control plane.",
    };
  }

  try {
    console.log(`[VM Wake] Dispatched Azure Automation wake trigger (reason: ${reason})`);
    
    // Acquire 180s lock
    const now = Date.now();
    await redisClient.set("vm:wake:in_progress", now.toString(), "EX", 180);

    const res = await fetch(AZURE_VM_WAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, timestamp: now }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      console.error(`[VM Wake] Azure webhook responded with status ${res.status}:`, errText);
      await redisClient.del("vm:wake:in_progress").catch(() => {});
      return {
        success: false,
        action: "error",
        message: `Azure wake webhook returned HTTP ${res.status}: ${errText}`,
      };
    }

    const data: any = await res.json().catch(() => ({}));
    const jobId = Array.isArray(data?.JobIds) ? data.JobIds[0] : undefined;

    return {
      success: true,
      action: "triggered",
      message: "Azure VM wake signal dispatched successfully. VM will boot within 45-60 seconds.",
      jobId,
      wakingStartedAt: now,
      etaSeconds: 55,
    };
  } catch (err: any) {
    console.error("[VM Wake] Failed to call Azure Automation wake webhook:", err?.message || err);
    await redisClient.del("vm:wake:in_progress").catch(() => {});
    return {
      success: false,
      action: "error",
      message: `Failed to trigger Azure wake webhook: ${err.message}`,
    };
  }
}

/**
 * Triggers Azure Automation to stop and deallocate the Azure VM ($0/hr compute billing).
 */
export async function triggerVmSleep(reason: string = "idle_timeout"): Promise<{ success: boolean; message: string }> {
  if (!AZURE_VM_SLEEP_WEBHOOK_URL) {
    console.error("[VM Sleep] AZURE_VM_SLEEP_WEBHOOK_URL is not configured in environment variables.");
    return { success: false, message: "AZURE_VM_SLEEP_WEBHOOK_URL environment variable is missing on the control plane." };
  }

  try {
    console.log(`[VM Sleep] Dispatched Azure Automation sleep trigger (reason: ${reason})`);
    
    // Clear live stats and wake lock from Redis
    await redisClient.del("vm:stats", "vm:wake:in_progress").catch(() => {});

    const res = await fetch(AZURE_VM_SLEEP_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, timestamp: Date.now() }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { success: false, message: `Azure sleep webhook returned HTTP ${res.status}: ${errText}` };
    }

    return { success: true, message: "Azure VM deallocation signal sent successfully ($0/hr compute)." };
  } catch (err: any) {
    return { success: false, message: `Failed to trigger sleep webhook: ${err.message}` };
  }
}
