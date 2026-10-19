import { Redis } from "ioredis";
export { Redis };

export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times: number) {
    return Math.min(times * 100, 3000);
  },
  reconnectOnError() {
    return true;
  },
};

/**
 * Shared command and publisher Redis client for all sub-modules in build-worker.
 * Multiplexes non-blocking Redis commands (GET, SET, DEL, PUBLISH, PIPELINE, etc.)
 * over a single TCP connection.
 */
export const redisPub = new Redis(REDIS_URL, redisOptions);
redisPub.on("error", (err: any) => {
  if (err.message?.includes("Connection is closed")) return;
  console.warn("[Shared RedisPub warn]", err.message);
});

/**
 * Shared subscriber Redis client for all pub/sub listeners in build-worker.
 * Can subscribe to multiple channels simultaneously (wakeup, admin:commands, exec:open, etc.)
 * over a single persistent TCP connection.
 */
export const redisSub = new Redis(REDIS_URL, redisOptions);
redisSub.on("error", (err: any) => {
  if (err.message?.includes("Connection is closed")) return;
  console.warn("[Shared RedisSub warn]", err.message);
});
