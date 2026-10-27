# 09: EXHAUSTIVE FAILURE SCENARIOS & EDGE CASE MATRIX

---

## 1. Matrix Overview & Reliability Objectives

This specification details the failure modes, edge cases, and self-healing mechanisms engineered into Whizan 2.0. Every failure scenario is contrasted against Whizan 1.0’s historical behavior to document the platform upgrade.

### Target Platform Reliability Metrics
- **Platform Availability**: 99.99% Uptime across all customer services.
- **Recovery Time Objective (RTO)**: Sub-second to <15 seconds for automated container recovery; <2 minutes for full database failover.
- **Recovery Point Objective (RPO)**: 0 seconds for compute; <1 second for relational database transactions via continuous WAL streaming.

---

## 2. Category 1: Ephemeral Builds & CI/CD Pipeline

| ID | Failure Scenario / Edge Case | Whizan 1.0 Failure Behavior | Whizan 2.0 Architectural Resolution | RTO / Target |
| :--- | :--- | :--- | :--- | :--- |
| **B-01** | **Fork Bomb / CPU Exhaustion in User Build** (e.g. recursive macro or infinite compiler loop) | Consumes 100% of VM host CPUs (`20.2.136.11`). Live production services throttle, timeout, and crash. | Build executes in an isolated ACI container with hard cgroup CPU limits (2 vCPUs). Live services experience 0.00% CPU interference. Watchdog kills build after 15m. | Isolated instantly; 0s impact on live traffic |
| **B-02** | **Compiler Out-Of-Memory (OOM)** during Next.js or Rust compilation | Linux kernel OOM killer triggers on VM, arbitrarily terminating production containers, PgBouncer, or edge router. | Dedicated 4 GB/8 GB RAM ceiling on ephemeral build pod. OOM killer terminates only the build container; logs clean error message to user dashboard. | Isolated instantly; 0s impact on live traffic |
| **B-03** | **Malicious Cryptomining in Build Scripts** (`npm postinstall` runs xmrig) | Miner saturates host CPU indefinitely, incurring heavy cloud bills and degrading all customer containers. | Network egress firewall blocks all crypto-pool protocols (Stratum). Ephemeral sandbox destroys container at 15m timeout. Threat detection flags account. | Blocked at egress; 0s impact |
| **B-04** | **Corrupt / Poisoned Build Cache Archive** (Zstandard tarball corrupted in transit) | Unhandled extraction failure crashes build worker process, stalling all subsequent queued customer deployments. | SHA-256 integrity checksum verification before extraction. If checksum fails, cache is discarded, fresh build proceeds, and bad cache key is deleted from R2. | Automated fallback in <200ms |
| **B-05** | **Disk Full During Large Image Extraction** (Docker root partition reaches 100%) | VM host crashes completely. Read-only filesystem triggers, preventing all databases and services from writing. | Ephemeral build instances boot with independent 50 GB NVMe scratch disks. Host VM has no shared build partition. | Zero disk impact on production nodes |

---

## 3. Category 2: Ingress, Load Balancing & Routing

| ID | Failure Scenario / Edge Case | Whizan 1.0 Failure Behavior | Whizan 2.0 Architectural Resolution | RTO / Target |
| :--- | :--- | :--- | :--- | :--- |
| **I-01** | **Host TCP Port Collision** (`findFreePort` race condition under concurrent builds) | Second container fails to bind with `EADDRINUSE`. Deployment marks failed or overwrites existing service. | Host port hunting eliminated. All containers listen on internal port 8080 within isolated network namespaces via virtual CNI. | 0s (Physically impossible to collide) |
| **I-02** | **Massive DDoS Spike** (Layer-7 HTTP flood of 500,000 req/sec) | Node.js edge-router event loop freezes. Single VM network interface saturates. Complete service outage. | Cloudflare Anycast edge absorbs volumetric flood. Rate-limiting rules trigger before requests reach application compute. | Absorbed at edge; <10ms |
| **I-03** | **Unhealthy Deployment Cutover** (App boots but returns 500 on all routes) | Whizan 1.0 router immediately switches traffic to new container; users receive instant 500 downtime. | Deep HTTP readiness probe (`/healthz`) must return 200 for 3 consecutive checks before Envoy updates route weights. | Old version continues serving 100% traffic |
| **I-04** | **Abrupt Container Crash Under Live Traffic** (Unhandled exception `process.exit(1)`) | Edge router sends requests to dead container, returning 502 Bad Gateway until manual intervention. | Envoy outlier detection detects 5xx threshold, isolates dead replica in <50ms, and retries in-flight request on healthy replica. | Sub-50ms self-healing reroute |
| **I-05** | **Slow Memory Leak in Web Service** (Container memory increases over 48 hours) | VM memory slowly exhausts until kernel panics or kills arbitrary processes. | KEDA memory threshold and ACA restarts container when memory exceeds 90% allocation, routing around it during restart. | Zero-downtime rolling restart |

---

## 4. Category 3: Frontend & Server-Side Rendering (SSR)

| ID | Failure Scenario / Edge Case | Whizan 1.0 Failure Behavior | Whizan 2.0 Architectural Resolution | RTO / Target |
| :--- | :--- | :--- | :--- | :--- |
| **F-01** | **Client-Side Asset Skew Error** (User loads v1 HTML, requests chunk after v2 deployment) | Container v1 is terminated. Chunk request returns 404/502. Application crashes with `Loading chunk failed`. | Immutable static assets retained in Cloudflare R2 for 48 hours with wildcard path resolution across historical deployments. | 100% eliminated (0 chunk errors) |
| **F-02** | **Dynamic Route Export Failure** (`output: export` on dynamic `[id]` pages) | Next.js build fails during `generateStaticParams` compilation or exports broken HTML. | AI analyzer detects dynamic routes and Server Actions, automatically enforcing `output: standalone` with serverless SSR runtime. | Automatically corrected during Phase 1 |
| **F-03** | **Distributed Next.js ISR Desynchronization** (Multiple replicas serve stale content) | Each container caches pages in local RAM; users get inconsistent versions depending on which container they hit. | Distributed `@whizan/next-cache-handler` backed by shared Redis cluster and Cloudflare R2; single tag invalidation purges all nodes. | Instant multi-region consistency (<5ms) |
| **F-04** | **Massive Surge in Static Asset Traffic** (Viral image or CSS file requests) | Saturated host VM CPU and proxy bandwidth; dynamic API requests starve. | 100% of static assets served directly by Cloudflare CDN and R2; zero requests hit compute containers ($0.00 compute spend). | Infinite edge scale; <10ms TTFB |

---

## 5. Category 4: Backend Microservices & Workers

| ID | Failure Scenario / Edge Case | Whizan 1.0 Failure Behavior | Whizan 2.0 Architectural Resolution | RTO / Target |
| :--- | :--- | :--- | :--- | :--- |
| **W-01** | **Dropped In-Flight Requests During Redeploy** (Active POST /checkout aborted) | Abrupt 5-second `SIGKILL` cuts TCP connections mid-transaction, leaving orphan database records. | 30s–120s configurable `SIGTERM` drain window; Envoy ceases routing new requests while existing requests finish cleanly. | 0 dropped requests |
| **W-02** | **Headless Worker Treated as HTTP Web Service** (BullMQ/Celery worker deployed) | System attempts to probe port 3000, fails probe, marks worker `FAILED`, and enters infinite crash loop. | Explicit `Worker` archetype with `internalPort: 0` and `isWorker: true`; health monitored via PID heartbeat rather than HTTP. | Clean lifecycle management |
| **W-03** | **Sudden Queue Backlog Spike** (Queue jumps from 10 to 50,000 pending jobs) | Single worker container processes sequentially at slow pace, taking hours to recover. | KEDA Redis/RabbitMQ scaler detects backlog, immediately spinning up replicas from 1 to 30 workers in parallel. | Scales out within 12 seconds |
| **W-04** | **Loopback Binding Trap** (Application binds to `127.0.0.1` instead of `0.0.0.0`) | Container boots successfully but ingress proxy cannot connect; continuous 502 Bad Gateway. | Automated AI workspace analyzer detects and patches binding to `0.0.0.0`; pre-deployment linter enforces compliance. | Prevented pre-flight |

---

## 6. Category 5: Databases & Persistence

| ID | Failure Scenario / Edge Case | Whizan 1.0 Failure Behavior | Whizan 2.0 Architectural Resolution | RTO / Target |
| :--- | :--- | :--- | :--- | :--- |
| **D-01** | **Host VM Hard Disk Corruption / Deprovisioning** | All customer databases running on local VM storage are permanently lost. | Storage decoupled from compute. Neon / Azure 3x replicated storage + continuous WAL streaming to Cloudflare R2. | RPO < 1s; RTO < 2m |
| **D-02** | **Serverless Connection Spike** (500 serverless functions query Postgres at once) | Postgres exhausts memory, throws `FATAL: too many connections`, and crashes. | Built-in PgBouncer transaction pooling accepts 10,000+ client connections, multiplexing them across 20 backend connections. | Zero connection crashes |
| **D-03** | **Accidental `DROP TABLE` in Production** | Requires restoring old daily dump; all subsequent transactions created that day are lost. | Point-In-Time-Recovery (PITR) replays WAL logs up to the exact millisecond before the `DROP TABLE` command was executed. | RPO = 0 seconds lost; RTO < 5m |
| **D-04** | **Container Redeployment on SQLite App** (PocketBase or Ghost CMS redeployed) | Container destruction wipes local SQLite database file; all user data vanishes. | Decoupled persistent SSD volume mounted at `/app/data` persists across deployments + continuous Litestream sync to R2. | Zero data loss across deployments |

---

## 7. Category 6: Networking, DNS & Security

| ID | Failure Scenario / Edge Case | Whizan 1.0 Failure Behavior | Whizan 2.0 Architectural Resolution | RTO / Target |
| :--- | :--- | :--- | :--- | :--- |
| **S-01** | **PR Preview Branch Leaks Production Database Secrets** | PR preview uses production environment variables; untested code drops production tables. | Strict 3-tier secret scoping (`PRODUCTION`, `PREVIEW`, `DEVELOPMENT`). PR previews automatically receive isolated mock credentials. | 100% scope isolation |
| **S-02** | **SSL Certificate Expiration / Wildcard Renewal Failure** | Handled by manual Let's Encrypt cron on VM; failure invalidates HTTPS for all customer domains. | Cloudflare Zero-Maintenance Wildcard SSL + automated edge certificate management with 90-day rolling renewals. | 100% automated uptime |
| **S-03** | **Privilege Escalation via Container Breakout** (Container attempts root exploit) | Containers run as root (`UID 0`) on shared host VM kernel; compromised container can compromise host. | Strict `runAsNonRoot: true` enforced on all workloads; non-root user `whizan (UID 1001)` enforced in all synthesized images. | Root execution blocked |
