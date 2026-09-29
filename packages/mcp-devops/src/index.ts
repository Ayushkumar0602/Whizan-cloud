#!/usr/bin/env node
import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { WhizanClient } from "./whizan-client.js";
import { packDirectory } from "./utils/archive.js";
import { analyzeWorkspace } from "./tools/analyze-workspace.js";
import { generatePatch } from "./tools/generate-patch.js";

const client = new WhizanClient();

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
    description: "PHASE 1 (MANDATORY): Always run this first before any deployment. Audits local directory to identify project type (backend, frontend, monorepo), runtime/language, listening ports, 127.0.0.1 binding traps, CORS readiness, and environment variable requirements.",
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
    description: "PHASE 3 (FOR BACKENDS): Registers a new backend microservice on Whizan Cloud (Node.js, Python, Go). Language, internalPort, and startCommand must match the Phase 1 audit. Environment variables can be passed here or via whizan_set_env_vars.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable name of the backend service" },
        slug: { type: "string", description: "Lowercase alphanumeric subdomain slug (e.g. api-auth)" },
        language: { type: "string", enum: ["NODEJS", "PYTHON", "GO", "DOCKERFILE"], default: "NODEJS" },
        rootDir: { type: "string", default: "." },
        installCommand: { type: "string", default: "npm install" },
        startCommand: { type: "string", default: "npm start" },
        internalPort: { type: "number", default: 8000 },
        isPublic: { type: "boolean", default: true },
        autoSleep: { type: "boolean", default: false, description: "Whether to enable scale-to-zero" },
        instanceType: { type: "string", default: "starter", enum: ["free", "starter", "standard", "pro", "pro_plus"] },
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
    description: "Provisions a managed database instance on Whizan Cloud (PostgreSQL with PgBouncer, Redis, or MySQL) and returns internal/external connection strings.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the database" },
        type: { type: "string", enum: ["POSTGRESQL", "REDIS", "MYSQL"], default: "POSTGRESQL" },
        instanceType: { type: "string", enum: ["starter", "standard", "pro"], default: "starter" },
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
    description: "PHASE 6 (FINAL VERIFICATION): Pings the deployed live URL to verify HTTP readiness (HTTP 200). Note: Use http:// (not https://) for *.nip.io domains since the Azure VM Edge Router operates on Port 80 HTTP. Agents must only declare success after health check passes.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The full public URL to ping (e.g. http://<slug>.20.2.136.11.nip.io/health)" },
      },
      required: ["url"],
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
        const report = await analyzeWorkspace(workspaceDir || ".");
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
        const service = await client.createService((args || {}) as any);
        const baseDomain = process.env.BASE_DOMAIN || "20.2.136.11.nip.io";
        const expectedLiveUrl = `http://${service.slug}.${baseDomain}`;
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
        const project = await client.createProject((args || {}) as any);
        const baseDomain = process.env.BASE_DOMAIN || "20.2.136.11.nip.io";
        const expectedLiveUrl = `http://${project.slug}.${baseDomain}`;
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
        const archiveBuffer = await packDirectory(workspaceDir || ".", targetType);
        
        let deploymentResult: any;
        if (targetType === "service") {
          deploymentResult = await client.uploadServiceArchive(targetId, archiveBuffer);
        } else {
          deploymentResult = await client.uploadProjectArchive(targetId, archiveBuffer);
        }

        const baseDomain = process.env.BASE_DOMAIN || "20.2.136.11.nip.io";
        const slug = deploymentResult?.service?.slug || deploymentResult?.project?.slug || targetId;
        const expectedLiveUrl = `http://${slug}.${baseDomain}`;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Archive (${Math.round(archiveBuffer.length / 1024)} KB) uploaded successfully. Build enqueued on Azure VM.`,
                  deploymentId: deploymentResult.id,
                  status: deploymentResult.status,
                  expectedLiveUrl,
                  nextSteps: [
                    `1. Monitor live build logs by calling whizan_get_build_logs with deploymentId: "${deploymentResult.id}".`,
                    `2. Once build status reaches ACTIVE, your service is live and reachable at ${expectedLiveUrl} (HTTP on Port 80).`,
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
        const db = await client.provisionDatabase((args || {}) as any);
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
        const { url } = (args || {}) as any;
        const health = await client.checkHealth(url);
        return {
          content: [{ type: "text", text: JSON.stringify(health, null, 2) }],
        };
      }

      case "whizan_redeploy": {
        const { targetType, targetId, githubRepoUrl, branch } = (args || {}) as any;
        const deployment = await client.redeploy(targetType, targetId, { githubRepoUrl, branch });
        const baseDomain = process.env.BASE_DOMAIN || "20.2.136.11.nip.io";
        const expectedLiveUrl = `http://${deployment?.service?.slug || deployment?.project?.slug || targetId}.${baseDomain}`;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Redeployment enqueued for ${targetType} '${targetId}'.`,
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
