# Backend Services Hosting — Progress & Architecture Overview

> **Context:** This documentation captures the implementation of Phase 3 (Backend Services & BaaS) in the Whizan Cloud Service platform, tracking the transition from a frontend/SSR host into a full-stack PaaS.

---

## 🌟 The Vision

Originally, Whizan Cloud Service (Hostify) focused on frontend and Next.js hybrid hosting (Static assets + SSR container bundles). However, modern full-stack web applications require long-running, custom backend services:
- **Node.js APIs** (Express, Fastify, NestJS, Nest)
- **Python Workers & APIs** (FastAPI, Flask, Django, Celery)
- **Go Microservices** (Gin, Fiber, standard library HTTP)
- **Dockerized Services**

The **Backend Services** subsystem brings first-class support for deploying and managing these services with zero configuration, automatic multi-language detection, private service-mesh networking, and serverless scale-to-zero capabilities.

---

## 🏛️ Core Design Philosophy: Complete Isolation

As established in [`docs/backend_architecture.md`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/backend_architecture.md), the foundational principle of this implementation is **Complete Isolation**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WHIZAN CLUSTER ISOLATION                        │
│                                                                        │
│  ┌──────────────────────────────┐    ┌──────────────────────────────┐  │
│  │   FRONTEND HOSTING TIER      │    │    BACKEND SERVICES TIER     │  │
│  │                              │    │                              │  │
│  │ • DB: Project / Deployment   │    │ • DB: BackendService /       │  │
│  │ • Ephemeral build sandbox    │    │       ServiceDeployment      │  │
│  │ • Next.js standalone bundles │    │ • Dedicated service-worker   │  │
│  │ • Public domain ingress      │    │ • Long-lived app containers  │  │
│  │ • Idle timeout: 10 minutes   │    │ • Private internal mesh      │  │
│  │                              │    │ • Idle timeout: 15 minutes   │  │
│  └──────────────┬───────────────┘    └──────────────▲───────────────┘  │
│                 │                                   │                  │
│                 └─────── whizan-internal-network ───┘                  │
│                          (Docker Bridge Mesh)                          │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Database Isolation**: The `Project` model remains dedicated to frontend web builds. Backend services use independent `BackendService`, `ServiceDeployment`, and `ServiceEnvVariable` models.
2. **Worker Isolation**: Frontend builds run on the `build` BullMQ queue. Backend services build and launch through a dedicated `service-build` queue processed by `service-worker.ts` and `service-runner.ts`.
3. **Execution Isolation**: Instead of rigid Next.js packaging, backend services pull language-tailored Docker images (`node:20-slim`, `python:3.11-slim`, `golang:1.21-alpine`) and run arbitrary installation and start commands (`installCommand && startCommand`).
4. **Network Isolation**: By default, backends are not exposed to the public internet. They live inside an internal Docker network (`whizan-internal-network`), accessible only to the user's frontend containers via private DNS aliases (e.g. `http://api-service:8000`).

---

## 🗺️ Documentation Index in this Folder

1. **[`overview.md`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/backend_progress/overview.md)** (This file): High-level architectural philosophy and system topology.
2. **[`changelog_and_analysis.md`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/backend_progress/changelog_and_analysis.md)**: Comprehensive technical breakdown of all files implemented and modified since commit `0ceedb1`.
3. **[`mesh_networking_and_lifecycle.md`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/backend_progress/mesh_networking_and_lifecycle.md)**: Deep dive into private mesh networking, scale-to-zero reaper, instant cold-start wakeups, and VM deployment runbook.
4. **[`zero_downtime_deployments_and_failure_handling.md`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/backend_progress/zero_downtime_deployments_and_failure_handling.md)**: Zero-downtime Blue/Green deployments, crash stack trace streaming, automatic rollbacks, and fail-safe resource cleanup.
5. **[`web_shell_container_exec.md`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/backend_progress/web_shell_container_exec.md)**: Secure in-browser Web Shell, container exec via WebSocket, multi-tenant isolation, security guardrails, and interactive TTY streaming.
6. **[`resource_metrics.md`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/backend_progress/resource_metrics.md)**: Real-time container resource metrics (CPU, RAM, Network I/O, PIDs) via Server-Sent Events (SSE).
7. **[`resource_tiers_and_spin_down_limits.md`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/backend_progress/resource_tiers_and_spin_down_limits.md)**: Render-style 0.1 vCPU spin-down limit vs Always-On dedicated compute tiers.
8. **[`deploy_burst_optimization_2cpu_4gb_vm.md`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/backend_progress/deploy_burst_optimization_2cpu_4gb_vm.md)**: Deployment timeout root cause, burstable build compute, dynamic runtime clamping, and 2 vCPU / 4 GB RAM VM hardware optimization.
9. **[`service_mesh_and_discovery_catalog.md`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/backend_progress/service_mesh_and_discovery_catalog.md)**: Private service mesh architecture, internal DNS service discovery, and interactive network ping connectivity tool.

