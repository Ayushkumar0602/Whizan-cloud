import type { Redis } from "ioredis";
import crypto from "crypto";
import { FlowStateMachine, type WorkflowDefinition } from "./state-machine.js";

export class FlowStreamConsumer {
  private redis: Redis;
  private redisStream: Redis;
  private redisSub: Redis;
  private stateMachine: FlowStateMachine;
  private isRunning: boolean = false;
  private consumerName: string;
  private apiUrl: string;
  private meshToken: string;

  constructor(
    redis: Redis,
    redisStream: Redis,
    redisSub: Redis,
    stateMachine: FlowStateMachine,
    apiUrl = process.env.API_URL || process.env.CONTROL_PLANE_URL || "https://api.whizan.cloud",
    meshToken = process.env.INTERNAL_MESH_TOKEN || process.env.INTERNAL_SECRET || process.env.JWT_SECRET || ""
  ) {
    this.redis = redis;
    this.redisStream = redisStream;
    this.redisSub = redisSub;
    this.stateMachine = stateMachine;
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.meshToken = meshToken;
    this.consumerName = `flow-worker-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const groupName = "flow-worker-group";
    const streamName = "flow:trigger:stream";

    // 1. Subscribe to human approval events via Pub/Sub
    await this.setupApprovalSubscriber();

    // 2. Create consumer group if not already created
    try {
      await this.redis.xgroup("CREATE", streamName, groupName, "$", "MKSTREAM");
      console.log(`[FlowConsumer] Created consumer group "${groupName}" on ${streamName}`);
    } catch (err: any) {
      if (!err.message?.includes("BUSYGROUP")) {
        console.warn("[FlowConsumer] Notice creating group:", err.message);
      }
    }

    console.log(`[FlowConsumer] 🎧 Listening on ${streamName} as ${this.consumerName}`);

    // 3. Process Redis Stream loop
    while (this.isRunning) {
      try {
        const streamResults: any = await this.redisStream.xreadgroup(
          "GROUP",
          groupName,
          this.consumerName,
          "COUNT",
          5,
          "BLOCK",
          2000,
          "STREAMS",
          streamName,
          ">"
        );

        if (streamResults && streamResults.length > 0) {
          for (const [stream, messages] of streamResults) {
            for (const [msgId, fields] of messages) {
              const data: Record<string, string> = {};
              for (let i = 0; i < fields.length; i += 2) {
                data[fields[i]] = fields[i + 1];
              }

              if (data.workflowId && data.runId) {
                console.log(`[FlowConsumer] ⚡ Ingested workflow run ${data.runId} for workflow ${data.workflowId}`);
                await this.processWorkflowTrigger(data.workflowId, data.runId, data.triggerMetadata);
              }

              // Acknowledge stream message
              await this.redis.xack(streamName, groupName, msgId).catch(() => {});
            }
          }
        }
      } catch (err: any) {
        if (!this.isRunning) break;
        console.error("[FlowConsumer] Stream read error:", err.message);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    await this.redisSub.unsubscribe("flow:approval_events").catch(() => {});
    console.log("[FlowConsumer] Stopped.");
  }

  /**
   * Listen to approval events and resume suspended workflows instantly.
   */
  private async setupApprovalSubscriber(): Promise<void> {
    try {
      await this.redisSub.subscribe("flow:approval_events");
      this.redisSub.on("message", async (channel, message) => {
        if (channel === "flow:approval_events") {
          try {
            const { runId, nodeKey, approved, comments } = JSON.parse(message);
            console.log(`[FlowConsumer] 📩 Received approval event for run ${runId} [Node: ${nodeKey}, Approved: ${approved}]`);

            // Fetch run state to determine workflowId
            const cachedRun = await this.redis.get(`flow:run:${runId}`);
            let workflowId: string | null = null;
            if (cachedRun) {
              try {
                workflowId = JSON.parse(cachedRun).workflowId;
              } catch {}
            }

            if (!workflowId) {
              console.warn(`[FlowConsumer] Could not resolve workflowId for approval resume on run ${runId}`);
              return;
            }

            const workflow = await this.fetchWorkflowDefinition(workflowId);
            if (!workflow) {
              console.error(`[FlowConsumer] Cannot resume: definition for workflow ${workflowId} unavailable`);
              return;
            }

            await this.stateMachine.resumeWorkflow(workflow, runId, nodeKey, Boolean(approved), comments);
          } catch (err: any) {
            console.error("[FlowConsumer] Error processing approval event:", err.message);
          }
        }
      });
      console.log(`[FlowConsumer] 👂 Subscribed to flow:approval_events`);
    } catch (err: any) {
      console.warn("[FlowConsumer] Error setting up approval subscriber:", err.message);
    }
  }

  /**
   * Process an ingested workflow trigger.
   */
  private async processWorkflowTrigger(workflowId: string, runId: string, triggerMetadataStr?: string) {
    try {
      const workflow = await this.fetchWorkflowDefinition(workflowId);
      if (!workflow) {
        console.warn(`[FlowConsumer] Workflow ${workflowId} definition could not be resolved.`);
        return;
      }

      let triggerMetadata = {};
      if (triggerMetadataStr) {
        try {
          triggerMetadata = JSON.parse(triggerMetadataStr);
        } catch {}
      }

      // Execute workflow through state machine
      await this.stateMachine.executeWorkflow(workflow, runId, { triggerMetadata });
    } catch (err: any) {
      console.error(`[FlowConsumer] Error executing workflow ${workflowId} (run: ${runId}):`, err.message);
    }
  }

  /**
   * Resilient 3-tier workflow definition fetch (Redis Cache -> Control Plane API fallback).
   */
  private async fetchWorkflowDefinition(workflowId: string): Promise<WorkflowDefinition | null> {
    // 1. Try Redis cache
    try {
      const cached = await this.redis.get(`flow:def:${workflowId}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}

    // 2. Fallback to Control Plane API (Disaster recovery / cache miss)
    if (!this.apiUrl) return null;
    try {
      console.log(`[FlowConsumer] Fetching workflow ${workflowId} from Control Plane (${this.apiUrl})...`);
      const res = await fetch(`${this.apiUrl}/api/flows/internal/workflows/${workflowId}`, {
        headers: { "x-mesh-token": this.meshToken },
      });
      if (res.ok) {
        const data: any = await res.json();
        if (data.workflow) {
          // Rehydrate cache in Redis
          await this.redis.set(`flow:def:${workflowId}`, JSON.stringify(data.workflow), "EX", 86400 * 7);
          return data.workflow;
        }
      }
    } catch (err: any) {
      console.warn(`[FlowConsumer] Control plane fetch failed for workflow ${workflowId}:`, err.message);
    }

    return null;
  }
}
