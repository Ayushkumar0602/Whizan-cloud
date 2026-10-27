# 10: MIGRATION PLAYBOOK & ROLLOUT ROADMAP

---

## 1. Executive Migration Strategy

This document provides the definitive implementation playbook for transitioning Whizan Cloud from its current single-VM monolithic architecture (Whizan 1.0 on `20.2.136.11`) to the distributed, zero-VM, serverless platform (Whizan 2.0).

### Core Migration Principles
1. **Zero Customer Downtime**: Existing customer workloads on Whizan 1.0 must continue serving traffic uninterrupted throughout the entire upgrade.
2. **Phase-Gated Cutover**: Each tier (Data, Ingress, Builds, Compute) is validated independently in staging environments prior to production cutover.
3. **Instant Rollback Capability**: Ingress traffic routing can revert to legacy VM containers within sub-second propagation if post-migration health probes detect anomalies.

---

## 2. The 4-Phase Migration Architecture

```
PHASE 1: DATA & SECRETS       PHASE 2: EDGE INGRESS        PHASE 3: BUILD FARM          PHASE 4: COMPUTE CUTOVER
┌─────────────────────────┐   ┌────────────────────────┐   ┌────────────────────────┐   ┌────────────────────────┐
│ Decouple Database       │──►│ Deploy Envoy Cluster   │──►│ Launch Ephemeral ACI   │──►│ Migrate Workloads to   │
│ • Neon / Serverless PG  │   │ • Cloudflare CDN Proxy │   │ • Rootless Kaniko Farm │   │   Azure Container Apps │
│ • Dual-Write Migration  │   │ • xDS Dynamic Routing  │   │ • Zero Host VM Builds  │   │ • Scale-to-Zero (KEDA) │
│ • AES-256 Secret Vault  │   │ • Asset Skew R2 Rules  │   │ • Remote Turbo Cache   │   │ • Decommission Host VM │
└─────────────────────────┘   └────────────────────────┘   └────────────────────────┘   └────────────────────────┘
```

---

## 3. Prisma Schema Enhancements (`packages/db/prisma/schema.prisma`)

Whizan 2.0 requires database schema updates to support service archetypes, persistent volumes, multi-tier domains, and secret scopes.

```prisma
// packages/db/prisma/schema.prisma additions

enum ServiceArchetype {
  WEB_SERVICE
  PRIVATE_SERVICE
  QUEUE_WORKER
  CRON_JOB
}

enum SecretScope {
  PRODUCTION
  PREVIEW
  DEVELOPMENT
}

enum ScalingMetric {
  HTTP_CONCURRENCY
  CPU_UTILIZATION
  MEMORY_UTILIZATION
  REDIS_QUEUE_LENGTH
}

model Service {
  id              String           @id @default(uuid())
  slug            String           @unique
  name            String
  archetype       ServiceArchetype @default(WEB_SERVICE)
  minReplicas     Int              @default(0)
  maxReplicas     Int              @default(10)
  targetPort      Int              @default(8080)
  internalPort    Int              @default(8080)
  scalingMetric   ScalingMetric    @default(HTTP_CONCURRENCY)
  scalingThreshold Int             @default(50)
  autoSleep       Boolean          @default(true)
  drainWindowSec  Int              @default(30)
  healthCheckPath String           @default("/healthz")
  
  // Relations
  deployments     Deployment[]
  volumes         VolumeMount[]
  envVariables    ServiceEnvVariable[]
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
}

model VolumeMount {
  id          String   @id @default(uuid())
  name        String
  mountPath   String   // e.g. /app/data
  sizeGB      Int      @default(10)
  serviceId   String
  service     Service  @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
}

model ServiceEnvVariable {
  id          String      @id @default(uuid())
  key         String
  value       String      // Encrypted with AES-256-GCM
  scope       SecretScope @default(PRODUCTION)
  serviceId   String
  service     Service     @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  createdAt   DateTime    @default(now())

  @@unique([serviceId, key, scope])
}

model BuildFarmJob {
  id              String   @id @default(uuid())
  deploymentId    String   @unique
  externalJobId   String?  // Azure Container Instance ID
  status          String   @default("QUEUED") // QUEUED, PROVISIONING, BUILDING, PUSHING, READY, FAILED
  cpuAllocated    Float    @default(2.0)
  ramAllocatedGB  Float    @default(4.0)
  costIncurred    Float    @default(0.0)
  cacheHit        Boolean  @default(false)
  buildDurationSec Int?
  createdAt       DateTime @default(now())
  completedAt     DateTime?
}
```

---

## 4. Codebase-Specific Refactoring Playbook

### Component 1: Whizan API (`apps/api`)
1. **Azure SDK Integration**: Install `@azure/arm-appcontainers`, `@azure/arm-containerinstance`, and `@azure/identity`.
2. **Container Engine Service**: Replace direct Docker engine calls (`docker.createContainer()`) with the serverless provisioning service (`apps/api/src/services/container-engine.service.ts`).
3. **Database Client Switch**: Update Prisma connection strings to point to the serverless PostgreSQL cluster via PgBouncer pooled URLs.

### Component 2: Build Worker (`apps/build-worker`)
1. **Deprecate Local Docker CLI**: Remove local `exec('docker build ...')` execution from `service-worker.ts`.
2. **Ephemeral Orchestrator**: Update the BullMQ job consumer to invoke `launchEphemeralBuild()` via Azure Container Instances.
3. **Remote Log Forwarder**: Configure WebSocket and SSE log streaming listeners subscribing to Redis channel `build:logs:{deploymentId}`.

### Component 3: Edge Router (`apps/edge-router`)
1. **Envoy xDS Control Plane**: Refactor `edge-router` from a Node.js HTTP proxy into an Envoy dynamic control plane server implementing the **Route Discovery Service (RDS)** and **Cluster Discovery Service (CDS)** over gRPC.
2. **Static Asset Offloading**: Route all `/_next/static/*` and static asset queries directly to Cloudflare R2 bucket URLs.

---

## 5. Day-by-Day 14-Day Engineering Rollout Plan

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                        14-DAY PRODUCTION ROLLOUT SCHEDULE                     │
├────────────┬──────────────────────────────────────────────────────────────────┤
│ Days 1–3   │ Database & Data Decoupling                                       │
│            │ • Provision Neon Serverless PostgreSQL cluster & PgBouncer        │
│            │ • Execute Prisma schema migrations (Archetypes, Volumes, Scopes) │
│            │ • Replicate existing production database data with zero downtime │
├────────────┼──────────────────────────────────────────────────────────────────┤
│ Days 4–6   │ Ephemeral Build Farm Deployment                                  │
│            │ • Deploy Kaniko builder container to Azure Container Registry     │
│            │ • Refactor `apps/build-worker` to spin up ephemeral ACI jobs     │
│            │ • Validate build isolation: 50 concurrent builds on staging      │
├────────────┼──────────────────────────────────────────────────────────────────┤
│ Days 7–9   │ Envoy Ingress & Cloudflare Edge Offloading                       │
│            │ • Deploy Envoy Layer-7 Ingress cluster on Azure Container Apps   │
│            │ • Implement Cloudflare R2 static asset delivery & 48h skew rules │
│            │ • Configure xDS dynamic route discovery from Whizan Redis        │
├────────────┼──────────────────────────────────────────────────────────────────┤
│ Days 10–12 │ Serverless Compute Engine Cutover                                │
│            │ • Deploy customer backend services to Azure Container Apps       │
│            │ • Configure KEDA 0-to-N autoscaling rules & connection holding    │
│            │ • Perform canary traffic shifting: 10% ──► 50% ──► 100%          │
├────────────┼──────────────────────────────────────────────────────────────────┤
│ Days 13–14 │ Validation, Hardening & Legacy Decommissioning                   │
│            │ • Execute full disaster recovery simulations (PITR, OOM kill)    │
│            │ • Verify 99.99% availability and sub-1.2s cold start latency     │
│            │ • Safely decommission legacy Azure VM (`20.2.136.11`)            │
└────────────┴──────────────────────────────────────────────────────────────────┘
```

---

## 6. Pre-Flight Verification & Acceptance Testing Checklist

Before declaring the migration complete and decommissioning the legacy VM, all criteria below must be tested and verified:

- [ ] **Static Asset Speed**: Static assets serve from Cloudflare R2 with global TTFB < 10ms.
- [ ] **Asset Skew Immunity**: Rapid deployment cutover verified; active client sessions load old JavaScript chunks without `ChunkLoadError`.
- [ ] **Zero Host CPU Contention**: Concurrent execution of 10 Next.js builds causes **0.00% CPU increase** on running production web services.
- [ ] **True Scale-to-Zero**: Idle services scale to 0 replicas; incoming requests wake containers in < 1.5 seconds without dropped connections.
- [ ] **High Concurrency Health**: PgBouncer sustains 5,000 concurrent client queries without PostgreSQL memory errors.
- [ ] **Continuous PITR Functionality**: Database restore to a specific second 5 minutes prior successfully completes with 100% data fidelity.
- [ ] **Graceful Termination**: Deployments draining over a 30-second window complete active HTTP requests with 0 dropped packets.
