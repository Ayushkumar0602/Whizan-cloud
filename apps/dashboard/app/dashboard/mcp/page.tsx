"use client";

import { useState, useEffect } from "react";
import { apiKeysApi, type ApiKeyItem, type CreatedApiKey } from "@/lib/api";
import {
  Terminal,
  Copy,
  Check,
  KeyRound,
  Sparkles,
  Server,
  Globe,
  Database,
  RefreshCw,
  Zap,
  Shield,
  Layers,
  Code2,
  Trash2,
  Plus,
  Play,
  CheckCircle2,
  ExternalLink,
  Cpu,
  Clock,
  Workflow,
  ArrowRight,
  BookOpen,
  Monitor,
  Radio,
  FileCode2,
  Sliders,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type MainTab = "mcp" | "cli" | "keys" | "tools";
type IdeTab = "cursor" | "claude" | "antigravity" | "windsurf" | "vscode";

export default function McpAndCliDocsPage() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as MainTab) || "mcp";

  const [activeTab, setActiveTab] = useState<MainTab>(
    ["mcp", "cli", "keys", "tools"].includes(initialTab) ? initialTab : "mcp"
  );
  const [activeIde, setActiveIde] = useState<IdeTab>("cursor");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // API Key State
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null);
  const [keyName, setKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);

  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes("localhost")
      ? process.env.NEXT_PUBLIC_API_URL
      : "https://api.whizan.cloud";

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    setLoadingKeys(true);
    try {
      const data = await apiKeysApi.list();
      setKeys(data);
    } catch {
      // offline / fallback
    } finally {
      setLoadingKeys(false);
    }
  }

  async function handleCreateKey(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setCreatingKey(true);
    try {
      const created = await apiKeysApi.create(keyName.trim() || "Developer Access Key");
      setNewKey(created);
      setKeyName("");
      toast.success("New API key generated and injected into configurations!");
      await loadKeys();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate key");
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleDeleteKey(id: string) {
    try {
      await apiKeysApi.delete(id);
      toast.success("API key revoked");
      setKeys((prev) => prev.filter((k) => k.id !== id));
      if (newKey?.id === id) setNewKey(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke key");
    }
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Active key calculation
  const fullUsableKey =
    newKey?.key ||
    (keys.length > 0 && keys[0]?.keyPrefix
      ? `${keys[0].keyPrefix}••••••••••••••••`
      : "whz_live_YOUR_API_KEY");

  // IDE Configuration Specs
  const ideConfigs: Record<
    IdeTab,
    { label: string; file: string; location: string; config: string }
  > = {
    cursor: {
      label: "Cursor",
      file: ".cursor/mcp.json",
      location: "Project root: .cursor/mcp.json  |  Global: ~/.cursor/mcp.json",
      config: JSON.stringify(
        {
          mcpServers: {
            whizan: {
              command: "npx",
              args: ["-y", "@whizan/mcp-devops"],
              env: {
                WHIZAN_API_URL: apiUrl,
                WHIZAN_API_KEY: fullUsableKey,
              },
            },
          },
        },
        null,
        2
      ),
    },
    claude: {
      label: "Claude Desktop",
      file: "claude_desktop_config.json",
      location: "macOS: ~/Library/Application Support/Claude/claude_desktop_config.json",
      config: JSON.stringify(
        {
          mcpServers: {
            whizan: {
              command: "npx",
              args: ["-y", "@whizan/mcp-devops"],
              env: {
                WHIZAN_API_URL: apiUrl,
                WHIZAN_API_KEY: fullUsableKey,
              },
            },
          },
        },
        null,
        2
      ),
    },
    antigravity: {
      label: "Antigravity IDE",
      file: "mcp_config.json",
      location: "~/.gemini/antigravity-ide/mcp_config.json",
      config: JSON.stringify(
        {
          mcpServers: {
            whizan: {
              command: "npx",
              args: ["-y", "@whizan/mcp-devops"],
              env: {
                WHIZAN_API_URL: apiUrl,
                WHIZAN_API_KEY: fullUsableKey,
              },
            },
          },
        },
        null,
        2
      ),
    },
    windsurf: {
      label: "Windsurf (Cascade)",
      file: "mcp_config.json",
      location: "~/.codeium/windsurf/mcp_config.json",
      config: JSON.stringify(
        {
          mcpServers: {
            whizan: {
              command: "npx",
              args: ["-y", "@whizan/mcp-devops"],
              env: {
                WHIZAN_API_URL: apiUrl,
                WHIZAN_API_KEY: fullUsableKey,
              },
            },
          },
        },
        null,
        2
      ),
    },
    vscode: {
      label: "VS Code (Cline / Roo)",
      file: "cline_mcp_settings.json",
      location: "Settings → Extensions → Cline/Roo → MCP Servers",
      config: JSON.stringify(
        {
          mcpServers: {
            whizan: {
              command: "npx",
              args: ["-y", "@whizan/mcp-devops"],
              env: {
                WHIZAN_API_URL: apiUrl,
                WHIZAN_API_KEY: fullUsableKey,
              },
              autoApprove: [
                "whizan_analyze_workspace",
                "whizan_get_build_logs",
                "whizan_check_health",
              ],
            },
          },
        },
        null,
        2
      ),
    },
  };

  const samplePrompts = [
    {
      title: "Deploy Web App or Microservice",
      category: "Deployment",
      prompt:
        "Analyze this workspace with Whizan MCP. Ensure backend binds to 0.0.0.0 with process.env.PORT, package the code via direct upload, and deploy it to Whizan Cloud.",
    },
    {
      title: "Self-Heal Build & Deploy Failure",
      category: "Diagnostics",
      prompt:
        "My recent Whizan deployment failed. Use whizan_get_build_logs to inspect the compilation error, patch the source code, and trigger a redeploy on the same targetId.",
    },
    {
      title: "Provision Managed Database",
      category: "Database",
      prompt:
        "Provision a managed PostgreSQL database on Whizan Cloud using Whizan MCP and wire the connection string into the service environment variables.",
    },
    {
      title: "Run Container Health & Migration",
      category: "Live Ops",
      prompt:
        "Inspect the running container with whizan_inspect_deployment and run 'npx prisma migrate status' using whizan_exec_container_command.",
    },
  ];

  const toolsList = [
    {
      name: "whizan_analyze_workspace",
      group: "Audit & Stack",
      desc: "Inspects package manifests, entry points, language runtimes, internal ports, and flags 127.0.0.1 localhost traps.",
    },
    {
      name: "whizan_deploy_direct",
      group: "Deployment",
      desc: "Packages local source code (respecting .gitignore, omitting node_modules) and deploys straight to the cloud worker.",
    },
    {
      name: "whizan_redeploy",
      group: "Deployment",
      desc: "Triggers a zero-downtime rebuild and container cutover for existing projects or backend microservices.",
    },
    {
      name: "whizan_get_build_logs",
      group: "Diagnostics",
      desc: "Streams live Docker and compilation logs from the cloud build worker until deployment reaches READY or ACTIVE.",
    },
    {
      name: "whizan_check_health",
      group: "Verification",
      desc: "Probes public HTTP 200 readiness and verifies edge routing connectivity on *.whizan.cloud domains.",
    },
    {
      name: "whizan_create_project",
      group: "Frontend",
      desc: "Registers frontend projects (Vite, Next.js SSR, React, Astro, Static) with ultra-low latency edge CDN routing.",
    },
    {
      name: "whizan_create_service",
      group: "Backend",
      desc: "Provisions containerized microservices (Node.js, Python, Go, Rust, Java, Dockerfile) with private mesh networking.",
    },
    {
      name: "whizan_provision_database",
      group: "Databases",
      desc: "Provisions managed PostgreSQL (with connection pooling), Redis cache, or MySQL instances.",
    },
    {
      name: "whizan_exec_container_command",
      group: "Live Ops",
      desc: "Executes non-destructive diagnostic commands (prisma, df, ps, curl) inside running containers with credential masking.",
    },
    {
      name: "whizan_deploy_function",
      group: "Edge Functions",
      desc: "Deploys lightweight V8 edge functions with sub-5ms cold starts without Docker overhead.",
    },
    {
      name: "whizan_create_cron_job",
      group: "Scheduled Compute",
      desc: "Configures zero-idle cron pipelines that invoke functions, containers, or webhooks via Redis Sorted Sets.",
    },
    {
      name: "whizan_inspect_deployment",
      group: "Inspection",
      desc: "Inspects live runtime state: container ID, running status, memory limits, host port mapping, and restart counts.",
    },
  ];

  return (
    <div className="page" style={{ maxWidth: 1040, margin: "0 auto", paddingBottom: "4rem" }}>
      {/* ── Page Header ── */}
      <div style={{ marginBottom: "2rem" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "rgba(99, 102, 241, 0.12)",
            border: "1px solid rgba(99, 102, 241, 0.28)",
            borderRadius: "9999px",
            padding: "0.22rem 0.8rem",
            marginBottom: "0.85rem",
          }}
        >
          <Sparkles size={13} style={{ color: "#38bdf8" }} />
          <span
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "#a5b4fc",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Developer Tooling Ecosystem
          </span>
        </div>

        <h1
          style={{
            fontSize: "2rem",
            fontWeight: 800,
            letterSpacing: "-0.035em",
            marginBottom: "0.5rem",
            background: "linear-gradient(135deg, #ffffff 40%, #e2e8f0 75%, #818cf8 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          MCP &amp; CLI Developer Tools
        </h1>
        <p
          style={{
            fontSize: "0.95rem",
            color: "#94a3b8",
            maxWidth: 780,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Control Whizan Cloud from anywhere: empower your AI editors (Cursor, Claude, Antigravity) with automated DevOps tools via Model Context Protocol, or manage deployments and live telemetry directly from your terminal.
        </p>

        {/* Global Navigation Tabs */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            marginTop: "1.5rem",
            padding: "0.35rem",
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-sm)",
            width: "fit-content",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => setActiveTab("mcp")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1rem",
              borderRadius: 8,
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
              border: "none",
              background: activeTab === "mcp" ? "#4f46e5" : "transparent",
              color: activeTab === "mcp" ? "#ffffff" : "var(--muted)",
              boxShadow: activeTab === "mcp" ? "0 2px 8px rgba(79, 70, 229, 0.25)" : "none",
            }}
          >
            <Sparkles size={15} />
            <span>AI MCP Server</span>
            <span
              style={{
                fontSize: "0.68rem",
                padding: "0.1rem 0.4rem",
                borderRadius: 4,
                background: activeTab === "mcp" ? "rgba(255,255,255,0.2)" : "#f1f5f9",
                color: activeTab === "mcp" ? "#ffffff" : "var(--muted)",
              }}
            >
              v1.0.5
            </span>
          </button>

          <button
            onClick={() => setActiveTab("cli")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1rem",
              borderRadius: 8,
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
              border: "none",
              background: activeTab === "cli" ? "#4f46e5" : "transparent",
              color: activeTab === "cli" ? "#ffffff" : "var(--muted)",
              boxShadow: activeTab === "cli" ? "0 2px 8px rgba(79, 70, 229, 0.25)" : "none",
            }}
          >
            <Terminal size={15} />
            <span>Whizan CLI Docs</span>
            <span
              style={{
                fontSize: "0.68rem",
                padding: "0.1rem 0.4rem",
                borderRadius: 4,
                background: activeTab === "cli" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)",
                color: activeTab === "cli" ? "#ffffff" : "#94a3b8",
              }}
            >
              v1.0.3
            </span>
          </button>

          <button
            onClick={() => setActiveTab("keys")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1rem",
              borderRadius: 8,
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
              border: "none",
              background: activeTab === "keys" ? "#6366f1" : "transparent",
              color: activeTab === "keys" ? "#ffffff" : "#94a3b8",
              boxShadow: activeTab === "keys" ? "0 4px 12px rgba(99, 102, 241, 0.3)" : "none",
            }}
          >
            <KeyRound size={15} />
            <span>API Keys</span>
            {keys.length > 0 && (
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "0.1rem 0.4rem",
                  borderRadius: 4,
                  background: activeTab === "keys" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)",
                  color: activeTab === "keys" ? "#ffffff" : "#94a3b8",
                }}
              >
                {keys.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("tools")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1rem",
              borderRadius: 8,
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease",
              border: "none",
              background: activeTab === "tools" ? "#6366f1" : "transparent",
              color: activeTab === "tools" ? "#ffffff" : "#94a3b8",
              boxShadow: activeTab === "tools" ? "0 4px 12px rgba(99, 102, 241, 0.3)" : "none",
            }}
          >
            <Sliders size={15} />
            <span>Agent Tools</span>
            <span
              style={{
                fontSize: "0.68rem",
                padding: "0.1rem 0.4rem",
                borderRadius: 4,
                background: activeTab === "tools" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.06)",
                color: activeTab === "tools" ? "#ffffff" : "#94a3b8",
              }}
            >
              12 Tools
            </span>
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1: MCP SERVER FOR AI EDITORS
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "mcp" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* Explanation Banner */}
          <div
            style={{
              background: "linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(56, 189, 248, 0.05) 100%)",
              border: "1px solid rgba(99, 102, 241, 0.25)",
              borderRadius: 14,
              padding: "1.25rem 1.5rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "1rem",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "rgba(99, 102, 241, 0.2)",
                color: "#818cf8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "var(--foreground)" }}>
                What is Whizan MCP?
              </h3>
              <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0, lineHeight: 1.55 }}>
                The Model Context Protocol (MCP) connects your AI coding assistant (Cursor, Claude Desktop, Antigravity, Windsurf) directly to your Whizan Cloud account. Your agent can inspect your workspace, deploy apps, stream live compilation errors, fix code, and provision databases right from your chat window.
              </p>
            </div>
          </div>

          {/* STEP 1: Installation & Auto-Setup */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)",
              borderRadius: 16,
              padding: "1.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #6366f1, #38bdf8)",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.82rem",
                  fontWeight: 800,
                }}
              >
                1
              </div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
                Install &amp; Auto-Configure Whizan MCP
              </h2>
            </div>
            <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "1.25rem", marginLeft: "2.5rem" }}>
              Choose any of the three commands below. Each command automatically discovers your installed AI editors and writes the configuration for you.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
              {/* Method A: Via CLI */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "1.2rem 1.25rem",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        color: "var(--accent)",
                        background: "rgba(99, 102, 241, 0.1)",
                        border: "1px solid rgba(99, 102, 241, 0.25)",
                        padding: "0.15rem 0.5rem",
                        borderRadius: 9999,
                      }}
                    >
                      RECOMMENDED
                    </span>
                    <strong style={{ fontSize: "0.92rem", color: "var(--foreground)" }}>
                      Method A — Via Whizan CLI (1-Click Auto Detector)
                    </strong>
                  </div>
                  <button
                    onClick={() => copyToClipboard("whizan mcp setup", "cmd-cli-setup")}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                  >
                    {copiedId === "cmd-cli-setup" ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                    {copiedId === "cmd-cli-setup" ? "Copied" : "Copy Command"}
                  </button>
                </div>

                <div
                  style={{
                    background: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: 8,
                    padding: "0.75rem 1rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <code style={{ fontSize: "0.92rem", color: "#38bdf8", fontFamily: "var(--font-mono), monospace" }}>
                    whizan mcp setup
                  </code>
                </div>

                <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
                  <strong style={{ color: "var(--foreground)" }}>Description:</strong> Scans your operating system, automatically detects config paths for Cursor, Claude Desktop, Antigravity IDE, and Windsurf, and injects your Whizan API key. Requires <code style={{ color: "var(--accent)" }}>npm install -g @whizan/cli</code>.
                </p>
              </div>

              {/* Method B: Direct NPX */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "1.2rem 1.25rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        color: "var(--accent)",
                        background: "rgba(99, 102, 241, 0.08)",
                        border: "1px solid rgba(99, 102, 241, 0.2)",
                        padding: "0.15rem 0.5rem",
                        borderRadius: 9999,
                      }}
                    >
                      ZERO INSTALL
                    </span>
                    <strong style={{ fontSize: "0.92rem", color: "var(--foreground)" }}>
                      Method B — Direct NPX Installer Wizard
                    </strong>
                  </div>
                  <button
                    onClick={() => copyToClipboard("npx -y @whizan/mcp-devops install", "cmd-npx-setup")}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                  >
                    {copiedId === "cmd-npx-setup" ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                    {copiedId === "cmd-npx-setup" ? "Copied" : "Copy Command"}
                  </button>
                </div>

                <div
                  style={{
                    background: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: 8,
                    padding: "0.75rem 1rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <code style={{ fontSize: "0.92rem", color: "#38bdf8", fontFamily: "var(--font-mono), monospace" }}>
                    npx -y @whizan/mcp-devops install
                  </code>
                </div>

                <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
                  <strong style={{ color: "var(--foreground)" }}>Description:</strong> Interactive wizard that runs directly via Node.js without globally installing the CLI. Prompts you to select your editor and writes the configuration.
                </p>
              </div>

              {/* Method C: Claude Code */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "1.2rem 1.25rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        color: "#d97706",
                        background: "rgba(245, 158, 11, 0.1)",
                        border: "1px solid rgba(245, 158, 11, 0.25)",
                        padding: "0.15rem 0.5rem",
                        borderRadius: 9999,
                      }}
                    >
                      CLAUDE CODE
                    </span>
                    <strong style={{ fontSize: "0.92rem", color: "var(--foreground)" }}>
                      Method C — Claude Code CLI Native Add
                    </strong>
                  </div>
                  <button
                    onClick={() => copyToClipboard("claude mcp add whizan -- npx -y @whizan/mcp-devops", "cmd-claude-setup")}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                  >
                    {copiedId === "cmd-claude-setup" ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                    {copiedId === "cmd-claude-setup" ? "Copied" : "Copy Command"}
                  </button>
                </div>

                <div
                  style={{
                    background: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: 8,
                    padding: "0.75rem 1rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <code style={{ fontSize: "0.92rem", color: "#38bdf8", fontFamily: "var(--font-mono), monospace" }}>
                    claude mcp add whizan -- npx -y @whizan/mcp-devops
                  </code>
                </div>

                <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
                  <strong style={{ color: "var(--foreground)" }}>Description:</strong> If you use Anthropic&apos;s Claude Code terminal assistant, this command registers Whizan MCP as a permanent tool provider in your Claude session.
                </p>
              </div>
            </div>
          </div>

          {/* STEP 2: Manual Editor Configuration */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)",
              borderRadius: 16,
              padding: "1.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--bg-inset)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.82rem",
                    fontWeight: 800,
                  }}
                >
                  2
                </div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
                  Manual Editor Configuration
                </h2>
              </div>

              {/* IDE Selector Tabs */}
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                {(Object.keys(ideConfigs) as IdeTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveIde(tab)}
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      padding: "0.35rem 0.75rem",
                      borderRadius: 8,
                      border: "1px solid",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      borderColor: activeIde === tab ? "var(--accent)" : "var(--border)",
                      background: activeIde === tab ? "rgba(99, 102, 241, 0.08)" : "var(--bg-inset)",
                      color: activeIde === tab ? "var(--accent)" : "var(--muted)",
                    }}
                  >
                    {ideConfigs[tab].label}
                  </button>
                ))}
              </div>
            </div>

            <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "1rem", marginLeft: "2.5rem" }}>
              If you prefer to configure manually, paste this JSON block into your editor&apos;s configuration file:
            </p>

            {/* Target File Location Tag */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "var(--bg-inset)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "0.35rem 0.75rem",
                fontSize: "0.78rem",
                color: "var(--foreground)",
                marginBottom: "0.85rem",
              }}
            >
              <FileCode2 size={13} style={{ color: "var(--accent)" }} />
              <span>Target File:</span>
              <code style={{ color: "var(--accent)", fontFamily: "var(--font-mono), monospace" }}>
                {ideConfigs[activeIde].location}
              </code>
            </div>

            {/* JSON Code Snippet */}
            <div
              style={{
                position: "relative",
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.6rem 1rem",
                  background: "#1e293b",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                <span style={{ fontSize: "0.78rem", color: "#94a3b8", fontFamily: "var(--font-mono), monospace" }}>
                  {ideConfigs[activeIde].file}
                </span>
                <button
                  onClick={() => copyToClipboard(ideConfigs[activeIde].config, "ide-json-copy")}
                  className="btn btn-secondary btn-sm"
                  style={{
                    fontSize: "0.78rem",
                    padding: "0.3rem 0.65rem",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  {copiedId === "ide-json-copy" ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                  {copiedId === "ide-json-copy" ? "Copied JSON" : "Copy Configuration"}
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "1.2rem",
                  fontSize: "0.85rem",
                  color: "#f1f5f9",
                  fontFamily: "var(--font-mono), monospace",
                  overflowX: "auto",
                  lineHeight: 1.5,
                }}
              >
                {ideConfigs[activeIde].config}
              </pre>
            </div>
          </div>

          {/* STEP 3: Verification & How to Prompt your AI */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)",
              borderRadius: 16,
              padding: "1.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.82rem",
                  fontWeight: 800,
                }}
              >
                3
              </div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
                Verify &amp; Ready-to-Use Agent Prompts
              </h2>
            </div>
            <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "1.25rem", marginLeft: "2.5rem" }}>
              Restart your editor. Then open any repository and copy one of these prompts to test:
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1rem" }}>
              {samplePrompts.map((p, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "var(--bg-inset)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "1.1rem 1.25rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          color: "var(--accent)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        {p.category}
                      </span>
                      <button
                        onClick={() => copyToClipboard(p.prompt, `prompt-${idx}`)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: "0.74rem", padding: "0.2rem 0.55rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                      >
                        {copiedId === `prompt-${idx}` ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                        {copiedId === `prompt-${idx}` ? "Copied" : "Copy Prompt"}
                      </button>
                    </div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.5rem" }}>
                      {p.title}
                    </div>
                    <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
                      &ldquo;{p.prompt}&rdquo;
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2: WHIZAN CLI COMPLETE DOCUMENTATION
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "cli" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* CLI Hero Banner */}
          <div
            style={{
              background: "linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%)",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              borderRadius: 14,
              padding: "1.25rem 1.5rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "1rem",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "rgba(56, 189, 248, 0.2)",
                color: "#38bdf8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Terminal size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.25rem 0", color: "var(--foreground)" }}>
                Whizan Cloud CLI (`@whizan/cli`)
              </h3>
              <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0, lineHeight: 1.55 }}>
                Deploy frontends and backends directly from your terminal, stream live build worker output, launch the interactive real-time dashboard (<code style={{ color: "#38bdf8" }}>whizan top</code>), and troubleshoot issues with AI-assisted log diagnostics.
              </p>
            </div>
          </div>

          {/* STEP 1: Installation */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)",
              borderRadius: 16,
              padding: "1.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #38bdf8, #818cf8)",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.82rem",
                  fontWeight: 800,
                }}
              >
                1
              </div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
                Install Whizan CLI
              </h2>
            </div>
            <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "1.25rem", marginLeft: "2.5rem" }}>
              Install the CLI globally on your system using your package manager of choice:
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
              {/* NPM */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "1rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>npm</span>
                  <button
                    onClick={() => copyToClipboard("npm install -g @whizan/cli", "cli-npm-install")}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.74rem", padding: "0.2rem 0.5rem" }}
                  >
                    {copiedId === "cli-npm-install" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
                <code style={{ fontSize: "0.88rem", color: "var(--accent)", fontFamily: "var(--font-mono), monospace" }}>
                  npm install -g @whizan/cli
                </code>
              </div>

              {/* PNPM */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "1rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>pnpm</span>
                  <button
                    onClick={() => copyToClipboard("pnpm add -g @whizan/cli", "cli-pnpm-install")}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.74rem", padding: "0.2rem 0.5rem" }}
                  >
                    {copiedId === "cli-pnpm-install" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
                <code style={{ fontSize: "0.88rem", color: "var(--accent)", fontFamily: "var(--font-mono), monospace" }}>
                  pnpm add -g @whizan/cli
                </code>
              </div>

              {/* NPX Zero Install */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "1rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: 600 }}>npx (Zero Install)</span>
                  <button
                    onClick={() => copyToClipboard("npx @whizan/cli --help", "cli-npx-install")}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.74rem", padding: "0.2rem 0.5rem" }}
                  >
                    {copiedId === "cli-npx-install" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
                <code style={{ fontSize: "0.88rem", color: "var(--accent)", fontFamily: "var(--font-mono), monospace" }}>
                  npx @whizan/cli &lt;command&gt;
                </code>
              </div>
            </div>
          </div>

          {/* STEP 2: Authentication */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)",
              borderRadius: 16,
              padding: "1.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.82rem",
                  fontWeight: 800,
                }}
              >
                2
              </div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
                Login &amp; Authenticate
              </h2>
            </div>
            <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "1.25rem", marginLeft: "2.5rem" }}>
              Connect your terminal session to your Whizan Cloud account:
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1rem" }}>
              {/* Browser Login */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "1.2rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <strong style={{ fontSize: "0.9rem", color: "var(--foreground)" }}>Interactive Browser Login</strong>
                  <button
                    onClick={() => copyToClipboard("whizan login", "cmd-cli-login")}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.74rem" }}
                  >
                    {copiedId === "cmd-cli-login" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
                <div style={{ background: "#0f172a", border: "1px solid #1e293b", padding: "0.6rem 0.85rem", borderRadius: 6, marginBottom: "0.6rem" }}>
                  <code style={{ fontSize: "0.88rem", color: "#38bdf8" }}>whizan login</code>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0 }}>
                  Launches your default browser to authorize your terminal. Token is saved to <code style={{ color: "var(--accent)" }}>~/.whizan/config.json</code>.
                </p>
              </div>

              {/* Headless Token Login */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "1.2rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <strong style={{ fontSize: "0.9rem", color: "var(--foreground)" }}>Headless / CI/CD Token Login</strong>
                  <button
                    onClick={() => copyToClipboard("whizan login -t whz_live_YOUR_API_KEY", "cmd-cli-token")}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.74rem" }}
                  >
                    {copiedId === "cmd-cli-token" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
                <div style={{ background: "#0f172a", border: "1px solid #1e293b", padding: "0.6rem 0.85rem", borderRadius: 6, marginBottom: "0.6rem" }}>
                  <code style={{ fontSize: "0.88rem", color: "#38bdf8" }}>whizan login -t &lt;API_KEY&gt;</code>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0 }}>
                  Non-interactive login using an API key from your dashboard. Ideal for GitHub Actions and automation scripts.
                </p>
              </div>

              {/* Whoami */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "1.2rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <strong style={{ fontSize: "0.9rem", color: "var(--foreground)" }}>Check Active Session</strong>
                  <button
                    onClick={() => copyToClipboard("whizan whoami", "cmd-cli-whoami")}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.74rem" }}
                  >
                    {copiedId === "cmd-cli-whoami" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
                <div style={{ background: "#0f172a", border: "1px solid #1e293b", padding: "0.6rem 0.85rem", borderRadius: 6, marginBottom: "0.6rem" }}>
                  <code style={{ fontSize: "0.88rem", color: "#38bdf8" }}>whizan whoami</code>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0 }}>
                  Prints your email, user role, subscription tier, and counts of active services and databases.
                </p>
              </div>

              {/* Logout */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "1.2rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <strong style={{ fontSize: "0.9rem", color: "var(--foreground)" }}>Sign Out</strong>
                  <button
                    onClick={() => copyToClipboard("whizan logout", "cmd-cli-logout")}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.74rem" }}
                  >
                    {copiedId === "cmd-cli-logout" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
                <div style={{ background: "#0f172a", border: "1px solid #1e293b", padding: "0.6rem 0.85rem", borderRadius: 6, marginBottom: "0.6rem" }}>
                  <code style={{ fontSize: "0.88rem", color: "#38bdf8" }}>whizan logout</code>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0 }}>
                  Securely purges the local credentials file from your home directory.
                </p>
              </div>
            </div>
          </div>

          {/* STEP 3: Deploying Projects */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)",
              borderRadius: 16,
              padding: "1.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.82rem",
                  fontWeight: 800,
                }}
              >
                3
              </div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
                Initialize, Link &amp; Deploy
              </h2>
            </div>
            <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "1.25rem", marginLeft: "2.5rem" }}>
              Three simple commands to take any local code repository straight to production:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* whizan init */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "1rem 1.25rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                  <span style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--foreground)" }}>
                    1. <code style={{ color: "var(--accent)" }}>whizan init</code>
                  </span>
                  <button
                    onClick={() => copyToClipboard("whizan init", "cmd-whizan-init")}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.74rem" }}
                  >
                    {copiedId === "cmd-whizan-init" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
                  Inspects your repository files, detects runtime (Node, Python, Go, Dockerfile), discovers internal HTTP ports, and creates a local <code style={{ color: "var(--accent)" }}>.whizan.json</code> manifest.
                </p>
              </div>

              {/* whizan link */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "1rem 1.25rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                  <span style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--foreground)" }}>
                    2. <code style={{ color: "var(--accent)" }}>whizan link</code>
                  </span>
                  <button
                    onClick={() => copyToClipboard("whizan link", "cmd-whizan-link")}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.74rem" }}
                  >
                    {copiedId === "cmd-whizan-link" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
                  Interactively binds the local directory to an existing cloud project or backend microservice. Future deployments will automatically update this resource.
                </p>
              </div>

              {/* whizan deploy */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "1rem 1.25rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                  <span style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--foreground)" }}>
                    3. <code style={{ color: "var(--accent)" }}>whizan deploy</code>
                  </span>
                  <button
                    onClick={() => copyToClipboard("whizan deploy", "cmd-whizan-deploy")}
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: "0.74rem" }}
                  >
                    {copiedId === "cmd-whizan-deploy" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                    {copiedId === "cmd-whizan-deploy" ? "Copied" : "Copy Command"}
                  </button>
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
                  Compresses the directory (respects <code style={{ color: "var(--accent)" }}>.gitignore</code>, skips node_modules), uploads to the build worker, streams live Docker compilation logs in your terminal, and prints the live <code style={{ color: "var(--accent)" }}>*.whizan.cloud</code> URL upon completion.
                </p>
              </div>
            </div>
          </div>

          {/* STEP 4: Live Telemetry & Monitoring */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)",
              borderRadius: 16,
              padding: "1.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.82rem",
                  fontWeight: 800,
                }}
              >
                4
              </div>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
                Monitoring, Logs &amp; Diagnostics
              </h2>
            </div>
            <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "1.25rem", marginLeft: "2.5rem" }}>
              Inspect live performance and debug container issues:
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
              {/* whizan top */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "1rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <code style={{ fontSize: "0.88rem", color: "var(--accent)", fontWeight: 700 }}>whizan top</code>
                  <button
                    onClick={() => copyToClipboard("whizan top", "cmd-cli-top")}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.74rem" }}
                  >
                    {copiedId === "cmd-cli-top" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0 }}>
                  Interactive full-terminal dashboard displaying real-time CPU %, RAM usage, container active/sleep states, and network I/O across your entire cluster.
                </p>
              </div>

              {/* whizan logs */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "1rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <code style={{ fontSize: "0.88rem", color: "var(--accent)", fontWeight: 700 }}>whizan logs</code>
                  <button
                    onClick={() => copyToClipboard("whizan logs", "cmd-cli-logs")}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.74rem" }}
                  >
                    {copiedId === "cmd-cli-logs" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0 }}>
                  Streams live build worker stdout/stderr or tailing runtime container logs. Add <code style={{ color: "var(--accent)" }}>-f</code> for continuous streaming.
                </p>
              </div>

              {/* whizan logs --ai */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "1rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <code style={{ fontSize: "0.88rem", color: "var(--accent)", fontWeight: 700 }}>whizan logs --ai</code>
                  <button
                    onClick={() => copyToClipboard("whizan logs --ai", "cmd-cli-logs-ai")}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.74rem" }}
                  >
                    {copiedId === "cmd-cli-logs-ai" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0 }}>
                  AI-assisted root cause analyzer. Automatically feeds compilation crash traces to Gemini 3.5 Flash Lite to diagnose the fatal error and print the code fix.
                </p>
              </div>

              {/* whizan ps */}
              <div
                style={{
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "1rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <code style={{ fontSize: "0.88rem", color: "var(--accent)", fontWeight: 700 }}>whizan ps</code>
                  <button
                    onClick={() => copyToClipboard("whizan ps", "cmd-cli-ps")}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.74rem" }}
                  >
                    {copiedId === "cmd-cli-ps" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0 }}>
                  Prints a formatted table of all running projects, backend microservices, and databases with their active ports, status, and public URLs.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3: API KEYS & MACHINE AUTH
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "keys" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* Header Card */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)",
              borderRadius: 16,
              padding: "1.75rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 0.35rem 0", color: "var(--foreground)" }}>
                  API Keys &amp; Machine Tokens
                </h2>
                <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>
                  API keys authorize the Whizan MCP server and Whizan CLI to act on your account. Keys are prefixed with <code style={{ color: "var(--accent)" }}>whz_live_</code>.
                </p>
              </div>

              {/* Generate Form */}
              <form onSubmit={handleCreateKey} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <input
                  type="text"
                  placeholder="Key label (e.g. Cursor MacBook)"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="input"
                  style={{
                    padding: "0.45rem 0.85rem",
                    fontSize: "0.82rem",
                    minWidth: 220,
                  }}
                />
                <button
                  type="submit"
                  disabled={creatingKey}
                  className="btn btn-primary"
                  style={{ fontSize: "0.82rem", padding: "0.45rem 0.9rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                >
                  <Plus size={14} />
                  <span>{creatingKey ? "Generating..." : "Generate Key"}</span>
                </button>
              </form>
            </div>

            {/* Newly Created Key Alert */}
            {newKey && (
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: 10,
                  padding: "1rem 1.25rem",
                  marginBottom: "1.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#059669", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                    <CheckCircle2 size={16} /> New API Key Generated
                  </span>
                  <button
                    onClick={() => copyToClipboard(newKey.key, "copy-new-key")}
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.65rem" }}
                  >
                    {copiedId === "copy-new-key" ? <Check size={12} color="#fff" /> : <Copy size={12} />}
                    {copiedId === "copy-new-key" ? "Copied Secret!" : "Copy Full Secret"}
                  </button>
                </div>
                <div style={{ background: "#0f172a", border: "1px solid #1e293b", padding: "0.6rem 0.85rem", borderRadius: 6, marginBottom: "0.35rem" }}>
                  <code style={{ fontSize: "0.85rem", color: "#38bdf8", wordBreak: "break-all" }}>
                    {newKey.key}
                  </code>
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: 0 }}>
                  Make sure to copy this key now. For security purposes, full secret strings cannot be recovered after this session.
                </p>
              </div>
            )}

            {/* Keys Table */}
            {loadingKeys ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>Loading active keys...</div>
            ) : keys.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
                No active API keys found. Generate one above to connect your AI editor or terminal.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {keys.map((k) => (
                  <div
                    key={k.id}
                    style={{
                      background: "var(--bg-inset)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "0.85rem 1.15rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "1rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--foreground)" }}>{k.name}</span>
                        <code style={{ fontSize: "0.75rem", color: "var(--accent)", background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.15)", padding: "0.1rem 0.4rem", borderRadius: 4 }}>
                          {k.keyPrefix}••••••••
                        </code>
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                        Created: {new Date(k.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <button
                      onClick={() => handleDeleteKey(k.id)}
                      className="btn btn-ghost btn-sm"
                      style={{ color: "#ef4444", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                    >
                      <Trash2 size={13} />
                      <span>Revoke</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 4: MCP TOOLS CATALOG
         ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === "tools" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              boxShadow: "var(--shadow)",
              borderRadius: 16,
              padding: "1.75rem",
            }}
          >
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 0.35rem 0", color: "var(--foreground)" }}>
              Automated AI Agent Tools Reference
            </h2>
            <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
              When connected via MCP, your AI assistant autonomously decides when to invoke these tools to satisfy your prompts:
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1rem" }}>
              {toolsList.map((t, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "var(--bg-inset)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "1.1rem 1.25rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <code style={{ fontSize: "0.85rem", color: "var(--accent)", fontWeight: 700 }}>
                      {t.name}
                    </code>
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--muted)",
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        padding: "0.15rem 0.45rem",
                        borderRadius: 4,
                      }}
                    >
                      {t.group}
                    </span>
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
                    {t.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
