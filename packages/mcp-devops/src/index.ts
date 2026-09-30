#!/usr/bin/env node
import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { WhizanClient, WhizanApiError } from "./whizan-client.js";
import { packDirectory } from "./utils/archive.js";
import { analyzeWorkspace } from "./tools/analyze-workspace.js";
import { generatePatch } from "./tools/generate-patch.js";
import fs from "fs/promises";
import path from "path";

const client = new WhizanClient();

async function saveLocalWhizanConfig(workspaceDir: string, data: Record<string, any>) {
  try {
    const root = path.resolve(workspaceDir || ".");
    const configPath = path.join(root, ".whizan.json");
    let existing: Record<string, any> = {};
    try {
      const raw = await fs.readFile(configPath, "utf8");
      existing = JSON.parse(raw);
    } catch {}
    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(configPath, JSON.stringify(updated, null, 2), "utf8");
  } catch (err: any) {
    console.error("[Whizan DevOps MCP] Failed to save .whizan.json:", err.message);
  }
}

const server = new Server(
  {
    name: "whizan-devops",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ─── Tools Definition ────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: "whizan_auth_status",
    description: "Checks Whizan Cloud authentication status and returns the currently logged-in developer profile.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "whizan_login",
    description: "Configures or updates the Whizan API key for authentication.",
    inputSchema: {
      type: "object",
      properties: {
        apiKey: { type: "string", description: "The Whizan API Key starting with whz_live_..." },
        apiUrl: { type: "string", description: "Optional API URL (defaults to production or local)" },
      },
      required: ["apiKey"],
    },
  },
  {
    name: "whizan_analyze_workspace",
    description: "PHASE 1 (MANDATORY): Always run this first before any deployment. Audits local directory, runs Gemini Flash 3.5 Lite AI repository analysis on README & package manifests, auto-selects stack, build & start commands, checks AI system guardrails (refusing non-deployable desktop/mobile/CLI projects), and identifies mandatory environment variables to prompt the user.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceDir: {
          type: "string",
          description: "Absolute or relative path to the project root directory.",
        },
      },
      required: ["workspaceDir"],
    },
  },
  {
    name: "whizan_generate_patch",
    description: "Generates recommended code snippets to adapt user code for Whizan hosting (dynamic PORT binding to 0.0.0.0, CORS configuration, /health endpoint, or rewiring frontend API URLs).",
    inputSchema: {
      type: "object",
      properties: {
        issue: {
          type: "string",
          enum: ["port_binding", "cors_setup", "health_check", "package_scripts", "frontend_api_url"],
          description: "The hosting issue or requirement to generate code for.",
        },
        framework: { type: "string", description: "Framework name (e.g. Express, FastAPI, NestJS, Vite)" },
        backendUrl: { type: "string", description: "The live Whizan backend URL (for rewiring frontend)" },
        frontendOrigin: { type: "string", description: "The frontend URL allowed in CORS" },
      },
      required: ["issue"],
    },
  },
  {
    name: "whizan_create_service",
    description: "PHASE 3 (FOR BACKENDS & WORKERS): Registers a new backend microservice, API, or background queue worker on Whizan Cloud (Node.js, Python, Go, Rust, Java, PHP, Dockerfile). COMPUTE POLICY: Compute and RAM are governed strictly by the user's subscription tier. On Hobby plan, compute is strictly locked to free tier (0.1 vCPU, 512MB RAM, autoSleep=true). Only Professional plan users can choose custom tiers (standard, pro, pro_plus).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable name of the backend service" },
        slug: { type: "string", description: "Lowercase alphanumeric subdomain slug (e.g. api-auth)" },
        language: { type: "string", enum: ["NODEJS", "PYTHON", "GO", "DOCKERFILE"], default: "NODEJS" },
        rootDir: { type: "string", default: "." },
        installCommand: { type: "string", default: "npm install" },
        startCommand: { type: "string", default: "npm start" },
        internalPort: { type: "number", default: 8000, description: "Internal port service listens on (set to 0 for background queue workers)" },
        isWorker: { type: "boolean", default: false, description: "Set to true if this is a background worker, queue consumer, or daemon without an HTTP listener" },
        isPublic: { type: "boolean", default: true },
        autoSleep: { type: "boolean", default: true, description: "Whether to enable scale-to-zero (forced on Hobby plan)" },
        instanceType: { type: "string", default: "free", enum: ["free", "starter", "standard", "pro", "pro_plus"], description: "Instance tier (strictly 'free' for Hobby plan)" },
        envVars: { type: "object", description: "Key-value dictionary of environment variables to encrypt and inject" },
      },
      required: ["name", "slug"],
    },
  },
  {
    name: "whizan_create_project",
    description: "PHASE 3 (FOR FRONTENDS): Registers a new frontend or fullstack web project on Whizan Cloud (Next.js, Vite, React, Astro).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the web project" },
        slug: { type: "string", description: "Subdomain slug (e.g. my-frontend)" },
        framework: { type: "string", enum: ["NEXTJS", "REACT", "VITE", "ASTRO", "CUSTOM"], default: "NEXTJS" },
        rootDir: { type: "string", default: "." },
        buildCommand: { type: "string", default: "npm run build" },
        installCommand: { type: "string", default: "npm install" },
        outputDir: { type: "string", description: "Build output directory: 'dist' for Vite/React/Astro, or '.next' for Next.js" },
        envVars: { type: "object", description: "Key-value dictionary of environment variables" },
      },
      required: ["name", "slug"],
    },
  },
  {
    name: "whizan_deploy_direct",
    description: "PHASE 4: Packs the workspace and uploads directly to Whizan Cloud. NOTE: Uploading enqueues the build job on Azure VM. Agents MUST capture the returned deploymentId and proceed to Phase 5 (whizan_get_build_logs).",
    inputSchema: {
      type: "object",
      properties: {
        targetType: { type: "string", enum: ["service", "project"], description: "Whether deploying a backend service or frontend project" },
        targetId: { type: "string", description: "The Whizan ID of the created service or project" },
        workspaceDir: { type: "string", description: "Path to the directory to pack and upload" },
      },
      required: ["targetType", "targetId", "workspaceDir"],
    },
  },
  {
    name: "whizan_provision_database",
    description: "Provisions a managed database instance on Whizan Cloud (PostgreSQL with PgBouncer, Redis, or MySQL). COMPUTE POLICY: On Hobby plan, databases are strictly provisioned on starter tier (0.5 vCPU, 512MB RAM). Only Professional plan users can specify standard or pro tiers.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the database" },
        type: { type: "string", enum: ["POSTGRESQL", "REDIS", "MYSQL"], default: "POSTGRESQL" },
        instanceType: { type: "string", enum: ["starter", "standard", "pro"], default: "starter", description: "Instance tier (strictly 'starter' for Hobby plan)" },
        enablePooler: { type: "boolean", default: true },
      },
      required: ["name"],
    },
  },
  {
    name: "whizan_get_build_logs",
    description: "PHASE 5 (MANDATORY): Retrieves execution logs and build status from the Azure VM worker. Agents MUST poll this every 5-10s until status reaches READY/ACTIVE or FAILED. Never declare completion before build finishes.",
    inputSchema: {
      type: "object",
      properties: {
        deploymentId: { type: "string", description: "Deployment ID" },
      },
      required: ["deploymentId"],
    },
  },
  {
    name: "whizan_set_env_vars",
    description: "PHASE 2 (MANDATORY IF SECRETS REQUIRED): Sets, updates, or patches environment variables on a Whizan service or project. Agents must call this BEFORE triggering deployment to avoid container boot failures.",
    inputSchema: {
      type: "object",
      properties: {
        targetType: { type: "string", enum: ["service", "project"], description: "Whether targeting a backend service or frontend project" },
        targetId: { type: "string", description: "The Whizan ID of the service or project" },
        envVars: { type: "object", description: "Dictionary of key-value environment variables to encrypt and store" },
      },
      required: ["targetType", "targetId", "envVars"],
    },
  },
  {
    name: "whizan_check_health",
    description: "PHASE 6 (FINAL VERIFICATION): Pings the deployed live URL to verify HTTP readiness (HTTP 200), or verifies process liveness via targetId for background queue workers (internalPort: 0). Note: Use http:// (not https://) for *.nip.io domains since the Azure VM Edge Router operates on Port 80 HTTP. Agents must only declare success after health check passes.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The full public URL to ping (e.g. http://<slug>.20.2.136.11.nip.io/health). Optional if targetId is provided." },
        targetId: { type: "string", description: "Whizan service or project ID. Required if checking background queue workers without an HTTP listener." },
      },
    },
  },
  {
    name: "whizan_redeploy",
    description: "Triggers a redeployment of an existing service or project using cached source code or a newly specified Git repository.",
    inputSchema: {
      type: "object",
      properties: {
        targetType: { type: "string", enum: ["service", "project"], description: "Whether targeting a backend service or frontend project" },
        targetId: { type: "string", description: "The Whizan ID of the service or project" },
        githubRepoUrl: { type: "string", description: "Optional: update to a new GitHub repository URL before deploying" },
        branch: { type: "string", description: "Optional: Git branch to build (default: main)" },
        workspaceDir: { type: "string", description: "Optional: path to local directory to update .whizan.json deployment tracking" },
      },
      required: ["targetType", "targetId"],
    },
  },
  {
    name: "whizan_link_git_repo",
    description: "Links a GitHub repository (public or private) to an existing Whizan service or project and immediately triggers a fresh build and deployment.",
    inputSchema: {
      type: "object",
      properties: {
        targetType: { type: "string", enum: ["service", "project"], description: "Whether targeting a backend service or frontend project" },
        targetId: { type: "string", description: "The Whizan ID of the service or project" },
        githubRepoUrl: { type: "string", description: "The GitHub repository URL (e.g. https://github.com/owner/repo)" },
        branch: { type: "string", description: "The branch to deploy (default: main)" },
        deployNow: { type: "boolean", description: "Whether to immediately trigger a deployment (default: true)" },
      },
      required: ["targetType", "targetId", "githubRepoUrl"],
    },
  },
  {
    name: "whizan_delete_resource",
    description: "Deletes a service or project completely, cleanly stopping and removing all Docker containers and wiping build/source files from the Azure VM.",
    inputSchema: {
      type: "object",
      properties: {
        targetType: { type: "string", enum: ["service", "project"], description: "Whether deleting a backend service or frontend project" },
        targetId: { type: "string", description: "The Whizan ID of the service or project to delete" },
      },
      required: ["targetType", "targetId"],
    },
  },
];

// ─── Request Handlers ────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "whizan_auth_status": {
        const status = await client.getAuthStatus();
        return {
          content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
        };
      }

      case "whizan_login": {
        const { apiKey, apiUrl } = (args || {}) as any;
        await client.saveConfig({ apiKey, ...(apiUrl ? { apiUrl } : {}) });
        const status = await client.getAuthStatus();
        return {
          content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
        };
      }

      case "whizan_analyze_workspace": {
        const { workspaceDir } = (args || {}) as any;
        const targetDir = workspaceDir || ".";
        const report = await analyzeWorkspace(targetDir);

        // 1. Fetch developer profile & subscription tier
        let authProfile: any = null;
        try {
          authProfile = await client.getAuthStatus();
        } catch {}

        const subscriptionTier = authProfile?.user?.subscriptionTier || "HOBBY";
        const isProfessional = subscriptionTier === "PROFESSIONAL";

        const computePolicy = isProfessional
          ? "PROFESSIONAL TIER: Custom instance sizing and scaling enabled from hosting pages."
          : "HOBBY TIER: Strict free compute limits enforced (Backends: 0.1 vCPU, 512MB RAM, autoSleep=true; Databases: starter 0.5 vCPU, 512MB RAM). Agents MUST NOT select custom or upgraded compute specs.";

        report.recommendations.unshift(`[COMPUTE ALLOCATION POLICY]: ${computePolicy}`);

        // 2. Cross-chat context discovery: Local .whizan.json
        let localConfig: any = report.localWhizanConfig || null;
        if (!localConfig) {
          try {
            const raw = await fs.readFile(path.join(path.resolve(targetDir), ".whizan.json"), "utf8");
            localConfig = JSON.parse(raw);
            report.localWhizanConfig = localConfig;
          } catch {}
        }

        // 3. Query server records for existing projects and services
        let serverProjects: any[] = [];
        let serverServices: any[] = [];
        if (authProfile?.authenticated) {
          try {
            const [projs, servs] = await Promise.all([
              client.listProjects().catch(() => []),
              client.listServices().catch(() => []),
            ]);
            serverProjects = projs || [];
            serverServices = servs || [];
          } catch {}
        }

        // 4. Match local repository with server deployments
        let matchedTarget: any = null;
        let matchSource: "local_config" | "server_match" = "local_config";
        let targetType: "project" | "service" = "project";

        // Step A: Check localConfig targetId
        if (localConfig?.targetId && localConfig?.targetType) {
          if (localConfig.targetType === "project") {
            const p = serverProjects.find((x) => x.id === localConfig.targetId);
            if (p) {
              matchedTarget = p;
              targetType = "project";
              matchSource = "local_config";
            }
          } else if (localConfig.targetType === "service") {
            const s = serverServices.find((x) => x.id === localConfig.targetId);
            if (s) {
              matchedTarget = s;
              targetType = "service";
              matchSource = "local_config";
            }
          }
        }

        // Step B: Check server projects/services by slug, package name, or folder name
        if (!matchedTarget && (serverProjects.length > 0 || serverServices.length > 0)) {
          const folderName = path.basename(path.resolve(targetDir)).toLowerCase();
          let pkgName: string | undefined;
          try {
            const pkgRaw = await fs.readFile(path.join(path.resolve(targetDir), "package.json"), "utf8");
            const pkg = JSON.parse(pkgRaw);
            pkgName = pkg.name?.toLowerCase()?.replace(/^@[^/]+\//, "");
          } catch {}

          const matchCandidate = (item: any) => {
            const itemSlug = item.slug?.toLowerCase();
            const itemName = item.name?.toLowerCase();
            return (
              (localConfig?.slug && (itemSlug === localConfig.slug.toLowerCase() || itemName === localConfig.slug.toLowerCase())) ||
              (pkgName && (itemSlug === pkgName || itemName === pkgName)) ||
              (folderName && (itemSlug === folderName || itemName === folderName))
            );
          };

          if (report.projectType === "frontend" || report.framework === "Next.js") {
            matchedTarget = serverProjects.find(matchCandidate);
            if (matchedTarget) {
              targetType = "project";
              matchSource = "server_match";
            }
          } else if (report.projectType === "backend") {
            matchedTarget = serverServices.find(matchCandidate);
            if (matchedTarget) {
              targetType = "service";
              matchSource = "server_match";
            }
          } else {
            matchedTarget = serverProjects.find(matchCandidate);
            if (matchedTarget) {
              targetType = "project";
              matchSource = "server_match";
            } else {
              matchedTarget = serverServices.find(matchCandidate);
              if (matchedTarget) {
                targetType = "service";
                matchSource = "server_match";
              }
            }
          }
        }

        // Step C: If match found, present redeployment guidance and synchronize .whizan.json
        if (matchedTarget) {
          const baseDomain = process.env.BASE_DOMAIN || "20.2.136.11.nip.io";
          const liveUrl = matchedTarget.slug ? `http://${matchedTarget.slug}.${baseDomain}` : undefined;

          report.existingDeployment = {
            found: true,
            source: matchSource,
            targetType,
            targetId: matchedTarget.id,
            name: matchedTarget.name,
            slug: matchedTarget.slug,
            liveUrl,
            status: matchedTarget.status,
            actionRecommendation: `Found existing ${targetType} '${matchedTarget.name}' (${matchedTarget.id}) on Whizan Cloud (${matchSource === "local_config" ? "from local .whizan.json" : "matched server project record"}). DO NOT re-create the ${targetType}. Ask user confirmation to redeploy to this existing deployment, then call whizan_deploy_direct with targetType: "${targetType}" and targetId: "${matchedTarget.id}". Previous containers, packages, and build artifacts will be cleanly decommissioned with zero redundancy.`
          };

          report.recommendations.unshift(
            `[EXISTING DEPLOYMENT DETECTED]: Found matching ${targetType} '${matchedTarget.name}' (ID: ${matchedTarget.id}) on Whizan Cloud! DO NOT call whizan_create_${targetType}. Ask user permission to redeploy to ID '${matchedTarget.id}' and proceed directly with whizan_deploy_direct.`
          );

          await saveLocalWhizanConfig(targetDir, {
            targetId: matchedTarget.id,
            targetType,
            name: matchedTarget.name,
            slug: matchedTarget.slug,
            liveUrl,
          });
        }

        if (!report.guardrailPassed) {
          return {
            content: [
              {
                type: "text",
                text: `🛑 WHIZAN SYSTEM GUARDRAIL: DEPLOYMENT REFUSED\n\nReason: ${report.refusalReason}\n\nWhizan Cloud exclusively hosts web services, backend APIs, background queue workers, and frontend web applications. Desktop GUI applications, native mobile apps, and one-shot CLI tools cannot be deployed.\n\nFull Audit:\n` + JSON.stringify(report, null, 2),
              },
            ],
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
        };
      }

      case "whizan_generate_patch": {
        const patch = generatePatch((args || {}) as any);
        return {
          content: [{ type: "text", text: JSON.stringify(patch, null, 2) }],
        };
      }

      case "whizan_create_service": {
        const serviceArgs = (args || {}) as any;

        // System Guardrail pre-check
        const checkDir = serviceArgs.rootDir || ".";
        try {
          const audit = await analyzeWorkspace(checkDir);
          if (!audit.guardrailPassed) {
            return {
              content: [
                {
                  type: "text",
                  text: `🛑 WHIZAN SYSTEM GUARDRAIL: DEPLOYMENT REFUSED\n\nReason: ${audit.refusalReason}\n\nWhizan Cloud exclusively hosts web services, backend APIs, background queue workers, and frontend web applications. Desktop GUI applications, native mobile apps, and one-shot CLI tools cannot be deployed.`,
                },
              ],
            };
          }
        } catch {}
        
        // Enforce Hobby subscription tier compute limits
        let authProfile: any = null;
        try {
          authProfile = await client.getAuthStatus();
        } catch {}
        const isProfessional = authProfile?.user?.subscriptionTier === "PROFESSIONAL";
        if (!isProfessional) {
          serviceArgs.instanceType = "free";
          serviceArgs.autoSleep = true;
          delete serviceArgs.cpuLimit;
          delete serviceArgs.memoryLimit;
        }

        let service: any;
        try {
          service = await client.createService(serviceArgs);
        } catch (err: any) {
          if (err instanceof WhizanApiError && err.statusCode === 409) {
            const existingService = err.data?.existingService;
            if (existingService) {
              const baseDomain = process.env.BASE_DOMAIN || "20.2.136.11.nip.io";
              const liveUrl = `http://${existingService.slug}.${baseDomain}`;
              await saveLocalWhizanConfig(serviceArgs.rootDir || ".", {
                targetId: existingService.id,
                targetType: "service",
                name: existingService.name,
                slug: existingService.slug,
                liveUrl,
              });
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: false,
                        conflict: true,
                        message: `Service with slug '${existingService.slug}' already exists in your Whizan account (ID: ${existingService.id}).`,
                        existingService,
                        liveUrl,
                        instructions: `Do NOT call whizan_create_service again. You can redeploy directly to this existing service. Ask user permission and call whizan_deploy_direct with targetType: "service" and targetId: "${existingService.id}".`,
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            }
          }
          throw err;
        }

        const baseDomain = process.env.BASE_DOMAIN || "20.2.136.11.nip.io";
        const expectedLiveUrl = `http://${service.slug}.${baseDomain}`;
        
        await saveLocalWhizanConfig(serviceArgs.rootDir || ".", {
          targetId: service.id,
          targetType: "service",
          name: service.name,
          slug: service.slug,
          liveUrl: expectedLiveUrl,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Service '${service.name}' registered successfully.`,
                  service,
                  expectedLiveUrl,
                  protocol: "http",
                  note: `The live URL will be active at ${expectedLiveUrl} once direct deployment completes. Note: Use http:// (not https://) as Edge Router operates on Port 80.`,
                  nextStep: `Deploy your code to this service by running whizan_deploy_direct with targetType: "service" and targetId: "${service.id}".`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "whizan_create_project": {
        const projectArgs = (args || {}) as any;

        // System Guardrail pre-check
        const checkDir = projectArgs.rootDir || ".";
        try {
          const audit = await analyzeWorkspace(checkDir);
          if (!audit.guardrailPassed) {
            return {
              content: [
                {
                  type: "text",
                  text: `🛑 WHIZAN SYSTEM GUARDRAIL: DEPLOYMENT REFUSED\n\nReason: ${audit.refusalReason}\n\nWhizan Cloud exclusively hosts web services, backend APIs, background queue workers, and frontend web applications. Desktop GUI applications, native mobile apps, and one-shot CLI tools cannot be deployed.`,
                },
              ],
            };
          }
        } catch {}

        let project: any;
        try {
          project = await client.createProject(projectArgs);
        } catch (err: any) {
          if (err instanceof WhizanApiError && err.statusCode === 409) {
            const existingProject = err.data?.existingProject;
            if (existingProject) {
              const baseDomain = process.env.BASE_DOMAIN || "20.2.136.11.nip.io";
              const liveUrl = `http://${existingProject.slug}.${baseDomain}`;
              await saveLocalWhizanConfig(projectArgs.rootDir || ".", {
                targetId: existingProject.id,
                targetType: "project",
                name: existingProject.name,
                slug: existingProject.slug,
                liveUrl,
              });
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: false,
                        conflict: true,
                        message: `Project with slug '${existingProject.slug}' already exists in your Whizan account (ID: ${existingProject.id}).`,
                        existingProject,
                        liveUrl,
                        instructions: `Do NOT call whizan_create_project again. You can redeploy directly to this existing project. Ask user permission and call whizan_deploy_direct with targetType: "project" and targetId: "${existingProject.id}".`,
                      },
                      null,
                      2
                    ),
                  },
                ],
              };
            }
          }
          throw err;
        }

        const baseDomain = process.env.BASE_DOMAIN || "20.2.136.11.nip.io";
        const expectedLiveUrl = `http://${project.slug}.${baseDomain}`;

        await saveLocalWhizanConfig(projectArgs.rootDir || ".", {
          targetId: project.id,
          targetType: "project",
          name: project.name,
          slug: project.slug,
          liveUrl: expectedLiveUrl,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Project '${project.name}' registered successfully.`,
                  project,
                  expectedLiveUrl,
                  protocol: "http",
                  nextStep: `Deploy your frontend code by running whizan_deploy_direct with targetType: "project" and targetId: "${project.id}".`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "whizan_set_env_vars": {
        const { targetType, targetId, envVars } = (args || {}) as any;
        const results = await client.setEnvVars(targetType, targetId, envVars || {});
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Updated ${Object.keys(results).length} environment variables on ${targetType} ${targetId}.`,
                  results,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "whizan_deploy_direct": {
        const { targetType, targetId, workspaceDir } = (args || {}) as any;
        const targetDirectory = workspaceDir || ".";

        // System Guardrail pre-check
        try {
          const audit = await analyzeWorkspace(targetDirectory);
          if (!audit.guardrailPassed) {
            return {
              content: [
                {
                  type: "text",
                  text: `🛑 WHIZAN SYSTEM GUARDRAIL: DEPLOYMENT REFUSED\n\nReason: ${audit.refusalReason}\n\nWhizan Cloud exclusively hosts web services, backend APIs, background queue workers, and frontend web applications. Desktop GUI applications, native mobile apps, and one-shot CLI tools cannot be deployed.`,
                },
              ],
            };
          }
        } catch {}

        const archiveBuffer = await packDirectory(targetDirectory, targetType);
        
        let deploymentResult: any;
        if (targetType === "service") {
          deploymentResult = await client.uploadServiceArchive(targetId, archiveBuffer);
        } else {
          deploymentResult = await client.uploadProjectArchive(targetId, archiveBuffer);
        }

        const baseDomain = process.env.BASE_DOMAIN || "20.2.136.11.nip.io";
        const slug = deploymentResult?.service?.slug || deploymentResult?.project?.slug || targetId;
        const expectedLiveUrl = `http://${slug}.${baseDomain}`;

        // Save deployment context in local .whizan.json
        await saveLocalWhizanConfig(targetDirectory, {
          targetId,
          targetType,
          slug,
          name: deploymentResult?.service?.name || deploymentResult?.project?.name,
          lastDeploymentId: deploymentResult.id,
          liveUrl: expectedLiveUrl,
          lastDeployedAt: new Date().toISOString(),
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Archive (${Math.round(archiveBuffer.length / 1024)} KB) uploaded successfully. Build enqueued on Azure VM. Old packages and previous container resources will be automatically decommissioned upon build completion with zero redundancy.`,
                  deploymentId: deploymentResult.id,
                  status: deploymentResult.status,
                  expectedLiveUrl,
                  nextSteps: [
                    `1. Monitor live build logs by calling whizan_get_build_logs with deploymentId: "${deploymentResult.id}".`,
                    `2. Once build status reaches ACTIVE/READY, your service is live and reachable at ${expectedLiveUrl} (HTTP on Port 80).`,
                    `3. Rewire your frontend (e.g. VITE_API_URL or NEXT_PUBLIC_API_URL) to ${expectedLiveUrl} (use http://, not https://).`
                  ],
                  deployment: deploymentResult,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "whizan_provision_database": {
        const dbArgs = (args || {}) as any;
        // Enforce Hobby subscription tier limits
        let authProfile: any = null;
        try {
          authProfile = await client.getAuthStatus();
        } catch {}
        const isProfessional = authProfile?.user?.subscriptionTier === "PROFESSIONAL";
        if (!isProfessional) {
          dbArgs.instanceType = "starter";
        }
        const db = await client.provisionDatabase(dbArgs);
        return {
          content: [{ type: "text", text: JSON.stringify(db, null, 2) }],
        };
      }

      case "whizan_get_build_logs": {
        const { deploymentId } = (args || {}) as any;
        const result = await client.getBuildLogs(deploymentId);

        let guidance = "";
        if (result.status === "ACTIVE" || result.status === "READY") {
          guidance = `✓ Service is online and ready! Verified live URL: ${result.liveUrl || "(check service slug)"}. You MUST now call whizan_check_health to verify HTTP readiness.`;
        } else if (result.status === "FAILED") {
          guidance = `✗ Build failed! Analyze the logs above to identify the missing dependency, build command error, or configuration issue. Fix the issue and call whizan_redeploy.`;
        } else if (result.status === "CANCELLED") {
          guidance = `Deployment was cancelled.`;
        } else {
          guidance = `Deployment is in progress (Status: ${result.status}). The build worker on Azure VM is executing your build. Wait 5-10 seconds and call whizan_get_build_logs again. DO NOT assume deployment is finished until status is READY/ACTIVE or FAILED.`;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  deploymentId,
                  status: result.status,
                  liveUrl: result.liveUrl,
                  errorMessage: result.errorMessage,
                  logCount: result.logs.length,
                  guidance,
                  logs: result.logs.length > 0 ? result.logs : ["No log entries emitted yet. The build worker is preparing the container environment..."],
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "whizan_check_health": {
        const { url, targetId } = (args || {}) as any;
        const target = url || targetId;
        if (!target) {
          throw new Error("whizan_check_health requires either 'url' (e.g. http://<slug>.20.2.136.11.nip.io) or 'targetId'.");
        }
        const health = await client.checkHealth(target);
        return {
          content: [{ type: "text", text: JSON.stringify(health, null, 2) }],
        };
      }

      case "whizan_redeploy": {
        const { targetType, targetId, githubRepoUrl, branch, workspaceDir } = (args || {}) as any;
        const deployment = await client.redeploy(targetType, targetId, { githubRepoUrl, branch });
        const baseDomain = process.env.BASE_DOMAIN || "20.2.136.11.nip.io";
        const slug = deployment?.service?.slug || deployment?.project?.slug || targetId;
        const expectedLiveUrl = `http://${slug}.${baseDomain}`;
        if (workspaceDir) {
          await saveLocalWhizanConfig(workspaceDir, {
            targetId,
            targetType,
            slug,
            lastDeploymentId: deployment.id,
            liveUrl: expectedLiveUrl,
            lastDeployedAt: new Date().toISOString(),
          });
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Redeployment enqueued for ${targetType} '${targetId}'. Old packages, previous build outputs, and containers will be automatically decommissioned upon cutover.`,
                  deploymentId: deployment.id,
                  status: deployment.status,
                  expectedLiveUrl,
                  nextStep: `Call whizan_get_build_logs with deploymentId: "${deployment.id}" to follow live progress.`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "whizan_link_git_repo": {
        const { targetType, targetId, githubRepoUrl, branch, deployNow } = (args || {}) as any;
        const result = await client.linkGitRepo(targetType, targetId, githubRepoUrl, branch, deployNow);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Linked repository '${githubRepoUrl}' (branch: ${branch || "main"}) to ${targetType} '${targetId}'.`,
                  result,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "whizan_delete_resource": {
        const { targetType, targetId } = (args || {}) as any;
        await client.deleteResource(targetType, targetId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Successfully deleted ${targetType} '${targetId}'. Docker containers stopped and removed; build files wiped from VM.`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${error.message}` }],
      isError: true,
    };
  }
});

// ─── Start Transport ─────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[Whizan DevOps MCP] Server running on stdio.");
}

main().catch((err) => {
  console.error("[Whizan DevOps MCP] Fatal error:", err);
  process.exit(1);
});
