# Whizan Cloud Service — Official Services Catalog & Platform Specification ☁️

<p align="center">
  <strong>Complete reference catalog of cloud hosting primitives, serverless execution fabrics, managed databases, scheduled compute, visual automation, and AI-native DevOps tooling offered by Whizan Cloud Service.</strong>
</p>

---

## 📑 Table of Contents

1. [Platform Executive Overview](#1-platform-executive-overview)
2. [Service Catalog Quick Reference Matrix](#2-service-catalog-quick-reference-matrix)
3. [Compute & Hosting Services](#3-compute--hosting-services)
   - [3.1 Frontend Edge Hosting & Web Applications](#31-frontend-edge-hosting--web-applications)
   - [3.2 Polyglot Backend Microservices & APIs](#32-polyglot-backend-microservices--apis)
   - [3.3 Dedicated Background Queue Workers](#33-dedicated-background-queue-workers)
   - [3.4 Serverless Edge Functions (V8 Isolates)](#34-serverless-edge-functions-v8-isolates)
4. [Data & Storage Services](#4-data--storage-services)
   - [4.1 Managed PostgreSQL with PgBouncer Pooling](#41-managed-postgresql-with-pgbouncer-pooling)
   - [4.2 Managed In-Memory Redis Cache & Message Broker](#42-managed-in-memory-redis-cache--message-broker)
5. [Scheduled Compute & Workflow Automation](#5-scheduled-compute--workflow-automation)
   - [5.1 Enterprise Cron & Scheduled Compute Engine](#51-enterprise-cron--scheduled-compute-engine)
   - [5.2 Whizan Flow — Visual DAG Workflow Studio](#52-whizan-flow--visual-dag-workflow-studio)
6. [Developer Tooling & Autonomous AI DevOps](#6-developer-tooling--autonomous-ai-devops)
   - [6.1 AI-Native DevOps MCP Server (`@whizan/mcp-devops`)](#61-ai-native-devops-mcp-server-whizanmcp-devops)
   - [6.2 Whizan Unified CLI (`@whizan/cli`)](#62-whizan-unified-cli-whizancli)
   - [6.3 Developer Web Console & Observability Dashboard](#63-developer-web-console--observability-dashboard)
7. [Cross-Cutting Architectural Capabilities](#7-cross-cutting-architectural-capabilities)
   - [Scale-to-Zero & Sub-Second Cold Wakeups](#scale-to-zero--sub-second-cold-wakeups)
   - [Private Container Mesh & Service Discovery](#private-container-mesh--service-discovery)
   - [Zero-Downtime Blue/Green Deployments](#zero-downtime-bluegreen-deployments)
   - [Encrypted Secret Management & Zero-Leakage Storage](#encrypted-secret-management--zero-leakage-storage)
   - [Real-Time Log Streaming via SSE & Redis Pub/Sub](#real-time-log-streaming-via-sse--redis-pubsub)
8. [Resource Tiers & Allocation Plans](#8-resource-tiers--allocation-plans)

---

## 1. Platform Executive Overview

**Whizan Cloud Service** is a developer-centric, AI-native Cloud Platform and Platform-as-a-Service (PaaS). It bridges the gap between high-velocity frontend hosting (like Vercel), flexible serverless data engines (like Supabase), and production-grade container orchestration. 

The platform offers six foundational service layers designed for modern engineering teams and autonomous AI coding assistants:
- **Zero-Config Web & API Hosting**: Automated Git builds and direct CLI/MCP uploads with instant HTTPS edge endpoints.
- **Intelligent Resource Optimization**: Automated scale-to-zero idle detection paired with instant cold wakeups.
- **Ultra-Low Latency Edge Compute**: Lightweight V8 sandboxed functions (~5–15ms typical internal isolate initialization) with zero host TCP port consumption.
- **Managed Relational & In-Memory Data**: Fully provisioned PostgreSQL (with PgBouncer) and low-latency Redis instances (< 1ms internal command execution on co-located nodes) with automated application credential binding.
- **Micro-Precision Scheduled Tasks**: Zero-idle cron scheduling with 1,000ms tick resolution supporting CLI execution, edge functions, private service mesh requests, and webhooks.
- **Model Context Protocol (MCP) Integration**: Native AI-agent orchestration protocol allowing Cursor, Antigravity IDE, Claude Code, and Windsurf to provision, deploy, monitor, and diagnose resources autonomously.

---

## 2. Service Catalog Quick Reference Matrix

| Service ID | Service Name | Category | Primary Runtimes & Stacks | Key Architectural Highlights |
| :--- | :--- | :--- | :--- | :--- |
| `frontend-hosting` | **Frontend Edge Hosting** | Compute | Next.js (SSR/Standalone), Vite, React SPA, Astro, SvelteKit, HTML/CSS | Static edge delivery, dynamic App Router support, automatic custom domain SSL, scale-to-zero. |
| `backend-hosting` | **Backend Container Services** | Compute | Node.js, Python (FastAPI/Django), Go, Rust, Java, PHP, Dockerfile | Private mesh DNS, HTTP health probing, automatic port allocation, 0.0.0.0 listener validation. |
| `queue-workers` | **Background Queue Workers** | Compute | Celery, BullMQ, Kafka consumers, event daemons | Headless worker mode (`internalPort: 0`), continuous process liveness monitoring, auto-restart. |
| `edge-functions` | **Serverless Edge Functions** | Compute | V8 Web Standards Runtime (TypeScript/ESM), Node.js, Python, Go | ~5–15ms internal isolate initialization, zero host port overhead, SHA-256 API key verification, 3-tier self-healing. |
| `managed-postgres` | **Managed PostgreSQL** | Storage | PostgreSQL 16 with PgBouncer connection pooler | High-concurrency connection pooling, SSL/TLS encryption, one-click service binding, web schema explorer. |
| `managed-redis` | **Managed In-Memory Redis** | Storage | Redis 7+ (In-Memory Key/Value, Streams, Pub/Sub) | Low-latency in-memory data store (< 1ms internal commands), BullMQ queue broker, distributed locking. |
| `cron-scheduler` | **Enterprise Scheduled Compute** | Automation | Redis Sorted Sets Macro-Scheduler with dynamic OS sleep loop | Zero idle CPU (< 0.01%), Docker socket execution, function triggers, 64KB circular ring buffer, misfire recovery. |
| `flow-automation` | **Whizan Flow (Workflow Studio)** | Automation | Kahn's DAG Execution Engine with split-view Canvas DSL | Visual drag-and-drop orchestration, parallel branch resolution, conditional edges, human approval gates. |
| `devops-mcp` | **DevOps Agent MCP** | DevOps / AI | Stdio & SSE Model Context Protocol server | 6-Phase Autonomous Deployment Protocol, live container exec diagnostics, AI repository analyzer. |
| `developer-cli` | **Whizan Unified CLI** | DevOps | Node.js cross-platform terminal binary (`@whizan/cli`) | Browser OAuth login, headless token auth, live terminal resource monitor (`whizan top`), log AI intelligence. |

---

## 3. Compute & Hosting Services

### 3.1 Frontend Edge Hosting & Web Applications
High-performance hosting for modern frontend frameworks, static websites, and server-rendered dynamic applications.

* **Supported Frameworks**:
  - **Next.js (App Router, Pages Router, Server Actions, Dynamic Routes)**: Deployed as high-performance standalone SSR runtimes (`.next/standalone`) with static asset edge separation. Dynamic routes (`/users/[id]`) are fully supported without requiring static pre-rendering.
  - **Static Single-Page Apps (SPAs)**: Vite (React, Vue, Svelte), Create React App, Astro, SvelteKit, and static exports (`dist/`, `out/`, `build/`).
  - **Containerized Web Apps**: Any web frontend providing a multi-stage `Dockerfile`.
* **Traffic & Delivery Features**:
  - **Edge Router Acceleration**: Static assets are served directly from disk via optimized byte-range streaming, bypassing container overhead.
  - **Dynamic Subdomains & Wildcards**: Every project receives a dedicated public hostname (`https://<slug>.whizan.cloud`) with automatic TLS/SSL termination.
  - **Custom Domain Binding**: Attach custom domains with on-demand SSL verification via Caddy/Edge Router hooks.
  - **Real-Time Traffic Analytics**: Built-in edge tracking measuring page views, unique visitors, response status codes, and bandwidth consumption.

---

### 3.2 Polyglot Backend Microservices & APIs
Isolated containerized runtimes for backend REST APIs, GraphQL services, gRPC endpoints, and full-stack services.

* **Supported Runtimes**:
  - **Node.js**: Express, Fastify, NestJS, Koa, Hono.
  - **Python**: FastAPI, Django (Gunicorn/Uvicorn), Flask.
  - **Go**: Native Go binaries compiled from `go.mod`.
  - **Compiled & Polyglot Stacks**: Rust (Actix/Axum), Java (Spring Boot), PHP (Laravel), Ruby on Rails via synthesized or user-supplied multi-stage `Dockerfile`.
* **Runtime Capabilities**:
  - **Private Service Mesh Networking**: All backend services attach to the internal network (`whizan-internal-network`). Frontend applications and peer microservices communicate privately via internal DNS aliases:
    ```http
    GET http://payment-service:8000/api/v1/health
    ```
  - **Loopback Listener Trap Prevention**: Automatic auditing checks entry point listeners. Services attempting to bind to `127.0.0.1` or `localhost` are flagged and guided to bind to `0.0.0.0`.
  - **Automated Health Probes**: Active HTTP/TCP health checks ensure only healthy containers receive live inbound requests.

---

### 3.3 Dedicated Background Queue Workers
Headless background processing units designed for continuous asynchronous workflows.

* **Common Use Cases**: Celery workers, BullMQ queue processors, Kafka consumers, scheduled scrapers, event listeners, and email/notification dispatchers.
* **Worker Execution Primitives**:
  - Configured with `internalPort: 0` and `isWorker: true`.
  - Edge router bypass: Does not allocate a public HTTP port or route public web traffic.
  - Process Liveness Watchdog: The host engine continuously monitors PID status and Docker daemon events, automatically restarting failed worker processes.

---

### 3.4 Serverless Edge Functions (V8 Isolates)
Ultra-low latency, event-driven serverless compute running on a high-density V8 sandbox execution engine.

```
Incoming Request ──► Edge Router ──► Redis Key Cache (~0.4–1.2ms) ──► V8 Isolate (:9090) ──► PgBouncer Pooler
```

* **Core Specifications**:
  - **Cold Start Latency**: **~5–15ms p50 internal isolate initialization** for pre-compiled single-file ESM bundles (measured locally at the runtime engine, excluding external client network transit; compared to ~1.5s–3.5s for Docker container starts).
  - **Memory Footprint**: **8MB – 15MB RAM per function** (enabling 200+ concurrent functions per host node).
  - **Zero Host Ports**: Operates hundreds of concurrent micro-endpoints via internal socket gateways without consuming TCP host ports.
  - **ESM Compilation**: Single-file ESM bundles generated on-the-fly using `esbuild`.
* **Granular Security Architecture**:
  - **Public Webhooks (`isPublic: true`)**: For third-party webhooks (Stripe, GitHub, Shopify) that cannot transmit custom authentication headers.
  - **Protected Endpoints (`isPublic: false`)**: Require cryptographic Function API Keys (`whz_fn_live_...`). Edge Router validates SHA-256 key hashes against Redis with sub-millisecond p50 lookup time (~0.4–1.2ms over co-located mesh).
* **3-Tier Self-Healing & Disaster Recovery**:
  - Built with a self-healing hierarchy:
    * *Tier 1 (Disk)*: Compiled bundle cache (`/opt/whizan/functions/...`).
    * *Tier 2 (Redis)*: In-memory source code cache.
    * *Tier 3 (PostgreSQL)*: Persistent database source code archive.
  - In the event of a cold reboot or cache wipe, the runtime re-queries PostgreSQL, recompiles bundles on-the-fly, and serves the initial request seamlessly with HTTP 200 OK.

---

## 4. Data & Storage Services

### 4.1 Managed PostgreSQL with PgBouncer Pooling
Enterprise relational database instances with high-concurrency connection management.

* **Key Capabilities**:
  - **Dedicated Database Instances**: Provision PostgreSQL 16 databases with dedicated schemas and credentials in seconds.
  - **Built-in PgBouncer Multiplexing**: Connects via transaction pooler ports, multiplexing thousands of ephemeral serverless function connections into safe persistent database pools.
  - **One-Click Application Auto-Binding**:
    ```bash
    whizan db create auth-db --bind auth-service
    ```
    Automatically injects encrypted `DATABASE_URL` credentials directly into target applications.
  - **Web Database Studio**: Visual table explorer, schema visualizer, query execution console, and storage metrics in the Whizan Console.

---

### 4.2 Managed In-Memory Redis Cache & Message Broker
Low-latency in-memory data store (< 1ms command execution on co-located connections) for caching, distributed coordination, and event-driven queues.

* **Key Capabilities**:
  - **High-Throughput Key/Value Storage**: Low-latency caching for sessions, rate limiting, and frequent queries.
  - **BullMQ & Celery Compatible**: Native support for BullMQ queue structures and Redis Streams.
  - **Pub/Sub Messaging Layer**: Powering real-time notifications, chat applications, and live build log streaming.
  - **TLS Encryption**: Secure communication over TLS 1.3.

---

## 5. Scheduled Compute & Workflow Automation

### 5.1 Enterprise Cron & Scheduled Compute Engine
High-precision, resource-conscious scheduled task runner engineered to eliminate idle compute overhead.

```
┌────────────────────────────────────────────────────────────────────────┐
│                      WHIZAN CRON ENGINE ARCHITECTURE                   │
├────────────────────────────────────────────────────────────────────────┤
│ • Redis Sorted Sets (cron:schedule:zset) for O(log N) Next-Tick Timing │
│ • Event-Driven Dynamic OS Sleep Loop (< 0.01% Idle CPU Overhead)       │
│ • Capped 64KB Circular Byte Ring Buffer (Zero OOM Crashes from Logs)   │
│ • Telemetry Ingestion Buffered to PostgreSQL Every 5 Seconds           │
└────────────────────────────────────────────────────────────────────────┘
```

* **Four Native Target Pipelines**:
  1. `FUNCTION`: Directly invokes internal Edge Function isolates with low-latency local socket dispatch (~2–6ms p50 internal IPC).
  2. `CONTAINER_EXEC`: Interacts directly with the Docker Engine socket to run CLI commands inside running containers (e.g. `python manage.py purge_sessions`) without exposing public HTTP endpoints.
  3. `SERVICE`: Dispatches internal requests across the private Docker network mesh (`http://service-[id]:port`).
  4. `WEBHOOK`: Dispatches signed HMAC-SHA256 HTTP requests to external webhooks.
* **Misfire Recovery Policies**:
  - `SKIP`: Discards missed runs on reboot to prevent thundering herd crashes.
  - `FIRE_LATEST_ONCE`: Fires a single catch-up execution immediately upon boot (ideal for daily backups and rollups).
  - `CATCH_UP_ALL`: Sequentially replays missed intervals with rate-limited intervals.

---

### 5.2 Whizan Flow — Visual DAG Workflow Studio
Cloud-native workflow automation engine combining visual drag-and-drop ergonomics with native cloud infrastructure primitives.

* **Core Capabilities**:
  - **Kahn's Topological DAG Resolution**: Automatically analyzes node dependencies, rejects circular execution graphs, and runs parallel tasks concurrently.
  - **Visual Split-View Studio**: Bidirectional live synchronization between the visual canvas and the JSON/YAML workflow DSL.
  - **Native Infrastructure Nodes**: Build containers, deploy revisions, probe health check endpoints, run SQL queries, invoke edge functions, and query LLM models.
  - **Human-in-the-Loop Gates**: Pause pipeline execution pending manual approval via secure token validation before deploying to production.

---

## 6. Developer Tooling & Autonomous AI DevOps

### 6.1 AI-Native DevOps MCP Server (`@whizan/mcp-devops`)
The **Model Context Protocol (MCP)** server allows AI coding assistants (Cursor, Antigravity IDE, Claude Code, Windsurf, VS Code) to orchestrate Whizan Cloud resources through conversation.

* **The Mandatory 6-Phase Autonomous Deployment Protocol**:
  1. **Audit & Context Sync (`whizan_analyze_workspace`)**: Uses Gemini 3.5 Flash Lite to inspect project files, determine language, detect entry points, identify internal ports, and flag loopback binding issues. Non-web projects (desktop GUI apps, native mobile apps, one-shot CLI scripts) are safely refused.
  2. **Environment Variable Injection (`whizan_set_env_vars`)**: Detects missing database URLs and secrets, prompting for configuration before deployment begins.
  3. **Resource Provisioning or Reuse**: Automatically inspects `.whizan.json` to reuse existing target IDs, eliminating duplicate service creation.
  4. **Direct Archive Upload (`whizan_deploy_direct`)**: Generates a clean archive excluding `node_modules` and `.git`, enqueuing the build job.
  5. **Real-Time Log Polling (`whizan_get_build_logs`)**: Streams live container compilation and startup logs until status is `READY`.
  6. **Live Health Check Verification (`whizan_check_health`)**: Probes edge endpoints to confirm HTTP 200 OK before declaring completion.
* **Diagnostic Container Execution (`whizan_exec_container_command`)**:
  - Allows AI assistants to inspect container state (e.g. `npx prisma migrate status`, `df -h`, `curl -I http://127.0.0.1:3000/health`).
  - Strict security guardrails block destructive operations (`rm`, `mkfs`, `poweroff`, `chmod 777`), system package managers, and reverse shells, while masking sensitive tokens in outputs.

---

### 6.2 Whizan Unified CLI (`@whizan/cli`)
Full-featured terminal client for managing projects, services, functions, crons, and databases directly from developer machines.

```bash
# Global installation
npm install -g @whizan/cli

# Browser OAuth authentication
whizan login

# Deploy current directory
whizan deploy
```

* **Command Summary**:
  - **Deployments**: `whizan init`, `whizan deploy`, `whizan redeploy`, `whizan link`, `whizan unlink`, `whizan delete`.
  - **Observability**: `whizan ps`, `whizan logs [--tail]`, `whizan logs --ai "explain crash"`, `whizan top`, `whizan open`.
  - **Databases**: `whizan db create <name>`, `whizan db ls`.
  - **Functions**: `whizan fn deploy <file>`, `whizan fn invoke <slug>`, `whizan fn ls`.
  - **Crons**: `whizan cron create <name>`, `whizan cron trigger <id>`, `whizan cron ls`.
  - **Diagnostics**: `whizan exec -- <command>`.

---

### 6.3 Developer Web Console & Observability Dashboard
Built with **Next.js 15 (App Router)** and modern responsive styling.

* **Deploy Visualizer**: Step-by-step horizontal execution visualizer (`QUEUED` $\to$ `CLONE` $\to$ `INSTALL` $\to$ `BUILD` $\to$ `PUBLISH` $\to$ `READY`) with live streaming logs.
* **Interactive Container Shell**: Secure web-based terminal bridge into active containers for real-time debugging.
* **Service Discovery Catalog**: Centralized catalog displaying active vs. asleep statuses, CPU/memory usage, and private DNS endpoints.
* **Database Studio**: Schema visualizer and query tester.

---

## 7. Cross-Cutting Architectural Capabilities

### Scale-to-Zero & Fast Container Cold Wakeups
Eliminates idle compute costs while guaranteeing clear user feedback:
- **Idle Tracking**: Edge Router records access timestamps in Redis (`access:deploymentId`) on every request.
- **The Reaper Daemon**: Sweeps every 60 seconds. Idle containers (10m for web projects, 15m for backend services) are gracefully stopped, releasing CPU, RAM, and ports.
- **Client Wakeup Page**: When traffic arrives for a sleeping container, the Edge Router immediately returns an animated HTTP 202 "Waking up..." status screen and dispatches an asynchronous `wakeup` event over Redis. The background worker issues `docker start` (~1.5s–3.5s depending on runtime framework bootstrap time), and the client's background ping automatically refreshes into the live application once the container's TCP socket responds.
- **WebSocket Gateway Support**: For `wss://` connections to sleeping containers, the router returns HTTP 503 (`Retry-After: 3`), signaling client libraries to retry once the container is awake.

### Private Container Mesh & Service Discovery
- Every running container joins an internal network bridge.
- Internal DNS automatically maps service slugs to container ports, allowing frontend applications and backend APIs to interact privately without traversing public networks.

### Zero-Downtime Blue/Green Deployments
- When updates are deployed, the existing container remains live and handles 100% of user traffic.
- The new container is spun up in parallel on an ephemeral port.
- Once health checks verify HTTP 200 OK, routing rules in Redis are atomically updated to the new port.
- Obsolete containers, build packages, and cached records are safely purged.

### Encrypted Secret Management & Zero-Leakage Storage
- All environment variables, API keys, and GitHub access tokens are encrypted using **AES-256-GCM** with unique 96-bit random initialization vectors (IV).
- Secrets are decrypted only in memory when injected into isolated build and runtime sandboxes.
- Secret values are masked in console outputs and log streams.

### Real-Time Log Streaming via SSE & Redis Pub/Sub
- Build and container stdout/stderr output is broadcasted over dedicated Redis channels (`logs:[id]`) and retained in capped Redis lists (`build-logs:[id]`).
- Clients stream logs in real time via Server-Sent Events (SSE) with automatic reconnection.

---

## 8. Measurement Methodology & Latency Benchmarks

To ensure engineering transparency, all performance and latency metrics documented across Whizan Cloud are measured with explicit system boundaries:

### Measurement Boundaries & Definitions

| Metric | Measured Boundary | Typical Latency (p50 / p95) | Factors Affecting Real-World Latency |
| :--- | :--- | :--- | :--- |
| **Edge Routing Lookup** | Edge Router process $\to$ Local Redis cache $\to$ Route resolution | **0.4ms – 1.2ms (p50)**<br/>**1.8ms – 3.2ms (p95)** | Assumes local/mesh Redis connection. Remote managed Redis instances add network RTT. |
| **V8 Edge Function Cold Start** | Function Gateway $\to$ V8 isolate spawn $\to$ Single-file ESM execution | **5ms – 15ms (p50)**<br/>**20ms – 45ms (p95)** | Measured on pre-compiled ESM bundles in disk cache. First-time uncompiled bundles require initial `esbuild` pass (~80–180ms). Excludes external client network transit. |
| **Warmed Function Execution** | V8 isolate warm invoke $\to$ HTTP response return | **1.5ms – 4.0ms (p50)**<br/>**8.0ms – 15.0ms (p95)** | Dependent on user code complexity and downstream database/external API call durations. |
| **Scale-to-Zero Container Wakeup** | HTTP request receipt $\to$ Redis wakeup signal $\to$ `docker start` $\to$ Healthy TCP port probe | **1.8s – 3.2s (p50)**<br/>**3.5s – 5.5s (p95)** | Dependent on framework initialization (Go/Rust: ~1.2s; lightweight Express/Fastapi: ~1.8s; heavy Next.js/Django: ~3.0s+). Instant HTTP 202 page provided to visitors during warmup. |
| **Managed Redis In-Memory Command** | Direct TCP command dispatch $\to$ In-memory key evaluation $\to$ Return | **< 1.0ms (p50)**<br/>**1.5ms – 2.5ms (p95)** | Measured over local loopback / private container mesh. External public internet access incurs physical client-to-cluster network RTT. |
| **Cron Trigger Dispatch** | Macro-scheduler daemon $\to$ Local function runtime socket or Docker API | **2.0ms – 6.0ms (p50)**<br/>**8.0ms – 14.0ms (p95)** | Local Unix socket or local HTTP bridge dispatch time. External webhook targets depend on destination network RTT. |

> **Note on End-to-End Latency**: Total request latency observed by end-users in browsers or API clients includes external factors outside cloud execution control: client-to-edge physical distance (WAN RTT), local ISP routing, TLS handshake negotiation, and DNS resolution. Whizan latency figures isolate platform-level execution, routing, and container scheduling.

---

## 8. Resource Tiers & Allocation Plans

Whizan Cloud enforces deterministic resource allocations to guarantee stability and prevent noisy neighbor interference:

| Architectural Metric | Hobby Tier (Free) | Professional Tier |
| :--- | :--- | :--- |
| **Frontend Applications** | Standard Edge Routing & Global CDN | High-Performance Edge Routing & CDN |
| **Backend Compute Limits** | `0.1 vCPU`, `512MB RAM` | Up to `4.0 vCPU`, `8GB RAM` |
| **Scale-to-Zero (Auto-Sleep)** | Enabled (10–15m Inactivity Window) | Configurable / Always-On Dedicated Instances |
| **Managed PostgreSQL** | `0.5 vCPU`, `512MB RAM` (PgBouncer Enabled) | Scalable vCPU & RAM with High-Capacity Pools |
| **Serverless Edge Functions** | Up to 100 Active Endpoints | High-Throughput Dedicated Isolate Concurrency |
| **Enterprise Cron Schedulers** | 10 Active Jobs, 60s Minimum Interval | Unlimited Jobs, Sub-Second Resolution |
| **Custom Domains & SSL** | Unlimited Custom Domains with Free SSL | Unlimited Custom Domains with Dedicated Edge SSL |
| **AI DevOps MCP & CLI** | Full Support Across All Editors | Full Support Across All Editors |
| **Deployment Concurrency** | Standard Single-Build Pipeline | Multi-Concurrency Parallel Build Pipelines |

---

## 📄 Summary & Additional Resources

- **GitHub Repository**: [Whizan Cloud Service](https://github.com/Ayushkumar0602/Whizan-cloud-service)
- **MCP DevOps Package**: [`@whizan/mcp-devops`](https://www.npmjs.com/package/@whizan/mcp-devops)
- **Unified CLI Package**: [`@whizan/cli`](https://www.npmjs.com/package/@whizan/cli)
- **Technical Documentation**: [`docs/codebase_documentation.md`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/codebase_documentation.md)
- **Edge Functions Specification**: [`docs/edge_functions_technical.md`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/edge_functions_technical.md)
- **Cron Scheduler Specification**: [`docs/cron/cron_technical.md`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/cron/cron_technical.md)
- **Flow Engine & Studio Specification**: [`docs/automation/flow_studio_and_engine_implementation.md`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/automation/flow_studio_and_engine_implementation.md)
