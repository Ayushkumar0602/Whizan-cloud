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
import {
  printWhizanBanner,
  printServerStatusCard,
  printInteractiveTips,
  McpLogger,
  colors,
} from "./utils/terminal-ui.js";
import { autoRegisterMcp } from "./utils/ide-installer.js";
import fs from "fs/promises";
import path from "path";
import http from "http";
import { exec } from "child_process";

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

    const resolvedTargetType = data.targetType || data.type || existing.targetType || existing.type || "service";

    const updated: Record<string, any> = {
      ...existing,
      ...data,
      targetType: resolvedTargetType,
      type: resolvedTargetType, // Always write both for 100% CLI and MCP coexistence
      updatedAt: new Date().toISOString(),
    };

    // If deployment is active or ready, clear prior failure metadata
    const st = String(data.lastDeploymentStatus || data.status || "").toUpperCase();
    if (st === "READY" || st === "ACTIVE") {
      delete updated.lastFailureReason;
      delete updated.failedAt;
      updated.lastDeploymentStatus = "ACTIVE";
    }

    await fs.writeFile(configPath, JSON.stringify(updated, null, 2) + "\n", "utf8");
  } catch (err: any) {
    console.error("[Whizan DevOps MCP] Failed to save .whizan.json:", err.message);
  }
}

const server = new Server(
  {
    name: "whizan-devops",
    version: "1.0.9",
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
    description: "PHASE 4: Packs the workspace and uploads directly to Whizan Cloud. NOTE: Uploading enqueues the build job on the cloud builder cluster. Agents MUST capture the returned deploymentId and proceed to Phase 5 (whizan_get_build_logs).",
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
    description: "PHASE 5 (MANDATORY): Retrieves execution logs and build status from the cloud build worker. Agents MUST poll this every 5-10s until status reaches READY/ACTIVE or FAILED. Never declare completion before build finishes.",
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
    description: "PHASE 6 (FINAL VERIFICATION): Pings the deployed live URL to verify HTTP readiness (HTTP 200), or verifies process liveness via targetId for background queue workers (internalPort: 0). Note: Use http:// (not https://) for *.nip.io domains since the Whizan Edge Router operates on Port 80 HTTP. Agents must only declare success after health check passes.",
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
    description: "Deletes a service or project completely, cleanly stopping and removing all Docker containers and wiping build/source files from the compute cluster.",
    inputSchema: {
      type: "object",
      properties: {
        targetType: { type: "string", enum: ["service", "project"], description: "Whether deleting a backend service or frontend project" },
        targetId: { type: "string", description: "The Whizan ID of the service or project to delete" },
      },
      required: ["targetType", "targetId"],
    },
  },
  {
    name: "whizan_exec_container_command",
    description: "Executes an informational, diagnostic, or troubleshooting command inside the running container of a Whizan project or service. GUARDRAILS ENFORCED: Destructive operations (rm, dd, mkfs, poweroff, chmod 777), package installations, and system modifications are blocked. Sensitive tokens and passwords are automatically masked.",
    inputSchema: {
      type: "object",
      properties: {
        targetType: { type: "string", enum: ["project", "service"], description: "Whether targeting a web project or backend service" },
        targetId: { type: "string", description: "The Whizan ID or slug of the project or service" },
        command: { type: "string", description: "The diagnostic command to run (e.g. 'ls -la', 'ps aux', 'df -h', 'node -v', 'pip list', 'npx prisma status', 'curl -I http://127.0.0.1:3000/health')" },
      },
      required: ["targetType", "targetId", "command"],
    },
  },
  {
    name: "whizan_inspect_deployment",
    description: "Inspects the live runtime state of a deployed project or service container on the VM host: running state, container ID, image tag, mapped ports, uptime, restart counts, memory limits, and registered edge routing.",
    inputSchema: {
      type: "object",
      properties: {
        targetType: { type: "string", enum: ["project", "service"], description: "Whether inspecting a web project or backend service" },
        targetId: { type: "string", description: "The Whizan ID or slug of the project or service" },
      },
      required: ["targetType", "targetId"],
    },
  },
  {
    name: "whizan_get_analytics",
    description: "Retrieves traffic, performance, and usage analytics for a project or service. For projects: page views, unique visitors, total bandwidth. For services: CPU/memory usage snapshot and recent history.",
    inputSchema: {
      type: "object",
      properties: {
        targetType: { type: "string", enum: ["project", "service"], description: "Whether requesting analytics for a web project or backend service" },
        targetId: { type: "string", description: "The Whizan ID or slug of the project or service" },
        days: { type: "number", default: 30, description: "Number of days of historical data to retrieve (1 to 90)" },
      },
      required: ["targetType", "targetId"],
    },
  },
  {
    name: "whizan_exec_vm_command",
    description: "Executes an administrative or operational command on the host compute node (e.g. 'pm2 status', 'pm2 restart all', 'git pull origin main', 'free -m', 'df -h', 'docker ps'). Allows developers and agents to maintain the compute infrastructure directly.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run on the compute node host (e.g. 'pm2 restart all', 'git pull origin main && npm run build')" },
        cwd: { type: "string", default: "/opt/whizan", description: "Working directory on the node host (default: /opt/whizan)" },
      },
      required: ["command"],
    },
  },
  {
    name: "whizan_create_function_service",
    description: "Creates a new serverless Edge Function service on Whizan Cloud (like Firebase Functions or AWS Lambda). SECURITY MANDATE: By default, serverless functions MUST be created with 'isPublic: false' (API Key Protected) for data security. Agents must categorize functions: if creating public webhooks (e.g., Stripe, GitHub) or open status endpoints, set 'isPublic: true'. Otherwise, keep 'isPublic: false' (API Key Protected) and use 'whizan_create_function_api_key' to generate an access key ('whz_fn_live_...'). You can also provide granular 'endpoints: [{ routePath, isPublic }]' to mix public webhooks and protected endpoints in the same service.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable name of the function service" },
        slug: { type: "string", description: "Unique subdomain slug (e.g. 'payment-api' -> 'payment-api.fn.whizan.cloud')" },
        runtime: { type: "string", enum: ["EDGE_TYPESCRIPT", "NODEJS_20", "PYTHON_311", "GOLANG_122"], default: "EDGE_TYPESCRIPT" },
        timeoutMs: { type: "number", default: 10000, description: "Execution timeout in ms (default 10,000ms)" },
        memoryLimit: { type: "number", default: 128, description: "Memory allocation in MB (default 128MB)" },
        isPublic: { type: "boolean", default: false, description: "Default security model: false = API Key Protected (Recommended), true = Public Webhook without key" },
        corsOrigins: { type: "array", items: { type: "string" }, default: ["*"], description: "Allowed CORS origins" },
        initialCode: { type: "string", description: "Optional initial TypeScript/JavaScript code for the function" },
        envVars: { type: "object", description: "Key-value dictionary of environment variables to encrypt and inject" },
        endpoints: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              routePath: { type: "string" },
              isPublic: { type: "boolean" },
              httpMethods: { type: "array", items: { type: "string" } },
            },
          },
          description: "Optional initial endpoints with custom security tags (isPublic: true for webhooks, false for secured APIs)",
        },
      },
      required: ["name", "slug"],
    },
  },
  {
    name: "whizan_deploy_function",
    description: "Deploys a new version of TypeScript or JavaScript code to an existing Whizan Edge Function service with sub-5ms cold-start compilation, automatic multi-function endpoint discovery, and self-healing disaster recovery.",
    inputSchema: {
      type: "object",
      properties: {
        functionId: { type: "string", description: "The Whizan ID of the Edge Function service" },
        code: { type: "string", description: "Raw TypeScript/JavaScript source code to bundle and deploy" },
        workspaceDir: { type: "string", description: "Optional path to local workspace directory to update .whizan.json" },
      },
      required: ["functionId", "code"],
    },
  },
  {
    name: "whizan_configure_function_endpoint",
    description: "Configures or toggles security (Public Webhook vs API Key Protected), route path, HTTP methods, memory limit, and timeout seconds for a specific endpoint in an Edge Function service. Use this to mark webhooks as public or protect sensitive endpoints with API keys.",
    inputSchema: {
      type: "object",
      properties: {
        functionId: { type: "string", description: "The Whizan ID of the Edge Function service" },
        routePath: { type: "string", description: "Route path (e.g. '/webhook/stripe', '/users/:id', '/charge')" },
        isPublic: { type: "boolean", description: "Security model: true = Public Webhook (unauthenticated), false = API Key Protected (requires whz_fn_live_...)" },
        endpointId: { type: "string", description: "Optional existing endpoint ID to update" },
        name: { type: "string", description: "Optional descriptive label for this endpoint" },
        httpMethods: { type: "array", items: { type: "string" }, description: "Allowed HTTP methods, e.g. ['GET', 'POST']" },
        memoryLimit: { type: "number", description: "Optional memory allocation in MB (e.g. 128, 256, 512)" },
        timeoutSeconds: { type: "number", description: "Optional execution timeout in seconds (1 to 60)" },
      },
      required: ["functionId", "routePath", "isPublic"],
    },
  },
  {
    name: "whizan_create_function_api_key",
    description: "Generates a new dedicated Function API Key (whz_fn_live_...) for an Edge Function with customizable scopes, rate limiting, and IP whitelisting. Use this key in 'x-api-key: whz_fn_live_...' or 'Authorization: Bearer <key>' to authorize requests to protected functions and endpoints.",
    inputSchema: {
      type: "object",
      properties: {
        functionId: { type: "string", description: "The Whizan ID of the Edge Function service" },
        name: { type: "string", default: "Production Key", description: "Descriptive label for this API key" },
        scopes: { type: "array", items: { type: "string" }, default: ["EXECUTE"], description: "Permissions (EXECUTE, READ_LOGS, ADMIN)" },
        rateLimitRpm: { type: "number", default: 600, description: "Max requests per minute" },
        ipWhitelist: { type: "array", items: { type: "string" }, description: "Optional list of allowed client IP addresses / CIDR blocks" },
      },
      required: ["functionId"],
    },
  },
  {
    name: "whizan_invoke_function",
    description: "Invokes a live Whizan Edge Function over HTTP, testing authentication, response payload, status code, and latency in milliseconds. NOTE: If the function or endpoint is API Key Protected ('isPublic: false'), you MUST provide the 'apiKey' parameter (format: 'whz_fn_live_...').",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "The subdomain slug of the Edge Function" },
        path: { type: "string", default: "/", description: "Route path (e.g. '/charge' or '/users/123')" },
        method: { type: "string", default: "POST", description: "HTTP method (GET, POST, PUT, DELETE, PATCH)" },
        body: { type: "object", description: "Optional JSON payload to send in request body" },
        apiKey: { type: "string", description: "Required for protected functions/endpoints: Function API Key (whz_fn_live_...)." },
        headers: { type: "object", description: "Optional custom HTTP headers" },
      },
      required: ["slug"],
    },
  },
  {
    name: "whizan_list_functions",
    description: "Lists all serverless Edge Function services registered on the user's Whizan Cloud account with runtime, endpoint count, and active deployment status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "whizan_create_cron_job",
    description: "Schedules an enterprise background task or recurring job with zero-idle CPU overhead and sub-second precision. Supports Edge Functions, Container Exec CLI, Internal Mesh Services, Web Projects, and Webhooks.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable name of the cron job (e.g. 'Daily Database Backup' or 'Midnight Session Cleanup')" },
        description: { type: "string", description: "Optional description of what the job does" },
        schedule: { type: "string", description: "Standard 5-part cron expression (e.g. '0 0 * * *' for daily midnight, '*/15 * * * *' for every 15 mins)" },
        timezone: { type: "string", default: "UTC", description: "IANA Timezone identifier (e.g. 'UTC', 'America/New_York', 'Asia/Kolkata')" },
        targetType: {
          type: "string",
          enum: ["FUNCTION", "CONTAINER_EXEC", "SERVICE", "PROJECT", "WEBHOOK"],
          description: "Target execution pipeline: FUNCTION (Edge V8 isolate), CONTAINER_EXEC (Direct CLI command in container), SERVICE (Private mesh API), PROJECT (Web app route), or WEBHOOK (Signed HTTPS)",
        },
        targetConfig: {
          type: "object",
          description: "Configuration for target. Examples:\n- FUNCTION: { serviceId: '...', endpointPath: '/clean', method: 'POST' }\n- CONTAINER_EXEC: { serviceId: '...', command: 'python manage.py purge_sessions' }\n- SERVICE: { serviceId: '...', routePath: '/cron', port: 3000 }\n- WEBHOOK: { url: 'https://api.example.com/tasks' }",
        },
        misfirePolicy: {
          type: "string",
          enum: ["SKIP", "FIRE_LATEST_ONCE", "CATCH_UP_ALL"],
          default: "SKIP",
          description: "Reboot recovery policy if VM was turned off: SKIP (discard missed ticks), FIRE_LATEST_ONCE (fire 1 catchup run on boot), or CATCH_UP_ALL (run all missed intervals)",
        },
        concurrencyPolicy: {
          type: "string",
          enum: ["FORBID", "ALLOW", "REPLACE", "QUEUE_SERIALIZE"],
          default: "FORBID",
          description: "Behavior when next scheduled run arrives while previous run is still executing: FORBID (skip), ALLOW (parallel), REPLACE (abort old and run new)",
        },
        timeoutSeconds: { type: "number", default: 300, description: "Maximum execution timeout in seconds (1 to 3600)" },
      },
      required: ["name", "schedule", "targetType", "targetConfig"],
    },
  },
  {
    name: "whizan_list_cron_jobs",
    description: "Lists all scheduled cron jobs on the account with schedule expression, target type, last run status, next run time, and total executions.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "whizan_trigger_cron_job",
    description: "Manually triggers an immediate execution of a scheduled cron job (1-click trigger), bypassing schedule delay. Returns the active execution ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The UUID of the cron job to execute immediately" },
      },
      required: ["id"],
    },
  },
  {
    name: "whizan_get_cron_history",
    description: "Fetches recent execution logs and history for a cron job, including duration in ms, exit code, HTTP status, and stdout/stderr output.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The UUID of the cron job" },
        limit: { type: "number", default: 10, description: "Number of recent executions to fetch (default: 10)" },
      },
      required: ["id"],
    },
  },
  {
    name: "whizan_create_workflow",
    description: "Creates an automated CI/CD build, deployment, or devops workflow DAG (Whizan Flow) with custom steps, dependency edges, and triggers.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Display name for the workflow pipeline" },
        slug: { type: "string", description: "URL-friendly slug (lowercase, dashes)" },
        description: { type: "string", description: "Optional description of what the workflow does" },
        projectId: { type: "string", description: "Optional linked Project or Service UUID" },
        concurrencyPolicy: {
          type: "string",
          enum: ["FORBID", "QUEUE", "ALLOW", "REPLACE"],
          default: "QUEUE",
          description: "Policy when multiple triggers fire simultaneously: FORBID, QUEUE, ALLOW, REPLACE",
        },
        nodes: {
          type: "array",
          description: "Array of DAG nodes (triggers, actions, controls)",
          items: {
            type: "object",
            properties: {
              nodeKey: { type: "string", description: "Unique key for node within workflow (e.g. 'build_docker')" },
              name: { type: "string", description: "Display name for step" },
              type: {
                type: "string",
                enum: [
                  "TRIGGER_GIT",
                  "TRIGGER_CRON",
                  "TRIGGER_WEBHOOK",
                  "TRIGGER_MANUAL",
                  "ACTION_WORKSPACE_ANALYZE",
                  "ACTION_BUILD_CONTAINER",
                  "ACTION_DEPLOY_EDGE",
                  "ACTION_DEPLOY_SERVICE",
                  "ACTION_CONTAINER_EXEC",
                  "ACTION_RUN_TESTS",
                  "ACTION_HEALTH_PROBE",
                  "ACTION_ROUTER_CUTOVER",
                  "ACTION_AUTO_ROLLBACK",
                  "ACTION_V8_FUNCTION",
                  "ACTION_HTTP_REQUEST",
                  "ACTION_DATABASE_QUERY",
                  "ACTION_AI_PROMPT",
                  "ACTION_NOTIFICATION",
                  "CONTROL_CONDITION",
                  "CONTROL_PARALLEL",
                  "CONTROL_JOIN",
                  "CONTROL_DELAY",
                  "CONTROL_APPROVAL",
                ],
              },
              config: { type: "object", description: "Node-specific configuration dictionary" },
              continueOnError: { type: "boolean", default: false },
            },
            required: ["nodeKey", "name", "type"],
          },
        },
        edges: {
          type: "array",
          description: "Array of dependency edges connecting source nodes to target nodes",
          items: {
            type: "object",
            properties: {
              sourceNodeKey: { type: "string" },
              targetNodeKey: { type: "string" },
              condition: { type: "string", default: "SUCCESS" },
            },
            required: ["sourceNodeKey", "targetNodeKey"],
          },
        },
      },
      required: ["name", "nodes"],
    },
  },
  {
    name: "whizan_trigger_workflow",
    description: "Triggers an execution run for a Whizan Flow workflow DAG (1-click trigger) with optional runtime metadata.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The UUID of the workflow to run" },
        metadata: { type: "object", description: "Optional metadata to inject into trigger context (e.g. branch, commit)" },
      },
      required: ["id"],
    },
  },
  {
    name: "whizan_get_workflow_run",
    description: "Inspects live execution status, duration, output data, terminal logs, and step outcomes for a Whizan Flow run.",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "The UUID of the workflow" },
        runId: { type: "string", description: "The UUID of the execution run" },
      },
      required: ["workflowId", "runId"],
    },
  },
  {
    name: "whizan_approve_workflow_step",
    description: "Approves or rejects a suspended human-in-the-loop approval gate token to resume workflow execution.",
    inputSchema: {
      type: "object",
      properties: {
        approvalToken: { type: "string", description: "The secret approval token generated by CONTROL_APPROVAL step" },
        approved: { type: "boolean", description: "true to approve and resume downstream steps; false to reject and fail run" },
        comments: { type: "string", description: "Optional reviewer comment or reason" },
      },
      required: ["approvalToken", "approved"],
    },
  },
];

// ─── Request Handlers ────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  McpLogger.info(`Delivered ${TOOLS.length} tool definitions to MCP client.`);
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = performance.now();
  McpLogger.toolCall(name, (args || {}) as any);

  try {
    const result = await handleToolExecution(name, args);
    const duration = performance.now() - startTime;
    McpLogger.toolSuccess(name, duration);
    return result;
  } catch (error: any) {
    const duration = performance.now() - startTime;
    McpLogger.toolError(name, duration, error.message);
    return {
      content: [{ type: "text", text: `Error executing ${name}: ${error.message}` }],
      isError: true,
    };
  }
});

async function handleToolExecution(name: string, args: any) {
  // Guard tools requiring active compute infrastructure when cloud compute node is powered down
  const VM_REQUIRING_TOOLS = new Set([
    "whizan_deploy_direct",
    "whizan_redeploy",
    "whizan_check_health",
    "whizan_exec_container_command",
    "whizan_exec_vm_command",
    "whizan_deploy_function",
    "whizan_invoke_function",
    "whizan_trigger_cron_job",
    "whizan_trigger_workflow",
    "whizan_provision_database",
  ]);

  if (VM_REQUIRING_TOOLS.has(name)) {
    const sysStatus = await client.getSystemStatus().catch(() => null);
    if (sysStatus && !sysStatus.vmOnline) {
      const email = sysStatus.contactEmail || "ayushkumarjais0602@gmail.com";
      const url = sysStatus.contactUrl || "https://whizan-cloud-service-dashboard.vercel.app/contact";
      return {
        content: [
          {
            type: "text",
            text: `⚠️ REQUEST CANNOT BE FULFILLED TEMPORARILY FROM OUR SIDE RIGHT NOW

The tool "${name}" cannot be fulfilled at this moment because cloud compute infrastructure (dedicated worker nodes and container runtimes) is currently offline for scheduled maintenance.

The administration has temporarily stopped new deployments and serving existing applications until further notice.

IMPORTANT INSTRUCTION FOR AI AGENT:
Please gently inform the user of this situation:
1. Explain that Whizan Cloud compute nodes are temporarily powered down under administrative notice.
2. Active deployments, builds, live health checks, and container executions cannot proceed until the administration reactivates the compute cluster.
3. Provide the user with direct contact options for inquiries, updates, or to request reactivation:
   - 📧 Contact Email: ${email}
   - 🌐 Contact Page: ${url}
4. DO NOT attempt to redeploy or loop call this tool while the compute cluster is offline.`,
          },
        ],
      };
    }
  }

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
        let serverFunctions: any[] = [];
        if (authProfile?.authenticated) {
          try {
            const [projs, servs, fns] = await Promise.all([
              client.listProjects().catch(() => []),
              client.listServices().catch(() => []),
              client.listFunctions().catch(() => []),
            ]);
            serverProjects = projs || [];
            serverServices = servs || [];
            serverFunctions = fns || [];
          } catch {}
        }

        // 4. Match local repository with server deployments
        let matchedTarget: any = null;
        let matchSource: "local_config" | "server_match" = "local_config";
        let targetType: "project" | "service" | "function" = "project";

        // Step A: Check localConfig targetId
        const localTargetType = localConfig?.targetType || localConfig?.type;
        if (localConfig?.targetId && localTargetType) {
          if (localTargetType === "project") {
            const p = serverProjects.find((x) => x.id === localConfig.targetId);
            if (p) {
              matchedTarget = p;
              targetType = "project";
              matchSource = "local_config";
            }
          } else if (localTargetType === "service") {
            const s = serverServices.find((x) => x.id === localConfig.targetId);
            if (s) {
              matchedTarget = s;
              targetType = "service";
              matchSource = "local_config";
            }
          } else if (localTargetType === "function") {
            const f = serverFunctions.find((x) => x.id === localConfig.targetId);
            if (f) {
              matchedTarget = f;
              targetType = "function";
              matchSource = "local_config";
            }
          }

          // Fallback: If targetId is saved in localConfig but not found in server query array
          if (!matchedTarget) {
            matchedTarget = {
              id: localConfig.targetId,
              name: localConfig.name || localConfig.slug || "linked-deployment",
              slug: localConfig.slug || localConfig.targetId,
              status: localConfig.lastDeploymentStatus || "UNKNOWN",
            };
            targetType = localTargetType;
            matchSource = "local_config";
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

          // Override recommended tool to redeploy instead of creating
          report.recommendedDeploymentConfig = {
            targetType: targetType as any,
            toolToCall: "whizan_create_service" as any, // fallback type
            internalPort: report.portConfig.detectedHardcodedPort || 8000,
          };

          await saveLocalWhizanConfig(targetDir, {
            targetId: matchedTarget.id,
            targetType,
            name: matchedTarget.name,
            slug: matchedTarget.slug,
            liveUrl,
          });
        }

        // Step D: Failure Diagnostic Handshake (Self-Healing Detection from CLI)
        if (
          localConfig?.targetId &&
          (localConfig?.lastDeploymentStatus === "FAILED" ||
            localConfig?.lastDeploymentStatus === "UNHEALTHY" ||
            localConfig?.lastDeploymentStatus === "ERROR" ||
            localConfig?.lastFailureReason)
        ) {
          let failureLogs: any = null;
          if (localConfig.lastDeploymentId) {
            try {
              failureLogs = await client.getBuildLogs(localConfig.lastDeploymentId);
            } catch {}
          }

          const rawError =
            localConfig.lastFailureReason ||
            failureLogs?.errorMessage ||
            "Build or container startup failed on cloud cluster";

          const recentLogsList: string[] = (failureLogs?.logs || [])
            .map((l: any) => (typeof l === "string" ? l : l.message || JSON.stringify(l)))
            .slice(-15);

          report.lastBuildFailure = {
            deploymentId: localConfig.lastDeploymentId || "unknown",
            targetId: localConfig.targetId,
            targetType: (localTargetType || targetType) as any,
            status: localConfig.lastDeploymentStatus || "FAILED",
            errorMessage: rawError,
            recentLogs: recentLogsList,
            failedAt: localConfig.failedAt,
          };

          const logSnippet = recentLogsList.length > 0 ? recentLogsList.map((l) => `  ${l}`).join("\n") : "  (Check local application logs or environment)";

          report.recommendations.unshift(
            `🚨 [URGENT: PREVIOUS CLI DEPLOYMENT FAILED — SELF-HEALING DIAGNOSIS]:\nDeployment ID: ${localConfig.lastDeploymentId || "unknown"}\nTarget ID:     ${localConfig.targetId} (${localTargetType || targetType})\nStatus:        ${localConfig.lastDeploymentStatus || "FAILED"}\nFailure Error: ${rawError}\n\nRecent Build Logs from Cloud Build Worker:\n${logSnippet}\n\n🛑 MANDATORY AI AGENT INSTRUCTIONS FOR REDEPLOYMENT:\n1. The cloud target '${localConfig.targetId}' ALREADY EXISTS. DO NOT call 'whizan_create_service' or 'whizan_create_project'!\n2. Analyze the build failure reason and logs above, and edit the local project files to fix the error.\n3. Ensure the app binds to '0.0.0.0' and uses 'process.env.PORT || 8000'.\n4. Call 'whizan_deploy_direct' with targetId: "${localConfig.targetId}" and targetType: "${localTargetType || targetType}" to redeploy the fixed code.\n5. Call 'whizan_check_health' to verify live status once build reaches READY/ACTIVE.`
          );
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

        const sysStatus = await client.getSystemStatus().catch(() => null);
        if (sysStatus && !sysStatus.vmOnline) {
          (report as any).vmOnline = false;
          (report as any).maintenanceNotice = `⚠️ NOTICE: Cloud compute infrastructure is currently powered down by administration. New deployments cannot proceed until reactivated. Contact: ${sysStatus.contactEmail}`;
          report.recommendations.unshift(
            `⚠️ Cloud compute infrastructure is temporarily paused by administration. New deployments cannot proceed until reactivation. For inquiries or reactivation, please contact: ${sysStatus.contactEmail}`
          );
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
        const checkDir = serviceArgs.rootDir || ".";

        // Anti-Duplicate Guardrail: Check local .whizan.json before creating service
        const workspaceRoot = path.resolve(checkDir);
        try {
          const cfgRaw = await fs.readFile(path.join(workspaceRoot, ".whizan.json"), "utf8");
          const existingCfg = JSON.parse(cfgRaw);
          if (existingCfg?.targetId && !serviceArgs.forceNew) {
            const exType = existingCfg.targetType || existingCfg.type || "service";
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: false,
                      blocked: true,
                      code: "DUPLICATE_PREVENTION",
                      message: `[GUARDRAIL TRIGGERED] This workspace is already linked to existing ${exType} '${existingCfg.name || existingCfg.slug}' (${existingCfg.targetId}).`,
                      existingDeployment: {
                        targetId: existingCfg.targetId,
                        targetType: exType,
                        slug: existingCfg.slug,
                        name: existingCfg.name,
                      },
                      instructions: `DO NOT create a duplicate ${exType}. Call 'whizan_deploy_direct' with targetId: "${existingCfg.targetId}" and targetType: "${exType}" to redeploy your code changes. If you intentionally want a separate duplicate service, set 'forceNew: true'.`,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
        } catch {}

        // System Guardrail pre-check
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
        
        // Enforce Portfolio Forced-Idleness: Only Platform Admins can choose non-free tiers or always-on
        let authProfile: any = null;
        try {
          authProfile = await client.getAuthStatus();
        } catch {}
        const isUserAdmin =
          authProfile?.user?.role === "ADMIN" ||
          authProfile?.user?.role === "ROOT_ADMIN" ||
          authProfile?.user?.isAdmin === true ||
          authProfile?.user?.email === "aj0892829122@gmail.com";

        const canCustomizeTier =
          isUserAdmin || authProfile?.user?.subscriptionTier === "PROFESSIONAL";

        if (!canCustomizeTier) {
          serviceArgs.instanceType = "free";
          serviceArgs.autoSleep = true;
          serviceArgs.cpuLimit = 0.1;
          serviceArgs.memoryLimit = 512;
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
        const checkDir = projectArgs.rootDir || ".";

        // Anti-Duplicate Guardrail: Check local .whizan.json before creating project
        const workspaceRoot = path.resolve(checkDir);
        try {
          const cfgRaw = await fs.readFile(path.join(workspaceRoot, ".whizan.json"), "utf8");
          const existingCfg = JSON.parse(cfgRaw);
          if (existingCfg?.targetId && !projectArgs.forceNew) {
            const exType = existingCfg.targetType || existingCfg.type || "project";
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: false,
                      blocked: true,
                      code: "DUPLICATE_PREVENTION",
                      message: `[GUARDRAIL TRIGGERED] This workspace is already linked to existing ${exType} '${existingCfg.name || existingCfg.slug}' (${existingCfg.targetId}).`,
                      existingDeployment: {
                        targetId: existingCfg.targetId,
                        targetType: exType,
                        slug: existingCfg.slug,
                        name: existingCfg.name,
                      },
                      instructions: `DO NOT create a duplicate ${exType}. Call 'whizan_deploy_direct' with targetId: "${existingCfg.targetId}" and targetType: "${exType}" to redeploy your code changes. If you intentionally want a separate duplicate project, set 'forceNew: true'.`,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
        } catch {}

        // System Guardrail pre-check
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
                  message: `Archive (${Math.round(archiveBuffer.length / 1024)} KB) uploaded successfully. Build enqueued on cloud worker. Old packages and previous container resources will be automatically decommissioned upon build completion with zero redundancy.`,
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
        // Enforce Portfolio Forced-Idleness: Only Platform Admins can choose non-starter database tiers
        let authProfile: any = null;
        try {
          authProfile = await client.getAuthStatus();
        } catch {}
        const isUserAdmin =
          authProfile?.user?.role === "ADMIN" ||
          authProfile?.user?.role === "ROOT_ADMIN" ||
          authProfile?.user?.isAdmin === true ||
          authProfile?.user?.email === "aj0892829122@gmail.com";

        const canCustomizeTier =
          isUserAdmin || authProfile?.user?.subscriptionTier === "PROFESSIONAL";

        if (!canCustomizeTier) {
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
          guidance = `Deployment is in progress (Status: ${result.status}). The cloud build worker is executing your build. Wait 5-10 seconds and call whizan_get_build_logs again. DO NOT assume deployment is finished until status is READY/ACTIVE or FAILED.`;
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

      case "whizan_exec_container_command": {
        const { targetType, targetId, command } = (args || {}) as any;
        const result = await client.execContainerCommand({ targetType, targetId, command });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "whizan_inspect_deployment": {
        const { targetType, targetId } = (args || {}) as any;
        const result = await client.inspectDeployment({ targetType, targetId });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "whizan_get_analytics": {
        const { targetType, targetId, days } = (args || {}) as any;
        const result = await client.getAnalytics({ targetType, targetId, days });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // ─── Edge Functions Tool Handlers ──────────────────────────────────────────

      case "whizan_create_function_service": {
        const payload = (args || {}) as any;
        const result = await client.createFunctionService(payload);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: `Edge Function Service '${result.service?.name}' created successfully!`,
                  serviceId: result.service?.id,
                  slug: result.service?.slug,
                  apiKey: result.apiKey?.key,
                  keyPrefix: result.apiKey?.keyPrefix,
                  invocationUrl: result.invocationUrl,
                  isPublic: result.service?.isPublic,
                  timeoutMs: result.service?.timeoutMs,
                  memoryLimit: result.service?.memoryLimit,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "whizan_deploy_function": {
        const { functionId, code, workspaceDir } = (args || {}) as any;
        const result = await client.deployFunction(functionId, code);

        if (workspaceDir) {
          await saveLocalWhizanConfig(workspaceDir, {
            targetType: "function",
            targetId: functionId,
            lastDeploymentVersion: result.version,
            lastDeployedAt: result.createdAt,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: `Edge Function version v${result.version} successfully compiled and deployed!`,
                  version: result.version,
                  bundleHash: result.bundleHash,
                  bundleSizeBytes: result.bundleSizeBytes,
                  status: result.status,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "whizan_configure_function_endpoint": {
        const payload = (args || {}) as any;
        const result = await client.configureFunctionEndpoint(payload.functionId, payload);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: `Endpoint '${result.routePath || payload.routePath}' configured successfully!`,
                  id: result.id,
                  name: result.name,
                  routePath: result.routePath,
                  isPublic: result.isPublic,
                  securityModel: result.isPublic ? "PUBLIC_WEBHOOK (Unauthenticated)" : "API_KEY_PROTECTED (Requires whz_fn_live_...)",
                  httpMethods: result.httpMethods,
                  memoryLimit: result.memoryLimit,
                  timeoutSeconds: result.timeoutSeconds,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "whizan_create_function_api_key": {
        const { functionId, name: keyName, scopes, rateLimitRpm, ipWhitelist } = (args || {}) as any;
        const result = await client.createFunctionApiKey(functionId, {
          name: keyName,
          scopes,
          rateLimitRpm,
          ipWhitelist,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: `New Function API Key generated for service '${functionId}'!`,
                  id: result.id,
                  name: result.name,
                  apiKey: result.key, // Plaintext key
                  keyPrefix: result.keyPrefix,
                  rateLimitRpm: result.rateLimitRpm,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "whizan_invoke_function": {
        const { slug, path: fnPath, method, body, apiKey, headers } = (args || {}) as any;
        const result = await client.invokeFunction(slug, {
          path: fnPath,
          method,
          body,
          apiKey,
          headers,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "whizan_list_functions": {
        const functions = await client.listFunctions();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(functions, null, 2),
            },
          ],
        };
      }

      case "whizan_create_cron_job": {
        const {
          name: jobName,
          description: desc,
          schedule,
          timezone,
          targetType,
          targetConfig,
          misfirePolicy,
          concurrencyPolicy,
          timeoutSeconds,
        } = (args || {}) as any;

        const target = {
          targetType,
          ...targetConfig,
        };

        const cronJob = await client.createCronJob({
          name: jobName,
          description: desc,
          schedule,
          timezone,
          target,
          misfirePolicy,
          concurrencyPolicy,
          timeoutSeconds,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: `Cron job '${cronJob.name}' created successfully with Zero-Idle Macro-Scheduler!`,
                  id: cronJob.id,
                  schedule: cronJob.schedule,
                  timezone: cronJob.timezone,
                  targetType: cronJob.targetType,
                  misfirePolicy: cronJob.misfirePolicy,
                  concurrencyPolicy: cronJob.concurrencyPolicy,
                  nextRunAt: cronJob.nextRunAt,
                  enabled: cronJob.enabled,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "whizan_list_cron_jobs": {
        const jobs = await client.listCronJobs();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(jobs, null, 2),
            },
          ],
        };
      }

      case "whizan_trigger_cron_job": {
        const { id: jobId } = (args || {}) as any;
        const res = await client.triggerCronJob(jobId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(res, null, 2),
            },
          ],
        };
      }

      case "whizan_get_cron_history": {
        const { id: jobId, limit } = (args || {}) as any;
        const history = await client.getCronHistory(jobId, limit || 10);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(history, null, 2),
            },
          ],
        };
      }

      case "whizan_create_workflow": {
        const workflow = await client.createWorkflow(args as any);
        return {
          content: [
            {
              type: "text",
              text: `Workflow "${workflow.name}" (ID: ${workflow.id}, Slug: ${workflow.slug}) created successfully!\n\nNodes: ${workflow.nodes?.length || 0}\nEdges: ${workflow.edges?.length || 0}`,
            },
          ],
        };
      }

      case "whizan_trigger_workflow": {
        const { id, metadata } = (args || {}) as any;
        const res = await client.triggerWorkflow(id, metadata);
        return {
          content: [
            {
              type: "text",
              text: `Workflow execution dispatched!\nRun ID: ${res.runId}\nMessage: ${res.message}`,
            },
          ],
        };
      }

      case "whizan_get_workflow_run": {
        const { workflowId, runId } = (args || {}) as any;
        const run = await client.getWorkflowRun(workflowId, runId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(run, null, 2),
            },
          ],
        };
      }

      case "whizan_approve_workflow_step": {
        const { approvalToken, approved, comments } = (args || {}) as any;
        const res = await client.respondWorkflowApproval(approvalToken, approved, comments);
        return {
          content: [
            {
              type: "text",
              text: `Approval response registered: ${res.message || "Success"} (Approved: ${approved})`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
}

// ─── CLI Command Handlers ───────────────────────────────────────────────────

function printCliHelp() {
  printWhizanBanner("1.0.3", "Autonomous Cloud DevOps & In-IDE Deployment Engine");
  const c = colors;
  console.log(`
  ${c.bold}${c.brightWhite}COMMANDS & USAGE:${c.reset}
    ${c.cyan}npx @whizan/mcp-devops install${c.reset}          ${c.brightGreen}★ 1-Click Auto-Setup: Detects & registers into Antigravity, Cursor, Windsurf, Claude, VS Code${c.reset}
    ${c.cyan}npx @whizan/mcp-devops install --cursor${c.reset} Register specifically into Cursor AI (~/.cursor/mcp.json)
    ${c.cyan}npx @whizan/mcp-devops install --all${c.reset}    Force-register across all supported IDE configuration paths
    ${c.cyan}npx @whizan/mcp-devops login${c.reset}            1-click in-browser authentication (saves to ~/.whizan/config.json)
    ${c.cyan}npx @whizan/mcp-devops login -t <key>${c.reset}   Direct login with an explicit API key (whz_live_...)
    ${c.cyan}npx @whizan/mcp-devops whoami${c.reset}           Inspect authenticated user profile and subscription tier
    ${c.cyan}npx @whizan/mcp-devops logout${c.reset}           Clear local machine credentials
    ${c.cyan}npx @whizan/mcp-devops${c.reset}                  Start MCP server over stdio (called automatically by IDEs)

  ${c.bold}${c.brightWhite}FOR IDES WITH A FORM UI (e.g. VS Code "Add MCP server"):${c.reset}
    ${c.dim}• Server Name:     ${c.reset}${c.bold}whizan${c.reset}
    ${c.dim}• Transport:       ${c.reset}${c.bold}Local command (stdio)${c.reset}
    ${c.dim}• Command:         ${c.reset}${c.cyan}npx${c.reset}
    ${c.dim}• Arguments:       ${c.reset}${c.whizanCyan}-y @whizan/mcp-devops${c.reset}

  ${c.bold}${c.brightWhite}ENVIRONMENT VARIABLES:${c.reset}
    ${c.whizanCyan}WHIZAN_API_KEY${c.reset}     Explicit API Key override (bypasses ~/.whizan/config.json)
    ${c.whizanCyan}WHIZAN_API_URL${c.reset}     Target API endpoint (defaults to https://whizan-cloud-service.onrender.com)
`);
}

async function handleCliInstall(args: string[]) {
  printWhizanBanner("1.0.3");
  const c = colors;

  console.log(`  ${c.whizanCyan}🔍 Scanning computer for installed AI IDEs and editors...${c.reset}\n`);

  let specificId: string | undefined;
  for (const candidate of ["claude-code", "cursor", "windsurf", "claude", "vscode", "antigravity"]) {
    if (args.includes(`--${candidate}`)) {
      specificId = candidate;
      break;
    }
  }

  const forceAll = args.includes("--all");
  const workspaceDir = args.includes("--workspace") || args.includes("--local") ? "." : undefined;

  let token: string | undefined;
  const tokenIdx = args.findIndex((a) => a === "--token" || a === "--api-key" || a === "-t");
  if (tokenIdx !== -1 && args[tokenIdx + 1]) {
    token = args[tokenIdx + 1].trim();
  }

  try {
    const results = await autoRegisterMcp({
      specificId,
      forceAll,
      apiKey: token,
      workspaceDir,
    });

    if (results.length === 0) {
      console.log(`  ${c.amber}No supported AI IDE configurations were detected on this machine.${c.reset}`);
      console.log(`  ${c.dim}Run with ${c.reset}${c.cyan}'npx @whizan/mcp-devops install --all'${c.reset}${c.dim} to create configurations for all IDEs.${c.reset}\n`);
      return;
    }

    let successCount = 0;
    for (const res of results) {
      const icon = res.success ? `${c.emerald}✔${c.reset}` : `${c.brightRed}✖${c.reset}`;
      const actionText = res.action === "updated" ? `${c.whizanCyan}[UPDATED]${c.reset}` : `${c.emerald}[CREATED]${c.reset}`;
      console.log(`  ${icon} ${c.bold}${res.target.name.padEnd(26)}${c.reset} ${actionText} ${c.dim}${res.target.configPath}${c.reset}`);
      if (res.success) successCount++;
      if (res.error) console.log(`     ${c.red}↳ Error: ${res.error}${c.reset}`);
    }

    console.log(`\n  ${c.emerald}🎉 Successfully configured ${successCount} AI editor(s) with Whizan DevOps MCP!${c.reset}`);
    console.log(`  ${c.dim}👉 Simply restart your editor, and your AI assistant will have full cloud deployment tools.${c.reset}\n`);

    console.log(`  ${c.bold}${c.brightWhite}📋 For IDEs with a visual Form UI (like VS Code "Add MCP server" dialog):${c.reset}`);
    console.log(`     ${c.dim}• Server Name:     ${c.reset}${c.bold}whizan${c.reset}`);
    console.log(`     ${c.dim}• Transport:       ${c.reset}${c.bold}Local command (stdio)${c.reset}`);
    console.log(`     ${c.dim}• Command:         ${c.reset}${c.cyan}npx${c.reset}`);
    console.log(`     ${c.dim}• Arguments:       ${c.reset}${c.whizanCyan}-y @whizan/mcp-devops${c.reset}\n`);
  } catch (err: any) {
    console.error(`  ${c.brightRed}✖ Installation error: ${err.message}${c.reset}\n`);
  }
}

async function handleCliLogin(args: string[]) {
  printWhizanBanner("1.0.3");
  const c = colors;

  let token: string | undefined;
  const tokenIdx = args.findIndex((a) => a === "--token" || a === "--api-key" || a === "-t");
  if (tokenIdx !== -1 && args[tokenIdx + 1]) {
    token = args[tokenIdx + 1].trim();
  } else if (args[1] && !args[1].startsWith("-")) {
    token = args[1].trim();
  }

  const urlIdx = args.findIndex((a) => a === "--url");
  const customUrl = urlIdx !== -1 ? args[urlIdx + 1]?.trim() : undefined;

  if (token) {
    console.log(`  ${c.dim}[1/2]${c.reset} 🔐 Verifying provided API key...`);
    await client.saveConfig({ apiKey: token, ...(customUrl ? { apiUrl: customUrl } : {}) });
    const status = await client.getAuthStatus();
    if (status.authenticated) {
      console.log(`\n  ${c.emerald}✔ Authenticated successfully with Whizan Cloud!${c.reset}`);
      console.log(`  ${c.dim}User:${c.reset}        ${c.bold}${status.user?.email || "Developer"}${c.reset}`);
      console.log(`  ${c.dim}Role / Tier:${c.reset} ${c.amber}${status.user?.role || "USER"}${c.reset} • ${c.whizanPurple}${status.user?.subscriptionTier || "HOBBY"}${c.reset}`);
      console.log(`  ${c.dim}Store:${c.reset}       ${WhizanClient.getConfigPath()}`);
      console.log(`\n  ${c.brightCyan}🚀 All your IDEs (Antigravity, Cursor, Windsurf, VS Code, Claude) are now connected!${c.reset}\n`);
      process.exit(0);
    } else {
      console.error(`\n  ${c.brightRed}✖ Authentication failed: ${status.message || "Invalid API key"}${c.reset}\n`);
      process.exit(1);
    }
  }

  // No token: In-browser 1-click authentication
  console.log(`  ${c.whizanCyan}🚀 Launching Whizan Cloud In-Browser Authentication...${c.reset}`);

  const localServer = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      if (parsedUrl.pathname === "/callback") {
        const receivedToken = parsedUrl.searchParams.get("token") || parsedUrl.searchParams.get("key");
        const email = parsedUrl.searchParams.get("email");

        if (receivedToken) {
          await client.saveConfig({ apiKey: receivedToken, ...(customUrl ? { apiUrl: customUrl } : {}) });
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
                <p>Whizan DevOps MCP has been authorized on this computer${email ? ` for <strong>${email}</strong>` : ""}.</p>
                <div class="badge">Ready in Antigravity, Cursor, Windsurf, VS Code</div>
                <p style="margin-top: 1.5rem; font-size: 0.8rem; color: #64748b;">You can close this tab and return to your IDE.</p>
              </div>
            </body>
            </html>
          `);

          console.log(`\n  ${c.emerald}✔ Machine successfully authenticated with Whizan Cloud!${c.reset}`);
          if (email) console.log(`  ${c.dim}User:${c.reset}  ${c.bold}${email}${c.reset}`);
          console.log(`  ${c.dim}Store:${c.reset} ${WhizanClient.getConfigPath()}`);
          console.log(`  ${c.brightCyan}🚀 All your IDEs (Antigravity, Cursor, Windsurf, Claude) are now connected!${c.reset}\n`);

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
      res.end("Error processing authorization: " + err.message);
    }
  });

  localServer.listen(0, "127.0.0.1", () => {
    const address = localServer.address() as any;
    const port = address.port;
    const dashboardBase = customUrl || "https://whizan-cloud-service-dashboard.vercel.app";
    const authUrl = `${dashboardBase}/mcp/connect?port=${port}`;

    console.log(`\n  ${c.dim}Opening browser to authorize your machine...${c.reset}`);
    console.log(`  ${c.dim}If it doesn't open automatically, visit:${c.reset}`);
    console.log(`  ${c.whizanCyan}${authUrl}${c.reset}\n`);

    const openCmd =
      process.platform === "win32"
        ? `start "" "${authUrl}"`
        : process.platform === "darwin"
        ? `open "${authUrl}"`
        : `xdg-open "${authUrl}"`;

    exec(openCmd, () => {});
  });

  setTimeout(() => {
    console.log(`\n  ${c.amber}⌛ Authentication timed out (no response received). You can retry or run:${c.reset}`);
    console.log(`     ${c.cyan}npx @whizan/mcp-devops login --token YOUR_API_KEY${c.reset}\n`);
    localServer.close();
    process.exit(1);
  }, 180000);
}

async function handleCliWhoami() {
  printWhizanBanner("1.0.3");
  const c = colors;
  await client.loadConfig();
  const status = await client.getAuthStatus();

  if (status.authenticated) {
    printServerStatusCard({
      status: "ONLINE",
      authenticated: true,
      userEmail: status.user?.email,
      role: status.user?.role,
      tier: status.user?.subscriptionTier,
      apiUrl: client.getApiUrl(),
      toolCount: TOOLS.length,
      configPath: WhizanClient.getConfigPath(),
    });
  } else {
    printServerStatusCard({
      status: "CONNECTING",
      authenticated: false,
      apiUrl: client.getApiUrl(),
      toolCount: TOOLS.length,
      configPath: WhizanClient.getConfigPath(),
    });
    console.log(`  ${c.amber}👉 Run 'npx @whizan/mcp-devops login' to authenticate with 1 click.${c.reset}\n`);
  }
}

async function handleCliLogout() {
  printWhizanBanner("1.0.3");
  const c = colors;
  await client.clearConfig();
  console.log(`  ${c.emerald}✔ Logged out successfully.${c.reset}`);
  console.log(`  ${c.dim}Local credentials removed from ${WhizanClient.getConfigPath()}${c.reset}\n`);
}

// ─── Start Transport ─────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  if (command === "install" || command === "setup" || command === "register") {
    await handleCliInstall(args);
    return;
  }
  if (command === "login" || command === "auth") {
    await handleCliLogin(args);
    return;
  }
  if (command === "whoami" || command === "status") {
    await handleCliWhoami();
    return;
  }
  if (command === "logout") {
    await handleCliLogout();
    return;
  }
  if (command === "--help" || command === "-h" || command === "help") {
    printCliHelp();
    return;
  }

  // Load config & auth status
  await client.loadConfig();
  const authStatus = await client.getAuthStatus();

  // Render branded Whizan banner & status card to stderr (preserving stdio JSON-RPC on stdout)
  printWhizanBanner("1.0.3");
  printServerStatusCard({
    status: "ONLINE",
    authenticated: authStatus.authenticated,
    userEmail: authStatus.user?.email,
    role: authStatus.user?.role,
    tier: authStatus.user?.subscriptionTier,
    apiUrl: client.getApiUrl(),
    toolCount: TOOLS.length,
    configPath: WhizanClient.getConfigPath(),
  });

  if (process.stdin.isTTY) {
    printInteractiveTips(authStatus.authenticated);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  McpLogger.info("STDIO JSON-RPC transport ready. Listening for IDE agent tool calls.");
}

main().catch((err) => {
  console.error("[Whizan DevOps MCP] Fatal error:", err);
  process.exit(1);
});
