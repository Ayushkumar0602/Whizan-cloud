# Resource Tiers & Spin-Down (0.1 vCPU) Execution Limits

## 1. Overview
This update introduces tiered compute resource allocations for Backend Services, closely mirroring Render's instance architecture:

1. **Free Tier (Spin-Down Enabled / `autoSleep: true`)**:
   - **CPU Allocation**: Strictly throttled to **0.1 vCPU** via Docker's Linux cgroups (`NanoCpus: 100_000_000`).
   - **RAM Allocation**: Hard ceiling of **512 MB** (`536870912` bytes).
   - **Inactivity Behavior**: Automatically scales to 0 replicas after 15 minutes of idle time. The Edge Router intercepts incoming HTTP requests on `subdomain.localhost` and wakes the container asynchronously.
   - **Telemetry Tracking**: Real-time metrics evaluate CPU utilization against the **0.1 vCPU** ceiling (100% in UI = 0.1 vCPU fully saturated).

2. **Always-On Dedicated Instances (`autoSleep: false`)**:
   - Containers run persistently with 0 wake latency and 100% uptime.
   - Users can choose from dedicated compute tiers:
     - **Starter**: 0.5 vCPU (`NanoCpus: 500_000_000`), 512 MB RAM
     - **Standard**: 1.0 vCPU (`NanoCpus: 1_000_000_000`), 1024 MB RAM
     - **Pro**: 2.0 vCPU (`NanoCpus: 2_000_000_000`), 2048 MB RAM
     - **Pro Plus**: 4.0 vCPU (`NanoCpus: 4_000_000_000`), 4096 MB RAM

---

## 2. Core Implementation Layers

### A. Database Schema (`packages/db/prisma/schema.prisma`)
Added `instanceType`, `cpuLimit`, and `memoryLimit` fields to `BackendService`:
```prisma
model BackendService {
  ...
  autoSleep     Boolean             @default(true)
  instanceType  String              @default("free") // "free" | "starter" | "standard" | "pro" | "pro_plus"
  cpuLimit      Float               @default(0.1)    // 0.1 for free tier, 0.5 - 4.0 for dedicated
  memoryLimit   Int                 @default(512)    // Memory limit in MB
  ...
}
```

### B. Container Engine Enforcement (`apps/build-worker/src/service-runner.ts`)
During Docker container creation (`docker.createContainer`), limits are dynamically computed and passed into `HostConfig`:
```typescript
const isSpinDown = job.autoSleep !== false;
const cpuQuota = isSpinDown ? 0.1 : (job.cpuLimit || 0.5);
const nanoCpus = isSpinDown ? 100_000_000 : Math.round(cpuQuota * 1e9);
const memoryQuotaMB = isSpinDown ? 512 : (job.memoryLimit || 512);
const memoryBytes = memoryQuotaMB * 1024 * 1024;

const container = await this.docker.createContainer({
  Image: imageName,
  name: containerName,
  Labels: {
    serviceId: job.serviceId,
    deploymentId: job.deploymentId,
    slug: job.slug,
    type: "service",
    autoSleep: String(job.autoSleep ?? true),
    cpuLimit: String(cpuQuota),
    memoryLimit: String(memoryQuotaMB),
  },
```

### C. Two-Phase Burstable Deployment & Atomic Clamping (`apps/build-worker/src/service-runner.ts`)
Under a strict 0.1 vCPU limit, heavy build commands (e.g. `npm install`, native tar unpacking, AST parsing) can exceed timeouts. Like Render, Hostify provisions burst compute during initialization:
1. **Burstable Startup**: Container launches with **1.0 vCPU** (`NanoCpus: 1_000_000_000`) and **768 MB RAM** (tuned for 2 vCPU / 4 GB RAM host VMs, leaving 50% CPU and >3.2 GB RAM free for the host) so dependencies install and app boots in ~30 seconds.
2. **Atomic Runtime Clamping**: The instant `waitForPort()` confirms the service is healthy on HTTP, Hostify executes `container.update({ NanoCpus, Memory })` to dynamically clamp the container to its runtime allocation (0.1 vCPU & 512MB for Free Tier).
3. **Persisted Across Sleep/Wake**: Docker preserves the clamped `NanoCpus` in kernel cgroups even across `docker stop` and `docker start` wakeups.


### C. API Synchronization (`apps/api/src/routes/services.ts`)
- `POST /api/services`: If `autoSleep === true`, coerces `instanceType` to `"free"`, `cpuLimit` to `0.1`, and `memoryLimit` to `512`.
- `PUT /api/services/:id`: When user toggles Auto-Sleep ON, automatically snaps compute quota to `0.1 vCPU / 512MB`. When turning Auto-Sleep OFF, defaults to `"starter"` (0.5 vCPU) or preserves user selection.
- `GET /api/services/plans`: Provides catalog of available plans and resource descriptions.

### D. Frontend Dashboard Controls (`apps/dashboard`)
1. **New Service Creation (`apps/dashboard/app/dashboard/backend/new/page.tsx`)**:
   - Visual toggle cards: "Free Tier (Spin Down)" vs "Always-On Instance".
   - Interactive compute tier selector (Starter, Standard, Pro, Pro Plus) when Always-On is selected.
2. **Service Details & Settings (`apps/dashboard/app/dashboard/backend/[id]/page.tsx`)**:
   - Render-style Free Tier notice when Auto-Sleep is enabled with 0.1 vCPU warning.
   - Interactive plan switcher with instant DB update and "Redeploy to Apply" button when Auto-Sleep is disabled.
3. **Telemetry UI (`apps/dashboard/components/service-metrics.tsx`)**:
   - Shows active compute ceiling badge (e.g. `⚡ 0.1 vCPU limit` or `🚀 1.0 vCPU limit`).
   - Normalizes and displays CPU usage relative to the allocated ceiling so users see when their 0.1 vCPU is saturated.
