// ─── Whizan CLI — Whoami Command ─────────────────────────────────────────────

import { getConfigPath } from "../core/auth.js";
import { client } from "../core/client.js";
import { printBanner, colors, printKV } from "../utils/terminal-ui.js";

const c = colors;

export async function whoamiCommand() {
  printBanner("1.0.0");

  const status = await client.getAuthStatus();

  if (status.authenticated) {
    console.error(`\n  ${c.emerald}● Authenticated${c.reset}\n`);
    printKV("Email", status.user?.email || "—");
    printKV("Role", status.user?.role || "USER");
    printKV("Plan", status.user?.subscriptionTier || "HOBBY");
    printKV("Config", getConfigPath());

    // Count resources
    const [services, projects, functions, crons] = await Promise.all([
      client.listServices().catch(() => []),
      client.listProjects().catch(() => []),
      client.listFunctions().catch(() => []),
      client.listCronJobs().catch(() => []),
    ]);
    console.error("");
    printKV("Services", String(services.length));
    printKV("Projects", String(projects.length));
    printKV("Functions", String(functions.length));
    printKV("Cron Jobs", String(crons.length));
    console.error("");
  } else {
    console.error(`\n  ${c.amber}○ Not authenticated${c.reset}`);
    console.error(`  ${c.dim}${status.message}${c.reset}\n`);
    console.error(`  ${c.brightCyan}Run: whizan login${c.reset}\n`);
  }
}
