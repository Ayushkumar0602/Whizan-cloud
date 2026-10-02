# Whizan DevOps MCP Setup Guide

This guide explains how to connect **Antigravity IDE, Cursor, Windsurf, VS Code, and Claude Desktop** to Whizan Cloud using `@whizan/mcp-devops`.

---

## ⚡ Solution 1: The 1-Command Magic Setup (Terminal Auto-Installer)

> **Best for:** Developers who want zero manual configuration, zero JSON editing, and zero API keys in config files.

### Step 1: Link your computer (Run once)
In your terminal, run:
```bash
npx @whizan/mcp-devops login
```
* Your default web browser will open to the Whizan Cloud authorization page.
* Click **Authorize**.
* Your session token is saved securely in `~/.whizan/config.json`.

### Step 2: Auto-register into your IDEs
In your terminal, run:
```bash
npx @whizan/mcp-devops install
```
* The installer automatically scans your computer and configures:
  * **Antigravity IDE** (`~/.gemini/config/mcp_config.json` & `~/.gemini/antigravity-ide/mcp_config.json`)
  * **Cursor AI** (`~/.cursor/mcp.json`)
  * **Windsurf (Cascade)** (`~/.codeium/windsurf/mcp_config.json`)
  * **Claude Desktop** (`claude_desktop_config.json`)
  * **VS Code (Cline / Roo Code)** (`cline_mcp_settings.json`)
* Existing servers in your configs are preserved safely.

### Step 3: Restart your IDE
Restart your editor. Your AI assistant will now automatically recognize Whizan Cloud deployment tools.

> **Target a specific IDE:**
> ```bash
> npx @whizan/mcp-devops install --cursor        # Only Cursor
> npx @whizan/mcp-devops install --windsurf      # Only Windsurf
> npx @whizan/mcp-devops install --antigravity   # Only Antigravity
> npx @whizan/mcp-devops install --claude        # Only Claude Desktop
> npx @whizan/mcp-devops install --vscode        # Only VS Code (Cline/Roo)
> ```

---

## 📋 Solution 2: Visual Form UI (GUI "Add MCP Server" Dialog)

> **Best for:** VS Code, Cursor, or Windsurf when using the visual settings form instead of JSON.

When you click **Add MCP server** in your IDE's settings or sidebar, fill in the following values:

```
┌────────────────────────────────────────────────────────┐
│ Add MCP server                                         │
├────────────────────────────────────────────────────────┤
│ Name:        whizan                                    │
│                                                        │
│ Transport:   ● Local command (stdio)                   │
│              ○ HTTP (remote)                           │
│              ○ SSE (remote, legacy)                    │
│                                                        │
│ Command:     npx                                       │
│                                                        │
│ Arguments:   -y @whizan/mcp-devops                     │
└────────────────────────────────────────────────────────┘
```

| Form Field | Exact Value to Enter | Why |
|---|---|---|
| **Name** | `whizan` | Identifier for the MCP server |
| **Transport** | `Local command (stdio)` | Standard I/O communication |
| **Command** | `npx` | Runs the package executor |
| **Arguments** | `-y @whizan/mcp-devops` | Automatically downloads and executes the latest package |

Click **Save** or **Add Server**.

---

## 🔑 Solution 3: Manual JSON Configuration (For CI/CD or Remote Servers)

> **Best for:** Headless Linux servers, Docker containers, or GitHub Actions pipelines where browser login isn't possible.

Add the following to your IDE's MCP config:

```json
{
  "mcpServers": {
    "whizan": {
      "command": "npx",
      "args": ["-y", "@whizan/mcp-devops"],
      "env": {
        "WHIZAN_API_URL": "https://whizan-cloud-service.onrender.com",
        "WHIZAN_API_KEY": "whz_live_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

You can generate API keys directly on your Whizan dashboard at:
[https://whizan-cloud-service-dashboard.vercel.app/dashboard/mcp/api-keys](https://whizan-cloud-service-dashboard.vercel.app/dashboard/mcp/api-keys)

---

## 🧪 Testing Your Connection

Once configured, verify your setup from your terminal:

```bash
npx @whizan/mcp-devops whoami
```

You will see:
```text
  ██╗    ██╗██╗  ██╗██╗███████╗ █████╗ ███╗   ██╗
  ██║    ██║██║  ██║██║╚══███╔╝██╔══██╗████╗  ██║
  ██║ █╗ ██║███████║██║  ███╔╝ ███████║██╔██╗ ██║
  ██║███╗██║██╔══██║██║ ███╔╝  ██╔══██║██║╚██╗██║
  ╚███╔███╔╝██║  ██║██║███████╗██║  ██║██║ ╚████║
   ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝
  Whizan Cloud DevOps MCP Engine • v1.0.2

  ┌────────────────────────────────────────────────────────────────────────┐
  │  SYSTEM RUNTIME & CLUSTER STATUS                                       │
  ├────────────────────────────────────────────────────────────────────────┤
  │  Runtime Status:     ● READY (stdio JSON-RPC active)                   │
  │  Authentication:     user@example.com [ROOT_ADMIN] [HOBBY]             │
  │  Target Endpoint:    https://whizan-cloud-service.onrender.com         │
  │  Capabilities:       32 DevOps tools active                            │
  └────────────────────────────────────────────────────────────────────────┘
```

---

## 💬 Sample Prompts to Try in Your Editor

Once installed, open your AI chat (Cursor Composer, Windsurf Cascade, Claude, or Antigravity) and try:

1. **Fullstack Deploy**:
   > *"Analyze this workspace with Whizan MCP. Audit my backend port, provision a managed PostgreSQL database, deploy the backend to Whizan Cloud, and rewire the frontend API URL."*

2. **Direct Upload (No Git push required)**:
   > *"Deploy my server folder to Whizan Cloud using direct upload."*

3. **Check Traps**:
   > *"Run whizan_analyze_workspace to check if my app has 127.0.0.1 binding traps or missing CORS headers."*
