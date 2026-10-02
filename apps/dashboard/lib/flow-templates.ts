export interface FlowNodeTypeDef {
  type: string;
  category: "Trigger" | "Build & Deploy" | "Verification & Testing" | "Operations & Routing" | "Logic & Control";
  label: string;
  description: string;
  badge: string;
  color: string;
  bgGlow: string;
  defaultConfig: Record<string, any>;
}

export const FLOW_NODE_TYPES: Record<string, FlowNodeTypeDef> = {
  // Triggers
  TRIGGER_MANUAL: {
    type: "TRIGGER_MANUAL",
    category: "Trigger",
    label: "Manual Trigger",
    description: "Start workflow on-demand via Console or REST API trigger",
    badge: "TRIGGER",
    color: "#818cf8",
    bgGlow: "rgba(129, 140, 248, 0.15)",
    defaultConfig: {},
  },
  TRIGGER_GIT: {
    type: "TRIGGER_GIT",
    category: "Trigger",
    label: "Git Push Trigger",
    description: "Fires automatically when code is pushed to branch",
    badge: "WEBHOOK",
    color: "#a855f7",
    bgGlow: "rgba(168, 85, 247, 0.15)",
    defaultConfig: { branch: "main", repo: "" },
  },
  TRIGGER_WEBHOOK: {
    type: "TRIGGER_WEBHOOK",
    category: "Trigger",
    label: "Webhook Event",
    description: "External HTTP webhook triggers execution",
    badge: "HTTP",
    color: "#c084fc",
    bgGlow: "rgba(192, 132, 252, 0.15)",
    defaultConfig: { secretToken: "" },
  },
  TRIGGER_CRON: {
    type: "TRIGGER_CRON",
    category: "Trigger",
    label: "Scheduled Cron",
    description: "Fires periodically on scheduled cron interval",
    badge: "CRON",
    color: "#6366f1",
    bgGlow: "rgba(99, 102, 241, 0.15)",
    defaultConfig: { schedule: "0 * * * *" },
  },

  // Build & Deploy
  ACTION_WORKSPACE_ANALYZE: {
    type: "ACTION_WORKSPACE_ANALYZE",
    category: "Build & Deploy",
    label: "AI Workspace Analyzer",
    description: "Gemini 3.5 inspects repo manifests, ports, & entrypoints",
    badge: "AI AUDIT",
    color: "#38bdf8",
    bgGlow: "rgba(56, 189, 248, 0.15)",
    defaultConfig: { workspacePath: "." },
  },
  ACTION_BUILD_CONTAINER: {
    type: "ACTION_BUILD_CONTAINER",
    category: "Build & Deploy",
    label: "Container Build",
    description: "Builds Docker image or compiled bundle with layer caching",
    badge: "DOCKER",
    color: "#06b6d4",
    bgGlow: "rgba(6, 182, 212, 0.15)",
    defaultConfig: { dockerfilePath: "./Dockerfile", tag: "latest" },
  },
  ACTION_DEPLOY_EDGE: {
    type: "ACTION_DEPLOY_EDGE",
    category: "Build & Deploy",
    label: "Deploy Edge App",
    description: "Registers static or SSR bundle to Whizan Edge Router",
    badge: "EDGE CDN",
    color: "#10b981",
    bgGlow: "rgba(16, 185, 129, 0.15)",
    defaultConfig: { slug: "", outputDir: "dist" },
  },
  ACTION_DEPLOY_SERVICE: {
    type: "ACTION_DEPLOY_SERVICE",
    category: "Build & Deploy",
    label: "Deploy Backend Service",
    description: "Spawns container in private mesh with health checks",
    badge: "MESH",
    color: "#14b8a6",
    bgGlow: "rgba(20, 184, 166, 0.15)",
    defaultConfig: { slug: "", port: 8000 },
  },

  // Verification & Testing
  ACTION_RUN_TESTS: {
    type: "ACTION_RUN_TESTS",
    category: "Verification & Testing",
    label: "Run Test Suite",
    description: "Executes test runner (npm test, pytest) and verifies exit code",
    badge: "CI TEST",
    color: "#f59e0b",
    bgGlow: "rgba(245, 158, 11, 0.15)",
    defaultConfig: { command: "npm test", timeoutSeconds: 300 },
  },
  ACTION_HEALTH_PROBE: {
    type: "ACTION_HEALTH_PROBE",
    category: "Verification & Testing",
    label: "Canary Health Probe",
    description: "Probes HTTP endpoint, verifies status code & latency",
    badge: "CANARY",
    color: "#22c55e",
    bgGlow: "rgba(34, 197, 94, 0.15)",
    defaultConfig: { url: "http://127.0.0.1:3000/health", expectedStatus: 200, retries: 3 },
  },

  // Operations & Routing
  ACTION_ROUTER_CUTOVER: {
    type: "ACTION_ROUTER_CUTOVER",
    category: "Operations & Routing",
    label: "Atomic Router Cutover",
    description: "Switches live edge traffic to new deployment with zero drops",
    badge: "CUTOVER",
    color: "#8b5cf6",
    bgGlow: "rgba(139, 92, 246, 0.15)",
    defaultConfig: { slug: "", reloadEdge: true },
  },
  ACTION_AUTO_ROLLBACK: {
    type: "ACTION_AUTO_ROLLBACK",
    category: "Operations & Routing",
    label: "Automated Rollback",
    description: "Instantly reverts router mapping to previous stable deployment",
    badge: "ROLLBACK",
    color: "#f43f5e",
    bgGlow: "rgba(244, 63, 94, 0.15)",
    defaultConfig: { slug: "", alertOnFailure: true },
  },
  ACTION_CONTAINER_EXEC: {
    type: "ACTION_CONTAINER_EXEC",
    category: "Operations & Routing",
    label: "Container Exec Command",
    description: "Runs CLI command inside running container (migrations, seeds)",
    badge: "EXEC",
    color: "#0284c7",
    bgGlow: "rgba(2, 132, 199, 0.15)",
    defaultConfig: { command: "npx prisma migrate deploy", containerId: "" },
  },
  ACTION_DATABASE_QUERY: {
    type: "ACTION_DATABASE_QUERY",
    category: "Operations & Routing",
    label: "Database Query / Seed",
    description: "Runs safe SQL query against provisioned database",
    badge: "SQL",
    color: "#ea580c",
    bgGlow: "rgba(234, 88, 12, 0.15)",
    defaultConfig: { query: "SELECT 1;", databaseId: "" },
  },
  ACTION_AI_PROMPT: {
    type: "ACTION_AI_PROMPT",
    category: "Operations & Routing",
    label: "Gemini 3.5 AI Release Notes",
    description: "Summarizes git commits & deployment diff into markdown release notes",
    badge: "GEMINI 3.5",
    color: "#ec4899",
    bgGlow: "rgba(236, 72, 153, 0.15)",
    defaultConfig: { prompt: "Generate production release notes for this build.", model: "gemini-3.5-flash-lite" },
  },
  ACTION_HTTP_REQUEST: {
    type: "ACTION_HTTP_REQUEST",
    category: "Operations & Routing",
    label: "HTTP Webhook / Alert",
    description: "Dispatches HTTP request (Slack, Discord, PagerDuty, Datadog)",
    badge: "NOTIFY",
    color: "#3b82f6",
    bgGlow: "rgba(59, 130, 246, 0.15)",
    defaultConfig: { method: "POST", url: "https://hooks.slack.com/services/...", body: { text: "Workflow completed!" } },
  },

  // Logic & Control
  CONTROL_APPROVAL: {
    type: "CONTROL_APPROVAL",
    category: "Logic & Control",
    label: "Human Approval Gate",
    description: "Suspends pipeline in WAITING_FOR_APPROVAL until authorized",
    badge: "APPROVAL",
    color: "#eab308",
    bgGlow: "rgba(234, 179, 8, 0.15)",
    defaultConfig: { message: "Approve deployment to production cutover?", timeoutMinutes: 60 },
  },
  CONTROL_BRANCH: {
    type: "CONTROL_BRANCH",
    category: "Logic & Control",
    label: "Conditional Branch",
    description: "Evaluates condition expression (e.g. status === 'SUCCESS')",
    badge: "BRANCH",
    color: "#64748b",
    bgGlow: "rgba(100, 116, 139, 0.15)",
    defaultConfig: { condition: "steps.health_check.output.statusCode === 200" },
  },
  CONTROL_DELAY: {
    type: "CONTROL_DELAY",
    category: "Logic & Control",
    label: "Time Delay",
    description: "Pauses execution for specified seconds before proceeding",
    badge: "DELAY",
    color: "#94a3b8",
    bgGlow: "rgba(148, 163, 184, 0.15)",
    defaultConfig: { delaySeconds: 10 },
  },
};

export interface FlowTemplateDef {
  id: string;
  name: string;
  slug: string;
  category: "BUILD_DEPLOY" | "CI_CD" | "EDGE_OPS" | "SECURITY" | "CRON_MAINTENANCE";
  description: string;
  concurrencyPolicy: "FORBID" | "QUEUE" | "ALLOW" | "REPLACE";
  timeoutSeconds: number;
  badge: string;
  gradient: string;
  nodes: Array<{
    nodeKey: string;
    name: string;
    type: string;
    config: Record<string, any>;
    positionX: number;
    positionY: number;
    timeoutSeconds?: number;
    maxRetries?: number;
  }>;
  edges: Array<{
    sourceNodeKey: string;
    targetNodeKey: string;
    condition?: string;
  }>;
}

export const PRESET_FLOW_TEMPLATES: FlowTemplateDef[] = [
  {
    id: "nextjs-edge-canary",
    name: "Zero-Downtime Next.js Edge Cutover",
    slug: "nextjs-edge-canary",
    category: "BUILD_DEPLOY",
    badge: "PRODUCTION",
    gradient: "linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)",
    description: "Automated analysis, standalone build, canary health verification, atomic Edge Router cutover, and Slack notification.",
    concurrencyPolicy: "QUEUE",
    timeoutSeconds: 900,
    nodes: [
      {
        nodeKey: "trigger_git",
        name: "Git Push on Main",
        type: "TRIGGER_GIT",
        config: { branch: "main" },
        positionX: 80,
        positionY: 200,
      },
      {
        nodeKey: "analyze_repo",
        name: "AI Workspace Audit",
        type: "ACTION_WORKSPACE_ANALYZE",
        config: { workspacePath: "." },
        positionX: 340,
        positionY: 200,
      },
      {
        nodeKey: "build_app",
        name: "Build Next.js Bundle",
        type: "ACTION_BUILD_CONTAINER",
        config: { dockerfilePath: "./Dockerfile", tag: "release" },
        positionX: 600,
        positionY: 200,
      },
      {
        nodeKey: "canary_probe",
        name: "Canary Health Probe",
        type: "ACTION_HEALTH_PROBE",
        config: { url: "http://127.0.0.1:3000/health", expectedStatus: 200, retries: 3 },
        positionX: 860,
        positionY: 200,
      },
      {
        nodeKey: "edge_cutover",
        name: "Atomic Edge Cutover",
        type: "ACTION_ROUTER_CUTOVER",
        config: { reloadEdge: true },
        positionX: 1120,
        positionY: 200,
      },
      {
        nodeKey: "notify_slack",
        name: "Broadcast Slack Alert",
        type: "ACTION_HTTP_REQUEST",
        config: { method: "POST", url: "https://hooks.slack.com/services/whizan", body: { text: "🚀 Next.js app deployed with 0 downtime!" } },
        positionX: 1380,
        positionY: 200,
      },
    ],
    edges: [
      { sourceNodeKey: "trigger_git", targetNodeKey: "analyze_repo" },
      { sourceNodeKey: "analyze_repo", targetNodeKey: "build_app" },
      { sourceNodeKey: "build_app", targetNodeKey: "canary_probe" },
      { sourceNodeKey: "canary_probe", targetNodeKey: "edge_cutover", condition: "success" },
      { sourceNodeKey: "edge_cutover", targetNodeKey: "notify_slack" },
    ],
  },
  {
    id: "microservice-auto-rollback",
    name: "Docker Microservice + Auto-Rollback Protection",
    slug: "microservice-auto-rollback",
    category: "EDGE_OPS",
    badge: "SELF-HEALING",
    gradient: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
    description: "Deploys container into private Docker network mesh with health checks; immediately rolls back to previous revision if canary returns 5xx.",
    concurrencyPolicy: "FORBID",
    timeoutSeconds: 600,
    nodes: [
      {
        nodeKey: "manual_trigger",
        name: "Deploy Trigger",
        type: "TRIGGER_MANUAL",
        config: {},
        positionX: 80,
        positionY: 220,
      },
      {
        nodeKey: "build_image",
        name: "Docker Image Build",
        type: "ACTION_BUILD_CONTAINER",
        config: { dockerfilePath: "./Dockerfile" },
        positionX: 340,
        positionY: 220,
      },
      {
        nodeKey: "deploy_service",
        name: "Deploy Service Mesh",
        type: "ACTION_DEPLOY_SERVICE",
        config: { port: 8080 },
        positionX: 600,
        positionY: 220,
      },
      {
        nodeKey: "health_check",
        name: "Canary Health Probe",
        type: "ACTION_HEALTH_PROBE",
        config: { url: "http://127.0.0.1:8080/health", expectedStatus: 200 },
        positionX: 860,
        positionY: 220,
      },
      {
        nodeKey: "cutover_prod",
        name: "Production Cutover",
        type: "ACTION_ROUTER_CUTOVER",
        config: { reloadEdge: true },
        positionX: 1140,
        positionY: 130,
      },
      {
        nodeKey: "rollback_service",
        name: "Emergency Rollback",
        type: "ACTION_AUTO_ROLLBACK",
        config: { alertOnFailure: true },
        positionX: 1140,
        positionY: 330,
      },
    ],
    edges: [
      { sourceNodeKey: "manual_trigger", targetNodeKey: "build_image" },
      { sourceNodeKey: "build_image", targetNodeKey: "deploy_service" },
      { sourceNodeKey: "deploy_service", targetNodeKey: "health_check" },
      { sourceNodeKey: "health_check", targetNodeKey: "cutover_prod", condition: "success" },
      { sourceNodeKey: "health_check", targetNodeKey: "rollback_service", condition: "failure" },
    ],
  },
  {
    id: "ci-cd-approval-gate",
    name: "Enterprise Canary with Human Approval Gate",
    slug: "ci-cd-approval-gate",
    category: "CI_CD",
    badge: "GOVERNANCE",
    gradient: "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)",
    description: "Runs CI unit tests, builds canary deployment, and halts at Human Approval Gate before final production router cutover.",
    concurrencyPolicy: "QUEUE",
    timeoutSeconds: 1800,
    nodes: [
      {
        nodeKey: "trigger_git",
        name: "GitHub PR / Push",
        type: "TRIGGER_GIT",
        config: { branch: "main" },
        positionX: 80,
        positionY: 220,
      },
      {
        nodeKey: "run_tests",
        name: "Execute Unit & E2E Tests",
        type: "ACTION_RUN_TESTS",
        config: { command: "npm test" },
        positionX: 340,
        positionY: 220,
      },
      {
        nodeKey: "build_canary",
        name: "Build Container Image",
        type: "ACTION_BUILD_CONTAINER",
        config: { dockerfilePath: "./Dockerfile" },
        positionX: 600,
        positionY: 220,
      },
      {
        nodeKey: "approval_gate",
        name: "Security Lead Sign-Off",
        type: "CONTROL_APPROVAL",
        config: { message: "Approve deployment to live production environment?", timeoutMinutes: 120 },
        positionX: 860,
        positionY: 220,
      },
      {
        nodeKey: "prod_cutover",
        name: "Live Router Cutover",
        type: "ACTION_ROUTER_CUTOVER",
        config: { reloadEdge: true },
        positionX: 1140,
        positionY: 220,
      },
    ],
    edges: [
      { sourceNodeKey: "trigger_git", targetNodeKey: "run_tests" },
      { sourceNodeKey: "run_tests", targetNodeKey: "build_canary" },
      { sourceNodeKey: "build_canary", targetNodeKey: "approval_gate" },
      { sourceNodeKey: "approval_gate", targetNodeKey: "prod_cutover", condition: "approved" },
    ],
  },
  {
    id: "ai-release-pipeline",
    name: "Polyglot Monorepo CI/CD + AI Release Notes",
    slug: "ai-release-pipeline",
    category: "BUILD_DEPLOY",
    badge: "AI POWERED",
    gradient: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
    description: "Comprehensive CI verification, Edge deployment, and automatic generation of changelog release notes via Gemini 3.5 Flash.",
    concurrencyPolicy: "ALLOW",
    timeoutSeconds: 1200,
    nodes: [
      {
        nodeKey: "trigger_manual",
        name: "Release Trigger",
        type: "TRIGGER_MANUAL",
        config: {},
        positionX: 80,
        positionY: 200,
      },
      {
        nodeKey: "run_tests",
        name: "Monorepo Test Suite",
        type: "ACTION_RUN_TESTS",
        config: { command: "npm run test" },
        positionX: 340,
        positionY: 200,
      },
      {
        nodeKey: "deploy_edge",
        name: "Deploy Edge Distribution",
        type: "ACTION_DEPLOY_EDGE",
        config: { outputDir: "dist" },
        positionX: 600,
        positionY: 200,
      },
      {
        nodeKey: "ai_notes",
        name: "Gemini 3.5 Release Notes",
        type: "ACTION_AI_PROMPT",
        config: { prompt: "Generate structured markdown changelog and release notes for this production deployment." },
        positionX: 860,
        positionY: 200,
      },
      {
        nodeKey: "publish_webhook",
        name: "Publish Release Webhook",
        type: "ACTION_HTTP_REQUEST",
        config: { method: "POST", url: "https://api.github.com/repos/owner/repo/releases", body: { name: "v1.0.0" } },
        positionX: 1120,
        positionY: 200,
      },
    ],
    edges: [
      { sourceNodeKey: "trigger_manual", targetNodeKey: "run_tests" },
      { sourceNodeKey: "run_tests", targetNodeKey: "deploy_edge" },
      { sourceNodeKey: "deploy_edge", targetNodeKey: "ai_notes" },
      { sourceNodeKey: "ai_notes", targetNodeKey: "publish_webhook" },
    ],
  },
];

/**
 * Generates clean, executable TypeScript DSL representation from nodes and edges.
 */
export function generateWorkflowDSL(workflow: {
  name: string;
  slug: string;
  category: string;
  concurrencyPolicy: string;
  nodes?: any[];
  edges?: any[];
}): string {
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];

  const nodesCode = nodes
    .map((n) => {
      return `    {
      key: "${n.nodeKey}",
      name: "${n.name}",
      type: "${n.type}",
      position: { x: ${n.positionX ?? 100}, y: ${n.positionY ?? 100} },
      config: ${JSON.stringify(n.config ?? {}, null, 8).trim()},
      timeoutSeconds: ${n.timeoutSeconds ?? 300},
      maxRetries: ${n.maxRetries ?? 0},
      continueOnError: ${Boolean(n.continueOnError)},
    }`;
    })
    .join(",\n");

  const edgesCode = edges
    .map((e) => {
      const cond = e.condition ? `, condition: "${e.condition}"` : "";
      return `    { from: "${e.sourceNodeKey}", to: "${e.targetNodeKey}"${cond} }`;
    })
    .join(",\n");

  return `// Whizan Flow Pipeline DSL (TypeScript)
// Auto-generated by Whizan Automation Engine v1.0.0

import { defineWorkflow } from "@whizan/flow-engine";

export default defineWorkflow({
  name: "${workflow.name}",
  slug: "${workflow.slug}",
  category: "${workflow.category || "BUILD_DEPLOY"}",
  concurrencyPolicy: "${workflow.concurrencyPolicy || "QUEUE"}",

  nodes: [
${nodesCode}
  ],

  edges: [
${edgesCode}
  ],
});
`;
}

/**
 * Parses user-edited TypeScript DSL back into nodes and edges.
 */
export function parseWorkflowDSL(code: string): { nodes: any[]; edges: any[] } | null {
  try {
    // Robust extraction using regex pattern matching on the DSL structure
    const nodesMatch = code.match(/nodes:\s*\[([\s\S]*?)\]\s*,/);
    const edgesMatch = code.match(/edges:\s*\[([\s\S]*?)\]\s*,?/);

    const parsedNodes: any[] = [];
    const parsedEdges: any[] = [];

    if (nodesMatch && nodesMatch[1]) {
      const nodeBlocks = nodesMatch[1].split(/\},\s*\{/);
      for (const block of nodeBlocks) {
        const keyMatch = block.match(/key:\s*"([^"]+)"/);
        const nameMatch = block.match(/name:\s*"([^"]+)"/);
        const typeMatch = block.match(/type:\s*"([^"]+)"/);
        const posXMatch = block.match(/x:\s*([0-9.-]+)/);
        const posYMatch = block.match(/y:\s*([0-9.-]+)/);
        const timeoutMatch = block.match(/timeoutSeconds:\s*([0-9]+)/);
        const retriesMatch = block.match(/maxRetries:\s*([0-9]+)/);
        const continueMatch = block.match(/continueOnError:\s*(true|false)/);

        if (keyMatch && typeMatch) {
          parsedNodes.push({
            nodeKey: keyMatch[1],
            name: nameMatch ? nameMatch[1] : keyMatch[1],
            type: typeMatch[1],
            positionX: posXMatch ? parseFloat(posXMatch[1]) : 100,
            positionY: posYMatch ? parseFloat(posYMatch[1]) : 100,
            timeoutSeconds: timeoutMatch ? parseInt(timeoutMatch[1], 10) : 300,
            maxRetries: retriesMatch ? parseInt(retriesMatch[1], 10) : 0,
            continueOnError: continueMatch ? continueMatch[1] === "true" : false,
            config: {},
          });
        }
      }
    }

    if (edgesMatch && edgesMatch[1]) {
      const edgeBlocks = edgesMatch[1].split(/\},\s*\{/);
      for (const block of edgeBlocks) {
        const fromMatch = block.match(/from:\s*"([^"]+)"/);
        const toMatch = block.match(/to:\s*"([^"]+)"/);
        const condMatch = block.match(/condition:\s*"([^"]+)"/);

        if (fromMatch && toMatch) {
          parsedEdges.push({
            sourceNodeKey: fromMatch[1],
            targetNodeKey: toMatch[1],
            condition: condMatch ? condMatch[1] : null,
          });
        }
      }
    }

    return { nodes: parsedNodes, edges: parsedEdges };
  } catch {
    return null;
  }
}
