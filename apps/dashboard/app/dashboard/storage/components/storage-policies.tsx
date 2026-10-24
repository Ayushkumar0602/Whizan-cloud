"use client";

import { useState, useEffect } from "react";
import {
  ShieldCheck,
  Plus,
  Trash2,
  Lock,
  Globe,
  Sliders,
  Check,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  storageApi,
  type StorageBucketItem,
  type StorageBucketPolicyItem,
} from "@/lib/api";

interface StoragePoliciesProps {
  buckets: StorageBucketItem[];
  selectedBucket: StorageBucketItem | null;
  onBucketUpdated: () => void;
}

export function StoragePolicies({
  buckets,
  selectedBucket,
  onBucketUpdated,
}: StoragePoliciesProps) {
  const [activeBucketId, setActiveBucketId] = useState<string>(
    selectedBucket?.id || buckets[0]?.id || ""
  );
  const [policies, setPolicies] = useState<StorageBucketPolicyItem[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);

  // CORS Settings State
  const activeBucket = buckets.find((b) => b.id === activeBucketId) || selectedBucket;
  const [corsOrigins, setCorsOrigins] = useState<string>(
    (activeBucket?.corsOrigins || ["*"]).join(", ")
  );
  const [corsMaxAge, setCorsMaxAge] = useState<number>(
    activeBucket?.corsMaxAge || 3600
  );
  const [savingCors, setSavingCors] = useState(false);

  // Create Policy Modal State
  const [createPolicyModalOpen, setCreatePolicyModalOpen] = useState(false);
  const [policyName, setPolicyName] = useState("");
  const [policyOperation, setPolicyOperation] = useState<
    "SELECT" | "INSERT" | "UPDATE" | "DELETE"
  >("SELECT");
  const [policyScopePrefix, setPolicyScopePrefix] = useState("");
  const [policyRole, setPolicyRole] = useState<"authenticated" | "public" | "owner_only">(
    "authenticated"
  );
  const [creatingPolicy, setCreatingPolicy] = useState(false);

  useEffect(() => {
    if (selectedBucket?.id && selectedBucket.id !== activeBucketId) {
      setActiveBucketId(selectedBucket.id);
    }
  }, [selectedBucket?.id]);

  useEffect(() => {
    if (activeBucket) {
      setCorsOrigins((activeBucket.corsOrigins || ["*"]).join(", "));
      setCorsMaxAge(activeBucket.corsMaxAge || 3600);
    }
  }, [activeBucketId, activeBucket]);

  const loadPolicies = async (bucketId: string) => {
    if (!bucketId) return;
    setLoadingPolicies(true);
    try {
      const data = await storageApi.listPolicies(bucketId);
      setPolicies(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load bucket policies");
    } finally {
      setLoadingPolicies(false);
    }
  };

  useEffect(() => {
    if (activeBucketId) {
      loadPolicies(activeBucketId);
    }
  }, [activeBucketId]);

  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBucketId || !policyName.trim()) return;

    setCreatingPolicy(true);
    try {
      const definition: Record<string, any> = {
        role: policyRole,
      };
      if (policyScopePrefix.trim()) {
        definition.prefix = policyScopePrefix.trim();
      }

      await storageApi.createPolicy(activeBucketId, {
        name: policyName.trim(),
        operation: policyOperation,
        definition,
        isEnabled: true,
      });

      toast.success(`Policy '${policyName.trim()}' created.`);
      setCreatePolicyModalOpen(false);
      setPolicyName("");
      setPolicyScopePrefix("");
      await loadPolicies(activeBucketId);
    } catch (err: any) {
      toast.error(err.message || "Failed to create policy");
    } finally {
      setCreatingPolicy(false);
    }
  };

  const handleDeletePolicy = async (policyId: string, name: string) => {
    if (!activeBucketId || !confirm(`Delete policy '${name}'?`)) return;

    try {
      await storageApi.deletePolicy(activeBucketId, policyId);
      toast.success(`Policy '${name}' deleted.`);
      setPolicies((prev) => prev.filter((p) => p.id !== policyId));
    } catch (err: any) {
      toast.error(err.message || "Failed to delete policy");
    }
  };

  const handleSaveCors = async () => {
    if (!activeBucketId) return;
    setSavingCors(true);
    try {
      const originsArray = corsOrigins
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await storageApi.updateBucket(activeBucketId, {
        corsOrigins: originsArray.length > 0 ? originsArray : ["*"],
        corsMaxAge: corsMaxAge || 3600,
      });

      toast.success("CORS rules saved successfully.");
      onBucketUpdated();
    } catch (err: any) {
      toast.error(err.message || "Failed to update CORS settings");
    } finally {
      setSavingCors(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header with Bucket Switcher and Create Button */}
      <div
        className="card"
        style={{
          padding: "1.25rem",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "0.75rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div>
            <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", fontWeight: 600 }}>
              Security Scope
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
              <select
                value={activeBucketId}
                onChange={(e) => setActiveBucketId(e.target.value)}
                style={{
                  padding: "0.4rem 0.75rem",
                  borderRadius: "0.375rem",
                  border: "1px solid var(--border)",
                  background: "var(--bg-inset)",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                }}
              >
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.isPublic ? "Public" : "Private"})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => loadPolicies(activeBucketId)}
            className="btn btn-secondary"
            style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingPolicies ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setCreatePolicyModalOpen(true)}
            className="btn btn-primary"
            style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <Plus className="w-4 h-4" />
            Add Policy
          </button>
        </div>
      </div>

      {/* Row-Level Security Policies Matrix */}
      <div
        className="card"
        style={{
          padding: "1.25rem",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "0.75rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Row-Level Security (RLS) Policies
            </h3>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.2rem" }}>
              Fine-grained authorization rules restricting SELECT, INSERT, UPDATE, and DELETE operations.
            </p>
          </div>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)" }}>
            {policies.length} Active {policies.length === 1 ? "Policy" : "Policies"}
          </span>
        </div>

        {loadingPolicies ? (
          <div style={{ padding: "3rem 0", textAlign: "center", color: "var(--muted)" }}>
            Loading security policies...
          </div>
        ) : policies.length === 0 ? (
          <div
            style={{
              padding: "3rem 1.5rem",
              textAlign: "center",
              border: "1px dashed var(--border)",
              borderRadius: "0.5rem",
              background: "var(--bg-inset)",
            }}
          >
            <Lock className="w-8 h-8 text-slate-400" style={{ margin: "0 auto 0.5rem" }} />
            <p style={{ fontWeight: 600, fontSize: "0.95rem" }}>No custom policies configured</p>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.25rem" }}>
              Standard bucket visibility rules apply. Add custom RLS policies to restrict read or write access by prefix or role.
            </p>
            <button
              onClick={() => setCreatePolicyModalOpen(true)}
              className="btn btn-secondary"
              style={{ marginTop: "1rem", fontSize: "0.8rem" }}
            >
              Add First Policy
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {policies.map((p) => {
              const opColor =
                p.operation === "SELECT"
                  ? "var(--info)"
                  : p.operation === "INSERT"
                  ? "var(--success)"
                  : p.operation === "UPDATE"
                  ? "var(--warning)"
                  : "var(--danger)";

              return (
                <div
                  key={p.id}
                  style={{
                    padding: "1rem",
                    background: "var(--bg-inset)",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          padding: "0.15rem 0.5rem",
                          borderRadius: 4,
                          background: `${opColor}20`,
                          color: opColor,
                        }}
                      >
                        {p.operation}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{p.name}</span>
                      <span
                        style={{
                          fontSize: "0.65rem",
                          padding: "0.1rem 0.4rem",
                          borderRadius: 999,
                          fontWeight: 600,
                          background: p.isEnabled ? "rgba(16, 185, 129, 0.15)" : "rgba(148, 163, 184, 0.15)",
                          color: p.isEnabled ? "var(--success)" : "var(--muted)",
                        }}
                      >
                        {p.isEnabled ? "ENABLED" : "DISABLED"}
                      </span>
                    </div>

                    <div style={{ fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.35rem", fontFamily: "monospace" }}>
                      Definition: {JSON.stringify(p.definition)}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeletePolicy(p.id, p.name)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--muted)",
                      cursor: "pointer",
                      padding: "0.3rem",
                    }}
                    title="Delete Policy"
                  >
                    <Trash2 className="w-4 h-4 hover:text-rose-500" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bucket CORS Configuration Card */}
      <div
        className="card"
        style={{
          padding: "1.25rem",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "0.75rem",
        }}
      >
        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.35rem" }}>
          <Globe className="w-4 h-4 text-sky-500" />
          Cross-Origin Resource Sharing (CORS) Configuration
        </h3>
        <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
          Controls browser direct upload and CDN access across different domains and origin ports.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: "1rem", alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "0.35rem" }}>
              Allowed Origins (Comma-separated or *)
            </label>
            <input
              type="text"
              value={corsOrigins}
              onChange={(e) => setCorsOrigins(e.target.value)}
              placeholder="e.g. *, https://my-app.com, http://localhost:3000"
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                background: "var(--bg-inset)",
                fontSize: "0.85rem",
                fontFamily: "monospace",
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "0.35rem" }}>
              Max Age (Seconds)
            </label>
            <input
              type="number"
              value={corsMaxAge}
              onChange={(e) => setCorsMaxAge(parseInt(e.target.value, 10) || 3600)}
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                background: "var(--bg-inset)",
                fontSize: "0.85rem",
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
          <button
            onClick={handleSaveCors}
            disabled={savingCors}
            className="btn btn-primary"
            style={{ fontSize: "0.85rem" }}
          >
            {savingCors ? "Saving CORS..." : "Save CORS Settings"}
          </button>
        </div>
      </div>

      {/* Create Policy Modal */}
      {createPolicyModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setCreatePolicyModalOpen(false)}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 480,
              padding: "1.5rem",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "0.75rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.4rem" }}>Add Security Policy</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1.25rem" }}>
              Create an authorization rule for bucket: {activeBucket?.name}
            </p>

            <form onSubmit={handleCreatePolicy}>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Policy Name
                </label>
                <input
                  type="text"
                  required
                  value={policyName}
                  onChange={(e) => setPolicyName(e.target.value)}
                  placeholder="e.g. allow-public-avatars-read"
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border)",
                    background: "var(--bg-inset)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Operation
                </label>
                <select
                  value={policyOperation}
                  onChange={(e) => setPolicyOperation(e.target.value as any)}
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border)",
                    background: "var(--bg-inset)",
                    fontSize: "0.85rem",
                  }}
                >
                  <option value="SELECT">SELECT (Download & Read)</option>
                  <option value="INSERT">INSERT (Upload & Write)</option>
                  <option value="UPDATE">UPDATE (Metadata & Overwrite)</option>
                  <option value="DELETE">DELETE (Delete Objects)</option>
                </select>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Path Scope / Prefix (Optional)
                </label>
                <input
                  type="text"
                  value={policyScopePrefix}
                  onChange={(e) => setPolicyScopePrefix(e.target.value)}
                  placeholder="e.g. avatars/ or public/ (Leave empty for entire bucket)"
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border)",
                    background: "var(--bg-inset)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Target Role / Authentication
                </label>
                <select
                  value={policyRole}
                  onChange={(e) => setPolicyRole(e.target.value as any)}
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.5rem",
                    border: "1px solid var(--border)",
                    background: "var(--bg-inset)",
                    fontSize: "0.85rem",
                  }}
                >
                  <option value="authenticated">Authenticated Users (Valid Token)</option>
                  <option value="public">Public (Anyone)</option>
                  <option value="owner_only">Owner Only (Project Admin)</option>
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() => setCreatePolicyModalOpen(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: "0.85rem" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingPolicy || !policyName.trim()}
                  className="btn btn-primary"
                  style={{ fontSize: "0.85rem" }}
                >
                  {creatingPolicy ? "Creating..." : "Save Policy"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
