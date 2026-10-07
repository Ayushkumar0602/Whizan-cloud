# Whizan Cloud Service ☁️

<p align="center">
  <img src="whizan_cloud_logo.png" alt="Whizan Cloud Logo" width="340" />
</p>

<p align="center">
  <strong>Next-Generation Cloud Platform & AI-Native PaaS for Full-Stack Applications, Microservices, Edge Functions, Managed Databases & Scheduled Compute.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Whizan_Cloud-blue.svg?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/Node.js-20+-brightgreen.svg?style=flat-square" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg?style=flat-square" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Monorepo-Turborepo-ef4444.svg?style=flat-square" alt="Turborepo" />
  <img src="https://img.shields.io/badge/Docker-Sandboxed_Containers-2496ED.svg?style=flat-square" alt="Docker" />
  <img src="https://img.shields.io/badge/Model_Context_Protocol-MCP_DevOps-8b5cf6.svg?style=flat-square" alt="MCP DevOps" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="License" />
</p>

---

## 📑 Table of Contents

1. [Executive Overview](#-executive-overview)
2. [Key Capabilities](#-key-capabilities)
3. [System Architecture](#-system-architecture)
   - [Architectural Topology](#architectural-topology)
   - [Component Breakdown](#component-breakdown)
4. [Hosting Primitives](#-hosting-primitives)
   - [1. Web Applications & Frontend Projects](#1-web-applications--frontend-projects)
   - [2. Polyglot Backend Microservices & Queue Workers](#2-polyglot-backend-microservices--queue-workers)
   - [3. Serverless Edge Functions](#3-serverless-edge-functions)
   - [4. Managed Databases](#4-managed-databases)
   - [5. Enterprise Cron & Scheduled Compute](#5-enterprise-cron--scheduled-compute)
   - [6. Cloud Workflow Automation (Flow Studio)](#6-cloud-workflow-automation-flow-studio)
5. [Advanced DevOps & Traffic Mechanics](#-advanced-devops--traffic-mechanics)
   - [Edge Routing & Subdomain Resolution](#edge-routing--subdomain-resolution)
   - [Scale-to-Zero & Cold Start Architecture](#scale-to-zero--cold-start-architecture)
   - [Zero-Downtime Blue/Green Deployments](#zero-downtime-bluegreen-deployments)
   - [Resource Tiers & Multi-Tenant Isolation](#resource-tiers--multi-tenant-isolation)
6. [AI-Native DevOps & MCP Server (`@whizan/mcp-devops`)](#-ai-native-devops--mcp-server-whizanmcp-devops)
   - [The Mandatory 6-Phase Autonomous Deployment Protocol](#the-mandatory-6-phase-autonomous-deployment-protocol)
   - [Supported AI Coding Environments](#supported-ai-coding-environments)
7. [Whizan CLI (`@whizan/cli`)](#-whizan-cli-whizancli)
   - [Installation & Quick Start](#installation--quick-start)
   - [CLI Commands Reference](#cli-commands-reference)
8. [Developer Dashboard & Web Console](#-developer-dashboard--web-console)
9. [Repository Structure & Codebase Map](#-repository-structure--codebase-map)
10. [Local Development & Quickstart](#-local-development--quickstart)
11. [Security & Isolation Model](#-security--isolation-model)
12. [License](#-license)

---

## 🌟 Executive Overview

**Whizan Cloud Service** is an enterprise-ready, open-source Platform-as-a-Service (PaaS) and serverless execution fabric built for developers and autonomous AI coding agents. Inspired by modern cloud platforms like Vercel and Supabase, Whizan Cloud combines:

* **Zero-Configuration Git & Direct Deployments**: Automatically detects project stacks, synthesizes optimized container environments, builds source code, and provisions live URLs with zero manual setup.
* **Intelligent Scale-to-Zero**: Eliminates idle compute waste by spinning down unused application containers while preserving instant sub-second cold starts with automated loading screens.
* **Serverless V8 Edge Functions**: Sub-5ms execution isolates with zero host port consumption and multi-tier self-healing crash recovery.
* **AI-First DevOps Engine (Model Context Protocol)**: Seamless bidirectional integration with AI coding assistants (Cursor, Antigravity IDE, Claude Code, Windsurf) enabling natural language infrastructure orchestration and autonomous deployment verification.
* **High-Density Internal Service Mesh**: Private container-to-container DNS resolution (`http://[slug]:[port]`), encrypted secret distribution, and managed database interconnects.

---

## ⚡ Key Capabilities

| Capability | Description |
| :--- | :--- |
| **Zero-Config Builds** | Automatically identifies frameworks (Next.js, Vite, React SPA, Astro, Node.js, FastAPI, Go, Dockerfile) and applies optimal build pipelines. |
| **Scale-to-Zero Compute** | Applications automatically spin down after idle thresholds (10m for web projects, 15m for backend services), reducing CPU and memory overhead to zero. |
| **Instant Cold Wakeups** | Edge Router intercepts traffic to sleeping containers, returns an animated "Waking up..." client screen, awakens the container via Redis Pub/Sub, and auto-refreshes into the app. |
| **WebSocket & Real-Time Proxying** | Native support for `wss://` persistent connections, Next.js Hot Module Reloading (HMR), and Socket.io with graceful retry-after headers during scale-to-zero. |
| **Sub-5ms Edge Functions** | V8 sandboxed micro-worker isolates running compiled single-file ESM bundles with dedicated API keys and rate limiters. |
| **Zero-Idle Enterprise Cron** | Dynamic OS sleep loop scheduler driven by Redis Sorted Sets with sub-second resolution and 64KB circular ring buffer protection. |
| **Flow Studio & DAG Automation** | Visual workflow automation engine featuring Kahn's topological sort, split-view DSL syncing, conditional edges, and human-in-the-loop approvals. |
| **Real-Time Log Streaming** | High-throughput Redis Pub/Sub and Server-Sent Events (SSE) pipeline streaming build and container stdout/stderr live to terminals and browsers. |
| **Zero-Downtime Blue/Green** | Builds new revisions in parallel, validates health, swaps Redis routing keys atomically, and safely cleans up old containers and disk caches. |
| **Diagnostic Container Exec** | Secure terminal and RPC command execution inside running containers with strict security guardrails against destructive operations. |

---

## 🏗️ System Architecture

Whizan Cloud Service operates as a decoupled, event-driven monorepo managed via **Turborepo**. The platform separates the **Control Plane** (APIs, Authentication, Scheduling, Workflows), the **Data & Cache Layer** (PostgreSQL, Redis), the **Execution Plane** (Build Workers, Docker Runtimes, V8 Function Engine), and the **Ingress Edge Plane** (Dynamic Reverse Proxy).

### Architectural Topology

```mermaid
flowchart TD
    subgraph Ingress ["1. Ingress & Routing Plane"]
        Client(["Web Visitors & Clients"])
        CLI(["Whizan CLI / MCP AI Agents"])
        Router["Edge Router (HTTP / WebSocket Proxy)"]
    end

    subgraph Control ["2. Control & Coordination Plane"]
        API["Fastify Control Plane API"]
        DB[("Managed PostgreSQL (Prisma ORM)")]
        Redis[("Redis (Pub/Sub, Queues, Routing Cache)")]
        Cron["Cron Scheduler Engine"]
        Flow["Flow Automation Engine"]
    end

    subgraph Execution ["3. Execution & Runtime Plane"]
        Worker["Build Worker (BullMQ + Dockerode)"]
        Containers["Sandboxed Docker Containers\n(Next.js, Node.js, Python, Go)"]
        FnRuntime["Edge Function Runtime\n(V8 Isolates / Single-File ESM)"]
        Mesh["Internal Network Mesh (DNS: slug)"]
    end

    Client -->|HTTP / WSS Request| Router
    CLI -->|Deploy / Manage| API
    Router -->|1. Lookup Route < 0.8ms| Redis
    Router -->|2a. Serve Directly| FnRuntime
    Router -->|2b. Proxy Traffic| Containers
    Router -->|2c. Wakeup Event| Redis

    API -->|Persist Metadata| DB
    API -->|Dispatch Jobs| Redis
    Cron -->|ZSET Macro-Schedule| Redis
    Flow -->|DAG Execution Stream| Redis

    Redis -->|Consume Build Jobs| Worker
    Worker -->|Build & Run Containers| Containers
    Worker -->|Register Active Route| Redis
    Worker -->|Stream Logs| Redis
    Containers <-->|Private Mesh Interconnect| Mesh
```

### Component Breakdown

#### 1. Control Plane API (`apps/api`)
Built with **Fastify** for ultra-low latency and high concurrency:
- **Authentication**: Bcrypt password hashing (12 rounds), short-lived JWT tokens (15m), and rotating 7-day HttpOnly refresh cookies.
- **Project & Service Lifecycle**: CRUD operations for frontend projects, backend services, edge functions, cron jobs, and database services.
- **GitHub Integration**: OAuth flow, encrypted access token storage (`aes-256-gcm`), automated repository cloning via authenticated git URLs (`https://x-access-token:...@github.com`), and HMAC SHA-256 webhook ingestion.
- **Real-Time Telemetry & SSE**: Streams live container and build output via Server-Sent Events from Redis Pub/Sub channels (`logs:[id]`) and historical ring buffers (`build-logs:[id]`).
- **Crash Recovery Routine**: Scans database state upon startup, safely recovering stuck deployments and re-synchronizing routing keys.

#### 2. Ingress Edge Router (`apps/edge-router`)
A specialized HTTP reverse proxy and WebSocket gateway:
- **Zero-DB Routing**: Resolves incoming `Host` headers (`<slug>.whizan.cloud` or custom domains) to container ports in `< 0.8ms` using Redis cache (`deployment:<slug>`).
- **Scale-to-Zero Interceptor**: When a targeted container is asleep, the router generates an animated HTML "Waking up..." status page, fires a Redis `wakeup` event, and holds or polls until the container comes online.
- **WebSocket Gateway**: Transparently proxies `wss://` connections. For sleeping containers, sends HTTP 503 (`Retry-After: 3`) to trigger standard client reconnection once awakened.
- **Static Edge Delivery**: For static sites (`dist`, `out`, `build`), streams files directly from disk via `serve-static`, bypassing Docker containers completely.

#### 3. Build & Orchestration Worker (`apps/build-worker`)
The heavy-lifting background worker powered by **BullMQ** and **Dockerode**:
- **Isolated Build Sandboxes**: Clones source repositories and executes builds within ephemeral `node:20-slim` containers with dropped Linux capabilities (`CapDrop: ALL`) and strict memory ceilings.
- **Output Analyzer**: Inspects build output directory structure to classify the deployment as `HYBRID` (`.next/standalone`), `SSR` (`.next/server`), or `STATIC` (`dist`, `out`, `build`).
- **Dependency Cache Mounts**: Mounts persistent directories (`/opt/whizan-cache/{projectId}/npm` and `.next/cache`) to accelerate incremental builds.
- **Zero-Downtime Blue/Green Cutover**: Deploys the new revision on an ephemeral port, verifies readiness, points Redis to the new port, and purges obsolete containers and directories.
- **Scale-to-Zero Reaper**: Runs every 60 seconds, gracefully stopping containers that exceed idle inactivity windows.

#### 4. Serverless Edge Function Runtime (`apps/function-runtime`)
High-density V8 serverless isolate engine running on an internal gateway:
- **Micro-Cold Starts (< 5ms)**: Functions are bundled via `esbuild` into standalone single-file ESM bundles.
- **Zero Host Ports**: Operates hundreds of concurrent functions without allocating dedicated TCP host ports.
- **3-Tier Self-Healing Recovery**: If the host restarts or in-memory caches are wiped, the runtime re-fetches code from PostgreSQL, recompiles on-the-fly, and serves the request seamlessly.

#### 5. Enterprise Cron Scheduler (`apps/cron-scheduler`)
- **Zero-Idle Sleep Loop**: Eliminates wasteful polling loops with an event-driven dynamic OS sleep loop ($< 0.01\%$ idle CPU).
- **Macro-Scheduling**: Uses Redis Sorted Sets (`cron:schedule:zset`) with millisecond timestamp scores for $O(\log N)$ tick polling.
- **Multi-Target Execution**: Triggers Edge Functions, private mesh services, container CLI commands (`docker exec`), and signed HTTP webhooks.

#### 6. Workflow Flow Engine (`apps/flow-engine`)
- **DAG Execution Engine**: Uses Kahn's topological sorting algorithm to resolve dependency graphs, parallel execution branches, and conditional step execution.
- **Human-in-the-Loop Approvals**: Pause workflows pending cryptographic token validation from dashboard or webhook triggers.

---

## 🚀 Hosting Primitives

Whizan Cloud provides six purpose-built hosting primitives designed to accommodate any modern software architecture:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           WHIZAN CLOUD HOSTING PRIMITIVES                       │
├──────────────────────┬──────────────────────┬───────────────────────────────────┤
│ 1. Web Applications  │ 2. Backend Services  │ 3. Serverless Edge Functions      │
│ • Next.js App Router │ • Node.js / Python   │ • V8 Web Standards Runtime        │
│ • Static SPAs (Vite) │ • Go / Rust / Java   │ • Sub-5ms Cold Starts             │
│ • Containerized Web  │ • Background Workers │ • Zero Host Port Consumption      │
├──────────────────────┼──────────────────────┼───────────────────────────────────┤
│ 4. Managed Databases │ 5. Enterprise Crons  │ 6. Flow Studio Automations        │
│ • Managed PostgreSQL │ • Sub-Second Ticks   │ • Visual Canvas DAG Workflows     │
│ • Managed Redis      │ • Docker Exec & Fn   │ • Bidirectional DSL Sync          │
│ • PgBouncer Pooling  │ • Misfire Recovery   │ • Human-in-the-Loop Gates         │
└──────────────────────┴──────────────────────┴───────────────────────────────────┘
```

---

### 1. Web Applications & Frontend Projects

Whizan Cloud natively hosts modern frontend frameworks and fullstack web applications:

* **Static Single Page Apps (Vite, React SPA, Astro, Vue, Svelte)**:
  - Framework detection: `VITE`, `REACT`, `ASTRO`.
  - Built inside isolated sandboxes; the resulting assets (`dist/`, `build/`) are served directly at the Edge with zero container memory overhead.
* **Next.js Server-Side Rendering (SSR & Standalone)**:
  - Framework detection: `NEXTJS`.
  - Output format: `.next/standalone` with static asset offloading to disk.
  - Full support for Next.js App Router, Dynamic `[id]` Routes, Server Actions, API routes, and Server Components.
  - *Dynamic Route Guardrail*: Whizan Cloud strictly enforces standalone SSR over static exports (`output: 'export'`) when dynamic routes or server actions are detected, preventing broken builds.
* **Containerized Web Applications**:
  - Full support for repositories containing a custom `Dockerfile`.
  - Builds the container and attaches it to the Edge Router on port 3000 (or custom configured port).

---

### 2. Polyglot Backend Microservices & Queue Workers

Whizan Cloud provides first-class hosting for backend APIs, microservices, and background queue workers:

* **Supported Runtimes**: Node.js (Express, Fastify, NestJS, Hono), Python (FastAPI, Django, Flask), Go (`go.mod`), and any compiled language via custom multi-stage `Dockerfile` (Rust, Java Spring Boot, PHP Laravel, Ruby on Rails).
* **Private Service Mesh**:
  - Every backend service automatically joins the internal Docker network mesh (`whizan-internal-network`).
  - Containers communicate privately using internal service names:
    ```bash
    # Frontend or another service calling an internal API:
    http://api-service:8000/v1/users
    ```
* **Loopback Listener Trap Guardrail**:
  - Network applications inside Docker must bind to `0.0.0.0`, NOT `127.0.0.1` or `localhost`.
  - The Whizan analyzer inspects entry points and flags loopback bindings prior to deployment, ensuring zero unreachable container errors.
* **Background Queue Workers**:
  - For worker processes without public HTTP ports (e.g. Celery, BullMQ, Kafka consumers), Whizan supports worker mode (`internalPort: 0`, `isWorker: true`).
  - Process liveness is monitored continuously instead of probing HTTP health endpoints.

---

### 3. Serverless Edge Functions

Designed for ultra-low latency event handlers, webhooks, authentication callbacks, and micro-APIs:

```
Client Request ──► Edge Router ──► Redis Auth Cache (< 0.8ms) ──► V8 Isolate (:9090) ──► PgBouncer Pooler
```

* **High-Density Execution**:
  - Baseline memory is only **8–15MB** per isolate (compared to 150MB+ for a standard Docker container).
  - Cold starts execute in **< 5ms**.
  - Functions consume **0 TCP host ports**, allowing hundreds of concurrent micro-endpoints on a single node.
* **Fine-Grained Security & API Keys**:
  - **Public Webhooks (`isPublic: true`)**: For open webhooks (Stripe, GitHub, Shopify) that cannot transmit custom authentication headers.
  - **Protected Endpoints (`isPublic: false`)**: Require cryptographic Function API Keys (`whz_fn_live_...`). Edge Router verifies SHA-256 hashes against Redis in `< 0.8ms`.
* **Zero-State Disaster Recovery & Self-Healing**:
  - Uses a 3-tier persistent storage architecture:
    1. *Tier 1 (Disk)*: Cached compiled ESM bundle.
    2. *Tier 2 (Redis)*: In-memory source cache.
    3. *Tier 3 (PostgreSQL)*: Authoritative database source record.
  - If node caches are wiped or the server restarts, the runtime automatically recompiles bundles on-the-fly from PostgreSQL on the first incoming request.

---

### 4. Managed Databases

Whizan Cloud provisions dedicated database instances with automatic environment variable injection:

* **Managed PostgreSQL**:
  - Production-grade PostgreSQL instances with automated credential creation.
  - Built-in **PgBouncer** connection pooler multiplexes thousands of ephemeral serverless function connections into safe connection pools, preventing PostgreSQL exhaustion (`Too many connections`).
* **Managed Redis**:
  - High-throughput Redis instances for application caching, BullMQ job queues, and Pub/Sub messaging.
* **Auto-Binding**:
  - Databases can be linked directly to projects or services via CLI, UI, or MCP:
    ```bash
    whizan db create my-postgres --bind my-api-service
    ```
  - Automatically injects `DATABASE_URL` as an encrypted environment variable.

---

### 5. Enterprise Cron & Scheduled Compute

A cloud-native scheduling engine engineered for sub-second precision and zero idle resource consumption:

* **Zero-Idle Sleep Loop**: The scheduler calculates the exact millisecond delta to the nearest scheduled job in Redis Sorted Sets (`cron:schedule:zset`) and sleeps the OS thread until required, keeping CPU usage below 0.01%.
* **Circular Byte Ring Buffer**: Captures execution stdout/stderr in a fixed 64KB memory ring buffer, preventing OOM crashes from verbose CLI logs.
* **Four Execution Target Pipelines**:
  1. `FUNCTION`: Directly invokes internal Edge Function isolates in `< 3ms`.
  2. `CONTAINER_EXEC`: Interacts directly with Docker Engine socket to run CLI tasks inside live containers (e.g. `python manage.py purge_sessions`) without exposing public HTTP endpoints.
  3. `SERVICE`: Dispatches internal requests across the private Docker network mesh (`http://service-[id]:port`).
  4. `WEBHOOK`: Sends signed HMAC-SHA256 HTTP requests to external webhooks.
* **Misfire Policies**:
  - `SKIP`: Discards overdue runs on reboot to prevent thundering herd crashes.
  - `FIRE_LATEST_ONCE`: Executes one catch-up run immediately upon boot (recommended for daily rollups and backups).
  - `CATCH_UP_ALL`: Sequentially replays missed intervals with rate limiting (for financial auditing).

---

### 6. Cloud Workflow Automation (Flow Studio)

A full-featured visual workflow automation system combining drag-and-drop orchestration with cloud infrastructure primitives:

* **Topological DAG Sorter**: Kahn's in-degree algorithm resolves step execution order and runs parallel branches concurrently while enforcing acyclic integrity.
* **Bidirectional Studio DSL**: Visual canvas modifications immediately update the underlying JSON/YAML workflow DSL, and vice versa.
* **Native Cloud Triggers**: Trigger workflows via Git pushes, incoming webhooks, cron timers, or manual dispatch.
* **Human-in-the-Loop Gates**: Pause workflows at critical stages (e.g. production release, data migration) until an administrator authorizes the step via secure approval token.

---

## ⚡ Advanced DevOps & Traffic Mechanics

### Edge Routing & Subdomain Resolution

The Edge Router intercepts all inbound traffic on ports 80 and 443:

```
Incoming Request: https://analytics-api.whizan.cloud/v1/query
                      │
                      ▼
Extract Host header ──► "analytics-api"
                      │
                      ▼
Query Redis LRU Cache: `deployment:analytics-api`
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
[Active: Port 34182]        [Asleep: Port NULL]
        │                           │
Proxy HTTP / WSS 200 OK      Return 202 "Waking up..."
                             Publish Redis `wakeup`
```

1. **Subdomain Extraction**: Parses the incoming `Host` header to determine the deployment slug.
2. **Sub-Millisecond Redis Query**: Retrieves `containerPort`, `framework`, and `type`.
3. **Transparent Proxying**: If the container is active, streams the HTTP or WebSocket payload directly to the mapped host port.

---

### Scale-to-Zero & Cold Start Architecture

To maximize compute density, Whizan Cloud includes an intelligent scale-to-zero lifecycle:

```
[Active Container] ──(Idle 10-15m)──► [The Reaper Stops Container]
                                              │
                                              ▼
[Incoming Web Request] ◄── [User Visits Asleep App]
         │
         ├── 1. Router returns 202 Animated "Waking up..." Page
         ├── 2. Router fires Redis `wakeup` Event
         ├── 3. Build Worker executes `docker start` (~1.8s)
         ├── 4. Worker updates Redis with new Port
         └── 5. Browser background ping receives 200 OK & auto-refreshes!
```

* **Inactivity Tracking**: Edge Router records access timestamps in Redis (`access:deploymentId`) on every request.
* **The Reaper Sweeper**: Background daemon sweeps every 60 seconds. Inactive containers are stopped, freeing memory and CPU.
* **Instant Wakeup**: When traffic arrives for a sleeping container, the Edge Router returns an animated status page that polls the URL via background `HEAD` pings. Once the container starts (typically under 2 seconds), the page automatically refreshes to display the live application.
* **Zero Redundant Builds**: Waking up an existing deployment reuses the pre-compiled container image on disk—no Git clone or npm install is repeated.

---

### Zero-Downtime Blue/Green Deployments

Deploying updates to live production services never interrupts active user traffic:

```
1. Old Container (Port 3001) ──► Handling 100% of Live Traffic
2. Build Worker builds New Container (Port 3002) in background
3. TCP & HTTP Health Check probes Port 3002 until HTTP 200 OK
4. Atomic Redis Swap: `deployment:my-app` -> Port 3002
5. New requests route instantly to Port 3002
6. Worker terminates Old Container (Port 3001) and purges old files
```

---

### Resource Tiers & Multi-Tenant Isolation

Whizan Cloud enforces strict resource boundaries to prevent noisy neighbor degradation:

| Resource Dimension | Hobby Tier (Free) | Professional Tier |
| :--- | :--- | :--- |
| **Frontend Applications** | Edge Routing / Static CDN | Dedicated Edge Routing & CDN |
| **Backend Microservices** | `0.1 vCPU`, `512MB RAM`, Auto-Sleep Enabled | Up to `4.0 vCPU`, `8GB RAM`, Custom Auto-Sleep |
| **Managed Databases** | `0.5 vCPU`, `512MB RAM` (Starter) | Scalable vCPU & RAM with High-Concurrency Pools |
| **Edge Functions** | Up to 100 concurrent isolates | High-concurrency pooled execution |
| **Cron Scheduling** | 10 active jobs, 60s minimum interval | Unlimited jobs, sub-second execution intervals |

---

## 🤖 AI-Native DevOps & MCP Server (`@whizan/mcp-devops`)

Whizan Cloud features native support for the **Model Context Protocol (MCP)**, allowing AI coding assistants to autonomously build, deploy, manage, and troubleshoot cloud infrastructure.

```
AI Assistant (Cursor / Antigravity / Claude)
                     │
                     ▼
         @whizan/mcp-devops Engine
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
6-Phase Deployment Protocol   Container Exec Diagnostics
```

### The Mandatory 6-Phase Autonomous Deployment Protocol

All deployments executed through the MCP engine follow a deterministic, verified protocol:

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

1. **Phase 1: Workspace Audit & Guardrails**: Analyzes framework, entry point, start command, and required environment variables. Rejects unsupported non-web projects (GUI desktop apps, mobile-only apps, one-shot CLI scripts).
2. **Phase 2: Environment Provisioning**: Prompts for required environment variables and encrypts them via AES-256-GCM.
3. **Phase 3: Target Provisioning**: Checks `.whizan.json` to prevent duplicate resource creation, linking directly to existing deployments when available.
4. **Phase 4: Source Packaging & Upload**: Creates a clean tarball excluding `node_modules` and `.git`, uploading directly to the build pipeline.
5. **Phase 5: Real-Time Log Polling**: Streams live build output until the status reaches `READY` or `FAILED`.
6. **Phase 6: Health Verification**: Verifies HTTP 200 OK on the live edge URL before declaring deployment success.

### Supported AI Coding Environments

#### 1. One-Click Global Setup
Install the MCP integration across all installed IDEs on your machine:
```bash
npx @whizan/mcp-devops install
```

#### 2. Editor-Specific Configuration

* **Antigravity IDE**:
  Add to `~/.gemini/config/mcp_config.json`:
  ```json
  {
    "mcpServers": {
      "whizan": {
        "command": "npx",
        "args": ["-y", "@whizan/mcp-devops"]
      }
    }
  }
  ```
* **Cursor AI**:
  Open **Cursor Settings** $\to$ **Features** $\to$ **MCP** $\to$ **Add New MCP Server**:
  - Name: `whizan`
  - Type: `command`
  - Command: `npx -y @whizan/mcp-devops`
* **Claude Code (Anthropic CLI)**:
  ```bash
  claude mcp add whizan -- npx -y @whizan/mcp-devops
  ```
* **Windsurf (Cascade)**:
  ```bash
  npx @whizan/mcp-devops install --windsurf
  ```

---

## 💻 Whizan CLI (`@whizan/cli`)

Deploy and operate your cloud infrastructure directly from your command line:

### Installation & Quick Start

```bash
# Install globally
npm install -g @whizan/cli

# Authenticate via browser OAuth
whizan login

# Deploy current directory
whizan deploy
```

### CLI Commands Reference

| Command | Action |
| :--- | :--- |
| `whizan init` | Interactively generate a `.whizan.json` configuration file |
| `whizan deploy` | Execute full 6-phase deployment pipeline |
| `whizan redeploy` | Redeploy current linked project with latest source code |
| `whizan ps` | List all active projects, backend services, edge functions, and crons |
| `whizan logs [id] [--tail]` | Stream live build or container output logs |
| `whizan logs [id] --ai "question"` | AI Log Intelligence — Diagnose crashes, stack traces, and bottlenecks |
| `whizan env ls` | List configured environment variables |
| `whizan env set KEY=VAL` | Set encrypted environment variables |
| `whizan env rm KEY` | Remove an environment variable |
| `whizan db create <name>` | Provision a Managed PostgreSQL database |
| `whizan db create <name> --type REDIS` | Provision a Managed Redis database |
| `whizan fn deploy <file>` | Deploy an Edge Function ESM bundle |
| `whizan fn invoke <slug>` | Invoke a live Edge Function endpoint |
| `whizan cron create <name> --schedule "*/5 * * * *"` | Create a scheduled cron job |
| `whizan cron trigger <id>` | Manually trigger a cron execution |
| `whizan exec -- CMD` | Execute diagnostic commands inside a live container |
| `whizan top` | Interactive terminal resource monitor (htop-style) |
| `whizan open [id]` | Open live application URL in your default browser |

---

## 🖥️ Developer Dashboard & Web Console

Built with **Next.js 15 (App Router)** and modern responsive styling:

* **Interactive Deploy Visualizer**: Real-time visual pipeline (`QUEUED` $\to$ `CLONE` $\to$ `INSTALL` $\to$ `BUILD` $\to$ `PUBLISH` $\to$ `READY`) with live streaming logs.
* **Service Catalog**: Manage web apps, backend APIs, edge functions, cron jobs, and databases from a single unified interface.
* **Interactive Container Shell**: Secure web-based terminal bridge into running containers for real-time debugging.
* **Environment Variable Manager**: Zero-knowledge secret management with client-side masking and AES-256-GCM backend storage.
* **Analytics Explorer**: Aggregated daily traffic metrics (page views, unique visitors, bandwidth).

---

## 🗂️ Repository Structure & Codebase Map

```
Whizan-cloud-service/
├── apps/
│   ├── api/                   # Fastify Control Plane API & WebSocket Server
│   ├── build-worker/          # BullMQ Worker, Docker Orchestration, Scale-to-Zero Reaper
│   ├── edge-router/           # Dynamic HTTP/WSS Reverse Proxy & Scale-to-Zero Interceptor
│   ├── function-runtime/      # Serverless V8 Isolate Engine & esbuild ESM Compiler
│   ├── cron-scheduler/        # Zero-Idle Scheduled Compute Engine (Redis ZSET)
│   ├── flow-engine/           # Visual DAG Workflow Automation Engine
│   └── dashboard/             # Next.js 15 Web Console & Developer Dashboard
├── packages/
│   ├── cli/                   # @whizan/cli terminal tooling
│   ├── mcp-devops/            # @whizan/mcp-devops Model Context Protocol server
│   ├── db/                    # Shared Prisma ORM client & PostgreSQL migrations
│   ├── ui/                    # Shared React UI components & design tokens
│   ├── eslint-config/         # Monorepo linting configurations
│   └── typescript-config/     # Base TypeScript compiler configs
├── docs/                      # Technical specifications, guides & low-level design documents
├── docker-compose.yml         # Local development infrastructure (Postgres & Redis)
├── turbo.json                 # Turborepo task pipeline orchestration
└── package.json               # Root workspace manifest
```

---

## 🛠️ Local Development & Quickstart

### Prerequisites
* **Node.js**: `v20.x` or higher
* **npm**: `v10.x` or higher
* **Docker Engine & Docker Compose**: Installed and running locally
* **Git**: Installed

### Step-by-Step Local Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Ayushkumar0602/Whizan-cloud-service.git
   cd Whizan-cloud-service
   ```

2. **Install Workspace Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy the example environment configuration:
   ```bash
   cp .env.example .env
   ```
   Ensure `DATABASE_URL`, `REDIS_HOST`, `JWT_SECRET`, and `ENCRYPTION_KEY` are configured.

4. **Start Local Database & Cache Infrastructure**:
   ```bash
   docker-compose up -d
   ```
   This spins up local PostgreSQL 16 and Redis 7 instances.

5. **Run Database Migrations**:
   ```bash
   npm run db:push
   ```

6. **Start All Platform Microservices**:
   ```bash
   npm run dev
   ```
   Turborepo will concurrently start:
   - **Dashboard**: `http://localhost:3000`
   - **Control Plane API**: `http://localhost:4000`
   - **Edge Router**: `http://localhost:8080`
   - **Function Runtime**: `http://localhost:9090`
   - **Build Worker**, **Cron Scheduler**, and **Flow Engine** daemons

---

## 🔒 Security & Isolation Model

* **Cryptographic Storage**: Environment variables and access tokens are encrypted using **AES-256-GCM** with a unique 96-bit random initialization vector (IV) per record.
* **Sandbox Container Hardening**: Build and runtime containers drop all Linux capabilities (`CapDrop: ALL`), enforce strict memory caps, mount root directories read-only where applicable, and run unprivileged user processes.
* **Command Execution Guardrails**: The container exec engine (`whizan_exec_container_command`) strictly blocks destructive system operations (`rm -rf`, `mkfs`, `poweroff`, `chmod 777`), cryptocurrency miners, and reverse shells, while masking sensitive tokens and keys in command outputs.
* **Sub-Millisecond Redis Auth Caching**: API keys and webhook signatures are validated against in-memory SHA-256 hashes at the edge, mitigating denial-of-service vectors before reaching backend databases.

---

## 📄 License

Whizan Cloud Service is released under the **MIT License**.  
© [Whizan Cloud](https://whizan.xyz). All rights reserved.
