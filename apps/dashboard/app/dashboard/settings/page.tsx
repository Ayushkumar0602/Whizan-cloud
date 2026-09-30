"use client";
import { useAuth } from "@/lib/auth";
import { useState, useEffect } from "react";
import { getApiBase, apiKeysApi, auth, type ApiKeyItem, type CreatedApiKey } from "@/lib/api";
import { getBaseRouterDomain } from "@/lib/domains";
import { PageHeader } from "@/components/page-header";
import {
  User,
  Shield,
  Server,
  Globe,
  Database,
  Radio,
  Copy,
  Check,
  Calendar,
  Lock,
  ExternalLink,
  Key,
  Plus,
  Trash2,
  Bot,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user } = useAuth();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const productionApiUrl = "https://whizan-cloud-service.onrender.com";
  const edgeDomain = getBaseRouterDomain();
  const dashboardUrl = typeof window !== "undefined" && !window.location.hostname.includes("localhost")
    ? window.location.origin
    : "https://whizan-cloud-service-dashboard.vercel.app";

  const endpoints = [
    { label: "API Control Plane", value: productionApiUrl, desc: "REST & SSE Control Plane" },
    { label: "Dashboard Console", value: dashboardUrl, desc: "Production Management Console" },
    { label: "Edge Ingress Gateway", value: `http://${edgeDomain}`, desc: "Azure VM Edge Router (20.2.136.11)" },
    { label: "PostgreSQL Database Pooler", value: "aws-0-ap-northeast-1.pooler.supabase.com:6543", desc: "Enterprise PgBouncer Connection Pooler" },
    { label: "Distributed Redis Cache", value: "Upstash Redis (TLS)", desc: "Low-latency Cache & Queue Broker" },
  ];

  function copyValue(val: string, key: string) {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    toast.success("Endpoint copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2000);
  }

  // ─── Subscription & Compute Policy State ─────────────────────────────────
  const [currentTier, setCurrentTier] = useState<"HOBBY" | "PROFESSIONAL">("HOBBY");
  const [updatingTier, setUpdatingTier] = useState(false);

  useEffect(() => {
    if (user?.subscriptionTier) {
      const normalized = (user.subscriptionTier as string).toUpperCase();
      setCurrentTier(normalized === "PROFESSIONAL" ? "PROFESSIONAL" : "HOBBY");
    }
  }, [user]);

  async function handleTierChange(tier: "HOBBY" | "PROFESSIONAL") {
    if (tier === currentTier) return;
    setUpdatingTier(true);
    try {
      await auth.updateSubscription(tier);
      setCurrentTier(tier);
      toast.success(`Subscription switched to ${tier === "HOBBY" ? "Hobby Plan" : "Professional Plan"}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update subscription tier");
    } finally {
      setUpdatingTier(false);
    }
  }

  // ─── API Keys & MCP State ──────────────────────────────────────────────────
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null);
  const [keyName, setKeyName] = useState("");
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [creatingKey, setCreatingKey] = useState(false);

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    setLoadingKeys(true);
    try {
      const data = await apiKeysApi.list();
      setKeys(data);
    } catch {
      // Ignored if offline
    } finally {
      setLoadingKeys(false);
    }
  }

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    setCreatingKey(true);
    try {
      const created = await apiKeysApi.create(keyName.trim() || undefined);
      setNewKey(created);
      setKeyName("");
      toast.success("API key generated successfully");
      loadKeys();
    } catch (err: any) {
      toast.error(err.message || "Failed to create API key");
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

  const initials = (user?.name || user?.email || "U")[0].toUpperCase();

  const mcpConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        whizan: {
          command: "npx",
          args: ["-y", "@whizan/mcp-devops"],
          env: {
            WHIZAN_API_URL: productionApiUrl,
            WHIZAN_API_KEY: newKey?.key || "whz_live_YOUR_KEY_HERE",
          },
        },
      },
    },
    null,
    2
  );

  return (
    <div className="page" style={{ maxWidth: 840 }}>
      <PageHeader
        title="Settings & Workspace"
        subtitle="Manage your developer profile, workspace preferences, and cloud infrastructure endpoints."
      />

      <div className="settings-stack">
        {/* Profile Card */}
        <div className="card">
          <h2 className="card-title" style={{ fontSize: "1.05rem", marginBottom: "1.25rem" }}>
            User Profile
          </h2>

          <div className="profile-hero-row">
            <div className="user-avatar-xl">
              {initials}
            </div>
            <div className="profile-details-group">
              <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
                <h3 className="profile-name">{user?.name || "Developer"}</h3>
                <span className="role-pill">
                  <Shield size={11} /> Workspace Owner
                </span>
              </div>
              <div className="profile-email mono">{user?.email}</div>
              <div className="profile-date">
                <Calendar size={13} />
                <span>
                  Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "2026"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Subscription & Compute Policy Card */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Sparkles size={18} style={{ color: "#a855f7" }} />
                <h2 className="card-title" style={{ fontSize: "1.05rem", margin: 0 }}>
                  Subscription & Compute Policy
                </h2>
              </div>
              <p className="card-sub" style={{ marginTop: "0.25rem" }}>
                Enforces strict compute limits for AI agents and developer deployments.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "rgba(255,255,255,0.04)", padding: "4px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <button
                type="button"
                onClick={() => handleTierChange("HOBBY")}
                disabled={updatingTier}
                className={`btn btn-sm ${currentTier === "HOBBY" ? "btn-primary" : "btn-ghost"}`}
                style={{ fontSize: "0.82rem", padding: "0.35rem 0.75rem", borderRadius: "6px" }}
              >
                Hobby Plan
              </button>
              <button
                type="button"
                onClick={() => handleTierChange("PROFESSIONAL")}
                disabled={updatingTier}
                className={`btn btn-sm ${currentTier === "PROFESSIONAL" ? "btn-primary" : "btn-ghost"}`}
                style={{ fontSize: "0.82rem", padding: "0.35rem 0.75rem", borderRadius: "6px" }}
              >
                Professional Plan
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            <div
              style={{
                padding: "1rem",
                borderRadius: "8px",
                border: currentTier === "HOBBY" ? "1px solid rgba(56, 189, 248, 0.4)" : "1px solid rgba(255,255,255,0.06)",
                background: currentTier === "HOBBY" ? "rgba(56, 189, 248, 0.05)" : "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.92rem", color: currentTier === "HOBBY" ? "#38bdf8" : "#fff" }}>
                  Hobby Tier (Free Compute)
                </span>
                {currentTier === "HOBBY" && <span className="badge badge-blue">Active</span>}
              </div>
              <ul style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0, paddingLeft: "1.2rem", lineHeight: 1.6 }}>
                <li><strong>Backend Microservices:</strong> Strictly locked to Free Tier (0.1 vCPU, 512MB RAM, Auto-Sleep after 15m).</li>
                <li><strong>Databases:</strong> Starter Tier with PgBouncer connection pooler (512MB RAM).</li>
                <li><strong>Frontend Web Apps:</strong> Edge CDN & Static Hosting.</li>
                <li><strong>AI Agent Safeguard:</strong> Agents CANNOT arbitrarily allocate compute or RAM.</li>
              </ul>
            </div>

            <div
              style={{
                padding: "1rem",
                borderRadius: "8px",
                border: currentTier === "PROFESSIONAL" ? "1px solid rgba(168, 85, 247, 0.4)" : "1px solid rgba(255,255,255,0.06)",
                background: currentTier === "PROFESSIONAL" ? "rgba(168, 85, 247, 0.05)" : "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.92rem", color: currentTier === "PROFESSIONAL" ? "#c084fc" : "#fff" }}>
                  Professional Tier (Custom Compute)
                </span>
                {currentTier === "PROFESSIONAL" && <span className="badge badge-purple">Active</span>}
              </div>
              <ul style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: 0, paddingLeft: "1.2rem", lineHeight: 1.6 }}>
                <li><strong>Custom Compute:</strong> Choose between Starter, Standard, Pro (up to 4 vCPUs / 4GB RAM).</li>
                <li><strong>Always-On:</strong> Dedicated containers with zero cold-starts and no auto-sleep.</li>
                <li><strong>High Performance Databases:</strong> Dedicated multi-core Postgres & Redis.</li>
                <li><strong>Granular Control:</strong> Selectable directly from hosting pages.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* IDE DevOps MCP & API Keys */}
        <div className="card">
          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Bot size={18} style={{ color: "#38bdf8" }} />
              <h2 className="card-title" style={{ fontSize: "1.05rem", margin: 0 }}>
                IDE DevOps MCP & API Keys
              </h2>
            </div>
            <p className="card-sub" style={{ marginTop: "0.25rem" }}>
              Empower AI coding agents inside Cursor, Windsurf, or VS Code to autonomously inspect, adapt, and deploy your codebases to Whizan Cloud.
            </p>
          </div>

          {/* New Key Alert */}
          {newKey && (
            <div
              style={{
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "8px",
                padding: "1rem",
                marginBottom: "1.25rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#10b981" }}>
                  🎉 New API Key Generated ({newKey.name})
                </span>
                <span style={{ fontSize: "0.75rem", color: "#f59e0b" }}>
                  ⚠️ Copy it now — it won&apos;t be shown again!
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <code
                  style={{
                    flex: 1,
                    background: "rgba(0,0,0,0.4)",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "6px",
                    fontSize: "0.82rem",
                    wordBreak: "break-all",
                    color: "#38bdf8",
                  }}
                  className="mono"
                >
                  {newKey.key}
                </code>
                <button
                  onClick={() => copyValue(newKey.key, "new-api-key")}
                  className="btn btn-secondary"
                  style={{ padding: "0.5rem 0.85rem", fontSize: "0.8rem", display: "flex", gap: "0.35rem", alignItems: "center" }}
                >
                  {copiedKey === "new-api-key" ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  Copy Key
                </button>
              </div>
            </div>
          )}

          {/* Create Key Form */}
          <form onSubmit={handleCreateKey} style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
            <input
              type="text"
              placeholder="Key label (e.g. Cursor MacBook, Windsurf CLI)"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="input"
              style={{ flex: 1, fontSize: "0.85rem", padding: "0.5rem 0.85rem" }}
            />
            <button
              type="submit"
              disabled={creatingKey}
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", whiteSpace: "nowrap" }}
            >
              <Plus size={14} />
              {creatingKey ? "Creating..." : "Generate Key"}
            </button>
          </form>

          {/* Active Keys List */}
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 650, color: "var(--foreground)", marginBottom: "0.6rem" }}>
              Active API Keys ({keys.length})
            </div>
            {keys.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: "var(--muted)", padding: "0.75rem 0" }}>
                No API keys created yet. Generate one above to connect your IDE.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {keys.map((k) => (
                  <div
                    key={k.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.6rem 0.85rem",
                      background: "var(--bg-inset)",
                      border: "1px solid var(--card-border)",
                      borderRadius: "6px",
                      fontSize: "0.8rem",
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--foreground)", marginRight: "0.5rem" }}>
                        {k.name}
                      </span>
                      <code className="mono" style={{ color: "var(--muted)", fontSize: "0.76rem" }}>
                        {k.keyPrefix}
                      </code>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                        {k.lastUsedAt ? `Used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "Never used"}
                      </span>
                      <button
                        onClick={() => handleDeleteKey(k.id)}
                        title="Revoke Key"
                        style={{
                          background: "none",
                          border: "none",
                          color: "#ef4444",
                          cursor: "pointer",
                          padding: "2px",
                          display: "flex",
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MCP JSON Snippet */}
          <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 650, color: "var(--foreground)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Sparkles size={13} style={{ color: "#38bdf8" }} />
                IDE MCP Configuration (.cursor/mcp.json)
              </span>
              <button
                onClick={() => copyValue(mcpConfigSnippet, "mcp-config")}
                className="btn btn-secondary"
                style={{ padding: "3px 8px", fontSize: "0.72rem", display: "flex", gap: "0.3rem", alignItems: "center" }}
              >
                {copiedKey === "mcp-config" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                Copy JSON
              </button>
            </div>
            <pre
              style={{
                background: "var(--bg-inset)",
                padding: "0.75rem",
                borderRadius: "6px",
                border: "1px solid var(--card-border)",
                fontSize: "0.74rem",
                overflowX: "auto",
                color: "#94a3b8",
                lineHeight: "1.4",
              }}
              className="mono"
            >
              {mcpConfigSnippet}
            </pre>
          </div>
        </div>

        {/* Local Infrastructure & Gateway Endpoints */}
        <div className="card">
          <div style={{ marginBottom: "1.25rem" }}>
            <h2 className="card-title" style={{ fontSize: "1.05rem" }}>
              Cloud & Mesh Endpoints
            </h2>
            <p className="card-sub">
              Network targets for local development, CLI tooling, and edge routing
            </p>
          </div>

          <div className="endpoints-list">
            {endpoints.map((ep) => (
              <div key={ep.label} className="endpoint-row">
                <div className="endpoint-meta">
                  <span className="endpoint-label">{ep.label}</span>
                  <span className="endpoint-desc">{ep.desc}</span>
                </div>

                <div className="endpoint-right">
                  <code className="endpoint-value mono">{ep.value}</code>
                  <button
                    onClick={() => copyValue(ep.value, ep.label)}
                    className="copy-icon-btn"
                    title="Copy connection string"
                  >
                    {copiedKey === ep.label ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security & Access */}
        <div className="card">
          <h2 className="card-title" style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>
            Security & Authentication
          </h2>
          <p className="card-sub" style={{ marginBottom: "1.25rem" }}>
            JWT authentication sessions with automatic HttpOnly refresh cookies
          </p>

          <div className="security-notice-box">
            <Lock size={18} className="text-accent" />
            <div>
              <div style={{ fontWeight: 650, fontSize: "0.88rem", color: "var(--foreground)" }}>
                Secure HTTP-Only Session Active
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "2px" }}>
                Session tokens are automatically rotated and encrypted at the edge.
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .settings-stack {
          display: flex;
          flex-direction: column;
          gap: 1.75rem;
        }
        .card-sub {
          font-size: 0.8125rem;
          color: var(--muted);
          margin-top: 0.15rem;
        }

        /* Profile Row */
        .profile-hero-row {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          flex-wrap: wrap;
        }
        .user-avatar-xl {
          width: 68px;
          height: 68px;
          border-radius: 50%;
          background: var(--accent-gradient);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.75rem;
          font-weight: 800;
          box-shadow: 0 4px 16px var(--accent-glow);
          flex-shrink: 0;
        }
        .profile-details-group {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .profile-name {
          font-size: 1.25rem;
          font-weight: 750;
          color: var(--foreground);
        }
        .role-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.72rem;
          font-weight: 650;
          color: #10b981;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
          padding: 0.15rem 0.5rem;
          border-radius: 9999px;
        }
        .profile-email {
          font-size: 0.84rem;
          color: var(--muted);
        }
        .profile-date {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.76rem;
          color: var(--muted);
          margin-top: 0.2rem;
        }

        /* Endpoints List */
        .endpoints-list {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--card-border);
          border-radius: 8px;
          overflow: hidden;
        }
        .endpoint-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.85rem 1.15rem;
          border-bottom: 1px solid var(--card-border);
          background: var(--bg-inset);
          gap: 1rem;
          flex-wrap: wrap;
        }
        .endpoint-row:last-child {
          border-bottom: none;
        }
        .endpoint-meta {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .endpoint-label {
          font-size: 0.84rem;
          font-weight: 650;
          color: var(--foreground);
        }
        .endpoint-desc {
          font-size: 0.74rem;
          color: var(--muted);
        }
        .endpoint-right {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .endpoint-value {
          font-size: 0.8125rem;
          color: var(--foreground);
          background: var(--card);
          padding: 0.25rem 0.55rem;
          border-radius: 6px;
          border: 1px solid var(--card-border);
        }
        .copy-icon-btn {
          background: transparent;
          border: none;
          color: var(--muted);
          cursor: pointer;
          padding: 0.3rem;
          border-radius: 4px;
          display: flex;
          align-items: center;
          transition: all 0.15s ease;
        }
        .copy-icon-btn:hover {
          color: var(--foreground);
          background: rgba(255, 255, 255, 0.08);
        }

        /* Security Box */
        .security-notice-box {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 1rem 1.25rem;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: 8px;
        }

        @media (max-width: 640px) {
          .endpoint-row {
            flex-direction: column;
            align-items: flex-start;
          }
          .endpoint-right {
            width: 100%;
            justify-content: space-between;
          }
        }
      `}</style>
    </div>
  );
}
