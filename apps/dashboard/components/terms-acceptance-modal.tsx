"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { auth } from "@/lib/api";
import { toast } from "sonner";
import {
  ShieldAlert,
  FileText,
  CheckCircle2,
  ExternalLink,
  LogOut,
  RefreshCw,
  Cpu,
  Moon,
  ShieldBan,
  Database,
  Lock,
} from "lucide-react";

export function TermsAcceptanceModal() {
  const { user, updateUser, logout } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // If user is not logged in or has already accepted terms, do not render
  if (!user || user.termsAccepted === true) {
    return null;
  }

  async function handleAccept() {
    if (!agreed) {
      toast.error("Please confirm your acceptance of the Terms of Service to continue.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await auth.acceptTerms({ version: "2026-10-v1" });
      updateUser({
        termsAccepted: true,
        termsAcceptedAt: new Date().toISOString(),
        termsVersion: res.user?.termsVersion || "2026-10-v1",
      });
      toast.success("Terms of Service accepted. Console access unlocked!");
    } catch (err: any) {
      toast.error(err.message || "Failed to accept terms. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="terms-barrier-overlay" role="dialog" aria-modal="true">
      <div className="terms-barrier-card">
        {/* Header */}
        <div className="terms-barrier-header">
          <div className="terms-barrier-header-icon">
            <ShieldAlert size={22} className="text-amber-500" />
          </div>
          <div className="terms-barrier-header-text">
            <div className="terms-barrier-badge">Action Required • Tenant Governance</div>
            <h2 className="terms-barrier-title">Terms of Service & Acceptable Use Policy</h2>
            <p className="terms-barrier-meta">Version 2026-10-v1 • Effective October 26, 2026</p>
          </div>
        </div>

        {/* Notice description */}
        <div className="terms-barrier-intro">
          Whizan Cloud has updated its platform hosting governance and compute terms. To continue deploying
          services, managing databases, and using your console, please review and accept the agreement below.
        </div>

        {/* Key Governance Highlights Grid */}
        <div className="terms-highlights-grid">
          <div className="terms-highlight-item">
            <Cpu size={15} className="terms-highlight-icon text-indigo-500" />
            <div>
              <span className="terms-highlight-label">Isolated Sandboxes</span>
              <p className="terms-highlight-desc">Edge functions and containers run in secure, isolated namespaces.</p>
            </div>
          </div>
          <div className="terms-highlight-item">
            <Moon size={15} className="terms-highlight-icon text-sky-500" />
            <div>
              <span className="terms-highlight-label">Automated Eco-Standby</span>
              <p className="terms-highlight-desc">Idle Hobby nodes hibernate ($0/hr) after 15 min and auto-wake on traffic.</p>
            </div>
          </div>
          <div className="terms-highlight-item">
            <ShieldBan size={15} className="terms-highlight-icon text-rose-500" />
            <div>
              <span className="terms-highlight-label">Zero-Tolerance Misuse</span>
              <p className="terms-highlight-desc">Crypto mining, DDoS botnets, phishing, and scraping trigger immediate termination.</p>
            </div>
          </div>
          <div className="terms-highlight-item">
            <Database size={15} className="terms-highlight-icon text-emerald-500" />
            <div>
              <span className="terms-highlight-label">100% Data Sovereignty</span>
              <p className="terms-highlight-desc">You retain full copyright over your application source code and storage objects.</p>
            </div>
          </div>
        </div>

        {/* Scrollable Terms Content */}
        <div className="terms-scroll-pane">
          <h4 className="terms-section-title">1. Platform Services & Compute Runtimes</h4>
          <p className="terms-section-text">
            Whizan Cloud Service (&quot;Whizan Cloud&quot;) provides high-performance web hosting, V8 serverless edge functions,
            managed PostgreSQL databases, Cloud Object Storage, and zero-docker container microservices. Compute allocations
            are enforced according to your subscription tier (Hobby or Professional).
          </p>

          <h4 className="terms-section-title">2. Account Responsibility & Security Credentials</h4>
          <p className="terms-section-text">
            Tenants must supply accurate contact information and enroll in mandatory two-factor authentication (Biometric
            WebAuthn or Email OTP). You are solely accountable for all deployments, configuration changes, and actions performed
            using your account credentials or machine API keys (<code className="terms-code">whz_live_...</code>, <code className="terms-code">whz_stg_live_...</code>).
          </p>

          <h4 className="terms-section-title">3. Acceptable Use Policy (AUP) — Strictly Enforced</h4>
          <p className="terms-section-text">
            You agree never to utilize Whizan Cloud infrastructure for:
          </p>
          <ul className="terms-list">
            <li>Cryptocurrency mining, proof-of-work solvers, or distributed blockchain mining.</li>
            <li>Denial of service (DoS/DDoS) attacks, network port stress testing, or botnet command-and-control operations.</li>
            <li>Malicious payloads, viruses, credential harvesting, phishing sites, or malware distribution.</li>
            <li>Unsolicited bulk email distribution (SPAM) or unauthorized automated scraping of third-party platforms.</li>
            <li>Any activity violating local, national, or international statutes.</li>
          </ul>

          <h4 className="terms-section-title">4. Eco-Standby & Resource Quotas</h4>
          <p className="terms-section-text">
            To prevent energy waste, compute nodes on the Hobby tier automatically enter an eco-standby state when idle for more
            than 15 minutes. Services seamlessly wake upon incoming HTTP traffic. Tenants may upgrade to Professional tier for
            dedicated continuous execution and elevated RAM/CPU quotas.
          </p>

          <h4 className="terms-section-title">5. Data Ownership, Backups & Privacy</h4>
          <p className="terms-section-text">
            You retain 100% ownership, copyright, and intellectual property rights to your source code, container images,
            and object storage assets. You grant Whizan Cloud a non-exclusive license strictly to build, host, and route your
            applications. You remain responsible for maintaining regular off-site backups of mission-critical databases.
          </p>

          <h4 className="terms-section-title">6. Limitation of Liability</h4>
          <p className="terms-section-text">
            Services are provided &quot;AS IS&quot; without warranties of any kind. To the fullest extent permitted by law, Whizan Cloud
            disclaims liability for indirect, incidental, special, or consequential damages resulting from downtime or maintenance.
          </p>
        </div>

        {/* Confirmation Checkbox */}
        <div className="terms-confirm-box">
          <label className="terms-confirm-label">
            <input
              type="checkbox"
              id="dashboard-accept-terms-checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="terms-checkbox"
            />
            <span className="terms-confirm-text">
              I have read, understand, and agree to be bound by the Whizan Cloud Terms of Service, Acceptable Use Policy,
              and Privacy Policy.
            </span>
          </label>
        </div>

        {/* Actions Footer */}
        <div className="terms-barrier-footer">
          <div className="terms-footer-links">
            <a
              href="/terms"
              target="_blank"
              rel="noreferrer"
              className="terms-link-external"
            >
              <span>View Full Terms Page</span>
              <ExternalLink size={13} />
            </a>
            <span className="terms-link-separator">•</span>
            <button
              type="button"
              onClick={() => logout()}
              className="terms-link-logout"
            >
              <LogOut size={13} />
              <span>Sign out</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleAccept}
            disabled={!agreed || submitting}
            className="btn btn-primary"
            style={{ padding: "0.6rem 1.4rem", fontSize: "0.88rem", minWidth: 200 }}
          >
            {submitting ? (
              <>
                <RefreshCw size={15} className="spin-icon" />
                <span>Saving Acceptance...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
                <span>Accept & Continue to Console</span>
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        .terms-barrier-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          background: rgba(15, 23, 42, 0.78);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.25rem;
          animation: barrierFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes barrierFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .terms-barrier-card {
          width: 100%;
          max-width: 680px;
          max-height: 90vh;
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 25px 60px -15px rgba(15, 23, 42, 0.35);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          animation: barrierSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes barrierSlideUp {
          from { transform: translateY(16px) scale(0.98); }
          to { transform: translateY(0) scale(1); }
        }

        .terms-barrier-header {
          display: flex;
          align-items: flex-start;
          gap: 0.85rem;
          padding: 1.25rem 1.5rem 1rem 1.5rem;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
        }

        .terms-barrier-header-icon {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          background: #fffbeb;
          border: 1px solid #fef3c7;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .terms-barrier-badge {
          display: inline-block;
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 0.15rem 0.5rem;
          border-radius: 4px;
          background: #fef3c7;
          color: #b45309;
          border: 1px solid #fde68a;
          margin-bottom: 0.3rem;
        }

        .terms-barrier-title {
          font-size: 1.12rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
          line-height: 1.3;
        }

        .terms-barrier-meta {
          font-size: 0.74rem;
          color: #64748b;
          margin: 0.2rem 0 0 0;
        }

        .terms-barrier-intro {
          padding: 0.85rem 1.5rem 0.6rem 1.5rem;
          font-size: 0.82rem;
          line-height: 1.45;
          color: #475569;
        }

        .terms-highlights-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.5rem;
          padding: 0 1.5rem 0.85rem 1.5rem;
        }

        @media (max-width: 600px) {
          .terms-highlights-grid {
            grid-template-columns: 1fr;
          }
        }

        .terms-highlight-item {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          padding: 0.55rem 0.7rem;
          border-radius: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }

        .terms-highlight-icon {
          margin-top: 2px;
          flex-shrink: 0;
        }

        .terms-highlight-label {
          display: block;
          font-size: 0.76rem;
          font-weight: 650;
          color: #1e293b;
        }

        .terms-highlight-desc {
          font-size: 0.7rem;
          line-height: 1.35;
          color: #64748b;
          margin: 0.1rem 0 0 0;
        }

        .terms-scroll-pane {
          flex: 1;
          overflow-y: auto;
          margin: 0 1.5rem;
          padding: 0.85rem 1rem;
          border-radius: 8px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          max-height: 220px;
        }

        .terms-section-title {
          font-size: 0.82rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0.8rem 0 0.25rem 0;
        }

        .terms-section-title:first-child {
          margin-top: 0;
        }

        .terms-section-text {
          font-size: 0.78rem;
          line-height: 1.45;
          color: #475569;
          margin: 0;
        }

        .terms-list {
          margin: 0.35rem 0 0.5rem 1.15rem;
          padding: 0;
          font-size: 0.77rem;
          line-height: 1.4;
          color: #475569;
        }

        .terms-list li {
          margin-bottom: 0.2rem;
        }

        .terms-code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.72rem;
          padding: 0.1rem 0.3rem;
          background: #e2e8f0;
          border-radius: 4px;
          color: #0f172a;
        }

        .terms-confirm-box {
          margin: 0.85rem 1.5rem 0.4rem 1.5rem;
          padding: 0.75rem 0.9rem;
          border-radius: 8px;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
        }

        .terms-confirm-label {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          cursor: pointer;
          user-select: none;
        }

        .terms-checkbox {
          width: 17px;
          height: 17px;
          margin-top: 1.5px;
          accent-color: var(--accent, #4f46e5);
          cursor: pointer;
          flex-shrink: 0;
        }

        .terms-confirm-text {
          font-size: 0.8rem;
          line-height: 1.4;
          font-weight: 550;
          color: #1e293b;
        }

        .terms-barrier-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.9rem 1.5rem;
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .terms-footer-links {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          font-size: 0.78rem;
        }

        .terms-link-external {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          color: var(--accent, #4f46e5);
          font-weight: 600;
          text-decoration: none;
        }

        .terms-link-external:hover {
          text-decoration: underline;
        }

        .terms-link-separator {
          color: #cbd5e1;
        }

        .terms-link-logout {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          background: none;
          border: none;
          padding: 0;
          color: #64748b;
          font-size: inherit;
          cursor: pointer;
          font-family: inherit;
        }

        .terms-link-logout:hover {
          color: #ef4444;
        }

        .spin-icon {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
