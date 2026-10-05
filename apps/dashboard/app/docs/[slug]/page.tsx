"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Terminal,
  Server,
  Globe,
  Zap,
  Database,
  Clock,
  Workflow,
  Code2,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  ExternalLink,
  Sparkles,
  Bot,
  Layers,
  ArrowRight
} from "lucide-react";
import { BrandMark } from "@/components/brand";
import { toast } from "sonner";

interface DocService {
  slug: string;
  title: string;
  category: string;
  tagline: string;
  icon: any;
  accentColor: string;
  whenToUse: string[];
  whenNotToUse: string[];
  supportedTech: string[];
  howToUse: {
    dashboardSteps: string[];
    cliCommand: string;
    mcpPrompt: string;
  };
  sampleCode?: {
    filename: string;
    code: string;
    language: string;
  };
  configOptions: {
    key: string;
    desc: string;
    defaultVal: string;
  }[];
  proTips: string[];
}

const DOCS_DATA: Record<string, DocService> = {
  frontend: {
    slug: "frontend",
    title: "Frontend Web Hosting",
    category: "Compute & Applications",
    tagline: "High-performance edge hosting for modern web frontends with automated build optimization, SSL, and instant rollbacks.",
    icon: Globe,
    accentColor: "sky",
    whenToUse: [
      "Single Page Applications (SPAs) built with Vite, React, or Vue",
      "Server-Side Rendered (SSR) web applications built with Next.js (App Router or Pages Router)",
      "Static site generators such as Astro, Gatsby, or Hugo",
      "Marketing landing pages, documentation portals, and web dashboards requiring global CDN distribution",
      "Frontends requiring custom domain names with automated TLS/SSL certificate provisioning"
    ],
    whenNotToUse: [
      "Heavy background processing tasks or queue consumers (use Backend Microservices instead)",
      "Long-running stateful WebSocket connections (use Backend Microservices instead)",
      "Relational database servers (use Managed Persistence instead)"
    ],
    supportedTech: ["Next.js", "Vite", "React", "Astro", "Vue.js", "Static HTML/CSS"],
    howToUse: {
      dashboardSteps: [
        "Navigate to the Developer Console and click '+ New Project' or 'Deploy Frontend'.",
        "Select your Git repository or choose 'Direct Archive Upload'.",
        "Choose your framework (Next.js, Vite, React, or Astro) — build commands and output directories are auto-configured.",
        "Add required environment variables (e.g., NEXT_PUBLIC_API_URL).",
        "Click 'Deploy'. Once built, your site is immediately live with a dedicated URL."
      ],
      cliCommand: "whizan deploy --frontend",
      mcpPrompt: "Deploy this frontend application to Whizan Cloud"
    },
    sampleCode: {
      filename: "package.json",
      language: "json",
      code: `{
  "name": "my-web-app",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  }
}`
    },
    configOptions: [
      { key: "Build Command", desc: "Command executed during deployment to compile your assets", defaultVal: "npm run build" },
      { key: "Output Directory", desc: "Directory containing generated static files or build artifacts", defaultVal: "dist (Vite) / .next (Next.js)" },
      { key: "Install Command", desc: "Package manager installation command", defaultVal: "npm install" },
      { key: "Custom Domain", desc: "Custom apex or subdomain (e.g. app.mycompany.com) with automatic HTTPS", defaultVal: "Optional" }
    ],
    proTips: [
      "For Next.js App Router applications with dynamic routes, ensure your project uses standard Next.js standalone server mode.",
      "Store client-accessible environment variables with standard prefixes (e.g. NEXT_PUBLIC_ or VITE_).",
      "Each deployment generates an immutable preview URL so you can test changes before cutting over."
    ]
  },

  backend: {
    slug: "backend",
    title: "Backend Microservices & APIs",
    category: "Compute & Applications",
    tagline: "Run containerized backend services, REST & GraphQL APIs, and background queue workers with auto-healing and instant metrics.",
    icon: Server,
    accentColor: "indigo",
    whenToUse: [
      "RESTful APIs and GraphQL servers written in Node.js, Python, Go, or custom Dockerfiles",
      "Stateful web backends requiring database pooling and session management",
      "WebSocket servers, chat applications, and real-time streaming engines",
      "Background worker processes consuming jobs from Redis or database queues (run as worker services)",
      "Applications requiring custom system dependencies via Dockerfile"
    ],
    whenNotToUse: [
      "Single-purpose webhook listeners or sporadic micro-tasks (use Serverless Edge Functions to eliminate idle cost)",
      "Static single page applications with no server logic (use Frontend Hosting for lower latency and CDN caching)"
    ],
    supportedTech: ["Node.js (Express, Fastify, Nest)", "Python (FastAPI, Django, Flask)", "Go", "Docker"],
    howToUse: {
      dashboardSteps: [
        "From the console, select 'Deploy Service' or navigate to Backend Services.",
        "Provide your repository or source directory.",
        "Select your language runtime or select 'Dockerfile'.",
        "Specify your start command (e.g. 'npm start' or 'uvicorn main:app --host 0.0.0.0 --port 8000').",
        "Set your internal application port (e.g. 3000, 8000) and any secret environment variables (DATABASE_URL, JWT_SECRET).",
        "Click 'Deploy Service'. Whizan will build, launch, and monitor your service container."
      ],
      cliCommand: "whizan deploy --service",
      mcpPrompt: "Deploy this backend microservice to Whizan Cloud"
    },
    sampleCode: {
      filename: "main.py",
      language: "python",
      code: `import os
from fastapi import FastAPI

app = FastAPI(title="My Microservice API")

@app.get("/")
def read_root():
    return {"status": "healthy", "service": "orders-api"}

@app.get("/health")
def health_check():
    return {"ok": True}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    # Important: Bind to 0.0.0.0 so the router can reach your service
    uvicorn.run(app, host="0.0.0.0", port=port)`
    },
    configOptions: [
      { key: "Internal Port", desc: "Port your web server listens on inside the container", defaultVal: "3000 / 8000" },
      { key: "Start Command", desc: "CLI command executed to start your server process", defaultVal: "Auto-detected" },
      { key: "Worker Mode", desc: "Flag for background queue workers that do not expose an HTTP port", defaultVal: "false" },
      { key: "Health Path", desc: "HTTP endpoint checked to verify service readiness", defaultVal: "/ or /health" }
    ],
    proTips: [
      "Always bind your web server to '0.0.0.0', never to '127.0.0.1' or 'localhost'.",
      "Read the port from the 'PORT' environment variable if provided, with a fallback to your preferred port.",
      "For background workers with no HTTP server, toggle 'Worker Mode' to enable process liveness health checking."
    ]
  },

  functions: {
    slug: "functions",
    title: "Serverless Edge Functions",
    category: "Compute & Applications",
    tagline: "Event-driven, lightweight serverless functions with sub-5ms cold starts, zero ports to manage, and automatic scaling.",
    icon: Zap,
    accentColor: "violet",
    whenToUse: [
      "Third-party webhook handlers (Stripe payments, GitHub events, Shopify webhooks, Slack interactions)",
      "Authentication hooks, token validation, and custom header transformations",
      "Lightweight database mutations, user signups, and email notifications",
      "Micro-endpoints and utility APIs where keeping a 24/7 server running is inefficient",
      "Event-driven compute dispatched on demand with zero baseline memory overhead"
    ],
    whenNotToUse: [
      "Heavy compute jobs running longer than 30 seconds",
      "Applications requiring native filesystem persistence or background daemon threads",
      "Full web frameworks requiring extensive server middleware"
    ],
    supportedTech: ["TypeScript", "JavaScript (ES Modules)", "Web Standards API (Request / Response)"],
    howToUse: {
      dashboardSteps: [
        "In the console, click 'Create Edge Function' or navigate to Edge Functions.",
        "Enter a unique service name and choose your runtime (TypeScript / JavaScript).",
        "Write or paste your function handler in the interactive editor or deploy from your local workspace.",
        "Configure endpoint security: toggle 'Public Webhook' for third-party hooks, or keep 'Protected' to enforce API Key verification.",
        "Click 'Deploy Function'. Your endpoint is immediately accessible worldwide."
      ],
      cliCommand: "whizan function deploy --name payments-webhook",
      mcpPrompt: "Create and deploy a serverless edge function for Stripe webhook handling"
    },
    sampleCode: {
      filename: "handler.ts",
      language: "typescript",
      code: `// Standard Web Request/Response handler
export default async function handler(request: Request): Promise<Response> {
  if (request.method === "GET") {
    return Response.json({ status: "active", time: new Date().toISOString() });
  }

  if (request.method === "POST") {
    const payload = await request.json().catch(() => ({}));
    
    // Process webhook event
    console.log("Received event:", payload.event);

    return Response.json({ success: true, processedAt: Date.now() }, { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
}`
    },
    configOptions: [
      { key: "isPublic", desc: "Whether the endpoint can be invoked without an API key (ideal for Stripe/GitHub webhooks)", defaultVal: "false (Protected)" },
      { key: "Runtime", desc: "Language runtime environment", defaultVal: "TYPESCRIPT_V8" },
      { key: "API Key", desc: "Function-specific authorization key (whz_fn_live_...) required when isPublic is false", defaultVal: "Auto-generated" },
      { key: "Route Path", desc: "Subpath for this function endpoint (e.g. /webhook, /subscribe)", defaultVal: "/*" }
    ],
    proTips: [
      "Use 'isPublic: true' strictly for third-party webhook receivers that cannot send custom authorization headers.",
      "Use 'isPublic: false' with dedicated Function API keys for user data, database mutations, and internal business logic.",
      "Edge functions use the standard Web fetch API and Response object — no proprietary vendor wrapper required."
    ]
  },

  databases: {
    slug: "databases",
    title: "Managed Persistence",
    category: "Compute & Applications",
    tagline: "Provision dedicated PostgreSQL database clusters and high-throughput Redis instances with one-click connection strings.",
    icon: Database,
    accentColor: "emerald",
    whenToUse: [
      "Relational structured data storage for users, transactions, orders, and business entities (PostgreSQL)",
      "High-speed session storage, rate limiting, and caching layers (Redis)",
      "Message queues and pub/sub brokers for asynchronous microservice communication (Redis)",
      "Applications using ORMs like Prisma, Drizzle, TypeORM, SQLAlchemy, or GORM"
    ],
    whenNotToUse: [
      "Unstructured cold storage or static media files (use S3-compatible object storage instead)",
      "Client-side direct connections without authentication middleware"
    ],
    supportedTech: ["PostgreSQL 16", "Redis 7", "PgBouncer Connection Pooling"],
    howToUse: {
      dashboardSteps: [
        "Go to 'Databases' in the sidebar navigation.",
        "Click 'Provision Database' and select either PostgreSQL or Redis.",
        "Choose your database name and compute allocation tier.",
        "Once provisioned, copy your direct connection string (DATABASE_URL or REDIS_URL).",
        "Add this connection string to your Backend Microservice or Edge Function environment variables."
      ],
      cliCommand: "whizan db create --type postgresql --name core-db",
      mcpPrompt: "Provision a PostgreSQL database and configure connection string for my backend"
    },
    sampleCode: {
      filename: "db.ts",
      language: "typescript",
      code: `import { Pool } from "pg";

// Connect seamlessly using the standard DATABASE_URL environment variable
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log("Executed query", { text, duration, rows: res.rowCount });
  return res;
}`
    },
    configOptions: [
      { key: "Database Engine", desc: "Database engine type (PostgreSQL or Redis)", defaultVal: "PostgreSQL" },
      { key: "Connection Pooler", desc: "Integrated connection pooler for serverless concurrency spikes", defaultVal: "Enabled" },
      { key: "SSL / TLS", desc: "Enforce TLS encrypted transport for all database queries", defaultVal: "Enforced" }
    ],
    proTips: [
      "Always connect via the pooled connection string when querying from serverless functions to avoid connection exhaustion.",
      "Use database migrations (e.g. Prisma Migrate, Alembic) within your deployment pipeline to keep schemas in sync."
    ]
  },

  cron: {
    slug: "cron",
    title: "Scheduled Cron Jobs",
    category: "Developer Tools",
    tagline: "Event-driven recurring schedules that trigger edge functions, invoke service endpoints, or execute maintenance CLI commands.",
    icon: Clock,
    accentColor: "blue",
    whenToUse: [
      "Nightly data rollups, metric aggregations, and financial report generation",
      "Periodic synchronization with external third-party APIs (every 15 minutes, hourly, daily)",
      "Database maintenance tasks, session purging, and temporary file cleanups",
      "Automated subscription renewal checks and notification dispatching"
    ],
    whenNotToUse: [
      "Continuous real-time stream processing (use Backend Microservices worker mode instead)",
      "Unpredictable user-triggered asynchronous tasks (use Whizan Flow or message queues instead)"
    ],
    supportedTech: ["Standard 5-field Cron Syntax", "Edge Function Targets", "HTTP Webhooks", "Container Exec"],
    howToUse: {
      dashboardSteps: [
        "Navigate to 'Cron Jobs' from the developer tools sidebar.",
        "Click '+ Create Cron Job'.",
        "Enter a name and specify your cron schedule expression (e.g. '0 0 * * *' for daily midnight).",
        "Select your target type: trigger an Edge Function, send an HTTP request to a Microservice, or execute a container CLI command.",
        "Choose your misfire policy (SKIP or FIRE_LATEST_ONCE).",
        "Click 'Create Job'. The scheduler activates immediately."
      ],
      cliCommand: "whizan cron create --schedule '0 */4 * * *' --target-function clean-cache",
      mcpPrompt: "Create a scheduled cron job to run nightly database maintenance"
    },
    sampleCode: {
      filename: "cron-expressions.txt",
      language: "text",
      code: `# Standard 5-Field Cron Expression Reference:
# ┌───────────── minute (0 - 59)
# │ ┌───────────── hour (0 - 23)
# │ │ ┌───────────── day of month (1 - 31)
# │ │ │ ┌───────────── month (1 - 12)
# │ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
# │ │ │ │ │

*/15 * * * *   -> Run every 15 minutes
0 * * * *      -> Run at the start of every hour
0 0 * * *      -> Run once a day at midnight (UTC)
0 9 * * 1-5    -> Run at 9:00 AM on weekdays (Monday to Friday)
0 0 1 * *      -> Run on the 1st of every month at midnight`
    },
    configOptions: [
      { key: "Cron Expression", desc: "Standard 5-part cron syntax schedule", defaultVal: "0 0 * * *" },
      { key: "Target Pipeline", desc: "Execution target: FUNCTION, SERVICE, WEBHOOK, or CONTAINER_EXEC", defaultVal: "FUNCTION" },
      { key: "Misfire Policy", desc: "Behavior if schedule was overdue: SKIP (ignore missed runs) or FIRE_LATEST_ONCE", defaultVal: "SKIP" },
      { key: "Timeout", desc: "Maximum execution duration allowed before job is cancelled", defaultVal: "60 seconds" }
    ],
    proTips: [
      "Use 'SKIP' misfire policy for high-frequency crons (e.g. every 5 minutes) to avoid request storms.",
      "Use 'FIRE_LATEST_ONCE' for daily business rollups or backup jobs to guarantee execution even after maintenance windows.",
      "Check the live execution run history to inspect execution logs, exit codes, and response payloads."
    ]
  },

  flow: {
    slug: "flow",
    title: "Whizan Flow (Automation Pipelines)",
    category: "Developer Tools",
    tagline: "Build multi-step deployment pipelines, automated rollbacks, and team approval workflows.",
    icon: Workflow,
    accentColor: "indigo",
    whenToUse: [
      "Multi-stage deployment workflows (e.g. Run tests -> Migrate Database -> Cutover Frontend -> Post Slack message)",
      "Gated production deployments requiring team approval before proceeding",
      "Automated failure recovery and zero-downtime rollback pipelines",
      "Cross-service synchronization triggered on deployment completion"
    ],
    whenNotToUse: [
      "Simple single-service builds (standard automated deployment already handles atomic rollbacks)",
      "High-throughput sub-millisecond data transformation pipelines"
    ],
    supportedTech: ["Visual Workflow Builder", "TypeScript Flow DSL", "Webhook Integrations"],
    howToUse: {
      dashboardSteps: [
        "Go to 'Whizan Flow' in the sidebar.",
        "Click '+ New Workflow' or choose from pre-built production templates.",
        "Add pipeline steps: build triggers, database migrations, sanity probes, and notifications.",
        "Configure trigger events (e.g. on git push to main, or on manual trigger).",
        "Enable the workflow and monitor step-by-step visual execution logs."
      ],
      cliCommand: "whizan flow run --name deploy-production",
      mcpPrompt: "Set up a Whizan Flow workflow to run prisma migrate and notify slack after deploy"
    },
    sampleCode: {
      filename: "workflow.ts",
      language: "typescript",
      code: `import { defineWorkflow, step } from "@whizan/flow";

export default defineWorkflow({
  name: "Production Release Pipeline",
  trigger: "on_deployment_cutover",
  steps: [
    step("Run Database Migrations", async ({ exec }) => {
      await exec("npx prisma migrate deploy");
    }),
    step("Smoke Test Health Check", async ({ probe }) => {
      await probe("https://api.mycompany.com/health", { expectedStatus: 200 });
    }),
    step("Notify Engineering Team", async ({ notify }) => {
      await notify.slack("#deployments", "🚀 Production cutover completed successfully!");
    })
  ]
});`
    },
    configOptions: [
      { key: "Trigger Mode", desc: "Event that starts the workflow (Git Push, Deployment Cutover, or Manual)", defaultVal: "Manual" },
      { key: "Failure Strategy", desc: "Action taken if a step fails: ABORT, ROLLBACK, or CONTINUE", defaultVal: "ROLLBACK" },
      { key: "Step Approvals", desc: "Require manual approval from a workspace admin before executing critical steps", defaultVal: "Disabled" }
    ],
    proTips: [
      "Always include an automated health check step before posting public notifications.",
      "Use step approvals for production database migrations to prevent accidental schema changes."
    ]
  },

  cli: {
    slug: "cli",
    title: "Whizan CLI & DevOps MCP",
    category: "Developer Tools",
    tagline: "Deploy from your terminal, integrate with CI/CD, or pair-program with AI coding assistants (Cursor, VS Code, Antigravity).",
    icon: Terminal,
    accentColor: "slate",
    whenToUse: [
      "Deploying projects directly from your local development machine without opening a browser",
      "Automating builds and deployments inside GitHub Actions, GitLab CI, or CircleCI",
      "Autonomous AI coding agents in Cursor, Windsurf, or Antigravity that inspect, build, and deploy code",
      "Tailing real-time build logs, checking container health, and running diagnostic commands"
    ],
    whenNotToUse: [
      "Users who prefer a 100% visual web console experience"
    ],
    supportedTech: ["Node.js / npm", "Model Context Protocol (MCP)", "Any terminal shell (Bash, Zsh, PowerShell)"],
    howToUse: {
      dashboardSteps: [
        "Go to 'Settings' in the dashboard.",
        "Under 'IDE DevOps MCP & API Keys', click 'Generate Key'.",
        "Copy your API key and configure your terminal or `.cursor/mcp.json`.",
        "In your terminal, run 'whizan login' and enter your credentials or key.",
        "Deploy any project by running 'whizan deploy' from your project root."
      ],
      cliCommand: "npm install -g @whizan/cli && whizan login",
      mcpPrompt: "Audit this workspace and deploy it to Whizan Cloud"
    },
    sampleCode: {
      filename: "cursor-mcp.json",
      language: "json",
      code: `{
  "mcpServers": {
    "whizan": {
      "command": "npx",
      "args": ["-y", "@whizan/mcp-devops"],
      "env": {
        "WHIZAN_API_URL": "https://whizan-cloud-service.onrender.com",
        "WHIZAN_API_KEY": "whz_live_YOUR_API_KEY_HERE"
      }
    }
  }
}`
    },
    configOptions: [
      { key: "WHIZAN_API_URL", desc: "API control plane URL", defaultVal: "https://whizan-cloud-service.onrender.com" },
      { key: "WHIZAN_API_KEY", desc: "Personal or team API authentication key", defaultVal: "Required for MCP" },
      { key: "Global CLI Binary", desc: "Command line executable installed globally via npm", defaultVal: "@whizan/cli" }
    ],
    proTips: [
      "Run 'whizan status' from any directory with a .whizan.json file to inspect live deployment health.",
      "With the DevOps MCP configured in Cursor or VS Code, you can prompt your AI assistant to 'deploy this project' and it will autonomously analyze your stack, synthesize settings, and trigger deployment."
    ]
  },

  api: {
    slug: "api",
    title: "REST API Reference",
    category: "Developer Tools",
    tagline: "Programmatic REST API for managing projects, services, deployments, environment variables, and telemetry.",
    icon: Code2,
    accentColor: "indigo",
    whenToUse: [
      "Building custom internal developer portals or management dashboards",
      "Custom CI/CD integrations that trigger deployments via HTTP webhooks",
      "Automated scripts that rotate environment variables or query service health programmatically"
    ],
    whenNotToUse: [
      "Standard day-to-day deployments (the Whizan CLI or Web Console is faster and provides automatic progress streaming)"
    ],
    supportedTech: ["REST", "JSON", "Bearer Token Authentication"],
    howToUse: {
      dashboardSteps: [
        "Generate an API Key in 'Settings > IDE DevOps MCP & API Keys'.",
        "Include the header 'Authorization: Bearer <YOUR_API_KEY>' in all API requests.",
        "Base URL: 'https://whizan-cloud-service.onrender.com'."
      ],
      cliCommand: "curl -H 'Authorization: Bearer whz_live_...' https://whizan-cloud-service.onrender.com/api/services",
      mcpPrompt: "Query the Whizan API to list all active services"
    },
    sampleCode: {
      filename: "fetch-services.js",
      language: "javascript",
      code: `const API_URL = "https://whizan-cloud-service.onrender.com";
const API_KEY = process.env.WHIZAN_API_KEY;

async function listCloudServices() {
  const response = await fetch(\`\${API_URL}/api/services\`, {
    headers: {
      "Authorization": \`Bearer \${API_KEY}\`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(\`API request failed: \${response.status}\`);
  }

  const services = await response.json();
  console.log("Active microservices:", services);
  return services;
}

listCloudServices();`
    },
    configOptions: [
      { key: "POST /api/deploy/direct", desc: "Upload tar.gz/zip archive for automatic build and deployment cutover", defaultVal: "Archive Payload" },
      { key: "GET /api/projects", desc: "List all deployed frontend applications and their live URLs", defaultVal: "JSON Array" },
      { key: "GET /api/services", desc: "List all backend microservices, health statuses, and container ports", defaultVal: "JSON Array" },
      { key: "POST /api/functions/deploy", desc: "Deploy compiled ESM edge function code bundle", defaultVal: "JSON Payload" }
    ],
    proTips: [
      "All requests require the 'Authorization: Bearer <API_KEY>' header.",
      "Rate limits are enforced per API key; keep keys secret and rotate them if compromised."
    ]
  }
};

const ALL_SLUGS = [
  { slug: "frontend", title: "Frontend Hosting", icon: Globe },
  { slug: "backend", title: "Backend Services", icon: Server },
  { slug: "functions", title: "Edge Functions", icon: Zap },
  { slug: "databases", title: "Managed Databases", icon: Database },
  { slug: "cron", title: "Cron Jobs", icon: Clock },
  { slug: "flow", title: "Whizan Flow", icon: Workflow },
  { slug: "cli", title: "CLI & DevOps MCP", icon: Terminal },
  { slug: "api", title: "REST API Reference", icon: Code2 }
];

export default function DocDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const rawSlug = resolvedParams?.slug?.toLowerCase() || "frontend";

  // Normalize aliases
  let targetSlug = "frontend";
  if (rawSlug === "hosting" || rawSlug === "projects" || rawSlug === "frontend") targetSlug = "frontend";
  else if (rawSlug === "services" || rawSlug === "microservices" || rawSlug === "backend") targetSlug = "backend";
  else if (rawSlug === "edge-functions" || rawSlug === "serverless" || rawSlug === "functions") targetSlug = "functions";
  else if (rawSlug === "persistence" || rawSlug === "postgres" || rawSlug === "redis" || rawSlug === "databases") targetSlug = "databases";
  else if (rawSlug === "schedules" || rawSlug === "cron-jobs" || rawSlug === "cron") targetSlug = "cron";
  else if (rawSlug === "flows" || rawSlug === "pipelines" || rawSlug === "flow") targetSlug = "flow";
  else if (rawSlug === "mcp" || rawSlug === "tooling" || rawSlug === "cli") targetSlug = "cli";
  else if (rawSlug === "rest-api" || rawSlug === "api") targetSlug = "api";

  const doc = DOCS_DATA[targetSlug] || DOCS_DATA.frontend;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function copyCode(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const Icon = doc.icon;

  return (
    <div className="docs-shell">
      {/* Top Header */}
      <header className="docs-nav-header">
        <div className="docs-container docs-nav-inner">
          <div className="flex items-center gap-3">
            <BrandMark href="/dashboard" />
            <span className="docs-header-pill">Documentation Hub</span>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/docs" className="btn btn-secondary btn-sm">
              <BookOpen size={14} />
              <span>All Docs</span>
            </Link>
            <Link href="/dashboard" className="btn btn-primary btn-sm">
              <ArrowLeft size={14} />
              <span>Console</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Documentation Workstation */}
      <div className="docs-container docs-body-layout">
        {/* Left Sidebar: Service Selector */}
        <aside className="docs-sidebar">
          <div className="sidebar-group-title">Services & Tools</div>
          <nav className="docs-sidebar-nav">
            {ALL_SLUGS.map((item) => {
              const ItemIcon = item.icon;
              const isActive = item.slug === targetSlug;
              return (
                <Link
                  key={item.slug}
                  href={`/docs/${item.slug}`}
                  className={`docs-nav-anchor ${isActive ? "docs-nav-anchor-active" : ""}`}
                >
                  <ItemIcon size={16} className={isActive ? "text-indigo-600" : "text-slate-500"} />
                  <span className="flex-1">{item.title}</span>
                  {isActive && <ChevronRight size={14} className="text-indigo-600" />}
                </Link>
              );
            })}
          </nav>

          <div className="docs-sidebar-box">
            <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-900 mb-1">
              <Bot size={14} className="text-indigo-600" />
              <span>AI DevOps Support</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-2.5">
              Connect local coding agents (Cursor, Windsurf) to orchestrate deployments autonomously.
            </p>
            <Link href="/dashboard/mcp" className="docs-box-link">
              Configure MCP →
            </Link>
          </div>
        </aside>

        {/* Right Main Article */}
        <main className="docs-article">
          {/* Breadcrumb */}
          <div className="docs-breadcrumb">
            <Link href="/docs" className="breadcrumb-link">Documentation</Link>
            <span className="text-slate-300">/</span>
            <span className="text-slate-500">{doc.category}</span>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-900">{doc.title}</span>
          </div>

          {/* Article Header */}
          <div className="article-header">
            <div className="article-title-row">
              <div className="article-icon-box">
                <Icon size={24} className="text-indigo-600" />
              </div>
              <div>
                <h1 className="article-title">{doc.title}</h1>
                <p className="article-tagline">{doc.tagline}</p>
              </div>
            </div>

            {/* Supported Frameworks / Tech Badges */}
            <div className="tech-chips-strip">
              <span className="tech-chips-label">Supported:</span>
              {doc.supportedTech.map((tech) => (
                <span key={tech} className="tech-badge">{tech}</span>
              ))}
            </div>
          </div>

          {/* ── 1. When to Use (and When Not to Use) ────────────────────── */}
          <section className="article-section">
            <h2 className="section-title">When to Use This Service</h2>
            <div className="when-grid">
              <div className="when-card when-yes">
                <div className="when-card-heading text-emerald-800">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <span>Ideal Use Cases</span>
                </div>
                <ul className="when-list">
                  {doc.whenToUse.map((item, idx) => (
                    <li key={idx} className="when-list-item">
                      <span className="bullet-dot bg-emerald-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="when-card when-no">
                <div className="when-card-heading text-slate-800">
                  <AlertCircle size={16} className="text-slate-500" />
                  <span>When to Choose Another Workload</span>
                </div>
                <ul className="when-list">
                  {doc.whenNotToUse.map((item, idx) => (
                    <li key={idx} className="when-list-item">
                      <span className="bullet-dot bg-slate-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* ── 2. How to Use Step-by-Step ────────────────────────────── */}
          <section className="article-section">
            <h2 className="section-title">How to Use & Deploy</h2>

            <div className="how-methods-stack">
              {/* Method A: Web Console */}
              <div className="method-box">
                <h3 className="method-title">
                  <span className="method-badge">Option 1</span>
                  <span>Deploy via Web Console</span>
                </h3>
                <ol className="steps-ordered-list">
                  {doc.howToUse.dashboardSteps.map((step, idx) => (
                    <li key={idx} className="step-item">
                      <span className="step-number">{idx + 1}</span>
                      <span className="step-text">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Method B: CLI & AI MCP */}
              <div className="method-box">
                <h3 className="method-title">
                  <span className="method-badge">Option 2</span>
                  <span>Deploy via CLI & Terminal</span>
                </h3>
                <p className="text-sm text-slate-600 mb-3">
                  Deploy instantly from your local workspace terminal using the global Whizan CLI:
                </p>
                <div className="code-snippet-box">
                  <code>$ {doc.howToUse.cliCommand}</code>
                  <button
                    onClick={() => copyCode(doc.howToUse.cliCommand, "cli-deploy")}
                    className="code-copy-btn"
                    title="Copy command"
                  >
                    {copiedKey === "cli-deploy" ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  </button>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <span className="text-xs font-semibold text-slate-800 block mb-1">
                    Or prompt your AI Coding Assistant (Cursor / Antigravity MCP):
                  </span>
                  <div className="ai-prompt-box">
                    <Sparkles size={14} className="text-indigo-600 flex-shrink-0" />
                    <span className="font-mono text-xs text-slate-800 flex-1">&ldquo;{doc.howToUse.mcpPrompt}&rdquo;</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── 3. Practical Code / Configuration Example ──────────────── */}
          {doc.sampleCode && (
            <section className="article-section">
              <h2 className="section-title">Practical Project Example</h2>
              <div className="example-code-wrapper">
                <div className="example-code-header">
                  <span className="filename-text font-mono">{doc.sampleCode.filename}</span>
                  <button
                    onClick={() => copyCode(doc.sampleCode!.code, "sample-code")}
                    className="copy-snippet-btn"
                  >
                    {copiedKey === "sample-code" ? (
                      <>
                        <Check size={12} className="text-emerald-600" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="example-pre font-mono">
                  <code>{doc.sampleCode.code}</code>
                </pre>
              </div>
            </section>
          )}

          {/* ── 4. Configuration Reference Table ──────────────────────── */}
          <section className="article-section">
            <h2 className="section-title">Configuration Reference</h2>
            <div className="config-table-card">
              <table className="config-table">
                <thead>
                  <tr>
                    <th>Parameter / Setting</th>
                    <th>Description</th>
                    <th>Default / Recommended</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.configOptions.map((opt, idx) => (
                    <tr key={idx}>
                      <td className="font-semibold text-slate-900 font-mono text-xs">{opt.key}</td>
                      <td className="text-slate-600 text-xs">{opt.desc}</td>
                      <td className="font-mono text-xs text-indigo-700 bg-indigo-50/50">{opt.defaultVal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── 5. Best Practices & Pro Tips ──────────────────────────── */}
          <section className="article-section">
            <h2 className="section-title">Best Practices & Pro Tips</h2>
            <div className="tips-stack">
              {doc.proTips.map((tip, idx) => (
                <div key={idx} className="tip-item">
                  <span className="tip-badge">Tip {idx + 1}</span>
                  <span className="tip-text">{tip}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Bottom Navigation Strip */}
          <div className="docs-bottom-nav">
            <Link href="/docs" className="bottom-nav-btn">
              <ArrowLeft size={14} />
              <span>Back to Documentation Index</span>
            </Link>
            <Link href="/dashboard" className="bottom-nav-btn primary">
              <span>Open Developer Console</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </main>
      </div>

      {/* Scoped CSS */}
      <style>{`
        .docs-shell {
          min-height: 100vh;
          background: #fafbfc;
          color: #0f172a;
        }
        .docs-container {
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 2rem;
          width: 100%;
        }

        /* Nav Header */
        .docs-nav-header {
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
        }
        .docs-nav-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 0.85rem;
          padding-bottom: 0.85rem;
        }
        .docs-header-pill {
          font-size: 0.72rem;
          font-weight: 700;
          color: #4f46e5;
          background: #eef2ff;
          border: 1px solid #c7d2fe;
          border-radius: 9999px;
          padding: 0.15rem 0.55rem;
        }

        /* Body Layout */
        .docs-body-layout {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 2.5rem;
          padding-top: 2rem;
          padding-bottom: 5rem;
          align-items: start;
        }

        /* Sidebar */
        .docs-sidebar {
          position: sticky;
          top: 4.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .sidebar-group-title {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #94a3b8;
          padding: 0 0.5rem;
        }
        .docs-sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .docs-nav-anchor {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.5rem 0.75rem;
          border-radius: 7px;
          font-size: 0.84rem;
          font-weight: 500;
          color: #475569;
          text-decoration: none;
          transition: all 0.12s ease;
        }
        .docs-nav-anchor:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .docs-nav-anchor-active {
          background: #eef2ff;
          color: #4f46e5;
          font-weight: 650;
        }
        .docs-sidebar-box {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.85rem 1rem;
        }
        .docs-box-link {
          font-size: 0.74rem;
          font-weight: 650;
          color: var(--accent);
          text-decoration: none;
        }
        .docs-box-link:hover {
          text-decoration: underline;
        }

        /* Main Article */
        .docs-article {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 2.25rem 2.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
          min-width: 0;
        }

        /* Breadcrumb */
        .docs-breadcrumb {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.78rem;
          margin-bottom: 1.5rem;
        }
        .breadcrumb-link {
          color: var(--muted);
          text-decoration: none;
        }
        .breadcrumb-link:hover {
          color: var(--foreground);
        }

        /* Article Header */
        .article-header {
          padding-bottom: 1.75rem;
          border-bottom: 1px solid #f1f5f9;
          margin-bottom: 2rem;
        }
        .article-title-row {
          display: flex;
          align-items: flex-start;
          gap: 1.25rem;
          margin-bottom: 1.25rem;
        }
        .article-icon-box {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          background: #eef2ff;
          border: 1px solid #e0e7ff;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .article-title {
          font-size: 1.95rem;
          font-weight: 800;
          letter-spacing: -0.035em;
          color: var(--foreground);
          line-height: 1.2;
        }
        .article-tagline {
          font-size: 0.95rem;
          color: var(--muted);
          line-height: 1.55;
          margin-top: 0.35rem;
        }
        .tech-chips-strip {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          flex-wrap: wrap;
        }
        .tech-chips-label {
          font-size: 0.74rem;
          font-weight: 600;
          color: #94a3b8;
          text-transform: uppercase;
          margin-right: 0.25rem;
        }
        .tech-badge {
          font-size: 0.72rem;
          font-weight: 600;
          color: #334155;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 0.15rem 0.45rem;
        }

        /* Section */
        .article-section {
          margin-bottom: 2.5rem;
        }
        .section-title {
          font-size: 1.25rem;
          font-weight: 750;
          letter-spacing: -0.02em;
          color: var(--foreground);
          margin-bottom: 1rem;
        }

        /* When Grid */
        .when-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.25rem;
        }
        .when-card {
          border-radius: 8px;
          padding: 1.25rem 1.35rem;
        }
        .when-yes {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
        }
        .when-no {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }
        .when-card-heading {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          font-size: 0.88rem;
          font-weight: 700;
          margin-bottom: 0.85rem;
        }
        .when-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .when-list-item {
          display: flex;
          align-items: flex-start;
          gap: 0.55rem;
          font-size: 0.82rem;
          line-height: 1.5;
          color: #334155;
        }
        .bullet-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          margin-top: 0.45rem;
          flex-shrink: 0;
        }

        /* How Methods Stack */
        .how-methods-stack {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .method-box {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 1.25rem 1.5rem;
          background: #fafbfc;
        }
        .method-title {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--foreground);
          margin-bottom: 0.85rem;
        }
        .method-badge {
          font-size: 0.68rem;
          font-weight: 700;
          padding: 0.15rem 0.45rem;
          background: #eef2ff;
          color: #4f46e5;
          border: 1px solid #c7d2fe;
          border-radius: 4px;
        }
        .steps-ordered-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .step-item {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
        }
        .step-number {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #0f172a;
          color: #ffffff;
          font-size: 0.72rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 0.1rem;
        }
        .step-text {
          font-size: 0.84rem;
          color: #334155;
          line-height: 1.55;
        }

        .code-snippet-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #0f172a;
          color: #f8fafc;
          padding: 0.65rem 0.95rem;
          border-radius: 6px;
          font-size: 0.82rem;
          font-family: var(--font-geist-mono), monospace;
        }
        .code-copy-btn {
          border: none;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          padding: 0.2rem;
          display: flex;
          align-items: center;
        }
        .code-copy-btn:hover {
          color: #ffffff;
        }

        .ai-prompt-box {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: #ffffff;
          border: 1px solid #c7d2fe;
          border-radius: 6px;
          padding: 0.5rem 0.75rem;
        }

        /* Example Code Block */
        .example-code-wrapper {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
          background: #0f172a;
        }
        .example-code-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.6rem 1rem;
          background: #1e293b;
          border-bottom: 1px solid #334155;
        }
        .filename-text {
          font-size: 0.78rem;
          color: #cbd5e1;
        }
        .copy-snippet-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 0.74rem;
          cursor: pointer;
          font-family: inherit;
        }
        .copy-snippet-btn:hover {
          color: #ffffff;
        }
        .example-pre {
          padding: 1.25rem 1.5rem;
          margin: 0;
          overflow-x: auto;
          font-size: 0.82rem;
          line-height: 1.6;
          color: #e2e8f0;
        }

        /* Config Table */
        .config-table-card {
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
        }
        .config-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.82rem;
        }
        .config-table th {
          background: #f8fafc;
          padding: 0.65rem 1rem;
          text-align: left;
          font-weight: 650;
          color: #475569;
          border-bottom: 1px solid var(--border);
        }
        .config-table td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #f1f5f9;
        }
        .config-table tr:last-child td {
          border-bottom: none;
        }

        /* Tips */
        .tips-stack {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .tip-item {
          display: flex;
          align-items: flex-start;
          gap: 0.65rem;
          padding: 0.75rem 1rem;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 7px;
          font-size: 0.82rem;
          line-height: 1.5;
        }
        .tip-badge {
          font-size: 0.68rem;
          font-weight: 750;
          background: #eef2ff;
          color: #4f46e5;
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
          white-space: nowrap;
        }
        .tip-text {
          color: #334155;
        }

        /* Bottom Nav */
        .docs-bottom-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 1.75rem;
          border-top: 1px solid #f1f5f9;
          margin-top: 2rem;
          flex-wrap: wrap;
          gap: 1rem;
        }
        .bottom-nav-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          font-size: 0.82rem;
          font-weight: 600;
          color: #475569;
          text-decoration: none;
          padding: 0.5rem 0.85rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: #ffffff;
          transition: all 0.12s ease;
        }
        .bottom-nav-btn:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .bottom-nav-btn.primary {
          background: #0f172a;
          color: #ffffff;
          border-color: #0f172a;
        }
        .bottom-nav-btn.primary:hover {
          background: #1e293b;
        }

        /* Responsive */
        @media (max-width: 960px) {
          .docs-body-layout {
            grid-template-columns: 1fr;
          }
          .docs-sidebar {
            position: static;
          }
          .when-grid {
            grid-template-columns: 1fr;
          }
          .docs-article {
            padding: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}
