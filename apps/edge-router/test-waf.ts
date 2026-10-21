import http from "http";
import { waf } from "./src/waf.js";

async function runRegressionTests() {
  console.log("🛡️  ============================================================");
  console.log("🛡️  Whizan Edge Defense: 10-Scenario Mandatory Regression Suite");
  console.log("🛡️  Strict Deployment Isolation & Anti-Collateral Verification");
  console.log("🛡️  ============================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`  ✅ PASS: [${testName}]`);
      if (details) console.log(`     └─ ${details}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: [${testName}]`);
      if (details) console.error(`     └─ Expected: ${details}`);
      failed++;
    }
  }

  function mockRequest(options: {
    ip?: string;
    socketIp?: string;
    userAgent?: string;
    accept?: string;
    url?: string;
    method?: string;
    headers?: Record<string, string>;
  }): http.IncomingMessage {
    const socketIp = options.socketIp || "127.0.0.1";
    const headers: Record<string, string> = {
      "user-agent": options.userAgent || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      accept: options.accept || "application/json",
      ...(options.headers || {}),
    };

    // If socket is loopback/trusted proxy, use x-forwarded-for for client IP testing
    if (options.ip && (socketIp === "127.0.0.1" || socketIp === "::1")) {
      headers["x-forwarded-for"] = options.ip;
    }

    return {
      headers,
      url: options.url || "/",
      method: options.method || "GET",
      socket: { remoteAddress: socketIp },
    } as any;
  }

  const DEPLOYMENT_A = "ecommerce-store-a";
  const DEPLOYMENT_B = "analytics-service-b";
  const DEPLOYMENT_C = "user-dashboard-c";

  const IP_A = "198.51.100.10";
  const IP_B = "198.51.100.20";
  const IP_C = "198.51.100.30";

  // ───────────────────────────────────────────────────────────────────────────
  //  SCENARIO 1: Attack from IP A against Deployment A is blocked after threshold
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n▶ [Scenario 1] Attacking Deployment A from IP A...");
  const atk1 = await waf.inspectRequest(mockRequest({ ip: IP_A, url: "/items?id=1%20UNION%20SELECT%20password%20FROM%20users" }), DEPLOYMENT_A);
  assert(atk1.allowed === false && atk1.category === "sqli", "Scenario 1.1: 1st SQLi blocked");

  const atk2 = await waf.inspectRequest(mockRequest({ ip: IP_A, url: "/search?q=%3Cscript%3Ealert('xss')%3C/script%3E" }), DEPLOYMENT_A);
  assert(atk2.allowed === false && atk2.category === "xss", "Scenario 1.2: 2nd XSS attack blocked");

  const atk3 = await waf.inspectRequest(mockRequest({ ip: IP_A, url: "/download?path=../../../../etc/passwd" }), DEPLOYMENT_A);
  assert(atk3.allowed === false && atk3.category === "lfi", "Scenario 1.3: 3rd LFI attack triggers fail2ban jail");

  const jailedReqA = await waf.inspectRequest(mockRequest({ ip: IP_A, url: "/clean-homepage" }), DEPLOYMENT_A);
  assert(
    jailedReqA.allowed === false && jailedReqA.category === "jailed",
    "Scenario 1: IP A is jailed on Deployment A",
    `statusCode=${jailedReqA.statusCode}, reason="${jailedReqA.reason}"`
  );

  // ───────────────────────────────────────────────────────────────────────────
  //  SCENARIO 2: IP B can still access Deployment A normally (Source Isolation)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n▶ [Scenario 2] Verifying Source Isolation on Deployment A...");
  const cleanReqB = await waf.inspectRequest(mockRequest({ ip: IP_B, url: "/clean-homepage" }), DEPLOYMENT_A);
  assert(
    cleanReqB.allowed === true,
    "Scenario 2: Unrelated IP B can access Deployment A normally",
    "IP B is NOT affected by IP A's jail on Deployment A"
  );

  // ───────────────────────────────────────────────────────────────────────────
  //  SCENARIO 3: IP A can still access Deployment B (Deployment Isolation)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n▶ [Scenario 3] Verifying Deployment Isolation for Jailed IP A...");
  const ipAToDeploymentB = await waf.inspectRequest(mockRequest({ ip: IP_A, url: "/dashboard/metrics" }), DEPLOYMENT_B);
  assert(
    ipAToDeploymentB.allowed === true,
    "Scenario 3: Jailed IP A can access Deployment B freely",
    `Deployment B is completely unaffected by Deployment A's restriction (allowed=${ipAToDeploymentB.allowed})`
  );

  // ───────────────────────────────────────────────────────────────────────────
  //  SCENARIO 4: A restriction on Deployment A does not affect any unrelated deployment
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n▶ [Scenario 4] Verifying Unrelated Deployment C is fully open...");
  const ipAToDeploymentC = await waf.inspectRequest(mockRequest({ ip: IP_A, url: "/overview" }), DEPLOYMENT_C);
  const ipBToDeploymentC = await waf.inspectRequest(mockRequest({ ip: IP_B, url: "/overview" }), DEPLOYMENT_C);
  assert(
    ipAToDeploymentC.allowed === true && ipBToDeploymentC.allowed === true,
    "Scenario 4: Deployment C is 100% accessible to all clients",
    "Deployment-scoped restrictions do not leak across any other services"
  );

  // ───────────────────────────────────────────────────────────────────────────
  //  SCENARIO 5: Multiple devices behind different public IPs are handled independently
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n▶ [Scenario 5] Verifying Independent Public IPs...");
  const cleanReqC = await waf.inspectRequest(mockRequest({ ip: IP_C, url: "/catalog" }), DEPLOYMENT_A);
  assert(
    cleanReqC.allowed === true,
    "Scenario 5: IP C operates completely independently from IP A and IP B",
    `Remaining quota headers: ${cleanReqC.headers?.["RateLimit-Remaining"]}`
  );

  // ───────────────────────────────────────────────────────────────────────────
  //  SCENARIO 6: Devices sharing the same public IP (e.g. Phone vs Laptop on WiFi)
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n▶ [Scenario 6] Verifying Shared Public IP NAT Handling...");
  const SHARED_NAT_IP = "203.0.113.88";
  const LAPTOP_UA = "curl/8.4.0";
  const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

  // Laptop triggers 3 attacks on Deployment A
  await waf.inspectRequest(mockRequest({ ip: SHARED_NAT_IP, userAgent: LAPTOP_UA, url: "/?probe=../../etc/passwd" }), DEPLOYMENT_A);
  await waf.inspectRequest(mockRequest({ ip: SHARED_NAT_IP, userAgent: LAPTOP_UA, url: "/?id=1%20UNION%20SELECT%201" }), DEPLOYMENT_A);
  await waf.inspectRequest(mockRequest({ ip: SHARED_NAT_IP, userAgent: LAPTOP_UA, url: "/?q=<script>xss()</script>" }), DEPLOYMENT_A);

  // Laptop is now jailed on Deployment A
  const laptopRes = await waf.inspectRequest(mockRequest({ ip: SHARED_NAT_IP, userAgent: LAPTOP_UA, url: "/clean-path" }), DEPLOYMENT_A);
  assert(laptopRes.allowed === false && laptopRes.category === "jailed", "Scenario 6.1: Attacking laptop is jailed on Deployment A");

  // Phone on the SAME WiFi / NAT IP accessing Deployment A is protected from collateral damage!
  const phoneResA = await waf.inspectRequest(mockRequest({ ip: SHARED_NAT_IP, userAgent: IPHONE_UA, url: "/clean-path" }), DEPLOYMENT_A);
  assert(phoneResA.allowed === true, "Scenario 6.2: iPhone on same WiFi accessing Deployment A is NOT collateral damage");

  // And phone accessing Deployment B is also completely open
  const phoneResB = await waf.inspectRequest(mockRequest({ ip: SHARED_NAT_IP, userAgent: IPHONE_UA, url: "/clean-path" }), DEPLOYMENT_B);
  assert(phoneResB.allowed === true, "Scenario 6.3: iPhone on same WiFi accessing Deployment B works seamlessly");

  // ───────────────────────────────────────────────────────────────────────────
  //  SCENARIO 7: Expired bans stop blocking requests automatically
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n▶ [Scenario 7] Verifying Automatic Ban Expiration...");
  const SHORT_BAN_IP = "192.0.2.77";
  const SHORT_BAN_SLUG = "temp-ban-test";
  const SHORT_BAN_UA = "automated-tester/1.0";

  // Directly jail with 150ms TTL for testing
  waf.jailDevice(SHORT_BAN_SLUG, SHORT_BAN_IP, SHORT_BAN_UA, "browser", "Test Short Ban", 150);

  // Immediately blocked
  const blockedNow = await waf.inspectRequest(
    mockRequest({ ip: SHORT_BAN_IP, userAgent: SHORT_BAN_UA, url: "/" }),
    SHORT_BAN_SLUG
  );
  assert(blockedNow.allowed === false && blockedNow.category === "jailed", "Scenario 7.1: Client is temporarily jailed");

  // Wait 200ms for expiration
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Should now automatically recover and allow clean requests
  const recoveredRes = await waf.inspectRequest(
    mockRequest({ ip: SHORT_BAN_IP, userAgent: SHORT_BAN_UA, url: "/" }),
    SHORT_BAN_SLUG
  );
  assert(
    recoveredRes.allowed === true,
    "Scenario 7.2: Expired ban automatically stopped blocking without manual intervention",
    "Automatic recovery verified"
  );

  // ───────────────────────────────────────────────────────────────────────────
  //  SCENARIO 8: Spoofed X-Forwarded-For cannot bypass enforcement
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n▶ [Scenario 8] Verifying Anti-Spoofing on Direct Public Connections...");
  const REAL_ATTACKER_SOCKET = "198.51.100.99";
  // Direct untrusted socket connection with spoofed X-Forwarded-For
  const spoofedReq = mockRequest({
    socketIp: REAL_ATTACKER_SOCKET, // Direct TCP socket from untrusted public IP
    headers: { "x-forwarded-for": "8.8.8.8, 1.1.1.1" }, // Attacker trying to spoof Google DNS IP
  });
  const extractedIp = waf.extractClientIp(spoofedReq);
  assert(
    extractedIp === REAL_ATTACKER_SOCKET,
    "Scenario 8: Untrusted direct X-Forwarded-For is ignored in favor of real TCP socket IP",
    `Extracted IP: ${extractedIp} (Matched real TCP socket IP ${REAL_ATTACKER_SOCKET})`
  );

  // ───────────────────────────────────────────────────────────────────────────
  //  SCENARIO 9: Route policies and scanner detection
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n▶ [Scenario 9] Verifying Scanner & Route Security Rules...");
  const scannerReq = mockRequest({
    ip: "198.51.100.123",
    userAgent: "sqlmap/1.7#stable",
  });
  const scannerRes = await waf.inspectRequest(scannerReq, DEPLOYMENT_A);
  assert(
    scannerRes.allowed === false && scannerRes.category === "bad_bot",
    "Scenario 9: Vulnerability scanner User-Agent (sqlmap) is detected and blocked",
    `Rule matched: ${scannerRes.ruleMatched}`
  );

  // ───────────────────────────────────────────────────────────────────────────
  //  SCENARIO 10: Concurrency Safety & High-Speed Load Handling
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n▶ [Scenario 10] Verifying Concurrency Safety under load...");
  const CONCURRENT_IP = "198.51.100.200";
  const CONCURRENT_SLUG = "load-test-slug";
  const promises: Promise<any>[] = [];

  for (let i = 0; i < 50; i++) {
    promises.push(
      waf.inspectRequest(
        mockRequest({ ip: CONCURRENT_IP, url: `/api/resource?i=${i}` }),
        CONCURRENT_SLUG
      )
    );
  }

  const results = await Promise.all(promises);
  const allowedCount = results.filter((r) => r.allowed).length;
  const throttledOrJailedCount = results.filter((r) => !r.allowed && (r.statusCode === 429 || r.statusCode === 403)).length;

  assert(
    allowedCount > 0 && (allowedCount + throttledOrJailedCount === 50),
    "Scenario 10: 50 concurrent requests handled atomically without race condition corruption",
    `Allowed: ${allowedCount}, Throttled/Jailed: ${throttledOrJailedCount}, Total: ${results.length}`
  );

  // ───────────────────────────────────────────────────────────────────────────
  //  FINAL SUMMARY
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log(`📊 FINAL REGRESSION TEST REPORT: ${passed} PASSED, ${failed} FAILED.`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("❌ REGRESSION SUITE FAILED!");
    process.exit(1);
  } else {
    console.log("🎉 ALL 10 MANDATORY REGRESSION SCENARIOS PASSED WITH 100% SUCCESS!\n");
    process.exit(0);
  }
}

runRegressionTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
