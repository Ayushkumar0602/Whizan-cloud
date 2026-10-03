// ─── Whizan CLI — Init Command ────────────────────────────────────────────────

import fs from "fs/promises";
import path from "path";
import { analyzeStack } from "../core/analyzer.js";
import { toSlug } from "../utils/slug.js";
import { colors, Spinner, prompt, confirm } from "../utils/terminal-ui.js";

const c = colors;

export interface WhizanProjectConfig {
  name: string;
  slug: string;
  type: "service" | "project";
  targetType?: "service" | "project";
  framework?: string;
  language?: string;
  internalPort?: number;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
  outputDir?: string;
  isWorker?: boolean;
  targetId?: string;
  lastDeployedAt?: string;
}

export async function initCommand(args: string[] = []) {
  const cwd = process.cwd();
  const configPath = path.join(cwd, ".whizan.json");

  // Check if .whizan.json already exists
  try {
    await fs.access(configPath);
    const overwrite = await confirm("A .whizan.json file already exists. Overwrite it?", false);
    if (!overwrite) {
      console.error(`  ${c.dim}Init cancelled.${c.reset}`);
      return;
    }
  } catch {
    // File doesn't exist, proceed
  }

  const spinner = new Spinner("Analyzing directory...").start();
  const analysis = await analyzeStack(cwd);
  spinner.succeed(`Detected stack: ${c.whizanCyan}${analysis.framework}${c.reset} (${analysis.language})`);

  const defaultName = path.basename(cwd);
  const name = await prompt("Project name", defaultName);
  const slug = toSlug(name);

  const defaultType = analysis.targetType;
  const typeAnswer = await prompt("Deployment type (service | project)", defaultType);
  const type: "service" | "project" = typeAnswer.toLowerCase().startsWith("p") ? "project" : "service";

  const config: WhizanProjectConfig = {
    name,
    slug,
    targetType: type,
    type,
    framework: analysis.framework,
    language: analysis.language,
  };

  if (type === "project") {
    config.buildCommand = await prompt("Build command", analysis.buildCommand || "npm run build");
    config.outputDir = await prompt("Output directory", analysis.outputDir || "dist");
  } else {
    config.startCommand = await prompt("Start command", analysis.startCommand || "npm start");
    config.internalPort = parseInt(
      await prompt("Internal HTTP port", String(analysis.internalPort || 8000)),
      10
    );
    if (analysis.isWorker) config.isWorker = true;
  }

  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.error(`\n  ${c.emerald}✔${c.reset} Created ${c.bold}.whizan.json${c.reset} successfully!`);
  console.error(`  ${c.dim}You can now deploy anytime by running: ${c.whizanCyan}whizan deploy${c.reset}\n`);
}
