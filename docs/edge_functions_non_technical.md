# Whizan Edge Functions — Product Guide & Non-Technical Overview

> **Executive Summary:** Whizan Edge Functions bring true serverless, event-driven compute to the Whizan Cloud Service ecosystem — delivering the developer simplicity of **Firebase Cloud Functions** and the raw execution power of **AWS Lambda**, directly hosted on our modern cloud infrastructure.

---

## 🌟 1. What are Whizan Edge Functions?

In traditional cloud hosting (like Whizan Backend Services), applications run as continuous, long-lived server containers (e.g., Node.js Express, Python FastAPI, Go Gin) that listen on a network port 24 hours a day, 7 days a week. While ideal for heavy, stateful backends, this model is inefficient for small, sporadic tasks:
- Sending a welcome email when a user signs up.
- Validating a Stripe payment webhook.
- Running a database cleanup task every midnight.
- Resizing an uploaded profile picture.
- Proxying an AI / LLM prompt securely without exposing API secrets in mobile/web frontends.

**Whizan Edge Functions** solve this by providing **ephemeral, serverless execution units**:
1. You write a single, focused piece of code (a function).
2. It stays asleep at **absolute zero resource cost** until a request arrives or an event triggers it.
3. It spins up in **milliseconds**, executes the task, returns the result, and immediately releases memory.
4. Access is strictly governed by **dedicated Function API Keys** (`whz_fn_live_...`) with fine-grained security policies.

```
 Traditional Backend Service               Whizan Edge Function
 ┌───────────────────────────┐             ┌───────────────────────────┐
 │ • Running 24/7            │             │ • Sleeps at 0% CPU & RAM  │
 │ • Consumes 200MB - 1GB RAM│     VS      │ • Wakes up in < 5ms       │
 │ • Heavy container boot    │             │ • Runs task & returns     │
 │ • Complex infrastructure  │             │ • Instant auto-scaling    │
 └───────────────────────────┘             └───────────────────────────┘
```

---

## 🔑 2. The Core User Journey

Creating and consuming an Edge Function in Whizan Cloud Service is designed to take less than **60 seconds**:

```
 ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 │ 1. Create    │ ──► │ 2. Get API   │ ──► │ 3. Write or  │ ──► │ 4. Call from │
 │ Function Svc │     │ Key & URL    │     │ Deploy Code  │     │ Web / Mobile │
 └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### Step 1: Create a Function Service
- In the Whizan Dashboard or through the Whizan CLI / IDE MCP, select **"New Edge Function"**.
- Choose your runtime: **TypeScript / JavaScript** (ultra-fast V8 Edge), **Python 3.11**, or **Go 1.22**.
- Assign a unique slug (e.g. `payment-processor` or `auth-hooks`).

### Step 2: Receive Dedicated Function API Keys & Endpoint
- The system automatically generates a cryptographically secure Function API Key:
  ```text
  whz_fn_live_9a8b7c6d5e4f3a2b1c0d9e8f...
  ```
- You receive a global high-speed invocation URL:
  ```text
  https://payment-processor.fn.whizan.cloud/charge
  ```
- Whizan gives you instant controls to toggle whether functions are **Public** (e.g., public webhooks from Stripe/GitHub) or **Protected** (requires the API Key in the `x-api-key` header).

### Step 3: Write or Deploy Code
- **In-Browser Web Editor:** Write code directly in the Whizan Dashboard using the built-in Monaco editor with live syntax highlighting and TypeScript autocomplete.
- **Git or Direct Deploy:** Connect a GitHub repository or use the Whizan DevOps CLI / MCP (`whizan_deploy_direct`) to upload a folder of functions.

### Step 4: Call from Anywhere
- Invoke your function from any web application, iOS/Android mobile app, backend service, or third-party webhook:
  ```bash
  curl -X POST https://payment-processor.fn.whizan.cloud/charge \
    -H "x-api-key: whz_fn_live_9a8b7c6d5e4f3a2b1c0d9e8f..." \
    -H "Content-Type: application/json" \
    -d '{"amount": 4900, "currency": "usd"}'
  ```

---

## ⚡ 3. Complete Feature Catalog

Whizan Edge Functions offer an enterprise-grade feature set mirroring Firebase Functions, Supabase Edge Functions, and AWS Lambda:

### 1. Multi-Trigger Architecture (Event-Driven Cloud)
Functions can be triggered by multiple distinct event sources:
- **HTTP / REST Triggers:** Synchronous web requests via `GET`, `POST`, `PUT`, `DELETE` with JSON, form-data, or binary streaming.
- **Scheduled (Cron) Triggers:** Run tasks on recurring intervals (e.g. `*/15 * * * *` for every 15 minutes, or `0 0 * * *` for midnight database rollups) without needing an external cron service.
- **Database (CDC) Triggers:** Automatically invoke functions whenever a record is created, updated, or deleted in a Whizan PostgreSQL database.
- **Storage / Upload Triggers:** Execute automatically when files or media are uploaded to cloud storage (e.g., generate image previews, extract document text).
- **Background Queue / Redis Triggers:** Consume asynchronous background jobs and Redis Pub/Sub topics.

### 2. Multi-Tier Security & API Key Governance
- **Scoped API Keys:** Issue multiple API keys per function service (e.g., `Production Server Key`, `Mobile Client Key`, `Staging Key`).
- **Granular Permissions:** Restrict keys to `Execute Only`, `Read Logs`, or `Full Admin`.
- **IP Whitelisting & CIDR Restrictions:** Restrict function invocation to specific corporate IPs or webhook provider CIDR blocks.
- **Token-Bucket Rate Limiting:** Enforce per-minute or per-second request quotas per API key to shield against denial-of-service or billing runaways.
- **Instant Revocation & Killswitch:** Deactivate compromised keys with a single click in under 1 second across all edge nodes.

### 3. Developer Experience (DX) & Live Testing
- **Interactive In-Dashboard Playground:** Test your function right inside the dashboard with custom HTTP headers, JSON body payloads, and query parameters before pushing to production.
- **Real-Time Log Streaming:** Watch `console.log()`, `console.error()`, and execution traces stream in real-time over WebSockets / Server-Sent Events (SSE).
- **Execution Telemetry:** View exact execution time in milliseconds (`Duration: 12ms`), memory consumed (`Memory: 24MB`), and HTTP status codes for every invocation.
- **Encrypted Environment Secrets:** Store database connection strings, Stripe keys, and third-party tokens with military-grade AES-256-GCM encryption.

### 4. Smart Resource Optimization & Scale-to-Zero
- **True Scale-to-Zero:** When no requests are arriving, the function consumes **0% CPU** and **0MB RAM**, dramatically reducing infrastructure operational costs.
- **Sub-5ms Cold Starts:** For JavaScript / TypeScript edge functions, lightweight V8 Isolate sandboxes eliminate the typical 1-3 second container boot penalty of legacy cloud providers.
- **Configurable Keep-Warm:** For ultra-sensitive production APIs where every millisecond counts, toggle `minInstances: 1` to keep a dedicated worker pre-warmed 24/7.

### 5. Blue/Green Deployments & Traffic Splitting
- **Zero-Downtime Code Updates:** New function versions deploy in the background while existing traffic is seamlessly served.
- **Instant Rollback:** One-click rollback to any previous deployment if a bug is detected in production.
- **Canary Traffic Splitting:** Safely test new versions by routing 10% of live traffic to `v2` while 90% remains on stable `v1`.

---

## 🏢 4. Real-World Business & Developer Use Cases

| Use Case | How Whizan Edge Functions Deliver Value |
| :--- | :--- |
| **Payment Webhooks (Stripe / Razorpay)** | High-reliability HTTP endpoint that verifies cryptographic signatures, updates database records, and triggers customer receipt emails without running a dedicated web server. |
| **Authentication & User Onboarding** | Automatically fires a welcome email and creates an initial customer workspace when a user signs up. |
| **AI / LLM Prompt Proxying** | Keeps expensive OpenAI / Anthropic / Gemini API keys secure on the backend while streaming tokens directly to mobile or frontend web clients with low latency. |
| **Nightly Database Maintenance & Backups** | Executes scheduled cron scripts to summarize daily sales, prune expired login sessions, and vacuum database tables. |
| **Form Processing & Lead Capture** | Captures landing page contact submissions, validates reCAPTCHA tokens, and forwards leads to CRM webhooks (Slack, HubSpot). |
| **Image & Asset Optimization** | Resizes user avatars and compresses PDF documents on-demand upon upload. |

---

## 💰 5. Subscription Tiers & Compute Allocations

Whizan Cloud Service enforces transparent, predictable resource tiers designed to fit indie hackers, startups, and high-scale enterprises:

| Feature / Limit | Hobby Tier (Free) | Professional Tier | Enterprise Tier |
| :--- | :--- | :--- | :--- |
| **Monthly Invocations** | 100,000 requests / month | 2,000,000 requests / month | Unlimited / Custom |
| **Execution Timeout** | Max 10 seconds | Max 60 seconds | Up to 15 minutes |
| **Memory Allocation** | 128 MB | Up to 512 MB | Up to 2048 MB |
| **Scale-to-Zero** | Always enabled (0 instances when idle) | Configurable (0 to 10 instances) | Dedicated Warm Pools |
| **Max Concurrent Requests** | 10 concurrent requests | 100 concurrent requests | Custom dedicated concurrency |
| **Function API Keys** | Up to 3 active keys | Up to 25 active keys | Unlimited with IAM RBAC |
| **Cron Schedules** | Up to 3 recurring schedules | Up to 25 recurring schedules | Unlimited schedules |
| **Custom Domains** | `<slug>.fn.whizan.cloud` | Custom domains with auto SSL | Custom domains + Multi-region CDN |

---

## 🛡️ 6. Reliability, Safety & Edge Case Handling

Whizan Edge Functions are engineered to fail gracefully and protect your infrastructure:

1. **Runaway Loop Protection (Hard Timeouts):** If user code enters an infinite `while(true)` loop, the runtime forcefully terminates execution precisely at the configured timeout (e.g. 10s), returning an HTTP `504 Gateway Timeout` and preventing CPU lockups.
2. **Out-of-Memory (OOM) Guardrails:** If a function allocates more memory than its limit, the sandbox is isolated and recycled safely without affecting any neighboring tenant or system processes.
3. **Database Flood Prevention (Built-in PgBouncer):** Unlike legacy serverless architectures where 1,000 concurrent functions spawn 1,000 database connections and crash PostgreSQL, Whizan functions automatically route through our built-in **PgBouncer Connection Pooler**, maintaining database stability even during massive traffic spikes.
4. **DDoS & Spurt Protection:** High-frequency abuse is instantly intercepted by the Edge Router before touching the function runtime, preserving your compute budget.
5. **Zero Secrets Leakage:** All environment variables and API keys are automatically masked in log outputs, ensuring sensitive database passwords and private keys are never exposed in team logs.

---

## 🎯 7. Conclusion & Next Steps

Whizan Edge Functions bridge the gap between static web hosting and complex microservice deployments. By giving developers the power to deploy serverless code with instant API key access, scheduled triggers, and sub-millisecond cold starts, Whizan Cloud Service delivers a complete, world-class developer cloud.

To explore the low-level implementation details, code execution engines, database schemas, and networking flow, see the companion document:
👉 **[Whizan Edge Functions — Technical Architecture & Low-Level Design (LLD)](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/edge_functions_technical.md)**
