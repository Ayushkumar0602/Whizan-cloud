# Whizan Flow — Complete Engine, Canvas Studio & DSL Implementation Guide

> **Document Location:** `docs/automation/flow_studio_and_engine_implementation.md`  
> **Status:** Production Reference & Operational Guide  
> **Author:** Whizan Cloud Core Engineering  
> **Target Subsystems:** `apps/flow-engine`, `apps/api`, `apps/dashboard`, `packages/db`, `@whizan/mcp-devops`

---

## 📑 Table of Contents
1. [Executive Summary & High-Level Architecture](#1-executive-summary--high-level-architecture)
2. [Database Schema & Supabase Session Migration](#2-database-schema--supabase-session-migration)
3. [Flow Engine Core: DAG Resolution & Ring Buffer](#3-flow-engine-core-dag-resolution--ring-buffer)
4. [Native Build, Deploy & Control Handlers](#4-native-build-deploy--control-handlers)
5. [Disaster Recovery, Cold-Boot Reconciler & VM Reboot Resilience](#5-disaster-recovery-cold-boot-reconciler--vm-reboot-resilience)
6. [Fastify API Architecture & SSE Log Streaming](#6-fastify-api-architecture--sse-log-streaming)
7. [Visual Studio Canvas & n8n-Style Parameter Visualization](#7-visual-studio-canvas--n8n-style-parameter-visualization)
8. [Dual-Pane Split View & Live Bidirectional DSL Sync](#8-dual-pane-split-view--live-bidirectional-dsl-sync)
9. [Topological DAG Auto-Layout Algorithm](#9-topological-dag-auto-layout-algorithm)
10. [Autonomous MCP DevOps Tooling Integration](#10-autonomous-mcp-devops-tooling-integration)
11. [Deployment, Verification & Troubleshooting Runbook](#11-deployment-verification--troubleshooting-runbook)

---

## 1. Executive Summary & High-Level Architecture

**Whizan Flow** is a cloud-native workflow automation system combining the visual drag-and-drop ergonomics of platforms like **n8n** and **Make** with the compute-aware build and deployment primitives of modern cloud infrastructure (Docker, Edge Router, Edge Functions, Databases, and LLMs).

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       WHIZAN CLUSTER WORKSPACE                                    │
│                                                                                                   │
│  ┌────────────────────────┐      ┌─────────────────────────┐      ┌─────────────────────────────┐ │
│  │   Visual Studio Canvas │ ◄──► │  Split View Studio DSL  │ ◄──► │  Native Fastify API (:4000) │ │
│  │ (n8n Card Configs/Auto)│      │  (Live 2-Way Sync/Auto) │      │  (/api/flows, SSE Logs)     │ │
│  └───────────┬────────────┘      └────────────┬────────────┘      └──────────────┬──────────────┘ │
│              │                                │                                  │                │
│              └────────────────────────────────┴─────────────────┬────────────────┘                │
│                                                                 ▼                                 │
│                                                  ┌──────────────────────────────┐                 │
│                                                  │   Prisma ORM (Supabase PG)   │                 │
│                                                  │  workflows, workflow_nodes,  │                 │
│                                                  │  workflow_edges, runs, steps │                 │
│                                                  └──────────────┬───────────────┘                 │
│                                                                 │                                 │
│                                                                 ▼                                 │
│                                                  ┌──────────────────────────────┐                 │
│                                                  │    Redis Streams & Pub/Sub   │                 │
│                                                  │      (flow:jobs:stream)      │                 │
│                                                  └──────────────┬───────────────┘                 │
│                                                                 │                                 │
│                                                                 ▼                                 │
│                                                  ┌──────────────────────────────┐                 │
│                                                  │     Whizan Flow Engine       │                 │
│                                                  │   (DAG Kahn's In-Degree)     │                 │
│                                                  └──────────────┬───────────────┘                 │
│                                                                 │                                 │
│                     ┌───────────────────────────────────────────┼────────────────────────────────┐│
│                     ▼                                           ▼                                ▼│
│      ┌─────────────────────────────┐             ┌─────────────────────────────┐  ┌─────────────┴┐│
│      │ Native Azure Build Worker   │             │   Azure Edge Router Mesh    │  │ Gemini 3.5  ││
│      │ (Docker, Next.js, Analysis) │             │ (Port 80/443 Atomic Cutover)│  │ Flash Lite  ││
│      └─────────────────────────────┘             └─────────────────────────────┘  └──────────────┘│
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Database Schema & Supabase Session Migration

The workflow relational layer is modeled in [`packages/db/prisma/schema.prisma`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/packages/db/prisma/schema.prisma):

### Core Prisma Models
* **`Workflow`**: Central entity with metadata (`userId`, `slug`, `name`, `category`, `concurrencyPolicy`, `maxConcurrentRuns`, `timeoutSeconds`, `visualConfig`, `codeDefinition`).
* **`WorkflowNode`**: Individual DAG steps (`nodeKey`, `name`, `type`, `config` [JSONB], `positionX`, `positionY`, `timeoutSeconds`, `maxRetries`, `retryDelaySec`, `continueOnError`).
* **`WorkflowEdge`**: Graph edges (`sourceNodeKey`, `targetNodeKey`, `condition` [success, failure, or custom JS expression]).
* **`WorkflowTrigger`**: Ingestion triggers (`type` [MANUAL, GIT, CRON, WEBHOOK], `config`, `enabled`).
* **`WorkflowRun`**: Root execution record (`status` [PENDING, RUNNING, SUCCESS, FAILED, CANCELLED], `triggerSource`, `startedAt`, `finishedAt`, `durationMs`).
* **`WorkflowStepRun`**: Per-step execution tracking (`status`, `inputs`, `outputs`, `error`, `stdout`, `exitCode`, `cacheHit`).
* **`WorkflowApproval`**: Human-in-the-loop gate tokens with cryptographically secure tokens.

### Database Session Migration Gotcha
* **Symptom**: Prisma CLI hangs indefinitely or throws advisory lock errors (`P2021`) when running `prisma db push` through transaction pooler ports (`port 6543`, `?pgbouncer=true`).
* **Resolution**: Migrations must bypass PgBouncer and connect directly to the PostgreSQL session port:
  ```bash
  DATABASE_URL="postgres://postgres.xxx:xxx@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres" \
  npx prisma db push --schema=packages/db/prisma/schema.prisma
  ```

---

## 3. Flow Engine Core: DAG Resolution & Ring Buffer

Located in `apps/flow-engine`:

### 1. Directed Acyclic Graph (DAG) Sorter (`apps/flow-engine/src/dag.ts`)
* **Kahn's Topological Sort**: Analyzes nodes and edges to compute execution order. Circular references immediately reject with detailed cycle paths.
* **In-Degree Dependency Matrix**: Parallel tasks (in-degree = 0) run concurrently. Converging join steps (diamond joins) await all parent steps to satisfy their edge conditions before execution.
* **Conditional Edges**: Handles `success`, `failure`, or custom JavaScript expressions (e.g. `steps.health_check.output.statusCode === 200`).

### 2. 64KB Circular Byte Ring Buffer (`apps/flow-engine/src/stream-buffer.ts`)
* High-volume container build outputs and shell script dumps are passed through a 64KB Circular Ring Buffer.
* Prevents node crashes and worker Out-Of-Memory (OOM) failures while maintaining a real-time stream for web consumers.

---

## 4. Native Build, Deploy & Control Handlers

All actions in `apps/flow-engine/src/step-runner.ts` interface directly with Whizan's native Azure VM infrastructure:

| Action / Control | Execution Implementation | Output Artifacts |
| :--- | :--- | :--- |
| `ACTION_WORKSPACE_ANALYZE` | Inspects package manifests, entry points, and directory layout | `detectedLanguage`, `framework`, `internalPort`, `recommendedStack` |
| `ACTION_BUILD_CONTAINER` | Synthesizes multi-stage Alpine Dockerfile, triggers Azure Build Worker | `imageTag`, `digest`, `buildLogs` |
| `ACTION_DEPLOY_EDGE` | Deploys static/edge web assets directly to high-performance Edge CDN | `edgeSlug`, `liveUrl`, `assetCount` |
| `ACTION_DEPLOY_SERVICE` | Launches microservice container into private Docker mesh | `containerId`, `meshUrl`, `allocatedPort` |
| `ACTION_RUN_TESTS` | Executes container test suites (`npm test`, `pytest`) | `exitCode`, `stdout`, `testSummary` |
| `ACTION_HEALTH_PROBE` | Probes HTTP endpoints with configurable status expectation and retries | `httpStatus`, `latencyMs`, `healthy: true` |
| `ACTION_ROUTER_CUTOVER` | Atomic Edge Router switch with 0-downtime connection draining | `activeRouteTarget`, `drainedConnections` |
| `ACTION_AUTO_ROLLBACK` | Auto-reverts route table to previous stable deployment on 5xx | `restoredDeploymentId`, `alertSent` |
| `ACTION_CONTAINER_EXEC` | Direct Docker socket exec with security sanitization | `stdout`, `sanitizedOutput` |
| `ACTION_DATABASE_QUERY` | Executes safe parameterized SQL against provisioned databases | `rowsAffected`, `queryResult` |
| `ACTION_AI_PROMPT` | Evaluates prompt via `gemini-3.5-flash-lite` (e.g. changelog generation) | `markdownChangelog`, `releaseNotes` |
| `ACTION_HTTP_REQUEST` | HTTP Webhook dispatch (Slack, Discord, PagerDuty, custom webhook) | `statusCode`, `responseBody` |
| `CONTROL_APPROVAL` | Suspends DAG run in `WAITING_FOR_APPROVAL` until token validated | `approvedBy`, `approvalComments` |
| `CONTROL_BRANCH` | Evaluates boolean expression against upstream step outputs | Branch target (`true` / `false`) |
| `CONTROL_DELAY` | Non-blocking dynamic timer sleep | Resumes downstream execution |

---

## 5. Disaster Recovery, Cold-Boot Reconciler & VM Reboot Resilience

The engine incorporates self-healing capabilities located in `apps/flow-engine/src/reconciler.ts`:

1. **Cold-Boot Database Rehydration**:
   On daemon startup or system reboot, queries PostgreSQL for runs trapped in `RUNNING` or `PENDING` states.
2. **Redis Consumer Message Reclamation**:
   Uses `XPENDING` and `XCLAIM` to reclaim unacknowledged messages across worker consumer groups without message loss.
3. **Step Memoization Cache**:
   Calculates $SHA256(\text{nodeKey} + \text{config} + \text{inputs})$. When replaying or retrying failed workflow runs, previously successful steps return in 0ms without re-executing heavy builds or API requests.

---

## 6. Fastify API Architecture & SSE Log Streaming

Defined in `apps/api/src/routes/flows.ts`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/flows` | List all workflows for the authenticated user |
| `POST` | `/api/flows` | Create a new workflow definition with validated nodes and edges |
| `GET` | `/api/flows/:id` | Fetch workflow details, complete DAG, and recent run history |
| `PUT` / `PATCH` | `/api/flows/:id` | Update workflow metadata, atomically replace nodes and edges, refresh Redis cache |
| `DELETE` | `/api/flows/:id` | Delete workflow and clean up Redis keys |
| `POST` | `/api/flows/:id/trigger` | Trigger execution run; enqueues into Redis Stream `flow:jobs:stream` |
| `GET` | `/api/flows/:id/runs` | Paginated execution run history |
| `GET` | `/api/flows/:id/runs/:runId` | Detailed run telemetry and per-step execution status |
| `GET` | `/api/flows/:id/runs/:runId/logs/stream` | Real-time Server-Sent Events (SSE) log stream with CORS writeHead headers |
| `POST` | `/api/flows/:id/runs/:runId/replay` | Replay execution run with cached memoization |
| `POST` | `/api/flows/approvals/:token/respond` | Submit human approval gate decision (approve / reject) |

### CORS WriteHead Header Fix for SSE
Fastify's standard CORS plugin does not automatically inject headers when `reply.raw.writeHead` is invoked directly for Server-Sent Events. The endpoint explicitly writes CORS headers to ensure the browser SSE stream connects reliably from any client domain (including Vercel):
```typescript
reply.raw.writeHead(200, {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Credentials": "true",
});
```

---

## 7. Visual Studio Canvas & n8n-Style Parameter Visualization

Implemented in [`apps/dashboard/app/dashboard/flows/[id]/page.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/app/dashboard/flows/%5Bid%5D/page.tsx) and [`apps/dashboard/lib/flow-templates.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/lib/flow-templates.ts):

### 1. Visible Parameters on Every Card Face
Rather than concealing configurations inside unopened inspector panels or truncating them into an unreadable single line, every canvas card renders a **Structured Parameters Box**:
* **Live Configuration Preview**: Formats key active parameters directly on the node card:
  * **HTTP Request / Webhook**: HTTP Method (`POST`, `GET`), target URL, and auth header state.
  * **Scheduled Cron**: Schedule string (`0 * * * *`), human-readable interval (`Every hour`), and timezone.
  * **Git Push / PR**: Target branch (`main`), repository, and trigger events.
  * **Docker Build**: Dockerfile path (`./Dockerfile`) and image tag (`latest`).
  * **Deploy Edge CDN**: Edge slug (`web-prod`) and build output directory (`dist`).
  * **Deploy Service**: Internal mesh slug (`api-service`) and exposed port (`:8000`).
  * **Health Probe**: Probe endpoint URL and expected HTTP status (`200 OK`).
  * **Container Exec / SQL**: Exact CLI command or SQL statement preview.
  * **AI Prompt**: Selected LLM (`gemini-3.5-flash-lite`) and prompt excerpt.
* **Direct "Configure Parameters" Button**: Prominently featured on every card with a `Sliders` icon. Clicking either the card, the gear, or the button instantly slides out the parameter inspector.
* **Card Quick Actions**: Header contains the badge, live step execution status (Success, Running, Failed, Waiting for Approval), child step connection button `(+)`, and a quick delete step button `(🗑)`.

```
┌──────────────────────────────────────────────┐
│ ■ HTTP REQUEST                       [POST]  │
│ Monorepo Slack Dispatch                      │
│ ┌──────────────────────────────────────────┐ │
│ │ PARAMETERS                      2 ACTIVE │ │
│ │ Method:    POST                          │ │
│ │ URL:       https://hooks.slack.com/...   │ │
│ └──────────────────────────────────────────┘ │
│ [ ⚙ Configure Parameters ]                   │
│ #slack_notify                          1.2s  │
└──────────────────────────────────────────────┘
```

---

## 8. Dual-Pane Split View & Live Bidirectional DSL Sync

Whizan Flow provides seamless dual-way synchronization between visual graph models and code definitions:

### Studio View Modes
1. **Canvas**: Full-screen visual graph view.
2. **Split View**: **Interactive Visual Canvas on the left (55%)** and **Live Code Editor on the right (45%)**.
3. **DSL Code**: Full-screen code editor.

### Real-Time Live Auto-Conversion (Code ↔ Graph)
* **Code to Graph**:
  * As the user types or pastes code in the DSL editor, a debounced parser (`parseWorkflowDSL`, 350ms delay) parses the code and updates visual nodes and edges on the canvas.
  * Live status indicator:
    * `⚡ Live Synced (N nodes)` (Green)
    * `Auto-converting...` (Blue)
    * `Drafting (partial syntax)` (Amber)
* **Multi-Format Parsing Engine**:
  * **Whizan TypeScript DSL**: `export default defineWorkflow({ ... })`.
  * **Raw JSON Workflows**: `{ "name": "...", "nodes": [...], "edges": [...] }`.
  * **n8n Workflow Export JSON**: Automatically maps exported n8n workflow JSON (`{ nodes: [...], connections: {...} }`) directly into Whizan DAG nodes (Webhooks, Cron, HTTP, Shell commands, Postgres).
* **Graph to Code**:
  * Moving a node on the canvas updates `position: { x, y }` in the DSL code live.
  * Modifying parameter values in the inspector updates the `config: { ... }` object in the DSL code live.

---

## 9. Topological DAG Auto-Layout Algorithm

The `autoLayoutDAG` function calculates topological in-degrees and groups nodes by dependency depth:

```typescript
export function autoLayoutDAG(nodes: any[], edges: any[]): any[] {
  // 1. Calculate in-degrees and adjacency
  // 2. Queue nodes with in-degree = 0 (root nodes)
  // 3. Increment level per downstream hop
  // 4. Group by level and assign coordinates:
  //    X = level * 360 + 80
  //    Y = centered offset based on siblings
}
```

* One-click **Auto Layout** (`Wand2` icon) organizes nodes into clean, non-overlapping columns from left to right.

---

## 10. Autonomous MCP DevOps Tooling Integration

Agents and external tooling interact with Whizan Flow using `@whizan/mcp-devops`:

* `whizan_list_flows`: Query existing pipelines and execution status.
* `whizan_get_flow`: Retrieve complete DAG nodes, edges, and configurations.
* `whizan_create_flow`: Register new automated pipelines programmatically.
* `whizan_trigger_flow`: Trigger automated build and deployment pipelines.
* `whizan_get_flow_run`: Inspect live step runs and timing metrics.
* `whizan_get_flow_logs`: Retrieve real-time terminal execution output.

---

## 11. Deployment, Verification & Troubleshooting Runbook

### Production Verification Checklist
1. **Supabase Schema**: All 7 tables (`workflows`, `workflow_nodes`, `workflow_edges`, `workflow_triggers`, `workflow_runs`, `workflow_step_runs`, `workflow_approvals`) verified active.
2. **Dashboard Compilation**: `npm --prefix apps/dashboard run build` compiles cleanly with 0 TypeScript or Next.js build errors.
3. **PM2 Services (Azure VM)**:
   * `whizan-flow` (ID 4): online
   * `dashboard` (ID 5): online on port 3001
   * `build-worker` (ID 1), `edge-router` (ID 0), `whizan-cron` (ID 3), `whizan-functions` (ID 2): online

### Commands for Azure VM Deployment
```bash
# 1. Pull latest code
cd /opt/whizan && git pull origin main

# 2. Build Dashboard
npm --prefix apps/dashboard run build

# 3. Restart Services
sudo pm2 restart dashboard
sudo pm2 restart whizan-flow
```
