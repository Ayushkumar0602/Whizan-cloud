"use client";
import { useEffect, useState, useMemo } from "react";
import { projects, type ProjectWithLatestDeploy } from "@/lib/api";
import Link from "next/link";
import {
  Plus,
  Globe,
  GitBranch,
  Clock,
  Zap,
  ExternalLink,
  Search,
  CheckCircle2,
  AlertCircle,
  Layers,
  Sparkles
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDeployedUrl, getSmartDeploymentUrl } from "@/lib/domains";

export default function HostingPage() {
  const [list, setList] = useState<ProjectWithLatestDeploy[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    projects.list()
      .then(setList)
      .catch(() => toast.error("Failed to load projects"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return list.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.framework.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [list, searchQuery]);

  const liveSitesCount = list.filter(p => p.deployments[0]?.status === "READY").length;

  return (
    <div className="page">
      <PageHeader
        title="Frontend Hosting"
        subtitle="Global edge hosting pipeline for Next.js, React, and Vite applications with automatic build optimization."
        actions={
          <Link href="/dashboard/projects/new" className="btn btn-primary btn-lg" id="new-project-btn">
            <Plus size={17} /> New Project
          </Link>
        }
      />

      {/* Stats Counters */}
      <div className="stats-grid" style={{ marginBottom: "1.75rem" }}>
        <div className="stat-card">
          <div className="stat-label">
            <Globe size={14} className="text-accent" /> Total Sites
          </div>
          <div className="stat-value">{list.length}</div>
          <div className="stat-sub">Connected repositories</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <CheckCircle2 size={14} style={{ color: "#10b981" }} /> Live Sites
          </div>
          <div className="stat-value" style={{ color: "#10b981" }}>{liveSitesCount}</div>
          <div className="stat-sub">Serving production traffic</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Zap size={14} className="text-accent" /> Edge Routing
          </div>
          <div className="stat-value">Active</div>
          <div className="stat-sub" style={{ color: "var(--success)" }}>
            Wildcard domain ready
          </div>
        </div>
      </div>



      {/* Search & Filter Bar */}
      <div className="hosting-controls-bar">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search projects by name, slug, or framework..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      {loading ? (
        <div className="frontend-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="card skeleton-card">
              <div className="skeleton" style={{ height: 24, width: "50%" }} />
              <div className="skeleton" style={{ height: 16, width: "30%", marginTop: "0.5rem" }} />
              <div className="skeleton" style={{ height: 36, width: "100%", marginTop: "auto" }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Globe size={32} />
          <h2>{searchQuery ? "No matching projects found" : "Nothing hosted yet"}</h2>
          <p>
            {searchQuery
              ? "Try adjusting your search criteria."
              : "Connect your GitHub repository to build and publish your web app in seconds."}
          </p>
          <Link href="/dashboard/projects/new" className="btn btn-primary btn-lg" style={{ marginTop: "0.5rem" }}>
            <Plus size={16} /> Create First Project
          </Link>
        </div>
      ) : (
        <div className="frontend-grid">
          {filtered.map(p => {
            const latest = p.deployments[0];
            const isReady = latest?.status === "READY";
            const liveUrl = formatDeployedUrl(latest?.url, p.slug, p.customDomain);

            return (
              <div
                key={p.id}
                className="frontend-card"
                id={`project-${p.id}`}
              >
                <Link href={`/dashboard/projects/${p.id}`} className="frontend-card-link">
                  <div className="frontend-card-top">
                    <div className="frontend-icon-box">
                      {p.name[0].toUpperCase()}
                    </div>
                    <div className="frontend-title-box">
                      <h3 className="frontend-title">{p.name}</h3>
                      <div className="frontend-slug mono">/{p.slug}</div>
                    </div>
                    {latest && <StatusBadge status={latest.status} />}
                  </div>

                  <div className="frontend-meta-row">
                    <span className="meta-chip">
                      <GitBranch size={12} /> {p.branch}
                    </span>
                    <span className="meta-chip">
                      <Zap size={12} /> {p.framework}
                    </span>
                    <span className="meta-chip">
                      <Clock size={12} />
                      {formatDistanceToNow(new Date(p.updatedAt), { addSuffix: true })}
                    </span>
                  </div>
                </Link>

                {isReady && (
                  <a
                    href={getSmartDeploymentUrl(p.slug, p.customDomain)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="frontend-url-ribbon"
                    title={`Open deployment: ${p.name}`}
                  >
                    <Globe size={13} style={{ flexShrink: 0 }} />
                    <span className="frontend-url-text mono">{liveUrl.replace(/^https?:\/\//, "")}</span>
                    <ExternalLink size={12} style={{ flexShrink: 0 }} />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .hosting-controls-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }

        .search-box {
          position: relative;
          width: 100%;
          max-width: 420px;
        }
        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--muted);
          pointer-events: none;
        }
        .search-input {
          width: 100%;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: 8px;
          padding: 0.6rem 0.85rem 0.6rem 2.25rem;
          font-size: 0.84rem;
          color: var(--foreground);
          transition: all 0.15s ease;
        }
        .search-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-glow);
          background: var(--card-hover);
        }

        .frontend-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1.25rem;
        }

        .skeleton-card {
          min-height: 170px;
          display: flex;
          flex-direction: column;
        }

        .frontend-card {
          display: flex;
          flex-direction: column;
          background: var(--card);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--card-border);
          border-radius: var(--radius);
          padding: 1.35rem;
          text-decoration: none;
          color: inherit;
          box-shadow: var(--shadow);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .frontend-card:hover {
          border-color: var(--card-border-hover);
          transform: translateY(-2px);
          box-shadow: var(--shadow-hover);
        }

        .frontend-card-top {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          margin-bottom: 1rem;
        }
        .frontend-icon-box {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(56, 189, 248, 0.1);
          border: 1px solid rgba(56, 189, 248, 0.25);
          color: #38bdf8;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 750;
          font-size: 1rem;
          flex-shrink: 0;
        }
        .frontend-title-box {
          flex: 1;
          min-width: 0;
        }
        .frontend-title {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--foreground);
          letter-spacing: -0.02em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .frontend-slug {
          font-size: 0.74rem;
          color: var(--muted);
          margin-top: 2px;
        }

        .frontend-meta-row {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 0.85rem;
        }
        .meta-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.74rem;
          color: var(--muted);
          background: var(--bg-inset);
          padding: 0.2rem 0.5rem;
          border-radius: 6px;
          border: 1px solid var(--card-border);
        }

        .frontend-card-link {
          display: flex;
          flex-direction: column;
          text-decoration: none;
          color: inherit;
        }

        .frontend-url-ribbon {
          margin-top: 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 8px;
          font-size: 0.76rem;
          color: #10b981;
          text-decoration: none;
          overflow: hidden;
          transition: all 0.15s ease;
        }
        .frontend-url-ribbon:hover {
          background: rgba(16, 185, 129, 0.16);
          border-color: rgba(16, 185, 129, 0.35);
          transform: translateY(-1px);
        }
        .frontend-url-text {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 550;
        }

        @media (max-width: 640px) {
          .frontend-grid {
            grid-template-columns: 1fr;
          }
          .search-box {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
