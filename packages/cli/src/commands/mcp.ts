// ─── Whizan CLI — MCP Setup & Integration Command ──────────────────────────────
// Configures @whizan/mcp-devops for Cursor, Antigravity IDE, Claude Code, and Windsurf

import fs from "fs/promises";
import path from "path";
import os from "os";
import { client } from "../core/client.js";
import { loadConfig } from "../core/auth.js";
import { colors, printBanner, printError, Spinner } from "../utils/terminal-ui.js";

const c = colors;

interface IdeTarget {
  name: string;
  configPath: string;
  key: string; // "mcpServers"
  type: "json" | "claude_code";
}

export async function mcpCommand(args: string[] = []) {
  const sub = (args[0] || "setup").toLowerCase();
  const remaining = args.slice(1);

  if (sub === "setup" || sub === "install" || sub === "init") {
    await setupMcp(remaining);
  } else if (sub === "info" || sub === "status") {
    await infoMcp();
  } else {
    printError(`Unknown subcommand 'whizan mcp ${sub}'.\nAvailable commands: whizan mcp setup, whizan mcp info`);
    process.exit(1);
  }
}

async function setupMcp(args: string[]) {
  const isManualOnly = args.includes("--manual");
  let customToken = "";
  const tokenIdx = args.indexOf("--token");
  if (tokenIdx >= 0 && args[tokenIdx + 1]) {
    customToken = args[tokenIdx + 1];
  }

  printBanner();
  console.log(`  ${c.whizanCyan}${c.bold}Whizan DevOps MCP Configurator${c.reset}\n`);

  // Check login and retrieve credentials
  const auth = await client.getAuthStatus();
  const localConfig = await loadConfig();
  const apiKey = customToken || localConfig.apiKey;

  if (!apiKey && !auth.authenticated) {
    printError(
      "You are not logged in to Whizan Cloud.\nPlease log in first with:\n  whizan login\n\nOr supply a token directly with:\n  whizan mcp setup --token <YOUR_KEY>"
    );
    process.exit(1);
  }

  const apiUrl = localConfig.apiUrl || "https://api.whizan.cloud";
  const baseDomain = "whizan.cloud";

  // Standard MCP Server configuration specification
  const mcpServerConfig = {
    command: "npx",
    args: ["-y", "@whizan/mcp-devops@latest"],
    env: {
      WHIZAN_API_KEY: apiKey,
      WHIZAN_API_URL: apiUrl,
      BASE_DOMAIN: baseDomain,
    },
  };

  const jsonSnippet = JSON.stringify(
    {
      mcpServers: {
        whizan: mcpServerConfig,
      },
    },
    null,
    2
  );

  if (isManualOnly) {
    console.log(`  ${c.bold}Manual MCP Configuration JSON:${c.reset}`);
    console.log(`  ${c.dim}Add the following block to your editor's MCP configuration file:${c.reset}\n`);
    console.log(jsonSnippet + "\n");
    return;
  }

  const spinner = new Spinner("Detecting AI IDEs and writing MCP configuration...").start();

  const home = os.homedir();
  const cwd = process.cwd();

  const ideTargets: IdeTarget[] = [
    // 1. Antigravity IDE / Gemini Code
    {
      name: "Antigravity IDE (Global)",
      configPath: path.join(home, ".gemini", "config", "mcp_config.json"),
      key: "mcpServers",
      type: "json",
    },
    {
      name: "Antigravity IDE (App Data)",
      configPath: path.join(home, ".gemini", "antigravity-ide", "mcp_config.json"),
      key: "mcpServers",
      type: "json",
    },
    // 2. Cursor IDE
    {
      name: "Cursor IDE (Global)",
      configPath: path.join(home, ".cursor", "mcp.json"),
      key: "mcpServers",
      type: "json",
    },
    {
      name: "Cursor IDE (Workspace)",
      configPath: path.join(cwd, ".cursor", "mcp.json"),
      key: "mcpServers",
      type: "json",
    },
    // 3. Claude Code
    {
      name: "Claude Code",
      configPath: path.join(home, ".claude.json"),
      key: "mcpServers",
      type: "json",
    },
    // 4. Windsurf (Codeium)
    {
      name: "Windsurf IDE",
      configPath: path.join(home, ".codeium", "windsurf", "mcp_config.json"),
      key: "mcpServers",
      type: "json",
    },
    // 5. VS Code / Copilot (Workspace)
    {
      name: "VS Code / Copilot (Workspace)",
      configPath: path.join(cwd, ".vscode", "mcp.json"),
      key: "mcpServers",
      type: "json",
    },
  ];

  const configured: string[] = [];

  for (const target of ideTargets) {
    try {
      const dir = path.dirname(target.configPath);
      // Check if parent directory exists or target file already exists
      let parentExists = false;
      try {
        await fs.access(dir);
        parentExists = true;
      } catch {
        // If it's a known global path like .cursor or .claude.json, create it
        if (target.configPath.includes(".cursor") || target.configPath.includes(".claude.json") || target.configPath.includes(".gemini")) {
          await fs.mkdir(dir, { recursive: true });
          parentExists = true;
        }
      }

      if (parentExists) {
        let existingContent: any = {};
        try {
          const raw = await fs.readFile(target.configPath, "utf8");
          existingContent = JSON.parse(raw);
        } catch {}

        existingContent.mcpServers = existingContent.mcpServers || {};
        existingContent.mcpServers.whizan = mcpServerConfig;

        await fs.writeFile(target.configPath, JSON.stringify(existingContent, null, 2) + "\n", "utf8");
        configured.push(`${target.name} (${c.dim}${target.configPath}${c.reset})`);
      }
    } catch {}
  }

  spinner.succeed(`Configured Whizan MCP for ${configured.length} editor(s)`);

  if (configured.length > 0) {
    console.log(`\n  ${c.emerald}✔ Successfully installed in:${c.reset}`);
    for (const item of configured) {
      console.log(`    • ${item}`);
    }
  }

  // Claude Code CLI shortcut
  console.log(`\n  ${c.bold}Claude Code CLI Alternative:${c.reset}`);
  console.log(`  ${c.dim}If using Claude Code, you can also register in 1 command:${c.reset}`);
  console.log(`  ${c.whizanCyan}claude mcp add whizan -- npx -y @whizan/mcp-devops@latest${c.reset}\n`);

  // Manual Snippet for any other tool
  console.log(`  ${c.bold}Manual Configuration Snippet (for any MCP-compatible client):${c.reset}`);
  console.log(
    c.dim +
      JSON.stringify(
        {
          mcpServers: {
            whizan: {
              command: "npx",
              args: ["-y", "@whizan/mcp-devops@latest"],
              env: {
                WHIZAN_API_KEY: apiKey ? `${apiKey.slice(0, 8)}...` : "(your token)",
                BASE_DOMAIN: baseDomain,
              },
            },
          },
        },
        null,
        2
      ) +
      c.reset +
      "\n"
  );

  console.log(`  ${c.emerald}🎉 Ready!${c.reset} Your AI Agent (in Cursor, Antigravity, Claude Code, or Windsurf)`);
  console.log(`  can now inspect build logs, diagnose failures, and redeploy with zero collisions.\n`);
}

async function infoMcp() {
  printBanner();
  console.log(`  ${c.whizanCyan}${c.bold}Whizan DevOps MCP Status & Diagnostics${c.reset}\n`);

  const auth = await client.getAuthStatus();
  const localConfig = await loadConfig();

  console.log(`  ${c.bold}Package:${c.reset}      @whizan/mcp-devops@latest`);
  console.log(`  ${c.bold}Auth Status:${c.reset}  ${auth.authenticated ? `${c.emerald}Authenticated${c.reset} (${auth.user?.email || "User"})` : `${c.red}Not Logged In${c.reset}`}`);
  console.log(`  ${c.bold}API URL:${c.reset}      ${localConfig.apiUrl || "https://api.whizan.cloud"}`);
  console.log(`  ${c.bold}Base Domain:${c.reset}  whizan.cloud\n`);

  console.log(`  ${c.bold}Available MCP Tools:${c.reset}`);
  console.log(`    • ${c.whizanCyan}whizan_analyze_workspace${c.reset}     Detect stack, check failures, evaluate guardrails`);
  console.log(`    • ${c.whizanCyan}whizan_get_build_logs${c.reset}        Fetch live/failed cloud builder logs`);
  console.log(`    • ${c.whizanCyan}whizan_deploy_direct${c.reset}         Upload source archive & redeploy to existing target`);
  console.log(`    • ${c.whizanCyan}whizan_check_health${c.reset}          Probe live HTTP endpoint readiness`);
  console.log(`    • ${c.whizanCyan}whizan_exec_container_command${c.reset} Run diagnostic commands inside live container`);
  console.log(`    • ${c.whizanCyan}whizan_set_env_vars${c.reset}          Set environment variables on cloud resource\n`);

  console.log(`  ${c.dim}Run 'whizan mcp setup' to configure in your AI IDE.${c.reset}\n`);
}
