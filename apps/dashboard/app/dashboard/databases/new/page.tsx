"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Database,
  ArrowLeft,
  Server,
  HardDrive,
  Cpu,
  ShieldCheck,
  Zap,
  Layers,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { databases } from "@/lib/api";
import { useSystemStatus } from "@/hooks/useSystemStatus";
import { VmOfflineModal } from "@/components/vm-offline-modal";

export default function NewDatabasePage() {
  const router = useRouter();
  const { vmOnline } = useSystemStatus();

  // Engine selection
  const [engine, setEngine] = useState<"POSTGRESQL" | "REDIS">("POSTGRESQL");
  const [version, setVersion] = useState("16");

  // Basic info
  const [name, setName] = useState("my-database");
  const [databaseName, setDatabaseName] = useState("production_db");
  const [username, setUsername] = useState("admin_user");
  const [instanceType, setInstanceType] = useState<"starter" | "standard" | "pro">("starter");

  // Submission state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);

  // Auto slug preview
  const slug = `db-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "db"}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vmOnline) {
      setOfflineModalOpen(true);
      return;
    }
    if (!name.trim()) {
      setError("Please enter a database name");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await databases.create({
        name: name.trim(),
        slug,
        type: engine,
        version,
        databaseName: engine === "REDIS" ? "" : databaseName.trim(),
        username: engine === "REDIS" ? "default" : username.trim(),
        instanceType,
      });

      router.push(`/dashboard/databases/${res.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to provision database cluster");
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
      {/* Back button */}
      <Link
        href="/dashboard/databases"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          color: "var(--muted)",
          fontSize: "0.875rem",
          fontWeight: 500,
          marginBottom: "1.5rem",
          textDecoration: "none",
        }}
      >
        <ArrowLeft size={16} /> Back to Databases
      </Link>

      {/* Header */}
      <div style={{ marginBottom: "2.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "linear-gradient(135deg, #6366f1 0%, #38bdf8 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <Database size={20} />
          </div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Provision Managed Database
          </h1>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.95rem" }}>
          Launch an enterprise-grade isolated database engine with automated persistent storage, high-entropy secrets, and zero-latency internal mesh networking.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: "1rem 1.25rem",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            borderRadius: "var(--radius)",
            color: "#ef4444",
            fontSize: "0.9rem",
            marginBottom: "1.75rem",
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        {/* Step 1: Engine Selection */}
        <div>
          <label style={{ display: "block", fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            1. Select Database Engine
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {/* PostgreSQL Option */}
            <div
              onClick={() => {
                setEngine("POSTGRESQL");
                setVersion("16");
              }}
              style={{
                cursor: "pointer",
                padding: "1.25rem",
                borderRadius: "var(--radius)",
                border: engine === "POSTGRESQL" ? "2px solid #3b82f6" : "1px solid var(--card-border)",
                background: engine === "POSTGRESQL" ? "rgba(59, 130, 246, 0.05)" : "var(--card)",
                transition: "all 0.2s ease",
                position: "relative",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      background: "rgba(59, 130, 246, 0.15)",
                      color: "#3b82f6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: "0.75rem",
                    }}
                  >
                    PG
                  </div>
                  <span style={{ fontWeight: 700, fontSize: "1rem" }}>PostgreSQL</span>
                </div>
                {engine === "POSTGRESQL" && <CheckCircle2 size={18} style={{ color: "#3b82f6" }} />}
              </div>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", lineHeight: 1.4 }}>
                The world's most popular relational database. Ideal for structured SQL data, JSONB, full-text search, and relational consistency.
              </p>
              <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.75rem", padding: "2px 6px", borderRadius: 4, background: "var(--bg-inset)", color: "var(--foreground)" }}>
                  v16 (Recommended)
                </span>
                <span style={{ fontSize: "0.75rem", padding: "2px 6px", borderRadius: 4, background: "var(--bg-inset)", color: "var(--muted)" }}>
                  v15
                </span>
              </div>
            </div>

            {/* Redis Option */}
            <div
              onClick={() => {
                setEngine("REDIS");
                setVersion("7");
              }}
              style={{
                cursor: "pointer",
                padding: "1.25rem",
                borderRadius: "var(--radius)",
                border: engine === "REDIS" ? "2px solid #ef4444" : "1px solid var(--card-border)",
                background: engine === "REDIS" ? "rgba(239, 68, 68, 0.05)" : "var(--card)",
                transition: "all 0.2s ease",
                position: "relative",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      background: "rgba(239, 68, 68, 0.15)",
                      color: "#ef4444",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: "0.75rem",
                    }}
                  >
                    RD
                  </div>
                  <span style={{ fontWeight: 700, fontSize: "1rem" }}>Redis</span>
                </div>
                {engine === "REDIS" && <CheckCircle2 size={18} style={{ color: "#ef4444" }} />}
              </div>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", lineHeight: 1.4 }}>
                Blazing fast in-memory key-value cache, pub/sub message broker, and queue system with Append-Only File (AOF) durability.
              </p>
              <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.75rem", padding: "2px 6px", borderRadius: 4, background: "var(--bg-inset)", color: "var(--foreground)" }}>
                  v7 AOF
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Configuration Details */}
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: "var(--radius)",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>2. Database Configuration</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", color: "var(--muted)", marginBottom: "0.4rem" }}>
                Service Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. prod-db"
                required
                style={{
                  width: "100%",
                  padding: "0.6rem 0.85rem",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  fontSize: "0.9rem",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", color: "var(--muted)", marginBottom: "0.4rem" }}>
                Internal DNS Hostname (Auto)
              </label>
              <div
                style={{
                  padding: "0.6rem 0.85rem",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-inset)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  fontSize: "0.85rem",
                  fontFamily: "monospace",
                }}
              >
                {slug}
              </div>
            </div>
          </div>

          {engine === "POSTGRESQL" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", color: "var(--muted)", marginBottom: "0.4rem" }}>
                  Database Name
                </label>
                <input
                  type="text"
                  value={databaseName}
                  onChange={(e) => setDatabaseName(e.target.value)}
                  placeholder="production_db"
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.85rem",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-inset)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    fontSize: "0.9rem",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.85rem", color: "var(--muted)", marginBottom: "0.4rem" }}>
                  Master Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin_user"
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.85rem",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-inset)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    fontSize: "0.9rem",
                  }}
                />
              </div>
            </div>
          )}

          {/* Security note */}
          <div
            style={{
              padding: "0.85rem 1rem",
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              fontSize: "0.85rem",
              color: "var(--foreground)",
            }}
          >
            <ShieldCheck size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <span>
              A high-entropy 24-character password will be automatically generated and stored using <strong>AES-256-GCM</strong> encryption.
            </span>
          </div>
        </div>

        {/* Step 3: Compute Tier */}
        <div>
          <label style={{ display: "block", fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            3. Resource & Compute Sizing
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
            {/* Starter */}
            <div
              onClick={() => setInstanceType("starter")}
              style={{
                cursor: "pointer",
                padding: "1.25rem",
                borderRadius: "var(--radius)",
                border: instanceType === "starter" ? "2px solid var(--accent)" : "1px solid var(--card-border)",
                background: instanceType === "starter" ? "rgba(99, 102, 241, 0.05)" : "var(--card)",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Starter</span>
                {instanceType === "starter" && <CheckCircle2 size={16} style={{ color: "var(--accent)" }} />}
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                512 MB <span style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 400 }}>RAM</span>
              </div>
              <p style={{ color: "var(--muted)", fontSize: "0.8rem", lineHeight: 1.4 }}>
                0.5 vCPU • Shared Core • Perfect for development, staging, and microservices.
              </p>
            </div>

            {/* Standard */}
            <div
              onClick={() => setInstanceType("standard")}
              style={{
                cursor: "pointer",
                padding: "1.25rem",
                borderRadius: "var(--radius)",
                border: instanceType === "standard" ? "2px solid var(--accent)" : "1px solid var(--card-border)",
                background: instanceType === "standard" ? "rgba(99, 102, 241, 0.05)" : "var(--card)",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Standard</span>
                {instanceType === "standard" && <CheckCircle2 size={16} style={{ color: "var(--accent)" }} />}
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                1.0 GB <span style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 400 }}>RAM</span>
              </div>
              <p style={{ color: "var(--muted)", fontSize: "0.8rem", lineHeight: 1.4 }}>
                1.0 vCPU • Dedicated Priority • High-throughput production web applications.
              </p>
            </div>

            {/* Pro */}
            <div
              onClick={() => setInstanceType("pro")}
              style={{
                cursor: "pointer",
                padding: "1.25rem",
                borderRadius: "var(--radius)",
                border: instanceType === "pro" ? "2px solid var(--accent)" : "1px solid var(--card-border)",
                background: instanceType === "pro" ? "rgba(99, 102, 241, 0.05)" : "var(--card)",
                transition: "all 0.2s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Pro</span>
                {instanceType === "pro" && <CheckCircle2 size={16} style={{ color: "var(--accent)" }} />}
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.4rem" }}>
                2.0 GB <span style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 400 }}>RAM</span>
              </div>
              <p style={{ color: "var(--muted)", fontSize: "0.8rem", lineHeight: 1.4 }}>
                2.0 vCPU • Maximum Bandwidth • Heavy caching, complex analytics, and high concurrency.
              </p>
            </div>
          </div>
        </div>

        {/* Persistent Storage Callout */}
        <div
          style={{
            padding: "1rem 1.25rem",
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: "var(--radius)",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <HardDrive size={24} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>Persistent NVMe Volume Guarantee</div>
            <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
              Data files are mounted directly onto the host VM hard drive. If this container stops or the VM restarts, 100% of your data remains intact.
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1rem" }}>
          <Link
            href="/dashboard/databases"
            style={{
              padding: "0.75rem 1.5rem",
              borderRadius: "var(--radius)",
              background: "var(--bg-inset)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
              fontWeight: 600,
              fontSize: "0.95rem",
              textDecoration: "none",
            }}
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 2rem",
              borderRadius: "var(--radius)",
              background: "var(--accent-gradient)",
              border: "none",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              boxShadow: "0 4px 14px rgba(99, 102, 241, 0.35)",
            }}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: 16, height: 16, borderTopColor: "#fff" }} />
                Provisioning Cluster...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Deploy Managed Database
              </>
            )}
          </button>
        </div>
      </form>

      <VmOfflineModal
        isOpen={offlineModalOpen}
        onClose={() => setOfflineModalOpen(false)}
        actionType="deploy"
        targetName="Managed Database"
      />
    </div>
  );
}
