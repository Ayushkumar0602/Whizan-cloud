"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Globe,
  Server,
  Zap,
  Database,
  CheckCircle2,
  Lock,
} from "lucide-react";

export function ProductPreviews() {
  const [activePreview, setActivePreview] = useState<"frontend" | "backend" | "functions" | "database">("frontend");

  return (
    <section className="wz-section wz-section-alt">
      <div className="wz-container">
        {/* Section Header */}
        <div className="wz-section-header">
          <div className="wz-section-eyebrow">PRODUCTION CONSOLE INTERFACE</div>
          <h2 className="wz-section-title">
            Built for real production workloads.
          </h2>
          <p className="wz-section-desc">
            Every feature on Whizan Cloud is accessible through our streamlined developer console, CLI, and native MCP protocol.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="wz-tabs-nav">
          <button
            type="button"
            onClick={() => setActivePreview("frontend")}
            className={`wz-tab-btn ${activePreview === "frontend" ? "active" : ""}`}
          >
            <Globe size={15} color="var(--wz-azure)" />
            <span>Frontend Deployments</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePreview("backend")}
            className={`wz-tab-btn ${activePreview === "backend" ? "active" : ""}`}
          >
            <Server size={15} color="var(--wz-indigo)" />
            <span>Backend Container Telemetry</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePreview("functions")}
            className={`wz-tab-btn ${activePreview === "functions" ? "active" : ""}`}
          >
            <Zap size={15} color="var(--wz-cyan)" />
            <span>Edge Function Security</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePreview("database")}
            className={`wz-tab-btn ${activePreview === "database" ? "active" : ""}`}
          >
            <Database size={15} color="var(--wz-violet)" />
            <span>Postgres &amp; Redis Console</span>
          </button>
        </div>

        {/* Console Interface Window */}
        <div style={{ background: "var(--wz-white)", border: "1px solid var(--wz-border)", borderRadius: "20px", boxShadow: "var(--wz-shadow-xl)", overflow: "hidden", maxWidth: "980px", margin: "0 auto" }}>
          {/* Top Bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1.25rem", background: "var(--wz-surface)", borderBottom: "1px solid var(--wz-border)", fontSize: "0.75rem", fontFamily: "var(--font-geist-mono), monospace" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span className="wz-pulse-dot" />
              <span style={{ fontWeight: 700, color: "var(--wz-text-primary)" }}>whizan.cloud / console</span>
              <span style={{ color: "var(--wz-text-light)" }}>/</span>
              <span style={{ color: "var(--wz-azure)", fontWeight: 600 }}>
                {activePreview === "frontend" && "hosting/storefront-web"}
                {activePreview === "backend" && "services/payment-gateway"}
                {activePreview === "functions" && "functions/tax-calculator"}
                {activePreview === "database" && "databases/production-postgres"}
              </span>
            </div>
            <span style={{ padding: "0.15rem 0.45rem", borderRadius: "4px", background: "var(--wz-white)", border: "1px solid var(--wz-border)", color: "var(--wz-text-secondary)" }}>
              Live Environment
            </span>
          </div>

          {/* Interface Body */}
          <div style={{ padding: "2rem" }}>
            {activePreview === "frontend" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "1.25rem", borderBottom: "1px solid var(--wz-border)" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--wz-text-primary)" }}>storefront-web</span>
                      <span style={{ fontSize: "0.68rem", fontFamily: "var(--font-geist-mono), monospace", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "9999px", background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0" }}>
                        ● READY (ACTIVE)
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--wz-azure)", fontFamily: "var(--font-geist-mono), monospace", marginTop: "0.2rem" }}>
                      https://storefront-web.whizan.cloud
                    </div>
                  </div>
                  <Link href="/dashboard/hosting" className="wz-btn-primary" style={{ fontSize: "0.8rem", padding: "0.4rem 0.85rem" }}>
                    Redeploy
                  </Link>
                </div>

                <div style={{ background: "var(--wz-surface)", padding: "1.25rem", borderRadius: "14px", border: "1px solid var(--wz-border)" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--wz-text-light)", marginBottom: "0.75rem" }}>
                    Automated Deployment Pipeline (42s Total)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" }}>
                    <div style={{ background: "var(--wz-white)", border: "1px solid var(--wz-border)", borderRadius: "10px", padding: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--wz-emerald)", fontWeight: 700, fontSize: "0.78rem" }}>
                        <CheckCircle2 size={14} /> 1. Clone &amp; Cache
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--wz-text-muted)", marginTop: "0.25rem" }}>4.2s • Commit 4c810fb</div>
                    </div>
                    <div style={{ background: "var(--wz-white)", border: "1px solid var(--wz-border)", borderRadius: "10px", padding: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--wz-emerald)", fontWeight: 700, fontSize: "0.78rem" }}>
                        <CheckCircle2 size={14} /> 2. Build Output
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--wz-text-muted)", marginTop: "0.25rem" }}>28.4s • Next.js Standalone</div>
                    </div>
                    <div style={{ background: "var(--wz-white)", border: "1px solid var(--wz-border)", borderRadius: "10px", padding: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--wz-emerald)", fontWeight: 700, fontSize: "0.78rem" }}>
                        <CheckCircle2 size={14} /> 3. Health Probe
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--wz-text-muted)", marginTop: "0.25rem" }}>2.1s • HTTP 200 OK</div>
                    </div>
                    <div style={{ background: "var(--wz-white)", border: "1px solid var(--wz-border)", borderRadius: "10px", padding: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--wz-emerald)", fontWeight: 700, fontSize: "0.78rem" }}>
                        <CheckCircle2 size={14} /> 4. Edge Cutover
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--wz-text-muted)", marginTop: "0.25rem" }}>1.3s • Zero Dropped Req</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activePreview === "backend" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "1.25rem", borderBottom: "1px solid var(--wz-border)" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--wz-text-primary)" }}>payment-gateway</span>
                      <span style={{ fontSize: "0.68rem", fontFamily: "var(--font-geist-mono), monospace", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "9999px", background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0" }}>
                        ● CONTAINER RUNNING
                      </span>
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--wz-text-muted)", fontFamily: "var(--font-geist-mono), monospace", marginTop: "0.2rem" }}>
                      Python 3.12 (FastAPI) • Port: 8000 • Mesh: 0.0.0.0
                    </div>
                  </div>
                  <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono), monospace", color: "var(--wz-text-muted)", background: "var(--wz-surface)", padding: "0.25rem 0.6rem", borderRadius: "6px" }}>
                    uptime: 14d 6h
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div style={{ background: "var(--wz-surface)", padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--wz-border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.5rem" }}>
                      <span>CPU Utilization</span>
                      <span style={{ color: "var(--wz-indigo)", fontFamily: "var(--font-geist-mono), monospace" }}>18% of 0.1 vCPU</span>
                    </div>
                    <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "9999px", overflow: "hidden" }}>
                      <div style={{ width: "18%", height: "100%", background: "var(--wz-indigo)", borderRadius: "9999px" }} />
                    </div>
                  </div>

                  <div style={{ background: "var(--wz-surface)", padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--wz-border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.5rem" }}>
                      <span>Memory Usage</span>
                      <span style={{ color: "var(--wz-indigo)", fontFamily: "var(--font-geist-mono), monospace" }}>142 MB / 512 MB (27%)</span>
                    </div>
                    <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "9999px", overflow: "hidden" }}>
                      <div style={{ width: "27%", height: "100%", background: "var(--wz-indigo)", borderRadius: "9999px" }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activePreview === "functions" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "1.25rem", borderBottom: "1px solid var(--wz-border)" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--wz-text-primary)" }}>tax-calculator</span>
                      <span style={{ fontSize: "0.68rem", fontFamily: "var(--font-geist-mono), monospace", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "9999px", background: "#cffafe", color: "#0e7490", border: "1px solid #a5f3fc" }}>
                        V8 ISOLATE ACTIVE
                      </span>
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--wz-text-muted)", fontFamily: "var(--font-geist-mono), monospace", marginTop: "0.2rem" }}>
                      https://tax-calculator.fn.whizan.cloud/calculate
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontFamily: "var(--font-geist-mono), monospace" }}>
                    <div style={{ fontSize: "0.84rem", fontWeight: 750 }}>Cold Start: 3.8ms</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--wz-emerald)" }}>0 Host Ports</div>
                  </div>
                </div>

                <div style={{ background: "var(--wz-surface)", padding: "1.25rem", borderRadius: "12px", border: "1px solid var(--wz-border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.4rem" }}>
                    <Lock size={15} color="var(--wz-azure)" /> Granular Security &amp; Function API Key
                  </div>
                  <p style={{ fontSize: "0.82rem", color: "var(--wz-text-secondary)", lineHeight: 1.5, margin: "0 0 1rem 0" }}>
                    Whizan strictly categorizes function security: public webhooks vs protected endpoints requiring dedicated Function API keys.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", fontFamily: "var(--font-geist-mono), monospace", fontSize: "0.75rem" }}>
                    <div style={{ background: "var(--wz-white)", padding: "0.85rem", borderRadius: "8px", border: "1px solid var(--wz-border)" }}>
                      <div style={{ color: "var(--wz-text-muted)" }}>ENDPOINT CLASSIFICATION</div>
                      <div style={{ fontWeight: 750, color: "var(--wz-text-primary)", marginTop: "0.25rem" }}>Protected API Endpoint</div>
                      <div style={{ color: "var(--wz-text-muted)" }}>isPublic: false (Mandatory)</div>
                    </div>
                    <div style={{ background: "var(--wz-white)", padding: "0.85rem", borderRadius: "8px", border: "1px solid var(--wz-border)" }}>
                      <div style={{ color: "var(--wz-text-muted)" }}>LIVE API KEY</div>
                      <div style={{ fontWeight: 750, color: "var(--wz-cyan)", marginTop: "0.25rem" }}>whz_fn_live_9a4f2b8...</div>
                      <div style={{ color: "var(--wz-text-muted)" }}>Header: x-whizan-fn-key</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activePreview === "database" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "1.25rem", borderBottom: "1px solid var(--wz-border)" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--wz-text-primary)" }}>production-postgres</span>
                      <span style={{ fontSize: "0.68rem", fontFamily: "var(--font-geist-mono), monospace", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "9999px", background: "#ede9fe", color: "#6d28d9", border: "1px solid #ddd6fe" }}>
                        PG 16.2 ACTIVE
                      </span>
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--wz-text-muted)", fontFamily: "var(--font-geist-mono), monospace", marginTop: "0.2rem" }}>
                      Pooler: PgBouncer Active • Connections: 8 / 50 Active
                    </div>
                  </div>
                  <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono), monospace", padding: "0.25rem 0.55rem", borderRadius: "6px", background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0", fontWeight: 600 }}>
                    TLS 1.3 Verified
                  </span>
                </div>

                <div className="wz-code-terminal">
                  <div className="wz-terminal-bar">
                    <span style={{ color: "#e2e8f0" }}>SQL Query Console &amp; Schema Inspector</span>
                    <span style={{ color: "var(--wz-emerald)" }}>Query Time: 1.2ms</span>
                  </div>
                  <div className="wz-terminal-body">
                    <div style={{ color: "#38bdf8" }}>
                      SELECT id, email, role, created_at FROM users WHERE active = true LIMIT 2;
                    </div>
                    <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #334155", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", color: "#94a3b8" }}>
                      <span>id</span><span>email</span><span>role</span><span>created_at</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", color: "#e2e8f0", paddingTop: "0.35rem" }}>
                      <span>usr_104</span><span>alex@company.com</span><span style={{ color: "var(--wz-emerald)" }}>admin</span><span>2026-10-18</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", color: "#e2e8f0", paddingTop: "0.35rem" }}>
                      <span>usr_105</span><span>dev@startup.io</span><span style={{ color: "var(--wz-azure)" }}>developer</span><span>2026-10-19</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
