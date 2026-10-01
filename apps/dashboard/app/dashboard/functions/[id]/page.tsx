"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Zap,
  ArrowLeft,
  Play,
  Code2,
  Terminal,
  Activity,
  Copy,
  Check,
  ExternalLink,
  Shield,
  ShieldCheck,
  Lock,
  Globe,
  Clock,
  Cpu,
  Layers,
  Settings,
  Trash2,
  RefreshCw,
  Plus,
  Eye,
  EyeOff,
  Flame,
  CheckCircle2,
  AlertCircle,
  Download,
  Share2,
  Sliders,
  History,
  Send,
  FileCode,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  functionsApi,
  type FunctionServiceItem,
  type FunctionTestResult,
  type FunctionApiKeyItem,
} from "@/lib/api";
import { getFunctionIngressUrl, getFunctionPathUrl } from "@/lib/domains";

export default function FunctionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const functionId = params?.id as string;

  const [service, setService] = useState<FunctionServiceItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "overview" | "code" | "test" | "logs" | "keys" | "env" | "settings"
  >("overview");

  // Code & Deploy state
  const [code, setCode] = useState("");
  const [deploying, setDeploying] = useState(false);

  // Test Runner state
  const [testMethod, setTestMethod] = useState<"GET" | "POST" | "PUT" | "DELETE" | "PATCH">("GET");
  const [testPath, setTestPath] = useState("/");
  const [testHeaders, setTestHeaders] = useState<Array<{ key: string; value: string }>>([]);
  const [testBody, setTestBody] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<FunctionTestResult | null>(null);

  // Live Logs state
  const [logs, setLogs] = useState<Array<{ timestamp: string; level: string; message: string; meta?: any }>>([]);
  const [logsAutoScroll, setLogsAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // API Key creation modal
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("Production API Key");
  const [newKeyRpm, setNewKeyRpm] = useState(600);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Env vars state
  const [envKey, setEnvKey] = useState("");
  const [envValue, setEnvValue] = useState("");
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [savingEnv, setSavingEnv] = useState(false);

  // Settings state
  const [settingsForm, setSettingsForm] = useState({
    name: "",
    timeoutSeconds: 10,
    memoryLimit: 128,
    isPublic: false,
  });

  const fetchService = async () => {
    try {
      const data = await functionsApi.get(functionId);
      setService(data);
      setSettingsForm({
        name: data.name,
        timeoutSeconds: Math.round(data.timeoutMs / 1000),
        memoryLimit: data.memoryLimit,
        isPublic: data.isPublic,
      });

      // Default sample code if not loaded
      if (!code) {
        setCode(
          `export default async function handler(req: Request) {
  const url = new URL(req.url);

  return new Response(JSON.stringify({
    success: true,
    message: "Hello from Whizan Edge Function!",
    slug: "${data.slug}",
    path: url.pathname,
    method: req.method,
    timestamp: new Date().toISOString()
  }, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}`
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load function details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchService();
    const tabParam = searchParams.get("tab") as any;
    if (tabParam && ["overview", "code", "test", "logs", "keys", "env", "settings"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [functionId]);

  // Handle Live Logs SSE stream
  useEffect(() => {
    if (activeTab === "logs" && service) {
      const streamUrl = functionsApi.getLogsStreamUrl(service.id);
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setLogs((prev) => [...prev.slice(-300), parsed]);
        } catch {
          setLogs((prev) => [
            ...prev.slice(-300),
            { timestamp: new Date().toISOString(), level: "INFO", message: event.data },
          ]);
        }
      };

      es.onerror = () => {
        // SSE disconnected or silent reconnect
      };

      return () => {
        es.close();
      };
    }
  }, [activeTab, service]);

  useEffect(() => {
    if (logsAutoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, logsAutoScroll]);

  // Code Deployment
  const handleDeployCode = async () => {
    if (!code.trim()) return toast.error("Code cannot be empty");
    setDeploying(true);
    try {
      const res = await functionsApi.deploy(functionId, code);
      toast.success(
        `Version v${res.deployment.version} deployed to Edge in ${res.stats?.durationMs || 120}ms!`
      );
      fetchService();
    } catch (err: any) {
      toast.error(err.message || "Deployment failed");
    } finally {
      setDeploying(false);
    }
  };

  // Test Runner Execution
  const handleExecuteTest = async () => {
    setTesting(true);
    setTestResult(null);

    const headersObj: Record<string, string> = {};
    testHeaders.forEach((h) => {
      if (h.key.trim()) headersObj[h.key.trim()] = h.value;
    });

    let parsedBody: any = undefined;
    if (["POST", "PUT", "PATCH"].includes(testMethod) && testBody.trim()) {
      try {
        parsedBody = JSON.parse(testBody);
      } catch {
        parsedBody = testBody;
      }
    }

    try {
      const result = await functionsApi.test(functionId, {
        method: testMethod,
        path: testPath.startsWith("/") ? testPath : `/${testPath}`,
        headers: headersObj,
        body: parsedBody,
      });
      setTestResult(result);
    } catch (err: any) {
      toast.error(err.message || "Test invocation failed");
    } finally {
      setTesting(false);
    }
  };

  // API Key creation
  const handleCreateKey = async () => {
    try {
      const res = await functionsApi.createApiKey(functionId, {
        name: newKeyName,
        rateLimitRpm: newKeyRpm,
        scopes: ["EXECUTE"],
      });
      if (res.apiKey?.key) {
        setGeneratedKey(res.apiKey.key);
      }
      toast.success("API Key generated!");
      fetchService();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate API Key");
    }
  };

  // Delete API Key
  const handleDeleteKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key? Immediate revocation will reject callers.")) return;
    try {
      await functionsApi.deleteApiKey(functionId, keyId);
      toast.success("API Key revoked");
      fetchService();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke key");
    }
  };

  // Delete Function
  const handleDeleteFunction = async () => {
    if (!confirm(`Are you sure you want to delete '${service?.name}'? This cannot be undone.`)) return;
    try {
      await functionsApi.delete(functionId);
      toast.success("Edge Function deleted");
      router.push("/dashboard/functions");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete function");
    }
  };

  // Update Settings
  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await functionsApi.update(functionId, {
        name: settingsForm.name,
        timeoutMs: settingsForm.timeoutSeconds * 1000,
        memoryLimit: settingsForm.memoryLimit,
        isPublic: settingsForm.isPublic,
      });
      toast.success("Settings updated");
      fetchService();
    } catch (err: any) {
      toast.error(err.message || "Failed to update settings");
    }
  };

  if (loading || !service) {
    return (
      <div style={{ padding: "6rem 0", textAlign: "center", color: "var(--muted)" }}>
        <RefreshCw size={32} className="animate-spin" style={{ margin: "0 auto 1rem", opacity: 0.6 }} />
        <p>Loading function console...</p>
      </div>
    );
  }

  const primaryUrl = getFunctionIngressUrl(service.slug);
  const pathUrl = getFunctionPathUrl(service.slug);
  const latestDeploy = service.deployments?.[0];
  const isReady = latestDeploy?.status === "READY";
  const primaryApiKey = service.apiKeys?.[0];

  return (
    <div className="page" style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Back button */}
      <div style={{ marginBottom: "1.25rem" }}>
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

      {/* Header Banner */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "1.75rem",
          marginBottom: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: "var(--accent-glow)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Zap size={20} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <h1 style={{ fontSize: "1.35rem", fontWeight: 700 }}>{service.name}</h1>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    padding: "0.15rem 0.5rem",
                    borderRadius: 4,
                    background: "var(--bg-inset)",
                    color: "var(--muted)",
                    border: "1px solid var(--border)",
                  }}
                >
                  v{latestDeploy?.version || 1}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    padding: "0.2rem 0.5rem",
                    borderRadius: 999,
                    background: isReady ? "var(--success-glow)" : "var(--warning-glow)",
                    color: isReady ? "var(--success)" : "var(--warning)",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: isReady ? "var(--success)" : "var(--warning)",
                    }}
                  />
                  {isReady ? "READY" : latestDeploy?.status || "DEPLOYING"}
                </span>
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--muted)", fontFamily: "monospace" }}>
                {service.slug}
              </div>
            </div>
          </div>
        </div>

        {/* Live URL Pill with Copy */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div
            style={{
              background: "var(--bg-inset)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "0.5rem 0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span style={{ fontSize: "0.82rem", fontFamily: "monospace", color: "var(--foreground)" }}>
              {primaryUrl}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(primaryUrl);
                setCopiedUrl(true);
                toast.success("URL copied");
                setTimeout(() => setCopiedUrl(false), 2000);
              }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}
              title="Copy URL"
            >
              {copiedUrl ? <Check size={14} style={{ color: "var(--success)" }} /> : <Copy size={14} />}
            </button>
          </div>

          <a
            href={primaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
            style={{ padding: "0.5rem 0.75rem" }}
            title="Open in Browser"
          >
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      {/* Tab Navigation */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          gap: "0.5rem",
          marginBottom: "1.75rem",
          overflowX: "auto",
        }}
      >
        {[
          { id: "overview", label: "Overview & Metrics", icon: Activity },
          { id: "code", label: "Code & Deploy", icon: Code2 },
          { id: "test", label: "Interactive Test Runner", icon: Play },
          { id: "logs", label: "Live Edge Logs", icon: Terminal },
          { id: "keys", label: "API Keys & Ingress", icon: Lock },
          { id: "settings", label: "Settings", icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1rem",
                fontSize: "0.88rem",
                fontWeight: 600,
                border: "none",
                background: "transparent",
                color: isActive ? "var(--accent)" : "var(--muted)",
                borderBottom: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── TAB 1: OVERVIEW & METRICS ────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div>
          <div className="stats-grid" style={{ marginBottom: "1.75rem" }}>
            <div className="stat-card">
              <div className="stat-label">
                <Activity size={14} style={{ color: "#10b981" }} /> Total Invocations
              </div>
              <div className="stat-value" style={{ color: "#10b981" }}>
                {(service._count?.invocations || service.stats?.totalInvocations || 0).toLocaleString()}
              </div>
              <div className="stat-sub">Lifetime requests processed</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <Flame size={14} style={{ color: "#f59e0b" }} /> Average Execution Latency
              </div>
              <div className="stat-value" style={{ color: "#f59e0b" }}>
                {service.stats?.avgDurationMs ? `${service.stats.avgDurationMs.toFixed(1)} ms` : "< 4 ms"}
              </div>
              <div className="stat-sub">Sub-millisecond isolate invoke</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <Cpu size={14} style={{ color: "var(--accent)" }} /> Memory Limit
              </div>
              <div className="stat-value">{service.memoryLimit} MB</div>
              <div className="stat-sub">Scale-to-zero when idle</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <Clock size={14} style={{ color: "var(--muted)" }} /> Hard Timeout
              </div>
              <div className="stat-value">{service.timeoutMs / 1000}s</div>
              <div className="stat-sub">AbortController boundary</div>
            </div>
          </div>

          {/* Quick Terminal cURL Section */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Terminal size={16} style={{ color: "var(--accent)" }} /> Terminal cURL Invocation
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1rem" }}>
              You can call this Edge Function directly from your terminal or any HTTP client:
            </p>

            <div
              style={{
                background: "#080b11",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "1rem",
                fontFamily: "monospace",
                fontSize: "0.84rem",
                color: "#f8fafc",
                position: "relative",
              }}
            >
              {service.isPublic ? (
                <div>curl -i {primaryUrl}</div>
              ) : (
                <div>
                  curl -i -H &quot;x-api-key: {primaryApiKey?.keyPrefix || "whz_fn_live_xxx"}...&quot; \{`\n`}
                  &nbsp;&nbsp;{primaryUrl}
                </div>
              )}

              <button
                onClick={() => {
                  const cmd = service.isPublic
                    ? `curl -i ${primaryUrl}`
                    : `curl -i -H "x-api-key: ${primaryApiKey?.keyPrefix || "whz_fn_live_xxx"}..." ${primaryUrl}`;
                  navigator.clipboard.writeText(cmd);
                  toast.success("cURL command copied");
                }}
                className="btn btn-outline"
                style={{
                  position: "absolute",
                  top: "0.75rem",
                  right: "0.75rem",
                  padding: "0.3rem 0.6rem",
                  fontSize: "0.75rem",
                }}
              >
                <Copy size={13} /> Copy cURL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: CODE & DEPLOY ─────────────────────────────────────────────── */}
      {activeTab === "code" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
                flexWrap: "wrap",
                gap: "0.75rem",
              }}
            >
              <div>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Inline Edge Code Editor</h3>
                <p style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                  Write TypeScript or standard Web API code. Compiled and deployed globally in &lt; 200ms.
                </p>
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={handleDeployCode}
                  disabled={deploying}
                  className="btn btn-primary"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    boxShadow: "0 0 15px var(--accent-glow)",
                  }}
                >
                  <Sparkles size={15} />
                  {deploying ? "Compiling & Deploying..." : "Deploy to Edge"}
                </button>
              </div>
            </div>

            {/* Code Textarea */}
            <div
              style={{
                borderRadius: "var(--radius-sm)",
                overflow: "hidden",
                border: "1px solid var(--border)",
                background: "#080b11",
              }}
            >
              <div
                style={{
                  padding: "0.5rem 1rem",
                  background: "#0e131d",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "0.76rem", color: "#94a3b8", fontFamily: "monospace" }}>
                  index.ts (V8 Isolated Runtime)
                </span>
                <span
                  style={{
                    fontSize: "0.72rem",
                    padding: "0.15rem 0.4rem",
                    borderRadius: 4,
                    background: "rgba(99,102,241,0.2)",
                    color: "#818cf8",
                    fontWeight: 700,
                  }}
                >
                  Zero Cold-Start
                </span>
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={18}
                spellCheck={false}
                style={{
                  width: "100%",
                  padding: "1rem",
                  background: "transparent",
                  color: "#f8fafc",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: "0.85rem",
                  lineHeight: "1.55",
                  border: "none",
                  outline: "none",
                  resize: "vertical",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 3: INTERACTIVE TEST RUNNER ───────────────────────────────────── */}
      {activeTab === "test" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          {/* Request Composer */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
            }}
          >
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Play size={16} style={{ color: "var(--accent)" }} /> Request Composer
            </h3>

            {/* Method & Path */}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
              <select
                value={testMethod}
                onChange={(e) => setTestMethod(e.target.value as any)}
                style={{
                  padding: "0.6rem 0.85rem",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--foreground)",
                  fontWeight: 700,
                  fontSize: "0.85rem",
                }}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
              </select>

              <input
                type="text"
                placeholder="/api/example"
                value={testPath}
                onChange={(e) => setTestPath(e.target.value)}
                style={{
                  flex: 1,
                  padding: "0.6rem 0.85rem",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--foreground)",
                  fontFamily: "monospace",
                  fontSize: "0.85rem",
                }}
              />

              <button
                onClick={handleExecuteTest}
                disabled={testing}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Send size={14} />
                {testing ? "Executing..." : "Send"}
              </button>
            </div>

            {/* JSON Request Body */}
            {["POST", "PUT", "PATCH"].includes(testMethod) && (
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                  JSON Request Body
                </label>
                <textarea
                  value={testBody}
                  onChange={(e) => setTestBody(e.target.value)}
                  placeholder='{ "userId": "usr_123", "action": "checkout" }'
                  rows={6}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    background: "var(--bg-inset)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--foreground)",
                    fontFamily: "monospace",
                    fontSize: "0.82rem",
                  }}
                />
              </div>
            )}

            <div
              style={{
                fontSize: "0.8rem",
                color: "var(--muted)",
                background: "var(--bg-inset)",
                padding: "0.75rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
              }}
            >
              💡 <strong>Auth note:</strong> If protected by an API Key, the test runner automatically forwards the test session with authorized execute scopes.
            </div>
          </div>

          {/* Response Inspector */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Response Inspector</h3>
              {testResult && (
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "0.2rem 0.5rem",
                      borderRadius: 4,
                      background: testResult.status < 400 ? "var(--success-glow)" : "var(--danger-glow)",
                      color: testResult.status < 400 ? "var(--success)" : "var(--danger)",
                    }}
                  >
                    HTTP {testResult.status}
                  </span>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#f59e0b" }}>
                    ⚡ {testResult.durationMs}ms
                  </span>
                </div>
              )}
            </div>

            {testResult ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    background: "#080b11",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "1rem",
                    flex: 1,
                    overflow: "auto",
                    fontFamily: "monospace",
                    fontSize: "0.82rem",
                    color: "#f8fafc",
                    maxHeight: 400,
                  }}
                >
                  <pre style={{ margin: 0 }}>
                    {typeof testResult.data === "object"
                      ? JSON.stringify(testResult.data, null, 2)
                      : String(testResult.data)}
                  </pre>
                </div>
              </div>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--muted)",
                  fontSize: "0.88rem",
                  border: "1px dashed var(--border)",
                  borderRadius: "var(--radius-sm)",
                  minHeight: 250,
                }}
              >
                Click &quot;Send&quot; to invoke the function and inspect the live output.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 4: LIVE LOGS ─────────────────────────────────────────────────── */}
      {activeTab === "logs" && (
        <div
          style={{
            background: "#080b11",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            overflow: "hidden",
          }}
        >
          {/* Logs Header */}
          <div
            style={{
              padding: "0.75rem 1.25rem",
              background: "#0e131d",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f8fafc" }}>
                Live Edge Function Stream (SSE)
              </span>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button
                onClick={() => setLogsAutoScroll((p) => !p)}
                style={{
                  background: logsAutoScroll ? "rgba(99,102,241,0.2)" : "transparent",
                  color: logsAutoScroll ? "#818cf8" : "#94a3b8",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 4,
                  padding: "0.25rem 0.5rem",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              >
                Auto-scroll: {logsAutoScroll ? "ON" : "OFF"}
              </button>
              <button
                onClick={() => setLogs([])}
                style={{
                  background: "transparent",
                  color: "#94a3b8",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 4,
                  padding: "0.25rem 0.5rem",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Logs Body */}
          <div
            style={{
              padding: "1rem",
              fontFamily: "monospace",
              fontSize: "0.8rem",
              lineHeight: 1.6,
              minHeight: 360,
              maxHeight: 520,
              overflowY: "auto",
              color: "#e2e8f0",
            }}
          >
            {logs.length === 0 ? (
              <div style={{ color: "#64748b", textAlign: "center", padding: "3rem 0" }}>
                Waiting for incoming invocations... Invoke the function to see live output.
              </div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} style={{ display: "flex", gap: "0.75rem", marginBottom: "0.3rem" }}>
                  <span style={{ color: "#64748b", flexShrink: 0 }}>
                    {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "--:--:--"}
                  </span>
                  <span
                    style={{
                      color:
                        log.level === "ERROR" ? "#f43f5e" : log.level === "WARN" ? "#f59e0b" : "#38bdf8",
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    [{log.level || "INFO"}]
                  </span>
                  <span style={{ wordBreak: "break-all" }}>{log.message}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* ─── TAB 5: API KEYS & INGRESS ────────────────────────────────────────── */}
      {activeTab === "keys" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
          {/* API Keys Table */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.25rem",
              }}
            >
              <div>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Function API Keys</h3>
                <p style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                  Scoped, token-bucket rate limited access keys for this specific function.
                </p>
              </div>

              <button
                onClick={() => setShowKeyModal(true)}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Plus size={15} /> Create API Key
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Key Name</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Prefix</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Rate Limit</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Last Used</th>
                    <th style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {service.apiKeys?.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
                        No API keys configured yet.
                      </td>
                    </tr>
                  ) : (
                    service.apiKeys?.map((k) => (
                      <tr key={k.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.75rem 0.5rem", fontWeight: 600 }}>{k.name}</td>
                        <td style={{ padding: "0.75rem 0.5rem", fontFamily: "monospace" }}>
                          <code>{k.keyPrefix}...</code>
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem" }}>{k.rateLimitRpm} RPM</td>
                        <td style={{ padding: "0.75rem 0.5rem", color: "var(--muted)" }}>
                          {k.lastUsedAt ? formatDistanceToNow(new Date(k.lastUsedAt)) + " ago" : "Never"}
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                          <button
                            onClick={() => handleDeleteKey(k.id)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--danger)",
                              cursor: "pointer",
                              padding: "0.25rem",
                            }}
                            title="Revoke Key"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 6: SETTINGS ──────────────────────────────────────────────────── */}
      {activeTab === "settings" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
          {/* General Config Form */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
            }}
          >
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "1rem" }}>
              Function Configuration
            </h3>

            <form onSubmit={handleUpdateSettings}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.5rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                    Function Name
                  </label>
                  <input
                    type="text"
                    value={settingsForm.name}
                    onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      background: "var(--bg-inset)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--foreground)",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                    Memory Allocation (MB)
                  </label>
                  <select
                    value={settingsForm.memoryLimit}
                    onChange={(e) => setSettingsForm({ ...settingsForm, memoryLimit: Number(e.target.value) })}
                    style={{
                      width: "100%",
                      padding: "0.6rem 0.85rem",
                      background: "var(--bg-inset)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--foreground)",
                    }}
                  >
                    <option value={64}>64 MB (Micro)</option>
                    <option value={128}>128 MB (Default)</option>
                    <option value={256}>256 MB (Standard)</option>
                    <option value={512}>512 MB (Heavy)</option>
                  </select>
                </div>
              </div>

              <button type="submit" className="btn btn-primary">
                Save Configuration
              </button>
            </form>
          </div>

          {/* Danger Zone */}
          <div
            style={{
              background: "rgba(225, 29, 72, 0.04)",
              border: "1px solid rgba(225, 29, 72, 0.2)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
            }}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--danger)", marginBottom: "0.5rem" }}>
              Danger Zone
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1rem" }}>
              Permanently delete this Edge Function, purge bundled code from disk, revoke all API keys, and unbind edge routing.
            </p>
            <button
              onClick={handleDeleteFunction}
              className="btn btn-danger"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <Trash2 size={15} /> Delete Function
            </button>
          </div>
        </div>
      )}

      {/* Create Key Modal */}
      {showKeyModal && (
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
              padding: "1.75rem",
              maxWidth: 480,
              width: "100%",
            }}
          >
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Generate Function API Key
            </h3>
            <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
              Generates a cryptographically secure key prefixed with <code>whz_fn_live_</code>.
            </p>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                Key Identifier Name
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.85rem",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--foreground)",
                }}
              />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                Rate Limit (RPM)
              </label>
              <input
                type="number"
                min={10}
                max={10000}
                value={newKeyRpm}
                onChange={(e) => setNewKeyRpm(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "0.6rem 0.85rem",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--foreground)",
                }}
              />
            </div>

            {generatedKey ? (
              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--success)", marginBottom: "0.4rem" }}>
                  Key generated successfully:
                </div>
                <div
                  style={{
                    background: "var(--bg-inset)",
                    padding: "0.75rem",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    wordBreak: "break-all",
                    fontFamily: "monospace",
                    fontSize: "0.82rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>{generatedKey}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedKey);
                      setCopiedKey(true);
                      toast.success("Copied");
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)" }}
                  >
                    {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                onClick={() => {
                  setShowKeyModal(false);
                  setGeneratedKey(null);
                }}
                className="btn btn-outline"
              >
                Close
              </button>
              {!generatedKey && (
                <button onClick={handleCreateKey} className="btn btn-primary">
                  Generate Key
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
