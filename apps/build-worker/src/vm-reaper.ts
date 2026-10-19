// ─── Whizan Cloud — Autonomous VM Idle Reaper Daemon ─────────────────────────
// Automatically triggers Azure VM deallocation into $0.00/hr state when completely idle for 20 minutes.

import os from "os";
import Docker from "dockerode";
import { Queue } from "bullmq";
import { redisPub } from "./redis.js";
import { getActiveSessionCount } from "./remote-exec.js";

const SLEEP_WEBHOOK_URL = process.env.AZURE_VM_SLEEP_WEBHOOK_URL || "";

const BOOT_GRACE_PERIOD_SEC = 900; // 15 minutes grace period after VM boot
const IDLE_TIMEOUT_MS = 20 * 60 * 1000; // 20 continuous minutes of zero activity
const CHECK_INTERVAL_MS = 60 * 1000; // Evaluate every 60 seconds

let consecutiveIdleChecks = 0;
let reaperInterval: NodeJS.Timeout | null = null;
let isDeallocating = false;

// Shared BullMQ queues to inspect active/waiting jobs
const buildQueue = new Queue("build", { connection: redisPub as any });
const serviceQueue = new Queue("service-build", { connection: redisPub as any });
const databaseQueue = new Queue("database-job", { connection: redisPub as any });

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export function startVmReaper(): void {
  if (reaperInterval) return;

  console.log("[VM Reaper] Autonomous 20-minute Azure VM idle hibernation watchdog initialized.");

  reaperInterval = setInterval(async () => {
    try {
      if (isDeallocating) return;

      // 1. Check if disabled via environment or Redis flag
      if (process.env.DISABLE_VM_REAPER === "true") return;
      const reaperDisabled = await redisPub.get("vm:reaper:disabled").catch(() => null);
      if (reaperDisabled === "true") return;

      // 2. Boot Grace Period: Must have been running for at least 15 minutes
      const uptimeSec = os.uptime();
      if (uptimeSec < BOOT_GRACE_PERIOD_SEC) {
        consecutiveIdleChecks = 0;
        return;
      }

      // 3. Inspect Running Docker Containers (services, web apps, databases, functions)
      const allContainers = await docker.listContainers({ all: false }).catch(() => []);
      const runningUserContainers = allContainers.filter((c) =>
        c.State === "running" &&
        c.Names?.some((n) =>
          n.includes("service-") ||
          n.includes("app-") ||
          n.includes("whizan-db-") ||
          n.includes("whizan-fn-")
        )
      );

      if (runningUserContainers.length > 0) {
        consecutiveIdleChecks = 0;
        return;
      }

      // 4. BullMQ Queues Check (no builds, deployments, or database actions active/queued)
      const [
        buildActive,
        buildWaiting,
        serviceActive,
        serviceWaiting,
        dbActive,
        dbWaiting,
      ] = await Promise.all([
        buildQueue.getActiveCount().catch(() => 0),
        buildQueue.getWaitingCount().catch(() => 0),
        serviceQueue.getActiveCount().catch(() => 0),
        serviceQueue.getWaitingCount().catch(() => 0),
        databaseQueue.getActiveCount().catch(() => 0),
        databaseQueue.getWaitingCount().catch(() => 0),
      ]);

      const totalPendingJobs =
        buildActive + buildWaiting + serviceActive + serviceWaiting + dbActive + dbWaiting;

      if (totalPendingJobs > 0) {
        consecutiveIdleChecks = 0;
        return;
      }

      // 5. Active Remote Terminal Sessions Check
      const activeTerminals = getActiveSessionCount();
      if (activeTerminals > 0) {
        consecutiveIdleChecks = 0;
        return;
      }

      // 6. Router Traffic Inactivity Check (recorded in Redis by edge router)
      const lastRouterAccessRaw = await redisPub.get("router:last_access").catch(() => null);
      const now = Date.now();
      const lastAccess = lastRouterAccessRaw
        ? parseInt(lastRouterAccessRaw, 10)
        : (now - (uptimeSec * 1000));

      const idleDurationMs = now - lastAccess;

      if (idleDurationMs < IDLE_TIMEOUT_MS) {
        consecutiveIdleChecks = 0;
        return;
      }

      // 7. Multi-Condition Safety Check Passed!
      consecutiveIdleChecks++;
      const idleMinutes = Math.round(idleDurationMs / 60000);
      console.log(
        `[VM Reaper] Safety check passed (Check #${consecutiveIdleChecks}): 0 containers, 0 queue jobs, 0 terminal sessions, ${idleMinutes}m of edge router silence.`
      );

      // Require 2 consecutive checks (2 minutes) in confirmed idle state before deallocating
      if (consecutiveIdleChecks >= 2) {
        isDeallocating = true;
        console.warn(
          `💤 [VM Reaper] Complete idleness threshold reached (${idleMinutes}m idle). Disagreeing compute costs — Triggering Azure VM Sleep Webhook to deallocate into $0.00/hour state!`
        );

        // Update Redis state so control plane immediately knows VM is sleeping
        await redisPub.set(
          "vm:status",
          JSON.stringify({
            status: "STOPPED",
            lastDeallocatedAt: new Date().toISOString(),
            reason: "auto_idle_20m",
          })
        ).catch(() => {});
        await redisPub.del("vm:stats").catch(() => {});

        // Call the Azure Automation Sleep Webhook
        try {
          if (!SLEEP_WEBHOOK_URL) {
            console.warn("[VM Reaper] AZURE_VM_SLEEP_WEBHOOK_URL is not configured in environment variables. Skipping deallocation.");
            isDeallocating = false;
            consecutiveIdleChecks = 0;
            return;
          }
          const res = await fetch(SLEEP_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reason: "auto_idle_20m",
              triggeredAt: new Date().toISOString(),
              uptimeMinutes: Math.round(uptimeSec / 60),
            }),
          });
          const responseText = await res.text().catch(() => "");
          console.log(`[VM Reaper] Sleep Webhook response (${res.status}):`, responseText);
        } catch (err: any) {
          console.error(`[VM Reaper] Failed to call Sleep Webhook:`, err.message);
          isDeallocating = false;
          consecutiveIdleChecks = 0;
        }
      }
    } catch (err: any) {
      console.warn("[VM Reaper] Cycle notice:", err.message);
    }
  }, CHECK_INTERVAL_MS);
}

export function stopVmReaper(): void {
  if (reaperInterval) {
    clearInterval(reaperInterval);
    reaperInterval = null;
  }
}
