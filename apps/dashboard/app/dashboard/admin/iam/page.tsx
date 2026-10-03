"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { getApiBase, getAccessToken } from "@/lib/api";
import {
  ShieldAlert,
  UserCheck,
  Search,
  KeyRound,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  PlusCircle,
  Crown,
  Lock,
} from "lucide-react";

interface PlatformUser {
  id: string;
  email: string;
  name?: string | null;
  role: "ROOT_ADMIN" | "IAM_ADMIN" | "ADMIN" | "DEVOPS_ADMIN" | "SUPPORT_ADMIN" | "USER" | string;
  iamPermissions?: string | null;
  subscriptionTier: string;
  createdAt: string;
  isRootAdmin?: boolean;
  _count?: {
    projects: number;
    backendServices: number;
    databaseServices: number;
    apiKeys: number;
  };
}

export default function IamAdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");

  // Assign Role Form state
  const [targetEmail, setTargetEmail] = useState("");
  const [selectedRole, setSelectedRole] = useState("ADMIN");
  const [selectedTier, setSelectedTier] = useState("PROFESSIONAL");
  const [selectedPerms, setSelectedPerms] = useState<string[]>(["manage:apps", "manage:containers", "manage:databases"]);
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Modal / Quick edit state
  const [editingUser, setEditingUser] = useState<PlatformUser | null>(null);

  const isCurrentRootAdmin =
    user?.role === "ROOT_ADMIN" || user?.email === "aj0892829122@gmail.com";

  async function fetchUsers() {
    setLoading(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${getApiBase()}/api/admin/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: "error", text: err.error || "Failed to load platform users." });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Network error loading users." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handleAssignRole(e: React.FormEvent) {
    e.preventDefault();
    if (!targetEmail.trim()) return;

    setAssigning(true);
    setMessage(null);

    try {
      const token = getAccessToken();
      const permsString = selectedPerms.length === 0 ? "none" : selectedPerms.join(",");
      const res = await fetch(`${getApiBase()}/api/admin/iam/assign-role`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          email: targetEmail.trim(),
          role: selectedRole,
          iamPermissions: permsString,
          subscriptionTier: selectedTier,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to assign role");
      }

      setMessage({ type: "success", text: data.message || `Assigned ${selectedRole} to ${targetEmail}` });
      setTargetEmail("");
      fetchUsers();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to assign role" });
    } finally {
      setAssigning(false);
    }
  }

  async function handleUpdateUser(userId: string, newRole: string, newTier?: string) {
    try {
      const token = getAccessToken();
      const res = await fetch(`${getApiBase()}/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          role: newRole,
          subscriptionTier: newTier,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update user");
      }

      setMessage({ type: "success", text: `Updated user permissions successfully.` });
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to update user" });
    }
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!confirm(`Are you sure you want to terminate and cascade-delete tenant "${email}" and ALL their cloud services? This cannot be undone.`)) {
      return;
    }

    try {
      const token = getAccessToken();
      const res = await fetch(`${getApiBase()}/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete user");
      }

      setMessage({ type: "success", text: `Tenant ${email} deleted.` });
      fetchUsers();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to delete user" });
    }
  }

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        (u.name && u.name.toLowerCase().includes(search.toLowerCase()));

      if (!matchSearch) return false;

      if (roleFilter === "ALL") return true;
      if (roleFilter === "ROOT_ADMIN") return u.role === "ROOT_ADMIN" || u.email === "aj0892829122@gmail.com";
      if (roleFilter === "ADMIN") return u.role === "ADMIN" || u.role === "IAM_ADMIN" || u.role === "DEVOPS_ADMIN" || u.role === "SUPPORT_ADMIN";
      if (roleFilter === "USER") return u.role === "USER" || !u.role;

      return u.role === roleFilter;
    });
  }, [users, search, roleFilter]);

  const stats = useMemo(() => {
    const rootCount = users.filter((u) => u.role === "ROOT_ADMIN" || u.email === "aj0892829122@gmail.com").length;
    const adminCount = users.filter((u) => ["ADMIN", "IAM_ADMIN", "DEVOPS_ADMIN", "SUPPORT_ADMIN"].includes(u.role)).length;
    const standardCount = users.filter((u) => u.role === "USER" || !u.role).length;
    return { total: users.length, rootCount, adminCount, standardCount };
  }, [users]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Header Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.05))",
          border: "1px solid rgba(99, 102, 241, 0.25)",
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
            <Crown size={22} color="#f59e0b" />
            <h2 style={{ fontSize: "1.35rem", fontWeight: 700, margin: 0 }}>
              Identity & Access Management (IAM)
            </h2>
            <span
              style={{
                fontSize: "0.75rem",
                padding: "2px 8px",
                borderRadius: 999,
                background: "rgba(245, 158, 11, 0.2)",
                color: "#f59e0b",
                fontWeight: 700,
              }}
            >
              MULTI-LEVEL ROLES
            </span>
          </div>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>
            Root Administrator: <strong style={{ color: "var(--foreground)" }}>aj0892829122@gmail.com</strong> (Primary Immutable Controller).
            Grant, manage, and revoke multi-tier administrative credentials.
          </p>
        </div>

        <button
          onClick={fetchUsers}
          disabled={loading}
          className="btn btn-secondary"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          <span>Refresh Users</span>
        </button>
      </div>

      {/* Alert Notification */}
      {message && (
        <div
          style={{
            padding: "1rem 1.25rem",
            borderRadius: 12,
            background: message.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
            border: `1px solid ${message.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            color: message.type === "success" ? "#10b981" : "#ef4444",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {message.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 14, padding: "1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>Total Registered</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "0.25rem" }}>{stats.total}</div>
        </div>

        <div style={{ background: "var(--card-bg)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: 14, padding: "1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "#f59e0b", textTransform: "uppercase", fontWeight: 600 }}>Root Administrators</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#f59e0b", marginTop: "0.25rem" }}>{stats.rootCount}</div>
        </div>

        <div style={{ background: "var(--card-bg)", border: "1px solid rgba(99, 102, 241, 0.3)", borderRadius: 14, padding: "1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "#818cf8", textTransform: "uppercase", fontWeight: 600 }}>IAM Administrators</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "#818cf8", marginTop: "0.25rem" }}>{stats.adminCount}</div>
        </div>

        <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 14, padding: "1.25rem" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>Standard Tenants</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "0.25rem" }}>{stats.standardCount}</div>
        </div>
      </div>

      {/* Quick Action: Assign / Promote IAM Admin */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: 16,
          padding: "1.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
          <UserCheck size={20} className="text-accent" />
          <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
            Elevate or Assign IAM Administrator Access
          </h3>
        </div>

        <form onSubmit={handleAssignRole} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                Target User Email *
              </label>
              <input
                type="email"
                required
                placeholder="developer@company.com"
                value={targetEmail}
                onChange={(e) => setTargetEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: 8,
                  background: "var(--input-bg)",
                  border: "1px solid var(--input-border)",
                  color: "var(--foreground)",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                IAM Role Selection
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: 8,
                  background: "var(--input-bg)",
                  border: "1px solid var(--input-border)",
                  color: "var(--foreground)",
                }}
              >
                <option value="IAM_ADMIN">IAM_ADMIN — IAM & Platform Administrator</option>
                <option value="ADMIN">ADMIN — Full Platform & Infrastructure Admin</option>
                <option value="DEVOPS_ADMIN">DEVOPS_ADMIN — Containers, Deployments & VM Terminal</option>
                <option value="SUPPORT_ADMIN">SUPPORT_ADMIN — Read-only Support & Observability</option>
                {isCurrentRootAdmin && <option value="ROOT_ADMIN">ROOT_ADMIN — Co-Root Super Administrator</option>}
                <option value="USER">USER — Standard Developer Tenant</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                Subscription Tier Override
              </label>
              <select
                value={selectedTier}
                onChange={(e) => setSelectedTier(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.65rem 0.85rem",
                  borderRadius: 8,
                  background: "var(--input-bg)",
                  border: "1px solid var(--input-border)",
                  color: "var(--foreground)",
                }}
              >
                <option value="PROFESSIONAL">PROFESSIONAL Tier (Dedicated Instances & Always-On)</option>
                <option value="HOBBY">HOBBY Tier (Free Scale-to-Zero Compute)</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
              Granular IAM Capabilities
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
              {[
                { id: "manage:apps", label: "Fleet Applications" },
                { id: "manage:containers", label: "Container Shell & Logs" },
                { id: "manage:databases", label: "Managed Databases" },
                { id: "manage:terminal", label: "Host VM Bash Exec" },
                { id: "manage:system", label: "Docker & Cache Pruning" },
                { id: "manage:iam", label: "IAM Role Administration" },
              ].map((perm) => {
                const checked = selectedPerms.includes(perm.id);
                return (
                  <label
                    key={perm.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      padding: "4px 10px",
                      borderRadius: 6,
                      background: checked ? "rgba(99, 102, 241, 0.15)" : "var(--muted-bg)",
                      border: `1px solid ${checked ? "rgba(99, 102, 241, 0.4)" : "transparent"}`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedPerms([...selectedPerms, perm.id]);
                        else setSelectedPerms(selectedPerms.filter((p) => p !== perm.id));
                      }}
                    />
                    <span>{perm.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              disabled={assigning}
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <KeyRound size={16} />
              <span>{assigning ? "Updating IAM Credentials..." : "Commit IAM Privileges"}</span>
            </button>
          </div>
        </form>
      </div>

      {/* User Directory Table */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {/* Table Controls */}
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
              placeholder="Search users by email or name..."
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

          <div style={{ display: "flex", gap: "0.5rem" }}>
            {["ALL", "ROOT_ADMIN", "ADMIN", "USER"].map((tab) => (
              <button
                key={tab}
                onClick={() => setRoleFilter(tab)}
                style={{
                  padding: "0.4rem 0.85rem",
                  borderRadius: 8,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: roleFilter === tab ? "var(--accent)" : "#f1f5f9",
                  border: roleFilter === tab ? "1px solid var(--accent)" : "1px solid var(--border)",
                  color: roleFilter === tab ? "#fff" : "var(--muted)",
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Responsive Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--card-border)", color: "var(--muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>
                <th style={{ padding: "0.85rem 1.25rem" }}>User</th>
                <th style={{ padding: "0.85rem 1rem" }}>IAM Role</th>
                <th style={{ padding: "0.85rem 1rem" }}>Plan Tier</th>
                <th style={{ padding: "0.85rem 1rem" }}>Resources</th>
                <th style={{ padding: "0.85rem 1rem" }}>Joined</th>
                <th style={{ padding: "0.85rem 1.25rem", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}>
                    No users matching the filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isRoot = u.role === "ROOT_ADMIN" || u.email === "aj0892829122@gmail.com";
                  const isAdmin = ["ADMIN", "IAM_ADMIN", "DEVOPS_ADMIN", "SUPPORT_ADMIN"].includes(u.role);

                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: "1px solid var(--card-border)",
                        transition: "background 0.15s ease",
                      }}
                    >
                      {/* User Info */}
                      <td style={{ padding: "1rem 1.25rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: "50%",
                              background: isRoot
                                ? "rgba(245, 158, 11, 0.15)"
                                : isAdmin
                                ? "rgba(79, 70, 229, 0.12)"
                                : "#f1f5f9",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              color: isRoot ? "#b45309" : isAdmin ? "#4338ca" : "var(--foreground)",
                              fontSize: "0.85rem",
                              border: "1px solid var(--border)",
                            }}
                          >
                            {(u.name || u.email)[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                              {u.email}
                              {isRoot && <Crown size={14} color="#f59e0b" />}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{u.name || "Tenant"}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td style={{ padding: "1rem 1rem" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                            padding: "3px 9px",
                            borderRadius: 999,
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            background: isRoot
                              ? "rgba(245, 158, 11, 0.1)"
                              : isAdmin
                              ? "rgba(79, 70, 229, 0.08)"
                              : "#f1f5f9",
                            color: isRoot ? "#b45309" : isAdmin ? "#4338ca" : "var(--muted)",
                            border: `1px solid ${
                              isRoot
                                ? "rgba(245, 158, 11, 0.25)"
                                : isAdmin
                                ? "rgba(79, 70, 229, 0.25)"
                                : "var(--border)"
                            }`,
                          }}
                        >
                          {isRoot && <Lock size={12} />}
                          {u.role || "USER"}
                        </span>
                      </td>

                      {/* Tier */}
                      <td style={{ padding: "1rem 1rem" }}>
                        <span
                          style={{
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            color: u.subscriptionTier === "PROFESSIONAL" ? "#10b981" : "var(--muted)",
                          }}
                        >
                          {u.subscriptionTier}
                        </span>
                      </td>

                      {/* Resource count */}
                      <td style={{ padding: "1rem 1rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                        <span>{(u._count?.projects || 0) + (u._count?.backendServices || 0)} apps</span>
                        <span style={{ margin: "0 4px" }}>•</span>
                        <span>{u._count?.databaseServices || 0} dbs</span>
                      </td>

                      {/* Date */}
                      <td style={{ padding: "1rem 1rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>

                      {/* Action buttons */}
                      <td style={{ padding: "1rem 1.25rem", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                          {isRoot ? (
                            <span style={{ fontSize: "0.75rem", color: "#f59e0b", fontWeight: 600 }}>
                              Protected Root
                            </span>
                          ) : (
                            <>
                              {u.role !== "USER" ? (
                                <button
                                  onClick={() => handleUpdateUser(u.id, "USER")}
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: "0.75rem", padding: "3px 8px" }}
                                  title="Revoke Admin Access"
                                >
                                  Revoke Admin
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleUpdateUser(u.id, "ADMIN")}
                                  className="btn btn-primary btn-sm"
                                  style={{ fontSize: "0.75rem", padding: "3px 8px" }}
                                  title="Make Full Admin"
                                >
                                  Grant Admin
                                </button>
                              )}

                              <button
                                onClick={() => handleDeleteUser(u.id, u.email)}
                                className="icon-btn"
                                style={{ color: "#ef4444", padding: "4px" }}
                                title="Terminate Tenant"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
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
