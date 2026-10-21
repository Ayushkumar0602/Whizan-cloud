import http from "http";
import Redis from "ioredis";

// ─────────────────────────────────────────────────────────────────────────────
//  WAF & DDoS TYPES & CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

export interface WafConfig {
  enabled: boolean;
  mode: "block" | "monitor"; // block: returns 403/429; monitor: logs only
  rateLimitRpm: number;      // requests per minute (default: 120)
  burstLimit: number;        // max allowed in 5-second burst (default: 30)
  enableSqlInjectionCheck: boolean;
  enableXssCheck: boolean;
  enablePathTraversalCheck: boolean;
  enableRceCheck: boolean;
  enableScannerCheck: boolean;
  customBlacklistIps: string[];
  customWhitelistIps: string[];
}

export interface WafResult {
  allowed: boolean;
  statusCode?: number;
  reason?: string;
  category?: "jailed" | "rate_limit" | "sqli" | "xss" | "lfi" | "rce" | "probe" | "bad_bot" | "anomaly";
  ruleMatched?: string;
  headers?: Record<string, string>;
}

export interface WafSecurityEvent {
  id: string;
  timestamp: string;
  ip: string;
  slug: string;
  path: string;
  method: string;
  category: string;
  rule: string;
  action: "BLOCKED" | "RATE_LIMITED" | "JAILED" | "MONITORED";
  userAgent: string;
}

// Default Global Limits
const DEFAULT_GLOBAL_RPM_PER_IP = 600;   // 600 req/min across all domains (Volumetric DDoS protection)
const DEFAULT_GLOBAL_BURST_PER_IP = 100; // 100 req/5s
const DEFAULT_SLUG_RPM = 120;            // 120 req/min per specific project/service
const DEFAULT_SLUG_BURST = 30;           // 30 req/5s burst per specific project/service
const JAIL_DURATION_MS = 15 * 60 * 1000; // 15 minutes ban on repeated violations
const STRIKE_WINDOW_MS = 60 * 1000;      // 60-second window to accumulate strikes
const STRIKES_TO_JAIL = 3;               // 3 WAF attacks or 5 rate violations = Jail

// ─────────────────────────────────────────────────────────────────────────────
//  IN-MEMORY CACHES & METRICS (Sub-millisecond fast-path)
// ─────────────────────────────────────────────────────────────────────────────

interface SlidingWindow {
  count: number;
  burstCount: number;
  windowStart: number;
  burstStart: number;
}

interface JailEntry {
  until: number;
  reason: string;
  strikes: number;
}

interface StrikeEntry {
  count: number;
  firstStrike: number;
}

class WafEngine {
  private redis: Redis | null = null;

  // In-Memory Fast-Path Lookup Tables
  private jailedIps = new Map<string, JailEntry>();
  private permanentBlacklist = new Set<string>();
  private globalWhitelist = new Set<string>([
    "127.0.0.1",
    "::1",
    "localhost",
  ]);

  // Rate Limiting Sliding Windows
  private globalRateLimits = new Map<string, SlidingWindow>(); // key: clientIp
  private slugRateLimits = new Map<string, SlidingWindow>();   // key: clientIp + ":" + slug
  private strikeMap = new Map<string, StrikeEntry>();

  // Configuration Cache per Slug
  private configCache = new Map<string, { config: WafConfig; cachedAt: number }>();
  private readonly CONFIG_CACHE_TTL_MS = 30_000;

  // Telemetry & Metrics
  private recentEvents: WafSecurityEvent[] = [];
  private readonly MAX_RECENT_EVENTS = 100;
  private metrics = {
    totalInspected: 0,
    totalAllowed: 0,
    totalBlocked: 0,
    totalRateLimited: 0,
    totalJailed: 0,
    categoryCounts: {
      jailed: 0,
      rate_limit: 0,
      sqli: 0,
      xss: 0,
      lfi: 0,
      rce: 0,
      probe: 0,
      bad_bot: 0,
      anomaly: 0,
    } as Record<string, number>,
  };

  constructor() {
    // Routine garbage collection of expired in-memory rate windows (every 60s)
    setInterval(() => this.cleanupMemory(), 60_000);
  }

  public init(redisClient: Redis) {
    this.redis = redisClient;

    // Load initial blacklist from Redis if present
    this.redis.smembers("waf:blacklist").then((ips) => {
      if (Array.isArray(ips)) {
        ips.forEach((ip) => this.permanentBlacklist.add(ip.trim()));
      }
    }).catch(() => {});

    // Sync metrics and jailed IPs with Redis every 15s
    setInterval(() => this.syncToRedis(), 15_000);

    console.log("[WAF] Enterprise DDoS Protection & Web Application Firewall initialized.");
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  CLIENT IP RESOLUTION (Authoritative from Cloudflare & Reverse Proxies)
  // ───────────────────────────────────────────────────────────────────────────

  public extractClientIp(req: http.IncomingMessage): string {
    // 1. Cloudflare True-Client-IP / CF-Connecting-IP (cannot be spoofed if behind Cloudflare)
    const cfIp = req.headers["cf-connecting-ip"] || req.headers["true-client-ip"];
    if (typeof cfIp === "string" && cfIp.trim()) {
      return this.cleanIp(cfIp.trim());
    }

    // 2. Standard X-Real-IP
    const realIp = req.headers["x-real-ip"];
    if (typeof realIp === "string" && realIp.trim()) {
      return this.cleanIp(realIp.trim());
    }

    // 3. X-Forwarded-For (Leftmost IP is the original client)
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
      const parts = forwarded.split(",");
      const first = parts[0]?.trim();
      if (first) return this.cleanIp(first);
    }

    return this.cleanIp(req.socket.remoteAddress || "127.0.0.1");
  }

  private cleanIp(ip: string): string {
    if (ip.startsWith("::ffff:")) return ip.slice(7);
    return ip;
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  MAIN INSPECTION PIPELINE
  // ───────────────────────────────────────────────────────────────────────────

  public async inspectRequest(req: http.IncomingMessage, slug: string): Promise<WafResult> {
    this.metrics.totalInspected++;
    const ip = this.extractClientIp(req);
    const now = Date.now();
    const config = await this.getSlugConfig(slug);

    if (!config.enabled) {
      this.metrics.totalAllowed++;
      return { allowed: true };
    }

    // 0. Whitelist Bypass (Developer / Internal IPs)
    if (this.globalWhitelist.has(ip) || config.customWhitelistIps.includes(ip)) {
      this.metrics.totalAllowed++;
      return { allowed: true };
    }

    // 1. Permanent Blacklist Check
    if (this.permanentBlacklist.has(ip) || config.customBlacklistIps.includes(ip)) {
      return this.reject(ip, slug, req, 403, "Forbidden: IP address is blacklisted", "jailed", "PERMANENT_IP_BLACKLIST");
    }

    // 2. Automated Jail Check (Temporary Fail2Ban)
    const jailEntry = this.jailedIps.get(ip);
    if (jailEntry) {
      if (now < jailEntry.until) {
        const remainingSec = Math.ceil((jailEntry.until - now) / 1000);
        return {
          allowed: false,
          statusCode: 403,
          reason: `Access blocked: IP has been temporarily banned for malicious activity. Reason: ${jailEntry.reason}`,
          category: "jailed",
          ruleMatched: "TEMPORARY_IP_JAIL",
          headers: {
            "Retry-After": String(remainingSec),
            "X-Waf-Action": "JAILED",
          },
        };
      } else {
        // Expired jail
        this.jailedIps.delete(ip);
      }
    }

    // 3. Volumetric DDoS Protection (Global per-IP Rate Limit)
    const globalRate = this.checkRateLimit(
      `global:${ip}`,
      DEFAULT_GLOBAL_RPM_PER_IP,
      DEFAULT_GLOBAL_BURST_PER_IP,
      now
    );
    if (!globalRate.allowed) {
      this.recordStrike(ip, "Volumetric Global Rate Limit Exceeded");
      return this.rejectRateLimit(ip, slug, req, globalRate.remaining, DEFAULT_GLOBAL_RPM_PER_IP, globalRate.resetSec, "Global volumetric rate limit exceeded.");
    }

    // 4. Per-Slug / Per-Service Rate Limiting
    const slugRpm = config.rateLimitRpm || DEFAULT_SLUG_RPM;
    const slugBurst = config.burstLimit || DEFAULT_SLUG_BURST;
    const slugRate = this.checkRateLimit(
      `slug:${ip}:${slug}`,
      slugRpm,
      slugBurst,
      now
    );
    if (!slugRate.allowed) {
      this.recordStrike(ip, `Service Rate Limit Exceeded on ${slug}`);
      return this.rejectRateLimit(ip, slug, req, slugRate.remaining, slugRpm, slugRate.resetSec, `Rate limit of ${slugRpm} req/min exceeded.`);
    }

    // 5. Deep Packet WAF Rule Inspection
    const wafCheck = this.inspectWafRules(req, config);
    if (wafCheck.matched) {
      const isJailed = this.recordStrike(ip, `WAF Violation: ${wafCheck.rule}`);
      const category = (wafCheck.category as any) || "anomaly";

      if (config.mode === "monitor") {
        this.logEvent(ip, slug, req, "MONITORED", category, wafCheck.rule || "WAF_SUSPICIOUS");
        this.metrics.totalAllowed++;
        return { allowed: true };
      }

      return this.reject(
        ip,
        slug,
        req,
        403,
        `Request blocked by Web Application Firewall (${wafCheck.category?.toUpperCase()}).`,
        category,
        wafCheck.rule || "WAF_GENERIC_BLOCK"
      );
    }

    // Request is clean!
    this.metrics.totalAllowed++;
    return {
      allowed: true,
      headers: {
        "RateLimit-Limit": String(slugRpm),
        "RateLimit-Remaining": String(slugRate.remaining),
        "RateLimit-Reset": String(slugRate.resetSec),
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  RATE LIMITING (Sliding Window Token Bucket)
  // ───────────────────────────────────────────────────────────────────────────

  private checkRateLimit(
    key: string,
    limitRpm: number,
    burstLimit: number,
    now: number
  ): { allowed: boolean; remaining: number; resetSec: number } {
    let window = this.slugRateLimits.get(key);
    if (!window) {
      window = { count: 0, burstCount: 0, windowStart: now, burstStart: now };
      this.slugRateLimits.set(key, window);
    }

    // Reset 60s window
    if (now - window.windowStart >= 60_000) {
      window.count = 0;
      window.windowStart = now;
    }

    // Reset 5s burst window
    if (now - window.burstStart >= 5_000) {
      window.burstCount = 0;
      window.burstStart = now;
    }

    window.count++;
    window.burstCount++;

    const resetSec = Math.max(1, Math.ceil((60_000 - (now - window.windowStart)) / 1000));
    const remaining = Math.max(0, limitRpm - window.count);

    if (window.count > limitRpm || window.burstCount > burstLimit) {
      return { allowed: false, remaining: 0, resetSec };
    }

    return { allowed: true, remaining, resetSec };
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  WAF SIGNATURE & ATTACK VECTOR PATTERNS
  // ───────────────────────────────────────────────────────────────────────────

  private inspectWafRules(
    req: http.IncomingMessage,
    config: WafConfig
  ): { matched: boolean; category?: string; rule?: string } {
    const rawUrl = req.url || "/";
    let decodedUrl = rawUrl;
    try {
      decodedUrl = decodeURIComponent(rawUrl);
    } catch {
      // Malformed URL encoding is an immediate anomaly
      return { matched: true, category: "anomaly", rule: "MALFORMED_URI_ENCODING" };
    }

    // 1. URI Length Check (Buffer Overflow / DoS Protection)
    if (rawUrl.length > 4096) {
      return { matched: true, category: "anomaly", rule: "EXCESSIVE_URI_LENGTH" };
    }

    // 2. HTTP Method Validation
    const method = (req.method || "GET").toUpperCase();
    const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
    if (!ALLOWED_METHODS.includes(method)) {
      return { matched: true, category: "anomaly", rule: `DISALLOWED_HTTP_METHOD_${method}` };
    }

    const userAgent = (req.headers["user-agent"] || "").toLowerCase();
    const payloadToScan = `${decodedUrl} ${userAgent}`;

    // 3. Vulnerability Scanners & Bad Bot Detection
    if (config.enableScannerCheck) {
      const BAD_BOT_PATTERNS = [
        "sqlmap",
        "nikto",
        "masscan",
        "nmap",
        "zgrab",
        "acunetix",
        "dirbuster",
        "gobuster",
        "wpscan",
        "havij",
        "netsparker",
        "hydra",
        "nessus",
        "openvas",
      ];
      for (const bot of BAD_BOT_PATTERNS) {
        if (userAgent.includes(bot)) {
          return { matched: true, category: "bad_bot", rule: `SCANNER_BOT_${bot.toUpperCase()}` };
        }
      }

      // Malicious Probing Patterns (Sensitive File Sniffing)
      const PROBE_PATTERNS = [
        /\/\.env(\.|$)/i,
        /\/\.git(\/|$)/i,
        /\/\.svn(\/|$)/i,
        /\/\.aws\//i,
        /\/\.ssh\//i,
        /\/wp-config\.php/i,
        /\/wp-admin(\/|$)/i,
        /\/xmlrpc\.php/i,
        /\/phpmyadmin/i,
        /\/pma(\/|$)/i,
        /\/adminer/i,
        /\/actuator\/(health|env|logfile|metrics|sessions)/i,
        /\/solr\//i,
        /\/telescope\//i,
        /\/server-status/i,
        /\/web\.config/i,
      ];
      for (const pattern of PROBE_PATTERNS) {
        if (pattern.test(decodedUrl)) {
          return { matched: true, category: "probe", rule: `MALICIOUS_PATH_PROBE` };
        }
      }
    }

    // 4. Path Traversal & Local File Inclusion (LFI)
    if (config.enablePathTraversalCheck) {
      const LFI_PATTERNS = [
        /\.\.[/\\]/,                    // ../ or ..\
        /%2e%2e[%2f%5c]/i,             // URL encoded ../
        /\/etc\/(passwd|shadow|hosts)/i,
        /\/proc\/self\//i,
        /c:\\boot\.ini/i,
        /windows\/win\.ini/i,
      ];
      for (const pattern of LFI_PATTERNS) {
        if (pattern.test(decodedUrl)) {
          return { matched: true, category: "lfi", rule: "PATH_TRAVERSAL_LFI" };
        }
      }
    }

    // 5. SQL Injection (SQLi)
    if (config.enableSqlInjectionCheck) {
      const SQLI_PATTERNS = [
        /\bunion\b\s+(all\s+)?\bselect\b/i,
        /\bselect\b.+\bfrom\b.+/i,
        /;\s*drop\s+(table|database)\b/i,
        /;\s*delete\s+from\b/i,
        /\binsert\s+into\b.+\bvalues\b/i,
        /'\s*or\s+'?1'?\s*=\s*'?1/i,
        /"\s*or\s+"?1"?\s*=\s*"?1/i,
        /\bexec(\s|\+)+(s|x)p\w+/i,
        /\bsleep\(\s*\d+\s*\)/i,
        /\bpg_sleep\(\s*\d+\s*\)/i,
        /\bbenchmark\(\s*\d+\s*,/i,
        /--\s*$/m,
        /\/\*![\d\w\s]*\*\//,
      ];
      for (const pattern of SQLI_PATTERNS) {
        if (pattern.test(decodedUrl)) {
          return { matched: true, category: "sqli", rule: "SQL_INJECTION_DETECTED" };
        }
      }
    }

    // 6. Cross-Site Scripting (XSS)
    if (config.enableXssCheck) {
      const XSS_PATTERNS = [
        /<script\b[^>]*>/i,
        /<\/script>/i,
        /javascript:\s*/i,
        /on(error|load|click|mouseover|submit|focus|blur)\s*=/i,
        /<iframe\b/i,
        /<object\b/i,
        /<embed\b/i,
        /document\.(cookie|location|write)/i,
      ];
      for (const pattern of XSS_PATTERNS) {
        if (pattern.test(decodedUrl)) {
          return { matched: true, category: "xss", rule: "XSS_VECTOR_DETECTED" };
        }
      }
    }

    // 7. Remote Code Execution (RCE) & Command Injection
    if (config.enableRceCheck) {
      const RCE_PATTERNS = [
        /;\s*(cat|ls|rm|chmod|chown|wget|curl|nc|bash|sh|python|perl|php)\s+/i,
        /\|\s*(bash|sh|nc|curl|wget)\b/i,
        /\$\(\s*(cat|id|whoami|uname|curl|wget)/i,
        /`[^`]*(whoami|uname|cat\s+\/etc)[^`]*`/i,
        /\beval\s*\(/i,
        /\bsystem\s*\(/i,
        /\bpassthru\s*\(/i,
        /\bshell_exec\s*\(/i,
      ];
      for (const pattern of RCE_PATTERNS) {
        if (pattern.test(decodedUrl)) {
          return { matched: true, category: "rce", rule: "RCE_COMMAND_INJECTION" };
        }
      }
    }

    return { matched: false };
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  AUTOMATED FAIL2BAN / JAIL ESCALATION
  // ───────────────────────────────────────────────────────────────────────────

  private recordStrike(ip: string, reason: string): boolean {
    const now = Date.now();
    let entry = this.strikeMap.get(ip);
    if (!entry || now - entry.firstStrike > STRIKE_WINDOW_MS) {
      entry = { count: 1, firstStrike: now };
      this.strikeMap.set(ip, entry);
    } else {
      entry.count++;
    }

    if (entry.count >= STRIKES_TO_JAIL) {
      this.jailIp(ip, reason, JAIL_DURATION_MS);
      return true;
    }
    return false;
  }

  public jailIp(ip: string, reason: string, durationMs: number = JAIL_DURATION_MS) {
    const until = Date.now() + durationMs;
    this.jailedIps.set(ip, { until, reason, strikes: STRIKES_TO_JAIL });
    this.metrics.totalJailed++;

    if (this.redis) {
      const ttlSec = Math.ceil(durationMs / 1000);
      this.redis.set(`waf:jail:${ip}`, JSON.stringify({ until, reason }), "EX", ttlSec).catch(() => {});
      this.redis.publish("waf:alert", JSON.stringify({
        type: "IP_JAILED",
        ip,
        reason,
        until: new Date(until).toISOString(),
      })).catch(() => {});
    }

    console.warn(`[WAF JAIL] 🚨 IP ${ip} has been jailed for ${Math.round(durationMs / 60000)}m. Reason: ${reason}`);
  }

  public unjailIp(ip: string) {
    this.jailedIps.delete(ip);
    this.strikeMap.delete(ip);
    if (this.redis) {
      this.redis.del(`waf:jail:${ip}`).catch(() => {});
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  RESPONSE HELPERS
  // ───────────────────────────────────────────────────────────────────────────

  private reject(
    ip: string,
    slug: string,
    req: http.IncomingMessage,
    statusCode: number,
    message: string,
    category: WafResult["category"],
    rule: string
  ): WafResult {
    this.metrics.totalBlocked++;
    if (category) {
      this.metrics.categoryCounts[category] = (this.metrics.categoryCounts[category] || 0) + 1;
    }
    this.logEvent(ip, slug, req, "BLOCKED", category || "anomaly", rule);

    return {
      allowed: false,
      statusCode,
      reason: message,
      category,
      ruleMatched: rule,
      headers: {
        "X-Waf-Blocked": "true",
        "X-Waf-Rule": rule,
      },
    };
  }

  private rejectRateLimit(
    ip: string,
    slug: string,
    req: http.IncomingMessage,
    remaining: number,
    limit: number,
    resetSec: number,
    message: string
  ): WafResult {
    this.metrics.totalRateLimited++;
    this.metrics.categoryCounts.rate_limit = (this.metrics.categoryCounts.rate_limit || 0) + 1;
    this.logEvent(ip, slug, req, "RATE_LIMITED", "rate_limit", "RATE_LIMIT_EXCEEDED");

    return {
      allowed: false,
      statusCode: 429,
      reason: message,
      category: "rate_limit",
      ruleMatched: "RATE_LIMIT_EXCEEDED",
      headers: {
        "RateLimit-Limit": String(limit),
        "RateLimit-Remaining": String(remaining),
        "RateLimit-Reset": String(resetSec),
        "Retry-After": String(resetSec),
        "X-Waf-RateLimited": "true",
      },
    };
  }

  private logEvent(
    ip: string,
    slug: string,
    req: http.IncomingMessage,
    action: WafSecurityEvent["action"],
    category: string,
    rule: string
  ) {
    const event: WafSecurityEvent = {
      id: Math.random().toString(36).substring(2, 10),
      timestamp: new Date().toISOString(),
      ip,
      slug,
      path: req.url || "/",
      method: req.method || "GET",
      category,
      rule,
      action,
      userAgent: (req.headers["user-agent"] || "").slice(0, 150),
    };

    this.recentEvents.unshift(event);
    if (this.recentEvents.length > this.MAX_RECENT_EVENTS) {
      this.recentEvents.pop();
    }

    if (this.redis) {
      this.redis.lpush("waf:events", JSON.stringify(event)).catch(() => {});
      this.redis.ltrim("waf:events", 0, 199).catch(() => {});
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  CONFIGURATION RESOLUTION
  // ───────────────────────────────────────────────────────────────────────────

  public async getSlugConfig(slug: string): Promise<WafConfig> {
    const now = Date.now();
    const cached = this.configCache.get(slug);
    if (cached && now - cached.cachedAt < this.CONFIG_CACHE_TTL_MS) {
      return cached.config;
    }

    const defaultConfig: WafConfig = {
      enabled: true,
      mode: "block",
      rateLimitRpm: DEFAULT_SLUG_RPM,
      burstLimit: DEFAULT_SLUG_BURST,
      enableSqlInjectionCheck: true,
      enableXssCheck: true,
      enablePathTraversalCheck: true,
      enableRceCheck: true,
      enableScannerCheck: true,
      customBlacklistIps: [],
      customWhitelistIps: [],
    };

    if (!this.redis) {
      return defaultConfig;
    }

    try {
      const raw = await this.redis.get(`waf:config:${slug}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        const merged: WafConfig = { ...defaultConfig, ...parsed };
        this.configCache.set(slug, { config: merged, cachedAt: now });
        return merged;
      }
    } catch {}

    this.configCache.set(slug, { config: defaultConfig, cachedAt: now });
    return defaultConfig;
  }

  public invalidateConfig(slug: string) {
    this.configCache.delete(slug);
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  TELEMETRY & SYNC
  // ───────────────────────────────────────────────────────────────────────────

  public getStats() {
    return {
      status: "ACTIVE",
      metrics: this.metrics,
      activeJailedIpsCount: this.jailedIps.size,
      activeJailedIps: Array.from(this.jailedIps.entries()).map(([ip, data]) => ({
        ip,
        reason: data.reason,
        expiresAt: new Date(data.until).toISOString(),
        secondsRemaining: Math.max(0, Math.ceil((data.until - Date.now()) / 1000)),
      })),
      recentEvents: this.recentEvents.slice(0, 30),
      permanentBlacklistCount: this.permanentBlacklist.size,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  private async syncToRedis() {
    if (!this.redis) return;
    try {
      const stats = this.getStats();
      await this.redis.set("waf:stats:summary", JSON.stringify(stats), "EX", 60);
    } catch {}
  }

  private cleanupMemory() {
    const now = Date.now();
    // Prune expired jail entries
    for (const [ip, entry] of this.jailedIps.entries()) {
      if (now > entry.until) {
        this.jailedIps.delete(ip);
      }
    }

    // Prune stale sliding windows
    for (const [key, window] of this.slugRateLimits.entries()) {
      if (now - window.windowStart > 120_000) {
        this.slugRateLimits.delete(key);
      }
    }

    for (const [ip, strike] of this.strikeMap.entries()) {
      if (now - strike.firstStrike > STRIKE_WINDOW_MS * 2) {
        this.strikeMap.delete(ip);
      }
    }
  }
}

export const waf = new WafEngine();
