"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Database,
  Plus,
  Server,
  HardDrive,
  Copy,
  Check,
  RotateCcw,
  Activity,
  Layers,
  Shield,
  ArrowRight,
  Clock,
  Cpu,
  AlertCircle,
  ExternalLink,
  Zap,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";
import { databases, type ManagedDatabase } from "@/lib/api";
import { maskDatabaseUrl, ConfidentialBadge } from "@/lib/security-mask";

export default function DatabasesPage() {
  const [items, setItems] = useState<ManagedDatabase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});

  function toggleSecret(id: string) {
    setRevealedSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function loadDatabases() {
    try {
      const data = await databases.list();
      setItems(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load databases");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDatabases();
    // Auto-refresh every 4s if any DB is transitioning
    const timer = setInterval(() => {
      loadDatabases();
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const runningCount = items.filter((d) => d.status === "RUNNING").length;
  const postgresCount = items.filter((d) => d.type === "POSTGRESQL").length;
  const redisCount = items.filter((d) => d.type === "REDIS").length;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "2rem",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
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
              Managed Databases
            </h1>
          </div>
          <p style={{ color: "var(--muted)", fontSize: "0.95rem", maxWidth: 600 }}>
            Dedicated, persistent database clusters with automated storage volume provisioning, high-entropy
            credentials, and private mesh networking.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <Link
            href="/dashboard/databases/tester"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.65rem 1.15rem",
              borderRadius: "var(--radius)",
              background: "rgba(16, 185, 129, 0.12)",
              color: "#34d399",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              fontWeight: 600,
              fontSize: "0.9rem",
              transition: "all 0.2s ease",
            }}
          >
            <Zap size={16} />
            URL Tester & Studio
          </Link>

          <Link
            href="/dashboard/databases/new"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.65rem 1.25rem",
              borderRadius: "var(--radius)",
              background: "var(--accent-gradient)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.9rem",
              boxShadow: "0 4px 14px rgba(99, 102, 241, 0.35)",
              transition: "all 0.2s ease",
            }}
          >
            <Plus size={18} />
            New Database
          </Link>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: "var(--radius)",
            padding: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 500 }}>Active Engines</span>
            <Activity size={18} style={{ color: "var(--success)" }} />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>
            {runningCount} <span style={{ fontSize: "0.9rem", color: "var(--muted)", fontWeight: 400 }}>/ {items.length} online</span>
          </div>
        </div>

        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: "var(--radius)",
            padding: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 500 }}>PostgreSQL</span>
            <span style={{ fontSize: "0.75rem", background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>v16 / v15</span>
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{postgresCount}</div>
        </div>

        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: "var(--radius)",
            padding: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 500 }}>Redis Cache</span>
            <span style={{ fontSize: "0.75rem", background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>v7 AOF</span>
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{redisCount}</div>
        </div>

        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: "var(--radius)",
            padding: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: 500 }}>Storage Durability</span>
            <HardDrive size={18} style={{ color: "var(--accent)" }} />
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--foreground)" }}>
            Persistent NVMe / SSD
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div
          style={{
            padding: "4rem 2rem",
            textAlign: "center",
            background: "var(--card)",
            border: "1px solid var(--card-border)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div className="spinner" style={{ margin: "0 auto 1rem" }} />
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>Loading database clusters...</p>
        </div>
      ) : error ? (
        <div
          style={{
            padding: "2rem",
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: "var(--radius)",
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            color: "#ef4444",
          }}
        >
          <AlertCircle size={24} />
          <div>
            <div style={{ fontWeight: 600 }}>Failed to load databases</div>
            <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>{error}</div>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            padding: "4rem 2rem",
            textAlign: "center",
            background: "var(--card)",
            border: "1px dashed var(--card-border)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "rgba(99, 102, 241, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem",
              color: "var(--accent)",
            }}
          >
            <Database size={32} />
          </div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            No databases provisioned yet
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "0.95rem", maxWidth: 460, margin: "0 auto 2rem" }}>
            Deploy a production-grade PostgreSQL or Redis cluster in seconds. Complete with persistent volume mounts,
            mesh networking, and instant connection strings.
          </p>
          <Link
            href="/dashboard/databases/new"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 1.5rem",
              borderRadius: "var(--radius)",
              background: "var(--accent-gradient)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.95rem",
            }}
          >
            <Plus size={18} />
            Create Database
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {items.map((db) => {
            const isPostgres = db.type === "POSTGRESQL";
            const isRedis = db.type === "REDIS";
            const engineColor = isPostgres ? "#3b82f6" : isRedis ? "#ef4444" : "#f59e0b";
            const engineBg = isPostgres
              ? "rgba(59, 130, 246, 0.12)"
              : isRedis
              ? "rgba(239, 68, 68, 0.12)"
              : "rgba(245, 158, 11, 0.12)";

            return (
              <div
                key={db.id}
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--card-border)",
                  borderRadius: "var(--radius)",
                  padding: "1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                  transition: "all 0.2s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "1rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        background: engineBg,
                        border: `1px solid ${engineColor}40`,
                        color: engineColor,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: "0.85rem",
                      }}
                    >
                      {isPostgres ? "PG" : isRedis ? "RD" : "MY"}
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                        <Link
                          href={`/dashboard/databases/${db.id}`}
                          style={{
                            fontSize: "1.1rem",
                            fontWeight: 700,
                            color: "var(--foreground)",
                            textDecoration: "none",
                          }}
                        >
                          {db.name}
                        </Link>
                        {/* Status Badge */}
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            padding: "2px 8px",
                            borderRadius: 9999,
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            background:
                              db.status === "RUNNING"
                                ? "rgba(16, 185, 129, 0.15)"
                                : db.status === "PROVISIONING" || db.status === "RESTARTING"
                                ? "rgba(245, 158, 11, 0.15)"
                                : "rgba(239, 68, 68, 0.15)",
                            color:
                              db.status === "RUNNING"
                                ? "#10b981"
                                : db.status === "PROVISIONING" || db.status === "RESTARTING"
                                ? "#f59e0b"
                                : "#ef4444",
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "currentColor",
                            }}
                          />
                          {db.status}
                        </span>

                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--muted)",
                            background: "var(--bg-inset)",
                            padding: "2px 8px",
                            borderRadius: 4,
                            border: "1px solid var(--border)",
                          }}
                        >
                          {db.type} {db.version}
                        </span>

                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--muted)",
                            background: "var(--bg-inset)",
                            padding: "2px 8px",
                            borderRadius: 4,
                            border: "1px solid var(--border)",
                          }}
                        >
                          {db.cpuLimit} vCPU • {db.memoryLimit}MB RAM
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "1rem",
                          marginTop: "0.35rem",
                          fontSize: "0.85rem",
                          color: "var(--muted)",
                        }}
                      >
                        <span>
                          Internal Host: <code style={{ color: "var(--foreground)" }}>{db.slug}:{db.internalPort}</code>
                        </span>
                        {db.externalPort && (
                          <span>
                            External Port: <code style={{ color: "var(--foreground)" }}>:{db.externalPort}</code>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <Link
                      href={`/dashboard/databases/${db.id}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        padding: "0.45rem 0.9rem",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--bg-inset)",
                        border: "1px solid var(--border)",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        color: "var(--foreground)",
                      }}
                    >
                      Manage
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>

                {/* Quick Connection Bar with Confidential Masking */}
                {db.status === "RUNNING" && db.internalUrl && (
                  <div
                    style={{
                      background: "var(--bg-inset)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "0.6rem 0.85rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", overflow: "hidden", flex: 1, minWidth: 260 }}>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--muted)", whiteSpace: "nowrap" }}>
                        INTERNAL URL:
                      </span>
                      <ConfidentialBadge size="xs" label="Secret" />
                      <code
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--foreground)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontFamily: "monospace",
                        }}
                      >
                        {maskDatabaseUrl(db.internalUrl, !!revealedSecrets[db.id])}
                      </code>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
                      <button
                        onClick={() => toggleSecret(db.id)}
                        title={revealedSecrets[db.id] ? "Hide confidential credentials" : "Show confidential credentials"}
                        style={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          color: "var(--muted)",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "3px 7px",
                        }}
                      >
                        {revealedSecrets[db.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                        {revealedSecrets[db.id] ? "Hide" : "Reveal"}
                      </button>

                      <button
                        onClick={() => copyToClipboard(db.internalUrl, db.id)}
                        style={{
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          color: copiedId === db.id ? "var(--success)" : "var(--foreground)",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "3px 8px",
                        }}
                      >
                        {copiedId === db.id ? (
                          <>
                            <Check size={13} /> Copied Secret!
                          </>
                        ) : (
                          <>
                            <Copy size={13} /> Copy
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
