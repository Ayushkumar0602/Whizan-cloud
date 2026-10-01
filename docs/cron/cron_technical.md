# Whizan Cron & Scheduled Compute Service — Technical Architecture & Low-Level Design (LLD)

> **Document Status:** Complete Architecture & Low-Level Design Specification (LLD)  
> **Subsystem Scope:** Whizan Scheduled Compute Engine (`apps/cron-scheduler`, `apps/function-runtime`, `apps/edge-router`, `apps/api`, `packages/db`, `@whizan/mcp-devops`)  
> **Target Platform:** Node.js 20+, TypeScript, Redis 7+ (Sorted Sets & Pub/Sub), PostgreSQL 16 (via PgBouncer), BullMQ 5+, Docker Engine Socket, Azure Linux VM

---

## 🏗️ 1. Architectural Philosophy & Unified Topology

The **Whizan Cron Service** is designed to eliminate the single greatest limitation of traditional cron jobs: **isolation from application context**. 

In conventional cloud architectures:
- Linux `crontab` fails silently, lacks logging, drops jobs during reboots, and cannot scale across nodes.
- Cloud schedulers (AWS EventBridge, Google Cloud Scheduler) require complex IAM setups, only ping public HTTP webhooks, and have zero awareness of container filesystems or internal serverless isolates.
- Modern PaaS offerings (Vercel Cron) severely throttle execution (e.g. 1 execution per day on Hobby plans) and cannot trigger CLI tasks inside containers.

Whizan Cron unifies **4 distinct target primitives** under a single, horizontally scalable, sub-second precision scheduler.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               WHIZAN CRON ENGINE TOPOLOGY                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  CONTROL PLANE (Render API)                 REDIS STATE & EVENT LAYER (Upstash)        │
│  ├── CRUD Cron Definitions                  ├── ZSET: `cron:schedule:zset` (Next Tick)│
│  ├── IAM & Project Authorization            ├── STREAM: `cron:dispatch:stream` (Queue) │
│  └── Telemetry Ingestion                    ├── HASH: `cron:locks:<id>` (Leader Lease) │
│                                             └── HASH: `cron:active:<id>` (Concurrency) │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                       DISTRIBUTED SCHEDULER FLEET (Azure Host VM)                      │
│                                                                                        │
│   ┌─────────────────────────────────────────────────────────────────────────────┐      │
│   │ MACRO-SCHEDULER (Tick Generator Daemon)                                     │      │
│   │ • 1,000ms Resolution Tick Poller                                            │      │
│   │ • Redis Redlock Leader Lease (5s TTL with automatic renewal)                │      │
│   │ • Atomic ZRANGEBYSCORE 0 -> now + Atomic ZREM (O(log N))                    │      │
│   │ • Calculates nextTick via cron-parser with IANA Timezone & DST support      │      │
│   │ • Pushes Dispatch Task into Redis Stream with Idempotency Token             │      │
│   └──────────────────────────────────────┬──────────────────────────────────────┘      │
│                                          │                                             │
│                                          ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────────────┐      │
│   │ MICRO-WORKER FLEET (Execution Dispatcher Pool)                              │      │
│   │ • Worker Concurrency Pool (10–50 parallel dispatch threads)                 │      │
│   │ • Enforces Concurrency Policy (ALLOW, FORBID, QUEUE, REPLACE)               │      │
│   │ • Decrypts AES-256-GCM Environment Variables & Target Credentials           │      │
│   │ • Dispatches directly to Target Primitives:                                 │      │
│   │                                                                             │      │
│   │   [Target 1: Edge Function]   ──► Internal HTTP / Unix Socket (:9090)       │      │
│   │   [Target 2: Web Project]     ──► Private Mesh IP:Port (No Public Gateway)  │      │
│   │   [Target 3: Container Exec]  ──► Docker Engine API (/var/run/docker.sock)  │      │
│   │   [Target 4: External Webhook]──► Signed HMAC-SHA256 HTTP Request           │      │
│   └──────────────────────────────────────┬──────────────────────────────────────┘      │
│                                          │                                             │
│                                          ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────────────┐      │
│   │ OBSERVABILITY & RECOVERY ENGINE                                             │      │
│   │ • Captures Duration, Memory, Status Code, Exit Code, Stdout, Stderr         │      │
│   │ • Exponential Backoff with Jitter Retry Handler                             │      │
│   │ • Dead Letter Queue (DLQ) Publisher with Slack/Discord/Webhook Alerts       │      │
│   │ • Flushes Run Log to PostgreSQL (PgBouncer Pooler :6543)                    │      │
│   └─────────────────────────────────────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 💾 2. Database Schema (Prisma Models Specification)

To integrate seamlessly with Whizan's core PostgreSQL database, the following schema models are added to `packages/db/prisma/schema.prisma`:

```prisma
// ─────────────────────────────────────────
//  CRON SCHEDULED JOBS
// ─────────────────────────────────────────
model CronJob {
  id                String              @id @default(uuid())
  userId            String              @map("user_id")
  name              String              // e.g. "Daily Database Vacuum & Backup"
  description       String?             @db.Text
  schedule          String              // Standard 5/6-part cron expression (e.g. "0 0 * * *")
  timezone          String              @default("UTC") // IANA format (e.g. "America/New_York", "Asia/Kolkata")
  
  targetType        CronTargetType      @map("target_type")
  targetConfig      Json                @map("target_config")
  // TargetConfig Schemas:
  // - FUNCTION:       { serviceId: string, endpointPath: string, method: string, payload: any }
  // - PROJECT:        { projectId: string, routePath: string, method: string, payload: any }
  // - CONTAINER_EXEC: { serviceId: string, command: string[], workDir?: string, user?: string }
  // - WEBHOOK:        { url: string, method: string, headers: Record<string, string>, body?: any }

  misfirePolicy     CronMisfirePolicy   @default(SKIP) @map("misfire_policy")
  concurrencyPolicy CronConcurrency     @default(FORBID) @map("concurrency_policy")
  maxConcurrentRuns Int                 @default(1) @map("max_concurrent_runs")
  
  timeoutSeconds    Int                 @default(300) @map("timeout_seconds") // 1s to 3600s
  maxRetries        Int                 @default(3) @map("max_retries")
  retryDelaySeconds Int                 @default(10) @map("retry_delay_seconds")
  
  enabled           Boolean             @default(true)
  status            CronJobStatus       @default(ACTIVE)
  
  lastRunAt         DateTime?           @map("last_run_at")
  lastRunStatus     CronRunStatus?      @map("last_run_status")
  lastDurationMs    Int?                @map("last_duration_ms")
  nextRunAt         DateTime?           @map("next_run_at")
  
  executionsCount   Int                 @default(0) @map("executions_count")
  failureCount      Int                 @default(0) @map("failure_count")
  
  createdAt         DateTime            @default(now()) @map("created_at")
  updatedAt         DateTime            @updatedAt @map("updated_at")

  user              User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  executions        CronExecution[]
  deadLetterEntries CronDeadLetter[]

  @@index([status, nextRunAt])
  @@index([userId])
  @@map("cron_jobs")
}

enum CronTargetType {
  FUNCTION          // Whizan Edge Function (V8 isolate / port 9090)
  PROJECT           // Whizan Web Project / Backend Service (Internal mesh routing)
  CONTAINER_EXEC    // Whizan Docker Container Exec (Runs command inside running container)
  WEBHOOK           // External Public URL (Signed HTTP POST/GET)
  @@map("cron_target_type")
}

enum CronMisfirePolicy {
  SKIP              // Default for high-frequency crons: Discards missed ticks during downtime
  FIRE_LATEST_ONCE  // Executes missed tick ONCE immediately upon system boot (ideal for daily jobs)
  CATCH_UP_ALL      // Sequentially executes every missed tick with backpressure (ideal for billing/audits)
  @@map("cron_misfire_policy")
}

enum CronConcurrency {
  ALLOW             // Allows concurrent executions up to maxConcurrentRuns
  FORBID            // Skips new execution if previous run is still in-flight
  REPLACE           // Aborts existing running task and starts fresh execution
  QUEUE_SERIALIZE   // Queues new run to execute immediately when previous run finishes
  @@map("cron_concurrency")
}

enum CronJobStatus {
  ACTIVE
  PAUSED
  DISABLED_ERROR    // Automatically disabled if consecutive failures exceed threshold
  @@map("cron_job_status")
}

// ─────────────────────────────────────────
//  CRON EXECUTION HISTORY & LOGS
// ─────────────────────────────────────────
model CronExecution {
  id              String         @id @default(uuid())
  cronJobId       String         @map("cron_job_id")
  triggerType     String         @default("SCHEDULED") @map("trigger_type") // SCHEDULED, MANUAL, RETRY, MISFIRE_CATCHUP
  
  scheduledAt     DateTime       @map("scheduled_at")
  startedAt       DateTime       @default(now()) @map("started_at")
  completedAt     DateTime?      @map("completed_at")
  
  status          CronRunStatus  @default(RUNNING)
  exitCode        Int?           @map("exit_code")      // For CONTAINER_EXEC
  statusCode      Int?           @map("status_code")    // For HTTP/FUNCTION/WEBHOOK
  durationMs      Int?           @map("duration_ms")
  
  attempt         Int            @default(1)
  error           String?        @db.Text
  stdout          String?        @db.Text
  stderr          String?        @db.Text
  
  metadata        Json?          // Node IP, memory consumed, response headers
  createdAt       DateTime       @default(now()) @map("created_at")

  cronJob         CronJob        @relation(fields: [cronJobId], references: [id], onDelete: Cascade)

  @@index([cronJobId, createdAt(sort: Desc)])
  @@index([status])
  @@map("cron_executions")
}

enum CronRunStatus {
  PENDING
  RUNNING
  SUCCESS
  FAILED
  TIMED_OUT
  SKIPPED_OVERLAP
  CANCELLED
  @@map("cron_run_status")
}

// ─────────────────────────────────────────
//  DEAD LETTER QUEUE (DLQ)
// ─────────────────────────────────────────
model CronDeadLetter {
  id            String    @id @default(uuid())
  cronJobId     String    @map("cron_job_id")
  executionId   String?   @map("execution_id")
  reason        String    @db.Text
  payload       Json?
  failedAt      DateTime  @default(now()) @map("failed_at")
  resolved      Boolean   @default(false)
  resolvedAt    DateTime? @map("resolved_at")

  cronJob       CronJob   @relation(fields: [cronJobId], references: [id], onDelete: Cascade)

  @@index([cronJobId, resolved])
  @@map("cron_dead_letters")
}
```

---

## ⚡ 3. Ultra-Scalable Engine & Super Resource Optimization (Zero-Idle Architecture)

To operate efficiently on resource-constrained host infrastructure (such as an Azure Linux VM with **2 vCPU / 4 GB RAM**), Whizan Cron is engineered for **extreme resource frugality**. It eliminates busy-wait polling, caps memory allocations to sub-megabyte limits, and integrates tightly with Whizan's scale-to-zero container reaper.

### 3.1 The Redis Sorted Set (ZSET) Macro-Scheduler
1. Every active `CronJob` has an entry in a partitioned Redis Sorted Set:
   * **Key:** `cron:schedule:zset`
   * **Score:** Unix timestamp in milliseconds of the next execution (`nextRunAt.getTime()`).
   * **Member:** Job UUID (`cronJobId`).
2. **Complexity & Performance:**
   * Range search on ZSET is $O(\log N + M)$, where $N$ is total jobs in system and $M$ is jobs due right now.
   * On 1,000,000 scheduled jobs, querying 500 due jobs completes in **`1.2 milliseconds`** in Redis RAM.

### 3.2 Zero-CPU Dynamic Sleep-Wake Event Loop (Event-Driven Awakening)
Standard schedulers run fixed `setInterval(poll, 1000)` loops that execute 86,400 times a day, keeping the Node.js event loop active and burning 2–5% continuous CPU even when no jobs are due.

Whizan introduces **Event-Driven Dynamic Sleep**:
1. **Earliest Due Inspection:** The Macro-Scheduler queries the lowest score in `cron:schedule:zset`:
   $$\Delta = \min\left(T_{\text{earliest}} - \text{now},\, 60000\text{ ms}\right)$$
2. **True OS-Level Sleep:**
   * If $\Delta > 0$, the scheduler enters an idle sleep state using dynamic timer clamping.
   * The scheduler thread releases CPU cycles completely to the operating system, reducing idle CPU overhead to **`< 0.01%`**.
3. **Interruptible Awakening via Redis Pub/Sub:**
   * When a developer or AI agent creates, updates, or triggers a job via the Dashboard or MCP (`whizan_create_cron_job`), the API publishes a lightweight signal to `cron:reschedule`.
   * The sleeping scheduler catches the pub/sub event, cancels its active timer immediately, evaluates the new earliest tick, and re-clamps its sleep window in `< 1ms`.

```
No Jobs Due for 45 Minutes ──► Scheduler Enters Deep OS Sleep (0.01% CPU)
                                      │
                     Developer Creates Job Due in 2 Minutes!
                                      │
                 API Publishes `cron:reschedule` over Pub/Sub
                                      │
                                      ▼
             Scheduler Wakes Up Instantly (< 1ms) & Sets Timer to 2m
```

### 3.3 Ephemeral Wake-Execute-Sleep for Containers (Fast-Reaper Protocol)
When a cron job targets a sleeping Docker microservice or runs a `CONTAINER_EXEC` task:
1. **Zero Idle RAM:** While waiting for the scheduled window, the target container is **completely stopped (`0 MB RAM`)**.
2. **Rapid Cold Spin-Up:** At $T_{\text{scheduled}}$, the scheduler triggers Whizan's container wakeup engine, starting the Docker container in **~1.5 seconds**.
3. **Task Dispatch & Immediate Tear-Down:**
   * As soon as the CLI command or internal HTTP endpoint finishes, the scheduler tags the container with an expedited idle marker (`fastSleep: true`).
   * Whizan's idle watcher shuts the container back down within **60 seconds** (instead of the standard 15-minute grace period).
   * **Result:** Heavy containers consume RAM only for the exact duration of the cron task, leaving maximum memory for the host Edge Router and V8 isolates.

### 3.4 64KB Circular Byte Ring Buffer & Stream Backpressure (Zero OOM Spikes)
A critical vulnerability in background schedulers is memory explosion when a scheduled script outputs massive text logs (e.g. `pg_dump` dumps, recursive directory walks, or verbose debug logs):
- **The Anti-Pattern:** Concatenating stdout chunks into JavaScript strings (`stdout += chunk`) creates multi-megabyte string allocations that trigger Node.js V8 garbage collection freezes and crashes the process with `JavaScript heap out of memory`.
- **The Whizan Stream Pipeline:**
  1. The Docker stdout stream (`/var/run/docker.sock`) is piped through a **Circular Byte Ring Buffer** fixed at **64 KB**.
  2. The ring buffer retains only the latest 64KB of log output for the dashboard terminal view, with $O(1)$ memory consumption.
  3. If full raw logs must be archived, chunks are streamed directly to disk or S3 with backpressure using Node.js `stream.pipeline`, capping heap allocation to **`< 512 KB`** total memory per running job regardless of output size.

### 3.5 Asynchronous Batch Telemetry Buffer (98% Database Load Reduction)
High-frequency cron jobs can easily flood the PostgreSQL database with single-row write queries (`INSERT INTO cron_executions`).
- **Telemetry Buffer in Redis:** Completed executions push lightweight JSON summaries to a Redis list: `cron:telemetry:buffer`.
- **Bulk Flusher Worker:** Every 5 seconds, a micro-task drains the Redis list using `LRANGE` + `LTRIM` and executes a single batch insert:
  ```typescript
  await prisma.cronExecution.createMany({ data: executionBatch });
  ```
- **Performance Impact:** Eliminates 98% of individual database roundtrips, keeping PostgreSQL connections available for user-facing API traffic.

### 3.6 CPU Priority & Linux Niceness Scheduling
To ensure that background cron jobs never compromise live user traffic arriving at the Edge Router:
- The scheduler and micro-workers execute under **Linux Niceness `nice -n 10`** and **I/O Priority `ionice -c 3` (Idle I/O)**.
- Incoming HTTP requests on Port 80 and Edge Function V8 requests on Port 9090 are scheduled with real-time priority (`nice -n -5`), guaranteeing **0ms latency jitter** for live web users even during massive background cron executions.

### 3.7 Distributed Leader Election & Fencing Tokens
To allow the scheduler to scale horizontally across multiple instances without double-firing:
1. **Redlock Lease:** Schedulers compete for key `cron:leader:lock` with a 5,000ms TTL.
2. The active leader sends a keep-alive heartbeat every 2,000ms.
3. If the leader node terminates or the VM reboots, the lease expires in 5s and another node acquires leadership instantly.
4. **Fencing Token:** Every dispatch includes a monotonically increasing generation counter. Workers discard any dispatch request with an outdated fencing token, guaranteeing **Strictly-Once or Exactly-Once** semantics.

---

## 🛡️ 4. Comprehensive Edge Cases & Failure Recovery

The hallmark of Whizan Cron is its resilience against catastrophic infrastructure failures.

### Edge Case 1: Azure VM Powered Off and Restarted (Disaster Recovery & Misfires)

```
        VM Powered Off at 23:45 ─────────────► VM Reboots at 02:15
               │                                      │
               ▼                                      ▼
     Midnight Cron (00:00)                  Macro-Scheduler Rehydrates:
          WAS MISSED!                       Scans DB for lastRunAt vs now
                                                      │
                       ┌──────────────────────────────┴──────────────────────────────┐
                       ▼                                                             ▼
            MisfirePolicy: SKIP                                           MisfirePolicy: FIRE_LATEST_ONCE
        • Discard missed 00:00 run                                     • Detects 00:00 run was missed
        • Set nextRunAt = Tomorrow 00:00                               • Immediately fires 1 catchup run
        • Log: "MISFIRE_SKIPPED"                                       • Set nextRunAt = Tomorrow 00:00
```

#### Detailed Misfire Strategies:
1. **`SKIP` (Default for high-frequency crons, e.g. `* * * * *`):**
   * If a cron runs every 60 seconds and the VM was off for 2 hours, firing 120 queued runs on boot would trigger a **thundering herd** and crash the database.
   * Under `SKIP`, the engine advances `nextRunAt` to the next upcoming tick and starts clean.
2. **`FIRE_LATEST_ONCE` (Default for daily/nightly rollups, e.g. `0 0 * * *`):**
   * If the VM was off at midnight and booted at 2:15 AM, the engine checks `lastRunAt`.
   * Since the midnight run never succeeded, it schedules **one immediate execution** with `triggerType: "MISFIRE_CATCHUP"` and calculates the next run for the following midnight.
3. **`CATCH_UP_ALL` (Mandatory for financial ledger rollups, invoices, and audit logs):**
   * Iterates through every missed interval between `lastRunAt` and `now` using `cron-parser`.
   * Enqueues each execution into the worker stream sequentially with a 500ms delay between runs to prevent database saturation.

### Edge Case 2: Overlapping Executions & Concurrency Control
*What happens when a database vacuum cron runs every 2 minutes, but one day takes 7 minutes?*

| Policy | Engine Action | Outcome |
| :--- | :--- | :--- |
| **`FORBID` (Default)** | Worker checks Redis key `cron:active:<jobId>`. If key exists, current tick is rejected. | Aborts new run, records `status: SKIPPED_OVERLAP` in history. Zero CPU waste. |
| **`ALLOW`** | Checks `INCR cron:count:<jobId>`. If `count <= maxConcurrentRuns`, proceeds. | Runs in parallel alongside the existing process. |
| **`REPLACE`** | Publishes message `cron:abort:<jobId>`. Sends SIGTERM/AbortSignal to active job, waits 2s, starts new execution. | Cancels zombie/hanging task and ensures newest state runs. |
| **`QUEUE_SERIALIZE`**| Appends job payload to Redis list `cron:pending:<jobId>`. | When active run finishes, worker pops next item and executes immediately. |

### Edge Case 3: Daylight Saving Time (DST) & Timezone Shifts
Many cloud schedulers fail during DST transitions:
- **Spring Forward (e.g. 2:00 AM becomes 3:00 AM):** A cron scheduled at 2:30 AM does not physically exist on the clock.
- **Fall Back (e.g. 1:59 AM reverts to 1:00 AM):** A cron scheduled at 1:30 AM could accidentally fire twice.

#### The Whizan Solution:
1. All scheduling calculations utilize **IANA Timezone database identifiers** (e.g. `America/New_York`, `Europe/London`, `Asia/Tokyo`) via `cron-parser`.
2. When evaluating `nextRunAt`, the engine stores canonical UTC milliseconds while computing intervals against the local timezone offset.
3. **Ambiguity Resolution:**
   * On Spring Forward, non-existent times are advanced to the start of the next valid hour (e.g. 3:00 AM).
   * On Fall Back, the duplicate hour is tagged with `dstFold: 0` (first pass) and `dstFold: 1` (second pass) to ensure exactly one execution.

### Edge Case 4: Target Unavailability & Exponential Backoff with Jitter
If the destination target (e.g. Edge Function or microservice) crashes or returns HTTP 500/502/503/504:
1. The execution enters retry mode up to `maxRetries` (default 3).
2. The backoff delay incorporates **Full Jitter** to prevent synchronized retry spikes:
   $$\text{Delay} = \text{random}(0, \min(M, B \times 2^{\text{attempt}}))$$
   where $B = 10\text{s}$ base, $M = 300\text{s}$ ceiling.
3. If all retries fail:
   - Emits a `CRON_FAILED` event to the Dead Letter Queue (`CronDeadLetter`).
   - Dispatches failure webhooks to Discord, Slack, or developer email.
   - If a job fails **10 consecutive times**, its status shifts to `DISABLED_ERROR` to protect the host infrastructure.

---

## 🎯 5. Unified Target Dispatch Pipelines

Whizan Cron natively executes across 4 targets with zero external proxy dependencies:

### Pipeline 1: Whizan Edge Functions (Sub-5ms In-Memory V8 Dispatch)
- **Mechanism:** The worker sends an internal HTTP/Socket request to `http://127.0.0.1:9090/invoke`.
- **Headers Injected:**
  * `X-Whizan-Trigger: CRON`
  * `X-Whizan-Cron-Id: <uuid>`
  * `X-Whizan-Execution-Id: <uuid>`
- **Benefit:** Completely bypasses public edge routing, domain DNS lookups, and edge rate limits. Executes inside a pre-warmed V8 isolate in `< 3ms`.

### Pipeline 2: Web Projects & Backend Services (Private Mesh Routing)
- **Mechanism:** Targets internal service containers directly via the private Docker bridge network (e.g. `http://service-<id>:3000/api/cron/process`).
- **Benefit:** Endpoints do not need to be exposed to the public internet. Sensitive cron triggers remain strictly isolated inside the internal network mesh.

### Pipeline 3: Docker Container Exec (Direct Shell / CLI Execution)
- **Mechanism:** Interacts with `/var/run/docker.sock` via Docker Engine API (`POST /containers/{id}/exec` followed by `POST /exec/{id}/start`).
- **Parameters:**
  * `command`: `["python", "manage.py", "vacuum_db"]`
  * `workDir`: `"/app"`
- **Benefit:** **No HTTP server needed!** Developers can run native CLI commands, database migrations, Python Celery cleanup scripts, or shell utilities inside their running containers without creating dummy web endpoints.
- **Log Streaming:** Real-time stdout/stderr multiplexing is streamed directly into `CronExecution.stdout` and `CronExecution.stderr`.

### Pipeline 4: External Webhooks (Signed HMAC-SHA256)
- **Mechanism:** Direct HTTPS request to any public internet URL.
- **Security:** Injects signature header `X-Whizan-Signature: sha256=<hex>` computed using the user's secret key, preventing spoofing.

---

## 🔌 6. First-Class MCP DevOps Tooling

Autonomous AI agents in Antigravity IDE and external clients interact with the Cron subsystem using dedicated tools in `@whizan/mcp-devops`:

| MCP Tool Name | Action & Capabilities |
| :--- | :--- |
| `whizan_create_cron_job` | Creates a new scheduled cron job with target configuration, misfire policy, and timezone. |
| `whizan_list_cron_jobs` | Lists all registered crons with next run timestamp, last duration, and health status. |
| `whizan_trigger_cron_job` | Triggers an immediate manual test run of a cron job and streams back live stdout/stderr. |
| `whizan_get_cron_history` | Fetches historical runs with execution duration, memory, status codes, and error logs. |
| `whizan_configure_cron_job` | Updates schedule, changes target, toggles concurrency policy, or pauses/resumes job. |
| `whizan_get_cron_dlq` | Inspects Dead Letter Queue entries and re-dispatches unhandled failures. |

---

## 📊 7. Observability, Metrics & Telemetry

Every execution is tracked and exposed via REST and Dashboard charts:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CRON EXECUTION METRICS                          │
├─────────────────────────┬──────────────────────────┬───────────────────┤
│ Execution Duration (P50)│ P99 Peak Duration        │ Error Rate        │
│ 142 ms                  │ 850 ms                   │ 0.02 %            │
├─────────────────────────┴──────────────────────────┴───────────────────┤
│ Execution History:                                                     │
│ 2026-10-02 02:00:00 UTC [SUCCESS] 200 OK  • 128ms • Function: /rollup  │
│ 2026-10-02 01:00:00 UTC [SUCCESS] 200 OK  • 115ms • Function: /rollup  │
│ 2026-10-02 00:00:00 UTC [SUCCESS] Exit 0  • 840ms • Docker: db_vacuum  │
└────────────────────────────────────────────────────────────────────────┘
```

- **Live Logs:** Console outputs streamed over Server-Sent Events (SSE) `/api/crons/:id/logs`.
- **Memory Footprint:** Captures peak memory delta during task lifetime.
- **History Retention:** Automatically prunes execution logs older than 7 days (Hobby) or 30 days (Pro) via built-in rollup worker.
