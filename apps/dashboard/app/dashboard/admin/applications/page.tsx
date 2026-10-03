"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { getApiBase, getAccessToken } from "@/lib/api";
import {
  Layers,
  Globe,
  Server,
  Database,
  Search,
  ExternalLink,
  Play,
  Square,
  Trash2,
  RefreshCw,
  Terminal,
  Activity,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

interface ApplicationItem {
  id: string;
  type: "project" | "service" | "database";
  name: string;
  slug: string;
  framework: string;
  status: string;
  url: string;
  deploymentId: string | null;
  deploymentType: string;
  containerPort: number | null;
  instanceType?: string;
  autoSleep?: boolean;
  owner: { id: string; email: string; name?: string | null };
  createdAt: string;
  updatedAt: string;
}

export default function FleetApplicationsPage() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<ApplicationItem[]>([]);
  const [counts, setCounts] = useState({ projects: 0, services: 0, databases: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function fetchApplications() {
    setLoading(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${getApiBase()}/api/admin/applications`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
        if (data.counts) setCounts(data.counts);
      } else {
        const err = await res.json().catch(() => ({}));
        setActionMessage({ type: "error", text: err.error || "Failed to load applications." });
      }
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || "Network error loading applications." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchApplications();
  }, []);

  async function handleAppAction(type: "project" | "service" | "database", id: string, action: "stop" | "delete", name: string) {
    const actionLabel = action === "delete" ? "permanently delete" : "stop/pause";
    if (!confirm(`Are you sure you want to ${actionLabel} ${type} "${name}"?`)) return;

    try {
      const token = getAccessToken();
      let endpoint = "";
      let method = "POST";

      if (action === "stop") {
        if (type === "project") endpoint = `/api/admin/deployments/${id}/stop`;
        else if (type === "service") endpoint = `/api/admin/services/${id}/stop`;
        else endpoint = `/api/admin/databases/${id}/stop`;
      } else {
        method = "DELETE";
        if (type === "project") endpoint = `/api/admin/projects/${id}`;
        else if (type === "service") endpoint = `/api/admin/services/${id}`;
        else endpoint = `/api/admin/databases/${id}`;
      }

      const res = await fetch(`${getApiBase()}${endpoint}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to execute ${action}`);
      }

      setActionMessage({ type: "success", text: `Successfully performed ${action} on ${name}.` });
      fetchApplications();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err.message || `Action failed.` });
    }
  }

  const filteredApps = useMemo(() => {
    return applications.filter((app) => {
      const q = search.toLowerCase();
      const matchSearch =
        app.name.toLowerCase().includes(q) ||
        app.slug.toLowerCase().includes(q) ||
        app.framework.toLowerCase().includes(q) ||
        app.owner.email.toLowerCase().includes(q);

      if (!matchSearch) return false;
      if (typeFilter !== "ALL" && app.type !== typeFilter.toLowerCase()) return false;
      if (statusFilter !== "ALL" && app.status.toUpperCase() !== statusFilter) return false;

      return true;
    });
  }, [applications, search, typeFilter, statusFilter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Header Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(99, 102, 241, 0.05))",
          border: "1px solid rgba(56, 189, 248, 0.25)",
          borderRadius: 16,
          padding: "1.75rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <Layers size={22} color="#38bdf8" />
            <h2 style={{ fontSize: "1.35rem", fontWeight: 700, margin: 0 }}>
              Fleet Application Management
            </h2>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "2px 8px",
                borderRadius: 999,
                background: "rgba(56, 189, 248, 0.2)",
                color: "#38bdf8",
                fontWeight: 700,
              }}
            >
              CROSS-TENANT CONTROL
            </span>
          </div>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>
            Centralized supervisory dashboard to monitor, manage, restart, or terminate all microservices, frontends, and databases on Whizan Cloud.
          </p>
        </div>

        <button
          onClick={fetchApplications}
          disabled={loading}
          className="btn btn-secondary"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          <span>Refresh Fleet</span>
        </button>
      </div>

      {/* Notifications */}
      {actionMessage && (
        <div
          style={{
            padding: "1rem 1.25rem",
            borderRadius: 12,
            background: actionMessage.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
            border: `1px solid ${actionMessage.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            color: actionMessage.type === "success" ? "#10b981" : "#ef4444",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {actionMessage.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* KPIs Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 14, padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>Total Fleet</span>
            <Activity size={18} color="var(--muted)" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "0.25rem" }}>{applications.length}</div>
        </div>

        <div style={{ background: "var(--card-bg)", border: "1px solid rgba(56, 189, 248, 0.3)", borderRadius: 14, padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.8rem", color: "#38bdf8", textTransform: "uppercase", fontWeight: 600 }}>Web Frontends</span>
            <Globe size={18} color="#38bdf8" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#38bdf8", marginTop: "0.25rem" }}>{counts.projects}</div>
        </div>

        <div style={{ background: "var(--card-bg)", border: "1px solid rgba(99, 102, 241, 0.3)", borderRadius: 14, padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.8rem", color: "#818cf8", textTransform: "uppercase", fontWeight: 600 }}>Backend Services</span>
            <Server size={18} color="#818cf8" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#818cf8", marginTop: "0.25rem" }}>{counts.services}</div>
        </div>

        <div style={{ background: "var(--card-bg)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: 14, padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.8rem", color: "#10b981", textTransform: "uppercase", fontWeight: 600 }}>Databases</span>
            <Database size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#10b981", marginTop: "0.25rem" }}>{counts.databases}</div>
        </div>
      </div>

      {/* Applications Directory Table */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {/* Filter bar */}
        <div
          style={{
            padding: "1.25rem",
            borderBottom: "1px solid var(--card-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1, minWidth: 260 }}>
            <Search size={18} color="var(--muted)" />
            <input
              type="text"
              placeholder="Search by name, slug, framework, or owner email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "0.55rem 0.85rem",
                borderRadius: 8,
                background: "var(--input-bg)",
                border: "1px solid var(--input-border)",
                color: "var(--foreground)",
                fontSize: "0.9rem",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {["ALL", "PROJECT", "SERVICE", "DATABASE"].map((tab) => (
              <button
                key={tab}
                onClick={() => setTypeFilter(tab)}
                style={{
                  padding: "0.4rem 0.85rem",
                  borderRadius: 8,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: typeFilter === tab ? "var(--accent)" : "#f1f5f9",
                  border: typeFilter === tab ? "1px solid var(--accent)" : "1px solid var(--border)",
                  color: typeFilter === tab ? "#fff" : "var(--muted)",
                }}
              >
                {tab === "PROJECT" ? "Frontends" : tab === "SERVICE" ? "Backends" : tab === "DATABASE" ? "Databases" : "All Types"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)", color: "var(--muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>
                <th style={{ padding: "0.85rem 1.25rem" }}>Application</th>
                <th style={{ padding: "0.85rem 1rem" }}>Type / Engine</th>
                <th style={{ padding: "0.85rem 1rem" }}>Status</th>
                <th style={{ padding: "0.85rem 1rem" }}>Tenant Owner</th>
                <th style={{ padding: "0.85rem 1rem" }}>Domain / Port</th>
                <th style={{ padding: "0.85rem 1.25rem", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredApps.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}>
                    No applications found in the fleet.
                  </td>
                </tr>
              ) : (
                filteredApps.map((app) => {
                  const isReady = app.status === "READY" || app.status === "ACTIVE";
                  const isBuilding = app.status === "BUILDING" || app.status === "QUEUED";
                  const isFailed = app.status === "FAILED";

                  return (
                    <tr
                      key={`${app.type}-${app.id}`}
                      style={{
                        borderBottom: "1px solid var(--card-border)",
                        transition: "background 0.15s ease",
                      }}
                    >
                      {/* App Name & Slug */}
                      <td style={{ padding: "1rem 1.25rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 8,
                              background:
                                app.type === "project"
                                  ? "rgba(56, 189, 248, 0.15)"
                                  : app.type === "service"
                                  ? "rgba(99, 102, 241, 0.15)"
                                  : "rgba(16, 185, 129, 0.15)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color:
                                app.type === "project"
                                  ? "#38bdf8"
                                  : app.type === "service"
                                  ? "#818cf8"
                                  : "#10b981",
                            }}
                          >
                            {app.type === "project" ? (
                              <Globe size={18} />
                            ) : app.type === "service" ? (
                              <Server size={18} />
                            ) : (
                              <Database size={18} />
                            )}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600 }}>{app.name}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{app.slug}</div>
                          </div>
                        </div>
                      </td>

                      {/* Type / Engine */}
                      <td style={{ padding: "1rem 1rem" }}>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{app.framework}</span>
                          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                            {app.deploymentType}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: "1rem 1rem" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            padding: "3px 9px",
                            borderRadius: 999,
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            background: isReady
                              ? "rgba(16, 185, 129, 0.15)"
                              : isBuilding
                              ? "rgba(56, 189, 248, 0.15)"
                              : isFailed
                              ? "rgba(239, 68, 68, 0.15)"
                              : "rgba(245, 158, 11, 0.15)",
                            color: isReady
                              ? "#10b981"
                              : isBuilding
                              ? "#38bdf8"
                              : isFailed
                              ? "#ef4444"
                              : "#f59e0b",
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
                          {app.status}
                        </span>
                      </td>

                      {/* Tenant Owner */}
                      <td style={{ padding: "1rem 1rem" }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>{app.owner?.email}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{app.owner?.name || "User"}</div>
                      </td>

                      {/* Domain / Port */}
                      <td style={{ padding: "1rem 1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <a
                            href={app.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: "var(--accent)",
                              textDecoration: "none",
                              fontSize: "0.85rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.3rem",
                              maxWidth: 180,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <span>{app.url.replace(/^http:\/\//, "")}</span>
                            <ExternalLink size={12} />
                          </a>
                        </div>
                        {app.containerPort && (
                          <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                            Port: {app.containerPort}
                          </div>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td style={{ padding: "1rem 1.25rem", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                          {app.type !== "database" && (
                            <button
                              onClick={() => handleAppAction(app.type, app.id, "stop", app.name)}
                              className="icon-btn"
                              title="Stop/Pause Container"
                              style={{ color: "#f59e0b", padding: "5px" }}
                            >
                              <Square size={14} />
                            </button>
                          )}

                          <button
                            onClick={() => handleAppAction(app.type, app.id, "delete", app.name)}
                            className="icon-btn"
                            title="Delete Resource"
                            style={{ color: "#ef4444", padding: "5px" }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
