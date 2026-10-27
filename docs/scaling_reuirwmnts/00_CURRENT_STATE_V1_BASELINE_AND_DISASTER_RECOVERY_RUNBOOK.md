# 00: CURRENT STATE V1 BASELINE & DISASTER RECOVERY RUNBOOK

---

## 1. Non-Disruption Covenant & Architectural Isolation

> [!IMPORTANT]
> **Preservation Directive**: The existing Whizan 1.0 deployment is the active production baseline. 
> To guarantee 100% platform continuity:
> 1. **Zero Modifications to Active v1 Infrastructure**: All existing live servers, databases, DNS entries, and daemon processes documented herein must remain completely undisturbed.
> 2. **Clean-Room Separation for v2**: Whizan 2.0 will be architected and deployed in a separate repository and isolated cloud infrastructure.
> 3. **Instant Rollback Guarantee**: If any future service migration or experiment fails, this runbook contains the exact, deterministic instructions, configurations, schemas, and start commands required to restore Whizan 1.0 to full operational status in minutes.

---

## 2. Whizan 1.0 Live System Topology & Active Endpoints

```
                                  ┌───────────────────────────────┐
                                  │   Cloudflare Wildcard DNS     │
                                  │        *.whizan.cloud         │
                                  └───────────────┬───────────────┘
                                                  │
                 ┌────────────────────────────────┼────────────────────────────────┐
                 │ HTTPS (443)                    │ HTTPS (443)                    │ HTTP (80) / HTTPS (443)
                 ▼                                ▼                                ▼
┌─────────────────────────────────┐ ┌───────────────────────────┐ ┌──────────────────────────────────┐
│ Web Dashboard                   │ │ Control Plane API         │ │ Azure Compute Worker Host        │
│ https://dashboard.whizan.cloud  │ │ https://api.whizan.cloud  │ │ IP: 20.2.136.11                  │
│                                 │ │                           │ │ Base: whizan.cloud               │
└─────────────────────────────────┘ └─────────────┬─────────────┘ └────────────────┬─────────────────┘
                                                  │                                │
                                                  ▼                                ▼
                 ┌─────────────────────────────────────────────────────────────────┴───────────────┐
                 │ Managed Cloud Backing Services                                                  │
                 │ • Database: Supabase PostgreSQL 16 (AWS Tokyo: aws-0-ap-northeast-1)            │
                 │   - Pooled Port 6543 (PgBouncer): postgres.fdwstppklgibuwqjrusf...              │
                 │   - Direct Port 5432: postgres.fdwstppklgibuwqjrusf...                         │
                 │ • Cache / Message Queue: Upstash Redis (TLS: saved-ox-192841.upstash.io:6379)  │
                 │ • AI Engine: Google Gemini Flash / Pro (Rotation Keys: GEMINI_API_KEY_1..5)     │
                 │ • Object Storage: Supabase Storage / Cloudflare R2                              │
                 └─────────────────────────────────────────────────────────────────────────────────┘
```

### Live Canonical Production Endpoints
- **Web Dashboard**: `https://dashboard.whizan.cloud`
- **Control Plane API**: `https://api.whizan.cloud`
- **Customer Web Projects & Services**: `https://<slug>.whizan.cloud`
- **Serverless Edge Functions**: `https://<slug>.whizan.cloud/<path>`
- **Base Domain**: `whizan.cloud`
- **VM Compute Node**: `20.2.136.11` (Ubuntu 24.04 LTS on Azure)
- **PostgreSQL Pooler (PgBouncer)**: `aws-0-ap-northeast-1.pooler.supabase.com:6543`
- **PostgreSQL Direct (DDL / Migrations)**: `aws-0-ap-northeast-1.pooler.supabase.com:5432`
- **Redis Queue**: `rediss://saved-ox-192841.upstash.io:6379`

---

## 3. Azure VM Host Configuration (`20.2.136.11`)

### Hardware & Operating System Specs
- **Cloud Provider**: Microsoft Azure
- **Instance Size**: `Standard_B2s` (2 vCPUs, 4 GB RAM)
- **Operating System**: Ubuntu 24.04 LTS (Linux 6.8.x x86_64)
- **Swap Space**: 4 GB configured at `/swapfile` (Mandatory to prevent OOM panics during builds)
- **User Accounts**: `azureuser` (Sudoer), `root`

### Directory Layout on VM
```
/opt/whizan/
├── apps/
│   ├── api/                  # Fastify API (Local fallback / VM backup)
│   ├── build-worker/         # BullMQ build worker (Cloning, compilation, Dockerode)
│   ├── cron-scheduler/       # Cron runner daemon
│   ├── dashboard/            # Next.js dashboard files
│   ├── edge-router/          # Reverse proxy (Port 80)
│   ├── flow-engine/          # Workflow runner
│   └── function-runtime/     # V8 / Edge TypeScript runtime
├── packages/
│   ├── cli/                  # Whizan CLI
│   ├── db/                   # Prisma ORM & client
│   └── mcp-devops/           # MCP DevOps server
├── repos/                    # Active source code repositories (/opt/whizan/repos)
├── sources/                  # Uploaded source archives (/opt/whizan/sources)
├── volumes/                  # Managed database persistent volumes (/opt/whizan/volumes)
├── .env.production           # Production environment variables file
├── package.json              # Monorepo root manifest
└── node_modules/             # Installed dependencies
/opt/whizan-builds/           # Persistent build artifacts cache
/var/log/whizan/              # Application runtime log files
```

### Firewall (UFW) Configuration
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp          # SSH administration
sudo ufw allow 80/tcp          # Edge Router HTTP Ingress
sudo ufw allow 443/tcp         # Edge Router HTTPS Ingress
sudo ufw allow 15000:20000/tcp # Managed Database External Ports (Postgres/MySQL/Redis)
sudo ufw enable
```

---

## 4. Master Start Commands & Process Supervisor (PM2)

> [!CAUTION]
> **Never use `ecosystem.config.cjs` or `npx` with PM2**. 
> As documented in `docs/vm_deployment_guide.md`, `npx` triggers background `npm exec` wrappers that loop infinitely upon VM crash, causing a **99% CPU freeze**.
> Always invoke raw binaries directly via `/opt/whizan/node_modules/.bin/tsx` and wrap each launch in `bash -c "set -a && source /opt/whizan/.env.production"`.

### The Master PM2 Initialization Sequence (Root Execution)
Execute these exact commands on the VM as `root` (or via `sudo bash`):

```bash
# 1. Clean zombie processes and purge competing web servers
sudo systemctl stop nginx apache2 caddy || true
sudo apt-get purge nginx apache2 caddy -y
sudo apt-get autoremove -y
sudo pm2 kill
sudo killall -9 node npm npx tsx || true

# 2. Launch Edge Router on Port 80
sudo bash -c "set -a && source /opt/whizan/.env.production && pm2 start /opt/whizan/node_modules/.bin/tsx --name 'edge-router' --cwd /opt/whizan/apps/edge-router -- src/index.ts"

# 3. Launch Build Worker (BullMQ + Dockerode)
sudo bash -c "set -a && source /opt/whizan/.env.production && pm2 start /opt/whizan/node_modules/.bin/tsx --name 'build-worker' --cwd /opt/whizan/apps/build-worker -- src/worker.ts"

# 4. Launch Function Runtime (V8 Serverless Micro-Endpoints)
sudo bash -c "set -a && source /opt/whizan/.env.production && pm2 start /opt/whizan/node_modules/.bin/tsx --name 'whizan-functions' --cwd /opt/whizan/apps/function-runtime -- src/index.ts"

# 5. Launch Cron Scheduler Daemon
sudo bash -c "set -a && source /opt/whizan/.env.production && pm2 start /opt/whizan/node_modules/.bin/tsx --name 'whizan-cron' --cwd /opt/whizan/apps/cron-scheduler -- src/index.ts"

# 6. Launch Flow Engine (Workflow Automations)
sudo bash -c "set -a && source /opt/whizan/.env.production && pm2 start /opt/whizan/node_modules/.bin/tsx --name 'whizan-flow' --cwd /opt/whizan/apps/flow-engine -- src/index.ts"

# 7. (Optional Fallback) Launch API on VM Port 8000
sudo bash -c "set -a && source /opt/whizan/.env.production && pm2 start /opt/whizan/node_modules/.bin/tsx --name 'whizan-api' --cwd /opt/whizan/apps/api -- src/index.ts"

# 8. Lock PM2 to Systemd Root Boot Sequence
sudo pm2 save --force
sudo pm2 startup systemd -u root --hp /root
```

### Local Monorepo Development Start Command
To start the entire platform locally on a development machine:
```bash
# Ensure local Redis and Postgres are running
npm run infra:up

# Start all microservices concurrently
npm run start
```
*Runs: `apps/api` (port 8000), `apps/build-worker`, `apps/edge-router` (port 8080), `apps/function-runtime`, `apps/cron-scheduler`, `apps/flow-engine`, and `apps/dashboard` (port 3000).*

---

## 5. Complete Environment Variables Master Reference

### Production Environment Template (`/opt/whizan/.env.production`)
```ini
# =============================================================================
# Whizan Cloud Service — Production Environment Specification (v1 Baseline)
# =============================================================================

# ─── Networking & Ingress ──────────────────────────────────────────────────
NODE_ENV="production"
ROUTER_PORT=80
API_PORT=8000
DASHBOARD_URL="https://dashboard.whizan.cloud"
CONTROL_PLANE_URL="https://api.whizan.cloud"
BASE_DOMAIN="whizan.cloud"

# ─── Database & Connection Pooling (Supabase AWS Tokyo) ───────────────────
DATABASE_URL="postgresql://postgres.fdwstppklgibuwqjrusf:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.fdwstppklgibuwqjrusf:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"

# ─── Redis Queue & PubSub (Upstash TLS) ───────────────────────────────────
REDIS_URL="rediss://default:[TOKEN]@saved-ox-192841.upstash.io:6379"

# ─── Security, Encryption & Tokens ─────────────────────────────────────────
# Generated with: openssl rand -hex 32 (MUST be exactly 64 hex characters)
JWT_SECRET="8c100794805dcd57b5908bb6f20dc658ed26e17327acde49e0f77c53194d73dd"
COOKIE_SECRET="1f724e526b36368a5b92c46d0d3890ef0eb148a60ac792b53ef8c4245addbf19"
ENCRYPTION_KEY="bacbf9d7fb2d62a52eda92963d00d243c1ea6cbab5fb62f866a384651f95f279"

# ─── GitHub OAuth Integration ──────────────────────────────────────────────
GITHUB_CLIENT_ID="Iv23liCqgXS2WzQBItri"
GITHUB_CLIENT_SECRET="[SECRET]"
GITHUB_CALLBACK_URL="https://api.whizan.cloud/api/auth/github/callback"
GITHUB_TOKEN="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"

# ─── VM Compute & Storage Paths ───────────────────────────────────────────
BUILD_BASE_DIR="/opt/whizan/repos"
DB_VOLUME_BASE_DIR="/opt/whizan/volumes"
DB_PUBLIC_HOST="20.2.136.11"
DB_PORT_RANGE_START=15000
DB_PORT_RANGE_END=20000

# ─── Google Gemini AI Key Rotation ────────────────────────────────────────
GEMINI_API_KEY="AIzaSyDdFPyvtBbofucXU2GvPlLY_yICBZxM76Y"
GEMINI_API_KEY_1="AIzaSyCevvEyTYzOiMnuTqird0ODBV08pt-w5uM"
GEMINI_API_KEY_2="AQ.Ab8RN6I2CFdE0JixSI58VzNYvnUhzYIKP3zMtyRJywmoeb0Yvg"
GEMINI_API_KEY_3="AQ.Ab8RN6KRI_SewANB8XvOd8W-UfIvnF_fII-YMDPidoxIhCwa8g"
```

---

## 6. Complete Database Schema Snapshot (`packages/db`)

Whizan 1.0 utilizes Prisma 5.19.1 with PostgreSQL. Below is the complete, unabridged schema definition matching the live database:

```prisma
// packages/db/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ─────────────────────────────────────────
//  USERS & AUTHENTICATION
// ─────────────────────────────────────────
model User {
  id                  String             @id @default(uuid())
  email               String             @unique
  passwordHash        String?            @map("password_hash")
  githubId            String?            @unique @map("github_id")
  githubToken         String?            @map("github_token")
  name                String?
  avatarUrl           String?            @map("avatar_url")
  subscriptionTier    String             @default("HOBBY") @map("subscription_tier")
  role                String             @default("USER")
  iamPermissions      String?            @default("all") @map("iam_permissions")
  emailVerified       Boolean            @default(false) @map("email_verified")
  emailVerifiedAt     DateTime?          @map("email_verified_at")
  twoFactorEnrolled   Boolean            @default(false) @map("two_factor_enrolled")
  twoFactorMethod     String?            @map("two_factor_method")
  twoFactorVerifiedAt DateTime?          @map("two_factor_verified_at")
  termsAccepted       Boolean            @default(false) @map("terms_accepted")
  termsAcceptedAt     DateTime?          @map("terms_accepted_at")
  termsVersion        String?            @default("2026-10-v1") @map("terms_version")
  createdAt           DateTime           @default(now()) @map("created_at")
  updatedAt           DateTime           @updatedAt @map("updated_at")

  projects            Project[]
  backendServices     BackendService[]
  databaseServices    DatabaseService[]
  refreshTokens       RefreshToken[]
  apiKeys             ApiKey[]
  functionServices    FunctionService[]
  cronJobs            CronJob[]
  workflows           Workflow[]
  agentSessions       AgentSession[]
  storageBuckets      StorageBucket[]
  storageQuota        StorageUserQuota?
  storageAuditLogs    StorageAuditLog[]
  storageWebhooks     StorageWebhook[]
  storageApiKeys      StorageApiKey[]

  @@map("users")
}

model ApiKey {
  id         String    @id @default(uuid())
  userId     String    @map("user_id")
  name       String    @default("IDE MCP Key")
  keyHash    String    @unique @map("key_hash")
  keyPrefix  String    @map("key_prefix")
  lastUsedAt DateTime? @map("last_used_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("api_keys")
}

model RefreshToken {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  token     String   @unique
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("refresh_tokens")
}

// ─────────────────────────────────────────
//  WEB PROJECTS (FRONTEND & FULLSTACK)
// ─────────────────────────────────────────
model Project {
  id             String             @id @default(uuid())
  userId         String             @map("user_id")
  name           String
  slug           String             @unique
  githubRepoUrl  String             @default("") @map("github_repo_url")
  githubRepoId   String?            @map("github_repo_id")
  webhookSecret  String             @map("webhook_secret")
  branch         String             @default("main")
  rootDir        String             @default(".") @map("root_dir")
  buildCommand   String             @default("npm run build") @map("build_command")
  installCommand String             @default("npm install") @map("install_command")
  outputDir      String             @default(".next") @map("output_dir")
  framework      Framework          @default(NEXTJS)
  createdAt      DateTime           @default(now()) @map("created_at")
  updatedAt      DateTime           @updatedAt @map("updated_at")

  user           User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  deployments    Deployment[]
  envVariables   EnvVariable[]
  customDomains  CustomDomain[]
  analytics      ProjectAnalytics[]

  @@map("projects")
}

enum Framework {
  NEXTJS
  REACT
  VITE
  ASTRO
  CUSTOM
  @@map("framework")
}

model Deployment {
  id              String           @id @default(uuid())
  projectId       String           @map("project_id")
  commitHash      String           @map("commit_hash")
  commitMessage   String?          @map("commit_message")
  branch          String
  status          DeploymentStatus @default(QUEUED)
  deploymentType  DeploymentType?  @map("deployment_type")
  uploadType      String?          @default("git") @map("upload_type")
  url             String?
  containerPort   Int?             @map("container_port")
  buildStartedAt  DateTime?        @map("build_started_at")
  buildFinishedAt DateTime?        @map("build_finished_at")
  errorMessage    String?          @map("error_message")
  createdAt       DateTime         @default(now()) @map("created_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@index([projectId, createdAt(sort: Desc)])
  @@map("deployments")
}

enum DeploymentStatus {
  QUEUED
  BUILDING
  READY
  FAILED
  CANCELLED
  PAUSED
  @@map("deployment_status")
}

enum DeploymentType {
  STATIC
  SSR
  HYBRID
  @@map("deployment_type")
}

model EnvVariable {
  id        String   @id @default(uuid())
  projectId String   @map("project_id")
  key       String
  value     String   // AES-256-GCM encrypted
  isSecret  Boolean  @default(true) @map("is_secret")
  createdAt DateTime @default(now()) @map("created_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@unique([projectId, key])
  @@map("env_variables")
}

model CustomDomain {
  id        String   @id @default(uuid())
  projectId String   @map("project_id")
  domain    String   @unique
  verified  Boolean  @default(false)
  sslStatus String   @default("pending") @map("ssl_status")
  createdAt DateTime @default(now()) @map("created_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@map("custom_domains")
}

model ProjectAnalytics {
  id        String   @id @default(uuid())
  projectId String   @map("project_id")
  date      DateTime @db.Date
  pageViews Int      @default(0) @map("page_views")
  visitors  Int      @default(0)
  bandwidth Int      @default(0)

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@unique([projectId, date])
  @@map("project_analytics")
}

// ─────────────────────────────────────────
//  BACKEND MICROSERVICES
// ─────────────────────────────────────────
model BackendService {
  id             String               @id @default(uuid())
  userId         String               @map("user_id")
  name           String
  slug           String               @unique
  githubRepoUrl  String               @default("") @map("github_repo_url")
  branch         String               @default("main")
  language       BackendLanguage      @default(NODEJS)
  rootDir        String               @default(".") @map("root_dir")
  installCommand String               @default("npm install") @map("install_command")
  startCommand   String               @default("npm start") @map("start_command")
  internalPort   Int                  @default(8000) @map("internal_port")
  isPublic       Boolean              @default(false) @map("is_public")
  autoSleep      Boolean              @default(false) @map("auto_sleep")
  instanceType   String               @default("starter") @map("instance_type")
  cpuLimit       Float                @default(0.5) @map("cpu_limit")
  memoryLimit    Int                  @default(512) @map("memory_limit")
  createdAt      DateTime             @default(now()) @map("created_at")
  updatedAt      DateTime             @updatedAt @map("updated_at")

  user         User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  deployments  ServiceDeployment[]
  envVariables ServiceEnvVariable[]

  @@map("backend_services")
}

enum BackendLanguage {
  NODEJS
  PYTHON
  GO
  DOCKERFILE
  @@map("backend_language")
}

model ServiceDeployment {
  id              String           @id @default(uuid())
  serviceId       String           @map("service_id")
  commitHash      String           @map("commit_hash")
  commitMessage   String?          @map("commit_message")
  branch          String
  status          DeploymentStatus @default(QUEUED)
  uploadType      String?          @default("git") @map("upload_type")
  containerPort   Int?             @map("container_port")
  buildStartedAt  DateTime?        @map("build_started_at")
  buildFinishedAt DateTime?        @map("build_finished_at")
  errorMessage    String?          @map("error_message")
  createdAt       DateTime         @default(now()) @map("created_at")

  service BackendService @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  @@index([serviceId, createdAt(sort: Desc)])
  @@map("service_deployments")
}

model ServiceEnvVariable {
  id        String   @id @default(uuid())
  serviceId String   @map("service_id")
  key       String
  value     String   // AES-256-GCM encrypted
  isSecret  Boolean  @default(true) @map("is_secret")
  createdAt DateTime @default(now()) @map("created_at")

  service BackendService @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  @@unique([serviceId, key])
  @@map("service_env_variables")
}

// ─────────────────────────────────────────
//  MANAGED DATABASES
// ─────────────────────────────────────────
model DatabaseService {
  id               String         @id @default(uuid())
  userId           String         @map("user_id")
  name             String
  slug             String         @unique
  type             DatabaseType   @default(POSTGRESQL)
  version          String         @default("16")
  status           DatabaseStatus @default(PROVISIONING)
  databaseName     String         @default("whizan_db") @map("database_name")
  username         String         @default("whizan_user")
  password         String         // AES-256-GCM encrypted
  internalPort     Int            @default(5432) @map("internal_port")
  externalPort     Int?           @map("external_port")
  volumePath       String         @map("volume_path")
  instanceType     String         @default("starter") @map("instance_type")
  cpuLimit         Float          @default(0.5) @map("cpu_limit")
  memoryLimit      Int            @default(512) @map("memory_limit")
  poolerPort       Int?           @map("pooler_port")
  enablePooler     Boolean        @default(true) @map("enable_pooler")
  ipWhitelist      String[]       @default([]) @map("ip_whitelist")
  sslEnabled       Boolean        @default(true) @map("ssl_enabled")
  readonlyPassword String?        @map("readonly_password")
  errorMessage     String?        @map("error_message")
  createdAt        DateTime       @default(now()) @map("created_at")
  updatedAt        DateTime       @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("database_services")
}

enum DatabaseType {
  POSTGRESQL
  REDIS
  MYSQL
  @@map("database_type")
}

enum DatabaseStatus {
  PROVISIONING
  RUNNING
  STOPPED
  RESTARTING
  FAILED
  @@map("database_status")
}

// ─────────────────────────────────────────
//  EDGE FUNCTIONS (V8 ENGINE)
// ─────────────────────────────────────────
model FunctionService {
  id             String                @id @default(uuid())
  userId         String                @map("user_id")
  name           String
  slug           String                @unique
  runtime        FunctionRuntime       @default(EDGE_TYPESCRIPT)
  entryFile      String                @default("index.ts") @map("entry_file")
  timeoutMs      Int                   @default(10000) @map("timeout_ms")
  memoryLimit    Int                   @default(128) @map("memory_limit")
  minInstances   Int                   @default(0) @map("min_instances")
  maxConcurrency Int                   @default(10) @map("max_concurrency")
  isPublic       Boolean               @default(false) @map("is_public")
  corsOrigins    String[]              @default(["*"]) @map("cors_origins")
  createdAt      DateTime              @default(now()) @map("created_at")
  updatedAt      DateTime              @updatedAt @map("updated_at")

  user        User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  apiKeys     FunctionApiKey[]
  endpoints   FunctionEndpoint[]
  deployments FunctionDeployment[]
  envVariables FunctionEnvVariable[]
  triggers    FunctionTrigger[]
  invocations FunctionInvocation[]

  @@map("function_services")
}

enum FunctionRuntime {
  EDGE_TYPESCRIPT
  NODEJS_20
  PYTHON_311
  GOLANG_122
  @@map("function_runtime")
}

model FunctionApiKey {
  id           String          @id @default(uuid())
  serviceId    String          @map("service_id")
  name         String          @default("Production Key")
  keyHash      String          @unique @map("key_hash")
  keyPrefix    String          @map("key_prefix")
  keyCipher    String?         @map("key_cipher")
  scopes       String[]        @default(["EXECUTE"])
  rateLimitRpm Int             @default(600) @map("rate_limit_rpm")
  ipWhitelist  String[]        @default([]) @map("ip_whitelist")
  expiresAt    DateTime?       @map("expires_at")
  lastUsedAt   DateTime?       @map("last_used_at")
  createdAt    DateTime        @default(now()) @map("created_at")

  service FunctionService @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  @@index([serviceId])
  @@map("function_api_keys")
}

model FunctionEndpoint {
  id          String          @id @default(uuid())
  serviceId   String          @map("service_id")
  name        String
  routePath   String          @map("route_path")
  httpMethods String[]        @default(["GET", "POST"]) @map("http_methods")
  handlerName String          @default("default") @map("handler_name")
  isPublic    Boolean         @default(false) @map("is_public")
  cacheTtlSec Int             @default(0) @map("cache_ttl_sec")
  createdAt   DateTime        @default(now()) @map("created_at")

  service FunctionService @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  @@unique([serviceId, routePath])
  @@map("function_endpoints")
}

model FunctionDeployment {
  id              String           @id @default(uuid())
  serviceId       String           @map("service_id")
  version         Int              @default(1)
  bundlePath      String           @map("bundle_path")
  bundleHash      String           @map("bundle_hash")
  bundleSizeBytes Int              @map("bundle_size_bytes")
  status          DeploymentStatus @default(READY)
  trafficWeight   Int              @default(100) @map("traffic_weight")
  errorMessage    String?          @map("error_message")
  sourceCode      String?          @map("source_code") @db.Text
  createdAt       DateTime         @default(now()) @map("created_at")

  service FunctionService @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  @@index([serviceId, createdAt(sort: Desc)])
  @@map("function_deployments")
}

model FunctionTrigger {
  id        String          @id @default(uuid())
  serviceId String          @map("service_id")
  type      TriggerType     @default(HTTP)
  config    Json
  enabled   Boolean         @default(true)
  lastRunAt DateTime?       @map("last_run_at")
  createdAt DateTime        @default(now()) @map("created_at")

  service FunctionService @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  @@map("function_triggers")
}

enum TriggerType {
  HTTP
  CRON
  DATABASE_CDC
  STORAGE_BLOB
  QUEUE_MESSAGE
  @@map("trigger_type")
}

model FunctionEnvVariable {
  id        String          @id @default(uuid())
  serviceId String          @map("service_id")
  key       String
  value     String
  isSecret  Boolean         @default(true) @map("is_secret")
  createdAt DateTime        @default(now()) @map("created_at")

  service FunctionService @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  @@unique([serviceId, key])
  @@map("function_env_variables")
}

model FunctionInvocation {
  id         String          @id @default(uuid())
  serviceId  String          @map("service_id")
  endpoint   String
  httpMethod String          @map("http_method")
  statusCode Int             @map("status_code")
  durationMs Float           @map("duration_ms")
  memoryMb   Float           @map("memory_mb")
  clientIp   String          @map("client_ip")
  timestamp  DateTime        @default(now())

  service FunctionService @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  @@index([serviceId, timestamp(sort: Desc)])
  @@map("function_invocations")
}

// ─────────────────────────────────────────
//  CRON SCHEDULER & DEAD LETTER QUEUE
// ─────────────────────────────────────────
model CronJob {
  id                String               @id @default(uuid())
  userId            String               @map("user_id")
  name              String
  description       String?              @db.Text
  schedule          String
  timezone          String               @default("UTC")
  targetType        CronTargetType       @map("target_type")
  targetConfig      Json                 @map("target_config")
  misfirePolicy     CronMisfirePolicy    @default(SKIP) @map("misfire_policy")
  concurrencyPolicy CronConcurrency      @default(FORBID) @map("concurrency_policy")
  maxConcurrentRuns Int                  @default(1) @map("max_concurrent_runs")
  timeoutSeconds    Int                  @default(300) @map("timeout_seconds")
  maxRetries        Int                  @default(3) @map("max_retries")
  retryDelaySeconds Int                  @default(10) @map("retry_delay_seconds")
  enabled           Boolean              @default(true)
  nextRunAt         DateTime?            @map("next_run_at")
  lastRunAt         DateTime?            @map("last_run_at")
  lastStatus        CronExecutionStatus? @map("last_status")
  createdAt         DateTime             @default(now()) @map("created_at")
  updatedAt         DateTime             @updatedAt @map("updated_at")

  user        User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  executions  CronExecution[]
  deadLetters CronDeadLetter[]

  @@index([userId])
  @@index([enabled, nextRunAt])
  @@map("cron_jobs")
}

enum CronTargetType {
  FUNCTION
  PROJECT
  SERVICE
  CONTAINER_EXEC
  WEBHOOK
  @@map("cron_target_type")
}

enum CronMisfirePolicy {
  SKIP
  FIRE_LATEST_ONCE
  CATCH_UP_ALL
  @@map("cron_misfire_policy")
}

enum CronConcurrency {
  FORBID
  ALLOW
  REPLACE
  QUEUE_SERIALIZE
  @@map("cron_concurrency")
}

enum CronExecutionStatus {
  SCHEDULED
  RUNNING
  SUCCESS
  FAILED
  TIMED_OUT
  SKIPPED_OVERLAP
  MISFIRE_SKIPPED
  @@map("cron_execution_status")
}

model CronExecution {
  id             String              @id @default(uuid())
  cronJobId      String              @map("cron_job_id")
  triggerType    String              @default("SCHEDULED") @map("trigger_type")
  status         CronExecutionStatus @default(RUNNING)
  startedAt      DateTime            @default(now()) @map("started_at")
  finishedAt     DateTime?           @map("finished_at")
  durationMs     Float?              @map("duration_ms")
  exitCode       Int?                @map("exit_code")
  httpStatusCode Int?                @map("http_status_code")
  errorMessage   String?             @db.Text @map("error_message")
  stdout         String?             @db.Text
  stderr         String?             @db.Text
  memoryMbPeak   Float?              @map("memory_mb_peak")
  cpuMs          Float?              @map("cpu_ms")
  retryAttempt   Int                 @default(0) @map("retry_attempt")

  cronJob CronJob @relation(fields: [cronJobId], references: [id], onDelete: Cascade)
  @@index([cronJobId, startedAt(sort: Desc)])
  @@map("cron_executions")
}

model CronDeadLetter {
  id            String           @id @default(uuid())
  cronJobId     String           @map("cron_job_id")
  executionId   String?          @map("execution_id")
  failureReason String           @map("failure_reason") @db.Text
  payload       Json?
  retryCount    Int              @default(0) @map("retry_count")
  status        DeadLetterStatus @default(UNRESOLVED)
  createdAt     DateTime         @default(now()) @map("created_at")
  resolvedAt    DateTime?        @map("resolved_at")

  cronJob CronJob @relation(fields: [cronJobId], references: [id], onDelete: Cascade)
  @@index([cronJobId, status])
  @@map("cron_dead_letters")
}

enum DeadLetterStatus {
  UNRESOLVED
  REPLAYED
  DISCARDED
  @@map("dead_letter_status")
}

// ─────────────────────────────────────────
//  WORKFLOW AUTOMATION (WHIZAN FLOW)
// ─────────────────────────────────────────
model Workflow {
  id                String              @id @default(uuid())
  userId            String              @map("user_id")
  projectId         String?             @map("project_id")
  name              String
  description       String?             @db.Text
  slug              String
  visualConfig      Json                @default("{}") @map("visual_config")
  codeDefinition    String              @default("") @db.Text @map("code_definition")
  enabled           Boolean             @default(true)
  isTemplate        Boolean             @default(false) @map("is_template")
  category          String              @default("CUSTOM")
  concurrencyPolicy WorkflowConcurrency @default(QUEUE) @map("concurrency_policy")
  maxConcurrentRuns Int                 @default(1) @map("max_concurrent_runs")
  timeoutSeconds    Int                 @default(3600) @map("timeout_seconds")
  createdAt         DateTime            @default(now()) @map("created_at")
  updatedAt         DateTime            @updatedAt @map("updated_at")

  user     User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  nodes    WorkflowNode[]
  edges    WorkflowEdge[]
  triggers WorkflowTrigger[]
  runs     WorkflowRun[]

  @@unique([userId, slug])
  @@index([userId, enabled])
  @@map("workflows")
}

enum WorkflowConcurrency {
  FORBID
  QUEUE
  ALLOW
  REPLACE
  @@map("workflow_concurrency")
}

model WorkflowNode {
  id              String           @id @default(uuid())
  workflowId      String           @map("workflow_id")
  nodeKey         String           @map("node_key")
  name            String
  type            WorkflowNodeType @map("type")
  config          Json             @default("{}")
  timeoutSeconds  Int              @default(600) @map("timeout_seconds")
  maxRetries      Int              @default(0) @map("max_retries")
  retryDelaySec   Int              @default(5) @map("retry_delay_sec")
  continueOnError Boolean          @default(false) @map("continue_on_error")
  positionX       Float            @default(0) @map("position_x")
  positionY       Float            @default(0) @map("position_y")

  workflow Workflow          @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  stepRuns WorkflowStepRun[]

  @@unique([workflowId, nodeKey])
  @@map("workflow_nodes")
}

enum WorkflowNodeType {
  TRIGGER_GIT
  TRIGGER_CRON
  TRIGGER_WEBHOOK
  TRIGGER_MANUAL
  ACTION_WORKSPACE_ANALYZE
  ACTION_BUILD_CONTAINER
  ACTION_DEPLOY_EDGE
  ACTION_DEPLOY_SERVICE
  ACTION_CONTAINER_EXEC
  ACTION_RUN_TESTS
  ACTION_HEALTH_PROBE
  ACTION_ROUTER_CUTOVER
  ACTION_AUTO_ROLLBACK
  ACTION_V8_FUNCTION
  ACTION_HTTP_REQUEST
  ACTION_DATABASE_QUERY
  ACTION_AI_PROMPT
  ACTION_NOTIFICATION
  CONTROL_CONDITION
  CONTROL_PARALLEL
  CONTROL_JOIN
  CONTROL_DELAY
  CONTROL_APPROVAL
  @@map("workflow_node_type")
}

model WorkflowEdge {
  id            String   @id @default(uuid())
  workflowId    String   @map("workflow_id")
  sourceNodeKey String   @map("source_node_key")
  targetNodeKey String   @map("target_node_key")
  condition     String?  @default("SUCCESS")

  workflow Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  @@index([workflowId, sourceNodeKey])
  @@map("workflow_edges")
}

model WorkflowTrigger {
  id              String    @id @default(uuid())
  workflowId      String    @map("workflow_id")
  type            String    @default("MANUAL")
  config          Json      @default("{}")
  enabled         Boolean   @default(true)
  lastTriggeredAt DateTime? @map("last_triggered_at")
  createdAt       DateTime  @default(now()) @map("created_at")

  workflow Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  @@map("workflow_triggers")
}

model WorkflowRun {
  id              String            @id @default(uuid())
  workflowId      String            @map("workflow_id")
  triggerSource   String            @default("MANUAL") @map("trigger_source")
  triggerMetadata Json?             @map("trigger_metadata")
  status          WorkflowRunStatus @default(PENDING)
  startedAt       DateTime          @default(now()) @map("started_at")
  finishedAt      DateTime?         @map("finished_at")
  durationMs      Int?              @map("duration_ms")
  contextData     Json              @default("{}") @map("context_data")
  errorMessage    String?           @db.Text @map("error_message")
  triggeredBy     String?           @map("triggered_by")

  workflow  Workflow           @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  stepRuns  WorkflowStepRun[]
  approvals WorkflowApproval[]

  @@index([workflowId, status])
  @@index([startedAt(sort: Desc)])
  @@map("workflow_runs")
}

enum WorkflowRunStatus {
  PENDING
  RUNNING
  WAITING_FOR_APPROVAL
  PAUSED
  SUCCESS
  FAILED
  CANCELLED
  TIMED_OUT
  @@map("workflow_run_status")
}

model WorkflowStepRun {
  id              String            @id @default(uuid())
  runId           String            @map("run_id")
  nodeId          String?           @map("node_id")
  nodeKey         String            @map("node_key")
  nodeType        WorkflowNodeType  @map("node_type")
  status          WorkflowRunStatus @default(PENDING)
  startedAt       DateTime          @default(now()) @map("started_at")
  finishedAt      DateTime?         @map("finished_at")
  durationMs      Int?              @map("duration_ms")
  memoizationHash String?           @map("memoization_hash")
  outputData      Json?             @map("output_data")
  exitCode        Int?              @map("exit_code")
  httpStatusCode  Int?              @map("http_status_code")
  stdout          String?           @db.Text
  stderr          String?           @db.Text
  retryAttempt    Int               @default(0) @map("retry_attempt")
  errorMessage    String?           @db.Text @map("error_message")

  workflowRun WorkflowRun   @relation(fields: [runId], references: [id], onDelete: Cascade)
  node        WorkflowNode? @relation(fields: [nodeId], references: [id], onDelete: SetNull)

  @@unique([runId, nodeKey])
  @@index([runId, status])
  @@map("workflow_step_runs")
}

model WorkflowApproval {
  id            String         @id @default(uuid())
  runId         String         @map("run_id")
  nodeKey       String         @map("node_key")
  title         String
  description   String?        @db.Text
  status        ApprovalStatus @default(PENDING)
  approvalToken String         @unique @map("approval_token")
  approvedBy    String?        @map("approved_by")
  comments      String?        @db.Text
  expiresAt     DateTime       @map("expires_at")
  respondedAt   DateTime?      @map("responded_at")

  workflowRun WorkflowRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  @@index([runId, status])
  @@map("workflow_approvals")
}

enum ApprovalStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
  @@map("approval_status")
}

// ─────────────────────────────────────────
//  SUMMER: AI AGENT COPILOT
// ─────────────────────────────────────────
model AgentSession {
  id        String         @id @default(uuid())
  userId    String         @map("user_id")
  title     String         @default("New Conversation")
  context   Json?
  createdAt DateTime       @default(now()) @map("created_at")
  updatedAt DateTime       @updatedAt @map("updated_at")

  user     User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages AgentMessage[]
  actions  AgentAction[]

  @@map("agent_sessions")
}

model AgentMessage {
  id         String       @id @default(uuid())
  sessionId  String       @map("session_id")
  role       String
  content    String       @db.Text
  toolCalls  Json?        @map("tool_calls")
  toolResult Json?        @map("tool_result")
  audioUrl   String?      @map("audio_url")
  createdAt  DateTime     @default(now()) @map("created_at")

  session AgentSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  @@map("agent_messages")
}

model AgentAction {
  id              String    @id @default(uuid())
  sessionId       String    @map("session_id")
  toolName        String    @map("tool_name")
  parameters      Json
  riskTier        String    @default("TIER_2") @map("risk_tier")
  status          String    @default("PENDING")
  decisionBy      String?   @map("decision_by")
  decidedAt       DateTime? @map("decided_at")
  executionResult Json?     @map("execution_result")
  createdAt       DateTime  @default(now()) @map("created_at")

  session AgentSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  @@map("agent_actions")
}

// ─────────────────────────────────────────
//  CLOUD OBJECT STORAGE (R2-POWERED)
// ─────────────────────────────────────────
model StorageBucket {
  id                 String                @id @default(uuid())
  userId             String                @map("user_id")
  name               String                @unique
  description        String?               @db.Text
  isPublic           Boolean               @default(false) @map("is_public")
  maxFileSize        BigInt?               @map("max_file_size")
  allowedMimeTypes   String[]              @default([]) @map("allowed_mime_types")
  fileCount          Int                   @default(0) @map("file_count")
  totalBytes         BigInt                @default(0) @map("total_bytes")
  corsOrigins        String[]              @default(["*"]) @map("cors_origins")
  corsMaxAge         Int                   @default(3600) @map("cors_max_age")
  versioningEnabled  Boolean               @default(false) @map("versioning_enabled")
  trashEnabled       Boolean               @default(true) @map("trash_enabled")
  trashRetentionDays Int                   @default(30) @map("trash_retention_days")
  createdAt          DateTime              @default(now()) @map("created_at")
  updatedAt          DateTime              @updatedAt @map("updated_at")

  user           User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  objects        StorageObject[]
  reservations   StorageReservation[]
  policies       StorageBucketPolicy[]
  webhooks       StorageWebhook[]
  storageApiKeys StorageApiKey[]

  @@index([userId])
  @@map("storage_buckets")
}

model StorageObject {
  id                 String                 @id @default(uuid())
  bucketId           String                 @map("bucket_id")
  userId             String                 @map("user_id")
  name               String
  r2Key              String                 @map("r2_key")
  size               BigInt
  mimeType           String                 @default("application/octet-stream") @map("mime_type")
  etag               String?
  checksum           String?
  metadata           Json?                  @default("{}")
  cacheControl       String?                @map("cache_control")
  contentDisposition String?                @map("content_disposition")
  isPublic           Boolean                @default(false) @map("is_public")
  deletedAt          DateTime?              @map("deleted_at")
  deletedBy          String?                @map("deleted_by")
  createdAt          DateTime               @default(now()) @map("created_at")
  updatedAt          DateTime               @updatedAt @map("updated_at")

  bucket   StorageBucket          @relation(fields: [bucketId], references: [id], onDelete: Cascade)
  versions StorageObjectVersion[]

  @@unique([bucketId, name])
  @@index([userId, bucketId])
  @@index([userId, createdAt(sort: Desc)])
  @@index([bucketId, deletedAt])
  @@map("storage_objects")
}

model StorageReservation {
  id            String                   @id @default(uuid())
  userId        String                   @map("user_id")
  bucketId      String                   @map("bucket_id")
  objectName    String                   @map("object_name")
  reservedBytes BigInt                   @map("reserved_bytes")
  uploadType    String                   @default("DIRECT") @map("upload_type")
  uploadId      String?                  @map("upload_id")
  status        StorageReservationStatus @default(PENDING)
  expiresAt     DateTime                 @map("expires_at")
  createdAt     DateTime                 @default(now()) @map("created_at")
  updatedAt     DateTime                 @updatedAt @map("updated_at")

  bucket StorageBucket @relation(fields: [bucketId], references: [id], onDelete: Cascade)
  @@index([userId, status])
  @@index([expiresAt])
  @@map("storage_reservations")
}

enum StorageReservationStatus {
  PENDING
  COMMITTED
  CANCELLED
  EXPIRED
  @@map("storage_reservation_status")
}

model StorageUserQuota {
  id               String    @id @default(uuid())
  userId           String    @unique @map("user_id")
  allocatedBytes   BigInt    @default(250000000) @map("allocated_bytes")
  usedBytes        BigInt    @default(0) @map("used_bytes")
  reservedBytes    BigInt    @default(0) @map("reserved_bytes")
  objectsCount     Int       @default(0) @map("objects_count")
  lastReconciledAt DateTime? @map("last_reconciled_at")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("storage_user_quotas")
}

model StorageAuditLog {
  id            String   @id @default(uuid())
  userId        String   @map("user_id")
  actorEmail    String?  @map("actor_email")
  action        String
  bucketId      String?  @map("bucket_id")
  bucketName    String?  @map("bucket_name")
  objectName    String?  @map("object_name")
  bytesAffected BigInt?  @map("bytes_affected")
  ipAddress     String?  @map("ip_address")
  userAgent     String?  @map("user_agent")
  metadata      Json?    @default("{}")
  createdAt     DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt(sort: Desc)])
  @@map("storage_audit_logs")
}

model StorageBucketPolicy {
  id        String   @id @default(uuid())
  bucketId  String   @map("bucket_id")
  name      String
  operation String
  definition Json
  isEnabled Boolean  @default(true) @map("is_enabled")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  bucket StorageBucket @relation(fields: [bucketId], references: [id], onDelete: Cascade)
  @@index([bucketId, operation])
  @@map("storage_bucket_policies")
}

model StorageWebhook {
  id        String         @id @default(uuid())
  userId    String         @map("user_id")
  bucketId  String?        @map("bucket_id")
  events    String[]
  url       String
  secret    String
  isActive  Boolean        @default(true) @map("is_active")
  createdAt DateTime       @default(now()) @map("created_at")
  updatedAt DateTime       @updatedAt @map("updated_at")

  user   User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  bucket StorageBucket? @relation(fields: [bucketId], references: [id], onDelete: Cascade)
  @@index([userId, isActive])
  @@map("storage_webhooks")
}

model StorageObjectVersion {
  id        String   @id @default(uuid())
  objectId  String   @map("object_id")
  version   Int
  r2Key     String   @map("r2_key")
  size      BigInt
  mimeType  String   @map("mime_type")
  etag      String?
  metadata  Json?    @default("{}")
  createdAt DateTime @default(now()) @map("created_at")
  createdBy String?  @map("created_by")

  object StorageObject @relation(fields: [objectId], references: [id], onDelete: Cascade)
  @@unique([objectId, version])
  @@index([objectId, createdAt(sort: Desc)])
  @@map("storage_object_versions")
}

model StorageApiKey {
  id              String         @id @default(uuid())
  userId          String         @map("user_id")
  name            String         @default("Storage Key")
  keyPrefix       String         @map("key_prefix")
  keyHash         String         @unique @map("key_hash")
  encryptedSecret String         @map("encrypted_secret")
  bucketId        String?        @map("bucket_id")
  permission      String         @default("READ_WRITE")
  lastUsedAt      DateTime?      @map("last_used_at")
  createdAt       DateTime       @default(now()) @map("created_at")

  user   User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  bucket StorageBucket? @relation(fields: [bucketId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([bucketId])
  @@map("storage_api_keys")
}
```

---

## 7. Disaster Recovery & Troubleshooting Playbook

### Scenario A: Full Azure VM Reboot Recovery
When the VM restarts (e.g. cloud provider maintenance or reboot):
1. **SSH into the VM**:
   ```bash
   ssh azureuser@20.2.136.11
   ```
2. **Verify Port 80 is not hijacked**:
   ```bash
   sudo ss -tulpn | grep :80
   # If an unauthorized service appears:
   sudo fuser -k 80/tcp
   ```
3. **Verify PM2 Process Status**:
   ```bash
   sudo pm2 status
   ```
4. **If PM2 did not auto-recover on boot**, run the master recovery block:
   ```bash
   sudo bash -c "set -a && source /opt/whizan/.env.production && pm2 resurrect"
   # If resurrect fails to start cleanly:
   sudo bash -c "set -a && source /opt/whizan/.env.production && pm2 restart all"
   ```

### Scenario B: Clearing "Stuck in BUILDING" Deployments
If a crash occurs during compilation, the database may leave a deployment in status `BUILDING`.
Whizan 1.0 includes an automated recovery query executed on API startup:
```sql
UPDATE deployments 
SET status = 'FAILED', error_message = 'Build interrupted by system reboot or crash.' 
WHERE status IN ('BUILDING', 'QUEUED');

UPDATE service_deployments 
SET status = 'FAILED', error_message = 'Build interrupted by system reboot or crash.' 
WHERE status IN ('BUILDING', 'QUEUED');
```

### Scenario C: Emergency Database Migration Push
To synchronize schema alterations with the live Supabase PostgreSQL database without creating migration diff locks:
```bash
cd /opt/whizan
npx prisma db push --schema=packages/db/prisma/schema.prisma --accept-data-loss=false
npx prisma generate --schema=packages/db/prisma/schema.prisma
```

### Scenario D: Checking Active Docker Containers on VM
```bash
# List all active customer containers and their assigned host ports
sudo docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Ports}}\t{{.Status}}"

# Inspect resource utilization of running containers
sudo docker stats --no-stream
```
