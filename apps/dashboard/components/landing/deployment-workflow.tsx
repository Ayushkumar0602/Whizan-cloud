"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function DeploymentWorkflow() {
  const [activeTab, setActiveTab] = useState<"build-logs" | "cli" | "mcp">("build-logs");

  const workflowSteps = [
    {
      step: "01",
      title: "Connect Source",
      desc: "Connect your GitHub repository or use direct CLI upload with whizan deploy. Automatic framework and language detection via Gemini 3.5 Flash Lite.",
    },
    {
      step: "02",
      title: "Configure & Secure",
      desc: "Environment variables encrypted via AES-256. Automatic internal port detection and 0.0.0.0 mesh binding validation to prevent loopback traps.",
    },
    {
      step: "03",
      title: "Isolated Build",
      desc: "Build worker isolates dependency installation, runs multi-stage Docker caching, and synthesizes Next.js or polyglot container runtimes.",
    },
    {
      step: "04",
      title: "Zero-Downtime Cutover",
      desc: "New container starts and undergoes automated HTTP health probes. Edge router switches live traffic seamlessly without dropped requests.",
    },
  ];

  return (
    <section className="wz-section">
      <div className="wz-container">
        {/* Section Header */}
        <div className="wz-section-header">
          <div className="wz-section-eyebrow">DEVELOPER EXPERIENCE &amp; DEPLOYMENT</div>
          <h2 className="wz-section-title">
            Less infrastructure friction. More time building.
          </h2>
          <p className="wz-section-desc">
            Move from code commit to production in seconds with automated builds, health verification, and zero-downtime cutovers.
          </p>
        </div>

        {/* 4-Step Linear Flow Cards */}
        <div className="wz-steps-grid">
          {workflowSteps.map((s) => (
            <div key={s.step} className="wz-step-card">
              <div>
                <span className="wz-step-num">STEP {s.step}</span>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 750, color: "var(--wz-text-primary)", marginBottom: "0.4rem" }}>
                  {s.title}
                </h3>
                <p style={{ fontSize: "0.82rem", color: "var(--wz-text-secondary)", lineHeight: 1.55 }}>
                  {s.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Interactive Terminal */}
        <div className="wz-code-terminal">
          <div className="wz-terminal-bar">
            <div className="wz-terminal-dots">
              <span className="wz-dot-red" />
              <span className="wz-dot-yellow" />
              <span className="wz-dot-green" />
              <span style={{ marginLeft: "0.6rem", color: "#e2e8f0", fontWeight: 600 }}>
                whizan-runtime-v2.whizan.cloud
              </span>
            </div>

            <div style={{ display: "flex", gap: "0.35rem" }}>
              <button
                type="button"
                onClick={() => setActiveTab("build-logs")}
                style={{
                  padding: "0.25rem 0.65rem",
                  borderRadius: "6px",
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-geist-mono), monospace",
                  border: "none",
                  cursor: "pointer",
                  background: activeTab === "build-logs" ? "var(--wz-azure)" : "transparent",
                  color: activeTab === "build-logs" ? "#ffffff" : "#94a3b8",
                  fontWeight: 600,
                }}
              >
                Live Build Logs
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("cli")}
                style={{
                  padding: "0.25rem 0.65rem",
                  borderRadius: "6px",
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-geist-mono), monospace",
                  border: "none",
                  cursor: "pointer",
                  background: activeTab === "cli" ? "var(--wz-azure)" : "transparent",
                  color: activeTab === "cli" ? "#ffffff" : "#94a3b8",
                  fontWeight: 600,
                }}
              >
                Whizan CLI
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("mcp")}
                style={{
                  padding: "0.25rem 0.65rem",
                  borderRadius: "6px",
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-geist-mono), monospace",
                  border: "none",
                  cursor: "pointer",
                  background: activeTab === "mcp" ? "var(--wz-azure)" : "transparent",
                  color: activeTab === "mcp" ? "#ffffff" : "#94a3b8",
                  fontWeight: 600,
                }}
              >
                AI MCP Session
              </button>
            </div>
          </div>

          <div className="wz-terminal-body" style={{ minHeight: "260px" }}>
            {activeTab === "build-logs" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <div style={{ color: "#64748b" }}>
                  [whizan:builder] 23:41:02 Initiating isolated build pipeline for deployment dep_9f81a7b...
                </div>
                <div style={{ color: "#94a3b8" }}>
                  [whizan:builder] Commit: <span style={{ color: "var(--wz-azure)" }}>4c810fb</span> &quot;feat: optimize edge caching &amp; database connection pooling&quot;
                </div>
                <div style={{ color: "#94a3b8" }}>
                  [whizan:builder] Stack detected: <span style={{ color: "var(--wz-emerald)", fontWeight: 700 }}>Next.js 16 (App Router / Standalone Output)</span>
                </div>
                <div style={{ color: "#94a3b8" }}>
                  [whizan:builder] Validating environment variables: <span style={{ color: "var(--wz-emerald)" }}>4 required vars decrypted</span>
                </div>
                <div style={{ color: "#94a3b8" }}>
                  [whizan:docker] Stage 1/3: Restoring cached node_modules layer (248MB)...
                </div>
                <div style={{ color: "#94a3b8" }}>
                  [whizan:docker] Stage 2/3: Executing `npm run build` with Turbopack...
                </div>
                <div style={{ paddingLeft: "1rem", borderLeft: "2px solid #334155", color: "#e2e8f0", margin: "0.25rem 0" }}>
                  ▲ Next.js 16.3.6 (Turbopack)<br />
                  ✓ Compiled client &amp; server routes in 1.4s<br />
                  ✓ Generated static pages (18 routes)<br />
                  ✓ Dynamic server rendered routes (6 routes) verified<br />
                  ✓ Standalone server bundle synthesized: .next/standalone
                </div>
                <div style={{ color: "var(--wz-azure)" }}>
                  [whizan:health] Launching health probe: HTTP GET http://127.0.0.1:3000/api/health...
                </div>
                <div style={{ color: "var(--wz-emerald)", fontWeight: 700 }}>
                  [whizan:health] ✓ Health probe returned HTTP 200 OK (latency: 4ms)
                </div>
                <div style={{ color: "#a7f3d0", fontWeight: 800, paddingTop: "0.5rem", borderTop: "1px solid #1e293b" }}>
                  [whizan:edge] ✓ Cutover complete! Deployment is ACTIVE at:
                </div>
                <div style={{ color: "#38bdf8", fontWeight: 800, fontSize: "0.9rem" }}>
                  → https://storefront.whizan.cloud (TLS 1.3 Active)
                </div>
              </div>
            )}

            {activeTab === "cli" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div>
                  <span style={{ color: "var(--wz-emerald)", fontWeight: 700 }}>$</span> whizan login
                </div>
                <div style={{ color: "#e2e8f0" }}>
                  ✓ Authenticated as ayush@whizan.cloud (Hobby Plan Active)
                </div>

                <div style={{ paddingTop: "0.5rem" }}>
                  <span style={{ color: "var(--wz-emerald)", fontWeight: 700 }}>$</span> whizan deploy --prod
                </div>
                <div style={{ color: "#e2e8f0" }}>
                  🔍 Analyzing repository structure...<br />
                  ✓ Language: TypeScript / Next.js<br />
                  ✓ Target: Frontend Edge Hosting (/dashboard/hosting)<br />
                  📦 Compressing source archive (4.2MB)...<br />
                  🚀 Enqueued build job: dep_9f81a7b on Whizan Cloud Build Worker<br />
                  ⏳ Streaming logs from build worker...
                </div>

                <div style={{ paddingTop: "0.5rem" }}>
                  <span style={{ color: "var(--wz-emerald)", fontWeight: 700 }}>$</span> whizan logs --tail
                </div>
                <div style={{ color: "#e2e8f0" }}>
                  2026-10-20T23:41:04.120Z [web] INFO: Server listening at 0.0.0.0:3000<br />
                  2026-10-20T23:41:04.890Z [web] GET / 200 OK - 8ms (Edge Cache HIT)<br />
                  2026-10-20T23:41:05.340Z [web] GET /api/products 200 OK - 12ms (Postgres Pooled)
                </div>
              </div>
            )}

            {activeTab === "mcp" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ color: "#a5b4fc" }}>
                  // Claude / Cursor invoking Whizan Model Context Protocol:
                </div>
                <div>
                  <span style={{ color: "#fbbf24", fontWeight: 700 }}>&gt;&gt; call_mcp_tool:</span> whizan_analyze_workspace()
                </div>
                <div style={{ paddingLeft: "1rem", borderLeft: "2px solid #334155", color: "#94a3b8" }}>
                  {`{`}<br />
                  &nbsp;&nbsp;&quot;projectType&quot;: &quot;WEB_FULLSTACK&quot;,<br />
                  &nbsp;&nbsp;&quot;framework&quot;: &quot;NEXTJS&quot;,<br />
                  &nbsp;&nbsp;&quot;internalPort&quot;: 3000,<br />
                  &nbsp;&nbsp;&quot;guardrailPassed&quot;: true,<br />
                  &nbsp;&nbsp;&quot;recommendation&quot;: &quot;whizan_create_project(framework='NEXTJS', outputDir='.next')&quot;<br />
                  {`}`}
                </div>

                <div style={{ paddingTop: "0.5rem" }}>
                  <span style={{ color: "#fbbf24", fontWeight: 700 }}>&gt;&gt; call_mcp_tool:</span> whizan_deploy_direct(slug=&quot;storefront&quot;)
                </div>
                <div style={{ paddingLeft: "1rem", borderLeft: "2px solid #334155", color: "var(--wz-emerald)" }}>
                  ✓ Source uploaded. Build enqueued: dep_9f81a7b.<br />
                  ✓ Cutover successful: 200 OK. Zero-redundancy cleanup completed.
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: "0.6rem 1rem", background: "#0b0f19", borderTop: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.72rem", color: "#94a3b8" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--wz-emerald)" }}>
              <span className="wz-pulse-dot" />
              Build Worker: Ready
            </span>
            <Link href="/dashboard/cli" style={{ color: "#38bdf8", textDecoration: "none", fontWeight: 600 }}>
              Explore CLI Docs →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
