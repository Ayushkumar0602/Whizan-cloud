# Whizan DevOps MCP Server — Architectural & Product Specification

> **Mission**: Empower AI coding agents (inside Cursor, Windsurf, VS Code, Claude Desktop, Antigravity) to autonomously analyze, adapt, configure, deploy, and wire user codebases to **Whizan Cloud Service** with zero manual DevOps friction.

---

## 1. Executive Summary & Vision

Modern "vibe coders" and full-stack developers frequently construct complex applications (e.g., React frontend + Node/Express backend + Firebase/Supabase/Postgres) entirely within AI-assisted IDEs. However, **deployment remains a massive bottleneck**:
- Users do not understand containerization, reverse proxying, port bindings, or environment variable encryption.
- They struggle with hybrid hosting setups (e.g., frontend on Firebase/Vercel, backend needing a live Node server).
- They struggle with CORS errors, hardcoded `localhost:5000` URLs, missing production build scripts, and `.gitignore` file omissions.

**Whizan DevOps MCP** turns any AI coding agent into an **Autonomous DevOps Engineer**. Through standard Model Context Protocol (MCP) primitives (Tools, Resources, Prompts), the agent can:
1. **Analyze** the user's local workspace (polyrepo, monorepo, mixed tech stack).
2. **Align** with the user (asking targeted questions: "Do you want to deploy just the Node backend, or the whole stack?").
3. **Adapt** the codebase to meet strict Whizan hosting standards (injecting dynamic `PORT`, binding to `0.0.0.0`, fixing CORS, adding health checks).
4. **Deploy & Provision** the service and managed databases on Whizan via secure API integration.
5. **Rewire** the frontend automatically to point to the newly provisioned backend URL, verifying end-to-end connectivity without leaving the IDE.

---

## 2. System Architecture & Component Interactions

```
┌────────────────────────────────────────────────────────────────────────┐
│                          User's IDE (Cursor / VS Code / Windsurf)      │
│                                                                        │
│   ┌──────────────────────────┐         ┌───────────────────────────┐   │
│   │    AI Coding Agent       │ ◄─────► │    Whizan DevOps MCP      │   │
│   │  (Cursor, Claude, etc.)  │   MCP   │   (Local stdio process)   │   │
│   └─────────────┬────────────┘ Protocol└─────────────┬─────────────┘   │
│                 │                                    │                 │
│      Edits Code │ & Configs               HTTPS / WSS│ API Calls       │
│                 ▼                                    ▼                 │
│   ┌──────────────────────────┐         ┌───────────────────────────┐   │
│   │      User Codebase       │         │   Whizan Cloud API        │   │
│   │  (React + Node + .env)   │         │  (Render / Self-hosted)   │   │
│   └──────────────────────────┘         └─────────────┬─────────────┘   │
└──────────────────────────────────────────────────────┼─────────────────┘
                                                       │
                                  BullMQ / Redis       │
                                                       ▼
                                         ┌───────────────────────────┐
                                         │  Azure Compute & Workers  │
                                         │ (Docker, Router, DBs)     │
                                         └───────────────────────────┘
```

### Communication Flow:
1. **MCP Discovery**: The IDE initializes the `whizan-mcp` server over `stdio`.
2. **Context Injection**: MCP exposes tools and a system prompt defining Whizan hosting prerequisites.
3. **Interactive Analysis**: The AI agent calls `whizan_analyze_workspace` to inspect the project layout and dependencies.
4. **Remediation**: The AI agent modifies user code (ports, hosts, CORS, scripts).
5. **Secure Dispatch**: MCP encrypts `.env` variables and registers the project via the Whizan API.
6. **Live Telemetry**: MCP streams live build logs via SSE back into the agent context.
7. **Post-Deploy Wiring**: MCP provides the live URL (e.g. `https://api-service.whizan.cloud`); the AI agent updates client API configs.

---

## 3. Core Feature Set

### Feature 1: Workspace Auto-Discovery & Topology Detection
- **Multi-project Detection**: Identifies whether the workspace is a standalone backend, standalone frontend, fullstack monorepo (Turborepo, Nx, npm workspaces), or multi-folder setup (`/client` and `/server`).
- **Runtime & Language Fingerprinting**: Detects Node.js (Express, Fastify, Nest, Next), Python (FastAPI, Flask, Django), Go, or static frameworks (Vite, React SPA, Astro).
- **Dependency & Port Audit**: Searches source code for `app.listen()`, `server.listen()`, `uvicorn.run()`, finding hardcoded ports and IP bindings.
- **Environment Variable Mapping**: Scans source files for `process.env.*`, `os.getenv()`, comparing against `.env`, `.env.example`, and `.env.local`.

### Feature 2: Interactive User-in-the-Loop Alignment
- The MCP agent never executes destructive or billable deployments silently.
- It prompts the user via conversational checkpoints:
  - *Target Scope*: "I detected a React frontend and a Node backend. Would you like to deploy **Backend Only** (keeping your React app on Firebase), or **Deploy Both** to Whizan?"
  - *Tier Selection*: "Would you like the **Free Tier** (auto-sleep after 15m of inactivity) or **Starter Tier** (always-on, 0.5 vCPU)?"
  - *Database Needs*: "Your backend requires PostgreSQL. Would you like Whizan to provision a managed PostgreSQL database instance automatically?"

### Feature 3: Automated Codebase Adaptation (Hosting Prerequisites)
Before code can deploy successfully on Whizan's isolated Docker architecture, the agent adapts the code:
1. **Dynamic Port Binding**:
   - Modifies `app.listen(5000)` to:
     ```javascript
     const PORT = process.env.PORT || 8000;
     app.listen(PORT, "0.0.0.0", () => console.log(`Listening on ${PORT}`));
     ```
2. **CORS Sanitization**:
   - Ensures cross-origin requests from the frontend domain (or preview URLs) are accepted with credentials.
3. **Health Check Injection**:
   - Adds a lightweight `GET /health` or `GET /` endpoint returning `200 OK` for the Docker runner health check.
4. **Production Scripts Verification**:
   - In Node.js: Ensures `package.json` contains valid `"build"` and `"start"` scripts (e.g., `tsc && node dist/index.js` or `node src/index.ts`).
   - In Python: Ensures `requirements.txt` contains `uvicorn` / `gunicorn` and the start script is specified.

### Feature 4: Secure Secrets Extraction & Cloud Sync
- Scans local `.env` files.
- Filters out non-sensitive local flags (e.g. `DEBUG=true`).
- Interactively confirms missing production secrets with the user (e.g., third-party API keys).
- Encrypts secrets client-side or transmits them over TLS directly to Whizan API's AES-256-GCM vault.

### Feature 5: Managed Database Auto-Provisioning
- If a database is needed:
  - MCP calls `whizan_provision_database` (PostgreSQL, Redis, or MySQL).
  - Whizan provisions a container with persistent host volumes, automatic TLS, and connection pooler.
  - MCP injects the resulting `DATABASE_URL` directly into the backend service environment variables.

### Feature 6: End-to-End Rewiring & Verification
- Once the backend is `READY`:
  - Whizan assigns a public ingress URL: `https://<service-slug>.whizan.cloud`.
  - The AI agent finds frontend configuration files (e.g., `src/api/client.ts`, `.env.production`, `VITE_API_URL`, `NEXT_PUBLIC_API_URL`).
  - Automatically updates the base URL from `http://localhost:5000` to the live Whizan URL.
  - Sends a test HTTP health check request to verify the new live link.

---

## 4. MCP Tool Definitions (API Interface)

| Tool Name | Parameters | Description |
|---|---|---|
| `whizan_auth_status` | *None* | Verifies if the user is authenticated with Whizan Cloud. Returns user email, account tier, and organization. |
| `whizan_login` | `apiKey?: string` | Authenticates via direct API key or initiates an OAuth / browser token exchange. |
| `whizan_analyze_workspace` | `workspacePath: string` | Scans directories, identifies runtimes, framework types, listening ports, `.env` dependencies, and compatibility issues. |
| `whizan_generate_patch` | `component: "backend" \| "frontend"`, `issue: string` | Generates recommended code diffs to fix ports, CORS, or scripts to satisfy Whizan requirements. |
| `whizan_provision_database` | `name: string`, `type: "POSTGRESQL" \| "REDIS" \| "MYSQL"`, `instanceType: "starter" \| "pro"` | Provisions a dedicated managed database container and returns encrypted connection strings. |
| `whizan_create_service` | `name: string`, `slug: string`, `language: string`, `rootDir: string`, `installCmd: string`, `startCmd: string`, `internalPort: number`, `autoSleep: boolean`, `envVars: Record<string, string>` | Registers a new backend service or frontend project in Whizan Cloud. |
| `whizan_deploy` | `serviceId: string`, `branch?: string`, `commitHash?: string`, `directUpload?: boolean` | Enqueues a deployment job on Whizan. Returns deployment ID for tracking. |
| `whizan_get_build_logs` | `deploymentId: string`, `tail?: number` | Fetches real-time stdout/stderr build logs for debugging build failures. |
| `whizan_check_health` | `url: string` | Pings the live deployment URL to confirm HTTP 200 readiness and verify CORS responses. |

---

## 5. Comprehensive Edge Cases & Battle-Tested Solutions

### Edge Case 1: The Hardcoded `localhost` / `127.0.0.1` Trap
- **The Issue**: Express/Fastify/Python code explicitly does `app.listen(8000, "127.0.0.1")`. Inside a Docker container, binding to `127.0.0.1` makes the service unreachable from the host or Edge Router, leading to a permanent 502/timeout error.
- **Solution**:
  - `whizan_analyze_workspace` runs AST parsing or regex pattern matching on server entry files.
  - If a loopback IP or omitted host is found, the agent rewrites it to `0.0.0.0`.

### Edge Case 2: Hardcoded / Mismatched Internal Ports
- **The Issue**: The user’s code is hardcoded to listen on port `3001` or `5000`. Whizan's worker defaults to port `8000` and waits for port `8000` to become healthy. The build fails after 300s timeout.
- **Solution**:
  - Two-way reconciliation:
    1. The agent adjusts the code to `process.env.PORT || 8000`.
    2. Alternatively, MCP detects the hardcoded port (e.g., `5000`) and passes `internalPort: 5000` during `whizan_create_service`, aligning Whizan's health check with user code.

### Edge Case 3: CORS Rejection Between Decoupled Frontends and Whizan Backends
- **The Issue**: User deploys backend to Whizan (`https://api-service.whizan.cloud`) while their frontend is on Firebase (`https://my-app.web.app`). When the frontend calls the backend, the browser blocks the request due to missing CORS headers.
- **Solution**:
  - MCP asks for or detects the frontend URL.
  - Automatically installs/configures `cors` middleware in Express/Fastify:
    ```javascript
    import cors from "cors";
    app.use(cors({
      origin: ["https://my-app.web.app", "http://localhost:3000"],
      credentials: true
    }));
    ```

### Edge Case 4: Git Status — Dirty Working Tree or Unpushed Repos
- **The Issue**: Whizan's worker pulls code by cloning GitHub (`simple-git`). If the user made changes locally but has not committed or pushed, the cloud worker builds stale code.
- **Solution**:
  - MCP checks git status using local git CLI.
  - If uncommitted changes exist, the AI agent asks the user: *"You have uncommitted changes. Should I commit them with message 'chore: prepare for Whizan deployment' and push to origin/main?"*
  - **Fallback for Non-Git/Private Projects**: MCP supports a `directUpload` fallback where the local workspace (excluding `node_modules` and `.git`) is zipped into a tarball and uploaded directly to Whizan API's staging endpoint.

### Edge Case 5: Ignored Secret Files (e.g., `serviceAccountKey.json`)
- **The Issue**: Firebase Admin SDK relies on `serviceAccountKey.json`, which is in `.gitignore`. When GitHub builds on Whizan, the file is missing and the server crashes on boot.
- **Solution**:
  - MCP scans source code for file reads (`fs.readFileSync("serviceAccountKey.json")`, `GOOGLE_APPLICATION_CREDENTIALS`).
  - If the target file is in `.gitignore`, the agent recommends converting it to an environment variable:
    ```javascript
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    ```
  - MCP securely pushes the JSON string to Whizan environment variables.

### Edge Case 6: Localhost Database Fallacy
- **The Issue**: Code contains `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mydb"`. When deployed to Whizan, `localhost` refers to the container itself, where no database exists.
- **Solution**:
  - MCP flags `localhost` or `127.0.0.1` inside connection strings.
  - Prompts user: *"Your database is set to localhost. Would you like Whizan to provision a managed cloud PostgreSQL database for you?"*
  - Automatically provisions the DB and swaps the connection string.

### Edge Case 7: Missing Native Build Tools & Production Dependencies
- **The Issue**: TypeScript projects frequently place `typescript` or `tsx` in `devDependencies`. In production Docker builds with `NODE_ENV=production`, `devDependencies` are omitted, causing `tsc: command not found`.
- **Solution**:
  - MCP inspects `package.json`.
  - Ensures required runtime builders (`tsx`, `ts-node`, or compiled `dist` output) are either compiled during build or placed in `dependencies`.

### Edge Case 8: Scale-to-Zero Cold Starts (First Request Latency)
- **The Issue**: On the Free Tier, inactive backend services spin down to 0 vCPU after 15 minutes. The first incoming request from the user's frontend takes 2–3 seconds to wake up.
- **Solution**:
  - MCP inspects frontend API clients and injects a transparent health ping or retry mechanism with exponential backoff on 502 / 503 wakeup responses.

---

## 6. Implementation Challenges & Engineering Roadmap

### Challenge 1: Secure Credential Transmission from Local IDE to Cloud
- **Risk**: Exposing user API keys or database passwords in agent conversation logs.
- **Remediation**:
  - MCP handles secret encryption locally using the Whizan public key or vault before passing values to tools.
  - Secrets are masked in agent tool responses (`value: "••••••••"`).

### Challenge 2: Synchronizing Multi-repo / Monorepo Deployments
- **Risk**: In monorepos, deploying the backend before the frontend or vice versa can break dependencies.
- **Remediation**:
  - MCP orchestrates sequential dependency pipelines:
    1. Provision Database $\rightarrow$ Obtain credentials.
    2. Deploy Backend with DB credentials $\rightarrow$ Obtain live API URL.
    3. Inject Backend URL into Frontend env $\rightarrow$ Deploy Frontend.

### Challenge 3: Real-Time Error Self-Healing Loop
- **Risk**: Build fails in the cloud; user is stranded without logs.
- **Remediation**:
  - MCP streams Docker build errors directly to the AI agent's prompt context.
  - The AI agent diagnoses the error (e.g. *"Missing package 'dotenv' on line 3 of server.js"*), edits `package.json`, and re-triggers the build autonomously.
