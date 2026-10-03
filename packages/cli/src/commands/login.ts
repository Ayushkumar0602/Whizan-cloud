// ─── Whizan CLI — Login Command ──────────────────────────────────────────────

import http from "http";
import { exec } from "child_process";
import { saveConfig, getConfigPath } from "../core/auth.js";
import { client } from "../core/client.js";
import { printBanner, colors, printError, printKV } from "../utils/terminal-ui.js";

const c = colors;

export async function loginCommand(args: string[]) {
  printBanner();

  // ─── Check for explicit token via flag ──────────────────────────────────
  let token: string | undefined;
  const tokenIdx = args.findIndex((a) => a === "--token" || a === "--api-key" || a === "-t");
  if (tokenIdx !== -1 && args[tokenIdx + 1]) {
    token = args[tokenIdx + 1].trim();
  } else if (args[0] && !args[0].startsWith("-") && args[0] !== "login" && args[0] !== "auth") {
    token = args[0].trim();
  }

  const urlIdx = args.findIndex((a) => a === "--url");
  const customUrl = urlIdx !== -1 ? args[urlIdx + 1]?.trim() : undefined;

  // ─── Token-based login ──────────────────────────────────────────────────
  if (token) {
    console.error(`  ${c.dim}[1/2]${c.reset} 🔐 Verifying API key...`);
    await saveConfig({ apiKey: token, ...(customUrl ? { apiUrl: customUrl } : {}) });
    await client.reload();
    const status = await client.getAuthStatus();

    if (status.authenticated) {
      console.error(`\n  ${c.emerald}✔ Authenticated with Whizan Cloud!${c.reset}`);
      printKV("User", status.user?.email || "Developer");
      printKV("Plan", status.user?.subscriptionTier || "HOBBY");
      printKV("Saved to", getConfigPath());
      console.error(`\n  ${c.brightCyan}🚀 Ready! Run 'whizan deploy' in any project.${c.reset}\n`);
      process.exit(0);
    } else {
      printError(`Authentication failed: ${status.message || "Invalid API key"}`);
      process.exit(1);
    }
  }

  // ─── Browser-based OAuth login ──────────────────────────────────────────
  console.error(`  ${c.whizanCyan}🚀 Opening browser for 1-click authentication...${c.reset}\n`);

  const localServer = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      if (parsedUrl.pathname === "/callback") {
        const receivedToken = parsedUrl.searchParams.get("token") || parsedUrl.searchParams.get("key");
        const email = parsedUrl.searchParams.get("email");

        if (receivedToken) {
          await saveConfig({ apiKey: receivedToken, ...(customUrl ? { apiUrl: customUrl } : {}) });

          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <title>Whizan Cloud — Connected</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #080b11; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #0f172a; border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 16px; padding: 2.5rem; text-align: center; max-width: 440px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
                .icon { font-size: 3rem; margin-bottom: 1rem; }
                h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
                p { color: #94a3b8; line-height: 1.5; font-size: 0.95rem; }
                .badge { display: inline-block; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #10b981; padding: 0.35rem 0.85rem; border-radius: 9999px; font-size: 0.85rem; font-weight: 600; margin-top: 1rem; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="icon">✨</div>
                <h1>Machine Connected!</h1>
                <p>Whizan CLI has been authorized${email ? ` for <strong>${email}</strong>` : ""}.</p>
                <div class="badge">Ready to deploy</div>
                <p style="margin-top: 1.5rem; font-size: 0.8rem; color: #64748b;">You can close this tab and return to your terminal.</p>
              </div>
            </body>
            </html>
          `);

          console.error(`\n  ${c.emerald}✔ Machine authenticated with Whizan Cloud!${c.reset}`);
          if (email) printKV("User", email);
          printKV("Saved to", getConfigPath());
          console.error(`\n  ${c.brightCyan}🚀 Ready! Run 'whizan deploy' in any project.${c.reset}\n`);

          setTimeout(() => {
            localServer.close();
            process.exit(0);
          }, 1000);
          return;
        }
      }

      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Invalid authorization request");
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Error: " + err.message);
    }
  });

  // Listen on random free port
  localServer.listen(0, "127.0.0.1", () => {
    const address = localServer.address() as any;
    const port = address.port;
    const dashboardBase = customUrl || "https://whizan-cloud-service-dashboard.vercel.app";
    const authUrl = `${dashboardBase}/mcp/connect?port=${port}`;

    console.error(`  ${c.dim}If the browser doesn't open, visit:${c.reset}`);
    console.error(`  ${c.whizanCyan}${authUrl}${c.reset}\n`);

    const openCmd =
      process.platform === "win32"
        ? `start "" "${authUrl}"`
        : process.platform === "darwin"
        ? `open "${authUrl}"`
        : `xdg-open "${authUrl}"`;

    exec(openCmd, () => {});
  });

  // 3-minute timeout
  setTimeout(() => {
    console.error(`\n  ${c.amber}⌛ Timed out (no response in 3 minutes).${c.reset}`);
    console.error(`  ${c.dim}Try again, or use: whizan login -t YOUR_API_KEY${c.reset}\n`);
    localServer.close();
    process.exit(1);
  }, 180000);
}
