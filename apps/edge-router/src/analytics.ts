import Redis from "ioredis";

export interface RequestMetricEvent {
  targetType: "service" | "project";
  targetId: string;
  slug: string;
  statusCode: number;
  durationMs: number;
  bytesSent: number;
  method: string;
  path: string;
  ip: string;
  userAgent?: string;
  isWafBlocked?: boolean;
}

export interface MinuteMetricBucket {
  targetType: "service" | "project";
  targetId: string;
  slug: string;
  timestamp: number; // Minute epoch: Math.floor(now / 60000) * 60000
  requests: number;
  status2xx: number;
  status3xx: number;
  status4xx: number;
  status5xx: number;
  totalDurationMs: number;
  maxDurationMs: number;
  minDurationMs: number;
  bytesSent: number;
  methods: Record<string, number>;
  topPaths: Record<string, number>;
  uniqueIpsCount: number;
  wafMitigations: number;
}

export interface RecentRequestLog {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  bytesSent: number;
  clientIp: string;
  clientType: "mobile" | "browser" | "cli_tool" | "scanner" | "unknown";
  userAgent: string;
  isWafBlocked: boolean;
}

class EdgeAnalyticsEngine {
  private redis: Redis | null = null;

  // In-memory 1-minute rolling aggregator: key = `${targetId}:${minuteEpoch}`
  private activeBuckets = new Map<string, MinuteMetricBucket>();
  private bucketIpSets = new Map<string, Set<string>>();

  // In-memory circular recent requests buffer per targetId (max 50 requests)
  private recentRequests = new Map<string, RecentRequestLog[]>();
  private readonly MAX_RECENT_REQUESTS = 40;

  // Max active buckets in memory before safety eviction
  private readonly MAX_ACTIVE_BUCKETS = 10_000;

  constructor() {
    // Flush aggregated buckets to Redis every 10 seconds
    setInterval(() => this.flushToRedis(), 10_000);
  }

  public init(redisClient: Redis) {
    this.redis = redisClient;
    console.log("[Analytics] High-Performance Edge Analytics Engine initialized.");
  }

  /**
   * Fast-path in-memory record (< 0.005ms synchronous execution)
   */
  public record(event: RequestMetricEvent) {
    if (!event.targetId || !event.slug) return;

    const now = Date.now();
    const minuteEpoch = Math.floor(now / 60_000) * 60_000;
    const bucketKey = `${event.targetId}:${minuteEpoch}`;

    // 1. Update or create 1-minute bucket
    let bucket = this.activeBuckets.get(bucketKey);
    let ipSet = this.bucketIpSets.get(bucketKey);

    if (!bucket) {
      // Memory safety check
      if (this.activeBuckets.size >= this.MAX_ACTIVE_BUCKETS) {
        const oldestKey = this.activeBuckets.keys().next().value;
        if (oldestKey) {
          this.activeBuckets.delete(oldestKey);
          this.bucketIpSets.delete(oldestKey);
        }
      }

      bucket = {
        targetType: event.targetType,
        targetId: event.targetId,
        slug: event.slug,
        timestamp: minuteEpoch,
        requests: 0,
        status2xx: 0,
        status3xx: 0,
        status4xx: 0,
        status5xx: 0,
        totalDurationMs: 0,
        maxDurationMs: 0,
        minDurationMs: 999999,
        bytesSent: 0,
        methods: {},
        topPaths: {},
        uniqueIpsCount: 0,
        wafMitigations: 0,
      };
      ipSet = new Set<string>();
      this.activeBuckets.set(bucketKey, bucket);
      this.bucketIpSets.set(bucketKey, ipSet);
    }

    bucket.requests++;
    const code = event.statusCode;
    if (code >= 200 && code < 300) bucket.status2xx++;
    else if (code >= 300 && code < 400) bucket.status3xx++;
    else if (code >= 400 && code < 500) bucket.status4xx++;
    else if (code >= 500) bucket.status5xx++;

    const dur = Math.max(0, event.durationMs);
    bucket.totalDurationMs += dur;
    if (dur > bucket.maxDurationMs) bucket.maxDurationMs = dur;
    if (dur < bucket.minDurationMs) bucket.minDurationMs = dur;

    bucket.bytesSent += Math.max(0, event.bytesSent);

    // Method count
    const m = (event.method || "GET").toUpperCase();
    bucket.methods[m] = (bucket.methods[m] || 0) + 1;

    // Path count (normalize to strip query strings to protect privacy and group endpoints)
    const rawPath = (event.path || "/").split("?")[0].slice(0, 80);
    bucket.topPaths[rawPath] = (bucket.topPaths[rawPath] || 0) + 1;

    // Unique IP tracking
    if (event.ip && ipSet && !ipSet.has(event.ip)) {
      if (ipSet.size < 5000) {
        ipSet.add(event.ip);
        bucket.uniqueIpsCount = ipSet.size;
      }
    }

    if (event.isWafBlocked) {
      bucket.wafMitigations++;
    }

    // 2. Buffer recent request for live request inspector
    this.recordRecentRequest(event, now);
  }

  private recordRecentRequest(event: RequestMetricEvent, now: number) {
    let list = this.recentRequests.get(event.targetId);
    if (!list) {
      list = [];
      this.recentRequests.set(event.targetId, list);
    }

    const ua = (event.userAgent || "").toLowerCase();
    let clientType: RecentRequestLog["clientType"] = "browser";
    if (ua.includes("mobile") || ua.includes("iphone") || ua.includes("android")) {
      clientType = "mobile";
    } else if (ua.includes("curl") || ua.includes("wget") || ua.includes("postman") || ua.includes("httpie")) {
      clientType = "cli_tool";
    } else if (ua.includes("sqlmap") || ua.includes("nikto") || ua.includes("scanner")) {
      clientType = "scanner";
    }

    const logItem: RecentRequestLog = {
      id: Math.random().toString(36).slice(2, 9),
      timestamp: new Date(now).toISOString(),
      method: (event.method || "GET").toUpperCase(),
      path: (event.path || "/").slice(0, 100),
      statusCode: event.statusCode,
      durationMs: Math.round(event.durationMs * 10) / 10,
      bytesSent: event.bytesSent,
      clientIp: event.ip || "127.0.0.1",
      clientType,
      userAgent: (event.userAgent || "").slice(0, 100),
      isWafBlocked: Boolean(event.isWafBlocked),
    };

    list.unshift(logItem);
    if (list.length > this.MAX_RECENT_REQUESTS) {
      list.pop();
    }
  }

  /**
   * Batched background flush to Redis (Every 10s)
   */
  private async flushToRedis() {
    if (!this.redis || this.activeBuckets.size === 0) return;

    const now = Date.now();
    const currentMinuteEpoch = Math.floor(now / 60_000) * 60_000;

    const keysToPurge: string[] = [];
    const pipeline = this.redis.pipeline();

    for (const [key, bucket] of this.activeBuckets.entries()) {
      const { targetId, timestamp } = bucket;

      const payload = JSON.stringify({
        ...bucket,
        avgDurationMs: bucket.requests > 0 ? Math.round((bucket.totalDurationMs / bucket.requests) * 10) / 10 : 0,
      });

      // Write time-series point to Sorted Set: score = minute epoch
      pipeline.zadd(`analytics:ts:${targetId}`, timestamp, payload);

      // Keep maximum 7 days of rolling minute metrics (7 * 24 * 60 * 60 * 1000 = 604,800,000 ms)
      const cutoff7Days = now - 7 * 24 * 60 * 60 * 1000;
      pipeline.zremrangebyscore(`analytics:ts:${targetId}`, 0, cutoff7Days);
      pipeline.expire(`analytics:ts:${targetId}`, 7 * 24 * 60 * 60);

      // If this bucket is from a past minute, purge from memory
      if (timestamp < currentMinuteEpoch) {
        keysToPurge.push(key);
      }
    }

    // Flush recent requests to Redis lists
    for (const [targetId, list] of this.recentRequests.entries()) {
      if (list.length > 0) {
        pipeline.set(`analytics:recent:${targetId}`, JSON.stringify(list), "EX", 86400); // 24h TTL
      }
    }

    try {
      await pipeline.exec();
      for (const k of keysToPurge) {
        this.activeBuckets.delete(k);
        this.bucketIpSets.delete(k);
      }
    } catch (err: any) {
      console.warn("[Analytics] Redis flush warning:", err?.message || err);
    }
  }
}

export const edgeAnalytics = new EdgeAnalyticsEngine();
