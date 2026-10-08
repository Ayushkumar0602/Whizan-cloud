# AGENTS.md — Global Autonomous Agent Instructions for Whizan Cloud Service

This repository houses **Whizan Cloud Service** (control plane, dashboard, build-worker, edge-router, and MCP devops tooling).
When deploying services or frontend applications to Whizan using the `@whizan/mcp-devops` tools, you MUST follow this strict protocol.

---

## 🛑 The Mandatory 6-Phase Deployment Protocol

```
Phase 1: AUDIT & CONTEXT SYNC  Phase 2: ENVIRONMENT      Phase 3: PROVISION OR REDEPLOY
whizan_analyze_workspace     ──► whizan_set_env_vars ──► Reuse existing targetId OR
                                                         whizan_create_project/service
                                                                    │
                                                                    ▼
Phase 6: HEALTH CHECK          Phase 5: POLL LOGS        Phase 4: UPLOAD
whizan_check_health         ◄── whizan_get_build_logs  ◄── whizan_deploy_direct
(Must be 200 OK)                (Wait until READY/ACTIVE)  (Zero-redundancy cleanup)
```

---

### Strict Agent Directives:

1. **Phase 1: Audit, AI Analysis & System Guardrails (Gemini 3.5 Flash Lite)**:
   - You MUST start with `whizan_analyze_workspace` to inspect the project type, language, entry point file, internal port, environment variables, local `.whizan.json`, and Whizan Cloud server records.
   - **AI Repository Analyzer**: Powered by `gemini-3.5-flash-lite`, the analyzer inspects the README, package manifests, and entry files to automatically select the optimal stack, framework, build command, start command, and internal port.
   - **AI System Guardrail Enforcement (Refusal Rule)**:
     - Whizan Cloud exclusively hosts web services, backend APIs, background queue workers, and frontend web applications.
     - **Non-Deployable Projects ARE STRICTLY REFUSED**: Desktop GUI applications (PyQt, PySide, Tkinter, wxPython, Electron desktop client), native mobile applications (iOS Xcode/Swift, Android native Kotlin/Java, Flutter/React Native mobile without web export), raw libraries/SDKs without a runnable server/worker, and one-shot CLI scripts that exit immediately.
     - If `guardrailPassed: false`, **DO NOT ATTEMPT TO DEPLOY**. You must immediately notify the user with the exact `refusalReason` and explain what Whizan Cloud supports.
   - **Cross-Chat Context Rule**: When a user asks to deploy or redeploy in a fresh chat session with no previous context:
     - `whizan_analyze_workspace` inspects `.whizan.json` in the workspace root AND searches server records for a matching project or service.
     - If an `existingDeployment` is detected: **DO NOT CREATE A NEW PROJECT OR SERVICE**. Ask the user for confirmation to redeploy to the existing deployment ID (`targetId`), then proceed directly to `whizan_deploy_direct` or `whizan_redeploy`.
     - Never alter slugs or create duplicate resources for an existing codebase.

2. **Phase 2: Environment Variables (Mandatory Prompting)**:
   - The AI analyzer automatically extracts required and optional environment variables from the README, code, and `.env.example`.
   - If required variables are detected (`requiredEnvVarsToPrompt`), **you MUST ask the user to provide them** and set them using `whizan_set_env_vars` BEFORE starting deployment. Never deploy without required database URLs, API secrets, or encryption keys.

3. **Compute Allocation & Subscription Tiers (Strict Policy)**:
   - **Agents MUST NOT decide compute and RAM allocations arbitrarily**.
   - User subscriptions have two tiers: **Hobby** and **Professional**.
   - **Hobby Tier**:
     - Frontend projects run on standard Edge routing / CDN.
     - Backend microservices are **strictly locked to free tier**: `0.1 vCPU`, `512MB RAM`, and `autoSleep=true`.
     - Databases are **strictly locked to starter tier**: `0.5 vCPU`, `512MB RAM`.
     - Agents are strictly prohibited from selecting custom or higher instance types on the Hobby plan.
   - **Professional Tier**:
     - Users can choose upgraded instances (`starter`, `standard`, `pro`, `pro_plus`) directly from the dashboard hosting pages.

4. **Web Projects vs Backend Services & Routing**:
   - **Frontend & Web Apps (`whizan_create_project`)**:
     - Use `whizan_create_project` for ALL frontend web applications, fullstack web frameworks, and web UIs (Vite, React, Next.js, Astro, or any web app that provides a Dockerfile).
     - **Static Web Apps (Vite, React, Astro static)**: Set `framework: "VITE"` (or `"REACT"`, `"ASTRO"`), `outputDir: "dist"`. Served at ultra-low latency directly by Edge Router.
     - **Next.js SSR & Dynamic Routes (App Router, dynamic `[id]` pages, Server Actions)**:
       * Set `framework: "NEXTJS"`, `outputDir: ".next"`.
       * **CRITICAL RULE**: NEVER configure `output: 'export'` in `next.config.js/ts` if the app has dynamic routes (e.g. `/scans/[id]`), Server Actions, or API routes. Dynamic routes cannot be statically pre-rendered without `generateStaticParams()`. Whizan Cloud natively hosts Next.js server runtimes (`output: 'standalone'` or standard `next start`) with dynamic routing and edge asset routing.
     - **Containerized Web Projects (Dockerfile in frontend)**:
       * If a web frontend or fullstack repository provides its own `Dockerfile` (e.g. multi-stage Alpine build), call `whizan_create_project` (set `framework: "CUSTOM"` or `"NEXTJS"`). Whizan's build worker will automatically build the Dockerfile and launch the container on Port 3000 (or the exposed port) as a Web Project under `/dashboard/projects`.
   - **Backend Services & Workers (Stack Independent)**:
     - Whizan Cloud supports **ANY** backend language: Node.js, Python (Django, FastAPI, Flask), Go, Rust, Java (Spring Boot), PHP (Laravel), Ruby on Rails, and raw Dockerfiles.
     - For compiled/polyglot languages (Rust, Java, PHP, Ruby), Whizan automatically synthesizes high-performance multi-stage Dockerfiles or builds user Dockerfiles.
     - Call `whizan_create_service` with detected `language` (`NODEJS`, `PYTHON`, `GO`, `DOCKERFILE`) and `startCommand`.
     - **Background Queue Workers**: If the service is a background worker or queue consumer without an HTTP port (e.g. Celery, BullMQ, Kafka consumer), set `internalPort: 0` and `isWorker: true`. The system checks process liveness instead of probing HTTP.

5. **Loopback Binding Trap**: For backends, the application must bind to `0.0.0.0`, NOT `127.0.0.1` or `localhost`. If `127.0.0.1` is detected, patch it to `0.0.0.0` before deployment.

6. **Phase 4 & 5: Upload, Zero-Redundancy Cleanup & Log Polling**:
   - `whizan_deploy_direct` uploads the source archive and enqueues the build job on Whizan Cloud build worker.
   - **Zero Redundancy**: Upon new deployment cutover, previous Docker containers, obsolete build packages, node_modules, Redis chunks, and old deployment database records are automatically purged.
   - You MUST extract the `deploymentId` and call `whizan_get_build_logs` every 5-10 seconds until `status` is `READY` / `ACTIVE` or `FAILED`. Never declare completion early.

7. **Phase 6: Live Health Check**:
   - Once build finishes with `READY` or `ACTIVE`, call `whizan_check_health`.
   - **Protocol rule**: Always use `http://<slug>.20.2.136.11.nip.io` (never `https://`, because the Whizan Edge Router operates on Port 80 HTTP).
   - Only declare success after `whizan_check_health` returns `ok: true` (HTTP 200/204). Background workers are verified by continuous process running status.

8. **Phase 7: Live Diagnostics, Container Exec, Inspection & Analytics (Post-Deployment Tooling)**:
   - **Container Command Execution (`whizan_exec_container_command`)**:
     - Agents may execute informational, diagnostic, and troubleshooting commands inside running containers (e.g. `npx prisma migrate status`, `df -h`, `ps aux`, `cat /app/package.json`, `python --version`, `curl -I http://127.0.0.1:3000/health`).
     - **Strict Security Guardrails Enforced**: Destructive operations (`rm`, `dd`, `mkfs`, `poweroff`, `chmod 777`, `kill 1`), system package managers (`apt`, `apk`), cryptocurrency miners, and reverse shells are blocked. Sensitive credentials, passwords, and JWTs in output are automatically masked.
   - **Deployment & Container Inspection (`whizan_inspect_deployment`)**:
     - Inspects live runtime state: container ID, running status, memory limits, host port mapping, restart counts, image tag, and internal network mesh connectivity.
   - **Traffic & Performance Analytics (`whizan_get_analytics`)**:
     - For projects: Returns page views, unique visitors, bandwidth transferred, and daily trends.
     - For services: Returns real-time CPU/memory utilization, load status, and recent performance history.

9. **Serverless Edge Functions (`whizan_create_function_service`, `whizan_deploy_function`, `whizan_configure_function_endpoint`, `whizan_invoke_function`)**:
   - **When to Use**: For event-driven APIs, webhooks, micro-endpoints, database mutations, and background functions where running a 24/7 Docker container is inefficient. Edge functions execute on an isolated V8 runtime with sub-5ms cold starts and 0 host Docker ports.
   - **MANDATORY Security Categorization Protocol**:
     - Agents **MUST ALWAYS** evaluate and categorize each function service and individual endpoint:
       1. **Public Webhook (`isPublic: true`)**: Only for third-party webhooks (Stripe, GitHub, Shopify) or open health/status checks that cannot send custom headers.
       2. **Specific / Protected (`isPublic: false` - DEFAULT & MANDATORY FOR SENSITIVE CODE)**: For user data, authentication, database CRUD, AI/LLM pipelines, payments, and internal logic.
     - For protected functions, agents **MUST** generate a dedicated Function API Key using `whizan_create_function_api_key` (`whz_fn_live_...`) and test invocations using `apiKey: "whz_fn_live_..."`.
     - **Granular Endpoint Security**: A single function service can host both public webhooks and protected endpoints. Use `whizan_configure_function_endpoint` or the dashboard to toggle `isPublic: true` on webhooks while keeping sensitive routes `isPublic: false`.
   - **Zero-State Disaster Recovery & VM Reboot Self-Healing**:
     - Whizan Edge Functions use a 3-tier self-healing architecture:
       * *Tier 1 (Disk)*: Compiled bundle in `/opt/whizan/apps/function-runtime/functions-storage/<id>/v<ver>/bundle.mjs`.
       * *Tier 2 (Redis)*: In-memory source cache `fn:source:<id>:v<ver>`.
       * *Tier 3 (PostgreSQL)*: Persistent source code in Render Control Plane database (`FunctionDeployment.source_code`).
     - **Edge Case: Node Maintenance & Reboot**: If the compute worker restarts or is powered off and turned back on, the runtime and router self-heal immediately. If bundles and Redis cache are empty, the runtime automatically queries the Render Control Plane (`GET /api/functions/:id/code`), recompiles the ESM bundle on-the-fly, caches it in Redis, and executes the first request with 200 OK seamlessly.
   - **Invocation Format**: Always invoke via `http://<slug>.fn.20.2.136.11.nip.io/<path>`. Verify responses using `whizan_invoke_function`.

10. **Enterprise Cron & Scheduled Compute (`whizan_create_cron_job`, `whizan_list_cron_jobs`, `whizan_trigger_cron_job`, `whizan_get_cron_history`)**:
   - **Zero-Idle Super Resource Optimization Architecture**:
     * Built around an event-driven dynamic OS sleep loop (`< 0.01%` idle CPU), eliminating traditional 86,400 daily polling intervals.
     * Uses Redis Sorted Sets (`cron:schedule:zset`) with Unix millisecond scores for $O(\log N)$ macro-scheduling.
     * Awakens in `< 1ms` via Redis Pub/Sub (`cron:reschedule`) on creation or modification.
     * Capped 64KB Circular Byte Ring Buffer prevents memory explosion / OOM crashes from verbose CLI outputs.
     * Batch Telemetry Buffer flushes execution runs to PostgreSQL every 5 seconds, cutting database roundtrips by 98%.
   - **Supported Target Pipelines**:
     * `FUNCTION`: Directly invokes internal Edge Function isolates (`:9090`) in `< 3ms`.
     * `CONTAINER_EXEC`: Interacts directly with Docker Engine socket (`/var/run/docker.sock`) to execute CLI commands inside containers (e.g. `python manage.py purge_sessions`) without requiring fake HTTP servers.
     * `SERVICE`: Dispatches internal requests across private Docker network mesh (`http://service-<id>:port`).
     * `WEBHOOK`: Sends signed HMAC-SHA256 HTTPS requests to external endpoints.
   - **Disaster Recovery & Reboot Self-Healing**:
     * If the compute node is powered off and turned back on, the scheduler automatically recovers overdue jobs and applies the configured `misfirePolicy`:
       - `SKIP`: Discards missed runs to avoid thundering herd crashes on boot (recommended for high-frequency crons).
       - `FIRE_LATEST_ONCE`: Fires 1 catchup execution immediately on boot (recommended for daily backups/rollups).
       - `CATCH_UP_ALL`: Sequentially replays missed intervals with rate-limited intervals (for financial audits).
     * If Redis in-memory state is wiped, the scheduler rehydrates from the Control Plane (`GET /api/crons/sync`) in a single atomic pass.



