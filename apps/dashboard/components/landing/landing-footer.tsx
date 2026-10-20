"use client";

import Link from "next/link";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";

export function LandingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="wz-footer">
      <div className="wz-container">
        <div className="wz-footer-grid">
          {/* Brand Bio */}
          <div>
            <Link href="/" style={{ display: "inline-block", textDecoration: "none", marginBottom: "1rem" }}>
              <Image
                src="/whizan_logo.png"
                alt="Whizan Cloud Services"
                width={150}
                height={34}
                className="wz-nav-logo"
              />
            </Link>
            <p style={{ fontSize: "0.82rem", color: "var(--wz-text-muted)", lineHeight: 1.6, maxWidth: "320px", margin: "0 0 1rem 0" }}>
              Whizan Cloud is the unified developer cloud platform covering frontend edge hosting, containerized backend services, serverless isolates, relational databases, and native AI agent DevOps.
            </p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", padding: "0.25rem 0.65rem", borderRadius: "9999px", background: "var(--wz-white)", border: "1px solid var(--wz-border)", fontSize: "0.72rem", fontFamily: "var(--font-geist-mono), monospace", color: "var(--wz-text-secondary)" }}>
              <span className="wz-pulse-dot" />
              <span>All Systems Operational</span>
              <span style={{ color: "var(--wz-text-light)" }}>•</span>
              <span style={{ color: "var(--wz-azure)", fontWeight: 700 }}>whizan.cloud</span>
            </div>
          </div>

          {/* Group 1: Platform */}
          <div>
            <div className="wz-footer-title">Platform</div>
            <div className="wz-footer-links">
              <Link href="/dashboard/hosting" className="wz-footer-link">Frontend Edge Hosting</Link>
              <Link href="/dashboard/backend" className="wz-footer-link">Backend Containers</Link>
              <Link href="/dashboard/functions" className="wz-footer-link">Serverless Edge Functions</Link>
              <Link href="/dashboard/databases" className="wz-footer-link">PostgreSQL &amp; Redis</Link>
            </div>
          </div>

          {/* Group 2: Developer Tools */}
          <div>
            <div className="wz-footer-title">Developer Tools</div>
            <div className="wz-footer-links">
              <Link href="/dashboard/cli" className="wz-footer-link">Whizan CLI &amp; SDK</Link>
              <Link href="/dashboard/flows" className="wz-footer-link">Whizan Flow</Link>
              <Link href="/dashboard/cron" className="wz-footer-link">Zero-Idle Cron</Link>
              <Link href="/dashboard/mcp" className="wz-footer-link">MCP &amp; AI DevOps</Link>
              <Link href="/docs" className="wz-footer-link">Documentation</Link>
            </div>
          </div>

          {/* Group 3: Console & Support */}
          <div>
            <div className="wz-footer-title">Console</div>
            <div className="wz-footer-links">
              <Link href="/dashboard" className="wz-footer-link">Console Dashboard</Link>
              <Link href="/login" className="wz-footer-link">Sign in</Link>
              <Link href="/register" className="wz-footer-link">Get Started Free</Link>
              <Link href="/contact" className="wz-footer-link">Contact Support</Link>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="wz-footer-bottom">
          <div>
            © {currentYear} Whizan Cloud Services. All rights reserved.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <ShieldCheck size={14} color="var(--wz-emerald)" /> Cloudflare TLS 1.3 Certified
            </span>
            <span>•</span>
            <Link href="/docs" style={{ color: "inherit", textDecoration: "none" }}>Platform Documentation</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
