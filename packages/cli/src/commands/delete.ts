// ─── Whizan CLI — Delete Resource Command ────────────────────────────────────

import fs from "fs/promises";
import path from "path";
import { client } from "../core/client.js";
import { colors, Spinner, printError, confirm } from "../utils/terminal-ui.js";

const c = colors;

export async function deleteCommand(args: string[] = []) {
  let targetId = args.find((a) => !a.startsWith("-"));
  let targetType: "service" | "project" = "service";

  if (!targetId) {
    try {
      const raw = await fs.readFile(path.join(process.cwd(), ".whizan.json"), "utf8");
      const cfg = JSON.parse(raw);
      targetId = cfg.targetId;
      targetType = cfg.type || "service";
    } catch {}
  }

  if (!targetId) {
    printError("Usage: whizan delete <service-or-project-id>");
    process.exit(1);
  }

  const ok = await confirm(`Are you sure you want to permanently delete ${targetType} "${targetId}"?`, false);
  if (!ok) {
    console.error(`  ${c.dim}Deletion cancelled.${c.reset}\n`);
    return;
  }

  const spinner = new Spinner(`Deleting ${targetId}...`).start();

  try {
    // Try service delete first, fallback to project
    let deleted = false;
    try {
      deleted = await client.deleteResource("service", targetId);
    } catch {
      deleted = await client.deleteResource("project", targetId);
    }

    if (deleted) {
      spinner.succeed(`Resource "${targetId}" deleted successfully.`);
      // Remove .whizan.json if it matches the deleted target
      try {
        const configPath = path.join(process.cwd(), ".whizan.json");
        const raw = await fs.readFile(configPath, "utf8");
        const cfg = JSON.parse(raw);
        if (cfg.targetId === targetId) {
          await fs.rm(configPath, { force: true });
        }
      } catch {}
    } else {
      spinner.fail("Failed to delete resource");
    }
  } catch (err: any) {
    spinner.fail("Deletion failed");
    printError(err.message || String(err));
    process.exit(1);
  }
}
