"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  Terminal,
  Server,
  Globe,
  Zap,
  Cpu,
  Layers,
  Code2,
  ExternalLink,
  ShieldCheck,
  Check,
  Copy,
  Workflow,
  Clock
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand";

export default function DocsPage() {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  function copyCode(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedCmd(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedCmd(null), 2000);
  }

  const sections = [
    {
      title: "Platform Architecture",
      icon: Layers,
      desc: "Whizan Cloud is a high-performance developer platform running containerized microservices, edge-routed frontends, and isolated serverless functions on dedicated Azure VM infrastructure.",
      topics: [
        { name: "Edge Router & Ingress", desc: "Dynamic Caddy-powered reverse proxy handling wildcard *.nip.io routing on Port 80 with sub-millisecond dispatch." },
        { name: "Container Mesh", desc: "Private Docker network mesh isolating tenant workloads with internal DNS resolution (service-<id>:port)." },
        { name: "V8 Function Runtime", desc: "Serverless JavaScript/TypeScript isolates with sub-5ms cold starts and 0 container port overhead." }
      ]
    },
    {
      title: "Developer Tooling",
      icon: Terminal,
      desc: "Interact with Whizan Cloud from your terminal, CI/CD pipeline, or AI coding assistant (Cursor, Antigravity, VS Code, Claude).",
      topics: [
        { name: "DevOps MCP Server", desc: "Connects your local IDE to Whizan Cloud for autonomous workspace audits, Docker generation, and live deployment." },
        { name: "Whizan CLI (@whizan/cli)", desc: "Command line utility to authenticate, deploy codebases, inspect live containers, and tail build logs." },
        { name: "Whizan Flow DSL", desc: "TypeScript pipeline automation engine for event-driven deployments, Slack webhooks, and automated rollbacks." }
      ]
    },
    {
      title: "REST API Reference",
      icon: Code2,
      desc: "Full programmatic access to project management, container lifecycle, environment variables, and telemetry streams.",
      topics: [
        { name: "POST /api/deploy/direct", desc: "Direct code archive upload with automatic stack synthesis and build queuing." },
        { name: "GET /api/services", desc: "List all deployed microservices, container ports, memory usage, and health check statuses." },
        { name: "POST /api/functions/deploy", desc: "Deploy compiled ESM edge function bundles with zero-downtime cutover." }
      ]
    }
  ];

  return (
    <div className="docs-shell">
      <header className="docs-header">
        <div className="docs-header-inner">
          <div className="docs-header-left">
            <BrandMark href="/dashboard" />
            <span className="docs-badge">Documentation Hub</span>
          </div>
          <div className="docs-header-right">
            <Link href="/dashboard" className="btn btn-secondary btn-sm">
              <ArrowLeft size={14} /> Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="docs-main">
        {/* Hero */}
        <div className="docs-hero">
          <div className="docs-hero-pill">
            <BookOpen size={14} className="text-indigo-600" />
            <span>Developer Guides & Architecture</span>
          </div>
          <h1 className="docs-title">Whizan Cloud Documentation</h1>
          <p className="docs-subtitle">
            Everything you need to build, deploy, and scale web applications, microservices, serverless functions, and scheduled workers on Whizan Cloud.
          </p>

          <div className="docs-quick-links">
            <div className="docs-cmd-box">
              <div className="docs-cmd-text">
                <span className="text-slate-400">$</span> npm install -g @whizan/cli
              </div>
              <button
                onClick={() => copyCode("npm install -g @whizan/cli", "cli")}
                className="docs-copy-btn"
                aria-label="Copy CLI command"
              >
                {copiedCmd === "cli" ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="docs-cmd-box">
              <div className="docs-cmd-text">
                <span className="text-slate-400">$</span> npx @whizan/mcp-devops login
              </div>
              <button
                onClick={() => copyCode("npx @whizan/mcp-devops login", "mcp")}
                className="docs-copy-btn"
                aria-label="Copy MCP command"
              >
                {copiedCmd === "mcp" ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>

        {/* Sections Grid */}
        <div className="docs-grid">
          {sections.map((sec, idx) => {
            const Icon = sec.icon;
            return (
              <div key={idx} className="docs-card">
                <div className="docs-card-header">
                  <div className="docs-card-icon">
                    <Icon size={20} className="text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="docs-card-title">{sec.title}</h2>
                    <p className="docs-card-desc">{sec.desc}</p>
                  </div>
                </div>

                <div className="docs-topics-list">
                  {sec.topics.map((t, tIdx) => (
                    <div key={tIdx} className="docs-topic-item">
                      <div className="docs-topic-name">{t.name}</div>
                      <div className="docs-topic-desc">{t.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <style>{`
        .docs-shell {
          min-height: 100vh;
          background: var(--background);
          color: var(--foreground);
        }
        .docs-header {
          position: sticky;
          top: 0;
          z-index: 40;
          background: #ffffff;
          border-bottom: 1px solid var(--border);
        }
        .docs-header-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 1rem 1.75rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .docs-header-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .docs-badge {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--accent);
          background: rgba(79, 70, 229, 0.08);
          border: 1px solid rgba(79, 70, 229, 0.2);
          border-radius: 6px;
          padding: 0.2rem 0.55rem;
        }
        .docs-main {
          max-width: 1200px;
          margin: 0 auto;
          padding: 3rem 1.75rem 5rem;
        }
        .docs-hero {
          text-align: center;
          max-width: 780px;
          margin: 0 auto 3.5rem;
        }
        .docs-hero-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          background: rgba(79, 70, 229, 0.08);
          border: 1px solid rgba(79, 70, 229, 0.2);
          border-radius: 9999px;
          padding: 0.25rem 0.75rem;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--accent);
          margin-bottom: 1.25rem;
        }
        .docs-title {
          font-size: 2.5rem;
          font-weight: 800;
          letter-spacing: -0.035em;
          color: var(--foreground);
          line-height: 1.15;
          margin-bottom: 0.75rem;
        }
        .docs-subtitle {
          font-size: 1.05rem;
          color: var(--muted);
          line-height: 1.6;
        }
        .docs-quick-links {
          display: flex;
          justify-content: center;
          gap: 1rem;
          margin-top: 1.75rem;
          flex-wrap: wrap;
        }
        .docs-cmd-box {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.5rem 0.85rem;
          font-family: var(--font-geist-mono), monospace;
          font-size: 0.82rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
        }
        .docs-copy-btn {
          border: none;
          background: transparent;
          cursor: pointer;
          color: var(--muted);
          padding: 0.2rem;
          display: flex;
          align-items: center;
        }
        .docs-copy-btn:hover {
          color: var(--foreground);
        }
        .docs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
          gap: 1.75rem;
        }
        .docs-card {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 1.75rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }
        .docs-card-header {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .docs-card-icon {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          background: rgba(79, 70, 229, 0.08);
          border: 1px solid rgba(79, 70, 229, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .docs-card-title {
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--foreground);
          letter-spacing: -0.02em;
        }
        .docs-card-desc {
          font-size: 0.82rem;
          color: var(--muted);
          margin-top: 0.35rem;
          line-height: 1.5;
        }
        .docs-topics-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          border-top: 1px solid var(--border);
          padding-top: 1.25rem;
        }
        .docs-topic-name {
          font-size: 0.88rem;
          font-weight: 650;
          color: var(--foreground);
          font-family: var(--font-geist-mono), monospace;
        }
        .docs-topic-desc {
          font-size: 0.8rem;
          color: var(--muted);
          margin-top: 0.25rem;
          line-height: 1.45;
        }
      `}</style>
    </div>
  );
}
