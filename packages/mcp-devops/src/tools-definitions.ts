import { type Tool } from "@modelcontextprotocol/sdk/types.js";

export const TOOLS: Tool[] = [
  {
    name: "whizan_auth_status",
    description: "Checks Whizan Cloud authentication status and returns the currently logged-in developer profile and subscription tier. See full platform overview at resource uri 'whizan://docs/overview'.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "whizan_login",
    description: "Configures or updates the Whizan API key for authentication. See authentication details at resource uri 'whizan://docs/overview'.",
    inputSchema: {
      type: "object",
      properties: {
        apiKey: { type: "string", description: "The Whizan API Key starting with whz_live_..." },
        apiUrl: { type: "string", description: "Optional API URL (defaults to production https://api.whizan.cloud or local)" },
      },
      required: ["apiKey"],
    },
  },
  {
    name: "whizan_analyze_workspace",
    description: "PHASE 1 (MANDATORY): Always run this first before any deployment. Audits local directory, runs Gemini Flash 3.5 Lite AI repository analysis on README & package manifests, auto-selects stack, build & start commands, checks AI system guardrails (refusing non-deployable desktop/mobile/CLI projects), and identifies mandatory environment variables to prompt the user. See complete 6-Phase protocol at resource uri 'whizan://docs/deployment-protocol'.",
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
    description: "Generates recommended code snippets to adapt user code for Whizan hosting (dynamic PORT binding to 0.0.0.0, CORS configuration, /health endpoint, or rewiring frontend API URLs). See instructions at resource uri 'whizan://docs/deployment-protocol'.",
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
    description: "PHASE 3 (FOR BACKENDS & WORKERS): Registers a new backend microservice, API, or background queue worker on Whizan Cloud (Node.js, Python, Go, Rust, Java, PHP, Dockerfile). COMPUTE POLICY: Compute and RAM are governed strictly by the user's subscription tier. On Hobby plan, compute is strictly locked to free tier (0.1 vCPU, 512MB RAM, autoSleep=true). Only Professional plan users can choose custom tiers (standard, pro, pro_plus). Web services MUST bind to 0.0.0.0. For background queue workers without HTTP ingress, set internalPort: 0 and isWorker: true. See full backend instructions at resource uri 'whizan://docs/deployment-protocol'.",
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
    description: "PHASE 3 (FOR FRONTENDS): Registers a new frontend or fullstack web project on Whizan Cloud (Next.js, Vite, React, Astro, or static HTML). For pure static HTML sites with no build, use framework: 'CUSTOM', outputDir: '.', buildCommand: '', installCommand: ''. See full routing rules at resource uri 'whizan://docs/deployment-protocol'.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the web project" },
        slug: { type: "string", description: "Subdomain slug (e.g. my-frontend)" },
        framework: { type: "string", enum: ["NEXTJS", "REACT", "VITE", "ASTRO", "CUSTOM"], default: "NEXTJS" },
        rootDir: { type: "string", default: "." },
        buildCommand: { type: "string", default: "npm run build" },
        installCommand: { type: "string", default: "npm install" },
        outputDir: { type: "string", description: "Build output directory: 'dist' for Vite/React/Astro, '.next' for Next.js, or '.' for static HTML" },
        envVars: { type: "object", description: "Key-value dictionary of environment variables" },
      },
      required: ["name", "slug"],
    },
  },
  {
    name: "whizan_deploy_direct",
    description: "PHASE 4: Packs the workspace and uploads directly to Whizan Cloud. NOTE: Uploading enqueues the build job on the cloud builder cluster. Agents MUST capture the returned deploymentId and proceed to Phase 5 (whizan_get_build_logs). See complete deployment instructions at resource uri 'whizan://docs/deployment-protocol'.",
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
    description: "Provisions a managed database instance on Whizan Cloud (PostgreSQL with PgBouncer, Redis, or MySQL). COMPUTE POLICY: On Hobby plan, databases are strictly provisioned on starter tier (0.5 vCPU, 512MB RAM). Only Professional plan users can specify standard or pro tiers. See database guides and pooling instructions at resource uri 'whizan://docs/database-management'.",
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
    description: "PHASE 5 (MANDATORY): Retrieves execution logs and build status from the cloud build worker. Agents MUST poll this every 5-10s until status reaches READY/ACTIVE or FAILED. Never declare completion before build finishes. See protocol at resource uri 'whizan://docs/deployment-protocol'.",
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
    description: "PHASE 2 (MANDATORY IF SECRETS REQUIRED): Sets, updates, or patches environment variables on a Whizan service, project, or function. Agents must call this BEFORE triggering deployment to avoid container boot failures. See environment injection guide at resource uri 'whizan://docs/deployment-protocol'.",
    inputSchema: {
      type: "object",
      properties: {
        targetType: { type: "string", enum: ["service", "project", "function"], description: "Whether targeting a backend service, frontend project, or edge function" },
        targetId: { type: "string", description: "The Whizan ID of the service or project" },
        envVars: { type: "object", description: "Dictionary of key-value environment variables to encrypt and store" },
      },
      required: ["targetType", "targetId", "envVars"],
    },
  },
  {
    name: "whizan_check_health",
    description: "PHASE 6 (FINAL VERIFICATION): Pings the deployed live URL to verify HTTP readiness (HTTP 200), or verifies process liveness via targetId for background queue workers (internalPort: 0). Agents must only declare success after health check passes. See verification protocol at resource uri 'whizan://docs/deployment-protocol'.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The full public URL to ping (e.g. https://<slug>.whizan.cloud/health). Optional if targetId is provided." },
        targetId: { type: "string", description: "Whizan service or project ID. Required if checking background queue workers without an HTTP listener." },
      },
    },
  },
  {
    name: "whizan_redeploy",
    description: "Triggers a redeployment of an existing service or project using cached source code or a newly specified Git repository. See redeployment workflow at resource uri 'whizan://docs/deployment-protocol'.",
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
    description: "Links a GitHub repository (public or private) to an existing Whizan service or project and immediately triggers a fresh build and deployment. See Git CI/CD instructions at resource uri 'whizan://docs/deployment-protocol'.",
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
    description: "Deletes a service or project completely, cleanly stopping and removing all Docker containers and wiping build/source files from the compute cluster. See lifecycle guide at resource uri 'whizan://docs/deployment-protocol'.",
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
    description: "Executes an informational, diagnostic, or troubleshooting command inside the running container of a Whizan project or service (e.g. 'ps aux', 'df -h', 'npx prisma status', 'curl -I http://127.0.0.1:3000/health'). GUARDRAILS ENFORCED: Destructive operations and system package managers are blocked. Sensitive tokens and passwords are automatically masked. See complete diagnostic guide at resource uri 'whizan://docs/diagnostics'.",
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
    description: "Inspects the live runtime state of a deployed project or service container on the VM host: running state, container ID, image tag, mapped ports, uptime, restart counts, memory limits, and registered edge routing. See guide at resource uri 'whizan://docs/diagnostics'.",
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
    description: "Retrieves traffic, performance, and usage analytics for a project or service. For projects: page views, unique visitors, total bandwidth. For services: CPU/memory usage snapshot and recent history. See guide at resource uri 'whizan://docs/diagnostics'.",
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
    name: "whizan_get_application_logs",
    description: "Retrieves live runtime standard output (stdout) and standard error (stderr) logs directly from the active or recently exited container. Use this for diagnosing runtime crashes, server startup errors, uncaught exceptions, and unhandled rejections that happen after the build finishes. See diagnostic instructions at resource uri 'whizan://docs/diagnostics'.",
    inputSchema: {
      type: "object",
      properties: {
        targetType: {
          type: "string",
          enum: ["project", "service"],
          description: "Type of deployment: 'project' (frontend/SSR/web container) or 'service' (backend API/worker)",
        },
        targetId: {
          type: "string",
          description: "The unique UUID or slug of the project or service",
        },
        tail: {
          type: "number",
          default: 200,
          description: "Number of most recent log lines to retrieve (default: 200, max: 1000)",
        },
        timestamps: {
          type: "boolean",
          default: false,
          description: "Whether to include ISO timestamps for each log line",
        },
      },
      required: ["targetType", "targetId"],
    },
  },
  {
    name: "whizan_exec_vm_command",
    description: "Executes an administrative or operational command on the host compute node (e.g. 'pm2 status', 'pm2 restart all', 'git pull origin main', 'free -m', 'df -h', 'docker ps'). Allows developers and agents to maintain the compute infrastructure directly. See guide at resource uri 'whizan://docs/diagnostics'.",
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
    description: "Creates a new serverless Edge Function service on Whizan Cloud (like Firebase Functions or AWS Lambda). SECURITY MANDATE: By default, serverless functions MUST be created with 'isPublic: false' (API Key Protected) for data security. Agents must categorize functions: if creating public webhooks (e.g., Stripe, GitHub) or open status endpoints, set 'isPublic: true'. Otherwise, keep 'isPublic: false' (API Key Protected) and use 'whizan_create_function_api_key' to generate an access key ('whz_fn_live_...'). You can also provide granular 'endpoints: [{ routePath, isPublic }]' to mix public webhooks and protected endpoints in the same service. See complete Edge Function reference at resource uri 'whizan://docs/edge-functions'.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable name of the function service" },
        slug: { type: "string", description: "Unique subdomain slug (e.g. 'payment-api' -> 'payment-api.whizan.cloud')" },
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
    description: "Deploys a new version of TypeScript or JavaScript code to an existing Whizan Edge Function service with sub-5ms cold-start compilation, automatic multi-function endpoint discovery, and self-healing disaster recovery. See code templates and guidelines at resource uri 'whizan://docs/edge-functions'.",
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
    description: "Configures or toggles security (Public Webhook vs API Key Protected), route path, HTTP methods, memory limit, and timeout seconds for a specific endpoint in an Edge Function service. Use this to mark webhooks as public or protect sensitive endpoints with API keys. See endpoint security guide at resource uri 'whizan://docs/edge-functions'.",
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
    description: "Generates a new dedicated Function API Key (whz_fn_live_...) for an Edge Function with customizable scopes, rate limiting, and IP whitelisting. Use this key in 'x-api-key: whz_fn_live_...' or 'Authorization: Bearer <key>' to authorize requests to protected functions and endpoints. See guide at resource uri 'whizan://docs/edge-functions'.",
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
    description: "Invokes a live Whizan Edge Function over HTTP, testing authentication, response payload, status code, and latency in milliseconds. NOTE: If the function or endpoint is API Key Protected ('isPublic: false'), you MUST provide the 'apiKey' parameter (format: 'whz_fn_live_...'). See invocation examples at resource uri 'whizan://docs/edge-functions'.",
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
    description: "Lists all serverless Edge Function services registered on the user's Whizan Cloud account with runtime, endpoint count, and active deployment status. See reference at resource uri 'whizan://docs/edge-functions'.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "whizan_create_cron_job",
    description: "Schedules an enterprise background task or recurring job with zero-idle CPU overhead and sub-second precision. Supports Edge Functions, Container Exec CLI, Internal Mesh Services, Web Projects, and Webhooks. See cron syntax and policies at resource uri 'whizan://docs/cron-workflows'.",
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
    description: "Lists all scheduled cron jobs on the account with schedule expression, target type, last run status, next run time, and total executions. See guide at resource uri 'whizan://docs/cron-workflows'.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "whizan_trigger_cron_job",
    description: "Manually triggers an immediate execution of a scheduled cron job (1-click trigger), bypassing schedule delay. Returns the active execution ID. See instructions at resource uri 'whizan://docs/cron-workflows'.",
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
    description: "Fetches recent execution logs and history for a cron job, including duration in ms, exit code, HTTP status, and stdout/stderr output. See debugging guide at resource uri 'whizan://docs/cron-workflows'.",
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
    description: "Creates an automated CI/CD build, deployment, or devops workflow DAG (Whizan Flow) with custom steps, dependency edges, and triggers. See DAG configuration guide at resource uri 'whizan://docs/cron-workflows'.",
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
    description: "Triggers an execution run for a Whizan Flow workflow DAG (1-click trigger) with optional runtime metadata. See execution guide at resource uri 'whizan://docs/cron-workflows'.",
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
    description: "Inspects live execution status, duration, output data, terminal logs, and step outcomes for a Whizan Flow run. See guide at resource uri 'whizan://docs/cron-workflows'.",
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
    description: "Approves or rejects a suspended human-in-the-loop approval gate token to resume workflow execution. See guide at resource uri 'whizan://docs/cron-workflows'.",
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
  {
    name: "whizan_storage_get_usage",
    description: "Fetches Whizan Cloud Storage quota allocation (250 MB default limit), committed bytes, reserved in-flight bytes, object count, and plan tier limits. See storage guide at resource uri 'whizan://docs/storage-sdk'.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "whizan_storage_list_buckets",
    description: "Lists all Cloudflare R2 storage buckets owned by the authenticated user. See storage guide at resource uri 'whizan://docs/storage-sdk'.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "whizan_storage_create_bucket",
    description: "Creates a new Cloudflare R2 object storage bucket. Private by default (isPublic: false). For public CDN distribution without authentication tokens, set isPublic: true. See bucket management guide at resource uri 'whizan://docs/storage-sdk'.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Bucket name (3-63 chars, lowercase alphanumeric with hyphens)" },
        description: { type: "string", description: "Optional description of bucket contents" },
        isPublic: { type: "boolean", description: "Set true to make bucket publicly readable without auth tokens", default: false },
      },
      required: ["name"],
    },
  },
  {
    name: "whizan_storage_delete_bucket",
    description: "Deletes a storage bucket. Requires the bucket to be empty unless force is true. See storage lifecycle at resource uri 'whizan://docs/storage-sdk'.",
    inputSchema: {
      type: "object",
      properties: {
        bucket: { type: "string", description: "The bucket name or bucket ID to delete" },
        force: { type: "boolean", description: "Set true to forcefully delete all objects in the bucket before deletion", default: false },
      },
      required: ["bucket"],
    },
  },
  {
    name: "whizan_storage_list_objects",
    description: "Lists and paginates objects in a Cloudflare R2 storage bucket. See object operations at resource uri 'whizan://docs/storage-sdk'.",
    inputSchema: {
      type: "object",
      properties: {
        bucket: { type: "string", description: "Bucket name or ID" },
        prefix: { type: "string", description: "Optional path prefix to filter objects (e.g. 'images/')" },
        limit: { type: "number", description: "Maximum number of objects to return (default: 50, max: 100)", default: 50 },
      },
      required: ["bucket"],
    },
  },
  {
    name: "whizan_storage_upload_object",
    description: "Uploads a local file from the developer workspace to Cloudflare R2 storage with atomic quota reservation. See SDK upload guide at resource uri 'whizan://docs/storage-sdk'.",
    inputSchema: {
      type: "object",
      properties: {
        bucket: { type: "string", description: "Target bucket name or ID" },
        localFilePath: { type: "string", description: "Local filesystem path to the file to upload" },
        destinationPath: { type: "string", description: "Destination logical path in bucket (e.g. 'assets/logo.png')" },
        mimeType: { type: "string", description: "Optional content MIME type" },
      },
      required: ["bucket", "localFilePath", "destinationPath"],
    },
  },
  {
    name: "whizan_storage_download_object",
    description: "Downloads an object from Cloudflare R2 storage to a local file in the workspace. See SDK download guide at resource uri 'whizan://docs/storage-sdk'.",
    inputSchema: {
      type: "object",
      properties: {
        bucket: { type: "string", description: "Source bucket name or ID" },
        objectPath: { type: "string", description: "Logical object path within the bucket" },
        localDestinationPath: { type: "string", description: "Local path to save the downloaded file" },
      },
      required: ["bucket", "objectPath", "localDestinationPath"],
    },
  },
  {
    name: "whizan_storage_delete_object",
    description: "Deletes an object from Cloudflare R2 storage and releases user quota. See storage guide at resource uri 'whizan://docs/storage-sdk'.",
    inputSchema: {
      type: "object",
      properties: {
        bucket: { type: "string", description: "Bucket name or ID" },
        objectPath: { type: "string", description: "Logical object path to delete" },
      },
      required: ["bucket", "objectPath"],
    },
  },
  {
    name: "whizan_storage_create_api_key",
    description: "Generates a dedicated Storage API Key ('whz_stg_live_...') with explicit scope and permissions. Use this key in application environment variables (WHIZAN_STORAGE_KEY) or MCP/CLI storage client operations. Returns the live key secret, key ID, and scoping metadata. See complete scoping and SDK instructions at resource uri 'whizan://docs/storage-sdk'.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Human-readable label for the key (e.g. 'Production App Key', 'MCP DevOps Probe Key')",
        },
        permission: {
          type: "string",
          enum: ["READ_WRITE", "READ_ONLY"],
          default: "READ_WRITE",
          description: "Access level: 'READ_WRITE' for uploading and modifying objects, or 'READ_ONLY' for downloads only",
        },
        bucketId: {
          type: "string",
          description: "Optional bucket ID or name to strictly scope this key to. Leave empty for all buckets in the account.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "whizan_storage_list_api_keys",
    description: "Lists all storage API keys configured in the account, including key ID, name, keyPrefix, permission (READ_WRITE/READ_ONLY), and bucket scoping. See guide at resource uri 'whizan://docs/storage-sdk'.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "whizan_storage_delete_api_key",
    description: "Revokes and deletes a Storage API Key by its Key ID or key prefix (e.g. 'whz_stg_live_...'). Revoked keys immediately lose all access to Cloud Storage buckets and objects. See key lifecycle guide at resource uri 'whizan://docs/storage-sdk'.",
    inputSchema: {
      type: "object",
      properties: {
        keyId: {
          type: "string",
          description: "Unique Key ID (UUID) or key prefix of the Storage API Key to revoke.",
        },
      },
      required: ["keyId"],
    },
  },
];
