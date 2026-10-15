import { RESTRICTED_COMMAND_RULES, evaluateCommandSecurity } from "../../lib/container-security.js";
import { checkVmOnline, type VmStatusResult } from "../../lib/vm-status.js";

export type RiskTier = "TIER_1" | "TIER_2" | "TIER_3";

export interface ToolSecurityEvaluation {
  allowed: boolean;
  riskTier: RiskTier;
  requiresHitl: boolean;
  requiresVm: boolean;
  reason?: string;
  blockedRule?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL RISK TIER DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const TIER_1_TOOLS = new Set([
  "fleet_overview",
  "list_projects",
  "list_services",
  "inspect_service",
  "get_deployment_logs",
  "get_resource_analytics",
  "list_databases",
  "list_edge_functions",
  "list_cron_jobs",
  "list_workflows",
  "check_endpoint_health",
  "curl_endpoint",
  "list_environment_variables",
  "navigate_ui",
  "open_external_url",
  "get_system_status",
]);

const TIER_2_TOOLS = new Set([
  "run_diagnostic_command",
  "restart_service",
  "redeploy_resource",
  "set_environment_variable",
  "provision_database",
  "trigger_cron_job",
  "trigger_workflow",
  "deploy_edge_function",
  "configure_function_endpoint",
]);

const VM_DEPENDENT_TOOLS = new Set([
  "run_diagnostic_command",
  "restart_service",
  "redeploy_resource",
]);

// Extra regex rules for agent command execution (destructive actions)
const PROHIBITED_DESTRUCTIVE_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive|--force)\b/i,
  /\b(DROP\s+DATABASE|DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i,
  /\b(mkfs|dd|fdisk|parted|wipefs)\b/i,
  /\b(shutdown|reboot|poweroff|init\s+0|kill\s+1)\b/i,
  /\b(chmod\s+777|chown\s+-R\s+root)\b/i,
  /\b(nc\s+-e|bash\s+-i|sh\s+-i|curl.*\|\s*bash)\b/i,
  /\b(xmrig|minerd|stratum\+tcp)\b/i,
];

/**
 * Evaluates whether a proposed tool call is allowed, its risk tier,
 * whether human-in-the-loop approval is required, and VM offline implications.
 */
export async function evaluateToolCall(
  toolName: string,
  parameters: Record<string, any>
): Promise<ToolSecurityEvaluation> {
  // 1. Check if tool is known
  if (TIER_1_TOOLS.has(toolName)) {
    return {
      allowed: true,
      riskTier: "TIER_1",
      requiresHitl: false,
      requiresVm: false,
    };
  }

  // 2. Check in-container diagnostic command security
  if (toolName === "run_diagnostic_command") {
    const cmd = String(parameters?.command || "");
    
    // Check against standard container security rules
    const secEval = evaluateCommandSecurity(cmd);
    if (!secEval.allowed) {
      return {
        allowed: false,
        riskTier: "TIER_3",
        requiresHitl: false,
        requiresVm: true,
        reason: secEval.rule?.reason || "Command blocked by security guardrails.",
        blockedRule: secEval.rule?.name,
      };
    }

    // Check against extra destructive patterns
    for (const pat of PROHIBITED_DESTRUCTIVE_PATTERNS) {
      if (pat.test(cmd)) {
        return {
          allowed: false,
          riskTier: "TIER_3",
          requiresHitl: false,
          requiresVm: true,
          reason: "Destructive command pattern detected and permanently blocked.",
          blockedRule: "DestructiveCommandFilter",
        };
      }
    }

    return {
      allowed: true,
      riskTier: "TIER_2",
      requiresHitl: true,
      requiresVm: true,
    };
  }

  // 3. Other Tier 2 mutating operations
  if (TIER_2_TOOLS.has(toolName)) {
    const requiresVm = VM_DEPENDENT_TOOLS.has(toolName);
    return {
      allowed: true,
      riskTier: "TIER_2",
      requiresHitl: true,
      requiresVm,
    };
  }

  // Unknown tools default to Tier 2 with HITL requirement
  return {
    allowed: true,
    riskTier: "TIER_2",
    requiresHitl: true,
    requiresVm: false,
  };
}

/**
 * Checks if the VM is required and online. Returns a user-friendly message if offline.
 */
export async function checkVmAvailabilityForTool(
  toolName: string
): Promise<{ canExecute: boolean; vmStatus: VmStatusResult; notice?: string }> {
  const vmStatus = await checkVmOnline();
  if (VM_DEPENDENT_TOOLS.has(toolName) && !vmStatus.vmOnline) {
    return {
      canExecute: false,
      vmStatus,
      notice: "The compute node is currently offline. Please try again later.",
    };
  }

  return { canExecute: true, vmStatus };
}
