// ─── Whizan CLI — Container Exec Command ──────────────────────────────────────

import fs from "fs/promises";
import path from "path";
import { client } from "../core/client.js";
import { colors, Spinner, printError } from "../utils/terminal-ui.js";

const c = colors;

export async function execCommand(args: string[] = []) {
  // Find where "--" is located to separate target from command
  const dashDashIdx = args.indexOf("--");
  let targetId: string | null = null;
  let commandStr = "";

  if (dashDashIdx !== -1) {
    const pre = args.slice(0, dashDashIdx);
    targetId = pre.find((a) => !a.startsWith("-")) || null;
    commandStr = args.slice(dashDashIdx + 1).join(" ");
  } else {
    // If no "--", check if first arg is targetId and rest is command
    if (args.length >= 2) {
      targetId = args[0];
      commandStr = args.slice(1).join(" ");
    } else {
      commandStr = args.join(" ");
    }
  }

  // If no targetId, read from .whizan.json
  let targetType: "service" | "project" = "service";
  if (!targetId) {
    try {
      const raw = await fs.readFile(path.join(process.cwd(), ".whizan.json"), "utf8");
      const cfg = JSON.parse(raw);
      targetId = cfg.targetId;
      targetType = cfg.type || "service";
    } catch {}
  }

  if (!targetId || !commandStr) {
    printError("Usage: whizan exec [--target <id>] -- <command>\nExample: whizan exec -- npx prisma migrate status");
    process.exit(1);
  }

  const spinner = new Spinner(`Executing "${commandStr}" inside ${targetId}...`).start();

  try {
    const result = await client.execContainerCommand(targetType, targetId, commandStr);
    spinner.stop();

    if (result.output) {
      process.stdout.write(result.output);
      if (!result.output.endsWith("\n")) console.log("");
    } else if (result.stdout || result.stderr) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    } else {
      console.log(`Command exited with status: ${result.exitCode ?? 0}`);
    }
  } catch (err: any) {
    spinner.fail("Container exec failed");
    printError(err.message || String(err));
    process.exit(1);
  }
}
