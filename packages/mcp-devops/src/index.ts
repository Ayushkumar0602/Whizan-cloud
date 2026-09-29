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
    description: "Audits a local directory to identify project type (backend, frontend, monorepo), runtime, listening ports, 127.0.0.1 binding traps, CORS readiness, and environment variable requirements.",
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
    description: "Registers a new backend microservice on Whizan Cloud (Node.js, Python, Go) with optional encrypted environment variables.",
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
    description: "Registers a new frontend or fullstack web project on Whizan Cloud (Next.js, Vite, React, Astro).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the web project" },
        slug: { type: "string", description: "Subdomain slug (e.g. my-frontend)" },
        framework: { type: "string", enum: ["NEXTJS", "REACT", "VITE", "ASTRO", "CUSTOM"], default: "NEXTJS" },
        rootDir: { type: "string", default: "." },
        buildCommand: { type: "string", default: "npm run build" },
        installCommand: { type: "string", default: "npm install" },
        outputDir: { type: "string", default: ".next" },
        envVars: { type: "object", description: "Key-value dictionary of environment variables" },
      },
      required: ["name", "slug"],
    },
  },
  {
    name: "whizan_deploy_direct",
    description: "Packs the local workspace directory (strictly respecting .gitignore and omitting node_modules/.git/build artifacts) into a tarball and uploads it directly to Whizan Cloud for instant building and containerization.",
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
    description: "Retrieves the latest execution logs from the Whizan build worker for a deployment to diagnose build failures.",
    inputSchema: {
      type: "object",
      properties: {
        deploymentId: { type: "string", description: "Deployment ID" },
      },
      required: ["deploymentId"],
    },
  },
  {
    name: "whizan_check_health",
    description: "Pings a deployed live URL to verify HTTP readiness, response headers, and CORS compatibility.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The full public URL to ping" },
      },
      required: ["url"],
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
        return {
          content: [{ type: "text", text: JSON.stringify(service, null, 2) }],
        };
      }

      case "whizan_create_project": {
        const project = await client.createProject((args || {}) as any);
        return {
          content: [{ type: "text", text: JSON.stringify(project, null, 2) }],
        };
      }

      case "whizan_deploy_direct": {
        const { targetType, targetId, workspaceDir } = (args || {}) as any;
        const archiveBuffer = await packDirectory(workspaceDir || ".");
        
        let deploymentResult: any;
        if (targetType === "service") {
          deploymentResult = await client.uploadServiceArchive(targetId, archiveBuffer);
        } else {
          deploymentResult = await client.uploadProjectArchive(targetId, archiveBuffer);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Archive (${Math.round(archiveBuffer.length / 1024)} KB) uploaded successfully. Build enqueued.`,
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
        const logs = await client.getBuildLogs(deploymentId);
        return {
          content: [{ type: "text", text: logs.join("\n") || "No build logs recorded yet." }],
        };
      }

      case "whizan_check_health": {
        const { url } = (args || {}) as any;
        const health = await client.checkHealth(url);
        return {
          content: [{ type: "text", text: JSON.stringify(health, null, 2) }],
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
