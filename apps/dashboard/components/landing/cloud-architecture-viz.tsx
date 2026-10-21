"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Globe,
  Server,
  Zap,
  Database,
  Terminal,
  Activity,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Layers,
  Sparkles,
} from "lucide-react";

interface NodeData {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  category: string;
  route: string;
  specs: string[];
  metrics: { label: string; value: string }[];
}

export function CloudArchitectureViz() {
  const [activeNode, setActiveNode] = useState<string>("control-plane");

  const nodes: Record<string, NodeData> = {
    "control-plane": {
      id: "control-plane",
      title: "Whizan Control Mesh",
      subtitle: "Unified Orchestration & Routing Engine",
      tag: "CORE MESH",
      category: "Platform Core",
      route: "/dashboard",
      specs: [
        "Distributed Edge Ingress & Zero-Maintenance TLS 1.3",
        "Automated Health Probing & Zero-Downtime Rollouts",
        "Encrypted Secret Mesh & Isolated Environment Configs",
      ],
      metrics: [
        { label: "Mesh Status", value: "Operational" },
        { label: "Edge Routing", value: "< 5ms P95" },
        { label: "Active Nodes", value: "5 Isolated Tiers" },
      ],
    },
    "frontend-edge": {
      id: "frontend-edge",
      title: "Frontend Edge Hosting",
      subtitle: "Next.js SSR, Vite, React & Astro",
      tag: "EDGE COMPUTE",
      category: "Web Applications",
      route: "/dashboard/hosting",
      specs: [
        "Next.js Standalone & Dynamic Route Edge SSR",
        "Static Web Optimization with Edge CDN Caching",
        "Wildcard SSL TLS 1.3 Termination (*.whizan.cloud)",
      ],
      metrics: [
        { label: "SSL Protocol", value: "TLS 1.3 Auto" },
        { label: "Cutover Time", value: "< 2.4s Zero Drop" },
        { label: "Supported", value: "Next, Vite, Astro" },
      ],
    },
    "backend-containers": {
      id: "backend-containers",
      title: "Backend Container Services",
      subtitle: "Dockerized Node.js, Python, Go & Rust",
      tag: "CONTAINER RUNTIME",
      category: "Microservices",
      route: "/dashboard/backend",
      specs: [
        "Multi-stage Docker synthesis & custom Dockerfiles",
        "Continuous HTTP Health Probes & auto-restart",
        "Background queue workers with process liveness tracking",
      ],
      metrics: [
        { label: "Default Compute", value: "0.1 vCPU / 512MB" },
        { label: "Bind Interface", value: "0.0.0.0 Mesh" },
        { label: "Logs Stream", value: "Real-time ANSI" },
      ],
    },
    "edge-functions": {
      id: "edge-functions",
      title: "Serverless Edge Functions",
      subtitle: "Sub-5ms Isolated V8 Runtimes",
      tag: "EVENT RUNTIME",
      category: "Serverless",
      route: "/dashboard/functions",
      specs: [
        "Sub-5ms cold starts with zero Docker port overhead",
        "Granular security: Public Webhooks vs Protected API Keys",
        "3-tier self-healing disaster recovery (Disk, Redis, Postgres)",
      ],
      metrics: [
        { label: "Cold Start", value: "< 5ms" },
        { label: "Key Format", value: "whz_fn_live_*" },
        { label: "Domain", value: "*.whizan.cloud" },
      ],
    },
    databases: {
      id: "databases",
      title: "Managed PostgreSQL & Redis",
      subtitle: "Enterprise Relational & In-Memory Store",
      tag: "PERSISTENCE",
      category: "Data Services",
      route: "/dashboard/databases",
      specs: [
        "Dedicated PostgreSQL 16 with PgBouncer pooling",
        "In-Memory Redis Cache for low-latency queues & locks",
        "Built-in SQL query runner console & schema explorer",
      ],
      metrics: [
        { label: "Postgres Pool", value: "PgBouncer Active" },
        { label: "Redis Broker", value: "BullMQ / Celery" },
        { label: "Security", value: "Encrypted Storage" },
      ],
    },
  };

  const current = nodes[activeNode] || nodes["control-plane"];

  return (
    <div className="wz-arch-model">
      {/* Top Status Header */}
      <div className="wz-arch-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className="wz-pulse-dot" />
          <span style={{ fontWeight: 700, color: "var(--wz-text-primary)" }}>
            WHIZAN CLOUD SERVICE MESH
          </span>
          <span style={{ color: "var(--wz-text-light)" }}>|</span>
          <span style={{ color: "var(--wz-text-muted)" }}>TOPOLOGY: PRODUCTION LIVE</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--wz-text-muted)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            <ShieldCheck size={14} color="var(--wz-emerald)" />
            <span style={{ color: "var(--wz-text-primary)", fontWeight: 600 }}>TLS 1.3 Verified</span>
          </span>
          <span>•</span>
          <span style={{ background: "var(--wz-surface)", padding: "0.2rem 0.5rem", borderRadius: "6px", border: "1px solid var(--wz-border)" }}>
            *.whizan.cloud
          </span>
        </div>
      </div>

      {/* Main Diagram Area with Connecting Graphic Elements */}
      <div className="wz-arch-canvas">
        {/* Top Row: Frontend Edge and Backend Services */}
        <div className="wz-mesh-top-row">
          {/* Node 1: Frontend Edge */}
          <div
            onClick={() => setActiveNode("frontend-edge")}
            className={`wz-node-card ${activeNode === "frontend-edge" ? "selected" : ""}`}
          >
            <div className="wz-node-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div className="wz-node-icon-box" style={{ background: "#e0f2fe", color: "#0284c7", borderColor: "#bae6fd" }}>
                  <Globe size={18} />
                </div>
                <div>
                  <div className="wz-node-title">Frontend Edge Hosting</div>
                  <div className="wz-node-desc">Next.js SSR &amp; Vite Edge CDN</div>
                </div>
              </div>
              <span style={{ fontSize: "0.68rem", fontFamily: "var(--font-geist-mono), monospace", padding: "0.2rem 0.5rem", borderRadius: "9999px", background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", fontWeight: 600 }}>
                200 OK
              </span>
            </div>
            <div className="wz-node-footer">
              <span style={{ color: "var(--wz-text-muted)" }}>Sub-5ms Edge Routing</span>
              <span style={{ color: "var(--wz-azure)", fontWeight: 700 }}>dist / .next</span>
            </div>
          </div>

          {/* Node 2: Backend Containers */}
          <div
            onClick={() => setActiveNode("backend-containers")}
            className={`wz-node-card ${activeNode === "backend-containers" ? "selected" : ""}`}
          >
            <div className="wz-node-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div className="wz-node-icon-box" style={{ background: "#e0e7ff", color: "#4f46e5", borderColor: "#c7d2fe" }}>
                  <Server size={18} />
                </div>
                <div>
                  <div className="wz-node-title">Backend Container Services</div>
                  <div className="wz-node-desc">Polyglot Docker &amp; Queue Workers</div>
                </div>
              </div>
              <span style={{ fontSize: "0.68rem", fontFamily: "var(--font-geist-mono), monospace", padding: "0.2rem 0.5rem", borderRadius: "9999px", background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", fontWeight: 600 }}>
                RUNNING
              </span>
            </div>
            <div className="wz-node-footer">
              <span style={{ color: "var(--wz-text-muted)" }}>Health: Continuous HTTP</span>
              <span style={{ color: "var(--wz-indigo)", fontWeight: 700 }}>0.0.0.0:Port</span>
            </div>
          </div>
        </div>

        {/* Center: Whizan Control Plane Hub */}
        <div className="wz-mesh-center-hub">
          <div
            onClick={() => setActiveNode("control-plane")}
            className={`wz-center-hub-card ${activeNode === "control-plane" ? "selected" : ""}`}
          >
            <div className="wz-hub-badge">
              <span className="wz-pulse-dot" style={{ background: "var(--wz-azure)", boxShadow: "0 0 6px var(--wz-azure)" }} />
              CENTRAL CONTROL PLANE &amp; MESH ROUTER
            </div>
            <div className="wz-hub-title">Whizan Cloud Control Plane</div>
            <div className="wz-hub-desc">
              Unified service mesh, zero-downtime cutover coordinator, automated SSL &amp; private DNS.
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", marginTop: "0.85rem", fontSize: "0.75rem", fontFamily: "var(--font-geist-mono), monospace", color: "var(--wz-text-secondary)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Activity size={13} color="var(--wz-emerald)" />
                Mesh: Active
              </span>
              <span>•</span>
              <span>Sub-5ms Dispatch</span>
              <span>•</span>
              <span>TLS 1.3 Terminated</span>
            </div>
          </div>
        </div>

        {/* Bottom Row: Edge Functions, Databases, Developer Automation */}
        <div className="wz-mesh-bottom-row">
          {/* Node 3: Edge Functions */}
          <div
            onClick={() => setActiveNode("edge-functions")}
            className={`wz-node-card ${activeNode === "edge-functions" ? "selected" : ""}`}
          >
            <div className="wz-node-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div className="wz-node-icon-box" style={{ background: "#cffafe", color: "#0891b2", borderColor: "#a5f3fc" }}>
                  <Zap size={18} />
                </div>
                <div>
                  <div className="wz-node-title">Serverless Edge Functions</div>
                  <div className="wz-node-desc">V8 Isolates &amp; Webhooks</div>
                </div>
              </div>
            </div>
            <div className="wz-node-footer">
              <span style={{ color: "var(--wz-text-muted)" }}>Cold Start: &lt; 5ms</span>
              <span style={{ color: "#0891b2", fontWeight: 700 }}>whz_fn_live_*</span>
            </div>
          </div>

          {/* Node 4: Databases */}
          <div
            onClick={() => setActiveNode("databases")}
            className={`wz-node-card ${activeNode === "databases" ? "selected" : ""}`}
          >
            <div className="wz-node-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div className="wz-node-icon-box" style={{ background: "#ede9fe", color: "#7c3aed", borderColor: "#ddd6fe" }}>
                  <Database size={18} />
                </div>
                <div>
                  <div className="wz-node-title">PostgreSQL &amp; Redis</div>
                  <div className="wz-node-desc">PgBouncer &amp; Cache Store</div>
                </div>
              </div>
            </div>
            <div className="wz-node-footer">
              <span style={{ color: "var(--wz-text-muted)" }}>PgBouncer Pool: Active</span>
              <span style={{ color: "#7c3aed", fontWeight: 700 }}>Internal Mesh</span>
            </div>
          </div>

          {/* Node 5: Developer Tools & MCP */}
          <div
            onClick={() => setActiveNode("control-plane")}
            className={`wz-node-card ${activeNode === "control-plane" ? "selected" : ""}`}
          >
            <div className="wz-node-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <div className="wz-node-icon-box" style={{ background: "#f1f5f9", color: "#334155", borderColor: "#e2e8f0" }}>
                  <Terminal size={18} />
                </div>
                <div>
                  <div className="wz-node-title">DevOps &amp; MCP Agent</div>
                  <div className="wz-node-desc">CLI, Cron &amp; AI Stdio</div>
                </div>
              </div>
            </div>
            <div className="wz-node-footer">
              <span style={{ color: "var(--wz-text-muted)" }}>Zero-Idle Cron</span>
              <span style={{ color: "var(--wz-text-primary)", fontWeight: 700 }}>@whizan/mcp</span>
            </div>
          </div>
        </div>
      </div>

      {/* Inspector Deck */}
      <div className="wz-inspector-deck">
        <div className="wz-inspector-top">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.68rem", fontFamily: "var(--font-geist-mono), monospace", fontWeight: 700, padding: "0.15rem 0.45rem", borderRadius: "4px", background: "#e0f2fe", color: "#0369a1" }}>
                {current.tag}
              </span>
              <span style={{ color: "var(--wz-text-light)" }}>•</span>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--wz-text-secondary)" }}>{current.category}</span>
            </div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--wz-text-primary)", marginTop: "0.25rem" }}>
              {current.title}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--wz-text-muted)" }}>{current.subtitle}</div>
          </div>

          <Link
            href={current.route}
            className="wz-btn-secondary"
            style={{ fontSize: "0.8rem", padding: "0.45rem 0.9rem" }}
          >
            <span>Explore in Console</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1.5rem" }}>
          <div>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--wz-text-light)", marginBottom: "0.5rem" }}>
              Architectural Capabilities
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {current.specs.map((spec, i) => (
                <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.45rem", fontSize: "0.82rem", color: "var(--wz-text-secondary)" }}>
                  <CheckCircle2 size={14} color="var(--wz-azure)" style={{ flexShrink: 0, marginTop: "2px" }} />
                  <span>{spec}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--wz-text-light)", marginBottom: "0.5rem" }}>
              Live Telemetry &amp; Specs
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
              {current.metrics.map((m, i) => (
                <div key={i} style={{ background: "var(--wz-white)", border: "1px solid var(--wz-border)", borderRadius: "8px", padding: "0.5rem 0.6rem", textAlign: "center" }}>
                  <div style={{ fontSize: "0.68rem", color: "var(--wz-text-muted)", fontWeight: 550 }}>{m.label}</div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 750, color: "var(--wz-text-primary)", fontFamily: "var(--font-geist-mono), monospace", marginTop: "0.15rem" }}>
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
