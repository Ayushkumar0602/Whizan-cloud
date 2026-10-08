"use client";

import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { useAuth } from "@/lib/auth";
import { ContactContent } from "@/components/contact-content";
import { ArrowLeft, LayoutDashboard, LogIn } from "lucide-react";

export default function PublicContactPage() {
  const { user, loading } = useAuth();

  return (
    <div className="landing-shell aurora-bg" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top Glass Navigation */}
      <header className="landing-nav-wrapper">
        <div className="landing-nav" style={{ maxWidth: 1140, margin: "0 auto" }}>
          <BrandMark href="/" />

          <nav className="landing-nav-links">
            <Link href="/" className="nav-link-item">
              Home
            </Link>
            <Link href="/docs" className="nav-link-item">
              Documentation
            </Link>
            <Link href="/contact" className="nav-link-item active">
              Contact & Support
            </Link>
          </nav>

          <div className="landing-nav-actions">
            {!loading && user ? (
              <Link href="/dashboard" className="btn btn-primary btn-sm flex items-center gap-1.5">
                <LayoutDashboard size={14} /> Console
              </Link>
            ) : (
              <Link href="/login" className="btn btn-secondary btn-sm flex items-center gap-1.5">
                <LogIn size={14} /> Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: "3rem 1.5rem" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", marginBottom: "1.5rem" }}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.88rem",
              color: "var(--muted)",
              textDecoration: "none",
              marginBottom: "1.5rem",
              fontWeight: 500,
            }}
          >
            <ArrowLeft size={16} /> Back to Whizan Cloud
          </Link>
        </div>

        <ContactContent isInsideDashboard={false} />
      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "2rem 1.5rem", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>© {new Date().getFullYear()} Whizan Cloud Service. All rights reserved.</div>
          <div style={{ display: "flex", gap: "1.5rem" }}>
            <Link href="/" style={{ color: "var(--muted)", textDecoration: "none" }}>
              Home
            </Link>
            <Link href="/docs" style={{ color: "var(--muted)", textDecoration: "none" }}>
              Docs
            </Link>
            <Link href="/dashboard" style={{ color: "var(--muted)", textDecoration: "none" }}>
              Console
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
