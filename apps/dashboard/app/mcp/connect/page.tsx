"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { apiKeysApi } from "@/lib/api";
import {
  Sparkles,
  Terminal,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  Cpu,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { BrandMark } from "@/components/brand";

function ConnectContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading } = useAuth();

  const port = searchParams.get("port");
  const [authorizing, setAuthorizing] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  useEffect(() => {
    if (user && !token) {
      loadOrCreateKey();
    }
  }, [user]);

  async function loadOrCreateKey() {
    try {
      const created = await apiKeysApi.create("MCP In-Browser Connect");
      setToken(created.key);
    } catch (err: any) {
      console.error("Failed to generate connect token:", err);
    }
  }

  async function handleAuthorize() {
    if (!token) {
      toast.error("Generating session token, please wait a moment...");
      return;
    }

    if (port) {
      setAuthorizing(true);
      setStatusText(`Sending authentication callback to local port ${port}...`);

      const callbackUrl = `http://127.0.0.1:${port}/callback?token=${encodeURIComponent(
        token
      )}&email=${encodeURIComponent(user?.email || "")}`;

      // Redirect user directly to the local HTTP server callback
      window.location.href = callbackUrl;
    } else {
      copyToken();
    }
  }

  function copyToken() {
    if (!token) return;
    const cmd = `npx @whizan/mcp-devops login --token ${token}`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    toast.success("Login command copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="aurora-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <RefreshCw size={28} className="spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="aurora-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
        <div style={{ maxWidth: 440, width: "100%", background: "#ffffff", border: "1px solid var(--border)", borderRadius: 16, padding: "2.5rem 2rem", textAlign: "center", boxShadow: "var(--shadow-lg)" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(79, 70, 229, 0.08)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.25rem" }}>
            <Terminal size={26} />
          </div>
          <h1 style={{ fontSize: "1.35rem", fontWeight: 700, marginBottom: "0.5rem", color: "var(--foreground)" }}>
            Sign in to Connect Whizan MCP
          </h1>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "1.75rem" }}>
            Please authenticate with your Whizan Cloud account to authorize your local IDE or terminal session.
          </p>
          <Link
            href={`/login?redirect=/mcp/connect${port ? `?port=${port}` : ""}`}
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", padding: "0.75rem" }}
          >
            Sign In to Whizan Cloud <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="aurora-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <div style={{ maxWidth: 480, width: "100%", background: "#ffffff", border: "1px solid var(--border)", borderRadius: 20, padding: "2.5rem 2rem", boxShadow: "var(--shadow-lg)", position: "relative", overflow: "hidden" }}>
        {/* Brand Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #4f46e5, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", boxShadow: "0 4px 12px rgba(79, 70, 229, 0.25)" }}>
            <Sparkles size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
              Authorize Whizan DevOps MCP
            </h1>
            <span style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: 600 }}>
              Autonomous In-IDE Deployment Engine
            </span>
          </div>
        </div>

        {/* User Card */}
        <div style={{ background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: 12, padding: "0.85rem 1rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(79, 70, 229, 0.1)", color: "var(--accent)", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem" }}>
              {(user.name || user.email)[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--foreground)" }}>{user.email}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Role: {user.role || "USER"}</div>
            </div>
          </div>
          <span className="badge badge-ready">
            Active
          </span>
        </div>

        {/* Description */}
        <p style={{ color: "var(--muted)", fontSize: "0.88rem", lineHeight: 1.55, marginBottom: "1.5rem" }}>
          {port ? (
            <>
              A local terminal session on <strong className="text-slate-900">port {port}</strong> is requesting permission to authenticate Whizan Cloud MCP tools on this machine.
            </>
          ) : (
            <>
              Connect your local machine to Whizan Cloud. Once authorized, your AI coding assistants in <strong className="text-slate-900">Antigravity IDE, Cursor, Windsurf, VS Code, and Claude</strong> can deploy services without manual API key entry.
            </>
          )}
        </p>

        {/* Action Button */}
        {port ? (
          <button
            onClick={handleAuthorize}
            disabled={authorizing || !token}
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", padding: "0.8rem", fontSize: "0.95rem", fontWeight: 700, gap: "0.5rem", marginBottom: "1rem" }}
          >
            {authorizing ? <RefreshCw size={16} className="spin" /> : <ShieldCheck size={18} />}
            {authorizing ? "Connecting Local Session..." : "Authorize & Connect Machine"}
          </button>
        ) : (
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--muted)", marginBottom: "0.45rem", textTransform: "uppercase" }}>
              Run Once in Your Terminal
            </div>
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: "0.85rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
              <code style={{ fontSize: "0.78rem", color: "#38bdf8", wordBreak: "break-all" }}>
                npx @whizan/mcp-devops login {token ? `--token ${token.slice(0, 16)}...` : ""}
              </code>
              <button
                onClick={copyToken}
                className="btn btn-secondary btn-sm"
                style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
              >
                {copied ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {statusText && (
          <div style={{ fontSize: "0.8rem", color: "var(--accent)", textAlign: "center", marginBottom: "1rem" }}>
            {statusText}
          </div>
        )}

        {/* Zero-Config IDE snippet preview */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--muted)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <ShieldCheck size={14} className="text-emerald-600" />
              Direct TLS API Handshake
            </span>
            <Link href="/dashboard/mcp" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
              View MCP Config
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConnectPage() {
  return (
    <Suspense
      fallback={
        <div className="aurora-bg" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <RefreshCw size={28} className="spin text-accent" />
        </div>
      }
    >
      <ConnectContent />
    </Suspense>
  );
}
