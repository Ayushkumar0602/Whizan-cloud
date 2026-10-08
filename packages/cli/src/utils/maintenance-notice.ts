// ─── Whizan Cloud CLI — Maintenance Notice ──────────────────────────────────
// Displays a friendly, polite notification when the Azure VM / compute host is paused.

import { colors } from "./terminal-ui.js";

const c = colors;

export interface VmNoticeOptions {
  userName?: string;
  operationName?: string;
  contactEmail?: string;
  contactUrl?: string;
}

export function printVmMaintenanceNotice(options: VmNoticeOptions = {}) {
  const name = options.userName || "Developer";
  const op = options.operationName ? ` (${options.operationName})` : "";
  const email = options.contactEmail || "ayushkumarjais0602@gmail.com";
  const url = options.contactUrl || "https://whizan-cloud-service-dashboard.vercel.app/contact";

  console.error(`
  ${c.amber}${c.bold}┌─────────────────────────────────────────────────────────────────────────────┐${c.reset}
  ${c.amber}${c.bold}│ ☁️  WHIZAN CLOUD PLATFORM NOTICE                                            │${c.reset}
  ${c.amber}${c.bold}└─────────────────────────────────────────────────────────────────────────────┘${c.reset}

  ${c.brightWhite}${c.bold}Hello ${name}! 👋${c.reset}

  ${c.dim}We're very sorry, but your request${op} cannot be processed right now.${c.reset}

  ${c.yellow}The administration has temporarily stopped new deployments and serving${c.reset}
  ${c.yellow}existing applications until further notice.${c.reset}

  ${c.dim}Our cloud compute nodes (Azure VM build-worker & edge-router) are currently${c.reset}
  ${c.dim}powered down for scheduled maintenance. All your source code, databases, and${c.reset}
  ${c.dim}project settings remain permanently and securely preserved.${c.reset}

  ${c.whizanCyan}${c.bold}Need assistance or wish to request service reactivation?${c.reset}
  ${c.dim}Please feel free to get in touch with the administration:${c.reset}

  ${c.bold}📧 Email:${c.reset}   ${c.emerald}${email}${c.reset}
  ${c.bold}🌐 Contact:${c.reset} ${c.whizanBlue}${url}${c.reset}

  ${c.dim}Thank you for your patience and understanding!${c.reset}
`);
}
