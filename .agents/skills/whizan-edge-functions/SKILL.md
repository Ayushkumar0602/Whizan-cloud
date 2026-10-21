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
- `invocationUrl`: `https://payment-api.whizan.cloud`

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

## 🔒 3. Mandatory Security Categorization Protocol

Agents **MUST ALWAYS** classify functions and endpoints into one of two security models:

### Model A: Public Webhook (`isPublic: true`)
- **Use Cases**: External webhook ingestion (Stripe, PayPal, GitHub, Shopify, Clerk) and unauthenticated health check endpoints (`/health`, `/status`, `/ping`).
- **Behavior**: The Edge Router allows direct HTTP calls without requiring `x-api-key` or `Authorization` headers.
- **Rule**: ONLY mark an endpoint as public if it is intentionally meant to be reached by arbitrary clients or third parties that cannot send a custom `x-api-key`.

### Model B: Specific / API Key Protected (`isPublic: false` - DEFAULT & MANDATORY)
- **Use Cases**: User authentication, database mutations, internal microservices, LLM/AI inference pipelines, payment processing, file conversions, and private tools.
- **Behavior**: The Edge Router mandates a valid Function API Key (`x-api-key: whz_fn_live_...` or `Authorization: Bearer <key>`). Missing or invalid keys are immediately rejected with HTTP `401 UNAUTHORIZED`.
- **Key Generation**: Use `whizan_create_function_api_key` to generate production keys with rate limiting (RPM) and IP whitelisting.

### Hybrid Granular Security in a Single Service
A single service can host both public webhooks and protected endpoints!
- Use `whizan_configure_function_endpoint` to set:
  * `/webhook/stripe` -> `isPublic: true`
  * `/courses` -> `isPublic: false`
  * `/processPdf` -> `isPublic: false`

---

## 🛡️ 4. Critical Edge Cases & Disaster Recovery

1. **VM Turn-Off & Reboot (Zero-State Self-Healing):**
   - **Scenario**: The Azure VM host is powered off, restarted, or replaces its ephemeral disk (`/opt/whizan/apps/function-runtime/functions-storage` is empty).
   - **Resolution**: Whizan Edge Functions feature a 3-tier self-healing fallback:
     1. *Tier 1 (Local Disk)*: Checks for precompiled ESM bundle.
     2. *Tier 2 (Upstash Redis)*: Checks `fn:source:<id>:v<ver>` source cache.
     3. *Tier 3 (PostgreSQL Source of Truth)*: The Function Runtime automatically queries Render Control Plane (`GET /api/functions/:id/code`), downloads persistent source code from PostgreSQL, compiles the bundle on-the-fly with esbuild, caches it in Redis, and executes the request with 200 OK!
   - **Zero Human Intervention**: No redeployments, no file restores, and no manual SSH commands required.
2. **Infinite Loops & Timeout Enforcements:**
   - The runtime enforces hard V8 isolate cancellation at `timeoutMs` (or endpoint-specific `timeoutSeconds`). Requests exceeding limits return HTTP `504 Gateway Timeout`.
3. **Database Connection Flooding:**
   - Always connect via Supabase/PgBouncer connection pool (`poolerPort: 6543`) to multiplex hundreds of serverless executions across small connection pools.
4. **Secret Leaks & Sanitization:**
   - All environment variables are encrypted at rest with AES-256-GCM. Secret values in `envVars` are automatically masked as `[REDACTED]` in stdout/stderr logs.
