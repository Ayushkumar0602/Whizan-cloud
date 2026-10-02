import fs from "fs/promises";
import path from "path";
import os from "os";
import { colors } from "./terminal-ui.js";

export interface InstallTarget {
  id: string;
  name: string;
  configPath: string;
  parentDir: string;
  installed: boolean;
}

export interface InstallResult {
  target: InstallTarget;
  success: boolean;
  action: "created" | "updated" | "skipped";
  error?: string;
}

function getKnownTargets(workspaceDir?: string): InstallTarget[] {
  const home = os.homedir();
  const platform = os.platform();
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");

  const targets: InstallTarget[] = [
    // 1. Antigravity IDE (Global Config)
    {
      id: "antigravity-global",
      name: "Antigravity IDE (Global)",
      parentDir: path.join(home, ".gemini", "config"),
      configPath: path.join(home, ".gemini", "config", "mcp_config.json"),
      installed: false,
    },
    // 2. Antigravity IDE (App Config)
    {
      id: "antigravity-ide",
      name: "Antigravity IDE (App)",
      parentDir: path.join(home, ".gemini", "antigravity-ide"),
      configPath: path.join(home, ".gemini", "antigravity-ide", "mcp_config.json"),
      installed: false,
    },
    // 3. Cursor AI
    {
      id: "cursor",
      name: "Cursor AI",
      parentDir: path.join(home, ".cursor"),
      configPath: path.join(home, ".cursor", "mcp.json"),
      installed: false,
    },
    // 4. Windsurf (Codeium Cascade)
    {
      id: "windsurf",
      name: "Windsurf (Cascade)",
      parentDir: path.join(home, ".codeium", "windsurf"),
      configPath: path.join(home, ".codeium", "windsurf", "mcp_config.json"),
      installed: false,
    },
    // 5. Claude Desktop
    {
      id: "claude",
      name: "Claude Desktop",
      parentDir:
        platform === "darwin"
          ? path.join(home, "Library", "Application Support", "Claude")
          : platform === "win32"
          ? path.join(appData, "Claude")
          : path.join(home, ".config", "Claude"),
      configPath:
        platform === "darwin"
          ? path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
          : platform === "win32"
          ? path.join(appData, "Claude", "claude_desktop_config.json")
          : path.join(home, ".config", "Claude", "claude_desktop_config.json"),
      installed: false,
    },
    // 6. VS Code - Cline (Claude Dev)
    {
      id: "vscode-cline",
      name: "VS Code (Cline)",
      parentDir:
        platform === "darwin"
          ? path.join(home, "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings")
          : platform === "win32"
          ? path.join(appData, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings")
          : path.join(home, ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings"),
      configPath:
        platform === "darwin"
          ? path.join(home, "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")
          : platform === "win32"
          ? path.join(appData, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json")
          : path.join(home, ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      installed: false,
    },
    // 7. VS Code - Roo Code
    {
      id: "vscode-roo",
      name: "VS Code (Roo Code)",
      parentDir:
        platform === "darwin"
          ? path.join(home, "Library", "Application Support", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings")
          : platform === "win32"
          ? path.join(appData, "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings")
          : path.join(home, ".config", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings"),
      configPath:
        platform === "darwin"
          ? path.join(home, "Library", "Application Support", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings", "cline_mcp_settings.json")
          : platform === "win32"
          ? path.join(appData, "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings", "cline_mcp_settings.json")
          : path.join(home, ".config", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings", "cline_mcp_settings.json"),
      installed: false,
    },
    // 8. Claude Code (Anthropic CLI)
    {
      id: "claude-code",
      name: "Claude Code CLI",
      parentDir: home,
      configPath: path.join(home, ".claude.json"),
      installed: false,
    },
  ];

  if (workspaceDir) {
    targets.push({
      id: "workspace-cursor",
      name: "Current Workspace (.cursor)",
      parentDir: path.join(path.resolve(workspaceDir), ".cursor"),
      configPath: path.join(path.resolve(workspaceDir), ".cursor", "mcp.json"),
      installed: true,
    });
  }

  return targets;
}

export async function detectIdeTargets(workspaceDir?: string): Promise<InstallTarget[]> {
  const targets = getKnownTargets(workspaceDir);

  for (const t of targets) {
    try {
      if (t.id === "claude-code") {
        await fs.access(t.configPath);
        t.installed = true;
      } else {
        await fs.access(t.parentDir);
        t.installed = true;
      }
    } catch {
      t.installed = false;
    }
  }

  return targets;
}

export async function autoRegisterMcp(options: {
  specificId?: string;
  forceAll?: boolean;
  apiKey?: string;
  apiUrl?: string;
  workspaceDir?: string;
}): Promise<InstallResult[]> {
  const allTargets = await detectIdeTargets(options.workspaceDir);

  // Filter targets: if specific target requested, or install into all detected ones
  let candidateTargets = allTargets;
  if (options.specificId) {
    const q = options.specificId.toLowerCase();
    candidateTargets = allTargets.filter(
      (t) => t.id.includes(q) || t.name.toLowerCase().includes(q)
    );
    if (candidateTargets.length === 0) {
      throw new Error(`Unknown IDE target "${options.specificId}". Available: antigravity, cursor, windsurf, claude, vscode`);
    }
  } else if (!options.forceAll) {
    // Only install into IDEs where the parent directory exists on this computer
    candidateTargets = allTargets.filter((t) => t.installed);
  }

  const serverConfig: Record<string, any> = {
    command: "npx",
    args: ["-y", "@whizan/mcp-devops"],
  };

  if (options.apiKey) {
    serverConfig.env = {
      WHIZAN_API_URL: options.apiUrl || "https://whizan-cloud-service.onrender.com",
      WHIZAN_API_KEY: options.apiKey,
    };
  }

  const results: InstallResult[] = [];

  for (const target of candidateTargets) {
    try {
      await fs.mkdir(target.parentDir, { recursive: true });

      let existingConfig: Record<string, any> = {};
      let fileExisted = false;

      try {
        const raw = await fs.readFile(target.configPath, "utf8");
        existingConfig = JSON.parse(raw);
        fileExisted = true;
      } catch {
        existingConfig = {};
      }

      // Safely merge under mcpServers without touching any other servers
      if (!existingConfig.mcpServers || typeof existingConfig.mcpServers !== "object") {
        existingConfig.mcpServers = {};
      }

      existingConfig.mcpServers["whizan"] = serverConfig;

      await fs.writeFile(target.configPath, JSON.stringify(existingConfig, null, 2), "utf8");

      results.push({
        target,
        success: true,
        action: fileExisted ? "updated" : "created",
      });
    } catch (err: any) {
      results.push({
        target,
        success: false,
        action: "skipped",
        error: err.message,
      });
    }
  }

  return results;
}
