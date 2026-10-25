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

2. **Edge Router & Universal Always-On Gateway**:
   - Global Edge Router handles routing for \`https://<slug>.whizan.cloud\` with sub-5ms latency and wildcard Cloudflare SSL.
   - **Universal Live Gateway (\`/live/<slug>\`)**: Transparently auto-wakes sleeping containers from zero without dropping incoming HTTP requests.
   - Preserves canonical host headers (\`x-forwarded-host\`, \`x-forwarded-proto\`) ensuring CSRF validation and origin matching (Next.js Server Actions, Django, Rails) succeed automatically.

3. **Compute Worker & Build System**:
   - Zero-Docker stack-independent container synthesis for Node.js, Python (FastAPI/Django), Go, Rust, Java, and Dockerfiles.
   - **Blue/Green Zero-Downtime Deployments**: Legacy containers continue serving live traffic during builds; traffic only cuts over after passing deep HTTP readiness checks.
   - Automatic devDependencies preservation during build phase ensuring build tools (\`tsc\`, \`vite\`, \`esbuild\`) compile cleanly even when \`NODE_ENV=production\` is defined.

4. **Cloud Object Storage (R2 / S3)**:
   - High-throughput S3-compatible cloud object storage.
   - Scoped access keys (\`whz_stg_live_...\`) with granular permissions (\`READ_WRITE\`, \`READ_ONLY\`) and bucket-level isolation.

5. **Serverless Edge Functions (V8 Runtime)**:
   - Event-driven micro-endpoints executing on an isolated V8 runtime with sub-5ms cold starts.
   - 3-tier self-healing disaster recovery: disk bundle -> Redis in-memory cache -> PostgreSQL control plane source.
`,
  },
  {
    uri: "whizan://docs/storage-sdk",
    name: "Whizan Cloud Object Storage SDK & API Reference",
    description: "Complete guide to provisioning buckets, generating scoped access keys, and using the @whizan/storage-client SDK.",
    mimeType: "text/markdown",
    content: `# Whizan Cloud Object Storage — SDK & API Reference

Whizan Cloud Object Storage provides fast, durable, S3-compatible cloud storage powered by Cloudflare R2.

## 1. Quick Workflow for Agents

1. **Provision Bucket**: Call \`whizan_storage_create_bucket\` with \`name\` and \`isPublic\` (\`true\` for public assets/avatars, \`false\` for private documents/PDFs).
2. **Generate Access Key**: Call \`whizan_storage_create_api_key\` with \`name\`, \`permission: "READ_WRITE"\`, and optional \`bucketId\` (accepts UUID or bucket name).
3. **Inject Environment Variables**: Call \`whizan_set_env_vars\` with:
   - \`WHIZAN_STORAGE_KEY: "whz_stg_live_..."\`
   - \`WHIZAN_API_URL: "https://api.whizan.cloud"\`
   - For frontends: \`NEXT_PUBLIC_WHIZAN_STORAGE_KEY\` or \`VITE_WHIZAN_STORAGE_KEY\`
4. **Revoke Keys When Needed**: Call \`whizan_storage_delete_api_key\` with \`keyId\`.

## 2. Using \`@whizan/storage-client\` in Applications

Install the client:
\`\`\`bash
npm install @whizan/storage-client
\`\`\`

### Initialization
\`\`\`ts
import { createClient } from "@whizan/storage-client";

const storage = createClient(
  process.env.WHIZAN_API_URL || "https://api.whizan.cloud",
  process.env.WHIZAN_STORAGE_KEY!
);
\`\`\`

### Uploading Files (Buffer or Stream)
\`\`\`ts
// Node.js Server Upload
const fileBuffer = fs.readFileSync("./report.pdf");
const { data, error } = await storage
  .from("my-bucket")
  .upload("reports/2026/q3.pdf", fileBuffer, {
    contentType: "application/pdf",
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
  .from("my-bucket")
  .download("reports/2026/q3.pdf");

// 'data' is a standard Blob / Buffer
const buffer = Buffer.from(await data.arrayBuffer());
\`\`\`

### Public CDN URLs
\`\`\`ts
const { publicUrl } = storage
  .from("public-assets")
  .getPublicUrl("avatars/user-123.jpg");

console.log("CDN URL:", publicUrl);
// Returns: https://api.whizan.cloud/storage/v1/public/public-assets/avatars/user-123.jpg
\`\`\`

### Listing Objects
\`\`\`ts
const { data: files, error } = await storage
  .from("my-bucket")
  .list("reports/", { limit: 50 });
\`\`\`

### Deleting Objects
\`\`\`ts
const { error } = await storage
  .from("my-bucket")
  .delete("reports/2026/q3.pdf");
\`\`\`

## 3. Scoping & Security Rules

- **Permission**:
  - \`READ_WRITE\`: Permits object upload, modification, and deletion.
  - \`READ_ONLY\`: Strictly forbids uploads/deletions; attempts return \`403 FORBIDDEN (KEY_PERMISSION_READ_ONLY)\`.
- **Bucket Scoping**:
  - If scoped to a bucket ID or bucket name, attempts to access other buckets return \`403 FORBIDDEN (KEY_BUCKET_SCOPE_MISMATCH)\`.
  - For applications needing access to multiple buckets, generate an unscoped key (\`bucketId: undefined\`).

## 4. Diagnosis of Common Storage Errors

- **401 Unauthorized**: Missing \`Authorization: Bearer whz_stg_live_...\` header or \`WHIZAN_STORAGE_KEY\` is empty in runtime environment.
- **403 Forbidden**: Key is \`READ_ONLY\` or scoped to a different bucket. Inspect response \`code\` and \`details\`.
- **502 / 503 Bad Gateway**: Unhandled application crash in the container when processing file buffers. Inspect container runtime logs using \`whizan_get_application_logs\`.
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

## Phase 1: Audit, AI Analysis & Guardrails
- Always start with \`whizan_analyze_workspace\`.
- Powered by Gemini 3.5 Flash Lite, the analyzer inspects entry points, package manifests, and ports.
- **Cross-Chat Context Rule**: If an \`existingDeployment\` is found in \`.whizan.json\` or server records, reuse the existing ID (\`targetId\`). Never create duplicate resources.
- **Guardrails**: Desktop GUIs (PyQt, Tkinter, Electron desktop), native mobile apps (iOS/Android without web export), and short-lived one-shot CLI scripts are refused.

## Phase 2: Environment Variables
- Prompt the user for required variables identified by the analyzer (e.g. database URLs, API secrets).
- Set them with \`whizan_set_env_vars\` before starting deployment.

## Phase 3: Provision or Redeploy
- **Web Applications (\`whizan_create_project\`)**:
  - Pure HTML/CSS/JS: \`framework: "CUSTOM"\`, \`outputDir: "."\`, \`buildCommand: ""\`.
  - Vite / React SPA: \`framework: "VITE"\`, \`outputDir: "dist"\`.
  - Next.js SSR / App Router: \`framework: "NEXTJS"\`, \`outputDir: ".next"\`. (Never set \`output: 'export'\` if dynamic routes or Server Actions exist).
- **Backend Microservices (\`whizan_create_service\`)**:
  - Supports Node.js, Python (FastAPI/Django), Go, Rust, Java, and custom Dockerfiles.
  - Background Queue Workers (Celery, BullMQ): set \`internalPort: 0\` and \`isWorker: true\`.
  - Must bind to \`0.0.0.0\` (loopback \`127.0.0.1\` is strictly blocked).

## Phase 4 & 5: Upload, Log Streaming & Cleanup
- \`whizan_deploy_direct\` uploads source archive to persistent storage (Supabase S3) and enqueues build.
- Poll \`whizan_get_build_logs\` every 5-10s until status reaches \`READY\` / \`ACTIVE\` or \`FAILED\`.

## Phase 6: Deep Health Probe
- Call \`whizan_check_health\` with \`https://<slug>.whizan.cloud\`.
- Success is confirmed once HTTP 200/204 is returned.
`,
  },
  {
    uri: "whizan://docs/cron-workflows",
    name: "Cron Jobs & Workflows Technical Guide",
    description: "Technical instructions for creating, triggering, and debugging scheduled cron jobs and multi-step workflows.",
    mimeType: "text/markdown",
    content: `# Whizan Cloud Cron Jobs & Multi-Step Workflows

## 1. Cron Job Types

Whizan Cloud Cron Jobs support two primary routing architectures:

1. **\`WEBHOOK\` (Recommended for Web Services & APIs)**:
   - Dispatches scheduled requests to public HTTPS endpoints (\`https://<slug>.whizan.cloud/<path>\`).
   - Automatically wakes sleeping containers (\`autoSleep: true\`) without connection timeouts.
   - Protected with standard bearer headers (\`x-whizan-trigger: CRON\`, \`x-whizan-cron-id: ...\`).

2. **\`INTERNAL_MESH\`**:
   - Dispatches requests across the private Docker network mesh (\`http://service-<id>:<port>/...\`).
   - Intended for internal background worker containers with non-public HTTP endpoints.

## 2. Schedule Expressions

Use standard 5-field cron syntax:
- \`*/5 * * * *\`: Every 5 minutes
- \`0 * * * *\`: Every hour at minute 0
- \`0 0 * * *\`: Daily at midnight UTC
- \`0 9 * * 1-5\`: Weekdays at 9:00 AM UTC

## 3. Retries, Dead-Letter Queues & Overlap Prevention

- **Overlap Policy**:
  - \`SKIP\`: If the previous run is still in progress, subsequent triggers are skipped (\`SKIPPED_OVERLAP\`).
  - \`CONCURRENT\`: Executes in parallel.
- **Dead-Letter Handling**:
  - Consecutive failures exceed threshold -> Execution logged to Dead-Letter Queue and job is gracefully paused to prevent log flood.
  - Inspect history using \`whizan_get_cron_history\`.
`,
  },
  {
    uri: "whizan://docs/edge-functions",
    name: "Serverless Edge Functions (V8 Runtime) Reference",
    description: "Protocol for deploying and securing serverless edge functions on Whizan Cloud with sub-5ms cold starts.",
    mimeType: "text/markdown",
    content: `# Serverless Edge Functions (V8 Runtime)

Whizan Edge Functions execute lightweight event-driven APIs, webhooks, and micro-endpoints on an isolated V8 JavaScript runtime with sub-5ms cold starts.

## 1. Mandatory Security Categorization

1. **Public Webhook (\`isPublic: true\`)**:
   - Strictly reserved for 3rd-party webhooks (Stripe, GitHub, Shopify) or open health probes that cannot transmit custom headers.
2. **Specific / Protected (\`isPublic: false\` — DEFAULT & MANDATORY)**:
   - For user data, authentication, database CRUD, and AI pipelines.
   - Protected with dedicated Function API Keys (\`whz_fn_live_...\`).
   - Generate keys using \`whizan_create_function_api_key\`.

## 2. Invocation Format

Protected endpoints require the \`x-whizan-function-key\` or \`Authorization: Bearer whz_fn_live_...\` header:
\`\`\`bash
curl -X POST https://<slug>.whizan.cloud/api/process \
  -H "Authorization: Bearer whz_fn_live_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"action":"sync"}'
\`\`\`

## 3. Disaster Recovery & Zero-State Self-Healing

The edge runtime features an automatic 3-tier recovery model:
- **Tier 1 (Disk)**: \`/opt/whizan/apps/function-runtime/functions-storage/<id>/v<ver>/bundle.mjs\`
- **Tier 2 (Redis)**: In-memory source cache \`fn:source:<id>:v<ver>\`
- **Tier 3 (PostgreSQL)**: Persistent source in Control Plane database.
If a worker reboots and disk/cache are cold, the runtime transparently recompiles on first request and returns 200 OK.
`,
  },
];
