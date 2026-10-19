import dotenv from "dotenv";
dotenv.config();

import { Redis } from "ioredis";
import { StepRunner } from "./step-runner.js";
import { FlowStateMachine } from "./state-machine.js";
import { FlowStreamConsumer } from "./stream-consumer.js";
import { FlowBootReconciler } from "./reconciler.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const API_URL = process.env.API_URL || process.env.CONTROL_PLANE_URL || "https://whizan-cloud-service.onrender.com";
const RUNTIME_URL = process.env.FUNCTION_RUNTIME_URL || "http://127.0.0.1:9090";
const MESH_TOKEN = process.env.INTERNAL_MESH_TOKEN || process.env.INTERNAL_SECRET || process.env.JWT_SECRET || "";

console.log("─────────────────────────────────────────────────────────");
console.log("⚡ WHIZAN FLOW ENGINE — DURABLE DAG WORKFLOW AUTOMATION");
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

// ─── Initialize Engine Components ─────────────────────────────────────────────
const runner = new StepRunner(redis, RUNTIME_URL, MESH_TOKEN);
const stateMachine = new FlowStateMachine(redis, runner, API_URL, MESH_TOKEN);
const consumer = new FlowStreamConsumer(redis, redisStream, redisSub, stateMachine, API_URL, MESH_TOKEN);

async function main() {
  // 1. Run Cold-Boot Self-Healing Reconciliation
  const reconciler = new FlowBootReconciler({
    redis,
    stateMachine,
    apiUrl: API_URL,
    meshToken: MESH_TOKEN,
  });
  await reconciler.reconcileOnBoot().catch((err) => {
    console.warn("[Startup] Reconciler warning:", err.message);
  });

  // 2. Start stream consumer
  await consumer.start();
}

main().catch((err) => {
  console.error("[Fatal] Failed to start flow engine daemon:", err);
  process.exit(1);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const shutdown = async (signal: string) => {
  console.log(`\n[Process] Received ${signal}. Shutting down cleanly...`);
  await consumer.stop();
  await redis.quit();
  await redisSub.quit();
  await redisStream.quit();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
