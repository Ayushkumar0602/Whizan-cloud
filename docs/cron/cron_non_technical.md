# Whizan Cron Service — Product Guide, Stand-Out Features & User Manual

> **Executive Product Overview & Developer Guide**  
> **Target Audience:** Developers, DevOps Engineers, CTOs, and Product Teams  
> **Platform:** Whizan Cloud Service — Scheduled Automation & Event-Driven Compute Subsystem

---

## 🌟 1. The Vision: Why Traditional Cron is Broken

For decades, developers have relied on standard Linux `crontab` files or bolted-on third-party schedulers to run recurring background tasks: nightly database backups, hourly cache warming, billing cycles, and automated cleanup scripts.

Yet, traditional scheduled compute remains one of the most fragile layers in software engineering:
1. **The Silent Failure Trap:** When a server crontab crashes or runs out of memory, it fails completely in the dark. There are no web consoles, no execution logs, no alerts, and no retry mechanisms.
2. **The Cloud Complexity Barrier (AWS EventBridge / GCP Cloud Scheduler):** Configuring a simple cron on AWS requires managing IAM roles, JSON event envelopes, target ARNs, and VPC network permissions.
3. **The PaaS Throttling Problem (Vercel Cron):** Popular platforms artificially restrict cron capabilities—often allowing only **one execution per day** on free tiers, restricting jobs to public HTTP GET requests, and forbidding CLI commands.
4. **The Reboot Blackout:** If an application server or VM reboots or sleeps during the scheduled window, the task is permanently lost. Nightly database vacuuming and monthly invoices simply vanish.

### The Whizan Solution
**Whizan Cron Service** is built from the ground up to be **the most dependable, versatile, and developer-friendly cron platform in the world**. It integrates natively with Whizan's serverless Edge Functions, Docker containers, private network meshes, and AI-assisted DevOps workflows.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WHAT WHIZAN CRON CAN TRIGGER                    │
├────────────────────────────┬───────────────────────────────────────────┤
│ ⚡ WHIZAN EDGE FUNCTIONS   │ Sub-5ms V8 isolate execution. No network  │
│    (Serverless APIs)       │ hops, 0 host ports, instant scale-to-zero.│
├────────────────────────────┼───────────────────────────────────────────┤
│ 🐳 CONTAINER CLI EXEC      │ Run commands directly inside Docker!      │
│    (python manage.py ...)  │ No HTTP endpoint needed. Real CLI logs.   │
├────────────────────────────┼───────────────────────────────────────────┤
│ 🔒 PRIVATE SERVICE MESH    │ Trigger internal microservices without    │
│    (http://service:3000)   │ exposing endpoints to the public internet.│
├────────────────────────────┼───────────────────────────────────────────┤
│ 🌐 EXTERNAL WEBHOOKS       │ Signed HMAC-SHA256 HTTP calls to any      │
│    (Stripe, Slack, APIs)   │ public URL with custom payloads.          │
└────────────────────────────┴───────────────────────────────────────────┘
```

---

## 🏆 2. Why Whizan Cron Stands Out: The Competitive Matrix

Here is how Whizan Cron stacks up against the major cloud scheduling offerings:

| Feature / Capability | Linux Crontab | AWS EventBridge | Vercel Cron | Upstash QStash | **Whizan Cron Service** |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Execute CLI Inside Containers (`docker exec`)** | ❌ Hardcoded | ❌ No | ❌ No | ❌ No | ✅ **Native 1-Click** |
| **Trigger Serverless Edge Isolates (< 5ms)** | ❌ No | ❌ Needs Lambda | ⚠️ Slow Lambdas | ❌ Webhook Only | ✅ **Direct V8 Memory** |
| **Private Mesh Triggers (No Public URL)** | ❌ No | ⚠️ Complex VPC | ❌ Public Only | ❌ Public Only | ✅ **Automatic Mesh** |
| **Smart Reboot Self-Healing (Misfire Policies)**| ❌ Misses Forever | ⚠️ Limited | ❌ Misses Forever| ⚠️ Retry Only | ✅ **3 Recovery Policies** |
| **Live Console Streaming (Stdout/Stderr)** | ❌ Silent | ⚠️ CloudWatch | ⚠️ Limited Logs | ❌ Payload Only | ✅ **Live SSE Terminal** |
| **Smart Overlap Control (Forbid, Queue, Replace)**| ❌ Complex bash | ❌ No | ❌ No | ⚠️ Dedupe Only | ✅ **Built-in Policies** |
| **Minimum Frequency Allowed** | 1 Minute | 1 Minute | 1 Day (Hobby) | 1 Second | **10 Seconds (Pro)** |
| **Natural Language Schedule Parsing** | ❌ No | ❌ No | ❌ No | ❌ No | ✅ **"Every Friday at 5pm"** |
| **AI Agent Pair Programming (MCP Native)** | ❌ No | ❌ No | ❌ No | ❌ No | ✅ **First-Class MCP** |
| **Dead Letter Queue (DLQ) with Alerts** | ❌ No | ⚠️ SQS Setup | ❌ No | ✅ Yes | ✅ **Built-in Discord/Slack**|

---

## 🚀 3. Stand-Out Killer Features

### 1. Direct Container Command Execution (`CONTAINER_EXEC`)
*The feature every backend engineer has been begging for.*  
Historically, if you wanted to run a scheduled Python script (`python manage.py cleanup_inactive_users`) or a database migration (`npx prisma db vacuum`), you had to write a fake HTTP controller, expose a web route, write custom auth logic, and deploy an HTTP server.

With Whizan Cron, you select **Container Exec**, specify your target project, and enter the command:
```bash
python manage.py purge_expired_sessions
```
Whizan talks directly to the Docker engine inside your application's isolated container, runs the command, streams every line of `stdout` and `stderr` to your dashboard, and reports the exact exit code. **Zero web code required.**

### 2. Bulletproof Reboot & Disaster Self-Healing (Misfire Policies)
*What happens if your VM is powered off for maintenance or restarts during your scheduled window?*  
Other platforms either drop the task permanently or blindly flood your server with hundreds of backlogged requests all at once. Whizan gives you complete control via **Misfire Policies**:

1. **`SKIP` (Default for high-frequency crons):** If your cron runs every minute and the server was down for 2 hours, it skips the missed runs and cleanly triggers on the next scheduled minute—preventing a catastrophic server crash.
2. **`FIRE_LATEST_ONCE` (Ideal for nightly jobs):** If your midnight database rollup was missed because the VM was offline until 2:00 AM, Whizan detects the missed window and **fires the job immediately upon reboot**, keeping your reports accurate.
3. **`CATCH_UP_ALL` (Mandatory for billing & ledger audits):** If every transaction must be processed sequentially, Whizan enqueues each missed interval one by one with safe rate limits.

### 3. Smart Concurrency & Overlap Protection
*What if a heavy data export job is scheduled every 10 minutes, but one day takes 25 minutes?*  
In traditional cron, multiple overlapping processes pile up, consume 100% CPU, lock database tables, and crash the server. Whizan provides 4 intelligent concurrency strategies:
- **`FORBID` (Recommended):** If the previous run is still working, skip the new tick and log an overlap warning.
- **`QUEUE_SERIALIZE`:** Hold the new tick in a queue and execute it immediately after the current run completes.
- **`REPLACE`:** Politely abort the hanging task with a timeout signal and start fresh with the latest data.
- **`ALLOW`:** Let them run in parallel if your task is strictly stateless.

### 4. Live Log Streaming & Run History
No more digging through endless log files or configuring third-party monitoring agents:
- Every execution has a dedicated log card showing duration in milliseconds, memory consumed, status code, and exit code.
- Watch tasks execute live with our real-time streaming console in the Whizan Dashboard.
- Search and filter historical runs across status: `SUCCESS`, `FAILED`, `TIMED_OUT`, or `SKIPPED_OVERLAP`.

### 5. Natural Language Schedules & Timezones
You no longer have to struggle with obscure cron syntax. In Whizan, you can write:
- `"every day at midnight"` → `0 0 * * *`
- `"every weekday at 9:30 am"` → `30 9 * * 1-5`
- `"every 15 minutes"` → `*/15 * * * *`
- Select any **IANA Timezone** (e.g., `America/New_York`, `Asia/Kolkata`, `Europe/Paris`). Whizan automatically handles **Daylight Saving Time (DST)** spring-forward and fall-back transitions without double-running or skipping an hour!

### 6. Dead Letter Queue (DLQ) & Failure Alerts
When a scheduled job fails, Whizan automatically applies **Exponential Backoff Retries** (with random jitter to prevent server stampedes). If all retries fail:
- The job is moved to the **Dead Letter Queue (DLQ)** with the exact error trace.
- Whizan immediately fires an alert to your **Slack channel**, **Discord webhook**, or **Email**.
- Developers can inspect the failed payload in the dashboard and hit **"Replay Execution"** with a single click.

### 7. Super Resource Optimization (Why Whizan Uses 90% Less RAM & CPU)
Traditional schedulers consume continuous background resources even when doing nothing. Whizan is re-engineered for extreme resource efficiency:
- **Zero-Polling Event-Driven Sleep (0.01% CPU Idle):** Traditional cron daemons run a busy-wait loop every second, burning 2–5% continuous CPU. Whizan inspects the next scheduled job and puts the scheduler thread into true operating-system-level sleep until the exact millisecond needed. An instant Redis Pub/Sub signal wakes it up if you create or change a job.
- **Fast-Sleep Container Lifecycle (0 MB Idle RAM):** If your cron triggers a Docker microservice that is asleep, Whizan boots the container in 1.5 seconds, executes the job, and immediately spins it back down within **60 seconds**. Your containers never sit around wasting RAM 24/7 just for an occasional scheduled job.
- **Memory-Safe 64KB Log Streaming:** Even if your backup script outputs 500,000 lines of text, Whizan pipes logs through a fixed 64KB circular ring buffer. Memory usage remains capped at **`< 512 KB`**, completely eliminating Node.js `Out of Memory` (OOM) crashes.
- **Batched Database Telemetry (98% Less Load):** Completed executions are buffered in Redis RAM and written to PostgreSQL in bulk batches every 5 seconds, keeping database connection pools free for customer web requests.
- **Zero-Jitter Web Priority:** Background tasks are tagged with Linux background priority (`nice 10`), guaranteeing that your live web visitors on Port 80 experience **0ms latency impact** even during heavy scheduled compute.

---

## 💼 4. Practical Real-World Use Cases

```
┌────────────────────────────────────────────────────────────────────────┐
│                        POPULAR CRON WORKFLOWS                          │
├────────────────────────────────────────────────────────────────────────┤
│ 1. NIGHTLY DATABASE VACUUM & ENCRYPTED BACKUPS                         │
│    Target: Container Exec -> pg_dump -U postgres | gzip > backup.gz    │
│    Schedule: Every day at 02:00 AM UTC (0 2 * * *)                     │
│    Misfire Policy: FIRE_LATEST_ONCE                                    │
├────────────────────────────────────────────────────────────────────────┤
│ 2. RECURRING SUBSCRIPTION BILLING & INVOICING                          │
│    Target: Whizan Edge Function -> /charge-monthly-invoices            │
│    Schedule: 1st of every month at midnight (0 0 1 * *)               │
│    Concurrency: QUEUE_SERIALIZE • Retries: 5 with backoff              │
├────────────────────────────────────────────────────────────────────────┤
│ 3. HOURLY AI NEWSLETTER & VECTOR EMBEDDING SYNC                        │
│    Target: Web Project API -> http://api.internal:3000/cron/embeddings │
│    Schedule: Every hour at minute 0 (0 * * * *)                        │
│    Misfire Policy: SKIP • Timeout: 15 minutes                          │
├────────────────────────────────────────────────────────────────────────┤
│ 4. SUB-MINUTE HIGH-SPEED HEALTH PROBE                                  │
│    Target: External Webhook -> https://status.mycompany.com/ping       │
│    Schedule: Every 30 seconds                                          │
│    Alerts: Discord notification on 3 consecutive failures              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🖥️ 5. Dashboard Walkthrough: Setting up a Cron in 30 Seconds

### Step 1: Create New Scheduled Task
Navigate to **Dashboard → Cron Jobs** and click **"+ Create Cron Job"**:
1. **Job Name:** Give it a clear name (e.g. `Nightly User Prune`).
2. **Schedule:** Type your schedule or use the intuitive visual builder (Every minute, hourly, daily, weekly, monthly, or custom expression).
3. **Timezone:** Select your local or business timezone.

### Step 2: Choose Your Target Primitives
Select how Whizan should trigger your task:
- **Whizan Edge Function:** Select your function service and endpoint (e.g. `smart-study-api` → `/processPdf`).
- **Container CLI Command:** Select your running backend service and type the command (e.g. `python manage.py vacuum_db`).
- **Private Microservice Route:** Select your web project and enter the internal path (e.g. `/api/cron/sync`).
- **External Webhook:** Enter any public URL and optional custom HTTP headers.

### Step 3: Configure Resilience & Misfires
- **Misfire Policy:** Select `SKIP` (for high frequency) or `FIRE_LATEST_ONCE` (for daily maintenance).
- **Concurrency Policy:** Select `FORBID` to prevent double-runs.
- **Retries & Timeout:** Set max retries (default 3) and max execution time (default 5 minutes).

### Step 4: Test & Monitor
- Click **"Run Now"** to fire an immediate manual execution.
- Watch the live terminal stream your code's stdout output in real time.
- Verify the **200 OK** or **Exit Code 0** status badge.

---

## 🤖 6. Autonomous AI Agent Integration (MCP DevOps)

Whizan Cron is designed from day one for **AI pair programming** through the Model Context Protocol (MCP):

```markdown
User: "Hey Antigravity, can you schedule a daily cleanup script for inactive users on my Django app?"

AI Agent:
1. Calls `whizan_analyze_workspace` to inspect the project structure.
2. Locates the cleanup command: `python manage.py cleanup_users`.
3. Calls `whizan_create_cron_job`:
   {
     "name": "Daily Django User Cleanup",
     "schedule": "0 3 * * *",
     "targetType": "CONTAINER_EXEC",
     "targetConfig": {
       "command": ["python", "manage.py", "cleanup_users"]
     },
     "misfirePolicy": "FIRE_LATEST_ONCE"
   }
4. Calls `whizan_trigger_cron_job` to run a live test.
5. Returns stdout confirmation: "Pruned 42 inactive sessions. Exit Code: 0."
```

---

## 💳 7. Subscription Plans & Tier Limits

| Feature | Hobby Plan (Free) | Professional Plan | Enterprise Plan |
| :--- | :---: | :---: | :---: |
| **Active Cron Jobs** | Up to **5 jobs** | Up to **50 jobs** | **Unlimited** |
| **Minimum Interval** | 1 Minute | **10 Seconds** | **1 Second** |
| **Log History Retention** | 7 Days | 30 Days | 90 Days + S3 Export |
| **Container Exec Primitives** | Included | Included | Included |
| **Misfire Policies** | `SKIP` only | `SKIP`, `FIRE_LATEST_ONCE` | All (incl. `CATCH_UP_ALL`) |
| **Max Execution Timeout** | 5 Minutes (300s) | 30 Minutes (1800s) | 60 Minutes (3600s) |
| **Dead Letter Queue (DLQ)** | Basic | Full with Slack/Discord | Advanced Multi-Channel |

---

## ❓ 8. Frequently Asked Questions (FAQ)

#### Q: How does Whizan trigger commands inside my container without SSH keys?
**A:** Whizan's host agent communicates directly with the Docker Engine daemon over a secure internal socket (`/var/run/docker.sock`). It spawns an isolated execution process inside your running container, captures stdout/stderr in real time, and terminates cleanly when finished.

#### Q: What happens if my service is sleeping (Scale-to-Zero)?
**A:** If your backend service or container is asleep, the Whizan Cron Scheduler automatically sends a wake-up signal, boots the container in under 2 seconds, and executes the cron task seamlessly!

#### Q: Can I manually trigger a cron job for testing?
**A:** Yes! You can click **"Run Now"** in the dashboard or have your AI assistant call `whizan_trigger_cron_job` at any time to run an immediate test execution without waiting for the scheduled time.

#### Q: Can I pass secret API keys and environment variables to my cron job?
**A:** Absolutely. Whizan injects all encrypted project secrets (`envVars`) directly into the execution environment at runtime using AES-256-GCM encryption. Secrets are automatically redacted from stdout/stderr logs.
