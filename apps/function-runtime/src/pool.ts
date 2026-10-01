import { LoadedBundle } from "./types.js";
import { FunctionSandbox } from "./sandbox.js";
import { Redis } from "ioredis";

export class FunctionPool {
  private bundles = new Map<string, LoadedBundle>();
  private sandbox: FunctionSandbox;
  private redis: Redis | null = null;
  private sweepInterval: NodeJS.Timeout | null = null;

  constructor(sandbox: FunctionSandbox, redisClient?: Redis | null) {
    this.sandbox = sandbox;
    this.redis = redisClient || null;

    // Start background idle sweeper (Scale-to-Zero) every 60 seconds
    this.sweepInterval = setInterval(() => this.sweepIdle(), 60_000);

    if (this.redis) {
      this.subscribeToReloadEvents();
    }
  }

  private getKey(serviceId: string, version: number): string {
    return `${serviceId}:v${version}`;
  }

  /**
   * Retrieves a bundle from the in-memory warm cache, or loads it from disk if cold.
   */
  public async getOrLoadBundle(
    serviceId: string,
    version: number,
    bundlePath: string
  ): Promise<LoadedBundle> {
    const key = this.getKey(serviceId, version);
    const existing = this.bundles.get(key);

    if (existing) {
      existing.lastAccessedAt = Date.now();
      return existing;
    }

    // Cold start load
    const bundle = await this.sandbox.loadBundle(serviceId, version, bundlePath);
    this.bundles.set(key, bundle);
    return bundle;
  }

  /**
   * Evicts a bundle or all versions for a service.
   */
  public evict(serviceId: string, version?: number): void {
    if (version !== undefined) {
      const key = this.getKey(serviceId, version);
      this.bundles.delete(key);
    } else {
      for (const k of this.bundles.keys()) {
        if (k.startsWith(`${serviceId}:`)) {
          this.bundles.delete(k);
        }
      }
    }
  }

  /**
   * Periodically unloads inactive function bundles to free RAM (Scale-to-Zero).
   * Default idle threshold: 5 minutes.
   */
  public sweepIdle(maxIdleMs = 5 * 60 * 1000): void {
    const now = Date.now();
    for (const [key, bundle] of this.bundles.entries()) {
      if (now - bundle.lastAccessedAt > maxIdleMs) {
        this.bundles.delete(key);
      }
    }
  }

  /**
   * Subscribes to Redis Pub/Sub for instant hot-reload and bundle eviction.
   */
  private subscribeToReloadEvents(): void {
    if (!this.redis) return;
    const sub = this.redis.duplicate();
    sub.subscribe("fn:reload", (err: any) => {
      if (err) console.error("[FunctionPool] Failed to subscribe to fn:reload:", err.message);
    });

    sub.on("message", (channel: string, message: string) => {
      if (channel === "fn:reload") {
        try {
          const { serviceId, version } = JSON.parse(message);
          this.evict(serviceId, version);
        } catch {}
      }
    });
  }

  public getStats() {
    return {
      activeBundles: this.bundles.size,
      services: Array.from(this.bundles.keys()),
    };
  }

  public destroy(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }
}
