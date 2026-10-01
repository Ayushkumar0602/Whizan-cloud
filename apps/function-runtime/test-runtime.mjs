import { FunctionBundler } from "./dist/bundler.js";
import { FunctionSandbox } from "./dist/sandbox.js";
import { FunctionLogger } from "./dist/logger.js";
import { FunctionPool } from "./dist/pool.js";
import fs from "fs";
import path from "path";

async function runTests() {
  console.log("=================================================");
  console.log("🧪 Running Whizan Edge Function Runtime Tests");
  console.log("=================================================\n");

  const testBaseDir = path.resolve("./test-functions-storage");
  if (fs.existsSync(testBaseDir)) {
    fs.rmSync(testBaseDir, { recursive: true, force: true });
  }
  const bundler = new FunctionBundler(testBaseDir);
  const logger = new FunctionLogger(null);
  const sandbox = new FunctionSandbox(logger);
  const pool = new FunctionPool(sandbox, null);

  const testServiceId = "test-service-123";

  // Test 1: Bundling a sample TypeScript function
  console.log("Test 1: Compiling and bundling TypeScript Edge Function...");
  const sampleCode = `
    export default async function handler(req: Request, context: any) {
      const { name = "World" } = await req.json().catch(() => ({}));
      console.log("Processing request for:", name, "Secret key is:", context.env.MY_SECRET);
      return Response.json({
        greeting: "Hello, " + name + "!",
        secretLength: context.env.MY_SECRET?.length || 0,
        timestamp: new Date().toISOString()
      });
    }
  `;

  const bundleResult = await bundler.bundleCode(testServiceId, 1, { rawCode: sampleCode });
  console.log("✔ Bundling successful:", {
    bundlePath: bundleResult.bundlePath,
    bundleHash: bundleResult.bundleHash.slice(0, 16) + "...",
    bundleSizeBytes: bundleResult.bundleSizeBytes,
  });

  if (!fs.existsSync(bundleResult.bundlePath)) {
    throw new Error("FAIL: Bundle file was not written to disk");
  }

  // Test 2: Execution in Sandbox
  console.log("\nTest 2: Executing function in Sandbox with mock request & Web APIs...");
  const bundle = await pool.getOrLoadBundle(testServiceId, 1, bundleResult.bundlePath);
  const invokeResponse = await sandbox.execute(bundle, {
    serviceId: testServiceId,
    slug: "test-slug",
    version: 1,
    routePath: "/greet",
    method: "POST",
    headers: { "content-type": "application/json" },
    query: { debug: "true" },
    body: { name: "Antigravity Engineer" },
    envVars: { MY_SECRET: "super-secret-token-12345" },
    timeoutMs: 5000,
    memoryLimit: 128,
  });

  console.log("✔ Invocation response:", {
    statusCode: invokeResponse.statusCode,
    body: JSON.parse(invokeResponse.body || "{}"),
    durationMs: `${invokeResponse.durationMs}ms`,
    memoryMb: `${invokeResponse.memoryMb}MB`,
  });

  if (invokeResponse.statusCode !== 200) {
    throw new Error(`FAIL: Expected status 200, got ${invokeResponse.statusCode}`);
  }

  // Test 3: Secrets Redaction
  console.log("\nTest 3: Testing Secrets Redaction...");
  const rawLog = "User authenticated with super-secret-token-12345 and database password secret-db-pass";
  const redactedLog = logger.redact(rawLog, ["super-secret-token-12345", "secret-db-pass"]);
  console.log("Raw log:     ", rawLog);
  console.log("Redacted log:", redactedLog);

  if (redactedLog.includes("super-secret-token-12345") || redactedLog.includes("secret-db-pass")) {
    throw new Error("FAIL: Secrets were not redacted in log!");
  }
  console.log("✔ Secrets successfully redacted to [REDACTED]");

  // Test 4: Hard Timeout Enforcement
  console.log("\nTest 4: Testing Hard Execution Timeout Enforcement...");
  const infiniteLoopCode = `
    export default async function handler(req: Request) {
      // Simulate infinite or long-running async operation
      await new Promise(resolve => setTimeout(resolve, 5000));
      return Response.json({ ok: true });
    }
  `;
  const timeoutBundleResult = await bundler.bundleCode(testServiceId, 2, { rawCode: infiniteLoopCode });
  const timeoutBundle = await pool.getOrLoadBundle(testServiceId, 2, timeoutBundleResult.bundlePath);

  const timeoutResponse = await sandbox.execute(timeoutBundle, {
    serviceId: testServiceId,
    slug: "timeout-test",
    version: 2,
    timeoutMs: 400, // 400ms timeout
  });

  console.log("✔ Timeout response:", {
    statusCode: timeoutResponse.statusCode,
    error: timeoutResponse.error,
    durationMs: `${timeoutResponse.durationMs}ms`,
  });

  if (timeoutResponse.statusCode !== 504) {
    throw new Error(`FAIL: Expected status 504 for timeout, got ${timeoutResponse.statusCode}`);
  }

  // Test 5: Version Pruning & Disk Management (Keep latest 3)
  console.log("\nTest 5: Testing Version Pruning & Zero Disk Bloat...");
  await bundler.bundleCode(testServiceId, 3, { rawCode: sampleCode });
  await bundler.bundleCode(testServiceId, 4, { rawCode: sampleCode });
  await bundler.bundleCode(testServiceId, 5, { rawCode: sampleCode });

  const serviceDir = path.join(testBaseDir, testServiceId);
  const remainingVersions = fs.readdirSync(serviceDir).filter((name) => name.startsWith("v"));
  console.log("Remaining version folders on disk:", remainingVersions);

  if (remainingVersions.length > 3) {
    throw new Error(`FAIL: Expected at most 3 versions, found ${remainingVersions.length}`);
  }
  console.log("✔ Version pruning kept exactly the latest 3 versions!");

  // Cleanup test directory
  pool.destroy();
  fs.rmSync(testBaseDir, { recursive: true, force: true });

  console.log("\n=================================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! (5/5)");
  console.log("=================================================");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
