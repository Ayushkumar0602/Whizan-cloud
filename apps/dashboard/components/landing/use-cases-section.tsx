"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function UseCasesSection() {
  const useCases = [
    {
      title: "Fullstack SaaS: Next.js + FastAPI + Postgres",
      category: "FULLSTACK ARCHITECTURE",
      desc: "Deploy a high-performance Next.js web application with edge SSR, connect to a containerized Python FastAPI service on port 8000, and persist data in managed PostgreSQL with PgBouncer connection pooling.",
      stack: ["Next.js SSR", "FastAPI / Docker", "PostgreSQL 16", "PgBouncer"],
      route: "/dashboard/deploy",
    },
    {
      title: "Event-Driven Webhooks via V8 Edge Functions",
      category: "SERVERLESS ISOLATES",
      desc: "Receive and process high-frequency webhooks (Stripe, GitHub, Shopify) in sub-5ms V8 isolates. Zero continuous container hosting cost, granular API keys, and automatic 3-tier disaster self-healing.",
      stack: ["V8 Isolate", "Sub-5ms Execution", "Dedicated API Keys", "0 Host Ports"],
      route: "/dashboard/functions",
    },
    {
      title: "Asynchronous Queue Workers with Redis",
      category: "BACKGROUND WORKERS",
      desc: "Run background tasks, video encoding, or email dispatchers using BullMQ or Celery. Deploy with isWorker: true, monitor direct process liveness, and connect via internal low-latency Redis mesh.",
      stack: ["Python Celery / BullMQ", "In-Memory Redis", "0.0.0.0 Mesh", "Worker Liveness"],
      route: "/dashboard/backend",
    },
    {
      title: "Autonomous AI-Driven DevOps with MCP",
      category: "AI IDE INTEGRATION",
      desc: "Pair your AI IDE (Cursor, Claude Code, Windsurf) with @whizan/mcp-devops. The AI model analyzes code, synthesizes build configs, provisions PostgreSQL, and ships directly from your IDE prompt.",
      stack: ["Stdio MCP 1.0", "Cursor & Claude", "Gemini 3.5 Analyzer", "Zero Friction"],
      route: "/dashboard/mcp",
    },
  ];

  return (
    <section className="wz-section">
      <div className="wz-container">
        {/* Section Header */}
        <div className="wz-section-header">
          <div className="wz-section-eyebrow">PRODUCTION ARCHITECTURES</div>
          <h2 className="wz-section-title">
            Designed for the way modern teams ship.
          </h2>
          <p className="wz-section-desc">
            Real architectural patterns supported natively on Whizan Cloud without third-party plugins.
          </p>
        </div>

        {/* 4 Cards Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          {useCases.map((uc, i) => (
            <div
              key={i}
              style={{ background: "var(--wz-surface-subtle)", border: "1px solid var(--wz-border)", borderRadius: "18px", padding: "1.75rem", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "var(--wz-shadow-sm)" }}
            >
              <div>
                <div style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono), monospace", fontWeight: 700, color: "var(--wz-azure)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.4rem" }}>
                  {uc.category}
                </div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 750, color: "var(--wz-text-primary)", marginBottom: "0.5rem" }}>
                  {uc.title}
                </h3>
                <p style={{ fontSize: "0.86rem", color: "var(--wz-text-secondary)", lineHeight: 1.6, marginBottom: "1.25rem" }}>
                  {uc.desc}
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1.25rem" }}>
                  {uc.stack.map((item, idx) => (
                    <span
                      key={idx}
                      style={{ fontSize: "0.72rem", fontFamily: "var(--font-geist-mono), monospace", padding: "0.2rem 0.55rem", borderRadius: "6px", background: "var(--wz-white)", border: "1px solid var(--wz-border)", color: "var(--wz-text-primary)", fontWeight: 550 }}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ paddingTop: "0.85rem", borderTop: "1px solid var(--wz-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Link
                  href={uc.route}
                  className="wz-btn-ghost"
                  style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem", color: "var(--wz-azure)", fontWeight: 700 }}
                >
                  <span>Deploy This Pattern</span>
                  <ArrowRight size={13} style={{ marginLeft: "0.3rem" }} />
                </Link>
                <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-geist-mono), monospace", color: "var(--wz-text-light)" }}>
                  Ready to deploy
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
