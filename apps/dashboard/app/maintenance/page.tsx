"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  Server,
  Database,
  RefreshCw,
  ArrowLeft,
  Sparkles,
  ExternalLink,
  Layers,
  Cpu,
} from "lucide-react";

function MaintenanceContent({
  initialSlug = "",
  initialName = "",
}: {
  initialSlug?: string;
  initialName?: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const slug = initialSlug || searchParams.get("slug") || "";
  const serviceName = initialName || searchParams.get("name") || slug || "Your Service";
  const rawTargetUrl = searchParams.get("url") || (slug ? `http://${slug}.20.2.136.11.nip.io` : "");

  const [checking, setChecking] = useState(false);
  const [countdown, setCountdown] = useState(12);
  const [isRecovered, setIsRecovered] = useState(false);
  const [checkCount, setCheckCount] = useState(0);

  // Probes VM status
  const checkStatus = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/vm-status?t=" + Date.now(), { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.online) {
          setIsRecovered(true);
          // If a target URL was requested, redirect back to it
          if (rawTargetUrl) {
            setTimeout(() => {
              window.location.replace(rawTargetUrl);
            }, 1200);
          }
          return;
        }
      }
    } catch {}
    setChecking(false);
    setCountdown(12);
    setCheckCount((prev) => prev + 1);
  };

  // Auto-probe countdown
  useEffect(() => {
    if (isRecovered) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          checkStatus();
          return 12;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRecovered, rawTargetUrl]);

  return (
    <div className="maintenance-wrapper">
      {/* Ambient background glowing elements */}
      <div className="ambient-radial" />
      <div className="ambient-blob-1" />
      <div className="ambient-blob-2" />

      <div className="maintenance-card">
        {/* Brand Header */}
        <div className="card-brand-header">
          <Link href="/dashboard" className="brand-logo-link">
            <img
              src="/whizan.png"
              alt="Whizan Cloud Services"
              className="brand-logo-hero"
            />
          </Link>
        </div>

        {/* Maintenance Badge */}
        <div className="maintenance-pill">
          <span className="pulsing-amber-dot" />
          <span className="pill-text">CLOUD INFRASTRUCTURE MAINTENANCE • FREE TIER</span>
        </div>

        {/* Hero Title */}
        <h1 className="hero-title">
          Infrastructure Under Scheduled Maintenance
        </h1>

        <p className="hero-description">
          Compute nodes and edge routing mesh are temporarily offline for maintenance and optimizations.
          All persistent databases, project source code, and deployment records are{" "}
          <strong style={{ color: "#059669" }}>100% safely preserved</strong> in cloud storage.
        </p>

        {/* Requested Service Target (if user clicked a project deployment link) */}
        {slug && (
          <div className="target-service-card">
            <div className="target-service-info">
              <span className="target-badge">Requested Deployment</span>
              <span className="target-name">{serviceName}</span>
              <span className="target-url mono">{rawTargetUrl.replace(/^https?:\/\//, "")}</span>
            </div>
            <div className="target-status-badge">
              <span className="status-dot-amber" />
              <span>Awaiting Node Recovery</span>
            </div>
          </div>
        )}

        {/* Infrastructure Guarantee Grid */}
        <div className="guarantee-grid">
          <div className="guarantee-card">
            <div className="guarantee-icon-wrap green">
              <Database size={18} color="#059669" />
            </div>
            <div>
              <div className="guarantee-title">PostgreSQL & DBs</div>
              <div className="guarantee-desc">100% Safe (Supabase Cloud Storage)</div>
            </div>
          </div>

          <div className="guarantee-card">
            <div className="guarantee-icon-wrap green">
              <ShieldCheck size={18} color="#059669" />
            </div>
            <div>
              <div className="guarantee-title">Source Archives</div>
              <div className="guarantee-desc">Preserved with zero data loss</div>
            </div>
          </div>

          <div className="guarantee-card">
            <div className="guarantee-icon-wrap amber">
              <Server size={18} color="#d97706" />
            </div>
            <div>
              <div className="guarantee-title">Edge Routing</div>
              <div className="guarantee-desc">Auto-resumes upon node boot</div>
            </div>
          </div>

          <div className="guarantee-card">
            <div className="guarantee-icon-wrap amber">
              <Cpu size={18} color="#d97706" />
            </div>
            <div>
              <div className="guarantee-title">Build Workers</div>
              <div className="guarantee-desc">Scheduled queue pauses</div>
            </div>
          </div>
        </div>

        {/* Auto Recovery / Probe Status */}
        <div className={`recovery-banner ${isRecovered ? "recovered" : ""}`}>
          {isRecovered ? (
            <div className="recovery-success-box">
              <Sparkles size={20} color="#059669" />
              <div>
                <strong>Infrastructure is Back Online!</strong>
                <p>Nodes have recovered. Redirecting to your deployment now...</p>
              </div>
            </div>
          ) : (
            <div className="recovery-probe-box">
              <div className="probe-text-col">
                <span className="probe-title">Continuous Health Monitor</span>
                <span className="probe-sub">
                  Auto-checking node status in <strong>{countdown}s</strong> (Check #{checkCount + 1})
                </span>
              </div>
              <button
                onClick={checkStatus}
                disabled={checking}
                className="btn-probe"
              >
                <RefreshCw size={14} className={checking ? "spin" : ""} />
                <span>{checking ? "Probing..." : "Check Status Now"}</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="card-footer-actions">
          <Link href="/dashboard" className="btn-return-dash">
            <ArrowLeft size={16} />
            <span>Return to Dashboard</span>
          </Link>

          {rawTargetUrl && !isRecovered && (
            <a
              href={rawTargetUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-try-direct"
              title="Attempt direct connection to VM IP"
            >
              <span>Try Direct Connection</span>
              <ExternalLink size={14} />
            </a>
          )}
        </div>

        <div className="card-sub-footnote">
          Need 24/7 dedicated high availability without maintenance windows? Upgrade to Whizan Cloud Professional.
        </div>
      </div>

      <style jsx>{`
        .maintenance-wrapper {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2.5rem 1.25rem;
          background: #f8fafc;
          position: relative;
          overflow: hidden;
          font-family: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        .ambient-radial {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 20%, rgba(59, 130, 246, 0.08) 0%, rgba(248, 250, 252, 0) 70%);
          pointer-events: none;
        }
        .ambient-blob-1 {
          position: absolute;
          top: -100px;
          left: -100px;
          width: 450px;
          height: 450px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.07) 0%, rgba(255, 255, 255, 0) 70%);
          filter: blur(50px);
          pointer-events: none;
        }
        .ambient-blob-2 {
          position: absolute;
          bottom: -100px;
          right: -100px;
          width: 500px;
          height: 500px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, rgba(255, 255, 255, 0) 70%);
          filter: blur(50px);
          pointer-events: none;
        }

        .maintenance-card {
          width: 100%;
          max-width: 640px;
          background: #ffffff;
          border: 1px solid rgba(226, 232, 240, 0.9);
          border-radius: 20px;
          padding: 2.5rem 2.25rem;
          box-shadow: 0 10px 35px -5px rgba(15, 23, 42, 0.07), 0 0 1px 1px rgba(15, 23, 42, 0.04);
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .card-brand-header {
          margin-bottom: 1.5rem;
        }
        .brand-logo-link {
          display: inline-flex;
          align-items: center;
          padding: 0.5rem 1rem;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
          transition: all 0.2s ease;
        }
        .brand-logo-link:hover {
          border-color: #cbd5e1;
          transform: translateY(-1px);
        }
        .brand-logo-hero {
          height: 48px;
          width: auto;
          max-width: 210px;
          object-fit: contain;
          display: block;
        }

        .maintenance-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.32rem 0.85rem;
          border-radius: 9999px;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.3);
          color: #b45309;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          margin-bottom: 1.25rem;
        }
        .pulsing-amber-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #f59e0b;
          box-shadow: 0 0 8px #f59e0b;
          animation: pulse 1.8s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }

        .hero-title {
          font-size: 1.65rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #0f172a;
          margin-bottom: 0.75rem;
          line-height: 1.25;
        }
        .hero-description {
          font-size: 0.92rem;
          color: #64748b;
          line-height: 1.6;
          max-width: 520px;
          margin-bottom: 1.75rem;
        }

        .target-service-card {
          width: 100%;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 0.85rem 1.15rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.5rem;
          text-align: left;
        }
        .target-service-info {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .target-badge {
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          color: #64748b;
          letter-spacing: 0.05em;
        }
        .target-name {
          font-size: 0.92rem;
          font-weight: 700;
          color: #0f172a;
        }
        .target-url {
          font-size: 0.75rem;
          color: #3b82f6;
        }
        .mono {
          font-family: var(--font-geist-mono), monospace;
        }
        .target-status-badge {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.25rem 0.6rem;
          border-radius: 6px;
          background: rgba(245, 158, 11, 0.1);
          color: #b45309;
          font-size: 0.72rem;
          font-weight: 600;
        }
        .status-dot-amber {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #f59e0b;
        }

        .guarantee-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.85rem;
          width: 100%;
          margin-bottom: 1.75rem;
          text-align: left;
        }
        .guarantee-card {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.85rem 0.95rem;
          background: #ffffff;
          border: 1px solid #edf2f7;
          border-radius: 12px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
        }
        .guarantee-icon-wrap {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .guarantee-icon-wrap.green {
          background: rgba(16, 185, 129, 0.1);
        }
        .guarantee-icon-wrap.amber {
          background: rgba(245, 158, 11, 0.1);
        }
        .guarantee-title {
          font-size: 0.82rem;
          font-weight: 700;
          color: #1e293b;
        }
        .guarantee-desc {
          font-size: 0.7rem;
          color: #64748b;
        }

        .recovery-banner {
          width: 100%;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 0.9rem 1.15rem;
          margin-bottom: 1.75rem;
        }
        .recovery-banner.recovered {
          background: rgba(16, 185, 129, 0.08);
          border-color: rgba(16, 185, 129, 0.3);
        }
        .recovery-probe-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          text-align: left;
        }
        .probe-text-col {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }
        .probe-title {
          font-size: 0.84rem;
          font-weight: 700;
          color: #1e293b;
        }
        .probe-sub {
          font-size: 0.75rem;
          color: #64748b;
        }
        .btn-probe {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.45rem 0.85rem;
          border-radius: 8px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #334155;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-probe:hover:not(:disabled) {
          background: #f1f5f9;
          border-color: #94a3b8;
        }
        .btn-probe:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }

        .recovery-success-box {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          text-align: left;
          color: #065f46;
        }
        .recovery-success-box p {
          font-size: 0.78rem;
          margin: 0;
          color: #047857;
        }

        .card-footer-actions {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          width: 100%;
        }
        .btn-return-dash {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          padding: 0.72rem 1.15rem;
          border-radius: 10px;
          background: #0f172a;
          color: #ffffff;
          font-size: 0.86rem;
          font-weight: 600;
          text-decoration: none;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: all 0.15s ease;
        }
        .btn-return-dash:hover {
          background: #1e293b;
          transform: translateY(-1px);
        }

        .btn-try-direct {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.72rem 1rem;
          border-radius: 10px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #475569;
          font-size: 0.84rem;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.15s ease;
        }
        .btn-try-direct:hover {
          background: #f8fafc;
          border-color: #94a3b8;
        }

        .card-sub-footnote {
          margin-top: 1.5rem;
          font-size: 0.72rem;
          color: #94a3b8;
        }

        @media (max-width: 640px) {
          .guarantee-grid {
            grid-template-columns: 1fr;
          }
          .maintenance-card {
            padding: 1.75rem 1.25rem;
          }
          .recovery-probe-box {
            flex-direction: column;
            gap: 0.75rem;
            align-items: flex-start;
          }
          .card-footer-actions {
            flex-direction: column;
          }
          .btn-try-direct {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

export default function MaintenancePage({
  initialSlug = "",
  initialName = "",
}: {
  initialSlug?: string;
  initialName?: string;
} = {}) {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading...</div>}>
      <MaintenanceContent initialSlug={initialSlug} initialName={initialName} />
    </Suspense>
  );
}
