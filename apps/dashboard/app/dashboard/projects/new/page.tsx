"use client";
import { useState } from "react";
import { projects, type CreateProjectData } from "@/lib/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  GitBranch,
  Terminal,
  FolderOpen,
  Globe,
  Loader2,
  Check,
  Layers,
  Sparkles,
  Zap,
  Github
} from "lucide-react";
import { toast } from "sonner";
import { WizardSteps } from "@/components/deploy-pipeline";
import { PageHeader } from "@/components/page-header";

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
  { id: "service", label: "Service", hint: "Confirm Hosting" },
  { id: "repo", label: "Repository", hint: "Git source & name" },
  { id: "build", label: "Build", hint: "Commands & output" },
  { id: "review", label: "Review", hint: "Launch pipeline" },
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

  function canContinue() {
    if (step === 1) return Boolean(form.name && form.slug && form.githubRepoUrl);
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step < 3) {
      if (!canContinue()) {
        toast.error("Please fill project name, slug, and GitHub URL");
        return;
      }
      setStep(s => s + 1);
      return;
    }
    setLoading(true);
    try {
      const project = await projects.create(form);
      toast.success("Project created — streaming deploy pipeline");
      router.push(`/dashboard/projects/${project.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <Link href="/dashboard/hosting" className="breadcrumb">
        <ArrowLeft size={15} /> Back to Frontend Hosting
      </Link>

      <PageHeader
        title="Deploy New Frontend App"
        subtitle="Follow four simple steps to connect your repository and publish your web app across edge servers."
      />

      <div style={{ marginBottom: "2rem" }}>
        <WizardSteps steps={STEPS} current={step} />
      </div>

      <form onSubmit={handleSubmit} className="form-stack">
        {step === 0 && (
          <div className="card">
            <div className="wizard-step-header">
              <div className="wizard-icon-box">
                <Globe size={22} className="text-accent" />
              </div>
              <div>
                <h2 className="card-title">Frontend Edge Hosting Service</h2>
                <p className="card-sub">
                  Clones your repository, executes dependencies install & build, and attaches edge SSL routing.
                </p>
              </div>
            </div>

            <div className="wizard-intro-box">
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.5rem" }}>
                What happens during deployment
              </h3>
              <ol className="wizard-steps-list">
                <li>Whizan clones your branch from GitHub into an isolated builder container.</li>
                <li>Dependencies are automatically installed and the production build script executes.</li>
                <li>Static output assets or SSR server is published to edge proxy with instant wildcard SSL.</li>
              </ol>
            </div>
          </div>
        )}

        {step === 1 && (
          <>
            <div className="card">
              <div className="wizard-step-header">
                <div className="wizard-icon-box">
                  <FolderOpen size={20} className="text-accent" />
                </div>
                <div>
                  <h2 className="card-title">Project Identity</h2>
                  <p className="card-sub">Choose a unique project name and edge subdomain slug</p>
                </div>
              </div>

              <div className="form-fields-group">
                <div className="form-grid-2">
                  <div className="form-field">
                    <label className="field-label">Project Name *</label>
                    <input
                      id="project-name"
                      className="input"
                      placeholder="ecommerce-storefront"
                      value={form.name}
                      onChange={e => handleNameChange(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label className="field-label">Subdomain Slug *</label>
                    <input
                      id="project-slug"
                      className="input mono"
                      placeholder="ecommerce-storefront"
                      value={form.slug}
                      onChange={e => setField("slug", e.target.value)}
                      required
                      pattern="[-a-z0-9]+"
                    />
                    <span className="field-hint">
                      Live URL: <strong className="mono">{form.slug || "slug"}.20.2.136.11.nip.io</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="wizard-step-header">
                <div className="wizard-icon-box">
                  <Github size={20} className="text-accent" />
                </div>
                <div>
                  <h2 className="card-title">GitHub Repository</h2>
                  <p className="card-sub">Paste the repository Whizan should clone and deploy</p>
                </div>
              </div>

              <div className="form-fields-group">
                <div className="form-grid-2">
                  <div className="form-field">
                    <label className="field-label">GitHub Repository URL *</label>
                    <input
                      id="repo-url"
                      className="input"
                      placeholder="https://github.com/username/storefront"
                      value={form.githubRepoUrl}
                      onChange={e => setField("githubRepoUrl", e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label className="field-label">Deploy Branch *</label>
                    <input
                      id="repo-branch"
                      className="input mono"
                      value={form.branch}
                      onChange={e => setField("branch", e.target.value)}
                      required
                    />
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
                <p className="card-sub">Select your framework preset or customize install and build commands</p>
              </div>
            </div>

            <div className="form-fields-group">
              <label className="field-label">Select Framework Preset</label>
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

              <div className="form-field">
                <label className="field-label">Output Directory</label>
                <input
                  className="input mono"
                  value={form.outputDir}
                  onChange={e => setField("outputDir", e.target.value)}
                />
                <span className="field-hint">e.g. .next for Next.js, dist for Vite, build for React</span>
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
                <h2 className="card-title">Review & Launch Deployment</h2>
                <p className="card-sub">Confirm details before queuing the first build</p>
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
                <span className="review-value mono text-accent">
                  http://{form.slug}.20.2.136.11.nip.io
                </span>
              </div>
              <div className="review-row">
                <span className="review-label">Repository</span>
                <span className="review-value mono">{form.githubRepoUrl}</span>
              </div>
              <div className="review-row">
                <span className="review-label">Branch</span>
                <span className="review-value mono">{form.branch}</span>
              </div>
              <div className="review-row">
                <span className="review-label">Framework</span>
                <span className="review-value">{form.framework}</span>
              </div>
              <div className="review-row">
                <span className="review-label">Build Command</span>
                <span className="review-value mono">{form.buildCommand}</span>
              </div>
            </div>
          </div>
        )}

        {/* Wizard Controls */}
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
            disabled={loading}
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
        .wizard-steps-list {
          margin-left: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          font-size: 0.84rem;
          color: var(--muted);
          line-height: 1.5;
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
