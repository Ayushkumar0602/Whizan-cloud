# Whizan DevOps MCP — IDE Quickstart Guide

The **Whizan DevOps MCP Server** enables AI coding agents (inside Cursor, Windsurf, VS Code, Claude Desktop, Antigravity) to autonomously inspect your code, adapt it for production hosting, provision cloud databases, and deploy your services to **Whizan Cloud** without leaving your editor.

---

## 🚀 1. Getting Your API Key

1. Open your Whizan Dashboard:
   - **Local**: `http://localhost:3000/dashboard/settings`
   - **Production**: `https://whizan-cloud-service-dashboard.vercel.app/dashboard/settings`
2. Scroll to the **IDE DevOps MCP & API Keys** section.
3. Enter a label (e.g., `Cursor MacBook`) and click **Generate Key**.
4. Copy your generated key (`whz_live_...`).

---

## 🛠️ 2. Adding to Your IDE

### For Cursor (`.cursor/mcp.json` or Cursor Settings -> Features -> MCP)

Add the following to your `.cursor/mcp.json` (or your user MCP config):

```json
{
  "mcpServers": {
    "whizan": {
      "command": "node",
      "args": ["packages/mcp-devops/dist/index.js"],
      "env": {
        "WHIZAN_API_URL": "https://whizan-cloud-service.onrender.com",
        "WHIZAN_API_KEY": "whz_live_your_actual_key_here"
      }
    }
  }
}
```

*(If running locally, change `WHIZAN_API_URL` to `http://localhost:8000`)*

### For Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "whizan": {
      "command": "node",
      "args": ["/absolute/path/to/Whizan-cloud-service/packages/mcp-devops/dist/index.js"],
      "env": {
        "WHIZAN_API_URL": "https://whizan-cloud-service.onrender.com",
        "WHIZAN_API_KEY": "whz_live_your_actual_key_here"
      }
    }
  }
}
```

---

## 🤖 3. How to Use with Your AI Coding Agent

Once connected, your AI coding agent has full access to the Whizan DevOps toolset. Here are common prompts:

### Scenario A: Deploying a Decoupled Backend (React + Node + Firebase)
> **Prompt**: *"I want to deploy my Node.js backend to Whizan Cloud. Use the Whizan DevOps MCP to inspect my workspace, adapt the code to Whizan hosting requirements (ports, 0.0.0.0, CORS), deploy it, and rewire my React frontend to point to the new live backend URL."*

### Scenario B: Pre-Deployment Audit
> **Prompt**: *"Use `whizan_analyze_workspace` to check my project for hosting issues like hardcoded ports, loopback IP bindings, or missing production scripts."*

### Scenario C: Provisioning a Managed Database
> **Prompt**: *"Provision a managed PostgreSQL database with connection pooling on Whizan Cloud using `whizan_provision_database` and inject the connection string into my `.env`."*

---

## 🧰 4. Available MCP Tools Reference

| Tool Name | Parameters | What It Does |
|---|---|---|
| `whizan_auth_status` | *(none)* | Verifies connection and returns current user account details. |
| `whizan_login` | `apiKey`, `apiUrl?` | Authenticates with Whizan and saves credentials. |
| `whizan_analyze_workspace` | `workspaceDir` | Deep scan: finds frameworks, hardcoded ports, 127.0.0.1 bindings, missing CORS, and `.env` requirements. |
| `whizan_generate_patch` | `issue`, `framework?`, `backendUrl?`, `frontendOrigin?` | Generates drop-in code patches for port binding, CORS, health checks, or frontend rewiring. |
| `whizan_create_service` | `name`, `slug`, `language`, `startCommand?`, `envVars?` | Registers a new backend service in Whizan Cloud. |
| `whizan_create_project` | `name`, `slug`, `framework`, `buildCommand?`, `envVars?` | Registers a frontend/fullstack web project in Whizan Cloud. |
| `whizan_deploy_direct` | `targetType`, `targetId`, `workspaceDir` | Packs local source code (respecting `.gitignore`, omitting `node_modules`) into an archive and uploads directly for instant building. |
| `whizan_provision_database` | `name`, `type?`, `instanceType?`, `enablePooler?` | Provisions managed PostgreSQL, Redis, or MySQL. |
| `whizan_get_build_logs` | `deploymentId` | Fetches terminal build logs to diagnose or auto-heal build failures. |
| `whizan_check_health` | `url` | Pings live ingress URL to confirm HTTP 200 and CORS readiness. |
