# Whizan DevOps MCP Server (`@whizan/mcp-devops`)

> Autonomous In-IDE Cloud DevOps & Deployment Protocol for Antigravity IDE, Cursor, Windsurf, Claude Desktop, and VS Code.

The **Whizan DevOps MCP Server** enables AI coding assistants to autonomously inspect repositories, resolve deployment traps, provision managed cloud databases, and deploy fullstack web apps and backend microservices to **Whizan Cloud Service**.

---

## ⚡ Quickstart

### 1. Get an API Key
Generate a Whizan Live API Key from your **Whizan Cloud Dashboard**:
[https://whizan-cloud-service-dashboard.vercel.app/dashboard/settings](https://whizan-cloud-service-dashboard.vercel.app/dashboard/settings)

### 2. Configure Your IDE

Add the following to your IDE's MCP configuration file:

#### For Antigravity IDE (`~/.gemini/antigravity-ide/mcp_config.json`)
```json
{
  "mcpServers": {
    "whizan": {
      "command": "npx",
      "args": ["-y", "@whizan/mcp-devops"],
      "env": {
        "WHIZAN_API_URL": "https://whizan-cloud-service.onrender.com",
        "WHIZAN_API_KEY": "whz_live_your_api_key_here"
      }
    }
  }
}
```

#### For Cursor (`.cursor/mcp.json` or Settings → Features → MCP)
```json
{
  "mcpServers": {
    "whizan": {
      "command": "npx",
      "args": ["-y", "@whizan/mcp-devops"],
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
      "command": "npx",
      "args": ["-y", "@whizan/mcp-devops"],
      "env": {
        "WHIZAN_API_URL": "https://whizan-cloud-service.onrender.com",
        "WHIZAN_API_KEY": "whz_live_your_api_key_here"
      }
    }
  }
}
```

---

## 🛠️ The 14 Autonomous DevOps Tools

| Tool | Purpose |
|---|---|
| `whizan_auth_status` | Verify API key credentials and subscription tier |
| `whizan_analyze_workspace` | Phase 1: AI workspace scan, runtime detection & port inspection |
| `whizan_generate_patch` | Generate drop-in code fixes for 0.0.0.0 binding and health endpoints |
| `whizan_create_project` | Phase 3: Register frontend web apps (Vite, Next.js, React, Astro) |
| `whizan_create_service` | Phase 3: Register backend microservices (Node, Python, Go, Docker) |
| `whizan_deploy_direct` | Phase 4: Stage & upload project tarball via 2MB chunking engine |
| `whizan_get_build_logs` | Phase 5: Poll live build worker execution logs and status |
| `whizan_check_health` | Phase 6: Verify deployment health (HTTP 200 OK) |
| `whizan_provision_database` | Spin up managed PostgreSQL, Redis, or MySQL databases |
| `whizan_set_env_vars` | Inject runtime environment variables into services |
| `whizan_create_function_service` | Deploy sub-5ms V8 Serverless Edge Functions |
| `whizan_create_cron_job` | Schedule zero-idle background cron jobs |
| `whizan_exec_container_command` | Execute non-destructive diagnostics inside running containers |
| `whizan_get_analytics` | Query real-time traffic, CPU, and memory analytics |

---

## 📄 License
MIT © Whizan Cloud Service
