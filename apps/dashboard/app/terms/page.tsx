import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import {
  ShieldCheck,
  Cpu,
  Moon,
  AlertTriangle,
  Lock,
  Database,
  ArrowLeft,
  FileText,
  ExternalLink,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service & Acceptable Use Policy — Whizan Cloud",
  description:
    "Review the terms governing compute runtimes, V8 edge functions, managed databases, cloud object storage, and platform governance on Whizan Cloud.",
};

export default function TermsPage() {
  return (
    <div className="terms-page-shell">
      {/* Top Navbar */}
      <header className="terms-nav">
        <div className="terms-nav-inner">
          <BrandMark href="/" />
          <div className="terms-nav-actions">
            <Link href="/login" className="terms-nav-link">
              Sign In
            </Link>
            <Link href="/register" className="btn btn-primary" style={{ padding: "0.45rem 1rem", fontSize: "0.84rem" }}>
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="terms-main-container">
        {/* Breadcrumb / Back button */}
        <div className="terms-breadcrumb">
          <Link href="/dashboard" className="terms-back-btn">
            <ArrowLeft size={14} />
            <span>Back to Console</span>
          </Link>
          <span className="terms-meta-pill">Version 2026-10-v1 • Effective Oct 26, 2026</span>
        </div>

        {/* Page Hero */}
        <section className="terms-hero">
          <div className="terms-badge">
            <ShieldCheck size={14} />
            <span>Platform Legal & Governance</span>
          </div>
          <h1 className="terms-hero-title">Terms of Service & Acceptable Use Policy</h1>
          <p className="terms-hero-subtitle">
            These terms define the rules, compute allocation limits, security expectations, and acceptable usage
            standards for deploying and operating web applications, background queue workers, and edge functions on Whizan Cloud.
          </p>
        </section>

        {/* Executive Highlights Grid */}
        <section className="terms-cards-grid">
          <div className="terms-card">
            <div className="terms-card-icon text-indigo-600 bg-indigo-50 border-indigo-100">
              <Cpu size={20} />
            </div>
            <h3 className="terms-card-title">Compute Sandboxing</h3>
            <p className="terms-card-text">
              All applications, V8 edge runtimes, and worker processes run in isolated, multi-tenant containerized
              namespaces with strict CPU and RAM boundary enforcement.
            </p>
          </div>

          <div className="terms-card">
            <div className="terms-card-icon text-sky-600 bg-sky-50 border-sky-100">
              <Moon size={20} />
            </div>
            <h3 className="terms-card-title">Eco-Standby Sleep Policy</h3>
            <p className="terms-card-text">
              To conserve energy and minimize unnecessary overhead, Hobby tier nodes enter zero-cost sleep ($0/hr) after
              15 minutes of inactivity and auto-wake on incoming traffic.
            </p>
          </div>

          <div className="terms-card">
            <div className="terms-card-icon text-rose-600 bg-rose-50 border-rose-100">
              <AlertTriangle size={20} />
            </div>
            <h3 className="terms-card-title">Zero Tolerance Misuse</h3>
            <p className="terms-card-text">
              Cryptocurrency mining, botnets, DDoS attacks, credential harvesters, and spam distribution are strictly
              prohibited and trigger immediate container destruction.
            </p>
          </div>

          <div className="terms-card">
            <div className="terms-card-icon text-emerald-600 bg-emerald-50 border-emerald-100">
              <Database size={20} />
            </div>
            <h3 className="terms-card-title">100% Data Ownership</h3>
            <p className="terms-card-text">
              You retain full copyright over your source code, databases, and uploaded media. Whizan Cloud holds no
              proprietary claim to your intellectual property.
            </p>
          </div>
        </section>

        {/* Detailed Legal Sections */}
        <article className="terms-article">
          <section className="terms-section" id="section-1">
            <h2 className="terms-h2">1. Platform Services & Runtime Architecture</h2>
            <p className="terms-p">
              Whizan Cloud Service (&quot;Whizan Cloud&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) provides a distributed platform for hosting
              fullstack web applications (Next.js, Vite, React, Astro), background queue workers (BullMQ, Celery),
              isolated serverless V8 edge functions, managed PostgreSQL database clusters, and S3-compatible Cloud Object Storage.
            </p>
            <p className="terms-p">
              Deployments benefit from Cloudflare-powered edge routing with automated wildcard SSL encryption (<code className="terms-inline-code">*.whizan.cloud</code>).
              By creating an account or deploying services, you agree to comply with all operational guidelines set forth herein.
            </p>
          </section>

          <section className="terms-section" id="section-2">
            <h2 className="terms-h2">2. Account Registration, Credentials & Mandatory 2FA</h2>
            <p className="terms-p">
              To maintain the integrity of our edge network, all users must register using authentic, verifiable email addresses.
              Disposable email addresses are subject to automated refusal.
            </p>
            <p className="terms-p">
              To defend against unauthorized cloud hijackings, Whizan Cloud enforces <strong>mandatory two-factor authentication</strong> (via
              hardware biometric WebAuthn or One-Time Passcode). You are solely responsible for securing all generated API keys
              (<code className="terms-inline-code">whz_live_...</code>, <code className="terms-inline-code">whz_stg_live_...</code>, <code className="terms-inline-code">whz_fn_live_...</code>).
              Any infrastructure action triggered using your credentials is treated as authorized by your organization.
            </p>
          </section>

          <section className="terms-section" id="section-3">
            <h2 className="terms-h2">3. Compute Quotas, Tiers & Eco-Standby Hibernation</h2>
            <p className="terms-p">
              Compute instances operate under two distinct tiers:
            </p>
            <ul className="terms-ul">
              <li>
                <strong>Hobby Tier</strong>: Intended for personal projects and development. Services are capped at 0.1 vCPU and 512MB RAM.
                Idle nodes automatically transition to eco-standby ($0.00/hr hibernation state) after 15 minutes of zero inbound traffic.
                Services automatically revive upon the next HTTP request via our edge gateway.
              </li>
              <li>
                <strong>Professional Tier</strong>: Provides persistent 24/7 dedicated compute instances (up to 8 vCPUs and 32GB RAM),
                uninterrupted background worker runtimes, custom domain SSL SLAs, and expanded storage quotas.
              </li>
            </ul>
          </section>

          <section className="terms-section" id="section-4">
            <h2 className="terms-h2">4. Acceptable Use Policy (AUP) — Strictly Prohibited Misuse</h2>
            <p className="terms-p">
              Whizan Cloud maintains a zero-tolerance policy against malicious or resource-exhausting behavior. You strictly agree NOT to:
            </p>
            <div className="terms-prohibited-grid">
              <div className="terms-prohibited-item">
                <strong>Cryptocurrency Mining:</strong> Running proof-of-work solvers, distributed hash generators, or blockchain mining binaries.
              </div>
              <div className="terms-prohibited-item">
                <strong>DDoS & Network Attacks:</strong> Initiating, relaying, or testing network attacks, port exhaustion, or botnet command-and-control.
              </div>
              <div className="terms-prohibited-item">
                <strong>Malware & Phishing:</strong> Distributing malicious payloads, trojans, ransomware, or deceptive credential harvesting pages.
              </div>
              <div className="terms-prohibited-item">
                <strong>Spam & Abusive Scraping:</strong> Transmitting unsolicited bulk communications or violating external websites&apos; terms of access.
              </div>
              <div className="terms-prohibited-item">
                <strong>Kernel & Namespace Tampering:</strong> Attempting to break out of Linux container sandboxes or probing our internal mesh network.
              </div>
              <div className="terms-prohibited-item">
                <strong>Illegal Content:</strong> Storing, transmitting, or serving defamatory, infringing, or unlawful media.
              </div>
            </div>
            <p className="terms-p" style={{ marginTop: "1rem" }}>
              <strong>Enforcement:</strong> Any detected violation of Section 4 will result in the immediate and permanent termination
              of offending services, revocation of API tokens, and blacklisting of the tenant without refund or prior warning.
            </p>
          </section>

          <section className="terms-section" id="section-5">
            <h2 className="terms-h2">5. Data Ownership, Copyright & Backups</h2>
            <p className="terms-p">
              You retain 100% intellectual property rights, copyright, and title to all source code, database contents,
              binaries, and bucket files uploaded to Whizan Cloud.
            </p>
            <p className="terms-p">
              Whizan Cloud is granted a strictly limited license to host, containerize, replicate, and serve your applications as necessary
              to provide the platform. While our infrastructure employs redundant storage arrays, you are responsible for maintaining
              independent, off-site backups of mission-critical databases and object storage assets.
            </p>
          </section>

          <section className="terms-section" id="section-6">
            <h2 className="terms-h2">6. Service Availability & Maintenance Windows</h2>
            <p className="terms-p">
              While Whizan Cloud strives for 99.9% uptime, services may occasionally experience brief interruptions during scheduled kernel
              updates, security patches, or router maintenance. We endeavor to announce major maintenance windows in advance via console banners.
            </p>
          </section>

          <section className="terms-section" id="section-7">
            <h2 className="terms-h2">7. Limitation of Liability</h2>
            <p className="terms-p">
              THE PLATFORM IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW,
              WHIZAN CLOUD AND ITS AFFILIATES SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES,
              INCLUDING LOSS OF REVENUE, DATA CORRUPTION, OR BUSINESS INTERRUPTION ARISING FROM PLATFORM USAGE.
            </p>
          </section>

          <section className="terms-section" id="section-8">
            <h2 className="terms-h2">8. Amendments & Contact</h2>
            <p className="terms-p">
              We reserve the right to amend these terms as the platform evolves. In the event of material revisions, tenants will be prompted
              to review and re-accept the updated terms upon logging into the console.
            </p>
            <p className="terms-p">
              For compliance, legal inquiries, or to report platform abuse, contact our legal team at{" "}
              <a href="mailto:legal@whizan.cloud" className="terms-inline-link">
                legal@whizan.cloud
              </a>.
            </p>
          </section>
        </article>

        {/* Footer info */}
        <footer className="terms-page-footer">
          <p>© {new Date().getFullYear()} Whizan Cloud Services. All rights reserved.</p>
          <div className="terms-footer-nav">
            <Link href="/privacy" className="terms-footer-link">
              Privacy Policy
            </Link>
            <span>•</span>
            <Link href="/contact" className="terms-footer-link">
              Support
            </Link>
            <span>•</span>
            <Link href="/dashboard" className="terms-footer-link">
              Console
            </Link>
          </div>
        </footer>
      </main>

      <style>{`
        .terms-page-shell {
          min-height: 100vh;
          background: #f8fafc;
          color: #0f172a;
          font-family: inherit;
        }

        .terms-nav {
          border-bottom: 1px solid #e2e8f0;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(10px);
          position: sticky;
          top: 0;
          z-index: 50;
        }

        .terms-nav-inner {
          max-width: 960px;
          margin: 0 auto;
          padding: 0.85rem 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .terms-nav-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .terms-nav-link {
          font-size: 0.85rem;
          font-weight: 550;
          color: #475569;
          text-decoration: none;
          transition: color 0.15s;
        }

        .terms-nav-link:hover {
          color: #0f172a;
        }

        .terms-main-container {
          max-width: 860px;
          margin: 0 auto;
          padding: 2.5rem 1.5rem 4rem 1.5rem;
        }

        .terms-breadcrumb {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.75rem;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        .terms-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.82rem;
          font-weight: 600;
          color: #4f46e5;
          text-decoration: none;
          transition: opacity 0.15s;
        }

        .terms-back-btn:hover {
          opacity: 0.8;
        }

        .terms-meta-pill {
          font-size: 0.74rem;
          color: #64748b;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          padding: 0.25rem 0.65rem;
          border-radius: 9999px;
        }

        .terms-hero {
          margin-bottom: 2.5rem;
        }

        .terms-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.75rem;
          font-weight: 650;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #4f46e5;
          background: rgba(79, 70, 229, 0.08);
          border: 1px solid rgba(79, 70, 229, 0.2);
          padding: 0.25rem 0.65rem;
          border-radius: 6px;
          margin-bottom: 0.75rem;
        }

        .terms-hero-title {
          font-size: 2.15rem;
          font-weight: 800;
          letter-spacing: -0.025em;
          color: #0f172a;
          margin: 0 0 0.85rem 0;
          line-height: 1.2;
        }

        .terms-hero-subtitle {
          font-size: 1.02rem;
          line-height: 1.6;
          color: #475569;
          margin: 0;
          max-width: 720px;
        }

        .terms-cards-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
          margin-bottom: 3rem;
        }

        @media (max-width: 640px) {
          .terms-cards-grid {
            grid-template-columns: 1fr;
          }
        }

        .terms-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 1.25rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }

        .terms-card-icon {
          width: 38px;
          height: 38px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 0.85rem;
          border: 1px solid;
        }

        .terms-card-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 0.35rem 0;
        }

        .terms-card-text {
          font-size: 0.82rem;
          line-height: 1.5;
          color: #64748b;
          margin: 0;
        }

        .terms-article {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 2.25rem 2.5rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
          margin-bottom: 3rem;
        }

        @media (max-width: 640px) {
          .terms-article {
            padding: 1.5rem;
          }
        }

        .terms-section {
          margin-bottom: 2.5rem;
          padding-bottom: 2rem;
          border-bottom: 1px solid #f1f5f9;
        }

        .terms-section:last-child {
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
        }

        .terms-h2 {
          font-size: 1.22rem;
          font-weight: 750;
          letter-spacing: -0.015em;
          color: #0f172a;
          margin: 0 0 0.85rem 0;
        }

        .terms-p {
          font-size: 0.9rem;
          line-height: 1.65;
          color: #334155;
          margin: 0 0 0.85rem 0;
        }

        .terms-p:last-child {
          margin-bottom: 0;
        }

        .terms-ul {
          margin: 0.5rem 0 1rem 1.4rem;
          padding: 0;
          font-size: 0.88rem;
          line-height: 1.6;
          color: #334155;
        }

        .terms-ul li {
          margin-bottom: 0.5rem;
        }

        .terms-inline-code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.82rem;
          padding: 0.15rem 0.4rem;
          border-radius: 4px;
          background: #f1f5f9;
          color: #0f172a;
          border: 1px solid #e2e8f0;
        }

        .terms-inline-link {
          color: #4f46e5;
          font-weight: 600;
          text-decoration: underline;
        }

        .terms-prohibited-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
          margin-top: 0.85rem;
        }

        @media (max-width: 640px) {
          .terms-prohibited-grid {
            grid-template-columns: 1fr;
          }
        }

        .terms-prohibited-item {
          padding: 0.75rem 0.85rem;
          border-radius: 8px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          font-size: 0.8rem;
          line-height: 1.45;
          color: #991b1b;
        }

        .terms-prohibited-item strong {
          color: #7f1d1d;
          display: block;
          margin-bottom: 0.15rem;
        }

        .terms-page-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.8rem;
          color: #64748b;
          border-top: 1px solid #e2e8f0;
          padding-top: 1.5rem;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        .terms-footer-nav {
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }

        .terms-footer-link {
          color: #64748b;
          text-decoration: none;
          transition: color 0.15s;
        }

        .terms-footer-link:hover {
          color: #0f172a;
        }
      `}</style>
    </div>
  );
}
