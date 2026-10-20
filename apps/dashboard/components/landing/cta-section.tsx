"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { ArrowRight, BookOpen, ShieldCheck, Zap } from "lucide-react";

export function CtaSection() {
  const { user, loading } = useAuth();
  const ctaHref = !loading && user ? "/dashboard" : "/register";
  const ctaLabel = !loading && user ? "Go to Console" : "Get Started";

  return (
    <section className="wz-section wz-section-alt">
      <div className="wz-container">
        <div style={{ background: "var(--wz-white)", border: "1px solid var(--wz-border)", borderRadius: "24px", padding: "4rem 2rem", textAlign: "center", maxWidth: "880px", margin: "0 auto", boxShadow: "var(--wz-shadow-lg)" }}>
          <div className="wz-eyebrow-pill" style={{ marginBottom: "1.25rem" }}>
            <span className="wz-pulse-dot" />
            <span style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              INSTANT DEVELOPER ONBOARDING
            </span>
          </div>

          <h2 style={{ fontSize: "clamp(2rem, 4vw, 3rem)", fontWeight: 850, letterSpacing: "-0.03em", color: "var(--wz-text-primary)", marginBottom: "1rem" }}>
            Your next deployment starts here.
          </h2>

          <p style={{ fontSize: "1.1rem", color: "var(--wz-text-secondary)", maxWidth: "580px", margin: "0 auto 2.25rem", lineHeight: 1.6 }}>
            Bring your frontend, backend services, databases, and developer workflows together on Whizan Cloud.
          </p>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "2rem" }}>
            <Link href={ctaHref} className="wz-btn-primary wz-btn-lg">
              <span>{ctaLabel}</span>
              <ArrowRight size={16} />
            </Link>

            <Link href="/docs" className="wz-btn-secondary wz-btn-lg">
              <BookOpen size={16} color="var(--wz-text-muted)" />
              <span>Read Documentation</span>
            </Link>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1.5rem", fontSize: "0.78rem", fontFamily: "var(--font-geist-mono), monospace", color: "var(--wz-text-muted)", flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <ShieldCheck size={14} color="var(--wz-emerald)" /> Automated TLS 1.3
            </span>
            <span>•</span>
            <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Zap size={14} color="var(--wz-azure)" /> Sub-5ms Edge Routing
            </span>
            <span>•</span>
            <span>Hobby Plan Free</span>
          </div>
        </div>
      </div>
    </section>
  );
}
