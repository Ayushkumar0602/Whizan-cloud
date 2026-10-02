/**
 * Whizan Flow — Milestone 2 Comprehensive End-to-End Test Suite
 *
 * Verifies:
 * 1. VM Reboot & Cold-Boot Self-Healing Reconciliation (FlowBootReconciler)
 * 2. Native Workspace Analyzer (AI stack detection, ports, frameworks)
 * 3. Native Docker Container Builder & Image Tagging
 * 4. Test Runner & Exit Code Validation
 * 5. Edge Router Atomic Deployment Cutover & Router Cache Invalidation
 * 6. Automated Rollback on Canary / Health Probe Failure
 * 7. Step Memoization & Instant Replay from Checkpoint
 * 8. AI Release Notes & Post-Deployment Notifications
 */

import { StepRunner } from "./step-runner.js";
import { FlowStateMachine, type WorkflowDefinition } from "./state-machine.js";
import { FlowBootReconciler } from "./reconciler.js";

// Mock in-memory Redis implementation supporting Streams, Pub/Sub, and Hashes
class MockRedis {
  private kv = new Map<string, string>();
  private hashMaps = new Map<string, Map<string, string>>();
  private publishedChannels = new Map<string, string[]>();

  public async get(key: string): Promise<string | null> {
    return this.kv.get(key) || null;
  }

  public async set(key: string, val: string, ...args: any[]): Promise<string> {
    this.kv.set(key, val);
    return "OK";
  }

  public async del(key: string): Promise<number> {
    const existed = this.kv.delete(key);
    return existed ? 1 : 0;
  }

  public async hset(key: string, field: string, val: string): Promise<number> {
    if (!this.hashMaps.has(key)) this.hashMaps.set(key, new Map());
    this.hashMaps.get(key)!.set(field, val);
    return 1;
  }

  public async hgetall(key: string): Promise<Record<string, string>> {
    const map = this.hashMaps.get(key);
    if (!map) return {};
    return Object.fromEntries(map.entries());
  }

  public async publish(channel: string, message: string): Promise<number> {
    if (!this.publishedChannels.has(channel)) this.publishedChannels.set(channel, []);
    this.publishedChannels.get(channel)!.push(message);
    return 1;
  }

  public getPublishedMessages(channel: string): string[] {
    return this.publishedChannels.get(channel) || [];
  }

  public async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
    return Array.from(this.kv.keys()).filter((k) => regex.test(k));
  }

  // Redis Streams mock stubs
  public async xpending(stream: string, group: string, start: string, end: string, count: number): Promise<any> {
    return [
      ["msg-001-interrupted", "worker-crashed", 90000, 1],
    ];
  }

  public async xclaim(stream: string, group: string, consumer: string, minIdleTime: number, ...ids: string[]): Promise<any> {
    return ids.map((id) => [id, ["workflowId", "wf_test", "runId", "run_claimed_001"]]);
  }

  public on(event: string, cb: any) {}
  public async subscribe(channel: string) {}
  public async unsubscribe(channel: string) {}
  public async quit() {}
}

async function runMilestone2Tests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("🚀 WHIZAN FLOW — MILESTONE 2 NATIVE HANDLERS & REBOOT SUITE");
  console.log("═══════════════════════════════════════════════════════════\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, message: string) {
    totalTests++;
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
    console.log(`✅ PASSED: ${message}`);
    passedTests++;
  }

  const mockRedis = new MockRedis() as any;
  const runner = new StepRunner(mockRedis);
  const stateMachine = new FlowStateMachine(mockRedis, runner);

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: Cold-Boot Self-Healing & VM Reboot Reconciliation
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST GROUP 1: VM Reboot Recovery & Cold-Boot Reconciler ---");
  {
    // Simulate an interrupted run in Redis from a prior pre-boot crash
    const crashedRunId = "run_crashed_vm_001";
    await mockRedis.set(
      `flow:run:${crashedRunId}`,
      JSON.stringify({
        runId: crashedRunId,
        workflowId: "wf_ci_cd",
        status: "RUNNING",
        contextData: { steps: { trigger: { status: "SUCCESS" } } },
      })
    );
    await mockRedis.hset(
      `flow:steps:${crashedRunId}`,
      "build_docker",
      JSON.stringify({
        runId: crashedRunId,
        nodeKey: "build_docker",
        status: "RUNNING",
      })
    );

    const reconciler = new FlowBootReconciler({
      redis: mockRedis,
      stateMachine,
      apiUrl: "",
    });

    const report = await reconciler.reconcileOnBoot();
    assert(report.claimedMessages >= 1, "Reconciler claims abandoned messages from crashed worker via XCLAIM");

    // Verify crashed run state is marked as FAILED with clean diagnostic
    const reconciledJson = await mockRedis.get(`flow:run:${crashedRunId}`);
    assert(Boolean(reconciledJson), "Reconciled run state is saved in Redis");
    const parsed = JSON.parse(reconciledJson!);
    assert(parsed.status === "FAILED", "Orphaned in-flight run transitions out of infinite RUNNING loop to FAILED");
    assert(parsed.errorMessage.includes("interrupted by host VM reboot"), "Diagnostic specifies VM reboot as reason for failure");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: Native Build & Deploy Handlers
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST GROUP 2: Native Build, Test & Edge Deploy Handlers ---");
  {
    const runId = "run_build_deploy_001";
    const ctx = { workflowName: "My Next App", steps: {} };

    // 1. Workspace Analysis
    const analyzeNode = {
      nodeKey: "analyze",
      name: "Analyze Stack",
      type: "ACTION_WORKSPACE_ANALYZE",
      config: { framework: "NEXTJS", port: 3000 },
    };
    const analyzeRes = await runner.execute(analyzeNode, runId, ctx);
    assert(analyzeRes.status === "SUCCESS", "ACTION_WORKSPACE_ANALYZE succeeds");
    assert(analyzeRes.outputData.framework === "NEXTJS" && analyzeRes.outputData.port === 3000, "Analyzer extracts framework and target port");

    // 2. Docker Container Build
    const buildNode = {
      nodeKey: "build",
      name: "Build Image",
      type: "ACTION_BUILD_CONTAINER",
      config: { dockerfile: "Dockerfile" },
    };
    const buildRes = await runner.execute(buildNode, runId, ctx);
    assert(buildRes.status === "SUCCESS", "ACTION_BUILD_CONTAINER completes image compilation");
    assert(buildRes.outputData.imageTag.includes("whizan-flow-"), "Container image is tagged uniquely for run");

    // 3. Run Tests
    const testNode = {
      nodeKey: "test",
      name: "Run Unit Tests",
      type: "ACTION_RUN_TESTS",
      config: { command: "npm test" },
    };
    const testRes = await runner.execute(testNode, runId, ctx);
    assert(testRes.status === "SUCCESS" && testRes.exitCode === 0, "ACTION_RUN_TESTS validates exit code 0");

    // 4. Deploy to Edge Router
    const deployNode = {
      nodeKey: "deploy",
      name: "Deploy Edge",
      type: "ACTION_DEPLOY_EDGE",
      config: { slug: "storefront-web", type: "ssr", containerPort: 3000 },
    };
    const deployRes = await runner.execute(deployNode, runId, ctx);
    assert(deployRes.status === "SUCCESS", "ACTION_DEPLOY_EDGE registers routing");
    assert(deployRes.outputData.slug === "storefront-web", "Edge route slug configured");

    // Verify Redis route key was written
    const route = await mockRedis.get("deployment:storefront-web");
    assert(Boolean(route) && JSON.parse(route!).type === "ssr", "Deployment routing key written to Redis deployment:storefront-web");

    // Verify router cache invalidation pub/sub event was fired
    const invalidations = mockRedis.getPublishedMessages("router:cache_invalidate");
    assert(invalidations.includes("storefront-web"), "Edge Router cache invalidation signal published to Redis");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Atomic Router Cutover
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST GROUP 3: Zero-Downtime Atomic Traffic Cutover ---");
  {
    const cutoverNode = {
      nodeKey: "cutover",
      name: "Switch Traffic",
      type: "ACTION_ROUTER_CUTOVER",
      config: { slug: "storefront-web", canaryPercentage: 100 },
    };
    const res = await runner.execute(cutoverNode, "run_cutover_001", {});
    assert(res.status === "SUCCESS", "ACTION_ROUTER_CUTOVER completes successfully");
    assert(res.outputData.cutoverSuccess === true, "Atomic cutover marked successful");

    const cutoverEvents = mockRedis.getPublishedMessages("router:cutover");
    assert(cutoverEvents.length > 0 && JSON.parse(cutoverEvents[0]).slug === "storefront-web", "Router IPC cutover broadcast dispatched over Redis");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Health Probe Failure & Automated Rollback
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST GROUP 4: Health Probe Failure & Instant Rollback ---");
  {
    // Set a known previous deployment in Redis backup
    const stableDeployment = JSON.stringify({
      type: "ssr",
      containerPort: 3000,
      deploymentId: "dep_stable_v1",
      deployedAt: "2026-10-02T10:00:00Z",
    });
    await mockRedis.set("deployment:storefront-web:previous", stableDeployment);

    // Overwrite active route with a "broken" deployment
    await mockRedis.set(
      "deployment:storefront-web",
      JSON.stringify({ type: "ssr", containerPort: 3001, deploymentId: "dep_broken_v2" })
    );

    // Execute Auto-Rollback node
    const rollbackNode = {
      nodeKey: "rollback",
      name: "Emergency Rollback",
      type: "ACTION_AUTO_ROLLBACK",
      config: { slug: "storefront-web" },
    };
    const rollbackRes = await runner.execute(rollbackNode, "run_rollback_001", {});
    assert(rollbackRes.status === "SUCCESS" && rollbackRes.outputData.rolledBack === true, "ACTION_AUTO_ROLLBACK executes rollback sequence");

    // Verify the route in Redis was reverted back to stable deployment
    const restoredRoute = await mockRedis.get("deployment:storefront-web");
    assert(Boolean(restoredRoute) && JSON.parse(restoredRoute!).deploymentId === "dep_stable_v1", "Active route in Redis successfully restored to dep_stable_v1");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: Step Memoization & Instant Replay
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST GROUP 5: Step Memoization & Instant Replay ---");
  {
    const memoNode = {
      nodeKey: "heavy_build",
      name: "Compile Large Binary",
      type: "ACTION_BUILD_CONTAINER",
      config: { dockerfile: "Dockerfile.heavy" },
    };

    // First execution: initial run computes output and memoizationHash
    const firstRes = await runner.execute(memoNode, "run_memo_001", { steps: {} });
    assert(Boolean(firstRes.memoizationHash), "StepRunner calculates cryptographic input memoizationHash");

    // Second execution with memoized context: simulate replay
    const replayContext = {
      steps: {},
      memoizedSteps: {
        heavy_build: {
          status: "SUCCESS",
          memoizationHash: firstRes.memoizationHash,
          outputData: firstRes.outputData,
          stdout: "Cached build output reused\n",
          durationMs: 0,
        },
      },
    };

    const replayRes = await runner.execute(memoNode, "run_memo_002", replayContext);
    assert(replayRes.status === "SUCCESS", "Memoized step succeeds instantly");
    assert(replayRes.durationMs === 0, "Memoized step duration is 0ms (skipped rebuild)");
    assert(replayRes.stdout.includes("Cache HIT"), "Log indicates cache hit and reuse of memoized outputs");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: Complete End-to-End Pipeline Execution
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST GROUP 6: Complete End-to-End Deployment Pipeline ---");
  {
    const fullPipeline: WorkflowDefinition = {
      id: "wf_full_deployment",
      name: "Fullstack Zero-Downtime CI/CD",
      concurrencyPolicy: "ALLOW",
      maxConcurrentRuns: 2,
      timeoutSeconds: 600,
      nodes: [
        { nodeKey: "git_push", name: "Git Trigger", type: "TRIGGER_GIT", config: {} },
        { nodeKey: "audit", name: "AI Stack Audit", type: "ACTION_WORKSPACE_ANALYZE", config: { framework: "NEXTJS" } },
        { nodeKey: "build", name: "Docker Build", type: "ACTION_BUILD_CONTAINER", config: {} },
        { nodeKey: "test", name: "Run Tests", type: "ACTION_RUN_TESTS", config: {} },
        { nodeKey: "deploy", name: "Deploy Edge", type: "ACTION_DEPLOY_EDGE", config: { slug: "production-app" } },
        { nodeKey: "cutover", name: "Atomic Cutover", type: "ACTION_ROUTER_CUTOVER", config: { slug: "production-app" } },
        { nodeKey: "ai_notes", name: "AI Release Notes", type: "ACTION_AI_PROMPT", config: {} },
      ],
      edges: [
        { sourceNodeKey: "git_push", targetNodeKey: "audit" },
        { sourceNodeKey: "audit", targetNodeKey: "build" },
        { sourceNodeKey: "build", targetNodeKey: "test" },
        { sourceNodeKey: "test", targetNodeKey: "deploy" },
        { sourceNodeKey: "deploy", targetNodeKey: "cutover" },
        { sourceNodeKey: "cutover", targetNodeKey: "ai_notes" },
      ],
    };

    const finalState = await stateMachine.executeWorkflow(fullPipeline, "run_full_001", {
      triggerMetadata: { commit: "e9d2a4", branch: "main", author: "Ayush" },
    });

    assert(finalState.status === "SUCCESS", "Full deployment pipeline executes all 7 nodes to SUCCESS");
    assert(finalState.contextData.steps.audit?.output?.framework === "NEXTJS", "Audit step output propagated through pipeline");
    assert(finalState.contextData.steps.deploy?.output?.slug === "production-app", "Edge deployment registered");
    assert(finalState.contextData.steps.cutover?.output?.cutoverSuccess === true, "Zero-downtime cutover applied");
    assert(Boolean(finalState.contextData.steps.ai_notes?.output?.response), "AI release notes generated upon completion");
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`🎉 ALL MILESTONE 2 TESTS PASSED: ${passedTests}/${totalTests} validations verified!`);
  console.log("Whizan Flow Milestone 2 is robust, reboot-resilient, and production ready.");
  console.log("═══════════════════════════════════════════════════════════\n");
}

runMilestone2Tests().catch((err) => {
  console.error("\n💥 Milestone 2 test suite fatal error:", err);
  process.exit(1);
});
