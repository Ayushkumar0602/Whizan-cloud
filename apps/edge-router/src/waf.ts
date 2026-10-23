import http from "http";
import crypto from "crypto";
import Redis from "ioredis";

// ─────────────────────────────────────────────────────────────────────────────
//  WAF & DDoS TYPES & CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

export interface WafConfig {
  enabled: boolean;
  mode: "block" | "monitor"; // block: returns 403/429; monitor: logs only
  rateLimitRpm: number;      // requests per minute (default: 300)
  burstLimit: number;        // max allowed in 5-second burst (default: 100)
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
  clientType?: string;
  path: string;
  method: string;
  category: string;
  rule: string;
  action: "BLOCKED" | "RATE_LIMITED" | "JAILED" | "MONITORED";
  userAgent: string;
}

export interface DeviceSignature {
  deviceHash: string;
  clientType: "mobile" | "browser" | "cli_tool" | "scanner" | "unknown";
  userAgent: string;
}

// Limits & Safeguards
const DEFAULT_GLOBAL_RPM_PER_IP = 1500;  // 1500 req/min across all domains (Volumetric DDoS protection)
const DEFAULT_GLOBAL_BURST_PER_IP = 250; // 250 req/5s
const DEFAULT_SLUG_RPM = 300;            // 300 req/min per specific project/service
const DEFAULT_SLUG_BURST = 100;          // 100 req/5s burst (generous for SPA asset loading)
const JAIL_DURATION_MS = 15 * 60 * 1000; // 15 minutes ban on repeated violations
const STRIKE_WINDOW_MS = 60 * 1000;      // 60-second window to accumulate strikes
const STRIKES_TO_JAIL_DEVICE = 3;        // 3 WAF attacks from device on slug = Jail device on slug
const STRIKES_TO_JAIL_SLUG_IP = 10;      // 10 WAF attacks across IP on same slug = Jail IP on slug

// Memory Safeguard Bounds (Prevents V8 Heap Exhaustion under DDoS)
const MAX_SLIDING_WINDOWS = 50_000;
const MAX_STRIKES_ENTRIES = 20_000;
const MAX_CONFIG_CACHE_ENTRIES = 5_000;

// ─────────────────────────────────────────────────────────────────────────────
//  IN-MEMORY CACHES & METRICS (Sub-millisecond fast-path)
// ─────────────────────────────────────────────────────────────────────────────

interface SlidingWindow {
  count: number;
  burstCount: number;
  windowStart: number;
  burstStart: number;
}

export interface JailEntry {
  until: number;
  reason: string;
  strikes: number;
  slug: string;        // Deployment slug or "*" for global ban
  ip: string;
  deviceHash?: string; // Specific device signature if device-scoped
  clientType?: string;
  jailedAt: string;
}

interface StrikeEntry {
  count: number;
  firstStrike: number;
}

class WafEngine {
  private redis: Redis | null = null;
  private subRedis: Redis | null = null;

  // In-Memory Fast-Path Lookup Tables
  private jailedEntries = new Map<string, JailEntry>();
  private permanentBlacklist = new Set<string>();
  private globalWhitelist = new Set<string>([
    "127.0.0.1",
    "::1",
    "localhost",
  ]);

  // Rate Limiting Sliding Windows
  private slidingWindows = new Map<string, SlidingWindow>();
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

  public async init(redisClient: Redis) {
    this.redis = redisClient;

    // Attach error handler to prevent unhandled error crashes
    this.redis.on("error", (err) => {
      console.warn("[WAF] Redis client warning:", err?.message || err);
    });

    // 1. Load permanent blacklist from Redis if present
    this.redis.smembers("waf:blacklist").then((ips) => {
      if (Array.isArray(ips)) {
        ips.forEach((ip) => this.permanentBlacklist.add(ip.trim()));
      }
    }).catch(() => {});

    // 2. Hydrate active jails from Redis
    try {
      const jailKeys = await this.redis.keys("waf:jail:*");
      const now = Date.now();
      for (const k of jailKeys) {
        const raw = await this.redis.get(k);
        if (raw) {
          try {
            const data = JSON.parse(raw);
            if (data.until && data.until > now) {
              const jailKey = k.replace(/^waf:jail:/, "");
              this.jailedEntries.set(jailKey, {
                until: data.until,
                reason: data.reason || "Malicious activity",
                strikes: data.strikes || 3,
                slug: data.slug || "*",
                ip: data.ip || "unknown",
                deviceHash: data.deviceHash,
                clientType: data.clientType,
                jailedAt: data.jailedAt || new Date().toISOString(),
              });
            }
          } catch {}
        }
      }
      console.log(`[WAF] Hydrated ${this.jailedEntries.size} active jail entries from Redis.`);
    } catch {}

    // 3. Set up Redis Pub/Sub with dedicated error handling
    try {
      this.subRedis = this.redis.duplicate();
      this.subRedis.on("error", (err) => {
        console.warn("[WAF] Redis Pub/Sub subscriber warning:", err?.message || err);
      });
      this.subRedis.subscribe("waf:alert", "waf:unjail", (err) => {
        if (err) console.error("[WAF] Failed to subscribe to Redis security channels", err);
      });
      this.subRedis.on("message", (channel, message) => {
        try {
          const data = JSON.parse(message);
          if (channel === "waf:unjail") {
            if (data.global && data.ip) {
              this.unjailAll(data.ip);
            } else if (data.slug && data.ip) {
              this.unjail(data.slug, data.ip);
            }
          } else if (channel === "waf:alert") {
            if (data.slug && data.ip && data.until) {
              const jailKey = data.deviceHash ? `${data.slug}:${data.ip}:${data.deviceHash}` : `${data.slug}:${data.ip}`;
              this.jailedEntries.set(jailKey, {
                until: new Date(data.until).getTime(),
                reason: data.reason || "Security restriction",
                strikes: 3,
                slug: data.slug,
                ip: data.ip,
                deviceHash: data.deviceHash,
                clientType: data.clientType,
                jailedAt: new Date().toISOString(),
              });
            }
          }
        } catch {}
      });
    } catch {}

    // Sync metrics and jailed entries with Redis every 15s
    setInterval(() => this.syncToRedis(), 15_000);

    console.log("[WAF] Enterprise DDoS Protection & Scoped Web Application Firewall initialized.");
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  CLIENT & DEVICE RESOLUTION (Anti-Spoofing & NAT-Aware)
  // ───────────────────────────────────────────────────────────────────────────

  public extractClientIp(req: http.IncomingMessage): string {
    const rawSocketIp = req.socket?.remoteAddress || "127.0.0.1";
    const socketIp = this.cleanIp(rawSocketIp);

    // 1. Cloudflare authoritative headers (Cloudflare sets cf-ray on all routed requests)
    const cfRay = req.headers["cf-ray"];
    const cfIp = req.headers["cf-connecting-ip"] || req.headers["true-client-ip"];
    if (cfRay && typeof cfIp === "string" && cfIp.trim()) {
      return this.cleanIp(cfIp.trim());
    }

    // 2. Trusted internal proxy / loopback / container network
    const isTrustedProxy =
      socketIp === "127.0.0.1" ||
      socketIp === "::1" ||
      socketIp.startsWith("10.") ||
      socketIp.startsWith("172.16.") ||
      socketIp.startsWith("172.17.") ||
      socketIp.startsWith("172.18.") ||
      socketIp.startsWith("172.19.") ||
      socketIp.startsWith("172.20.") ||
      socketIp.startsWith("172.21.") ||
      socketIp.startsWith("172.22.") ||
      socketIp.startsWith("172.23.") ||
      socketIp.startsWith("172.24.") ||
      socketIp.startsWith("172.25.") ||
      socketIp.startsWith("172.26.") ||
      socketIp.startsWith("172.27.") ||
      socketIp.startsWith("172.28.") ||
      socketIp.startsWith("172.29.") ||
      socketIp.startsWith("172.30.") ||
      socketIp.startsWith("172.31.") ||
      socketIp.startsWith("192.168.");

    if (isTrustedProxy) {
      if (typeof cfIp === "string" && cfIp.trim()) return this.cleanIp(cfIp.trim());

      const forwarded = req.headers["x-forwarded-for"];
      if (typeof forwarded === "string" && forwarded.trim()) {
        const parts = forwarded.split(",");
        const first = parts[0]?.trim();
        if (first) return this.cleanIp(first);
      }

      const realIp = req.headers["x-real-ip"];
      if (typeof realIp === "string" && realIp.trim()) {
        return this.cleanIp(realIp.trim());
      }
    }

    // 3. For any untrusted direct public TCP connection, NEVER trust client-supplied X-Forwarded-For!
    return socketIp;
  }

  private cleanIp(ip: string): string {
    if (ip.startsWith("::ffff:")) return ip.slice(7);
    return ip;
  }

  public normalizeDeviceHash(raw: string): string {
    if (!raw || !raw.trim()) return "no-ua";
    if (/^[a-f0-9]{16}$/i.test(raw)) return raw.toLowerCase();
    return crypto.createHash("sha256").update(raw.trim()).digest("hex").slice(0, 16);
  }

  public extractDeviceSignature(req: http.IncomingMessage): DeviceSignature {
    const ua = (req.headers["user-agent"] || "").trim();
    if (!ua) {
      return {
        deviceHash: "no-ua",
        clientType: "unknown",
        userAgent: "",
      };
    }

    const deviceHash = this.normalizeDeviceHash(ua);
    const lower = ua.toLowerCase();

    let clientType: DeviceSignature["clientType"] = "browser";
    if (lower.includes("mobile") || lower.includes("iphone") || lower.includes("android")) {
      clientType = "mobile";
    } else if (
      lower.includes("curl") ||
      lower.includes("wget") ||
      lower.includes("postman") ||
      lower.includes("httpie") ||
      lower.includes("python-requests")
    ) {
      clientType = "cli_tool";
    } else if (
      lower.includes("sqlmap") ||
      lower.includes("nikto") ||
      lower.includes("nmap") ||
      lower.includes("masscan")
    ) {
      clientType = "scanner";
    }

    return { deviceHash, clientType, userAgent: ua };
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  MAIN INSPECTION PIPELINE (Strict Per-Deployment Isolation)
  // ───────────────────────────────────────────────────────────────────────────

  public async inspectRequest(req: http.IncomingMessage, slug: string): Promise<WafResult> {
    this.metrics.totalInspected++;
    const ip = this.extractClientIp(req);
    const { deviceHash, clientType, userAgent } = this.extractDeviceSignature(req);
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

    // 2. Automated Jail Check (Strictly Hierarchical & Deployment-Scoped)
    const deviceJailKey = `${slug}:${ip}:${deviceHash}`;
    const slugIpJailKey = `${slug}:${ip}`;
    const globalJailKey = `*:${ip}`;

    const activeJail =
      this.checkAndPruneJail(deviceJailKey, now) ||
      this.checkAndPruneJail(slugIpJailKey, now) ||
      this.checkAndPruneJail(globalJailKey, now);

    if (activeJail) {
      const remainingSec = Math.ceil((activeJail.until - now) / 1000);
      return {
        allowed: false,
        statusCode: 403,
        reason: `Access blocked on ${slug}: Client has been temporarily restricted for suspicious activity. (${activeJail.reason})`,
        category: "jailed",
        ruleMatched: activeJail.deviceHash ? "DEPLOYMENT_DEVICE_JAIL" : "DEPLOYMENT_IP_JAIL",
        headers: {
          "Retry-After": String(remainingSec),
          "X-Waf-Action": "JAILED",
          "X-Waf-Target": slug,
        },
      };
    }

    // 3. Volumetric DDoS Protection (Global per-IP Rate Limit - prevents crashing edge router)
    const globalRate = this.checkRateLimit(
      `global:${ip}`,
      DEFAULT_GLOBAL_RPM_PER_IP,
      DEFAULT_GLOBAL_BURST_PER_IP,
      now
    );
    if (!globalRate.allowed) {
      this.recordGlobalStrike(ip, "Global Volumetric Flood Detected");
      return this.rejectRateLimit(
        ip,
        slug,
        req,
        globalRate.remaining,
        DEFAULT_GLOBAL_RPM_PER_IP,
        globalRate.resetSec,
        "Global network flood threshold exceeded."
      );
    }

    // 4. Per-Deployment Rate Limiting (With Static Asset Relaxation)
    const isStaticAsset = Boolean(
      req.url && /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|map|webp|avif)$/i.test(req.url.split("?")[0])
    );

    const baseSlugRpm = config.rateLimitRpm || DEFAULT_SLUG_RPM;
    const baseSlugBurst = config.burstLimit || DEFAULT_SLUG_BURST;

    // Static assets get a 3x burst multiplier to prevent modern SPA bundles from false-positive rate limiting
    const slugRpm = isStaticAsset ? baseSlugRpm * 3 : baseSlugRpm;
    const slugBurst = isStaticAsset ? baseSlugBurst * 3 : baseSlugBurst;

    // 4a. Per-Device on this deployment (isolates laptop from phone on same WiFi)
    const deviceRate = this.checkRateLimit(
      `rate:${slug}:${ip}:${deviceHash}`,
      slugRpm,
      slugBurst,
      now
    );
    if (!deviceRate.allowed) {
      this.recordStrike(slug, ip, deviceHash, clientType, `Device Rate Limit Exceeded on ${slug}`);
      return this.rejectRateLimit(
        ip,
        slug,
        req,
        deviceRate.remaining,
        slugRpm,
        deviceRate.resetSec,
        `Rate limit of ${slugRpm} req/min exceeded for this client on ${slug}.`
      );
    }

    // 4b. Aggregate IP on this deployment (protects against single-IP distributed bot tools)
    const aggregateIpRate = this.checkRateLimit(
      `rate:${slug}:${ip}`,
      slugRpm * 4,
      slugBurst * 4,
      now
    );
    if (!aggregateIpRate.allowed) {
      this.recordIpStrike(slug, ip, `Aggregate IP Rate Limit Exceeded on ${slug}`);
      return this.rejectRateLimit(
        ip,
        slug,
        req,
        aggregateIpRate.remaining,
        slugRpm * 4,
        aggregateIpRate.resetSec,
        `Total IP rate limit exceeded on ${slug}.`
      );
    }

    // 5. Deep Packet WAF Rule Inspection
    const wafCheck = this.inspectWafRules(req, config);
    if (wafCheck.matched) {
      // High-severity exploits and scanner bots record strikes towards Fail2Ban jail
      const severeCategories = ["sqli", "xss", "lfi", "rce", "bad_bot", "probe"];
      if (wafCheck.category && severeCategories.includes(wafCheck.category)) {
        this.recordStrike(
          slug,
          ip,
          deviceHash,
          clientType,
          `WAF Violation: ${wafCheck.rule}`
        );
      }

      const category = (wafCheck.category as any) || "anomaly";

      if (config.mode === "monitor") {
        this.logEvent(ip, slug, req, "MONITORED", category, wafCheck.rule || "WAF_SUSPICIOUS", clientType);
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
        "RateLimit-Limit": String(baseSlugRpm),
        "RateLimit-Remaining": String(deviceRate.remaining),
        "RateLimit-Reset": String(deviceRate.resetSec),
      },
    };
  }

  private checkAndPruneJail(key: string, now: number): JailEntry | null {
    const entry = this.jailedEntries.get(key);
    if (!entry) return null;
    if (now >= entry.until) {
      this.jailedEntries.delete(key);
      if (this.redis) {
        this.redis.del(`waf:jail:${key}`).catch(() => {});
      }
      return null;
    }
    return entry;
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  RATE LIMITING (Sliding Window Token Bucket with LRU Memory Protection)
  // ───────────────────────────────────────────────────────────────────────────

  private checkRateLimit(
    key: string,
    limitRpm: number,
    burstLimit: number,
    now: number
  ): { allowed: boolean; remaining: number; resetSec: number } {
    let window = this.slidingWindows.get(key);
    if (!window) {
      // Capped LRU-style eviction: If map exceeds MAX_SLIDING_WINDOWS, prune oldest 10%
      if (this.slidingWindows.size >= MAX_SLIDING_WINDOWS) {
        let purged = 0;
        for (const k of this.slidingWindows.keys()) {
          this.slidingWindows.delete(k);
          if (++purged >= 5000) break;
        }
      }
      window = { count: 0, burstCount: 0, windowStart: now, burstStart: now };
      this.slidingWindows.set(key, window);
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
  //  WAF SIGNATURE & ATTACK VECTOR PATTERNS (ReDoS-Safe)
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
      // Malformed percent-encoding is rejected gracefully as an anomaly (no strike penalty)
      return { matched: true, category: "anomaly", rule: "MALFORMED_URI_ENCODING" };
    }

    // Benign Health Check & Status Probes Bypass (Spring Boot Actuator, Kubernetes, Whizan probes)
    const cleanPath = decodedUrl.split("?")[0].toLowerCase();
    const isHealthProbe =
      cleanPath === "/health" ||
      cleanPath === "/healthz" ||
      cleanPath === "/livez" ||
      cleanPath === "/readyz" ||
      cleanPath === "/ping" ||
      cleanPath === "/actuator/health" ||
      cleanPath.startsWith("/actuator/health/") ||
      cleanPath === "/actuator/info";

    if (isHealthProbe) {
      return { matched: false };
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
        /\/actuator\/(env|logfile|sessions|heapdump|configprops|beans|mappings|threaddump)/i,
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

    // 5. SQL Injection (SQLi) — ReDoS-Bounded Patterns
    if (config.enableSqlInjectionCheck) {
      const SQLI_PATTERNS = [
        /\bunion\b\s+(all\s+)?\bselect\b/i,
        /\bselect\b[\s\S]{1,250}\bfrom\b/i, // Bounded search radius prevents regex backtracking
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
        /onerror\s*=/i,
        /onload\s*=/i,
        /onclick\s*=/i,
        /<iframe\b[^>]*>/i,
        /<svg\b[^>]*\bonload\b/i,
        /<img\b[^>]*\bonerror\b/i,
      ];
      for (const pattern of XSS_PATTERNS) {
        if (pattern.test(decodedUrl)) {
          return { matched: true, category: "xss", rule: "CROSS_SITE_SCRIPTING_XSS" };
        }
      }
    }

    // 7. Remote Code Execution (RCE)
    if (config.enableRceCheck) {
      const RCE_PATTERNS = [
        /;\s*(cat|ls|whoami|id|uname|curl|wget|nc|bash|sh|powershell|cmd)\b/i,
        /\|\s*(cat|ls|whoami|id|uname|curl|wget|nc|bash|sh)\b/i,
        /`[^`]*`/,
        /\$\([^\)]*\)/,
        /\bphpinfo\(\)/i,
        /\beval\s*\(/i,
        /\bpassthru\s*\(/i,
        /\bsystem\s*\(/i,
      ];
      for (const pattern of RCE_PATTERNS) {
        if (pattern.test(decodedUrl)) {
          return { matched: true, category: "rce", rule: "REMOTE_CODE_EXECUTION_RCE" };
        }
      }
    }

    return { matched: false };
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  AUTOMATED FAIL2BAN & STRIKE ESCALATION (Strict Deployment Isolation)
  // ───────────────────────────────────────────────────────────────────────────

  private recordStrike(
    slug: string,
    ip: string,
    deviceHash: string,
    clientType: string,
    reason: string
  ): boolean {
    const now = Date.now();
    const strikeKey = `${slug}:${ip}:${deviceHash}`;

    // Capped LRU safeguard
    if (this.strikeMap.size >= MAX_STRIKES_ENTRIES) {
      let purged = 0;
      for (const k of this.strikeMap.keys()) {
        this.strikeMap.delete(k);
        if (++purged >= 2000) break;
      }
    }

    let entry = this.strikeMap.get(strikeKey);
    if (!entry || now - entry.firstStrike > STRIKE_WINDOW_MS) {
      entry = { count: 1, firstStrike: now };
      this.strikeMap.set(strikeKey, entry);
    } else {
      entry.count++;
    }

    // 1. Check if device has reached threshold on this deployment
    if (entry.count >= STRIKES_TO_JAIL_DEVICE) {
      this.jailDevice(slug, ip, deviceHash, clientType, reason, JAIL_DURATION_MS);
      return true;
    }

    // 2. Also increment IP aggregate strikes on this deployment
    this.recordIpStrike(slug, ip, reason);

    return false;
  }

  private recordIpStrike(slug: string, ip: string, reason: string): boolean {
    const now = Date.now();
    const ipKey = `${slug}:${ip}`;

    let entry = this.strikeMap.get(ipKey);
    if (!entry || now - entry.firstStrike > STRIKE_WINDOW_MS * 2) {
      entry = { count: 1, firstStrike: now };
      this.strikeMap.set(ipKey, entry);
    } else {
      entry.count++;
    }

    // If an attacker is rotating user-agents on the same IP against the same slug
    if (entry.count >= STRIKES_TO_JAIL_SLUG_IP) {
      this.jailIpOnSlug(slug, ip, `Excessive aggregate attacks on ${slug}`, JAIL_DURATION_MS);
      return true;
    }

    return false;
  }

  private recordGlobalStrike(ip: string, reason: string): boolean {
    const now = Date.now();
    const globalKey = `global:${ip}`;

    let entry = this.strikeMap.get(globalKey);
    if (!entry || now - entry.firstStrike > STRIKE_WINDOW_MS) {
      entry = { count: 1, firstStrike: now };
      this.strikeMap.set(globalKey, entry);
    } else {
      entry.count++;
    }

    if (entry.count >= 20) {
      this.jailGlobalIp(ip, reason, JAIL_DURATION_MS);
      return true;
    }
    return false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  JAIL ACTIONS (Scoped to Deployment / Device)
  // ───────────────────────────────────────────────────────────────────────────

  public jailDevice(
    slug: string,
    ip: string,
    deviceOrUa: string,
    clientType: string = "browser",
    reason: string = "Repeated Malicious Attacks",
    durationMs: number = JAIL_DURATION_MS
  ) {
    const until = Date.now() + durationMs;
    const deviceHash = this.normalizeDeviceHash(deviceOrUa);
    const jailKey = `${slug}:${ip}:${deviceHash}`;

    const entry: JailEntry = {
      until,
      reason,
      strikes: STRIKES_TO_JAIL_DEVICE,
      slug,
      ip,
      deviceHash,
      clientType,
      jailedAt: new Date().toISOString(),
    };

    this.jailedEntries.set(jailKey, entry);
    this.metrics.totalJailed++;

    if (this.redis) {
      const ttlSec = Math.ceil(durationMs / 1000);
      this.redis.set(`waf:jail:${jailKey}`, JSON.stringify(entry), "EX", ttlSec).catch(() => {});
      this.redis.publish("waf:alert", JSON.stringify({
        type: "DEVICE_JAILED",
        slug,
        ip,
        deviceHash,
        clientType,
        reason,
        until: new Date(until).toISOString(),
      })).catch(() => {});
    }

    console.warn(`[WAF JAIL] 🚨 Device [${clientType}:${deviceHash}] on IP ${ip} jailed on deployment '${slug}' for ${Math.round(durationMs / 60000)}m. Reason: ${reason}`);
  }

  public jailIpOnSlug(
    slug: string,
    ip: string,
    reason: string = "Excessive Deployment Attacks",
    durationMs: number = JAIL_DURATION_MS
  ) {
    const until = Date.now() + durationMs;
    const jailKey = `${slug}:${ip}`;

    const entry: JailEntry = {
      until,
      reason,
      strikes: STRIKES_TO_JAIL_SLUG_IP,
      slug,
      ip,
      jailedAt: new Date().toISOString(),
    };

    this.jailedEntries.set(jailKey, entry);
    this.metrics.totalJailed++;

    if (this.redis) {
      const ttlSec = Math.ceil(durationMs / 1000);
      this.redis.set(`waf:jail:${jailKey}`, JSON.stringify(entry), "EX", ttlSec).catch(() => {});
      this.redis.publish("waf:alert", JSON.stringify({
        type: "SLUG_IP_JAILED",
        slug,
        ip,
        reason,
        until: new Date(until).toISOString(),
      })).catch(() => {});
    }

    console.warn(`[WAF JAIL] 🚨 IP ${ip} jailed on deployment '${slug}' for ${Math.round(durationMs / 60000)}m. Other deployments remain accessible. Reason: ${reason}`);
  }

  public jailGlobalIp(
    ip: string,
    reason: string = "Global Volumetric DDoS Attack",
    durationMs: number = JAIL_DURATION_MS
  ) {
    const until = Date.now() + durationMs;
    const jailKey = `*:${ip}`;

    const entry: JailEntry = {
      until,
      reason,
      strikes: 20,
      slug: "*",
      ip,
      jailedAt: new Date().toISOString(),
    };

    this.jailedEntries.set(jailKey, entry);
    this.metrics.totalJailed++;

    if (this.redis) {
      const ttlSec = Math.ceil(durationMs / 1000);
      this.redis.set(`waf:jail:${jailKey}`, JSON.stringify(entry), "EX", ttlSec).catch(() => {});
    }

    console.warn(`[WAF JAIL] 🚨 IP ${ip} globally jailed for platform protection. Reason: ${reason}`);
  }

  // Backwards compatibility helper
  public jailIp(ip: string, reason: string, durationMs: number = JAIL_DURATION_MS) {
    this.jailGlobalIp(ip, reason, durationMs);
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  UNJAIL METHODS
  // ───────────────────────────────────────────────────────────────────────────

  public async unjail(slug: string, ip: string, deviceOrUa?: string) {
    if (deviceOrUa) {
      const deviceHash = this.normalizeDeviceHash(deviceOrUa);
      const key = `${slug}:${ip}:${deviceHash}`;
      this.jailedEntries.delete(key);
      this.strikeMap.delete(key);
      if (this.redis) await this.redis.del(`waf:jail:${key}`).catch(() => {});
    } else {
      // Unjail this IP for this slug (both device-specific and IP-wide on this slug)
      for (const k of Array.from(this.jailedEntries.keys())) {
        if (k === `${slug}:${ip}` || k.startsWith(`${slug}:${ip}:`)) {
          this.jailedEntries.delete(k);
          if (this.redis) await this.redis.del(`waf:jail:${k}`).catch(() => {});
        }
      }
      for (const k of Array.from(this.strikeMap.keys())) {
        if (k === `${slug}:${ip}` || k.startsWith(`${slug}:${ip}:`)) {
          this.strikeMap.delete(k);
        }
      }
    }
  }

  public async unjailAll(ip: string) {
    const cleanedIp = this.cleanIp(ip.trim());
    for (const k of Array.from(this.jailedEntries.keys())) {
      if (k === cleanedIp || k.includes(`:${cleanedIp}:`) || k.endsWith(`:${cleanedIp}`)) {
        this.jailedEntries.delete(k);
      }
    }
    for (const k of Array.from(this.strikeMap.keys())) {
      if (k === cleanedIp || k.includes(`:${cleanedIp}:`) || k.endsWith(`:${cleanedIp}`)) {
        this.strikeMap.delete(k);
      }
    }
    if (this.redis) {
      try {
        const keys = await this.redis.keys(`waf:jail:*${cleanedIp}*`);
        for (const key of keys) {
          await this.redis.del(key);
        }
        await this.redis.del(`waf:jail:${cleanedIp}`);
      } catch {}
    }
  }

  public unjailIp(ip: string) {
    this.unjailAll(ip);
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
        "X-Waf-Target": slug,
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
        "X-Waf-Target": slug,
      },
    };
  }

  private logEvent(
    ip: string,
    slug: string,
    req: http.IncomingMessage,
    action: WafSecurityEvent["action"],
    category: string,
    rule: string,
    clientType?: string
  ) {
    const event: WafSecurityEvent = {
      id: Math.random().toString(36).substring(2, 10),
      timestamp: new Date().toISOString(),
      ip,
      slug,
      clientType,
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
  //  CONFIGURATION RESOLUTION (Fail-Open Redis Timeout Protection)
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
      // 300ms fail-open timeout prevents slow Redis queries from stalling edge router traffic
      const fetchPromise = this.redis.get(`waf:config:${slug}`);
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Redis config timeout")), 300)
      );
      const raw = await Promise.race([fetchPromise, timeoutPromise]);
      if (raw) {
        const parsed = JSON.parse(raw);
        const merged: WafConfig = { ...defaultConfig, ...parsed };
        if (this.configCache.size >= MAX_CONFIG_CACHE_ENTRIES) {
          const firstKey = this.configCache.keys().next().value;
          if (firstKey) this.configCache.delete(firstKey);
        }
        this.configCache.set(slug, { config: merged, cachedAt: now });
        return merged;
      }
    } catch {}

    if (this.configCache.size >= MAX_CONFIG_CACHE_ENTRIES) {
      const firstKey = this.configCache.keys().next().value;
      if (firstKey) this.configCache.delete(firstKey);
    }
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
    const now = Date.now();
    const activeJails = Array.from(this.jailedEntries.entries())
      .filter(([_, data]) => data.until > now)
      .map(([key, data]) => ({
        key,
        slug: data.slug,
        ip: data.ip,
        clientType: data.clientType || "unknown",
        deviceHash: data.deviceHash || "none",
        reason: data.reason,
        expiresAt: new Date(data.until).toISOString(),
        secondsRemaining: Math.max(0, Math.ceil((data.until - now) / 1000)),
      }));

    return {
      status: "ACTIVE",
      metrics: this.metrics,
      activeJailedCount: activeJails.length,
      activeJailedEntries: activeJails,
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
    for (const [key, entry] of this.jailedEntries.entries()) {
      if (now > entry.until) {
        this.jailedEntries.delete(key);
      }
    }

    // Prune stale sliding windows
    for (const [key, window] of this.slidingWindows.entries()) {
      if (now - window.windowStart > 120_000) {
        this.slidingWindows.delete(key);
      }
    }

    for (const [key, strike] of this.strikeMap.entries()) {
      if (now - strike.firstStrike > STRIKE_WINDOW_MS * 2) {
        this.strikeMap.delete(key);
      }
    }
  }
}

export const waf = new WafEngine();
