#!/usr/bin/env node
import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  type Tool,
  type Resource,
} from "@modelcontextprotocol/sdk/types.js";
import { WhizanClient, WhizanApiError } from "./whizan-client.js";
import { packDirectory } from "./utils/archive.js";
import { analyzeWorkspace } from "./tools/analyze-workspace.js";
import { generatePatch } from "./tools/generate-patch.js";
import { WHIZAN_DOC_RESOURCES } from "./resources/documentation.js";
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
    } catch { }

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
    version: "1.3.2",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

import { TOOLS } from "./tools-definitions.js";

// ─── Request Handlers ────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  McpLogger.info(`Delivered ${TOOLS.length} tool definitions to MCP client.`);
  return { tools: TOOLS };
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  McpLogger.info(`Delivered ${WHIZAN_DOC_RESOURCES.length} documentation resources to MCP client.`);
  return {
    resources: WHIZAN_DOC_RESOURCES.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    })),
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const doc = WHIZAN_DOC_RESOURCES.find((r) => r.uri === uri);
  if (!doc) {
    throw new Error(
      `Resource '${uri}' not found. Available resources:\n${WHIZAN_DOC_RESOURCES.map((r) => ` - ${r.uri}: ${r.name}`).join("\n")}`
    );
  }
  return {
    contents: [
      {
        uri: doc.uri,
        mimeType: doc.mimeType,
        text: doc.content,
      },
    ],
  };
});

const PROMPTS = [
  {
    name: "whizan_deploy_guide",
    description: "Step-by-step instructions for deploying frontend apps and backend services to Whizan Cloud.",
  },
  {
    name: "whizan_storage_guide",
    description: "Step-by-step guide for bucket provisioning, access key generation, and file uploads.",
  },
  {
    name: "whizan_troubleshooting_guide",
    description: "Guide for diagnosing unhandled exceptions, runtime crashes, and inspecting containers.",
  },
];

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts: PROMPTS };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name } = request.params;
  const deployDoc = WHIZAN_DOC_RESOURCES.find((r) => r.uri === "whizan://docs/deployment-protocol")?.content || "";
  const storageDoc = WHIZAN_DOC_RESOURCES.find((r) => r.uri === "whizan://docs/storage-sdk")?.content || "";
  const diagDoc = WHIZAN_DOC_RESOURCES.find((r) => r.uri === "whizan://docs/diagnostics")?.content || "";

  if (name === "whizan_deploy_guide") {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Here is the mandatory Whizan Cloud deployment protocol and instructions:\n\n${deployDoc}`,
          },
        },
      ],
    };
  }

  if (name === "whizan_storage_guide") {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Here is the Whizan Cloud Object Storage guide and SDK reference:\n\n${storageDoc}`,
          },
        },
      ],
    };
  }

  if (name === "whizan_troubleshooting_guide") {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Here is the Whizan Cloud diagnostic and troubleshooting guide:\n\n${diagDoc}`,
          },
        },
      ],
    };
  }

  throw new Error(`Prompt '${name}' not found.`);
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
      const url = sysStatus.contactUrl || "https://dashboard.whizan.cloud/contact";
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
      } catch { }

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
        } catch { }
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
        } catch { }
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
        } catch { }

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
        const baseDomain = process.env.BASE_DOMAIN || "whizan.cloud";
        const proto = baseDomain.includes("whizan.cloud") ? "https" : "http";
        const liveUrl = matchedTarget.slug ? `${proto}://${matchedTarget.slug}.${baseDomain}` : undefined;

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
          } catch { }
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
      } catch { }

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
      } catch { }

      // Enforce Hobby subscription tier compute limits
      let authProfile: any = null;
      try {
        authProfile = await client.getAuthStatus();
      } catch { }
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
            const baseDomain = process.env.BASE_DOMAIN || "whizan.cloud";
            const proto = baseDomain.includes("whizan.cloud") ? "https" : "http";
            const liveUrl = `${proto}://${existingService.slug}.${baseDomain}`;
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

      const baseDomain = process.env.BASE_DOMAIN || "whizan.cloud";
      const proto = baseDomain.includes("whizan.cloud") ? "https" : "http";
      const expectedLiveUrl = `${proto}://${service.slug}.${baseDomain}`;

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
                protocol: proto,
                note: `The live URL will be active at ${expectedLiveUrl} once direct deployment completes.`,
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
      } catch { }

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
      } catch { }

      let project: any;
      try {
        project = await client.createProject(projectArgs);
      } catch (err: any) {
        if (err instanceof WhizanApiError && err.statusCode === 409) {
          const existingProject = err.data?.existingProject;
          if (existingProject) {
            const baseDomain = process.env.BASE_DOMAIN || "whizan.cloud";
            const proto = baseDomain.includes("whizan.cloud") ? "https" : "http";
            const liveUrl = `${proto}://${existingProject.slug}.${baseDomain}`;
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

      const baseDomain = process.env.BASE_DOMAIN || "whizan.cloud";
      const proto = baseDomain.includes("whizan.cloud") ? "https" : "http";
      const expectedLiveUrl = `${proto}://${project.slug}.${baseDomain}`;

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
                protocol: proto,
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
      } catch { }

      const archiveBuffer = await packDirectory(targetDirectory, targetType);

      let deploymentResult: any;
      if (targetType === "service") {
        deploymentResult = await client.uploadServiceArchive(targetId, archiveBuffer);
      } else {
        deploymentResult = await client.uploadProjectArchive(targetId, archiveBuffer);
      }

      const baseDomain = process.env.BASE_DOMAIN || "whizan.cloud";
      const slug = deploymentResult?.service?.slug || deploymentResult?.project?.slug || targetId;
      const proto = baseDomain.includes("whizan.cloud") ? "https" : "http";
      const expectedLiveUrl = `${proto}://${slug}.${baseDomain}`;

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
                  `2. Once build status reaches ACTIVE/READY, your service is live and reachable at ${expectedLiveUrl}.`,
                  `3. Rewire your frontend (e.g. VITE_API_URL or NEXT_PUBLIC_API_URL) to ${expectedLiveUrl}.`
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
      } catch { }
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
        throw new Error("whizan_check_health requires either 'url' (e.g. https://<slug>.whizan.cloud) or 'targetId'.");
      }
      const health = await client.checkHealth(target);
      return {
        content: [{ type: "text", text: JSON.stringify(health, null, 2) }],
      };
    }

    case "whizan_redeploy": {
      const { targetType, targetId, githubRepoUrl, branch, workspaceDir } = (args || {}) as any;
      const deployment = await client.redeploy(targetType, targetId, { githubRepoUrl, branch });
      const baseDomain = process.env.BASE_DOMAIN || "whizan.cloud";
      const slug = deployment?.service?.slug || deployment?.project?.slug || targetId;
      const proto = baseDomain.includes("whizan.cloud") ? "https" : "http";
      const expectedLiveUrl = `${proto}://${slug}.${baseDomain}`;
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

    case "whizan_get_application_logs": {
      const { targetType, targetId, tail, timestamps } = (args || {}) as any;
      const result = await client.getApplicationLogs({ targetType, targetId, tail, timestamps });
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

    // ─── Whizan Cloud Storage Tools ──────────────────────────────────────────

    case "whizan_storage_get_usage": {
      const usage = await client.getStorageUsage();
      const q = usage.quota;
      return {
        content: [
          {
            type: "text",
            text: [
              `Whizan Cloud Storage — Quota & Usage`,
              `Subscription Tier: ${usage.tierDisplayName} (${usage.tier})`,
              `Allocated Quota: ${q.allocatedMb} MB (${q.allocatedBytes} bytes)`,
              `Committed Usage: ${q.usedMb} MB (${q.usedBytes} bytes) [${q.usagePercent}%]`,
              `In-Flight Reserved: ${q.reservedMb} MB (${q.reservedBytes} bytes)`,
              `Available: ${q.availableMb} MB (${q.availableBytes} bytes)`,
              `Active Objects: ${q.objectsCount}`,
              `Provider: Cloudflare R2 (Global Edge CDN)`,
            ].join("\n"),
          },
        ],
      };
    }

    case "whizan_storage_list_buckets": {
      const buckets = await client.listStorageBuckets();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(buckets, null, 2),
          },
        ],
      };
    }

    case "whizan_storage_create_bucket": {
      const { name, description, isPublic } = (args || {}) as any;
      const res = await client.createStorageBucket({ name, description, isPublic });
      return {
        content: [
          {
            type: "text",
            text: `Storage bucket '${name}' created successfully (ID: ${res.bucket.id}, Access: ${res.bucket.isPublic ? "Public" : "Private"}).`,
          },
        ],
      };
    }

    case "whizan_storage_delete_bucket": {
      const { bucket, force } = (args || {}) as any;
      const res = await client.deleteStorageBucket(bucket, force);
      return {
        content: [
          {
            type: "text",
            text: res.message || `Bucket '${bucket}' deleted successfully.`,
          },
        ],
      };
    }

    case "whizan_storage_list_objects": {
      const { bucket, prefix, limit } = (args || {}) as any;
      const res = await client.listStorageObjects(bucket, prefix, limit);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res, null, 2),
          },
        ],
      };
    }

    case "whizan_storage_upload_object": {
      const { bucket, localFilePath, destinationPath, mimeType } = (args || {}) as any;
      const resolvedLocal = path.resolve(localFilePath);
      const fileBuffer = await fs.readFile(resolvedLocal);
      try {
        const res = await client.uploadStorageObject(bucket, destinationPath, fileBuffer, mimeType);
        return {
          content: [
            {
              type: "text",
              text: `File '${localFilePath}' successfully uploaded to '${bucket}/${res.object.name}' (${res.object.size} bytes, ETag: ${res.object.etag || "—"}).`,
            },
          ],
        };
      } catch (uploadErr: any) {
        let diagnostic = `✗ Storage upload failed: ${uploadErr.message}`;
        if (uploadErr.status === 403) {
          diagnostic += `\n\n[Diagnosis]: 403 Forbidden indicates a permission or bucket scope mismatch.\n- Verify if your configured Storage Key is scoped to bucket '${bucket}' or if it has READ_ONLY permission.\n- Use 'whizan_storage_create_api_key' to create a key with permission: 'READ_WRITE' scoped to '${bucket}' or unscoped.`;
        } else if (uploadErr.status === 401) {
          diagnostic += `\n\n[Diagnosis]: 401 Unauthorized indicates invalid or missing storage credentials.\n- Bucket '${bucket}' is private and requires a valid 'whz_stg_live_...' key.`;
        } else if (uploadErr.status === 404) {
          diagnostic += `\n\n[Diagnosis]: Bucket '${bucket}' not found. Call 'whizan_storage_list_buckets' to see existing buckets, or 'whizan_storage_create_bucket' to create it.`;
        }
        throw new Error(diagnostic);
      }
    }

    case "whizan_storage_download_object": {
      const { bucket, objectPath, localDestinationPath } = (args || {}) as any;
      const buffer = await client.downloadStorageObject(bucket, objectPath);
      const resolvedDest = path.resolve(localDestinationPath);
      await fs.mkdir(path.dirname(resolvedDest), { recursive: true });
      await fs.writeFile(resolvedDest, buffer);
      return {
        content: [
          {
            type: "text",
            text: `Object '${bucket}/${objectPath}' downloaded successfully to '${resolvedDest}' (${buffer.length} bytes).`,
          },
        ],
      };
    }

    case "whizan_storage_delete_object": {
      const { bucket, objectPath } = (args || {}) as any;
      const res = await client.deleteStorageObject(bucket, objectPath);
      return {
        content: [
          {
            type: "text",
            text: res.message || `Object '${bucket}/${objectPath}' deleted successfully.`,
          },
        ],
      };
    }

    case "whizan_storage_create_api_key": {
      const { name, permission, bucketId } = (args || {}) as any;
      const res = await client.createStorageApiKey({ name, permission, bucketId });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                message: `Storage API Key '${res.key.name}' created successfully!`,
                keyId: res.key.id,
                keySecret: res.key.key,
                keyPrefix: res.key.keyPrefix,
                permission: res.key.permission,
                bucketId: res.key.bucketId || "ALL_BUCKETS",
                instruction:
                  "Inject this key secret into your application environment variables using 'whizan_set_env_vars' as WHIZAN_STORAGE_KEY or NEXT_PUBLIC_WHIZAN_STORAGE_KEY.",
              },
              null,
              2
            ),
          },
        ],
      };
    }

    case "whizan_storage_list_api_keys": {
      const res = await client.listStorageApiKeys();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res, null, 2),
          },
        ],
      };
    }

    case "whizan_storage_delete_api_key": {
      const { keyId } = (args || {}) as any;
      if (!keyId) throw new Error("Argument 'keyId' is required.");
      const res = await client.deleteStorageApiKey(keyId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res, null, 2),
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
    ${c.whizanCyan}WHIZAN_API_URL${c.reset}     Target API endpoint (defaults to https://api.whizan.cloud)
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
    const dashboardBase = customUrl || "https://dashboard.whizan.cloud";
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

    exec(openCmd, () => { });
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
