import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Main Redis client (commands) — configured with strict timeouts so Render NEVER hangs when VM/Redis is offline
export const redisClient = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false, // NEVER buffer commands indefinitely when Redis is down!
  connectTimeout: 2000,
  commandTimeout: 2000,
  retryStrategy(times) {
    if (times > 3) return null; // Avoid aggressive reconnect loops when VM is powered off
    return Math.min(times * 500, 2000);
  },
  enableReadyCheck: false,
  lazyConnect: true,
});

// Subscriber client
export const redisSub = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 2000,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 500, 2000);
  },
  enableReadyCheck: false,
  lazyConnect: true,
});

// Dedicated connection helper for BullMQ queues (which require maxRetriesPerRequest: null)
export function getBullMqConnection() {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    connectTimeout: 2500,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 1000, 3000);
    },
    enableReadyCheck: false,
    lazyConnect: true,
  });
}

redisClient.on("error", (err: Error) => {
  // Suppress verbose reconnect spam when VM is offline
  if (!err.message?.includes("ECONNREFUSED") && !err.message?.includes("ETIMEDOUT") && !err.message?.includes("Stream isn't writeable")) {
    console.warn("[Redis] Client warning:", err.message);
  }
});
redisSub.on("error", (err: Error) => {
  if (!err.message?.includes("ECONNREFUSED") && !err.message?.includes("ETIMEDOUT") && !err.message?.includes("Stream isn't writeable")) {
    console.warn("[Redis] Sub warning:", err.message);
  }
});

/**
 * Store deployment routing info so the Edge Router can look it up.
 * Key: `deployment:<slug>` or `deployment:<customDomain>`
 */
export async function registerDeployment(
  slug: string,
  info: {
    type: "static" | "ssr" | "hybrid";
    staticDir?: string;
    containerPort?: number;
    deploymentId: string;
  }
) {
  await redisClient.set(`deployment:${slug}`, JSON.stringify(info));
}

export async function unregisterDeployment(slug: string) {
  await redisClient.del(`deployment:${slug}`);
}

export async function getDeploymentInfo(slug: string) {
  const raw = await redisClient.get(`deployment:${slug}`);
  if (!raw) return null;
  return JSON.parse(raw) as {
    type: "static" | "ssr" | "hybrid";
    staticDir?: string;
    containerPort?: number;
    deploymentId: string;
  };
}
