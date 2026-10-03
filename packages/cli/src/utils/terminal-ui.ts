// ─── Whizan Cloud CLI — Terminal UI Utilities ────────────────────────────────

export const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",

  // Core brand palette
  whizanCyan: "\x1b[38;2;0;210;255m",
  whizanPurple: "\x1b[38;2;139;92;246m",
  whizanBlue: "\x1b[38;2;59;130;246m",

  // Semantic
  emerald: "\x1b[38;2;16;185;129m",
  amber: "\x1b[38;2;245;158;11m",
  red: "\x1b[38;2;239;68;68m",
  brightRed: "\x1b[38;2;248;113;113m",
  brightWhite: "\x1b[97m",
  brightCyan: "\x1b[96m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgEmerald: "\x1b[42m",
};

const c = colors;

export const CLI_VERSION = "1.0.2";

/**
 * Print the branded Whizan ASCII banner to stderr
 */
export function printBanner(version: string = CLI_VERSION) {
  const banner = `
  ${c.whizanCyan}██╗    ██╗██╗  ██╗██╗███████╗ █████╗ ███╗   ██╗${c.reset}
  ${c.whizanCyan}██║    ██║██║  ██║██║╚══███╔╝██╔══██╗████╗  ██║${c.reset}
  ${c.whizanBlue}██║ █╗ ██║███████║██║  ███╔╝ ███████║██╔██╗ ██║${c.reset}
  ${c.whizanBlue}██║███╗██║██╔══██║██║ ███╔╝  ██╔══██║██║╚██╗██║${c.reset}
  ${c.whizanPurple}╚███╔███╔╝██║  ██║██║███████╗██║  ██║██║ ╚████║${c.reset}
  ${c.whizanPurple} ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝${c.reset}
  ${c.brightWhite}Whizan Cloud CLI${c.reset} ${c.dim}•${c.reset} ${c.emerald}v${version}${c.reset}`;
  console.error(banner);
}

/**
 * Minimal spinner for terminal progress indication
 */
export class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private current = 0;
  private interval: NodeJS.Timeout | null = null;
  private text: string;

  constructor(text: string) {
    this.text = text;
  }

  start(): this {
    this.interval = setInterval(() => {
      const frame = this.frames[this.current % this.frames.length];
      process.stderr.write(`\r  ${c.whizanCyan}${frame}${c.reset} ${this.text}`);
      this.current++;
    }, 80);
    return this;
  }

  update(text: string) {
    this.text = text;
  }

  succeed(text?: string) {
    this.stop();
    console.error(`\r  ${c.emerald}✔${c.reset} ${text || this.text}`);
  }

  fail(text?: string) {
    this.stop();
    console.error(`\r  ${c.red}✖${c.reset} ${text || this.text}`);
  }

  warn(text?: string) {
    this.stop();
    console.error(`\r  ${c.amber}⚠${c.reset} ${text || this.text}`);
  }

  info(text?: string) {
    this.stop();
    console.error(`\r  ${c.whizanCyan}ℹ${c.reset} ${text || this.text}`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      process.stderr.write("\r\x1b[K"); // Clear spinner line
    }
  }
}

/**
 * Print a step header like [1/6] 🔍 Analyzing workspace...
 */
export function step(current: number, total: number, emoji: string, text: string) {
  console.error(`\n  ${c.dim}[${current}/${total}]${c.reset} ${emoji} ${c.bold}${text}${c.reset}`);
}

/**
 * Print a success box with the final deployment URL
 */
export function printDeploySuccess(url: string, dashboardUrl?: string) {
  const line = "━".repeat(52);
  console.error(`
  ${c.dim}${line}${c.reset}
  ${c.emerald}${c.bold}🎉 Deploy successful!${c.reset}
  ${c.whizanCyan}🔗 ${url}${c.reset}${dashboardUrl ? `\n  ${c.dim}📋 ${dashboardUrl}${c.reset}` : ""}
  ${c.dim}${line}${c.reset}
`);
}

/**
 * Print an error message
 */
export function printError(message: string) {
  console.error(`\n  ${c.red}${c.bold}Error:${c.reset} ${message}\n`);
}

/**
 * Print a key-value info line
 */
export function printKV(key: string, value: string) {
  console.error(`  ${c.dim}${key}:${c.reset} ${c.bold}${value}${c.reset}`);
}

/**
 * Print build log lines with coloring
 */
export function printBuildLog(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return;

  if (trimmed.startsWith("[Worker]") || trimmed.startsWith("Step ")) {
    console.error(`  ${c.dim}├─${c.reset} ${trimmed}`);
  } else if (trimmed.includes("ERROR") || trimmed.includes("error")) {
    console.error(`  ${c.red}├─ ${trimmed}${c.reset}`);
  } else {
    console.error(`  ${c.dim}│  ${trimmed}${c.reset}`);
  }
}

/**
 * Simple readline prompt (no external dependency)
 */
export async function prompt(question: string, defaultValue?: string): Promise<string> {
  const readline = await import("readline");
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    const suffix = defaultValue ? ` ${c.dim}(${defaultValue})${c.reset}` : "";
    rl.question(`  ${c.whizanCyan}?${c.reset} ${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

/**
 * Yes/No confirmation prompt
 */
export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = await prompt(`${question} (${hint})`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

