"use client";

import { useState, useEffect } from "react";
import { 
  Network, Copy, Check, Zap, Radio, ArrowRight, ShieldCheck, 
  Terminal, Loader2, AlertCircle, CheckCircle2, Server, Lock, 
  RefreshCw, Play, CornerDownRight, X
} from "lucide-react";
import { services, type BackendService, type MeshServiceItem, type MeshPingResponse } from "@/lib/api";
import { toast } from "sonner";

interface ServiceMeshCardProps {
  service: BackendService;
  containerStatus?: "running" | "sleeping" | "stopped";
}

export function ServiceMeshCard({ service, containerStatus = "running" }: ServiceMeshCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"nextjs" | "env" | "curl">("nextjs");
  
  // Ping Tool Modal State
  const [showPingModal, setShowPingModal] = useState(false);
  const [meshCatalog, setMeshCatalog] = useState<MeshServiceItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  
  const [targetType, setTargetType] = useState<"catalog" | "custom">("catalog");
  const [selectedTargetSlug, setSelectedTargetSlug] = useState<string>("");
  const [customTargetSlug, setCustomTargetSlug] = useState("");
  const [targetPort, setTargetPort] = useState(service.internalPort);
  const [pingPath, setPingPath] = useState("/");
  
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<MeshPingResponse | null>(null);

  const internalUrl = `http://${service.slug}:${service.internalPort}`;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(`Copied ${field} to clipboard!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Load mesh catalog when opening ping tool
  const openPingTool = async () => {
    setShowPingModal(true);
    setLoadingCatalog(true);
    setPingResult(null);
    try {
      const catalog = await services.getMeshCatalog();
      setMeshCatalog(catalog);
      // Default to another service if one exists, otherwise default to this service to verify self-reachability
      const other = catalog.find(s => s.id !== service.id);
      if (other) {
        setSelectedTargetSlug(other.slug);
        setTargetPort(other.internalPort);
      } else {
        setSelectedTargetSlug(service.slug);
        setTargetPort(service.internalPort);
      }
    } catch (err: any) {
      toast.error("Failed to load service catalog for mesh ping");
    } finally {
      setLoadingCatalog(false);
    }
  };

  const handleSendPing = async () => {
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

  return (
    <>
      <div className="card" style={{ borderLeft: '3px solid #38bdf8', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <Network size={20} color="#38bdf8" />
              <h2 className="card-title" style={{ fontSize: '1.15rem', margin: 0 }}>
                Private Service Mesh & DNS Catalog
              </h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
              Direct container-to-container networking over the isolated <code>whizan-internal-network</code> bridge.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ 
              fontSize: '0.75rem', 
              padding: '0.25rem 0.65rem', 
              borderRadius: '20px', 
              background: containerStatus === 'running' ? 'rgba(34, 197, 94, 0.12)' : containerStatus === 'sleeping' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              color: containerStatus === 'running' ? '#22c55e' : containerStatus === 'sleeping' ? '#f59e0b' : '#ef4444',
              border: `1px solid ${containerStatus === 'running' ? 'rgba(34, 197, 94, 0.25)' : containerStatus === 'sleeping' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}>
              <span style={{ 
                width: 6, 
                height: 6, 
                borderRadius: '50%', 
                background: containerStatus === 'running' ? '#22c55e' : containerStatus === 'sleeping' ? '#f59e0b' : '#ef4444' 
              }}></span>
              {containerStatus === 'running' ? 'Active on Mesh' : containerStatus === 'sleeping' ? 'Auto-Sleep Standby' : 'Offline'}
            </span>

            <button
              onClick={openPingTool}
              className="btn btn-secondary"
              style={{
                fontSize: '0.8rem',
                padding: '0.35rem 0.8rem',
                height: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'rgba(56, 189, 248, 0.08)',
                borderColor: 'rgba(56, 189, 248, 0.3)',
                color: '#38bdf8'
              }}
            >
              <Radio size={14} /> Test Mesh Connection
            </button>
          </div>
        </div>

        {/* Discovery Parameter Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {/* Internal URL */}
          <div style={{ padding: '0.85rem 1rem', background: 'var(--bg-inset)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--muted)' }}>
                Internal URL
              </span>
              <button 
                type="button" 
                onClick={() => copyToClipboard(internalUrl, "Internal URL")}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedField === "Internal URL" ? '#22c55e' : 'var(--muted)', display: 'flex', alignItems: 'center' }}
                title="Copy URL"
              >
                {copiedField === "Internal URL" ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <code style={{ fontSize: '0.92rem', fontWeight: 600, color: '#38bdf8', wordBreak: 'break-all' }}>
              {internalUrl}
            </code>
          </div>

          {/* Network Alias */}
          <div style={{ padding: '0.85rem 1rem', background: 'var(--bg-inset)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--muted)' }}>
                DNS Network Alias
              </span>
              <button 
                type="button" 
                onClick={() => copyToClipboard(service.slug, "DNS Alias")}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedField === "DNS Alias" ? '#22c55e' : 'var(--muted)', display: 'flex', alignItems: 'center' }}
                title="Copy Alias"
              >
                {copiedField === "DNS Alias" ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <code style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--foreground)' }}>
              {service.slug}
            </code>
          </div>

          {/* Target Port */}
          <div style={{ padding: '0.85rem 1rem', background: 'var(--bg-inset)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--muted)', marginBottom: '0.35rem' }}>
              Internal Port
            </div>
            <code style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--foreground)' }}>
              {service.internalPort}
            </code>
          </div>

          {/* Reachability */}
          <div style={{ padding: '0.85rem 1rem', background: 'var(--bg-inset)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--muted)', marginBottom: '0.35rem' }}>
              Mesh Network
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheck size={14} color="#22c55e" /> whizan-internal-network
            </div>
          </div>
        </div>

        {/* Code Connection Examples */}
        <div style={{ background: '#0b1016', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setActiveTab("nextjs")}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: '4px',
                  color: activeTab === "nextjs" ? '#38bdf8' : 'var(--muted)',
                  backgroundColor: activeTab === "nextjs" ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                }}
              >
                Next.js / SSR
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("env")}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: '4px',
                  color: activeTab === "env" ? '#38bdf8' : 'var(--muted)',
                  backgroundColor: activeTab === "env" ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                }}
              >
                Environment Variable
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("curl")}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: '4px',
                  color: activeTab === "curl" ? '#38bdf8' : 'var(--muted)',
                  backgroundColor: activeTab === "curl" ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                }}
              >
                cURL
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                const snippet = activeTab === "nextjs" 
                  ? `const res = await fetch("${internalUrl}/api/endpoint");\nconst data = await res.json();`
                  : activeTab === "env"
                  ? `API_URL=${internalUrl}`
                  : `curl ${internalUrl}/`;
                copyToClipboard(snippet, "Code Snippet");
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
            >
              <Copy size={12} /> Copy
            </button>
          </div>

          <pre style={{ margin: 0, padding: '0.85rem 1rem', fontSize: '0.82rem', fontFamily: 'var(--font-geist-mono), monospace', color: '#e2e8f0', overflowX: 'auto', lineHeight: 1.5 }}>
            {activeTab === "nextjs" && (
              <>
                <span style={{ color: '#64748b' }}>// Call directly from Next.js Server Components or Server Actions:</span>{'\n'}
                <span style={{ color: '#f43f5e' }}>const</span> response = <span style={{ color: '#f43f5e' }}>await</span> <span style={{ color: '#38bdf8' }}>fetch</span>(<span style={{ color: '#a3e635' }}>&quot;{internalUrl}/api/data&quot;</span>);{'\n'}
                <span style={{ color: '#f43f5e' }}>const</span> payload = <span style={{ color: '#f43f5e' }}>await</span> response.<span style={{ color: '#38bdf8' }}>json</span>();
              </>
            )}
            {activeTab === "env" && (
              <>
                <span style={{ color: '#64748b' }}># Add this to your frontend app&apos;s Environment Variables (.env):</span>{'\n'}
                <span style={{ color: '#38bdf8' }}>BACKEND_API_URL</span>=<span style={{ color: '#a3e635' }}>{internalUrl}</span>
              </>
            )}
            {activeTab === "curl" && (
              <>
                <span style={{ color: '#64748b' }}># Test from any container attached to whizan-internal-network:</span>{'\n'}
                curl -i <span style={{ color: '#a3e635' }}>{internalUrl}/</span>
              </>
            )}
          </pre>
        </div>
      </div>

      {/* Network Ping Modal */}
      {showPingModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem',
        }}>
          <div style={{
            background: 'var(--bg-card, #111827)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '680px',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-inset)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Radio size={20} color="#38bdf8" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--foreground)' }}>
                    Internal Mesh Network Connectivity Probe
                  </h3>
                  <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                    Test internal HTTP communication between containers across <code>whizan-internal-network</code>.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPingModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0.25rem' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Target Selector */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)' }}>
                    Target Service to Ping
                  </label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      type="button"
                      onClick={() => setTargetType("catalog")}
                      style={{
                        background: targetType === "catalog" ? 'var(--accent)' : 'var(--bg-inset)',
                        color: targetType === "catalog" ? '#fff' : 'var(--muted)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        padding: '0.2rem 0.5rem',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                      }}
                    >
                      From Catalog
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetType("custom")}
                      style={{
                        background: targetType === "custom" ? 'var(--accent)' : 'var(--bg-inset)',
                        color: targetType === "custom" ? '#fff' : 'var(--muted)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        padding: '0.2rem 0.5rem',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                      }}
                    >
                      Custom Alias
                    </button>
                  </div>
                </div>

                {targetType === "catalog" ? (
                  loadingCatalog ? (
                    <div style={{ padding: '0.75rem', background: 'var(--bg-inset)', borderRadius: '6px', fontSize: '0.82rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Loader2 size={14} className="spin-icon" /> Loading workspace services...
                    </div>
                  ) : (
                    <select
                      className="input"
                      value={selectedTargetSlug}
                      onChange={(e) => {
                        const slug = e.target.value;
                        setSelectedTargetSlug(slug);
                        const match = meshCatalog.find(s => s.slug === slug);
                        if (match) setTargetPort(match.internalPort);
                      }}
                    >
                      {meshCatalog.map(item => (
                        <option key={item.id} value={item.slug}>
                          {item.name} ({item.slug}:{item.internalPort}) — {item.status.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  )
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. whizan-backend or api"
                      value={customTargetSlug}
                      onChange={e => setCustomTargetSlug(e.target.value)}
                    />
                    <input
                      type="number"
                      className="input"
                      placeholder="Port"
                      value={targetPort}
                      onChange={e => setTargetPort(parseInt(e.target.value, 10) || 8000)}
                    />
                  </div>
                )}
              </div>

              {/* Endpoint Path */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)', marginBottom: '0.4rem' }}>
                  HTTP Probe Path
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="/ or /health or /api/status"
                    value={pingPath}
                    onChange={e => setPingPath(e.target.value)}
                  />
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0.25rem 0 0 0' }}>
                  The probe will execute an internal HTTP GET to <code>http://{targetType === "catalog" ? selectedTargetSlug : customTargetSlug || "target"}:{targetPort}{pingPath.startsWith("/") ? pingPath : `/${pingPath}`}</code>.
                </p>
              </div>

              {/* Action Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleSendPing}
                  disabled={pinging}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1.5rem' }}
                >
                  {pinging ? (
                    <>
                      <Loader2 size={16} className="spin-icon" /> Probing Mesh Network...
                    </>
                  ) : (
                    <>
                      <Zap size={16} /> Send Internal Ping
                    </>
                  )}
                </button>
              </div>

              {/* Ping Result Panel */}
              {pingResult && (
                <div style={{
                  padding: '1.25rem',
                  borderRadius: '8px',
                  background: pingResult.success ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                  border: `1px solid ${pingResult.success ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {pingResult.success ? (
                        <CheckCircle2 size={22} color="#22c55e" />
                      ) : (
                        <AlertCircle size={22} color="#ef4444" />
                      )}
                      <div>
                        <div style={{ fontSize: '1rem', fontWeight: 600, color: pingResult.success ? '#22c55e' : '#ef4444' }}>
                          {pingResult.success ? `Connected (${pingResult.statusCode} OK)` : 'Connection Failed'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', fontFamily: 'monospace' }}>
                          Target: {pingResult.targetUrl}
                        </div>
                      </div>
                    </div>

                    {pingResult.latencyMs > 0 && (
                      <div style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '20px',
                        background: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#38bdf8',
                      }}>
                        ⚡ {pingResult.latencyMs} ms
                      </div>
                    )}
                  </div>

                  {/* Diagnostic Breakdown */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div style={{ padding: '0.6rem 0.8rem', background: 'var(--bg-inset)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>DNS Lookup</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: pingResult.dnsOk ? '#22c55e' : '#ef4444' }}>
                        {pingResult.dnsOk ? `✓ Resolved (${pingResult.timeDnsMs}ms)` : '❌ Failed'}
                      </div>
                    </div>

                    <div style={{ padding: '0.6rem 0.8rem', background: 'var(--bg-inset)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Resolved Mesh IP</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--foreground)' }}>
                        {pingResult.resolvedIp || "Unassigned"}
                      </div>
                    </div>

                    <div style={{ padding: '0.6rem 0.8rem', background: 'var(--bg-inset)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>TCP Handshake</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: pingResult.timeConnectMs > 0 ? '#22c55e' : 'var(--muted)' }}>
                        {pingResult.timeConnectMs > 0 ? `${pingResult.timeConnectMs}ms` : '-'}
                      </div>
                    </div>
                  </div>

                  {/* Error Message if any */}
                  {pingResult.errorMessage && (
                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.25)', fontSize: '0.82rem', color: '#fca5a5', marginBottom: '0.75rem' }}>
                      <strong>Diagnostic Detail:</strong> {pingResult.errorMessage}
                    </div>
                  )}

                  {/* Headers Preview */}
                  {Object.keys(pingResult.headers).length > 0 && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', marginBottom: '0.25rem' }}>
                        Server Response Headers:
                      </div>
                      <div style={{ padding: '0.6rem 0.8rem', background: '#0b1016', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#94a3b8' }}>
                        {Object.entries(pingResult.headers).slice(0, 4).map(([k, v]) => (
                          <div key={k}>
                            <span style={{ color: '#38bdf8' }}>{k}:</span> {v}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Response Body Preview */}
                  {pingResult.bodyPreview && (
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--muted)', marginBottom: '0.25rem' }}>
                        Response Body Preview:
                      </div>
                      <pre style={{ margin: 0, padding: '0.6rem 0.8rem', background: '#0b1016', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#e2e8f0', maxHeight: '100px', overflowY: 'auto' }}>
                        {pingResult.bodyPreview}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
