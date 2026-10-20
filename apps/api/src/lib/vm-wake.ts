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

// In-flight singleton promise collapsing (collapses concurrent calls in the same Node.js event loop)
let inFlightWakePromise: Promise<WakeTriggerResult> | null = null;

/**
 * Triggers Azure Automation to start the Azure VM (Scale-to-Zero wake-up).
 * Implements atomic distributed locking (SET ... EX 180 NX) + In-Flight Promise Collapsing
 * so that multiple concurrent requests (e.g. 2 different deployments opened at once)
 * will NEVER trigger duplicate Azure webhooks or contradictory commands.
 */
export async function triggerVmWake(reason: string = "demand"): Promise<WakeTriggerResult> {
  if (process.env.DISABLE_VM_AUTO_WAKE === "true") {
    return {
      success: false,
      action: "disabled",
      message: "VM auto-wake is disabled by configuration.",
    };
  }

  // 1. In-flight Promise Collapsing: If this Node process is already dispatching a wake, share it
  if (inFlightWakePromise) {
    return inFlightWakePromise;
  }

  inFlightWakePromise = (async () => {
    try {
      // 2. Check if VM is already online in Redis
      const rawStats = await redisClient.get("vm:stats").catch(() => null);
      if (rawStats) {
        try {
          const parsed = JSON.parse(rawStats);
          const reportedAt = typeof parsed.timestamp === "number" ? parsed.timestamp : Date.now();
          if (Date.now() - reportedAt < 45_000) {
            return {
              success: true,
              action: "online",
              message: "VM compute cluster is already online and operational.",
            };
          }
        } catch {}
      }

      // 3. Fast probe: Check if Edge Router port 80 is already answering
      const vmIp = process.env.VM_IP || "20.2.136.11";
      try {
        const pingRes = await fetch(`http://${vmIp}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(1000),
        });
        if (pingRes.ok) {
          await redisClient.del("vm:wake:in_progress").catch(() => {});
          await redisClient.set("vm:stats", JSON.stringify({ hostname: "azure-vm", timestamp: Date.now(), activePing: true }), "EX", 45).catch(() => {});
          return {
            success: true,
            action: "online",
            message: "VM compute cluster is already online and operational.",
          };
        }
      } catch {}

      // 4. Check if a wake operation was already triggered recently
      const existingWake = await redisClient.get("vm:wake:in_progress").catch(() => null);
      if (existingWake) {
        const startedAt = parseInt(existingWake, 10) || Date.now();
        const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
        const remainingSec = Math.max(0, 55 - elapsedSec);
        return {
          success: true,
          action: "already_waking",
          message: `Azure VM is currently booting up (elapsed: ${elapsedSec}s, ETA: ~${remainingSec}s).`,
          wakingStartedAt: startedAt,
          etaSeconds: remainingSec,
        };
      }

      // 5. Distributed Atomic Concurrency Lock with Redis NX (Not eXists)
      // Guarantees ONLY ONE request across all API instances / workers can acquire the lock
      const now = Date.now();
      const lockAcquired = await redisClient.set("vm:wake:in_progress", now.toString(), "EX", 180, "NX").catch(() => null);

      if (!lockAcquired) {
        // Parallel worker beat us by a millisecond; return already_waking gracefully
        return {
          success: true,
          action: "already_waking",
          message: "Azure VM is currently booting up (waking lock held by parallel request).",
          wakingStartedAt: now,
          etaSeconds: 55,
        };
      }

      // 6. Dispatch the Azure Automation Webhook
      if (!AZURE_VM_WAKE_WEBHOOK_URL) {
        console.error("[VM Wake] AZURE_VM_WAKE_WEBHOOK_URL is not configured in environment variables.");
        await redisClient.del("vm:wake:in_progress").catch(() => {});
        return {
          success: false,
          action: "error",
          message: "AZURE_VM_WAKE_WEBHOOK_URL environment variable is missing on the control plane.",
        };
      }

      console.log(`[VM Wake] Dispatched Azure Automation wake trigger (reason: ${reason})`);

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
        message: "Azure VM wake signal dispatched successfully. VM will boot within 30-45 seconds.",
        jobId,
        wakingStartedAt: now,
        etaSeconds: 45,
      };
    } catch (err: any) {
      console.error("[VM Wake] Failed to call Azure Automation wake webhook:", err?.message || err);
      await redisClient.del("vm:wake:in_progress").catch(() => {});
      return {
        success: false,
        action: "error",
        message: `Failed to trigger Azure wake webhook: ${err.message}`,
      };
    } finally {
      inFlightWakePromise = null;
    }
  })();

  return inFlightWakePromise;
}

/**
 * Triggers Azure Automation to stop and deallocate the Azure VM ($0/hr compute billing).
 * Protects against conflicting / misleading commands while a wake is in progress.
 */
export async function triggerVmSleep(reason: string = "idle_timeout"): Promise<{ success: boolean; message: string }> {
  if (!AZURE_VM_SLEEP_WEBHOOK_URL) {
    console.error("[VM Sleep] AZURE_VM_SLEEP_WEBHOOK_URL is not configured in environment variables.");
    return { success: false, message: "AZURE_VM_SLEEP_WEBHOOK_URL environment variable is missing on the control plane." };
  }

  // Guard against misleading commands: Reject sleep if VM is actively waking up
  const isWaking = await redisClient.get("vm:wake:in_progress").catch(() => null);
  if (isWaking) {
    const startedAt = parseInt(isWaking, 10) || Date.now();
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    if (elapsed < 120) {
      return {
        success: false,
        message: `Cannot put compute host to sleep while a wake-up boot sequence is actively in progress (elapsed: ${elapsed}s).`,
      };
    }
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
