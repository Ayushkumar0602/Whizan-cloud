// ─── Whizan CLI — Logs Command with AI Intelligence ──────────────────────────

import fs from "fs/promises";
import path from "path";
import { client } from "../core/client.js";
import { analyzeLogsWithAi } from "../core/ai.js";
import { colors, Spinner, printError, printBuildLog } from "../utils/terminal-ui.js";

const c = colors;

export async function logsCommand(args: string[] = []) {
  // Check for AI flag
  const aiIdx = args.findIndex((a) => a === "--ai" || a === "-a");
  const isAiMode = aiIdx !== -1;
  let userAiQuery: string | undefined = undefined;
  if (isAiMode && args[aiIdx + 1] && !args[aiIdx + 1].startsWith("-")) {
    userAiQuery = args[aiIdx + 1];
  }

  // Filter out --ai and its argument to find targetId
  const nonFlagArgs = args.filter((a, idx) => {
    if (a.startsWith("-")) return false;
    if (isAiMode && idx === aiIdx + 1) return false;
    return true;
  });

  let targetId = nonFlagArgs[0] || null;
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
    printError("No target ID specified and no .whizan.json found.\nUsage: whizan logs [service-or-project-id] [--ai \"question\"] [--tail]");
    process.exit(1);
  }

  const spinner = new Spinner(`Fetching logs for ${targetId}...`).start();

  // First try fetching latest deployment logs
  let logData = await client.getBuildLogs(targetId);
  spinner.stop();

  let targetName = targetId;
  if (!logData.logs || logData.logs.length === 0) {
    // If targetId is a service or project ID, fetch the latest deployment first
    const svc = await client.getService(targetId).catch(() => null);
    if (svc) targetName = svc.name || svc.slug;
    const proj = !svc ? await client.getProject(targetId).catch(() => null) : null;
    if (proj) targetName = proj.name || proj.slug;
    const latestDepId = svc?.deployments?.[0]?.id || proj?.deployments?.[0]?.id;

    if (latestDepId) {
      logData = await client.getBuildLogs(latestDepId);
    }
  }

  if (!logData.logs || logData.logs.length === 0) {
    console.error(`  ${c.dim}No logs available for ${targetId}.${c.reset}\n`);
    return;
  }

  // ─── AI Analysis Mode ──────────────────────────────────────────────────────
  if (isAiMode) {
    const aiSpinner = new Spinner(`Analyzing logs with Whizan AI Intelligence...`).start();
    try {
      const analysis = await analyzeLogsWithAi({
        targetId,
        targetName,
        logs: logData.logs,
        userQuery: userAiQuery,
      });
      aiSpinner.succeed(`Log analysis completed!`);

      console.error(`\n  ${c.whizanCyan}${c.bold}🤖 Whizan AI Log Intelligence Analysis${c.reset}`);
      console.error(`  ${c.dim}Target:${c.reset} ${c.bold}${targetName}${c.reset} (${targetId})`);
      if (userAiQuery) {
        console.error(`  ${c.dim}Query:${c.reset} "${userAiQuery}"`);
      }
      console.error(`  ${c.dim}${"─".repeat(60)}${c.reset}\n`);

      // Format markdown bullets nicely for terminal
      const formatted = analysis
        .split("\n")
        .map((line) => {
          if (line.startsWith("###") || line.startsWith("##")) {
            return `\n  ${c.whizanCyan}${c.bold}${line.replace(/^#+\s*/, "")}${c.reset}`;
          }
          if (line.startsWith("#")) {
            return `\n  ${c.bold}${c.brightWhite}${line.replace(/^#+\s*/, "")}${c.reset}`;
          }
          if (line.startsWith("- ") || line.startsWith("* ")) {
            return `  ${c.whizanBlue}•${c.reset} ${line.slice(2)}`;
          }
          if (line.startsWith("```")) {
            return `  ${c.dim}${line}${c.reset}`;
          }
          return `  ${line}`;
        })
        .join("\n");

      console.log(formatted);
      console.error(`\n  ${c.dim}${"─".repeat(60)}${c.reset}\n`);
      return;
    } catch (err: any) {
      aiSpinner.fail("AI log analysis failed");
      printError(err.message || String(err));
      process.exit(1);
    }
  }

  // ─── Standard Log Streaming Mode ───────────────────────────────────────────
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
