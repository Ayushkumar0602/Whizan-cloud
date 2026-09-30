"use client";

import { useState } from "react";
import Link from "next/link";
import { CLOUD_SERVICES, type CloudService } from "@/lib/services";
import { PageHeader } from "@/components/page-header";
import {
  ArrowRight,
  Server,
  Globe,
  Database,
  Layers,
  Zap,
  Terminal,
  ShieldCheck,
  CheckCircle2,
  Cpu,
  Lock
} from "lucide-react";

export default function ServicesPage() {
  const [filter, setFilter] = useState<"All" | "Compute" | "Storage" | "DevOps">("All");

  const getIcon = (id: string) => {
    switch (id) {
      case "backend-hosting":
        return <Server size={22} className="text-accent" />;
      case "frontend-hosting":
        return <Globe size={22} style={{ color: "#38bdf8" }} />;
      case "managed-postgres":
        return <Database size={22} style={{ color: "#818cf8" }} />;
      case "managed-redis":
        return <Zap size={22} style={{ color: "#f59e0b" }} />;
      case "devops-mcp":
        return <Terminal size={22} style={{ color: "#a855f7" }} />;
      default:
        return <Layers size={22} className="text-accent" />;
    }
  };

  const filteredServices = CLOUD_SERVICES.filter(
    s => filter === "All" || s.category === filter
  );

  return (
    <div className="page">
      <PageHeader
        title="Services Catalog"
        subtitle="Explore and deploy production compute runtimes, managed databases, and developer infrastructure."
      />

      {/* Filter Tabs */}
      <div className="catalog-filter-bar">
        {(["All", "Compute", "Storage", "DevOps"] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`catalog-tab ${filter === cat ? "catalog-tab-active" : ""}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Services Grid */}
      <div className="service-grid" style={{ marginBottom: "2.5rem" }}>
        {filteredServices.map(svc => (
          <div key={svc.id} className="card card-hoverable service-card-box">
            <div className="service-top-row">
              <div className="service-icon-wrap">
                {getIcon(svc.id)}
              </div>
              <span className="badge badge-ready">
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                Active
              </span>
            </div>

            <div className="service-category-tag">{svc.category}</div>
            <h3 className="service-card-title">{svc.name}</h3>
            <div className="service-card-tagline">{svc.tagline}</div>
            <p className="service-card-body">{svc.description}</p>

            <div className="service-specs-chip">
              {svc.specs}
            </div>

            <div style={{ marginTop: "auto", paddingTop: "1rem" }}>
              <Link href={svc.href || "/dashboard"} className="btn btn-primary" style={{ width: "100%" }}>
                <span>Launch Service</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Platform Capabilities & Standards */}
      <div className="platform-standards-card card">
        <h2 className="section-card-title" style={{ marginBottom: "0.5rem" }}>
          Platform Standards
        </h2>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.5rem" }}>
          All Whizan Cloud services run on dedicated, isolated infrastructure designed for production reliability.
        </p>

        <div className="standards-grid">
          <div className="standard-item">
            <ShieldCheck size={20} className="text-accent" />
            <div>
              <div className="standard-title">Automated SSL & Edge Routing</div>
              <div className="standard-desc">Wildcard edge SSL termination with automatic zero-downtime deployment cutovers.</div>
            </div>
          </div>

          <div className="standard-item">
            <Lock size={20} style={{ color: "#10b981" }} />
            <div>
              <div className="standard-title">Encrypted Secrets Storage</div>
              <div className="standard-desc">AES-256 encrypted environment variables securely injected at container startup.</div>
            </div>
          </div>

          <div className="standard-item">
            <Cpu size={20} style={{ color: "#38bdf8" }} />
            <div>
              <div className="standard-title">Resource Isolation</div>
              <div className="standard-desc">Strict compute quotas and memory limits ensure multi-tenant container stability.</div>
            </div>
          </div>

          <div className="standard-item">
            <Zap size={20} style={{ color: "#f59e0b" }} />
            <div>
              <div className="standard-title">PgBouncer Connection Pooling</div>
              <div className="standard-desc">High-throughput connection management for PostgreSQL without server exhaustion.</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .catalog-filter-bar {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.75rem;
          border-bottom: 1px solid var(--card-border);
          padding-bottom: 0.75rem;
        }

        .catalog-tab {
          padding: 0.45rem 1rem;
          border-radius: 8px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--muted);
          font-size: 0.85rem;
          font-weight: 550;
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: inherit;
        }
        .catalog-tab:hover {
          color: var(--foreground);
          background: var(--bg-inset);
        }
        .catalog-tab-active {
          color: var(--foreground);
          background: var(--bg-inset);
          border-color: var(--card-border);
        }

        .service-card-box {
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          min-height: 280px;
          border: 1px solid var(--card-border);
          border-radius: var(--radius);
        }
        .service-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .service-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .service-category-tag {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--muted);
          margin-bottom: 0.25rem;
        }
        .service-card-title {
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--foreground);
          margin-bottom: 0.25rem;
        }
        .service-card-tagline {
          font-size: 0.8rem;
          color: var(--accent);
          font-weight: 550;
          margin-bottom: 0.75rem;
        }
        .service-card-body {
          font-size: 0.835rem;
          color: var(--muted);
          line-height: 1.5;
          margin-bottom: 1rem;
        }
        .service-specs-chip {
          display: inline-block;
          font-size: 0.72rem;
          font-family: var(--font-geist-mono), monospace;
          color: var(--muted);
          background: var(--bg-inset);
          padding: 0.25rem 0.55rem;
          border-radius: 6px;
          border: 1px solid var(--card-border);
          margin-top: auto;
          margin-bottom: 0.5rem;
        }

        .platform-standards-card {
          padding: 1.75rem;
          border-radius: var(--radius-lg);
          border: 1px solid var(--card-border);
        }
        .standards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem;
        }
        .standard-item {
          display: flex;
          align-items: flex-start;
          gap: 0.85rem;
        }
        .standard-title {
          font-size: 0.9rem;
          font-weight: 650;
          color: var(--foreground);
          margin-bottom: 0.25rem;
        }
        .standard-desc {
          font-size: 0.8rem;
          color: var(--muted);
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
