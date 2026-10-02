// ─── Whizan CLI — Environment Variables Command ──────────────────────────────

import fs from "fs/promises";
import path from "path";
import { client } from "../core/client.js";
import { colors, Spinner, printError, printKV } from "../utils/terminal-ui.js";

const c = colors;

async function getTargetContext(args: string[]): Promise<{ targetId: string; targetType: "service" | "project" }> {
  // Check if --target is explicitly provided
  const targetIdx = args.findIndex((a) => a === "--target" || a === "-t");
  if (targetIdx !== -1 && args[targetIdx + 1]) {
    const id = args[targetIdx + 1];
    // Guess type from prefix if present, else check service first
    const type = id.startsWith("prj") ? "project" : "service";
    return { targetId: id, targetType: type };
  }

  // Otherwise read .whizan.json
  try {
    const raw = await fs.readFile(path.join(process.cwd(), ".whizan.json"), "utf8");
    const cfg = JSON.parse(raw);
    if (cfg.targetId) {
      return { targetId: cfg.targetId, targetType: cfg.type || "service" };
    }
  } catch {}

  printError("No target deployment specified. Run within a linked directory or use --target <id>.");
  process.exit(1);
}

export async function envCommand(args: string[] = []) {
  const sub = args[0]?.toLowerCase();
  const subArgs = args.slice(1);

  switch (sub) {
    case "ls":
    case "list": {
      const { targetId, targetType } = await getTargetContext(subArgs);
      const spinner = new Spinner(`Fetching environment variables for ${targetId}...`).start();
      const vars = await client.listEnvVars(targetType, targetId);
      spinner.stop();

      if (!vars || vars.length === 0) {
        console.error(`  ${c.dim}No environment variables set for ${targetId}.${c.reset}\n`);
        return;
      }

      console.error(`\n  ${c.bold}Environment Variables for ${c.whizanCyan}${targetId}${c.reset}:\n`);
      for (const v of vars) {
        console.error(`  ${c.whizanCyan}${v.key}${c.reset} = ${c.dim}${v.isSecret ? "••••••••" : v.value || "••••••••"}${c.reset}`);
      }
      console.error("");
      break;
    }

    case "set":
    case "add": {
      const { targetId, targetType } = await getTargetContext(subArgs);
      const pairs = subArgs.filter((a) => !a.startsWith("-") && a.includes("="));
      if (pairs.length === 0) {
        printError("Usage: whizan env set KEY=VALUE [KEY2=VALUE2...]");
        process.exit(1);
      }

      const envMap: Record<string, string> = {};
      for (const pair of pairs) {
        const eq = pair.indexOf("=");
        const k = pair.substring(0, eq).trim();
        const v = pair.substring(eq + 1).trim();
        if (k) envMap[k] = v;
      }

      const spinner = new Spinner(`Setting ${Object.keys(envMap).length} variable(s)...`).start();
      const res = await client.setEnvVars(targetType, targetId, envMap);
      spinner.succeed(`Environment variable(s) updated successfully for ${c.whizanCyan}${targetId}${c.reset}!`);
      for (const [k, ok] of Object.entries(res)) {
        if (ok) console.error(`  ${c.emerald}✔${c.reset} ${k}`);
        else console.error(`  ${c.red}✖${c.reset} ${k}`);
      }
      console.error(`\n  ${c.dim}Tip: Run ${c.whizanCyan}whizan redeploy${c.reset}${c.dim} to apply changes to running containers.${c.reset}\n`);
      break;
    }

    case "rm":
    case "delete":
    case "remove": {
      const { targetId, targetType } = await getTargetContext(subArgs);
      const keys = subArgs.filter((a) => !a.startsWith("-") && !a.includes("="));
      if (keys.length === 0) {
        printError("Usage: whizan env rm KEY [KEY2...]");
        process.exit(1);
      }

      for (const key of keys) {
        const spinner = new Spinner(`Deleting ${key}...`).start();
        const ok = await client.deleteEnvVar(targetType, targetId, key);
        if (ok) spinner.succeed(`Deleted ${c.bold}${key}${c.reset}`);
        else spinner.fail(`Failed to delete ${c.bold}${key}${c.reset}`);
      }
      console.error(`\n  ${c.dim}Tip: Run ${c.whizanCyan}whizan redeploy${c.reset}${c.dim} to apply changes to running containers.${c.reset}\n`);
      break;
    }

    default:
      console.error(`
  ${c.bold}${c.brightWhite}WHIZAN ENV USAGE${c.reset}
    ${c.whizanCyan}whizan env ls${c.reset}                  List environment variables
    ${c.whizanCyan}whizan env set KEY=VAL${c.reset}        Set one or more variables
    ${c.whizanCyan}whizan env rm KEY${c.reset}             Remove an environment variable

  ${c.dim}Options:${c.reset}
    ${c.dim}--target <id>${c.reset}                 Target a specific service or project ID
`);
      break;
  }
}
