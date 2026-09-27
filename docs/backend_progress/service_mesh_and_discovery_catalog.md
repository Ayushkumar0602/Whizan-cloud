# Private Service Mesh & Service Discovery Catalog

## 1. Overview
Whizan Cloud Service (Hostify) includes a private internal service mesh built on top of Docker's isolated bridge networking (`whizan-internal-network`). All backend services and frontend Next.js SSR containers connect to this unified mesh, allowing inter-service communication with zero public internet exposure.

This update exposes the service mesh as a first-class feature in the Dashboard:
1. **Internal Connection & DNS Catalog Card**: Real-time display of the container's internal URL, DNS alias, port, reachability scope, and multi-language connection snippets (Next.js, Python, cURL, .env).
2. **Interactive Network Ping Tool**: UI-driven diagnostic tool that sends real HTTP requests across `whizan-internal-network` to verify connectivity between services, measuring round-trip latency, DNS resolution, and TCP handshake times.

---

## 2. Architecture & Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       whizan-internal-network (Bridge Mesh)                 │
│                                                                             │
│   ┌───────────────────────────┐             ┌───────────────────────────┐   │
│   │   Frontend (Next.js SSR)  │             │   Backend (Express API)   │   │
│   │                           │             │                           │   │
│   │   Container: web-app      │  ─────────> │   Container: api-service  │   │
│   │   IP: 172.19.0.3          │  HTTP GET   │   IP: 172.19.0.2          │   │
│   │                           │             │   Alias: api-service      │   │
│   │   fetch("http://api:8000")│             │   Port: 8000              │   │
│   └───────────────────────────┘             └───────────────────────────┘   │
│                 ▲                                         ▲                 │
│                 │                                         │                 │
│                 └───────── Docker Embedded DNS ───────────┘                 │
│                               (127.0.0.11)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

1. **Embedded DNS Service Discovery**:
   - Every container attached to `whizan-internal-network` automatically has its Docker DNS resolver configured to `127.0.0.11`.
   - When Next.js calls `http://whizan-backend:8000`, the Docker DNS server resolves `whizan-backend` directly to the container's private mesh IP (e.g. `172.19.0.2`).
2. **Zero Ingress Exposure Required**:
   - Backend APIs do not need `isPublic: true` or public internet exposure. They are safely walled off inside the Docker network.
3. **No Port Collisions**:
   - Since each container possesses its own virtual network interface on `172.19.0.0/16`, multiple services can listen on internal port `8000` or `3000` without conflict.

---

## 3. Implementation Details

### A. API Endpoints (`apps/api/src/routes/services.ts`)

#### 1. `GET /api/services/mesh/catalog`
Fetches all services belonging to the user's workspace along with their live mesh topology:
```json
[
  {
    "id": "bc2805b5-4357-4780-bb6c-a11b5c4898c7",
    "name": "whizan-backend",
    "slug": "whizan-backend",
    "internalPort": 8000,
    "internalUrl": "http://whizan-backend:8000",
    "networkAlias": "whizan-backend",
    "meshNetwork": "whizan-internal-network",
    "status": "running",
    "ipAddress": "172.19.0.2",
    "isPublic": false,
    "autoSleep": true
  }
]
```

#### 2. `POST /api/services/mesh/ping`
Executes an on-demand HTTP probe on `whizan-internal-network` using an ephemeral diagnostic container (`curlimages/curl`):
- **Input Parameters**:
  - `targetSlug`: Service alias or slug to reach.
  - `targetPort`: Target container port.
  - `path`: Probe path (e.g. `/` or `/health`).
- **Telemetry Returned**:
  ```json
  {
    "success": true,
    "targetUrl": "http://whizan-backend:8000/api/health",
    "targetSlug": "whizan-backend",
    "targetPort": 8000,
    "statusCode": 200,
    "latencyMs": 11,
    "resolvedIp": "172.19.0.2",
    "dnsOk": true,
    "timeDnsMs": 1.5,
    "timeConnectMs": 1.8,
    "headers": {
      "x-powered-by": "Express",
      "content-type": "application/json"
    },
    "bodyPreview": "{\"status\":\"healthy\"}",
    "network": "whizan-internal-network"
  }
  ```
- **Error Diagnostics**:
  - Detects if target container is currently in auto-sleep (scale-to-zero) and prompts user to wake it.
  - Diagnoses DNS resolution failures (Exit 6) vs Port closed / Connection refused (Exit 7) vs Timeout (Exit 28).

---

### B. Frontend UI Component (`apps/dashboard/components/service-mesh-card.tsx`)

1. **Service Mesh Card**:
   - **Internal URL Monospace Box**: One-click copy for `http://slug:port`.
   - **Network Alias**: Copyable DNS hostname.
   - **Live Mesh Badge**: Indicates if container is currently `● Active on Mesh`, `○ Standby / Auto-Sleep`, or `● Offline`.
   - **Multi-Tab Code Snippets**:
     - *Next.js (App Router / SSR)*: Shows `fetch("http://slug:port/...")`.
     - *Environment Variables*: Shows `BACKEND_API_URL=http://slug:port`.
     - *cURL*: Shows CLI test command for container shells.

2. **Network Ping Modal**:
   - Accessible via the **"Test Mesh Connection"** button.
   - Allows selecting other workspace services from a dropdown catalog or entering a custom alias.
   - Sends real-time probe and displays interactive results:
     - Response status pill (e.g. `200 OK` or `404 Not Found`).
     - Sub-millisecond latency badge (e.g. `⚡ 11 ms`).
     - Diagnostic metrics breakdown (DNS Lookup, Resolved Mesh IP, TCP Handshake).
     - Response headers and body preview.

---

### C. Persistent Install Cache Fix (`apps/build-worker/src/service-runner.ts`)
During testing, we discovered that restarting or waking a stopped container with `docker start` re-executed the container's original `Cmd`.
We updated the run command to include an idempotent stamp file (`.hostify_installed`):
```typescript
const cmd = [
  "sh",
  "-c",
  `set -e && if [ ! -f .hostify_installed ]; then echo "--- Installing Dependencies ---" && ${job.installCommand} && touch .hostify_installed; fi && echo "--- Starting Service ---" && ${job.startCommand}`
];
```
- **New Deployments**: `.hostify_installed` does not exist in the fresh build folder, so `installCommand` runs once under burst compute.
- **Wake-Ups from Sleep / Restarts**: `.hostify_installed` already exists on disk, so `npm install` is skipped, jumping straight to `npm start` in **~1.5 seconds**.

---

### D. Frontend SSR Mesh Connectivity (`apps/build-worker/src/app-runner.ts`)
Configured Next.js SSR containers to join `whizan-internal-network`:
```typescript
HostConfig: {
  PortBindings: { "3000/tcp": [{ HostPort: String(port) }] },
  Memory: 256 * 1024 * 1024,
  RestartPolicy: { Name: "unless-stopped" },
  NetworkMode: "whizan-internal-network", // Join the internal service mesh
}
```
Now, frontend SSR containers can communicate directly with any backend service via `http://[backend-slug]:[internalPort]`.
