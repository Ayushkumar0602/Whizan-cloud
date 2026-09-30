import fs from "fs/promises";
import path from "path";

export interface LocalWhizanConfig {
  targetId?: string;
  targetType?: "project" | "service";
  name?: string;
  slug?: string;
  liveUrl?: string;
  lastDeploymentId?: string;
  lastDeployedAt?: string;
  updatedAt?: string;
}

export interface ExistingDeploymentMatch {
  found: boolean;
  source: "local_config" | "server_match";
  targetType: "project" | "service";
  targetId: string;
  name: string;
  slug: string;
  liveUrl?: string;
  status?: string;
  actionRecommendation: string;
}

import { analyzeWorkspaceWithAI, type AiAnalysisResult, type EnvVarSpec } from "./ai-analyzer.js";

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
  mandatoryDeploymentRules: string[];
  guardrailPassed: boolean;
  refusalReason?: string | null;
  aiAnalysis?: AiAnalysisResult;
  requiredEnvVarsToPrompt?: EnvVarSpec[];
  optionalEnvVars?: EnvVarSpec[];
  localWhizanConfig?: LocalWhizanConfig;
  existingDeployment?: ExistingDeploymentMatch;
  recommendedDeploymentConfig?: {
    targetType: "service" | "project";
    toolToCall: "whizan_create_service" | "whizan_create_project";
    framework?: "NEXTJS" | "REACT" | "VITE" | "ASTRO" | "CUSTOM";
    language?: "NODEJS" | "PYTHON" | "GO" | "DOCKERFILE";
    outputDir?: string;
    buildCommand?: string;
    installCommand?: string;
    internalPort?: number;
    startCommand?: string;
    isWorker?: boolean;
  };
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
    guardrailPassed: true,
    refusalReason: null,
    mandatoryDeploymentRules: [
      "PHASE 1 (AUDIT): Review detected projectType, framework, existingDeployment, and port config. NEVER deploy blind.",
      "PHASE 2 (ENVIRONMENT): Register ALL required environment variables using whizan_set_env_vars BEFORE starting build.",
      "PHASE 3 (PROVISION OR REDEPLOY):",
      "  - IF EXISTING PROJECT DETECTED: Reuse the existing targetId and skip creation. Redeploy directly using whizan_deploy_direct.",
      "  - IF NEW FRONTEND (Vite, React, Astro, Next.js): Call whizan_create_project. Set framework and correct outputDir ('dist' for Vite/React, '.next' for Next.js). NEVER call whizan_create_service for frontends.",
      "  - IF NEW BACKEND (Node.js, Python, Go): Call whizan_create_service. Compute is strictly locked to free tier for Hobby users. Ensure 0.0.0.0 host binding.",
      "PHASE 4 (UPLOAD): Upload workspace archive using whizan_deploy_direct. Save the returned deploymentId.",
      "PHASE 5 (POLL LOGS): Call whizan_get_build_logs(deploymentId) every 5-10s until status reaches READY/ACTIVE or FAILED. Never stop before build finishes.",
      "PHASE 6 (HEALTH CHECK): Ping the live URL via whizan_check_health(url). Note: Use http:// (not https://) for *.nip.io domains on Azure VM."
    ],
  };

  const filesInRoot: string[] = await fs.readdir(root).catch(() => [] as string[]);

  // 0. Check for local Whizan project linkage
  if (filesInRoot.includes(".whizan.json")) {
    try {
      const raw = await fs.readFile(path.join(root, ".whizan.json"), "utf8");
      report.localWhizanConfig = JSON.parse(raw);
    } catch {}
  }

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

  // 6. Scan environment variables (Node.js & Python)
  const envVarMatches = new Set<string>();
  const envRegex = /process\.env\.([A-Z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = envRegex.exec(combinedCode)) !== null) {
    if (!["NODE_ENV", "PORT"].includes(match[1])) {
      envVarMatches.add(match[1]);
    }
  }

  const pyEnvRegex = /(?:os\.environ(?:\.get)?|os\.getenv)\s*\(\s*["']([A-Z0-9_]+)["']/g;
  while ((match = pyEnvRegex.exec(combinedCode)) !== null) {
    if (!["PORT"].includes(match[1])) {
      envVarMatches.add(match[1]);
    }
  }
  report.envVariables.referencedInCode = Array.from(envVarMatches);

  // Check local .env files (.env, .env.local, .env.example, .env.production)
  const envFiles = [".env", ".env.local", ".env.example", ".env.production"];
  const localKeys = new Set<string>();
  for (const envFile of envFiles) {
    try {
      const envContent = await fs.readFile(path.join(root, envFile), "utf8");
      envContent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .forEach((line) => localKeys.add(line.split("=")[0].trim()));
    } catch {}
  }
  report.envVariables.definedInLocalEnv = Array.from(localKeys);
  report.envVariables.missingFromLocalEnv = report.envVariables.referencedInCode.filter(
    (k) => !localKeys.has(k)
  );

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

  // 9. Recommended Deployment Config
  if (report.projectType === "frontend") {
    const isVite = report.framework?.includes("Vite");
    const isAstro = report.framework?.includes("Astro");
    report.recommendedDeploymentConfig = {
      targetType: "project",
      toolToCall: "whizan_create_project",
      framework: isVite ? "VITE" : isAstro ? "ASTRO" : "CUSTOM",
      outputDir: isVite || isAstro ? "dist" : "dist",
      buildCommand: report.scripts.build ? "npm run build" : undefined,
      installCommand: "npm install",
    };
    report.recommendations.push(
      `FRONTEND DETECTED (${report.framework || "Web App"}): Must deploy as a frontend web project using 'whizan_create_project' with framework='${report.recommendedDeploymentConfig.framework}' and outputDir='${report.recommendedDeploymentConfig.outputDir}'. DO NOT deploy via whizan_create_service.`
    );
  } else if (report.framework === "Next.js" || report.projectType === "fullstack") {
    report.recommendedDeploymentConfig = {
      targetType: "project",
      toolToCall: "whizan_create_project",
      framework: "NEXTJS",
      outputDir: ".next",
      buildCommand: "npm run build",
      installCommand: "npm install",
    };
    report.recommendations.push(
      "NEXT.JS / FULLSTACK DETECTED: Deploy using 'whizan_create_project' with framework='NEXTJS' and outputDir='.next'."
    );
  } else if (report.projectType === "backend") {
    const language = report.detectedRuntimes.includes("Python")
      ? "PYTHON"
      : report.detectedRuntimes.includes("Go")
      ? "GO"
      : "NODEJS";
    report.recommendedDeploymentConfig = {
      targetType: "service",
      toolToCall: "whizan_create_service",
      language,
      internalPort: report.portConfig.detectedHardcodedPort || 8000,
      startCommand: report.scripts.start ? "npm start" : undefined,
      installCommand: report.hasPackageJson ? "npm install" : undefined,
    };
    report.recommendations.push(
      `BACKEND SERVICE DETECTED (${language}): Deploy using 'whizan_create_service' with language='${language}' and internalPort=${report.recommendedDeploymentConfig.internalPort}.`
    );
  }

  // 10. AI Repository Analyzer & System Guardrails (Gemini 3.5 Flash Lite)
  try {
    const aiResult = await analyzeWorkspaceWithAI(root);
    report.aiAnalysis = aiResult;
    report.guardrailPassed = aiResult.isDeployable;
    report.refusalReason = aiResult.rejectionReason;
    report.requiredEnvVarsToPrompt = aiResult.requiredEnvVars;
    report.optionalEnvVars = aiResult.optionalEnvVars;

    if (!aiResult.isDeployable) {
      report.recommendations.unshift(
        `🛑 [WHIZAN SYSTEM GUARDRAIL: DEPLOYMENT REFUSED] ${aiResult.rejectionReason}`
      );
      // Remove deployment configuration so agents refuse deployment
      report.recommendedDeploymentConfig = undefined;
      return report;
    }

    // Enhance stack & framework from AI deep analysis
    if (aiResult.framework && aiResult.framework !== "Custom") {
      report.framework = aiResult.framework;
    }

    if (aiResult.targetType === "project") {
      const isVite = aiResult.framework.includes("Vite");
      const isAstro = aiResult.framework.includes("Astro");
      const isNext = aiResult.framework.includes("Next");
      report.recommendedDeploymentConfig = {
        targetType: "project",
        toolToCall: "whizan_create_project",
        framework: isNext ? "NEXTJS" : isVite ? "VITE" : isAstro ? "ASTRO" : "CUSTOM",
        outputDir: isNext ? ".next" : "dist",
        buildCommand: aiResult.buildCommand || (report.scripts.build ? "npm run build" : undefined),
        installCommand: aiResult.installCommand || "npm install",
      };
    } else {
      report.recommendedDeploymentConfig = {
        targetType: "service",
        toolToCall: "whizan_create_service",
        language: aiResult.language,
        internalPort: aiResult.recommendedPort,
        startCommand: aiResult.startCommand || report.recommendedDeploymentConfig?.startCommand,
        installCommand: aiResult.installCommand || report.recommendedDeploymentConfig?.installCommand,
        isWorker: aiResult.isWorker,
      };
    }

    // Add prompt for required environment variables
    if (aiResult.requiredEnvVars && aiResult.requiredEnvVars.length > 0) {
      const envList = aiResult.requiredEnvVars
        .map(v => `  - ${v.name}: ${v.description}${v.example ? ` (example: ${v.example})` : ""}`)
        .join("\n");
      report.recommendations.unshift(
        `⚠️ [ACTION REQUIRED: MANDATORY ENVIRONMENT VARIABLES]\nThe AI repository analyzer identified mandatory environment variables that MUST be configured using 'whizan_set_env_vars' before starting deployment:\n${envList}`
      );
    }
  } catch (err: any) {
    console.warn(`[analyzeWorkspace] AI analysis warning: ${err.message}`);
  }

  return report;
}

