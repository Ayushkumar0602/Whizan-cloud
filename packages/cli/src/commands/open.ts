// ─── Whizan CLI — Open Command ────────────────────────────────────────────────

import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { client } from "../core/client.js";
import { colors, Spinner, printError } from "../utils/terminal-ui.js";

const c = colors;

function openBrowser(url: string) {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${url}"`, (err) => {
    if (err) {
      console.error(`  ${c.dim}Could not open browser automatically. Visit:${c.reset}`);
      console.error(`  ${c.whizanCyan}${c.bold}${url}${c.reset}\n`);
    }
  });
}

export async function openCommand(args: string[] = []) {
  let targetId = args.find((a) => !a.startsWith("-"));
  let targetType: "service" | "project" = "service";
  let slug: string | null = null;

  if (!targetId) {
    try {
      const raw = await fs.readFile(path.join(process.cwd(), ".whizan.json"), "utf8");
      const cfg = JSON.parse(raw);
      targetId = cfg.targetId;
      targetType = cfg.type || "service";
      slug = cfg.slug;
    } catch {}
  }

  if (!targetId && !slug) {
    printError("No target deployment specified. Run inside a linked project directory or pass ID/slug.");
    process.exit(1);
  }

  const spinner = new Spinner("Resolving live deployment URL...").start();

  let liveUrl = "";
  if (targetId) {
    const svc = await client.getService(targetId).catch(() => null);
    if (svc) {
      liveUrl = svc.liveUrl || `http://${svc.slug}.20.2.136.11.nip.io`;
    } else {
      const proj = await client.getProject(targetId).catch(() => null);
      if (proj) {
        liveUrl = proj.liveUrl || `http://${proj.slug}.20.2.136.11.nip.io`;
      }
    }
  }

  if (!liveUrl && slug) {
    liveUrl = `http://${slug}.20.2.136.11.nip.io`;
  }

  if (!liveUrl) {
    spinner.fail("Target not found");
    printError(`Could not find deployment details for "${targetId || slug}"`);
    process.exit(1);
  }

  // Ensure HTTP for nip.io
  if (liveUrl.startsWith("https://") && liveUrl.includes("nip.io")) {
    liveUrl = liveUrl.replace(/^https:\/\//i, "http://");
  }

  const sysStatus = await client.getSystemStatus();
  if (!sysStatus.vmOnline) {
    spinner.stop();
    const auth = await client.getAuthStatus();
    const userName = auth.user?.name || auth.user?.email?.split("@")[0] || "Developer";
    const { printVmMaintenanceNotice } = await import("../utils/maintenance-notice.js");
    printVmMaintenanceNotice({
      userName,
      operationName: `Open URL (${liveUrl})`,
      contactEmail: sysStatus.contactEmail,
      contactUrl: sysStatus.contactUrl,
    });
    console.error(`  ${c.amber}⚠ Notice: The Whizan Cloud edge router is temporarily offline. Live URL ${liveUrl} is unreachable until reactivated.${c.reset}\n`);
    return;
  }

  spinner.succeed(`Opening ${c.whizanCyan}${liveUrl}${c.reset} in browser...`);
  openBrowser(liveUrl);
}
