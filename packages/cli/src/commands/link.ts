// ─── Whizan CLI — Link & Unlink Command ───────────────────────────────────────

import fs from "fs/promises";
import path from "path";
import { client } from "../core/client.js";
import { colors, Spinner, printError, printKV, confirm } from "../utils/terminal-ui.js";

const c = colors;

export async function linkCommand(args: string[] = []) {
  const targetId = args[0];
  if (!targetId) {
    printError("Usage: whizan link <service-or-project-id>");
    process.exit(1);
  }

  const spinner = new Spinner(`Resolving target ${targetId}...`).start();

  let targetType: "service" | "project" = "service";
  let target = await client.getService(targetId);
  if (!target) {
    target = await client.getProject(targetId);
    if (target) targetType = "project";
  }

  if (!target) {
    spinner.fail("Target not found");
    printError(`Could not find service or project with ID: "${targetId}"`);
    process.exit(1);
  }

  spinner.succeed(`Found ${targetType}: ${c.bold}${target.name || target.slug}${c.reset}`);

  const configPath = path.join(process.cwd(), ".whizan.json");
  const config = {
    name: target.name || target.slug,
    slug: target.slug,
    targetType,
    type: targetType,
    targetId: target.id,
    framework: target.framework || target.language,
    lastLinkedAt: new Date().toISOString(),
  };

  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.error(`\n  ${c.emerald}✔${c.reset} Linked this directory to ${c.whizanCyan}${target.slug}${c.reset} (${target.id})!`);
  console.error(`  ${c.dim}Saved to .whizan.json${c.reset}\n`);
}

export async function unlinkCommand() {
  const configPath = path.join(process.cwd(), ".whizan.json");
  try {
    await fs.access(configPath);
  } catch {
    console.error(`  ${c.dim}No .whizan.json found in current directory.${c.reset}\n`);
    return;
  }

  const ok = await confirm("Are you sure you want to remove .whizan.json?", true);
  if (ok) {
    await fs.rm(configPath, { force: true });
    console.error(`  ${c.emerald}✔${c.reset} Unlinked project. .whizan.json removed.\n`);
  }
}
