"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Network, Copy, Check, Radio, ShieldCheck,
  Server, ArrowLeft, Loader2, RefreshCw, Send,
  Globe, AlertCircle, CheckCircle2, Terminal,
  ExternalLink, Zap, Layers, Cpu, ShieldAlert
} from "lucide-react";
import { services, type ServiceWithDetails, type MeshServiceItem, type MeshPingResponse } from "@/lib/api";
import { toast } from "sonner";

export default function ServiceMeshPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [service, setService] = useState<ServiceWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"nextjs" | "env" | "curl" | "express">("nextjs");

  // Mesh discovery state
  const [meshCatalog, setMeshCatalog] = useState<MeshServiceItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Ping tool state
  const [targetType, setTargetType] = useState<"catalog" | "custom">("catalog");
  const [selectedTargetSlug, setSelectedTargetSlug] = useState<string>("");
  const [customTargetSlug, setCustomTargetSlug] = useState("");
  const [targetPort, setTargetPort] = useState<number>(8000);
  const [pingPath, setPingPath] = useState("/");
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<MeshPingResponse | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const data = await services.get(id);
        setService(data);
        setTargetPort(data.internalPort || 8000);

        // Load Mesh Catalog
        try {
          setLoadingCatalog(true);
          const catalog = await services.getMeshCatalog();
          setMeshCatalog(catalog);
          const other = catalog.find(s => s.id !== data.id);
          if (other) {
            setSelectedTargetSlug(other.slug);
            setTargetPort(other.internalPort);
          } else {
            setSelectedTargetSlug(data.slug);
          }
        } catch (catErr) {
          console.error("Failed to load mesh catalog", catErr);
        } finally {
          setLoadingCatalog(false);
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to load service");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(`Copied ${field} to clipboard!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSendPing = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const slug = targetType === "catalog" ? selectedTargetSlug : customTargetSlug.trim();
    if (!slug) {
      toast.error("Please specify a target service slug or alias");
      return;
    }

    setPinging(true);
    setPingResult(null);
    try {
      const result = await services.pingMesh({
        targetSlug: slug,
        targetPort,
        path: pingPath.trim() || "/",
      });
      setPingResult(result);
      if (result.success) {
        toast.success(`Connected to ${slug}:${targetPort} in ${result.latencyMs}ms!`);
      } else {
        toast.error(result.errorMessage || `Connection to ${slug}:${targetPort} failed`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to execute mesh ping");
    } finally {
      setPinging(false);
    }
  };

  if (loading) {
    return (
      <div className="mesh-loading-container">
        <Loader2 size={32} className="spin-icon text-accent" />
        <p style={{ color: "var(--muted)", marginTop: "1rem" }}>Connecting to Whizan Service Mesh...</p>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="mesh-error-container">
        <ShieldAlert size={40} style={{ color: "#ef4444", marginBottom: "1rem" }} />
        <h2>Service Not Found</h2>
        <Link href="/dashboard/backend" className="btn btn-secondary" style={{ marginTop: "1rem" }}>
          <ArrowLeft size={16} /> Back to Backend Services
        </Link>
      </div>
    );
  }

  const internalUrl = `http://${service.slug}:${service.internalPort}`;
  const latestDeploy = service.deployments?.[0];
  const isOnline = latestDeploy?.status === "READY";

  return (
    <div className="mesh-page-root">
      {/* Top Banner Header */}
      <div className="mesh-header">
        <div className="mesh-header-left">
          <Link href={`/dashboard/backend/${service.id}`} className="mesh-back-btn">
            <ArrowLeft size={16} />
            <span>Back to {service.name}</span>
          </Link>
          <div className="mesh-title-row">
            <div className="mesh-icon-badge">
              <Network size={22} color="#38bdf8" />
            </div>
            <div>
              <div className="mesh-title-wrap">
                <h1 className="mesh-title">Private Service Mesh & DNS Catalog</h1>
                <span className={`mesh-status-badge ${isOnline ? "badge-running" : "badge-offline"}`}>
                  <span className="dot" />
                  {isOnline ? "Active on Mesh" : "Container Standby"}
                </span>
              </div>
              <p className="mesh-subtitle">
                Zero-latency private container communication over isolated Docker bridge network <code className="mono">whizan-internal-network</code>.
              </p>
            </div>
          </div>
        </div>

        <div className="mesh-header-actions">
          <button
            onClick={async () => {
              setLoadingCatalog(true);
              try {
                const cat = await services.getMeshCatalog();
                setMeshCatalog(cat);
                toast.success("Service catalog updated");
              } catch {
                toast.error("Failed to refresh catalog");
              } finally {
                setLoadingCatalog(false);
              }
            }}
            className="btn btn-secondary btn-sm"
            disabled={loadingCatalog}
          >
            <RefreshCw size={13} className={loadingCatalog ? "spin-icon" : ""} />
            <span>Refresh Mesh</span>
          </button>
        </div>
      </div>

      {/* Grid: Left column (Mesh Connection details & Code snippets), Right column (Interactive Mesh Ping Tool & Catalog) */}
      <div className="mesh-grid">
        {/* LEFT COLUMN: Identity, DNS Parameters, Integration Code */}
        <div className="mesh-col-left">
          {/* Internal DNS Card */}
          <div className="card mesh-panel">
            <div className="panel-header">
              <div className="panel-title-group">
                <Radio size={18} className="text-accent" />
                <h2 className="panel-title">Internal DNS Credentials</h2>
              </div>
              <span className="panel-chip">IPv4 Bridge</span>
            </div>

            <p className="panel-desc">
              Other frontend (SSR) and backend services within this workspace can address this service privately without leaving the internal bridge network.
            </p>

            <div className="mesh-param-grid">
              <div className="param-box">
                <div className="param-header">
                  <span className="param-label">Internal URL</span>
                  <button onClick={() => copyToClipboard(internalUrl, "Internal URL")} className="copy-icon-btn">
                    {copiedField === "Internal URL" ? <Check size={14} className="text-green" /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="param-value text-accent mono">{internalUrl}</div>
                <div className="param-hint">Direct HTTP address</div>
              </div>

              <div className="param-box">
                <div className="param-header">
                  <span className="param-label">DNS Alias</span>
                  <button onClick={() => copyToClipboard(service.slug, "DNS Alias")} className="copy-icon-btn">
                    {copiedField === "DNS Alias" ? <Check size={14} className="text-green" /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="param-value mono">{service.slug}</div>
                <div className="param-hint">Auto-resolved container alias</div>
              </div>

              <div className="param-box">
                <div className="param-header">
                  <span className="param-label">Container Port</span>
                </div>
                <div className="param-value mono">{service.internalPort}</div>
                <div className="param-hint">Application listening port</div>
              </div>

              <div className="param-box">
                <div className="param-header">
                  <span className="param-label">Network Bridge</span>
                </div>
                <div className="param-value" style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
                  <ShieldCheck size={15} className="text-green" />
                  <span className="mono">whizan-internal-network</span>
                </div>
                <div className="param-hint">Encrypted Docker socket</div>
              </div>
            </div>
          </div>

          {/* Code Integration Snippets */}
          <div className="card mesh-panel">
            <div className="panel-header">
              <div className="panel-title-group">
                <Terminal size={18} className="text-accent" />
                <h2 className="panel-title">Internal Service-to-Service Integration</h2>
              </div>
            </div>

            <div className="tab-strip">
              <button
                className={`tab-item ${activeTab === "nextjs" ? "active" : ""}`}
                onClick={() => setActiveTab("nextjs")}
              >
                Next.js (SSR / Server Actions)
              </button>
              <button
                className={`tab-item ${activeTab === "express" ? "active" : ""}`}
                onClick={() => setActiveTab("express")}
              >
                Node / Express (Axios)
              </button>
              <button
                className={`tab-item ${activeTab === "env" ? "active" : ""}`}
                onClick={() => setActiveTab("env")}
              >
                Environment Config
              </button>
              <button
                className={`tab-item ${activeTab === "curl" ? "active" : ""}`}
                onClick={() => setActiveTab("curl")}
              >
                cURL / CLI
              </button>
            </div>

            <div className="code-container">
              {activeTab === "nextjs" && (
                <pre className="code-block mono">
{`// app/api/data/route.ts (Server-Side Next.js or Server Actions)
export async function GET() {
  // Directly resolves to this backend container via internal DNS
  const res = await fetch("${internalUrl}/api/v1/health", {
    cache: "no-store",
    headers: { "Authorization": \`Bearer \${process.env.INTERNAL_SERVICE_TOKEN}\` }
  });

  const data = await res.json();
  return Response.json(data);
}`}
                </pre>
              )}

              {activeTab === "express" && (
                <pre className="code-block mono">
{`// In another backend microservice (Node.js / Express)
import axios from "axios";

const apiClient = axios.create({
  baseURL: "${internalUrl}",
  timeout: 5000,
});

export async function fetchServiceData() {
  const { data } = await apiClient.get("/users");
  return data;
}`}
                </pre>
              )}

              {activeTab === "env" && (
                <pre className="code-block mono">
{`# Add this to your Frontend or Microservice environment variables:
BACKEND_INTERNAL_URL=${internalUrl}
SERVICE_DNS_ALIAS=${service.slug}
SERVICE_PORT=${service.internalPort}
MESH_NETWORK=whizan-internal-network`}
                </pre>
              )}

              {activeTab === "curl" && (
                <pre className="code-block mono">
{`# From another container inside whizan-internal-network:
curl -v ${internalUrl}/health

# Or using DNS alias resolution directly:
ping -c 3 ${service.slug}`}
                </pre>
              )}

              <div className="code-footer">
                <span className="code-note">✓ Zero ingress latency &amp; zero public bandwidth charges</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const text = activeTab === "nextjs"
                      ? `fetch("${internalUrl}/api/v1/health")`
                      : activeTab === "express"
                      ? `axios.get("${internalUrl}")`
                      : activeTab === "env"
                      ? `BACKEND_INTERNAL_URL=${internalUrl}`
                      : `curl ${internalUrl}/health`;
                    copyToClipboard(text, "Code snippet");
                  }}
                >
                  <Copy size={12} /> Copy Code
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Ping Test Tool & Network Catalog */}
        <div className="mesh-col-right">
          {/* Interactive Mesh Ping Tool */}
          <div className="card mesh-panel ping-panel">
            <div className="panel-header">
              <div className="panel-title-group">
                <Zap size={18} style={{ color: "#f59e0b" }} />
                <h2 className="panel-title">Mesh Connection Probe</h2>
              </div>
              <span className="probe-live-tag">LIVE TEST</span>
            </div>

            <p className="panel-desc">
              Execute an on-demand internal HTTP handshake from this service across the Docker bridge network to verify reachability and latency.
            </p>

            <form onSubmit={handleSendPing} className="ping-form">
              <div className="target-toggle-row">
                <button
                  type="button"
                  className={`target-toggle-btn ${targetType === "catalog" ? "active" : ""}`}
                  onClick={() => setTargetType("catalog")}
                >
                  From Service Catalog
                </button>
                <button
                  type="button"
                  className={`target-toggle-btn ${targetType === "custom" ? "active" : ""}`}
                  onClick={() => setTargetType("custom")}
                >
                  Custom Network Alias
                </button>
              </div>

              {targetType === "catalog" ? (
                <div className="form-group">
                  <label className="form-label">Target Service</label>
                  {meshCatalog.length === 0 ? (
                    <div className="empty-catalog-box">
                      <span>No other backend services found in mesh catalog.</span>
                    </div>
                  ) : (
                    <select
                      className="input"
                      value={selectedTargetSlug}
                      onChange={e => {
                        setSelectedTargetSlug(e.target.value);
                        const found = meshCatalog.find(s => s.slug === e.target.value);
                        if (found) setTargetPort(found.internalPort);
                      }}
                    >
                      {meshCatalog.map(item => (
                        <option key={item.id} value={item.slug}>
                          {item.name} ({item.slug}:{item.internalPort}) {item.id === service.id ? "• Self" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Target Container Alias / Hostname</label>
                  <input
                    type="text"
                    className="input mono"
                    placeholder="e.g. auth-service or redis-cache"
                    value={customTargetSlug}
                    onChange={e => setCustomTargetSlug(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Target Port</label>
                  <input
                    type="number"
                    className="input mono"
                    value={targetPort}
                    onChange={e => setTargetPort(parseInt(e.target.value) || 80)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Request Path</label>
                  <input
                    type="text"
                    className="input mono"
                    value={pingPath}
                    onChange={e => setPingPath(e.target.value)}
                    placeholder="/"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary ping-submit-btn"
                disabled={pinging}
              >
                {pinging ? (
                  <>
                    <Loader2 size={15} className="spin-icon" /> Probing Mesh Bridge...
                  </>
                ) : (
                  <>
                    <Send size={15} /> Send Internal Mesh Ping
                  </>
                )}
              </button>
            </form>

            {/* Ping Response Result Box */}
            {pingResult && (
              <div className={`ping-result-box ${pingResult.success ? "success" : "failure"}`}>
                <div className="result-header">
                  <div className="result-title">
                    {pingResult.success ? (
                      <CheckCircle2 size={18} className="text-green" />
                    ) : (
                      <AlertCircle size={18} style={{ color: "#ef4444" }} />
                    )}
                    <span>{pingResult.success ? "Internal Connection Verified" : "Mesh Probe Failed"}</span>
                  </div>
                  {pingResult.latencyMs !== undefined && (
                    <span className="latency-badge">{pingResult.latencyMs} ms latency</span>
                  )}
                </div>

                <div className="result-body">
                  <div className="result-stat-row">
                    <span className="stat-label">Target URI:</span>
                    <span className="stat-value mono">
                      http://{targetType === "catalog" ? selectedTargetSlug : customTargetSlug}:{targetPort}{pingPath}
                    </span>
                  </div>
                  {pingResult.statusCode && (
                    <div className="result-stat-row">
                      <span className="stat-label">HTTP Status:</span>
                      <span className="stat-value mono">{pingResult.statusCode}</span>
                    </div>
                  )}
                  {pingResult.errorMessage && (
                    <div className="result-stat-row">
                      <span className="stat-label">Error Details:</span>
                      <span className="stat-value error-text mono">{pingResult.errorMessage}</span>
                    </div>
                  )}
                  {pingResult.bodyPreview && (
                    <div className="result-response-preview">
                      <div className="preview-label">Response Header &amp; Payload Preview:</div>
                      <pre className="preview-content mono">
                        {pingResult.bodyPreview}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Discovered Services Catalog */}
          <div className="card mesh-panel">
            <div className="panel-header">
              <div className="panel-title-group">
                <Layers size={18} className="text-accent" />
                <h2 className="panel-title">Mesh Service Directory</h2>
              </div>
              <span className="panel-count">{meshCatalog.length} Nodes</span>
            </div>

            <p className="panel-desc">All microservices joined on this tenant's Docker overlay bridge.</p>

            <div className="catalog-list">
              {meshCatalog.map(item => {
                const isCurrent = item.id === service.id;
                return (
                  <div key={item.id} className={`catalog-item ${isCurrent ? "current" : ""}`}>
                    <div className="catalog-item-left">
                      <div className="catalog-item-icon">
                        <Server size={15} />
                      </div>
                      <div>
                        <div className="catalog-item-title">
                          <span className="name">{item.name}</span>
                          {isCurrent && <span className="self-tag">This Service</span>}
                        </div>
                        <div className="catalog-item-alias mono">
                          http://{item.slug}:{item.internalPort}
                        </div>
                      </div>
                    </div>

                    <div className="catalog-item-actions">
                      <button
                        onClick={() => copyToClipboard(`http://${item.slug}:${item.internalPort}`, item.name)}
                        className="btn btn-secondary btn-xs"
                        title="Copy Internal URL"
                      >
                        <Copy size={12} />
                      </button>
                      {!isCurrent && (
                        <Link
                          href={`/dashboard/backend/${item.id}`}
                          className="btn btn-secondary btn-xs"
                          title="Open Service"
                        >
                          <ExternalLink size={12} />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .mesh-page-root {
          padding: 2rem 2.5rem;
          max-width: 1400px;
          margin: 0 auto;
        }

        .mesh-loading-container, .mesh-error-container {
          min-height: 60vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
        }

        .mesh-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 2rem;
          gap: 1.5rem;
          flex-wrap: wrap;
        }

        .mesh-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.82rem;
          color: var(--muted);
          text-decoration: none;
          margin-bottom: 0.75rem;
          font-weight: 500;
          transition: color 0.15s ease;
        }
        .mesh-back-btn:hover {
          color: var(--foreground);
        }

        .mesh-title-row {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }

        .mesh-icon-badge {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: rgba(56, 189, 248, 0.1);
          border: 1px solid rgba(56, 189, 248, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .mesh-title-wrap {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
          margin-bottom: 0.35rem;
        }

        .mesh-title {
          font-size: 1.4rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0;
        }

        .mesh-subtitle {
          font-size: 0.88rem;
          color: var(--muted);
          margin: 0;
          line-height: 1.5;
        }

        .mesh-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.2rem 0.65rem;
          border-radius: 20px;
        }
        .mesh-status-badge .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }
        .badge-running {
          background: rgba(34, 197, 94, 0.12);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .badge-running .dot {
          background: #22c55e;
          box-shadow: 0 0 6px #22c55e;
        }
        .badge-offline {
          background: rgba(239, 68, 68, 0.12);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .badge-offline .dot {
          background: #ef4444;
        }

        /* ── Grid Layout ── */
        .mesh-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }

        .mesh-col-left, .mesh-col-right {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .mesh-panel {
          padding: 1.5rem;
          background: var(--card);
          border: 1px solid var(--card-border);
          border-radius: 12px;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .panel-title-group {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .panel-title {
          font-size: 1.05rem;
          font-weight: 600;
          margin: 0;
        }

        .panel-chip, .panel-count {
          font-size: 0.72rem;
          padding: 0.2rem 0.55rem;
          border-radius: 6px;
          background: var(--bg-inset);
          border: 1px solid var(--border);
          color: var(--muted);
          font-weight: 600;
        }

        .panel-desc {
          font-size: 0.84rem;
          color: var(--muted);
          margin-bottom: 1.25rem;
          line-height: 1.5;
        }

        /* ── Param Grid ── */
        .mesh-param-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.85rem;
        }

        .param-box {
          background: var(--bg-inset);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.85rem 1rem;
        }

        .param-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.35rem;
        }

        .param-label {
          font-size: 0.72rem;
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: var(--muted);
        }

        .copy-icon-btn {
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          color: var(--muted);
          display: flex;
          align-items: center;
          transition: color 0.15s ease;
        }
        .copy-icon-btn:hover {
          color: var(--foreground);
        }

        .param-value {
          font-size: 0.92rem;
          font-weight: 600;
          margin-bottom: 0.25rem;
          word-break: break-all;
        }

        .param-hint {
          font-size: 0.72rem;
          color: var(--muted);
        }

        /* ── Code Tab Strip ── */
        .tab-strip {
          display: flex;
          gap: 0.4rem;
          border-bottom: 1px solid var(--card-border);
          margin-bottom: 1rem;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .tab-item {
          background: none;
          border: none;
          padding: 0.5rem 0.85rem;
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--muted);
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .tab-item:hover {
          color: var(--foreground);
        }
        .tab-item.active {
          color: var(--accent);
          border-bottom-color: var(--accent);
          font-weight: 600;
        }

        .code-container {
          background: #0b1016;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          overflow: hidden;
        }

        .code-block {
          margin: 0;
          padding: 1rem 1.25rem;
          font-size: 0.82rem;
          line-height: 1.6;
          color: #e2e8f0;
          overflow-x: auto;
        }

        .code-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.6rem 1rem;
          background: rgba(255, 255, 255, 0.02);
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 0.78rem;
          color: var(--muted);
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        /* ── Ping Probe Panel ── */
        .probe-live-tag {
          font-size: 0.7rem;
          font-weight: 700;
          padding: 0.2rem 0.55rem;
          border-radius: 6px;
          background: rgba(245, 158, 11, 0.12);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .ping-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .target-toggle-row {
          display: flex;
          gap: 0.5rem;
          background: var(--bg-inset);
          padding: 0.3rem;
          border-radius: 8px;
          border: 1px solid var(--border);
        }

        .target-toggle-btn {
          flex: 1;
          padding: 0.45rem 0.6rem;
          font-size: 0.78rem;
          font-weight: 600;
          border: none;
          background: transparent;
          color: var(--muted);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .target-toggle-btn.active {
          background: var(--card);
          color: var(--foreground);
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .form-row-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.85rem;
        }

        .ping-submit-btn {
          width: 100%;
          justify-content: center;
          gap: 0.5rem;
        }

        /* ── Ping Results ── */
        .ping-result-box {
          margin-top: 1.25rem;
          border-radius: 8px;
          padding: 1rem 1.25rem;
          border: 1px solid transparent;
        }
        .ping-result-box.success {
          background: rgba(34, 197, 94, 0.06);
          border-color: rgba(34, 197, 94, 0.25);
        }
        .ping-result-box.failure {
          background: rgba(239, 68, 68, 0.06);
          border-color: rgba(239, 68, 68, 0.25);
        }

        .result-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .result-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 600;
          font-size: 0.9rem;
        }

        .latency-badge {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.15rem 0.55rem;
          border-radius: 12px;
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
          font-family: monospace;
        }

        .result-body {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          font-size: 0.82rem;
        }

        .result-stat-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
        .stat-label {
          color: var(--muted);
          min-width: 100px;
        }
        .stat-value {
          font-weight: 500;
        }
        .error-text {
          color: #ef4444;
        }

        .result-response-preview {
          margin-top: 0.65rem;
        }
        .preview-label {
          font-size: 0.74rem;
          color: var(--muted);
          margin-bottom: 0.35rem;
        }
        .preview-content {
          margin: 0;
          padding: 0.75rem;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 6px;
          font-size: 0.76rem;
          max-height: 140px;
          overflow-y: auto;
          color: #94a3b8;
        }

        /* ── Mesh Directory Catalog ── */
        .catalog-list {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .catalog-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          background: var(--bg-inset);
          border: 1px solid var(--border);
          transition: all 0.15s ease;
        }
        .catalog-item.current {
          border-color: rgba(56, 189, 248, 0.35);
          background: rgba(56, 189, 248, 0.04);
        }

        .catalog-item-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .catalog-item-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: var(--card);
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--muted);
        }

        .catalog-item-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 600;
          font-size: 0.88rem;
        }

        .self-tag {
          font-size: 0.68rem;
          padding: 0.1rem 0.45rem;
          border-radius: 4px;
          background: rgba(56, 189, 248, 0.15);
          color: #38bdf8;
          font-weight: 600;
        }

        .catalog-item-alias {
          font-size: 0.78rem;
          color: var(--muted);
          margin-top: 0.15rem;
        }

        .catalog-item-actions {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .btn-xs {
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          height: auto;
        }

        /* ── Media Queries ── */
        @media (max-width: 1024px) {
          .mesh-grid {
            grid-template-columns: 1fr;
          }
          .mesh-param-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .mesh-page-root {
            padding: 1rem;
          }
          .form-row-2 {
            grid-template-columns: 1fr;
          }
          .mesh-header {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
