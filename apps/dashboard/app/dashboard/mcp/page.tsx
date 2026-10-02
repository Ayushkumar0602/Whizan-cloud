"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import { getApiBase, apiKeysApi, type ApiKeyItem, type CreatedApiKey } from "@/lib/api";
import {
  Bot,
  Sparkles,
  Copy,
  Check,
  Terminal,
  Zap,
  Shield,
  Layers,
  ArrowRight,
  Code2,
  Cpu,
  Key,
  Database,
  Globe,
  Server,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileCode,
  FolderArchive,
  RefreshCw,
  Plus,
  Trash2,
  KeyRound
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function McpGuidePage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes("localhost")
    ? process.env.NEXT_PUBLIC_API_URL
    : "https://whizan-cloud-service.onrender.com";
  const [activeTab, setActiveTab] = useState<"antigravity" | "cursor" | "windsurf" | "vscode" | "claude">("antigravity");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [authModeTab, setAuthModeTab] = useState<"zero-key" | "api-keys">("zero-key");
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null);
  const [keyName, setKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    setLoadingKeys(true);
    try {
      const data = await apiKeysApi.list();
      setKeys(data);
      if (data.length > 0 && !selectedKey) {
        setSelectedKey(data[0].keyPrefix ? `${data[0].keyPrefix}...` : "whz_live_YOUR_KEY");
      }
    } catch {
      // offline / demo fallback
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
      setSelectedKey(created.key);
      setUseZeroKey(false);
      setKeyName("");
      toast.success("New API key generated and applied to IDE configurations!");
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

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const [useZeroKey, setUseZeroKey] = useState(true);

  const effectiveKey = newKey?.key || (selectedKey.startsWith("whz_live_") ? selectedKey : "whz_live_YOUR_API_KEY");

  const runner = {
    command: "npx",
    args: ["-y", "@whizan/mcp-devops"],
  };

  const getEnvConfig = () => {
    if (useZeroKey) return {};
    return {
      env: {
        WHIZAN_API_URL: apiUrl,
        WHIZAN_API_KEY: effectiveKey,
      },
    };
  };

  // Config snippets for various IDEs
  const configs = {
    antigravity: {
      title: "Antigravity IDE",
      path: "~/.gemini/antigravity-ide/mcp_config.json",
      description: "Equips DeepMind Antigravity IDE with autonomous cloud service orchestration and deployment protocol.",
      snippet: JSON.stringify(
        {
          mcpServers: {
            whizan: {
              ...runner,
              ...getEnvConfig(),
            },
          },
        },
        null,
        2
      ),
    },
    cursor: {
      title: "Cursor AI",
      path: ".cursor/mcp.json (in your workspace) or ~/.cursor/mcp.json (globally)",
      description: "Allows Cursor Composer and Chat (Cmd+L / Cmd+I) to execute cloud DevOps workflows.",
      snippet: JSON.stringify(
        {
          mcpServers: {
            whizan: {
              ...runner,
              ...getEnvConfig(),
            },
          },
        },
        null,
        2
      ),
    },
    windsurf: {
      title: "Windsurf (Codeium Cascade)",
      path: "~/.codeium/windsurf/mcp_config.json",
      description: "Enables Cascade to autonomously prepare, build, and deploy services directly.",
      snippet: JSON.stringify(
        {
          mcpServers: {
            whizan: {
              ...runner,
              ...getEnvConfig(),
            },
          },
        },
        null,
        2
      ),
    },
    vscode: {
      title: "VS Code (Cline / Roo Code / Copilot)",
      path: "cline_mcp_settings.json or Roo Code MCP settings",
      description: "Equips autonomous VS Code coding agents with full Whizan Cloud management tools.",
      snippet: JSON.stringify(
        {
          mcpServers: {
            whizan: {
              ...runner,
              ...getEnvConfig(),
              disabled: false,
              autoApprove: [
                "whizan_analyze_workspace",
                "whizan_generate_patch",
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
    claude: {
      title: "Claude Desktop",
      path: "~/Library/Application Support/Claude/claude_desktop_config.json (macOS)",
      description: "Chat with Claude Desktop to inspect local repositories and orchestrate cloud deployments.",
      snippet: JSON.stringify(
        {
          mcpServers: {
            whizan: {
              ...runner,
              ...getEnvConfig(),
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
      title: "Fullstack Zero-Friction Deploy (React + Node + DB)",
      tag: "Vibe Coders",
      prompt:
        "Please analyze my workspace with the Whizan MCP tool. I have a Node.js backend and a React frontend. Check my backend port and host bindings, create and deploy my backend service to Whizan Cloud via direct upload, and once it's live, update my frontend .env with the live backend URL.",
    },
    {
      title: "Backend Service Direct Deploy (No Git Push)",
      tag: "Microservices",
      prompt:
        "Use Whizan MCP to deploy my backend service. I haven't pushed my code to GitHub yet, so please use whizan_deploy_direct to package my folder and deploy it straight to Whizan Cloud.",
    },
    {
      title: "Audit & Fix Hosting Traps",
      tag: "Code Audit",
      prompt:
        "Run whizan_analyze_workspace on my server folder. Check if I have hardcoded ports, 127.0.0.1 bindings, or missing CORS headers, and generate patches to make it ready for production hosting.",
    },
    {
      title: "Provision Cloud Database & Wire Env",
      tag: "Database",
      prompt:
        "Provision a managed PostgreSQL database on Whizan Cloud using Whizan MCP. Get the internal connection string and wire it into my backend service environment variables.",
    },
  ];

  const toolsList = [
    {
      name: "whizan_analyze_workspace",
      icon: Terminal,
      category: "Audit & Inspection",
      desc: "Scans project files, entry points, package dependencies, port configurations, and identifies 127.0.0.1 loopback traps or missing CORS.",
    },
    {
      name: "whizan_generate_patch",
      icon: Code2,
      category: "Auto-Healing",
      desc: "Generates drop-in code fixes for dynamic process.env.PORT bindings to 0.0.0.0, CORS headers, health checks, or client URL rewiring.",
    },
    {
      name: "whizan_deploy_direct",
      icon: FolderArchive,
      category: "Primary Deployment",
      desc: "Packs local code into a lightweight in-memory tarball (strictly respecting .gitignore, omitting node_modules and .git) and uploads it directly.",
    },
    {
      name: "whizan_create_service",
      icon: Server,
      category: "Compute Control",
      desc: "Registers a new backend Docker microservice on Whizan Cloud with custom ports, runtimes (Node, Python, Go), and encrypted env vars.",
    },
    {
      name: "whizan_create_project",
      icon: Globe,
      category: "Frontend Hosting",
      desc: "Creates a frontend web project (Next.js, Vite, React, Astro) with edge routing and automatic SSL.",
    },
    {
      name: "whizan_provision_database",
      icon: Database,
      category: "Data Persistence",
      desc: "Instantly provisions managed PostgreSQL (with connection pooling), Redis, or MySQL instances in seconds.",
    },
    {
      name: "whizan_get_build_logs",
      icon: RefreshCw,
      category: "Diagnostics",
      desc: "Streams step-by-step build logs from the Azure VM worker to diagnose build failures or package installation errors.",
    },
    {
      name: "whizan_check_health",
      icon: Zap,
      category: "Verification",
      desc: "Pings live deployed URLs to verify HTTP readiness, response status, and CORS headers after deployment.",
    },
  ];

  const faqs = [
    {
      q: "What is an MCP (Model Context Protocol) tool?",
      a: "MCP is an open standard that gives AI coding agents (like Cursor Composer or Windsurf Cascade) real hands and tools. Instead of just writing code, the agent can call Whizan's cloud tools to audit your project, deploy containers, configure databases, and verify live URLs directly inside your editor.",
    },
    {
      q: "Do I need to push my code to GitHub first?",
      a: "No! With Whizan's Direct Upload feature (whizan_deploy_direct), your agent packs your local project folder directly into an encrypted tarball and uploads it straight to our cloud worker. You don't need a git repo, GitHub account, or git commit to deploy.",
    },
    {
      q: "Will my node_modules or secret .env files get uploaded?",
      a: "Never. The archive engine strictly reads your .gitignore file and unconditionally blocks node_modules, .git, .next, dist, build, .cache, and .env files. Only pure source code is compressed and uploaded.",
    },
    {
      q: "What is the '127.0.0.1' or hardcoded port trap?",
      a: "In local development, developers often write `app.listen(3000, 'localhost')` or `app.listen(3000, '127.0.0.1')`. In a cloud container, listening only to 127.0.0.1 prevents the edge router from reaching the container, resulting in 502 Bad Gateway errors. Whizan's MCP automatically flags this and rewires it to `0.0.0.0` with `process.env.PORT`.",
    },
    {
      q: "How does the agent rewire my frontend?",
      a: "Once your backend service finishes deploying and is healthy, the MCP returns the live public URL (e.g. `http://my-backend.20.2.136.11.nip.io`). Your agent then automatically updates your frontend `.env` (like `VITE_API_URL` or `NEXT_PUBLIC_API_URL`), giving you a fully connected fullstack application with zero manual copy-pasting.",
    },
  ];

  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      {/* Hero Section */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(56, 189, 248, 0.08) 100%)",
          border: "1px solid rgba(99, 102, 241, 0.25)",
          borderRadius: "16px",
          padding: "2.25rem 2rem",
          marginBottom: "2rem",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(99, 102, 241, 0.15)", border: "1px solid rgba(99, 102, 241, 0.3)", borderRadius: "9999px", padding: "0.25rem 0.75rem", marginBottom: "1rem" }}>
          <Sparkles size={14} style={{ color: "#38bdf8" }} />
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#818cf8", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            AI DevOps MCP Engine
          </span>
        </div>

        <h1 style={{ fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: "0.75rem" }}>
          Whizan DevOps Model Context Protocol (MCP)
        </h1>
        <p style={{ fontSize: "1.05rem", color: "var(--muted)", maxWidth: 720, lineHeight: 1.6, marginBottom: "1.5rem" }}>
          Transform <strong>Antigravity IDE, Cursor, Windsurf, VS Code, and Claude Desktop</strong> into an autonomous Cloud Engineer.
          Your AI agent can audit your project, fix host and port bindings, deploy backends via direct upload,
          and automatically wire frontend endpoints — completely hands-free.
        </p>

        {/* Feature Pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "rgba(99, 102, 241, 0.15)", border: "1px solid rgba(99, 102, 241, 0.35)", color: "#818cf8", padding: "0.3rem 0.7rem", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 700 }}>
            <Check size={14} /> npm: @whizan/mcp-devops
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.25)", color: "#10b981", padding: "0.3rem 0.7rem", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600 }}>
            <Zap size={14} /> Direct Upload (No Git Push)
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "rgba(56, 189, 248, 0.1)", border: "1px solid rgba(56, 189, 248, 0.25)", color: "#38bdf8", padding: "0.3rem 0.7rem", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600 }}>
            <Shield size={14} /> Ignores node_modules &amp; .git
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "rgba(168, 85, 247, 0.1)", border: "1px solid rgba(168, 85, 247, 0.25)", color: "#c084fc", padding: "0.3rem 0.7rem", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600 }}>
            <Bot size={14} /> Fullstack Rewiring
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.25)", color: "#f59e0b", padding: "0.3rem 0.7rem", borderRadius: "8px", fontSize: "0.8rem", fontWeight: 600 }}>
            <Database size={14} /> Managed PostgreSQL &amp; Redis
          </span>
        </div>
      </div>

      {/* Step 1: Authentication Options (Zero-Key vs API Key Vault) */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem" }}>
              1
            </div>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>
              Authentication &amp; Machine Connection
            </h2>
          </div>

          {/* Sub Navigation / Tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              onClick={() => { setAuthModeTab("zero-key"); setUseZeroKey(true); }}
              className={`btn btn-sm ${authModeTab === "zero-key" ? "btn-primary" : "btn-secondary"}`}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" }}
            >
              <Sparkles size={13} /> 1-Click Zero-Key Login
            </button>
            <button
              onClick={() => { setAuthModeTab("api-keys"); }}
              className={`btn btn-sm ${authModeTab === "api-keys" ? "btn-primary" : "btn-secondary"}`}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem" }}
            >
              <KeyRound size={13} /> API Key Vault {keys.length > 0 && `(${keys.length})`}
            </button>
            <Link
              href="/dashboard/mcp/api-keys"
              className="btn btn-secondary btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem" }}
              title="Open full dedicated API Keys page"
            >
              Dedicated Key Route <ExternalLink size={12} />
            </Link>
          </div>
        </div>

        {authModeTab === "zero-key" ? (
          <div>
            <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "1.25rem", lineHeight: 1.55 }}>
              Run this single command once in your terminal. It links your computer to Whizan Cloud.
              Once completed, your AI assistants in <strong>Antigravity, Cursor, Windsurf, and VS Code</strong> connect automatically with <strong>zero API keys in your configuration files</strong>!
            </p>

            {/* 1-Click Terminal Command */}
            <div style={{ background: "#05070a", border: "1px solid rgba(99, 102, 241, 0.3)", borderRadius: "10px", padding: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flex: 1, minWidth: 260 }}>
                <Terminal size={18} style={{ color: "#38bdf8", flexShrink: 0 }} />
                <code style={{ fontSize: "0.85rem", color: "#38bdf8", wordBreak: "break-all" }}>
                  npx @whizan/mcp-devops login {effectiveKey && !useZeroKey ? `--token ${effectiveKey}` : ""}
                </code>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={() => copyText(`npx @whizan/mcp-devops login ${effectiveKey && !useZeroKey ? `--token ${effectiveKey}` : ""}`, "login-cmd")}
                  className="btn btn-primary btn-sm"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                >
                  {copiedKey === "login-cmd" ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
                  {copiedKey === "login-cmd" ? "Copied!" : "Copy Login Command"}
                </button>
                <Link href="/mcp/connect" className="btn btn-secondary btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  Browser Connect <ExternalLink size={12} />
                </Link>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", fontSize: "0.8rem", color: "var(--muted)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <Sparkles size={13} style={{ color: "#10b981" }} />
                Saves credentials securely in <code>~/.whizan/config.json</code> — shared across all local IDEs.
              </span>
              <button
                onClick={() => { setAuthModeTab("api-keys"); setUseZeroKey(false); }}
                style={{ background: "none", border: "none", color: "#818cf8", cursor: "pointer", textDecoration: "underline", fontSize: "0.8rem", padding: 0 }}
              >
                Need an explicit API key for CI/CD or Docker? Open Key Vault &rarr;
              </button>
            </div>
          </div>
        ) : (
          /* API Key Generator & Vault */
          <div>
            <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "1.25rem", lineHeight: 1.55 }}>
              Generate an explicit <code>whz_live_...</code> API key. Useful for headless CI/CD, remote containers, or embedding directly into your editor&apos;s MCP config.
            </p>

            {/* Newly Created Key Alert Box */}
            {newKey && (
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid rgba(16, 185, 129, 0.35)",
                  borderRadius: "10px",
                  padding: "1.25rem",
                  marginBottom: "1.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "#10b981", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <Sparkles size={16} /> API Key Generated: {newKey.name || "MCP Key"}
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "#f59e0b", fontWeight: 600 }}>
                    ⚠️ Copy it now — for security, it will never be displayed in full again!
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                  <code
                    style={{
                      flex: 1,
                      minWidth: 260,
                      background: "rgba(0,0,0,0.5)",
                      padding: "0.6rem 0.85rem",
                      borderRadius: "6px",
                      fontSize: "0.85rem",
                      wordBreak: "break-all",
                      color: "#38bdf8",
                      border: "1px solid rgba(56, 189, 248, 0.3)",
                    }}
                  >
                    {newKey.key}
                  </code>
                  <button
                    onClick={() => copyText(newKey.key, "new-key-secret")}
                    className="btn btn-primary btn-sm"
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                  >
                    {copiedKey === "new-key-secret" ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
                    {copiedKey === "new-key-secret" ? "Copied Key!" : "Copy Key"}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedKey(newKey.key);
                      setUseZeroKey(false);
                      toast.success("Applied to IDE configuration snippets below!");
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                  >
                    <Check size={13} /> Active in Snippets Below
                  </button>
                </div>
              </div>
            )}

            {/* Key Generation Form */}
            <form onSubmit={handleCreateKey} style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="Key label (e.g. Antigravity IDE, Cursor MacBook, CI Runner)"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                className="input"
                style={{ flex: 1, minWidth: 240, fontSize: "0.85rem", padding: "0.6rem 0.85rem" }}
              />
              <button
                type="submit"
                disabled={creatingKey}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", whiteSpace: "nowrap" }}
              >
                <Plus size={15} />
                {creatingKey ? "Generating..." : "Generate New Key"}
              </button>
            </form>

            {/* Active Keys Table */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--foreground)" }}>
                  Active API Keys ({keys.length})
                </span>
                <button
                  onClick={loadKeys}
                  disabled={loadingKeys}
                  className="btn btn-secondary btn-sm"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
                >
                  <RefreshCw size={12} className={loadingKeys ? "spin" : ""} /> Refresh
                </button>
              </div>

              {keys.length === 0 ? (
                <div style={{ background: "rgba(0,0,0,0.2)", border: "1px dashed var(--border)", borderRadius: "8px", padding: "1.25rem", textAlign: "center", fontSize: "0.84rem", color: "var(--muted)" }}>
                  No API keys created yet. Enter a label above to generate your first key.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {keys.map((k) => {
                    const isSelected = selectedKey.startsWith(k.keyPrefix?.slice(0, 10) || "____") || (newKey?.id === k.id);
                    return (
                      <div
                        key={k.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.75rem 1rem",
                          background: isSelected ? "rgba(99, 102, 241, 0.1)" : "rgba(0,0,0,0.25)",
                          border: isSelected ? "1px solid rgba(99, 102, 241, 0.4)" : "1px solid var(--border)",
                          borderRadius: "8px",
                          fontSize: "0.82rem",
                          flexWrap: "wrap",
                          gap: "0.6rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <KeyRound size={16} style={{ color: isSelected ? "#818cf8" : "var(--muted)" }} />
                          <div>
                            <div style={{ fontWeight: 650, color: "var(--foreground)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                              {k.name || "API Key"}
                              {isSelected && !useZeroKey && (
                                <span style={{ fontSize: "0.7rem", background: "rgba(99, 102, 241, 0.2)", color: "#818cf8", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>
                                  Active in Snippets
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontFamily: "monospace" }}>
                              Prefix: {k.keyPrefix || "whz_live_..."} • Created {new Date(k.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <button
                            onClick={() => {
                              setSelectedKey(k.keyPrefix ? `${k.keyPrefix}` : "whz_live_YOUR_KEY");
                              setUseZeroKey(false);
                              toast.success(`Active key set to ${k.name || "API Key"}. IDE snippets updated!`);
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: "0.75rem", padding: "0.3rem 0.65rem" }}
                          >
                            Use in Snippets
                          </button>
                          <button
                            onClick={() => handleDeleteKey(k.id)}
                            className="btn btn-danger btn-sm"
                            style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", padding: "0.3rem 0.65rem" }}
                            title="Revoke key"
                          >
                            <Trash2 size={12} /> Revoke
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Current Configuration Mode Pill */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border)", borderRadius: "10px", padding: "0.75rem 1.25rem", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.85rem" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: useZeroKey ? "#10b981" : "#818cf8" }} />
          <span>
            Configuration Mode: <strong>{useZeroKey ? "Zero-Key (Terminal Linked)" : "Explicit API Key Injected"}</strong>
            {useZeroKey ? " — No secrets written to disk." : ` — Injected ${effectiveKey.slice(0, 14)}...`}
          </span>
        </div>
        <button
          onClick={() => setUseZeroKey(!useZeroKey)}
          className="btn btn-secondary btn-sm"
          style={{ fontSize: "0.78rem" }}
        >
          {useZeroKey ? "Switch to API Key Mode" : "Switch to Zero-Key Mode"}
        </button>
      </div>

      {/* Step 2: Configure Your IDE */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem" }}>
            2
          </div>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>
            Choose Your AI Coding Environment
          </h2>
        </div>

        {/* IDE Tabs */}
        <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", marginBottom: "1.25rem", overflowX: "auto" }}>
          {(["antigravity", "cursor", "windsurf", "vscode", "claude"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
                background: activeTab === tab ? "var(--accent)" : "rgba(255, 255, 255, 0.05)",
                color: activeTab === tab ? "#fff" : "var(--muted)",
              }}
            >
              {configs[tab].title}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "0.35rem" }}>
            {configs[activeTab].description}
          </p>
          <div style={{ fontSize: "0.78rem", color: "#38bdf8", fontFamily: "monospace", display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <FileCode size={13} />
            File Path: <strong>{configs[activeTab].path}</strong>
          </div>
        </div>

        {/* Code Box */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => copyText(configs[activeTab].snippet, `code-${activeTab}`)}
            className="btn btn-secondary btn-sm"
            style={{
              position: "absolute",
              top: "0.75rem",
              right: "0.75rem",
              zIndex: 2,
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              background: "rgba(20, 25, 40, 0.85)",
              backdropFilter: "blur(8px)",
            }}
          >
            {copiedKey === `code-${activeTab}` ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
            {copiedKey === `code-${activeTab}` ? "Copied!" : "Copy Configuration"}
          </button>

          <pre
            style={{
              background: "#080b11",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              padding: "1.25rem",
              fontSize: "0.84rem",
              fontFamily: "var(--font-geist-mono), monospace",
              overflowX: "auto",
              color: "#e2e8f0",
              lineHeight: 1.5,
            }}
          >
            {configs[activeTab].snippet}
          </pre>
        </div>

        {/* Universal NPM Banner */}
        <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", borderRadius: "8px", background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.25)", fontSize: "0.82rem", display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <Sparkles size={16} color="#818cf8" style={{ flexShrink: 0 }} />
          <span style={{ color: "var(--foreground)" }}>
            <strong>Universal Package</strong>: Powered by <code>@whizan/mcp-devops</code> on npm. Works seamlessly on Windows, macOS, and Linux with zero cloning or build steps.
          </span>
        </div>
      </div>

      {/* Step 3: Beginner Prompt Recipes */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem" }}>
            3
          </div>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>
            Prompt Your Agent (Copy &amp; Paste Recipes)
          </h2>
        </div>
        <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
          Once your MCP configuration is saved, restart Cursor or Windsurf. Then open Composer or Cascade and copy any of these prompts:
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "1rem" }}>
          {samplePrompts.map((p, idx) => (
            <div
              key={idx}
              style={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--foreground)" }}>
                    {p.title}
                  </span>
                  <span style={{ fontSize: "0.7rem", background: "rgba(99, 102, 241, 0.15)", color: "#818cf8", padding: "0.2rem 0.5rem", borderRadius: "6px", fontWeight: 600 }}>
                    {p.tag}
                  </span>
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--muted)", fontStyle: "italic", background: "rgba(0,0,0,0.3)", padding: "0.75rem", borderRadius: "6px", borderLeft: "3px solid var(--accent)", lineHeight: 1.45, marginBottom: "0.75rem" }}>
                  &ldquo;{p.prompt}&rdquo;
                </p>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={() => copyText(p.prompt, `prompt-${idx}`)}
                  className="btn btn-secondary btn-sm"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                >
                  {copiedKey === `prompt-${idx}` ? <Check size={12} style={{ color: "#10b981" }} /> : <Copy size={12} />}
                  Copy Prompt
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* How Direct Upload Works (Visual Flow) */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <FolderArchive size={18} style={{ color: "#10b981" }} /> How Whizan Direct Upload Works
        </h2>
        <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
          Traditional platforms require you to link GitHub, authorize third-party access, commit, push, and configure webhooks.
          Whizan does all of this natively inside your editor:
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#818cf8", fontWeight: 700, marginBottom: "0.35rem" }}>STEP 1</div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.25rem" }}>Code Audit &amp; Filtering</div>
            <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              The MCP filters your files, discarding bulky <code style={{ color: "#ef4444" }}>node_modules</code> and sensitive secrets.
            </div>
          </div>

          <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#38bdf8", fontWeight: 700, marginBottom: "0.35rem" }}>STEP 2</div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.25rem" }}>In-Memory Archive</div>
            <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              A compressed <code style={{ color: "#38bdf8" }}>.tar.gz</code> archive (typically &lt;1 MB) is created and streamed to the Whizan Control Plane.
            </div>
          </div>

          <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: 700, marginBottom: "0.35rem" }}>STEP 3</div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.25rem" }}>VM Build &amp; Container</div>
            <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              The Azure VM build worker unpacks the code, runs dependencies, starts your container, and binds your port.
            </div>
          </div>

          <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem" }}>
            <div style={{ fontSize: "0.75rem", color: "#f59e0b", fontWeight: 700, marginBottom: "0.35rem" }}>STEP 4</div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.25rem" }}>Automatic Rewiring</div>
            <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              The live public URL is returned to your agent, which patches your frontend configuration instantly.
            </div>
          </div>
        </div>
      </div>

      {/* Available Tools Reference Grid */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.35rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Cpu size={18} style={{ color: "#c084fc" }} /> Available Tools Reference
        </h2>
        <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
          Your AI agent has access to these 8 specialized DevOps tools registered in the MCP protocol:
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "0.85rem" }}>
          {toolsList.map((tool) => {
            const Icon = tool.icon;
            return (
              <div
                key={tool.name}
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "1rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                  <Icon size={16} style={{ color: "#38bdf8" }} />
                  <code style={{ fontSize: "0.82rem", fontWeight: 700, color: "#e2e8f0" }}>
                    {tool.name}
                  </code>
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--accent)", fontWeight: 600, marginBottom: "0.35rem" }}>
                  {tool.category}
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--muted)", lineHeight: 1.4 }}>
                  {tool.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* FAQ Accordion */}
      <div className="card" style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.35rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <HelpCircle size={18} style={{ color: "#f59e0b" }} /> Frequently Asked Questions
        </h2>
        <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
          Everything you need to know about autonomous deployments with Whizan:
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {faqs.map((faq, idx) => {
            const isOpen = expandedFaq === idx;
            return (
              <div
                key={idx}
                style={{
                  background: "rgba(0,0,0,0.2)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={() => setExpandedFaq(isOpen ? null : idx)}
                  style={{
                    width: "100%",
                    padding: "0.85rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "none",
                    border: "none",
                    color: "var(--foreground)",
                    fontSize: "0.88rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span>{faq.q}</span>
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {isOpen && (
                  <div style={{ padding: "0 1rem 1rem 1rem", fontSize: "0.84rem", color: "var(--muted)", lineHeight: 1.5, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "0.75rem" }}>
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
