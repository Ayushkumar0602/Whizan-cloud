import type { Redis } from "ioredis";
import { DAGEngine, type DAGNode, type DAGEdge, type StepOutcome } from "./dag-engine.js";
import { StepRunner, type StepExecutionResult } from "./step-runner.js";

export interface WorkflowDefinition {
  id: string;
  name: string;
  concurrencyPolicy: "FORBID" | "QUEUE" | "ALLOW" | "REPLACE";
  maxConcurrentRuns: number;
  timeoutSeconds: number;
  nodes: DAGNode[];
  edges: DAGEdge[];
}

export interface WorkflowRunState {
  runId: string;
  workflowId: string;
  status: "PENDING" | "RUNNING" | "WAITING_FOR_APPROVAL" | "PAUSED" | "SUCCESS" | "FAILED" | "CANCELLED" | "TIMED_OUT";
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  contextData: Record<string, any>;
  errorMessage: string | null;
  stepOutcomes: Map<string, StepOutcome>;
}

export class FlowStateMachine {
  private redis: Redis;
  private runner: StepRunner;
  private apiUrl: string;
  private meshToken: string;

  constructor(
    redis: Redis,
    runner: StepRunner,
    apiUrl = "https://whizan-cloud-service.onrender.com",
    meshToken = process.env.INTERNAL_MESH_TOKEN || process.env.INTERNAL_SECRET || process.env.JWT_SECRET || ""
  ) {
    this.redis = redis;
    this.runner = runner;
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.meshToken = meshToken;
  }

  /**
   * Execute an entire workflow DAG from start to finish (or until waiting for human approval).
   */
  public async executeWorkflow(
    workflow: WorkflowDefinition,
    runId: string,
    initialContext: Record<string, any> = {},
    existingOutcomes?: Map<string, StepOutcome>
  ): Promise<WorkflowRunState> {
    const startTime = Date.now();
    const dag = new DAGEngine(workflow.nodes, workflow.edges);

    // Validate graph contains no cycles
    dag.validateNoCycles();

    const contextData: Record<string, any> = {
      workflowId: workflow.id,
      workflowName: workflow.name,
      runId,
      steps: {},
      ...initialContext,
    };

    const stepOutcomes = existingOutcomes || new Map<string, StepOutcome>();
    const currentlyRunning = new Set<string>();

    let isWaitingForApproval = false;
    let workflowStatus: WorkflowRunState["status"] = "RUNNING";
    let workflowError: string | null = null;

    // Checkpoint initial state
    await this.checkpointRun(runId, workflow.id, "RUNNING", contextData);

    try {
      while (true) {
        // Query which nodes are ready to run
        const { readyNodes, skippedNodeKeys } = dag.getNextExecutableNodes(
          stepOutcomes,
          currentlyRunning,
          contextData
        );

        // Mark skipped nodes
        for (const skippedKey of skippedNodeKeys) {
          stepOutcomes.set(skippedKey, {
            status: "SKIPPED",
            exitCode: null,
            httpStatusCode: null,
            outputData: null,
            errorMessage: "Skipped due to upstream condition or failure.",
          });
          const skippedNode = workflow.nodes.find((n) => n.nodeKey === skippedKey);
          await this.checkpointStep(
            runId,
            skippedKey,
            "SKIPPED",
            null,
            "Skipped by condition gate.",
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            skippedNode?.type
          );
        }

        // If no nodes are running and no nodes are ready to run: we're done!
        if (readyNodes.length === 0 && currentlyRunning.size === 0) {
          break;
        }

        // If no nodes are ready right now, wait briefly for in-flight steps
        if (readyNodes.length === 0) {
          await new Promise((r) => setTimeout(r, 50));
          continue;
        }

        // Dispatch all ready nodes in parallel
        const promises = readyNodes.map(async (node) => {
          currentlyRunning.add(node.nodeKey);
          await this.checkpointStep(runId, node.nodeKey, "RUNNING", undefined, undefined, undefined, undefined, undefined, undefined, undefined, node.type);

          try {
            const result: StepExecutionResult = await this.runner.execute(
              node,
              runId,
              contextData
            );

            stepOutcomes.set(node.nodeKey, {
              status: result.status === "WAITING_FOR_APPROVAL" ? "SUCCESS" : (result.status as any),
              exitCode: result.exitCode,
              httpStatusCode: result.httpStatusCode,
              outputData: result.outputData,
              errorMessage: result.errorMessage,
            });

            // Store step output into shared context
            contextData.steps[node.nodeKey] = {
              status: result.status,
              exitCode: result.exitCode,
              httpStatusCode: result.httpStatusCode,
              output: result.outputData,
              durationMs: result.durationMs,
            };

            await this.checkpointStep(
              runId,
              node.nodeKey,
              result.status === "WAITING_FOR_APPROVAL" ? "WAITING_FOR_APPROVAL" : (result.status as any),
              result.outputData,
              result.errorMessage,
              result.stdout,
              result.exitCode,
              result.httpStatusCode,
              result.durationMs,
              result.approvalToken,
              node.type
            );

            if (result.status === "WAITING_FOR_APPROVAL") {
              isWaitingForApproval = true;
            }
          } catch (err: any) {
            stepOutcomes.set(node.nodeKey, {
              status: "FAILED",
              errorMessage: err.message,
            });
            await this.checkpointStep(runId, node.nodeKey, "FAILED", null, err.message, undefined, undefined, undefined, undefined, undefined, node.type);
          } finally {
            currentlyRunning.delete(node.nodeKey);
          }
        });

        // Wait for current batch
        await Promise.all(promises);

        // If a node entered WAITING_FOR_APPROVAL, pause workflow execution
        if (isWaitingForApproval) {
          workflowStatus = "WAITING_FOR_APPROVAL";
          break;
        }
      }

      // Final evaluation of workflow outcome
      if (!isWaitingForApproval) {
        let hasFailures = false;
        for (const [key, outcome] of stepOutcomes) {
          const node = workflow.nodes.find((n) => n.nodeKey === key);
          if (outcome.status === "FAILED" && !node?.continueOnError) {
            hasFailures = true;
            workflowError = outcome.errorMessage || `Step "${key}" failed.`;
            break;
          }
        }
        workflowStatus = hasFailures ? "FAILED" : "SUCCESS";
      }
    } catch (err: any) {
      workflowStatus = "FAILED";
      workflowError = err.message || "Fatal error during DAG execution";
    }

    const durationMs = Date.now() - startTime;
    const finishedAt = isWaitingForApproval ? null : new Date().toISOString();

    const finalState: WorkflowRunState = {
      runId,
      workflowId: workflow.id,
      status: workflowStatus,
      startedAt: new Date(startTime).toISOString(),
      finishedAt,
      durationMs,
      contextData,
      errorMessage: workflowError,
      stepOutcomes,
    };

    await this.checkpointRun(runId, workflow.id, workflowStatus, contextData, workflowError, durationMs);

    return finalState;
  }

  /**
   * Resume a suspended workflow run following human approval or rejection.
   */
  public async resumeWorkflow(
    workflow: WorkflowDefinition,
    runId: string,
    approvedNodeKey: string,
    approved: boolean,
    comments?: string
  ): Promise<WorkflowRunState> {
    console.log(`[StateMachine] Resuming run ${runId} at node ${approvedNodeKey} (Approved: ${approved})`);

    // 1. Retrieve existing context from Redis
    const cachedRun = await this.redis.get(`flow:run:${runId}`);
    let contextData: Record<string, any> = {};
    if (cachedRun) {
      try {
        const parsed = JSON.parse(cachedRun);
        contextData = parsed.contextData || {};
      } catch {}
    }

    // 2. Retrieve existing step outcomes
    const existingSteps = await this.redis.hgetall(`flow:steps:${runId}`);
    const stepOutcomes = new Map<string, StepOutcome>();
    for (const [key, stepJson] of Object.entries(existingSteps)) {
      try {
        const step = JSON.parse(stepJson);
        stepOutcomes.set(key, {
          status: step.status,
          exitCode: step.exitCode,
          httpStatusCode: step.httpStatusCode,
          outputData: step.outputData,
          errorMessage: step.errorMessage,
        });
      } catch {}
    }

    if (!approved) {
      const reason = comments ? `Approval rejected: ${comments}` : "Approval rejected by human operator";
      stepOutcomes.set(approvedNodeKey, {
        status: "FAILED",
        errorMessage: reason,
      });
      await this.checkpointStep(runId, approvedNodeKey, "FAILED", null, reason);
      await this.checkpointRun(runId, workflow.id, "FAILED", contextData, reason);

      return {
        runId,
        workflowId: workflow.id,
        status: "FAILED",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: null,
        contextData,
        errorMessage: reason,
        stepOutcomes,
      };
    }

    // Approved: mark approval node as SUCCESS and update context
    stepOutcomes.set(approvedNodeKey, {
      status: "SUCCESS",
      outputData: { approved: true, approvedAt: new Date().toISOString(), comments },
    });
    if (!contextData.steps) contextData.steps = {};
    contextData.steps[approvedNodeKey] = {
      status: "SUCCESS",
      output: { approved: true, comments },
    };

    await this.checkpointStep(runId, approvedNodeKey, "SUCCESS", { approved: true, comments });

    // Continue executing downstream DAG nodes
    return this.executeWorkflow(workflow, runId, contextData, stepOutcomes);
  }

  // ─── CHECKPOINTING HELPERS ──────────────────────────────────────────────────
  private async checkpointRun(
    runId: string,
    workflowId: string,
    status: string,
    contextData: Record<string, any>,
    errorMessage: string | null = null,
    durationMs: number | null = null
  ) {
    try {
      const statePayload = JSON.stringify({
        runId,
        workflowId,
        status,
        contextData,
        errorMessage,
        durationMs,
        updatedAt: Date.now(),
      });
      await this.redis.set(`flow:run:${runId}`, statePayload, "EX", 86400 * 7);
      await this.redis.publish(`flow:updates:${runId}`, statePayload);

      // Async sync to Control Plane API
      this.syncToControlPlane({
        runId,
        status,
        contextData,
        errorMessage,
        durationMs,
      }).catch(() => {});
    } catch (err: any) {
      console.warn(`[StateMachine] Redis checkpoint error for run ${runId}:`, err.message);
    }
  }

  private async checkpointStep(
    runId: string,
    nodeKey: string,
    status: string,
    outputData?: any,
    errorMessage?: string | null,
    stdout?: string,
    exitCode?: number | null,
    httpStatusCode?: number | null,
    durationMs?: number,
    approvalToken?: string,
    nodeType?: string
  ) {
    try {
      const stepPayload = JSON.stringify({
        runId,
        nodeKey,
        nodeType,
        status,
        outputData,
        errorMessage,
        stdout,
        exitCode,
        httpStatusCode,
        durationMs,
        approvalToken,
        updatedAt: Date.now(),
      });
      await this.redis.hset(`flow:steps:${runId}`, nodeKey, stepPayload);
      await this.redis.publish(`flow:step_updates:${runId}`, stepPayload);

      // Async sync to Control Plane API
      this.syncToControlPlane({
        runId,
        stepUpdates: [
          {
            nodeKey,
            nodeType,
            status,
            outputData,
            errorMessage,
            stdout,
            exitCode,
            httpStatusCode,
            durationMs,
            approvalToken,
          },
        ],
      }).catch(() => {});
    } catch (err: any) {
      console.warn(`[StateMachine] Step checkpoint error for ${nodeKey}:`, err.message);
    }
  }

  private async syncToControlPlane(payload: Record<string, any>): Promise<void> {
    if (!this.apiUrl) return;
    try {
      await fetch(`${this.apiUrl}/api/flows/internal/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mesh-token": this.meshToken,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      // Non-blocking sync error
    }
  }
}
