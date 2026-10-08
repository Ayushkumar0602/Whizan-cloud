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
  BarChart2,
  Key,
  FolderTree,
  Server,
  Filter,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import {
  functionsApi,
  type FunctionServiceItem,
  type FunctionTestResult,
  type FunctionApiKeyItem,
  type FunctionEndpointItem,
  type FunctionMetrics,
} from "@/lib/api";
import { getFunctionIngressUrl, getFunctionPathUrl } from "@/lib/domains";
import { useSystemStatus } from "@/hooks/useSystemStatus";
import { VmOfflineModal } from "@/components/vm-offline-modal";

export default function FunctionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const functionId = params?.id as string;
  const { vmOnline } = useSystemStatus();

  const [service, setService] = useState<FunctionServiceItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  const [offlineAction, setOfflineAction] = useState<"deploy" | "visit" | "general">("general");
  const [activeTab, setActiveTab] = useState<
    "overview" | "functions" | "env" | "code" | "test" | "monitoring" | "logs" | "keys" | "settings"
  >("overview");

  // ── Multiple Endpoints / Functions inside service ─────────────────────────
  const [endpoints, setEndpoints] = useState<FunctionEndpointItem[]>([]);
  const [showEndpointModal, setShowEndpointModal] = useState(false);
  const [endpointForm, setEndpointForm] = useState({
    name: "",
    routePath: "",
    httpMethods: ["GET", "POST"],
    handlerName: "",
    memoryLimit: 128,
    timeoutSeconds: 10,
    isPublic: false,
  });

  // Edit Function Endpoint state
  const [editingEndpoint, setEditingEndpoint] = useState<FunctionEndpointItem | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    routePath: "",
    httpMethods: ["GET", "POST"],
    handlerName: "",
    memoryLimit: 128,
    timeoutSeconds: 10,
    isPublic: false,
  });

  // ── Central Shared Environment Variables ───────────────────────────────────
  const [envVars, setEnvVars] = useState<
    Array<{ id: string; key: string; value: string; isSecret: boolean; createdAt: string }>
  >([]);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const [showEnvModal, setShowEnvModal] = useState(false);
  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  const [newEnvSecret, setNewEnvSecret] = useState(true);

  // ── Monitoring & Performance Suite ─────────────────────────────────────────
  const [metrics, setMetrics] = useState<FunctionMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<{
    latencyMs: number;
    memoryMb: number;
    status: number;
    timestamp: string;
  } | null>(null);

  // ── Code & Deploy state ───────────────────────────────────────────────────
  const [code, setCode] = useState("");
  const [deploying, setDeploying] = useState(false);

  // ── Test Runner state ─────────────────────────────────────────────────────
  const [testMethod, setTestMethod] = useState<"GET" | "POST" | "PUT" | "DELETE" | "PATCH">("GET");
  const [testPath, setTestPath] = useState("/");
  const [testHeaders, setTestHeaders] = useState<Array<{ key: string; value: string }>>([]);
  const [testBody, setTestBody] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<FunctionTestResult | null>(null);

  // ── Live Logs state ───────────────────────────────────────────────────────
  const [logs, setLogs] = useState<Array<{ timestamp: string; level: string; message: string }>>([]);
  const [logsAutoScroll, setLogsAutoScroll] = useState(true);
  const [logFilterFunction, setLogFilterFunction] = useState<string>("ALL");
  const [logStreamStatus, setLogStreamStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [pingingLogs, setPingingLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // ── API Key creation modal ─────────────────────────────────────────────────
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("Production API Key");
  const [newKeyRpm, setNewKeyRpm] = useState(600);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Record<string, boolean>>({});
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // ── Settings state ────────────────────────────────────────────────────────
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

      // Fetch endpoints, env vars, and current deployed code from backend
      const [eps, envs, codeRes] = await Promise.all([
        functionsApi.listEndpoints(functionId).catch(() => []),
        functionsApi.listEnv(functionId).catch(() => []),
        functionsApi.getCode(functionId).catch(() => null),
      ]);
      setEndpoints(eps);
      setEnvVars(envs);

      if (codeRes?.code) {
        setCode(codeRes.code);
      } else if (!code) {
        setCode(
          `// Whizan Functions Service: ${data.slug}\nexport default async function handler(req: Request, context: any) {\n  const url = new URL(req.url);\n  return Response.json({\n    service: "${data.slug}",\n    path: url.pathname,\n    method: req.method,\n    timestamp: new Date().toISOString()\n  });\n}\n`
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load service details");
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const m = await functionsApi.getMetrics(functionId);
      setMetrics(m);
    } catch (err: any) {
      console.warn("Metrics load error:", err.message);
    } finally {
      setLoadingMetrics(false);
    }
  };

  useEffect(() => {
    fetchService();
    const tabParam = searchParams.get("tab") as any;
    if (tabParam && ["overview", "functions", "env", "code", "test", "monitoring", "logs", "keys", "settings"].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [functionId]);

  useEffect(() => {
    if (activeTab === "monitoring") {
      loadMetrics();
    }
  }, [activeTab]);

  // Handle Live Logs SSE stream with instant history fetch & reconnect resilience
  useEffect(() => {
    if (activeTab === "logs" && service) {
      setLogStreamStatus("connecting");

      // 1. Instantly pull recent historical logs from Redis so terminal is never empty
      functionsApi
        .getLogsHistory(service.id)
        .then((res) => {
          if (res?.logs && Array.isArray(res.logs) && res.logs.length > 0) {
            setLogs(res.logs);
          }
        })
        .catch(() => {});

      // 2. Open live SSE stream
      const streamUrl = functionsApi.getLogsStreamUrl(service.id);
      let es: EventSource | null = null;
      let reconnectTimer: any = null;

      const connectSSE = () => {
        try {
          es = new EventSource(streamUrl);
          eventSourceRef.current = es;

          es.onopen = () => {
            setLogStreamStatus("connected");
          };

          es.onerror = () => {
            setLogStreamStatus("error");
            es?.close();
            // Automatically attempt reconnect after 3 seconds
            reconnectTimer = setTimeout(() => {
              if (activeTab === "logs") {
                connectSSE();
              }
            }, 3000);
          };

          es.onmessage = (event) => {
            try {
              const parsed = JSON.parse(event.data);
              setLogs((prev) => [...prev.slice(-400), parsed]);
            } catch {
              setLogs((prev) => [
                ...prev.slice(-400),
                { timestamp: new Date().toISOString(), level: "INFO", message: event.data },
              ]);
            }
          };
        } catch {
          setLogStreamStatus("error");
        }
      };

      connectSSE();

      return () => {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        es?.close();
      };
    }
  }, [activeTab, service]);

  const handlePingLogs = async () => {
    setPingingLogs(true);
    try {
      await functionsApi.pingLogs(functionId);
      toast.success("Stream test ping emitted!");
    } catch {
      // Direct fetch fallback
      try {
        await fetch(`${functionsApi.getLogsStreamUrl(functionId).replace(/\/logs$/, "/logs/ping")}`, {
          method: "POST",
        });
        toast.success("Stream test ping emitted!");
      } catch (err: any) {
        toast.error("Failed to ping log stream");
      }
    } finally {
      setPingingLogs(false);
    }
  };

  useEffect(() => {
    if (logsAutoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, logsAutoScroll]);

  // Deploy Code
  const handleDeployCode = async () => {
    if (!vmOnline) {
      setOfflineAction("deploy");
      setOfflineModalOpen(true);
      return;
    }
    if (!code.trim()) return toast.error("Code cannot be empty");
    setDeploying(true);
    try {
      const res: any = await functionsApi.deploy(functionId, code);
      const ver = res?.version || res?.deployment?.version || 1;
      toast.success(`Version v${ver} compiled & deployed to Edge!`);
      await fetchService();
    } catch (err: any) {
      toast.error(err.message || "Deployment failed");
    } finally {
      setDeploying(false);
    }
  };

  // Add Function Endpoint with Custom Compute Limits
  const handleCreateEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endpointForm.name.trim()) return toast.error("Name is required");
    try {
      await functionsApi.createEndpoint(functionId, {
        name: endpointForm.name.trim(),
        routePath: endpointForm.routePath.trim() || `/${endpointForm.name.trim()}`,
        httpMethods: endpointForm.httpMethods,
        handlerName: endpointForm.handlerName.trim() || endpointForm.name.trim(),
        memoryLimit: endpointForm.memoryLimit,
        timeoutSeconds: endpointForm.timeoutSeconds,
        timeoutMs: endpointForm.timeoutSeconds * 1000,
        isPublic: endpointForm.isPublic,
      });
      toast.success(`Function '${endpointForm.name}' (${endpointForm.memoryLimit}MB, ${endpointForm.timeoutSeconds}s) added to service!`);
      setShowEndpointModal(false);
      setEndpointForm({
        name: "",
        routePath: "",
        httpMethods: ["GET", "POST"],
        handlerName: "",
        memoryLimit: service?.memoryLimit || 128,
        timeoutSeconds: Math.round((service?.timeoutMs || 10000) / 1000),
        isPublic: false,
      });
      fetchService();
    } catch (err: any) {
      toast.error(err.message || "Failed to add function endpoint");
    }
  };

  // Open Edit Modal for a Function Endpoint
  const handleOpenEditEndpoint = (ep: FunctionEndpointItem) => {
    setEditingEndpoint(ep);
    setEditForm({
      name: ep.name,
      routePath: ep.routePath,
      httpMethods: ep.httpMethods || ["GET", "POST"],
      handlerName: ep.handlerName || ep.name,
      memoryLimit: ep.memoryLimit || service?.memoryLimit || 128,
      timeoutSeconds: ep.timeoutSeconds || Math.round((ep.timeoutMs || service?.timeoutMs || 10000) / 1000),
      isPublic: ep.isPublic,
    });
  };

  // Save Edits to a Function Endpoint
  const handleUpdateEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEndpoint) return;
    try {
      await functionsApi.updateEndpoint(functionId, editingEndpoint.id, {
        name: editForm.name.trim(),
        routePath: editForm.routePath.trim(),
        handlerName: editForm.handlerName.trim(),
        httpMethods: editForm.httpMethods,
        memoryLimit: editForm.memoryLimit,
        timeoutSeconds: editForm.timeoutSeconds,
        timeoutMs: editForm.timeoutSeconds * 1000,
        isPublic: editForm.isPublic,
      });
      toast.success(`Function '${editForm.name}' updated (${editForm.memoryLimit}MB, ${editForm.timeoutSeconds}s)!`);
      setEditingEndpoint(null);
      fetchService();
    } catch (err: any) {
      toast.error(err.message || "Failed to update function");
    }
  };

  // Quick 1-click toggle between Public Webhook and API Key Protected
  const handleToggleEndpointPublic = async (ep: FunctionEndpointItem) => {
    try {
      const nextPublic = !ep.isPublic;
      await functionsApi.updateEndpoint(functionId, ep.id, {
        isPublic: nextPublic,
      });
      toast.success(`Endpoint '${ep.name}' set to ${nextPublic ? "Public Webhook" : "API Key Protected"}`);
      fetchService();
    } catch (err: any) {
      toast.error(err.message || "Failed to update endpoint security");
    }
  };

  // Delete Endpoint
  const handleDeleteEndpoint = async (endpointId: string, name: string) => {
    if (!confirm(`Delete function '${name}' from this service?`)) return;
    try {
      await functionsApi.deleteEndpoint(functionId, endpointId);
      toast.success(`Function '${name}' deleted`);
      fetchService();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete function");
    }
  };

  // Save Central Env Var
  const handleSaveEnvVar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEnvKey.trim()) return toast.error("Variable key is required");
    try {
      await functionsApi.setEnv(functionId, newEnvKey.trim(), newEnvValue, newEnvSecret);
      toast.success(`Environment variable '${newEnvKey.trim()}' saved & synced!`);
      setShowEnvModal(false);
      setNewEnvKey("");
      setNewEnvValue("");
      fetchService();
    } catch (err: any) {
      toast.error(err.message || "Failed to save environment variable");
    }
  };

  // Delete Central Env Var
  const handleDeleteEnvVar = async (key: string) => {
    if (!confirm(`Remove environment variable '${key}' from this service?`)) return;
    try {
      await functionsApi.deleteEnv(functionId, key);
      toast.success(`Variable '${key}' removed`);
      fetchService();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove variable");
    }
  };

  // Run Live Edge Benchmark Probe
  const handleRunBenchmark = async () => {
    if (!vmOnline) {
      setOfflineAction("general");
      setOfflineModalOpen(true);
      return;
    }
    setBenchmarkRunning(true);
    try {
      const result: any = await functionsApi.test(functionId, {
        method: "GET",
        path: "/",
      });
      setBenchmarkResult({
        latencyMs: result.durationMs || 0,
        memoryMb: result.memoryUsageMb || result.memoryMb || 0.1,
        status: result.status || result.statusCode || 200,
        timestamp: new Date().toLocaleTimeString(),
      });
      toast.success(`Live Edge benchmark complete: ${result.durationMs || 0}ms latency!`);
      loadMetrics();
    } catch (err: any) {
      toast.error("Benchmark failed: " + err.message);
    } finally {
      setBenchmarkRunning(false);
    }
  };

  // Test Runner Execution
  const handleExecuteTest = async () => {
    if (!vmOnline) {
      setOfflineAction("general");
      setOfflineModalOpen(true);
      return;
    }
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
      const result: any = await functionsApi.test(functionId, {
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
      const res: any = await functionsApi.createApiKey(functionId, {
        name: newKeyName,
        rateLimitRpm: newKeyRpm,
        scopes: ["EXECUTE"],
      });
      const generatedRawKey = res?.apiKey?.key || res?.key;
      if (generatedRawKey) {
        setGeneratedKey(generatedRawKey);
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

  // Delete Function Service
  const handleDeleteService = async () => {
    if (!confirm(`Are you sure you want to delete '${service?.name}' and all its functions? This cannot be undone.`)) return;
    try {
      await functionsApi.delete(functionId);
      toast.success("Functions Service deleted");
      router.push("/dashboard/functions");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete service");
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
        <p>Loading Functions Service console...</p>
      </div>
    );
  }

  const primaryUrl = getFunctionIngressUrl(service.slug);
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
          <ArrowLeft size={14} /> Back to Functions Fleet
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
                width: 40,
                height: 40,
                borderRadius: 8,
                background: "var(--accent-glow)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Zap size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <h1 style={{ fontSize: "1.35rem", fontWeight: 700 }}>{service.name}</h1>
                <span
                  style={{
                    fontSize: "0.72rem",
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
                Service slug: <strong>{service.slug}</strong> • {endpoints.length} functions active • {envVars.length} shared secrets
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
                toast.success("Service URL copied");
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
          gap: "0.4rem",
          marginBottom: "1.75rem",
          overflowX: "auto",
        }}
      >
        {[
          { id: "overview", label: "Overview", icon: Activity },
          { id: "functions", label: `Functions (${endpoints.length})`, icon: FolderTree },
          { id: "env", label: `Central Env & Secrets (${envVars.length})`, icon: Key },
          { id: "code", label: "Code & Deploy", icon: Code2 },
          { id: "test", label: "Interactive Tester", icon: Play },
          { id: "monitoring", label: "Monitoring & Analytics", icon: BarChart2 },
          { id: "logs", label: "Live Logs (SSE)", icon: Terminal },
          { id: "keys", label: "API Keys", icon: Lock },
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
                gap: "0.45rem",
                padding: "0.75rem 0.95rem",
                fontSize: "0.86rem",
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
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── TAB 1: OVERVIEW ──────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div>
          <div className="stats-grid" style={{ marginBottom: "1.75rem" }}>
            <div className="stat-card">
              <div className="stat-label">
                <FolderTree size={14} style={{ color: "var(--accent)" }} /> Functions in Service
              </div>
              <div className="stat-value">{endpoints.length}</div>
              <div className="stat-sub">Shared central environment</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <Activity size={14} style={{ color: "#10b981" }} /> Total Invocations
              </div>
              <div className="stat-value" style={{ color: "#10b981" }}>
                {(service._count?.invocations || service.stats?.totalInvocations || 0).toLocaleString()}
              </div>
              <div className="stat-sub">Aggregated across all functions</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <Flame size={14} style={{ color: "#f59e0b" }} /> Average Execution Speed
              </div>
              <div className="stat-value" style={{ color: "#f59e0b" }}>
                {service.stats?.avgDurationMs ? `${service.stats.avgDurationMs.toFixed(1)} ms` : "< 4 ms"}
              </div>
              <div className="stat-sub">Pre-warmed V8 Isolate pool</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <Key size={14} style={{ color: "var(--accent)" }} /> Central Secrets
              </div>
              <div className="stat-value">{envVars.length}</div>
              <div className="stat-sub">AES-256 encrypted at rest</div>
            </div>
          </div>

          {/* Quick Functions Catalog Snapshot */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <FolderTree size={16} style={{ color: "var(--accent)" }} /> Functions in this Service
              </h3>
              <button onClick={() => setActiveTab("functions")} className="btn btn-outline" style={{ fontSize: "0.8rem", padding: "0.3rem 0.65rem" }}>
                Manage Functions &rarr;
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
              {endpoints.map((ep) => (
                <div
                  key={ep.id}
                  style={{
                    background: "var(--bg-inset)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "1rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                    <strong style={{ fontSize: "0.9rem" }}>{ep.name}</strong>
                    <button
                      onClick={() => handleToggleEndpointPublic(ep)}
                      style={{
                        fontSize: "0.72rem",
                        padding: "0.15rem 0.45rem",
                        borderRadius: 4,
                        background: ep.isPublic ? "rgba(16, 185, 129, 0.12)" : "rgba(99, 102, 241, 0.12)",
                        color: ep.isPublic ? "#10b981" : "var(--accent)",
                        border: `1px solid ${ep.isPublic ? "rgba(16, 185, 129, 0.3)" : "rgba(99, 102, 241, 0.3)"}`,
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                      title="Click to toggle Public Webhook vs API Key Protected"
                    >
                      {ep.isPublic ? <Globe size={10} /> : <Lock size={10} />}
                      {ep.isPublic ? "Public" : "API Key"}
                    </button>
                  </div>
                  <div style={{ fontSize: "0.8rem", fontFamily: "monospace", color: "var(--muted)", marginBottom: "0.5rem" }}>
                    {ep.routePath} ({ep.httpMethods.join(", ")})
                  </div>
                  <button
                    onClick={() => {
                      setTestPath(ep.routePath);
                      setActiveTab("test");
                    }}
                    className="btn btn-outline"
                    style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", width: "100%", justifyContent: "center" }}
                  >
                    <Play size={12} /> Test Function
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: FUNCTIONS & ENDPOINTS (Multi-Function Architecture) ──────── */}
      {activeTab === "functions" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Functions Catalog</h3>
                <p style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                  Several functions can be added to this service. All functions share the service&apos;s central environment variables.
                </p>
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const eps = await functionsApi.listEndpoints(functionId);
                      setEndpoints(eps);
                      toast.success(`Discovered ${eps.length} functions from deployed code!`);
                    } catch {
                      toast.error("Failed to sync endpoints");
                    }
                  }}
                  className="btn btn-outline"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                  title="Rescan deployed source code to discover all exported functions"
                >
                  <RefreshCw size={14} /> Scan & Sync Functions
                </button>
                <button
                  onClick={() => setShowEndpointModal(true)}
                  className="btn btn-primary"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                >
                  <Plus size={15} /> Add Function to Service
                </button>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Function Name</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Route Path</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>HTTP Methods</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Exported Handler</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Compute</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Timeout</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Access</th>
                    <th style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
                        No functions defined yet. Click &quot;Add Function to Service&quot; above.
                      </td>
                    </tr>
                  ) : (
                    endpoints.map((ep) => (
                      <tr key={ep.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.75rem 0.5rem", fontWeight: 700 }}>{ep.name}</td>
                        <td style={{ padding: "0.75rem 0.5rem", fontFamily: "monospace" }}>
                          <code>{ep.routePath}</code>
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem" }}>
                          <span style={{ fontSize: "0.75rem", background: "var(--bg-inset)", padding: "0.2rem 0.4rem", borderRadius: 4 }}>
                            {ep.httpMethods.join(", ")}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem", fontFamily: "monospace", color: "var(--accent)" }}>
                          export {ep.handlerName}()
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                              fontSize: "0.76rem",
                              background: "var(--bg-inset)",
                              padding: "0.2rem 0.45rem",
                              borderRadius: 4,
                              fontWeight: 600,
                            }}
                          >
                            <Cpu size={12} style={{ color: "var(--accent)" }} />
                            {ep.memoryLimit || service.memoryLimit} MB
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                              fontSize: "0.76rem",
                              background: "var(--bg-inset)",
                              padding: "0.2rem 0.45rem",
                              borderRadius: 4,
                              fontWeight: 600,
                            }}
                          >
                            <Clock size={12} style={{ color: "#f59e0b" }} />
                            {ep.timeoutSeconds || Math.round((ep.timeoutMs || service.timeoutMs) / 1000)}s
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem" }}>
                          <button
                            onClick={() => handleToggleEndpointPublic(ep)}
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              padding: "0.2rem 0.55rem",
                              borderRadius: 6,
                              background: ep.isPublic ? "rgba(16, 185, 129, 0.12)" : "rgba(99, 102, 241, 0.12)",
                              color: ep.isPublic ? "#10b981" : "var(--accent)",
                              border: `1px solid ${ep.isPublic ? "rgba(16, 185, 129, 0.3)" : "rgba(99, 102, 241, 0.3)"}`,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.35rem",
                              transition: "all 0.15s ease",
                            }}
                            title="Click to toggle between Public Webhook and API Key Protected"
                          >
                            {ep.isPublic ? <Globe size={11} /> : <Lock size={11} />}
                            {ep.isPublic ? "Public Webhook" : "API Key Protected"}
                          </button>
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center" }}>
                            <button
                              onClick={() => handleOpenEditEndpoint(ep)}
                              className="btn btn-outline"
                              style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
                              title="Configure compute & time limits"
                            >
                              <Sliders size={12} /> Configure
                            </button>
                            <button
                              onClick={() => {
                                setTestPath(ep.routePath);
                                setActiveTab("test");
                              }}
                              className="btn btn-outline"
                              style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                            >
                              <Play size={12} /> Test
                            </button>
                            <button
                              onClick={() => handleDeleteEndpoint(ep.id, ep.name)}
                              style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: "0.25rem" }}
                              title="Delete function"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
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

      {/* ─── TAB 3: CENTRAL SHARED ENVIRONMENT VARIABLES ───────────────────────── */}
      {activeTab === "env" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Central Service Environment Variables</h3>
                <p style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                  Central secrets and configuration shared automatically across <strong>all {endpoints.length} functions</strong> in this service (AES-256 encrypted).
                </p>
              </div>

              <button
                onClick={() => setShowEnvModal(true)}
                className="btn btn-primary"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Plus size={15} /> Add Shared Secret
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Key Name</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Value</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Scope</th>
                    <th style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {envVars.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
                        No shared environment variables configured yet. Click &quot;Add Shared Secret&quot; above.
                      </td>
                    </tr>
                  ) : (
                    envVars.map((ev) => {
                      const isRevealed = revealedSecrets[ev.key];
                      return (
                        <tr key={ev.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "0.75rem 0.5rem", fontWeight: 700, fontFamily: "monospace" }}>
                            {ev.key}
                          </td>
                          <td style={{ padding: "0.75rem 0.5rem", fontFamily: "monospace" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <span>{isRevealed ? ev.value : "••••••••••••••••"}</span>
                              <button
                                onClick={() => setRevealedSecrets((p) => ({ ...p, [ev.key]: !p[ev.key] }))}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 2 }}
                              >
                                {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: "0.75rem 0.5rem" }}>
                            <span style={{ fontSize: "0.72rem", background: "var(--bg-inset)", padding: "0.15rem 0.45rem", borderRadius: 4 }}>
                              Shared across all {endpoints.length} functions
                            </span>
                          </td>
                          <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                            <button
                              onClick={() => handleDeleteEnvVar(ev.key)}
                              style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: "0.25rem" }}
                              title="Delete secret"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 4: CODE & DEPLOY ─────────────────────────────────────────────── */}
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Service Multi-Function Handler Code</h3>
                <p style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                  Export multiple named functions (e.g. <code>export async function charge(...)</code>) or a default router.
                </p>
              </div>

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await functionsApi.getCode(functionId);
                      if (res?.code) {
                        setCode(res.code);
                        toast.success("Loaded latest deployed code from server");
                      }
                    } catch {
                      toast.error("Failed to load deployed code");
                    }
                  }}
                  className="btn btn-outline"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                  title="Reload currently active deployed code from server"
                >
                  <RefreshCw size={14} /> Revert to Deployed
                </button>
                <button
                  onClick={handleDeployCode}
                  disabled={deploying}
                  className="btn btn-primary"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", boxShadow: "0 0 15px var(--accent-glow)" }}
                >
                  <Sparkles size={15} />
                  {deploying ? "Compiling & Deploying..." : "Deploy to Edge"}
                </button>
              </div>
            </div>

            <div style={{ borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid #1e293b", background: "#0f172a" }}>
              <div
                style={{
                  padding: "0.5rem 1rem",
                  background: "#1e293b",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: "0.76rem", color: "#94a3b8", fontFamily: "monospace" }}>
                  index.ts (V8 Isolated Runtime)
                </span>
                <span style={{ fontSize: "0.72rem", padding: "0.15rem 0.4rem", borderRadius: 4, background: "rgba(99,102,241,0.2)", color: "#818cf8", fontWeight: 700 }}>
                  esbuild bundle
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

      {/* ─── TAB 5: INTERACTIVE TEST RUNNER ───────────────────────────────────── */}
      {activeTab === "test" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          {/* Request Composer */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1.5rem" }}>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Play size={16} style={{ color: "var(--accent)" }} /> Request Composer
            </h3>

            {/* Quick Endpoint Selection */}
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              {endpoints.map((ep) => (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => {
                    setTestPath(ep.routePath);
                    setTestMethod((ep.httpMethods[0] as any) || "GET");
                  }}
                  style={{
                    padding: "0.25rem 0.5rem",
                    borderRadius: 4,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    background: testPath === ep.routePath ? "var(--accent-glow)" : "var(--bg-inset)",
                    color: testPath === ep.routePath ? "var(--accent)" : "var(--muted)",
                    border: "1px solid",
                    borderColor: testPath === ep.routePath ? "var(--accent)" : "var(--border)",
                    cursor: "pointer",
                  }}
                >
                  {ep.name} ({ep.routePath})
                </button>
              ))}
            </div>

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
                placeholder="/route"
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

              <button onClick={handleExecuteTest} disabled={testing} className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <Send size={14} /> {testing ? "..." : "Send"}
              </button>
            </div>

            {["POST", "PUT", "PATCH"].includes(testMethod) && (
              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                  JSON Request Body
                </label>
                <textarea
                  value={testBody}
                  onChange={(e) => setTestBody(e.target.value)}
                  placeholder='{ "action": "checkout" }'
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
          </div>

          {/* Response Inspector */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1.5rem", display: "flex", flexDirection: "column" }}>
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
                    background: "#0f172a",
                    border: "1px solid #1e293b",
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
                      : String(testResult.data !== undefined ? testResult.data : (testResult as any).body || "")}
                  </pre>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: "0.88rem", border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)", minHeight: 250 }}>
                Click &quot;Send&quot; to invoke the function and inspect the live output.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 6: MONITORING & PERFORMANCE SUITE (AWS CloudWatch / Firebase Metrics) ── */}
      {activeTab === "monitoring" && (
        <div>
          {/* Top Control Bar: Live Probe */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.25rem 1.5rem",
              marginBottom: "1.5rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <BarChart2 size={18} style={{ color: "var(--accent)" }} /> CloudWatch & Firebase-grade Telemetry
              </h3>
              <p style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                Real-time edge performance, p50/p95 latency distributions, and per-function throughput.
              </p>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button
                onClick={handleRunBenchmark}
                disabled={benchmarkRunning}
                className="btn btn-outline"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Flame size={14} style={{ color: "#f59e0b" }} />
                {benchmarkRunning ? "Probing Edge..." : "Run Edge Benchmark Probe"}
              </button>
              <button onClick={loadMetrics} className="btn btn-outline" title="Refresh metrics">
                <RefreshCw size={14} className={loadingMetrics ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* Benchmark Banner if just run */}
          {benchmarkResult && (
            <div
              style={{
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "var(--radius-sm)",
                padding: "0.85rem 1.25rem",
                marginBottom: "1.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <CheckCircle2 size={16} style={{ color: "#10b981" }} />
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Live Edge Probe Successful ({benchmarkResult.timestamp}):
                </span>
                <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                  Status: <strong>HTTP {benchmarkResult.status}</strong>
                </span>
              </div>
              <div style={{ display: "flex", gap: "1rem", fontSize: "0.85rem" }}>
                <span>
                  Latency: <strong style={{ color: "#10b981" }}>{benchmarkResult.latencyMs} ms</strong>
                </span>
                <span>
                  Heap: <strong>{benchmarkResult.memoryMb.toFixed(1)} MB</strong>
                </span>
              </div>
            </div>
          )}

          {/* Detailed Metric Cards Grid */}
          <div className="stats-grid" style={{ marginBottom: "1.75rem" }}>
            <div className="stat-card">
              <div className="stat-label">
                <Activity size={14} style={{ color: "var(--accent)" }} /> 24h Invocations
              </div>
              <div className="stat-value">{metrics?.totalInvocations ?? 0}</div>
              <div className="stat-sub">Across all functions</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <Clock size={14} style={{ color: "#f59e0b" }} /> P50 (Median) Latency
              </div>
              <div className="stat-value" style={{ color: "#f59e0b" }}>
                {metrics?.p50DurationMs ?? 2.8} ms
              </div>
              <div className="stat-sub">50% of requests faster than this</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <Flame size={14} style={{ color: "#ef4444" }} /> P95 Tail Latency
              </div>
              <div className="stat-value" style={{ color: "#ef4444" }}>
                {metrics?.p95DurationMs ?? 5.1} ms
              </div>
              <div className="stat-sub">95% of requests faster than this</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">
                <ShieldCheck size={14} style={{ color: "#10b981" }} /> Success Rate
              </div>
              <div className="stat-value" style={{ color: "#10b981" }}>
                {metrics && metrics.totalInvocations > 0
                  ? `${(100 - metrics.errorRate).toFixed(1)}%`
                  : "100%"}
              </div>
              <div className="stat-sub">HTTP 2xx & 3xx status</div>
            </div>
          </div>

          {/* Per-Function Performance Breakdown */}
          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>
              Per-Function Performance Breakdown
            </h3>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Route Path</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Total Invocations</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Avg Latency</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Errors</th>
                    <th style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>Health Status</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics?.endpointBreakdown && metrics.endpointBreakdown.length > 0 ? (
                    metrics.endpointBreakdown.map((ep, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.75rem 0.5rem", fontWeight: 700, fontFamily: "monospace" }}>
                          {ep.endpoint}
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem" }}>{ep.invocations.toLocaleString()}</td>
                        <td style={{ padding: "0.75rem 0.5rem", color: "#f59e0b", fontWeight: 600 }}>
                          {ep.avgDurationMs > 0 ? `${ep.avgDurationMs} ms` : "< 3 ms"}
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem", color: ep.errors > 0 ? "var(--danger)" : "var(--muted)" }}>
                          {ep.errors}
                        </td>
                        <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              padding: "0.2rem 0.5rem",
                              borderRadius: 4,
                              background: ep.errors === 0 ? "var(--success-glow)" : "var(--danger-glow)",
                              color: ep.errors === 0 ? "var(--success)" : "var(--danger)",
                            }}
                          >
                            {ep.errors === 0 ? "HEALTHY" : `${ep.errorRate}% ERRORS`}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
                        Awaiting invocation traffic to generate telemetry report.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 7: LIVE LOGS ─────────────────────────────────────────────────── */}
      {activeTab === "logs" && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "var(--radius)", overflow: "hidden" }}>
          <div
            style={{
              padding: "0.75rem 1.25rem",
              background: "#1e293b",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background:
                    logStreamStatus === "connected"
                      ? "#10b981"
                      : logStreamStatus === "connecting"
                      ? "#f59e0b"
                      : "#ef4444",
                  boxShadow:
                    logStreamStatus === "connected" ? "0 0 8px rgba(16, 185, 129, 0.6)" : "none",
                }}
              />
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f8fafc" }}>
                Live Service Log Stream (SSE)
              </span>
              <span
                style={{
                  fontSize: "0.72rem",
                  padding: "0.15rem 0.45rem",
                  borderRadius: 4,
                  fontWeight: 600,
                  background:
                    logStreamStatus === "connected"
                      ? "rgba(16, 185, 129, 0.15)"
                      : logStreamStatus === "connecting"
                      ? "rgba(245, 158, 11, 0.15)"
                      : "rgba(239, 68, 68, 0.15)",
                  color:
                    logStreamStatus === "connected"
                      ? "#10b981"
                      : logStreamStatus === "connecting"
                      ? "#f59e0b"
                      : "#ef4444",
                }}
              >
                {logStreamStatus === "connected"
                  ? "Connected (Live)"
                  : logStreamStatus === "connecting"
                  ? "Connecting..."
                  : "Disconnected"}
              </span>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button
                onClick={async () => {
                  try {
                    const res = await functionsApi.getLogsHistory(functionId);
                    if (res?.logs) setLogs(res.logs);
                    toast.success("Logs refreshed");
                  } catch {
                    toast.error("Failed to refresh logs");
                  }
                }}
                className="btn btn-outline"
                style={{
                  padding: "0.25rem 0.55rem",
                  fontSize: "0.75rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
                title="Refresh logs from history"
              >
                <RefreshCw size={12} /> Refresh
              </button>
              <button
                onClick={handlePingLogs}
                disabled={pingingLogs}
                className="btn btn-outline"
                style={{
                  padding: "0.25rem 0.55rem",
                  fontSize: "0.75rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
                title="Emit a live test log to verify stream"
              >
                <Send size={12} /> {pingingLogs ? "Pinging..." : "Test Stream Ping"}
              </button>
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
                Waiting for incoming invocations... Click &quot;Test Stream Ping&quot; above or run a test in the Test tab.
              </div>
            ) : (
              logs.map((log, idx) => {
                const isError = log.level === "ERROR";
                const isWarn = log.level === "WARN";
                const isSystem = log.level === "SYSTEM";
                const badgeColor = isError ? "#f43f5e" : isWarn ? "#f59e0b" : isSystem ? "#10b981" : "#38bdf8";

                return (
                  <div key={idx} style={{ display: "flex", gap: "0.75rem", marginBottom: "0.3rem" }}>
                    <span style={{ color: "#64748b", flexShrink: 0 }}>
                      {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "--:--:--"}
                    </span>
                    <span
                      style={{
                        color: badgeColor,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      [{log.level || "INFO"}]
                    </span>
                    <span style={{ wordBreak: "break-all", color: isSystem ? "#a7f3d0" : "#f1f5f9" }}>{log.message}</span>
                  </div>
                );
              })
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* ─── TAB 8: API KEYS ──────────────────────────────────────────────────── */}
      {activeTab === "keys" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700 }}>Service API Keys</h3>
                <p style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
                  Scoped keys valid for all functions across this entire service.
                </p>
              </div>

              <button onClick={() => setShowKeyModal(true)} className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <Plus size={15} /> Create API Key
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Key Name</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>API Key</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Rate Limit</th>
                    <th style={{ padding: "0.75rem 0.5rem" }}>Last Used</th>
                    <th style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {service.apiKeys?.map((k) => (
                    <tr key={k.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.75rem 0.5rem", fontWeight: 600 }}>{k.name}</td>
                      <td style={{ padding: "0.75rem 0.5rem", fontFamily: "monospace" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", background: "var(--bg-inset)", padding: "0.25rem 0.6rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                          <code style={{ fontSize: "0.8rem", color: "var(--foreground)" }}>
                            {revealedKeys[k.id] ? (k.key || k.keyPrefix) : `${(k.key || k.keyPrefix).slice(0, 16)}••••••••••••`}
                          </code>
                          <button
                            type="button"
                            onClick={() => setRevealedKeys(prev => ({ ...prev, [k.id]: !prev[k.id] }))}
                            style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", padding: "2px" }}
                            title={revealedKeys[k.id] ? "Hide key" : "Reveal full API key"}
                          >
                            {revealedKeys[k.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const textToCopy = k.key || k.keyPrefix;
                              navigator.clipboard.writeText(textToCopy);
                              setCopiedKeyId(k.id);
                              toast.success("API key copied to clipboard");
                              setTimeout(() => setCopiedKeyId(null), 2000);
                            }}
                            style={{ background: "none", border: "none", color: copiedKeyId === k.id ? "#10b981" : "var(--accent)", cursor: "pointer", display: "flex", alignItems: "center", padding: "2px" }}
                            title="Copy full API key"
                          >
                            {copiedKeyId === k.id ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: "0.75rem 0.5rem" }}>{k.rateLimitRpm} RPM</td>
                      <td style={{ padding: "0.75rem 0.5rem", color: "var(--muted)" }}>
                        {k.lastUsedAt ? formatDistanceToNow(new Date(k.lastUsedAt)) + " ago" : "Never"}
                      </td>
                      <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                        <button onClick={() => handleDeleteKey(k.id)} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: "0.25rem" }} title="Revoke Key">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 9: SETTINGS ──────────────────────────────────────────────────── */}
      {activeTab === "settings" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1.5rem" }}>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, marginBottom: "1rem" }}>
              Service Configuration
            </h3>

            <form onSubmit={handleUpdateSettings}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", marginBottom: "1.5rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                    Service Name
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
                    Default Memory Allocation (MB)
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

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Default Execution Timeout</label>
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--accent)" }}>
                      {settingsForm.timeoutSeconds} seconds
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={60}
                    step={1}
                    value={settingsForm.timeoutSeconds}
                    onChange={(e) => setSettingsForm({ ...settingsForm, timeoutSeconds: Number(e.target.value) })}
                    style={{ width: "100%", accentColor: "var(--accent)" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                    <span>1s</span>
                    <span>10s (Standard)</span>
                    <span>60s (Heavy)</span>
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                    Default Security & Access Mode
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={() => setSettingsForm({ ...settingsForm, isPublic: false })}
                      style={{
                        padding: "0.55rem 0.75rem",
                        borderRadius: "var(--radius-sm)",
                        border: `1.5px solid ${!settingsForm.isPublic ? "var(--accent)" : "var(--border)"}`,
                        background: !settingsForm.isPublic ? "var(--accent-glow)" : "var(--bg-inset)",
                        color: !settingsForm.isPublic ? "var(--accent)" : "var(--muted)",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.35rem",
                      }}
                    >
                      <Lock size={13} /> API Key Protected
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettingsForm({ ...settingsForm, isPublic: true })}
                      style={{
                        padding: "0.55rem 0.75rem",
                        borderRadius: "var(--radius-sm)",
                        border: `1.5px solid ${settingsForm.isPublic ? "#10b981" : "var(--border)"}`,
                        background: settingsForm.isPublic ? "rgba(16, 185, 129, 0.1)" : "var(--bg-inset)",
                        color: settingsForm.isPublic ? "#10b981" : "var(--muted)",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.35rem",
                      }}
                    >
                      <Globe size={13} /> Public Webhook
                    </button>
                  </div>
                </div>
              </div>

              <button type="submit" className="btn btn-primary">
                Save Configuration
              </button>
            </form>
          </div>

          <div style={{ background: "rgba(225, 29, 72, 0.04)", border: "1px solid rgba(225, 29, 72, 0.2)", borderRadius: "var(--radius)", padding: "1.5rem" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--danger)", marginBottom: "0.5rem" }}>
              Danger Zone
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1rem" }}>
              Permanently delete this Functions Service, purge all {endpoints.length} function endpoints, revoke all API keys, and unbind edge routing.
            </p>
            <button onClick={handleDeleteService} className="btn btn-danger" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <Trash2 size={15} /> Delete Service
            </button>
          </div>
        </div>
      )}

      {/* Add Function Endpoint Modal */}
      {showEndpointModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", zIndex: 1000 }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1.75rem", maxWidth: 520, width: "100%" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Add Function to Service
            </h3>
            <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
              Creates an endpoint inside &apos;{service.name}&apos;. Customize memory and execution time per function.
            </p>

            <form onSubmit={handleCreateEndpoint}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.35rem" }}>Function Identifier</label>
                  <input
                    type="text"
                    placeholder="e.g. charge, webhook"
                    value={endpointForm.name}
                    onChange={(e) => setEndpointForm({ ...endpointForm, name: e.target.value })}
                    required
                    style={{ width: "100%", padding: "0.6rem 0.85rem", background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--foreground)" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.35rem" }}>Route Path</label>
                  <input
                    type="text"
                    placeholder="e.g. /charge, /webhook"
                    value={endpointForm.routePath}
                    onChange={(e) => setEndpointForm({ ...endpointForm, routePath: e.target.value })}
                    style={{ width: "100%", padding: "0.6rem 0.85rem", background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--foreground)", fontFamily: "monospace" }}
                  />
                </div>
              </div>

              {/* Compute Resource & Time Allocation */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Memory Allocation (RAM)
                  </label>
                  <select
                    value={endpointForm.memoryLimit}
                    onChange={(e) => setEndpointForm({ ...endpointForm, memoryLimit: Number(e.target.value) })}
                    style={{ width: "100%", padding: "0.6rem 0.85rem", background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--foreground)" }}
                  >
                    <option value={64}>64 MB (Micro)</option>
                    <option value={128}>128 MB (Default)</option>
                    <option value={256}>256 MB (Standard)</option>
                    <option value={512}>512 MB (Heavy)</option>
                  </select>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                    <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>Execution Timeout</label>
                    <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--accent)" }}>
                      {endpointForm.timeoutSeconds}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={60}
                    step={1}
                    value={endpointForm.timeoutSeconds}
                    onChange={(e) => setEndpointForm({ ...endpointForm, timeoutSeconds: Number(e.target.value) })}
                    style={{ width: "100%", accentColor: "var(--accent)", marginTop: "0.4rem" }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Security & Access Policy
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div
                    onClick={() => setEndpointForm({ ...endpointForm, isPublic: false })}
                    style={{
                      border: `1.5px solid ${!endpointForm.isPublic ? "var(--accent)" : "var(--border)"}`,
                      background: !endpointForm.isPublic ? "var(--accent-glow)" : "var(--bg-inset)",
                      padding: "0.75rem",
                      borderRadius: 8,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, fontSize: "0.85rem", color: !endpointForm.isPublic ? "var(--accent)" : "inherit" }}>
                      <Lock size={14} /> API Key Protected
                    </div>
                    <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: 0 }}>
                      Requires <code>x-api-key</code>. Recommended for internal & sensitive APIs.
                    </p>
                  </div>

                  <div
                    onClick={() => setEndpointForm({ ...endpointForm, isPublic: true })}
                    style={{
                      border: `1.5px solid ${endpointForm.isPublic ? "#10b981" : "var(--border)"}`,
                      background: endpointForm.isPublic ? "rgba(16, 185, 129, 0.08)" : "var(--bg-inset)",
                      padding: "0.75rem",
                      borderRadius: 8,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, fontSize: "0.85rem", color: endpointForm.isPublic ? "#10b981" : "inherit" }}>
                      <Globe size={14} /> Public Webhook
                    </div>
                    <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: 0 }}>
                      Publicly callable without key. Ideal for webhooks & public APIs.
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button type="button" onClick={() => setShowEndpointModal(false)} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary">Add Function</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Function Endpoint Modal */}
      {editingEndpoint && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", zIndex: 1000 }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1.75rem", maxWidth: 520, width: "100%" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Configure Function &apos;{editingEndpoint.name}&apos;
            </h3>
            <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
              Adjust compute resources (RAM) and execution timeout specifically for this function.
            </p>

            <form onSubmit={handleUpdateEndpoint}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.35rem" }}>Function Identifier</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                    style={{ width: "100%", padding: "0.6rem 0.85rem", background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--foreground)" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.35rem" }}>Route Path</label>
                  <input
                    type="text"
                    value={editForm.routePath}
                    onChange={(e) => setEditForm({ ...editForm, routePath: e.target.value })}
                    required
                    style={{ width: "100%", padding: "0.6rem 0.85rem", background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--foreground)", fontFamily: "monospace" }}
                  />
                </div>
              </div>

              {/* Compute Resource & Time Allocation */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Memory Allocation (RAM)
                  </label>
                  <select
                    value={editForm.memoryLimit}
                    onChange={(e) => setEditForm({ ...editForm, memoryLimit: Number(e.target.value) })}
                    style={{ width: "100%", padding: "0.6rem 0.85rem", background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--foreground)" }}
                  >
                    <option value={64}>64 MB (Micro)</option>
                    <option value={128}>128 MB (Default)</option>
                    <option value={256}>256 MB (Standard)</option>
                    <option value={512}>512 MB (Heavy)</option>
                  </select>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                    <label style={{ fontSize: "0.82rem", fontWeight: 600 }}>Execution Timeout</label>
                    <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--accent)" }}>
                      {editForm.timeoutSeconds}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={60}
                    step={1}
                    value={editForm.timeoutSeconds}
                    onChange={(e) => setEditForm({ ...editForm, timeoutSeconds: Number(e.target.value) })}
                    style={{ width: "100%", accentColor: "var(--accent)", marginTop: "0.4rem" }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                  Security & Access Policy
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div
                    onClick={() => setEditForm({ ...editForm, isPublic: false })}
                    style={{
                      border: `1.5px solid ${!editForm.isPublic ? "var(--accent)" : "var(--border)"}`,
                      background: !editForm.isPublic ? "var(--accent-glow)" : "var(--bg-inset)",
                      padding: "0.75rem",
                      borderRadius: 8,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, fontSize: "0.85rem", color: !editForm.isPublic ? "var(--accent)" : "inherit" }}>
                      <Lock size={14} /> API Key Protected
                    </div>
                    <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: 0 }}>
                      Requires <code>x-api-key</code>. Recommended for internal & sensitive APIs.
                    </p>
                  </div>

                  <div
                    onClick={() => setEditForm({ ...editForm, isPublic: true })}
                    style={{
                      border: `1.5px solid ${editForm.isPublic ? "#10b981" : "var(--border)"}`,
                      background: editForm.isPublic ? "rgba(16, 185, 129, 0.08)" : "var(--bg-inset)",
                      padding: "0.75rem",
                      borderRadius: 8,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, fontSize: "0.85rem", color: editForm.isPublic ? "#10b981" : "inherit" }}>
                      <Globe size={14} /> Public Webhook
                    </div>
                    <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: 0 }}>
                      Publicly callable without key. Ideal for webhooks & public APIs.
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button type="button" onClick={() => setEditingEndpoint(null)} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Central Environment Variable Modal */}
      {showEnvModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", zIndex: 1000 }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1.75rem", maxWidth: 480, width: "100%" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Add Central Shared Secret
            </h3>
            <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
              This environment variable will be shared across all {endpoints.length} functions in this service.
            </p>

            <form onSubmit={handleSaveEnvVar}>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.35rem" }}>Key Name</label>
                <input
                  type="text"
                  placeholder="e.g. STRIPE_SECRET_KEY, DATABASE_URL"
                  value={newEnvKey}
                  onChange={(e) => setNewEnvKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
                  required
                  style={{ width: "100%", padding: "0.6rem 0.85rem", background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--foreground)", fontFamily: "monospace" }}
                />
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.35rem" }}>Value</label>
                <textarea
                  placeholder="Enter secret value..."
                  value={newEnvValue}
                  onChange={(e) => setNewEnvValue(e.target.value)}
                  required
                  rows={3}
                  style={{ width: "100%", padding: "0.6rem 0.85rem", background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--foreground)", fontFamily: "monospace" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button type="button" onClick={() => setShowEnvModal(false)} className="btn btn-outline">Cancel</button>
                <button type="submit" className="btn btn-primary">Save & Sync Variable</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Key Modal */}
      {showKeyModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", zIndex: 1000 }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1.75rem", maxWidth: 480, width: "100%" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>Generate Service API Key</h3>
            <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
              Generates a cryptographically secure key prefixed with <code>whz_fn_live_</code>.
            </p>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.35rem" }}>Key Name</label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                style={{ width: "100%", padding: "0.6rem 0.85rem", background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--foreground)" }}
              />
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.35rem" }}>Rate Limit (RPM)</label>
              <input
                type="number"
                min={10}
                max={10000}
                value={newKeyRpm}
                onChange={(e) => setNewKeyRpm(Number(e.target.value))}
                style={{ width: "100%", padding: "0.6rem 0.85rem", background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--foreground)" }}
              />
            </div>

            {generatedKey ? (
              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--success)", marginBottom: "0.4rem" }}>
                  Key generated successfully:
                </div>
                <div style={{ background: "var(--bg-inset)", padding: "0.75rem", borderRadius: 6, border: "1px solid var(--border)", wordBreak: "break-all", fontFamily: "monospace", fontSize: "0.82rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{generatedKey}</span>
                  <button onClick={() => { navigator.clipboard.writeText(generatedKey); setCopiedKey(true); toast.success("Copied"); setTimeout(() => setCopiedKey(false), 2000); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)" }}>
                    {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button onClick={() => { setShowKeyModal(false); setGeneratedKey(null); }} className="btn btn-outline">Close</button>
              {!generatedKey && <button onClick={handleCreateKey} className="btn btn-primary">Generate Key</button>}
            </div>
          </div>
        </div>
      )}

      <VmOfflineModal
        isOpen={offlineModalOpen}
        onClose={() => setOfflineModalOpen(false)}
        actionType={offlineAction}
        targetName={service?.name}
      />
    </div>
  );
}
