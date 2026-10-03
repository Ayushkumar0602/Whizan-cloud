/**
 * Rich Terminal UI & Structured Logging Engine for Whizan DevOps MCP Server.
 * All outputs are safely piped to process.stderr to preserve clean stdio JSON-RPC on process.stdout.
 */

const ESC = "\x1b[";
export const colors = {
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  italic: `${ESC}3m`,
  underline: `${ESC}4m`,
  
  // Foreground Colors
  black: `${ESC}30m`,
  red: `${ESC}31m`,
  green: `${ESC}32m`,
  yellow: `${ESC}33m`,
  blue: `${ESC}34m`,
  magenta: `${ESC}35m`,
  cyan: `${ESC}36m`,
  white: `${ESC}37m`,
  gray: `${ESC}90m`,
  
  // Bright Foreground
  brightRed: `${ESC}91m`,
  brightGreen: `${ESC}92m`,
  brightYellow: `${ESC}93m`,
  brightBlue: `${ESC}94m`,
  brightMagenta: `${ESC}95m`,
  brightCyan: `${ESC}96m`,
  brightWhite: `${ESC}97m`,

  // 256-color & custom accents
  whizanCyan: `${ESC}38;5;39m`,
  whizanIndigo: `${ESC}38;5;99m`,
  whizanPurple: `${ESC}38;5;141m`,
  emerald: `${ESC}38;5;48m`,
  amber: `${ESC}38;5;214m`,

  // Backgrounds
  bgDark: `${ESC}48;5;234m`,
  bgBlue: `${ESC}44m`,
  bgCyan: `${ESC}46;30m`,
  bgMagenta: `${ESC}45;37m`,
  bgGreen: `${ESC}42;30m`,
  bgRed: `${ESC}41;37m`,
  bgYellow: `${ESC}43;30m`,
};

function out(text: string) {
  process.stderr.write(text + "\n");
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number, s = 2) => String(n).padStart(s, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function printWhizanBanner(version = "1.0.6", subtitle = "Autonomous Cloud DevOps & In-IDE Deployment Engine") {
  const c = colors;
  const banner = `
${c.whizanIndigo}  ██╗    ██╗██╗  ██╗██╗███████╗ █████╗ ███╗   ██╗
${c.whizanIndigo}  ██║    ██║██║  ██║██║╚══███╔╝██╔══██╗████╗  ██║
${c.whizanCyan}  ██║ █╗ ██║███████║██║  ███╔╝ ███████║██╔██╗ ██║
${c.whizanCyan}  ██║███╗██║██╔══██║██║ ███╔╝  ██╔══██║██║╚██╗██║
${c.brightCyan}  ╚███╔███╔╝██║  ██║██║███████╗██║  ██║██║ ╚████║
${c.brightCyan}   ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝${c.reset}
  ${c.bold}${c.brightWhite}Whizan Cloud DevOps MCP Engine${c.reset} ${c.dim}•${c.reset} ${c.whizanCyan}v${version}${c.reset}
  ${c.dim}${subtitle}${c.reset}
`;
  out(banner);
}

export interface ServerStatusInfo {
  status: "ONLINE" | "CONNECTING" | "ERROR";
  authenticated: boolean;
  userEmail?: string;
  role?: string;
  tier?: string;
  apiUrl: string;
  toolCount: number;
  configPath?: string;
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

function renderBoxRow(content: string, width: number): string {
  const visible = stripAnsi(content);
  const padLen = Math.max(0, width - visible.length - 2);
  return `  ${colors.dim}│${colors.reset}  ${content}${" ".repeat(padLen)}${colors.dim}│${colors.reset}`;
}

export function printServerStatusCard(info: ServerStatusInfo) {
  const c = colors;
  const W = 72;
  const hr = "─".repeat(W);

  out(`  ${c.dim}┌${hr}┐${c.reset}`);
  out(renderBoxRow(`${c.bold}${c.brightWhite}SYSTEM RUNTIME & CLUSTER STATUS${c.reset}`, W));
  out(`  ${c.dim}├${hr}┤${c.reset}`);

  // Status row
  const statusIcon = info.status === "ONLINE" ? `${c.brightGreen}● READY${c.reset}` : `${c.brightYellow}○ ${info.status}${c.reset}`;
  out(renderBoxRow(`${c.dim}Runtime Status:${c.reset}     ${statusIcon} ${c.dim}(stdio JSON-RPC active)${c.reset}`, W));

  // Auth row
  let authDisplay = "";
  if (info.authenticated) {
    const roleBadge = info.role ? ` ${c.amber}[${info.role}]${c.reset}` : "";
    const tierBadge = info.tier ? ` ${c.whizanPurple}[${info.tier}]${c.reset}` : "";
    authDisplay = `${c.emerald}${info.userEmail || "Authenticated"}${c.reset}${roleBadge}${tierBadge}`;
  } else {
    authDisplay = `${c.brightYellow}Unauthenticated${c.reset} ${c.dim}(Run 'whizan-mcp login')${c.reset}`;
  }
  out(renderBoxRow(`${c.dim}Authentication:${c.reset}     ${authDisplay}`, W));

  // API Endpoint row
  out(renderBoxRow(`${c.dim}Target Endpoint:${c.reset}    ${c.whizanCyan}${info.apiUrl}${c.reset}`, W));

  // Tools row
  out(renderBoxRow(`${c.dim}Capabilities:${c.reset}       ${c.bold}${c.brightWhite}${info.toolCount}${c.reset} ${c.dim}DevOps tools active (Direct Deploy, AI Audit, Cron...)${c.reset}`, W));

  // Config file row
  if (info.configPath) {
    out(renderBoxRow(`${c.dim}Credential Store:${c.reset}   ${c.dim}${info.configPath}${c.reset}`, W));
  }

  out(`  ${c.dim}└${hr}┘${c.reset}\n`);
}

export function printInteractiveTips(authenticated: boolean) {
  const c = colors;
  out(`  ${c.bold}${c.brightWhite}💡 Interactive Terminal Tips & CLI Commands:${c.reset}`);
  out(`     ${c.cyan}npx @whizan/mcp-devops login${c.reset}      ${c.dim}→ 1-click in-browser authorization (stores credentials)${c.reset}`);
  out(`     ${c.cyan}npx @whizan/mcp-devops whoami${c.reset}     ${c.dim}→ Inspect authenticated user profile and subscription tier${c.reset}`);
  out(`     ${c.cyan}npx @whizan/mcp-devops logout${c.reset}     ${c.dim}→ Clear saved machine credentials (~/.whizan/config.json)${c.reset}`);
  out(`     ${c.cyan}npx @whizan/mcp-devops --help${c.reset}     ${c.dim}→ View CLI options & environment variable overrides${c.reset}`);
  
  if (!authenticated) {
    out(`\n  ${c.bgYellow}${c.black} ATTENTION ${c.reset} ${c.amber}No local credentials found. Run ${c.bold}'npx @whizan/mcp-devops login'${c.reset}${c.amber} or pass WHIZAN_API_KEY.${c.reset}`);
  }

  out(`\n  ${c.dim}Listening for MCP client commands over stdio... Press ${c.reset}${c.bold}Ctrl+C${c.reset}${c.dim} to stop.${c.reset}\n`);
}

/**
 * Structured Logger for MCP requests, tool calls, and lifecycle events.
 * Safe for stdio clients: Always outputs to stderr.
 */
export const McpLogger = {
  info(msg: string) {
    const c = colors;
    out(`  ${c.dim}[${timestamp()}]${c.reset} ${c.whizanCyan}ℹ INFO${c.reset} ${msg}`);
  },

  success(msg: string) {
    const c = colors;
    out(`  ${c.dim}[${timestamp()}]${c.reset} ${c.emerald}✔ SUCCESS${c.reset} ${msg}`);
  },

  warn(msg: string) {
    const c = colors;
    out(`  ${c.dim}[${timestamp()}]${c.reset} ${c.amber}▲ WARN${c.reset} ${msg}`);
  },

  error(msg: string, err?: any) {
    const c = colors;
    out(`  ${c.dim}[${timestamp()}]${c.reset} ${c.brightRed}✖ ERROR${c.reset} ${msg}`);
    if (err && err.stack) {
      out(`  ${c.dim}${err.stack}${c.reset}`);
    }
  },

  toolCall(toolName: string, args: Record<string, any> = {}) {
    const c = colors;
    let preview = "";
    try {
      const keys = Object.keys(args);
      if (keys.length > 0) {
        const compact: Record<string, any> = {};
        for (const k of keys.slice(0, 4)) {
          const val = args[k];
          if (typeof val === "string" && val.length > 50) {
            compact[k] = val.slice(0, 47) + "...";
          } else if (typeof val === "object" && val !== null) {
            compact[k] = Array.isArray(val) ? `[Array(${val.length})]` : "{...}";
          } else {
            compact[k] = val;
          }
        }
        preview = ` ${c.dim}${JSON.stringify(compact)}${c.reset}`;
      }
    } catch {}

    out(`  ${c.dim}[${timestamp()}]${c.reset} ${c.whizanCyan}⚡ CALL${c.reset} ${c.bold}${c.brightWhite}${toolName}${c.reset}${preview}`);
  },

  toolSuccess(toolName: string, durationMs: number, summary?: string) {
    const c = colors;
    const durStr = durationMs >= 1000 ? `${(durationMs / 1000).toFixed(2)}s` : `${Math.round(durationMs)}ms`;
    const summaryStr = summary ? ` ${c.dim}— ${summary}${c.reset}` : "";
    out(`  ${c.dim}[${timestamp()}]${c.reset} ${c.emerald}✔ DONE${c.reset} ${c.bold}${toolName}${c.reset} ${c.dim}(took ${durStr})${c.reset}${summaryStr}`);
  },

  toolError(toolName: string, durationMs: number, errorMsg: string) {
    const c = colors;
    const durStr = durationMs >= 1000 ? `${(durationMs / 1000).toFixed(2)}s` : `${Math.round(durationMs)}ms`;
    out(`  ${c.dim}[${timestamp()}]${c.reset} ${c.brightRed}✖ FAIL${c.reset} ${c.bold}${toolName}${c.reset} ${c.dim}(after ${durStr})${c.reset}`);
    out(`    ${c.red}↳ ${errorMsg}${c.reset}`);
  },
};
