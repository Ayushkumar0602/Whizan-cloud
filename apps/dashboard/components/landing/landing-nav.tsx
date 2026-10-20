"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth";
import {
  Globe,
  Server,
  Zap,
  Database,
  Terminal,
  Clock,
  Workflow,
  Bot,
  BookOpen,
  ArrowRight,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";

export function LandingNav() {
  const { user, loading } = useAuth();
  const [platformOpen, setPlatformOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const platformRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (platformRef.current && !platformRef.current.contains(e.target as Node)) {
        setPlatformOpen(false);
      }
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="wz-nav-wrapper">
      <div className="wz-nav-inner">
        {/* Left Side: Brand Logo and Navigation Links */}
        <div className="wz-nav-left">
          <Link href="/" className="wz-nav-logo-link" aria-label="Whizan Cloud Services">
            <Image
              src="/whizan_logo.png"
              alt="Whizan Cloud Services"
              width={160}
              height={36}
              priority
              className="wz-nav-logo"
            />
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="wz-nav-menu">
            {/* Platform Dropdown */}
            <div className="wz-nav-item" ref={platformRef}>
              <button
                type="button"
                onClick={() => {
                  setPlatformOpen(!platformOpen);
                  setToolsOpen(false);
                }}
                className={`wz-nav-link ${platformOpen ? "active" : ""}`}
                aria-expanded={platformOpen}
              >
                <span>Platform</span>
                <ChevronDown size={14} style={{ transition: "transform 0.15s ease", transform: platformOpen ? "rotate(180deg)" : "none" }} />
              </button>

              {platformOpen && (
                <div className="wz-dropdown-menu">
                  <div className="wz-dropdown-header">Compute &amp; Workloads</div>
                  <Link
                    href="/dashboard/hosting"
                    onClick={() => setPlatformOpen(false)}
                    className="wz-dropdown-item"
                  >
                    <div className="wz-dropdown-icon" style={{ background: "#e0f2fe", color: "#0284c7" }}>
                      <Globe size={16} />
                    </div>
                    <div>
                      <div className="wz-dropdown-title">
                        Frontend Hosting
                        <span style={{ fontSize: "0.62rem", background: "#e0f2fe", color: "#0369a1", padding: "0.1rem 0.35rem", borderRadius: "4px" }}>
                          Next.js &amp; Vite
                        </span>
                      </div>
                      <div className="wz-dropdown-desc">Edge routing, CDN caching &amp; automated SSL</div>
                    </div>
                  </Link>

                  <Link
                    href="/dashboard/backend"
                    onClick={() => setPlatformOpen(false)}
                    className="wz-dropdown-item"
                  >
                    <div className="wz-dropdown-icon" style={{ background: "#e0e7ff", color: "#4f46e5" }}>
                      <Server size={16} />
                    </div>
                    <div>
                      <div className="wz-dropdown-title">Backend Container Services</div>
                      <div className="wz-dropdown-desc">Polyglot Docker containers &amp; background queue workers</div>
                    </div>
                  </Link>

                  <Link
                    href="/dashboard/functions"
                    onClick={() => setPlatformOpen(false)}
                    className="wz-dropdown-item"
                  >
                    <div className="wz-dropdown-icon" style={{ background: "#cffafe", color: "#0891b2" }}>
                      <Zap size={16} />
                    </div>
                    <div>
                      <div className="wz-dropdown-title">
                        Serverless Edge Functions
                        <span style={{ fontSize: "0.62rem", background: "#cffafe", color: "#0e7490", padding: "0.1rem 0.35rem", borderRadius: "4px" }}>
                          Sub-5ms
                        </span>
                      </div>
                      <div className="wz-dropdown-desc">V8 isolates with protected Function API keys</div>
                    </div>
                  </Link>

                  <Link
                    href="/dashboard/databases"
                    onClick={() => setPlatformOpen(false)}
                    className="wz-dropdown-item"
                  >
                    <div className="wz-dropdown-icon" style={{ background: "#ede9fe", color: "#7c3aed" }}>
                      <Database size={16} />
                    </div>
                    <div>
                      <div className="wz-dropdown-title">PostgreSQL &amp; Redis</div>
                      <div className="wz-dropdown-desc">PgBouncer pooling &amp; in-memory cache</div>
                    </div>
                  </Link>
                </div>
              )}
            </div>

            {/* Architecture Link */}
            <div className="wz-nav-item">
              <a href="#architecture" className="wz-nav-link">
                Architecture
              </a>
            </div>

            {/* Deployments Link */}
            <div className="wz-nav-item">
              <a href="#deployments" className="wz-nav-link">
                Deployments
              </a>
            </div>

            {/* Developer Tools Dropdown */}
            <div className="wz-nav-item" ref={toolsRef}>
              <button
                type="button"
                onClick={() => {
                  setToolsOpen(!toolsOpen);
                  setPlatformOpen(false);
                }}
                className={`wz-nav-link ${toolsOpen ? "active" : ""}`}
                aria-expanded={toolsOpen}
              >
                <span>Developer Tools</span>
                <ChevronDown size={14} style={{ transition: "transform 0.15s ease", transform: toolsOpen ? "rotate(180deg)" : "none" }} />
              </button>

              {toolsOpen && (
                <div className="wz-dropdown-menu">
                  <div className="wz-dropdown-header">DevOps &amp; Automation</div>
                  <Link
                    href="/dashboard/cli"
                    onClick={() => setToolsOpen(false)}
                    className="wz-dropdown-item"
                  >
                    <div className="wz-dropdown-icon" style={{ background: "#f1f5f9", color: "#334155" }}>
                      <Terminal size={16} />
                    </div>
                    <div>
                      <div className="wz-dropdown-title">Whizan CLI &amp; SDK</div>
                      <div className="wz-dropdown-desc">Deploy and stream logs directly from shell</div>
                    </div>
                  </Link>

                  <Link
                    href="/dashboard/flows"
                    onClick={() => setToolsOpen(false)}
                    className="wz-dropdown-item"
                  >
                    <div className="wz-dropdown-icon" style={{ background: "#e0f2fe", color: "#0284c7" }}>
                      <Workflow size={16} />
                    </div>
                    <div>
                      <div className="wz-dropdown-title">Whizan Flow</div>
                      <div className="wz-dropdown-desc">Multi-step promotion &amp; approval pipelines</div>
                    </div>
                  </Link>

                  <Link
                    href="/dashboard/cron"
                    onClick={() => setToolsOpen(false)}
                    className="wz-dropdown-item"
                  >
                    <div className="wz-dropdown-icon" style={{ background: "#fef3c7", color: "#d97706" }}>
                      <Clock size={16} />
                    </div>
                    <div>
                      <div className="wz-dropdown-title">Zero-Idle Cron</div>
                      <div className="wz-dropdown-desc">High-precision Redis ZSet scheduling</div>
                    </div>
                  </Link>

                  <Link
                    href="/dashboard/mcp"
                    onClick={() => setToolsOpen(false)}
                    className="wz-dropdown-item"
                  >
                    <div className="wz-dropdown-icon" style={{ background: "#ede9fe", color: "#6366f1" }}>
                      <Bot size={16} />
                    </div>
                    <div>
                      <div className="wz-dropdown-title">
                        MCP &amp; AI DevOps
                        <span style={{ fontSize: "0.62rem", background: "#ede9fe", color: "#4f46e5", padding: "0.1rem 0.35rem", borderRadius: "4px", fontWeight: 700 }}>
                          AI
                        </span>
                      </div>
                      <div className="wz-dropdown-desc">Stdio protocol for Cursor, Windsurf &amp; Claude</div>
                    </div>
                  </Link>
                </div>
              )}
            </div>

            {/* Docs Link */}
            <div className="wz-nav-item">
              <Link href="/docs" className="wz-nav-link">
                Docs
              </Link>
            </div>
          </nav>
        </div>

        {/* Right Side: Auth / CTA Buttons */}
        <div className="wz-nav-right">
          {loading ? (
            <div style={{ width: 80, height: 36, background: "var(--wz-surface)", borderRadius: 8 }} />
          ) : user ? (
            <Link href="/dashboard" className="wz-btn-primary">
              <span>Console</span>
              <ArrowRight size={14} />
            </Link>
          ) : (
            <>
              <Link href="/login" className="wz-btn-ghost">
                Sign in
              </Link>
              <Link href="/register" className="wz-btn-primary">
                <span>Get Started</span>
                <ArrowRight size={14} />
              </Link>
            </>
          )}

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{ display: "none", background: "none", border: "none", padding: "0.5rem", cursor: "pointer", color: "var(--wz-text-secondary)" }}
            aria-label="Toggle navigation"
            className="wz-mobile-toggle"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div style={{ background: "var(--wz-white)", borderBottom: "1px solid var(--wz-border)", padding: "1rem 1.5rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--wz-text-light)", textTransform: "uppercase", paddingBottom: "0.25rem" }}>
            Platform
          </div>
          <Link href="/dashboard/hosting" onClick={() => setMobileMenuOpen(false)} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0", color: "var(--wz-text-primary)", textDecoration: "none", fontSize: "0.9rem" }}>
            <Globe size={16} color="var(--wz-azure)" /> Frontend Hosting
          </Link>
          <Link href="/dashboard/backend" onClick={() => setMobileMenuOpen(false)} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0", color: "var(--wz-text-primary)", textDecoration: "none", fontSize: "0.9rem" }}>
            <Server size={16} color="var(--wz-indigo)" /> Backend Services
          </Link>
          <Link href="/dashboard/functions" onClick={() => setMobileMenuOpen(false)} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0", color: "var(--wz-text-primary)", textDecoration: "none", fontSize: "0.9rem" }}>
            <Zap size={16} color="var(--wz-cyan)" /> Edge Functions
          </Link>
          <Link href="/dashboard/databases" onClick={() => setMobileMenuOpen(false)} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0", color: "var(--wz-text-primary)", textDecoration: "none", fontSize: "0.9rem" }}>
            <Database size={16} color="var(--wz-violet)" /> PostgreSQL &amp; Redis
          </Link>
          <div style={{ borderTop: "1px solid var(--wz-border)", paddingTop: "0.75rem", marginTop: "0.5rem" }}>
            <Link href={user ? "/dashboard" : "/register"} className="wz-btn-primary" style={{ width: "100%", justifyContent: "center" }}>
              {user ? "Console" : "Get Started"}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
