# 05: EPHEMERAL BUILD FARM & CI PIPELINE SPECIFICATION

---

## 1. Executive Problem Statement & Architectural Audit

In Whizan 1.0, source code compilation, `npm install`, TypeScript transpilation, and `docker build` operations execute directly on the production host VM (`20.2.136.11`).

This creates a catastrophic failure mode known as **Noisy Neighbor Compute Starvation**:
- A single user deploying a Next.js or Rust application consumes 100% of the host's 2 vCPUs and 3.5 GB of RAM.
- Live production services running on the same VM encounter severe CPU throttling and latency spikes (p99 latency jumps from 45ms to >15,000ms).
- If concurrent builds trigger simultaneously, the Linux kernel Out-Of-Memory (OOM) killer terminates running production containers, dropping live customer databases and web services.

Whizan 2.0 completely isolates all build workloads into an **On-Demand Ephemeral Serverless Build Farm** utilizing **Azure Container Instances (ACI)** or **Azure Container Apps Jobs (ACA Jobs)** with **Rootless Kaniko / BuildKit**.

```
WHIZAN 1.0 (Shared Resource Contention)      WHIZAN 2.0 (Isolated Ephemeral Build Farm)
┌──────────────────────────────────────┐     ┌──────────────────────────────────────────────────┐
│ Single VM 20.2.136.11                │     │ Whizan Control Plane (Redis Job Queue)           │
│                                      │     └────────┬───────────────────┬─────────────────────┘
│ ┌─────────────────┐ ┌──────────────┐ │              │                   │
│ │ Production Svc  │ │ npm install  │ │              ▼                   ▼
│ │ (Requests Fall) │ │ docker build │ │     ┌─────────────────┐ ┌─────────────────┐
│ │ ◄── 100% CPU ───┼─┤ (Starves VM) │ │     │ Ephemeral ACI   │ │ Ephemeral ACI   │
│ └─────────────────┘ └──────────────┘ │     │ Build Job #1    │ │ Build Job #2    │
│                                      │     │ (2 vCPU, 4GB)   │ │ (4 vCPU, 8GB)   │
│ [OOM KILLER ACTIVATION RISK]         │     │ Dedicated $0.007│ │ Dedicated $0.007│
└──────────────────────────────────────┘     └────────┬────────┘ └────────┬────────┘
                                                      │                   │
                                                      ▼                   ▼
                                             ┌─────────────────────────────────────┐
                                             │ Azure Container Registry (ACR)      │
                                             │ (Immutable Image Layers Cached)     │
                                             └─────────────────────────────────────┘
```

---

## 2. Ephemeral Build Concurrency & Economics

By decoupling builds into isolated, ephemeral containers that boot on demand and terminate immediately upon completion, Whizan achieves infinite horizontal build concurrency while drastically cutting infrastructure overhead.

### Concurrency & Throughput Math
- **Standard Build Instance**: 2 vCPU, 4 GB RAM.
- **Average Build Duration**: 75 seconds (with remote R2 caching).
- **Concurrent Build Ceiling**: 100 parallel ACI containers per region.
- **Hourly Build Capacity**:
  $$\text{Capacity} = \frac{3,600\text{ seconds}}{75\text{ seconds/build}} \times 100\text{ concurrent runners} = 4,800\text{ builds/hour}$$
- **Impact on Live Production Services**: **0.00% CPU contention, 0 dropped packets**.

### Unit Cost Economics (Azure Container Instances)
Azure Container Instances bills per vCPU-second and GB-second:
- **vCPU Rate**: $0.0000105 per vCPU-second
- **Memory Rate**: $0.00000115 per GB-second

$$\text{Compute Cost per Build} = (75\text{s} \times 2\text{ vCPU} \times \$0.0000105) + (75\text{s} \times 4\text{ GB} \times \$0.00000115) = \$0.001575 + \$0.000345 = \mathbf{\$0.00192}$$

Even factoring in storage I/O and network egress, the total infrastructure cost for an enterprise build is **under $0.007 per build**. Idle cost is strictly **$0.00**.

---

## 3. Sandboxed Container Build Architecture (Rootless Kaniko)

To prevent security exploits, host escapes, and malicious cryptocurrency miners, builds must execute in a strictly sandboxed, unprivileged environment without requiring root Docker socket access (`/var/run/docker.sock`).

Whizan 2.0 employs **Google Kaniko**, which executes container image builds completely in userspace inside an unprivileged container.

```mermaid
graph TD
    A[Source Code Archive from R2] -->|Download & Extract| B[Kaniko Sandbox Container]
    C[Cached Layers from ACR] -->|Pull Remote Cache| B
    B -->|Userspace Filesystem Snapshot| D[Compile & Build Application]
    D -->|Generate Layer Diff| E[Compress Image Layers]
    E -->|Direct Push over TLS| F[Azure Container Registry (ACR)]
    B -->|Exit Code 0| G[Self-Terminate & Destroy Container]
```

### Kaniko Execution Parameters
```bash
/kaniko/executor \
  --context=dir:///workspace \
  --dockerfile=/workspace/Dockerfile \
  --destination=whizanacr.azurecr.io/apps/myapp:latest \
  --cache=true \
  --cache-repo=whizanacr.azurecr.io/apps/build-cache \
  --cache-dir=/cache \
  --snapshot-mode=redo \
  --compressed-caching=false \
  --single-snapshot \
  --verbosity=info
```

### Security & Isolation Controls
1. **No Root Daemon**: Kaniko does not run a daemon and executes without root host privileges.
2. **Ephemeral Network Sandbox**: Build containers run on an isolated subnet with egress limited to official package managers (npm, PyPI, Crates.io, Maven) and ACR; all lateral network access to internal databases or peer services is blocked.
3. **Strict Resource Hard Limits**: Any build exceeding 15 minutes of runtime or 8 GB of RAM is automatically terminated by the ACI watchdog.

---

## 4. Real-Time Build Log Streaming Pipeline

During build execution, compiler output (stdout/stderr) must stream to the user's browser with sub-100ms latency without overloading the relational database.

```
┌─────────────────────┐       ┌──────────────────────┐       ┌──────────────────────┐
│ Ephemeral Build Pod │──────►│ Redis Pub/Sub Stream │──────►│ WebSocket Gateway    │
│ (stdout / stderr)   │ Chunk │ channel: logs:{id}   │ SSE   │ (apps/api)           │
└─────────────────────┘       └──────────┬───────────┘       └──────────┬───────────┘
                                         │                              │
                                         ▼                              ▼
                              ┌──────────────────────┐       ┌──────────────────────┐
                              │ Cloudflare R2        │       │ Web Dashboard Client │
                              │ (Permanent Build Log)│       │ (Xterm.js Terminal)  │
                              └──────────────────────┘       └──────────────────────┘
```

### Protocol Implementation
1. **Chunked Streaming**: The ephemeral builder sends log lines in batches of 10 lines or 100ms intervals to Whizan API via an authenticated HTTP/2 gRPC or TLS streaming socket.
2. **Redis In-Memory Ring Buffer**: Active lines are published to Redis channel `build:logs:{deploymentId}` and appended to a temporary Redis List with a 2-hour TTL.
3. **Browser Live Streaming**: The client web dashboard connects via Server-Sent Events (SSE) or WebSocket (`GET /api/deployments/:id/logs/stream`) to view real-time compilation progress.
4. **Permanent Object Archival**: Upon build completion (`READY` or `FAILED`), the complete consolidated log file is archived to Cloudflare R2 (`s3://whizan-build-logs/{deploymentId}.txt.gz`) for zero-cost permanent historical review.

---

## 5. Ephemeral Builder Provisioning Engine

The Whizan Control Plane dynamically spins up ephemeral build containers using the `@azure/arm-containerinstance` SDK.

### Build Farm Orchestrator (`apps/build-worker/src/builder-orchestrator.ts`)
```typescript
import { ContainerInstanceManagementClient } from "@azure/arm-containerinstance";
import { DefaultAzureCredential } from "@azure/identity";

const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID!;
const resourceGroupName = process.env.AZURE_RESOURCE_GROUP!;
const acrServer = process.env.AZURE_ACR_SERVER!;
const acrUsername = process.env.AZURE_ACR_USERNAME!;
const acrPassword = process.env.AZURE_ACR_PASSWORD!;

const client = new ContainerInstanceManagementClient(new DefaultAzureCredential(), subscriptionId);

export interface EphemeralBuildJobRequest {
  deploymentId: string;
  sourceArchiveUrl: string;
  targetImageTag: string;
  framework: string;
  buildCommand?: string;
}

export async function launchEphemeralBuild(req: EphemeralBuildJobRequest): Promise<string> {
  const containerGroupName = `build-${req.deploymentId.toLowerCase()}`;

  const containerGroupConfig = {
    location: "eastus",
    restartPolicy: "Never",
    osType: "Linux",
    imageRegistryCredentials: [
      {
        server: acrServer,
        username: acrUsername,
        password: acrPassword,
      },
    ],
    containers: [
      {
        name: "kaniko-builder",
        image: "gcr.io/kaniko-project/executor:v1.20.0-debug",
        resources: {
          requests: {
            cpu: 2.0,
            memoryInGB: 4.0,
          },
        },
        environmentVariables: [
          { name: "DEPLOYMENT_ID", value: req.deploymentId },
          { name: "SOURCE_ARCHIVE_URL", value: req.sourceArchiveUrl },
          { name: "TARGET_IMAGE", value: `${acrServer}/apps/${req.targetImageTag}` },
        ],
        command: [
          "/busybox/sh",
          "-c",
          `
          echo "=== WHIZAN CLOUD 2.0 SECURE EPHEMERAL BUILDER ===" &&
          wget -q -O /workspace.tar.gz "$SOURCE_ARCHIVE_URL" &&
          mkdir -p /workspace && tar -xzf /workspace.tar.gz -C /workspace &&
          /kaniko/executor \
            --context=dir:///workspace \
            --dockerfile=/workspace/Dockerfile \
            --destination="$TARGET_IMAGE" \
            --cache=true \
            --cleanup &&
          echo "=== BUILD AND PUSH COMPLETED SUCCESSFULLY ==="
          `,
        ],
      },
    ],
  };

  const poller = await client.containerGroups.beginCreateOrUpdate(
    resourceGroupName,
    containerGroupName,
    containerGroupConfig
  );

  await poller.pollUntilDone();
  return containerGroupName;
}
```
