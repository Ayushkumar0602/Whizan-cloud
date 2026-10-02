// ─── Whizan CLI — Logout Command ─────────────────────────────────────────────

import { clearConfig, getConfigPath } from "../core/auth.js";
import { printBanner, colors } from "../utils/terminal-ui.js";

const c = colors;

export async function logoutCommand() {
  printBanner("1.0.0");
  await clearConfig();
  console.error(`  ${c.emerald}✔ Logged out successfully.${c.reset}`);
  console.error(`  ${c.dim}Credentials removed from ${getConfigPath()}${c.reset}\n`);
}
