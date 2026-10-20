"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Globe,
  Server,
  Zap,
  Database,
  Terminal,
  Clock,
  Workflow,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Layers,
} from "lucide-react";

interface ArchLayer {
  id: string;
  name: string;
  badge: string;
  summary: string;
  components: {
    id: string;
    name: string;
    role: string;
    status: string;
    route: string;
  }[];
  details: {
    title: string;
    desc: string;
    protocol: string;
    security: string;
    routing: string;
  };
}

export function ArchitectureSection() {
  const [selectedLayerId, setSelectedLayerId] = useState<string>("ingress");

  const layers: Record<string, ArchLayer> = {
    ingress: {
      id: "ingress",
      name: "Layer 1: Global Edge Routing & Ingress",
      badge: "EDGE GATEWAY",
      summary: "Terminates TLS 1.3, executes sub-5ms path routing, and distributes traffic to runtimes",
      components: [
        {
          id: "dns-ssl",
          name: "Cloudflare Edge SSL",
          role: "Wildcard TLS 1.3 encryption & DDoS mitigation",
          status: "Verified",
          route: "/dashboard/hosting",
        },
        {
          id: "edge-router",
          name: "Whizan Edge Router",
          role: "Sub-5ms path-based proxy & static asset cache",
          status: "< 5ms P95",
          route: "/dashboard/hosting",
        },
      ],
      details: {
        title: "Sub-Millisecond Edge Routing & TLS Termination",
        desc: "All incoming requests hit Whizan's edge router layer. Public wildcard SSL (*.whizan.cloud) terminates automatically without user certificate management. Traffic is classified into static assets, SSR requests, backend API routes, or V8 edge functions in under 5 milliseconds.",
        protocol: "HTTP/2, HTTP/3, WebSocket, TLS 1.3",
        security: "Automated Wildcard SSL, DDoS Shield, Header Masking",
        routing: "Path & Subdomain Regex Dispatcher",
      },
    },
    compute: {
      id: "compute",
      name: "Layer 2: Hybrid Compute Engines",
      badge: "RUNTIME TIERS",
      summary: "Next.js SSR standalone runtimes, multi-stage Docker microservices, and V8 serverless isolates",
      components: [
        {
          id: "frontend-compute",
          name: "Frontend Next.js & Vite",
          role: "Dynamic SSR and optimized static bundles",
          status: "Zero-Downtime",
          route: "/dashboard/hosting",
        },
        {
          id: "backend-compute",
          name: "Docker Microservices",
          role: "Isolated containers for Node, Python, Go, Rust",
          status: "HTTP Health Probe",
          route: "/dashboard/backend",
        },
        {
          id: "functions-compute",
          name: "V8 Edge Functions",
          role: "Serverless webhooks with Function API keys",
          status: "Sub-5ms Cold Start",
          route: "/dashboard/functions",
        },
      ],
      details: {
        title: "Multi-Tier Polyglot Workload Execution",
        desc: "Whizan isolates workloads according to performance requirements. Frontend web apps utilize Next.js standalone SSR or static Vite CDN. Microservices run in hardened Docker containers bound to 0.0.0.0 with continuous health checks. Lightweight event endpoints run in V8 isolates without Docker port overhead.",
        protocol: "FastRPC, TCP Socket, HTTP/1.1 Internal",
        security: "Container cgroups isolation, Protected Function API Keys",
        routing: "Internal DNS service discovery (service-<id>:port)",
      },
    },
    persistence: {
      id: "persistence",
      name: "Layer 3: Dedicated Persistence & Caching",
      badge: "STORAGE & STATE",
      summary: "Dedicated PostgreSQL 16 with PgBouncer connection pooling and in-memory Redis cache",
      components: [
        {
          id: "postgres-db",
          name: "PostgreSQL 16 Engine",
          role: "Relational persistence with PgBouncer pooling",
          status: "PgBouncer Active",
          route: "/dashboard/databases",
        },
        {
          id: "redis-cache",
          name: "Redis 7.2 In-Memory",
          role: "Low-latency key-value store & BullMQ queue broker",
          status: "Sub-millisecond",
          route: "/dashboard/databases",
        },
      ],
      details: {
        title: "Enterprise Relational & In-Memory Data Storage",
        desc: "Stateful workloads connect across the private network mesh. PostgreSQL includes PgBouncer connection pooling to prevent connection exhaustion during traffic bursts. Redis provides high-throughput shared caching, session storage, and queue brokering for background workers.",
        protocol: "PostgreSQL Wire Protocol 3.0, Redis RESP",
        security: "AES-256 encrypted at rest, internal network isolation",
        routing: "Direct private mesh endpoints (db.internal, redis.internal)",
      },
    },
    orchestration: {
      id: "orchestration",
      name: "Layer 4: Automation, Scheduling & AI DevOps",
      badge: "CONTROL & AI",
      summary: "Redis ZSet macro-scheduling, Whizan Flow deployment pipelines, and Model Context Protocol",
      components: [
        {
          id: "cron-engine",
          name: "Zero-Idle Cron Scheduler",
          role: "Dynamic OS sleep loop (<0.01% idle CPU) & Redis ZSets",
          status: "< 1ms Wakeup",
          route: "/dashboard/cron",
        },
        {
          id: "flow-engine",
          name: "Whizan Flow Engine",
          role: "Multi-stage promotion & approval gates",
          status: "Active Workflows",
          route: "/dashboard/flows",
        },
        {
          id: "mcp-agent",
          name: "DevOps Agent MCP",
          role: "Model Context Protocol for Cursor & Claude",
          status: "AI Connected",
          route: "/dashboard/mcp",
        },
      ],
      details: {
        title: "Zero-Idle Compute Scheduling & AI DevOps Integration",
        desc: "Background jobs run without wasteful 24/7 server loops via Redis Sorted Set macro-scheduling (<0.01% idle CPU). Whizan Flow automates deployment promotion gates. Native Model Context Protocol (@whizan/mcp-devops) allows Cursor and Claude to audit, deploy, and monitor resources programmatically.",
        protocol: "Stdio MCP 1.0, Redis Pub/Sub, REST API",
        security: "Role-Based Access Control, Masked Secret Logs",
        routing: "Event-driven wakeup & terminal streaming",
      },
    },
  };

  const activeLayer = layers[selectedLayerId] || layers.ingress;

  return (
    <section id="architecture" className="wz-section wz-section-alt">
      <div className="wz-container">
        {/* Section Heading */}
        <div className="wz-section-header">
          <div className="wz-section-eyebrow">SYSTEM ARCHITECTURE</div>
          <h2 className="wz-section-title">
            Every service connected. One workflow.
          </h2>
          <p className="wz-section-desc">
            Inspect how Whizan Cloud connects incoming traffic, container runtimes, edge isolates, data persistence, and background schedules.
          </p>
        </div>

        {/* Interactive Architecture Matrix */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", alignItems: "start" }}>
          {/* Left: Layer Selector Stack */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {Object.values(layers).map((layer) => {
              const isSelected = selectedLayerId === layer.id;
              return (
                <div
                  key={layer.id}
                  onClick={() => setSelectedLayerId(layer.id)}
                  style={{
                    background: isSelected ? "var(--wz-white)" : "rgba(255, 255, 255, 0.7)",
                    border: `1.5px solid ${isSelected ? "var(--wz-azure)" : "var(--wz-border)"}`,
                    borderRadius: "14px",
                    padding: "1.25rem 1.4rem",
                    cursor: "pointer",
                    boxShadow: isSelected ? "0 4px 15px rgba(2, 132, 199, 0.1)" : "var(--wz-shadow-sm)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                    <span style={{ fontSize: "0.68rem", fontFamily: "var(--font-geist-mono), monospace", fontWeight: 700, padding: "0.15rem 0.45rem", borderRadius: "4px", background: "#e0f2fe", color: "#0369a1" }}>
                      {layer.badge}
                    </span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 600, color: isSelected ? "var(--wz-azure)" : "var(--wz-text-light)" }}>
                      {isSelected ? "Active Layer" : "Click to Inspect"}
                    </span>
                  </div>

                  <div style={{ fontSize: "1rem", fontWeight: 750, color: "var(--wz-text-primary)", marginBottom: "0.25rem" }}>
                    {layer.name}
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "var(--wz-text-secondary)", lineHeight: 1.45, marginBottom: "0.75rem" }}>
                    {layer.summary}
                  </div>

                  {/* Component Badges */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", paddingTop: "0.5rem", borderTop: "1px solid var(--wz-border-subtle)" }}>
                    {layer.components.map((comp) => (
                      <span
                        key={comp.id}
                        style={{ fontSize: "0.72rem", fontFamily: "var(--font-geist-mono), monospace", padding: "0.15rem 0.45rem", borderRadius: "4px", background: "var(--wz-surface)", color: "var(--wz-text-secondary)", border: "1px solid var(--wz-border)" }}
                      >
                        {comp.name}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Focused Architecture Inspector Panel */}
          <div style={{ position: "sticky", top: "90px" }}>
            <div style={{ background: "var(--wz-white)", border: "1px solid var(--wz-border)", borderRadius: "18px", padding: "1.75rem", boxShadow: "var(--wz-shadow-lg)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "1rem", borderBottom: "1px solid var(--wz-border)", marginBottom: "1.25rem" }}>
                <div>
                  <div style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono), monospace", fontWeight: 700, color: "var(--wz-azure)", textTransform: "uppercase" }}>
                    Architecture Deep-Dive
                  </div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--wz-text-primary)", marginTop: "0.15rem" }}>
                    {activeLayer.details.title}
                  </div>
                </div>
                <div style={{ width: 40, height: 40, borderRadius: "10px", background: "#e0f2fe", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #bae6fd", flexShrink: 0 }}>
                  <Layers size={20} />
                </div>
              </div>

              <p style={{ fontSize: "0.88rem", color: "var(--wz-text-secondary)", lineHeight: 1.6, marginBottom: "1.25rem" }}>
                {activeLayer.details.desc}
              </p>

              {/* Technical Specifications Matrix */}
              <div style={{ background: "var(--wz-surface)", padding: "1rem 1.25rem", borderRadius: "12px", border: "1px solid var(--wz-border)", fontSize: "0.75rem", fontFamily: "var(--font-geist-mono), monospace", display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "0.4rem", borderBottom: "1px solid var(--wz-border-subtle)" }}>
                  <span style={{ color: "var(--wz-text-muted)" }}>Protocols</span>
                  <span style={{ color: "var(--wz-text-primary)", fontWeight: 700 }}>{activeLayer.details.protocol}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "0.4rem", borderBottom: "1px solid var(--wz-border-subtle)" }}>
                  <span style={{ color: "var(--wz-text-muted)" }}>Isolation</span>
                  <span style={{ color: "var(--wz-text-primary)", fontWeight: 700 }}>{activeLayer.details.security}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--wz-text-muted)" }}>Internal Dispatch</span>
                  <span style={{ color: "var(--wz-azure)", fontWeight: 700 }}>{activeLayer.details.routing}</span>
                </div>
              </div>

              {/* Sub-Components */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.25rem" }}>
                {activeLayer.components.map((comp) => (
                  <div
                    key={comp.id}
                    style={{ padding: "0.65rem 0.85rem", borderRadius: "8px", background: "var(--wz-surface-subtle)", border: "1px solid var(--wz-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}
                  >
                    <div>
                      <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--wz-text-primary)" }}>{comp.name}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--wz-text-muted)" }}>{comp.role}</div>
                    </div>
                    <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono), monospace", padding: "0.15rem 0.45rem", borderRadius: "4px", background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", fontWeight: 600 }}>
                      {comp.status}
                    </span>
                  </div>
                ))}
              </div>

              <Link
                href={activeLayer.components[0]?.route || "/dashboard"}
                className="wz-btn-secondary"
                style={{ width: "100%", justifyContent: "center" }}
              >
                <span>Explore {activeLayer.name.split(":")[1] || "Layer"}</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
