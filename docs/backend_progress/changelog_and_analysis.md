# Backend Implementation Changelog & Analysis

> **Baseline Reference:** Commit `0ceedb1` (`chore: VM Hardening - PM2 optimization, Docker Swap, and API Boot Cleanup`).
> This document audits all code implemented after that commit, detailing the new backend deployment system, edge routing modifications, and admin monitoring features.

---

## 📦 File Inventory of Changes

| Component / Layer | Status | File Path | Summary of Changes |
|---|---|---|---|
| **Database** | Modified | [`packages/db/prisma/schema.prisma`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/packages/db/prisma/schema.prisma) | Added `BackendService`, `ServiceDeployment`, `ServiceEnvVariable` models and `BackendLanguage` enum. |
| **API** | New | [`apps/api/src/routes/services.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/routes/services.ts) | Complete CRUD endpoints, BullMQ `service-build` enqueueing, encrypted env var endpoints, and SSE logs. |
| **API** | Modified | [`apps/api/src/index.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/index.ts) | Registered `serviceRoutes` under prefix `/api/services`. |
| **Worker** | New | [`apps/build-worker/src/service-worker.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/service-worker.ts) | BullMQ worker for `service-build` queue and cold-start wakeup subscriber. |
| **Worker** | New | [`apps/build-worker/src/service-runner.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/service-runner.ts) | Docker sandbox manager (multi-language, private mesh network, health polling). |
| **Worker** | Modified | [`apps/build-worker/src/worker.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/worker.ts) | Imported `service-worker.js`, added 15-minute backend idle reaper, and added live CPU/RAM container stats. |
| **Edge Router** | Modified | [`apps/edge-router/src/index.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/edge-router/src/index.ts) | Added `type === "service"` proxying, structured JSON wakeup payload, and redesigned animated 3D loading screen. |
| **Dashboard** | Modified | [`apps/dashboard/lib/api.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/lib/api.ts) | Added backend types and `services` API client methods. |
| **Dashboard** | Modified | [`apps/dashboard/app/dashboard/layout.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/app/dashboard/layout.tsx) | Added Backend Hosting navigation tab with `Server` icon. |
| **Dashboard** | New | [`apps/dashboard/app/dashboard/backend/page.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/app/dashboard/backend/page.tsx) | Services list view with live status indicators (Active, Asleep, Queued, Building). |
| **Dashboard** | New | [`apps/dashboard/app/dashboard/backend/new/page.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/app/dashboard/backend/new/page.tsx) | Multi-step service creation form with framework presets and bulk `.env` paste. |
| **Dashboard** | New | [`apps/dashboard/app/dashboard/backend/[id]/page.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/app/dashboard/backend/[id]/page.tsx) | Service detail screen: manual deploy, env variables, settings, and live terminal logs. |
| **Dashboard** | New | [`apps/dashboard/components/service-logs.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/components/service-logs.tsx) | Reusable SSE terminal stream component for service logs. |
| **Dashboard** | Modified | [`apps/dashboard/hooks/useAdminStats.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/hooks/useAdminStats.ts) | Added container `cpuPercent`, `memUsageMB`, `memLimitMB`, and `memPercent` to type definition. |
| **Dashboard** | Modified | [`apps/dashboard/app/dashboard/admin/containers/page.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/app/dashboard/admin/containers/page.tsx) | Added live CPU and RAM consumption table columns with >80% warning highlights. |
| **Dashboard** | Modified | [`apps/dashboard/app/dashboard/admin/storage/page.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/app/dashboard/admin/storage/page.tsx) | Labeled build artifact files as `frontend-build`, `backend-service`, or `log`. |

---

## 🔬 In-Depth Component Analysis

### 1. Prisma Schema Evolution
The schema was updated with dedicated backend structures:
```prisma
model BackendService {
  id             String          @id @default(uuid())
  userId         String          @map("user_id")
  name           String
  slug           String          @unique
  githubRepoUrl  String          @map("github_repo_url")
  branch         String          @default("main")
  language       BackendLanguage @default(NODEJS)
  rootDir        String          @default(".") @map("root_dir")
  installCommand String          @default("npm install") @map("install_command")
  startCommand   String          @default("npm start") @map("start_command")
  internalPort   Int             @default(8000) @map("internal_port")
  isPublic       Boolean         @default(false) @map("is_public")
  autoSleep      Boolean         @default(false) @map("auto_sleep")
  createdAt      DateTime        @default(now()) @map("created_at")
  updatedAt      DateTime        @updatedAt @map("updated_at")

  user           User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  deployments    ServiceDeployment[]
  envVariables   ServiceEnvVariable[]
}
```
**Why this matters**:
- Decouples long-running service definitions from Next.js framework output assumptions.
- Allows users to specify arbitrary ports (`internalPort`) matching their code (e.g. 5000 for Flask, 8000 for FastAPI, 3001 for Express).
- `isPublic` controls whether the Edge Router exposes the service via a wildcard subdomain or retains it exclusively within the internal mesh.

### 2. The Service Build & Execution Engine
- **Dedicated Queue**: Builds are dispatched to BullMQ as `service-build` jobs to avoid blocking or being blocked by frontend builds.
- **Dynamic Container Provisioning**:
  ```typescript
  let image = "node:20-slim";
  if (job.language === "PYTHON") image = "python:3.11-slim";
  if (job.language === "GO") image = "golang:1.21-alpine";
  ```
- **Unified Command Execution**: Uses `sh -c "set -e && installCommand && startCommand"`, allowing the container to boot, install dependencies, and stay running as the long-lived daemon.
- **Port Mapping**: Discovers an available random TCP port on the host (`findFreePort()`) and maps it to `internalPort`. Automatically injects `PORT` and `HOSTNAME=0.0.0.0` environment variables into the container.

### 3. Edge Router Evolution
- **Dual Routing Paradigm**:
  - `type === "static"`: Disk files served via `serve-static`.
  - `type === "hybrid"`: Static paths served via disk, dynamic paths proxied to container.
  - `type === "ssr" || type === "service"`: Full proxying of all paths directly to the container.
- **Structured Cold-Start Events**:
  Previous implementation sent plain strings:
  ```typescript
  // Old
  redis.publish("wakeup", deploymentId);
  ```
  New implementation transmits a structured JSON payload:
  ```typescript
  // New
  redis.publish("wakeup", JSON.stringify({ slug, deploymentId, type: deployment.type }));
  ```
  This allows the worker to differentiate between an SSR frontend wakeup and a backend service wakeup.

### 4. Admin Observability Upgrade
- Rather than simply listing container IDs, [`apps/build-worker/src/worker.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/worker.ts) now calls Docker's `.stats({ stream: false })` API.
- Computes CPU delta against system CPU delta to extract real-time **CPU utilization %**.
- Extracts container memory usage and container limit to compute **RAM usage in MB and %**.
- Exposes these metrics in the Admin Console table with colored warning badges for containers exceeding 80% usage.

### 5. In-Browser Web Shell with Multi-Tenant Security Guardrails
- **WebSocket Streaming Protocol**: Direct bidirection TTY connection over WebSocket (`/api/services/:id/shell/ws`) attached to `docker.exec({ Cmd: ["/bin/sh"], AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true })`.
- **Multi-Tenant Authorization**: Strict tenant boundary checking ensuring users can only exec into containers belonging to their own user ID.
- **Forbidden Subsystem Guardrails**: Intercepts and blocks commands that attempt illegal resource use, host escape, or out-of-scope actions (e.g. `git clone`, cryptominers, nmap, network tampering, modifying host `/proc` or `/sys`).
- **Container Hardening**: Dropped capabilities (`NET_ADMIN`, `SYS_ADMIN`, `SYS_RAWIO`, `SYS_PTRACE`, `DAC_OVERRIDE`), `no-new-privileges:true`, and cgroup process limit (`PidsLimit: 128`).

### 6. Real-Time Resource Metrics (CPU, RAM, Network I/O, PIDs)
- **High-Frequency Telemetry Stream**: Server-Sent Events (SSE) endpoint (`GET /api/services/:id/metrics/stream`) polling Docker container stats every 2 seconds.
- **Metrics Calculated**:
  - `cpuPercent`: Normalized CPU percentage calculated from delta CPU ticks relative to system ticks.
  - `memUsageMB` & `memPercent`: Process RSS (excluding inactive page cache) evaluated against container limit.
  - `rxRateKbps` & `txRateKbps`: Live network I/O throughput rates.
  - `pids`: Active task count vs `pidsLimit`.
- **Dashboard Visualization**: Interactive telemetry component ([`service-metrics.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/components/service-metrics.tsx)) rendering live cards and historical time-series sparklines.

### 7. Render-Style 0.1 vCPU Free Tier vs Dedicated Compute Tiers
- **Render-Style Free Tier (`autoSleep: true`)**:
  - Kernel-level CPU throttling to **0.1 vCPU** (`NanoCpus: 100_000_000`) and **512 MB RAM**.
  - Scales to 0 replicas after 15 minutes of inactivity; auto-wakes via Edge Router reverse proxy on incoming HTTP traffic.
- **Dedicated Always-On Compute Tiers (`autoSleep: false`)**:
  - 100% continuous uptime with zero wake latency.
  - Selectable plans:
    - **Starter**: 0.5 vCPU • 512 MB RAM
    - **Standard**: 1.0 vCPU • 1 GB RAM
    - **Pro**: 2.0 vCPU • 2 GB RAM
    - **Pro Plus**: 4.0 vCPU • 4 GB RAM
- **UI Integration**: New service creation and service settings cards for selecting plans with instant database updates.

### 8. Two-Phase Burstable Deployment & 2 vCPU / 4 GB RAM VM Optimization
- **The Problem**: Running `npm install` inside the container directly under 0.1 vCPU caused builds with 300+ packages to time out after 300 seconds.
- **Two-Phase Lifecycle**:
  1. *Burstable Startup Phase*: Container launches with **1.0 vCPU** (`NanoCpus: 1_000_000_000`) and **768 MB RAM** so dependency installation finishes in ~30 seconds.
  2. *Atomic Runtime Clamping*: The instant `waitForPort()` verifies that the HTTP server is healthy, Hostify calls `container.update({ NanoCpus: 100_000_000, Memory: 536870912 })` to clamp the container down to 0.1 vCPU for runtime without restarting or dropping connections.
- **Hardware-Aware VM Optimization**:
  - Tuned specifically for a **2 vCPU / 4 GB RAM host machine**.
  - 1.0 vCPU burst guarantees **50% CPU headroom** (1 full core) is always reserved for the host OS, Edge Router, Postgres, and Redis during builds.
  - 768 MB RAM burst leaves **> 3.2 GB RAM free** for host stability.
  - Configurable via `.env` (`DEPLOY_BURST_CPU=1.0`, `DEPLOY_BURST_MEM_MB=768`).

