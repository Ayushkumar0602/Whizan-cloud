"use client";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { getApiBase } from "@/lib/api";
import { getBaseRouterDomain } from "@/lib/domains";
import { PageHeader } from "@/components/page-header";
import {
  User,
  Shield,
  Server,
  Globe,
  Database,
  Radio,
  Copy,
  Check,
  Calendar,
  Lock,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user } = useAuth();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const apiUrl = getApiBase();
  const edgeDomain = getBaseRouterDomain();
  const dashboardUrl = typeof window !== "undefined" ? window.location.origin : "https://whizan-cloud-service-dashboard.vercel.app";
  const isLocal = apiUrl.includes("localhost") || apiUrl.includes("127.0.0.1");

  const endpoints = [
    { label: "API Control Plane", value: apiUrl, desc: isLocal ? "Local Fastify REST Control Plane (:8000)" : "Fastify REST & SSE Control Plane on Render" },
    { label: "Dashboard Console", value: dashboardUrl, desc: isLocal ? "Local Next.js Dashboard (:3000)" : "Production Dashboard on Vercel" },
    { label: "Edge Ingress Gateway", value: `http://${edgeDomain}`, desc: isLocal ? "Local Edge Router (:8080)" : "Reverse proxy on Azure VM (20.2.136.11)" },
    { label: "Docker Mesh Bridge", value: "whizan-internal-network", desc: "Internal service mesh with DNS aliases" },
    { label: "PostgreSQL Database", value: isLocal ? "localhost:5432 / hostify" : "aws-0-ap-northeast-1.pooler.supabase.com:5432", desc: isLocal ? "Local PostgreSQL Docker Container" : "Supabase cloud persistence layer" },
    { label: "Redis & BullMQ", value: isLocal ? "localhost:6379" : "Upstash Redis (TLS)", desc: isLocal ? "Local Redis Docker Container" : "Upstash Redis queue & pub/sub broker" },
  ];

  function copyValue(val: string, key: string) {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    toast.success("Endpoint copied to clipboard");
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const initials = (user?.name || user?.email || "U")[0].toUpperCase();

  return (
    <div className="page" style={{ maxWidth: 840 }}>
      <PageHeader
        title="Settings & Workspace"
        subtitle="Manage your developer profile, workspace preferences, and cloud infrastructure endpoints."
      />

      <div className="settings-stack">
        {/* Profile Card */}
        <div className="card">
          <h2 className="card-title" style={{ fontSize: "1.05rem", marginBottom: "1.25rem" }}>
            User Profile
          </h2>

          <div className="profile-hero-row">
            <div className="user-avatar-xl">
              {initials}
            </div>
            <div className="profile-details-group">
              <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
                <h3 className="profile-name">{user?.name || "Developer"}</h3>
                <span className="role-pill">
                  <Shield size={11} /> Workspace Owner
                </span>
              </div>
              <div className="profile-email mono">{user?.email}</div>
              <div className="profile-date">
                <Calendar size={13} />
                <span>
                  Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "2026"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Local Infrastructure & Gateway Endpoints */}
        <div className="card">
          <div style={{ marginBottom: "1.25rem" }}>
            <h2 className="card-title" style={{ fontSize: "1.05rem" }}>
              Cloud & Mesh Endpoints
            </h2>
            <p className="card-sub">
              Network targets for local development, CLI tooling, and edge routing
            </p>
          </div>

          <div className="endpoints-list">
            {endpoints.map(ep => (
              <div key={ep.label} className="endpoint-row">
                <div className="endpoint-meta">
                  <span className="endpoint-label">{ep.label}</span>
                  <span className="endpoint-desc">{ep.desc}</span>
                </div>

                <div className="endpoint-right">
                  <code className="endpoint-value mono">{ep.value}</code>
                  <button
                    onClick={() => copyValue(ep.value, ep.label)}
                    className="copy-icon-btn"
                    title="Copy connection string"
                  >
                    {copiedKey === ep.label ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security & Access */}
        <div className="card">
          <h2 className="card-title" style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>
            Security & Authentication
          </h2>
          <p className="card-sub" style={{ marginBottom: "1.25rem" }}>
            JWT authentication sessions with automatic HttpOnly refresh cookies
          </p>

          <div className="security-notice-box">
            <Lock size={18} className="text-accent" />
            <div>
              <div style={{ fontWeight: 650, fontSize: "0.88rem", color: "var(--foreground)" }}>
                Secure HTTP-Only Session Active
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "2px" }}>
                Session tokens are automatically rotated and encrypted at the edge.
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .settings-stack {
          display: flex;
          flex-direction: column;
          gap: 1.75rem;
        }
        .card-sub {
          font-size: 0.8125rem;
          color: var(--muted);
          margin-top: 0.15rem;
        }

        /* Profile Row */
        .profile-hero-row {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          flex-wrap: wrap;
        }
        .user-avatar-xl {
          width: 68px;
          height: 68px;
          border-radius: 50%;
          background: var(--accent-gradient);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.75rem;
          font-weight: 800;
          box-shadow: 0 4px 16px var(--accent-glow);
          flex-shrink: 0;
        }
        .profile-details-group {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .profile-name {
          font-size: 1.25rem;
          font-weight: 750;
          color: var(--foreground);
        }
        .role-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.72rem;
          font-weight: 650;
          color: #10b981;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
          padding: 0.15rem 0.5rem;
          border-radius: 9999px;
        }
        .profile-email {
          font-size: 0.84rem;
          color: var(--muted);
        }
        .profile-date {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.76rem;
          color: var(--muted);
          margin-top: 0.2rem;
        }

        /* Endpoints List */
        .endpoints-list {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--card-border);
          border-radius: 8px;
          overflow: hidden;
        }
        .endpoint-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.85rem 1.15rem;
          border-bottom: 1px solid var(--card-border);
          background: var(--bg-inset);
          gap: 1rem;
          flex-wrap: wrap;
        }
        .endpoint-row:last-child {
          border-bottom: none;
        }
        .endpoint-meta {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .endpoint-label {
          font-size: 0.84rem;
          font-weight: 650;
          color: var(--foreground);
        }
        .endpoint-desc {
          font-size: 0.74rem;
          color: var(--muted);
        }
        .endpoint-right {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .endpoint-value {
          font-size: 0.8125rem;
          color: var(--foreground);
          background: var(--card);
          padding: 0.25rem 0.55rem;
          border-radius: 6px;
          border: 1px solid var(--card-border);
        }
        .copy-icon-btn {
          background: transparent;
          border: none;
          color: var(--muted);
          cursor: pointer;
          padding: 0.3rem;
          border-radius: 4px;
          display: flex;
          align-items: center;
          transition: all 0.15s ease;
        }
        .copy-icon-btn:hover {
          color: var(--foreground);
          background: rgba(255, 255, 255, 0.08);
        }

        /* Security Box */
        .security-notice-box {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 1rem 1.25rem;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: 8px;
        }

        @media (max-width: 640px) {
          .endpoint-row {
            flex-direction: column;
            align-items: flex-start;
          }
          .endpoint-right {
            width: 100%;
            justify-content: space-between;
          }
        }
      `}</style>
    </div>
  );
}
