# Whizan DevOps MCP Server (`@whizan/mcp-devops`)

> Autonomous Cloud DevOps & In-IDE Deployment Engine for Antigravity IDE, Cursor, Windsurf, Claude Desktop, and VS Code.

The **Whizan DevOps MCP Server** empowers AI coding assistants (like Gemini, Cursor Composer, and Claude) to autonomously audit codebases, resolve networking/port traps, provision managed cloud databases, and deploy fullstack web apps and Docker backend services directly to **Whizan Cloud Service**.

---

## 🚀 How to Set Up (Choose Your Preferred Method)

We provide two frictionless methods to configure Whizan MCP in your editor:

```
┌────────────────────────────────────────────────────────────────────────┐
│ METHOD 1: 1-Command Terminal Setup (Fastest & Zero-Key)                 │
│ 1. npx @whizan/mcp-devops login    ──► Authenticate machine via browser│
│ 2. npx @whizan/mcp-devops install  ──► Auto-configures all AI editors  │
├────────────────────────────────────────────────────────────────────────┤
│ METHOD 2: Visual Form UI (VS Code "Add MCP server" Dialog)             │
│ Fill in Name, Transport, Command, Arguments in the GUI modal           │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Method 1: The 1-Command Magic Setup (Recommended)

You **never need to open JSON files or copy-paste API keys**. Run these two commands in your terminal:

#### Step 1: Link your machine to Whizan Cloud
```bash
npx @whizan/mcp-devops login
```
* Opens your browser automatically to authorize your machine.
* Securely stores your session in `~/.whizan/config.json`.
* **Zero API keys needed in your project or config files.**

#### Step 2: Auto-register into all your IDEs
```bash
npx @whizan/mcp-devops install
```
* Automatically detects installed editors on your machine:
  * **Antigravity IDE** (`~/.gemini/config/mcp_config.json` & `~/.gemini/antigravity-ide/mcp_config.json`)
  * **Cursor AI** (`~/.cursor/mcp.json`)
  * **Windsurf (Codeium Cascade)** (`~/.codeium/windsurf/mcp_config.json`)
  * **Claude Desktop** (`claude_desktop_config.json`)
  * **VS Code (Cline & Roo Code)** (`cline_mcp_settings.json`)
* Safely merges `whizan` without touching any of your other existing MCP tools.
* **Restart your editor**, and you're ready to deploy!

> **Target a specific editor**:
> ```bash
> npx @whizan/mcp-devops install --cursor
> npx @whizan/mcp-devops install --windsurf
> npx @whizan/mcp-devops install --claude
> npx @whizan/mcp-devops install --antigravity
> npx @whizan/mcp-devops install --vscode
> ```

---

### Method 2: Visual Form UI (For VS Code, Windsurf, or Cursor Dialogs)

Many editors provide a visual **"Add MCP server"** popup modal instead of JSON files. Fill out these exact values:

| Field in Modal | What to Enter | Description |
|---|---|---|
| **Name** | `whizan` | The identifier for the MCP server |
| **Transport** | `Local command (stdio)` | Standard I/O process transport |
| **Command** | `npx` | Node package runner |
| **Arguments** | `-y @whizan/mcp-devops` | Automatically downloads and executes the latest engine |

Click **Save** / **Add**, and the server connects immediately over stdio.

---

### Method 3: Manual JSON Configuration (For CI/CD or Power Users)

If you prefer to configure your JSON files manually or are running in remote containers / CI pipelines:

```json
{
  "mcpServers": {
    "whizan": {
      "command": "npx",
      "args": ["-y", "@whizan/mcp-devops"]
    }
  }
}
```

> **Note**: If running on a headless machine without browser access, pass your API key as an environment variable:
> ```json
> {
>   "mcpServers": {
>     "whizan": {
>       "command": "npx",
>       "args": ["-y", "@whizan/mcp-devops"],
>       "env": {
>         "WHIZAN_API_URL": "https://whizan-cloud-service.onrender.com",
>         "WHIZAN_API_KEY": "whz_live_YOUR_KEY_HERE"
>       }
>     }
>   }
> }
> ```
> Generate API keys on your dashboard at: [https://whizan-cloud-service-dashboard.vercel.app/dashboard/mcp/api-keys](https://whizan-cloud-service-dashboard.vercel.app/dashboard/mcp/api-keys)

---

## 🖥️ Terminal CLI Commands

| Command | Action |
|---|---|
| `npx @whizan/mcp-devops login` | Authenticate your machine via browser (zero API key needed) |
| `npx @whizan/mcp-devops login -t <key>` | Authenticate with an explicit `whz_live_...` API key |
| `npx @whizan/mcp-devops install` | Auto-detect & register MCP into Antigravity, Cursor, Windsurf, Claude, VS Code |
| `npx @whizan/mcp-devops whoami` | Inspect active account profile, subscription tier, and connected endpoint |
| `npx @whizan/mcp-devops logout` | Remove stored local machine credentials |
| `npx @whizan/mcp-devops --help` | View help and supported flags |

---

## 🛠️ The 32 Autonomous DevOps Capabilities

| Category | Capability | Tool Name |
|---|---|---|
| **Audit & Guardrails** | Scans repo files, detects framework & port, enforces AI safety guardrails | `whizan_analyze_workspace` |
| **Auto-Healing** | Resolves `127.0.0.1` binding traps to `0.0.0.0`, configures CORS, injects PORT | `whizan_generate_patch` |
| **Direct Upload** | In-memory tarball streaming straight to cloud VM without Git push | `whizan_deploy_direct` |
| **Compute & Microservices** | Registers Docker microservices (Node, Python, Go, Rust, Java, Dockerfile) | `whizan_create_service` |
| **Web Apps & Frontends** | Edge-routed static or SSR web applications (Next.js, Vite, React, Astro) | `whizan_create_project` |
| **Data Persistence** | Managed PostgreSQL, Redis, or MySQL database provisioning | `whizan_provision_database` |
| **Live Build Telemetry** | Real-time log streaming from the Azure VM worker | `whizan_get_build_logs` |
| **Verification & Rewiring** | Health checks (HTTP 200 OK) and automatic frontend `.env` rewiring | `whizan_check_health` |
| **Serverless Edge** | V8 Edge Functions with sub-5ms cold starts | `whizan_create_function_service`, `whizan_deploy_function` |
| **Scheduled Tasks** | Zero-idle cron compute engines with Redis micro-scheduling | `whizan_create_cron_job`, `whizan_list_cron_jobs` |
| **Live Diagnostics** | Safe command execution (`npx prisma migrate status`, `df -h`) inside running containers | `whizan_exec_container_command` |
| **CI/CD Pipelines** | DAG workflow execution engines (Whizan Flow) | `whizan_create_workflow`, `whizan_trigger_workflow` |

---

## 📄 License
MIT © Whizan Cloud Service
