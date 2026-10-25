/**
 * Whizan Cloud Platform Documentation & Resources for MCP Agents
 * Provides comprehensive technical references, SDK guides, deployment protocols,
 * and operational instructions directly into the Model Context Protocol.
 */

export interface McpDocResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  content: string;
}

export const WHIZAN_DOC_RESOURCES: McpDocResource[] = [
  {
    uri: "whizan://docs/overview",
    name: "Whizan Cloud Platform Overview & Architecture",
    description: "Architectural overview of Whizan Cloud Control Plane, Edge Router, Compute Worker, Databases, Storage, and MCP tooling.",
    mimeType: "text/markdown",
    content: `# Whizan Cloud Platform Architecture & Overview

Whizan Cloud is a modern developer platform that hosts frontend web applications, backend microservices, serverless edge functions, managed databases, and cloud object storage.

## Core Architecture

1. **Control Plane REST API (\`https://api.whizan.cloud\`)**:
   - Fastify-based high-throughput REST API.
   - Manages projects, backend services, deployments, database provisioning, storage buckets, API keys, and metrics.
   - Universal authentication via Developer JWTs and dedicated service keys (\`whz_live_...\`, \`whz_stg_live_...\`, \`whz_fn_live_...\`).
   - Web Dashboard: [https://dashboard.whizan.cloud](https://dashboard.whizan.cloud)

2. **Edge Router & Universal Always-On Gateway**:
   - Global Edge Router handles routing for \`https://<slug>.whizan.cloud\` with sub-5ms latency and wildcard Cloudflare SSL.
   - **Universal Live Gateway (\`/live/<slug>\`)**: Transparently auto-wakes sleeping containers from zero without dropping incoming HTTP requests.
   - Preserves canonical host headers (\`x-forwarded-host\`, \`x-forwarded-proto\`) ensuring CSRF validation and origin matching (Next.js Server Actions, Django, Rails) succeed automatically.

3. **Compute Worker & Build System**:
   - Zero-Docker stack-independent container synthesis for Node.js, Python (FastAPI/Django), Go, Rust, Java, and Dockerfiles.
   - **Blue/Green Zero-Downtime Deployments**: Legacy containers continue serving live traffic during builds; traffic only cuts over after passing deep HTTP readiness checks.
   - Automatic devDependencies preservation during build phase ensuring build tools (\`tsc\`, \`vite\`, \`esbuild\`) compile cleanly even when \`NODE_ENV=production\` is defined.

4. **Cloud Object Storage (R2 / S3)**:
   - High-throughput S3-compatible cloud object storage powered by Cloudflare R2.
   - Scoped access keys (\`whz_stg_live_...\`) with granular permissions (\`READ_WRITE\`, \`READ_ONLY\`) and bucket-level isolation.
   - Built-in public CDN distribution: \`https://api.whizan.cloud/storage/v1/public/:bucket/:objectPath\`.

5. **Serverless Edge Functions (V8 Runtime)**:
   - Event-driven micro-endpoints executing on an isolated V8 runtime with sub-5ms cold starts and zero container footprint.
   - 3-tier self-healing disaster recovery: disk bundle -> Redis in-memory cache -> PostgreSQL control plane source.

6. **Cron & Flow Orchestration Engine**:
   - Sub-second cron scheduling across Edge Functions, Container Exec, Internal Mesh, and Webhooks.
   - DAG workflow engine with conditional branching, parallel fan-out, and human-in-the-loop approval gates.

## Subscription Tiers & Compute Limits
- **Hobby Tier**:
  - Web projects run on standard Edge routing / CDN.
  - Backend microservices are locked to \`0.1 vCPU\`, \`512MB RAM\`, and \`autoSleep: true\`.
  - Databases are locked to starter tier (\`0.5 vCPU\`, \`512MB RAM\`).
- **Professional Tier**:
  - Upgraded instances (\`starter\`, \`standard\`, \`pro\`, \`pro_plus\`) with dedicated CPU/RAM and optional persistent background daemons.
`,
  },
  {
    uri: "whizan://docs/storage-sdk",
    name: "Whizan Cloud Object Storage SDK & API Reference",
    description: "Complete guide to provisioning buckets, generating scoped access keys, and using the @whizan/storage-client SDK.",
    mimeType: "text/markdown",
    content: `# Whizan Cloud Object Storage — SDK & API Reference

Whizan Cloud Object Storage provides fast, durable, S3-compatible cloud storage powered by Cloudflare R2 with automatic quota management.

## 1. Quick Workflow for Agents

1. **Inspect / Provision Bucket**:
   - Check existing buckets: \`whizan_storage_list_buckets\`
   - Create bucket: \`whizan_storage_create_bucket\` with:
     - \`name\`: 3-63 lowercase alphanumeric chars and hyphens (e.g. \`"user-avatars"\`, \`"invoices"\`)
     - \`isPublic\`: \`true\` for public CDN media/assets; \`false\` for private user uploads/documents.
2. **Generate Access Key**:
   - Call \`whizan_storage_create_api_key\` with:
     - \`name\`: Descriptive label (e.g. \`"App Media Key"\`)
     - \`permission\`: \`"READ_WRITE"\` (permits uploads & deletes) or \`"READ_ONLY"\` (downloads only)
     - \`bucketId\`: Bucket ID or bucket name to scope the key to (or omit for account-wide access).
3. **Inject Environment Variables**:
   - Call \`whizan_set_env_vars\` to set:
     - \`WHIZAN_STORAGE_KEY: "whz_stg_live_..."\`
     - \`WHIZAN_API_URL: "https://api.whizan.cloud"\`
     - Frontend client-side apps: \`NEXT_PUBLIC_WHIZAN_STORAGE_KEY\` or \`VITE_WHIZAN_STORAGE_KEY\`
4. **Key Lifecycle & Revocation**:
   - List active keys: \`whizan_storage_list_api_keys\`
   - Revoke/delete key: \`whizan_storage_delete_api_key\` with \`keyId\` or prefix (\`whz_stg_live_...\`).

## 2. Using \`@whizan/storage-client\` in Applications

Install package:
\`\`\`bash
npm install @whizan/storage-client
\`\`\`

### Client Initialization
\`\`\`ts
import { createClient } from "@whizan/storage-client";

const storage = createClient(
  process.env.WHIZAN_API_URL || "https://api.whizan.cloud",
  process.env.WHIZAN_STORAGE_KEY!
);
\`\`\`

### Uploading Files (Node.js Buffer or Web Blob)
\`\`\`ts
import fs from "fs";

const fileBuffer = fs.readFileSync("./avatar.png");
const { data, error } = await storage
  .from("user-avatars")
  .upload("users/101/avatar.png", fileBuffer, {
    contentType: "image/png",
    upsert: true,
  });

if (error) {
  console.error("Upload failed:", error.message);
} else {
  console.log("Uploaded successfully:", data.path);
}
\`\`\`

### Downloading Files
\`\`\`ts
const { data, error } = await storage
  .from("invoices")
  .download("2026/inv-0042.pdf");

if (error) throw error;
// In Node.js:
const buffer = Buffer.from(await data.arrayBuffer());
\`\`\`

### Generating Public CDN URLs
For public buckets (\`isPublic: true\`), assets are immediately accessible worldwide via the Whizan Edge CDN:
\`\`\`ts
const { publicUrl } = storage
  .from("public-assets")
  .getPublicUrl("branding/logo.svg");

// URL: https://api.whizan.cloud/storage/v1/public/public-assets/branding/logo.svg
\`\`\`

### Listing & Deleting Objects
\`\`\`ts
// List objects under a prefix
const { data: objects, error } = await storage
  .from("user-avatars")
  .list("users/101/", { limit: 20 });

// Delete an object
const { error: delError } = await storage
  .from("user-avatars")
  .delete("users/101/avatar.png");
\`\`\`

## 3. Direct REST API Examples

### Direct Upload via cURL
\`\`\`bash
curl -X POST "https://api.whizan.cloud/storage/v1/upload/user-avatars/sample.png" \\
  -H "Authorization: Bearer whz_stg_live_abc123..." \\
  -H "Content-Type: image/png" \\
  --data-binary @"/path/to/local.png"
\`\`\`

### Direct Download via cURL
\`\`\`bash
curl -X GET "https://api.whizan.cloud/storage/v1/download/invoices/doc.pdf" \\
  -H "Authorization: Bearer whz_stg_live_abc123..." \\
  -o "downloaded.pdf"
\`\`\`

## 4. Troubleshooting & Error Diagnosis

- **401 Unauthorized**: Missing \`Authorization: Bearer whz_stg_live_...\` header or \`WHIZAN_STORAGE_KEY\` is missing in container environment.
- **403 Forbidden (\`KEY_PERMISSION_READ_ONLY\`)**: Attempting to upload or delete using a \`READ_ONLY\` key. Recreate the key with \`permission: "READ_WRITE"\`.
- **403 Forbidden (\`KEY_BUCKET_SCOPE_MISMATCH\`)**: Key is scoped to bucket A, but request is targeting bucket B. Generate an unscoped key (\`bucketId: undefined\`) or target the scoped bucket.
- **502 / 503 Bad Gateway**: Web application container crashed while reading file stream. Call \`whizan_get_application_logs\` to view the container stack trace.
`,
  },
  {
    uri: "whizan://docs/deployment-protocol",
    name: "The Mandatory 6-Phase Deployment Protocol",
    description: "Step-by-step instructions for deploying frontend web projects, backend services, and background workers.",
    mimeType: "text/markdown",
    content: `# The Mandatory 6-Phase Deployment Protocol

When deploying services or web applications to Whizan Cloud, agents MUST follow this protocol in sequence:

\`\`\`
Phase 1: AUDIT & CONTEXT SYNC  Phase 2: ENVIRONMENT      Phase 3: PROVISION OR REDEPLOY
whizan_analyze_workspace     ──► whizan_set_env_vars ──► Reuse existing targetId OR
                                                         whizan_create_project/service
                                                                    │
                                                                    ▼
Phase 6: HEALTH CHECK          Phase 5: POLL LOGS        Phase 4: UPLOAD
whizan_check_health         ◄── whizan_get_build_logs  ◄── whizan_deploy_direct
(Must be 200 OK)                (Wait until READY/ACTIVE)  (Zero-redundancy cleanup)
\`\`\`

---

## Phase 1: Audit, AI Analysis & System Guardrails
- **Tool**: Call \`whizan_analyze_workspace({ workspaceDir: "." })\`.
- Powered by \`gemini-3.5-flash-lite\`, the analyzer inspects entry points, package manifests, and ports.
- **Cross-Chat Context Rule**: If \`existingDeployment\` is found in \`.whizan.json\` or server records:
  - DO NOT CREATE A NEW PROJECT OR SERVICE.
  - Ask user confirmation to redeploy to existing \`targetId\`, then proceed directly to Phase 4 or \`whizan_redeploy\`.
- **AI System Guardrail Enforcement (Refusal Rule)**:
  - Whizan Cloud hosts web services, backend APIs, background queue workers, and frontend web applications.
  - Non-deployable projects ARE STRICTLY REFUSED: Desktop GUIs (PyQt, PySide, Tkinter, Electron desktop client), native mobile apps (iOS/Android without web export), raw libraries/SDKs without a runnable server, and one-shot CLI scripts that exit immediately.
  - If \`guardrailPassed: false\`, do not attempt to deploy; notify user with the refusal reason.

---

## Phase 2: Environment Variables
- Check analyzer output for \`requiredEnvVarsToPrompt\` (e.g. database credentials, API secrets).
- Prompt the user to provide any missing secrets.
- Save variables using \`whizan_set_env_vars({ targetType, targetId, envVars })\` before initiating build.

---

## Phase 3: Provision or Redeploy

### Frontend & Fullstack Web Projects (\`whizan_create_project\`)
- **Pure Static HTML Sites (HTML, CSS, JS with no build)**:
  - Set: \`framework: "CUSTOM"\`, \`outputDir: "."\`, \`buildCommand: ""\`, \`installCommand: ""\`.
  - Registered directly with Edge Router for sub-5ms responses.
- **Static Web Apps (Vite, React, Astro)**:
  - Set: \`framework: "VITE"\` (or \`"REACT"\`), \`outputDir: "dist"\`, \`buildCommand: "npm run build"\`.
- **Next.js SSR & Server Actions**:
  - Set: \`framework: "NEXTJS"\`, \`outputDir: ".next"\`, \`buildCommand: "npm run build"\`.
  - **CRITICAL**: Never set \`output: 'export'\` if the app uses dynamic routes (\`/posts/[id]\`) or Server Actions. Whizan natively hosts Next.js server runtime.

### Backend Microservices & Workers (\`whizan_create_service\`)
- Supports Node.js, Python (FastAPI/Flask/Django), Go, Rust, Java, and Dockerfile.
- Zero-Docker synthesis automatically creates production multi-stage Alpine containers.
- **Port Binding Requirement**: Web servers MUST bind to \`0.0.0.0\` (loopback \`127.0.0.1\` is strictly blocked).
- **Background Queue Workers**:
  - For Celery, BullMQ, Kafka consumers: set \`internalPort: 0\` and \`isWorker: true\`. Whizan monitors process liveness instead of probing HTTP.

---

## Phase 4: Direct Upload & Packaging
- Call \`whizan_deploy_direct({ targetType, targetId, workspaceDir })\`.
- Uploads the workspace archive to Supabase S3 storage and enqueues build worker.
- Capture the returned \`deploymentId\`.

---

## Phase 5: Build Log Streaming
- Call \`whizan_get_build_logs({ deploymentId })\` every 5-10 seconds.
- Wait until \`status\` reaches \`READY\` / \`ACTIVE\` or \`FAILED\`.
- Automatic devDependencies preservation ensures build tools (\`tsc\`, \`vite\`) succeed even if \`NODE_ENV=production\`.

---

## Phase 6: Live Health Check
- Call \`whizan_check_health({ url: "https://<slug>.whizan.cloud/health" })\`.
- For background queue workers: pass \`targetId\` to check process liveness.
- Only declare success after health check returns HTTP 200 OK.
`,
  },
  {
    uri: "whizan://docs/cron-workflows",
    name: "Cron Jobs & Workflows Technical Guide",
    description: "Technical instructions for creating, triggering, and debugging scheduled cron jobs and multi-step workflows.",
    mimeType: "text/markdown",
    content: `# Whizan Cloud Cron Jobs & Multi-Step Workflows

Whizan Cloud features an enterprise background scheduling and workflow orchestration engine with sub-second precision and zero idle compute overhead.

## 1. Cron Job Pipelines (\`whizan_create_cron_job\`)

### Supported Target Pipelines:
1. **\`FUNCTION\` (Serverless Edge Isolate)**:
   - Invokes an isolated V8 function endpoint without container cold starts.
   - Target Config: \`{ serviceId: "<func-uuid>", endpointPath: "/cleanup", method: "POST" }\`
2. **\`CONTAINER_EXEC\` (Direct CLI Command)**:
   - Executes a command inside an active service container.
   - Target Config: \`{ serviceId: "<svc-uuid>", command: "python manage.py purge_tokens" }\`
3. **\`WEBHOOK\` (Public HTTPS Ingress)**:
   - Dispatches authenticated HTTPS requests to \`https://<slug>.whizan.cloud/<path>\`.
   - Automatically wakes sleeping containers before dispatching.
   - Target Config: \`{ url: "https://api-service.whizan.cloud/cron/sync", method: "POST" }\`
4. **\`SERVICE\` (Private Mesh Network)**:
   - Dispatches requests across the internal Docker mesh: \`http://service-<id>:<port>/...\`.

### Schedule Syntax (Standard 5-Field Cron)
- \`*/5 * * * *\`: Every 5 minutes
- \`0 * * * *\`: Every hour on the hour
- \`0 0 * * *\`: Daily at midnight UTC
- \`0 9 * * 1-5\`: Weekdays at 9:00 AM UTC

### Recovery & Concurrency Policies
- **Misfire Policy**:
  - \`SKIP\`: Discard triggers missed while compute node was powered off.
  - \`FIRE_LATEST_ONCE\`: Fire exactly 1 catch-up tick upon VM reboot.
  - \`CATCH_UP_ALL\`: Execute all missed ticks sequentially.
- **Concurrency Policy**:
  - \`FORBID\`: Skip new trigger if previous execution is still running.
  - \`ALLOW\`: Run concurrently.
  - \`REPLACE\`: Abort old execution and launch new run.

### Manual Trigger & History
- Trigger immediately: \`whizan_trigger_cron_job({ id: "<cron-id>" })\`
- Inspect execution history: \`whizan_get_cron_history({ id: "<cron-id>", limit: 10 })\`

## 2. DAG Multi-Step Workflows (\`whizan_create_workflow\`)

Create declarative CI/CD pipelines and operational flows using Directed Acyclic Graphs (DAGs):
- **Triggers**: \`TRIGGER_GIT\`, \`TRIGGER_CRON\`, \`TRIGGER_WEBHOOK\`, \`TRIGGER_MANUAL\`.
- **Actions**: \`ACTION_BUILD_CONTAINER\`, \`ACTION_DEPLOY_EDGE\`, \`ACTION_CONTAINER_EXEC\`, \`ACTION_HEALTH_PROBE\`, \`ACTION_ROUTER_CUTOVER\`, \`ACTION_AUTO_ROLLBACK\`.
- **Controls**: \`CONTROL_CONDITION\`, \`CONTROL_PARALLEL\`, \`CONTROL_APPROVAL\` (human-in-the-loop gate).
- Trigger workflow: \`whizan_trigger_workflow({ id: "<wf-id>" })\`.
- Approve gate: \`whizan_approve_workflow_step({ approvalToken: "<token>", approved: true })\`.
`,
  },
  {
    uri: "whizan://docs/edge-functions",
    name: "Serverless Edge Functions (V8 Runtime) Reference",
    description: "Protocol for deploying and securing serverless edge functions on Whizan Cloud with sub-5ms cold starts.",
    mimeType: "text/markdown",
    content: `# Serverless Edge Functions (V8 Runtime)

Whizan Edge Functions execute lightweight event-driven APIs, webhooks, and micro-endpoints on an isolated V8 JavaScript runtime with sub-5ms cold starts and zero container footprint.

## 1. Mandatory Security Categorization Protocol

Agents MUST evaluate and categorize each function service and individual endpoint:

1. **Public Webhooks (\`isPublic: true\`)**:
   - Strictly reserved for 3rd-party webhooks (Stripe, GitHub, Shopify, Slack) or open health/status probes that cannot transmit custom authentication headers.
2. **Specific / Protected (\`isPublic: false\` — DEFAULT & MANDATORY)**:
   - For user data, authentication, database CRUD, AI/LLM pipelines, payments, and internal business logic.
   - Protected with dedicated Function API Keys (\`whz_fn_live_...\`).
   - Call \`whizan_create_function_api_key\` to generate keys.

## 2. Granular Endpoint Security
A single function service can host both public webhooks and protected APIs:
\`\`\`json
{
  "name": "Payments Service",
  "slug": "payments-api",
  "isPublic": false,
  "endpoints": [
    { "name": "Stripe Webhook", "routePath": "/webhook/stripe", "isPublic": true, "httpMethods": ["POST"] },
    { "name": "Process Charge", "routePath": "/charge", "isPublic": false, "httpMethods": ["POST"] }
  ]
}
\`\`\`
Use \`whizan_configure_function_endpoint\` to toggle security on existing endpoints.

## 3. Function Authoring Template (ESM)
\`\`\`ts
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return new Response(JSON.stringify({ status: "healthy" }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (req.method === "POST" && url.pathname === "/process") {
    const body = await req.json();
    return new Response(JSON.stringify({ result: "processed", echo: body }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response("Not Found", { status: 404 });
}
\`\`\`

## 4. Invoking Functions Over HTTP
- Protected endpoints require \`Authorization: Bearer whz_fn_live_...\` or \`x-api-key: whz_fn_live_...\`.
- Test invocations directly using \`whizan_invoke_function\`:
  \`\`\`json
  {
    "slug": "payments-api",
    "path": "/charge",
    "method": "POST",
    "body": { "amount": 2500, "currency": "usd" },
    "apiKey": "whz_fn_live_abc123..."
  }
  \`\`\`

## 5. 3-Tier Self-Healing Disaster Recovery
If the compute worker restarts or disk state is wiped, Edge Functions recover automatically without manual intervention:
- **Tier 1 (Disk)**: \`/opt/whizan/apps/function-runtime/functions-storage/<id>/v<ver>/bundle.mjs\`
- **Tier 2 (Redis)**: In-memory source cache \`fn:source:<id>:v<ver>\`
- **Tier 3 (PostgreSQL)**: Persistent source code in Control Plane database.
If Tier 1 and 2 are cold, the runtime queries Tier 3, recompiles the ESM bundle on-the-fly, and serves the first incoming request with 200 OK.
`,
  },
  {
    uri: "whizan://docs/database-management",
    name: "Managed Database Provisioning & Connection Pooling",
    description: "Guide to provisioning managed PostgreSQL with PgBouncer, Redis, and MySQL on Whizan Cloud.",
    mimeType: "text/markdown",
    content: `# Whizan Managed Databases — Architecture & Operations

Whizan Cloud provides managed database instances with built-in connection pooling, automated backups, and inactivity wakeups.

## 1. Supported Engines & Features
- **PostgreSQL**: Version 16 with integrated **PgBouncer** connection pooler (port 6432 for pooled connections, port 5432 for direct DDL/migrations).
- **Redis**: In-memory key-value cache and pub/sub broker.
- **MySQL**: Relational database engine with InnoDB storage.

## 2. Provisioning Databases (\`whizan_provision_database\`)
- **Compute Policy**:
  - Hobby plan users are locked to **starter** tier (\`0.5 vCPU\`, \`512MB RAM\`).
  - Professional plan users can specify \`starter\`, \`standard\`, or \`pro\` tiers.
- Example:
  \`\`\`json
  {
    "name": "production-postgres",
    "type": "POSTGRESQL",
    "instanceType": "starter",
    "enablePooler": true
  }
  \`\`\`

## 3. Database URLs & Environment Injection
When a database is provisioned, Whizan generates:
- \`DATABASE_URL\`: Pooled connection string through PgBouncer (\`postgresql://user:pass@host:6432/dbname?sslmode=require\`). Use this for application queries.
- \`DIRECT_URL\`: Direct socket connection string (\`postgresql://user:pass@host:5432/dbname?sslmode=require\`). Use this for Prisma/Drizzle schema migrations.
- Inject these into your backend service using \`whizan_set_env_vars\`.

## 4. Inactivity Watchdog & Auto-Wake
- On the free/starter tier, idle databases without active client connections automatically suspend to conserve resources.
- Connecting to the database URL automatically triggers container resurrection within 2-3 seconds.
`,
  },
  {
    uri: "whizan://docs/diagnostics",
    name: "Live Diagnostics, Runtime Logs & Container Inspection",
    description: "Instructions for running diagnostic commands, inspecting live containers, and troubleshooting runtime crashes.",
    mimeType: "text/markdown",
    content: `# Whizan Cloud Diagnostics & Troubleshooting

Whizan Cloud provides a comprehensive suite of in-IDE diagnostic tools for inspecting and troubleshooting live services.

## 1. Application Runtime Logs vs Build Logs

- **Build Logs (\`whizan_get_build_logs\`)**:
  - Captures source download, npm/pip dependency installation, and container build steps.
  - Used during Phase 5 of deployment to monitor compilation.
- **Application Runtime Logs (\`whizan_get_application_logs\`)**:
  - Streams live stdout/stderr directly from the active or recently crashed container.
  - **WHEN TO USE**: If a service reaches \`READY\` status but returns HTTP 500, 502, or 503 when visited, call \`whizan_get_application_logs\` with \`targetType\` and \`targetId\` to see the uncaught exception or fatal error.

## 2. Container Command Execution (\`whizan_exec_container_command\`)
Execute safe diagnostic commands inside running containers:
\`\`\`json
{
  "targetType": "service",
  "targetId": "backend-api",
  "command": "npx prisma migrate status"
}
\`\`\`
- **Recommended Diagnostic Commands**:
  - \`df -h\`: Check disk usage inside container.
  - \`ps aux\`: Check running processes and memory.
  - \`node -v\` or \`python --version\`: Check runtime version.
  - \`curl -I http://127.0.0.1:3000/health\`: Probe local loopback HTTP status.
- **Security Guardrails**: Destructive commands (\`rm\`, \`dd\`, \`mkfs\`, \`poweroff\`, \`chmod 777\`), package installations, and reverse shells are blocked. Passwords and JWT tokens are automatically masked.

## 3. Container Inspection (\`whizan_inspect_deployment\`)
Inspects live runtime state:
- Docker container ID and health status.
- Host port mappings and internal bridge network IP.
- Memory limit and restart count.
- Registered edge routing rules.

## 4. Traffic & Performance Analytics (\`whizan_get_analytics\`)
- **Web Projects**: Page views, unique visitors, bandwidth transferred, daily trends.
- **Backend Services**: Real-time CPU and memory utilization snapshots, load averages.
`,
  },
];
