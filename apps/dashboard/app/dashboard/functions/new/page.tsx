"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Zap,
  ArrowLeft,
  Sparkles,
  Lock,
  Globe,
  Sliders,
  Check,
  Copy,
  AlertCircle,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { functionsApi } from "@/lib/api";

const DEFAULT_CODE = `export default async function handler(req: Request) {
  const url = new URL(req.url);
  return Response.json({
    success: true,
    message: "Hello from Whizan Edge Function!",
    timestamp: new Date().toISOString(),
    path: url.pathname,
    method: req.method,
  });
}
`;

export default function NewEdgeFunctionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState(10);
  const [memoryLimit, setMemoryLimit] = useState(128);
  const [code] = useState(DEFAULT_CODE);

  // Success modal state for showing generated API key
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const handleNameChange = (val: string) => {
    setName(val);
    const autoSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setSlug(autoSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Please enter a function name");
    if (!slug.trim()) return toast.error("Please enter a valid slug");

    setLoading(true);
    try {
      const res: any = await functionsApi.create({
        name: name.trim(),
        slug: slug.trim(),
        runtime: "EDGE_TYPESCRIPT",
        timeoutMs: timeoutSeconds * 1000,
        memoryLimit,
        isPublic,
        initialCode: code,
      });

      const fnService = res?.functionService || res?.service;
      const keyInfo = res?.initialApiKey || res?.apiKey;

      if (!fnService) {
        throw new Error("Function created but service object was not returned");
      }

      if (!isPublic && keyInfo?.key) {
        // Show API key alert before routing
        setCreatedApiKey(keyInfo.key);
        setCreatedSlug(fnService.slug);
        setCreatedId(fnService.id);
      } else {
        toast.success(`Edge Function '${fnService.name}' deployed!`);
        router.push(`/dashboard/functions/${fnService.id}`);
      }
    } catch (err: any) {
      if (err.message?.includes("already taken") || err.message?.includes("SLUG_CONFLICT")) {
        toast.error(`The slug '${slug}' is already taken. Please choose a different subdomain slug.`);
      } else {
        toast.error(err.message || "Failed to create Edge Function");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 1000, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/dashboard/functions"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            fontSize: "0.85rem",
            color: "var(--muted)",
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={14} /> Back to Edge Functions
        </Link>
      </div>

      <PageHeader
        title="Deploy New Edge Function"
        subtitle="Provision a serverless V8 isolate with dedicated API keys and instant global routing."
      />

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
          {/* Section 1: Function Identity */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.75rem",
            }}
          >
            <h3
              style={{
                fontSize: "1.05rem",
                fontWeight: 700,
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Zap size={16} style={{ color: "var(--accent)" }} /> 1. Function Identity
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Function Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Stripe Webhook Validator"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.85rem",
                    background: "var(--bg-inset)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--foreground)",
                    fontSize: "0.9rem",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Unique Subdomain Slug
                </label>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="stripe-webhook"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    required
                    style={{
                      flex: 1,
                      padding: "0.65rem 0.85rem",
                      background: "var(--bg-inset)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm) 0 0 var(--radius-sm)",
                      color: "var(--foreground)",
                      fontSize: "0.9rem",
                      fontFamily: "monospace",
                    }}
                  />
                  <span
                    style={{
                      padding: "0.65rem 0.85rem",
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderLeft: "none",
                      borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
                      fontSize: "0.8rem",
                      color: "var(--muted)",
                    }}
                  >
                    .fn.whizan.cloud
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Access & Security Mode */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.75rem",
            }}
          >
            <h3
              style={{
                fontSize: "1.05rem",
                fontWeight: 700,
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Shield size={16} style={{ color: "var(--accent)" }} /> 2. Access Control & Security
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div
                onClick={() => setIsPublic(false)}
                style={{
                  border: `2px solid ${!isPublic ? "var(--accent)" : "var(--border)"}`,
                  background: !isPublic ? "var(--accent-glow)" : "var(--bg-inset)",
                  borderRadius: "var(--radius-sm)",
                  padding: "1.25rem",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                  <Lock size={16} style={{ color: "var(--accent)" }} />
                  <strong style={{ fontSize: "0.95rem" }}>API Key Protected (Recommended)</strong>
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.4 }}>
                  Requires <code>x-api-key: whz_fn_live_...</code> header. Automatically generates a primary key with token-bucket rate limiting.
                </p>
              </div>

              <div
                onClick={() => setIsPublic(true)}
                style={{
                  border: `2px solid ${isPublic ? "#10b981" : "var(--border)"}`,
                  background: isPublic ? "rgba(16, 185, 129, 0.08)" : "var(--bg-inset)",
                  borderRadius: "var(--radius-sm)",
                  padding: "1.25rem",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                  <Globe size={16} style={{ color: "#10b981" }} />
                  <strong style={{ fontSize: "0.95rem" }}>Public Webhook</strong>
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.4 }}>
                  Open to all public callers without an API key. Ideal for third-party webhooks (Stripe, GitHub, Shopify).
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Compute Limits */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.75rem",
            }}
          >
            <h3
              style={{
                fontSize: "1.05rem",
                fontWeight: 700,
                marginBottom: "1.25rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Sliders size={16} style={{ color: "var(--accent)" }} /> 3. Compute & Timeout Limits
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Memory Limit</label>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--accent)" }}>
                    {memoryLimit} MB
                  </span>
                </div>
                <input
                  type="range"
                  min={64}
                  max={512}
                  step={64}
                  value={memoryLimit}
                  onChange={(e) => setMemoryLimit(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.75rem",
                    color: "var(--muted)",
                    marginTop: "0.25rem",
                  }}
                >
                  <span>64 MB (Micro)</span>
                  <span>128 MB (Default)</span>
                  <span>512 MB (Max)</span>
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Execution Timeout</label>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--accent)" }}>
                    {timeoutSeconds} seconds
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={60}
                  step={1}
                  value={timeoutSeconds}
                  onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.75rem",
                    color: "var(--muted)",
                    marginTop: "0.25rem",
                  }}
                >
                  <span>1s</span>
                  <span>10s (Recommended)</span>
                  <span>60s (Heavy work)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1rem" }}>
            <Link href="/dashboard/functions" className="btn btn-outline">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-lg"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                boxShadow: "0 0 20px var(--accent-glow)",
              }}
            >
              <Sparkles size={16} />
              {loading ? "Deploying to Edge..." : "Deploy Edge Function"}
            </button>
          </div>
        </div>
      </form>

      {/* Generated API Key Modal */}
      {createdApiKey && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "2rem",
              maxWidth: 540,
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "var(--success-glow)",
                  color: "var(--success)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Check size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 700 }}>Function Deployed Successfully!</h3>
                <p style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                  Save your production API key now. It will not be shown again.
                </p>
              </div>
            </div>

            <div
              style={{
                background: "var(--bg-inset)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "1rem",
                marginBottom: "1.25rem",
              }}
            >
              <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--muted)", marginBottom: "0.4rem" }}>
                FUNCTION API KEY (whz_fn_live_...)
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <code
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--foreground)",
                    wordBreak: "break-all",
                    fontFamily: "monospace",
                  }}
                >
                  {createdApiKey}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(createdApiKey);
                    setCopiedKey(true);
                    toast.success("API Key copied to clipboard");
                    setTimeout(() => setCopiedKey(false), 2000);
                  }}
                  className="btn btn-outline"
                  style={{ padding: "0.35rem 0.65rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}
                >
                  {copiedKey ? <Check size={14} style={{ color: "var(--success)" }} /> : <Copy size={14} />}
                  <span style={{ fontSize: "0.8rem" }}>{copiedKey ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            <div
              style={{
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.2)",
                borderRadius: 6,
                padding: "0.75rem",
                fontSize: "0.8rem",
                color: "#d97706",
                marginBottom: "1.5rem",
                display: "flex",
                gap: "0.5rem",
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                Include this key in your HTTP requests via header:
                <br />
                <code>x-api-key: {createdApiKey.slice(0, 16)}...</code>
              </div>
            </div>

            <button
              onClick={() => router.push(`/dashboard/functions/${createdId}`)}
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
            >
              Continue to Function Console
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
