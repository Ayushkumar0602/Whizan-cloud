"use client";

import { useState } from "react";
import Link from "next/link";
import { useSystemStatus } from "@/hooks/useSystemStatus";
import {
  Mail,
  Copy,
  Check,
  Send,
  AlertTriangle,
  CheckCircle2,
  Server,
  Shield,
  HelpCircle,
  ExternalLink,
  MessageSquare,
  Sparkles,
  ArrowRight,
  Clock,
  User,
} from "lucide-react";
import { toast } from "sonner";

export function ContactContent({ isInsideDashboard = false }: { isInsideDashboard?: boolean }) {
  const { vmOnline, loading, contactEmail } = useSystemStatus();
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subjectCategory, setSubjectCategory] = useState("Request Infrastructure Reactivation (Azure VM)");
  const [message, setMessage] = useState("");

  const effectiveEmail = contactEmail || "ayushkumarjais0602@gmail.com";

  function handleCopyEmail() {
    navigator.clipboard.writeText(effectiveEmail);
    setCopied(true);
    toast.success("Email address copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  }

  function handleSendMailto(e: React.FormEvent) {
    e.preventDefault();
    const fullSubject = encodeURIComponent(`[Whizan Cloud] ${subjectCategory}${name ? ` - from ${name}` : ""}`);
    const fullBody = encodeURIComponent(
      `Hello Ayush,\n\n${message || "I am reaching out regarding Whizan Cloud Service."}\n\n${
        name ? `Sender Name: ${name}\n` : ""
      }${email ? `Sender Email: ${email}\n` : ""}`
    );
    window.location.href = `mailto:${effectiveEmail}?subject=${fullSubject}&body=${fullBody}`;
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", paddingBottom: "3rem" }}>
      {/* Top Banner / Status Indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
          padding: "1rem 1.25rem",
          borderRadius: "var(--radius)",
          background: vmOnline ? "var(--success-bg)" : "var(--warning-bg)",
          border: `1px solid ${vmOnline ? "var(--success-border)" : "var(--warning-border)"}`,
          marginBottom: "2rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {vmOnline ? (
            <CheckCircle2 size={20} style={{ color: "var(--success)" }} />
          ) : (
            <AlertTriangle size={20} style={{ color: "var(--warning)" }} />
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--foreground)" }}>
              {vmOnline ? "Cloud Compute Host: Operational & Live" : "Cloud Compute Host: Temporarily Paused (Maintenance)"}
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "2px" }}>
              {vmOnline
                ? "The Azure VM worker nodes and Edge Router are running normally. Deployments are active."
                : "The Azure VM is currently powered down by administration. New deployments and serving are paused."}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              borderRadius: "999px",
              fontSize: "0.78rem",
              fontWeight: 600,
              background: vmOnline ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.18)",
              color: vmOnline ? "var(--success)" : "var(--warning)",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: vmOnline ? "var(--success)" : "var(--warning)",
              }}
            />
            {vmOnline ? "ALL SYSTEMS GO" : "AZURE VM OFFLINE"}
          </span>
        </div>
      </div>

      {/* Hero Header */}
      <div style={{ marginBottom: "2.5rem" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 12px",
            borderRadius: "999px",
            background: "rgba(79, 70, 229, 0.08)",
            border: "1px solid rgba(79, 70, 229, 0.2)",
            color: "var(--accent)",
            fontSize: "0.82rem",
            fontWeight: 600,
            marginBottom: "0.75rem",
          }}
        >
          <Sparkles size={13} /> Official Platform Administration
        </div>
        <h1
          style={{
            fontSize: "2.25rem",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: "var(--foreground)",
            marginBottom: "0.5rem",
          }}
        >
          Contact & Infrastructure Inquiries
        </h1>
        <p style={{ fontSize: "1.05rem", color: "var(--muted)", maxWidth: 680, lineHeight: 1.6 }}>
          Have questions regarding Whizan Cloud Service, request reactivation of the Azure VM host for testing, or need
          technical assistance with your deployments? Contact the administration directly.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" }}>
        {/* Left Column: Direct Contact & Info */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* Primary Email Card */}
          <div
            style={{
              padding: "1.75rem",
              borderRadius: "var(--radius-lg)",
              background: "var(--card)",
              border: "1px solid var(--card-border)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "12px",
                  background: "var(--accent-gradient)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                }}
              >
                <Mail size={22} />
              </div>
              <div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>
                  Direct Administrator Email
                </div>
                <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--foreground)" }}>
                  Ayush Kumar Jaiswal
                </div>
              </div>
            </div>

            <p style={{ fontSize: "0.9rem", color: "var(--muted)", lineHeight: 1.5, marginBottom: "1.25rem" }}>
              For deployment requests, cloud instance provisioning, or reactivation of Azure VM compute nodes, email us
              directly.
            </p>

            {/* Email Box */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius)",
                background: "var(--bg-subtle)",
                border: "1px solid var(--border)",
                marginBottom: "1rem",
              }}
            >
              <code style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--foreground)" }}>
                {effectiveEmail}
              </code>
              <button
                type="button"
                onClick={handleCopyEmail}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  borderRadius: "var(--radius-sm)",
                  background: copied ? "var(--success-bg)" : "var(--card)",
                  border: `1px solid ${copied ? "var(--success-border)" : "var(--border)"}`,
                  color: copied ? "var(--success)" : "var(--foreground)",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  transition: "all 0.15s ease",
                }}
                aria-label="Copy email address"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <a
                href={`mailto:${effectiveEmail}?subject=Whizan%20Cloud%20Platform%20Inquiry`}
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "0.7rem 1.25rem",
                  borderRadius: "var(--radius)",
                  background: "var(--accent)",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  textDecoration: "none",
                }}
              >
                <Mail size={16} /> Open Mail Client
              </a>
            </div>
          </div>

          {/* Platform Status & Policy Card */}
          <div
            style={{
              padding: "1.5rem",
              borderRadius: "var(--radius-lg)",
              background: "var(--card)",
              border: "1px solid var(--card-border)",
            }}
          >
            <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "6px" }}>
              <Server size={17} style={{ color: "var(--accent)" }} /> Infrastructure Management Policy
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.55 }}>
              Whizan Cloud Service is a developer project. To prevent excessive cloud charges when not in active use, the
              Azure VM host (which runs Docker, build workers, and the edge router) is scheduled to sleep.
            </p>
            <div style={{ marginTop: "1rem", padding: "0.75rem", borderRadius: "var(--radius)", background: "var(--bg-inset)", border: "1px solid var(--border-light)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", fontWeight: 600, color: "var(--foreground)" }}>
                <Clock size={14} style={{ color: "var(--accent)" }} /> Typical Reactivation Time
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "3px" }}>
                Send an email with the subject <em>"Reactivate Azure VM"</em> and the host will be turned on promptly for
                your testing session.
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Inquiry Form */}
        <div
          style={{
            padding: "1.75rem",
            borderRadius: "var(--radius-lg)",
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <MessageSquare size={20} style={{ color: "var(--accent)" }} />
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--foreground)" }}>
              Send Administration Message
            </h2>
          </div>
          <p style={{ fontSize: "0.88rem", color: "var(--muted)", marginBottom: "1.5rem", lineHeight: 1.5 }}>
            Fill in the details below. Clicking send will open your default email application with all details pre-filled.
          </p>

          <form onSubmit={handleSendMailto} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "5px", color: "var(--foreground)" }}>
                Your Name
              </label>
              <input
                type="text"
                placeholder="e.g. Ayush or Developer"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--background)",
                  color: "var(--foreground)",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "5px", color: "var(--foreground)" }}>
                Your Email Address (Optional)
              </label>
              <input
                type="email"
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--background)",
                  color: "var(--foreground)",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "5px", color: "var(--foreground)" }}>
                Inquiry Topic
              </label>
              <select
                value={subjectCategory}
                onChange={(e) => setSubjectCategory(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--background)",
                  color: "var(--foreground)",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              >
                <option value="Request Infrastructure Reactivation (Azure VM)">
                  Request Infrastructure Reactivation (Azure VM)
                </option>
                <option value="Deployment Question or Failure Assistance">
                  Deployment Question or Failure Assistance
                </option>
                <option value="Custom Database or Service Provisioning">
                  Custom Database or Service Provisioning
                </option>
                <option value="Feedback & Feature Request">
                  Feedback & Feature Request
                </option>
                <option value="General Platform Question">
                  General Platform Question
                </option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "5px", color: "var(--foreground)" }}>
                Message
              </label>
              <textarea
                rows={4}
                placeholder="Describe your inquiry, requested deployment, or service need..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--background)",
                  color: "var(--foreground)",
                  fontSize: "0.9rem",
                  outline: "none",
                  resize: "vertical",
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "0.75rem 1.25rem",
                borderRadius: "var(--radius)",
                background: "var(--accent-gradient)",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "0.95rem",
                border: "none",
                cursor: "pointer",
                marginTop: "0.5rem",
                boxShadow: "0 2px 8px rgba(79, 70, 229, 0.25)",
              }}
            >
              <Send size={16} /> Compose Email to Administrator
            </button>
          </form>
        </div>
      </div>

      {/* Frequently Asked Questions */}
      <div style={{ marginTop: "3rem" }}>
        <h3
          style={{
            fontSize: "1.25rem",
            fontWeight: 700,
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <HelpCircle size={18} style={{ color: "var(--accent)" }} /> Frequently Asked Questions
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
          <div
            style={{
              padding: "1.25rem",
              borderRadius: "var(--radius)",
              background: "var(--card)",
              border: "1px solid var(--card-border)",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "6px" }}>
              Why is deployment blocked when VM is off?
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.5 }}>
              The build worker, Docker daemon, and edge router execute directly on the Azure VM. When the VM is offline,
              new builds cannot compile or start. Blocking the action immediately avoids stuck jobs.
            </p>
          </div>

          <div
            style={{
              padding: "1.25rem",
              borderRadius: "var(--radius)",
              background: "var(--card)",
              border: "1px solid var(--card-border)",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "6px" }}>
              Are my project files and configurations safe?
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.5 }}>
              Yes. All project metadata, encrypted environment variables, source code definitions, and PostgreSQL
              databases are stored safely in cloud storage and remain untouched.
            </p>
          </div>

          <div
            style={{
              padding: "1.25rem",
              borderRadius: "var(--radius)",
              background: "var(--card)",
              border: "1px solid var(--card-border)",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "6px" }}>
              What happens once the VM is turned on?
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.5 }}>
              The system recovers dynamically! The build worker self-heals, telemetry begins reporting, and the
              dashboard, CLI, and MCP immediately unlock all deployment capabilities without requiring any manual
              configuration.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
