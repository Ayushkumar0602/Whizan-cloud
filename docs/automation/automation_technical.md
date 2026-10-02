# Whizan Flow — Technical Architecture & Low-Level Design (LLD) for Next-Gen Build & Workflow Automation

> **Document Status:** Comprehensive System Architecture & Low-Level Design Specification (LLD)  
> **Subsystem Scope:** Whizan Flow Automation Engine (`apps/flow-engine`, `apps/build-worker`, `apps/edge-router`, `apps/api`, `packages/db`, `@whizan/mcp-devops`, `apps/dashboard`)  
> **Target Platform:** Node.js 20+, TypeScript, Redis 7+ (Streams, Consumer Groups & Pub/Sub), PostgreSQL 16 (via PgBouncer), Docker Engine Socket (`/var/run/docker.sock`), V8 Function Runtime (`:9090`), Azure Linux VM

---

## 🏗️ 1. Architectural Philosophy & Unified Automation Topology

Modern software delivery and operations have been artificially fragmented into two disconnected silos:
1. **Developer CI/CD Pipelines (Code-Heavy & Rigid):** Tools like GitHub Actions, GitLab CI, and CircleCI excel at compiling code and building Docker images, but are painfully rigid. They rely on verbose, un-debuggable YAML files, have slow cold runners, lack runtime cloud awareness, and cannot orchestrate application state post-deployment.
2. **Business & Integration Workflow Engines (Visual & Compute-Blind):** Platforms like n8n, Zapier, and Make provide intuitive drag-and-drop canvases, branching logic, and SaaS connectors. However, they are completely compute-blind: they cannot build a Docker container, run an `alembic` or `prisma` migration inside a private container, warm up an edge cache, or atomically switch an edge router's traffic.

**Whizan Flow** unifies these two paradigms into a single, high-performance, event-driven orchestration engine. It allows developers to build, test, deploy, migrate, monitor, and automate anything from either a **visual drag-and-drop node canvas** (n8n-style) or **declarative TypeScript/YAML code** (Temporal/GitHub Actions-style) with bidirectional real-time synchronization.

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   WHIZAN FLOW ENGINE TOPOLOGY                                     │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                     TRIGGER INGESTION LAYER                                       │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐  ┌────────────────────────┐  │
│  │ Git Webhook       │  │ Cron / Time       │  │ Inbound Webhook   │  │ Edge Function / Event  │  │
│  │ (Push, PR, Tag)   │  │ (Zero-Idle ZSET)  │  │ (HMAC Signed)     │  │ (Mesh Bus Pub/Sub)     │  │
│  └─────────┬─────────┘  └─────────┬─────────┘  └─────────┬─────────┘  └───────────┬────────────┘  │
│            │                      │                      │                        │               │
│            ▼                      ▼                      ▼                        ▼               │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ REDIS INGESTION STREAM: `flow:trigger:stream` (Event Buffer with Deduplication Hash)        │  │
│  └──────────────────────────────────────────────┬──────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
│                                                 ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ FLOW ORCHESTRATION ENGINE (Durable DAG State Machine)                                       │  │
│  │ • Topological Sorter (Kahn's Algorithm) & Cycle Detection                                  │  │
│  │ • Step Dependency Resolver (Parallel Branching & Convergence Joins)                         │  │
│  │ • State Machine Manager: State Checkpointing & Resume on Crash                              │  │
│  │ • Step Memoization Engine: Replay failed steps without rebuilding prior containers          │  │
│  │ • Suspended Execution Sleepers: 0 MB RAM / 0% CPU while waiting for timers or approvals     │  │
│  └──────────────────────────────────────────────┬──────────────────────────────────────────────┘  │
│                                                 │ Dispatches Ready Steps                          │
│                                                 ▼                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ REDIS STEP QUEUE STREAM: `flow:step:stream` (Group: `flow-worker-group`)                    │  │
│  └──────────────────────────────────────────────┬──────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
│                                                 ▼                                                 │
│                              HETEROGENEOUS WORKER EXECUTION FLEET                                 │
│                                                                                                   │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌──────────────────────────────────────┐  │
│  │ 🐳 BUILD & RUNNER     │  │ ⚡ V8 ISOLATE RUNNER  │  │ 🔒 PRIVATE MESH RUNNER               │  │
│  │ • Multi-Stage Build   │  │ • Edge Code Runner    │  │ • Internal Microservice Call         │  │
│  │ • Docker Engine Socket│  │ • Data Transformation │  │ • Direct Container Exec (CLI)        │  │
│  │ • Layer Cache Volumes │  │ • Sub-5ms Startup     │  │ • Private VPC / Mesh Routing         │  │
│  └───────────────────────┘  └───────────────────────┘  └──────────────────────────────────────┘  │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌──────────────────────────────────────┐  │
│  │ 🧠 AI / LLM AGENT     │  │ 🌐 HTTP / WEBHOOK     │  │ 🛑 HUMAN-IN-THE-LOOP                 │  │
│  │ • Gemini 3.5 Flash    │  │ • Signed External API │  │ • Slack / Discord Interactive Button │  │
│  │ • Security Audit Node │  │ • Payload Mapping     │  │ • Dashboard 1-Click Approve / Reject │  │
│  │ • Auto Release Notes  │  │ • Exponential Retry   │  │ • Suspended Async Checkpoint Token   │  │
│  └───────────────────────┘  └───────────────────────┘  └──────────────────────────────────────┘  │
│                                                 │                                                 │
│                                                 ▼ Live Log Frames & State Updates                 │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│  TELEMETRY & ATOMIC DEPLOYMENT CUTOVER                                                            │
│  ├── 64KB Circular Ring Buffer per Step ──► Redis Pub/Sub: `flow:logs:<runId>:<stepId>` (SSE)     │
│  ├── Batch Telemetry Flusher            ──► PostgreSQL: `WorkflowRun` & `WorkflowStepRun`         │
│  └── Atomic Edge Router Cutover         ──► Caddy/Nginx Live Route Reload (Zero Downtime)         │
│       └─ Failure Detected               ──► Sub-50ms Instant Rollback to Previous Deployment ID   │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 💾 2. Relational Database Schema (Prisma Models Specification)

To ensure persistent tracking of complex Directed Acyclic Graphs (DAGs), state snapshots, execution histories, step memoization, and human approval gates, the following models are integrated into `packages/db/prisma/schema.prisma`:

```prisma
// ─────────────────────────────────────────
//  WORKFLOW DEFINITION (Visual + Code DAG)
// ─────────────────────────────────────────
model Workflow {
  id              String             @id @default(uuid())
  userId          String             @map("user_id")
  projectId       String?            @map("project_id") // Optional link to a specific Web Project or Service
  name            String             // e.g. "Production CI/CD with Smoke Tests & Slack Alert"
  description     String?            @db.Text
  slug            String             // URL and CLI friendly identifier
  
  // Storage of Visual Canvas Layout (React Flow nodes & edges coordinates)
  visualConfig    Json               @map("visual_config")
  // Declarative Code Representation (Lossless Bidirectional Sync with YAML / TypeScript DSL)
  codeDefinition  String             @db.Text @map("code_definition")
  
  enabled         Boolean            @default(true)
  isTemplate      Boolean            @default(false) @map("is_template")
  category        String             @default("CUSTOM") // "DEPLOYMENT", "INTEGRATION", "DATA_PIPELINE", "AI_AGENT"
  
  // Concurrency & Resilience
  concurrencyPolicy WorkflowConcurrency @default(QUEUE) @map("concurrency_policy")
  maxConcurrentRuns Int                @default(1) @map("max_concurrent_runs")
  timeoutSeconds    Int                @default(3600) @map("timeout_seconds") // Default 1 hour max run
  
  createdAt       DateTime           @default(now()) @map("created_at")
  updatedAt       DateTime           @updatedAt @map("updated_at")

  // Relationships
  nodes           WorkflowNode[]
  edges           WorkflowEdge[]
  triggers        WorkflowTrigger[]
  runs            WorkflowRun[]

  @@unique([userId, slug])
  @@index([userId, enabled])
  @@map("workflows")
}

enum WorkflowConcurrency {
  FORBID           // Skip new run if a run is currently active
  QUEUE            // Queue up runs and execute sequentially
  ALLOW            // Run simultaneously in parallel
  REPLACE          // Cancel active run and start newest immediately
}

// ─────────────────────────────────────────
//  WORKFLOW NODES (Steps in the DAG)
// ─────────────────────────────────────────
model WorkflowNode {
  id              String             @id @default(uuid())
  workflowId      String             @map("workflow_id")
  nodeKey         String             @map("node_key") // Unique within workflow (e.g. "build_docker", "slack_notify")
  name            String             // Display name in UI
  type            WorkflowNodeType   @map("type")
  
  // Node-specific configuration payload
  config          Json
  
  // Execution constraints
  timeoutSeconds  Int                @default(600) @map("timeout_seconds")
  maxRetries      Int                @default(0) @map("max_retries")
  retryDelaySec   Int                @default(5) @map("retry_delay_sec")
  continueOnError Boolean            @default(false) @map("continue_on_error")
  
  // Visual layout position on React Flow Canvas
  positionX       Float              @default(0) @map("position_x")
  positionY       Float              @default(0) @map("position_y")

  workflow        Workflow           @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  stepRuns        WorkflowStepRun[]

  @@unique([workflowId, nodeKey])
  @@map("workflow_nodes")
}

enum WorkflowNodeType {
  // Triggers (Source Nodes)
  TRIGGER_GIT                  // GitHub / GitLab commit push, PR open, tag release
  TRIGGER_CRON                 // Time-based execution
  TRIGGER_WEBHOOK              // Incoming authenticated HTTPS webhook
  TRIGGER_MANUAL               // 1-Click UI or MCP Devops dispatch
  
  // Compute & Build Actions
  ACTION_WORKSPACE_ANALYZE     // AI analysis of repository stack & dependencies
  ACTION_BUILD_CONTAINER       // Multi-stage Docker build via VM Docker Socket
  ACTION_DEPLOY_EDGE           // Deploy static/SSR web app to Edge Router
  ACTION_DEPLOY_SERVICE        // Launch backend Docker microservice in mesh
  ACTION_CONTAINER_EXEC        // Run CLI command inside container (e.g. prisma migrate)
  ACTION_RUN_TESTS             // Execute unit/integration test suites
  
  // Network & Health
  ACTION_HEALTH_PROBE          // Ping HTTP endpoint with status & latency checks
  ACTION_ROUTER_CUTOVER        // Zero-downtime routing cutover with canary %
  ACTION_AUTO_ROLLBACK         // Instant rollback to previous deployment
  
  // Integrations & Business Logic
  ACTION_V8_FUNCTION           // Execute custom JS/TS script inside V8 isolate (<5ms)
  ACTION_HTTP_REQUEST          // Call external REST API (GET, POST, PUT, DELETE)
  ACTION_DATABASE_QUERY        // Execute SQL against provisioned Whizan Postgres DB
  ACTION_AI_PROMPT             // Call Gemini 3.5 Flash for release notes or code review
  ACTION_NOTIFICATION          // Send alert to Slack, Discord, Email, or Webhook
  
  // Flow Control & Human-in-the-Loop
  CONTROL_CONDITION            // If / Else branching based on expressions
  CONTROL_PARALLEL             // Fork into parallel branches
  CONTROL_JOIN                 // Wait for all branches or any branch to finish
  CONTROL_DELAY                // Pause execution for N minutes/hours (0% CPU sleep)
  CONTROL_APPROVAL             // Human approval gate (Slack / Dashboard button)
}

// ─────────────────────────────────────────
//  WORKFLOW EDGES (Dependencies & Branching)
// ─────────────────────────────────────────
model WorkflowEdge {
  id              String             @id @default(uuid())
  workflowId      String             @map("workflow_id")
  sourceNodeKey   String             @map("source_node_key")
  targetNodeKey   String             @map("target_node_key")
  
  // Branch conditions: e.g. "DEFAULT", "SUCCESS", "FAILURE", or custom expression `{{step.exitCode === 0}}`
  condition       String?            @default("SUCCESS")
  
  workflow        Workflow           @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  @@index([workflowId, sourceNodeKey])
  @@map("workflow_edges")
}

// ─────────────────────────────────────────
//  WORKFLOW EXECUTION RUN
// ─────────────────────────────────────────
model WorkflowRun {
  id              String             @id @default(uuid())
  workflowId      String             @map("workflow_id")
  triggerSource   String             @map("trigger_source") // "GIT_PUSH", "WEBHOOK", "CRON", "MANUAL"
  triggerMetadata Json?              @map("trigger_metadata") // Commit SHA, author, PR title, branch
  
  status          WorkflowRunStatus  @default(PENDING)
  
  startedAt       DateTime           @default(now()) @map("startedAt")
  finishedAt      DateTime?          @map("finished_at")
  durationMs      Int?               @map("duration_ms")
  
  // Checkpoint State Store: JSON object of accumulated node outputs for downstream context
  contextData     Json               @default("{}") @map("context_data")
  
  errorMessage    String?            @db.Text @map("error_message")
  triggeredBy     String?            @map("triggered_by") // User ID or "SYSTEM"

  workflow        Workflow           @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  stepRuns        WorkflowStepRun[]
  approvals       WorkflowApproval[]

  @@index([workflowId, status])
  @@index([startedAt])
  @@map("workflow_runs")
}

enum WorkflowRunStatus {
  PENDING
  RUNNING
  WAITING_FOR_APPROVAL
  PAUSED
  SUCCESS
  FAILED
  CANCELLED
  TIMED_OUT
}

// ─────────────────────────────────────────
//  STEP EXECUTION RECORD (Per Node Execution)
// ─────────────────────────────────────────
model WorkflowStepRun {
  id              String             @id @default(uuid())
  runId           String             @map("run_id")
  nodeId          String             @map("node_id")
  nodeKey         String             @map("node_key")
  nodeType        WorkflowNodeType   @map("node_type")
  
  status          WorkflowRunStatus  @default(PENDING)
  
  startedAt       DateTime           @default(now()) @map("started_at")
  finishedAt      DateTime?          @map("finished_at")
  durationMs      Int?               @map("duration_ms")
  
  // Execution Outputs & Memoization Hash
  memoizationHash String?            @map("memoization_hash") // SHA256 of node config + inputs (enables instant replay)
  outputData      Json?              @map("output_data")      // Structured output passed to downstream nodes
  exitCode        Int?               @map("exit_code")
  httpStatusCode  Int?               @map("http_status_code")
  
  // Capped Ring Buffer Stdout
  stdout          String?            @db.Text
  stderr          String?            @db.Text
  
  retryAttempt    Int                @default(0) @map("retry_attempt")
  errorMessage    String?            @db.Text @map("error_message")

  workflowRun     WorkflowRun        @relation(fields: [runId], references: [id], onDelete: Cascade)
  node            WorkflowNode       @relation(fields: [nodeId], references: [id], onDelete: Cascade)

  @@unique([runId, nodeKey])
  @@index([runId, status])
  @@map("workflow_step_runs")
}

// ─────────────────────────────────────────
//  HUMAN-IN-THE-LOOP APPROVAL GATES
// ─────────────────────────────────────────
model WorkflowApproval {
  id              String             @id @default(uuid())
  runId           String             @map("run_id")
  nodeKey         String             @map("node_key")
  
  title           String             // e.g. "Approve Production Database Migration & Deploy"
  description     String?            @db.Text
  
  status          ApprovalStatus     @default(PENDING)
  
  // Interactive Verification Token
  approvalToken   String             @unique @map("approval_token") // Secure random 32-byte hex
  
  approvedBy      String?            @map("approved_by") // User email or ID
  comments        String?            @db.Text
  
  expiresAt       DateTime           @map("expires_at")
  respondedAt     DateTime?          @map("responded_at")
  
  workflowRun     WorkflowRun        @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@index([runId, status])
  @@map("workflow_approvals")
}

enum ApprovalStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
}
```

---

## ⚡ 3. The DAG State Machine & Durable Execution Engine

### A. Graph Resolution & Cycle Validation (Kahn's Algorithm)
Before any workflow run commences, the engine builds an in-memory adjacency list of the nodes and edges, calculating each node's in-degree:

$$\text{InDegree}(v) = |\{u \in V \mid (u, v) \in E\}|$$

1. **Cycle Detection**: If the topological sort resolves fewer nodes than $|V|$, the graph contains a directed cycle. The API rejects the workflow immediately with HTTP 400 (`CYCLIC_DEPENDENCY_DETECTED`).
2. **Initial Batch Identification**: All nodes with $\text{InDegree} = 0$ (the trigger and root nodes) are scheduled immediately into `flow:step:stream`.
3. **Downstream Resolution**: As each step completes with `SUCCESS`, its dependent edges are evaluated. When all incoming dependencies for node $v$ are satisfied, node $v$ transitions from `PENDING` $\rightarrow$ `QUEUED` $\rightarrow$ `RUNNING`.

### B. Durable State Machine & Checkpointing Architecture

```
Step 1 Completed ──► Write Output to context_data ──► Checkpoint in Postgres
                             │
                             ├─► Evaluate Dependent Edge Conditions (e.g. {{output.status == 200}})
                             │
                             ▼
                     Are all inbound nodes satisfied?
                             │
                  ┌──────────┴──────────┐
                  ▼ YES                 ▼ NO
         Queue Step 2 in Redis     Wait for parallel sibling branch
```

- **Step Memoization & Instant Replay**:
  Each step computes an input hash:
  $$\mathcal{H} = \text{SHA256}(\text{nodeKey} + \text{configJSON} + \text{upstreamInputsJSON})$$
  If a pipeline fails at Step 5 due to an invalid Slack webhook URL, the developer fixes the URL and clicks **Replay from Failed Step**. Whizan Flow reuses the cached artifacts and outputs of Steps 1–4, skipping redundant 10-minute Docker builds and starting directly at Step 5.

- **Zero-Resource Suspended States**:
  When a workflow reaches a `CONTROL_DELAY` (e.g., "Wait 4 hours") or a `CONTROL_APPROVAL` node:
  1. The workflow state and context are serialized into PostgreSQL (`context_data`).
  2. The run status updates to `PAUSED` or `WAITING_FOR_APPROVAL`.
  3. The worker **completely releases memory and process handles**. No threads or background sleep processes remain in memory.
  4. For delays, a Redis ZSET entry is scheduled: `flow:sleep:zset` with score = `resumeTimestamp`.
  5. For approvals, the engine waits for a webhook callback from Slack/Discord or the dashboard.
  6. Upon trigger, the state rehydrates into memory in $< 10\text{ms}$ and resumes the exact next step.

---

## 🐳 4. Build & Deployment Pipeline Subsystems

Whizan Flow natively exposes the cloud platform's underlying virtualization and routing primitives as workflow nodes:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      NATIVE WHIZAN DEPLOYMENT PIPELINE NODES                           │
├─────────────────────────┬──────────────────────────────────────────────────────────────┤
│ 1. Git Trigger          │ Clones branch, computes diff, sets COMMIT_SHA & AUTHOR_NAME  │
│ 2. AI Workspace Audit   │ Runs gemini-3.5-flash-lite to auto-detect framework & envs   │
│ 3. Dockerfile Builder   │ Mounts build cache, compiles image via /var/run/docker.sock  │
│ 4. Test Runner          │ Spawns transient test container, captures exit code & stdout │
│ 5. DB Migration         │ Executes `prisma migrate` or `alembic` inside mesh container │
│ 6. Edge Health Probe    │ Sends canary HTTP pings to isolated test port                │
│ 7. Router Atomic Switch │ Updates Caddy/Nginx upstream proxy (100% Zero Downtime)      │
│ 8. Auto-Rollback Gate   │ Instantly rewinds route symlink if 5xx error rate > 0.5%     │
└─────────────────────────┴──────────────────────────────────────────────────────────────┘
```

### A. Zero-Downtime Atomic Traffic Cutover & Auto-Rollback
When deploying a Web Project or Backend Microservice:
1. The new container is launched on an internal ephemeral port (e.g., `3001` or `service-abc:8080`).
2. The `ACTION_HEALTH_PROBE` node executes up to 10 automated health checks (`GET /health` or `/api/health`).
3. If all probes pass with HTTP 200 within latency threshold $T < 500\text{ms}$, the `ACTION_ROUTER_CUTOVER` node atomically issues an internal IPC reload to Edge Router:
   ```json
   { "action": "CUTOVER", "slug": "my-app", "targetContainerId": "container_new_v2" }
   ```
4. The router switches active HTTP keep-alive connections in $< 5\text{ms}$.
5. If the probe fails, the `ACTION_AUTO_ROLLBACK` node triggers immediately, keeping the previous container active, alerting the team on Slack/Discord, and routing 0% of traffic to the failed build.

---

## 🔄 5. Visual $\leftrightarrow$ Code Dual-Way Sync Engine

A central breakthrough of Whizan Flow is the **lossless two-way translation engine** between the Visual Graph Canvas (React Flow) and the Code-First DSL (TypeScript / YAML).

### A. The Declarative Code DSL (`whizan.flow.ts`)
Developers can check workflow definitions directly into their Git repositories:

```typescript
import { defineWorkflow, nodes } from "@whizan/flow";

export default defineWorkflow({
  name: "Production Fullstack CI/CD",
  concurrency: "QUEUE",
  timeout: "45m",

  on: {
    push: { branches: ["main"] },
  },

  pipeline: async ({ step }) => {
    // Step 1: Analyze Codebase
    const audit = await step.run("audit", nodes.workspaceAnalyze());

    // Step 2: Build Multi-Stage Docker Container
    const image = await step.run("build", nodes.dockerBuild({
      dockerfile: "Dockerfile",
      buildArgs: { NODE_ENV: "production" },
    }));

    // Step 3: Run Database Migrations Inside Container
    await step.run("migrate", nodes.containerExec({
      serviceId: "backend-api",
      command: ["npx", "prisma", "migrate", "deploy"],
    }));

    // Step 4: Human Approval Before Production Promotion
    await step.run("gatekeeper", nodes.humanApproval({
      title: `Promote commit ${audit.commitSha} to Production?`,
      channels: ["slack", "dashboard"],
      timeout: "24h",
    }));

    // Step 5: Atomic Router Cutover
    await step.run("cutover", nodes.routerCutover({
      canaryPercentage: 100,
      healthCheckUrl: "/api/health",
      autoRollback: true,
    }));

    // Step 6: Post-Deployment AI Release Notes & Alert
    await step.run("notify", nodes.aiReleaseNotes({
      channel: "slack",
      model: "gemini-3.5-flash-lite",
    }));
  },
});
```

### B. The Lossless AST Transformation Engine
- **Code to Visual Graph**: The AST parser analyzes `step.run()` calls and awaits. Linear awaits become serial edges; `Promise.all()` structures become parallel branches; `if` conditionals become `CONTROL_CONDITION` nodes. Layout coordinates are dynamically assigned using the Sugiyama hierarchical layout algorithm.
- **Visual Graph to Code**: When a user drags a node or connects an edge on the visual canvas, the generator updates the AST, preserving developer comments, formatting, and custom scripts.

---

## 🛡️ 6. Fault Tolerance, Self-Healing & Security

1. **VM Reboot & Power-Cut Recovery**:
   - Every active workflow execution continually commits its state to PostgreSQL (`context_data`).
   - If the Azure host VM reboots midway through a deployment, the Flow Engine daemon rehydrates unfinished runs on startup, reads the last checkpointed step, and resumes execution seamlessly.
2. **Memory Protection & Logging Ring Buffer**:
   - Each step pipes `stdout` and `stderr` through a **64KB [CircularRingBuffer](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/cron-scheduler/src/ring-buffer.ts)**.
   - Verbose build outputs (e.g. `npm install`, compile dumps) stream in real-time to the dashboard via SSE without blowing up worker RAM or database storage.
3. **Secret Encryption (AES-256-GCM)**:
   - Environment variables, Slack webhook URLs, and API tokens are encrypted at rest using AES-256-GCM with PBKDF2 key derivation.
   - Sensitive credentials in workflow logs are automatically masked using regex filters before hitting Redis Pub/Sub.

---

## 🛠️ 7. REST API & MCP DevOps Tooling Specification

### A. Flow Engine REST API Endpoints

| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/flows` | List all workflows with active status and last run metrics |
| `POST` | `/api/flows` | Create a new workflow (accepts visual JSON or declarative code) |
| `GET` | `/api/flows/:id` | Fetch workflow definition, visual nodes, and edges |
| `PATCH` | `/api/flows/:id` | Update workflow graph, nodes, or YAML/TS code |
| `POST` | `/api/flows/:id/trigger` | 1-Click trigger workflow run with custom payload |
| `GET` | `/api/flows/:id/runs` | Fetch paginated execution runs and durations |
| `GET` | `/api/flows/:id/runs/:runId` | Deep inspection of specific run: state, outputs, steps |
| `GET` | `/api/flows/:id/runs/:runId/logs/stream` | Real-time SSE stream of running step logs |
| `POST` | `/api/flows/:id/runs/:runId/replay` | Replay workflow from specific failed step run |
| `POST` | `/api/flows/approvals/:token/respond` | Approve or reject a human-in-the-loop gate |

### B. MCP DevOps Tools Integration

Autonomous AI agents (such as Antigravity) interact with the workflow subsystem via dedicated MCP tools:
- `whizan_create_workflow`: Generates and deploys a complete DAG pipeline from a natural language prompt.
- `whizan_trigger_workflow`: Triggers deployment pipelines, passing Git branch and commit metadata.
- `whizan_get_workflow_run`: Inspects live step execution state and terminal logs.
- `whizan_approve_workflow_step`: Programmatically reviews and approves human approval checkpoints based on policy.
