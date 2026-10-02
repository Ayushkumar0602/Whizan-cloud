# Whizan DevOps MCP Setup Guide

This guide shows you how to connect your AI editor (**Antigravity, Claude Code, Cursor, Windsurf, VS Code, Claude Desktop**) to **Whizan Cloud**.

---

## ⚡ Super Fast Setup (2 Simple Steps)

### Step 1: Log In (Once)
Open any terminal on your computer and run:
```bash
npx @whizan/mcp-devops login
```
* Your web browser will open automatically.
* Click **Authorize**.
* Done! Your machine is now connected. No API keys to copy or paste.

---

### Step 2: Choose Your Editor

#### 🌟 1. Antigravity IDE
Whizan is usually **already installed** on your machine if you use Antigravity!

To configure or ensure it's linked, run:
```bash
npx @whizan/mcp-devops install --antigravity
```
*Manual Setup:* Add this into `~/.gemini/config/mcp_config.json`:
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

#### 🟣 2. Claude Code (Anthropic CLI)
Run this single command in your terminal:
```bash
claude mcp add whizan -- npx -y @whizan/mcp-devops
```
* **Global setup (across all projects):**
  ```bash
  claude mcp add --scope user whizan -- npx -y @whizan/mcp-devops
  ```
* **In-session verification:** Inside Claude Code, type `/mcp` to verify Whizan is connected.

---

#### ⚡ 3. Cursor AI
Run in your terminal:
```bash
npx @whizan/mcp-devops install --cursor
```
*Or via Cursor UI:*
1. Open **Settings** → **Features** → **MCP**.
2. Click **Add New MCP Server**.
3. Select **Command** and enter:
   - **Name**: `whizan`
   - **Command**: `npx -y @whizan/mcp-devops`

---

#### 🌊 4. Windsurf (Codeium Cascade)
Run in your terminal:
```bash
npx @whizan/mcp-devops install --windsurf
```
*Manual Setup:* Add to `~/.codeium/windsurf/mcp_config.json`:
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

#### 🔷 5. VS Code (Form Dialog or Extensions)
If your VS Code extension displays a popup form:
* **Name**: `whizan`
* **Transport**: `Local command (stdio)`
* **Command**: `npx`
* **Arguments**: `-y @whizan/mcp-devops`

Or auto-configure Cline / Roo Code from terminal:
```bash
npx @whizan/mcp-devops install --vscode
```

---

#### 🧡 6. Claude Desktop
Run in your terminal:
```bash
npx @whizan/mcp-devops install --claude
```

---

### 🚀 Or Install Everything with 1 Command:
```bash
npx @whizan/mcp-devops install
```
This automatically finds all installed editors on your machine and registers Whizan into all of them at once.

---

## 🔍 How to Test Your Connection

Run this command in any terminal:
```bash
npx @whizan/mcp-devops whoami
```
You will see:
* Your logged-in email and plan
* Active connection status
* 32 available DevOps tools

---

## 💬 How to Talk to Your AI

Once connected, simply ask your AI in natural language:

* *"Deploy this app to Whizan Cloud."*
* *"Create a managed PostgreSQL database for this project."*
* *"Deploy an edge function on Whizan."*
* *"Analyze my project for port or network errors."*
* *"Check live build logs on Whizan."*

---

## ❓ FAQ

**Q: Where are my login details saved?**
A: In `~/.whizan/config.json` on your local computer. Your code files are never modified with private tokens.

**Q: Can I use this on a headless server or CI/CD pipeline?**
A: Yes! Generate an API key on the Whizan Cloud dashboard and provide it via the `WHIZAN_API_KEY` environment variable in your MCP config.
