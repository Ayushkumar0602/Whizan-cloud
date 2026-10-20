"use client";

import Link from "next/link";
import {
  Terminal,
  Workflow,
  Clock,
  Bot,
  ArrowRight,
} from "lucide-react";

export function DeveloperTools() {
  const tools = [
    {
      id: "cli",
      title: "Whizan CLI & SDK",
      badge: "TERMINAL FIRST",
      tagline: "Deploy, tail logs, and configure from your shell",
      description:
        "The official command-line interface provides instant parity with the web console. Deploy projects with whizan deploy, tail live container logs with whizan logs -f, manage secrets, and link repositories in seconds.",
      href: "/dashboard/cli",
      icon: Terminal,
      color: "#334155",
      bgLight: "#f1f5f9",
      commands: [
        { cmd: "whizan deploy", note: "Direct archive upload & build trigger" },
        { cmd: "whizan logs --tail", note: "Real-time streaming ANSI container output" },
        { cmd: "whizan env set KEY=VAL", note: "AES-256 encrypted variable sync" },
      ],
    },
    {
      id: "flows",
      title: "Whizan Flow",
      badge: "PIPELINES",
      tagline: "Multi-stage promotion & deployment approval gates",
      description:
        "Orchestrate complex deployments across frontends, backend microservices, and databases. Build staging-to-production promotion pipelines with automated smoke testing and manual approval gates.",
      href: "/dashboard/flows",
      icon: Workflow,
      color: "var(--wz-azure)",
      bgLight: "#e0f2fe",
      commands: [
        { cmd: "Pipeline Orchestration", note: "Dependency graphs between web & API" },
        { cmd: "Approval Gates", note: "Manual or automated promotion to prod" },
        { cmd: "Rollback Strategy", note: "Instant switch to previous healthy revision" },
      ],
    },
    {
      id: "cron",
      title: "Enterprise Cron Jobs",
      badge: "ZERO-IDLE COMPUTE",
      tagline: "High-precision scheduling with <0.01% idle CPU consumption",
      description:
        "Scheduled compute built around an event-driven dynamic OS sleep loop. Macro-scheduling uses Redis Sorted Sets with Unix millisecond scores. Triggers internal V8 functions, Docker container exec, or mesh endpoints with customizable misfire recovery.",
      href: "/dashboard/cron",
      icon: Clock,
      color: "#d97706",
      bgLight: "#fef3c7",
      commands: [
        { cmd: "Zero-Idle Architecture", note: "< 0.01% CPU consumption between jobs" },
        { cmd: "Misfire Policies", note: "SKIP, FIRE_LATEST_ONCE, or CATCH_UP_ALL" },
        { cmd: "Multi-Target Dispatch", note: "Triggers Functions, Docker Exec, or Mesh" },
      ],
    },
    {
      id: "mcp",
      title: "MCP & AI DevOps",
      badge: "AI IDE INTEGRATION",
      tagline: "Autonomous infrastructure control for Cursor, Claude & Windsurf",
      description:
        "Whizan Cloud natively exposes Model Context Protocol (@whizan/mcp-devops). AI coding agents can audit project code, configure environment variables, deploy services, and run live diagnostic commands directly from your IDE prompt.",
      href: "/dashboard/mcp",
      icon: Bot,
      color: "var(--wz-indigo)",
      bgLight: "#ede9fe",
      commands: [
        { cmd: "whizan_analyze_workspace", note: "AI repository stack & guardrail inspection" },
        { cmd: "whizan_deploy_direct", note: "Autonomous source upload & cutover" },
        { cmd: "whizan_check_health", note: "End-to-end 200 OK health verification" },
      ],
    },
  ];

  return (
    <section className="wz-section">
      <div className="wz-container">
        {/* Section Header */}
        <div className="wz-section-header">
          <div className="wz-section-eyebrow">DEVELOPER TOOLS &amp; AUTOMATION</div>
          <h2 className="wz-section-title">
            A better workflow for the people building it.
          </h2>
          <p className="wz-section-desc">
            From command-line velocity to AI-assisted DevOps and zero-idle cron scheduling, Whizan provides native developer tooling built directly into the platform.
          </p>
        </div>

        {/* 4 Tool Cards Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <div
                key={tool.id}
                style={{ background: "var(--wz-white)", border: "1px solid var(--wz-border)", borderRadius: "18px", padding: "1.75rem", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "var(--wz-shadow-sm)" }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{ width: 42, height: 42, borderRadius: "10px", background: tool.bgLight, color: tool.color, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--wz-border)" }}>
                        <Icon size={20} />
                      </div>
                      <div>
                        <div style={{ fontSize: "1.05rem", fontWeight: 750, color: "var(--wz-text-primary)" }}>{tool.title}</div>
                        <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--wz-azure)" }}>{tool.tagline}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: "0.68rem", fontFamily: "var(--font-geist-mono), monospace", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "9999px", background: "var(--wz-surface)", color: "var(--wz-text-secondary)", border: "1px solid var(--wz-border)" }}>
                      {tool.badge}
                    </span>
                  </div>

                  <p style={{ fontSize: "0.88rem", color: "var(--wz-text-secondary)", lineHeight: 1.6, marginBottom: "1.25rem" }}>
                    {tool.description}
                  </p>

                  <div style={{ background: "var(--wz-surface)", borderRadius: "10px", border: "1px solid var(--wz-border)", padding: "0.85rem 1rem", display: "flex", flexDirection: "column", gap: "0.45rem", marginBottom: "1.25rem", fontFamily: "var(--font-geist-mono), monospace", fontSize: "0.75rem" }}>
                    {tool.commands.map((c, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 700, color: "var(--wz-text-primary)" }}>{c.cmd}</span>
                        <span style={{ color: "var(--wz-text-muted)" }}>{c.note}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ paddingTop: "0.85rem", borderTop: "1px solid var(--wz-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Link
                    href={tool.href}
                    className="wz-btn-ghost"
                    style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem", color: "var(--wz-azure)", fontWeight: 700 }}
                  >
                    <span>Explore {tool.title}</span>
                    <ArrowRight size={13} style={{ marginLeft: "0.3rem" }} />
                  </Link>
                  <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-geist-mono), monospace", color: "var(--wz-text-light)" }}>
                    Route: {tool.href}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
