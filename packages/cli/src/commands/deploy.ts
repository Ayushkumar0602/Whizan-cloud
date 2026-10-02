// ─── Whizan CLI — Deploy Command ──────────────────────────────────────────────
// The 6-Phase CLI Deployment Protocol

import fs from "fs/promises";
import path from "path";
import { client, ApiError } from "../core/client.js";
import { analyzeStack, type StackAnalysis } from "../core/analyzer.js";
import { packDirectory } from "../core/archive.js";
import { patchLoopback } from "../core/patcher.js";
import { toSlug } from "../utils/slug.js";
import {
  colors,
  printBanner,
  Spinner,
  step,
  printDeploySuccess,
  printError,
  printKV,
  printBuildLog,
  prompt,
  confirm,
} from "../utils/terminal-ui.js";

const c = colors;

export interface DeployOptions {
  yes?: boolean;
  name?: string;
  dir?: string;
  port?: number;
  type?: "service" | "project";
  env?: Record<string, string>;
  noHealthCheck?: boolean;
  json?: boolean;
  verbose?: boolean;
}

export function parseDeployArgs(args: string[]): DeployOptions {
  const opts: DeployOptions = { env: {} };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-y" || arg === "--yes") opts.yes = true;
    else if (arg === "--no-health-check") opts.noHealthCheck = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--verbose") opts.verbose = true;
    else if ((arg === "--name" || arg === "-n") && args[i + 1]) {
      opts.name = args[++i];
    } else if ((arg === "--dir" || arg === "-d") && args[i + 1]) {
      opts.dir = args[++i];
    } else if ((arg === "--port" || arg === "-p") && args[i + 1]) {
      opts.port = parseInt(args[++i], 10);
    } else if (arg === "--type" && args[i + 1]) {
      const t = args[++i].toLowerCase();
      if (t === "service" || t === "project") opts.type = t;
    } else if ((arg === "--env" || arg === "-e") && args[i + 1]) {
      const pair = args[++i];
      const eqIdx = pair.indexOf("=");
      if (eqIdx > 0) {
        opts.env![pair.substring(0, eqIdx).trim()] = pair.substring(eqIdx + 1).trim();
      }
    }
  }
  return opts;
}

export async function deployCommand(args: string[] = []) {
  const opts = parseDeployArgs(args);
  const targetDir = opts.dir ? path.resolve(process.cwd(), opts.dir) : process.cwd();

  if (!opts.json) {
    printBanner("1.0.0");
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 1: Authentication Check
  // ═════════════════════════════════════════════════════════════════════════
  if (!opts.json) step(1, 6, "🔐", "Checking authentication...");
  const authSpinner = opts.json ? null : new Spinner("Verifying credentials...").start();

  const auth = await client.getAuthStatus();
  if (!auth.authenticated) {
    authSpinner?.fail("Not logged in");
    printError("You must log in to Whizan Cloud before deploying.\nRun: whizan login");
    process.exit(1);
  }

  const user = auth.user;
  const userPlan = user?.plan || "Hobby";
  authSpinner?.succeed(`Logged in as ${c.bold}${user?.email || "User"}${c.reset} (${c.whizanCyan}${userPlan} plan${c.reset})`);

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 2: Workspace Analysis & Context Sync
  // ═════════════════════════════════════════════════════════════════════════
  if (!opts.json) step(2, 6, "🔍", "Analyzing workspace...");
  const analyzeSpinner = opts.json ? null : new Spinner("Detecting stack & configuration...").start();

  // Check local .whizan.json
  const configPath = path.join(targetDir, ".whizan.json");
  let localConfig: any = null;
  try {
    const raw = await fs.readFile(configPath, "utf8");
    localConfig = JSON.parse(raw);
  } catch {}

  const analysis: StackAnalysis = await analyzeStack(targetDir);

  // Check if directory is empty
  if (analysis.projectType === "unknown" && analysis.warnings.some((w) => w.includes("Empty directory"))) {
    analyzeSpinner?.fail("Empty directory");
    printError("No deployable project files found in this directory.\nRun 'whizan init' first or switch to your project folder.");
    process.exit(1);
  }

  analyzeSpinner?.succeed(
    `Stack: ${c.whizanCyan}${analysis.framework}${c.reset} (${analysis.language}) • Target: ${c.bold}${analysis.targetType}${c.reset}`
  );

  // Check monorepo
  if (analysis.projectType === "monorepo" && !opts.dir) {
    console.error(`\n  ${c.amber}⚠ Monorepo structure detected!${c.reset}`);
    if (analysis.monorepoApps.length > 0) {
      console.error(`  Available apps: ${analysis.monorepoApps.join(", ")}`);
    }
    if (!opts.yes) {
      const selected = await prompt("Enter subdirectory to deploy (e.g. apps/api)", analysis.monorepoApps[0] || "");
      if (selected) {
        return deployCommand([...args, "--dir", selected]);
      }
    }
  }

  // Check loopback binding trap (127.0.0.1 / localhost)
  if (analysis.hasLoopbackTrap) {
    console.error(`\n  ${c.red}⚠ CRITICAL: App binds to 127.0.0.1 / localhost.${c.reset}`);
    console.error(`  ${c.dim}Whizan containers run in an isolated network mesh and must bind to 0.0.0.0.${c.reset}`);
    let shouldPatch = opts.yes;
    if (!opts.yes) {
      shouldPatch = await confirm("Auto-patch server entry to bind to 0.0.0.0?", true);
    }
    if (shouldPatch) {
      const patchRes = await patchLoopback(targetDir);
      if (patchRes.patched) {
        console.error(`  ${c.emerald}✔${c.reset} ${patchRes.message}`);
      }
    }
  }

  // Display detected configuration
  if (!opts.json) {
    if (analysis.internalPort > 0) {
      printKV("Internal Port", String(opts.port || analysis.internalPort));
    }
    if (analysis.startCommand) {
      printKV("Start Command", analysis.startCommand);
    }
    if (analysis.buildCommand) {
      printKV("Build Command", analysis.buildCommand);
    }
  }

  // Check for existing deployment reuse
  let targetType: "service" | "project" = opts.type || localConfig?.type || analysis.targetType;
  let targetId: string | null = localConfig?.targetId || null;
  let slug: string = opts.name ? toSlug(opts.name) : localConfig?.slug || toSlug(localConfig?.name || path.basename(targetDir));
  let isRedeploy = false;

  if (targetId) {
    // Verify existing deployment still exists on server
    const checkSpinner = opts.json ? null : new Spinner(`Checking existing deployment (${targetId})...`).start();
    const existing = targetType === "service"
      ? await client.getService(targetId)
      : await client.getProject(targetId);

    if (existing) {
      checkSpinner?.succeed(`Found existing deployment: ${c.bold}${existing.name || slug}${c.reset} (${targetId})`);
      let confirmRedeploy = true;
      if (!opts.yes) {
        confirmRedeploy = await confirm(`Redeploy to existing ${targetType}?`, true);
      }
      if (confirmRedeploy) {
        isRedeploy = true;
      } else {
        targetId = null; // Create new instead
        slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      }
    } else {
      checkSpinner?.warn("Previous deployment record not found on server. Creating fresh deployment.");
      targetId = null;
    }
  }

  // Environment variables resolution
  const collectedEnv: Record<string, string> = { ...(opts.env || {}) };

  // Read local .env if present
  try {
    const envRaw = await fs.readFile(path.join(targetDir, ".env"), "utf8");
    envRaw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .forEach((l) => {
        const idx = l.indexOf("=");
        const k = l.substring(0, idx).trim();
        const v = l.substring(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (k && !collectedEnv[k]) collectedEnv[k] = v;
      });
  } catch {}

  // Prompt for any missing required env vars
  const missing = analysis.envVarsMissing.filter((k) => !collectedEnv[k]);
  if (missing.length > 0 && !opts.yes && !isRedeploy) {
    console.error(`\n  ${c.amber}⚠ Required environment variables detected in code:${c.reset}`);
    for (const key of missing) {
      const val = await prompt(`Enter value for ${c.bold}${key}${c.reset}`);
      if (val) collectedEnv[key] = val;
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 3: Workspace Packing & Tarball Creation
  // ═════════════════════════════════════════════════════════════════════════
  if (!opts.json) step(3, 6, "📦", "Packing workspace...");
  const packSpinner = opts.json ? null : new Spinner("Creating source archive...").start();

  let archiveBuffer: Buffer;
  let archiveSizeMB: string;
  try {
    const packRes = await packDirectory(targetDir, targetType);
    archiveBuffer = packRes.buffer;
    archiveSizeMB = packRes.sizeMB;
    packSpinner?.succeed(`Archive created (${c.bold}${archiveSizeMB} MB${c.reset}, excluded node_modules, git, and secrets)`);
  } catch (err: any) {
    packSpinner?.fail("Archive packing failed");
    printError(err.message || String(err));
    process.exit(1);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 4: Resource Creation & Direct Upload
  // ═════════════════════════════════════════════════════════════════════════
  if (!opts.json) step(4, 6, "🚀", "Deploying to Whizan Cloud...");
  const deploySpinner = opts.json ? null : new Spinner(isRedeploy ? "Uploading updated source code..." : `Creating new ${targetType}...`).start();

  let liveUrl = "";
  let dashboardUrl = "";

  try {
    if (!targetId) {
      const name = opts.name || localConfig?.name || path.basename(targetDir);
      if (targetType === "project") {
        const project = await client.createProject({
          name,
          slug,
          framework: analysis.frameworkEnum,
          buildCommand: analysis.buildCommand || "npm run build",
          installCommand: analysis.installCommand || "npm install",
          outputDir: analysis.outputDir || "dist",
          envVars: collectedEnv,
        });
        targetId = project.id;
        slug = project.slug || slug;
        liveUrl = project.liveUrl || `http://${slug}.20.2.136.11.nip.io`;
        dashboardUrl = `https://dashboard.vercel.app/dashboard/projects/${targetId}`;
      } else {
        const service = await client.createService({
          name,
          slug,
          language: analysis.language,
          installCommand: analysis.installCommand || "npm install",
          startCommand: analysis.startCommand || "npm start",
          internalPort: opts.port || analysis.internalPort,
          isWorker: analysis.isWorker,
          instanceType: "starter",
          envVars: collectedEnv,
        });
        targetId = service.id;
        slug = service.slug || slug;
        liveUrl = service.liveUrl || `http://${slug}.20.2.136.11.nip.io`;
        dashboardUrl = `https://dashboard.vercel.app/dashboard/services/${targetId}`;
      }

      // Save/update .whizan.json
      const updatedConfig = {
        name,
        slug,
        type: targetType,
        targetId,
        framework: analysis.framework,
        lastDeployedAt: new Date().toISOString(),
      };
      await fs.writeFile(configPath, JSON.stringify(updatedConfig, null, 2) + "\n", "utf8").catch(() => {});
    }

    deploySpinner?.update("Uploading archive payload to Azure VM...");
    const uploadRes = await client.uploadArchive(targetType, targetId!, archiveBuffer);
    const deploymentId = uploadRes.deploymentId || uploadRes.id || uploadRes.deployment?.id;

    deploySpinner?.succeed(
      `Source uploaded successfully (Target ID: ${c.whizanCyan}${targetId}${c.reset}, Deployment ID: ${c.whizanBlue}${deploymentId}${c.reset})`
    );

    // ═════════════════════════════════════════════════════════════════════
    // PHASE 5: Build Logs Polling & Streaming
    // ═════════════════════════════════════════════════════════════════════
    if (!opts.json) step(5, 6, "🛠️", "Building container image on Azure VM...");
    const buildSpinner = opts.json ? null : new Spinner("Waiting for build worker to initialize...").start();

    let seenLogs = 0;
    let buildStatus = "QUEUED";
    const startTime = Date.now();
    const timeoutMs = 10 * 60 * 1000; // 10 minutes timeout

    while (Date.now() - startTime < timeoutMs) {
      await new Promise((r) => setTimeout(r, 3500));
      const logData = await client.getBuildLogs(deploymentId);
      buildStatus = (logData.status || "BUILDING").toUpperCase();

      if (logData.logs && logData.logs.length > seenLogs) {
        if (buildSpinner) buildSpinner.stop();
        for (let i = seenLogs; i < logData.logs.length; i++) {
          printBuildLog(logData.logs[i]);
        }
        seenLogs = logData.logs.length;
        if (buildSpinner && buildStatus !== "READY" && buildStatus !== "ACTIVE" && buildStatus !== "FAILED") {
          buildSpinner.start();
        }
      }

      if (logData.liveUrl) liveUrl = logData.liveUrl;

      if (buildStatus === "READY" || buildStatus === "ACTIVE") {
        buildSpinner?.succeed(`Build succeeded with status ${c.emerald}${buildStatus}${c.reset}`);
        break;
      }

      if (buildStatus === "FAILED" || buildStatus === "ERROR") {
        buildSpinner?.fail(`Build failed on Azure VM`);
        if (logData.errorMessage) {
          printError(logData.errorMessage);
        }
        process.exit(1);
      }
    }

    // ═════════════════════════════════════════════════════════════════════
    // PHASE 6: Live Health Check Verification
    // ═════════════════════════════════════════════════════════════════════
    if (!opts.noHealthCheck) {
      if (!opts.json) step(6, 6, "🌐", "Running health check probe...");
      const healthSpinner = opts.json ? null : new Spinner("Probing live endpoint...").start();

      if (!liveUrl) {
        liveUrl = `http://${slug}.20.2.136.11.nip.io`;
      }
      // Ensure HTTP protocol for nip.io
      if (liveUrl.startsWith("https://") && liveUrl.includes("nip.io")) {
        liveUrl = liveUrl.replace(/^https:\/\//i, "http://");
      }

      let healthy = false;
      for (let attempt = 1; attempt <= 4; attempt++) {
        const health = await client.checkHealth(targetId!);
        if (health.ok) {
          healthy = true;
          healthSpinner?.succeed(`Service is healthy (${c.emerald}HTTP ${health.status} OK${c.reset})`);
          break;
        }
        await new Promise((r) => setTimeout(r, 4000));
      }

      if (!healthy) {
        healthSpinner?.warn("Endpoint is live but returned a non-200 status or takes longer to warm up.");
      }
    }

    // Done!
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            targetId,
            targetType,
            slug,
            deploymentId,
            liveUrl,
            dashboardUrl,
          },
          null,
          2
        )
      );
    } else {
      printDeploySuccess(liveUrl, dashboardUrl);
    }
  } catch (err: any) {
    deploySpinner?.fail("Deployment failed");
    printError(err.message || String(err));
    process.exit(1);
  }
}

export async function redeployCommand(args: string[] = []) {
  const cwd = process.cwd();
  const configPath = path.join(cwd, ".whizan.json");

  try {
    await fs.access(configPath);
  } catch {
    printError("No .whizan.json found. Run 'whizan deploy' first to link this project.");
    process.exit(1);
  }

  // Forward to deployCommand with --yes to streamline redeploy
  await deployCommand(["--yes", ...args]);
}
