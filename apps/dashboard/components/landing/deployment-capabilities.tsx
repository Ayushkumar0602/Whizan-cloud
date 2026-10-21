"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Globe,
  Server,
  Zap,
  Database,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

interface CapabilityItem {
  id: string;
  name: string;
  badge: string;
  tagline: string;
  description: string;
  href: string;
  icon: any;
  color: string;
  supported: string[];
  features: string[];
  codePreview: {
    title: string;
    content: string;
    lang: string;
  };
}

export function DeploymentCapabilities() {
  const [selectedPillar, setSelectedPillar] = useState<string>("frontend");

  const capabilities: Record<string, CapabilityItem> = {
    frontend: {
      id: "frontend",
      name: "Frontend Edge Hosting",
      badge: "EDGE RUNTIME",
      tagline: "Instant deployments with edge routing and automated SSL",
      description:
        "Ship Next.js (SSR & Standalone), Vite, React, and Astro applications directly to the edge with zero server maintenance. Global SSL termination, edge CDN caching, and automated zero-downtime rolling cutovers standard.",
      href: "/dashboard/hosting",
      icon: Globe,
      color: "var(--wz-azure)",
      supported: ["Next.js (App & Pages)", "Vite / React", "Astro Static", "Custom Docker Web"],
      features: [
        "Native Next.js standalone runtime with dynamic route support",
        "Edge asset distribution with sub-5ms path routing",
        "Cloudflare wildcard TLS 1.3 automated certificate provisioning",
        "Zero-downtime cutover: old version drains only after new container passes HTTP health check",
      ],
      codePreview: {
        title: "whizan.config.json (Frontend)",
        lang: "json",
        content: `{\n  "name": "ecommerce-storefront",\n  "framework": "NEXTJS",\n  "outputDir": ".next",\n  "buildCommand": "npm run build",\n  "autoDeploy": true,\n  "domain": "storefront.whizan.cloud"\n}`,
      },
    },
    backend: {
      id: "backend",
      name: "Backend Container Services",
      badge: "DOCKER RUNTIME",
      tagline: "Polyglot microservices, APIs, and background queue workers",
      description:
        "Deploy APIs and workers in Node.js, Python (FastAPI/Django/Flask), Go, Rust, Java, or raw Dockerfiles. Whizan automatically synthesizes high-performance multi-stage Docker builds or runs your custom container definitions.",
      href: "/dashboard/backend",
      icon: Server,
      color: "var(--wz-indigo)",
      supported: ["Node.js / Express / Nest", "Python FastAPI / Flask", "Go / Gin", "Rust / Actix", "Dockerfiles"],
      features: [
        "Continuous HTTP health probes verify process readiness before routing live traffic",
        "Background queue workers support: isWorker flag with process liveness tracking",
        "Internal Docker mesh networking: services discover each other on private DNS",
        "Real-time streaming ANSI build logs and live container memory/CPU telemetry",
      ],
      codePreview: {
        title: "whizan.config.json (Backend)",
        lang: "json",
        content: `{\n  "name": "payment-api",\n  "language": "PYTHON",\n  "startCommand": "uvicorn main:app --host 0.0.0.0 --port 8000",\n  "internalPort": 8000,\n  "healthCheckPath": "/health",\n  "compute": "0.1 vCPU / 512MB"\n}`,
      },
    },
    functions: {
      id: "functions",
      name: "Serverless Edge Functions",
      badge: "V8 ISOLATE",
      tagline: "Sub-5ms event micro-endpoints with granular security",
      description:
        "Run lightweight API endpoints and webhooks on isolated V8 runtimes with sub-5ms cold starts. Granular security categorizes public webhooks (Stripe/GitHub) vs protected endpoints secured with dedicated Function API Keys.",
      href: "/dashboard/functions",
      icon: Zap,
      color: "var(--wz-cyan)",
      supported: ["TypeScript / JavaScript", "ESM Standard", "Fetch API", "Stripe / GitHub Webhooks"],
      features: [
        "Sub-5ms cold start execution without host Docker port overhead",
        "Granular security: isPublic toggle for open webhooks vs protected Function API Keys",
        "3-Tier self-healing disaster recovery: Disk bundle -> Redis cache -> PostgreSQL persistence",
        "Direct invocation routing via https://<slug>.whizan.cloud/<endpoint>",
      ],
      codePreview: {
        title: "functions/calculate-tax.ts",
        lang: "typescript",
        content: `export default async function handler(req: Request) {\n  const { amount, country } = await req.json();\n  const rate = country === "US" ? 0.08 : 0.20;\n  return Response.json({\n    tax: amount * rate,\n    total: amount * (1 + rate),\n    timestamp: Date.now()\n  });\n}`,
      },
    },
    databases: {
      id: "databases",
      name: "Managed PostgreSQL & Redis",
      badge: "STORAGE & PERSISTENCE",
      tagline: "Dedicated relational persistence and in-memory caching",
      description:
        "Provision production-ready databases with connection pooling, table schema visualizers, and web query runners. Dedicated PostgreSQL with PgBouncer plus Redis in-memory cache for fast session stores and background queues.",
      href: "/dashboard/databases",
      icon: Database,
      color: "var(--wz-violet)",
      supported: ["PostgreSQL 16", "PgBouncer Pool", "Redis 7.2 Cache", "BullMQ / Celery Queues"],
      features: [
        "Dedicated PostgreSQL 16 with integrated PgBouncer connection pooling",
        "Web-based SQL query console and interactive table schema explorer",
        "Dedicated in-memory Redis cache with TTL inspector and key-value browser",
        "Internal DNS connection string injection directly into backend services",
      ],
      codePreview: {
        title: "Environment Variables (Auto-injected)",
        lang: "bash",
        content: `# PostgreSQL Connection with PgBouncer Pooling\nDATABASE_URL="postgres://whizan:secret@db.internal:5432/production?pgbouncer=true"\n\n# Redis Cache & Queue Broker\nREDIS_URL="redis://:authpass@redis.internal:6379/0"`,
      },
    },
  };

  const current = capabilities[selectedPillar] || capabilities.frontend;
  const CurrentIcon = current.icon;

  return (
    <section id="deployments" className="wz-section">
      <div className="wz-container">
        {/* Section Header */}
        <div className="wz-section-header">
          <div className="wz-section-eyebrow">DEPLOYMENT CAPABILITIES</div>
          <h2 className="wz-section-title">
            Your entire application. One cloud platform.
          </h2>
          <p className="wz-section-desc">
            Bring your application components together without managing a collection of disconnected tools.
          </p>
        </div>

        {/* Pillar Switcher Tabs */}
        <div className="wz-tabs-nav">
          {Object.values(capabilities).map((cap) => {
            const Icon = cap.icon;
            const isSelected = selectedPillar === cap.id;
            return (
              <button
                key={cap.id}
                type="button"
                onClick={() => setSelectedPillar(cap.id)}
                className={`wz-tab-btn ${isSelected ? "active" : ""}`}
              >
                <Icon size={16} color={isSelected ? cap.color : "var(--wz-text-muted)"} />
                <span>{cap.name.split(" ")[0]} {cap.name.split(" ")[1] || ""}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Capability Showcase Card */}
        <div className="wz-capability-showcase">
          {/* Left Column: Details */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono), monospace", fontWeight: 700, padding: "0.2rem 0.55rem", borderRadius: "9999px", background: "var(--wz-surface)", color: "var(--wz-text-secondary)", border: "1px solid var(--wz-border)" }}>
                {current.badge}
              </span>
              <span style={{ color: "var(--wz-text-light)" }}>•</span>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--wz-azure)" }}>{current.tagline}</span>
            </div>

            <h3 style={{ fontSize: "1.65rem", fontWeight: 800, color: "var(--wz-text-primary)", marginBottom: "0.75rem" }}>
              {current.name}
            </h3>
            <p style={{ fontSize: "0.95rem", color: "var(--wz-text-secondary)", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              {current.description}
            </p>

            {/* Supported Stacks */}
            <div style={{ marginBottom: "1.5rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--wz-text-light)", marginBottom: "0.5rem" }}>
                Supported Stacks &amp; Runtimes
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                {current.supported.map((s, i) => (
                  <span
                    key={i}
                    style={{ fontSize: "0.78rem", fontFamily: "var(--font-geist-mono), monospace", padding: "0.25rem 0.6rem", borderRadius: "6px", background: "var(--wz-surface)", border: "1px solid var(--wz-border)", color: "var(--wz-text-primary)", fontWeight: 550 }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Verified Feature Bullet Points */}
            <div style={{ marginBottom: "1.75rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--wz-text-light)", marginBottom: "0.5rem" }}>
                Platform Guarantees &amp; Features
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                {current.features.map((feat, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.45rem", fontSize: "0.82rem", color: "var(--wz-text-secondary)" }}>
                    <CheckCircle2 size={15} color="var(--wz-azure)" style={{ flexShrink: 0, marginTop: "2px" }} />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Link */}
            <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--wz-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Link
                href={current.href}
                className="wz-btn-primary"
                style={{ fontSize: "0.85rem", padding: "0.45rem 1rem" }}
              >
                <span>Open {current.name.split(" ")[0]} in Console</span>
                <ArrowRight size={14} />
              </Link>
              <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono), monospace", color: "var(--wz-text-light)" }}>
                Route: {current.href}
              </span>
            </div>
          </div>

          {/* Right Column: Code Terminal */}
          <div className="wz-code-terminal">
            <div className="wz-terminal-bar">
              <div className="wz-terminal-dots">
                <span className="wz-dot-red" />
                <span className="wz-dot-yellow" />
                <span className="wz-dot-green" />
                <span style={{ marginLeft: "0.5rem", color: "#e2e8f0", fontWeight: 600 }}>
                  {current.codePreview.title}
                </span>
              </div>
              <span style={{ color: "#94a3b8", textTransform: "uppercase", fontWeight: 600, fontSize: "0.7rem" }}>
                {current.codePreview.lang}
              </span>
            </div>

            <div className="wz-terminal-body">
              <pre style={{ margin: 0 }}>
                <code>{current.codePreview.content}</code>
              </pre>
            </div>

            <div style={{ padding: "0.5rem 1rem", background: "#0b0f19", borderTop: "1px solid #1e293b", display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#94a3b8" }}>
              <span>Whizan Native Spec</span>
              <span style={{ color: "var(--wz-emerald)", fontWeight: 600 }}>✓ Verified Schema</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
