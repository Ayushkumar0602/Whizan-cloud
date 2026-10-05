"use client";

import { useEffect, useState, useMemo } from "react";
import {
  projects,
  services,
  functionsApi,
  databases,
  type ProjectWithLatestDeploy,
  type ServiceWithLatestDeploy,
  type FunctionServiceItem,
  type ManagedDatabase,
} from "@/lib/api";
import {
  formatDeployedUrl,
  getBaseRouterDomain,
  getServiceIngressUrl,
  getFunctionIngressUrl,
} from "@/lib/domains";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import {
  ArrowRight,
  Plus,
  Server,
  Globe,
  ExternalLink,
  Clock,
  Layers,
  Zap,
  Radio,
  Terminal,
  Database,
  Search,
  Copy,
  Check,
  BookOpen,
  Bot,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type ResourceType = "all" | "frontends" | "backends" | "functions" | "databases";

interface UnifiedResource {
  id: string;
  name: string;
  slug: string;
  kind: "FRONTEND" | "BACKEND" | "FUNCTION" | "DATABASE";
  frameworkOrRuntime: string;
  branch?: string;
  status: string;
  liveUrl?: string;
  href: string;
  updatedAt: string;
}

export default function ConsolePage() {
  const { user } = useAuth();
  const [frontendList, setFrontendList] = useState<ProjectWithLatestDeploy[]>([]);
  const [backendList, setBackendList] = useState<ServiceWithLatestDeploy[]>([]);
  const [functionList, setFunctionList] = useState<FunctionServiceItem[]>([]);
  const [databaseList, setDatabaseList] = useState<ManagedDatabase[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<ResourceType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const baseDomain = getBaseRouterDomain();

  useEffect(() => {
    Promise.all([
      projects.list().catch(() => []),
      services.list().catch(() => []),
      functionsApi.list().catch(() => []),
      databases.list().catch(() => []),
    ])
      .then(([fList, bList, fnList, dbList]) => {
        setFrontendList(fList);
        setBackendList(bList);
        setFunctionList(fnList);
        setDatabaseList(dbList);
      })
      .catch(() => toast.error("Could not load cloud assets"))
      .finally(() => setLoading(false));
  }, []);

  function copyToClipboard(text: string, key: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`Copied ${label}`);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const activeBackends = backendList.filter(
    s => s.deployments[0]?.status === "READY" && !!s.deployments[0]?.containerPort
  ).length;

  const liveFrontends = frontendList.filter(
    p => p.deployments[0]?.status === "READY"
  ).length;

  // Unify all resources into a single indexable collection
  const allResources = useMemo<UnifiedResource[]>(() => {
    const list: UnifiedResource[] = [];

    frontendList.forEach(p => {
      const latest = p.deployments[0];
      const liveUrl = formatDeployedUrl(latest?.url, p.slug, p.customDomain);
      list.push({
        id: p.id,
        name: p.name,
        slug: p.slug,
        kind: "FRONTEND",
        frameworkOrRuntime: p.framework || "WEB",
        branch: p.branch,
        status: latest?.status || "NO_DEPLOYS",
        liveUrl: latest?.status === "READY" ? liveUrl : undefined,
        href: `/dashboard/projects/${p.id}`,
        updatedAt: p.updatedAt,
      });
    });

    backendList.forEach(s => {
      const latest = s.deployments[0];
      const liveUrl = getServiceIngressUrl(s.slug);
      let statusStr: string = latest?.status || "NO_DEPLOYS";
      if (latest?.status === "READY" && !latest.containerPort) {
        statusStr = "ASLEEP";
      }
      list.push({
        id: s.id,
        name: s.name,
        slug: s.slug,
        kind: "BACKEND",
        frameworkOrRuntime: s.language || "DOCKER",
        branch: s.branch,
        status: statusStr,
        liveUrl: latest?.status === "READY" && !!latest.containerPort ? liveUrl : undefined,
        href: `/dashboard/backend/${s.id}`,
        updatedAt: latest?.createdAt || s.createdAt,
      });
    });

    functionList.forEach(fn => {
      const latest = fn.deployments?.[0];
      const liveUrl = getFunctionIngressUrl(fn.slug);
      list.push({
        id: fn.id,
        name: fn.name,
        slug: fn.slug,
        kind: "FUNCTION",
        frameworkOrRuntime: fn.runtime ? fn.runtime.replace("_", " ") : "V8 EDGE",
        status: latest ? "READY" : "NO_DEPLOYS",
        liveUrl,
        href: `/dashboard/functions/${fn.id}`,
        updatedAt: fn.updatedAt || fn.createdAt,
      });
    });

    databaseList.forEach(db => {
      list.push({
        id: db.id,
        name: db.name,
        slug: db.id.slice(0, 8),
        kind: "DATABASE",
        frameworkOrRuntime: db.type || "POSTGRESQL",
        status: db.status || "ONLINE",
        href: `/dashboard/databases/${db.id}`,
        updatedAt: new Date().toISOString(),
      });
    });

    return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [frontendList, backendList, functionList, databaseList]);

  const filteredResources = useMemo(() => {
    return allResources.filter(res => {
      const matchesTab =
        activeTab === "all" ||
        (activeTab === "frontends" && res.kind === "FRONTEND") ||
        (activeTab === "backends" && res.kind === "BACKEND") ||
        (activeTab === "functions" && res.kind === "FUNCTION") ||
        (activeTab === "databases" && res.kind === "DATABASE");

      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        res.name.toLowerCase().includes(query) ||
        res.slug.toLowerCase().includes(query) ||
        res.frameworkOrRuntime.toLowerCase().includes(query);

      return matchesTab && matchesSearch;
    });
  }, [allResources, activeTab, searchQuery]);

  return (
    <div className="page console-page">
      {/* ── 1. Elevated Platform Header ───────────────────────────────────────── */}
      <header className="console-header-section">
        <div className="console-header-content">
          <h1 className="console-main-heading">Developer Console</h1>
          <p className="console-sub-desc">
            Centralized control plane for edge-routed frontends, containerized microservices, serverless V8 functions, and managed clusters.
          </p>
        </div>

        <div className="console-header-actions">
          <Link href="/docs" className="btn btn-secondary btn-header">
            <BookOpen size={15} />
            <span>Docs</span>
          </Link>
          <Link href="/dashboard/projects/new" className="btn btn-secondary btn-header">
            <Globe size={15} />
            <span>Deploy Frontend</span>
          </Link>
          <Link href="/dashboard/backend/new" className="btn btn-primary btn-header">
            <Plus size={15} />
            <span>Deploy Service</span>
          </Link>
        </div>
      </header>

      {/* ── 2. Unified Infrastructure Telemetry Strip ───────────────────────── */}
      <section className="telemetry-bar-grid">
        <Link href="/dashboard/hosting" className="telemetry-tile">
          <div className="tile-top-row">
            <div className="tile-icon-wrapper tile-icon-sky">
              <Globe size={18} />
            </div>
            <span className="tile-numeric-stat">{frontendList.length}</span>
          </div>
          <div className="tile-label-text">Frontend Applications</div>
          <div className="tile-subtext text-emerald-700">
            <span className="pulse-indicator-emerald" />
            <span>{liveFrontends} live on Edge CDN</span>
          </div>
        </Link>

        <Link href="/dashboard/backend" className="telemetry-tile">
          <div className="tile-top-row">
            <div className="tile-icon-wrapper tile-icon-indigo">
              <Server size={18} />
            </div>
            <span className="tile-numeric-stat">{backendList.length}</span>
          </div>
          <div className="tile-label-text">Backend Services</div>
          <div className="tile-subtext text-slate-600">
            <span className="static-bullet-dot" />
            <span>{activeBackends} active / {backendList.length - activeBackends} asleep</span>
          </div>
        </Link>

        <Link href="/dashboard/functions" className="telemetry-tile">
          <div className="tile-top-row">
            <div className="tile-icon-wrapper tile-icon-violet">
              <Zap size={18} />
            </div>
            <span className="tile-numeric-stat">{functionList.length}</span>
          </div>
          <div className="tile-label-text">Edge Functions</div>
          <div className="tile-subtext text-violet-700">
            <span className="pulse-indicator-violet" />
            <span>Sub-5ms Serverless V8</span>
          </div>
        </Link>

        <div
          className="telemetry-tile cursor-pointer"
          onClick={() => copyToClipboard("20.2.136.11", "card-ip", "Ingress IP")}
          title="Click to copy Edge Ingress IP"
        >
          <div className="tile-top-row">
            <div className="tile-icon-wrapper tile-icon-emerald">
              <Radio size={18} />
            </div>
            <span className="tile-port-chip">PORT 80</span>
          </div>
          <div className="tile-label-text">Edge Ingress IP</div>
          <div className="tile-subtext text-slate-800 font-mono">
            <span>20.2.136.11</span>
            {copiedKey === "card-ip" ? (
              <Check size={12} className="text-emerald-600" />
            ) : (
              <Copy size={12} className="text-slate-400" />
            )}
          </div>
        </div>
      </section>

      {/* ── 3. Main Workstation Experience ──────────────────────────────────── */}
      {loading ? (
        <div className="workspace-loading-card">
          <div className="skeleton-row-bar" />
          <div className="skeleton-row-bar" />
          <div className="skeleton-row-bar" />
        </div>
      ) : allResources.length === 0 ? (
        /* ZERO-STATE ONBOARDING LAUNCHPAD: Highly polished starter experience */
        <section className="onboarding-launchpad-card">
          <div className="launchpad-intro-banner">
            <div className="launchpad-pill-tag">
              <Sparkles size={13} className="text-indigo-600" />
              <span>Getting Started</span>
            </div>
            <h2 className="launchpad-headline">Deploy your first cloud workload</h2>
            <p className="launchpad-subline">
              Select a workload architecture below to get started, or orchestrate deployments directly from your terminal with Whizan CLI and DevOps MCP.
            </p>
          </div>

          {/* 4 Workload Cards Grid */}
          <div className="launchpad-tiles-grid">
            {/* Frontend Web App */}
            <Link href="/dashboard/projects/new" className="launchpad-action-card">
              <div className="launchpad-card-header">
                <div className="launchpad-icon-box tile-icon-sky">
                  <Globe size={22} />
                </div>
                <span className="launchpad-type-badge type-sky">Edge CDN</span>
              </div>
              <h3 className="launchpad-card-name">Frontend Web Application</h3>
              <p className="launchpad-card-summary">
                Next.js SSR, Vite, React, and Astro applications with edge asset caching, automatic SSL, and instant preview routing.
              </p>
              <div className="framework-chips-row">
                <span className="fw-chip">Next.js</span>
                <span className="fw-chip">Vite</span>
                <span className="fw-chip">React</span>
                <span className="fw-chip">Astro</span>
              </div>
              <div className="launchpad-card-cta">
                <span>Deploy Frontend</span>
                <ArrowRight size={14} className="cta-arrow" />
              </div>
            </Link>

            {/* Backend Microservice */}
            <Link href="/dashboard/backend/new" className="launchpad-action-card">
              <div className="launchpad-card-header">
                <div className="launchpad-icon-box tile-icon-indigo">
                  <Server size={22} />
                </div>
                <span className="launchpad-type-badge type-indigo">Containerized</span>
              </div>
              <h3 className="launchpad-card-name">Backend Microservice</h3>
              <p className="launchpad-card-summary">
                Node.js, Python FastAPI/Django, Go, or raw Docker containers with auto-sleep, zero-downtime mesh, and live streaming logs.
              </p>
              <div className="framework-chips-row">
                <span className="fw-chip">Node.js</span>
                <span className="fw-chip">Python</span>
                <span className="fw-chip">Go</span>
                <span className="fw-chip">Docker</span>
              </div>
              <div className="launchpad-card-cta">
                <span>Deploy Service</span>
                <ArrowRight size={14} className="cta-arrow" />
              </div>
            </Link>

            {/* Serverless Edge Function */}
            <Link href="/dashboard/functions/new" className="launchpad-action-card">
              <div className="launchpad-card-header">
                <div className="launchpad-icon-box tile-icon-violet">
                  <Zap size={22} />
                </div>
                <span className="launchpad-type-badge type-violet">Sub-5ms V8</span>
              </div>
              <h3 className="launchpad-card-name">Serverless Edge Function</h3>
              <p className="launchpad-card-summary">
                Execute lightweight event-driven APIs, webhooks, and database mutations on isolated V8 runtimes with 0 exposed host ports.
              </p>
              <div className="framework-chips-row">
                <span className="fw-chip">TypeScript</span>
                <span className="fw-chip">JavaScript</span>
                <span className="fw-chip">Webhooks</span>
              </div>
              <div className="launchpad-card-cta">
                <span>Create Function</span>
                <ArrowRight size={14} className="cta-arrow" />
              </div>
            </Link>

            {/* Managed Database */}
            <Link href="/dashboard/databases" className="launchpad-action-card">
              <div className="launchpad-card-header">
                <div className="launchpad-icon-box tile-icon-emerald">
                  <Database size={22} />
                </div>
                <span className="launchpad-type-badge type-emerald">Persistence</span>
              </div>
              <h3 className="launchpad-card-name">Managed Persistence</h3>
              <p className="launchpad-card-summary">
                Provision dedicated PostgreSQL database clusters and high-throughput Redis instances with instant connection strings.
              </p>
              <div className="framework-chips-row">
                <span className="fw-chip">PostgreSQL</span>
                <span className="fw-chip">Redis</span>
                <span className="fw-chip">TLS</span>
              </div>
              <div className="launchpad-card-cta">
                <span>Provision Database</span>
                <ArrowRight size={14} className="cta-arrow" />
              </div>
            </Link>
          </div>

          {/* Launchpad Bottom Utilities (Terminal & Cloud Architecture) */}
          <div className="launchpad-auxiliary-grid">
            <div className="aux-info-card">
              <div className="aux-card-header">
                <div className="flex items-center gap-2">
                  <Terminal size={17} className="text-slate-700" />
                  <h4 className="aux-card-title">Terminal & AI DevOps</h4>
                </div>
                <Link href="/dashboard/cli" className="aux-card-link">
                  CLI Docs →
                </Link>
              </div>
              <p className="aux-card-desc">
                Deploy applications directly from your terminal or pair-program with AI coding agents using the MCP server.
              </p>
              <div className="cli-snippets-stack">
                <div className="code-copy-row">
                  <span className="code-pill-tag">CLI</span>
                  <code className="code-line">npm install -g @whizan/cli</code>
                  <button
                    onClick={() => copyToClipboard("npm install -g @whizan/cli", "z-cli", "CLI Command")}
                    className="copy-snippet-btn"
                    title="Copy command"
                  >
                    {copiedKey === "z-cli" ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  </button>
                </div>
                <div className="code-copy-row">
                  <span className="code-pill-tag tag-mcp-badge">MCP</span>
                  <code className="code-line">npx @whizan/mcp-devops login</code>
                  <button
                    onClick={() => copyToClipboard("npx @whizan/mcp-devops login", "z-mcp", "MCP Command")}
                    className="copy-snippet-btn"
                    title="Copy command"
                  >
                    {copiedKey === "z-mcp" ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="aux-info-card">
              <div className="aux-card-header">
                <div className="flex items-center gap-2">
                  <Radio size={17} className="text-emerald-600" />
                  <h4 className="aux-card-title">Network & Ingress Gateway</h4>
                </div>
                <span className="badge badge-ready">
                  <span className="pulse-indicator-emerald" />
                  Operational
                </span>
              </div>
              <div className="network-specs-table">
                <div className="spec-item-row">
                  <span className="spec-item-name">Edge Ingress Gateway</span>
                  <span className="spec-item-val font-mono">http://*.20.2.136.11.nip.io</span>
                </div>
                <div className="spec-item-row">
                  <span className="spec-item-name">Ingress Traffic Port</span>
                  <span className="spec-item-val">HTTP / Port 80 (Fastify Edge Router)</span>
                </div>
                <div className="spec-item-row">
                  <span className="spec-item-name">Private Bridge Network</span>
                  <span className="spec-item-val text-emerald-700 font-semibold">172.18.0.0/16 Mesh</span>
                </div>
                <div className="spec-item-row">
                  <span className="spec-item-name">Deployment Strategy</span>
                  <span className="spec-item-val text-slate-800 font-medium">Atomic Zero-Downtime</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        /* ACTIVE WORKSPACE: Deployed Cloud Resources Table + Sidebar */
        <div className="console-active-layout">
          {/* Main Column */}
          <main className="active-primary-col">
            <div className="resources-card-panel">
              <div className="panel-controls-header">
                <div className="panel-title-row">
                  <div>
                    <h2 className="panel-heading">Deployed Cloud Resources</h2>
                    <p className="panel-subheading">
                      Active web frontends, containerized microservices, and serverless functions
                    </p>
                  </div>
                  <Link href="/dashboard/services" className="catalog-direct-link">
                    <span>View All Catalog</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>

                {/* Filter Tabs & Search Bar */}
                <div className="filter-search-toolbar">
                  <div className="tab-segmented-group" role="tablist">
                    <button
                      onClick={() => setActiveTab("all")}
                      className={`tab-btn ${activeTab === "all" ? "tab-btn-active" : ""}`}
                      role="tab"
                      aria-selected={activeTab === "all"}
                    >
                      All <span className="tab-count-pill">{allResources.length}</span>
                    </button>
                    <button
                      onClick={() => setActiveTab("frontends")}
                      className={`tab-btn ${activeTab === "frontends" ? "tab-btn-active" : ""}`}
                      role="tab"
                      aria-selected={activeTab === "frontends"}
                    >
                      Frontends <span className="tab-count-pill">{frontendList.length}</span>
                    </button>
                    <button
                      onClick={() => setActiveTab("backends")}
                      className={`tab-btn ${activeTab === "backends" ? "tab-btn-active" : ""}`}
                      role="tab"
                      aria-selected={activeTab === "backends"}
                    >
                      Backends <span className="tab-count-pill">{backendList.length}</span>
                    </button>
                    <button
                      onClick={() => setActiveTab("functions")}
                      className={`tab-btn ${activeTab === "functions" ? "tab-btn-active" : ""}`}
                      role="tab"
                      aria-selected={activeTab === "functions"}
                    >
                      Functions <span className="tab-count-pill">{functionList.length}</span>
                    </button>
                    <button
                      onClick={() => setActiveTab("databases")}
                      className={`tab-btn ${activeTab === "databases" ? "tab-btn-active" : ""}`}
                      role="tab"
                      aria-selected={activeTab === "databases"}
                    >
                      Databases <span className="tab-count-pill">{databaseList.length}</span>
                    </button>
                  </div>

                  <div className="search-box-wrapper">
                    <Search size={14} className="search-lead-icon" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Filter by name, slug, framework..."
                      className="search-box-input"
                      aria-label="Filter resources"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="clear-search-btn"
                        aria-label="Clear search query"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Resource List Stack */}
              <div className="resources-list-body">
                {filteredResources.length === 0 ? (
                  <div className="empty-search-state">
                    <div className="empty-search-icon">
                      <Search size={24} className="text-slate-400" />
                    </div>
                    <h3 className="empty-search-title">No matching resources found</h3>
                    <p className="empty-search-desc">
                      No deployments matching &ldquo;{searchQuery}&rdquo;. Try refining your search query or selecting a different tab.
                    </p>
                    <button onClick={() => setSearchQuery("")} className="btn btn-secondary btn-sm">
                      Clear Search Filter
                    </button>
                  </div>
                ) : (
                  <div className="resource-items-table">
                    {filteredResources.map(res => {
                      const isFrontend = res.kind === "FRONTEND";
                      const isBackend = res.kind === "BACKEND";
                      const isFunction = res.kind === "FUNCTION";
                      const isDatabase = res.kind === "DATABASE";

                      return (
                        <div key={`${res.kind}-${res.id}`} className="resource-item-row">
                          <Link href={res.href} className="resource-item-primary">
                            <div
                              className={`resource-type-avatar ${
                                isFrontend
                                  ? "tile-icon-sky"
                                  : isBackend
                                  ? "tile-icon-indigo"
                                  : isFunction
                                  ? "tile-icon-violet"
                                  : "tile-icon-emerald"
                              }`}
                            >
                              {isFrontend && <Globe size={18} />}
                              {isBackend && <Server size={18} />}
                              {isFunction && <Zap size={18} />}
                              {isDatabase && <Database size={18} />}
                            </div>

                            <div className="resource-item-info">
                              <div className="resource-name-line">
                                <span className="resource-main-name">{res.name}</span>
                                <span className="resource-slug-chip mono">/{res.slug}</span>
                                <span className="resource-runtime-chip">{res.frameworkOrRuntime}</span>
                              </div>

                              <div className="resource-details-line">
                                {res.branch && (
                                  <>
                                    <span className="branch-meta mono">branch: {res.branch}</span>
                                    <span className="meta-dot-sep">•</span>
                                  </>
                                )}
                                <span className="timestamp-meta">
                                  {formatDistanceToNow(new Date(res.updatedAt), { addSuffix: true })}
                                </span>
                              </div>
                            </div>
                          </Link>

                          <div className="resource-item-actions">
                            <div className="resource-status-badge">
                              {res.status === "READY" || res.status === "ONLINE" ? (
                                <span className="badge badge-ready">
                                  <span className="pulse-indicator-emerald" />
                                  {isBackend ? "ACTIVE" : "READY"}
                                </span>
                              ) : res.status === "ASLEEP" ? (
                                <span className="badge badge-queued" title="Compute scaled to zero">
                                  <Clock size={11} />
                                  ASLEEP
                                </span>
                              ) : (
                                <StatusBadge status={res.status} />
                              )}
                            </div>

                            {res.liveUrl && (
                              <a
                                href={res.liveUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="live-link-button"
                                title={`Open live URL: ${res.liveUrl}`}
                              >
                                <span>Live</span>
                                <ExternalLink size={12} />
                              </a>
                            )}

                            <Link href={res.href} className="inspect-link-chevron" title="Inspect service console">
                              <ChevronRight size={16} />
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </main>

          {/* Secondary Column */}
          <aside className="active-sidebar-col">
            <div className="side-widget-card">
              <h3 className="side-widget-title">Quick Actions</h3>
              <p className="side-widget-desc">Provision cloud infrastructure and apps</p>

              <div className="quick-deploy-stack">
                <Link href="/dashboard/projects/new" className="quick-deploy-entry">
                  <div className="entry-icon tile-icon-sky">
                    <Globe size={16} />
                  </div>
                  <div className="entry-texts">
                    <div className="entry-title">Deploy Frontend</div>
                    <div className="entry-sub">Next.js, Vite, React with edge routing</div>
                  </div>
                  <ChevronRight size={14} className="entry-chevron" />
                </Link>

                <Link href="/dashboard/backend/new" className="quick-deploy-entry">
                  <div className="entry-icon tile-icon-indigo">
                    <Server size={16} />
                  </div>
                  <div className="entry-texts">
                    <div className="entry-title">Deploy Microservice</div>
                    <div className="entry-sub">Node.js, Python, Go, Docker API</div>
                  </div>
                  <ChevronRight size={14} className="entry-chevron" />
                </Link>

                <Link href="/dashboard/functions/new" className="quick-deploy-entry">
                  <div className="entry-icon tile-icon-violet">
                    <Zap size={16} />
                  </div>
                  <div className="entry-texts">
                    <div className="entry-title">Create Edge Function</div>
                    <div className="entry-sub">Serverless V8 isolated endpoint</div>
                  </div>
                  <ChevronRight size={14} className="entry-chevron" />
                </Link>

                <Link href="/dashboard/databases" className="quick-deploy-entry">
                  <div className="entry-icon tile-icon-emerald">
                    <Database size={16} />
                  </div>
                  <div className="entry-texts">
                    <div className="entry-title">Managed Persistence</div>
                    <div className="entry-sub">PostgreSQL & Redis clusters</div>
                  </div>
                  <ChevronRight size={14} className="entry-chevron" />
                </Link>
              </div>
            </div>

            <div className="side-widget-card">
              <div className="flex items-center justify-between mb-1">
                <h3 className="side-widget-title">Developer Tooling</h3>
                <Link href="/docs" className="tooling-docs-anchor">
                  Docs →
                </Link>
              </div>
              <p className="side-widget-desc">Connect local terminal or AI coding agents</p>

              <div className="tooling-snippets-stack">
                <div className="tool-snippet-box">
                  <div className="tool-box-label">
                    <div className="flex items-center gap-1.5">
                      <Bot size={13} className="text-indigo-600" />
                      <span className="font-semibold text-xs text-slate-800">DevOps Agent (MCP)</span>
                    </div>
                    <Link href="/dashboard/mcp" className="tool-box-link">
                      Config →
                    </Link>
                  </div>
                  <div className="tool-box-code">
                    <code>npx @whizan/mcp-devops login</code>
                    <button
                      onClick={() => copyToClipboard("npx @whizan/mcp-devops login", "mcp-side", "MCP Command")}
                      className="tool-copy-icon"
                      title="Copy command"
                    >
                      {copiedKey === "mcp-side" ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                <div className="tool-snippet-box">
                  <div className="tool-box-label">
                    <div className="flex items-center gap-1.5">
                      <Terminal size={13} className="text-slate-700" />
                      <span className="font-semibold text-xs text-slate-800">Whizan CLI</span>
                    </div>
                    <Link href="/dashboard/cli" className="tool-box-link">
                      Help →
                    </Link>
                  </div>
                  <div className="tool-box-code">
                    <code>npm i -g @whizan/cli</code>
                    <button
                      onClick={() => copyToClipboard("npm i -g @whizan/cli", "cli-side", "CLI Command")}
                      className="tool-copy-icon"
                      title="Copy command"
                    >
                      {copiedKey === "cli-side" ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="side-widget-card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="side-widget-title">Edge Ingress Specs</h3>
                <span className="badge badge-ready">
                  <span className="pulse-indicator-emerald" />
                  Live
                </span>
              </div>
              <div className="specs-list-stack">
                <div className="spec-row-item">
                  <span className="spec-row-lbl">Ingress IP</span>
                  <span className="spec-row-val mono">20.2.136.11</span>
                </div>
                <div className="spec-row-item">
                  <span className="spec-row-lbl">Gateway Domain</span>
                  <span className="spec-row-val mono">*.{baseDomain}</span>
                </div>
                <div className="spec-row-item">
                  <span className="spec-row-lbl">Router Port</span>
                  <span className="spec-row-val">Port 80 (HTTP)</span>
                </div>
                <div className="spec-row-item">
                  <span className="spec-row-lbl">Mesh Subnet</span>
                  <span className="spec-row-val text-emerald-700 font-semibold">172.18.0.0/16</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ── Scoped CSS with Complete Media Queries ──────────────────────────── */}
      <style>{`
        /* Root Page Overrides & Reset */
        .console-page {
          overflow-x: hidden;
          width: 100%;
        }

        /* ── 1. Header Section ────────────────────────────────── */
        .console-header-section {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 1.75rem 2rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.75rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }
        .console-header-content {
          flex: 1;
          min-width: 0;
        }

        .console-main-heading {
          font-size: 1.75rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--foreground);
          line-height: 1.2;
        }
        .console-sub-desc {
          font-size: 0.88rem;
          color: var(--muted);
          line-height: 1.5;
          margin-top: 0.35rem;
          max-width: 48rem;
        }
        .console-header-actions {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-shrink: 0;
        }
        .btn-header {
          padding: 0.55rem 1rem;
          font-size: 0.835rem;
          white-space: nowrap;
        }

        /* ── 2. Telemetry Cards Strip ─────────────────────────── */
        .telemetry-bar-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.15rem;
          margin-bottom: 1.75rem;
        }
        .telemetry-tile {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.2rem 1.35rem;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
          text-decoration: none;
          display: flex;
          flex-direction: column;
          transition: all 0.15s ease;
        }
        .telemetry-tile:hover {
          border-color: var(--card-border-hover);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
          transform: translateY(-1.5px);
        }
        .tile-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }
        .tile-icon-wrapper {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .tile-icon-sky {
          background: #f0f9ff;
          color: #0284c7;
          border: 1px solid #e0f2fe;
        }
        .tile-icon-indigo {
          background: #eef2ff;
          color: #4f46e5;
          border: 1px solid #e0e7ff;
        }
        .tile-icon-violet {
          background: #f5f3ff;
          color: #7c3aed;
          border: 1px solid #ede9fe;
        }
        .tile-icon-emerald {
          background: #ecfdf5;
          color: #059669;
          border: 1px solid #d1fae5;
        }
        .tile-numeric-stat {
          font-size: 1.75rem;
          font-weight: 750;
          color: var(--foreground);
          letter-spacing: -0.03em;
          line-height: 1;
        }
        .tile-port-chip {
          font-size: 0.7rem;
          font-weight: 700;
          padding: 0.2rem 0.5rem;
          background: #ecfdf5;
          color: #059669;
          border: 1px solid #a7f3d0;
          border-radius: 4px;
          letter-spacing: 0.04em;
        }
        .tile-label-text {
          font-size: 0.84rem;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 0.35rem;
        }
        .tile-subtext {
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .pulse-indicator-emerald {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
          animation: pulseGlow 2s infinite ease-in-out;
        }
        .pulse-indicator-violet {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #8b5cf6;
          box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
          animation: pulseGlow 2s infinite ease-in-out;
        }
        .static-bullet-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #94a3b8;
        }

        /* ── 3. Onboarding Launchpad (Zero-State) ──────────────── */
        .onboarding-launchpad-card {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 2.25rem 2.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }
        .launchpad-intro-banner {
          margin-bottom: 2rem;
          max-width: 48rem;
        }
        .launchpad-pill-tag {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          font-size: 0.74rem;
          font-weight: 650;
          color: #4f46e5;
          background: #eef2ff;
          border: 1px solid #e0e7ff;
          padding: 0.25rem 0.65rem;
          border-radius: 9999px;
          margin-bottom: 0.85rem;
        }
        .launchpad-headline {
          font-size: 1.55rem;
          font-weight: 750;
          color: var(--foreground);
          letter-spacing: -0.025em;
          line-height: 1.25;
        }
        .launchpad-subline {
          font-size: 0.9rem;
          color: var(--muted);
          line-height: 1.55;
          margin-top: 0.45rem;
        }

        .launchpad-tiles-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.35rem;
          margin-bottom: 2rem;
        }
        .launchpad-action-card {
          background: #fafbfc;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 1.5rem;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: all 0.18s ease;
          position: relative;
        }
        .launchpad-action-card:hover {
          background: #ffffff;
          border-color: #cbd5e1;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.04);
          transform: translateY(-2px);
        }
        .launchpad-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .launchpad-icon-box {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .launchpad-type-badge {
          font-size: 0.7rem;
          font-weight: 650;
          padding: 0.2rem 0.55rem;
          border-radius: 5px;
          letter-spacing: 0.02em;
        }
        .type-sky {
          background: #f0f9ff;
          color: #0284c7;
          border: 1px solid #bae6fd;
        }
        .type-indigo {
          background: #eef2ff;
          color: #4f46e5;
          border: 1px solid #c7d2fe;
        }
        .type-violet {
          background: #f5f3ff;
          color: #7c3aed;
          border: 1px solid #ddd6fe;
        }
        .type-emerald {
          background: #ecfdf5;
          color: #059669;
          border: 1px solid #a7f3d0;
        }
        .launchpad-card-name {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--foreground);
          letter-spacing: -0.015em;
          margin-bottom: 0.4rem;
        }
        .launchpad-card-summary {
          font-size: 0.835rem;
          color: var(--muted);
          line-height: 1.5;
          margin-bottom: 1.15rem;
        }
        .framework-chips-row {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-wrap: wrap;
          margin-bottom: 1.25rem;
        }
        .fw-chip {
          font-size: 0.7rem;
          font-weight: 600;
          color: #475569;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 0.15rem 0.45rem;
        }
        .launchpad-card-cta {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.84rem;
          font-weight: 650;
          color: var(--foreground);
          padding-top: 0.85rem;
          border-top: 1px solid #f1f5f9;
        }
        .cta-arrow {
          transition: transform 0.15s ease;
        }
        .launchpad-action-card:hover .cta-arrow {
          transform: translateX(3px);
          color: var(--accent);
        }

        /* Launchpad Auxiliary (Terminal & Specs) */
        .launchpad-auxiliary-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.35rem;
          padding-top: 1.75rem;
          border-top: 1px solid #f1f5f9;
        }
        .aux-info-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: var(--radius);
          padding: 1.35rem 1.5rem;
        }
        .aux-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.5rem;
        }
        .aux-card-title {
          font-size: 0.88rem;
          font-weight: 700;
          color: var(--foreground);
        }
        .aux-card-link {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--accent);
          text-decoration: none;
        }
        .aux-card-link:hover {
          text-decoration: underline;
        }
        .aux-card-desc {
          font-size: 0.79rem;
          color: var(--muted);
          line-height: 1.45;
          margin-bottom: 0.95rem;
        }
        .cli-snippets-stack {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .code-copy-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 0.45rem 0.65rem;
          font-family: var(--font-geist-mono), monospace;
          font-size: 0.76rem;
        }
        .code-pill-tag {
          font-size: 0.65rem;
          font-weight: 700;
          padding: 0.1rem 0.35rem;
          border-radius: 3px;
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #e2e8f0;
          margin-right: 0.65rem;
        }
        .tag-mcp-badge {
          background: #eef2ff;
          color: #4f46e5;
          border-color: #c7d2fe;
        }
        .code-line {
          flex: 1;
          color: #1e293b;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .copy-snippet-btn {
          border: none;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          padding: 0.2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.12s ease;
        }
        .copy-snippet-btn:hover {
          color: #0f172a;
        }

        .network-specs-table {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .spec-item-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.35rem 0;
          border-bottom: 1px solid #f1f5f9;
          font-size: 0.78rem;
        }
        .spec-item-row:last-child {
          border-bottom: none;
        }
        .spec-item-name {
          color: var(--muted);
        }
        .spec-item-val {
          font-weight: 550;
          color: var(--foreground);
        }

        /* ── 4. Active Workspace Layout (Resources exist) ─────── */
        .console-active-layout {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 1.5rem;
          align-items: start;
        }
        .active-primary-col {
          min-width: 0;
        }
        .resources-card-panel {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }
        .panel-controls-header {
          padding: 1.5rem 1.75rem;
          border-bottom: 1px solid var(--border);
        }
        .panel-title-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1.25rem;
        }
        .panel-heading {
          font-size: 1.15rem;
          font-weight: 750;
          color: var(--foreground);
          letter-spacing: -0.02em;
        }
        .panel-subheading {
          font-size: 0.81rem;
          color: var(--muted);
          margin-top: 0.2rem;
        }
        .catalog-direct-link {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--accent);
          text-decoration: none;
          white-space: nowrap;
        }
        .catalog-direct-link:hover {
          text-decoration: underline;
        }

        .filter-search-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .tab-segmented-group {
          display: inline-flex;
          background: #f1f5f9;
          padding: 0.22rem;
          border-radius: 7px;
          gap: 0.2rem;
        }
        .tab-btn {
          border: none;
          background: transparent;
          padding: 0.35rem 0.7rem;
          border-radius: 5px;
          font-size: 0.78rem;
          font-weight: 550;
          color: #64748b;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          transition: all 0.12s ease;
        }
        .tab-btn:hover {
          color: #0f172a;
        }
        .tab-btn-active {
          background: #ffffff;
          color: #0f172a;
          font-weight: 650;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        .tab-count-pill {
          font-size: 0.68rem;
          font-weight: 700;
          padding: 0.05rem 0.35rem;
          border-radius: 9999px;
          background: rgba(0, 0, 0, 0.06);
          color: inherit;
        }

        .search-box-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          flex: 1;
          max-width: 320px;
          min-width: 200px;
        }
        .search-lead-icon {
          position: absolute;
          left: 0.65rem;
          color: #94a3b8;
          pointer-events: none;
        }
        .search-box-input {
          width: 100%;
          padding: 0.42rem 1.75rem 0.42rem 2rem;
          font-size: 0.8rem;
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 6px;
          outline: none;
          transition: all 0.15s ease;
        }
        .search-box-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent-glow);
        }
        .clear-search-btn {
          position: absolute;
          right: 0.5rem;
          border: none;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          font-size: 0.7rem;
        }
        .clear-search-btn:hover {
          color: #0f172a;
        }

        /* Resource Rows */
        .resources-list-body {
          display: flex;
          flex-direction: column;
        }
        .resource-items-table {
          display: flex;
          flex-direction: column;
        }
        .resource-item-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.75rem;
          border-bottom: 1px solid #f1f5f9;
          transition: background-color 0.12s ease;
        }
        .resource-item-row:last-child {
          border-bottom: none;
        }
        .resource-item-row:hover {
          background: #f8fafc;
        }
        .resource-item-primary {
          display: flex;
          align-items: center;
          gap: 1rem;
          text-decoration: none;
          flex: 1;
          min-width: 0;
        }
        .resource-type-avatar {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .resource-item-info {
          min-width: 0;
          flex: 1;
        }
        .resource-name-line {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          flex-wrap: wrap;
        }
        .resource-main-name {
          font-size: 0.88rem;
          font-weight: 650;
          color: var(--foreground);
        }
        .resource-slug-chip {
          font-size: 0.72rem;
          color: var(--muted);
          background: #f1f5f9;
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
        }
        .resource-runtime-chip {
          font-size: 0.68rem;
          font-weight: 700;
          color: #475569;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
          text-transform: uppercase;
        }
        .resource-details-line {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          margin-top: 0.25rem;
          font-size: 0.74rem;
          color: var(--muted);
        }
        .meta-dot-sep {
          color: #cbd5e1;
        }
        .resource-item-actions {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-shrink: 0;
        }
        .live-link-button {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.3rem 0.6rem;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 5px;
          font-size: 0.74rem;
          font-weight: 600;
          color: #334155;
          text-decoration: none;
          transition: all 0.12s ease;
        }
        .live-link-button:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
          color: #0f172a;
        }
        .inspect-link-chevron {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          color: #94a3b8;
          text-decoration: none;
          transition: all 0.12s ease;
        }
        .inspect-link-chevron:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        /* Empty Search State */
        .empty-search-state {
          padding: 3.5rem 1.5rem;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .empty-search-icon {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 0.85rem;
        }
        .empty-search-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--foreground);
        }
        .empty-search-desc {
          font-size: 0.82rem;
          color: var(--muted);
          max-width: 24rem;
          margin: 0.35rem 0 1.25rem 0;
          line-height: 1.45;
        }

        /* ── Active Sidebar Column ────────────────────────────── */
        .active-sidebar-col {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .side-widget-card {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 1.35rem 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }
        .side-widget-title {
          font-size: 0.88rem;
          font-weight: 700;
          color: var(--foreground);
        }
        .side-widget-desc {
          font-size: 0.74rem;
          color: var(--muted);
          margin-top: 0.15rem;
          margin-bottom: 0.95rem;
        }
        .quick-deploy-stack {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        .quick-deploy-entry {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding: 0.55rem 0.65rem;
          border-radius: 7px;
          background: #f8fafc;
          border: 1px solid #f1f5f9;
          text-decoration: none;
          transition: all 0.12s ease;
        }
        .quick-deploy-entry:hover {
          background: #ffffff;
          border-color: #cbd5e1;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
          transform: translateY(-1px);
        }
        .entry-icon {
          width: 30px;
          height: 30px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .entry-texts {
          flex: 1;
          min-width: 0;
        }
        .entry-title {
          font-size: 0.81rem;
          font-weight: 600;
          color: var(--foreground);
        }
        .entry-sub {
          font-size: 0.7rem;
          color: var(--muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .entry-chevron {
          color: #94a3b8;
          transition: transform 0.12s ease;
        }
        .quick-deploy-entry:hover .entry-chevron {
          color: var(--foreground);
          transform: translateX(1px);
        }

        .tooling-docs-anchor {
          font-size: 0.73rem;
          font-weight: 600;
          color: var(--accent);
          text-decoration: none;
        }
        .tooling-docs-anchor:hover {
          text-decoration: underline;
        }
        .tooling-snippets-stack {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .tool-snippet-box {
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          border-radius: 7px;
          padding: 0.6rem 0.75rem;
        }
        .tool-box-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.4rem;
        }
        .tool-box-link {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--accent);
          text-decoration: none;
        }
        .tool-box-code {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 5px;
          padding: 0.35rem 0.55rem;
          font-size: 0.74rem;
          font-family: var(--font-geist-mono), monospace;
          color: #1e293b;
        }
        .tool-copy-icon {
          border: none;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          padding: 0.15rem;
          display: flex;
          align-items: center;
        }
        .tool-copy-icon:hover {
          color: #0f172a;
        }

        .specs-list-stack {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .spec-row-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.35rem 0;
          border-bottom: 1px solid #f1f5f9;
          font-size: 0.76rem;
        }
        .spec-row-item:last-child {
          border-bottom: none;
        }
        .spec-row-lbl {
          color: var(--muted);
        }
        .spec-row-val {
          font-weight: 550;
          color: var(--foreground);
        }

        /* Loading Skeleton */
        .workspace-loading-card {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 2.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .skeleton-row-bar {
          height: 38px;
          background: #f1f5f9;
          border-radius: 6px;
          animation: pulse 1.5s infinite ease-in-out;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.25; }
        }

        /* ── 5. Comprehensive Responsive Media Queries ────────── */
        @media (max-width: 1200px) {
          .console-active-layout {
            grid-template-columns: 1fr;
          }
          .active-sidebar-col {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1.25rem;
          }
        }

        @media (max-width: 992px) {
          .telemetry-bar-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .launchpad-tiles-grid {
            grid-template-columns: 1fr;
          }
          .launchpad-auxiliary-grid {
            grid-template-columns: 1fr;
          }
          .active-sidebar-col {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .console-header-section {
            flex-direction: column;
            align-items: flex-start;
            padding: 1.5rem;
            gap: 1.25rem;
          }
          .console-header-actions {
            width: 100%;
          }
          .console-header-actions .btn {
            flex: 1;
            justify-content: center;
          }
          .onboarding-launchpad-card {
            padding: 1.5rem;
          }
          .filter-search-toolbar {
            flex-direction: column;
            align-items: stretch;
          }
          .search-box-wrapper {
            max-width: 100%;
          }
          .tab-segmented-group {
            overflow-x: auto;
            width: 100%;
          }
          .resource-item-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.85rem;
            padding: 1.15rem 1.25rem;
          }
          .resource-item-actions {
            width: 100%;
            justify-content: space-between;
          }
        }

        @media (max-width: 520px) {
          .telemetry-bar-grid {
            grid-template-columns: 1fr;
          }
          .console-header-actions {
            flex-direction: column;
          }
          .console-header-actions .btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
