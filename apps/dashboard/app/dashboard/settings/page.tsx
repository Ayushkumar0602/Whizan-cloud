"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useState, useEffect } from "react";
import { getApiBase, apiKeysApi, auth, type ApiKeyItem, type CreatedApiKey } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import {
  User,
  Shield,
  Copy,
  Check,
  Calendar,
  Lock,
  Plus,
  Trash2,
  Bot,
  Sparkles,
  Edit3,
  Building,
  Mail,
  X,
  Save,
  CheckCircle2,
  Tag,
  Fingerprint,
  Smartphone,
  KeyRound,
  ShieldAlert,
  Clock,
  RefreshCw,
  Sun,
  Moon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";
import {
  isBiometricEnrolled,
  isBiometricEnrolledForEmail,
  getBiometricUserEmail,
  enrollBiometric,
  removeBiometric,
  isTwoFactorTrusted,
  clearTwoFactorTrust,
  saveTwoFactorTrust,
  isPlatformBiometricSupported,
  verifyBiometric,
} from "@/lib/webauthn";

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const productionApiUrl = "https://api.whizan.cloud";

  // ─── User Profile Editable State ─────────────────────────────────────────
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || "");
  const [profileEmail, setProfileEmail] = useState(user?.email || "");
  const [profileOrg, setProfileOrg] = useState("Whizan Engineering");
  const [profileTitle, setProfileTitle] = useState("Cloud DevOps Engineer");
  const [savingProfile, setSavingProfile] = useState(false);

  // ─── 2FA & Biometric State ──────────────────────────────────────────────
  const [platformSupported, setPlatformSupported] = useState(false);
  const [biometricEnrolled, setBiometricEnrolled] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [twoFactorTrusted, setTwoFactorTrusted] = useState(false);

  useEffect(() => {
    isPlatformBiometricSupported().then(setPlatformSupported);
    if (user?.email) {
      setBiometricEnrolled(isBiometricEnrolledForEmail(user.email));
      setTwoFactorTrusted(isTwoFactorTrusted(user.email));
    }
  }, [user]);

  async function handleEnrollBiometric() {
    if (!user) return;
    setBiometricLoading(true);
    try {
      const res = await enrollBiometric(user.id, user.email);
      if (res.success) {
        saveTwoFactorTrust(user.email);
        setBiometricEnrolled(true);
        setTwoFactorTrusted(true);
        toast.success("Touch ID / Face ID registered on this device!");
      } else {
        toast.error(res.error || "Biometric enrollment was cancelled.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to register biometrics.");
    } finally {
      setBiometricLoading(false);
    }
  }

  async function handleTestBiometric() {
    setBiometricLoading(true);
    try {
      const res = await verifyBiometric();
      if (res.success) {
        if (user?.email) saveTwoFactorTrust(user.email);
        setTwoFactorTrusted(true);
        toast.success("Touch ID / Face ID verified! Sensor is active.");
      } else {
        toast.error(res.error || "Biometric test failed.");
      }
    } catch (err: any) {
      toast.error(err.message || "Biometric test failed.");
    } finally {
      setBiometricLoading(false);
    }
  }

  function handleRevokeBiometric() {
    removeBiometric();
    setBiometricEnrolled(false);
    toast.success("Biometric registration removed from this device.");
  }

  function handleRevokeTrust() {
    if (user?.email) {
      clearTwoFactorTrust(user.email);
      setTwoFactorTrusted(false);
      toast.info("Device 3-day trust revoked. Next login will require 2-step verification.");
    }
  }

  useEffect(() => {
    if (user) {
      setProfileName(user.name || "");
      setProfileEmail(user.email || "");
      try {
        const savedMeta = localStorage.getItem("whizan_user_meta");
        if (savedMeta) {
          const parsed = JSON.parse(savedMeta);
          if (parsed.org) setProfileOrg(parsed.org);
          if (parsed.title) setProfileTitle(parsed.title);
        }
      } catch {}
    }
  }, [user]);

  function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profileName.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    setSavingProfile(true);
    try {
      if (updateUser) {
        updateUser({
          name: profileName.trim(),
          email: profileEmail.trim() || user?.email,
        });
      }
      try {
        localStorage.setItem("whizan_user_meta", JSON.stringify({
          org: profileOrg.trim(),
          title: profileTitle.trim(),
        }));
      } catch {}
      toast.success("Profile updated successfully");
      setIsEditingProfile(false);
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  }

  function handleCancelEdit() {
    setProfileName(user?.name || "");
    setProfileEmail(user?.email || "");
    try {
      const savedMeta = localStorage.getItem("whizan_user_meta");
      if (savedMeta) {
        const parsed = JSON.parse(savedMeta);
        if (parsed.org) setProfileOrg(parsed.org);
        if (parsed.title) setProfileTitle(parsed.title);
      }
    } catch {}
    setIsEditingProfile(false);
  }

  function copyValue(val: string, key: string, label: string = "Value") {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  // ─── Subscription & Compute Policy State ─────────────────────────────────
  const [currentTier, setCurrentTier] = useState<"HOBBY" | "PROFESSIONAL">("HOBBY");
  const [updatingTier, setUpdatingTier] = useState(false);

  useEffect(() => {
    if (user?.subscriptionTier) {
      const normalized = (user.subscriptionTier as string).toUpperCase();
      setCurrentTier(normalized === "PROFESSIONAL" ? "PROFESSIONAL" : "HOBBY");
    }
  }, [user]);

  async function handleTierChange(tier: "HOBBY" | "PROFESSIONAL") {
    if (tier === currentTier) return;
    setUpdatingTier(true);
    try {
      await auth.updateSubscription(tier);
      setCurrentTier(tier);
      if (updateUser) {
        updateUser({ subscriptionTier: tier });
      }
      toast.success(`Subscription switched to ${tier === "HOBBY" ? "Hobby Plan" : "Professional Plan"}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update subscription tier");
    } finally {
      setUpdatingTier(false);
    }
  }

  // ─── API Keys & MCP State ──────────────────────────────────────────────────
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [newKey, setNewKey] = useState<CreatedApiKey | null>(null);
  const [keyName, setKeyName] = useState("");
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [creatingKey, setCreatingKey] = useState(false);

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    setLoadingKeys(true);
    try {
      const data = await apiKeysApi.list();
      setKeys(data);
    } catch {
      // Ignored if offline
    } finally {
      setLoadingKeys(false);
    }
  }

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    setCreatingKey(true);
    try {
      const created = await apiKeysApi.create(keyName.trim() || undefined);
      setNewKey(created);
      setKeyName("");
      toast.success("API key generated successfully");
      loadKeys();
    } catch (err: any) {
      toast.error(err.message || "Failed to create API key");
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleDeleteKey(id: string) {
    try {
      await apiKeysApi.delete(id);
      toast.success("API key revoked");
      setKeys((prev) => prev.filter((k) => k.id !== id));
      if (newKey?.id === id) setNewKey(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke key");
    }
  }

  const initials = (user?.name || user?.email || "U")[0].toUpperCase();

  const mcpConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        whizan: {
          command: "npx",
          args: ["-y", "@whizan/mcp-devops"],
          env: {
            WHIZAN_API_URL: productionApiUrl,
            WHIZAN_API_KEY: newKey?.key || "whz_live_YOUR_KEY_HERE",
          },
        },
      },
    },
    null,
    2
  );

  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <PageHeader
        title="Settings & Workspace"
        subtitle="Manage your developer profile, workspace preferences, and AI DevOps configuration."
      />

      <div className="settings-stack">
        {/* ── 1. User Profile Card ────────────────────────────────────── */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <div>
              <h2 className="card-title" style={{ fontSize: "1.05rem", margin: 0 }}>
                Developer Profile
              </h2>
              <p className="card-sub" style={{ marginTop: "0.2rem" }}>
                Personal identity and developer workspace credentials
              </p>
            </div>
            {!isEditingProfile && (
              <button
                type="button"
                onClick={() => setIsEditingProfile(true)}
                className="btn btn-secondary btn-sm"
                style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem" }}
              >
                <Edit3 size={13} />
                <span>Edit Profile</span>
              </button>
            )}
          </div>

          {isEditingProfile ? (
            /* Editing Profile Form */
            <form onSubmit={handleSaveProfile} className="profile-edit-form">
              <div className="form-fields-grid">
                <div className="form-field-group">
                  <label className="field-label">Full Name</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Your Full Name"
                    className="input field-input"
                    required
                  />
                </div>

                <div className="form-field-group">
                  <label className="field-label">Email Address</label>
                  <input
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    placeholder="developer@example.com"
                    className="input field-input"
                    required
                  />
                </div>

                <div className="form-field-group">
                  <label className="field-label">Organization / Team</label>
                  <input
                    type="text"
                    value={profileOrg}
                    onChange={(e) => setProfileOrg(e.target.value)}
                    placeholder="Company or Team Name"
                    className="input field-input"
                  />
                </div>

                <div className="form-field-group">
                  <label className="field-label">Professional Role / Title</label>
                  <input
                    type="text"
                    value={profileTitle}
                    onChange={(e) => setProfileTitle(e.target.value)}
                    placeholder="e.g. Lead DevOps Engineer, Full-Stack Developer"
                    className="input field-input"
                  />
                </div>
              </div>

              <div className="form-actions-row">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="btn btn-primary btn-sm"
                  style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                >
                  <Save size={14} />
                  <span>{savingProfile ? "Saving..." : "Save Changes"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="btn btn-secondary btn-sm"
                  style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                >
                  <X size={14} />
                  <span>Cancel</span>
                </button>
              </div>
            </form>
          ) : (
            /* Read-only Profile Display */
            <div>
              <div className="profile-hero-row">
                <div className="user-avatar-xl">
                  {initials}
                </div>
                <div className="profile-details-group">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
                    <h3 className="profile-name">{user?.name || profileName || "Developer"}</h3>
                    <span className="role-pill">
                      <Shield size={11} /> {user?.role || "Workspace Owner"}
                    </span>
                  </div>
                  <div className="profile-sub-title text-slate-600" style={{ fontSize: "0.835rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>{profileTitle}</span>
                    <span style={{ color: "#cbd5e1" }}>•</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                      <Building size={12} className="text-slate-400" />
                      {profileOrg}
                    </span>
                  </div>
                  <div className="profile-date">
                    <Calendar size={13} />
                    <span>
                      Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "2026"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Profile Details Matrix */}
              <div className="profile-matrix-grid">
                <div className="matrix-item">
                  <span className="matrix-label">Email Address</span>
                  <div className="matrix-val-row">
                    <span className="matrix-val font-mono">{user?.email || profileEmail}</span>
                    <button
                      onClick={() => copyValue(user?.email || profileEmail, "email-copy", "Email")}
                      className="matrix-copy-btn"
                      title="Copy Email"
                    >
                      {copiedKey === "email-copy" ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                <div className="matrix-item">
                  <span className="matrix-label">Workspace User ID</span>
                  <div className="matrix-val-row">
                    <span className="matrix-val font-mono">{user?.id || "local-dev-user"}</span>
                    <button
                      onClick={() => copyValue(user?.id || "local-dev-user", "uid-copy", "User ID")}
                      className="matrix-copy-btn"
                      title="Copy User ID"
                    >
                      {copiedKey === "uid-copy" ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                <div className="matrix-item">
                  <span className="matrix-label">Compute Subscription</span>
                  <div className="matrix-val-row">
                    <span className="badge badge-ready">
                      <CheckCircle2 size={11} />
                      {currentTier === "PROFESSIONAL" ? "Professional Plan" : "Hobby Plan (Free Tier)"}
                    </span>
                  </div>
                </div>

                <div className="matrix-item">
                  <span className="matrix-label">Security Tier</span>
                  <div className="matrix-val-row">
                    <span className="matrix-val" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                      <Lock size={12} className="text-indigo-600" />
                      HttpOnly JWT Sessions
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 2. Appearance & Visual Theme ──────────────────────────── */}
        <div className="card">
          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Sun size={18} style={{ color: "var(--accent)" }} />
              <h2 className="card-title" style={{ fontSize: "1.05rem", margin: 0 }}>
                Appearance & Theme
              </h2>
            </div>
            <p className="card-sub" style={{ marginTop: "0.25rem", fontSize: "0.84rem", color: "var(--muted)" }}>
              Select your preferred visual interface style. The application defaults to light mode for all first-time visitors unless explicitly changed.
            </p>
          </div>

          <ThemeToggle variant="segmented" />
        </div>

        {/* ── 2FA & Hardware Biometrics Card ────────────────────────── */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Fingerprint size={18} style={{ color: "#0284c7" }} />
                <h2 className="card-title" style={{ fontSize: "1.05rem", margin: 0 }}>
                  Two-Factor Authentication & Biometrics
                </h2>
              </div>
              <p className="card-sub" style={{ marginTop: "0.25rem" }}>
                Mandatory hardware-backed Touch ID, Face ID, and 3-day trusted session management.
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem" }}>
            {/* Sensor Enrollment Box */}
            <div style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "1.25rem", background: "var(--card-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Smartphone size={16} className="text-sky-500" />
                  <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>Platform Sensor (Face ID / Touch ID)</span>
                </div>
                {biometricEnrolled ? (
                  <span className="badge badge-ready" style={{ fontSize: "0.72rem" }}>
                    <CheckCircle2 size={11} /> Active
                  </span>
                ) : (
                  <span className="badge" style={{ fontSize: "0.72rem", background: "rgba(245, 158, 11, 0.1)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.25)" }}>
                    Not Enrolled
                  </span>
                )}
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0 0 1rem 0", lineHeight: 1.5 }}>
                {biometricEnrolled
                  ? "Touch ID / Face ID is registered on this local hardware device. Logins will prompt for a 1-tap scan."
                  : "Register this device's biometric sensor for instant 1-tap 2FA without waiting for email codes."}
              </p>

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {biometricEnrolled ? (
                  <>
                    <button
                      type="button"
                      onClick={handleTestBiometric}
                      disabled={biometricLoading}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: "0.8rem" }}
                    >
                      {biometricLoading ? <RefreshCw size={13} className="animate-spin" /> : <Fingerprint size={13} />}
                      <span>Test Sensor</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRevokeBiometric}
                      className="btn btn-danger btn-sm"
                      style={{ fontSize: "0.8rem" }}
                    >
                      <span>Remove Sensor</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleEnrollBiometric}
                    disabled={biometricLoading}
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: "0.8rem" }}
                  >
                    {biometricLoading ? <RefreshCw size={13} className="animate-spin" /> : <Fingerprint size={13} />}
                    <span>Register Touch ID / Face ID</span>
                  </button>
                )}
              </div>
            </div>

            {/* 3-Day Device Trust Box */}
            <div style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "1.25rem", background: "var(--card-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Clock size={16} className="text-indigo-500" />
                  <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>3-Day Trusted Device Session</span>
                </div>
                {twoFactorTrusted ? (
                  <span className="badge badge-ready" style={{ fontSize: "0.72rem" }}>
                    <CheckCircle2 size={11} /> Trusted
                  </span>
                ) : (
                  <span className="badge badge-failed" style={{ fontSize: "0.72rem" }}>
                    Untrusted
                  </span>
                )}
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0 0 1rem 0", lineHeight: 1.5 }}>
                {twoFactorTrusted
                  ? "This device has satisfied 2-Step Verification within the last 3 days. Console access is pre-authorized."
                  : "Device trust is expired or inactive. The next sign-in will mandate full 2-factor authentication."}
              </p>

              <div>
                {twoFactorTrusted && (
                  <button
                    type="button"
                    onClick={handleRevokeTrust}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: "0.8rem", color: "var(--danger)" }}
                  >
                    <span>Revoke 3-Day Device Trust</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. Subscription & Compute Policy Card ─────────────────── */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Sparkles size={18} style={{ color: "#a855f7" }} />
                <h2 className="card-title" style={{ fontSize: "1.05rem", margin: 0 }}>
                  Subscription & Compute Policy
                </h2>
              </div>
              <p className="card-sub" style={{ marginTop: "0.25rem" }}>
                Enforces strict compute limits for AI agents and developer deployments.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "rgba(0,0,0,0.03)", padding: "4px", borderRadius: "8px", border: "1px solid var(--border)" }}>
              <button
                type="button"
                onClick={() => handleTierChange("HOBBY")}
                disabled={updatingTier}
                className={`btn btn-sm ${currentTier === "HOBBY" ? "btn-primary" : "btn-ghost"}`}
                style={{ fontSize: "0.82rem", padding: "0.35rem 0.75rem", borderRadius: "6px" }}
              >
                Hobby Plan
              </button>
              <button
                type="button"
                onClick={() => handleTierChange("PROFESSIONAL")}
                disabled={updatingTier}
                className={`btn btn-sm ${currentTier === "PROFESSIONAL" ? "btn-primary" : "btn-ghost"}`}
                style={{ fontSize: "0.82rem", padding: "0.35rem 0.75rem", borderRadius: "6px" }}
              >
                Professional Plan
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
            <div
              style={{
                padding: "1rem",
                borderRadius: "8px",
                border: currentTier === "HOBBY" ? "1px solid rgba(14, 165, 233, 0.4)" : "1px solid var(--border)",
                background: currentTier === "HOBBY" ? "rgba(14, 165, 233, 0.04)" : "var(--bg-inset)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.92rem", color: currentTier === "HOBBY" ? "#0284c7" : "var(--foreground)" }}>
                  Hobby Tier (Free Compute)
                </span>
                {currentTier === "HOBBY" && <span className="badge badge-ready">Active</span>}
              </div>
              <ul style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0, paddingLeft: "1.2rem", lineHeight: 1.6 }}>
                <li><strong>Backend Microservices:</strong> Strictly locked to Free Tier (0.1 vCPU, 512MB RAM, Auto-Sleep after 15m).</li>
                <li><strong>Databases:</strong> Starter Tier with PgBouncer connection pooler (512MB RAM).</li>
                <li><strong>Frontend Web Apps:</strong> Edge CDN & Static Hosting.</li>
                <li><strong>AI Agent Safeguard:</strong> Agents CANNOT arbitrarily allocate compute or RAM.</li>
              </ul>
            </div>

            <div
              style={{
                padding: "1rem",
                borderRadius: "8px",
                border: currentTier === "PROFESSIONAL" ? "1px solid rgba(168, 85, 247, 0.4)" : "1px solid var(--border)",
                background: currentTier === "PROFESSIONAL" ? "rgba(168, 85, 247, 0.04)" : "var(--bg-inset)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 600, fontSize: "0.92rem", color: currentTier === "PROFESSIONAL" ? "#9333ea" : "var(--foreground)" }}>
                  Professional Tier (Custom Compute)
                </span>
                {currentTier === "PROFESSIONAL" && <span className="badge badge-purple">Active</span>}
              </div>
              <ul style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0, paddingLeft: "1.2rem", lineHeight: 1.6 }}>
                <li><strong>Custom Compute:</strong> Choose between Starter, Standard, Pro (up to 4 vCPUs / 4GB RAM).</li>
                <li><strong>Always-On:</strong> Dedicated containers with zero cold-starts and no auto-sleep.</li>
                <li><strong>High Performance Databases:</strong> Dedicated multi-core Postgres & Redis.</li>
                <li><strong>Granular Control:</strong> Selectable directly from hosting pages.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* ── 3. IDE DevOps MCP & API Keys ──────────────────────────── */}
        <div className="card">
          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Bot size={18} style={{ color: "#0284c7" }} />
              <h2 className="card-title" style={{ fontSize: "1.05rem", margin: 0 }}>
                IDE DevOps MCP & API Keys
              </h2>
            </div>
            <p className="card-sub" style={{ marginTop: "0.25rem" }}>
              Empower AI coding agents inside Cursor, Windsurf, or VS Code to autonomously inspect, adapt, and deploy your codebases to Whizan Cloud. These master keys are exclusively for IDE MCP &amp; CLI operations. For Cloud Storage bucket access, manage dedicated Storage Keys under <Link href="/dashboard/storage?tab=docs" style={{ color: "var(--accent)", textDecoration: "underline" }}>Cloud Storage &gt; Developer API</Link>.
            </p>
          </div>

          {/* New Key Alert */}
          {newKey && (
            <div
              style={{
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "8px",
                padding: "1rem",
                marginBottom: "1.25rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#10b981" }}>
                  🎉 New API Key Generated ({newKey.name})
                </span>
                <span style={{ fontSize: "0.75rem", color: "#f59e0b" }}>
                  ⚠️ Copy it now — it won&apos;t be shown again!
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <code
                  style={{
                    flex: 1,
                    background: "rgba(0,0,0,0.06)",
                    padding: "0.5rem 0.75rem",
                    borderRadius: "6px",
                    fontSize: "0.82rem",
                    wordBreak: "break-all",
                    color: "#0f172a",
                  }}
                  className="mono"
                >
                  {newKey.key}
                </code>
                <button
                  onClick={() => copyValue(newKey.key, "new-api-key", "API Key")}
                  className="btn btn-secondary"
                  style={{ padding: "0.5rem 0.85rem", fontSize: "0.8rem", display: "flex", gap: "0.35rem", alignItems: "center" }}
                >
                  {copiedKey === "new-api-key" ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  Copy Key
                </button>
              </div>
            </div>
          )}

          {/* Create Key Form */}
          <form onSubmit={handleCreateKey} style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
            <input
              type="text"
              placeholder="Key label (e.g. Cursor MacBook, Windsurf CLI)"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="input"
              style={{ flex: 1, fontSize: "0.85rem", padding: "0.5rem 0.85rem" }}
            />
            <button
              type="submit"
              disabled={creatingKey}
              className="btn btn-primary"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", whiteSpace: "nowrap" }}
            >
              <Plus size={14} />
              {creatingKey ? "Creating..." : "Generate Key"}
            </button>
          </form>

          {/* Active Keys List */}
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 650, color: "var(--foreground)", marginBottom: "0.6rem" }}>
              Active API Keys ({keys.length})
            </div>
            {keys.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: "var(--muted)", padding: "0.75rem 0" }}>
                No API keys created yet. Generate one above to connect your IDE.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {keys.map((k) => (
                  <div
                    key={k.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.6rem 0.85rem",
                      background: "var(--bg-inset)",
                      border: "1px solid var(--card-border)",
                      borderRadius: "6px",
                      fontSize: "0.8rem",
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--foreground)", marginRight: "0.5rem" }}>
                        {k.name}
                      </span>
                      <code className="mono" style={{ color: "var(--muted)", fontSize: "0.76rem" }}>
                        {k.keyPrefix}
                      </code>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                        {k.lastUsedAt ? `Used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "Never used"}
                      </span>
                      <button
                        onClick={() => handleDeleteKey(k.id)}
                        title="Revoke Key"
                        style={{
                          background: "none",
                          border: "none",
                          color: "#ef4444",
                          cursor: "pointer",
                          padding: "2px",
                          display: "flex",
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MCP JSON Snippet */}
          <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 650, color: "var(--foreground)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Sparkles size={13} style={{ color: "#0284c7" }} />
                IDE MCP Configuration (.cursor/mcp.json)
              </span>
              <button
                onClick={() => copyValue(mcpConfigSnippet, "mcp-config", "MCP Config")}
                className="btn btn-secondary"
                style={{ padding: "3px 8px", fontSize: "0.72rem", display: "flex", gap: "0.3rem", alignItems: "center" }}
              >
                {copiedKey === "mcp-config" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                Copy JSON
              </button>
            </div>
            <pre
              style={{
                background: "var(--bg-inset)",
                padding: "0.75rem",
                borderRadius: "6px",
                border: "1px solid var(--card-border)",
                fontSize: "0.74rem",
                overflowX: "auto",
                color: "#334155",
                lineHeight: "1.4",
              }}
              className="mono"
            >
              {mcpConfigSnippet}
            </pre>
          </div>
        </div>

        {/* ── 4. Security & Access ──────────────────────────────────── */}
        <div className="card">
          <h2 className="card-title" style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>
            Security & Authentication
          </h2>
          <p className="card-sub" style={{ marginBottom: "1.25rem" }}>
            JWT authentication sessions with automatic HttpOnly refresh cookies
          </p>

          <div className="security-notice-box">
            <Lock size={18} className="text-accent" />
            <div>
              <div style={{ fontWeight: 650, fontSize: "0.88rem", color: "var(--foreground)" }}>
                Secure HTTP-Only Session Active
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "2px" }}>
                Session tokens are automatically rotated and cryptographically signed.
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .settings-stack {
          display: flex;
          flex-direction: column;
          gap: 1.75rem;
        }
        .card-sub {
          font-size: 0.8125rem;
          color: var(--muted);
          margin-top: 0.15rem;
        }

        /* Profile Row */
        .profile-hero-row {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          flex-wrap: wrap;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid var(--card-border);
        }
        .user-avatar-xl {
          width: 68px;
          height: 68px;
          border-radius: 50%;
          background: linear-gradient(135deg, #4f46e5, #06b6d4);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.75rem;
          font-weight: 800;
          box-shadow: 0 4px 16px rgba(79, 70, 229, 0.15);
          flex-shrink: 0;
        }
        .profile-details-group {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .profile-name {
          font-size: 1.25rem;
          font-weight: 750;
          color: var(--foreground);
        }
        .role-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.72rem;
          font-weight: 650;
          color: #059669;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
          padding: 0.15rem 0.5rem;
          border-radius: 9999px;
        }
        .profile-date {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.76rem;
          color: var(--muted);
          margin-top: 0.2rem;
        }

        /* Profile Matrix Grid */
        .profile-matrix-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.25rem;
          padding-top: 1.5rem;
        }
        .matrix-item {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding: 0.75rem 1rem;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: 8px;
        }
        .matrix-label {
          font-size: 0.72rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--muted);
        }
        .matrix-val-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .matrix-val {
          font-size: 0.84rem;
          font-weight: 600;
          color: var(--foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .matrix-copy-btn {
          border: none;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          padding: 0.2rem;
          display: flex;
          align-items: center;
        }
        .matrix-copy-btn:hover {
          color: var(--foreground);
        }

        /* Profile Edit Form */
        .profile-edit-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .form-fields-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
        }
        .form-field-group {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .field-label {
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--foreground);
        }
        .field-input {
          padding: 0.55rem 0.85rem;
          font-size: 0.835rem;
          border: 1px solid var(--border);
          border-radius: 7px;
          background: #ffffff;
        }
        .field-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent-glow);
          outline: none;
        }
        .form-actions-row {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          padding-top: 0.5rem;
        }

        /* Security Box */
        .security-notice-box {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 1rem 1.25rem;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          border-radius: 8px;
        }

        @media (max-width: 640px) {
          .profile-matrix-grid {
            grid-template-columns: 1fr;
          }
          .form-fields-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
