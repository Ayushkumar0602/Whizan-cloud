import dotenv from "dotenv";
dotenv.config();

import { Redis } from "ioredis";
import { BatchTelemetryFlusher } from "./telemetry.js";
import { TaskDispatcher } from "./dispatcher.js";
import { ZeroIdleScheduler } from "./scheduler.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const API_URL = process.env.API_URL || process.env.CONTROL_PLANE_URL || "https://api.whizan.cloud";
const RUNTIME_URL = process.env.FUNCTION_RUNTIME_URL || "http://127.0.0.1:9090";
const MESH_TOKEN = process.env.INTERNAL_MESH_TOKEN || process.env.INTERNAL_SECRET || process.env.JWT_SECRET || "";

console.log("─────────────────────────────────────────────────────────");
console.log("⏱️  WHIZAN CRON ENGINE — SUPER RESOURCE OPTIMIZED DAEMON");
console.log("─────────────────────────────────────────────────────────");
console.log(`[Config] Redis: ${REDIS_URL}`);
console.log(`[Config] API Control Plane: ${API_URL}`);
console.log(`[Config] Function Runtime: ${RUNTIME_URL}`);

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
});

const redisSub = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
});

const redisStream = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
});

redis.on("error", (err) => console.error("[Redis] Command error:", err.message));
redisSub.on("error", (err) => console.error("[Redis] Subscriber error:", err.message));
redisStream.on("error", (err) => console.error("[Redis] Stream consumer error:", err.message));

// ─── VM Reboot / Cold Start Self-Healing ──────────────────────────────────────
async function rehydrateScheduleFromControlPlane() {
  try {
    const card = await redis.zcard("cron:schedule:zset");
    console.log(`[Rehydration] Current jobs in Redis schedule ZSET: ${card}`);

    // If ZSET is empty (e.g. after Redis restart or VM reboot), sync from API
    if (card === 0) {
      console.log(`[Rehydration] Redis schedule is empty. Syncing from Control Plane (${API_URL})...`);
      const syncRes = await fetch(`${API_URL.replace(/\/$/, "")}/api/crons/sync`, {
        method: "GET",
        headers: { "x-mesh-token": MESH_TOKEN },
      });

      if (syncRes.ok) {
        const body: any = await syncRes.json();
        console.log(`[Rehydration] Successfully synced ${body.syncedCount || 0} active cron jobs from Control Plane!`);
      } else {
        console.warn(`[Rehydration] Control Plane sync returned HTTP ${syncRes.status}`);
      }
    }
  } catch (err: any) {
    console.error("[Rehydration] Failed to sync with Control Plane on boot:", err.message);
  }
}

// ─── Initialize Engine Components ─────────────────────────────────────────────
const flusher = new BatchTelemetryFlusher(redis, API_URL, MESH_TOKEN);
const dispatcher = new TaskDispatcher(redis, RUNTIME_URL, MESH_TOKEN);
const scheduler = new ZeroIdleScheduler(redis, redisSub, redisStream, dispatcher, flusher);

async function main() {
  await rehydrateScheduleFromControlPlane();
  await scheduler.start();
}

main().catch((err) => {
  console.error("[Fatal] Failed to start cron daemon:", err);
  process.exit(1);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const shutdown = async (signal: string) => {
  console.log(`\n[Process] Received ${signal}. Shutting down cleanly...`);
  await scheduler.stop();
  await redis.quit();
  await redisSub.quit();
  await redisStream.quit();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
