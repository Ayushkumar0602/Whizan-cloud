import fs from "fs/promises";
import path from "path";

export interface AnalysisReport {
  projectType: "backend" | "frontend" | "fullstack" | "monorepo" | "unknown";
  detectedRuntimes: string[];
  framework?: string;
  hasPackageJson: boolean;
  scripts: Record<string, string>;
  hasStartScript: boolean;
  hasBuildScript: boolean;
  portConfig: {
    usesEnvPort: boolean;
    detectedHardcodedPort?: number;
    hasLoopbackHostTrap: boolean; // binds to 127.0.0.1 or localhost
  };
  corsConfig: {
    hasCors: boolean;
    isRestricted: boolean;
  };
  hasHealthEndpoint: boolean;
  envVariables: {
    referencedInCode: string[];
    definedInLocalEnv: string[];
    missingFromLocalEnv: string[];
  };
  ignoredSecretsFound: string[];
  recommendations: string[];
}

export async function analyzeWorkspace(workspaceDir: string): Promise<AnalysisReport> {
  const root = path.resolve(workspaceDir);
  const report: AnalysisReport = {
    projectType: "unknown",
    detectedRuntimes: [],
    hasPackageJson: false,
    scripts: {},
    hasStartScript: false,
    hasBuildScript: false,
    portConfig: {
      usesEnvPort: false,
      hasLoopbackHostTrap: false,
    },
    corsConfig: {
      hasCors: false,
      isRestricted: false,
    },
    hasHealthEndpoint: false,
    envVariables: {
      referencedInCode: [],
      definedInLocalEnv: [],
      missingFromLocalEnv: [],
    },
    ignoredSecretsFound: [],
    recommendations: [],
  };

  const filesInRoot: string[] = await fs.readdir(root).catch(() => [] as string[]);

  // 1. Check package.json (Node.js)
  if (filesInRoot.includes("package.json")) {
    report.hasPackageJson = true;
    report.detectedRuntimes.push("Node.js");
    try {
      const pkgRaw = await fs.readFile(path.join(root, "package.json"), "utf8");
      const pkg = JSON.parse(pkgRaw);
      report.scripts = pkg.scripts || {};
      report.hasStartScript = Boolean(pkg.scripts?.start);
      report.hasBuildScript = Boolean(pkg.scripts?.build);

      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (allDeps["next"]) {
        report.framework = "Next.js";
        report.projectType = "fullstack";
      } else if (allDeps["express"]) {
        report.framework = "Express";
        report.projectType = "backend";
      } else if (allDeps["fastify"]) {
        report.framework = "Fastify";
        report.projectType = "backend";
      } else if (allDeps["@nestjs/core"]) {
        report.framework = "NestJS";
        report.projectType = "backend";
      } else if (allDeps["vite"] || allDeps["react-scripts"]) {
        report.framework = "React / Vite";
        report.projectType = "frontend";
      } else if (allDeps["astro"]) {
        report.framework = "Astro";
        report.projectType = "frontend";
      }

      if (allDeps["cors"]) {
        report.corsConfig.hasCors = true;
      }
    } catch {}
  }

  // 2. Check Python
  if (filesInRoot.includes("requirements.txt") || filesInRoot.includes("pyproject.toml")) {
    report.detectedRuntimes.push("Python");
    if (report.projectType === "unknown") report.projectType = "backend";
    try {
      const req = await fs.readFile(path.join(root, "requirements.txt"), "utf8").catch(() => "");
      if (req.includes("fastapi")) report.framework = "FastAPI";
      else if (req.includes("flask")) report.framework = "Flask";
      else if (req.includes("django")) report.framework = "Django";
    } catch {}
  }

  // 3. Check Go
  if (filesInRoot.includes("go.mod")) {
    report.detectedRuntimes.push("Go");
    if (report.projectType === "unknown") report.projectType = "backend";
  }

  // 4. Check for Monorepo (apps/ or packages/ or client/ and server/)
  const isMultiFolder =
    (filesInRoot.includes("client") && filesInRoot.includes("server")) ||
    (filesInRoot.includes("frontend") && filesInRoot.includes("backend")) ||
    (filesInRoot.includes("apps") && filesInRoot.includes("packages"));
  if (isMultiFolder) {
    report.projectType = "monorepo";
  }

  // 5. Scan entry files for Port, Host bindings, and Health checks
  const candidateEntryFiles = [
    "index.ts", "server.ts", "app.ts", "src/index.ts", "src/server.ts", "src/app.ts",
    "index.js", "server.js", "app.js", "src/index.js", "src/server.js", "src/app.js",
    "main.py", "app.py", "main.go"
  ];

  const codeFilesContent: string[] = [];
  for (const rel of candidateEntryFiles) {
    try {
      const content = await fs.readFile(path.join(root, rel), "utf8");
      codeFilesContent.push(content);
    } catch {}
  }

  const combinedCode = codeFilesContent.join("\n");

  if (combinedCode) {
    // Check PORT
    if (/process\.env\.PORT|os\.getenv\(["']PORT["']\)/i.test(combinedCode)) {
      report.portConfig.usesEnvPort = true;
    } else {
      const portMatch = combinedCode.match(/\.listen\s*\(\s*(\d{3,5})/);
      if (portMatch) {
        report.portConfig.detectedHardcodedPort = parseInt(portMatch[1], 10);
      }
    }

    // Check 127.0.0.1 / localhost loopback host trap
    if (
      /\.listen\s*\([^)]*["'](?:127\.0\.0\.1|localhost)["']/i.test(combinedCode) ||
      /host\s*=\s*["'](?:127\.0\.0\.1|localhost)["']/i.test(combinedCode)
    ) {
      report.portConfig.hasLoopbackHostTrap = true;
    }

    // Check health check route
    if (
      /\.(get|route)\s*\(\s*["']\/(?:health|status|ping)?["']/i.test(combinedCode)
    ) {
      report.hasHealthEndpoint = true;
    }
  }

  // 6. Scan environment variables
  const envVarMatches = new Set<string>();
  const envRegex = /process\.env\.([A-Z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = envRegex.exec(combinedCode)) !== null) {
    if (!["NODE_ENV", "PORT"].includes(match[1])) {
      envVarMatches.add(match[1]);
    }
  }
  report.envVariables.referencedInCode = Array.from(envVarMatches);

  // Check local .env
  try {
    const envContent = await fs.readFile(path.join(root, ".env"), "utf8");
    const localKeys = envContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => line.split("=")[0].trim());
    report.envVariables.definedInLocalEnv = localKeys;
    report.envVariables.missingFromLocalEnv = report.envVariables.referencedInCode.filter(
      (k) => !localKeys.includes(k)
    );
  } catch {}

  // 7. Check for ignored files like serviceAccountKey.json
  try {
    const gitignoreContent = await fs.readFile(path.join(root, ".gitignore"), "utf8");
    if (gitignoreContent.includes("serviceAccountKey.json") || gitignoreContent.includes("*.json")) {
      report.ignoredSecretsFound.push("serviceAccountKey.json");
    }
  } catch {}

  // 8. Generate actionable recommendations
  if (report.portConfig.hasLoopbackHostTrap) {
    report.recommendations.push(
      "CRITICAL: App explicitly binds to 127.0.0.1 / localhost. Must be updated to bind to '0.0.0.0' so Whizan's edge router and Docker port mapping can reach it."
    );
  }

  if (!report.portConfig.usesEnvPort) {
    report.recommendations.push(
      `App does not read process.env.PORT (detected hardcoded port: ${report.portConfig.detectedHardcodedPort || "unknown"}). Update server entry to 'process.env.PORT || 8000'.`
    );
  }

  if (!report.hasHealthEndpoint) {
    report.recommendations.push(
      "Add a lightweight GET /health endpoint returning 200 OK for Docker readiness probes."
    );
  }

  if (!report.corsConfig.hasCors && (report.projectType === "backend" || report.projectType === "fullstack")) {
    report.recommendations.push(
      "Ensure CORS middleware is installed and configured to accept requests from the frontend domain."
    );
  }

  if (report.hasPackageJson && !report.hasStartScript) {
    report.recommendations.push(
      "package.json is missing a 'start' script. Add \"start\": \"node dist/index.js\" (or \"node src/index.ts\")."
    );
  }

  return report;
}
