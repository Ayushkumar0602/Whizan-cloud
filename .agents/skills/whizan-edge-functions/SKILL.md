---
name: whizan-edge-functions
description: Comprehensive workflow and operational protocol for creating, deploying, securing, invoking, and maintaining serverless Edge Functions on Whizan Cloud Service using @whizan/mcp-devops.
---

# Whizan Edge Functions — Autonomous Agent Skill

This skill guides agents and developers through creating, deploying, testing, and managing **Whizan Edge Functions** — the ultra-fast serverless compute subsystem of Whizan Cloud Service.

---

## ⚡ 1. The Edge Function Lifecycle Protocol

```
1. AUDIT / DETECT           2. PROVISION SERVICE         3. CONFIGURE SECRETS
whizan_analyze_workspace ──► whizan_create_function_service ──► whizan_set_env_vars
(Identifies functions)      (Returns Function API Key)    (AES-256-GCM encrypted)
                                                                    │
                                                                    ▼
6. LIVE TEST / INVOCATION   5. SECURE & RATE LIMIT       4. COMPILE & DEPLOY
whizan_invoke_function   ◄── whizan_create_function_api_key ◄── whizan_deploy_function
(Measures latency & status)  (Fine-grained RBAC & Quotas)  (Sub-5ms esbuild bundle)
```

---

## 🛠️ 2. Step-by-Step Operations

### Step 1: Provision an Edge Function Service
Use `whizan_create_function_service` to register a function service:
```json
{
  "name": "Payment Webhook Processor",
  "slug": "payment-api",
  "runtime": "EDGE_TYPESCRIPT",
  "timeoutMs": 10000,
  "memoryLimit": 128,
  "isPublic": false,
  "corsOrigins": ["*"],
  "envVars": {
    "STRIPE_SECRET_KEY": "sk_test_..."
  }
}
```
**Output:**
- `serviceId`: Unique identifier in database.
- `slug`: Subdomain identifier (`payment-api`).
- `apiKey`: Dedicated Function API Key (`whz_fn_live_...`). Store securely.
- `invocationUrl`: `http://payment-api.fn.20.2.136.11.nip.io`

### Step 2: Deploy Function Code
Functions follow the standard Web Fetch API (`Request` -> `Response`):
```typescript
export default async function handler(req: Request, context: any) {
  const { amount, currency } = await req.json();
  // Access encrypted secrets via context.env
  const stripeKey = context.env.STRIPE_SECRET_KEY;
  
  return Response.json({
    success: true,
    receivedAmount: amount,
    timestamp: new Date().toISOString()
  });
}
```
Deploy the code via `whizan_deploy_function`:
```json
{
  "functionId": "<serviceId>",
  "code": "export default async function handler(req, context) { ... }",
  "workspaceDir": "."
}
```

### Step 3: Function API Key Management
Generate scoped API keys with rate limiting using `whizan_create_function_api_key`:
```json
{
  "functionId": "<serviceId>",
  "name": "Mobile Client Key",
  "scopes": ["EXECUTE"],
  "rateLimitRpm": 300,
  "ipWhitelist": []
}
```

### Step 4: Invoke and Verify Function
Test the deployed function using `whizan_invoke_function`:
```json
{
  "slug": "payment-api",
  "path": "/charge",
  "method": "POST",
  "body": { "amount": 2500, "currency": "usd" },
  "apiKey": "whz_fn_live_..."
}
```
Verify:
- `status`: 200 OK
- `durationMs`: Under 10ms for warm calls.
- `X-Whizan-Runtime`: `Edge-V8`

---

## 🛡️ 3. Critical Edge Cases & Failure Recovery

1. **VM Reboot / Redis Cache Flushing:**
   - Edge Router automatically invokes internal API fallback (`/api/functions/internal/resolve/:slug`) on cache miss.
   - On VM restart, `rehydrateEdgeFunctions()` scans PostgreSQL and re-populates all active function routing metadata and API key hashes into Redis in under 50ms.
2. **Infinite Loops & CPU Runaways:**
   - The runtime enforces hard `AbortController` cancellation at `timeoutMs`. Requests that exceed the timeout immediately return HTTP `504 Gateway Timeout`.
3. **Database Connection Flooding:**
   - When connecting to PostgreSQL from functions, always use the managed **PgBouncer** connection string (`poolerPort`, port 6543) to multiplex hundreds of function invocations across small connection pools.
4. **Secret Leaks:**
   - Secret values defined in `envVars` are automatically masked as `[REDACTED]` in stdout/stderr logs.
