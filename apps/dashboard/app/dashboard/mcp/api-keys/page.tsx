"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/page-header";
import { apiKeysApi, type ApiKeyItem, type CreatedApiKey } from "@/lib/api";
import {
  KeyRound,
  Sparkles,
  Copy,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  Terminal,
  FileCode,
  ArrowLeft,
  ExternalLink,
  Shield,
  Bot
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function McpApiKeysPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes("localhost")
    ? process.env.NEXT_PUBLIC_API_URL
    : "https://whizan-cloud-service.onrender.com";

  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>("");

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    setLoading(true);
    try {
      const data = await apiKeysApi.list();
      setKeys(data);
      if (data.length > 0 && !selectedKey) {
        setSelectedKey(data[0].keyPrefix ? `${data[0].keyPrefix}...` : "whz_live_YOUR_KEY");
      }
    } catch {
      // offline fallback
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await apiKeysApi.create(keyName.trim() || "MCP IDE Key");
      setNewKey(created);
      setSelectedKey(created.key);
      setKeyName("");
      toast.success("New API key generated successfully!");
      await loadKeys();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate API key");
    } finally {
      setCreating(false);
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
    setCopiedId(id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  }

  const effectiveKey = newKey?.key || (selectedKey.startsWith("whz_live_") ? selectedKey : "whz_live_YOUR_API_KEY");

  const mcpConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        whizan: {
          command: "npx",
          args: ["-y", "@whizan/mcp-devops"],
          env: {
            WHIZAN_API_URL: apiUrl,
            WHIZAN_API_KEY: effectiveKey,
          },
        },
      },
    },
    null,
    2
  );

  return (
    <div className="page" style={{ maxWidth: 920 }}>
      <div style={{ marginBottom: "1rem" }}>
        <Link
          href="/dashboard/mcp"
          className="btn btn-secondary btn-sm"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.75rem" }}
        >
          <ArrowLeft size={14} /> Back to MCP Overview &amp; Guide
        </Link>
      </div>

      <PageHeader
        title="MCP &amp; DevOps API Keys"
        subtitle="Generate and manage secret keys for authenticating Antigravity IDE, Cursor, Windsurf, VS Code, and headless CI/CD pipelines."
      />

      {/* New Key Alert Box */}
      {newKey && (
        <div
          style={{
            background: "rgba(16, 185, 129, 0.08)",
            border: "1px solid rgba(16, 185, 129, 0.35)",
            borderRadius: "12px",
            padding: "1.5rem",
            marginBottom: "2rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <span style={{ fontSize: "1rem", fontWeight: 700, color: "#10b981", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Sparkles size={18} /> New API Key Generated: {newKey.name || "MCP Key"}
            </span>
            <span style={{ fontSize: "0.8rem", color: "#f59e0b", fontWeight: 600 }}>
              ⚠️ Copy it now — for security, it will never be displayed in full again!
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            <code
              style={{
                flex: 1,
                minWidth: 280,
                background: "rgba(0,0,0,0.5)",
                padding: "0.75rem 1rem",
                borderRadius: "8px",
                fontSize: "0.9rem",
                wordBreak: "break-all",
                color: "#38bdf8",
                border: "1px solid rgba(56, 189, 248, 0.3)",
              }}
            >
              {newKey.key}
            </code>
            <button
              onClick={() => copyText(newKey.key, "new-secret")}
              className="btn btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              {copiedId === "new-secret" ? <Check size={14} style={{ color: "#10b981" }} /> : <Copy size={14} />}
              {copiedId === "new-secret" ? "Copied!" : "Copy Full Secret Key"}
            </button>
          </div>

          <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            Tip: You can authenticate your terminal immediately by running <code>npx @whizan/mcp-devops login --token {newKey.key.slice(0, 16)}...</code>
          </div>
        </div>
      )}

      {/* Generate Key Card */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.4rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <KeyRound size={18} style={{ color: "#818cf8" }} /> Generate New API Key
        </h2>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
          Assign a recognizable label (e.g. &ldquo;Cursor MacBook Air&rdquo;, &ldquo;Antigravity Workstation&rdquo;, &ldquo;GitHub Actions&rdquo;) to help you identify active connections.
        </p>

        <form onSubmit={handleCreateKey} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Key label (e.g. Antigravity IDE, Cursor M3, Production Runner)"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            className="input"
            style={{ flex: 1, minWidth: 260, fontSize: "0.88rem", padding: "0.65rem 0.95rem" }}
          />
          <button
            type="submit"
            disabled={creating}
            className="btn btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", whiteSpace: "nowrap" }}
          >
            <Plus size={16} />
            {creating ? "Generating Key..." : "Generate API Key"}
          </button>
        </form>
      </div>

      {/* Active Keys List */}
      <div className="card" style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Shield size={18} style={{ color: "#38bdf8" }} />
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
              Active Keys ({keys.length})
            </h2>
          </div>
          <button
            onClick={loadKeys}
            disabled={loading}
            className="btn btn-secondary btn-sm"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
          >
            <RefreshCw size={13} className={loading ? "spin" : ""} /> Refresh
          </button>
        </div>

        {keys.length === 0 ? (
          <div style={{ background: "rgba(0,0,0,0.2)", border: "1px dashed var(--border)", borderRadius: "8px", padding: "2rem", textAlign: "center", color: "var(--muted)", fontSize: "0.88rem" }}>
            No API keys created yet. Generate one above to connect your local IDE or CI runner.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {keys.map((k) => (
              <div
                key={k.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.85rem 1.15rem",
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "0.84rem",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                  <KeyRound size={18} style={{ color: "#818cf8" }} />
                  <div>
                    <div style={{ fontWeight: 650, color: "var(--foreground)", fontSize: "0.9rem" }}>
                      {k.name || "API Key"}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--muted)", fontFamily: "monospace", marginTop: "0.15rem" }}>
                      Prefix: <strong>{k.keyPrefix || "whz_live_..."}</strong> • Created on {new Date(k.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    onClick={() => {
                      setSelectedKey(k.keyPrefix ? `${k.keyPrefix}` : "whz_live_YOUR_KEY");
                      toast.success(`Selected ${k.name || "API Key"} for configuration snippets.`);
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.78rem" }}
                  >
                    Select for Snippet
                  </button>
                  <button
                    onClick={() => handleDeleteKey(k.id)}
                    className="btn btn-danger btn-sm"
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem" }}
                    title="Revoke key"
                  >
                    <Trash2 size={13} /> Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Configuration Snippet Preview */}
      <div className="card" style={{ marginBottom: "2.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FileCode size={18} style={{ color: "#c084fc" }} />
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
              Generated IDE Configuration (mcp_config.json)
            </h2>
          </div>
          <button
            onClick={() => copyText(mcpConfigSnippet, "mcp-snippet")}
            className="btn btn-secondary btn-sm"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
          >
            {copiedId === "mcp-snippet" ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
            {copiedId === "mcp-snippet" ? "Copied Snippet!" : "Copy Configuration"}
          </button>
        </div>

        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1rem" }}>
          Paste this snippet into your IDE MCP config (e.g. <code>~/.gemini/antigravity-ide/mcp_config.json</code> or <code>.cursor/mcp.json</code>):
        </p>

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
          {mcpConfigSnippet}
        </pre>

        {/* Visual Form UI Helper */}
        <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", borderRadius: "10px", padding: "1rem 1.15rem", marginTop: "1.5rem" }}>
          <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--foreground)", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <FileCode size={15} style={{ color: "#38bdf8" }} />
            For IDEs with a Visual Form UI (e.g. VS Code &ldquo;Add MCP server&rdquo; dialog)
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
            If your editor asks you to fill out form fields instead of editing JSON, copy and paste these exact values:
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.6rem" }}>
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.5rem 0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "0.68rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Name</div>
                <code style={{ fontSize: "0.82rem", color: "#38bdf8" }}>whizan</code>
              </div>
              <button onClick={() => copyText("whizan", "form-name")} className="btn btn-secondary btn-sm" style={{ padding: "0.2rem 0.5rem", fontSize: "0.72rem" }}>
                {copiedId === "form-name" ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
              </button>
            </div>
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.5rem 0.75rem" }}>
              <div style={{ fontSize: "0.68rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Transport</div>
              <span style={{ fontSize: "0.82rem", color: "#10b981", fontWeight: 600 }}>Local command (stdio)</span>
            </div>
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.5rem 0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "0.68rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Command</div>
                <code style={{ fontSize: "0.82rem", color: "#38bdf8" }}>npx</code>
              </div>
              <button onClick={() => copyText("npx", "form-cmd")} className="btn btn-secondary btn-sm" style={{ padding: "0.2rem 0.5rem", fontSize: "0.72rem" }}>
                {copiedId === "form-cmd" ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
              </button>
            </div>
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.5rem 0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "0.68rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Arguments</div>
                <code style={{ fontSize: "0.82rem", color: "#38bdf8" }}>-y @whizan/mcp-devops</code>
              </div>
              <button onClick={() => copyText("-y @whizan/mcp-devops", "form-args")} className="btn btn-secondary btn-sm" style={{ padding: "0.2rem 0.5rem", fontSize: "0.72rem" }}>
                {copiedId === "form-args" ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
