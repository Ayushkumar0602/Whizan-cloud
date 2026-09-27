# Zero-Downtime Blue/Green Deployments & Failure Handling

> **Context:** This document explains the Blue/Green Zero-Downtime deployment lifecycle, failure detection, container crash log extraction, automatic rollbacks, and complete resource cleanup in Whizan Cloud Service.

---

## 🎯 Architectural Goal

During code updates, redeploys, or Git push events:
1. **Zero Downtime:** The existing healthy running container must continuously serve incoming traffic without a single dropped packet or 502 Bad Gateway.
2. **Promote on Health Only:** The new deployment is built and started in parallel on an isolated host port and attached to the internal mesh network. Incoming traffic is switched atomically via the Edge Router **only after** the new container passes HTTP health checks.
3. **Comprehensive Failure Handling & Diagnostics:** If the new deployment fails at any stage (Git clone, dependency installation, startup crash, port conflict, or health check timeout):
   - The terminal displays detailed error logs and the full crash stack trace (`[stderr]` and stdout lines from the container).
   - All ephemeral resources created for that failed deployment (the new container, temporary files, and `/tmp/hostify-builds/${deploymentId}`) are deleted immediately.
   - The previous healthy container and service remain completely untouched and active, and the terminal explicitly confirms that zero-downtime traffic preservation was maintained.

---

## 🔄 Lifecycle Diagram

```
[ New Deployment Triggered ]
             │
             ▼
   [ 1. Clone & Build ] ─────── (Fail: Invalid branch / syntax) ──┐
             │                                                    │
             ▼                                                    │
   [ 2. Start Green Container ]                                   │
   (service-{slug}-{shortId})                                     │
   Parallel port, mesh attached                                   │
             │                                                    │
             ▼                                                    │
   [ 3. Health Check Probe ] ── (Fail: Crash / Exit / Timeout) ───┤
             │                                                    │
             │ (Pass: 200 OK)                                     │
             ▼                                                    ▼
   [ 4. Atomic Cutover ]                               [ Failure Cleanup ]
   Redis: deployment:{slug} -> new port                1. Fetch & print crash logs
   Edge Router routes to Green container               2. Force remove failed container
             │                                         3. Delete /tmp/hostify-builds/dId
             ▼                                         4. Reassure active container safe
   [ 5. Decommission Old ]                             5. Set status = FAILED
   Graceful drain (5s) -> Stop -> Remove               6. Publish __DONE__ to terminal
   Delete old build directories & cache
```

---

## 🛡️ Detailed Failure Handling Workflow

### 1. Fail-Fast Crash Detection
In [`apps/build-worker/src/service-runner.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/service-runner.ts), the health check monitor polls every 2 seconds:
- Inspects container state: If `!info.State.Running` or `info.State.Restarting`, it halts immediately without waiting for the 5-minute timeout.
- Extracts exit code, OOM kill flags (512MB RAM exceeded), and Docker daemon error strings.

### 2. Log Extraction & Demuxing
Before removing the container, `service-runner.ts` queries `container.logs({ stdout: true, stderr: true, tail: 40 })`:
- Demuxes the 8-byte Docker stream frames into clean stdout and `[stderr]` lines.
- Flushes the lines to Redis Pub/Sub (`build-logs:${deploymentId}`) so the developer sees the exact runtime stack trace (e.g. `MODULE_NOT_FOUND`, syntax error, or unhandled rejection) directly in their terminal.

### 3. Immediate Ephemeral Resource Cleanup
In [`apps/build-worker/src/service-worker.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/service-worker.ts):
- **Disk Cleanup:** Automatically runs `fs.rm(buildDir, { recursive: true, force: true })`, deleting the repository clone from `/tmp/hostify-builds/${deploymentId}`.
- **Container Cleanup:** Double-checks Docker for any container labeled with or named after `deploymentId` and executes `container.remove({ force: true })`.

### 4. Zero-Downtime Rollback Verification
Because Edge Router route keys (`deployment:${slug}`) and old container teardown are deferred until **after** health checks succeed:
- The previous container's port mapping remains active in Edge Router Redis cache.
- The previous container continues handling HTTP requests.
- The worker queries the database for the active `READY` deployment and outputs reassurance in the terminal:
  ```
  🛡️ Previous healthy deployment (cb54661f) is active on port 64295.
  ✓ Zero-downtime preserved: Live traffic continues serving from existing deployment without interruption.
  ```

---

## 🎨 UI & Terminal Visibility

In [`apps/dashboard/components/service-logs.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/components/service-logs.tsx) and [`apps/dashboard/app/dashboard/backend/[id]/page.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/app/dashboard/backend/%5Bid%5D/page.tsx):
- **Log Highlighting:** Errors (`❌`, `failed`, `error:`) are highlighted in `#f87171`, stderr in `#fbbf24`, success in `#4ade80`, and system notices (`🛡️`, `🧹`, `📋`) in `#60a5fa`.
- **Deployment History:** Failed deployments display an error badge and error message preview in the history list.
- **Live Tail & Re-stream:** Real-time stream automatically halts upon receiving `__DONE__` and permits re-streaming.
