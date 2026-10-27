# 06: MANAGED DATABASE INFRASTRUCTURE SPECIFICATION

---

## 1. Executive Problem Statement & Architectural Audit

In Whizan 1.0, managed databases are provisioned as standard Docker containers running PostgreSQL directly on the single VM host (`20.2.136.11`). Data files are bound to a local host directory (`/opt/whizan/databases/...`).

This architecture poses severe enterprise risks:
1. **Host-Coupled Catastrophic Data Loss**: If the host VM disk corrupts, is accidentally deprovisioned, or suffers a hardware fault, all hosted databases are destroyed simultaneously.
2. **Resource Starvation Under Heavy Queries**: A complex `SELECT` query with heavy joins or sorting consumes host CPU and RAM, degrading adjacent web services and build workers.
3. **Connection Exhaustion**: Without connection pooling, modern serverless and edge applications rapidly open dozens of concurrent connections. At ~100 connections, PostgreSQL exhausts system memory, throwing `FATAL: remaining connection slots are reserved for non-replication superuser connections`.
4. **Lack of Continuous PITR**: Whizan 1.0 relies on periodic, manual `pg_dump` runs. If a disaster strikes between backup intervals, hours of committed customer transactions are irrevocably lost.

Whizan 2.0 transitions to a **Decoupled Serverless Database Architecture** benchmarking Neon and AWS Aurora Serverless, combining decoupled storage/compute, automatic pausing, connection pooling via PgBouncer, and continuous WAL-level Point-In-Time-Recovery (PITR).

```
WHIZAN 1.0 (Coupled VM Docker Container)     WHIZAN 2.0 (Decoupled Serverless + PITR)
┌──────────────────────────────────────┐     ┌──────────────────────────────────────────────────┐
│ Single Host 20.2.136.11              │     │ Customer Application Pods                        │
│                                      │     └────────┬───────────────────┬─────────────────────┘
│ ┌─────────────────┐ ┌──────────────┐ │              │                   │ 10,000 Connections
│ │ Docker Container│ │ Web Services │ │              ▼                   ▼
│ │ PostgreSQL 16   │ │ (Share Mem)  │ │     ┌──────────────────────────────────────────────────┐
│ └────────┬────────┘ └──────────────┘ │     │ PgBouncer Layer (Transaction Pooling)            │
│          │                           │     └────────────────────────┬─────────────────────────┘
│          ▼                           │                              │ 20 Backend Connections
│ ┌─────────────────┐                  │                              ▼
│ │ Local VM Disk   │ (Lost on VM      │     ┌──────────────────────────────────────────────────┐
│ │ /opt/whizan/data│  Failure)        │     │ Serverless Postgres Compute Engine               │
│ └─────────────────┘                  │     │ • Auto-Pauses after 5 min idle ($0.00 compute)   │
└──────────────────────────────────────┘     │ • Scales vCPU/RAM elastically under load         │
                                             └────────┬───────────────────────────┬─────────────┘
                                                      │ Persistent Storage        │ Continuous WAL
                                                      ▼                           ▼
                                             ┌─────────────────┐         ┌──────────────────────┐
                                             │ Distributed SSD │         │ Cloudflare R2        │
                                             │ Storage Engine  │         │ (Continuous WAL-G    │
                                             │ (3x Replicated) │         │  7-Day PITR Stream)  │
                                             └─────────────────┘         └──────────────────────┘
```

---

## 2. Decoupled Serverless Postgres Architecture

In Whizan 2.0, database compute is completely separated from durable database storage.

### Core Mechanisms
1. **Auto-Suspending Compute Engine**: When an application stops querying the database for a configurable period (default: 5 minutes), the PostgreSQL compute container suspends its CPU and memory to **0 vCPU / 0 MB RAM**.
2. **Sub-Second Wake-on-Connection**: When an incoming TCP connection arrives on port 5432, the proxy holds the initial TLS handshake packet, resumes the compute engine within **500ms to 1 second**, and forwards the query transparently.
3. **Decoupled 3x Replicated Storage**: Data pages are persisted to high-speed NVMe block storage replicated across three availability zones. Storage remains intact regardless of compute state.

---

## 3. High-Capacity Connection Pooling via PgBouncer

Serverless functions and edge runtimes spawn hundreds of ephemeral execution instances, which can easily overwhelm a standard relational database with connection handshakes.

Whizan 2.0 includes an integrated PgBouncer proxy layer operating in **Transaction Pooling Mode**.

```mermaid
graph LR
    A[10,000+ Edge / Serverless Clients] -->|Short-lived TCP Connections| B[PgBouncer Proxy Engine]
    B -->|Multiplexed Connection Pool| C[20 Physical PostgreSQL Backend Connections]
    C --> D[(PostgreSQL Storage Engine)]
```

### PgBouncer Configuration (`pgbouncer.ini`)
```ini
[databases]
* = host=127.0.0.1 port=5432 auth_user=postgres

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

# Transaction pooling multiplexes connections per SQL transaction
pool_mode = transaction

# Maximum client connections accepted from the network
max_client_conn = 10000

# Strict limit of persistent physical connections to PostgreSQL
default_pool_size = 20
min_pool_size = 5
reserve_pool_size = 5
max_db_connections = 100

# Aggressive recycling of idle connections
server_idle_timeout = 60
client_idle_timeout = 300
query_timeout = 120
```

### Client Connection Uniformity
Whizan provides two connection strings in the dashboard for every database:
- **Pooled Connection String** (Port 6432): `postgresql://user:pass@ep-db.whizan.cloud:6432/main?pgbouncer=true` (Used for serverless, edge functions, and high-concurrency web APIs).
- **Direct Connection String** (Port 5432): `postgresql://user:pass@ep-db.whizan.cloud:5432/main` (Used exclusively for migrations, DDL schema alterations, and `prisma migrate`).

---

## 4. Continuous WAL Streaming & Point-In-Time-Recovery (PITR)

Traditional daily backups leave up to 24 hours of data vulnerable to loss. Whizan 2.0 implements **Continuous Write-Ahead Log (WAL) Archiving** powered by `WAL-G` streaming directly to Cloudflare R2 object storage.

```
PostgreSQL Engine ──► Local WAL Segment (16MB) ──► WAL-G Compressor ──► Cloudflare R2 Bucket
                                                                        (Immutable S3 Storage)
                                                                                  │
Recovery Request (Timestamp: 2026-10-24 14:22:15) ◄───────────────────────────────┘
  1. Pull latest full base backup prior to target time
  2. Replay streamed WAL delta logs up to exact millisecond
  3. Fork into new, healthy database instance
```

### Automated Recovery Flow
1. **Base Backups**: A consistent base snapshot is captured every 24 hours.
2. **Streaming WAL Delta**: Every closed 16 MB WAL segment or 60-second time interval is compressed with LZ4/Zstandard and streamed to `s3://whizan-db-backups/{databaseId}/wal/`.
3. **PITR Granularity**: Users can restore their database to **any specific second** within the 7-day retention window with zero data loss prior to the incident timestamp.

---

## 5. Automated Database Provisioning Service

Whizan Cloud provisions serverless PostgreSQL databases dynamically via the Control Plane API.

### Database Service Implementation (`apps/api/src/services/database.service.ts`)
```typescript
import { createApiClient } from "@neondatabase/api-client";
import { prisma } from "../lib/prisma";

const neonApiKey = process.env.NEON_API_KEY!;
const neonClient = createApiClient({ apiKey: neonApiKey });

export interface CreateDatabaseRequest {
  projectId: string;
  name: string;
  region: "aws-us-east-1" | "aws-eu-central-1" | "aws-ap-southeast-1";
  pgVersion?: number;
}

export async function provisionServerlessDatabase(req: CreateDatabaseRequest) {
  // 1. Create Serverless Postgres Project
  const projectResponse = await neonClient.createProject({
    project: {
      name: `whz-${req.name}`,
      region_id: req.region,
      pg_version: req.pgVersion || 16,
    },
  });

  const neonProject = projectResponse.data.project;
  const connectionUri = projectResponse.data.connection_uris[0]?.connection_uri;
  
  if (!connectionUri) {
    throw new Error("Failed to retrieve connection URI from database engine");
  }

  // 2. Derive Direct and Pooled Connection Strings
  const parsedUrl = new URL(connectionUri);
  const pooledUrl = new URL(connectionUri);
  
  // Neon automatically provisions PgBouncer on host prefix '-pooler'
  pooledUrl.host = parsedUrl.host.replace(".", "-pooler.");

  // 3. Persist Database Record in Whizan Control Plane
  const databaseRecord = await prisma.databaseInstance.create({
    data: {
      name: req.name,
      projectId: req.projectId,
      engine: "POSTGRESQL",
      version: "16",
      externalId: neonProject.id,
      connectionUrl: connectionUri,
      pooledConnectionUrl: pooledUrl.toString(),
      status: "ACTIVE",
      autoPauseMinutes: 5,
    },
  });

  return {
    databaseId: databaseRecord.id,
    directUrl: connectionUri,
    pooledUrl: pooledUrl.toString(),
    host: parsedUrl.host,
    port: 5432,
    database: parsedUrl.pathname.replace("/", ""),
    user: parsedUrl.username,
  };
}
```
