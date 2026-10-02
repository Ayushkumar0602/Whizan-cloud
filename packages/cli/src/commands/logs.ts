// ─── Whizan CLI — Logs Command ────────────────────────────────────────────────

import fs from "fs/promises";
import path from "path";
import { client } from "../core/client.js";
import { colors, printBanner, Spinner, printError, printBuildLog } from "../utils/terminal-ui.js";

const c = colors;

export async function logsCommand(args: string[] = []) {
  let targetId = args.find((a) => !a.startsWith("-"));
  const tail = args.includes("--tail") || args.includes("-f");

  // If no targetId provided, check local .whizan.json
  if (!targetId) {
    try {
      const raw = await fs.readFile(path.join(process.cwd(), ".whizan.json"), "utf8");
      const cfg = JSON.parse(raw);
      targetId = cfg.targetId;
    } catch {}
  }

  if (!targetId) {
    printError("No target ID specified and no .whizan.json found.\nUsage: whizan logs <service-or-deployment-id> [--tail]");
    process.exit(1);
  }

  const spinner = new Spinner(`Fetching logs for ${targetId}...`).start();

  // First try fetching latest deployment logs
  let logData = await client.getBuildLogs(targetId);
  spinner.stop();

  if (!logData.logs || logData.logs.length === 0) {
    // If targetId is a service or project ID, fetch the latest deployment first
    const svc = await client.getService(targetId).catch(() => null);
    const proj = !svc ? await client.getProject(targetId).catch(() => null) : null;
    const latestDepId = svc?.deployments?.[0]?.id || proj?.deployments?.[0]?.id;

    if (latestDepId) {
      logData = await client.getBuildLogs(latestDepId);
    }
  }

  if (!logData.logs || logData.logs.length === 0) {
    console.error(`  ${c.dim}No logs available for ${targetId}.${c.reset}\n`);
    return;
  }

  console.error(`\n  ${c.bold}Logs for ${c.whizanCyan}${targetId}${c.reset} (Status: ${logData.status}):\n`);
  for (const line of logData.logs) {
    printBuildLog(line);
  }

  // If tail mode requested, poll continuously
  if (tail) {
    console.error(`\n  ${c.dim}Streaming logs (Ctrl+C to stop)...${c.reset}`);
    let seenLogs = logData.logs.length;
    while (true) {
      await new Promise((r) => setTimeout(r, 3000));
      const updated = await client.getBuildLogs(targetId);
      if (updated.logs && updated.logs.length > seenLogs) {
        for (let i = seenLogs; i < updated.logs.length; i++) {
          printBuildLog(updated.logs[i]);
        }
        seenLogs = updated.logs.length;
      }
    }
  }
}
