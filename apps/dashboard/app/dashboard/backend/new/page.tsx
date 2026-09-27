"use client";
import { useState } from "react";
import { services } from "@/lib/api";
import { getServiceIngressUrl } from "@/lib/domains";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { GitHubRepoPicker, type SelectedRepoInfo } from "@/components/github-repo-picker";
import {
  Github,
  Server,
  Activity,
  Cpu,
  Moon,
  Zap,
  Check,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Globe,
  Lock,
  Terminal,
  Code
} from "lucide-react";

const INSTANCE_PLANS = [
  { id: "starter", name: "Starter", cpu: 0.5, memory: 512, desc: "0.5 vCPU • 512 MB" },
  { id: "standard", name: "Standard", cpu: 1.0, memory: 1024, desc: "1.0 vCPU • 1 GB" },
  { id: "pro", name: "Pro", cpu: 2.0, memory: 2048, desc: "2.0 vCPU • 2 GB" },
  { id: "pro_plus", name: "Pro Plus", cpu: 4.0, memory: 4096, desc: "4.0 vCPU • 4 GB" },
];

export default function NewServicePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [envText, setEnvText] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    githubRepoUrl: "",
    branch: "main",
    rootDir: ".",
    language: "NODEJS",
    installCommand: "npm install",
    startCommand: "npm start",
    internalPort: 8000,
    isPublic: false,
    autoSleep: true,
    instanceType: "free" as "free" | "starter" | "standard" | "pro" | "pro_plus",
    cpuLimit: 0.1,
    memoryLimit: 512,
  });

  const handleRepoSelect = (info: SelectedRepoInfo) => {
    const cloneUrl = info.cloneUrl || "";
    const name = info.name || "";
    const defaultBranch = info.defaultBranch || "main";

    setFormData(prev => {
      const updatedName = prev.name ? prev.name : name;
      const updatedSlug = prev.slug ? prev.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      return {
        ...prev,
        githubRepoUrl: cloneUrl,
        branch: defaultBranch,
        name: updatedName,
        slug: updatedSlug,
      };
    });

    toast.success(`Selected repository: ${info.fullName || info.name}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.githubRepoUrl) {
      toast.error("Please select or enter a GitHub repository URL");
      return;
    }
    setLoading(true);
    try {
      const service = await services.create(formData);

      // Parse and save ENV variables
      if (envText.trim()) {
        const lines = envText.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx === -1) continue;

          const key = trimmed.slice(0, eqIdx).trim().toUpperCase().replace(/[^A-Z0-9_]/g, "");
          let val = trimmed.slice(eqIdx + 1).trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);

          if (key && val) {
            await services.setEnv(service.id, key, val, true);
          }
        }
      }

      toast.success("Backend service created successfully!");
      router.push(`/dashboard/backend/${service.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create service");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 840 }}>
      <Link href="/dashboard/backend" className="breadcrumb">
        <ArrowLeft size={15} /> Back to Backend Services
      </Link>

      <PageHeader
        title="Deploy a Backend Service"
        subtitle="Connect any public or private Git repository to automatically build, isolate, and host your Node.js, Python, or Go API on Docker."
      />

      <form onSubmit={handleSubmit} className="form-stack">
        {/* Step 1: Repository */}
        <div className="card">
          <div className="form-step-header">
            <div className="step-num-box">1</div>
            <div>
              <h2 className="card-title" style={{ fontSize: "1.05rem" }}>Connect Repository</h2>
              <p className="card-sub">Select a repository from your GitHub account or manually specify a Git URL</p>
            </div>
          </div>

          <GitHubRepoPicker
            onSelectRepo={handleRepoSelect}
            selectedUrl={formData.githubRepoUrl}
            selectedBranch={formData.branch}
          />

          <div className="form-fields-group" style={{ marginTop: "1rem" }}>
            <div className="form-field">
              <label className="field-label">Root Directory (Optional)</label>
              <input
                type="text"
                placeholder="./ or api/"
                className="input mono"
                value={formData.rootDir}
                onChange={e => setFormData({ ...formData, rootDir: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Step 2: Service Identity */}
        <div className="card">
          <div className="form-step-header">
            <div className="step-num-box">2</div>
            <div>
              <h2 className="card-title" style={{ fontSize: "1.05rem" }}>Service Identity & Runtime</h2>
              <p className="card-sub">Choose your runtime stack and service mesh alias</p>
            </div>
          </div>

          <div className="form-fields-group">
            <div className="form-grid-2">
              <div className="form-field">
                <label className="field-label">Service Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Payment API"
                  className="input"
                  value={formData.name}
                  onChange={e => {
                    const name = e.target.value;
                    setFormData({
                      ...formData,
                      name,
                      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
                    });
                  }}
                />
              </div>

              <div className="form-field">
                <label className="field-label">Internal Mesh Slug *</label>
                <input
                  type="text"
                  required
                  className="input mono"
                  value={formData.slug}
                  onChange={e => setFormData({ ...formData, slug: e.target.value })}
                />
                <span className="field-hint">
                  Resolvable internally at: <strong className="mono">http://{formData.slug || "slug"}:{formData.internalPort}</strong>
                </span>
              </div>
            </div>

            <div className="form-field">
              <label className="field-label">Language & Runtime Stack</label>
              <select
                className="input"
                value={formData.language}
                onChange={e => {
                  const lang = e.target.value;
                  let install = "npm install";
                  let start = "npm start";
                  if (lang === "PYTHON") {
                    install = "pip install -r requirements.txt";
                    start = "python main.py";
                  }
                  if (lang === "GO") {
                    install = "go mod download";
                    start = "go run main.go";
                  }
                  setFormData({
                    ...formData,
                    language: lang,
                    installCommand: install,
                    startCommand: start,
                  });
                }}
              >
                <option value="NODEJS">Node.js (LTS 20)</option>
                <option value="PYTHON">Python 3.11</option>
                <option value="GO">Go 1.22</option>
              </select>
            </div>
          </div>
        </div>

        {/* Step 3: Commands & Networking */}
        <div className="card">
          <div className="form-step-header">
            <div className="step-num-box">3</div>
            <div>
              <h2 className="card-title" style={{ fontSize: "1.05rem" }}>Build Commands & Networking</h2>
              <p className="card-sub">Fine-tune dependency installation and container listening port</p>
            </div>
          </div>

          <div className="form-fields-group">
            <div className="form-grid-2">
              <div className="form-field">
                <label className="field-label">Install Command</label>
                <input
                  type="text"
                  className="input mono"
                  value={formData.installCommand}
                  onChange={e => setFormData({ ...formData, installCommand: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label className="field-label">Start Command</label>
                <input
                  type="text"
                  className="input mono"
                  value={formData.startCommand}
                  onChange={e => setFormData({ ...formData, startCommand: e.target.value })}
                />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-field">
                <label className="field-label">Internal Port (Container Bind) *</label>
                <input
                  type="number"
                  required
                  className="input mono"
                  value={formData.internalPort}
                  onChange={e => setFormData({ ...formData, internalPort: parseInt(e.target.value) || 8000 })}
                />
              </div>

              <div className="form-field checkbox-card-wrap">
                <label className="checkbox-toggle-card">
                  <input
                    type="checkbox"
                    checked={formData.isPublic}
                    onChange={e => setFormData({ ...formData, isPublic: e.target.checked })}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--foreground)" }}>
                      Expose to Public Internet
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginTop: "2px" }}>
                      Creates a public domain ingress route at <strong>{getServiceIngressUrl(formData.slug || "slug")}</strong>
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Resource Plan */}
        <div className="card">
          <div className="form-step-header">
            <div className="step-num-box">4</div>
            <div>
              <h2 className="card-title" style={{ fontSize: "1.05rem" }}>Resource Allocation & Compute Plan</h2>
              <p className="card-sub">Choose scale-to-zero free tier or dedicated capacity</p>
            </div>
          </div>

          <div className="form-fields-group">
            <div className="plan-mode-grid">
              {/* Free Tier Card */}
              <div
                onClick={() =>
                  setFormData({
                    ...formData,
                    autoSleep: true,
                    instanceType: "free",
                    cpuLimit: 0.1,
                    memoryLimit: 512,
                  })
                }
                className={`plan-mode-card ${formData.autoSleep ? "plan-mode-active-free" : ""}`}
              >
                <div className="plan-mode-top">
                  <div className="plan-mode-title">
                    <Moon size={18} color="#f59e0b" />
                    <span>Free Tier (Spin Down)</span>
                  </div>
                  {formData.autoSleep && <Check size={16} color="#f59e0b" />}
                </div>
                <p className="plan-mode-desc">
                  Auto-spins down after 15m inactivity. Wakes up instantly on next incoming request.
                </p>
                <div className="plan-tag tag-amber">
                  ⚡ 0.1 vCPU limit • 512 MB RAM
                </div>
              </div>

              {/* Dedicated Card */}
              <div
                onClick={() =>
                  setFormData({
                    ...formData,
                    autoSleep: false,
                    instanceType: "starter",
                    cpuLimit: 0.5,
                    memoryLimit: 512,
                  })
                }
                className={`plan-mode-card ${!formData.autoSleep ? "plan-mode-active-dedicated" : ""}`}
              >
                <div className="plan-mode-top">
                  <div className="plan-mode-title">
                    <Zap size={18} color="#10b981" />
                    <span>Always-On Dedicated</span>
                  </div>
                  {!formData.autoSleep && <Check size={16} color="#10b981" />}
                </div>
                <p className="plan-mode-desc">
                  Never sleeps. Zero cold boot delay. Ideal for websockets, background workers, and latency-sensitive APIs.
                </p>
                <div className="plan-tag tag-green">
                  🚀 Dedicated CPU cores • Custom RAM
                </div>
              </div>
            </div>

            {!formData.autoSleep && (
              <div className="dedicated-sub-grid">
                <label className="field-label" style={{ marginBottom: "0.5rem" }}>
                  Select Dedicated Compute Plan
                </label>
                <div className="dedicated-plans-selector">
                  {INSTANCE_PLANS.map(plan => {
                    const isSelected = formData.instanceType === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            instanceType: plan.id as any,
                            cpuLimit: plan.cpu,
                            memoryLimit: plan.memory,
                          })
                        }
                        className={`sub-plan-btn ${isSelected ? "sub-plan-selected" : ""}`}
                      >
                        <div className="sub-plan-name">
                          <span>{plan.name}</span>
                          {isSelected && <Check size={13} color="#10b981" />}
                        </div>
                        <span className="sub-plan-spec mono">{plan.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Step 5: Environment Variables */}
        <div className="card">
          <div className="form-step-header">
            <div className="step-num-box">5</div>
            <div>
              <h2 className="card-title" style={{ fontSize: "1.05rem" }}>Environment Variables (Optional)</h2>
              <p className="card-sub">Paste your .env configuration to securely inject at container boot</p>
            </div>
          </div>

          <div className="form-fields-group">
            <textarea
              className="input mono"
              rows={6}
              placeholder={"DATABASE_URL=postgresql://user:pass@host:5432/whizan\nJWT_SECRET=supersecret\nPORT=8000"}
              value={envText}
              onChange={e => setEnvText(e.target.value)}
              style={{ resize: "vertical", fontSize: "0.82rem" }}
            />
            <span className="field-hint">
              Variables are automatically encrypted before being persisted.
            </span>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="form-submit-row">
          <Link href="/dashboard/backend" className="btn btn-secondary btn-lg">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} className="spin-icon" /> Creating Container Service...
              </>
            ) : (
              <>
                Create Service <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </form>

      <style>{`
        .form-stack {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          margin-top: 1.5rem;
        }

        .form-step-header {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          margin-bottom: 1.25rem;
          padding-bottom: 0.85rem;
          border-bottom: 1px solid var(--card-border);
        }
        .step-num-box {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          background: var(--accent-gradient);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.85rem;
          flex-shrink: 0;
        }
        .card-sub {
          font-size: 0.8rem;
          color: var(--muted);
          margin-top: 0.15rem;
        }

        .form-fields-group {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .form-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .field-label {
          font-size: 0.78rem;
          font-weight: 650;
          color: var(--foreground);
        }
        .field-hint {
          font-size: 0.74rem;
          color: var(--muted);
          margin-top: 0.2rem;
        }

        .form-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .input-icon-wrap {
          position: relative;
        }
        .input-prefix-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--muted);
          pointer-events: none;
        }
        .with-prefix-icon {
          padding-left: 2.35rem;
        }

        .checkbox-card-wrap {
          justify-content: flex-end;
        }
        .checkbox-toggle-card {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          cursor: pointer;
        }
        .checkbox-toggle-card input {
          margin-top: 3px;
        }

        /* Plan Mode Cards */
        .plan-mode-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        .plan-mode-card {
          padding: 1.15rem;
          border-radius: 10px;
          border: 1px solid var(--card-border);
          background: var(--bg-inset);
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          flex-direction: column;
        }
        .plan-mode-card:hover {
          border-color: var(--muted-fg);
        }
        .plan-mode-active-free {
          border: 2px solid #f59e0b !important;
          background: rgba(245, 158, 11, 0.08) !important;
        }
        .plan-mode-active-dedicated {
          border: 2px solid #10b981 !important;
          background: rgba(16, 185, 129, 0.08) !important;
        }
        .plan-mode-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.45rem;
        }
        .plan-mode-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 700;
          font-size: 0.95rem;
          color: var(--foreground);
        }
        .plan-mode-desc {
          font-size: 0.78rem;
          color: var(--muted);
          line-height: 1.45;
          margin-bottom: 0.85rem;
          flex: 1;
        }
        .plan-tag {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.74rem;
          font-weight: 650;
          padding: 0.25rem 0.6rem;
          border-radius: 6px;
        }
        .tag-amber {
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .tag-green {
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .dedicated-sub-grid {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--card-border);
        }
        .dedicated-plans-selector {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 0.75rem;
        }
        .sub-plan-btn {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          padding: 0.75rem 0.9rem;
          border-radius: 8px;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .sub-plan-btn:hover {
          background: var(--card-hover);
        }
        .sub-plan-selected {
          border: 2px solid #10b981 !important;
          background: rgba(16, 185, 129, 0.1) !important;
        }
        .sub-plan-name {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          font-weight: 650;
          font-size: 0.88rem;
          color: var(--foreground);
          margin-bottom: 0.2rem;
        }
        .sub-plan-spec {
          font-size: 0.74rem;
          color: var(--muted);
        }

        .form-submit-row {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.75rem;
          margin-top: 1rem;
        }

        @media (max-width: 640px) {
          .form-grid-2,
          .plan-mode-grid {
            grid-template-columns: 1fr;
          }
          .form-submit-row {
            flex-direction: column;
            align-items: stretch;
          }
          .form-submit-row .btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
