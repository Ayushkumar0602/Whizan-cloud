import { Redis } from "ioredis";

export class FunctionLogger {
  private redis: Redis | null = null;

  constructor(redisClient?: Redis | null) {
    this.redis = redisClient || null;
  }

  public setRedis(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Redacts sensitive secret values (passwords, tokens, keys) from log text.
   */
  public redact(text: string, secrets: string[] = []): string {
    if (!text || typeof text !== "string") return text;
    let sanitized = text;
    for (const secret of secrets) {
      if (secret && typeof secret === "string" && secret.trim().length > 3) {
        // Escape special regex characters
        const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        sanitized = sanitized.replace(new RegExp(escaped, "g"), "[REDACTED]");
      }
    }
    return sanitized;
  }

  /**
   * Broadcasts log line to Redis Pub/Sub channel and appends to historical list with 24h TTL.
   */
  public async log(
    serviceId: string,
    level: "INFO" | "WARN" | "ERROR",
    message: string,
    secrets: string[] = []
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const cleanMessage = this.redact(message, secrets);
    const logEntry = JSON.stringify({
      timestamp,
      level,
      message: cleanMessage,
    });

    if (this.redis) {
      try {
        const channel = `fn:logs:${serviceId}`;
        const historyKey = `fn:logs:history:${serviceId}`;
        await this.redis.publish(channel, logEntry);
        await this.redis.rpush(historyKey, logEntry);
        // Trim to last 1000 lines to prevent memory bloat
        await this.redis.ltrim(historyKey, -1000, -1);
        await this.redis.expire(historyKey, 86400); // 24 hours
      } catch (err: any) {
        process.stderr.write(`[FunctionLogger] Failed to write log to Redis: ${err.message}\n`);
      }
    } else {
      process.stdout.write(`[${timestamp}] [${level}] [${serviceId}] ${cleanMessage}\n`);
    }
  }
}
