"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import {
  Globe,
  Server,
  ArrowRight,
  ArrowLeft,
  Github,
  Zap,
  ShieldCheck,
  Cpu,
  Layers,
  Sparkles,
  AlertTriangle,
  Mail,
} from "lucide-react";
import { useState } from "react";
import { useSystemStatus } from "@/hooks/useSystemStatus";
import { VmOfflineModal } from "@/components/vm-offline-modal";

export default function SelectDeployTypePage() {
  const { vmOnline } = useSystemStatus();
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <Link href="/dashboard" className="breadcrumb">
        <ArrowLeft size={15} /> Back to Overview
      </Link>

      <PageHeader
        title="Choose Service Deployment Type"
        subtitle="Select whether you are deploying a frontend web application or an isolated backend microservice from GitHub."
      />

      {!vmOnline && (
        <div
          style={{
            marginTop: "1.25rem",
            padding: "1.25rem 1.5rem",
            borderRadius: "var(--radius)",
            background: "var(--warning-bg)",
            border: "1px solid var(--warning-border)",
            display: "flex",
            alignItems: "flex-start",
            gap: "1rem",
          }}
        >
          <AlertTriangle size={22} style={{ color: "var(--warning)", flexShrink: 0, marginTop: "2px" }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--foreground)" }}>
              New Deployments Temporarily Paused
            </div>
            <div style={{ fontSize: "0.88rem", color: "var(--muted)", marginTop: "4px", lineHeight: 1.5 }}>
              The administration has temporarily stopped new deployments and serving existing applications until further notice. The cloud build-worker is currently powered down for scheduled maintenance.
            </div>
            <div style={{ marginTop: "0.75rem" }}>
              <Link
                href="/dashboard/contact"
                className="btn btn-secondary btn-sm"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <Mail size={14} /> Contact Administration for Reactivation
              </Link>
            </div>
          </div>
        </div>
      )}

      <VmOfflineModal
        isOpen={offlineModalOpen}
        onClose={() => setOfflineModalOpen(false)}
        actionType="deploy"
      />

      <div className="deploy-type-grid" style={{ marginTop: "1.5rem" }}>
        {/* Frontend Web App Option */}
        <Link
          href={vmOnline ? "/dashboard/projects/new" : "#"}
          onClick={(e) => {
            if (!vmOnline) {
              e.preventDefault();
              setOfflineModalOpen(true);
            }
          }}
          className="deploy-type-card card-glow-indigo"
        >
          <div className="card-top-icon icon-indigo">
            <Globe size={28} />
          </div>

          <div className="card-body-content">
            <div className="card-badge badge-indigo">
              <Sparkles size={12} /> Frontend Edge Hosting
            </div>
            <h2 className="deploy-card-title">Frontend Web Application</h2>
            <p className="deploy-card-desc">
              Deploy static websites or SSR applications built with Next.js, Vite, React SPA, or Astro directly to edge SSL nodes.
            </p>

            <ul className="deploy-card-bullets">
              <li>
                <Zap size={14} className="text-accent" /> Automated Next.js / Vite build engine
              </li>
              <li>
                <ShieldCheck size={14} className="text-accent" /> Instant edge wildcard SSL & custom domains
              </li>
              <li>
                <Github size={14} className="text-accent" /> Connect public or private GitHub repos
              </li>
            </ul>
          </div>

          <div className="deploy-card-footer">
            <span className="deploy-btn-label">
              Deploy Frontend App <ArrowRight size={16} />
            </span>
          </div>
        </Link>

        {/* Backend Container Service Option */}
        <Link
          href={vmOnline ? "/dashboard/backend/new" : "#"}
          onClick={(e) => {
            if (!vmOnline) {
              e.preventDefault();
              setOfflineModalOpen(true);
            }
          }}
          className="deploy-type-card card-glow-emerald"
        >
          <div className="card-top-icon icon-emerald">
            <Server size={28} />
          </div>

          <div className="card-body-content">
            <div className="card-badge badge-emerald">
              <Cpu size={12} /> Containerized Compute
            </div>
            <h2 className="deploy-card-title">Backend API & Service</h2>
            <p className="deploy-card-desc">
              Deploy long-running Node.js, Python, or Go APIs in Docker containers with private service mesh routing.
            </p>

            <ul className="deploy-card-bullets">
              <li>
                <Layers size={14} style={{ color: "#10b981" }} /> Public cloud edge ingress with automated routing
              </li>
              <li>
                <Zap size={14} style={{ color: "#10b981" }} /> Configurable compute allocation & health probes
              </li>
              <li>
                <Github size={14} style={{ color: "#10b981" }} /> Connect public/private GitHub repo or direct upload
              </li>
            </ul>
          </div>

          <div className="deploy-card-footer footer-emerald">
            <span className="deploy-btn-label emerald-btn-text">
              Deploy Backend Service <ArrowRight size={16} />
            </span>
          </div>
        </Link>
      </div>

      <style>{`
        .deploy-type-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }

        .deploy-type-card {
          display: flex;
          flex-direction: column;
          padding: 1.75rem;
          border-radius: 16px;
          background: var(--card);
          border: 1px solid var(--card-border);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          text-decoration: none;
          position: relative;
          overflow: hidden;
        }

        .deploy-type-card:hover {
          transform: translateY(-4px);
          border-color: var(--accent);
          box-shadow: 0 12px 30px -4px rgba(99, 102, 241, 0.2);
        }

        .card-glow-indigo:hover {
          border-color: rgba(99, 102, 241, 0.5);
          box-shadow: 0 12px 35px -4px rgba(99, 102, 241, 0.25);
        }

        .card-glow-emerald:hover {
          border-color: rgba(16, 185, 129, 0.5);
          box-shadow: 0 12px 35px -4px rgba(16, 185, 129, 0.25);
        }

        .card-top-icon {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1.25rem;
        }

        .icon-indigo {
          background: rgba(99, 102, 241, 0.12);
          color: #818cf8;
          border: 1px solid rgba(99, 102, 241, 0.25);
        }

        .icon-emerald {
          background: rgba(16, 185, 129, 0.12);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.25);
        }

        .card-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 0.2rem 0.6rem;
          border-radius: 6px;
          margin-bottom: 0.75rem;
        }
        .badge-indigo {
          background: rgba(99, 102, 241, 0.1);
          color: #818cf8;
        }
        .badge-emerald {
          background: rgba(16, 185, 129, 0.1);
          color: #34d399;
        }

        .deploy-card-title {
          font-size: 1.25rem;
          font-weight: 750;
          color: var(--foreground);
          margin-bottom: 0.5rem;
        }

        .deploy-card-desc {
          font-size: 0.84rem;
          color: var(--muted);
          line-height: 1.5;
          margin-bottom: 1.25rem;
        }

        .deploy-card-bullets {
          list-style: none;
          padding: 0;
          margin: 0 0 1.5rem 0;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
          font-size: 0.8rem;
          color: var(--foreground);
        }

        .deploy-card-bullets li {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .deploy-card-footer {
          margin-top: auto;
          padding-top: 1rem;
          border-top: 1px solid var(--card-border);
        }

        .deploy-btn-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-weight: 650;
          font-size: 0.9rem;
          color: var(--accent);
          transition: transform 0.2s ease;
        }
        .emerald-btn-text {
          color: #10b981;
        }

        .deploy-type-card:hover .deploy-btn-label {
          transform: translateX(4px);
        }

        @media (max-width: 680px) {
          .deploy-type-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
