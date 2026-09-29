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
  Plus
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function McpGuidePage() {
  const apiUrl = getApiBase();
  const [activeTab, setActiveTab] = useState<"cursor" | "windsurf" | "vscode" | "claude">("cursor");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    try {
      const data = await apiKeysApi.list();
      setKeys(data);
      if (data.length > 0 && !selectedKey) {
        setSelectedKey(data[0].keyPrefix ? `${data[0].keyPrefix}...` : "whz_live_YOUR_KEY");
      }
    } catch {
      // offline / demo fallback
    }
  }

  async function handleQuickCreateKey() {
    setCreatingKey(true);
    try {
      const created = await apiKeysApi.create("MCP IDE Key");
      setNewKey(created);
      setSelectedKey(created.key);
      toast.success("New API key generated and inserted into configurations!");
      loadKeys();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate key");
    } finally {
      setCreatingKey(false);
    }
  }

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const [execMode, setExecMode] = useState<"local" | "npx">("local");

  const effectiveKey = newKey?.key || (selectedKey.startsWith("whz_live_") ? selectedKey : "whz_live_YOUR_API_KEY");

  const getRunner = () => {
    if (execMode === "local") {
      return {
        command: "node",
        args: ["packages/mcp-devops/dist/index.js"],
      };
    }
    return {
      command: "npx",
      args: ["-y", "@whizan/mcp-devops"],
    };
  };

  const runner = getRunner();

  // Config snippets for various IDEs
  const configs = {
    cursor: {
      title: "Cursor AI",
      path: ".cursor/mcp.json (in your workspace) or ~/.cursor/mcp.json (globally)",
      description: "Allows Cursor Composer and Chat (Cmd+L / Cmd+I) to execute cloud DevOps workflows.",
      snippet: JSON.stringify(
        {
          mcpServers: {
            whizan: {
              ...runner,
              env: {
                WHIZAN_API_URL: apiUrl,
                WHIZAN_API_KEY: effectiveKey,
              },
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
              env: {
                WHIZAN_API_URL: apiUrl,
                WHIZAN_API_KEY: effectiveKey,
              },
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
              env: {
                WHIZAN_API_URL: apiUrl,
                WHIZAN_API_KEY: effectiveKey,
              },
              disabled: false,
              autoApprove: [
                "whizan_analyze_workspace",
                "whizan_generate_patch",
                "whizan_get_build_logs",
                "whizan_check_health"
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
              env: {
                WHIZAN_API_URL: apiUrl,
                WHIZAN_API_KEY: effectiveKey,
              },
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
      a: "Once your backend service finishes deploying and is healthy, the MCP returns the live public URL (e.g. `https://my-backend.20.2.136.11.nip.io`). Your agent then automatically updates your frontend `.env` (like `VITE_API_URL` or `NEXT_PUBLIC_API_URL`), giving you a fully connected fullstack application with zero manual copy-pasting.",
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
          Transform <strong>Cursor, Windsurf, VS Code, and Claude</strong> into an autonomous Cloud Engineer.
          Your AI agent can audit your project, fix host and port bindings, deploy backends via direct upload,
          and automatically wire frontend endpoints — completely hands-free.
        </p>

        {/* Feature Pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
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

      {/* Step 1: Get Your API Key */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.85rem" }}>
              1
            </div>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>
              Connect with your Whizan API Key
            </h2>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              onClick={handleQuickCreateKey}
              disabled={creatingKey}
              className="btn btn-primary btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
            >
              {creatingKey ? <RefreshCw size={13} className="spin" /> : <Plus size={13} />}
              Generate New Key
            </button>
            <Link href="/dashboard/settings" className="btn btn-secondary btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              Manage Keys <ExternalLink size={12} />
            </Link>
          </div>
        </div>

        <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "1rem" }}>
          Your API key authenticates your in-IDE AI coding agent. When you generate a key below, it will be automatically injected into the configuration snippets in Step 2.
        </p>

        {newKey ? (
          <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", padding: "0.85rem 1rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#10b981", marginBottom: "0.25rem" }}>
                ACTIVE KEY GENERATED
              </div>
              <code style={{ fontSize: "0.85rem", color: "#38bdf8", wordBreak: "break-all" }}>
                {newKey.key}
              </code>
            </div>
            <button
              onClick={() => copyText(newKey.key, "key-hero")}
              className="btn btn-secondary btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
            >
              {copiedKey === "key-hero" ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
              Copy
            </button>
          </div>
        ) : (
          <div style={{ background: "rgba(0,0,0,0.25)", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              {keys.length > 0 ? `Using existing key (${keys[0].name || "Dev Key"} - ${keys[0].keyPrefix}...)` : "No API key created yet. Click 'Generate New Key' to get started."}
            </span>
            {keys.length === 0 && (
              <button onClick={handleQuickCreateKey} className="btn btn-primary btn-sm">
                Create First Key
              </button>
            )}
          </div>
        )}
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

        {/* Execution Mode Selector */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", background: "rgba(0,0,0,0.25)", padding: "0.35rem", borderRadius: "8px", width: "fit-content", flexWrap: "wrap" }}>
          <button
            onClick={() => setExecMode("local")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "6px",
              fontSize: "0.78rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
              background: execMode === "local" ? "var(--accent)" : "transparent",
              color: execMode === "local" ? "#fff" : "var(--muted)",
            }}
          >
            💻 Workspace / Direct Node (Instant, No NPM Publish)
          </button>
          <button
            onClick={() => setExecMode("npx")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "6px",
              fontSize: "0.78rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
              background: execMode === "npx" ? "var(--accent)" : "transparent",
              color: execMode === "npx" ? "#fff" : "var(--muted)",
            }}
          >
            🌐 NPX Package (@whizan/mcp-devops)
          </button>
        </div>

        {/* IDE Tabs */}
        <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.75rem", marginBottom: "1.25rem", overflowX: "auto" }}>
          {(["cursor", "windsurf", "vscode", "claude"] as const).map((tab) => (
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
