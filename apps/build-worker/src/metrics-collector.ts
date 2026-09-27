import Docker from "dockerode";
import { Redis } from "ioredis";
import { parseDockerStats, type MetricSnapshot } from "./metrics-helper.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const redisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times: number) {
    return Math.min(times * 100, 3000);
  },
  reconnectOnError() {
    return true;
  },
};

const redisPub = new Redis(REDIS_URL, redisOptions);
redisPub.on("error", (err) => {
  if (err.message?.includes("Connection is closed")) return;
  console.warn("[MetricsCollector Pub warn]", err.message);
});

const prevSnapshots = new Map<string, MetricSnapshot>();

export function startMetricsCollector(): () => void {
  console.log("[Metrics Collector] Started high-frequency container metrics collector (3s interval)...");

  const interval = setInterval(async () => {
    try {
      const allContainers = await docker.listContainers({ all: false }).catch(() => []);
      
      for (const c of allContainers) {
        const serviceId = c.Labels?.["serviceId"];
        if (!serviceId) continue;

        try {
          const container = docker.getContainer(c.Id);
          const stats = await container.stats({ stream: false });
          const prev = prevSnapshots.get(c.Id);
          const { metric, snapshot } = parseDockerStats(stats, prev);
          prevSnapshots.set(c.Id, snapshot);

          const containerName = c.Names?.[0]?.replace(/^\//, "") || `service-${c.Id.slice(0, 12)}`;

          // 1. Append to recent history in Redis
          await redisPub.lpush(`metrics:service:${serviceId}`, JSON.stringify(metric)).catch(() => {});
          await redisPub.ltrim(`metrics:service:${serviceId}`, 0, 59).catch(() => {});
          await redisPub.expire(`metrics:service:${serviceId}`, 3600).catch(() => {});

          // 2. Set active status key with 15s TTL so API knows container is alive
          await redisPub.set(
            `service:status:${serviceId}`,
            JSON.stringify({
              status: "running",
              container: containerName,
              updatedAt: Date.now(),
            }),
            "EX",
            15
          ).catch(() => {});

          // 3. Publish live tick to PubSub channel for real-time SSE streaming
          await redisPub.publish(
            `metrics:tick:${serviceId}`,
            JSON.stringify({
              status: "running",
              container: containerName,
              metric,
            })
          ).catch(() => {});
        } catch (itemErr: any) {
          // If container stopped, remove from snapshot cache
          prevSnapshots.delete(c.Id);
        }
      }
    } catch (err: any) {
      if (!err?.message?.includes("Connection is closed")) {
        console.warn("[Metrics Collector] Warning:", err?.message || err);
      }
    }
  }, 3000);

  return () => {
    clearInterval(interval);
    redisPub.quit().catch(() => {});
  };
}
