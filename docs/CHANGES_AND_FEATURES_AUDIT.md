# Whizan Cloud Service — Master System Changes & Feature Audit

> **Date:** October 1, 2026  
> **Repository:** `Ayushkumar0602/Whizan-cloud-service`  
> **Environment:** Azure VM (`20.2.136.11`), Edge Router (Port 80/443), Vercel Dashboard, Redis/Upstash, Postgres  
> **Branch HEAD:** `main` (`e794952` / `1bea552`)

---

## Executive Summary

Over the recent engineering cycles, the **Whizan Cloud Service** underwent significant architectural hardening, performance optimization, security enforcement, and developer tooling expansion. 

The focus areas included:
1. **Sub-Second Cold Wakeup & Scaler Hardening**: Eliminating duplicate container loops and implementing instant wakeups from stopped Docker containers.
2. **Build Worker & Frontend Pipeline Hardening**: Strict separation between static frontends (Vite/React/Astro) and SSR runtimes (Next.js/Remix), eliminating the Next.js static export trap.
3. **Multi-Level IAM & RBAC Security**: Root Admin (`aj0892829122@gmail.com`), Fleet Applications Management, and HMAC-signed IPC communication.
4. **DevOps MCP Tooling**: In-container diagnostic execution with security guardrails, live deployment inspection, and unified analytics.
5. **UI & Dashboard Overhaul**: Removal of deprecated OpenCode/localhost links, professional developer UI, and interactive stack analyzers.
6. **VM Storage & Cache Audit**: 6.5GB+ disk reclamation, persistent source storage, and zero-redundancy deployment cleanup.

---

## 1. Scaler & Cold Wake Optimization (Sub-Second Wakeup)

### Problem Identified
- Spun-down or auto-slept services previously triggered a full redeployment/rebuild cycle on incoming requests.
- Edge router wake requests spawned multiple container instances with non-deterministic IDs (`app-${slug}-${hash}`), leading to port clashes, high CPU/RAM load, and runaway restart loops.

### Technical Changes Implemented
- **Deterministic Container Naming**:
  - Web containers are now deterministically named `app-${slug}`.
  - Backend microservices are deterministically named `srv-${slug}`.
- **Fast Cold-Wake Execution Path** (`apps/build-worker/src/worker.ts` & `apps/build-worker/src/app-runner.ts`):
  - When a wake job arrives via Redis queue `queue:scaler`, the worker queries the Docker daemon for `name=^/app-${slug}$` (including stopped containers).
  - If the container exists in `exited`/`stopped` state, the worker **immediately starts it via `container.start()`** without unpacking archives, downloading dependencies, or invoking Docker build.
  - The worker performs a fail-fast health probe (polling port HTTP or process liveness with 100ms intervals).
  - Updates the routing table in Redis (`deployment:${slug}` -> container port) in **under 800ms**.
- **Preserve Stopped Containers on Spin-Down**:
  - Inactive containers are halted via `docker stop` rather than `docker rm`. They consume zero CPU and RAM while preserved on disk for instant cold boot.
- **Scaler Queue Deduplication**:
  - Added mutex locks in Redis to drop duplicate wake requests while a wake cycle for `${slug}` is already in flight.

---

## 2. Build Worker & Output Analyzer Hardening

### Static vs. SSR Separation (`apps/build-worker/src/output-analyzer.ts`)
- **Strict Static Frontends (Vite, React, Astro static, CRA)**:
  - Output directories (`dist/`, `build/`, `out/`) are copied directly to `/opt/whizan/static/${slug}`.
  - Served directly from disk by **Edge Router** (OpenResty/Fastify static stream) at sub-millisecond latencies.
  - **No Docker container is ever created for static frontends**, eliminating phantom processes and container sprawl.
- **Next.js SSR & Dynamic Routes**:
  - Removed erroneous `output: 'export'` overrides when projects utilize dynamic routes (e.g. `/scans/[id]`), Server Actions, or API endpoints.
  - Configures standalone Next.js server runtime (`apps/build-worker/src/app-runner.ts`) launched inside a lightweight Node.js Docker container.
- **Native Web Project Dockerfiles**:
  - Web applications containing a root `Dockerfile` (e.g. multi-stage Alpine) are built natively with Docker and routed directly to the assigned external port.

---

## 3. Multi-Level IAM, RBAC & Fleet Administration

### Schema & Middleware Updates (`packages/db/prisma/schema.prisma` & `apps/api/src/lib/auth-utils.ts`)
- Added 3-tier Role-Based Access Control:
  - `USER`: Access restricted strictly to owned projects, services, and databases.
  - `ADMIN`: Platform monitoring, viewing aggregated fleet stats, and system diagnostics.
  - `ROOT_ADMIN`: Permanent platform owner.
- **Superuser Hardcoding**:
  - `aj0892829122@gmail.com` is automatically provisioned as `ROOT_ADMIN` on login and cannot be demoted or deleted.

### Administrative Dashboards
- **IAM Management Page (`apps/dashboard/app/dashboard/admin/iam/page.tsx`)**:
  - View all registered users across the platform.
  - Promote/demote users between `USER` and `ADMIN`.
  - Disable/enable account access with immediate session invalidation.
- **Fleet Applications Management (`apps/dashboard/app/dashboard/admin/applications/page.tsx`)**:
  - Centralized dashboard viewing every active Web Project, Backend Microservice, and Database cluster on the host.
  - Instant inspection of CPU usage, memory consumption, running ports, and owner attribution.
  - Emergency spin-down, restart, and redeploy actions.

---

## 4. Security Hardening, HMAC IPC & SSRF Defense

- **HMAC IPC Authentication (`apps/build-worker/src/admin-crypto.ts` & Fastify Middleware)**:
  - All communication between the API, Build Worker, and Edge Router is signed with SHA-256 HMAC headers (`X-Whizan-Signature`, `X-Whizan-Timestamp`).
  - Strict 30-second replay window rejection.
- **SSRF Defense**:
  - Git repository clone URLs and direct download URLs are pre-validated to prohibit requests resolving to internal cloud metadata addresses (`169.254.169.254`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`).
- **Postgres Range Clamp (`apps/api/src/routes/analytics.ts`)**:
  - Clamped `bytesSent` and traffic counters to `MAX_SAFE_INTEGER` and PostgreSQL `INTEGER` boundaries, resolving SQL error code `22003` (integer out of range).

---

## 5. DevOps MCP Tooling (`packages/mcp-devops`)

Expanded the Model Context Protocol (MCP) server for autonomous agents and DevOps engineers:

| Tool Name | Capability & Security Guardrails |
|---|---|
| `whizan_exec_container_command` | Executes diagnostic commands inside running containers (`df -h`, `ps aux`, `cat`, `curl`). Blocks dangerous operations (`rm`, `dd`, `mkfs`, `poweroff`, `chmod 777`, crypto miners, reverse shells). Automatically masks JWTs, API tokens, and passwords in stdout. |
| `whizan_inspect_deployment` | Live container runtime inspection: inspects Docker status, mapped ports, restart counters, container ID, and memory limits. |
| `whizan_get_analytics` | Unified analytics: returns page visits, bandwidth usage, and real-time CPU/memory utilization for services. |
| `whizan_check_health` | Probes HTTPS endpoints on `*.whizan.cloud` with Cloudflare Wildcard SSL (and auto-fallback to HTTP for legacy `.nip.io` domains). |
| Background Worker Support | Allows setting `internalPort: 0` and `isWorker: true` for queue workers (Celery, BullMQ, Kafka consumers), verifying process liveness instead of probing HTTP. |

---

## 6. UI & Dashboard Modernization

- **Removed Localhost & Dead Links**: Eliminated all `localhost:3000` / `localhost:3001` hardcoded links across the frontend.
- **Removed OpenCode Studio**: Deprecated the embedded OpenCode IDE module to focus resources on core cloud hosting and microservices.
- **Interactive AI Repo Analyzer**:
  - Added an interactive repository analyzer modal powered by `gemini-3.5-flash-lite`.
  - Automatically identifies framework, build command, entrypoint, start command, and port.
  - Presents editable inputs for developer confirmation before launching builds.
- **Refined Theme & Navigation**: Sleek dark aesthetic, unified project detail views, real-time log viewers, and responsive action menus.

---

## 7. VM Storage, Cache Management & Rollback Audit

### Storage Reclamation Performed on Azure VM (`20.2.136.11`)
- **Reclaimed ~6.5 GB** of disk space:
  - Pruned stale Docker build cache layers (`docker builder prune`).
  - Purged dangling sandbox images and stopped temporary containers.
  - Cleaned unreferenced checkout archives in `/opt/whizan/repos`.
- **Persistent Source Archiving**:
  - Direct upload `.tar.gz` archives are safely stored under `/opt/whizan/sources/${slug}.tar.gz` so reboots and cold wakes always retain the deployment payload.
- **Rollback Audit (Commit `1b540dc`)**:
  - The experimental multi-file selection & cross-account orphan deletion PR (`1b540dc`) was identified as potentially destructive to user data and was cleanly reverted.
  - HEAD restored to `1bea552` (and verified on `origin/main`), keeping the storage page stable and reliable.

---

## 8. Azure VM Production Architecture Reference

The host operates on Ubuntu 24.04 (`20.2.136.11`) under direct PM2 supervision:

```
                          ┌────────────────────────┐
                          │ Internet Ingress (80)  │
                          └───────────┬────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │ PM2: edge-router (Port 80)│
                        └─────────────┬─────────────┘
                                      │
               ┌──────────────────────┼──────────────────────┐
               ▼                      ▼                      ▼
    ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
    │ PM2: whizan-api    │ │ Static Frontends   │ │ Docker Containers  │
    │ (Port 3001 / Fast) │ │ /opt/whizan/static │ │ app-${slug}        │
    └──────────┬─────────┘ └────────────────────┘ │ srv-${slug}        │
               │                                  └──────────▲─────────┘
               ▼                                             │
    ┌────────────────────┐                                   │
    │ PM2: build-worker  ├───────────────────────────────────┘
    │ (BullMQ Worker)    │
    └────────────────────┘
```

### VM Service Management Commands
```bash
# Pull latest main branch
cd /opt/whizan && git pull origin main

# Restart individual services
sudo pm2 restart whizan-api
sudo pm2 restart build-worker
sudo pm2 restart edge-router

# Check status
sudo pm2 status
```
