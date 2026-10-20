"use client";

import {
  Activity,
  Terminal,
  ShieldCheck,
  Cpu,
  Lock,
  Radio,
} from "lucide-react";

export function ObservabilitySection() {
  const observabilityFeatures = [
    {
      title: "Real-Time Build & Terminal Logs",
      desc: "Watch dependency resolution, compilation steps, and container synthesis in real-time. Streaming ANSI outputs with stage timings let you debug deployment failures instantly.",
      icon: Terminal,
      badge: "LOG STREAMING",
      metric: "ANSI Color Streaming",
    },
    {
      title: "Automated HTTP Health Probes",
      desc: "Every web service and API undergoes configurable HTTP health checks before cutover. If a new deployment returns 5xx or fails to respond, traffic remains on the previous revision.",
      icon: Activity,
      badge: "PROBING",
      metric: "Zero-Downtime Safe",
    },
    {
      title: "Continuous CPU & Memory Telemetry",
      desc: "Monitor runtime utilization per service. Inspect whether your Node.js or Python processes are approaching memory limits without having to configure third-party agents.",
      icon: Cpu,
      badge: "RUNTIME METRICS",
      metric: "Live vCPU & RAM",
    },
    {
      title: "Encrypted Environment Secrets",
      desc: "API keys, database URLs, and JWT secrets are encrypted using AES-256. Variables are injected at runtime into isolated container memory and never stored in plain text.",
      icon: Lock,
      badge: "AES-256 ENCRYPTION",
      metric: "Zero Secret Leaks",
    },
    {
      title: "Background Queue Process Liveness",
      desc: "Workers and consumers (BullMQ, Celery, Kafka) operate with isWorker: true. Whizan checks direct process liveness rather than probing unnecessary fake HTTP endpoints.",
      icon: Radio,
      badge: "WORKER LIVENESS",
      metric: "Daemon Tracking",
    },
    {
      title: "Zero-Redundancy Cutover Purging",
      desc: "Upon successful new deployment cutover, obsolete Docker containers, temporary build packages, and dangling Redis state are automatically purged to prevent resource bloat.",
      icon: ShieldCheck,
      badge: "AUTO CLEANUP",
      metric: "Zero Zombie Containers",
    },
  ];

  return (
    <section className="wz-section wz-section-alt">
      <div className="wz-container">
        {/* Section Header */}
        <div className="wz-section-header">
          <div className="wz-section-eyebrow">OBSERVABILITY &amp; RELIABILITY</div>
          <h2 className="wz-section-title">
            Visibility into what you deploy.
          </h2>
          <p className="wz-section-desc">
            Real-time logs, process liveness, HTTP health verification, and memory tracking standard across every service.
          </p>
        </div>

        {/* 6 Grid Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.25rem" }}>
          {observabilityFeatures.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                style={{ background: "var(--wz-white)", border: "1px solid var(--wz-border)", borderRadius: "16px", padding: "1.5rem", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "var(--wz-shadow-sm)" }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                    <div style={{ width: 38, height: 38, borderRadius: "10px", background: "#e0f2fe", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #bae6fd" }}>
                      <Icon size={18} />
                    </div>
                    <span style={{ fontSize: "0.68rem", fontFamily: "var(--font-geist-mono), monospace", fontWeight: 700, padding: "0.15rem 0.45rem", borderRadius: "9999px", background: "var(--wz-surface)", color: "var(--wz-text-secondary)", border: "1px solid var(--wz-border)" }}>
                      {item.badge}
                    </span>
                  </div>

                  <h3 style={{ fontSize: "1rem", fontWeight: 750, color: "var(--wz-text-primary)", marginBottom: "0.5rem" }}>
                    {item.title}
                  </h3>
                  <p style={{ fontSize: "0.84rem", color: "var(--wz-text-secondary)", lineHeight: 1.55, marginBottom: "1rem" }}>
                    {item.desc}
                  </p>
                </div>

                <div style={{ paddingTop: "0.75rem", borderTop: "1px solid var(--wz-border-subtle)", fontSize: "0.75rem", fontFamily: "var(--font-geist-mono), monospace", color: "var(--wz-azure)", fontWeight: 700 }}>
                  ✓ {item.metric}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
