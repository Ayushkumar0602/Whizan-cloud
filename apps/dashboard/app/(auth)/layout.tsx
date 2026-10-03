"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BrandMark } from "@/components/brand";
import { Globe, Server, Database, ShieldCheck, Zap } from "lucide-react";
import { getSafeRedirectUrl } from "@/lib/redirect";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      const search = typeof window !== "undefined" ? window.location.search : "";
      const params = new URLSearchParams(search);
      const redirectParam = params.get("redirect");
      const destination = getSafeRedirectUrl(redirectParam, "/dashboard");
      router.replace(destination);
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="page-loading" style={{ minHeight: "100vh" }}>
        <div className="spinner" />
      </div>
    );
  }

  const features = [
    {
      icon: <Globe size={18} style={{ color: "#38bdf8" }} />,
      title: "Global Edge CDN",
      desc: "Zero-configuration deployments with automated wildcard SSL and edge routing.",
    },
    {
      icon: <Server size={18} className="text-accent" />,
      title: "Container Runtimes",
      desc: "Run Node.js, Python, Go, and Docker microservices with live process telemetry.",
    },
    {
      icon: <Database size={18} style={{ color: "#818cf8" }} />,
      title: "Managed Persistence",
      desc: "Dedicated PostgreSQL clusters with PgBouncer connection pooling and Redis caching.",
    },
  ];

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <BrandMark href="/" />
        <div style={{ marginTop: "3rem" }}>
          <div className="auth-badge">
            <span className="auth-dot" />
            <span>Developer Cloud</span>
          </div>
          <h1 className="auth-title">Deploy with speed, scale with precision.</h1>
          <p className="auth-lead">
            The unified cloud platform for modern engineering teams. Ship frontends, microservices, and databases in seconds.
          </p>
        </div>

        <div className="auth-features-list">
          {features.map((f, i) => (
            <div key={i} className="auth-feature-row">
              <div className="auth-feature-icon">{f.icon}</div>
              <div>
                <div className="auth-feature-title">{f.title}</div>
                <div className="auth-feature-desc">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="auth-aside-footer">
          <ShieldCheck size={14} className="text-accent" />
          <span>Enterprise TLS 1.3 Encryption Standard</span>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">{children}</div>
      </main>

      <style>{`
        .auth-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          background: var(--background);
        }
        .auth-aside {
          padding: 3rem 3.5rem;
          background:
            radial-gradient(700px 350px at 0% 0%, rgba(99, 102, 241, 0.14), transparent 60%),
            #07090e;
          border-right: 1px solid var(--card-border);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .auth-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.25rem 0.65rem;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 9999px;
          font-size: 0.74rem;
          font-weight: 600;
          color: var(--accent);
          margin-bottom: 1rem;
        }
        .auth-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
        }

        .auth-title {
          font-size: 2.25rem;
          letter-spacing: -0.04em;
          color: var(--foreground);
          line-height: 1.15;
          font-weight: 800;
          margin-bottom: 0.85rem;
        }
        .auth-lead {
          color: var(--muted);
          line-height: 1.55;
          font-size: 0.95rem;
          max-width: 30rem;
        }

        .auth-features-list {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          margin: 3rem 0;
        }
        .auth-feature-row {
          display: flex;
          align-items: flex-start;
          gap: 0.85rem;
        }
        .auth-feature-icon {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--card-border);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .auth-feature-title {
          font-size: 0.9rem;
          font-weight: 650;
          color: var(--foreground);
          margin-bottom: 0.15rem;
        }
        .auth-feature-desc {
          font-size: 0.8rem;
          color: var(--muted);
          line-height: 1.45;
        }

        .auth-aside-footer {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: var(--muted);
        }

        .auth-main {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2.5rem 1.5rem;
          background: radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.04) 0%, transparent 60%);
        }
        .auth-card {
          width: 100%;
          max-width: 420px;
          background: var(--card);
          backdrop-filter: blur(16px);
          border: 1px solid var(--card-border);
          border-radius: var(--radius-lg);
          padding: 2.25rem;
          box-shadow: var(--shadow);
        }

        @media (max-width: 900px) {
          .auth-shell {
            grid-template-columns: 1fr;
          }
          .auth-aside {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
