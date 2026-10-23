"use client";

import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BrandMark } from "@/components/brand";
import { Globe, Server, Database, ShieldCheck, Zap } from "lucide-react";
import { getSafeRedirectUrl } from "@/lib/redirect";
import { isTwoFactorTrusted } from "@/lib/webauthn";

import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Only redirect to dashboard if user is logged in AND their 2FA trust is still valid.
  // If 2FA trust has expired, keep them on the auth page so they can re-verify.
  useEffect(() => {
    if (!loading && user && isTwoFactorTrusted(user.email)) {
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
      icon: <Globe size={18} className="text-sky-600" />,
      title: "Global Edge CDN",
      desc: "Zero-configuration deployments with automated wildcard SSL and edge routing.",
    },
    {
      icon: <Server size={18} className="text-indigo-600" />,
      title: "Container Runtimes",
      desc: "Run Node.js, Python, Go, and Docker microservices with live process telemetry.",
    },
    {
      icon: <Database size={18} className="text-violet-600" />,
      title: "Managed Persistence",
      desc: "Dedicated PostgreSQL clusters with connection pooling and Redis caching.",
    },
  ];

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <BrandMark href="/" />
        <div style={{ marginTop: "2.5rem" }}>
          <div className="auth-badge">
            <span className="auth-dot" />
            <span>Developer Cloud Console</span>
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
          <ShieldCheck size={15} className="text-emerald-600" />
          <span>Enterprise TLS 1.3 Encryption Standard</span>
        </div>
      </aside>

      <main className="auth-main aurora-bg" style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: "1.25rem", right: "1.25rem", zIndex: 10 }}>
          <ThemeToggle variant="icon" />
        </div>
        <div className="auth-card">{children}</div>
      </main>

      <style>{`
        .auth-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          background: var(--background);
        }
        .auth-aside {
          padding: 3.5rem 4rem;
          background:
            radial-gradient(800px 400px at 0% 0%, rgba(224, 231, 255, 0.7), transparent 70%),
            radial-gradient(600px 300px at 100% 100%, rgba(207, 250, 254, 0.4), transparent 60%),
            var(--card);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        [data-theme='dark'] .auth-aside {
          background:
            radial-gradient(800px 400px at 0% 0%, rgba(79, 70, 229, 0.12), transparent 70%),
            radial-gradient(600px 300px at 100% 100%, rgba(56, 189, 248, 0.08), transparent 60%),
            var(--card);
        }

        .auth-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.25rem 0.7rem;
          background: rgba(79, 70, 229, 0.08);
          border: 1px solid rgba(79, 70, 229, 0.2);
          border-radius: 9999px;
          font-size: 0.74rem;
          font-weight: 600;
          color: var(--accent);
          margin-bottom: 1.25rem;
        }
        .auth-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 6px #10b981;
        }

        .auth-title {
          font-size: 2.2rem;
          letter-spacing: -0.04em;
          color: var(--foreground);
          line-height: 1.15;
          font-weight: 800;
          margin-bottom: 0.85rem;
        }
        .auth-lead {
          color: var(--muted);
          line-height: 1.6;
          font-size: 0.95rem;
          max-width: 30rem;
        }

        .auth-features-list {
          display: flex;
          flex-direction: column;
          gap: 1.35rem;
          margin: 3rem 0;
        }
        .auth-feature-row {
          display: flex;
          align-items: flex-start;
          gap: 0.9rem;
        }
        .auth-feature-icon {
          width: 38px;
          height: 38px;
          border-radius: 9px;
          background: var(--bg-inset);
          border: 1px solid var(--border);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
          display: flex;
          align-items: center;
          justifyContent: center;
          flex-shrink: 0;
        }
        .auth-feature-title {
          font-size: 0.9rem;
          font-weight: 650;
          color: var(--foreground);
          margin-bottom: 0.2rem;
        }
        .auth-feature-desc {
          font-size: 0.82rem;
          color: var(--muted);
          line-height: 1.45;
        }

        .auth-aside-footer {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.78rem;
          color: var(--muted);
          font-weight: 500;
        }

        .auth-main {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2.5rem 1.5rem;
        }
        .auth-card {
          width: 100%;
          max-width: 420px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 2.5rem;
          box-shadow: var(--shadow-lg);
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
