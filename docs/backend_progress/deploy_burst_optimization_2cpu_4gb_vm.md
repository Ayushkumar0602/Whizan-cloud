# Deployment Burst Compute & 2 vCPU / 4 GB RAM VM Optimization

## 1. Problem Statement

### The Incident
When deploying a backend service with auto-sleep (Free Tier) enabled:
- The container timed out after **300 seconds (5 minutes)** waiting for the HTTP service to bind to port 8000:
  ```
  Waiting for service to bind to port 8000...
  --- Installing Dependencies ---
  [stderr] npm warn deprecated node-domexception@1.0.0: ...
  ❌ Service startup failed: Timeout waiting for HTTP service on port 63415 to become healthy after 300s.
  ```
- The logs revealed that `--- Starting Service ---` was never reached. The deployment was stuck inside `npm install` for the entire 5 minutes.

### Root Cause Analysis
1. **Kernel-level 0.1 vCPU Throttling**:
   - The container was created directly with `NanoCpus: 100_000_000` (0.1 vCPU / 10% of 1 core) and 512MB RAM.
2. **CPU Consumption during Dependency Installation**:
   - Node.js dependency resolution, package integrity verification (sha512), and unpacking hundreds of npm tarballs is CPU-bound.
   - Under 0.1 vCPU, a task that normally takes 20 seconds requires `20 / 0.1 = 200–350+` seconds, exceeding the 300s deployment health check threshold.

---

## 2. The Architectural Solution: 2-Phase Deployment

Cloud platforms (Render, Railway, Fly.io) do not build or install packages under free-tier runtime CPU limits. They use a **two-phase resource lifecycle**:

```
               [ Phase 1: Burstable Build ]               [ Phase 2: Runtime Clamping ]
               ┌───────────────────────────┐             ┌─────────────────────────────┐
git clone  ──> │ 1.0 vCPU / 768 MB RAM     │ ──health──> │ 0.1 vCPU / 512 MB RAM       │
               │ npm install + app boot    │    check    │ (via dynamic docker update) │
               │ (Finishes in ~35 seconds) │   passed    │ (Zero Downtime / Persistent)│
               └───────────────────────────┘             └─────────────────────────────┘
```

1. **Burstable Startup**: The container launches with elevated CPU and RAM so that `npm install` and framework JIT compilation finish in seconds.
2. **Atomic Runtime Clamping**: The instant `waitForPort()` verifies that the application is listening on HTTP, Hostify executes Docker's dynamic resource update:
   ```typescript
   await container.update({
     NanoCpus: runtimeNanoCpus,   // 100_000_000 (0.1 vCPU for Free Tier)
     Memory: runtimeMemoryBytes,  // 512 MB
   });
   ```
3. **Persisted Across Auto-Sleep & Wake**: Docker preserves the clamped `NanoCpus` in kernel cgroups across `docker stop` and `docker start`. When the container wakes from sleep, dependencies are already installed on disk, so it boots straight into runtime without re-installing.

---

## 3. Tuning for a 2 vCPU / 4 GB RAM Host VM

### The Challenge of Host Overcommitment
On a host VM with **2 vCPU and 4 GB RAM**, bursting to `2.0 vCPU` during builds claims **100% of all available CPU cores**, creating resource contention:
- **Edge Router Lag**: Reverse proxying traffic for other active projects stutters or drops HTTP connections.
- **Database & Queue Delays**: Postgres queries and Redis pub/sub processing slow down.
- **SSH Lockout**: Server terminal commands experience latency during peak build phases.

### Capacity Breakdown

| Component | RAM Footprint | CPU Baseline | Note |
| :--- | :--- | :--- | :--- |
| **Linux OS, Docker Engine, Systemd** | ~500 MB | 0.05–0.1 vCPU | Host stability baseline |
| **Postgres Database** | ~150–250 MB | 0.05 vCPU | Stores metadata & deployments |
| **Redis Broker** | ~30–50 MB | 0.02 vCPU | BullMQ queues & pub/sub |
| **Edge Router (Reverse Proxy)** | ~50 MB | 0.05–0.1 vCPU | Must respond with sub-millisecond latency |
| **Hostify API + Build Worker + Next.js** | ~300 MB | 0.05–0.1 vCPU | Platform control plane |
| **Total System Footprint** | **~1.1 GB** | **~0.3 vCPU** | Always running on host |

### Optimized Burst Settings: **1.0 vCPU & 768 MB RAM**

```typescript
// apps/build-worker/src/service-runner.ts
const DEPLOY_BURST_CPU = parseFloat(process.env.DEPLOY_BURST_CPU || "1.0");
const DEPLOY_BURST_MEM_MB = parseInt(process.env.DEPLOY_BURST_MEM_MB || "768", 10);
```

### Why this is the optimal configuration:
1. **50% CPU Reserved for Host**:
   - The build container uses at most **1.0 vCPU** (1 core).
   - The second CPU core is **100% reserved** for the Edge Router, Postgres, Redis, and SSH daemon.
2. **10x Faster than Free Tier Limit**:
   - 1.0 vCPU provides 10 times the compute power of 0.1 vCPU.
   - In benchmarks on `whizan-backend` (348 npm packages), dependency installation finished in **30 seconds**.
3. **Safe Memory Overhead**:
   - 768 MB is well above the measured peak build usage (~103 MB) while leaving **> 3.2 GB of host RAM** free.

---

## 4. Benchmark & Verification Results

Tested on `whizan-backend` (`https://github.com/Ayushkumar0602/Leetcode-orchestration`):

| Metric | Without Burst (0.1 vCPU) | With Burst (1.0 vCPU / 768 MB) |
| :--- | :--- | :--- |
| **`npm install` Duration** | > 300s (Timed out) | **30 seconds** |
| **Total Deploy Time** | FAILED | **57 seconds** (Clone + Install + Boot + Healthy) |
| **Host CPU Available** | 1.9 vCPU free | **1.0 vCPU guaranteed free (50% headroom)** |
| **Peak Build RAM** | 43 MB | **103.4 MB** |
| **Post-Deploy Runtime Limit** | N/A | **0.1 vCPU & 512 MB** (`NanoCpus: 100000000`) |

---

## 5. Configuration Reference

Variables can be customized via `.env` without modifying code:

```bash
# .env
# Tuned for 2 vCPU / 4 GB RAM VM:
DEPLOY_BURST_CPU=1.0        # Max CPU cores allocated during install/startup
DEPLOY_BURST_MEM_MB=768     # Max RAM (MB) allocated during install/startup
```
