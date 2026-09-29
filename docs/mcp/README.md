# Whizan DevOps MCP Server — Master Documentation

Welcome to the official documentation for the **Whizan DevOps MCP Server** (`@whizan/mcp-devops`).

The Whizan DevOps MCP Server turns any Model Context Protocol (MCP) compliant AI coding agent—including Cursor, Windsurf, VS Code, Claude Desktop, and Antigravity—into an **Autonomous DevOps Engineer**. It enables AI agents to audit local workspaces, adapt user code for cloud hosting, set up environment variables, provision managed databases, deploy backend microservices and frontend web apps, poll build telemetry, and run live health checks without leaving the editor.

---

## 📚 Documentation Index

| Guide | Description |
|---|---|
| 📐 [**Architecture & System Design**](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/mcp/architecture.md) | Deep dive into the MCP server architecture, Upstash Redis 2MB chunking engine, direct upload vs. Git pipelines, and Azure VM execution model. |
| 🛑 [**Mandatory 6-Phase Protocol Guide**](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/mcp/protocol_guide.md) | The strict 6-phase deployment protocol that AI agents MUST follow to ensure zero-downtime, non-destructive deployments. |
| 🧰 [**Exhaustive Tool Reference**](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/mcp/tool_reference.md) | Detailed specifications for all 14 MCP tools, including input schemas, execution behavior, return structures, and example calls. |
| 🛠️ [**Troubleshooting & Edge Cases**](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/mcp/troubleshooting.md) | Battle-tested solutions for common errors (macOS AppleDouble `._*` permission errors, Docker `chmod` traps, 0.0.0.0 binding, PM2 `sudo` commands, and Port 80 HTTP ingress). |

---

## 🚀 Quick Setup Guide

### 1. Generate Your API Key
1. Navigate to the Whizan Dashboard:
   - **Production**: `https://whizan-cloud-service-dashboard.vercel.app/dashboard/settings`
   - **Local**: `http://localhost:3000/dashboard/settings`
2. Under **IDE DevOps MCP & API Keys**, enter a label (e.g., `Cursor Mac`) and click **Generate Key**.
3. Copy your API Key starting with `whz_live_...`.

### 2. Configure Your IDE

#### For Cursor (`.cursor/mcp.json` or Settings -> Features -> MCP)
```json
{
  "mcpServers": {
    "whizan": {
      "command": "node",
      "args": ["packages/mcp-devops/dist/index.js"],
      "env": {
        "WHIZAN_API_URL": "https://whizan-cloud-service.onrender.com",
        "WHIZAN_API_KEY": "whz_live_your_api_key_here"
      }
    }
  }
}
```

#### For Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "whizan": {
      "command": "node",
      "args": ["/absolute/path/to/Whizan-cloud-service/packages/mcp-devops/dist/index.js"],
      "env": {
        "WHIZAN_API_URL": "https://whizan-cloud-service.onrender.com",
        "WHIZAN_API_KEY": "whz_live_your_api_key_here"
      }
    }
  }
}
```

---

## 🛠️ The 14 Standard MCP Tools Overview

1. `whizan_auth_status` — Verifies authentication status & account tier.
2. `whizan_login` — Configures or updates API key credentials.
3. `whizan_analyze_workspace` — **PHASE 1**: Audits workspace structure, runtimes, port bindings, and `.env` requirements.
4. `whizan_generate_patch` — Generates drop-in code patches for hosting fixes (0.0.0.0 binding, CORS, health endpoints).
5. `whizan_create_service` — **PHASE 3 (Backend)**: Registers backend microservice (Node.js, Python, Go, Dockerfile).
6. `whizan_create_project` — **PHASE 3 (Frontend)**: Registers frontend web application (Vite, Next.js, React, Astro).
7. `whizan_deploy_direct` — **PHASE 4**: Archives workspace (excluding `node_modules`, `._*`) and uploads via 2MB chunking engine.
8. `whizan_provision_database` — Provisions managed PostgreSQL, Redis, or MySQL databases with connection pooling.
9. `whizan_get_build_logs` — **PHASE 5**: Polls execution logs and build status from the Azure VM worker.
10. `whizan_set_env_vars` — **PHASE 2**: Encrypts and registers environment variables before build starts.
11. `whizan_check_health` — **PHASE 6**: Pings public HTTP URL (`http://<slug>.20.2.136.11.nip.io/health`) to confirm readiness.
12. `whizan_redeploy` — Triggers fresh deployment using cached source code or a specified Git branch.
13. `whizan_link_git_repo` — Connects a public/private GitHub repository for automated builds.
14. `whizan_delete_resource` — Completely stops, purges Docker containers, and removes disk volumes for a service/project.
