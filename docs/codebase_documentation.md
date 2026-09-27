# Whizan Cloud Service — Complete Codebase Architecture & Reference

> **Platform Overview:** Whizan Cloud Service (Hostify) is an open-source, full-stack Platform-as-a-Service (PaaS) inspired by Vercel and Supabase. It enables automated zero-configuration builds from GitHub, runs frontend (Static/SSR/Hybrid) and backend services (Node.js, Python, Go) in isolated Docker containers, features serverless scale-to-zero with instant cold starts, and streams logs in real time.

---

## 🗂️ Monorepo High-Level Topology

```
Whizan-cloud-service/
├── apps/
│   ├── api/             # Fastify REST Control Plane (Auth, Projects, Services, Admin)
│   ├── build-worker/    # BullMQ Workers (Docker builds, AppRunner, ServiceRunner, Scaler)
│   ├── edge-router/     # Node.js Reverse Proxy & WebSocket Gateway (Scale-to-Zero, Static files)
│   └── dashboard/       # Next.js 14 Web UI (Projects, Services, Admin, Live Logs)
├── packages/
│   ├── db/              # Prisma ORM Schema & PostgreSQL Client
│   ├── eslint-config/   # Shared linting configuration
│   ├── typescript-config/ # Shared tsconfig bases
│   └── ui/              # Shared component package
├── deploy/              # Cloud VM deployment automation & hardening scripts
├── docker-compose.yml   # Local dev infrastructure (PostgreSQL 16 + Redis 7)
└── turbo.json           # Turborepo task pipeline configuration
```

---

## 1. Database Tier — `packages/db`

The data tier is shared across services using Prisma ORM.

### Key Files:
- [`packages/db/prisma/schema.prisma`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/packages/db/prisma/schema.prisma)
  - **`User`**: User credentials (`email`, `passwordHash`), GitHub OAuth fields (`githubId`, `githubToken`), profile data.
  - **`RefreshToken`**: Opaque 48-byte cryptographically secure tokens with expiration dates for token rotation.
  - **`Project`**: Frontend project metadata. Tracks `slug` (used for `<slug>.localhost`), `githubRepoUrl`, `branch`, `buildCommand`, `installCommand`, `outputDir`, `framework` (`NEXTJS`, `REACT`, `VITE`, `ASTRO`, `CUSTOM`), and HMAC `webhookSecret`.
  - **`Deployment`**: Frontend deployment history. Tracks git commit, status (`QUEUED`, `BUILDING`, `READY`, `FAILED`, `CANCELLED`, `PAUSED`), `deploymentType` (`STATIC`, `SSR`, `HYBRID`), live `url`, and mapped `containerPort`.
  - **`EnvVariable`**: Project secrets stored as AES-256-GCM ciphertexts.
  - **`CustomDomain`**: Custom domains mapped to projects, with verification and SSL status.
  - **`ProjectAnalytics`**: Aggregated daily traffic: `pageViews`, `visitors`, `bandwidth` (bytes).
  - **`BackendService`**: Dedicated model for independent backend services. Stores execution `language` (`NODEJS`, `PYTHON`, `GO`, `DOCKERFILE`), `rootDir`, `installCommand`, `startCommand`, `internalPort`, `isPublic`, and `autoSleep`.
  - **`ServiceDeployment`**: Backend build execution records and mapped host port.
  - **`ServiceEnvVariable`**: Encrypted environment variables for backend services.
- [`packages/db/src/index.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/packages/db/src/index.ts): Exports `PrismaClient` and all Prisma types.

---

## 2. Control Plane API — `apps/api`

The control plane is built with **Fastify**, chosen for its extreme throughput and low latency.

### Configuration & Bootstrap
- [`apps/api/src/index.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/index.ts):
  - Starts background services: `startAnalyticsProcessor()`.
  - **Crash Recovery Routine**: Scans database on boot for deployments stuck in `BUILDING` or `QUEUED` due to a server crash or reboot, resetting them to `FAILED` with an explanatory message.
  - Configures CORS for local dev, Render, Vercel, and custom domains.
  - Mounts Fastify plugins: `@fastify/cookie`, `@fastify/jwt`, `@fastify/rate-limit` (Redis-backed, 100 req/min).
  - Registers routes under `/api/auth`, `/api/projects`, `/api/webhooks`, `/api/admin`, `/api/services`, and `/api/verify-domain`.

### Utilities & Middleware
- [`apps/api/src/middleware/auth.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/middleware/auth.ts):
  - Defines `requireAuth` preHandler and extends Fastify JWT types (`userId`, `email`).
- [`apps/api/src/lib/prisma.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/lib/prisma.ts):
  - Global singleton instance of `PrismaClient` preventing connection pool leaks during hot reloads.
- [`apps/api/src/lib/redis.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/lib/redis.ts):
  - Initializes main command client and dedicated subscriber client.
  - Helper functions: `registerDeployment()`, `unregisterDeployment()`, `getDeploymentInfo()`.
- [`apps/api/src/lib/crypto.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/lib/crypto.ts):
  - `encrypt(plaintext)`: Uses `aes-256-gcm` with a 96-bit random IV; outputs `iv:authTag:ciphertext`.
  - `decrypt(encoded)`: Reverses the cipher and authenticates tag.
  - `generateWebhookSecret()`: Generates 32-byte hex HMAC secrets.
- [`apps/api/src/lib/resource-cleaner.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/lib/resource-cleaner.ts):
  - Dispatches `STOP_CONTAINER` and `DELETE_CONTAINER` messages over the Redis `admin:commands` channel.
- [`apps/api/src/lib/analytics-processor.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/lib/analytics-processor.ts):
  - Runs every 30 seconds.
  - Drains up to 1,000 raw access events from the `analytics:buffer` Redis list.
  - Filters out static asset extensions (`.js`, `.css`, images) to accurately identify real page views and unique visitor IPs.
  - Upserts aggregated records into the `ProjectAnalytics` PostgreSQL table.

### API Routes
- [`apps/api/src/routes/auth.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/routes/auth.ts):
  - `POST /register`: Hashes password with bcrypt (12 rounds), issues short-lived JWT (15 min) and sets 7-day HttpOnly cookie.
  - `POST /login`: Validates credentials, issues tokens.
  - `POST /refresh`: Verifies refresh token in DB, rotates it (deletes old, generates new), returns new JWT.
  - `POST /logout`: Invalidates refresh token in DB and clears cookie.
  - `GET /me`: Returns profile of authenticated user.
- [`apps/api/src/routes/projects.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/routes/projects.ts):
  - `GET /`: Lists user's projects with their latest deployment.
  - `POST /`: Creates project; ensures slug uniqueness across projects and backend services (appends user hash or random string on conflict).
  - `GET /:id`: Retrieves project details and recent deployments.
  - `GET /:id/analytics`: Retrieves last 30 days of traffic analytics.
  - `PATCH /:id`: Updates build settings.
  - `DELETE /:id`: Full cascade deletion: stops containers, purges build directories, deletes Redis routing keys, removes project from database.
  - `GET|POST|DELETE /:id/domains`: Custom domain attachment and verification.
  - `GET /api/verify-domain`: Endpoint used by Caddy on-demand TLS to verify if incoming domain is authorized.
- [`apps/api/src/routes/deployments.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/routes/deployments.ts):
  - `GET /:id/deployments`: Lists project deployments, enriching active SSR deployments with `lastAccessed` timestamp from Redis (`access:deploymentId`).
  - `POST /:id/deployments`: Triggers a deployment by adding a job to BullMQ `build` queue. Prevents overlapping builds.
  - `POST /:id/deployments/:dId/cancel`: Signals build worker via Redis Pub/Sub (`cancel:deploymentId`) to kill Docker container.
  - `POST /:id/deployments/:dId/pause`: Stops SSR container to free RAM/CPU/ports without deleting build artifacts.
  - `POST /:id/deployments/:dId/resume`: Re-queues deployment to restart container from cached build.
  - `DELETE /:id/deployments/:dId`: Cleans up container, build files, and Redis logs.
  - `GET /deployments/:dId/logs`: Real-time Server-Sent Events (SSE) stream. Replays historical logs from Redis list (`build-logs:dId`) and subscribes to Redis channel (`logs:dId`).
- [`apps/api/src/routes/github.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/routes/github.ts):
  - **GitHub OAuth Integration**:
    - `GET /auth-url`: Returns OAuth authorization URL requesting `repo` and `read:user` scopes.
    - `GET /auth/github/callback`: Exchanges OAuth authorization code for an access token, encrypts token using AES-256-GCM, and updates user profile in DB.
    - `GET /status`: Returns GitHub connection status and account username/avatar.
    - `GET /repos`: Fetches all accessible GitHub repositories (including private repos) with search filtering, language tags, and default branch metadata.
    - `GET /branches`: Fetches git branches for a specific repository.
    - `POST /disconnect`: Revokes and deletes stored GitHub OAuth access token.
- [`apps/api/src/lib/github-utils.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/lib/github-utils.ts):
  - `getAuthenticatedGitUrl()`: Formats clone URLs by injecting decrypted access tokens (`https://x-access-token:${githubToken}@github.com/owner/repo.git`), allowing automated, seamless cloning of private GitHub repositories without SSH keys or prompt timeouts.
- [`apps/api/src/routes/env.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/routes/env.ts):
  - `GET /:id/env`: Lists environment variables (masks secret values with `***`).
  - `POST /:id/env`: Encrypts value with AES-256-GCM and upserts record.
  - `DELETE /:id/env/:key`: Deletes variable.
- [`apps/api/src/routes/webhooks.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/routes/webhooks.ts):
  - `POST /github`: Verifies GitHub push payload against HMAC SHA-256 signature (`X-Hub-Signature-256`) using project's `webhookSecret`, extracts branch and commit, queues build.
- [`apps/api/src/routes/services.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/routes/services.ts):
  - Manages independent backend services (Node.js, Python, Go, Dockerfile).
  - `POST /deploy`: Pushes job to BullMQ `service-build` queue with authenticated git clone URL.
  - Handles backend-specific AES encrypted environment variables and live SSE logs.
- [`apps/api/src/routes/admin.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/routes/admin.ts):
  - System-wide administration.
  - `GET /stats`: Reads live VM telemetry (`vm:stats`) published by worker.
  - `GET /storage`: Scans workspace disk storage, listing build caches, artifact folders, and backend service files.
  - `DELETE /storage/purge`: Flushes cached `node_modules` and `.next/cache` directories.
  - `POST /deployments/:id/stop` & `DELETE /deployments/:id`: Dispatches container lifecycle commands.
  - `DELETE /containers/:id`: Force-kills orphaned Docker containers.
  - `GET /containers/:id/logs`: RPC-over-Redis to fetch stdout/stderr of running Docker containers.
  - `WS /terminal`: Real-time interactive web shell bridge into active containers.
  - `GET /database/stats`: Queries Postgres size/connections and Redis memory usage.

---

## 3. Build & Execution Tier — `apps/build-worker`

The build worker handles repository cloning, Docker container orchestration, log streaming, scale-to-zero enforcement, and VM monitoring.

### Core Files
- [`apps/build-worker/src/worker.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/worker.ts):
  - **Concurrency**: Operates with a concurrency of 1 to ensure reproducible, predictable builds.
  - **Frontend Pipeline**:
    1. Sets status to `BUILDING`.
    2. Subscribes to Redis cancel channel (`cancel:deploymentId`).
    3. Shallow clones repository branch (`--depth=1`).
    4. Decrypts environment variables.
    5. Calls `runBuild()` inside an isolated Docker container.
    6. Runs `analyzeOutput()` to classify output (`STATIC`, `SSR`, or `HYBRID`).
    7. If SSR or Hybrid: invokes `AppRunner.startApp()` on a dynamic port.
    8. Registers route in Redis (`deployment:slug`).
    9. Updates DB status to `READY`.
    10. **Zero-downtime cleanup**: Kills previous deployment containers for this project, cleans old directories, deletes obsolete DB rows.
  - **Scale-to-Zero Idle Scaler**: Sweeps every 60 seconds:
    - If an SSR deployment is idle for > 10 minutes (`Date.now() - access:deploymentId > 10m`), stops the container, strips `containerPort` from Redis and DB.
    - If a Backend Service has `autoSleep: true` and is idle for > 15 minutes, stops the container and clears the port.
  - **Wakeup Listener**: Subscribes to Redis `wakeup` channel; receives cold-start requests from the Edge Router and starts containers immediately.
  - **Admin Command Handler**: Subscribes to `admin:commands` (kills containers, deletes files, restarts PM2 daemons).
  - **VM Health Reporter**: Runs every 15 seconds. Computes multi-core CPU usage, RAM breakdown, disk space (`fs.statfs`), Docker container CPU/RAM metrics, and BullMQ queue sizes, publishing everything to `vm:stats` in Redis.
- [`apps/build-worker/src/docker-runner.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/docker-runner.ts):
  - Executes builds in `node:20-slim`.
  - Sets `NODE_OPTIONS="--max_old_space_size=2048"`.
  - Automatically appends `--no-fund --no-audit` to `npm install`.
  - **Cache Optimization**: Mounts `/opt/whizan-cache/{projectId}/npm` to `/root/.npm` and `.../next` to `/app/.next/cache` for accelerated incremental builds.
  - **Networking Hardening**: Uses `NetworkMode: "host"` to resolve cloud provider MTU packet-drop bugs.
  - **Security**: Drops all Linux capabilities (`CapDrop: ["ALL"]`).
  - Demuxes Docker stream into stdout and stderr, streaming lines to Redis.
- [`apps/build-worker/src/output-analyzer.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/output-analyzer.ts):
  - Detects application structure:
    - **Hybrid**: `.next/standalone` present (server entry: `.next/standalone/server.js`, static dir: `.next/static`).
    - **SSR**: `.next/server` present without standalone.
    - **Static**: `out`, `dist`, or `build` folders present (Vite, React SPA, Astro, Next static export).
- [`apps/build-worker/src/app-runner.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/app-runner.ts):
  - Manages persistent Docker containers for SSR apps.
  - Finds a free host port using ephemeral TCP sockets.
  - Mounts build output as **read-only** (`:ro`) for security.
  - Sets 256MB memory cap.
  - Actively polls container port with TCP connect checks until healthy.
- [`apps/build-worker/src/service-worker.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/service-worker.ts):
  - BullMQ consumer for the `service-build` queue.
  - Clones backend repos (handles GitHub access tokens).
  - Hands execution to `ServiceRunner`.
  - Registers routing in Redis and listens to `wakeup` events for backend cold starts.
- [`apps/build-worker/src/service-runner.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/service-runner.ts):
  - Selects runtime image: `node:20-slim`, `python:3.11-slim`, `golang:1.21-alpine`.
  - Maps internal port to free host port.
  - Attaches container to global Docker network `whizan-internal-network` with alias `[slug]`.
  - Allows frontends to call internal backends directly via DNS (e.g. `http://api-service:8000`).
  - Streams logs via Redis and validates readiness using HTTP health checks.
- [`apps/build-worker/src/log-streamer.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/log-streamer.ts):
  - Pushes logs to a Redis list (`build-logs:deploymentId`, 24h TTL) and broadcasts over Pub/Sub channel (`logs:deploymentId`).
- [`apps/build-worker/src/router-registrar.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/router-registrar.ts):
  - Sets and deletes `deployment:<slug>` in Redis.
- [`apps/build-worker/src/crypto.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/crypto.ts):
  - AES-256-GCM decrypt helper matching the API's encryption key.

---

## 4. Edge Routing & Data Plane — `apps/edge-router`

The edge router is a lightweight, high-performance reverse proxy that intercepts all incoming web traffic on ports 80/8080.

### Key File:
- [`apps/edge-router/src/index.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/edge-router/src/index.ts):
  - **Subdomain Extraction**: Resolves incoming `Host` header to slug (e.g., `app.localhost:8080` → `app`).
  - **Redis Lookups**: Queries `deployment:<slug>` without querying the database.
  - **Static Serving**: For `type: "static"`, serves files directly from disk using `serve-static` with zero container overhead.
  - **Hybrid Routing**:
    - Static paths (`/_next/static/*`, images, css, js) are served from disk.
    - Dynamic paths are proxied to the container's mapped port.
  - **Scale-to-Zero & Cold Starts**:
    - If `containerPort` is missing (asleep), returns HTTP 202 with an auto-refreshing, animated HTML screen ("Waking up...").
    - Publishes a `wakeup` message to Redis with the deployment metadata.
    - The HTML page pings `window.location.href` via `HEAD` requests with exponential backoff until the container is ready, then automatically refreshes into the app.
  - **WebSocket Proxying (`server.on("upgrade")`)**:
    - Proxies `wss://` connections directly to the container for Next.js HMR, Socket.io, etc.
    - If container is asleep during a WebSocket request, sends HTTP 503 (`Retry-After: 3`), fires a `wakeup` signal, and prompts the client to auto-reconnect.
  - **Analytics Collection**: Measures response `bytesSent` and logs requests to `analytics:buffer` in Redis.

---

## 5. Frontend Dashboard — `apps/dashboard`

Built with **Next.js 14 (App Router)** and TailwindCSS.

### Architecture & State
- [`apps/dashboard/lib/api.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/lib/api.ts):
  - Centralized, strongly typed HTTP client.
  - Handles automatic access token refresh on HTTP 401.
  - Manages API calls for Auth, Projects, Deployments, Environment Variables, Custom Domains, Admin, and Backend Services.
  - Includes `streamLogs(deploymentId)` returning an `EventSource`.
- [`apps/dashboard/lib/auth.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/lib/auth.tsx):
  - Auth context providing `user`, `loading`, `login()`, `register()`, `logout()`.
- [`apps/dashboard/lib/pipeline.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/lib/pipeline.ts):
  - Visual pipeline state machine: `Queued` → `Clone` → `Install` → `Build` → `Publish` → `Live`.
  - Infers current step by parsing build logs in real time.

### Components & Shared Modules
- [`apps/dashboard/components/github-repo-picker.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/components/github-repo-picker.tsx):
  - GitHub integration component offering one-click OAuth login, repository search/filtering, public vs. private indicators, branch selection dropdown, manual repository URL fallback, and account disconnect controls.
- [`apps/dashboard/components/deploy-pipeline.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/components/deploy-pipeline.tsx):
  - Interactive, step-by-step horizontal deployment progress visualizer (`QUEUED` $\rightarrow$ `CLONE` $\rightarrow$ `INSTALL` $\rightarrow$ `BUILD` $\rightarrow$ `PUBLISH` $\rightarrow$ `READY`).
  - Animated glowing state indicators with real-time SSE build log terminal streaming.

### Pages & Routes
- [`apps/dashboard/app/dashboard/layout.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/app/dashboard/layout.tsx):
  - Sidebar layout, theme switcher (dark/light), session verification.
- **Service Deployment Selection**:
  - [`app/dashboard/deploy/page.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/app/dashboard/deploy/page.tsx): Multi-service deployment entry point allowing users to choose between Frontend Web App / Static Site or Dedicated Backend API Service.
- **Projects / Frontend Hosting**:
  - `page.tsx`: Overview of user projects, current status, recent deployments.
  - `projects/new/page.tsx`: Project creation wizard integrated with `GitHubRepoPicker`, framework auto-detection, and customizable build settings.
  - `projects/[id]/page.tsx`: Project settings, environment variables manager, custom domain setup, traffic analytics charts.
  - `projects/[id]/deployments/page.tsx`: Deployment history, pause/resume/rollback controls, real-time log terminal.
  - `projects/[id]/deployments/[dId]/page.tsx`: Interactive deployment build tracker with glowing node states and real-time execution logs.
- **Backend Services**:
  - [`app/dashboard/backend/page.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/app/dashboard/backend/page.tsx): Services catalog, active vs asleep status badges, language tags.
  - `backend/new/page.tsx`: Backend service creation wizard supporting GitHub private/public repository import and framework runtime presets.
  - `backend/[id]/page.tsx`: Service details, command configuration, encrypted variables, manual deploy trigger, live container logs.
- **Admin Control Center**:
  - [`app/dashboard/admin/page.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/app/dashboard/admin/page.tsx): Live VM health dashboard (CPU, Memory, Disk, BullMQ queue, Docker containers).
  - `admin/containers/page.tsx`: Inspect running Docker containers, view container logs via Redis RPC, force-kill containers, launch live web shell terminal.
  - `admin/storage/page.tsx`: Deep directory explorer and build cache manager for viewing workspace files, cached dependencies, and purging build artifacts.
  - `admin/database/page.tsx`: PostgreSQL size & connection metrics, Redis memory utilization.

---

## 6. Infrastructure & Deployment — `deploy/`

- [`deploy/setup-droplet.sh`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/deploy/setup-droplet.sh):
  - Automated provisioning script for Ubuntu 24.04 VMs (Azure / DigitalOcean).
  - Purges rogue web servers (Nginx/Apache/Caddy) to prevent port 80 hijacking.
  - Creates a 4GB Swapfile to protect against OOM crashes during heavy Next.js builds.
  - Installs Docker, Node.js 20, PM2, and sets up systemd service locks.
- [`docs/vm_deployment_guide.md`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/vm_deployment_guide.md):
  - Outlines VM hardening rules.
  - Explains the `ecosystem.config.cjs` anti-pattern and why raw `tsx` binaries wrapped with `set -a && source .env` must be used to prevent 99% CPU zombie loops.

---

## 7. Complete Request & Build Lifecycle Flow

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    actor Visitor as Web User
    participant Dash as Dashboard (Next.js)
    participant API as API Server (Fastify)
    participant Redis as Redis (Queue & Cache)
    participant Worker as Build Worker
    participant Docker as Docker Daemon
    participant Router as Edge Router

    %% Build Phase
    Dev->>Dash: Click "Deploy" (or Git Push)
    Dash->>API: POST /api/projects/:id/deployments
    API->>Redis: Enqueue job to BullMQ ("build")
    Worker->>Redis: Consume "build" job
    Worker->>Worker: Git clone repository
    Worker->>Docker: Run build container (node:20-slim)
    Docker-->>Worker: Stream build logs
    Worker->>Redis: Publish logs (Pub/Sub & List)
    Redis-->>Dash: Stream logs via SSE
    Worker->>Worker: Output Analyzer (detect static vs hybrid)
    Worker->>Docker: Start SSR Container (if hybrid)
    Worker->>Redis: Set deployment:slug mapping
    Worker->>API: Mark deployment READY

    %% Traffic Phase (Scale-to-Zero)
    Visitor->>Router: GET http://my-app.localhost:8080
    Router->>Redis: Lookup deployment:my-app
    alt Container Active
        Router->>Docker: Proxy request to containerPort
        Docker-->>Visitor: 200 OK HTML
    else Container Asleep
        Router->>Redis: Publish "wakeup" event
        Router-->>Visitor: 202 HTML ("Waking up..." screen)
        Redis-->>Worker: Intercept "wakeup" event
        Worker->>Docker: docker start container
        Visitor->>Router: Auto-refresh ping (200 OK ready)
        Router->>Docker: Proxy request to new port
        Docker-->>Visitor: 200 OK App
    end
```
