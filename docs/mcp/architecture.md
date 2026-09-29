# Whizan DevOps MCP Server — System Architecture

The **Whizan DevOps MCP Server** (`@whizan/mcp-devops`) is a core component of the Whizan Cloud Service platform. It operates as a local Model Context Protocol server over `stdio` inside AI-assisted IDEs, bridging the developer's local environment with the Whizan Cloud Control Plane and Azure Compute infrastructure.

---

## 1. High-Level Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Developer IDE (Cursor / VS Code)                │
│                                                                        │
│   ┌──────────────────────────┐         ┌───────────────────────────┐   │
│   │     AI Coding Agent      │ ◄─────► │    Whizan DevOps MCP      │   │
│   │  (Claude / Antigravity)  │   MCP   │   (Local stdio process)   │   │
│   └─────────────┬────────────┘ Protocol└─────────────┬─────────────┘   │
│                 │                                    │                 │
│      Modifies   │ Code & Configs          HTTPS REST │ API Calls       │
│                 ▼                                    ▼                 │
│   ┌──────────────────────────┐         ┌───────────────────────────┐   │
│   │      User Workspace      │         │   Whizan Control Plane    │   │
│   │  (React / Node / Python) │         │    (API on Render)        │   │
│   └──────────────────────────┘         └─────────────┬─────────────┘   │
└──────────────────────────────────────────────────────┼─────────────────┘
                                                       │
                                  Upstash Redis / WSS  │
                                                       ▼
                                         ┌───────────────────────────┐
                                         │   Azure Ubuntu VM Worker  │
                                         │  (Docker, PM2, Edge)      │
                                         └───────────────────────────┘
```

---

## 2. Component Breakdowns

### 2.1 `@whizan/mcp-devops` Package
- **Path**: `packages/mcp-devops`
- **Entry Point**: `packages/mcp-devops/dist/index.js`
- **Transport**: Standard Input/Output (`stdio`) using `@modelcontextprotocol/sdk`.
- **Core Modules**:
  - `src/index.ts`: Tool registration, request routing, and MCP protocol schema handlers.
  - `src/whizan-client.ts`: Authenticated HTTPS REST client communicating with the Whizan Control Plane API.
  - `src/tools/analyze-workspace.ts`: AST and regex workspace audit engine detecting framework types, listening ports, `127.0.0.1` binding traps, missing CORS, and environment variables.
  - `src/tools/generate-patch.ts`: Code snippet generator creating drop-in production patches.
  - `src/utils/archive.ts`: Workspace directory packaging engine using `tar -czf` with default ignore rules (`node_modules`, `._*`, `.git`, video binaries).

---

### 2.2 Upstash Redis 2MB Chunked Direct Upload Engine
When users deploy large source archives via `whizan_deploy_direct`, raw base64 payloads exceeding 7.5 MB (40 MB uncompressed) exceed Upstash Redis's strict 10 MB per-request payload limit.

To solve this, the Whizan DevOps MCP Server uses a **Staged Chunking Engine**:

```
[Local Workspace] ──► packDirectory() (.tar.gz)
                             │
                             ▼ (Split into 2MB Chunks)
┌─────────────────────────────────────────────────────────┐
│ Chunk 0 (2MB)  ──► POST /api/deployments/:id/chunk      │
│ Chunk 1 (2MB)  ──► POST /api/deployments/:id/chunk      │
│ Chunk N (2MB)  ──► POST /api/deployments/:id/chunk      │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
              [Upstash Redis Chunk Store]
              Key: `upload:<id>:chunk:<i>`
                             │
                             ▼ Reassemble & Enqueue
             [Azure VM Build Worker (PM2)]
```

#### Chunking Workflow:
1. `whizan_deploy_direct` packs the local directory into a `.tar.gz` buffer.
2. If the payload is larger than 2 MB, the client slices the buffer into 2 MB chunks (`2 * 1024 * 1024` bytes).
3. The client uploads each chunk sequentially to `/api/deployments/:id/chunk` (or `/api/services/:id/chunk`).
4. The Control Plane API stores chunks in Upstash Redis under `upload:<id>:chunk:0`, `upload:<id>:chunk:1`, etc.
5. Upon receiving the final chunk, the Control Plane enqueues the deployment job on BullMQ.
6. The Azure VM Build Worker reads and reassembles all chunks in order into a single continuous stream, writes `/opt/whizan/sources/<id>/source.tar.gz`, and extracts it.

---

### 2.3 Build Worker & Container Execution Sandbox
* **Location**: `apps/build-worker`
* **Process Manager**: Managed on Azure VM (`20.2.136.11`) via `sudo pm2` under name `build-worker` (or `whizan-worker`).
* **Isolation Sandbox**:
  - Frontend static assets built in ephemeral `node:20-slim` Docker containers (`apps/build-worker/src/docker-runner.ts`) and served via NGINX / Edge Router.
  - Backend microservices built and executed in dedicated Docker containers (`apps/build-worker/src/service-runner.ts`) with custom CPU/RAM quotas and host port mapping.
* **Cold-Boot & Reboot Safety**:
  - Source archives are permanently stored under `/opt/whizan-sources/` on the VM host disk (never `/tmp`).
  - Upon VM reboot or container restart, the worker automatically re-extracts the source from host disk without requiring re-upload.

---

## 3. Deployment Flow Comparison

| Feature | Direct Upload (`whizan_deploy_direct`) | Git Linked (`whizan_link_git_repo`) |
|---|---|---|
| **Source Origin** | Local IDE Workspace tarball | Remote GitHub Repository |
| **Upload Pathway** | 2MB Redis Chunking Engine | `git clone` / `git pull` on VM |
| **Git Auth Required** | No | Optional (Public or GitHub OAuth) |
| **Ignore Enforcement** | Client-side `.gitignore` + `DEFAULT_IGNORES` | `.gitignore` inside repo |
| **Re-deploy Mechanism** | Unpacks cached `/opt/whizan-sources` | `git pull origin <branch>` |
