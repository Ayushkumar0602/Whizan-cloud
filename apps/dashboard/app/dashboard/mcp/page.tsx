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
  Eye,
  EyeOff,
  CheckCircle2,
  ExternalLink,
  Cpu,
  Clock,
  Workflow
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

type IdeTab = "cursor" | "claude" | "antigravity" | "windsurf" | "vscode";

export default function McpDevOpsPage() {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes("localhost")
      ? process.env.NEXT_PUBLIC_API_URL
      : "https://whizan-cloud-service.onrender.com";

  const [activeIde, setActiveIde] = useState<IdeTab>("cursor");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // API Key State
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null);
  const [keyName, setKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [showKeySecret, setShowKeySecret] = useState(false);

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
      const created = await apiKeysApi.create(keyName.trim() || "MCP IDE Key");
      setNewKey(created);
      setKeyName("");
      setShowKeySecret(true);
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
  const activeKeyString = newKey?.key || (keys[0]?.keyPrefix ? `${keys[0].keyPrefix}...` : "whz_live_YOUR_API_KEY");
  const fullUsableKey = newKey?.key || (keys.length > 0 ? (keys[0].keyPrefix ? `${keys[0].keyPrefix}REPLACE_WITH_YOUR_SECRET` : "whz_live_YOUR_API_KEY") : "whz_live_YOUR_API_KEY");

  // IDE Configuration Specs
  const ideConfigs: Record<
    IdeTab,
    { label: string; file: string; location: string; config: string }
  > = {
    cursor: {
      label: "Cursor",
      file: ".cursor/mcp.json",
      location: "Project root (.cursor/mcp.json) or global (~/.cursor/mcp.json)",
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
      label: "Claude Code / Desktop",
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
      location: "Extension MCP settings file",
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
      category: "Deploy",
      prompt:
        "Analyze this workspace with Whizan MCP. Ensure backend binds to 0.0.0.0 with process.env.PORT, package the code via direct upload, and deploy it to Whizan Cloud.",
    },
    {
      title: "Self-Heal Build & Deploy Failure",
      category: "Diagnostics",
      prompt:
        "My recent Whizan deployment failed. Use whizan_get_build_logs to inspect the compilation error, patch the source code, and trigger a redeploy.",
    },
    {
      title: "Provision Managed Database",
      category: "Database",
      prompt:
        "Provision a managed PostgreSQL database on Whizan Cloud using Whizan MCP and wire the connection string into the service environment variables.",
    },
    {
      title: "Run Container Health & Migration",
      category: "Exec",
      prompt:
        "Inspect the running container with whizan_inspect_deployment and run 'npx prisma migrate status' using whizan_exec_container_command.",
    },
  ];

  const toolsList = [
    {
      name: "whizan_analyze_workspace",
      group: "Audit & Stack",
      desc: "Inspects package manifests, entry points, internal ports, and flags 127.0.0.1 localhost traps.",
    },
    {
      name: "whizan_deploy_direct",
      group: "Deployment",
      desc: "Compresses local code (respecting .gitignore, omitting node_modules) and deploys straight to Azure VM.",
    },
    {
      name: "whizan_redeploy",
      group: "Deployment",
      desc: "Triggers a zero-downtime rebuild and container cutover for existing projects or services.",
    },
    {
      name: "whizan_get_build_logs",
      group: "Diagnostics",
      desc: "Streams live Docker and compilation logs from the Azure VM worker during and after build.",
    },
    {
      name: "whizan_check_health",
      group: "Verification",
      desc: "Probes public HTTP 200 readiness and verifies edge routing connectivity on *.nip.io.",
    },
    {
      name: "whizan_create_project",
      group: "Frontend",
      desc: "Registers frontend projects (Vite, Next.js SSR, React, Astro) with edge CDN routing.",
    },
    {
      name: "whizan_create_service",
      group: "Backend",
      desc: "Provisions containerized microservices (Node.js, Python, Go, Rust, Java, Dockerfile).",
    },
    {
      name: "whizan_provision_database",
      group: "Databases",
      desc: "Provisions PostgreSQL (with connection pooling), Redis cache, or MySQL instances.",
    },
    {
      name: "whizan_exec_container_command",
      group: "Live Ops",
      desc: "Executes non-destructive diagnostic commands (prisma, df, ps, curl) inside running containers.",
    },
    {
      name: "whizan_deploy_function",
      group: "Edge Functions",
      desc: "Deploys lightweight V8 edge functions with sub-5ms cold starts without Docker overhead.",
    },
    {
      name: "whizan_create_cron_job",
      group: "Scheduled Compute",
      desc: "Configures zero-idle cron pipelines that invoke functions, containers, or webhooks.",
    },
  ];

  return (
    <div className="page" style={{ maxWidth: 960, margin: "0 auto", paddingBottom: "3rem" }}>
      {/* Page Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(99, 102, 241, 0.12)", border: "1px solid rgba(99, 102, 241, 0.25)", borderRadius: "9999px", padding: "0.2rem 0.75rem", marginBottom: "0.85rem" }}>
          <Sparkles size={13} style={{ color: "#38bdf8" }} />
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#818cf8", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Model Context Protocol
          </span>
        </div>
        <h1 style={{ fontSize: "1.85rem", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: "0.5rem" }}>
          MCP &amp; DevOps Integration
        </h1>
        <p style={{ fontSize: "0.95rem", color: "var(--muted)", maxWidth: 740, lineHeight: 1.55 }}>
          Connect your AI editor directly to Whizan Cloud. Your agent can audit code, package and deploy backends, stream live build logs, provision databases, and auto-fix deployment errors from chat.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--card-border)", padding: "0.25rem 0.65rem", borderRadius: "6px", fontSize: "0.78rem", color: "var(--foreground)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
            @whizan/mcp-devops v1.0.5
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--card-border)", padding: "0.25rem 0.65rem", borderRadius: "6px", fontSize: "0.78rem", color: "var(--muted)" }}>
            Stdio Transport
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--card-border)", padding: "0.25rem 0.65rem", borderRadius: "6px", fontSize: "0.78rem", color: "var(--muted)" }}>
            JSON-RPC 2.0
          </span>
        </div>
      </div>

      {/* 1. Quick Connect (The Fastest Way) */}
      <div className="card" style={{ marginBottom: "1.75rem", padding: "1.4rem 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.85rem" }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700 }}>
            1
          </div>
          <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>
            Quick Setup (Recommended)
          </h2>
        </div>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 1rem 0" }}>
          Run one command in your terminal to automatically register Whizan MCP across your installed editors:
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {/* CLI Setup */}
          <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--card-border)", borderRadius: "8px", padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: "0.25rem" }}>
                Via Whizan CLI (Auto-detects Cursor, Claude, Antigravity, Windsurf)
              </div>
              <code style={{ fontSize: "0.88rem", color: "#38bdf8", fontFamily: "var(--font-mono), monospace" }}>
                whizan mcp setup
              </code>
            </div>
            <button
              onClick={() => copyToClipboard("whizan mcp setup", "cmd-whizan-setup")}
              className="btn btn-secondary btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem" }}
            >
              {copiedId === "cmd-whizan-setup" ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
              {copiedId === "cmd-whizan-setup" ? "Copied" : "Copy"}
            </button>
          </div>

          {/* Claude Code */}
          <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--card-border)", borderRadius: "8px", padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: "0.25rem" }}>
                Via Claude Code CLI
              </div>
              <code style={{ fontSize: "0.88rem", color: "#38bdf8", fontFamily: "var(--font-mono), monospace" }}>
                claude mcp add whizan -- npx -y @whizan/mcp-devops
              </code>
            </div>
            <button
              onClick={() => copyToClipboard("claude mcp add whizan -- npx -y @whizan/mcp-devops", "cmd-claude-setup")}
              className="btn btn-secondary btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem" }}
            >
              {copiedId === "cmd-claude-setup" ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
              {copiedId === "cmd-claude-setup" ? "Copied" : "Copy"}
            </button>
          </div>

          {/* Direct NPX */}
          <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--card-border)", borderRadius: "8px", padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: "0.25rem" }}>
                Zero-install direct NPX setup
              </div>
              <code style={{ fontSize: "0.88rem", color: "#38bdf8", fontFamily: "var(--font-mono), monospace" }}>
                npx -y @whizan/mcp-devops install
              </code>
            </div>
            <button
              onClick={() => copyToClipboard("npx -y @whizan/mcp-devops install", "cmd-npx-install")}
              className="btn btn-secondary btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem" }}
            >
              {copiedId === "cmd-npx-install" ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
              {copiedId === "cmd-npx-install" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Manual IDE Configuration */}
      <div className="card" style={{ marginBottom: "1.75rem", padding: "1.4rem 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700 }}>
              2
            </div>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>
              Manual IDE Configuration
            </h2>
          </div>

          {/* IDE Selector Tabs */}
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {(Object.keys(ideConfigs) as IdeTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveIde(tab)}
                className={`btn btn-sm ${activeIde === tab ? "btn-primary" : "btn-secondary"}`}
                style={{ fontSize: "0.78rem", padding: "0.3rem 0.65rem" }}
              >
                {ideConfigs[tab].label}
              </button>
            ))}
          </div>
        </div>

        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
          File: <code style={{ color: "#818cf8" }}>{ideConfigs[activeIde].file}</code> •{" "}
          <span style={{ color: "var(--muted)" }}>{ideConfigs[activeIde].location}</span>
        </p>

        {/* JSON Preview Block */}
        <div style={{ position: "relative", background: "#05070a", border: "1px solid var(--card-border)", borderRadius: "8px", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0.85rem", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--card-border)" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontFamily: "var(--font-mono), monospace" }}>
              {ideConfigs[activeIde].file}
            </span>
            <button
              onClick={() => copyToClipboard(ideConfigs[activeIde].config, "ide-json")}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: "0.75rem", padding: "0.25rem 0.55rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
            >
              {copiedId === "ide-json" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
              {copiedId === "ide-json" ? "Copied JSON" : "Copy JSON"}
            </button>
          </div>
          <pre style={{ margin: 0, padding: "1rem", fontSize: "0.82rem", color: "#e2e8f0", fontFamily: "var(--font-mono), monospace", overflowX: "auto", lineHeight: 1.45 }}>
            {ideConfigs[activeIde].config}
          </pre>
        </div>
      </div>

      {/* 3. API Key & Machine Auth */}
      <div className="card" style={{ marginBottom: "1.75rem", padding: "1.4rem 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700 }}>
              3
            </div>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>
              API Key Authentication
            </h2>
          </div>

          <Link
            href="/dashboard/mcp/api-keys"
            className="btn btn-ghost btn-sm"
            style={{ fontSize: "0.78rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
          >
            Manage all keys <ExternalLink size={12} />
          </Link>
        </div>

        <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 1rem 0" }}>
          Provide an API key in your IDE config to authorize deployment actions. Keys are scoped strictly to your account.
        </p>

        {/* Newly Created Key Alert */}
        {newKey && (
          <div style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", padding: "0.85rem 1rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#10b981", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <CheckCircle2 size={14} /> New API Key Created (Copy it now; it won&apos;t be shown again)
              </span>
              <button
                onClick={() => copyToClipboard(newKey.key, "new-key-copy")}
                className="btn btn-primary btn-sm"
                style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
              >
                {copiedId === "new-key-copy" ? "Copied!" : "Copy Full Key"}
              </button>
            </div>
            <code style={{ fontSize: "0.82rem", color: "#38bdf8", wordBreak: "break-all" }}>
              {newKey.key}
            </code>
          </div>
        )}

        {/* Existing Keys or Quick Generate */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.75rem" }}>
          {keys.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {keys.slice(0, 3).map((k) => (
                <div
                  key={k.id}
                  style={{
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid var(--card-border)",
                    borderRadius: "6px",
                    padding: "0.6rem 0.85rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <KeyRound size={14} style={{ color: "var(--accent)" }} />
                    <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{k.name}</span>
                    <code style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                      {k.keyPrefix ? `${k.keyPrefix}...` : "whz_live_..."}
                    </code>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <button
                      onClick={() => copyToClipboard(k.keyPrefix ? `${k.keyPrefix}...` : "whz_live_...", `prefix-${k.id}`)}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                      title="Copy key prefix"
                    >
                      {copiedId === `prefix-${k.id}` ? "Copied" : "Copy Prefix"}
                    </button>
                    <button
                      onClick={() => handleDeleteKey(k.id)}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem", color: "var(--danger)" }}
                      title="Revoke key"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: 0 }}>
              No API keys yet. Create one below to enable automated deployments.
            </p>
          )}

          {/* Quick Create Key Form */}
          <form
            onSubmit={handleCreateKey}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginTop: "0.5rem",
              flexWrap: "wrap",
            }}
          >
            <input
              type="text"
              className="input"
              placeholder="Key label (e.g. Cursor IDE)"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              style={{ maxWidth: 260, fontSize: "0.82rem", padding: "0.4rem 0.75rem" }}
            />
            <button
              type="submit"
              disabled={creatingKey}
              className="btn btn-primary btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem" }}
            >
              <Plus size={13} />
              {creatingKey ? "Creating…" : "Generate New Key"}
            </button>
          </form>
        </div>
      </div>

      {/* 4. Practical Agent Prompts */}
      <div className="card" style={{ marginBottom: "1.75rem", padding: "1.4rem 1.5rem" }}>
        <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 0.4rem 0" }}>
          Ready-to-Use Agent Prompts
        </h2>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 1rem 0" }}>
          Copy and paste these commands into your IDE chat (Cursor Composer, Claude Code, Antigravity):
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.75rem" }}>
          {samplePrompts.map((p, idx) => (
            <div
              key={idx}
              style={{
                background: "rgba(0,0,0,0.25)",
                border: "1px solid var(--card-border)",
                borderRadius: "8px",
                padding: "0.85rem 1rem",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "0.6rem",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--foreground)" }}>
                    {p.title}
                  </span>
                  <span style={{ fontSize: "0.7rem", color: "var(--accent)", background: "rgba(99, 102, 241, 0.1)", padding: "0.15rem 0.45rem", borderRadius: "4px" }}>
                    {p.category}
                  </span>
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--muted)", lineHeight: 1.45, margin: 0 }}>
                  &ldquo;{p.prompt}&rdquo;
                </p>
              </div>

              <button
                onClick={() => copyToClipboard(p.prompt, `prompt-${idx}`)}
                className="btn btn-secondary btn-sm"
                style={{ alignSelf: "flex-start", fontSize: "0.75rem", padding: "0.25rem 0.55rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
              >
                {copiedId === `prompt-${idx}` ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                {copiedId === `prompt-${idx}` ? "Copied Prompt" : "Copy Prompt"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Tool Reference Table */}
      <div className="card" style={{ padding: "1.4rem 1.5rem" }}>
        <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 0.4rem 0" }}>
          Available DevOps Tools
        </h2>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 1rem 0" }}>
          The MCP server exposes these native functions to your AI agent:
        </p>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)", textAlign: "left" }}>
                <th style={{ padding: "0.6rem 0.75rem", color: "var(--muted)", fontWeight: 600 }}>Tool Name</th>
                <th style={{ padding: "0.6rem 0.75rem", color: "var(--muted)", fontWeight: 600 }}>Category</th>
                <th style={{ padding: "0.6rem 0.75rem", color: "var(--muted)", fontWeight: 600 }}>Purpose</th>
              </tr>
            </thead>
            <tbody>
              {toolsList.map((t, i) => (
                <tr
                  key={t.name}
                  style={{
                    borderBottom: i === toolsList.length - 1 ? "none" : "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <td style={{ padding: "0.6rem 0.75rem", fontFamily: "var(--font-mono), monospace", color: "#38bdf8", fontWeight: 500 }}>
                    {t.name}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {t.group}
                  </td>
                  <td style={{ padding: "0.6rem 0.75rem", color: "var(--foreground)", lineHeight: 1.4 }}>
                    {t.desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
