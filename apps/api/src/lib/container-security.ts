/**
 * Container Security & Anti-Abuse Guardrail Engine
 * 
 * Enforces strict restrictions on interactive container terminal sessions to prevent:
 * 1. Out-of-scope actions (e.g. git clone, arbitrary software installation)
 * 2. Cryptocurrency mining & botnets (xmrig, stratum)
 * 3. Network reconnaissance & attacks (nmap, masscan, ddos tools)
 * 4. Cloud infrastructure & metadata probing (169.254.169.254)
 * 5. Proxying, tunneling & darkweb nodes (tor, openvpn, ngrok)
 * 6. System destruction & process exhaustion (fork bombs, mkfs)
 */

export interface SecurityRule {
  id: string;
  name: string;
  pattern: RegExp;
  reason: string;
}

export const RESTRICTED_COMMAND_RULES: SecurityRule[] = [
  // 1. Out-of-Scope Source Control Operations (Explicit User Request)
  {
    id: "git-clone-restricted",
    name: "External Repository Cloning / Out-of-Scope Git",
    pattern: /\b(?:git(?:-clone)?\s+(?:clone|push|pull\s+https?|fetch\s+https?|remote\s+add|archive)|svn\s+(?:checkout|co)|hg\s+clone|cvs\s+checkout)\b/i,
    reason: "Arbitrary repository cloning or external repository push/fetch inside running production containers is prohibited. Code must be deployed through the project deployment pipeline.",
  },

  // 2. Package Manager Tampering / Runtime Software Suite Installations
  {
    id: "package-manager-install",
    name: "System Package Manager Installation",
    pattern: /\b(?:apt(?:-get)?|aptitude)\s+(?:-[a-zA-Z\-0-9]+\s+)*(?:install|dist-upgrade|upgrade)|apk\s+(?:-[a-zA-Z\-0-9]+\s+)*(?:add|upgrade)|(?:yum|dnf|microdnf|zypper)\s+(?:-[a-zA-Z\-0-9]+\s+)*install|pacman\s+(?:-[a-zA-Z\-0-9]+\s+)*-(?:S|Syu|U)|brew\s+install\b/i,
    reason: "Runtime system package manager installations are disabled. Dependencies must be defined in your build configuration (package.json / requirements.txt).",
  },

  // 3. Remote Script Pipe-to-Shell (Primary vector for unvetted malware & miners)
  {
    id: "pipe-to-shell",
    name: "Remote Script Pipe-to-Shell Execution",
    pattern: /\b(?:curl|wget|fetch)\b[^|;&\n]*\|\s*(?:bash|sh|zsh|dash|python\d?|perl|ruby)\b/i,
    reason: "Piping unverified remote web scripts directly into a shell interpreter (e.g. curl | bash) is blocked to prevent malware and arbitrary binary execution.",
  },

  // 4. Crypto-Mining & Distributed Resource Abuse
  {
    id: "crypto-mining",
    name: "Cryptocurrency Mining Activity",
    pattern: /\b(?:xmrig|minerd|cpuminer|ethminer|cryptonight|nicehash|stratum\+(?:tcp|ssl)|ccminer|cgminer|bfgminer|nanominer|monero-wallet)\b/i,
    reason: "Cryptocurrency mining and unauthorized background compute tasks are strictly forbidden and violate terms of service.",
  },

  // 5. Network Scanning, Reconnaissance & Attacks
  {
    id: "network-scanning",
    name: "Network Scanning & Penetration Tools",
    pattern: /\b(?:nmap|masscan|zmap|hping[23]?|hydra|medusa|sqlmap|arpspoof|ettercap|aircrack(?:-ng)?|wireshark|tshark|tcpdump|nikto|wpscan|gobuster|dirbuster|ffuf|slowloris)\b/i,
    reason: "Network scanning, packet sniffing, and unauthorized penetration testing tools are prohibited inside customer containers.",
  },

  // 6. Proxying, Anonymization & Unauthorized Tunneling
  {
    id: "proxy-tunneling",
    name: "Network Proxying & Unauthorized Tunnels",
    pattern: /\b(?:tor\b|torsocks|openvpn|wireguard|shadowsocks|cloudflared\s+tunnel|ngrok|frpc?|chisel|bore\s+local|localtunnel|socat)\b/i,
    reason: "Using container infrastructure as an open proxy, anonymization node, or unauthorized tunnel is prohibited.",
  },

  // 7. Reverse Shells & Socket Redirection Backdoors
  {
    id: "reverse-shell",
    name: "Reverse Shell / Socket Listener",
    pattern: /(?:nc\s+-[a-zA-Z]*l|nc\s+(?:[0-9.]+|[a-zA-Z0-9.-]+)\s+\d+\s+-e|bash\s+-i\s+>&|\/dev\/tcp\/\d+|exec\s+\d+<>\/dev\/tcp\/)/i,
    reason: "Reverse shells and unauthorized network listener backdoors are blocked by container security policies.",
  },

  // 8. Cloud Provider Metadata Service Probing (Cloud metadata & IAM credential protection)
  {
    id: "cloud-metadata-probe",
    name: "Cloud Provider Metadata Probing",
    pattern: /(?:169\.254\.169\.254|metadata\.google\.internal|100\.100\.100\.200|metadata\.packet\.net)/i,
    reason: "Attempts to probe cloud metadata IP endpoints (IAM credentials / internal provider APIs) are blocked.",
  },

  // 9. System Destruction & Process Exhaustion
  {
    id: "destructive-commands",
    name: "System Destruction / Process Bomb",
    pattern: /(?::\(\)\s*\{\s*:\|:&\s*\};:|mkfs\b|dd\s+if=\/dev\/(?:zero|urandom)\s+of=\/dev\/[sh]d|rm\s+-[a-zA-Z\-]*\s+(?:\/|\/\*|~\/\*)(?:\s|$|;)|chmod\s+-[a-zA-Z]*R\s+000\s+\/|perl\s+-e\s+['"].*fork.*while)/i,
    reason: "Destructive system commands and process fork bombs are blocked by container safety policies.",
  },

  // 10. Container / Namespace Escaping & Privilege Escalation
  {
    id: "container-escape",
    name: "Namespace Escaping / Privilege Tampering",
    pattern: /\b(?:nsenter|chroot\s+\/host|mount\s+-t|umount\s+-a)\b/i,
    reason: "Host namespace escaping and filesystem mount operations are prohibited.",
  },

  // 11. Torrent & P2P Piracy Downloaders
  {
    id: "p2p-torrenting",
    name: "P2P Torrent / Unauthorized Downloaders",
    pattern: /\b(?:aria2c|transmission-cli|rtorrent|deluge-console|qbittorrent-nox)\b/i,
    reason: "Peer-to-peer file sharing and torrent clients are strictly prohibited.",
  },
];

/**
 * Checks a command line string against the active security ruleset
 */
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
