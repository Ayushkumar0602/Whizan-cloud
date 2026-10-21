// ─── Whizan CLI — PS (List Resources) Command ───────────────────────────────

import { client } from "../core/client.js";
import { printBanner, colors, Spinner } from "../utils/terminal-ui.js";

const c = colors;

export async function psCommand() {
  printBanner();

  const spinner = new Spinner("Loading resources...").start();
  const [services, projects, functions, crons] = await Promise.all([
    client.listServices().catch(() => []),
    client.listProjects().catch(() => []),
    client.listFunctions().catch(() => []),
    client.listCronJobs().catch(() => []),
  ]);
  spinner.stop();

  const total = services.length + projects.length + functions.length + crons.length;
  if (total === 0) {
    console.error(`\n  ${c.dim}No resources found. Deploy your first project with:${c.reset}`);
    console.error(`  ${c.whizanCyan}whizan deploy${c.reset}\n`);
    return;
  }

  // Services
  if (services.length > 0) {
    console.error(`\n  ${c.bold}${c.whizanCyan}Backend Services (${services.length})${c.reset}`);
    for (const svc of services) {
      const statusColor = svc.status === "ACTIVE" || svc.status === "READY" ? c.emerald : c.amber;
      const statusIcon = svc.status === "ACTIVE" || svc.status === "READY" ? "●" : "○";
      const url = svc.slug ? `https://${svc.slug}.whizan.cloud` : "";
      console.error(`  ${statusColor}${statusIcon}${c.reset} ${c.bold}${svc.name}${c.reset} ${c.dim}(${svc.id})${c.reset}`);
      console.error(`    ${c.dim}Language: ${svc.language || "—"} • Port: ${svc.internalPort ?? "—"} • ${url}${c.reset}`);
    }
  }

  // Projects
  if (projects.length > 0) {
    console.error(`\n  ${c.bold}${c.whizanBlue}Web Projects (${projects.length})${c.reset}`);
    for (const proj of projects) {
      const statusColor = proj.status === "ACTIVE" || proj.status === "READY" ? c.emerald : c.amber;
      const statusIcon = proj.status === "ACTIVE" || proj.status === "READY" ? "●" : "○";
      const url = proj.slug ? `https://${proj.slug}.whizan.cloud` : "";
      console.error(`  ${statusColor}${statusIcon}${c.reset} ${c.bold}${proj.name}${c.reset} ${c.dim}(${proj.id})${c.reset}`);
      console.error(`    ${c.dim}Framework: ${proj.framework || "—"} • ${url}${c.reset}`);
    }
  }

  // Functions
  if (functions.length > 0) {
    console.error(`\n  ${c.bold}${c.whizanPurple}Edge Functions (${functions.length})${c.reset}`);
    for (const fn of functions) {
      const url = fn.slug ? `https://${fn.slug}.whizan.cloud` : "";
      console.error(`  ${c.emerald}λ${c.reset} ${c.bold}${fn.name}${c.reset} ${c.dim}(${fn.id})${c.reset}`);
      console.error(`    ${c.dim}${url}${c.reset}`);
    }
  }

  // Cron Jobs
  if (crons.length > 0) {
    console.error(`\n  ${c.bold}${c.amber}Cron Jobs (${crons.length})${c.reset}`);
    for (const job of crons) {
      const enabledIcon = job.enabled ? `${c.emerald}●${c.reset}` : `${c.gray}○${c.reset}`;
      console.error(`  ${enabledIcon} ${c.bold}${job.name}${c.reset} ${c.dim}(${job.schedule})${c.reset}`);
    }
  }

  console.error("");
}
