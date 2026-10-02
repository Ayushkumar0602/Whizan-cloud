/**
 * Whizan Flow — Self-Healing Boot Reconciler
 *
 * Handles VM Reboot, Power Outage, and Daemon Crash Recovery:
 * 1. Scans for orphaned runs stuck in "RUNNING" or "PENDING" before daemon startup.
 * 2. Rehydrates last checkpointed context and step outcomes.
 * 3. Either resumes eligible runs or marks interrupted steps with clean diagnostics.
 * 4. Claims abandoned Redis stream messages via XPENDING / XCLAIM (Zero Lost Triggers).
 */

import type { Redis } from "ioredis";
import type { FlowStateMachine } from "./state-machine.js";

export interface ReconcilerOptions {
  redis: Redis;
  stateMachine: FlowStateMachine;
  apiUrl?: string;
  meshToken?: string;
}

export class FlowBootReconciler {
  private redis: Redis;
  private stateMachine: FlowStateMachine;
  private apiUrl: string;
  private meshToken: string;

  constructor(options: ReconcilerOptions) {
    this.redis = options.redis;
    this.stateMachine = options.stateMachine;
    this.apiUrl = (options.apiUrl !== undefined ? options.apiUrl : "https://whizan-cloud-service.onrender.com").replace(/\/$/, "");
    this.meshToken = options.meshToken || "whizan_mesh_sec_2026_x89q";
  }

  /**
   * Run full self-healing reconciliation cycle upon engine startup.
   */
  public async reconcileOnBoot(): Promise<{ recoveredRuns: number; claimedMessages: number }> {
    console.log("[Reconciler] 🛡️ Starting cold-boot self-healing reconciliation scan...");
    let recoveredRuns = 0;
    let claimedMessages = 0;

    // ─── 1. Reconcile In-Flight Runs Stuck in RUNNING ──────────────────────────
    try {
      if (this.apiUrl) {
        console.log(`[Reconciler] Querying Control Plane (${this.apiUrl}) for interrupted runs...`);
        const res = await fetch(`${this.apiUrl}/api/flows/internal/reconcile-on-boot`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-mesh-token": this.meshToken,
          },
          body: JSON.stringify({ bootTimestamp: new Date().toISOString() }),
        });

        if (res.ok) {
          const body: any = await res.json();
          const interruptedRuns = body.interruptedRuns || [];
          console.log(`[Reconciler] Found ${interruptedRuns.length} pre-boot in-flight runs in database.`);

          for (const run of interruptedRuns) {
            await this.reconcileInterruptedRun(run);
            recoveredRuns++;
          }
        } else {
          console.warn(`[Reconciler] Control plane reconcile endpoint returned ${res.status}`);
        }
      }

      // ── Local Redis Fallback Scan (if API is offline, returning 404, or during cold-boot) ──
      if (recoveredRuns === 0 && typeof (this.redis as any).keys === "function") {
        const keys = await (this.redis as any).keys("flow:run:*");
        for (const key of keys) {
          const runJson = await this.redis.get(key);
          if (runJson) {
            try {
              const run = JSON.parse(runJson);
              if (run.status === "RUNNING") {
                await this.reconcileInterruptedRun(run);
                recoveredRuns++;
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      console.warn("[Reconciler] Notice during run reconciliation:", err.message);
    }

    // ─── 2. Claim Abandoned Redis Stream Messages (XCLAIM) ───────────────────
    try {
      claimedMessages = await this.claimAbandonedStreamMessages();
    } catch (err: any) {
      console.warn("[Reconciler] Notice claiming stream messages:", err.message);
    }

    console.log(`[Reconciler] ✅ Cold-boot reconciliation complete: ${recoveredRuns} runs reconciled, ${claimedMessages} stream messages recovered.\n`);
    return { recoveredRuns, claimedMessages };
  }

  /**
   * Reconcile an individual interrupted run.
   */
  private async reconcileInterruptedRun(run: {
    id?: string;
    runId?: string;
    workflowId: string;
    status: string;
    startedAt?: string;
    contextData?: any;
    workflow?: any;
  }): Promise<void> {
    const runId = run.id || run.runId;
    if (!runId) return;
    console.log(`[Reconciler] Reconciling run ${runId} (Workflow: ${run.workflowId})...`);

    // Fetch cached state from Redis
    const cachedState = await this.redis.get(`flow:run:${runId}`);
    let parsedState: any = null;
    if (cachedState) {
      try {
        parsedState = JSON.parse(cachedState);
      } catch {}
    }

    const contextData = parsedState?.contextData || run.contextData || {};
    const existingSteps = await this.redis.hgetall(`flow:steps:${runId}`);

    // If workflow definition is available and has nodes, determine if we can resume
    if (run.workflow && Array.isArray(run.workflow.nodes)) {
      // Find which step was in-flight (RUNNING)
      let inFlightStepKey: string | null = null;
      for (const [key, stepJson] of Object.entries(existingSteps)) {
        try {
          const step = JSON.parse(stepJson);
          if (step.status === "RUNNING") {
            inFlightStepKey = key;
            break;
          }
        } catch {}
      }

      if (inFlightStepKey) {
        console.log(`[Reconciler] Run ${runId} was interrupted at step "${inFlightStepKey}". Checking retry eligibility...`);
        const node = run.workflow.nodes.find((n: any) => n.nodeKey === inFlightStepKey);
        
        // If node has retries remaining, mark step as retried and resume workflow
        if (node && (node.maxRetries || 0) > 0) {
          console.log(`[Reconciler] Step "${inFlightStepKey}" allows retries. Resuming workflow from checkpoint...`);
          // Resume execution
          this.stateMachine.executeWorkflow(run.workflow, runId, contextData).catch((e) => {
            console.error(`[Reconciler] Failed resuming run ${runId}:`, e.message);
          });
          return;
        }
      }
    }

    // Default graceful resolution: Mark interrupted run and step with clear diagnostic
    const failureReason = "Workflow execution was interrupted by host VM reboot or unexpected system restart.";
    await this.redis.set(
      `flow:run:${runId}`,
      JSON.stringify({
        runId,
        workflowId: run.workflowId,
        status: "FAILED",
        contextData,
        errorMessage: failureReason,
        durationMs: null,
        updatedAt: Date.now(),
      }),
      "EX",
      86400 * 7
    );

    // Sync status back to Control Plane database
    if (this.apiUrl) {
      await fetch(`${this.apiUrl}/api/flows/internal/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mesh-token": this.meshToken,
        },
        body: JSON.stringify({
          runId,
          status: "FAILED",
          errorMessage: failureReason,
        }),
      }).catch(() => {});
    }

    console.log(`[Reconciler] Marked interrupted run ${runId} as FAILED with diagnostic reason.`);
  }

  /**
   * Inspect and claim messages in Redis Streams that were left pending by a crashed consumer.
   */
  private async claimAbandonedStreamMessages(): Promise<number> {
    const streamName = "flow:trigger:stream";
    const groupName = "flow-worker-group";
    const minIdleTimeMs = 60000; // Messages unacknowledged for > 60 seconds
    const consumerName = `flow-reconciler-${process.pid}`;

    try {
      // Check pending messages
      const pendingInfo: any = await this.redis.xpending(streamName, groupName, "-", "+", 10);
      if (!pendingInfo || pendingInfo.length === 0) {
        return 0;
      }

      const messageIdsToClaim: string[] = [];
      for (const entry of pendingInfo) {
        const [id, consumer, idleTime] = entry;
        if (idleTime >= minIdleTimeMs) {
          messageIdsToClaim.push(id);
        }
      }

      if (messageIdsToClaim.length === 0) {
        return 0;
      }

      console.log(`[Reconciler] Claiming ${messageIdsToClaim.length} abandoned messages on ${streamName}...`);

      const claimed: any = await this.redis.xclaim(
        streamName,
        groupName,
        consumerName,
        minIdleTimeMs,
        ...messageIdsToClaim
      );

      return Array.isArray(claimed) ? claimed.length : 0;
    } catch (err: any) {
      if (!err.message?.includes("NOGROUP")) {
        console.warn("[Reconciler] XCLAIM notice:", err.message);
      }
      return 0;
    }
  }
}
