"use client";
import { useState } from "react";
import { projects, type CreateProjectData } from "@/lib/api";
import { getProjectLiveUrl } from "@/lib/domains";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Terminal,
  FolderOpen,
  Globe,
  Loader2,
  Check,
  Sparkles,
  Zap,
  Github,
  Code2,
  CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import { WizardSteps } from "@/components/deploy-pipeline";
import { PageHeader } from "@/components/page-header";
import { GitHubRepoPicker, type SelectedRepoInfo } from "@/components/github-repo-picker";

const FRAMEWORKS = [
  { value: "NEXTJS", label: "Next.js", icon: "▲", desc: "SSR / SSG React framework" },
  { value: "REACT", label: "React (SPA)", icon: "⚛", desc: "Single page application" },
  { value: "VITE", label: "Vite", icon: "⚡", desc: "Ultra-fast frontend tooling" },
  { value: "ASTRO", label: "Astro", icon: "🚀", desc: "Content-driven web framework" },
  { value: "CUSTOM", label: "Custom / HTML", icon: "⚙", desc: "Custom build commands" },
];

const FRAMEWORK_DEFAULTS: Record<string, Partial<CreateProjectData>> = {
  NEXTJS: { buildCommand: "npm run build", installCommand: "npm install", outputDir: ".next" },
  REACT: { buildCommand: "npm run build", installCommand: "npm install", outputDir: "build" },
  VITE: { buildCommand: "npm run build", installCommand: "npm install", outputDir: "dist" },
  ASTRO: { buildCommand: "npm run build", installCommand: "npm install", outputDir: "dist" },
  CUSTOM: { buildCommand: "npm run build", installCommand: "npm install", outputDir: "dist" },
};

const STEPS = [
  { id: "service", label: "Overview", hint: "Hosting Details" },
  { id: "repo", label: "Source & Identity", hint: "Git repository" },
  { id: "build", label: "Framework & Build", hint: "Build settings" },
  { id: "review", label: "Review & Launch", hint: "Deploy pipeline" },
];

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CreateProjectData>({
    name: "",
    slug: "",
    githubRepoUrl: "",
    branch: "main",
    rootDir: ".",
    framework: "NEXTJS",
    buildCommand: "npm run build",
    installCommand: "npm install",
    outputDir: ".next",
  });

  function setField<K extends keyof CreateProjectData>(key: K, value: CreateProjectData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleNameChange(name: string) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setForm(prev => ({ ...prev, name, slug }));
  }

  function handleFrameworkChange(fw: string) {
    const defaults = FRAMEWORK_DEFAULTS[fw] || {};
    setForm(prev => ({ ...prev, framework: fw, ...defaults }));
  }

  function handleRepoSelect(info: SelectedRepoInfo) {
    const cloneUrl = info.cloneUrl || "";
    const name = info.name || "";
    const defaultBranch = info.defaultBranch || "main";

    setForm(prev => {
      const updatedName = prev.name ? prev.name : name;
      const updatedSlug = prev.slug ? prev.slug : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      
      let fw = prev.framework || "NEXTJS";
      if (name.toLowerCase().includes("vite")) fw = "VITE";
      else if (name.toLowerCase().includes("astro")) fw = "ASTRO";

      const fwDefaults = (fw && FRAMEWORK_DEFAULTS[fw]) || {};

      return {
        ...prev,
        githubRepoUrl: cloneUrl,
        branch: defaultBranch,
        name: updatedName,
        slug: updatedSlug,
        framework: fw,
        ...fwDefaults,
      };
    });

    toast.success(`Selected repository: ${info.fullName || info.name}`);
  }

  function canContinue() {
    if (step === 1) return Boolean(form.name && form.slug && form.githubRepoUrl);
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step < 3) {
      if (!canContinue()) {
        toast.error("Please fill in project name, slug, and select a GitHub repository URL");
        return;
      }
      setStep(s => s + 1);
      return;
    }
    setLoading(true);
    try {
      const project = await projects.create(form);
      toast.success("Project created — initiating deployment!");
      router.push(`/dashboard/projects/${project.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 920 }}>
      <Link href="/dashboard/hosting" className="breadcrumb">
        <ArrowLeft size={15} /> Back to Frontend Hosting
      </Link>

      <PageHeader
        title="Deploy New Web Application"
        subtitle="Connect public or private GitHub repositories to automatically build, route, and publish across edge servers with SSL."
      />

      <div style={{ marginBottom: "2.5rem", marginTop: "1rem" }}>
        <WizardSteps steps={STEPS} current={step} />
      </div>

      <form onSubmit={handleSubmit} className="form-stack">
        {step === 0 && (
          <div className="card hero-card-glow">
            <div className="wizard-step-header">
              <div className="wizard-icon-box">
                <Globe size={22} className="text-accent" />
              </div>
              <div>
                <h2 className="card-title">Edge Web Application Hosting</h2>
                <p className="card-sub">
                  Full automatic deployment pipeline with isolated builder environments and global edge routing.
                </p>
              </div>
            </div>

            <div className="wizard-intro-box">
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Sparkles size={16} className="text-accent" /> What happens when you deploy
              </h3>
              <div className="features-grid">
                <div className="feature-step-card">
                  <div className="feature-step-num">1</div>
                  <div className="feature-step-content">
                    <strong>Secure Repository Sync</strong>
                    <p>Whizan securely clones your code (public or authenticated private repo) into an isolated ephemeral sandbox.</p>
                  </div>
                </div>

                <div className="feature-step-card">
                  <div className="feature-step-num">2</div>
                  <div className="feature-step-content">
                    <strong>Containerized Build Engine</strong>
                    <p>Dependencies are installed and production bundles (Next.js, Vite, React, Astro) are built with speed optimization.</p>
                  </div>
                </div>

                <div className="feature-step-card">
                  <div className="feature-step-num">3</div>
                  <div className="feature-step-content">
                    <strong>Global Ingress Routing</strong>
                    <p>Static assets or SSR processes are linked instantly with wildcard SSL certificates and edge CDN caching.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <>
            {/* GitHub Repository Picker */}
            <div className="card">
              <div className="wizard-step-header">
                <div className="wizard-icon-box">
                  <Github size={22} className="text-accent" />
                </div>
                <div>
                  <h2 className="card-title">1. Connect GitHub Repository</h2>
                  <p className="card-sub">Choose from your connected public & private repositories or enter a Git URL manually</p>
                </div>
              </div>

              <GitHubRepoPicker
                onSelectRepo={handleRepoSelect}
                selectedUrl={form.githubRepoUrl}
                selectedBranch={form.branch}
                onBranchChange={branch => setField("branch", branch)}
              />

              <div className="form-fields-group" style={{ marginTop: "1.25rem" }}>
                <div className="form-field">
                  <label className="field-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Root Directory / Project Path</span>
                    <span style={{ fontSize: "0.72rem", background: "rgba(56, 189, 248, 0.1)", color: "var(--accent)", padding: "0.15rem 0.45rem", borderRadius: "4px" }}>
                      Monorepo / Subfolder
                    </span>
                  </label>
                  <input
                    type="text"
                    className="input mono"
                    placeholder="./ (or frontend, client, apps/web)"
                    value={form.rootDir || ""}
                    onChange={e => setField("rootDir", e.target.value)}
                  />
                  <span className="field-hint">
                    Leave as <code>.</code> if your frontend project is located at the root of the repository, or specify the subfolder path (e.g. <code>frontend</code> or <code>client</code>) if located in a monorepo.
                  </span>
                </div>
              </div>
            </div>

            {/* Project Identity */}
            <div className="card">
              <div className="wizard-step-header">
                <div className="wizard-icon-box">
                  <FolderOpen size={20} className="text-accent" />
                </div>
                <div>
                  <h2 className="card-title">2. Project Identity & Subdomain</h2>
                  <p className="card-sub">Choose a human-readable display name and unique edge subdomain slug</p>
                </div>
              </div>

              <div className="form-fields-group">
                <div className="form-grid-2">
                  <div className="form-field">
                    <label className="field-label">Project Display Name *</label>
                    <input
                      id="project-name"
                      className="input"
                      placeholder="e.g. Acme Dashboard"
                      value={form.name}
                      onChange={e => handleNameChange(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label className="field-label">Edge Subdomain Slug *</label>
                    <input
                      id="project-slug"
                      className="input mono"
                      placeholder="acme-dashboard"
                      value={form.slug}
                      onChange={e => setField("slug", e.target.value)}
                      required
                      pattern="[-a-z0-9]+"
                    />
                    <span className="field-hint">
                      Production Live URL: <strong className="mono text-accent">{getProjectLiveUrl(form.slug || "slug")}</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="card">
            <div className="wizard-step-header">
              <div className="wizard-icon-box">
                <Terminal size={20} className="text-accent" />
              </div>
              <div>
                <h2 className="card-title">Framework & Build Configuration</h2>
                <p className="card-sub">Select your framework preset or customize install and output directory options</p>
              </div>
            </div>

            <div className="form-fields-group">
              <label className="field-label">Framework Preset</label>
              <div className="framework-selector-grid">
                {FRAMEWORKS.map(fw => {
                  const isSelected = form.framework === fw.value;
                  return (
                    <button
                      key={fw.value}
                      type="button"
                      onClick={() => handleFrameworkChange(fw.value)}
                      className={`framework-card-btn ${isSelected ? "framework-selected" : ""}`}
                    >
                      <div className="framework-top">
                        <span className="framework-icon">{fw.icon}</span>
                        <span className="framework-name">{fw.label}</span>
                        {isSelected && <Check size={14} className="text-accent" />}
                      </div>
                      <span className="framework-desc">{fw.desc}</span>
                    </button>
                  );
                })}
              </div>

              <div className="form-grid-2" style={{ marginTop: "1rem" }}>
                <div className="form-field">
                  <label className="field-label">Root Directory</label>
                  <input
                    className="input mono"
                    placeholder="."
                    value={form.rootDir || "."}
                    onChange={e => setField("rootDir", e.target.value)}
                  />
                  <span className="field-hint">e.g. . or frontend or client</span>
                </div>
                <div className="form-field">
                  <label className="field-label">Output Directory</label>
                  <input
                    className="input mono"
                    value={form.outputDir}
                    onChange={e => setField("outputDir", e.target.value)}
                  />
                  <span className="field-hint">e.g. .next for Next.js, dist for Vite, build for React SPA</span>
                </div>
              </div>

              <div className="form-grid-2" style={{ marginTop: "0.75rem" }}>
                <div className="form-field">
                  <label className="field-label">Install Command</label>
                  <input
                    className="input mono"
                    value={form.installCommand}
                    onChange={e => setField("installCommand", e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label className="field-label">Build Command</label>
                  <input
                    className="input mono"
                    value={form.buildCommand}
                    onChange={e => setField("buildCommand", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="card">
            <div className="wizard-step-header">
              <div className="wizard-icon-box">
                <Sparkles size={20} className="text-accent" />
              </div>
              <div>
                <h2 className="card-title">Review & Deploy</h2>
                <p className="card-sub">Double-check your deployment configuration before launching the build queue</p>
              </div>
            </div>

            <div className="review-summary-table">
              <div className="review-row">
                <span className="review-label">Project Name</span>
                <span className="review-value">{form.name}</span>
              </div>
              <div className="review-row">
                <span className="review-label">Subdomain Slug</span>
                <span className="review-value mono">/{form.slug}</span>
              </div>
              <div className="review-row">
                <span className="review-label">Production URL</span>
                <span className="review-value mono text-accent" style={{ fontWeight: 700 }}>
                  {getProjectLiveUrl(form.slug || "slug")}
                </span>
              </div>
              <div className="review-row">
                <span className="review-label">Repository</span>
                <span className="review-value mono">{form.githubRepoUrl}</span>
              </div>
              <div className="review-row">
                <span className="review-label">Target Branch</span>
                <span className="review-value mono">{form.branch}</span>
              </div>
              <div className="review-row">
                <span className="review-label">Root Directory</span>
                <span className="review-value mono">{form.rootDir || "."}</span>
              </div>
              <div className="review-row">
                <span className="review-label">Framework Preset</span>
                <span className="review-value">{form.framework}</span>
              </div>
              <div className="review-row">
                <span className="review-label">Install Command</span>
                <span className="review-value mono">{form.installCommand}</span>
              </div>
              <div className="review-row">
                <span className="review-label">Build Command</span>
                <span className="review-value mono">{form.buildCommand}</span>
              </div>
              <div className="review-row">
                <span className="review-label">Output Directory</span>
                <span className="review-value mono">{form.outputDir}</span>
              </div>
            </div>

            <div className="review-notice">
              <CheckCircle2 size={16} className="text-accent" />
              <span>Clicking <strong>Deploy Application</strong> will queue an automated build and stream real-time logs.</span>
            </div>
          </div>
        )}

        {/* Wizard Navigation */}
        <div className="wizard-nav-row">
          {step > 0 ? (
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              onClick={() => setStep(s => s - 1)}
            >
              <ArrowLeft size={16} /> Back
            </button>
          ) : (
            <Link href="/dashboard/hosting" className="btn btn-secondary btn-lg">
              Cancel
            </Link>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading || (step === 1 && !canContinue())}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spin-icon" /> Deploying...
              </>
            ) : step < 3 ? (
              <>
                Continue <ArrowRight size={16} />
              </>
            ) : (
              <>
                Deploy Application <Zap size={16} />
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
        }

        .hero-card-glow {
          border: 1px solid rgba(99, 102, 241, 0.3);
          background: radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.05) 0%, transparent 80%), var(--card-bg);
        }

        .wizard-step-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.25rem;
          padding-bottom: 0.85rem;
          border-bottom: 1px solid var(--card-border);
        }
        .wizard-icon-box {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .wizard-intro-box {
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: 10px;
          padding: 1.25rem 1.5rem;
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 1rem;
          margin-top: 0.75rem;
        }
        .feature-step-card {
          display: flex;
          gap: 0.75rem;
          background: var(--card-bg);
          padding: 0.85rem;
          border-radius: 8px;
          border: 1px solid var(--card-border);
        }
        .feature-step-num {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--accent);
          color: white;
          font-weight: 700;
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .feature-step-content strong {
          display: block;
          font-size: 0.84rem;
          color: var(--foreground);
          margin-bottom: 0.2rem;
        }
        .feature-step-content p {
          font-size: 0.76rem;
          color: var(--muted);
          line-height: 1.4;
          margin: 0;
        }

        .form-fields-group {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .form-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
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

        /* Framework Selector */
        .framework-selector-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 0.75rem;
        }
        .framework-card-btn {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          padding: 0.85rem;
          border-radius: 8px;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
        }
        .framework-card-btn:hover {
          background: var(--card-hover);
        }
        .framework-selected {
          border: 2px solid var(--accent) !important;
          background: rgba(99, 102, 241, 0.08) !important;
        }
        .framework-top {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          width: 100%;
          margin-bottom: 0.35rem;
        }
        .framework-icon {
          font-size: 1rem;
        }
        .framework-name {
          font-weight: 650;
          font-size: 0.88rem;
          color: var(--foreground);
          flex: 1;
        }
        .framework-desc {
          font-size: 0.72rem;
          color: var(--muted);
          line-height: 1.35;
        }

        /* Review Summary */
        .review-summary-table {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--card-border);
          border-radius: 8px;
          overflow: hidden;
        }
        .review-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--card-border);
          background: var(--bg-inset);
          font-size: 0.825rem;
        }
        .review-row:last-child {
          border-bottom: none;
        }
        .review-label {
          color: var(--muted);
          font-weight: 550;
        }
        .review-value {
          color: var(--foreground);
          font-weight: 600;
        }
        .review-notice {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 1rem;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          background: rgba(99, 102, 241, 0.08);
          border: 1px solid rgba(99, 102, 241, 0.2);
          font-size: 0.8rem;
          color: var(--foreground);
        }

        .wizard-nav-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 1rem;
        }

        @media (max-width: 640px) {
          .form-grid-2 {
            grid-template-columns: 1fr;
          }
          .wizard-nav-row {
            flex-direction: column;
            gap: 0.75rem;
          }
          .wizard-nav-row .btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
