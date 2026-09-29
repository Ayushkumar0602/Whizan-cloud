"use client";
import { useEffect, useState } from "react";
import { services, type ServiceWithDetails } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Globe, GitBranch, Play, Terminal, Clock, Server, Trash2,
  Loader2, Key, ExternalLink, Activity, Cpu, Check, Zap, Moon, Copy,
  ChevronDown, Plus, PanelLeftClose, PanelLeftOpen, FileCode2, ArrowRight, Radio, Sliders
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { ServiceLogs } from "@/components/service-logs";
import { ServiceShell } from "@/components/service-shell";
import { ServiceMetrics } from "@/components/service-metrics";
import { getServiceIngressUrl } from "@/lib/domains";

const INSTANCE_PLANS = [
  { id: "starter",  name: "Starter",  cpu: 0.5, memory: 512,  desc: "0.5 vCPU • 512MB" },
  { id: "standard", name: "Standard", cpu: 1.0, memory: 1024, desc: "1.0 vCPU • 1GB"   },
  { id: "pro",      name: "Pro",      cpu: 2.0, memory: 2048, desc: "2.0 vCPU • 2GB"   },
  { id: "pro_plus", name: "Pro+",     cpu: 4.0, memory: 4096, desc: "4.0 vCPU • 4GB"   },
];

export default function BackendServicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [service, setService] = useState<ServiceWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Service configuration editable fields
  const [configOpen, setConfigOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [rootDir, setRootDir] = useState(".");
  const [installCommand, setInstallCommand] = useState("");
  const [startCommand, setStartCommand] = useState("");
  const [internalPort, setInternalPort] = useState(8000);
  const [branch, setBranch] = useState("main");
  const [githubRepoUrl, setGithubRepoUrl] = useState("");

  const [envKey, setEnvKey] = useState("");
  const [envValue, setEnvValue] = useState("");
  const [envSecret, setEnvSecret] = useState(true);
  const [savingEnv, setSavingEnv] = useState(false);
  const [bulkEnvMode, setBulkEnvMode] = useState(false);
  const [bulkEnvText, setBulkEnvText] = useState("");
  const [envOpen, setEnvOpen] = useState(false);

  const [selectedDId, setSelectedDId] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<"logs" | "shell" | "metrics">("logs");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);

  async function load() {
    try {
      const s = await services.get(id);
      setService(s);
      setRootDir(s.rootDir || ".");
      setInstallCommand(s.installCommand || "");
      setStartCommand(s.startCommand || "");
      setInternalPort(s.internalPort || 8000);
      setBranch(s.branch || "main");
      setGithubRepoUrl(s.githubRepoUrl || "direct-upload");
      if (s.deployments.length > 0 && !selectedDId) setSelectedDId(s.deployments[0].id);
    } catch {
      toast.error("Service not found");
      router.push("/dashboard/backend");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    const active = service?.deployments.some(d => d.status === "QUEUED" || d.status === "BUILDING");
    if (!active) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [service]);

  async function handleSaveConfig(redeploy = false) {
    if (!service) return;
    setSavingConfig(true);
    try {
      const updated = await services.update(service.id, {
        githubRepoUrl: githubRepoUrl.trim() || "direct-upload",
        rootDir: rootDir.trim() || ".",
        installCommand: installCommand.trim(),
        startCommand: startCommand.trim(),
        internalPort: Number(internalPort) || 8000,
        branch: branch.trim() || "main",
      });
      setService(prev => prev ? { ...prev, ...updated } : null);
      toast.success("Service configuration saved");
      if (redeploy) {
        await triggerDeploy();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update configuration");
    } finally {
      setSavingConfig(false);
    }
  }

  async function triggerDeploy(options?: { githubRepoUrl?: string; branch?: string }) {
    setDeploying(true);
    try {
      const deployOpts = options || (githubRepoUrl && githubRepoUrl !== "direct-upload" ? { githubRepoUrl, branch } : undefined);
      const newD = await services.deploy(id, deployOpts);
      toast.success("Deployment triggered");
      setSelectedDId(newD.id);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to start deploy");
    } finally {
      setDeploying(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Permanently delete this backend service?")) return;
    setDeleting(true);
    try {
      await services.delete(id);
      toast.success("Service deleted");
      router.push("/dashboard/backend");
    } catch {
      toast.error("Failed to delete service");
      setDeleting(false);
    }
  }

  async function handleAddEnv(e: React.FormEvent) {
    e.preventDefault();
    if (!envKey || !envValue) return;
    setSavingEnv(true);
    try {
      await services.setEnv(id, envKey, envValue, envSecret);
      toast.success(`Saved ${envKey}`);
      setEnvKey(""); setEnvValue("");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to save variable");
    } finally {
      setSavingEnv(false);
    }
  }

  async function handleBulkEnvSave() {
    if (!bulkEnvText.trim()) return;
    setSavingEnv(true);
    try {
      const lines = bulkEnvText.split("\n");
      const envMap: Record<string, string> = {};
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        if (key) {
          envMap[key] = val;
        }
      }
      const count = Object.keys(envMap).length;
      if (count > 0) {
        await services.setBulkEnv(id, envMap, true);
      }
      toast.success(`Saved ${count} environment variables`);
      setBulkEnvText(""); setBulkEnvMode(false);
      await load();
    } catch {
      toast.error("Failed to parse and save variables");
    } finally {
      setSavingEnv(false);
    }
  }

  async function handleDeleteEnv(key: string) {
    if (!confirm(`Delete ${key}?`)) return;
    try {
      await services.deleteEnv(id, key);
      toast.success(`Removed ${key}`);
      await load();
    } catch {
      toast.error("Failed to delete variable");
    }
  }

  if (loading) return (
    <div className="page-loading">
      <div className="spinner" />
      <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Loading service details...</span>
    </div>
  );
  if (!service) return null;

  const latestDeploy = service.deployments[0];
  const isBuilding = latestDeploy?.status === "QUEUED" || latestDeploy?.status === "BUILDING";
  const isActive   = latestDeploy?.status === "READY" && !!latestDeploy.containerPort;
  const isAsleep   = latestDeploy?.status === "READY" && !latestDeploy.containerPort;
  const ingressUrl = getServiceIngressUrl(service.slug);
  const envCount   = service.envVariables.length;

  function copyIngressUrl() {
    navigator.clipboard.writeText(ingressUrl);
    setCopiedUrl(true);
    toast.success("URL copied");
    setTimeout(() => setCopiedUrl(false), 2000);
  }

  return (
    <div className="bd-page">

      {/* Top Bar */}
      <div className="bd-topbar">
        <Link href="/dashboard/backend" className="breadcrumb" style={{ marginBottom: 0 }}>
          <ArrowLeft size={15} /> Back to Backend Services
        </Link>
        <button
          className="btn btn-secondary btn-sm sidebar-toggle-btn"
          onClick={() => setSidebarHidden(v => !v)}
          title={sidebarHidden ? "Show sidebar" : "Hide sidebar"}
        >
          {sidebarHidden
            ? <><PanelLeftOpen size={15} /><span className="toggle-label">Show Panel</span></>
            : <><PanelLeftClose size={15} /><span className="toggle-label">Hide Panel</span></>}
        </button>
      </div>

      {/* Hero Card */}
      <div className="detail-hero-card">
        <div className="detail-hero-top">
          <div className="detail-hero-brand">
            <div className="detail-icon-box">
              <Server size={28} className="text-accent" />
            </div>
            <div>
              <div className="detail-kicker">Docker Container Service</div>
              <div className="detail-title-row">
                <h1 className="detail-title">{service.name}</h1>
                {isActive && (
                  <span className="badge badge-ready">
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
                    Active
                  </span>
                )}
                {isAsleep && <span className="badge badge-queued"><Clock size={11} />Asleep (0.1 vCPU)</span>}
                {!isActive && !isAsleep && latestDeploy && <StatusBadge status={latestDeploy.status} />}
              </div>
              <div className="detail-meta-row">
                <span className="detail-meta-item"><GitBranch size={13} /> {service.branch}</span>
                <span className="meta-sep">•</span>
                <span className="detail-meta-item mono"><Terminal size={13} /> {service.language}</span>
                <span className="meta-sep">•</span>
                <span className="detail-meta-item mono">Port: {service.internalPort}</span>
              </div>
            </div>
          </div>
          <div className="detail-hero-actions">
            <button className="btn btn-primary btn-lg" onClick={() => triggerDeploy()} disabled={deploying || isBuilding}>
              {deploying || isBuilding
                ? <><Loader2 size={16} className="spin-icon" /> Deploying...</>
                : <><Play size={16} fill="currentColor" /> Deploy Now</>}
            </button>
            <button className="btn btn-danger btn-lg" onClick={handleDelete} disabled={deleting} title="Delete service">
              {deleting ? <Loader2 size={16} className="spin-icon" /> : <Trash2 size={16} />}
            </button>
          </div>
        </div>

        {latestDeploy?.status === "READY" && (
          <div className="ingress-ribbon">
            <div className="ingress-info">
              <div className="ingress-label">{service.isPublic ? "Public Gateway Ingress" : "Local Edge Ingress (whizan-router)"}</div>
              <a href={ingressUrl} target="_blank" rel="noreferrer" className="ingress-link mono">
                {ingressUrl} <ExternalLink size={13} />
              </a>
            </div>
            <button onClick={copyIngressUrl} className="btn btn-secondary btn-sm">
              {copiedUrl ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
              <span>{copiedUrl ? "Copied" : "Copy URL"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Main 2-col layout */}
      <div className={`bd-layout${sidebarHidden ? " bd-nosidebar" : ""}`}>

        {/* LEFT SIDEBAR */}
        {!sidebarHidden && (
          <aside className="bd-sidebar">

            {/* Service Mesh & DNS Quick Card */}
            <div className="card mesh-quick-card" style={{ borderLeft: "3px solid #38bdf8", padding: "1.1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Radio size={16} color="#38bdf8" />
                  <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Private Service Mesh</span>
                </div>
                <span style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem", borderRadius: "10px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", fontWeight: 600 }}>
                  whizan-internal
                </span>
              </div>
              <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0 0 0.85rem 0", lineHeight: 1.4 }}>
                Private DNS: <code className="mono" style={{ color: "#38bdf8" }}>http://{service.slug}:{service.internalPort}</code>
              </p>
              <Link
                href={`/dashboard/backend/${service.id}/mesh`}
                className="btn btn-secondary btn-sm"
                style={{ width: "100%", justifyContent: "center", gap: "0.4rem", fontSize: "0.78rem" }}
              >
                <span>Open Mesh &amp; DNS Tool</span>
                <ArrowRight size={13} />
              </Link>
            </div>

            {/* Compute */}
            <div className="card">
              <div className="card-header-flex">
                <div>
                  <h2 className="card-title">Compute Resources</h2>
                  <p className="card-subtitle">Scale-to-zero vs dedicated capacity</p>
                </div>
              </div>

              <div className={`mode-switch-card ${service.autoSleep ? "mode-free" : "mode-dedicated"}`}>
                <div className="mode-switch-content">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="mode-switch-header">
                      <h3 className="mode-switch-title">
                        {service.autoSleep ? <Moon size={15} color="#f59e0b" /> : <Zap size={15} color="#10b981" />}
                        Auto-Sleep (Scale-to-Zero)
                      </h3>
                      {service.autoSleep && <span className="mode-badge-free">Free Tier • 0.1 vCPU</span>}
                    </div>
                    <p className="mode-switch-desc">
                      {service.autoSleep
                        ? <><strong>Auto-Sleep:</strong> Spins down after 15m inactivity. <strong>0.1 vCPU / 512MB</strong> ceiling.</>
                        : <><strong>Always-On:</strong> No spin-down. Select a dedicated compute plan below.</>}
                    </p>
                  </div>
                  <label className="switch" style={{ flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={service.autoSleep}
                      onChange={async (e) => {
                        const val = e.target.checked;
                        const nextType = val ? "free" : "starter";
                        const nextCpu  = val ? 0.1  : 0.5;
                        setService({ ...service, autoSleep: val, instanceType: nextType as any, cpuLimit: nextCpu, memoryLimit: 512 });
                        try {
                          await services.update(service.id, { autoSleep: val, instanceType: nextType as any, cpuLimit: nextCpu, memoryLimit: 512 });
                          toast.success(val ? "Auto-Sleep enabled" : "Always-On mode activated");
                        } catch {
                          toast.error("Failed to update Auto-Sleep mode");
                          setService({ ...service, autoSleep: !val });
                        }
                      }}
                    />
                    <span className="slider" />
                  </label>
                </div>
              </div>

              {!service.autoSleep && (
                <div className="dedicated-plans-wrap">
                  <div className="plans-header">
                    <div>
                      <h3 className="plans-title"><Cpu size={14} className="text-accent" /> Dedicated Tier</h3>
                      <p className="plans-sub">CPU quota & RAM ceiling for this container.</p>
                    </div>
                    <span className="current-allocation-tag mono">
                      {service.cpuLimit || 0.5}v / {service.memoryLimit || 512}MB
                    </span>
                  </div>
                  <div className="plans-grid">
                    {INSTANCE_PLANS.map(plan => {
                      const isSelected = service.instanceType === plan.id || (!service.instanceType && plan.id === "starter");
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={async () => {
                            setService({ ...service, instanceType: plan.id as any, cpuLimit: plan.cpu, memoryLimit: plan.memory });
                            try {
                              await services.update(service.id, { instanceType: plan.id as any, cpuLimit: plan.cpu, memoryLimit: plan.memory });
                              toast.success(`Updated to ${plan.name}`);
                            } catch {
                              toast.error("Failed to update plan");
                            }
                          }}
                          className={`plan-card-btn${isSelected ? " plan-card-selected" : ""}`}
                        >
                          <div className="plan-card-top">
                            <span className="plan-name">{plan.name}</span>
                            {isSelected && <Check size={13} className="text-accent" />}
                          </div>
                          <span className="plan-desc mono">{plan.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="redeploy-note-box">
                    <span>💡 Applies on next deploy</span>
                    <button type="button" onClick={() => triggerDeploy()} disabled={deploying} className="btn btn-secondary btn-sm">
                      <Play size={12} /> Redeploy
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Build & Runtime Configuration — Collapsible */}
            <div className="card env-collapse-card" style={{ marginBottom: "1rem" }}>
              <button
                className="env-collapse-header"
                onClick={() => setConfigOpen(v => !v)}
                aria-expanded={configOpen}
              >
                <div className="env-collapse-left">
                  <Sliders size={16} className="text-accent" />
                  <div>
                    <span className="env-collapse-title">Service Configuration</span>
                    <span className="env-collapse-sub">Commands, root directory &amp; port</span>
                  </div>
                </div>
                <div className="env-collapse-right">
                  <span className="env-chevron" style={{ transform: configOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                    <ChevronDown size={16} />
                  </span>
                </div>
              </button>

              {configOpen && (
                <div className="env-collapse-body">
                  <div className="form-group-item">
                    <label className="form-label-sm">GitHub Repository URL (Optional)</label>
                    <input
                      type="text"
                      className="input mono"
                      placeholder="https://github.com/owner/repo or 'direct-upload'"
                      value={githubRepoUrl}
                      onChange={e => setGithubRepoUrl(e.target.value)}
                    />
                    <span style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.2rem", display: "block" }}>
                      {!githubRepoUrl || githubRepoUrl === "direct-upload"
                        ? "Currently deployed via Direct Upload (MCP/CLI). Enter a GitHub URL to switch to Git deployment."
                        : "Git clone URL (private repos use authenticated GitHub account). Enter 'direct-upload' to switch back to MCP uploads."}
                    </span>
                  </div>

                  <div className="form-group-item" style={{ marginTop: "0.6rem" }}>
                    <label className="form-label-sm">Root Directory</label>
                    <input
                      type="text"
                      className="input mono"
                      placeholder="."
                      value={rootDir}
                      onChange={e => setRootDir(e.target.value)}
                    />
                    <span style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.2rem", display: "block" }}>
                      Use <code>.</code> for repo root, or subfolder (e.g. <code>backend</code>)
                    </span>
                  </div>

                  <div className="form-group-item" style={{ marginTop: "0.6rem" }}>
                    <label className="form-label-sm">Install Command</label>
                    <input
                      type="text"
                      className="input mono"
                      placeholder={service.language === "PYTHON" ? "pip install -r requirements.txt" : "npm install"}
                      value={installCommand}
                      onChange={e => setInstallCommand(e.target.value)}
                    />
                  </div>

                  <div className="form-group-item" style={{ marginTop: "0.6rem" }}>
                    <label className="form-label-sm">Start Command</label>
                    <input
                      type="text"
                      className="input mono"
                      placeholder={service.language === "PYTHON" ? "python main.py" : "npm start"}
                      value={startCommand}
                      onChange={e => setStartCommand(e.target.value)}
                    />
                    <span style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.2rem", display: "block" }}>
                      {service.language === "PYTHON" ? "Flask apps without app.run() run automatically via Flask CLI" : "Command to start listening container"}
                    </span>
                  </div>

                  <div className="env-inputs-row" style={{ marginTop: "0.6rem" }}>
                    <div className="env-input-wrap">
                      <label className="form-label-sm">Port</label>
                      <input
                        type="number"
                        className="input mono"
                        placeholder="8000"
                        value={internalPort}
                        onChange={e => setInternalPort(Number(e.target.value))}
                      />
                    </div>
                    <div className="env-input-wrap">
                      <label className="form-label-sm">Branch</label>
                      <input
                        type="text"
                        className="input mono"
                        placeholder="main"
                        value={branch}
                        onChange={e => setBranch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.9rem" }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleSaveConfig(false)}
                      disabled={savingConfig}
                      style={{ flex: 1, justifyContent: "center" }}
                    >
                      {savingConfig ? <Loader2 size={13} className="spin-icon" /> : "Save"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleSaveConfig(true)}
                      disabled={savingConfig || deploying}
                      style={{ flex: 1.3, justifyContent: "center" }}
                    >
                      {savingConfig ? <Loader2 size={13} className="spin-icon" /> : <><Play size={12} /> Save &amp; Deploy</>}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ENV Variables — Collapsible */}
            <div className="card env-collapse-card">
              <button
                className="env-collapse-header"
                onClick={() => setEnvOpen(v => !v)}
                aria-expanded={envOpen}
              >
                <div className="env-collapse-left">
                  <FileCode2 size={16} className="text-accent" />
                  <div>
                    <span className="env-collapse-title">Environment Variables</span>
                    <span className="env-collapse-sub">Encrypted container injection</span>
                  </div>
                </div>
                <div className="env-collapse-right">
                  {envCount > 0 && (
                    <span className="env-count-badge">{envCount} var{envCount !== 1 ? "s" : ""}</span>
                  )}
                  <span className="env-chevron" style={{ transform: envOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
                    <ChevronDown size={16} />
                  </span>
                </div>
              </button>

              {envOpen && (
                <div className="env-collapse-body">
                  <div className="env-mode-row">
                    <button className={`env-mode-tab${!bulkEnvMode ? " env-mode-active" : ""}`} onClick={() => setBulkEnvMode(false)}>
                      <Plus size={12} /> Add Variable
                    </button>
                    <button className={`env-mode-tab${bulkEnvMode ? " env-mode-active" : ""}`} onClick={() => setBulkEnvMode(true)}>
                      <FileCode2 size={12} /> Bulk Import
                    </button>
                  </div>

                  {bulkEnvMode ? (
                    <div>
                      <textarea
                        className="input mono"
                        rows={6}
                        placeholder={"DATABASE_URL=postgresql://...\nAPI_KEY=secret\nNODE_ENV=production"}
                        value={bulkEnvText}
                        onChange={e => setBulkEnvText(e.target.value)}
                        style={{ resize: "vertical", fontSize: "0.8rem", lineHeight: 1.6 }}
                      />
                      <button
                        className="btn btn-primary"
                        onClick={handleBulkEnvSave}
                        disabled={savingEnv || !bulkEnvText.trim()}
                        style={{ marginTop: "0.65rem", width: "100%" }}
                      >
                        {savingEnv ? <Loader2 size={14} className="spin-icon" /> : "Save Bulk Variables"}
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleAddEnv}>
                      <div className="env-inputs-row">
                        <div className="env-input-wrap">
                          <label className="form-label-sm">Key</label>
                          <input
                            required type="text" className="input mono" placeholder="DATABASE_URL"
                            value={envKey}
                            onChange={e => setEnvKey(e.target.value.replace(/[^a-zA-Z0-9_.-]/g, ""))}
                          />
                        </div>
                        <div className="env-input-wrap" style={{ flex: 1.6 }}>
                          <label className="form-label-sm">Value</label>
                          <input
                            required type="text" className="input mono" placeholder="postgres://..."
                            value={envValue} onChange={e => setEnvValue(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="env-form-footer">
                        <label className="env-secret-toggle">
                          <input type="checkbox" checked={envSecret} onChange={e => setEnvSecret(e.target.checked)} />
                          <Key size={11} /><span>Encrypt as secret</span>
                        </label>
                        <button type="submit" className="btn btn-primary btn-sm" disabled={savingEnv}>
                          {savingEnv ? <Loader2 size={13} className="spin-icon" /> : <><Plus size={13} /> Add</>}
                        </button>
                      </div>
                    </form>
                  )}

                  {envCount === 0 ? (
                    <div className="empty-env-hint">No environment variables configured yet.</div>
                  ) : (
                    <div className="env-vars-list">
                      {service.envVariables.map(v => (
                        <div key={v.id} className="env-var-row">
                          <div className="env-var-left">
                            <span className="env-key mono">{v.key}</span>
                            <span className="env-secret-badge"><Key size={10} />{v.isSecret ? "Secret" : "Plain"}</span>
                          </div>
                          <button className="icon-btn-danger" onClick={() => handleDeleteEnv(v.key)} title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* RIGHT / MAIN COLUMN */}
        <div className="bd-main-col">
          {/* Deployment History */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="deploy-history-header">
              <h2 className="card-title" style={{ fontSize: "1rem" }}>Deployment History</h2>
              <span className="mono" style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{service.deployments.length} runs</span>
            </div>
            {service.deployments.length === 0 ? (
              <div style={{ padding: "2.5rem 1.5rem", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
                No deployments recorded yet.
              </div>
            ) : (
              <div className="deploy-history-list">
                {service.deployments.map(d => {
                  const isSelected = selectedDId === d.id;
                  return (
                    <div
                      key={d.id}
                      onClick={() => {
                        setSelectedDId(d.id);
                        document.getElementById("terminal-view")?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className={`deploy-history-row${isSelected ? " deploy-history-selected" : ""}`}
                    >
                      <div className="deploy-history-meta">
                        <div className="deploy-history-status-row">
                          <StatusBadge status={d.status} />
                          <span className="mono" style={{ fontSize: "0.76rem", color: "var(--muted)" }}>#{d.commitHash.substring(0, 7)}</span>
                        </div>
                        <div className="deploy-history-time">
                          <Clock size={11} />
                          <span>{formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}</span>
                        </div>
                        {d.status === "FAILED" && d.errorMessage && (
                          <div className="deploy-history-err" title={d.errorMessage}>❌ {d.errorMessage}</div>
                        )}
                      </div>
                      <Terminal size={16} style={{ color: isSelected ? "var(--accent)" : "var(--muted)", opacity: isSelected ? 1 : 0.4 }} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Terminal Section */}
          <div className="terminal-section-wrap" id="terminal-view">
            <div className="terminal-tab-bar">
              {([
                { id: "logs",    label: "Build & Runtime Logs", Icon: Terminal,  chip: null },
                { id: "shell",   label: "Web Shell",            Icon: Server,    chip: { text: "docker exec", cls: "chip-blue" } },
                { id: "metrics", label: "Live Metrics",         Icon: Activity,  chip: { text: "SSE", cls: "chip-green", dot: true } },
              ] as const).map(tab => {
                const active = bottomTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setBottomTab(tab.id)} className={`terminal-tab-btn${active ? " terminal-tab-active" : ""}`}>
                    <tab.Icon size={14} />
                    <span className="tab-label-text">{tab.label}</span>
                    {tab.chip && (
                      <span className={`tab-chip ${tab.chip.cls}`}>
                        {"dot" in tab.chip && tab.chip.dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#10b981" }} />}
                        {tab.chip.text}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="terminal-body-container">
              {bottomTab === "logs" ? (
                selectedDId
                  ? <ServiceLogs dId={selectedDId} serviceId={id} />
                  : <div style={{ color: "var(--muted)", padding: "3rem", textAlign: "center", fontSize: "0.85rem" }}>Select a deployment above to stream logs.</div>
              ) : bottomTab === "shell" ? (
                service && <ServiceShell serviceId={id} slug={service.slug} />
              ) : (
                service && <ServiceMetrics serviceId={id} slug={service.slug} isPublic={service.isPublic} autoSleep={service.autoSleep} instanceType={service.instanceType} cpuLimit={service.cpuLimit} memoryLimit={service.memoryLimit} />
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        /* ─── Page Shell ─── */
        .bd-page {
          padding: 2rem 2.5rem 4rem;
          max-width: 1440px;
          margin: 0 auto;
          animation: fadeIn 0.25s ease-out;
        }
        .bd-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.5rem;
          gap: 1rem;
          flex-wrap: wrap;
        }

        /* ─── Hero Card ─── */
        .detail-hero-card {
          background: var(--card);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-lg);
          padding: 1.65rem;
          box-shadow: var(--shadow);
          margin-bottom: 2rem;
        }
        .detail-hero-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1.25rem;
          flex-wrap: wrap;
        }
        .detail-hero-brand { display: flex; align-items: center; gap: 1.15rem; }
        .detail-icon-box {
          width: 54px; height: 54px; border-radius: 14px;
          background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.25);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .detail-kicker { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 700; }
        .detail-title-row { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.2rem; flex-wrap: wrap; }
        .detail-title { font-size: 1.7rem; font-weight: 800; letter-spacing: -0.03em; color: var(--foreground); }
        .detail-meta-row { display: flex; align-items: center; gap: 0.55rem; margin-top: 0.4rem; font-size: 0.8125rem; color: var(--muted); flex-wrap: wrap; }
        .detail-meta-item { display: flex; align-items: center; gap: 0.3rem; }
        .meta-sep { opacity: 0.4; }
        .detail-hero-actions { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }
        .ingress-ribbon {
          margin-top: 1.35rem; padding: 0.8rem 1.15rem;
          background: rgba(99,102,241,0.05); border: 1px solid rgba(99,102,241,0.2);
          border-radius: 10px; display: flex; align-items: center;
          justify-content: space-between; gap: 1rem; flex-wrap: wrap;
        }
        .ingress-info { display: flex; flex-direction: column; gap: 0.15rem; }
        .ingress-label { font-size: 0.67rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 700; }
        .ingress-link { font-size: 0.9rem; font-weight: 600; color: var(--accent); display: inline-flex; align-items: center; gap: 0.4rem; text-decoration: none; }
        .ingress-link:hover { color: var(--accent-hover); }

        /* ─── Main Layout ─── */
        .bd-layout {
          display: grid;
          grid-template-columns: 340px 1fr;
          gap: 1.75rem;
          align-items: start;
        }
        .bd-nosidebar { grid-template-columns: 1fr; }
        .bd-sidebar { display: flex; flex-direction: column; gap: 1.5rem; min-width: 0; }
        .bd-main-col { display: flex; flex-direction: column; gap: 1.75rem; min-width: 0; }

        /* Card extras */
        .card-header-flex { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.15rem; }
        .card-subtitle { font-size: 0.8rem; color: var(--muted); margin-top: 0.15rem; }

        /* Mode Switch */
        .mode-switch-card { border-radius: 10px; padding: 1rem; border: 1px solid var(--card-border); transition: all 0.2s ease; }
        .mode-free      { background: rgba(245,158,11,0.06); border-color: rgba(245,158,11,0.25); }
        .mode-dedicated { background: rgba(16,185,129,0.06); border-color: rgba(16,185,129,0.25); }
        .mode-switch-content { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
        .mode-switch-header { display: flex; align-items: center; gap: 0.55rem; margin-bottom: 0.3rem; flex-wrap: wrap; }
        .mode-switch-title { font-size: 0.9rem; font-weight: 650; color: var(--foreground); display: flex; align-items: center; gap: 0.4rem; }
        .mode-badge-free { font-size: 0.67rem; font-weight: 700; color: #f59e0b; background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.3); border-radius: 4px; padding: 0.1rem 0.4rem; }
        .mode-switch-desc { font-size: 0.79rem; color: var(--muted); line-height: 1.5; }

        /* Dedicated Plans */
        .dedicated-plans-wrap { margin-top: 1.15rem; padding-top: 1.15rem; border-top: 1px solid var(--card-border); }
        .plans-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.8rem; flex-wrap: wrap; }
        .plans-title { font-size: 0.88rem; font-weight: 650; color: var(--foreground); display: flex; align-items: center; gap: 0.4rem; }
        .plans-sub { font-size: 0.76rem; color: var(--muted); margin-top: 0.1rem; }
        .current-allocation-tag { font-size: 0.72rem; color: var(--foreground); background: var(--bg-inset); border: 1px solid var(--card-border); padding: 0.2rem 0.5rem; border-radius: 5px; flex-shrink: 0; }
        .plans-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.6rem; margin-bottom: 0.85rem; }
        .plan-card-btn { display: flex; flex-direction: column; align-items: flex-start; padding: 0.75rem; background: var(--bg-inset); border: 1px solid var(--card-border); border-radius: 8px; cursor: pointer; text-align: left; transition: all 0.15s ease; }
        .plan-card-btn:hover { background: var(--card-hover); border-color: var(--muted-fg); }
        .plan-card-selected { background: rgba(99,102,241,0.08) !important; border: 2px solid var(--accent) !important; }
        .plan-card-top { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-bottom: 0.25rem; }
        .plan-name { font-weight: 650; font-size: 0.86rem; color: var(--foreground); }
        .plan-desc { font-size: 0.72rem; color: var(--muted); }
        .redeploy-note-box { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.65rem 0.9rem; background: var(--bg-inset); border: 1px solid var(--card-border); border-radius: 7px; font-size: 0.78rem; color: var(--muted); flex-wrap: wrap; }

        /* ─── ENV Collapse ─── */
        .env-collapse-card { padding: 0; overflow: hidden; }
        .env-collapse-header {
          width: 100%; display: flex; align-items: center; justify-content: space-between;
          gap: 0.75rem; padding: 1rem 1.25rem; background: transparent; border: none;
          cursor: pointer; text-align: left; font-family: inherit; transition: background 0.15s ease;
        }
        .env-collapse-header:hover { background: rgba(255,255,255,0.025); }
        .env-collapse-left { display: flex; align-items: center; gap: 0.7rem; }
        .env-collapse-title { display: block; font-size: 0.92rem; font-weight: 650; color: var(--foreground); letter-spacing: -0.01em; }
        .env-collapse-sub { display: block; font-size: 0.72rem; color: var(--muted); margin-top: 0.08rem; }
        .env-collapse-right { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }
        .env-count-badge { font-size: 0.7rem; font-weight: 650; padding: 0.12rem 0.5rem; background: rgba(99,102,241,0.12); color: var(--accent); border: 1px solid rgba(99,102,241,0.25); border-radius: 9999px; }
        .env-chevron { color: var(--muted); display: flex; align-items: center; transition: transform 0.2s cubic-bezier(0.16,1,0.3,1); }
        .env-collapse-body { border-top: 1px solid var(--card-border); padding: 1rem 1.25rem 1.25rem; display: flex; flex-direction: column; gap: 0.85rem; animation: fadeIn 0.18s ease; }

        .env-mode-row { display: flex; gap: 0.3rem; background: var(--bg-inset); border-radius: 8px; padding: 0.2rem; }
        .env-mode-tab { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.35rem; padding: 0.4rem 0.5rem; font-size: 0.76rem; font-weight: 600; color: var(--muted); background: transparent; border: 1px solid transparent; border-radius: 6px; cursor: pointer; font-family: inherit; transition: all 0.15s ease; white-space: nowrap; }
        .env-mode-tab:hover { color: var(--foreground); }
        .env-mode-active { background: var(--card) !important; color: var(--foreground) !important; border-color: var(--card-border) !important; box-shadow: 0 1px 4px rgba(0,0,0,0.15); }

        .env-inputs-row { display: flex; gap: 0.6rem; flex-wrap: wrap; }
        .env-input-wrap { flex: 1; min-width: 90px; }
        .form-label-sm { display: block; font-size: 0.7rem; font-weight: 650; color: var(--muted); margin-bottom: 0.28rem; text-transform: uppercase; letter-spacing: 0.04em; }
        .env-form-footer { display: flex; align-items: center; justify-content: space-between; gap: 0.65rem; flex-wrap: wrap; margin-top: 0.25rem; }
        .env-secret-toggle { display: flex; align-items: center; gap: 0.4rem; font-size: 0.76rem; color: var(--muted); cursor: pointer; user-select: none; }
        .env-secret-toggle input { cursor: pointer; accent-color: var(--accent); }

        .empty-env-hint { padding: 1.5rem 1rem; text-align: center; color: var(--muted); font-size: 0.8rem; border: 1px dashed var(--card-border); border-radius: 8px; background: var(--bg-inset); }
        .env-vars-list { display: flex; flex-direction: column; gap: 0.3rem; max-height: 260px; overflow-y: auto; }
        .env-var-row { display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 0.8rem; background: var(--bg-inset); border: 1px solid var(--card-border); border-radius: 7px; gap: 0.6rem; }
        .env-var-left { display: flex; align-items: center; gap: 0.6rem; min-width: 0; overflow: hidden; }
        .env-key { font-weight: 650; font-size: 0.8rem; color: var(--foreground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .env-secret-badge { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.66rem; color: var(--muted); background: rgba(255,255,255,0.05); padding: 0.1rem 0.38rem; border-radius: 4px; white-space: nowrap; flex-shrink: 0; }
        .icon-btn-danger { background: transparent; border: none; color: var(--muted); cursor: pointer; padding: 0.28rem; border-radius: 6px; display: flex; align-items: center; transition: all 0.15s ease; flex-shrink: 0; }
        .icon-btn-danger:hover { color: var(--danger); background: var(--danger-glow); }

        /* ─── Deploy History ─── */
        .deploy-history-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--card-border); }
        .deploy-history-list { display: flex; flex-direction: column; }
        .deploy-history-row { display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1.25rem; border-bottom: 1px solid var(--card-border); cursor: pointer; transition: background 0.15s ease; gap: 1rem; }
        .deploy-history-row:last-child { border-bottom: none; }
        .deploy-history-row:hover { background: var(--card-hover); }
        .deploy-history-selected { background: var(--accent-glow) !important; border-left: 3px solid var(--accent); }
        .deploy-history-meta { display: flex; flex-direction: column; gap: 0.25rem; }
        .deploy-history-status-row { display: flex; align-items: center; gap: 0.55rem; }
        .deploy-history-time { display: flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; color: var(--muted); }
        .deploy-history-err { font-size: 0.7rem; color: var(--danger); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* ─── Terminal ─── */
        .terminal-section-wrap { scroll-margin-top: 1.5rem; }
        .terminal-tab-bar { display: flex; align-items: center; gap: 0.4rem; border-bottom: 1px solid var(--card-border); padding-bottom: 0.55rem; overflow-x: auto; scrollbar-width: none; }
        .terminal-tab-bar::-webkit-scrollbar { display: none; }
        .terminal-tab-btn { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.5rem 0.9rem; border-radius: 8px; font-size: 0.82rem; font-weight: 600; cursor: pointer; border: 1px solid transparent; background: transparent; color: var(--muted); transition: all 0.15s ease; white-space: nowrap; font-family: inherit; }
        .terminal-tab-btn:hover { color: var(--foreground); background: var(--card-hover); }
        .terminal-tab-active { background: var(--accent-gradient) !important; color: #ffffff !important; box-shadow: 0 4px 12px var(--accent-glow); }
        .tab-chip { font-size: 0.63rem; padding: 0.1rem 0.4rem; border-radius: 4px; font-family: var(--font-geist-mono), monospace; display: inline-flex; align-items: center; gap: 0.3rem; }
        .chip-blue  { background: rgba(56,189,248,0.2); color: #38bdf8; }
        .chip-green { background: rgba(16,185,129,0.2); color: #10b981; }
        .terminal-tab-active .chip-blue, .terminal-tab-active .chip-green { background: rgba(255,255,255,0.2); color: #ffffff; }
        .terminal-body-container { margin-top: 1rem; }

        /* ─── RESPONSIVE ─── */
        @media (min-width: 1400px) {
          .bd-layout { grid-template-columns: 380px 1fr; }
        }
        @media (max-width: 1200px) {
          .bd-layout { grid-template-columns: 300px 1fr; gap: 1.35rem; }
        }
        @media (max-width: 1024px) {
          .bd-layout { grid-template-columns: 1fr; }
          .detail-hero-top { flex-direction: column; }
          .detail-hero-actions { width: 100%; }
          .detail-hero-actions .btn { flex: 1; }
          .bd-page { padding: 1.5rem 1.25rem 3rem; }
          .toggle-label { display: none; }
        }
        @media (max-width: 640px) {
          .bd-page { padding: 1rem 0.85rem 2.5rem; }
          .detail-hero-card { padding: 1.1rem; }
          .detail-title { font-size: 1.35rem; }
          .detail-hero-brand { align-items: flex-start; gap: 0.8rem; }
          .detail-icon-box { width: 44px; height: 44px; border-radius: 10px; }
          .plans-grid { grid-template-columns: repeat(2, 1fr); }
          .ingress-ribbon { flex-direction: column; align-items: flex-start; }
          .env-inputs-row { flex-direction: column; }
          .env-form-footer { flex-direction: column; align-items: flex-start; }
          .tab-label-text { display: none; }
        }
        @media (max-width: 420px) {
          .meta-sep { display: none; }
          .bd-topbar { flex-direction: column; align-items: flex-start; }
          .detail-meta-row { flex-direction: column; align-items: flex-start; gap: 0.3rem; }
        }
      `}</style>
    </div>
  );
}
