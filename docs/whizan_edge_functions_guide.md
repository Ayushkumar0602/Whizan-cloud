# Whizan Edge Functions — Complete Architecture, Security & Operations Guide

> **System Blueprint & Developer Reference Manual**  
> **Subsystem Scope:** Whizan Serverless Edge Compute Engine (`apps/function-runtime`, `apps/edge-router`, `apps/api`, `apps/dashboard`, `@whizan/mcp-devops`)  
> **Target Runtime:** Dual-Tier Isolated V8 & Node Worker Pools, esbuild compiler, Upstash Redis 7+, Supabase PostgreSQL (PgBouncer), Azure Linux VM

---

## ⚡ 1. Executive Summary & Architectural Topology

Whizan Edge Functions provide serverless, event-driven compute designed for **instant scale**, **sub-5ms execution**, and **zero port allocation**. Unlike monolithic containers that consume 150MB+ of RAM and require dedicated TCP ports on the host, Edge Functions run as isolated ESM bundles within pooled V8 sandboxes.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             WHIZAN CLOUD TOPOLOGY                                │
├─────────────────────────────────────┬────────────────────────────────────────────┤
│   CONTROL PLANE (Render Cloud)      │            DATA TIER (Cloud Managed)       │
│   • Fastify REST API                │   • Supabase PostgreSQL (PgBouncer :6543)  │
│   • Authentication & RBAC           │   • Upstash Redis (Routes, Cache, Pub/Sub) │
│   • Persistent Source Code Storage  │                                            │
├─────────────────────────────────────┴────────────────────────────────────────────┤
│                       EDGE INFRASTRUCTURE (Azure VM Host)                        │
│                                                                                  │
│   [Port 80] Edge Router                                                          │
│     ├── Path-based & Subdomain Router (*.fn.whizan.cloud)                        │
│     ├── Granular Security Engine (Public Webhooks vs API Key Authentication)     │
│     ├── Redis Atomic Token Bucket Rate Limiter (RPM)                             │
│     └── Internal Socket Proxy ──────────────────┐                                │
│                                                 ▼                                │
│                                   [Port 9090] Function Runtime Engine            │
│                                     ├── Hot V8 Isolate Pool (Sub-5ms start)      │
│                                     ├── On-The-Fly Bundler (esbuild)             │
│                                     ├── 3-Tier Disaster Recovery Resolver        │
│                                     └── Context & AES-256 Env Injector           │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Key Performance Benchmarks
- **Cold Start Latency:** `< 5ms` for ESM V8 Isolates (compared to `1.5s–4s` for Docker).
- **Idle Memory:** `0 MB` (complete scale-to-zero when no traffic is present).
- **Active Memory:** `8MB–15MB` baseline per function execution.
- **Port Allocation:** `0 host TCP ports` (all functions route via port 9090 gateway).
- **Concurrency:** Up to `250+ concurrent function requests` on a standard 2 vCPU / 4GB VM without triggering Linux Out-Of-Memory (OOM) killer.

---

## 🔒 2. Security Architecture & Categorization

Whizan enforces a strict, two-tier security classification across both the **Dashboard** and the **MCP DevOps Tools**.

```
                           Incoming Request
                                  │
                                  ▼
                   Does route match an Endpoint?
                       /                     \
                     Yes                      No
                     /                         \
         Inspect endpoint.isPublic      Inspect service.isPublic
                /         \                   /         \
             true        false             true        false
              │            │                │            │
              ▼            ▼                ▼            ▼
           PUBLIC       PROTECTED        PUBLIC       PROTECTED
           WEBHOOK      (Requires        WEBHOOK      (Requires
          (No Key)     whz_fn_live_...)  (No Key)    whz_fn_live_...)
```

### Category 1: Public Webhooks (`isPublic: true`)
- **Purpose:** External event ingestion from third-party services that cannot supply custom headers or dynamic tokens (e.g., Stripe, GitHub, Shopify, PayPal, Clerk), as well as open health status checks (`/health`, `/ping`).
- **Behavior:** The Edge Router allows direct HTTP execution without demanding an `x-api-key`.
- **CORS Handling:** Handles `OPTIONS` preflight requests immediately with HTTP 204.

### Category 2: Specific / API Key Protected (`isPublic: false` — DEFAULT)
- **Purpose:** All sensitive APIs, database read/writes, user operations, billing endpoints, internal tools, and AI inference tasks.
- **Behavior:** The Edge Router demands a cryptographically valid Function API Key via one of:
  * Header: `x-api-key: whz_fn_live_...`
  * Header: `Authorization: Bearer whz_fn_live_...`
  * Query string: `?apiKey=whz_fn_live_...`
- **Missing or Invalid Keys:** Returns HTTP `401 UNAUTHORIZED` with actionable JSON diagnostic messages.

### Granular Hybrid Endpoints in a Single Service
A single service can host both public webhooks and protected endpoints simultaneously!
- **Example:**
  * `POST /webhook/stripe` → **Public Webhook** (`isPublic: true`)
  * `POST /charge` → **API Key Protected** (`isPublic: false`)
  * `GET /users/:id` → **API Key Protected** (`isPublic: false`)
  * `GET /health` → **Public Webhook** (`isPublic: true`)

### Function API Keys Cryptographic Protection
- API keys are formatted as `whz_fn_live_<32-hex-bytes>`.
- **Database Storage:** Keys are NEVER stored in plaintext. Supabase stores only the SHA-256 hash (`keyHash`) and an AES-256-GCM encrypted cipher (`keyCipher`).
- **Redis Verification:** SHA-256 hash is cached in Redis (`fn:key:<hash>`) with a token bucket for instant `< 0.5ms` authentication.

---

## 🛠️ 3. Developing Multi-Function Endpoints

Whizan automatically detects and exposes multiple endpoints from a single source file. You can structure code in any of the following standard patterns:

### Pattern A: Modern Named ESM Exports (Recommended)
```typescript
// GET or POST http://<slug>.fn.whizan.cloud/getUsers
export async function getUsers(req: Request, context: any) {
  return Response.json({ users: [{ id: 1, name: "Alice" }] });
}

// POST http://<slug>.fn.whizan.cloud/charge
export async function charge(req: Request, context: any) {
  const body = await req.json();
  const stripeKey = context.env.STRIPE_SECRET_KEY;
  return Response.json({ success: true, charged: body.amount });
}

// POST http://<slug>.fn.whizan.cloud/webhook
export async function webhook(req: Request, context: any) {
  const event = await req.json();
  return Response.json({ received: true, type: event.type });
}
```

### Pattern B: Default Handler (Single Endpoint / Catch-All)
```typescript
export default async function handler(req: Request, context: any) {
  const url = new URL(req.url);
  
  if (url.pathname === "/status") {
    return Response.json({ status: "healthy", uptime: process.uptime() });
  }
  
  return Response.json({
    message: "Hello from Whizan Edge Function!",
    path: url.pathname,
    clientIp: context.clientIp,
  });
}
```

### Context Object Reference
Every function invocation receives a `context` parameter containing:
- `context.env`: Decrypted environment variables and secrets (AES-256-GCM decrypted at runtime).
- `context.serviceId`: Unique UUID of the Function Service.
- `context.slug`: Subdomain slug of the service.
- `context.version`: Active deployment version integer.
- `context.clientIp`: Client remote IP address.
- `context.timeoutMs`: Maximum execution time before hard cancellation.

---

## 🛡️ 4. Zero-State Disaster Recovery & VM Reboot Resilience

A major design goal of Whizan Edge Functions is **effortless survivability across VM reboots, crashes, and disk purges**.

```
                        Request Arrives at Edge Router
                                      │
                                      ▼
                        Bundle exists on VM Disk?
                                /           \
                              Yes            No (VM restarted / disk wiped)
                              /               \
                 Load from disk & run          ▼
                                     Source in Redis Cache?
                                         /            \
                                       Yes             No (Redis flushed / expired)
                                       /                \
                       esbuild on-the-fly                ▼
                                            Query Control Plane API
                                            (api.whizan.cloud)
                                                        │
                                                        ▼
                                            Fetch persistent sourceCode
                                            from Supabase PostgreSQL
                                                        │
                                                        ▼
                                            Compile bundle.mjs via esbuild
                                                        │
                                                        ▼
                                            Cache source in Redis & save bundle
                                                        │
                                                        ▼
                                            Execute in V8 isolate pool -> 200 OK
```

### The 3-Tier Self-Healing Hierarchy:
1. **Tier 1 (Host Disk):** Looks for pre-compiled bundle in `/opt/whizan/apps/function-runtime/functions-storage/<serviceId>/v<ver>/bundle.mjs`.
2. **Tier 2 (Redis Cache):** If missing on disk, inspects Redis key `fn:source:<serviceId>:v<ver>`.
3. **Tier 3 (PostgreSQL Persistent Storage):** If Redis was also cleared or expired, the runtime issues an internal HTTP call to Render Control Plane (`GET /api/functions/:id/code`), retrieves the persistent source code from PostgreSQL `function_deployments.source_code`, compiles the bundle on-the-fly with esbuild, caches the source in Redis, and executes the request.

### What happens when you turn off and restart the Azure VM?
1. The VM powers off. Local RAM and active memory pools are cleared.
2. The VM boots up. Systemd brings up PM2 with `edge-router` (:80) and `whizan-functions` (:9090).
3. The first incoming request hits `http://smart-study-api.fn.whizan.cloud/sendMessage`.
4. `edge-router` queries Render API `/api/functions/internal/resolve/smart-study-api` if Redis key is cold.
5. `function-runtime` compiles or loads the bundle from PostgreSQL/Redis on-the-fly.
6. The request succeeds with **HTTP 200 OK** on the very first try without requiring any redeployment or SSH commands.

---

## 📊 5. Dashboard Management Guide

Navigate to **Dashboard → Edge Functions** to manage your serverless infrastructure:

### 1. Overview Tab
- Visualizes real-time performance: Active Version, Subdomain Slug, Invocations, P95 Latency, and Memory.
- Lists all active functions with interactive **Public Webhook** vs **API Key** badges. Click any badge to toggle security mode instantly.

### 2. Functions & Endpoints Catalog Tab
- Shows the complete list of registered routes, handler names, allowed HTTP methods, memory limits, and timeout limits.
- **Scan & Sync Functions Button:** Analyzes your latest deployed source code and automatically registers any newly exported functions in PostgreSQL and Redis.
- **Configure Button:** Opens the configuration modal to tune memory (64MB–1024MB), timeout (1s–60s), and toggle security policy with a dual-card selector.

### 3. Code & Deploy Tab
- Integrated code editor showing your actual deployed source code retrieved directly from PostgreSQL.
- Displays active version tag and bundle status.
- **Deploy Changes:** Bundles code in sub-5ms, registers endpoints, and immediately broadcasts `fn:reload` over Redis Pub/Sub.
- **Revert to Deployed:** Re-syncs the editor with the active live version on the server.

### 4. Function API Keys Tab
- Create, view, and revoke dedicated API keys (`whz_fn_live_...`).
- Configure custom Rate Limits (requests per minute) and Client IP Whitelists.

### 5. Central Secrets Tab
- Add encrypted environment variables (e.g. `DATABASE_URL`, `STRIPE_KEY`, `OPENAI_API_KEY`).
- Values are encrypted with AES-256-GCM and injected securely into all functions under this service.

---

## 🤖 6. MCP DevOps Protocol for Autonomous Agents

When pair programming or autonomously managing Whizan Cloud via `@whizan/mcp-devops`, agents must adhere to this protocol:

### Agent Decision Tree for Function Creation:
1. **Analyze Codebase:** Does the project have serverless functions, webhooks, or background tasks?
2. **Determine Security Model:**
   * Is it an external webhook (e.g. Stripe, GitHub)? → Set `isPublic: true`.
   * Is it a database API, user service, or private tool? → **Mandatory `isPublic: false`**.
3. **Call `whizan_create_function_service`:**
   ```json
   {
     "name": "User Microservice",
     "slug": "user-api",
     "isPublic": false,
     "memoryLimit": 128,
     "timeoutMs": 10000
   }
   ```
4. **Deploy Function Source Code:**
   Call `whizan_deploy_function` with the TypeScript or JavaScript code.
5. **Configure Granular Endpoints (If Hybrid):**
   If an endpoint is a webhook, call `whizan_configure_function_endpoint`:
   ```json
   {
     "functionId": "<serviceId>",
     "routePath": "/webhook",
     "isPublic": true
   }
   ```
6. **Generate & Store API Key:**
   Call `whizan_create_function_api_key` to obtain `whz_fn_live_...` and provide it to the client.
7. **Test Invocation:**
   Call `whizan_invoke_function` to verify `status: 200` and `durationMs < 10ms`.

---

## 🚀 7. Troubleshooting & Diagnostic Commands

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| **HTTP 401 Unauthorized** | Request is hitting a protected function without `x-api-key`. | Add `x-api-key: whz_fn_live_...` or toggle endpoint to Public Webhook in Dashboard. |
| **HTTP 404 Endpoint Not Found** | Function name not exported in code or not yet registered. | Click "Scan & Sync Functions" in Dashboard or export `export async function endpointName()`. |
| **HTTP 504 Gateway Timeout** | Execution exceeded configured timeout limit. | Increase timeout in Dashboard (up to 60s) or optimize async queries. |
| **HTTP 429 Too Many Requests** | Function API Key exceeded rate limit (RPM). | Increase `rateLimitRpm` via API Key settings in Dashboard. |
| **502 Bad Gateway from Router** | `function-runtime` daemon on VM is stopped. | Run `sudo pm2 restart whizan-functions` on the VM. |
