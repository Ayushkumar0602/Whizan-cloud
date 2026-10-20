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
* **Check build logs**:
  > *"Check the latest Whizan build logs and make sure the server is healthy."*

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
