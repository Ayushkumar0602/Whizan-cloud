import type { Redis } from "ioredis";
import { CronExpressionParser } from "cron-parser";
import crypto from "crypto";
import { TaskDispatcher, type CronJobData } from "./dispatcher.js";
import { BatchTelemetryFlusher } from "./telemetry.js";

export class ZeroIdleScheduler {
  private redis: Redis;
  private redisSub: Redis;
  private dispatcher: TaskDispatcher;
  private flusher: BatchTelemetryFlusher;
  private sleepTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isProcessingTick: boolean = false;

  constructor(
    redis: Redis,
    redisSub: Redis,
    dispatcher: TaskDispatcher,
    flusher: BatchTelemetryFlusher
  ) {
    this.redis = redis;
    this.redisSub = redisSub;
    this.dispatcher = dispatcher;
    this.flusher = flusher;
  }

  /**
   * Start the zero-idle scheduler event loop.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log("[Scheduler] 🚀 Zero-Idle Dynamic Event-Driven Scheduler starting...");

    // 1. Subscribe to reschedule pub/sub interrupt channel
    await this.redisSub.subscribe("cron:reschedule");
    this.redisSub.on("message", (channel, message) => {
      if (channel === "cron:reschedule") {
        // Instant awakening: cancel active sleep timer and recalculate next tick in < 1ms
        this.wakeup();
      }
    });

    // 2. Start batch telemetry flusher
    this.flusher.start();

    // 3. Kick off dynamic sleep-wake loop
    await this.scheduleNextTick();
  }

  /**
   * Stop the scheduler cleanly.
   */
  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }
    await this.redisSub.unsubscribe("cron:reschedule").catch(() => {});
    this.flusher.stop();
    await this.flusher.flush();
    console.log("[Scheduler] Stopped.");
  }

  /**
   * Awakening interrupt: cancels sleep timer immediately.
   */
  public wakeup(): void {
    if (this.sleepTimer) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }
    this.scheduleNextTick().catch((err) =>
      console.error("[Scheduler] Error during interrupt wakeup:", err.message)
    );
  }

  /**
   * Core Zero-Idle Logic:
   * 1. Inspect lowest score in ZSET (earliest due job).
   * 2. If due now (or in past), process tick immediately.
   * 3. If due in future, sleep for exactly (future - now), capped at 60s.
   * 4. Zero busy-loop polling!
   */
  private async scheduleNextTick(): Promise<void> {
    if (!this.isRunning || this.isProcessingTick) return;

    try {
      const now = Date.now();

      // Query the single earliest job scheduled in Redis ZSET
      const earliest = await this.redis.zrange("cron:schedule:zset", 0, 0, "WITHSCORES");

      if (!earliest || earliest.length === 0) {
        // No jobs scheduled in system: sleep for max 60s (pub/sub will wake us if job added)
        this.armSleepTimer(60000);
        return;
      }

      const earliestTimestamp = Number(earliest[1]);
      const deltaMs = earliestTimestamp - now;

      if (deltaMs <= 0) {
        // Earliest job is due now (or overdue) -> process immediately
        await this.processDueJobs(now);
      } else {
        // Earliest job is in future -> sleep for deltaMs (clamped to max 60s)
        const sleepDuration = Math.min(deltaMs, 60000);
        this.armSleepTimer(sleepDuration);
      }
    } catch (err: any) {
      console.error("[Scheduler] Error evaluating next tick:", err.message);
      this.armSleepTimer(5000);
    }
  }

  /**
   * Set dynamic OS-level timer. The event loop releases CPU cycles completely.
   */
  private armSleepTimer(durationMs: number): void {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = setTimeout(async () => {
      this.sleepTimer = null;
      await this.scheduleNextTick();
    }, Math.max(10, durationMs));
  }

  /**
   * Atomically extract and dispatch all jobs due at or before `now`.
   */
  private async processDueJobs(now: number): Promise<void> {
    this.isProcessingTick = true;

    try {
      // Atomic Lua Script: Find all jobs with score <= now, and atomically remove them from ZSET
      const luaScript = `
        local now = tonumber(ARGV[1])
        local limit = tonumber(ARGV[2]) or 500
        local jobs = redis.call('ZRANGEBYSCORE', 'cron:schedule:zset', 0, now, 'LIMIT', 0, limit)
        if #jobs > 0 then
          for i, jobId in ipairs(jobs) do
            redis.call('ZREM', 'cron:schedule:zset', jobId)
          end
        end
        return jobs
      `;

      const dueJobIds = (await this.redis.eval(luaScript, 0, now, 500)) as string[];

      if (dueJobIds && dueJobIds.length > 0) {
        // Dispatch all due jobs in parallel with concurrency checks
        await Promise.allSettled(
          dueJobIds.map((jobId) => this.handleJobExecution(jobId, now))
        );
      }
    } catch (err: any) {
      console.error("[Scheduler] Error processing due jobs:", err.message);
    } finally {
      this.isProcessingTick = false;
      // Re-evaluate next earliest tick
      await this.scheduleNextTick();
    }
  }

  /**
   * Handle single job execution lifecycle (Concurrency, Dispatch, Telemetry, Next Tick)
   */
  private async handleJobExecution(jobId: string, tickTime: number): Promise<void> {
    // 1. Fetch cached job definition from Redis
    const cached = await this.redis.get(`cron:job:${jobId}`);
    if (!cached) return;

    let job: CronJobData & { schedule: string; timezone: string; misfirePolicy: string; enabled: boolean };
    try {
      job = JSON.parse(cached);
    } catch {
      return;
    }

    if (!job.enabled) return;

    // 2. Concurrency Policy Check
    const activeLockKey = `cron:active:${job.id}`;
    const isActive = await this.redis.get(activeLockKey);

    if (isActive) {
      if (job.concurrencyPolicy === "FORBID") {
        console.warn(`[Scheduler] Skipping overlapping run for ${job.name} (Policy: FORBID)`);
        await this.flusher.push({
          id: crypto.randomUUID(),
          cronJobId: job.id,
          triggerType: "SCHEDULED",
          status: "SKIPPED_OVERLAP",
          startedAt: new Date(tickTime).toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 0,
          exitCode: null,
          httpStatusCode: null,
          errorMessage: "Execution skipped due to active overlapping run.",
          stdout: null,
          stderr: null,
          memoryMbPeak: null,
          cpuMs: null,
          retryAttempt: 0,
        });
        // Re-arm next future tick
        await this.rearmNextTick(job);
        return;
      }
    }

    const executionId = crypto.randomUUID();

    // Acquire active lock with timeout + 30s grace
    const lockTtlSeconds = (job.timeoutSeconds || 300) + 30;
    await this.redis.set(activeLockKey, executionId, "EX", lockTtlSeconds);

    // 3. Calculate and re-arm next tick in Redis ZSET immediately
    await this.rearmNextTick(job);

    // 4. Dispatch task asynchronously
    (async () => {
      try {
        const telemetry = await this.dispatcher.dispatch(job, executionId, "SCHEDULED", 0);
        await this.flusher.push(telemetry);
      } catch (err: any) {
        console.error(`[Scheduler] Dispatch failure for job ${job.id}:`, err.message);
      } finally {
        // Release active lock
        await this.redis.del(activeLockKey).catch(() => {});
      }
    })();
  }

  /**
   * Re-calculate next future tick and insert back into Redis ZSET
   */
  private async rearmNextTick(job: { id: string; schedule: string; timezone: string }): Promise<void> {
    try {
      const interval = CronExpressionParser.parse(job.schedule, { tz: job.timezone || "UTC" });
      const nextDate = interval.next().toDate();
      await this.redis.zadd("cron:schedule:zset", nextDate.getTime(), job.id);
    } catch (err: any) {
      console.error(`[Scheduler] Failed to calculate next tick for ${job.id}:`, err.message);
    }
  }
}
