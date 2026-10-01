"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Zap,
  Plus,
  Search,
  Filter,
  Terminal,
  Activity,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Globe,
  Clock,
  Cpu,
  Layers,
  Sparkles,
  ArrowRight,
  Code2,
  Lock,
  Play,
  Flame,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { functionsApi, type FunctionServiceItem } from "@/lib/api";
import { getFunctionIngressUrl, getFunctionPathUrl } from "@/lib/domains";

export default function EdgeFunctionsPage() {
  const router = useRouter();
  const [list, setList] = useState<FunctionServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "PUBLIC" | "SECURED">("ALL");
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const fetchFunctions = async () => {
    try {
      const data = await functionsApi.list();
      setList(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load edge functions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFunctions();
  }, []);

  const handleCopyUrl = (url: string, slug: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    toast.success("Function endpoint copied to clipboard");
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const filtered = useMemo(() => {
    return list.filter((fn) => {
      const matchesSearch =
        fn.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fn.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        fn.runtime.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (filterType === "PUBLIC") return fn.isPublic;
      if (filterType === "SECURED") return !fn.isPublic;
      return true;
    });
  }, [list, searchQuery, filterType]);

  const totalInvocations = list.reduce(
    (acc, fn) => acc + (fn._count?.invocations || fn.stats?.totalInvocations || 0),
    0
  );
  const readyCount = list.filter((fn) => fn.deployments?.[0]?.status === "READY").length;

  return (
    <div className="page" style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <PageHeader
        title="Edge Functions"
        subtitle="Sub-5ms serverless backend runtime powered by isolated V8 engines with scale-to-zero and token-bucket API key authentication."
        actions={
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              onClick={() => {
                setLoading(true);
                fetchFunctions();
              }}
              className="btn btn-outline"
              title="Refresh Functions"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
            <Link
              href="/dashboard/functions/new"
              className="btn btn-primary btn-lg"
              id="new-function-btn"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                boxShadow: "0 0 20px var(--accent-glow)",
              }}
            >
              <Plus size={16} /> New Edge Function
            </Link>
          </div>
        }
      />

      {/* Fleet Stats Grid */}
      <div className="stats-grid" style={{ marginBottom: "2rem" }}>
        <div className="stat-card">
          <div className="stat-label">
            <Zap size={15} style={{ color: "var(--accent)" }} /> Total Functions
          </div>
          <div className="stat-value">{list.length}</div>
          <div className="stat-sub">Active serverless micro-services</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Activity size={15} style={{ color: "#10b981" }} /> Live Invocations
          </div>
          <div className="stat-value" style={{ color: "#10b981" }}>
            {totalInvocations.toLocaleString()}
          </div>
          <div className="stat-sub">Handled at edge gateway</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Flame size={15} style={{ color: "#f59e0b" }} /> Cold Start Latency
          </div>
          <div className="stat-value" style={{ color: "#f59e0b" }}>
            &lt; 5 ms
          </div>
          <div className="stat-sub">V8 Isolate pre-warmed pool</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Globe size={15} style={{ color: "var(--accent)" }} /> Edge Routing
          </div>
          <div className="stat-value" style={{ color: "#10b981" }}>
            ACTIVE
          </div>
          <div className="stat-sub">Port 80 mesh • 0 host port overhead</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 300px", maxWidth: 450 }}>
          <Search
            size={16}
            style={{
              position: "absolute",
              left: "1rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--muted-fg)",
            }}
          />
          <input
            type="text"
            placeholder="Search functions by name, slug, or runtime..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
            style={{
              width: "100%",
              padding: "0.65rem 1rem 0.65rem 2.5rem",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--foreground)",
              fontSize: "0.88rem",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          {(["ALL", "SECURED", "PUBLIC"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.8rem",
                fontWeight: 600,
                border: "1px solid",
                borderColor: filterType === type ? "var(--accent)" : "var(--border)",
                background: filterType === type ? "var(--accent-glow)" : "var(--card)",
                color: filterType === type ? "var(--accent)" : "var(--muted)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {type === "ALL" && "All Functions"}
              {type === "SECURED" && "🔒 API Key Protected"}
              {type === "PUBLIC" && "🌐 Public Webhooks"}
            </button>
          ))}
        </div>
      </div>

      {/* Function Fleet Grid */}
      {loading ? (
        <div style={{ padding: "4rem 0", textAlign: "center", color: "var(--muted)" }}>
          <RefreshCw size={28} className="animate-spin" style={{ margin: "0 auto 1rem", opacity: 0.6 }} />
          <p>Loading Edge Functions fleet...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            background: "var(--card)",
            border: "1px dashed var(--border)",
            borderRadius: "var(--radius)",
            padding: "3.5rem 2rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--accent-glow)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem",
              color: "var(--accent)",
            }}
          >
            <Zap size={26} />
          </div>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            {searchQuery ? "No matching functions found" : "Deploy your first Edge Function"}
          </h3>
          <p
            style={{
              color: "var(--muted)",
              maxWidth: 480,
              margin: "0 auto 1.75rem",
              fontSize: "0.9rem",
              lineHeight: 1.5,
            }}
          >
            Deploy lightweight TypeScript or JavaScript micro-APIs, webhooks, and auth middlewares that execute at the edge with zero container overhead and sub-5ms cold starts.
          </p>
          <Link
            href="/dashboard/functions/new"
            className="btn btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <Sparkles size={16} /> Create Edge Function
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {filtered.map((fn) => {
            const latestDeploy = fn.deployments?.[0];
            const isReady = latestDeploy?.status === "READY";
            const primaryUrl = getFunctionIngressUrl(fn.slug);
            const invocationsCount = fn._count?.invocations || fn.stats?.totalInvocations || 0;

            return (
              <div
                key={fn.id}
                onClick={() => router.push(`/dashboard/functions/${fn.id}`)}
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "1.5rem",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  position: "relative",
                  overflow: "hidden",
                }}
                className="hover:border-indigo-500/50 hover:shadow-lg"
              >
                <div>
                  {/* Card Header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: "1rem",
                      gap: "0.75rem",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--foreground)" }}>
                          {fn.name}
                        </h3>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            padding: "0.15rem 0.45rem",
                            borderRadius: 4,
                            background: "var(--bg-inset)",
                            color: "var(--muted)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          v{latestDeploy?.version || 1}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "0.82rem",
                          color: "var(--muted)",
                          fontFamily: "monospace",
                        }}
                      >
                        {fn.slug}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
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
                  </div>

                  {/* Badges Row */}
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        fontSize: "0.75rem",
                        padding: "0.2rem 0.5rem",
                        borderRadius: 6,
                        background: "var(--bg-inset)",
                        color: "var(--foreground)",
                        fontWeight: 600,
                      }}
                    >
                      <Code2 size={12} style={{ color: "var(--accent)" }} />
                      {fn.runtime === "EDGE_TYPESCRIPT" ? "TypeScript (V8)" : fn.runtime}
                    </span>

                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        fontSize: "0.75rem",
                        padding: "0.2rem 0.5rem",
                        borderRadius: 6,
                        background: fn.isPublic ? "rgba(16, 185, 129, 0.1)" : "rgba(99, 102, 241, 0.1)",
                        color: fn.isPublic ? "#10b981" : "var(--accent)",
                        fontWeight: 600,
                      }}
                    >
                      {fn.isPublic ? <Globe size={12} /> : <Lock size={12} />}
                      {fn.isPublic ? "Public Webhook" : "API Key Protected"}
                    </span>
                  </div>

                  {/* Ingress URL snippet */}
                  <div
                    style={{
                      background: "var(--bg-inset)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "0.5rem 0.75rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                      marginBottom: "1.25rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.76rem",
                        fontFamily: "monospace",
                        color: "var(--muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {primaryUrl}
                    </span>
                    <button
                      onClick={(e) => handleCopyUrl(primaryUrl, fn.slug, e)}
                      title="Copy endpoint"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: copiedSlug === fn.slug ? "var(--success)" : "var(--muted)",
                        padding: 2,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {copiedSlug === fn.slug ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                {/* Card Footer */}
                <div
                  style={{
                    borderTop: "1px solid var(--border)",
                    paddingTop: "0.85rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "0.8rem",
                    color: "var(--muted)",
                  }}
                >
                  <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                    <span>
                      <strong style={{ color: "var(--foreground)" }}>{invocationsCount}</strong> calls
                    </span>
                    <span>
                      <strong style={{ color: "var(--foreground)" }}>{fn.memoryLimit}MB</strong> RAM
                    </span>
                    <span>
                      <strong style={{ color: "var(--foreground)" }}>{fn.timeoutMs / 1000}s</strong> timeout
                    </span>
                  </div>

                  <span
                    style={{
                      color: "var(--accent)",
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    Console <ArrowRight size={13} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
