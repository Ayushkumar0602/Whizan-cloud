// ─── Whizan CLI — Stack Analyzer ─────────────────────────────────────────────
// Detects project type, framework, language, port, env vars from filesystem

import fs from "fs/promises";
import path from "path";

export interface StackAnalysis {
  projectType: "frontend" | "backend" | "fullstack" | "worker" | "monorepo" | "unknown";
  framework: string;
  language: "NODEJS" | "PYTHON" | "GO" | "DOCKERFILE";
  targetType: "service" | "project";
  internalPort: number;
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  outputDir: string;
  frameworkEnum: "NEXTJS" | "VITE" | "REACT" | "ASTRO" | "CUSTOM";
  isWorker: boolean;
  hasDockerfile: boolean;
  hasLoopbackTrap: boolean;
  hasHealthEndpoint: boolean;
  usesEnvPort: boolean;
  envVarsReferenced: string[];
  envVarsInLocalEnv: string[];
  envVarsMissing: string[];
  monorepoApps: string[];
  warnings: string[];
}

export async function analyzeStack(workspaceDir: string): Promise<StackAnalysis> {
  const root = path.resolve(workspaceDir);
  const files = await fs.readdir(root).catch(() => [] as string[]);

  const result: StackAnalysis = {
    projectType: "unknown",
    framework: "Unknown",
    language: "NODEJS",
    targetType: "service",
    internalPort: 3000,
    installCommand: "npm install",
    buildCommand: "",
    startCommand: "npm start",
    outputDir: "dist",
    frameworkEnum: "CUSTOM",
    isWorker: false,
    hasDockerfile: files.some((f) => f.toLowerCase() === "dockerfile"),
    hasLoopbackTrap: false,
    hasHealthEndpoint: false,
    usesEnvPort: false,
    envVarsReferenced: [],
    envVarsInLocalEnv: [],
    envVarsMissing: [],
    monorepoApps: [],
    warnings: [],
  };

  // ─── Check for monorepo ──────────────────────────────────────────────
  const isMonorepo =
    (files.includes("apps") && files.includes("packages")) ||
    (files.includes("client") && files.includes("server")) ||
    (files.includes("frontend") && files.includes("backend"));

  if (isMonorepo) {
    result.projectType = "monorepo";
    // List apps/ subdirectories
    for (const dir of ["apps", "client", "server", "frontend", "backend"]) {
      if (files.includes(dir)) {
        try {
          const stat = await fs.stat(path.join(root, dir));
          if (stat.isDirectory()) {
            const subs = await fs.readdir(path.join(root, dir));
            for (const sub of subs) {
              const subStat = await fs.stat(path.join(root, dir, sub)).catch(() => null);
              if (subStat?.isDirectory()) result.monorepoApps.push(`${dir}/${sub}`);
            }
            if (["client", "server", "frontend", "backend"].includes(dir)) {
              result.monorepoApps.push(dir);
            }
          }
        } catch {}
      }
    }
    result.warnings.push(
      `Monorepo detected with ${result.monorepoApps.length} apps. Use --dir to specify which app to deploy.`
    );
    return result;
  }

  // ─── Check .whizan.json for worker flag ──────────────────────────────
  if (files.includes(".whizan.json")) {
    try {
      const raw = await fs.readFile(path.join(root, ".whizan.json"), "utf8");
      const cfg = JSON.parse(raw);
      if (cfg.project?.isWorker || cfg.isWorker) {
        result.isWorker = true;
        result.internalPort = 0;
      }
    } catch {}
  }

  // ─── Node.js Detection ───────────────────────────────────────────────
  if (files.includes("package.json")) {
    try {
      const pkgRaw = await fs.readFile(path.join(root, "package.json"), "utf8");
      const pkg = JSON.parse(pkgRaw);
      const scripts = pkg.scripts || {};
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      result.installCommand = "npm install";
      if (scripts.build) result.buildCommand = "npm run build";
      if (scripts.start) result.startCommand = "npm start";

      // Next.js
      if (allDeps["next"]) {
        result.projectType = "fullstack";
        result.framework = "Next.js";
        result.targetType = "project";
        result.frameworkEnum = "NEXTJS";
        result.outputDir = ".next";
        result.internalPort = 3000;

        // Check for output: 'export' with dynamic routes
        await checkNextConfig(root, result);
      }
      // Vite / React
      else if (allDeps["vite"] || allDeps["@vitejs/plugin-react"]) {
        result.projectType = "frontend";
        result.framework = "Vite (React)";
        result.targetType = "project";
        result.frameworkEnum = "VITE";
        result.outputDir = "dist";
      }
      // Create React App
      else if (allDeps["react-scripts"]) {
        result.projectType = "frontend";
        result.framework = "Create React App";
        result.targetType = "project";
        result.frameworkEnum = "REACT";
        result.outputDir = "build";
      }
      // Astro
      else if (allDeps["astro"]) {
        result.projectType = "frontend";
        result.framework = "Astro";
        result.targetType = "project";
        result.frameworkEnum = "ASTRO";
        result.outputDir = "dist";
      }
      // SvelteKit
      else if (allDeps["@sveltejs/kit"] || allDeps["svelte"]) {
        result.projectType = "frontend";
        result.framework = "SvelteKit";
        result.targetType = "project";
        result.frameworkEnum = "CUSTOM";
        result.outputDir = "build";
      }
      // Nuxt
      else if (allDeps["nuxt"]) {
        result.projectType = "fullstack";
        result.framework = "Nuxt.js";
        result.targetType = "project";
        result.frameworkEnum = "CUSTOM";
        result.outputDir = ".output";
      }
      // Express / Fastify / NestJS / Koa / Hono (backends)
      else if (allDeps["express"]) {
        result.projectType = "backend";
        result.framework = "Express";
        result.language = "NODEJS";
      } else if (allDeps["fastify"]) {
        result.projectType = "backend";
        result.framework = "Fastify";
        result.language = "NODEJS";
      } else if (allDeps["@nestjs/core"]) {
        result.projectType = "backend";
        result.framework = "NestJS";
        result.language = "NODEJS";
      } else if (allDeps["koa"]) {
        result.projectType = "backend";
        result.framework = "Koa";
        result.language = "NODEJS";
      } else if (allDeps["hono"]) {
        result.projectType = "backend";
        result.framework = "Hono";
        result.language = "NODEJS";
      }
      // Fallback: has start script → backend
      else if (scripts.start) {
        result.projectType = "backend";
        result.framework = "Node.js";
        result.language = "NODEJS";
      }
      // No recognizable framework
      else {
        result.warnings.push("No recognizable framework detected in package.json.");
      }
    } catch {}
  }

  // ─── Python Detection ────────────────────────────────────────────────
  if (files.includes("requirements.txt") || files.includes("pyproject.toml") || files.includes("Pipfile")) {
    result.language = "PYTHON";
    if (result.projectType === "unknown") result.projectType = "backend";

    const reqContent = await fs.readFile(path.join(root, "requirements.txt"), "utf8").catch(() => "");
    const pyprojectContent = await fs.readFile(path.join(root, "pyproject.toml"), "utf8").catch(() => "");
    const combined = reqContent + pyprojectContent;

    if (combined.includes("fastapi")) {
      result.framework = "FastAPI";
      result.startCommand = "uvicorn main:app --host 0.0.0.0 --port 8000";
      result.internalPort = 8000;
      if (!combined.includes("uvicorn")) result.warnings.push("FastAPI detected but uvicorn not in requirements. Add it.");
    } else if (combined.includes("django")) {
      result.framework = "Django";
      result.startCommand = "gunicorn project.wsgi:application --bind 0.0.0.0:8000";
      result.internalPort = 8000;
    } else if (combined.includes("flask")) {
      result.framework = "Flask";
      result.startCommand = "gunicorn app:app --bind 0.0.0.0:8000";
      result.internalPort = 8000;
    } else if (combined.includes("celery")) {
      result.framework = "Celery Worker";
      result.isWorker = true;
      result.internalPort = 0;
      result.startCommand = "celery -A tasks worker --loglevel=info";
    }

    if (files.includes("Pipfile")) result.installCommand = "pip install pipenv && pipenv install";
    else if (pyprojectContent.includes("[tool.poetry]")) result.installCommand = "pip install poetry && poetry install";
    else result.installCommand = "pip install -r requirements.txt";
  }

  // ─── Go Detection ────────────────────────────────────────────────────
  if (files.includes("go.mod")) {
    result.language = "GO";
    if (result.projectType === "unknown") result.projectType = "backend";
    result.framework = "Go";
    result.installCommand = "go mod download";
    result.buildCommand = "go build -o server .";
    result.startCommand = "./server";
    result.internalPort = 8080;
  }

  // ─── Rust / Java / PHP / Ruby → Dockerfile based ─────────────────────
  if (files.includes("Cargo.toml")) {
    result.language = "DOCKERFILE";
    result.framework = "Rust";
    if (result.projectType === "unknown") result.projectType = "backend";
  }
  if (files.includes("pom.xml") || files.includes("build.gradle") || files.includes("build.gradle.kts")) {
    result.language = "DOCKERFILE";
    result.framework = files.includes("pom.xml") ? "Java (Maven)" : "Java (Gradle)";
    if (result.projectType === "unknown") result.projectType = "backend";
    result.internalPort = 8080;
  }
  if (files.includes("composer.json")) {
    result.language = "DOCKERFILE";
    result.framework = "PHP / Laravel";
    if (result.projectType === "unknown") result.projectType = "backend";
  }
  if (files.includes("Gemfile")) {
    result.language = "DOCKERFILE";
    result.framework = "Ruby on Rails";
    if (result.projectType === "unknown") result.projectType = "backend";
  }

  // ─── Static HTML site ────────────────────────────────────────────────
  if (result.projectType === "unknown" && files.includes("index.html") && !files.includes("package.json")) {
    result.projectType = "frontend";
    result.framework = "Static HTML";
    result.targetType = "project";
    result.frameworkEnum = "CUSTOM";
    result.outputDir = ".";
    result.buildCommand = "";
    result.installCommand = "";
    result.startCommand = "";
  }

  // ─── Dockerfile override ─────────────────────────────────────────────
  if (result.hasDockerfile && result.targetType === "project") {
    result.frameworkEnum = "CUSTOM";
    result.warnings.push("Dockerfile found in web project. Whizan will build via Dockerfile.");
  } else if (result.hasDockerfile && result.projectType === "unknown") {
    result.projectType = "backend";
    result.language = "DOCKERFILE";
    result.framework = "Dockerfile";
  }

  // ─── Procfile (Heroku migration) ─────────────────────────────────────
  if (files.includes("Procfile")) {
    try {
      const procfile = await fs.readFile(path.join(root, "Procfile"), "utf8");
      const webLine = procfile.split("\n").find((l) => l.startsWith("web:"));
      if (webLine) {
        result.startCommand = webLine.replace("web:", "").trim();
        result.warnings.push(`Procfile detected (Heroku migration). Using start command: "${result.startCommand}"`);
      }
    } catch {}
  }

  // ─── Scan entry files for port, loopback, health ─────────────────────
  const entryFiles = [
    "index.ts", "server.ts", "app.ts", "src/index.ts", "src/server.ts", "src/app.ts",
    "index.js", "server.js", "app.js", "src/index.js", "src/server.js", "src/app.js",
    "main.py", "app.py", "main.go",
  ];
  let combinedCode = "";
  for (const f of entryFiles) {
    try { combinedCode += await fs.readFile(path.join(root, f), "utf8") + "\n"; } catch {}
  }

  if (combinedCode) {
    // PORT env
    if (/process\.env\.PORT|os\.getenv\(["']PORT["']\)/i.test(combinedCode)) {
      result.usesEnvPort = true;
    } else {
      const portMatch = combinedCode.match(/\.listen\s*\(\s*(\d{3,5})/);
      if (portMatch) result.internalPort = parseInt(portMatch[1], 10);
    }

    // Loopback trap
    if (
      /\.listen\s*\([^)]*["'](?:127\.0\.0\.1|localhost)["']/i.test(combinedCode) ||
      /host\s*=\s*["'](?:127\.0\.0\.1|localhost)["']/i.test(combinedCode)
    ) {
      result.hasLoopbackTrap = true;
      result.warnings.push("CRITICAL: App binds to 127.0.0.1/localhost. Must bind to 0.0.0.0 for Whizan containers.");
    }

    // Health endpoint
    if (/\.(get|route)\s*\(\s*["']\/(?:health|status|ping)?["']/i.test(combinedCode)) {
      result.hasHealthEndpoint = true;
    }

    // Environment variables
    const envSet = new Set<string>();
    let m: RegExpExecArray | null;
    const nodeEnvRe = /process\.env\.([A-Z0-9_]+)/g;
    while ((m = nodeEnvRe.exec(combinedCode)) !== null) {
      if (!["NODE_ENV", "PORT"].includes(m[1])) envSet.add(m[1]);
    }
    const pyEnvRe = /(?:os\.environ(?:\.get)?|os\.getenv)\s*\(\s*["']([A-Z0-9_]+)["']/g;
    while ((m = pyEnvRe.exec(combinedCode)) !== null) {
      if (m[1] !== "PORT") envSet.add(m[1]);
    }
    result.envVarsReferenced = Array.from(envSet);
  }

  // ─── Parse local .env files ──────────────────────────────────────────
  const localKeys = new Set<string>();
  for (const envFile of [".env", ".env.local", ".env.example", ".env.production"]) {
    try {
      const content = await fs.readFile(path.join(root, envFile), "utf8");
      content.split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .forEach((l) => localKeys.add(l.split("=")[0].trim()));
    } catch {}
  }
  result.envVarsInLocalEnv = Array.from(localKeys);
  result.envVarsMissing = result.envVarsReferenced.filter((k) => !localKeys.has(k));

  // ─── Empty directory check ───────────────────────────────────────────
  if (result.projectType === "unknown" && files.length === 0) {
    result.warnings.push("Empty directory. Nothing to deploy.");
  }

  return result;
}

/** Check next.config.js/ts for output: 'export' with dynamic routes */
async function checkNextConfig(root: string, result: StackAnalysis) {
  for (const cfg of ["next.config.js", "next.config.mjs", "next.config.ts"]) {
    try {
      const content = await fs.readFile(path.join(root, cfg), "utf8");
      if (/output\s*:\s*["']export["']/.test(content)) {
        // Check for dynamic route files
        const hasDynamic = await hasDynamicRoutes(root);
        if (hasDynamic) {
          result.warnings.push(
            "CRITICAL: next.config has output: 'export' but dynamic routes ([slug]/[id]) were found. " +
            "Remove output: 'export' — Whizan hosts Next.js SSR natively."
          );
        }
      }
    } catch {}
  }
}

async function hasDynamicRoutes(root: string): Promise<boolean> {
  const appDir = path.join(root, "app");
  const pagesDir = path.join(root, "pages");
  const srcAppDir = path.join(root, "src", "app");
  const srcPagesDir = path.join(root, "src", "pages");

  for (const dir of [appDir, pagesDir, srcAppDir, srcPagesDir]) {
    try {
      const found = await scanForDynamicFiles(dir);
      if (found) return true;
    } catch {}
  }
  return false;
}

async function scanForDynamicFiles(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith("[") && entry.isDirectory()) return true;
      if (entry.isDirectory()) {
        const found = await scanForDynamicFiles(path.join(dir, entry.name));
        if (found) return true;
      }
    }
  } catch {}
  return false;
}
