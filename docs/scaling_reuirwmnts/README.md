# Whizan Cloud Architecture & Scaling Requirements Library

> **The Definitive Engineering Blueprint for the Evolution of Whizan Cloud**  
> *From Single-VM Monolith (Whizan 1.0) to Zero-VM Serverless Distributed Cloud Platform (Whizan 2.0)*

---

## 🧭 Master Documentation Index

This directory (`/docs/scaling_reuirwmnts/`) houses the complete, unabridged architectural specifications, comparative audits, and implementation playbooks for Whizan Cloud.

```
WHIZAN CLOUD SCALING & ARCHITECTURE DOCUMENTATION MAP
│
├── 📜 00: Current State V1 Baseline & Disaster Recovery Runbook
│   └── Preserves active v1 setup: DB schema, VM configs, PM2 binaries, live credentials, emergency rollback.
│
├── 🏛️ 01: Executive Summary & The Architectural Paradigm Shift
│   └── 5-tier decoupled topology, cost reduction ($110/mo ──► $25–$35/mo), elimination of single Azure VM.
│
├── ⚡ 02: Frontend Platform Specification (Vercel Benchmark)
│   └── Direct Cloudflare R2 streaming (<10ms TTFB), remote Turbo cache, 4-tier subdomains, asset skew immunity, ISR.
│
├── ⚙️ 03: Backend Services Specification (Render Benchmark)
│   └── 4 Workload Archetypes (Web, Private, Worker, Cron), zero-Docker multi-stage synthesis, deep health probes.
│
├── 🚀 04: Serverless Container Engine (Azure ACA & KEDA)
│   └── True scale-to-zero ($0.00 idle), sub-1.2s cold boot, ingress connection holding, traffic splitting, KEDA triggers.
│
├── 🏗️ 05: Ephemeral Build Farm & CI Pipeline
│   └── Isolated ACI/Kaniko builders (0% CPU impact on live sites), 4,800 builds/hr capacity, real-time log streaming.
│
├── 💾 06: Managed Database Infrastructure Specification
│   └── Serverless Postgres (Neon / Aurora benchmark), auto-pausing compute, PgBouncer pooling, continuous 7-day PITR.
│
├── 📦 07: Persistent Storage Volumes & Data Resilience
│   └── Decoupled SSD block volumes (/app/data), SQLite WAL mode, continuous Litestream sync to R2, zero egress S3.
│
├── 🛡️ 08: Networking, Service Mesh & Security Architecture
│   └── Dynamic Envoy Ingress (xDS API), virtual overlay CNI (no port collisions), private mesh (*.internal), secret scopes.
│
├── 🚨 09: Exhaustive Failure Scenarios & Edge Case Matrix
│   └── 35+ production edge cases analyzed: build fork bombs, compiler OOMs, DDoS floods, DB deadlocks, node crashes.
│
└── 🗺️ 10: Migration Playbook & Phased Rollout Roadmap
    └── 14-day zero-downtime cutover plan, Prisma schema additions, refactoring guides for apps/api, worker, router.
```

---

## 📚 Document Catalogue & Core Specifications

### [00: Current State V1 Baseline & Disaster Recovery Runbook](./00_CURRENT_STATE_V1_BASELINE_AND_DISASTER_RECOVERY_RUNBOOK.md)
* **Purpose**: Serves as the immutable safety net. Captures the exact, active state of Whizan 1.0 so that live production is never disrupted and can be restored deterministically at any moment.
* **Key Contents**:
  - Live system topology (Dashboard `dashboard.whizan.cloud`, Control Plane `api.whizan.cloud`, Services `*.whizan.cloud`, Azure VM `20.2.136.11`, Supabase PostgreSQL, Upstash Redis).
  - Complete, unabridged Prisma schema (1,148 lines, 25+ models).
  - VM directory structures, UFW firewall configurations, and port allocations.
  - Raw PM2 startup scripts bypassing `npx` (preventing the 99% CPU freeze bug).
  - Complete master reference for all environment variables.
  - Disaster recovery protocols for VM reboots, port 80 conflicts, and build deadlocks.

---

### [01: Executive Summary & Paradigm Shift](./01_EXECUTIVE_SUMMARY_AND_PARADIGM_SHIFT.md)
* **Purpose**: Details the architectural transformation from a coupled, single-server system to an enterprise-grade distributed platform.
* **Key Contents**:
  - Root-cause analysis of Whizan 1.0's single Azure VM bottleneck (`Standard_B2s`, 2 vCPU, 4 GB RAM).
  - The 5-Tier Decoupled Distributed Topology (Edge CDN $\rightarrow$ Serverless Ingress $\rightarrow$ Elastic Containers $\rightarrow$ Ephemeral Build Farm $\rightarrow$ Serverless Data).
  - Cost economics: transitioning from ~$110/month fixed overhead to ~$25–$35/month usage-based spend.

---

### [02: Frontend Platform Specification (Vercel Benchmark)](./02_FRONTEND_PLATFORM_VERCEL_BENCHMARK_SPEC.md)
* **Purpose**: Designs a frontend hosting engine matching Vercel’s global speed, edge caching, and developer experience.
* **Key Contents**:
  - Direct static asset streaming via Cloudflare R2, bypassing compute containers entirely for sub-10ms global TTFB.
  - Content-Addressable Remote Turbo Build Caching (Zstandard compression), cutting build times from 180s to 14s.
  - 4-Tier automated subdomain routing (`<slug>`, `<slug>-git-<branch>`, `<slug>-pr-<id>`, `<slug>-<sha>`).
  - Asset Skew Protection protocol with 48-hour immutable chunk retention in R2.
  - Distributed Next.js ISR cache handler (`@whizan/next-cache-handler`) backed by Redis and R2.
  - Real User Monitoring (RUM) Core Web Vitals beacon (`whizan-vitals.js`).

---

### [03: Backend Services Specification (Render Benchmark)](./03_BACKEND_SERVICES_RENDER_BENCHMARK_SPEC.md)
* **Purpose**: Establishes a multi-archetype container runtime benchmarking Render's microservice architecture.
* **Key Contents**:
  - The 4 First-Class Workload Archetypes: `Web Service`, `Private Service`, `Background Worker`, and `Cron Job`.
  - Zero-Docker Polyglot Multi-Stage synthesis for Node.js, Python FastAPI/Django, Go, Rust, Java, and .NET.
  - Configurable HTTP `/healthz` probes and automated self-healing.
  - 30s–120s graceful connection drainage window (`SIGTERM` handling).
  - In-memory Secret Files (`/etc/secrets/*`) mounted on `tmpfs` RAM and Shared Environment Groups.

---

### [04: Serverless Container Engine (Azure ACA & KEDA)](./04_SERVERLESS_CONTAINER_ENGINE_AZURE_ACA_KEDA.md)
* **Purpose**: Replaces long-running VM containers with on-demand, event-driven serverless containers.
* **Key Contents**:
  - True scale-to-zero ($0.00 compute spend when idle).
  - Sub-1.2s cold start optimization with ACR artifact layer streaming.
  - Envoy ingress connection holding and request buffering during replica scale-up.
  - KEDA autoscaling rules (HTTP concurrency, Redis queue backlog, scheduled Cron).
  - Blue/Green traffic splitting, canary revisions, and programmatic TypeScript provisioning engine (`@azure/arm-appcontainers`).

---

### [05: Ephemeral Build Farm & CI Pipeline](./05_EPHEMERAL_BUILD_FARM_AND_CI_PIPELINE.md)
* **Purpose**: Completely isolates compilation and Docker builds from live production serving.
* **Key Contents**:
  - Elimination of the "Noisy Neighbor" compute starvation bug on VM `20.2.136.11`.
  - Concurrency throughput: 50–100 parallel builds, up to 4,800 builds/hour.
  - Unit economics: exact compute calculation of ~$0.00192 to $0.007 per 75-second build.
  - Sandboxed execution using Google Kaniko (userspace builds with zero root Docker socket access).
  - Real-time build log streaming pipeline (Ephemeral builder $\rightarrow$ Redis Pub/Sub $\rightarrow$ WebSocket/SSE $\rightarrow$ Web Terminal).

---

### [06: Managed Database Infrastructure Specification](./06_MANAGED_DATABASE_INFRASTRUCTURE_SPEC.md)
* **Purpose**: Decouples persistent relational databases from compute nodes, benchmarking Neon and AWS Aurora Serverless.
* **Key Contents**:
  - Decoupled serverless PostgreSQL architecture with auto-suspending compute (0 vCPU / 0 MB RAM when idle).
  - Integrated PgBouncer transaction pooling (`pool_mode = transaction`) scaling 10,000+ client connections down to 20 backends.
  - Continuous Write-Ahead Log (WAL) streaming via `WAL-G` directly to Cloudflare R2.
  - Point-In-Time-Recovery (PITR) to any specific second within a 7-day retention window.
  - Programmatic database provisioning service (`@neondatabase/api-client`).

---

### [07: Persistent Storage Volumes & Data Resilience](./07_PERSISTENT_STORAGE_VOLUMES_AND_DATA_RESILIENCE.md)
* **Purpose**: Solves container ephemeral disk wipes for stateful applications (SQLite, PocketBase, Ghost CMS).
* **Key Contents**:
  - Decoupled NVMe block storage volumes mounted independently of Git deployment lifecycles (`/app/data`).
  - SQLite production hardening: mandatory WAL mode enforcement (`PRAGMA journal_mode=WAL; busy_timeout=5000;`).
  - Continuous Litestream replication streaming SQLite WAL deltas to Cloudflare R2 with <1s RPO.
  - Direct browser-to-R2 presigned upload architecture eliminating server bandwidth bottlenecks and egress fees.
  - Online, non-disruptive volume resizing.

---

### [08: Networking, Service Mesh & Security Architecture](./08_NETWORKING_SERVICE_MESH_AND_SECURITY_ARCHITECTURE.md)
* **Purpose**: Implements a zero-trust network topology eliminating host port hunting and lateral attack vectors.
* **Key Contents**:
  - Dynamic Envoy Layer-7 Ingress cluster configured in real-time via the Envoy xDS dynamic discovery API.
  - Virtual Overlay CNI: eliminating `findFreePort` and host port collisions (all containers listen on private internal port 8080).
  - Encrypted Private Microservice Mesh (`*.internal`) with WireGuard/mTLS.
  - Strict 3-tier secret scoping (`PRODUCTION`, `PREVIEW`, `DEVELOPMENT`) with preview password barriers.
  - Mandatory non-root container execution (`UID 1001:1001`).

---

### [09: Exhaustive Failure Scenarios & Edge Case Matrix](./09_EXHAUSTIVE_FAILURE_SCENARIOS_AND_EDGE_CASE_MATRIX.md)
* **Purpose**: Comprehensive technical catalog of 35+ real-world cloud failure modes, their triggers, and automated self-healing responses.
* **Key Categories**:
  1. Ephemeral Builds & CI/CD Pipeline (compiler OOMs, fork bombs, cryptominers, corrupt cache).
  2. Ingress & Routing (port collisions, DDoS floods, 502 Bad Gateways, slow memory leaks).
  3. Frontend & SSR (asset skew chunk errors, dynamic route export traps, ISR desync).
  4. Backend Microservices (dropped requests, headless worker misclassification, queue backlogs).
  5. Databases (host disk corruption, connection exhaustion, accidental table drops, SQLite wipeouts).
  6. Networking & Security (secret leakage in PRs, wildcard SSL expiration, root breakout).

---

### [10: Migration Playbook & Rollout Roadmap](./09_EXHAUSTIVE_FAILURE_SCENARIOS_AND_EDGE_CASE_MATRIX.md)
* **Purpose**: Step-by-step engineering rollout plan executing the transition with zero customer downtime.
* **Key Contents**:
  - 4-Phase implementation sequence: Data Decoupling $\rightarrow$ Ingress Replacement $\rightarrow$ Build Farm Rollout $\rightarrow$ Serverless Compute Cutover.
  - Exact Prisma schema migrations (`ServiceArchetype`, `VolumeMount`, `ServiceEnvVariable`, `BuildFarmJob`).
  - Refactoring instructions for `apps/api`, `apps/build-worker`, `apps/edge-router`, and `packages/db`.
  - 14-day production rollout schedule.
  - Pre-flight acceptance testing verification checklist.

---

## 🛡️ Implementation Protocol (Preserving v1 vs Implementing v2)

When proceeding with development:
1. **Repository Separation**: The codebase in this workspace represents the working, stable Whizan 1.0 foundation. Whizan 2.0 components can either be developed in a dedicated clean-room repository or under feature-flagged modular directories (e.g. `packages/v2-engine/`).
2. **Database Non-Interference**: Do not run destructive schema operations (`prisma migrate reset` or `db push --force-reset`) against the live Supabase production database. All v2 schema additions are purely additive (new optional models and nullable relations).
3. **VM Safety**: Keep all running PM2 daemons on Azure VM `20.2.136.11` active. Do not terminate `edge-router`, `build-worker`, or customer Docker containers until Phase 4 cutover is 100% verified.
