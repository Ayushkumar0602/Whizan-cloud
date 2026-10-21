import http from "http";
import { waf } from "./src/waf.js";

async function runTests() {
  console.log("🧪 --- Starting Enterprise WAF, DDoS Protection & Rate Limiting Test Suite --- 🧪\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  function mockRequest(options: {
    ip?: string;
    userAgent?: string;
    accept?: string;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
  }): http.IncomingMessage {
    return {
      headers: {
        "x-forwarded-for": options.ip || "203.0.113.10",
        "user-agent": options.userAgent || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        accept: options.accept || "application/json",
        ...(options.headers || {}),
      },
      url: options.url || "/",
      method: options.method || "GET",
      socket: { remoteAddress: options.ip || "203.0.113.10" },
    } as any;
  }

  // Test 1: Normal legitimate request
  const cleanReq = mockRequest({ ip: "203.0.113.1", url: "/api/products?category=electronics" });
  const cleanRes = await waf.inspectRequest(cleanReq, "my-store");
  assert(cleanRes.allowed === true, "Legitimate request is allowed");
  assert(Boolean(cleanRes.headers && cleanRes.headers["RateLimit-Limit"]), "RateLimit-Limit header injected");

  // Test 2: SQL Injection (SQLi)
  const sqliReq = mockRequest({ ip: "203.0.113.2", url: "/items?id=1%20UNION%20ALL%20SELECT%20username,%20password%20FROM%20users" });
  const sqliRes = await waf.inspectRequest(sqliReq, "my-store");
  assert(sqliRes.allowed === false, "SQL Injection payload is blocked");
  assert(sqliRes.category === "sqli", "Category correctly identified as 'sqli'");
  assert(sqliRes.statusCode === 403, "Status code is 403 Forbidden");

  // Test 3: Cross-Site Scripting (XSS)
  const xssReq = mockRequest({ ip: "203.0.113.3", url: "/comments?author=%3Cscript%3Ealert('xss')%3C/script%3E" });
  const xssRes = await waf.inspectRequest(xssReq, "my-store");
  assert(xssRes.allowed === false, "XSS script payload is blocked");
  assert(xssRes.category === "xss", "Category correctly identified as 'xss'");

  // Test 4: Path Traversal / LFI
  const lfiReq = mockRequest({ ip: "203.0.113.4", url: "/download?file=../../../../etc/passwd" });
  const lfiRes = await waf.inspectRequest(lfiReq, "my-store");
  assert(lfiRes.allowed === false, "Path traversal payload is blocked");
  assert(lfiRes.category === "lfi", "Category correctly identified as 'lfi'");

  // Test 5: Vulnerability Scanner User-Agent
  const scannerReq = mockRequest({ ip: "203.0.113.5", userAgent: "sqlmap/1.6#stable (https://sqlmap.org)" });
  const scannerRes = await waf.inspectRequest(scannerReq, "my-store");
  assert(scannerRes.allowed === false, "sqlmap scanner User-Agent is blocked");
  assert(scannerRes.category === "bad_bot", "Category correctly identified as 'bad_bot'");

  // Test 6: Sensitive File Sniffing / Probe
  const probeReq = mockRequest({ ip: "203.0.113.6", url: "/.env.production" });
  const probeRes = await waf.inspectRequest(probeReq, "my-store");
  assert(probeRes.allowed === false, "Sensitive /.env probe is blocked");
  assert(probeRes.category === "probe", "Category correctly identified as 'probe'");

  // Test 7: Rate Limiting
  const rateLimitIp = "198.51.100.42";
  let rateBlocked = false;
  for (let i = 0; i < 40; i++) {
    const res = await waf.inspectRequest(mockRequest({ ip: rateLimitIp, url: "/feed" }), "fast-api");
    if (!res.allowed && res.statusCode === 429) {
      rateBlocked = true;
      break;
    }
  }
  assert(rateBlocked === true, "High frequency traffic triggers HTTP 429 Rate Limit");

  // Test 8: Fail2Ban Automated Jailing
  const attackerIp = "192.0.2.99";
  // Send 3 distinct attacks to accumulate strikes
  await waf.inspectRequest(mockRequest({ ip: attackerIp, url: "/?test=1%20UNION%20SELECT%201" }), "target");
  await waf.inspectRequest(mockRequest({ ip: attackerIp, url: "/?q=<script>evil()</script>" }), "target");
  await waf.inspectRequest(mockRequest({ ip: attackerIp, url: "/../../etc/shadow" }), "target");
  // 4th request (even if clean) should be blocked by Jail
  const jailedRes = await waf.inspectRequest(mockRequest({ ip: attackerIp, url: "/clean-homepage" }), "target");
  assert(jailedRes.allowed === false, "Attacker IP is automatically jailed");
  assert(jailedRes.category === "jailed", "Blocked specifically under 'jailed' category");
  assert(Boolean(jailedRes.headers && jailedRes.headers["Retry-After"]), "Jailed response includes Retry-After header");

  // Test 9: Telemetry & Metrics Tracking
  const stats = waf.getStats();
  assert(stats.metrics.totalInspected > 0, "Telemetry: totalInspected tracked");
  assert(stats.metrics.totalBlocked > 0, "Telemetry: totalBlocked tracked");
  assert(stats.metrics.categoryCounts.sqli > 0, "Telemetry: categoryCounts.sqli tracked");
  assert(stats.metrics.categoryCounts.xss > 0, "Telemetry: categoryCounts.xss tracked");
  assert(stats.activeJailedIpsCount > 0, "Telemetry: activeJailedIpsCount tracked");

  console.log(`\n📊 Test Results: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
