# @whizan/cli — Whizan Cloud Command Line Interface

> Deploy fullstack apps, backend services, managed databases, edge functions, and scheduled cron jobs directly from your terminal.

---

## ⚡ Quick Start

### Installation

```bash
# Global installation (recommended)
npm install -g @whizan/cli

# Or run directly with npx
npx @whizan/cli login
npx @whizan/cli deploy
```

---

## 🔐 Authentication

### 1. Browser-based OAuth (Default)
Spins up a lightweight local callback server and opens your browser:
```bash
whizan login
```

### 2. Token-based Login (Headless / SSH / CI/CD)
```bash
whizan login -t whz_live_your_api_key
```

### Check Auth Identity
```bash
whizan whoami
```

### Log Out
```bash
whizan logout
```

---

## 🚀 Deployment (`whizan deploy`)

Run `whizan deploy` inside any project folder. The CLI automatically audits your project, packs the source (excluding `node_modules`, `.git`, and secrets), uploads it to Whizan Cloud, streams build logs in real-time, and probes the live health endpoint:

```bash
cd my-project
whizan deploy
```

### The 6-Phase Deployment Engine:
1. **[1/6] 🔐 Authentication Check**: Verifies active session and subscription plan.
2. **[2/6] 🔍 Workspace Audit**: Detects language, framework, ports, build/start commands, entry points, loopback binding issues, and referenced environment variables.
3. **[3/6] 📦 Tarball Creation**: Creates a compressed tarball respecting `.gitignore`, `.whizanignore`, and the 50MB ceiling.
4. **[4/6] 🚀 Cloud Provisioning & Upload**: Provisions service or edge project and uploads source to the build worker.
5. **[5/6] 🛠️ Real-Time Log Streaming**: Streams live container compilation and startup logs.
6. **[6/6] 🌐 Health Check Probe**: Probes `http://<slug>.20.2.136.11.nip.io` until HTTP 200 OK is verified.

### Non-Interactive / CI/CD Mode
```bash
whizan deploy --yes --env DATABASE_URL=$DATABASE_URL --env JWT_SECRET=$JWT_SECRET
```

### JSON Output Mode (for pipelines)
```bash
whizan deploy --yes --json
```

### Redeploying
```bash
whizan redeploy
```

---

## 🛠️ Supported Frameworks & Stacks

Whizan CLI supports zero-config deployment for:

- **Frontend & Fullstack Projects**:
  - Next.js (SSR, Standalone, App Router, Server Actions)
  - Vite (React, Vue, Svelte)
  - Create React App (CRA)
  - Astro (Static & SSR)
  - SvelteKit & Nuxt.js
  - Static HTML/CSS sites
- **Backend Microservices**:
  - Node.js (Express, Fastify, NestJS, Koa, Hono)
  - Python (FastAPI, Django, Flask)
  - Background Queue Workers (Celery, BullMQ, Kafka consumers)
  - Go (`go.mod`)
  - Any language via custom `Dockerfile` (Rust, Java Spring Boot, PHP Laravel, Ruby on Rails)

---

## 📋 Commands Reference

### Deploy & Project Management
| Command | Description |
|---|---|
| `whizan init` | Interactively generate a `.whizan.json` configuration file |
| `whizan deploy` | Run full 6-phase deployment pipeline |
| `whizan redeploy` | Re-deploy existing linked project with updated code |
| `whizan link <id>` | Link current folder to existing Whizan deployment |
| `whizan unlink` | Remove `.whizan.json` linkage |
| `whizan delete <id>` | Permanently delete a service or project |

### Monitoring & Operations
| Command | Description |
|---|---|
| `whizan top` | Real-time interactive terminal dashboard monitor (htop/k9s style) |
| `whizan ps` | List all active services, projects, functions, and crons |
| `whizan logs [id] [--tail]` | Stream live build or container output logs |
| `whizan logs [id] --ai "question"` | AI Log Intelligence — Diagnose crashes, errors, bottlenecks, and solutions |
| `whizan open [id]` | Open the live deployment URL in default web browser |
| `whizan exec -- CMD` | Execute diagnostic commands inside live container |

### Environment Variables
| Command | Description |
|---|---|
| `whizan env ls` | List configured environment variables |
| `whizan env set KEY=VAL` | Set one or more environment variables |
| `whizan env rm KEY` | Remove an environment variable |

### Managed Databases
| Command | Description |
|---|---|
| `whizan db ls` | List provisioned databases |
| `whizan db create <name>` | Provision PostgreSQL database |
| `whizan db create <name> --type REDIS` | Provision Redis database |
| `whizan db create <name> --bind <service-id>` | Auto-bind connection string to a service |

### Serverless Edge Functions
| Command | Description |
|---|---|
| `whizan fn ls` | List all serverless edge functions |
| `whizan fn deploy <file>` | Deploy ESM function bundle to isolated V8 runtime |
| `whizan fn invoke <slug> [--path /route]` | Invoke live function endpoint |

### Scheduled Cron Jobs
| Command | Description |
|---|---|
| `whizan cron ls` | List scheduled cron jobs |
| `whizan cron create <name> --schedule "*/5 * * * *"` | Schedule a cron job |
| `whizan cron trigger <id>` | Manually trigger immediate execution |

### AI & Agent Integration (MCP DevOps)
| Command | Description |
|---|---|
| `whizan mcp setup` | Configure Whizan MCP for Cursor, Antigravity, Claude Code, and Windsurf |
| `whizan mcp info` | Inspect MCP server status, tool inventory, and IDE configs |

---

## 🤖 AI Self-Healing & MCP Handshake (`whizan mcp setup`)

When a deployment fails (e.g. build error, syntax error, missing dependencies on cloud builders), Whizan CLI saves a failure snapshot to `.whizan.json` and renders an AI Agent Self-Healing banner with a ready-to-paste prompt.

Run:
```bash
whizan mcp setup
```
This automatically links **Cursor**, **Antigravity IDE**, **Claude Code**, and **Windsurf** to Whizan Cloud. Your AI assistant can now:
1. Automatically inspect cloud build failure logs with `whizan_get_build_logs`.
2. Edit and fix your broken code files directly in the editor.
3. Redeploy to the **SAME** cloud target with zero duplicate services via `whizan_deploy_direct`.

---

## 🛡️ Built-In Guardrails & Edge Case Protections

- **Loopback Trap Detection**: Detects and auto-patches `127.0.0.1` or `localhost` server listeners to `0.0.0.0` for Docker container mesh compatibility.
- **Next.js Static Export Detection**: Flags incompatible dynamic route exports (`output: 'export'` with `[id]` pages) and guides you to native Next.js SSR hosting.
- **Zero Secrets Upload**: Ensures `.env`, `.env.local`, `.git`, and sensitive credential files are excluded from source tarballs.
- **50MB Source Ceiling**: Warns and blocks upload if bulky directories like `venv/` or datasets are accidentally unignored.
- **Reboot Self-Healing**: Edge functions and cron jobs resume execution automatically on VM reboot without duplicate triggers.

---

## 📄 License

MIT © [Whizan Cloud](https://whizan.xyz)
