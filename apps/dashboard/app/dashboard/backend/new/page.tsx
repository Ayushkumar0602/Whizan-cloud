"use client";
import { useState, useEffect } from "react";
import { services, type AiAnalysisResponse } from "@/lib/api";
import { getServiceIngressUrl } from "@/lib/domains";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { GitHubRepoPicker, type SelectedRepoInfo } from "@/components/github-repo-picker";
import { useAuth } from "@/lib/auth";
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
  Code,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Info,
  Layers,
  Workflow
} from "lucide-react";

const INSTANCE_PLANS = [
  { id: "starter", name: "Starter", cpu: 0.5, memory: 512, desc: "0.5 vCPU • 512 MB" },
  { id: "standard", name: "Standard", cpu: 1.0, memory: 1024, desc: "1.0 vCPU • 1 GB" },
  { id: "pro", name: "Pro", cpu: 2.0, memory: 2048, desc: "2.0 vCPU • 2 GB" },
  { id: "pro_plus", name: "Pro Plus", cpu: 4.0, memory: 4096, desc: "4.0 vCPU • 4 GB" },
];

export default function NewServicePage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin =
    user?.role === "ADMIN" ||
    user?.role === "ROOT_ADMIN" ||
    user?.email === "aj0892829122@gmail.com";
  const canCustomizeTier = isAdmin || user?.subscriptionTier === "PROFESSIONAL";
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [envText, setEnvText] = useState("");
  
  // AI analysis state
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysisResponse["analysis"] | null>(null);
  const [guardrailRefused, setGuardrailRefused] = useState(false);
  const [refusalReason, setRefusalReason] = useState<string | null>(null);
  const [mandatoryEnvs, setMandatoryEnvs] = useState<Array<{ name: string; description: string; example?: string; required: boolean }>>([]);
  const [mandatoryInputs, setMandatoryInputs] = useState<Record<string, string>>({});

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
    isWorker: false,
    isPublic: false,
    autoSleep: true,
    instanceType: "free" as "free" | "starter" | "standard" | "pro" | "pro_plus",
    cpuLimit: 0.1,
    memoryLimit: 512,
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const repoParam = params.get("repo");
      if (repoParam) {
        const repoName = repoParam.split("/").pop()?.replace(".git", "") || "";
        setFormData(prev => ({
          ...prev,
          githubRepoUrl: repoParam,
          name: prev.name || repoName,
          slug: prev.slug || repoName.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        }));
      }
    }
  }, []);

  const handleRunAiAnalysis = async (urlToAnalyze?: string, branchToAnalyze?: string) => {
    const repoUrl = urlToAnalyze || formData.githubRepoUrl;
    const branchName = branchToAnalyze || formData.branch || "main";

    if (!repoUrl) {
      toast.error("Please enter or select a repository to analyze");
      return;
    }

    setAnalyzing(true);
    setGuardrailRefused(false);
    setRefusalReason(null);

    try {
      toast.info("Inspecting repository configuration...", { duration: 2500 });
      const res = await services.analyze({
        githubRepoUrl: repoUrl,
        branch: branchName,
      });

      if (!res.success || !res.analysis) {
        throw new Error("Repository analysis failed");
      }

      const { analysis } = res;

      // 1. Guardrail Check
      if (!analysis.isDeployable) {
        setGuardrailRefused(true);
        setRefusalReason(analysis.rejectionReason || "This project is not supported by Whizan Cloud.");
        setAiAnalysis(analysis);
        toast.error("Deployment guardrail: Repository cannot be deployed.");
        return;
      }

      // 2. Guardrail Passed: Auto-fill stack, commands, port
      setGuardrailRefused(false);
      setRefusalReason(null);
      setAiAnalysis(analysis);

      setFormData(prev => ({
        ...prev,
        language: analysis.language,
        installCommand: analysis.installCommand || prev.installCommand,
        startCommand: analysis.startCommand || prev.startCommand,
        internalPort: analysis.recommendedPort !== undefined ? analysis.recommendedPort : prev.internalPort,
        isWorker: Boolean(analysis.isWorker),
      }));

      // 3. Populate mandatory environment variables
      if (analysis.requiredEnvVars && analysis.requiredEnvVars.length > 0) {
        setMandatoryEnvs(analysis.requiredEnvVars);
        const initialInputs: Record<string, string> = {};
        analysis.requiredEnvVars.forEach(v => {
          initialInputs[v.name] = v.example || "";
        });
        setMandatoryInputs(initialInputs);

        const newTemplate = analysis.requiredEnvVars
          .map(v => `${v.name}=${v.example || ""}`)
          .join("\n");
        setEnvText(prev => {
          if (!prev.trim()) return newTemplate;
          const existingKeys = new Set(prev.split("\n").map(l => l.split("=")[0].trim()));
          const toAdd = analysis.requiredEnvVars.filter(v => !existingKeys.has(v.name));
          if (toAdd.length === 0) return prev;
          return prev + "\n" + toAdd.map(v => `${v.name}=${v.example || ""}`).join("\n");
        });
      }

      toast.success(`Detected ${analysis.stack} (${analysis.framework})`);
    } catch (err: any) {
      toast.error(err.message || "Failed to analyze repository");
    } finally {
      setAnalyzing(false);
    }
  };

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

  const handleMandatoryInputChange = (key: string, val: string) => {
    setMandatoryInputs(prev => {
      const updated = { ...prev, [key]: val };
      // Update envText dynamically
      const lines = envText.split("\n").filter(Boolean);
      let found = false;
      const newLines = lines.map(line => {
        if (line.startsWith(`${key}=`)) {
          found = true;
          return `${key}=${val}`;
        }
        return line;
      });
      if (!found) {
        newLines.push(`${key}=${val}`);
      }
      setEnvText(newLines.join("\n"));
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.githubRepoUrl) {
      toast.error("Please select or enter a GitHub repository URL");
      return;
    }

    if (guardrailRefused) {
      toast.error(`Cannot deploy: ${refusalReason || "Blocked by Whizan System Guardrail"}`);
      return;
    }

    setLoading(true);
    try {
      const service = await services.create({
        ...formData,
        internalPort: formData.isWorker ? 0 : Number(formData.internalPort) || 8000,
      });

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
    <div className="page" style={{ maxWidth: 880 }}>
      <Link href="/dashboard/backend" className="breadcrumb">
        <ArrowLeft size={15} /> Back to Backend Services
      </Link>

      <PageHeader
        title="Deploy a Backend Service"
        subtitle="Connect any Git repository to automatically build, isolate, and host your Node.js, Python, Go, Rust, Java, or Docker API on Whizan Cloud."
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

          {/* Optional Configuration Auto-detection */}
          <div style={{ marginTop: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", padding: "0.75rem 1rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-inset)" }}>
            <div>
              <div style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--foreground)" }}>
                Auto-detect build &amp; start configuration
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                Optional: inspect repository files to detect framework, start command, and port.
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleRunAiAnalysis()}
              disabled={analyzing || !formData.githubRepoUrl}
              className="btn btn-secondary btn-sm"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              {analyzing ? (
                <>
                  <Loader2 size={13} className="spin-icon" />
                  <span>Detecting...</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} className="text-accent" />
                  <span>Detect Settings</span>
                </>
              )}
            </button>
          </div>

          {/* System Guardrail Refusal Alert */}
          {guardrailRefused && (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.85rem 1rem",
                borderRadius: "var(--radius-sm)",
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.65rem" }}>
                <ShieldAlert size={18} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "#f87171" }}>
                    Deployment Not Supported
                  </div>
                  <div style={{ fontSize: "0.82rem", marginTop: "0.25rem", lineHeight: 1.45, color: "#fecaca" }}>
                    {refusalReason}
                  </div>
                  <div style={{ fontSize: "0.75rem", marginTop: "0.4rem", color: "var(--muted)" }}>
                    Whizan Cloud exclusively hosts web services, backend APIs, and background queue workers. Desktop applications, native mobile apps, and one-shot scripts are not supported.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Auto-detected Configuration Summary */}
          {aiAnalysis && !guardrailRefused && (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.85rem 1rem",
                borderRadius: "var(--radius-sm)",
                background: "rgba(16, 185, 129, 0.06)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.65rem" }}>
                <ShieldCheck size={18} style={{ color: "#10b981", flexShrink: 0, marginTop: "2px" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#10b981" }}>
                      Detected: {aiAnalysis.stack} ({aiAnalysis.framework})
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "var(--font-geist-mono), monospace" }}>
                      {aiAnalysis.isWorker ? "Worker Process" : `Port ${aiAnalysis.recommendedPort}`}
                    </span>
                  </div>
                  {aiAnalysis.explanation && (
                    <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: "0.25rem", lineHeight: 1.4 }}>
                      {aiAnalysis.explanation}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="form-fields-group" style={{ marginTop: "1rem" }}>
            <div className="form-field">
              <label className="field-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Root Directory (Optional)</span>
                <span style={{ fontSize: "0.72rem", background: "rgba(56, 189, 248, 0.1)", color: "var(--accent)", padding: "0.15rem 0.45rem", borderRadius: "4px" }}>
                  Monorepo / Subfolder
                </span>
              </label>
              <input
                type="text"
                placeholder="./ or api/"
                className="input mono"
                value={formData.rootDir}
                onChange={e => setFormData({ ...formData, rootDir: e.target.value })}
              />
              <span className="field-hint">
                Leave as <code>.</code> if your service code is at the repository root. Only enter a subfolder if situated in a monorepo.
              </span>
            </div>
          </div>
        </div>

        {/* Step 2: Service Identity */}
        <div className="card">
          <div className="form-step-header">
            <div className="step-num-box">2</div>
            <div>
              <h2 className="card-title" style={{ fontSize: "1.05rem" }}>Service Identity & Runtime Stack</h2>
              <p className="card-sub">Stack-independent execution (Node.js, Python, Go, Rust, Java, Dockerfile)</p>
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
              <label className="field-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Language & Runtime Stack</span>
                <span style={{ fontSize: "0.72rem", background: "rgba(16, 185, 129, 0.1)", color: "#10b981", padding: "0.15rem 0.5rem", borderRadius: "4px" }}>
                  Zero-Docker Auto Synthesized
                </span>
              </label>
              <select
                className="input"
                value={formData.language}
                onChange={e => {
                  const lang = e.target.value;
                  let install = "npm install";
                  let start = "npm start";
                  let port = 8000;
                  if (lang === "PYTHON") {
                    install = "pip install -r requirements.txt";
                    start = "python main.py";
                    port = 8000;
                  } else if (lang === "GO") {
                    install = "go mod download";
                    start = "go run main.go";
                    port = 8080;
                  } else if (lang === "RUST") {
                    install = "";
                    start = "";
                    port = 8080;
                  } else if (lang === "JAVA") {
                    install = "";
                    start = "";
                    port = 8080;
                  } else if (lang === "PHP") {
                    install = "composer install";
                    start = "";
                    port = 8000;
                  } else if (lang === "RUBY") {
                    install = "bundle install";
                    start = "";
                    port = 8000;
                  } else if (lang === "DOTNET") {
                    install = "dotnet restore";
                    start = "";
                    port = 8080;
                  } else if (lang === "DOCKERFILE") {
                    install = "";
                    start = "";
                    port = 8000;
                  }
                  setFormData({
                    ...formData,
                    language: lang,
                    installCommand: install,
                    startCommand: start,
                    internalPort: port,
                  });
                }}
              >
                <option value="NODEJS">Node.js (Express, NestJS, Fastify, TypeScript)</option>
                <option value="PYTHON">Python (FastAPI, Flask, Django, Celery)</option>
                <option value="GO">Go (Gin, Fiber, Echo, net/http)</option>
                <option value="RUST">Rust (Cargo, Actix, Axum)</option>
                <option value="JAVA">Java / Kotlin (Spring Boot, Maven, Gradle)</option>
                <option value="PHP">PHP / Laravel (Composer, Artisan)</option>
                <option value="RUBY">Ruby on Rails (Bundler, Puma, Rack)</option>
                <option value="DOTNET">.NET 8 (C# / ASP.NET Core)</option>
                <option value="DOCKERFILE">Custom Dockerfile (Optional)</option>
              </select>
              <span className="field-hint">
                Whizan Cloud automatically detects your framework, installs dependencies, and synthesizes a high-performance production container. No Dockerfile required.
              </span>
            </div>
          </div>
        </div>

        {/* Step 3: Commands & Networking */}
        <div className="card">
          <div className="form-step-header">
            <div className="step-num-box">3</div>
            <div>
              <h2 className="card-title" style={{ fontSize: "1.05rem" }}>Build Commands & Networking</h2>
              <p className="card-sub">Fine-tune dependency installation, start command, and port binding</p>
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
                  placeholder={formData.language === "DOCKERFILE" ? "Handled by Dockerfile" : "npm install"}
                />
              </div>
              <div className="form-field">
                <label className="field-label">Start Command</label>
                <input
                  type="text"
                  className="input mono"
                  value={formData.startCommand}
                  onChange={e => setFormData({ ...formData, startCommand: e.target.value })}
                  placeholder={
                    formData.language === "DOCKERFILE"
                      ? "Leave blank to use Docker CMD"
                      : formData.language === "PHP"
                      ? "Auto-detected (artisan or php -S) - Leave blank"
                      : formData.language === "RUBY"
                      ? "Auto-detected (Rails, Rackup, Sinatra, Puma) - Leave blank"
                      : formData.language === "JAVA" || formData.language === "RUST" || formData.language === "DOTNET"
                      ? "Auto-detected from manifest - Leave blank"
                      : "npm start"
                  }
                />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-field">
                <label className="field-label">Internal Port (Container Bind) *</label>
                <input
                  type="number"
                  required
                  disabled={formData.isWorker}
                  className="input mono"
                  value={formData.isWorker ? 0 : formData.internalPort}
                  onChange={e => setFormData({ ...formData, internalPort: parseInt(e.target.value) || 8000 })}
                />
                <span className="field-hint">
                  {formData.isWorker ? "Worker process has no listening HTTP port." : "Port app listens on (ensure code binds to 0.0.0.0)."}
                </span>
              </div>

              <div className="form-field" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", justifyContent: "center" }}>
                {/* Background Worker Checkbox */}
                <label className="checkbox-toggle-card" style={{ padding: "0.75rem 1rem" }}>
                  <input
                    type="checkbox"
                    checked={formData.isWorker}
                    onChange={e => {
                      const isWorker = e.target.checked;
                      setFormData({
                        ...formData,
                        isWorker,
                        internalPort: isWorker ? 0 : 8000,
                        isPublic: isWorker ? false : formData.isPublic,
                      });
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--foreground)" }}>
                      Background Queue Worker (No HTTP Port)
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "2px" }}>
                      Monitors continuous process liveness (Celery, BullMQ, Kafka consumers)
                    </div>
                  </div>
                </label>

                {!formData.isWorker && (
                  <label className="checkbox-toggle-card" style={{ padding: "0.75rem 1rem" }}>
                    <input
                      type="checkbox"
                      checked={formData.isPublic}
                      onChange={e => setFormData({ ...formData, isPublic: e.target.checked })}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--foreground)" }}>
                        Expose to Public Internet
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "2px" }}>
                        Routes traffic at <strong>{getServiceIngressUrl(formData.slug || "slug")}</strong>
                      </div>
                    </div>
                  </label>
                )}
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
                onClick={() => {
                  if (!canCustomizeTier) {
                    toast.info(
                      "Portfolio Forced-Idleness: Always-On dedicated compute requires Professional tier or administrator authorization. Deployments run on the Auto-Sleep Free Tier (0.1 vCPU / 512MB RAM with 15m idle spin-down)."
                    );
                    return;
                  }
                  setFormData({
                    ...formData,
                    autoSleep: false,
                    instanceType: "starter",
                    cpuLimit: 0.5,
                    memoryLimit: 512,
                  });
                }}
                className={`plan-mode-card ${!formData.autoSleep ? "plan-mode-active-dedicated" : ""}`}
                style={!canCustomizeTier ? { opacity: 0.65, cursor: "not-allowed" } : {}}
              >
                <div className="plan-mode-top">
                  <div className="plan-mode-title">
                    <Zap size={18} color={canCustomizeTier ? "#10b981" : "#94a3b8"} />
                    <span>Always-On Dedicated</span>
                    {!canCustomizeTier && (
                      <span
                        style={{
                          fontSize: "0.68rem",
                          background: "rgba(245, 158, 11, 0.15)",
                          color: "#d97706",
                          border: "1px solid rgba(245, 158, 11, 0.3)",
                          padding: "1px 6px",
                          borderRadius: "999px",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px",
                          marginLeft: "6px",
                        }}
                      >
                        <Lock size={10} /> Pro / Admin Only
                      </span>
                    )}
                  </div>
                  {!formData.autoSleep && canCustomizeTier && <Check size={16} color="#10b981" />}
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
              <h2 className="card-title" style={{ fontSize: "1.05rem" }}>Environment Variables</h2>
              <p className="card-sub">Configure required secrets and runtime variables (AES-256 encrypted)</p>
            </div>
          </div>

          {/* Detected Environment Variables */}
          {mandatoryEnvs.length > 0 && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "0.85rem 1rem",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-inset)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.84rem", color: "var(--foreground)" }}>
                  Detected Environment Variables
                </span>
                <span style={{ fontSize: "0.7rem", color: "var(--muted)", background: "var(--card)", padding: "0.15rem 0.45rem", borderRadius: "4px", border: "1px solid var(--border)" }}>
                  {mandatoryEnvs.length} found in repository
                </span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.85rem" }}>
                Values entered here automatically synchronize with the environment configuration below.
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {mandatoryEnvs.map(env => (
                  <div key={env.name} style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <label className="mono" style={{ fontWeight: 600, fontSize: "0.8rem", color: "var(--foreground)" }}>
                        {env.name}
                      </label>
                      <span style={{ fontSize: "0.68rem", color: "var(--muted)", background: "var(--card)", padding: "0.1rem 0.35rem", borderRadius: "4px" }}>
                        Required
                      </span>
                    </div>
                    {env.description && (
                      <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                        {env.description}
                      </span>
                    )}
                    <input
                      type="text"
                      className="input mono"
                      style={{ fontSize: "0.8rem", padding: "0.45rem 0.75rem" }}
                      placeholder={env.example ? `Example: ${env.example}` : `Enter value for ${env.name}`}
                      value={mandatoryInputs[env.name] || ""}
                      onChange={e => handleMandatoryInputChange(env.name, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

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
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading || guardrailRefused}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spin-icon" /> Creating Service...
              </>
            ) : guardrailRefused ? (
              <>
                <ShieldAlert size={16} /> Blocked by Guardrail
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
        }

        .step-num-box {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(99, 102, 241, 0.12);
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.9rem;
          flex-shrink: 0;
          border: 1px solid rgba(99, 102, 241, 0.25);
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

        @media (max-width: 640px) {
          .form-grid-2 {
            grid-template-columns: 1fr;
          }
        }

        .checkbox-toggle-card {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.85rem 1rem;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          cursor: pointer;
        }

        .checkbox-toggle-card input[type="checkbox"] {
          width: 17px;
          height: 17px;
          accent-color: var(--accent);
          cursor: pointer;
        }

        .plan-mode-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        @media (max-width: 640px) {
          .plan-mode-grid {
            grid-template-columns: 1fr;
          }
        }

        .plan-mode-card {
          padding: 1.15rem;
          border-radius: var(--radius);
          border: 1px solid var(--border);
          background: var(--card);
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .plan-mode-card:hover {
          border-color: var(--card-border-hover);
        }

        .plan-mode-active-free {
          border-color: #f59e0b !important;
          background: rgba(245, 158, 11, 0.05) !important;
        }

        .plan-mode-active-dedicated {
          border-color: #10b981 !important;
          background: rgba(16, 185, 129, 0.05) !important;
        }

        .plan-mode-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .plan-mode-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 600;
          font-size: 0.95rem;
          color: var(--foreground);
        }

        .plan-mode-desc {
          font-size: 0.78rem;
          color: var(--muted);
          line-height: 1.45;
          margin: 0;
        }

        .plan-tag {
          align-self: flex-start;
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
        }

        .tag-amber {
          background: rgba(245, 158, 11, 0.12);
          color: #f59e0b;
        }

        .tag-green {
          background: rgba(16, 185, 129, 0.12);
          color: #10b981;
        }

        .dedicated-sub-grid {
          margin-top: 0.5rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border);
        }

        .dedicated-plans-selector {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.65rem;
        }

        @media (max-width: 640px) {
          .dedicated-plans-selector {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        .sub-plan-btn {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding: 0.75rem;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
          background: var(--card);
          cursor: pointer;
          text-align: left;
          transition: all 0.15s ease;
        }

        .sub-plan-selected {
          border-color: #10b981 !important;
          background: rgba(16, 185, 129, 0.08) !important;
        }

        .sub-plan-name {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: 600;
          font-size: 0.84rem;
          color: var(--foreground);
        }

        .sub-plan-spec {
          font-size: 0.7rem;
          color: var(--muted);
        }

        .form-submit-row {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.75rem;
          margin-top: 1rem;
          margin-bottom: 3rem;
        }
      `}</style>
    </div>
  );
}
