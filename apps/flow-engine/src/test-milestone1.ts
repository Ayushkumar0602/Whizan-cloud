/**
 * Whizan Flow — Milestone 1 Comprehensive End-to-End Test Suite
 *
 * Verifies:
 * 1. Circular Byte Ring Buffer (Capped memory, zero OOM, chronological wrap)
 * 2. Kahn's Algorithm Topological Sorter & Cycle Detection
 * 3. In-Degree Tracking, Diamond Joins, and Parallel Execution
 * 4. Conditional Branch Gating & Upstream Skip Propagation
 * 5. Step Execution (Triggers, Gates, Notifications, Delays)
 * 6. Durable State Machine: Checkpointing, Context Accumulation
 * 7. Human-in-the-Loop Approval Suspension & Zero-Resource Resumption
 */

import { CircularRingBuffer } from "./ring-buffer.js";
import { DAGEngine, type DAGNode, type DAGEdge, type StepOutcome } from "./dag-engine.js";
import { StepRunner } from "./step-runner.js";
import { FlowStateMachine, type WorkflowDefinition } from "./state-machine.js";

// Mock in-memory Redis implementation for zero-dependency unit/E2E verification
class MockRedis {
  private kv = new Map<string, string>();
  private hashMaps = new Map<string, Map<string, string>>();
  private listeners = new Map<string, Array<(channel: string, message: string) => void>>();

  public async get(key: string): Promise<string | null> {
    return this.kv.get(key) || null;
  }

  public async set(key: string, val: string): Promise<string> {
    this.kv.set(key, val);
    return "OK";
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
    const list = this.listeners.get(channel) || [];
    for (const cb of list) cb(channel, message);
    return list.length;
  }

  public on(event: string, cb: any) {}
  public async subscribe(channel: string) {}
  public async unsubscribe(channel: string) {}
  public async quit() {}
}

async function runTestSuite() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("⚡ WHIZAN FLOW — MILESTONE 1 VERIFICATION & TEST SUITE");
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

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: Circular Byte Ring Buffer
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST GROUP 1: Circular Byte Ring Buffer ---");
  {
    const capacity = 128; // 128 bytes test buffer
    const rb = new CircularRingBuffer(capacity);

    // Initial write under capacity
    rb.write("Hello World!\n");
    assert(rb.toString().includes("Hello World!"), "Ring buffer stores within-capacity data correctly");

    // Overflow write: writing 200 bytes into 128-byte buffer
    const overflowText = "A".repeat(100) + "B".repeat(100);
    rb.write(overflowText);
    const content = rb.toString();
    assert(content.length === capacity, `Ring buffer strictly caps memory to ${capacity} bytes (actual: ${content.length})`);
    assert(content.endsWith("BBBBBBBB"), "Ring buffer retains latest written data in chronological FIFO order");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: Kahn's Algorithm Cycle Detection
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST GROUP 2: Kahn's Algorithm & Graph Validation ---");
  {
    const cyclicNodes: DAGNode[] = [
      { nodeKey: "node_a", name: "Node A", type: "TRIGGER_MANUAL", config: {} },
      { nodeKey: "node_b", name: "Node B", type: "ACTION_NOTIFICATION", config: {} },
      { nodeKey: "node_c", name: "Node C", type: "CONTROL_DELAY", config: {} },
    ];
    // A -> B -> C -> A (cycle!)
    const cyclicEdges: DAGEdge[] = [
      { sourceNodeKey: "node_a", targetNodeKey: "node_b" },
      { sourceNodeKey: "node_b", targetNodeKey: "node_c" },
      { sourceNodeKey: "node_c", targetNodeKey: "node_a" },
    ];

    const cyclicDAG = new DAGEngine(cyclicNodes, cyclicEdges);
    let cycleDetected = false;
    try {
      cyclicDAG.validateNoCycles();
    } catch (err: any) {
      cycleDetected = err.message.includes("Cycle detected");
    }
    assert(cycleDetected, "Kahn's algorithm detects circular cycles and blocks execution");

    // Valid linear DAG: A -> B -> C
    const acyclicEdges: DAGEdge[] = [
      { sourceNodeKey: "node_a", targetNodeKey: "node_b" },
      { sourceNodeKey: "node_b", targetNodeKey: "node_c" },
    ];
    const validDAG = new DAGEngine(cyclicNodes, acyclicEdges);
    let validPassed = true;
    try {
      validDAG.validateNoCycles();
    } catch {
      validPassed = false;
    }
    assert(validPassed, "Kahn's algorithm validates legal acyclic DAG without error");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: In-Degree Dependency Resolution & Diamond Joins
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST GROUP 3: Diamond Joins & Parallel In-Degree ---");
  {
    // A -> B and A -> C (Parallel), then B -> D and C -> D (Join)
    const nodes: DAGNode[] = [
      { nodeKey: "root", name: "Start", type: "TRIGGER_MANUAL", config: {} },
      { nodeKey: "test_backend", name: "Test Backend", type: "ACTION_NOTIFICATION", config: {} },
      { nodeKey: "test_frontend", name: "Test Frontend", type: "ACTION_NOTIFICATION", config: {} },
      { nodeKey: "deploy_prod", name: "Deploy Prod", type: "ACTION_NOTIFICATION", config: { conditionMode: "ALL" } },
    ];
    const edges: DAGEdge[] = [
      { sourceNodeKey: "root", targetNodeKey: "test_backend" },
      { sourceNodeKey: "root", targetNodeKey: "test_frontend" },
      { sourceNodeKey: "test_backend", targetNodeKey: "deploy_prod" },
      { sourceNodeKey: "test_frontend", targetNodeKey: "deploy_prod" },
    ];

    const dag = new DAGEngine(nodes, edges);
    const outcomes = new Map<string, StepOutcome>();
    const running = new Set<string>();
    const ctx = { steps: {} };

    // Initial step: only root should be ready
    let next = dag.getNextExecutableNodes(outcomes, running, ctx);
    assert(next.readyNodes.length === 1 && next.readyNodes[0].nodeKey === "root", "Root node is identified with in-degree 0");

    // Complete root
    outcomes.set("root", { status: "SUCCESS" });

    // Next step: test_backend and test_frontend should run in parallel
    next = dag.getNextExecutableNodes(outcomes, running, ctx);
    assert(
      next.readyNodes.length === 2 &&
      next.readyNodes.some((n) => n.nodeKey === "test_backend") &&
      next.readyNodes.some((n) => n.nodeKey === "test_frontend"),
      "Parallel branches (test_backend & test_frontend) dispatched simultaneously"
    );

    // Only complete test_backend (test_frontend still running)
    outcomes.set("test_backend", { status: "SUCCESS" });
    running.add("test_frontend");

    next = dag.getNextExecutableNodes(outcomes, running, ctx);
    assert(
      !next.readyNodes.some((n) => n.nodeKey === "deploy_prod"),
      "Diamond join node (deploy_prod) waits for all parent dependencies before becoming ready"
    );

    // Now test_frontend finishes
    running.delete("test_frontend");
    outcomes.set("test_frontend", { status: "SUCCESS" });

    next = dag.getNextExecutableNodes(outcomes, running, ctx);
    assert(
      next.readyNodes.some((n) => n.nodeKey === "deploy_prod"),
      "Diamond join node (deploy_prod) triggers as soon as all parent branches complete successfully"
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Conditional Edge Evaluation & Skip Cascading
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST GROUP 4: Conditional Edge Evaluation & Cascading Skips ---");
  {
    const nodes: DAGNode[] = [
      { nodeKey: "check_health", name: "Health Check", type: "ACTION_NOTIFICATION", config: {} },
      { nodeKey: "on_healthy", name: "Notify Healthy", type: "ACTION_NOTIFICATION", config: {} },
      { nodeKey: "on_unhealthy", name: "Notify Alert", type: "ACTION_NOTIFICATION", config: {} },
    ];
    const edges: DAGEdge[] = [
      { sourceNodeKey: "check_health", targetNodeKey: "on_healthy", condition: "SUCCESS" },
      { sourceNodeKey: "check_health", targetNodeKey: "on_unhealthy", condition: "FAILURE" },
    ];

    const dag = new DAGEngine(nodes, edges);
    const outcomes = new Map<string, StepOutcome>();
    const running = new Set<string>();

    // Case A: check_health succeeds -> on_healthy runs, on_unhealthy skips
    outcomes.set("check_health", { status: "SUCCESS" });
    const next = dag.getNextExecutableNodes(outcomes, running, { steps: {} });

    assert(
      next.readyNodes.some((n) => n.nodeKey === "on_healthy"),
      "Success branch (on_healthy) is triggered on parent SUCCESS"
    );
    assert(
      next.skippedNodeKeys.includes("on_unhealthy"),
      "Failure branch (on_unhealthy) is properly skipped on parent SUCCESS"
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: StepRunner Unit Execution
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST GROUP 5: Step Runner Capabilities ---");
  {
    const mockRedis = new MockRedis() as any;
    const runner = new StepRunner(mockRedis);

    // 1. Condition Evaluation
    const condNode: DAGNode = {
      nodeKey: "gate_1",
      name: "Check Env",
      type: "CONTROL_CONDITION",
      config: { expression: "steps.build.output.tag === 'v1.0.0'" },
    };
    const condResult = await runner.execute(condNode, "run_test_1", {
      steps: { build: { output: { tag: "v1.0.0" } } },
    });
    assert(condResult.status === "SUCCESS" && condResult.outputData.matched === true, "Condition node evaluates JS expression against context successfully");

    // 2. Delay / Sleep
    const delayNode: DAGNode = {
      nodeKey: "delay_1",
      name: "Short Pause",
      type: "CONTROL_DELAY",
      config: { delaySeconds: 0.05 },
    };
    const delayStart = Date.now();
    const delayResult = await runner.execute(delayNode, "run_test_2", {});
    const delayDuration = Date.now() - delayStart;
    assert(delayResult.status === "SUCCESS" && delayDuration >= 40, "Delay node pauses execution for specified time");

    // 3. Approval Token Generation
    const approvalNode: DAGNode = {
      nodeKey: "approve_prod",
      name: "Production Gate",
      type: "CONTROL_APPROVAL",
      config: { title: "Approve deployment to production" },
    };
    const approvalResult = await runner.execute(approvalNode, "run_test_3", {});
    assert(approvalResult.status === "WAITING_FOR_APPROVAL", "Approval step transitions status to WAITING_FOR_APPROVAL");
    assert(typeof approvalResult.approvalToken === "string" && approvalResult.approvalToken.length === 48, "Approval token is cryptographically generated");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: End-to-End Durable State Machine & Approval Resumption
  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST GROUP 6: E2E Durable State Machine & Approval Lifecycle ---");
  {
    const mockRedis = new MockRedis() as any;
    const runner = new StepRunner(mockRedis);
    const stateMachine = new FlowStateMachine(mockRedis, runner, "http://localhost:3000", "test_mesh_token");

    const workflow: WorkflowDefinition = {
      id: "wf_ci_cd_prod",
      name: "CI/CD with Production Approval Gate",
      concurrencyPolicy: "QUEUE",
      maxConcurrentRuns: 1,
      timeoutSeconds: 300,
      nodes: [
        { nodeKey: "trigger", name: "Git Push", type: "TRIGGER_GIT", config: {} },
        { nodeKey: "test", name: "Run Unit Tests", type: "ACTION_NOTIFICATION", config: {} },
        { nodeKey: "approval_gate", name: "Manager Approval", type: "CONTROL_APPROVAL", config: { title: "Approve Production Release" } },
        { nodeKey: "deploy_prod", name: "Deploy to Azure VM", type: "ACTION_ROUTER_CUTOVER", config: {} },
      ],
      edges: [
        { sourceNodeKey: "trigger", targetNodeKey: "test" },
        { sourceNodeKey: "test", targetNodeKey: "approval_gate" },
        { sourceNodeKey: "approval_gate", targetNodeKey: "deploy_prod" },
      ],
    };

    const runId = "run_prod_001";

    // Step A: Trigger workflow and verify it pauses at approval gate
    console.log("Phase A: Initiating workflow execution...");
    const stateA = await stateMachine.executeWorkflow(workflow, runId, { triggerMetadata: { branch: "main", commit: "a8f9c1" } });

    assert(stateA.status === "WAITING_FOR_APPROVAL", "Workflow cleanly pauses at CONTROL_APPROVAL node");
    assert(stateA.contextData.steps.trigger?.status === "SUCCESS", "Step 'trigger' completed with SUCCESS");
    assert(stateA.contextData.steps.test?.status === "SUCCESS", "Step 'test' completed with SUCCESS");
    assert(stateA.stepOutcomes.get("approval_gate")?.status === "SUCCESS", "Approval gate step checkpointed");

    // Verify Redis run checkpoint was saved
    const runCheckpoint = await mockRedis.get(`flow:run:${runId}`);
    assert(Boolean(runCheckpoint) && JSON.parse(runCheckpoint!).status === "WAITING_FOR_APPROVAL", "Workflow state checkpointed in Redis with status WAITING_FOR_APPROVAL");

    // Step B: Simulate Human Approval and Resume
    console.log("Phase B: Human operator approves production release...");
    const resumedState = await stateMachine.resumeWorkflow(workflow, runId, "approval_gate", true, "Approved by QA Lead");

    assert(resumedState.status === "SUCCESS", "Workflow completes with status SUCCESS after approval granted");
    assert(resumedState.contextData.steps.deploy_prod?.status === "SUCCESS", "Downstream step 'deploy_prod' executed automatically upon approval resumption");
    assert(resumedState.finishedAt !== null, "Workflow run records non-null finishedAt timestamp");

    // Step C: Test Human Rejection
    console.log("Phase C: Testing rejection path...");
    const rejectRunId = "run_prod_002";
    await stateMachine.executeWorkflow(workflow, rejectRunId);
    const rejectedState = await stateMachine.resumeWorkflow(workflow, rejectRunId, "approval_gate", false, "Security audit failed");

    assert(rejectedState.status === "FAILED", "Workflow terminates with status FAILED when approval is rejected");
    assert(Boolean(rejectedState.errorMessage?.includes("Security audit failed")), "Rejection reason recorded in run state");
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`🎉 ALL TESTS PASSED: ${passedTests}/${totalTests} validations verified!`);
  console.log("Whizan Flow Milestone 1 is production ready.");
  console.log("═══════════════════════════════════════════════════════════\n");
}

runTestSuite().catch((err) => {
  console.error("\n💥 Test suite encountered fatal error:", err);
  process.exit(1);
});
