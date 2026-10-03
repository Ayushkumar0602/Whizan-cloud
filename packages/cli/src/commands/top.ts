// ─── Whizan CLI — Top Command (Real-Time Terminal Dashboard) ─────────────────

import readline from "readline";
import { exec } from "child_process";
import { client } from "../core/client.js";
import { colors, printBanner } from "../utils/terminal-ui.js";

const c = colors;

interface ResourceItem {
  type: "service" | "project" | "function" | "database";
  id: string;
  name: string;
  slug: string;
  status: string;
  port: number | string;
  memory: string;
  restarts: number;
  url: string;
}

function openBrowser(url: string) {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${url}"`, () => {});
}

export async function topCommand() {
  // If not a TTY (piped or redirected), print summary and exit
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const services = await client.listServices();
    const projects = await client.listProjects();
    const databases = await client.listDatabases();
    const functions = await client.listFunctions();

    console.log(`Whizan Cloud Summary:`);
    console.log(`- Services: ${services.length}`);
    console.log(`- Projects: ${projects.length}`);
    console.log(`- Databases: ${databases.length}`);
    console.log(`- Functions: ${functions.length}`);
    return;
  }

  const auth = await client.getAuthStatus();
  if (!auth.authenticated) {
    console.error(`\n  ${c.red}Not authenticated.${c.reset} Run 'whizan login' first.\n`);
    process.exit(1);
  }

  const user = auth.user;
  let items: ResourceItem[] = [];
  let selectedIndex = 0;
  let isRunning = true;
  let lastUpdated = new Date().toLocaleTimeString();
  let statusMessage = "";

  // Switch to alternate screen buffer and hide cursor
  process.stdout.write("\x1b[?1049h\x1b[?25l");

  function cleanupAndExit() {
    isRunning = false;
    // Restore cursor and switch back from alternate screen buffer
    process.stdout.write("\x1b[?25h\x1b[?1049l");
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(false);
      } catch {}
    }
    process.exit(0);
  }

  process.on("SIGINT", cleanupAndExit);
  process.on("SIGTERM", cleanupAndExit);

  // Setup raw mode for hotkeys
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.on("keypress", (str, key) => {
    if (key.ctrl && key.name === "c") {
      cleanupAndExit();
      return;
    }

    if (key.name === "q" || key.name === "escape") {
      cleanupAndExit();
      return;
    }

    if (key.name === "up") {
      if (items.length > 0) {
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        render();
      }
      return;
    }

    if (key.name === "down") {
      if (items.length > 0) {
        selectedIndex = (selectedIndex + 1) % items.length;
        render();
      }
      return;
    }

    // Open live URL
    if (key.name === "o") {
      const selected = items[selectedIndex];
      if (selected && selected.url && selected.url !== "—") {
        openBrowser(selected.url);
        statusMessage = `Opened ${selected.url} in browser!`;
        render();
      }
      return;
    }

    // Manual refresh
    if (key.name === "r") {
      statusMessage = "Refreshing cloud resources...";
      render();
      fetchData().then(render);
      return;
    }
  });

  async function fetchData() {
    try {
      const [services, projects, databases, functions] = await Promise.all([
        client.listServices().catch(() => []),
        client.listProjects().catch(() => []),
        client.listDatabases().catch(() => []),
        client.listFunctions().catch(() => []),
      ]);

      const newItems: ResourceItem[] = [];

      for (const s of services) {
        const latestDep = s.deployments?.[0];
        const status = latestDep?.status || (s.autoSleep ? "SLEEPING" : "ACTIVE");
        const url = s.liveUrl || (s.internalPort > 0 ? `http://${s.slug}.20.2.136.11.nip.io` : "—");
        newItems.push({
          type: "service",
          id: s.id,
          name: s.name || s.slug,
          slug: s.slug,
          status,
          port: s.internalPort === 0 ? "worker" : s.internalPort || 8000,
          memory: `${s.instanceType === "pro" ? "2048" : "512"}MB`,
          restarts: s.restartCount || 0,
          url,
        });
      }

      for (const p of projects) {
        const latestDep = p.deployments?.[0];
        const status = latestDep?.status || "ACTIVE";
        const url = p.liveUrl || `http://${p.slug}.20.2.136.11.nip.io`;
        newItems.push({
          type: "project",
          id: p.id,
          name: p.name || p.slug,
          slug: p.slug,
          status,
          port: "Edge",
          memory: "CDN",
          restarts: 0,
          url,
        });
      }

      for (const fn of functions) {
        const url = `http://${fn.slug}.fn.20.2.136.11.nip.io`;
        newItems.push({
          type: "function",
          id: fn.id,
          name: fn.name || fn.slug,
          slug: fn.slug,
          status: "READY",
          port: "v8:9090",
          memory: `${fn.memoryMb || 128}MB`,
          restarts: 0,
          url,
        });
      }

      for (const db of databases) {
        newItems.push({
          type: "database",
          id: db.id,
          name: db.name || "db",
          slug: db.slug || db.name,
          status: db.status || "ACTIVE",
          port: db.port || 5432,
          memory: "512MB",
          restarts: 0,
          url: db.connectionString ? "postgresql://..." : "—",
        });
      }

      items = newItems;
      if (selectedIndex >= items.length) selectedIndex = Math.max(0, items.length - 1);
      lastUpdated = new Date().toLocaleTimeString();
    } catch (err: any) {
      statusMessage = `Fetch error: ${err.message}`;
    }
  }

  function render() {
    if (!isRunning) return;
    const width = process.stdout.columns || 100;
    const height = process.stdout.rows || 24;

    let buf = "\x1b[H\x1b[2J"; // Clear screen & home cursor

    // ── Header Banner ────────────────────────────────────────────────────────
    buf += `  ${c.whizanCyan}${c.bold}WHIZAN CLOUD TOP MONITOR${c.reset}  ${c.dim}•  v1.0.0${c.reset}\n`;
    buf += `  ${c.dim}User:${c.reset} ${c.bold}${user?.email || "User"}${c.reset}  ${c.dim}Plan:${c.reset} ${c.whizanBlue}${user?.subscriptionTier || user?.plan || "HOBBY"}${c.reset}  ${c.dim}Updated:${c.reset} ${c.emerald}${lastUpdated}${c.reset}\n`;
    buf += `  ${c.dim}Resources:${c.reset} ${items.filter((i) => i.type === "service").length} Services  •  ${items.filter((i) => i.type === "project").length} Web Projects  •  ${items.filter((i) => i.type === "function").length} Functions  •  ${items.filter((i) => i.type === "database").length} Databases\n`;
    buf += `  ${c.dim}${"─".repeat(Math.max(40, width - 4))}${c.reset}\n\n`;

    // ── Table Header ─────────────────────────────────────────────────────────
    const pad = (s: string, len: number) => (s.length > len ? s.slice(0, len - 1) + "…" : s.padEnd(len));
    buf += `  ${c.dim}   ${pad("TYPE", 10)} ${pad("NAME", 26)} ${pad("STATUS", 12)} ${pad("PORT", 9)} ${pad("MEMORY", 10)} ${pad("URL", Math.max(20, width - 75))}${c.reset}\n`;
    buf += `  ${c.dim}   ${"─".repeat(Math.max(40, width - 8))}${c.reset}\n`;

    // ── Table Rows ───────────────────────────────────────────────────────────
    if (items.length === 0) {
      buf += `\n     ${c.dim}No resources deployed on Whizan Cloud yet. Run 'whizan deploy' to deploy one.${c.reset}\n\n`;
    } else {
      items.forEach((item, idx) => {
        const isSelected = idx === selectedIndex;
        const prefix = isSelected ? `${c.whizanCyan}${c.bold} ▶ ${c.reset}` : "   ";
        const bg = isSelected ? "\x1b[48;2;25;35;55m" : "";

        let statusBadge = item.status;
        if (item.status === "ACTIVE" || item.status === "READY" || item.status === "HEALTHY") {
          statusBadge = `${c.emerald}● ACTIVE${c.reset}`;
        } else if (item.status === "SLEEPING") {
          statusBadge = `${c.amber}○ SLEEP ${c.reset}`;
        } else if (item.status === "FAILED" || item.status === "ERROR") {
          statusBadge = `${c.red}✖ FAILED${c.reset}`;
        } else {
          statusBadge = `${c.dim}${item.status.slice(0, 8)}${c.reset}`;
        }

        const typeColor =
          item.type === "service"
            ? c.whizanCyan
            : item.type === "project"
            ? c.whizanBlue
            : item.type === "function"
            ? c.whizanPurple
            : c.amber;

        const row = `${prefix}${bg}${typeColor}${pad(item.type.toUpperCase(), 10)}${c.reset}${bg} ${c.bold}${pad(item.name, 26)}${c.reset}${bg} ${pad(statusBadge, 12)} ${c.dim}${pad(String(item.port), 9)}${c.reset}${bg} ${pad(item.memory, 10)} ${c.dim}${pad(item.url, Math.max(20, width - 75))}${c.reset}`;
        buf += row + "\n";
      });
    }

    // ── Footer & Hotkeys ─────────────────────────────────────────────────────
    buf += `\n  ${c.dim}${"─".repeat(Math.max(40, width - 4))}${c.reset}\n`;
    if (statusMessage) {
      buf += `  ${c.whizanCyan}ℹ ${statusMessage}${c.reset}\n`;
    }
    buf += `  ${c.bold}[↑/↓]${c.reset} ${c.dim}Navigate${c.reset}   ${c.bold}[o]${c.reset} ${c.dim}Open in Browser${c.reset}   ${c.bold}[r]${c.reset} ${c.dim}Refresh${c.reset}   ${c.bold}[q]${c.reset} ${c.dim}Quit Monitor${c.reset}\n`;

    process.stdout.write(buf);
  }

  // Initial fetch and start loop
  await fetchData();
  render();

  // Auto-refresh every 3 seconds
  const interval = setInterval(async () => {
    if (!isRunning) return;
    await fetchData();
    render();
  }, 3000);

  // Clean up interval on exit
  process.on("exit", () => clearInterval(interval));
}
