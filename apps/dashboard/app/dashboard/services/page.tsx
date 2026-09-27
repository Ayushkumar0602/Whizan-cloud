"use client";
import Link from "next/link";
import { CLOUD_SERVICES, DEPLOY_GUIDE } from "@/lib/services";
import { PageHeader } from "@/components/page-header";
import {
  ArrowRight,
  Server,
  Globe,
  Radio,
  Database,
  Layers,
  Sparkles,
  Zap,
  CheckCircle2
} from "lucide-react";

export default function ServicesPage() {
  const getIcon = (id: string) => {
    switch (id) {
      case "backend-hosting":
        return <Server size={22} className="text-accent" />;
      case "frontend-hosting":
        return <Globe size={22} style={{ color: "#38bdf8" }} />;
      case "private-mesh":
        return <Radio size={22} style={{ color: "#10b981" }} />;
      case "managed-postgres":
        return <Database size={22} style={{ color: "#818cf8" }} />;
      case "managed-redis":
        return <Zap size={22} style={{ color: "#f59e0b" }} />;
      default:
        return <Layers size={22} className="text-accent" />;
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Cloud Platform Catalog"
        subtitle="Unified control plane for isolated Docker runtimes, edge frontend applications, databases, and private service mesh discovery."
      />

      {/* Services Grid */}
      <div className="service-grid" style={{ marginBottom: "2.5rem" }}>
        {CLOUD_SERVICES.map(svc => (
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

            <h3 className="service-card-title">{svc.name}</h3>
            <div className="service-card-tagline">{svc.tagline}</div>
            <p className="service-card-body">{svc.description}</p>

            <Link href={svc.href || "/dashboard"} className="btn btn-secondary service-launch-btn">
              <span>Launch / Manage</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        ))}
      </div>

      {/* Architecture / How it Works Guide */}
      <div style={{ marginTop: "1rem" }}>
        <h2 className="block-title" style={{ marginBottom: "1rem" }}>
          Platform Architecture & Workflow
        </h2>

        <div className="guide-steps-grid">
          {DEPLOY_GUIDE.map(s => (
            <div key={s.n} className="card guide-card">
              <div className="guide-num mono">{s.n}</div>
              <h3 className="guide-title">{s.title}</h3>
              <p className="guide-body">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .service-card-box {
          display: flex;
          flex-direction: column;
          padding: 1.5rem;
          min-height: 230px;
        }
        .service-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.25rem;
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
        .service-card-title {
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--foreground);
          letter-spacing: -0.02em;
        }
        .service-card-tagline {
          font-size: 0.78rem;
          color: var(--accent);
          font-weight: 600;
          margin-top: 0.2rem;
          margin-bottom: 0.5rem;
        }
        .service-card-body {
          font-size: 0.84rem;
          color: var(--muted);
          line-height: 1.55;
          margin-bottom: 1.5rem;
          flex: 1;
        }
        .service-launch-btn {
          width: 100%;
          justify-content: space-between;
        }

        /* Architecture Steps Grid */
        .guide-steps-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1.25rem;
        }
        .guide-card {
          padding: 1.35rem;
          background: var(--bg-inset);
        }
        .guide-num {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--accent);
          margin-bottom: 0.5rem;
        }
        .guide-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--foreground);
          margin-bottom: 0.4rem;
        }
        .guide-body {
          font-size: 0.82rem;
          color: var(--muted);
          line-height: 1.5;
        }

        @media (max-width: 640px) {
          .guide-steps-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
