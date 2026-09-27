# Private Mesh Networking, Scale-to-Zero & VM Runbook

> **Scope:** Technical specification of the private Docker bridge network (`whizan-internal-network`), the 15-minute idle scale-to-zero reaper, instant cold-start wakeups, and VM deployment commands.

---

## 🌐 1. Docker Private Mesh Networking

### The Problem
In standard PaaS setups, if a user deploys a Next.js frontend and a Python/Node.js API, the frontend has to call the backend over the public internet (e.g. `https://my-api.whizan.com/api/data`). This introduces:
1. Unnecessary latency (DNS lookup + SSL handshake + public internet transit).
2. Security risks (backend endpoints must be exposed publicly and authenticated manually).
3. Bandwidth egress costs.

### The Solution: `whizan-internal-network`
The platform uses a dedicated Docker bridge network that acts as a private service mesh:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      whizan-internal-network                           │
│                                                                        │
│   ┌────────────────────────┐            ┌──────────────────────────┐   │
│   │ Next.js SSR Container  │            │  Backend Service         │   │
│   │                        │            │  Container               │   │
│   │ fetch(                 │───────────►│  Network Alias:          │   │
│   │  "http://api-auth:8000"│   Docker   │  "api-auth"              │   │
│   │ )                      │   Bridge   │  Internal Port: 8000     │   │
│   └────────────────────────┘   DNS      └──────────────────────────┘   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Container Network Configuration in Code
When a backend service is created via [`ServiceRunner.startService()`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/service-runner.ts#L88-L115):
```typescript
const networkName = "whizan-internal-network";

const container = await docker.createContainer({
  name: `service-${job.slug}`,
  Image: image,
  Cmd: cmd,
  Env: env,
  ExposedPorts: { [`${job.internalPort}/tcp`]: {} },
  HostConfig: {
    Binds: [`${path.resolve(buildDir)}:/app`],
    PortBindings: {
      [`${job.internalPort}/tcp`]: [{ HostPort: String(hostPort) }],
    },
    Memory: 512 * 1024 * 1024, // 512MB RAM cap
    RestartPolicy: { Name: "unless-stopped" },
    NetworkMode: networkName, // Attach to internal mesh
  },
  NetworkingConfig: {
    EndpointsConfig: {
      [networkName]: {
        Aliases: [job.slug] // DNS alias matching service slug
      }
    }
  }
});
```

### Public vs. Internal Visibility
- **If `isPublic: false`**: The container is only reachable within `whizan-internal-network` using `http://<slug>:<internalPort>`. It is registered in Redis strictly for wakeups and manual testing.
- **If `isPublic: true`**: The container is also registered in Redis for wildcard domain resolution (e.g. `http://<slug>.localhost:8080`), and the Edge Router proxies internet traffic to it.

---

## ⚡ 2. Scale-to-Zero & Cold-Start Wakeups

To maximize server density on single VPS deployments, backend services can be configured with `autoSleep: true`.

### The 15-Minute Reaper
Located in [`apps/build-worker/src/worker.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/worker.ts#L410-L449):
1. Runs once every 60 seconds.
2. Queries the database for all `READY` backend services with `autoSleep: true`.
3. Checks the `access:<deploymentId>` Redis key, which is touched on every incoming Edge Router request.
4. If `Date.now() - lastAccess > 15 * 60 * 1000` (15 minutes):
   - Calls `container.stop({ t: 2 })` via Dockerode. **The container is intentionally NOT removed**, preserving all disk state and installed packages.
   - Clears `containerPort` from the Redis routing record (`deployment:<slug>`).
   - Clears `containerPort` from PostgreSQL (`ServiceDeployment.containerPort = null`), signaling to the Dashboard that the service is `ASLEEP`.

### Instant Cold-Start Wakeup Flow
```
1. Visitor / Frontend makes HTTP/WS request to sleeping service
               │
               ▼
2. Edge Router detects deployment without `containerPort`
               │
               ├──► Returns HTTP 202 with animated "Waking up..." HTML screen
               │
               ▼
3. Edge Router publishes to Redis "wakeup" channel:
   { slug: "my-api", deploymentId: "dep-123", type: "service" }
               │
               ▼
4. `service-worker.ts` intercepts message:
   - Gets container `service-my-api`
   - Executes `container.start()` (takes ~0.5 - 1.5s)
   - Inspects container to get host-mapped port
   - Polls HTTP endpoint until healthy
   - Re-registers port in Redis: `deployment:my-api`
   - Updates PostgreSQL with active `containerPort`
               │
               ▼
5. Browser loading screen polls `HEAD /` with exponential backoff,
   detects 200 OK, and reloads directly into the live app!
```

---

## 🚀 3. VM Deployment & Operational Runbook

When deploying this new architecture to an Ubuntu VM (DigitalOcean Droplet or Azure VM), execute the following steps in sequence:

### Step 1: Create the Internal Docker Network
The Docker daemon must have the global bridge network created before any service or frontend tries to attach:
```bash
sudo docker network create whizan-internal-network || true
```

### Step 2: Push Database Schema Changes
Apply the new `BackendService`, `ServiceDeployment`, and `ServiceEnvVariable` tables:
```bash
cd /opt/whizan
npx prisma db push --schema=packages/db/prisma/schema.prisma
```

### Step 3: Start Services via Raw TSX Binaries
*(Follows the VM Hardening Protocol from `docs/vm_deployment_guide.md` to avoid PM2 CPU wrapper bugs)*:

```bash
# 1. API
sudo bash -c "set -a && source /opt/whizan/.env.production && pm2 start /opt/whizan/node_modules/.bin/tsx --name 'whizan-api' --cwd /opt/whizan/apps/api -- src/index.ts"

# 2. Edge Router
sudo bash -c "set -a && source /opt/whizan/.env.production && pm2 start /opt/whizan/node_modules/.bin/tsx --name 'edge-router' --cwd /opt/whizan/apps/edge-router -- src/index.ts"

# 3. Build Worker (handles both frontend builds and service builds concurrently)
sudo bash -c "set -a && source /opt/whizan/.env.production && pm2 start /opt/whizan/node_modules/.bin/tsx --name 'build-worker' --cwd /opt/whizan/apps/build-worker -- src/worker.ts"

# 4. Save PM2 configuration
sudo pm2 save --force
```

### Verification Commands
- Check all running PM2 services: `sudo pm2 status`
- Inspect the internal mesh network: `sudo docker network inspect whizan-internal-network`
- Check active backend containers: `sudo docker ps --filter "name=service-"`
- View worker build logs: `sudo pm2 logs build-worker --lines 100`
