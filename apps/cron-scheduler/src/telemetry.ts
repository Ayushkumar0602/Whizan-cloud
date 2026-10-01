import type { Redis } from "ioredis";

export interface ExecutionTelemetry {
  id: string;
  cronJobId: string;
  triggerType: string;
  status: "SUCCESS" | "FAILED" | "TIMED_OUT" | "SKIPPED_OVERLAP" | "MISFIRE_SKIPPED";
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  exitCode: number | null;
  httpStatusCode: number | null;
  errorMessage: string | null;
  stdout: string | null;
  stderr: string | null;
  memoryMbPeak: number | null;
  cpuMs: number | null;
  retryAttempt: number;
}

export class BatchTelemetryFlusher {
  private redis: Redis;
  private apiUrl: string;
  private meshToken: string;
  private flushTimer: NodeJS.Timeout | null = null;
  private queue: ExecutionTelemetry[] = [];
  private isFlushing: boolean = false;

  constructor(redis: Redis, apiUrl: string, meshToken: string) {
    this.redis = redis;
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.meshToken = meshToken;
  }

  public start(intervalMs = 5000): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => console.error("[TelemetryFlusher] Flush error:", err.message));
    }, intervalMs);
  }

  public stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Enqueue completed execution record into memory & Redis fallback list.
   */
  public async push(telemetry: ExecutionTelemetry): Promise<void> {
    this.queue.push(telemetry);
    try {
      // Fast fallback in Redis in case process crashes before 5s flush
      await this.redis.rpush("cron:telemetry:buffer", JSON.stringify(telemetry));
    } catch (err: any) {
      console.warn("[TelemetryFlusher] Failed to push to Redis fallback buffer:", err.message);
    }

    if (this.queue.length >= 25) {
      // Immediate flush if batch size exceeds 25
      this.flush().catch(() => {});
    }
  }

  /**
   * Send batch to API endpoint in a single bulk request.
   */
  public async flush(): Promise<void> {
    if (this.isFlushing || this.queue.length === 0) return;
    this.isFlushing = true;

    const batch = [...this.queue];
    this.queue = [];

    try {
      const response = await fetch(`${this.apiUrl}/api/crons/telemetry/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mesh-token": this.meshToken,
        },
        body: JSON.stringify({ executions: batch }),
      });

      if (!response.ok) {
        throw new Error(`Telemetry batch API rejected with ${response.status}`);
      }

      // Successfully pushed to database: remove corresponding items from Redis buffer
      await this.redis.lpop("cron:telemetry:buffer", batch.length).catch(() => {});
    } catch (err: any) {
      console.error("[TelemetryFlusher] Batch push failed, returning to queue:", err.message);
      // Re-queue items that failed to flush
      this.queue.unshift(...batch);
    } finally {
      this.isFlushing = false;
    }
  }
}
