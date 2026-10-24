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
  ArrowRight,
  HardDrive
} from "lucide-react";
import { BrandMark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";

interface DetailedGuide {
  id: string;
  title: string;
  badge?: string;
  description: string;
  codeSnippet?: {
    filename: string;
    language: string;
    code: string;
  };
  table?: {
    headers: string[];
    rows: string[][];
  };
  notes?: string[];
}

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
  detailedGuides?: DetailedGuide[];
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
      "Zero-Downtime Blue/Green Deployments: Every redeployment launches side-by-side (`app-${slug}-${shortId}`). The existing container continues serving live traffic until the new container passes deep HTTP readiness checks.",
      "Origin & CSRF Match: Whizan's Edge Router and Live Gateway automatically forward the canonical public hostname (`x-forwarded-host: <slug>.whizan.cloud`), ensuring Next.js Server Actions and framework CSRF origin checks pass seamlessly.",
      "For Next.js App Router applications with dynamic routes, ensure your project uses standard Next.js standalone server mode without static export restrictions.",
      "Store client-accessible environment variables with standard framework prefixes (e.g. NEXT_PUBLIC_ or VITE_).",
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
      "Autonomous AI coding agents in Cursor, Windsurf, Claude Code, or Antigravity that inspect, build, and deploy code",
      "Tailing real-time build logs, checking container health, and running diagnostic commands",
      "Retrieving live container application logs (`whizan_get_application_logs`) to debug runtime crashes and uncaught exceptions",
      "Provisioning Cloud Object Storage buckets and generating scoped access keys (`whizan_storage_create_api_key`)"
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
        "WHIZAN_API_URL": "https://api.whizan.cloud",
        "WHIZAN_API_KEY": "whz_live_YOUR_API_KEY_HERE"
      }
    }
  }
}`
    },
    configOptions: [
      { key: "WHIZAN_API_URL", desc: "API control plane URL", defaultVal: "https://api.whizan.cloud" },
      { key: "WHIZAN_API_KEY", desc: "Personal or team API authentication key", defaultVal: "Required for MCP" },
      { key: "Global CLI Binary", desc: "Command line executable installed globally via npm", defaultVal: "@whizan/cli" }
    ],
    proTips: [
      "Run 'whizan status' from any directory with a .whizan.json file to inspect live deployment health.",
      "With the DevOps MCP configured in Cursor or VS Code, prompt your AI assistant to 'deploy this project' and it will autonomously analyze your stack, synthesize settings, and trigger deployment.",
      "Debug runtime exceptions instantly: Call 'whizan_get_application_logs' to retrieve stdout/stderr directly from active or recently exited containers.",
      "Autonomous Storage Workflow: Agents can call 'whizan_storage_create_api_key' to generate dedicated 'whz_stg_live_...' keys and wire them into WHIZAN_STORAGE_KEY."
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
        "Base URL: 'https://api.whizan.cloud'."
      ],
      cliCommand: "curl -H 'Authorization: Bearer whz_live_...' https://api.whizan.cloud/api/services",
      mcpPrompt: "Query the Whizan API to list all active services"
    },
    sampleCode: {
      filename: "fetch-services.js",
      language: "javascript",
      code: `const API_URL = "https://api.whizan.cloud";
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
  },
  storage: {
    slug: "storage",
    title: "Cloud Object Storage",
    category: "Storage & Persistence",
    tagline: "High-throughput, S3-compatible object storage powered by global edge CDN distribution with Supabase client parity and on-the-fly image transformations.",
    icon: HardDrive,
    accentColor: "amber",
    whenToUse: [
      "Media asset hosting: product images, banners, logos, audio tracks, and videos",
      "User-generated content: avatars, profile pictures, identity verification documents, and attachments",
      "Transactional documents: PDF invoices, payroll receipts, tax statements, and export reports",
      "Public assets requiring ultra-low latency (<10ms) edge CDN caching with zero egress bandwidth charges",
      "Private assets requiring time-limited signed URLs (e.g., 5-minute temporary download tokens)",
      "Dynamic image optimization: resizing, WebP/AVIF format transcoding, quality adjustments, and cropping directly from URL parameters",
      "Direct AWS S3 SDK, MinIO, or Cyberduck integrations via the built-in S3 Gateway protocol"
    ],
    whenNotToUse: [
      "High-throughput in-memory caching or pub/sub message brokers (use Managed Redis instead)",
      "Relational structured business tables with foreign keys and ACID transactions (use Managed PostgreSQL instead)",
      "Temporary ephemeral build scratch files inside running backend containers (use local container disk)"
    ],
    supportedTech: [
      "@whizan/storage-js",
      "Whizan CLI (whizan storage)",
      "@whizan/mcp-devops",
      "@aws-sdk/client-s3",
      "REST Presigned URLs",
      "Cloudflare R2 Gateway"
    ],
    howToUse: {
      dashboardSteps: [
        "Open your Whizan Cloud Console and navigate to 'Cloud Storage' in the sidebar.",
        "Click '+ Create Bucket', enter a unique bucket name (e.g. 'user-assets'), and choose Public (direct CDN access) or Private (signed download links).",
        "Navigate to the 'Developer API' tab and click '+ Create Storage Key' to generate a dedicated scoped key (whz_stg_live_...).",
        "Pass hardware biometric verification (Touch ID / Face ID) or Email OTP to securely reveal and copy your key.",
        "Install @whizan/storage-js in your project and initialize the client to start uploading and downloading files."
      ],
      cliCommand: "whizan storage bucket create user-assets && whizan storage upload ./avatar.png user-assets/avatars/user-1.png",
      mcpPrompt: "Check my Whizan storage quota, create a bucket named 'user-assets', and upload avatar.png"
    },
    sampleCode: {
      filename: "whizan-storage-quickstart.ts",
      language: "typescript",
      code: `import { createClient } from "@whizan/storage-js";

// Initialize Whizan Storage Client
const storage = createClient(
  "https://api.whizan.cloud",
  process.env.WHIZAN_STORAGE_KEY! // whz_stg_live_...
);

// 1. Upload a file buffer or stream
const fileBuffer = Buffer.from("Hello Whizan Cloud Storage!");
const { data: uploadData, error: uploadErr } = await storage
  .from("user-assets")
  .upload("documents/welcome.txt", fileBuffer, {
    contentType: "text/plain",
    cacheControl: "public, max-age=86400, immutable",
    metadata: { author: "Whizan Dev", version: "1.0" },
  });

if (uploadErr) {
  console.error("Upload error:", uploadErr.message);
} else {
  console.log("Uploaded successfully:", uploadData.path, \`(\${uploadData.size} bytes)\`);
}

// 2. Download a file as a Blob or Buffer
const { data: blob, error: dlErr } = await storage
  .from("user-assets")
  .download("documents/welcome.txt");

if (blob) {
  const content = await blob.text();
  console.log("File content:", content);
}

// 3. Generate a time-limited Presigned URL for private downloads
const { data: presign } = await storage
  .from("user-assets")
  .createSignedUrl("documents/welcome.txt", 3600); // 1 hour TTL

console.log("Signed Download URL:", presign?.signedUrl);

// 4. Generate optimized public CDN URL with edge image resizing
const { data: cdnUrl } = storage.from("public-media").getPublicUrl("banner.png", {
  width: 800,
  height: 600,
  format: "webp",
  quality: 85,
  resize: "cover",
});

console.log("Optimized WebP CDN URL:", cdnUrl.publicUrl);

// 5. Inspect quota allocation and committed usage
const { data: usage } = await storage.getUsage();
console.log(\`Quota: \${usage.quota.usedMb} MB / \${usage.quota.allocatedMb} MB (\${usage.quota.usagePercent}% used)\`);`
    },
    detailedGuides: [
      {
        id: "sdk-guide",
        title: "JavaScript / TypeScript SDK",
        badge: "@whizan/storage-js",
        description: "The official zero-dependency client with Supabase API parity. Works seamlessly across Node.js, Next.js, Cloudflare Workers, Deno, Bun, and browser environments.",
        codeSnippet: {
          filename: "sdk-operations.ts",
          language: "typescript",
          code: `import { createClient } from "@whizan/storage-js";

const storage = createClient("https://api.whizan.cloud", process.env.WHIZAN_STORAGE_KEY!);

// ── File Operations ──
// Upload with upsert & metadata
await storage.from("invoices").upload("2026/january.pdf", pdfBuffer, {
  contentType: "application/pdf",
  cacheControl: "public, max-age=31536000, immutable",
  upsert: true,
  metadata: { invoiceId: "INV-2026-001", customerId: "cust_9812" }
});

// List files with pagination & sorting
const { data: files } = await storage.from("invoices").list("2026/", {
  limit: 20,
  sortBy: "createdAt",
  sortOrder: "desc"
});

// Atomic Move / Rename
await storage.from("invoices").move("2026/january.pdf", "archive/2026/january.pdf");

// Copy file
await storage.from("invoices").copy("archive/2026/january.pdf", "backup/january.pdf");

// Bulk Delete
await storage.from("invoices").remove(["backup/january.pdf", "temp/test.txt"]);

// Update metadata without re-uploading bytes
await storage.from("invoices").updateMetadata("archive/2026/january.pdf", {
  cacheControl: "public, max-age=31536000, immutable",
  metadata: { archivedAt: new Date().toISOString() }
});

// ── Bucket Operations ──
// List all buckets
const { data: buckets } = await storage.listBuckets();

// Create new bucket (Public or Private)
await storage.createBucket("avatars", {
  public: true,
  fileSizeLimit: 10 * 1024 * 1024, // 10 MB max
  allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"]
});`
        },
        table: {
          headers: ["Method", "Signature", "Description"],
          rows: [
            ["upload()", "upload(path, file, options?)", "Uploads Buffer/Blob/Stream with atomic quota reservation"],
            ["download()", "download(path)", "Downloads file and returns a standard Web Blob"],
            ["list()", "list(prefix?, options?)", "Lists and paginates objects with sorting by size, name, or date"],
            ["move()", "move(fromPath, toPath, destBucket?)", "Atomically moves or renames an object"],
            ["copy()", "copy(srcPath, destPath, destBucket?)", "Duplicates an object within or across buckets"],
            ["remove()", "remove(paths[])", "Deletes one or multiple objects in a single batch call"],
            ["getMetadata()", "getMetadata(path)", "Fetches object headers, MIME, and custom JSON metadata"],
            ["updateMetadata()", "updateMetadata(path, meta)", "Updates Cache-Control and custom metadata in-place"],
            ["createSignedUrl()", "createSignedUrl(path, ttl, opts?)", "Generates time-limited presigned URL for private downloads"],
            ["getPublicUrl()", "getPublicUrl(path, transform?)", "Generates instant CDN URL with optional image resizing"]
          ]
        },
        notes: [
          "Zero dependencies: Runs anywhere fetch and FormData are supported.",
          "Atomic Quota Lock: Upload URLs reserve bytes for 15 minutes; if an upload fails or aborts, quota is automatically released."
        ]
      },
      {
        id: "cli-guide",
        title: "Terminal CLI Operations",
        badge: "whizan storage",
        description: "Manage buckets, upload datasets, inspect committed storage, and generate presigned URLs directly from your terminal or CI/CD pipelines.",
        codeSnippet: {
          filename: "terminal-commands.sh",
          language: "bash",
          code: `# Inspect storage quota, committed bytes & object counts
whizan storage usage

# View plan limits, rate limits & max upload size
whizan storage limits

# List all buckets
whizan storage bucket ls

# Create a new public or private bucket
whizan storage bucket create user-uploads --public --desc "User avatars and media"

# Delete a bucket (add --force to remove non-empty buckets)
whizan storage bucket rm user-uploads --force

# List objects inside a bucket or folder prefix
whizan storage ls user-uploads avatars/

# Upload a local file to storage
whizan storage upload ./banner.jpg user-uploads/banners/hero.jpg

# Download an object to local disk
whizan storage download user-uploads/banners/hero.jpg ./downloaded_hero.jpg

# Copy or move objects between paths
whizan storage cp user-uploads/banners/hero.jpg user-uploads/backup/hero.jpg
whizan storage mv user-uploads/banners/hero.jpg user-uploads/published/hero.jpg

# Bulk delete objects by prefix
whizan storage bulk-rm user-uploads temp/

# Generate time-limited presigned download URL
whizan storage presign user-uploads/published/hero.jpg --ttl 7200`
        },
        table: {
          headers: ["CLI Command", "Arguments", "Action Performed"],
          rows: [
            ["whizan storage usage", "None", "Displays total 250 MB quota, used bytes, in-flight reservations, and object count"],
            ["whizan storage limits", "None", "Displays tier rate limits, daily command quota, and max file upload size"],
            ["whizan storage bucket ls", "None", "Lists all buckets, file counts, and total byte footprint"],
            ["whizan storage bucket create", "<name> [--public]", "Provisions a new bucket in Cloudflare R2 infrastructure"],
            ["whizan storage bucket rm", "<name> [--force]", "Deletes bucket (requires empty bucket unless --force is supplied)"],
            ["whizan storage ls", "<bucket> [prefix]", "Lists objects matching folder prefix"],
            ["whizan storage upload", "<local-path> <bkt>/<path>", "Streams local file to storage with progress spinner"],
            ["whizan storage download", "<bkt>/<path> <out-path>", "Downloads object and writes to local disk"],
            ["whizan storage cp", "<src> <dest>", "Duplicates object across paths or buckets"],
            ["whizan storage mv", "<src> <dest>", "Atomically renames or moves object"],
            ["whizan storage presign", "<bkt>/<path> [--ttl sec]", "Generates HTTPS presigned download link"]
          ]
        }
      },
      {
        id: "s3-gateway",
        title: "S3 Gateway & Multi-Language SDKs",
        badge: "S3 Protocol Compatible",
        description: "Connect standard S3 tools including AWS SDK (JavaScript, Python Boto3, Go, Java), MinIO Client, or Cyberduck using your Whizan Storage API keys.",
        codeSnippet: {
          filename: "s3-client-integration.ts",
          language: "typescript",
          code: `// ── TypeScript / JavaScript (AWS SDK v3) ──
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: "https://api.whizan.cloud/storage/v1/s3",
  region: "auto",
  credentials: {
    accessKeyId: process.env.WHIZAN_STORAGE_KEY!,     // whz_stg_live_...
    secretAccessKey: process.env.WHIZAN_STORAGE_KEY!, // Same key used for secret
  },
});

// Upload via S3 SDK
await s3.send(new PutObjectCommand({
  Bucket: "my-bucket",
  Key: "reports/q1.pdf",
  Body: fileBuffer,
  ContentType: "application/pdf"
}));

// ── Python (Boto3) ──
# import boto3
# s3 = boto3.client(
#     's3',
#     endpoint_url='https://api.whizan.cloud/storage/v1/s3',
#     aws_access_key_id=os.environ['WHIZAN_STORAGE_KEY'],
#     aws_secret_access_key=os.environ['WHIZAN_STORAGE_KEY'],
#     region_name='auto'
# )
# s3.upload_file('report.pdf', 'my-bucket', 'reports/q1.pdf')`
        },
        table: {
          headers: ["Configuration Field", "Setting Value", "Notes"],
          rows: [
            ["Endpoint", "https://api.whizan.cloud/storage/v1/s3", "S3-compatible routing gateway"],
            ["Region", "auto (or us-east-1)", "Global edge routed automatically"],
            ["Access Key ID", "whz_stg_live_...", "Your dedicated Storage API key"],
            ["Secret Access Key", "whz_stg_live_...", "Use the same Storage API key"],
            ["Signature Version", "AWS4-HMAC-SHA256 (v4)", "Standard AWS signing protocol"]
          ]
        },
        notes: [
          "Seamless migration: No need to rewrite existing S3 upload pipelines — just update the endpoint and credentials."
        ]
      },
      {
        id: "image-transforms",
        title: "Edge Dynamic Image Optimization",
        badge: "Built-in CDN Optimization",
        description: "Transform and optimize images on the fly at Cloudflare edge nodes without installing Sharp or ImageMagick on your servers.",
        codeSnippet: {
          filename: "image-transform-urls.txt",
          language: "bash",
          code: `# Standard Public CDN URL
https://api.whizan.cloud/public/media/avatars/user-123.jpg

# Dynamic WebP Transcoding with Resize & Quality
https://api.whizan.cloud/api/storage/v1/render/image/public/media/avatars/user-123.jpg?width=400&height=400&format=webp&quality=85&resize=cover

# Generating optimized URLs via the SDK:
const { data } = storage.from("media").getPublicUrl("avatars/user-123.jpg", {
  width: 400,
  height: 400,
  format: "webp",
  quality: 85,
  resize: "cover", // 'cover' | 'contain' | 'fill' | 'inside' | 'outside'
});

console.log(data.publicUrl);`
        },
        table: {
          headers: ["Query Parameter", "Allowed Values", "Example", "Description"],
          rows: [
            ["width", "1 to 4096 (integer)", "width=800", "Target width in pixels"],
            ["height", "1 to 4096 (integer)", "height=600", "Target height in pixels"],
            ["format", "webp, avif, png, jpeg", "format=webp", "Converts source image format at edge"],
            ["quality", "1 to 100 (integer)", "quality=85", "Compression quality (80-85 recommended)"],
            ["resize", "cover, contain, fill, inside, outside", "resize=cover", "Aspect ratio fit and crop strategy"]
          ]
        },
        notes: [
          "Edge Cached: Transformed images are automatically cached across Cloudflare edge CDN nodes with sub-10ms subsequent delivery."
        ]
      },
      {
        id: "security-2fa",
        title: "Dedicated Storage Keys & 2FA Biometric Protection",
        badge: "Zero-Trust Architecture",
        description: "Enterprise security protocol separating storage credentials from master account administrative tokens.",
        codeSnippet: {
          filename: "security-protocol.txt",
          language: "bash",
          code: `# Storage API Key Format
whz_stg_live_a83bca0e838eb59f43bca3b142d0035ee914ddb3be6e03eb

# Security Enforcement:
# 1. Scoped strictly to storage bucket routes (/api/storage/v1/* and /storage/v1/s3).
# 2. Blocked from modifying compute services, databases, or project deployments.
# 3. Encrypted at rest in PostgreSQL using AES-256-GCM.
# 4. In the Web Console, key retrieval requires Hardware WebAuthn Biometrics
#    (Apple Touch ID / Face ID / Windows Hello) or Email OTP verification.
# 5. Revealed keys automatically mask after a 60-second countdown.`
        },
        table: {
          headers: ["Key Type", "Prefix", "Allowed Operations", "Review Protocol"],
          rows: [
            ["Dedicated Storage Key", "whz_stg_live_...", "Bucket CRUD, object upload/download/delete, presigning, S3 gateway", "Biometrics (WebAuthn) or Email OTP"],
            ["Master API Key", "whz_live_...", "Full control plane: deployments, services, databases, crons, flows", "Password / Session Auth"]
          ]
        },
        notes: [
          "Rotate Keys Instantly: Delete compromised keys from the Console in one click without affecting your Whizan Cloud master account."
        ]
      }
    ],
    configOptions: [
      { key: "Base Quota Allocation", desc: "Committed storage capacity allocated to account tier", defaultVal: "250 MB (Hobby Starter)" },
      { key: "Max Single File Size", desc: "Maximum byte length allowed per single file upload", defaultVal: "50 MB" },
      { key: "Bucket Visibility", desc: "PUBLIC (direct edge CDN URLs) or PRIVATE (signed download URLs required)", defaultVal: "PRIVATE (default)" },
      { key: "Dynamic Image Transforms", desc: "On-the-fly edge Sharp image transcoding and resizing", defaultVal: "Enabled (Sub-10ms CDN cached)" },
      { key: "Presigned URL TTL", desc: "Default and maximum expiration lifetime for signed download URLs", defaultVal: "3600s (configurable up to 86400s)" },
      { key: "Soft-Delete Trash Retention", desc: "Soft-deleted objects remain recoverable before permanent purge", defaultVal: "30 Days" },
      { key: "S3 API Gateway", desc: "S3 protocol endpoint for AWS SDK, MinIO, and Cyberduck", defaultVal: "https://api.whizan.cloud/storage/v1/s3" },
      { key: "Atomic Quota Reservation", desc: "In-flight byte reservation expiration window for unconfirmed uploads", defaultVal: "15 Minutes" }
    ],
    proTips: [
      "Always use dedicated 'whz_stg_live_...' API keys for client and server storage integrations. They are scoped strictly to storage and protected by 2FA / Biometric review in the Console.",
      "For static media like banners and logos, always set 'Cache-Control: public, max-age=31536000, immutable' to enable 100% edge CDN cache hit ratios.",
      "Atomic Quota Lock: In-flight upload URLs reserve quota immediately. If a network drops or client disconnects, quota automatically unlocks after 15 minutes.",
      "Use 'storage.getS3Config()' to connect the official AWS S3 SDK (@aws-sdk/client-s3) with zero boilerplate.",
      "Leverage URL image optimization (?width=400&format=webp) to serve next-gen image formats automatically to mobile devices."
    ]
  }
};

const ALL_SLUGS = [
  { slug: "frontend", title: "Frontend Hosting", icon: Globe },
  { slug: "backend", title: "Backend Services", icon: Server },
  { slug: "functions", title: "Edge Functions", icon: Zap },
  { slug: "databases", title: "Managed Databases", icon: Database },
  { slug: "storage", title: "Cloud Object Storage", icon: HardDrive },
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
  else if (rawSlug === "storage" || rawSlug === "buckets" || rawSlug === "object-storage" || rawSlug === "s3" || rawSlug === "cloud-storage") targetSlug = "storage";
  else if (rawSlug === "schedules" || rawSlug === "cron-jobs" || rawSlug === "cron") targetSlug = "cron";
  else if (rawSlug === "flows" || rawSlug === "pipelines" || rawSlug === "flow") targetSlug = "flow";
  else if (rawSlug === "mcp" || rawSlug === "tooling" || rawSlug === "cli") targetSlug = "cli";
  else if (rawSlug === "rest-api" || rawSlug === "api") targetSlug = "api";

  const doc = DOCS_DATA[targetSlug] || DOCS_DATA.frontend;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeGuideTab, setActiveGuideTab] = useState(0);

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
            <ThemeToggle variant="icon" />
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

          {/* ── 4. Detailed Operational Guides & Integration Patterns ──── */}
          {doc.detailedGuides && doc.detailedGuides.length > 0 && (
            <section className="article-section">
              <h2 className="section-title">In-Depth Integration Guides & API Methods</h2>
              <div className="guides-wrapper">
                {/* Guide Tabs Header */}
                <div className="guides-tab-bar">
                  {doc.detailedGuides.map((guide, idx) => (
                    <button
                      key={guide.id}
                      onClick={() => setActiveGuideTab(idx)}
                      className={`guide-tab-btn ${activeGuideTab === idx ? "guide-tab-btn-active" : ""}`}
                    >
                      <span>{guide.title}</span>
                      {guide.badge && <span className="guide-tab-badge">{guide.badge}</span>}
                    </button>
                  ))}
                </div>

                {/* Selected Guide Body */}
                {(() => {
                  const currentGuide = doc.detailedGuides[activeGuideTab] || doc.detailedGuides[0];
                  return (
                    <div className="guide-body-card">
                      <p className="guide-desc-text">{currentGuide.description}</p>

                      {currentGuide.codeSnippet && (
                        <div className="example-code-wrapper mb-4">
                          <div className="example-code-header">
                            <span className="filename-text font-mono">{currentGuide.codeSnippet.filename}</span>
                            <button
                              onClick={() => copyCode(currentGuide.codeSnippet!.code, `guide-code-${activeGuideTab}`)}
                              className="copy-snippet-btn"
                            >
                              {copiedKey === `guide-code-${activeGuideTab}` ? (
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
                            <code>{currentGuide.codeSnippet.code}</code>
                          </pre>
                        </div>
                      )}

                      {currentGuide.table && (
                        <div className="config-table-card mb-4">
                          <table className="config-table">
                            <thead>
                              <tr>
                                {currentGuide.table.headers.map((h, i) => (
                                  <th key={i}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {currentGuide.table.rows.map((row, rIdx) => (
                                <tr key={rIdx}>
                                  {row.map((cell, cIdx) => (
                                    <td
                                      key={cIdx}
                                      className={
                                        cIdx === 0
                                          ? "font-semibold text-slate-900 font-mono text-xs"
                                          : cIdx === 1 && currentGuide.id === "sdk-guide"
                                          ? "font-mono text-xs text-indigo-700 bg-indigo-50/40"
                                          : "text-slate-600 text-xs"
                                      }
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {currentGuide.notes && currentGuide.notes.length > 0 && (
                        <div className="guide-notes-box">
                          {currentGuide.notes.map((note, nIdx) => (
                            <div key={nIdx} className="guide-note-line">
                              <span className="bullet-dot bg-amber-500" />
                              <span>{note}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </section>
          )}

          {/* ── 5. Configuration Reference Table ──────────────────────── */}
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

        /* Guides Tabs & Content */
        .guides-wrapper {
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          background: #ffffff;
        }
        .guides-tab-bar {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          background: #f8fafc;
          border-bottom: 1px solid var(--border);
          padding: 0.35rem 0.5rem;
          overflow-x: auto;
        }
        .guide-tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.85rem;
          font-size: 0.8rem;
          font-weight: 600;
          color: #475569;
          border-radius: 6px;
          background: transparent;
          border: none;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.12s ease;
        }
        .guide-tab-btn:hover {
          color: #0f172a;
          background: #edf2f7;
        }
        .guide-tab-btn-active {
          color: #4f46e5;
          background: #ffffff;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        .guide-tab-badge {
          font-size: 0.68rem;
          font-weight: 700;
          padding: 0.1rem 0.35rem;
          border-radius: 4px;
          background: #eef2ff;
          color: #4f46e5;
        }
        .guide-body-card {
          padding: 1.25rem 1.35rem;
        }
        .guide-desc-text {
          font-size: 0.85rem;
          color: #475569;
          line-height: 1.55;
          margin-bottom: 1rem;
        }
        .guide-notes-box {
          background: #fffbeb;
          border: 1px solid #fef3c7;
          border-radius: 6px;
          padding: 0.75rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .guide-note-line {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          font-size: 0.8rem;
          color: #92400e;
          line-height: 1.45;
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
