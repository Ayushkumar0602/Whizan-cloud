"use client";
import { useEffect, useState } from "react";
import { projects, envVars, customDomains, type ProjectWithDeployments, type EnvVariable } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Globe,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  Key
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";

export default function ProjectSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<ProjectWithDeployments | null>(null);
  const [envList, setEnvList] = useState<EnvVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newSecret, setNewSecret] = useState(false);
  const [addingEnv, setAddingEnv] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const [domainList, setDomainList] = useState<any[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  async function load() {
    try {
      const [p, envs, domains] = await Promise.all([
        projects.get(id),
        envVars.list(id),
        customDomains.list(id),
      ]);
      setProject(p);
      setEnvList(envs);
      setDomainList(domains);
    } catch {
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function handleAddEnv(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    setAddingEnv(true);
    try {
      await envVars.set(id, { key: newKey.trim(), value: newValue.trim(), isSecret: newSecret });
      toast.success(`Saved variable ${newKey}`);
      setNewKey("");
      setNewValue("");
      setNewSecret(false);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to save variable");
    } finally {
      setAddingEnv(false);
    }
  }

  async function handleDeleteEnv(key: string) {
    if (!confirm(`Delete environment variable ${key}?`)) return;
    try {
      await envVars.delete(id, key);
      toast.success(`Deleted ${key}`);
      await load();
    } catch {
      toast.error("Failed to delete variable");
    }
  }

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setAddingDomain(true);
    try {
      await customDomains.add(id, newDomain.trim().toLowerCase());
      toast.success(`Domain ${newDomain} registered`);
      setNewDomain("");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to add domain");
    } finally {
      setAddingDomain(false);
    }
  }

  async function handleDeleteDomain(domain: string) {
    if (!confirm(`Remove custom domain ${domain}?`)) return;
    try {
      await customDomains.delete(id, domain);
      toast.success(`Domain ${domain} removed`);
      await load();
    } catch {
      toast.error("Failed to remove domain");
    }
  }

  async function handleDeleteProject() {
    if (!confirm(`Permanently delete "${project?.name}"? All deployments, domains, and configuration will be wiped.`)) return;
    try {
      await projects.delete(id);
      toast.success("Project deleted");
      router.push("/dashboard/hosting");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete project");
    }
  }

  function toggleReveal(varId: string) {
    setRevealed(prev => {
      const next = new Set(prev);
      next.has(varId) ? next.delete(varId) : next.add(varId);
      return next;
    });
  }

  function copyText(val: string, key: string) {
    navigator.clipboard.writeText(val);
    setCopiedValue(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedValue(null), 2000);
  }

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Loading project settings...</span>
      </div>
    );
  }
  if (!project) return null;

  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <Link href={`/dashboard/projects/${id}`} className="breadcrumb">
        <ArrowLeft size={15} /> Back to {project.name}
      </Link>

      <PageHeader
        title="Project Settings"
        subtitle={`Configure environment variables, edge custom domains, and build settings for ${project.name}.`}
      />

      <div className="settings-stack">
        {/* Environment Variables */}
        <div className="card">
          <div className="settings-header">
            <div>
              <h2 className="card-title" style={{ fontSize: "1.05rem" }}>Environment Variables</h2>
              <p className="card-sub">Securely injected into your build pipeline and runtime</p>
            </div>
          </div>

          {/* List of existing variables */}
          {envList.length > 0 && (
            <div className="env-table-wrap">
              {envList.map(v => (
                <div key={v.id} className="env-row-item">
                  <div className="env-key-cell">
                    <span className="mono" style={{ fontWeight: 650 }}>{v.key}</span>
                    {v.isSecret && (
                      <span className="secret-tag">
                        <Lock size={11} /> Secret
                      </span>
                    )}
                  </div>

                  <div className="env-val-cell">
                    <span className="mono env-val-text">
                      {v.isSecret && !revealed.has(v.id) ? "••••••••••••••••" : v.value}
                    </span>
                    {v.isSecret && (
                      <button
                        className="btn-icon"
                        onClick={() => toggleReveal(v.id)}
                        title={revealed.has(v.id) ? "Mask" : "Reveal"}
                      >
                        {revealed.has(v.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    )}
                  </div>

                  <button
                    className="icon-btn-danger"
                    onClick={() => handleDeleteEnv(v.key)}
                    title="Delete variable"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add variable form */}
          <form onSubmit={handleAddEnv} className="add-env-grid">
            <div className="form-field" style={{ flex: 1, minWidth: "160px" }}>
              <label className="field-label">Key</label>
              <input
                id="env-key"
                className="input mono"
                placeholder="NEXT_PUBLIC_API"
                value={newKey}
                onChange={e => setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
              />
            </div>
            <div className="form-field" style={{ flex: 2, minWidth: "220px" }}>
              <label className="field-label">Value</label>
              <input
                id="env-value"
                className="input mono"
                placeholder="https://..."
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                type={newSecret ? "password" : "text"}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", alignSelf: "flex-end", height: 42 }}>
              <label className="secret-toggle-label">
                <input
                  type="checkbox"
                  checked={newSecret}
                  onChange={e => setNewSecret(e.target.checked)}
                />
                <Lock size={13} />
                <span>Secret</span>
              </label>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={addingEnv || !newKey || !newValue}
                style={{ height: 40 }}
              >
                {addingEnv ? <Loader2 size={14} className="spin-icon" /> : <Plus size={14} />}
                <span>Add</span>
              </button>
            </div>
          </form>
        </div>

        {/* Custom Domains */}
        <div className="card">
          <div className="settings-header">
            <div>
              <h2 className="card-title" style={{ fontSize: "1.05rem" }}>Custom Domains & SSL</h2>
              <p className="card-sub">Point your apex or subdomain with automated Let's Encrypt certificates</p>
            </div>
          </div>

          {domainList.length > 0 && (
            <div className="domains-stack">
              {domainList.map(d => (
                <div key={d.id} className="domain-card-item">
                  <div className="domain-top-row">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Globe size={16} className="text-accent" />
                      <span className="mono" style={{ fontWeight: 650, fontSize: "0.95rem" }}>{d.domain}</span>
                    </div>
                    <button
                      className="icon-btn-danger"
                      onClick={() => handleDeleteDomain(d.domain)}
                      title="Remove domain"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="dns-guide-box">
                    <div style={{ fontWeight: 600, fontSize: "0.78rem", color: "var(--foreground)", marginBottom: "0.35rem" }}>
                      Required DNS Record:
                    </div>
                    <div className="dns-records-grid">
                      <div className="dns-chip">
                        <span className="dns-chip-label">Type</span>
                        <span className="mono">CNAME</span>
                      </div>
                      <div className="dns-chip">
                        <span className="dns-chip-label">Host</span>
                        <span className="mono">{d.domain.startsWith("www.") ? "www" : "@"}</span>
                      </div>
                      <div className="dns-chip" style={{ flex: 1 }}>
                        <span className="dns-chip-label">Target</span>
                        <span className="mono">{project.slug}.whizan.cloud</span>
                        <button
                          type="button"
                          onClick={() => copyText(`${project.slug}.whizan.cloud`, d.id)}
                          className="dns-copy-btn"
                        >
                          {copiedValue === d.id ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddDomain} className="add-domain-row">
            <input
              className="input mono"
              placeholder="e.g. app.mycompany.com"
              value={newDomain}
              onChange={e => setNewDomain(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={addingDomain || !newDomain.trim()}
              style={{ height: 40 }}
            >
              {addingDomain ? <Loader2 size={14} className="spin-icon" /> : <Plus size={14} />}
              <span>Add Domain</span>
            </button>
          </form>
        </div>

        {/* Danger Zone */}
        <div className="card danger-card">
          <div className="danger-header">
            <AlertTriangle size={20} color="#f43f5e" />
            <div>
              <h2 className="card-title" style={{ color: "var(--danger)", fontSize: "1.05rem" }}>
                Danger Zone
              </h2>
              <p className="card-sub">
                Permanently delete this project. This removes all deployments, edge caches, build assets, and custom domains.
              </p>
            </div>
          </div>

          <div className="danger-action-row">
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>Delete Project</div>
              <div style={{ fontSize: "0.76rem", color: "var(--muted)" }}>This action cannot be undone.</div>
            </div>
            <button
              id="delete-project-btn"
              className="btn btn-danger"
              onClick={handleDeleteProject}
            >
              <Trash2 size={15} /> Delete Project
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .settings-stack {
          display: flex;
          flex-direction: column;
          gap: 1.75rem;
        }

        .settings-header {
          margin-bottom: 1.25rem;
        }
        .card-sub {
          font-size: 0.8rem;
          color: var(--muted);
          margin-top: 0.15rem;
        }

        /* Env Variables Table */
        .env-table-wrap {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--card-border);
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 1.25rem;
        }
        .env-row-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--card-border);
          background: var(--bg-inset);
          gap: 1rem;
        }
        .env-row-item:last-child {
          border-bottom: none;
        }
        .env-key-cell {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 180px;
          flex-shrink: 0;
        }
        .secret-tag {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.68rem;
          background: rgba(255, 255, 255, 0.06);
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
          color: var(--muted);
        }
        .env-val-cell {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 0;
        }
        .env-val-text {
          font-size: 0.82rem;
          color: var(--muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .btn-icon {
          background: transparent;
          border: none;
          color: var(--muted);
          cursor: pointer;
          padding: 0.2rem;
          border-radius: 4px;
          display: flex;
          align-items: center;
        }
        .btn-icon:hover {
          color: var(--foreground);
        }

        .icon-btn-danger {
          background: transparent;
          border: none;
          color: var(--muted);
          cursor: pointer;
          padding: 0.3rem;
          border-radius: 6px;
          display: flex;
          align-items: center;
          transition: all 0.15s ease;
        }
        .icon-btn-danger:hover {
          color: var(--danger);
          background: var(--danger-glow);
        }

        .add-env-grid {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .field-label {
          font-size: 0.76rem;
          font-weight: 650;
          color: var(--foreground);
          margin-bottom: 0.3rem;
        }
        .secret-toggle-label {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.78rem;
          color: var(--muted);
          cursor: pointer;
          white-space: nowrap;
        }

        /* Custom Domains */
        .domains-stack {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 1.25rem;
        }
        .domain-card-item {
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: 8px;
          padding: 1rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .domain-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .dns-guide-box {
          background: var(--card);
          border: 1px solid var(--card-border);
          border-radius: 6px;
          padding: 0.75rem 1rem;
        }
        .dns-records-grid {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .dns-chip {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          padding: 0.3rem 0.65rem;
          border-radius: 6px;
          font-size: 0.78rem;
        }
        .dns-chip-label {
          color: var(--accent);
          font-weight: 650;
          font-size: 0.72rem;
          text-transform: uppercase;
        }
        .dns-copy-btn {
          background: transparent;
          border: none;
          color: var(--muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          margin-left: 0.25rem;
        }
        .dns-copy-btn:hover {
          color: var(--foreground);
        }

        .add-domain-row {
          display: flex;
          gap: 0.75rem;
          align-items: center;
        }

        /* Danger Card */
        .danger-card {
          border-color: rgba(244, 63, 94, 0.25);
          background: rgba(244, 63, 94, 0.03);
        }
        .danger-header {
          display: flex;
          align-items: flex-start;
          gap: 0.85rem;
          margin-bottom: 1.25rem;
        }
        .danger-action-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 1rem;
          border-top: 1px solid rgba(244, 63, 94, 0.15);
          flex-wrap: wrap;
          gap: 1rem;
        }

        @media (max-width: 640px) {
          .add-env-grid {
            flex-direction: column;
          }
          .add-domain-row {
            flex-direction: column;
            align-items: stretch;
          }
          .add-domain-row .btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
