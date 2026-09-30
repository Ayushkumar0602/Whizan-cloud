/**
 * Container Security & Anti-Abuse Guardrail Engine for Build Worker
 */

export interface SecurityRule {
  id: string;
  name: string;
  pattern: RegExp;
  reason: string;
}

export const RESTRICTED_COMMAND_RULES: SecurityRule[] = [
  // 1. Source Control Operations
  {
    id: "git-clone-restricted",
    name: "External Repository Cloning",
    pattern: /\b(?:git(?:-clone)?\s+(?:clone|push|pull\s+https?|fetch\s+https?|remote\s+add|archive)|svn\s+(?:checkout|co)|hg\s+clone|cvs\s+checkout)\b/i,
    reason: "Arbitrary repository cloning inside running production containers is prohibited.",
  },

  // 2. Package Manager Tampering / Runtime Software Suite Installations
  {
    id: "package-manager-install",
    name: "System Package Manager Installation",
    pattern: /\b(?:apt(?:-get)?|aptitude)\s+(?:-[a-zA-Z\-0-9]+\s+)*(?:install|dist-upgrade|upgrade)|apk\s+(?:-[a-zA-Z\-0-9]+\s+)*(?:add|upgrade)|(?:yum|dnf|microdnf|zypper)\s+(?:-[a-zA-Z\-0-9]+\s+)*install|pacman\s+(?:-[a-zA-Z\-0-9]+\s+)*-(?:S|Syu|U)|brew\s+install\b/i,
    reason: "Runtime system package manager installations are disabled in containers.",
  },

  // 3. Remote Script Pipe-to-Shell
  {
    id: "pipe-to-shell",
    name: "Remote Script Pipe-to-Shell Execution",
    pattern: /\b(?:curl|wget|fetch)\b[^|;&\n]*\|\s*(?:bash|sh|zsh|dash|python\d?|perl|ruby)\b/i,
    reason: "Piping unverified remote web scripts directly into a shell interpreter is blocked.",
  },

  // 4. Crypto-Mining
  {
    id: "crypto-mining",
    name: "Cryptocurrency Mining Activity",
    pattern: /\b(?:xmrig|minerd|cpuminer|ethminer|cryptonight|nicehash|stratum\+(?:tcp|ssl)|ccminer|cgminer|bfgminer|nanominer|monero-wallet)\b/i,
    reason: "Cryptocurrency mining and unauthorized background compute tasks are strictly forbidden.",
  },

  // 5. Network Scanning & Attacks
  {
    id: "network-scanning",
    name: "Network Scanning & Penetration Tools",
    pattern: /\b(?:nmap|masscan|zmap|hping[23]?|hydra|medusa|sqlmap|arpspoof|ettercap|aircrack(?:-ng)?|wireshark|tshark|tcpdump|nikto|wpscan|gobuster|dirbuster|ffuf|slowloris)\b/i,
    reason: "Network scanning and penetration testing tools are prohibited inside customer containers.",
  },

  // 6. Proxying & Tunnels
  {
    id: "proxy-tunneling",
    name: "Network Proxying & Unauthorized Tunnels",
    pattern: /\b(?:tor\b|torsocks|openvpn|wireguard|shadowsocks|cloudflared\s+tunnel|ngrok|frpc?|chisel|bore\s+local|localtunnel|socat)\b/i,
    reason: "Using container infrastructure as an open proxy or tunnel is prohibited.",
  },

  // 7. Reverse Shells
  {
    id: "reverse-shell",
    name: "Reverse Shell / Socket Listener",
    pattern: /(?:nc\s+-[a-zA-Z]*l|nc\s+(?:[0-9.]+|[a-zA-Z0-9.-]+)\s+\d+\s+-e|bash\s+-i\s+>&|\/dev\/tcp\/\d+|exec\s+\d+<>\/dev\/tcp\/)/i,
    reason: "Reverse shells and unauthorized network listener backdoors are blocked.",
  },

  // 8. Cloud Metadata Probing
  {
    id: "cloud-metadata-probe",
    name: "Cloud Provider Metadata Probing",
    pattern: /(?:169\.254\.169\.254|metadata\.google\.internal|100\.100\.100\.200|metadata\.packet\.net)/i,
    reason: "Attempts to probe cloud metadata IP endpoints are blocked.",
  },

  // 9. System Destruction & Process Exhaustion
  {
    id: "destructive-commands",
    name: "System Destruction / Process Bomb",
    pattern: /(?::\(\)\s*\{\s*:\|:&\s*\};:|mkfs\b|dd\s+if=\/dev\/(?:zero|urandom)\s+of=\/dev\/[sh]d|rm\s+-[a-zA-Z\-]*\s+(?:\/|\/\*|~\/\*)(?:\s|$|;)|chmod\s+-[a-zA-Z]*R\s+000\s+\/|perl\s+-e\s+['"].*fork.*while)/i,
    reason: "Destructive system commands and process fork bombs are blocked by container safety policies.",
  },

  // 10. File deletion / purge guardrail
  {
    id: "file-deletion",
    name: "Destructive File Deletion",
    pattern: /\b(?:rm\s+(-[a-zA-Z]*r[a-zA-Z]*|-rf|--recursive)|unlink|shred|truncate\s+-s\s+0)\b/i,
    reason: "File deletion operations are blocked in container diagnostic mode.",
  },

  // 11. System power / reboot
  {
    id: "system-power",
    name: "System Power Operations",
    pattern: /\b(?:shutdown|reboot|poweroff|halt|init\s+0)\b/i,
    reason: "System reboot and shutdown operations are blocked.",
  }
];

export function evaluateCommandSecurity(command: string): { allowed: boolean; rule?: SecurityRule } {
  const trimmed = command.trim();
  if (!trimmed) return { allowed: true };

  for (const rule of RESTRICTED_COMMAND_RULES) {
    if (rule.pattern.test(trimmed)) {
      return { allowed: false, rule };
    }
  }

  return { allowed: true };
}

export function maskSensitiveOutput(output: string): string {
  if (!output) return "";
  let sanitized = output;
  // Mask JWT tokens
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, "[MASKED_JWT]");
  // Mask generic private keys
  sanitized = sanitized.replace(/-----BEGIN [A-Z ]+ PRIVATE KEY-----[^-]+-----END [A-Z ]+ PRIVATE KEY-----/gs, "[MASKED_PRIVATE_KEY]");
  // Mask database passwords in connection URIs
  sanitized = sanitized.replace(/:\/\/([^:]+):([^@]+)@/g, "://$1:***@");
  // Mask potential secrets in env outputs (KEY=value)
  sanitized = sanitized.replace(/^((?:[A-Z0-9_]*(?:SECRET|KEY|TOKEN|PASSWORD|PASS|AUTH|PRIVATE|CREDENTIAL)[A-Z0-9_]*))=([^\r\n]+)/gim, "$1=[MASKED_SECRET]");
  return sanitized;
}
