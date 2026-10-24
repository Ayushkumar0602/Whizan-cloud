# Whizan Cloud DevOps MCP (`@whizan/mcp-devops`)

> Connect your AI coding assistant (Cursor, Antigravity, Claude Code, Windsurf, VS Code) to Whizan Cloud. Deploy fullstack web apps, backend APIs, and managed databases with simple chat prompts.

---

## 🚀 Quick Setup (Just 2 Steps)

### Step 1: Log in from your terminal (Do this once)

Open any terminal on your computer and run:

```bash
npx @whizan/mcp-devops login
```

* Your browser will automatically open to Whizan Cloud.
* Click **Authorize**.
* That's it! Your computer is now authenticated. You do **not** need to copy or paste any API keys.

---

### Step 2: Add to your favorite editor

Choose your editor below:

#### 🌟 Antigravity IDE
If you are using Antigravity, it is usually already configured!
To make sure or add it on a new computer, run:
```bash
npx @whizan/mcp-devops install --antigravity
```
*Or manually:* Add this to `~/.gemini/config/mcp_config.json`:
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

---

#### 🟣 Claude Code (Anthropic CLI)
Run this single command in your terminal:
```bash
claude mcp add whizan -- npx -y @whizan/mcp-devops
```
* To use it globally across all your projects:
  ```bash
  claude mcp add --scope user whizan -- npx -y @whizan/mcp-devops
  ```
* To check status in Claude Code, just type `/mcp` inside your Claude session.

---

#### ⚡ Cursor AI
Run in your terminal:
```bash
npx @whizan/mcp-devops install --cursor
```
*Or manually:* Open **Cursor Settings** → **Features** → **MCP**, click **Add New MCP Server**:
* **Name**: `whizan`
* **Type**: `command`
* **Command**: `npx -y @whizan/mcp-devops`

---

#### 🌊 Windsurf (Cascade)
Run in your terminal:
```bash
npx @whizan/mcp-devops install --windsurf
```
*Or manually:* Add it to `~/.codeium/windsurf/mcp_config.json`:
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

---

#### 🔷 VS Code
If your VS Code extension (like Cline, Roo Code, or the native MCP extension) shows a form:
* **Name**: `whizan`
* **Transport**: `Local command (stdio)`
* **Command**: `npx`
* **Arguments**: `-y @whizan/mcp-devops`

Or auto-configure for Cline / Roo Code via terminal:
```bash
npx @whizan/mcp-devops install --vscode
```

---

#### 🧡 Claude Desktop
Run in your terminal:
```bash
npx @whizan/mcp-devops install --claude
```

---

### 💡 Or install into ALL your editors at once:
```bash
npx @whizan/mcp-devops install
```
This automatically finds all installed editors on your Mac/Windows/Linux machine and configures them in 2 seconds.

---

## 💬 How to Use It With Your AI

Once configured, just talk to your AI assistant in plain English:

* **Deploy an application**:
  > *"Deploy this project to Whizan Cloud."*
* **Set up a database**:
  > *"Provision a PostgreSQL database for this project on Whizan and wire up the connection string."*
* **Deploy a Serverless Edge Function**:
  > *"Deploy my API endpoint as an edge function on Whizan."*
* **Fix port and network issues**:
  > *"Analyze this workspace with Whizan. Check for any localhost port binding traps before deploying."*
* **Manage Cloud Object Storage & Keys**:
  > *"Create a private storage bucket named 'invoices', generate a READ_WRITE storage access key, and wire WHIZAN_STORAGE_KEY into my environment variables."*
* **Live Application Runtime Logs**:
  > *"Check the application runtime stdout/stderr logs for my project to see why it crashed or returned an error."*
* **Check build logs**:
  > *"Check the latest Whizan build logs and make sure the server is healthy."*

---

## 🗄️ Cloud Object Storage Workflow for AI Agents

When building applications that interact with Whizan Cloud Object Storage:

1. **Inspect / Create Buckets**:
   * Use `whizan_storage_list_buckets` to discover existing buckets.
   * Use `whizan_storage_create_bucket` with `name` and `isPublic: false` (default private) or `true` (public CDN).
2. **Generate Storage API Keys (`whz_stg_live_...`)**:
   * Use `whizan_storage_create_api_key` with:
     * `name`: Label (e.g. `"Web App Upload Key"`)
     * `permission`: `"READ_WRITE"` (required for uploads) or `"READ_ONLY"`
     * `bucketId`: (Optional) Restrict key strictly to a single bucket. Leave empty for all buckets.
   * Note the returned **key ID** and **live key secret** (`whz_stg_live_...`).
3. **Configure Application Environment**:
   * Call `whizan_set_env_vars` to inject credentials before deployment:
     ```env
     WHIZAN_STORAGE_KEY=whz_stg_live_...
     WHIZAN_API_URL=https://api.whizan.cloud
     # For frontend client-side uploads (Next.js / Vite / Remix):
     NEXT_PUBLIC_WHIZAN_STORAGE_KEY=whz_stg_live_...
     ```
4. **Troubleshoot Storage Access**:
   * **403 FORBIDDEN**: Key permission is `READ_ONLY` or key is scoped to a different bucket. Call `whizan_storage_list_api_keys` to inspect scopes.
   * **401 UNAUTHORIZED**: Missing `Authorization: Bearer <key>` header or `WHIZAN_STORAGE_KEY` environment variable.
   * **502 / 503**: Application server threw an uncaught error. Call `whizan_get_application_logs` to inspect the exact container error stack trace.

---

## 🔍 Live Container Diagnostics & Application Logs

Whizan provides dual-tier logging and interactive runtime inspection:

* **Build Logs (`whizan_get_build_logs`)**: Captures npm install, Docker container synthesis, and asset compilation.
* **Application Runtime Logs (`whizan_get_application_logs`)**: Captures live `console.log`, `stdout`, and `stderr` directly from the active or recently exited container.
* **Interactive Container Exec (`whizan_exec_container_command`)**: Runs safe diagnostic commands inside running containers (`npx prisma migrate status`, `node -v`, `ps aux`, `df -h`).
* **Deployment Inspection (`whizan_inspect_deployment`)**: Checks mapped ports, restart counts, memory usage, and internal service mesh routing.

---

## 🛠️ Handy Terminal Commands

You can run these anytime in your terminal:

| Command | What it does |
|---|---|
| `npx @whizan/mcp-devops login` | Logs in your machine via browser (zero keys needed) |
| `npx @whizan/mcp-devops install` | Auto-configures all your installed AI editors |
| `npx @whizan/mcp-devops whoami` | Shows your logged-in email, plan, and server connection |
| `npx @whizan/mcp-devops logout` | Logs out and removes saved credentials from your machine |

---

## ❓ Frequently Asked Questions

#### 1. How do I verify it is working?
Run:
```bash
npx @whizan/mcp-devops whoami
```
If you see your email and `Authentication: Active`, you are all set!

#### 2. Where are my login credentials stored?
Stored locally in your user folder at `~/.whizan/config.json`. They are never committed to your code repository.

#### 3. What if I am on a remote server or Docker container without a browser?
You can generate a personal API key from your Whizan dashboard and use it directly:
```bash
npx @whizan/mcp-devops login -t whz_live_YOUR_API_KEY
```
Or pass it in your MCP config environment variables:
```json
{
  "mcpServers": {
    "whizan": {
      "command": "npx",
      "args": ["-y", "@whizan/mcp-devops"],
      "env": {
        "WHIZAN_API_URL": "https://api.whizan.cloud",
        "WHIZAN_API_KEY": "whz_live_YOUR_API_KEY"
      }
    }
  }
}
```

---

## 📄 License
MIT © Whizan Cloud Service
