// ─── Whizan CLI — Edge Functions Command ─────────────────────────────────────

import fs from "fs/promises";
import path from "path";
import { client } from "../core/client.js";
import { toSlug } from "../utils/slug.js";
import { colors, Spinner, printError, printKV, prompt, confirm } from "../utils/terminal-ui.js";

const c = colors;

export async function fnCommand(args: string[] = []) {
  const sub = args[0]?.toLowerCase();
  const subArgs = args.slice(1);

  switch (sub) {
    case "ls":
    case "list": {
      const spinner = new Spinner("Fetching edge functions...").start();
      const functions = await client.listFunctions();
      spinner.stop();

      if (!functions || functions.length === 0) {
        console.error(`  ${c.dim}No edge functions deployed yet. Run 'whizan fn deploy <file>' to deploy one.${c.reset}\n`);
        return;
      }

      console.error(`\n  ${c.bold}Whizan Serverless Edge Functions (${functions.length}):${c.reset}\n`);
      for (const fn of functions) {
        const url = `https://${fn.slug}.whizan.cloud`;
        console.error(`  ${c.emerald}●${c.reset} ${c.bold}${fn.name}${c.reset} ${c.dim}(${fn.isPublic ? "Public" : "Protected"})${c.reset}`);
        console.error(`    ${c.dim}Slug:${c.reset} ${fn.slug}  ${c.dim}Version:${c.reset} v${fn.version || 1}  ${c.dim}Memory:${c.reset} ${fn.memoryMb || 128}MB`);
        console.error(`    ${c.dim}URL:${c.reset}  ${c.whizanCyan}${url}${c.reset}`);
      }
      console.error("");
      break;
    }

    case "deploy": {
      const sysStatus = await client.getSystemStatus();
      if (!sysStatus.vmOnline) {
        const auth = await client.getAuthStatus();
        const userName = auth.user?.name || auth.user?.email?.split("@")[0] || "Developer";
        const { printVmMaintenanceNotice } = await import("../utils/maintenance-notice.js");
        printVmMaintenanceNotice({
          userName,
          operationName: "Edge Function Deployment",
          contactEmail: sysStatus.contactEmail,
          contactUrl: sysStatus.contactUrl,
        });
        process.exit(0);
      }

      const filePath = subArgs.find((a) => !a.startsWith("-"));
      if (!filePath) {
        printError("Usage: whizan fn deploy <entry-file> [--name <name>] [--public] [--memory <mb>] [--timeout <sec>]");
        process.exit(1);
      }

      const resolved = path.resolve(process.cwd(), filePath);
      let code: string;
      try {
        code = await fs.readFile(resolved, "utf8");
      } catch (err: any) {
        printError(`Cannot read function file: ${resolved}\n${err.message}`);
        process.exit(1);
      }

      let name = path.basename(filePath, path.extname(filePath));
      const nameIdx = subArgs.findIndex((a) => a === "--name" || a === "-n");
      if (nameIdx !== -1 && subArgs[nameIdx + 1]) name = subArgs[nameIdx + 1];

      const slug = toSlug(name);
      const isPublic = subArgs.includes("--public") || subArgs.includes("-p");

      let memoryMb = 128;
      const memIdx = subArgs.findIndex((a) => a === "--memory");
      if (memIdx !== -1 && subArgs[memIdx + 1]) memoryMb = parseInt(subArgs[memIdx + 1], 10);

      let timeoutSec = 30;
      const timeIdx = subArgs.findIndex((a) => a === "--timeout");
      if (timeIdx !== -1 && subArgs[timeIdx + 1]) timeoutSec = parseInt(subArgs[timeIdx + 1], 10);

      const spinner = new Spinner(`Deploying edge function "${name}"...`).start();

      try {
        // Check if function already exists
        const existingList = await client.listFunctions();
        const existing = existingList.find((f: any) => f.slug === slug || f.name === name);

        let fnId: string;
        if (existing) {
          spinner.update(`Found existing function (${existing.id}), updating code...`);
          await client.deployFunction(existing.id, code);
          fnId = existing.id;
        } else {
          spinner.update(`Creating function service "${name}"...`);
          const created = await client.createFunctionService({
            name,
            slug,
            isPublic,
            memoryMb,
            timeoutSec,
          });
          fnId = created.id || created.service?.id;
          spinner.update("Deploying initial ESM bundle...");
          await client.deployFunction(fnId, code);
        }

        let apiKey: string | null = null;
        if (!isPublic && !existing) {
          spinner.update("Generating Function Live API Key...");
          const keyRes = await client.createFunctionApiKey(fnId, { name: "default-cli-key" }).catch(() => null);
          apiKey = keyRes?.rawKey || keyRes?.apiKey || keyRes?.key;
        }

        const liveUrl = `https://${slug}.whizan.cloud`;
        spinner.succeed(`Edge function "${name}" deployed successfully!`);

        console.error(`\n  ${c.bold}Function Details:${c.reset}`);
        printKV("Function ID", fnId);
        printKV("Access Policy", isPublic ? "Public Webhook" : "Protected (API Key required)");
        printKV("Live URL", liveUrl);
        printKV("Memory / Timeout", `${memoryMb}MB / ${timeoutSec}s`);

        if (apiKey) {
          console.error(`\n  ${c.amber}⚠ Function API Key (keep secret!):${c.reset}`);
          console.error(`  ${c.whizanCyan}${c.bold}${apiKey}${c.reset}`);
          console.error(`  ${c.dim}Pass via header: 'x-api-key: ${apiKey}'${c.reset}\n`);
        }
      } catch (err: any) {
        spinner.fail("Function deployment failed");
        printError(err.message || String(err));
        process.exit(1);
      }
      break;
    }

    case "invoke": {
      const sysStatus = await client.getSystemStatus();
      if (!sysStatus.vmOnline) {
        const auth = await client.getAuthStatus();
        const userName = auth.user?.name || auth.user?.email?.split("@")[0] || "Developer";
        const { printVmMaintenanceNotice } = await import("../utils/maintenance-notice.js");
        printVmMaintenanceNotice({
          userName,
          operationName: "Edge Function Invocation",
          contactEmail: sysStatus.contactEmail,
          contactUrl: sysStatus.contactUrl,
        });
        process.exit(0);
      }

      const slug = subArgs.find((a) => !a.startsWith("-"));
      if (!slug) {
        printError("Usage: whizan fn invoke <slug> [--path /route] [--method POST] [--data '{\"key\":\"val\"}'] [--key <api-key>]");
        process.exit(1);
      }

      let targetPath = "/";
      const pathIdx = subArgs.findIndex((a) => a === "--path");
      if (pathIdx !== -1 && subArgs[pathIdx + 1]) targetPath = subArgs[pathIdx + 1];

      let method = "GET";
      const methIdx = subArgs.findIndex((a) => a === "--method" || a === "-m");
      if (methIdx !== -1 && subArgs[methIdx + 1]) method = subArgs[methIdx + 1].toUpperCase();

      let body: any = undefined;
      const dataIdx = subArgs.findIndex((a) => a === "--data" || a === "-d");
      if (dataIdx !== -1 && subArgs[dataIdx + 1]) {
        try {
          body = JSON.parse(subArgs[dataIdx + 1]);
        } catch {
          body = subArgs[dataIdx + 1];
        }
        if (!methIdx) method = "POST";
      }

      let apiKey: string | undefined = undefined;
      const keyIdx = subArgs.findIndex((a) => a === "--key" || a === "-k");
      if (keyIdx !== -1 && subArgs[keyIdx + 1]) apiKey = subArgs[keyIdx + 1];

      const spinner = new Spinner(`Invoking ${slug}${targetPath}...`).start();
      try {
        const res = await client.invokeFunction(slug, {
          path: targetPath,
          method,
          body,
          apiKey,
        });

        spinner.stop();
        const statusColor = res.ok ? c.emerald : c.red;
        console.error(`\n  ${statusColor}●${c.reset} ${c.bold}HTTP ${res.status}${c.reset} ${c.dim}(${res.durationMs}ms)${c.reset} • ${c.dim}${res.url}${c.reset}\n`);
        if (typeof res.data === "object") {
          console.log(JSON.stringify(res.data, null, 2));
        } else {
          console.log(res.data);
        }
      } catch (err: any) {
        spinner.fail("Invocation failed");
        printError(err.message || String(err));
        process.exit(1);
      }
      break;
    }

    default:
      console.error(`
  ${c.bold}${c.brightWhite}WHIZAN EDGE FUNCTIONS USAGE${c.reset}
    ${c.whizanCyan}whizan fn ls${c.reset}                                 List all edge functions
    ${c.whizanCyan}whizan fn deploy <file> [--public]${c.reset}          Deploy serverless ESM file
    ${c.whizanCyan}whizan fn invoke <slug> [--path /abc]${c.reset}       Invoke function endpoint
`);
      break;
  }
}
