"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  ArrowRight,
  Globe,
  ShieldCheck,
  Cpu,
  Terminal,
  Activity,
  Database,
  Zap,
} from "lucide-react";
import { CloudArchitectureViz } from "./cloud-architecture-viz";

export function HeroSection() {
  const { user, loading } = useAuth();
  const ctaHref = !loading && user ? "/dashboard" : "/register";
  const ctaLabel = !loading && user ? "Go to Console" : "Get Started";

  return (
    <section className="wz-hero-section">
      <div className="wz-container">
        {/* Hero Top Messaging */}
        <div className="wz-hero-content">
          {/* Eyebrow Badge */}
          <div className="wz-eyebrow-pill">
            <span className="wz-pulse-dot" />
            <span style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              CLOUD INFRASTRUCTURE FOR BUILDERS
            </span>
            <span style={{ color: "var(--wz-border-hover)" }}>•</span>
            <span style={{ color: "var(--wz-azure)", fontWeight: 600 }}>Sub-5ms Edge Routing</span>
          </div>

          {/* Headline */}
          <h1 className="wz-hero-headline">
            From code to cloud. <br />
            <span className="wz-headline-gradient">All in one place.</span>
          </h1>

          {/* Subtitle */}
          <p className="wz-hero-lead">
            Deploy your frontend, run backend services, connect databases, and manage your workloads through one developer-focused cloud platform.
          </p>

          {/* Action Row */}
          <div className="wz-hero-cta-row">
            <Link href={ctaHref} className="wz-btn-primary wz-btn-lg">
              <span>{ctaLabel}</span>
              <ArrowRight size={16} />
            </Link>

            <a href="#architecture" className="wz-btn-secondary wz-btn-lg">
              <span>Explore the Platform</span>
            </a>
          </div>

          {/* Feature Badges */}
          <div className="wz-hero-pills">
            <span className="wz-feature-pill">
              <Globe size={13} color="var(--wz-azure)" /> Next.js &amp; Vite Edge CDN
            </span>
            <span className="wz-feature-pill">
              <ShieldCheck size={13} color="var(--wz-emerald)" /> Automated TLS 1.3
            </span>
            <span className="wz-feature-pill">
              <Cpu size={13} color="var(--wz-indigo)" /> Multi-Stage Docker
            </span>
            <span className="wz-feature-pill">
              <Terminal size={13} color="var(--wz-violet)" /> Native AI Agent MCP
            </span>
          </div>
        </div>

        {/* 4 Floating Telemetry Panels */}
        <div className="wz-telemetry-grid">
          {/* Panel 1 */}
          <div className="wz-telemetry-card">
            <div className="wz-telemetry-top">
              <span>DEPLOYMENT</span>
              <span style={{ color: "var(--wz-emerald)", fontWeight: 700 }}>● ACTIVE</span>
            </div>
            <div className="wz-telemetry-title">web-client-v2</div>
            <div className="wz-telemetry-sub">Zero-downtime cutover</div>
          </div>

          {/* Panel 2 */}
          <div className="wz-telemetry-card">
            <div className="wz-telemetry-top">
              <span>EDGE ROUTER</span>
              <span style={{ color: "var(--wz-azure)", fontWeight: 700 }}>&lt; 5ms</span>
            </div>
            <div className="wz-telemetry-title">whizan.cloud</div>
            <div className="wz-telemetry-sub">TLS 1.3 wildcard proxy</div>
          </div>

          {/* Panel 3 */}
          <div className="wz-telemetry-card">
            <div className="wz-telemetry-top">
              <span>CONTAINER</span>
              <span style={{ color: "var(--wz-indigo)", fontWeight: 700 }}>0.1 vCPU</span>
            </div>
            <div className="wz-telemetry-title">142MB / 512MB</div>
            <div className="wz-telemetry-sub">HTTP health probe 200</div>
          </div>

          {/* Panel 4 */}
          <div className="wz-telemetry-card">
            <div className="wz-telemetry-top">
              <span>DATABASE</span>
              <span style={{ color: "var(--wz-violet)", fontWeight: 700 }}>POOLED</span>
            </div>
            <div className="wz-telemetry-title">PostgreSQL 16</div>
            <div className="wz-telemetry-sub">PgBouncer active</div>
          </div>
        </div>

        {/* Signature Architecture Visualization Model */}
        <CloudArchitectureViz />
      </div>
    </section>
  );
}
