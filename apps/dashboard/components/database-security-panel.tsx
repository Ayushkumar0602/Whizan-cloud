"use client";

import React, { useState } from "react";
import {
  Shield,
  ShieldCheck,
  Lock,
  Globe,
  Plus,
  Trash2,
  CheckCircle2,
  Copy,
  Check,
  AlertTriangle,
  UserCheck,
  KeyRound,
  RefreshCw,
  Eye,
  EyeOff,
} from "lucide-react";
import { databases, type ManagedDatabase } from "@/lib/api";
import { maskDatabaseUrl, ConfidentialBadge } from "@/lib/security-mask";

interface DatabaseSecurityPanelProps {
  databaseId: string;
  db: ManagedDatabase;
  onRefresh: () => void;
}

export default function DatabaseSecurityPanel({
  databaseId,
  db,
  onRefresh,
}: DatabaseSecurityPanelProps) {
  // IP Whitelist state
  const [ipList, setIpList] = useState<string[]>(db.ipWhitelist || []);
  const [newIp, setNewIp] = useState("");
  const [isSavingIps, setIsSavingIps] = useState(false);
  const [ipSuccess, setIpSuccess] = useState(false);

  // Read-only user state
  const [isGeneratingRo, setIsGeneratingRo] = useState(false);
  const [roUrl, setRoUrl] = useState<string | null>(db.readonlyUrl || null);
  const [roPassword, setRoPassword] = useState<string | null>(db.decryptedReadonlyPassword || null);
  const [showRoSecret, setShowRoSecret] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  function handleAddIp() {
    const trimmed = newIp.trim();
    if (!trimmed) return;
    // Auto-append /32 if plain IPv4 provided
    const formatted = trimmed.includes("/") ? trimmed : `${trimmed}/32`;
    if (!ipList.includes(formatted)) {
      setIpList([...ipList, formatted]);
    }
    setNewIp("");
  }

  function handleRemoveIp(ipToRemove: string) {
    setIpList(ipList.filter((ip) => ip !== ipToRemove));
  }

  async function handleSaveIps() {
    setIsSavingIps(true);
    setIpSuccess(false);
    try {
      await databases.updateSecurity(databaseId, { ipWhitelist: ipList });
      setIpSuccess(true);
      setTimeout(() => setIpSuccess(false), 3000);
      onRefresh();
    } catch (err: any) {
      alert(`Failed to save IP access rules: ${err.message}`);
    } finally {
      setIsSavingIps(false);
    }
  }

  async function handleGenerateReadonlyUser() {
    setIsGeneratingRo(true);
    try {
      const res = await databases.createReadonlyUser(databaseId);
      setRoUrl(res.readonlyUrl);
      setRoPassword(res.password);
      onRefresh();
    } catch (err: any) {
      alert(`Failed to create read-only role: ${err.message}`);
    } finally {
      setIsGeneratingRo(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* SSL / TLS Status Card */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--card-border)",
          borderRadius: 10,
          padding: "1.5rem",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <ShieldCheck size={20} style={{ color: "#10b981" }} />
            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>
              SSL / TLS Encryption in Transit
            </h3>
          </div>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#059669",
              background: "rgba(16, 185, 129, 0.12)",
              padding: "3px 10px",
              borderRadius: 9999,
              border: "1px solid rgba(16, 185, 129, 0.25)",
            }}
          >
            TLS 1.3 Active
          </span>
        </div>

        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1rem", lineHeight: 1.5 }}>
          All database traffic is encrypted using AES-256 cipher suites. Client certificates are mounted into the PostgreSQL server container to protect sensitive application data over untrusted networks.
        </p>

        <div
          style={{
            background: "var(--bg-inset)",
            border: "1px solid var(--card-border)",
            borderRadius: 6,
            padding: "0.75rem 1rem",
            fontSize: "0.8rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontFamily: "monospace", color: "var(--foreground)" }}>
            sslmode=require
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            Pass in query string to verify TLS connection
          </span>
        </div>
      </div>

      {/* IP Access Control / Whitelist */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--card-border)",
          borderRadius: 10,
          padding: "1.5rem",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Globe size={20} style={{ color: "var(--accent)" }} />
            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>
              Network Firewall & IP Whitelist
            </h3>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            {ipList.length === 0 ? "Publicly Accessible (0.0.0.0/0)" : `${ipList.length} Allowed CIDRs`}
          </span>
        </div>

        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1rem", lineHeight: 1.5 }}>
          Restrict incoming client connections to specific static IP addresses or CIDR blocks (e.g. office IPs, home VPN, or Vercel outbound CIDRs). When no IPs are specified, any host with valid credentials can connect.
        </p>

        {/* Input bar */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="e.g. 192.168.1.100/32 or 203.0.113.0/24"
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddIp();
              }
            }}
            style={{
              flex: 1,
              minWidth: 260,
              padding: "0.55rem 0.85rem",
              borderRadius: 6,
              background: "var(--bg-inset)",
              border: "1px solid var(--card-border)",
              color: "var(--foreground)",
              fontSize: "0.85rem",
              fontFamily: "monospace",
              outline: "none",
            }}
          />
          <button
            onClick={handleAddIp}
            style={{
              padding: "0.55rem 1rem",
              borderRadius: 6,
              background: "var(--accent-subtle)",
              border: "1px solid rgba(79, 70, 229, 0.25)",
              color: "var(--accent)",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
            }}
          >
            <Plus size={14} /> Add CIDR
          </button>
        </div>

        {/* IP Chips List */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", minHeight: 40, marginBottom: "1.25rem" }}>
          {ipList.length === 0 ? (
            <span style={{ fontSize: "0.82rem", color: "var(--muted)", fontStyle: "italic" }}>
              No IP restrictions applied. Database accepts connections from all public IPs with valid passwords.
            </span>
          ) : (
            ipList.map((ip) => (
              <span
                key={ip}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.3rem 0.65rem",
                  borderRadius: 6,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--card-border)",
                  fontFamily: "monospace",
                  fontSize: "0.82rem",
                }}
              >
                {ip}
                <button
                  onClick={() => handleRemoveIp(ip)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--muted)",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </span>
            ))
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {ipList.length > 0 && (
            <button
              onClick={() => setIpList([])}
              style={{
                fontSize: "0.78rem",
                color: "var(--muted)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              Clear all (Allow public access)
            </button>
          )}

          <button
            onClick={handleSaveIps}
            disabled={isSavingIps}
            style={{
              padding: "0.55rem 1.3rem",
              borderRadius: 6,
              background: "linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)",
              border: "none",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: isSavingIps ? "not-allowed" : "pointer",
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            {isSavingIps ? <RefreshCw size={14} className="animate-spin" /> : ipSuccess ? <Check size={14} /> : null}
            {isSavingIps ? "Saving..." : ipSuccess ? "Saved!" : "Save Firewall Rules"}
          </button>
        </div>
      </div>

      {/* Role Separation & Read-Only User */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--card-border)",
          borderRadius: 10,
          padding: "1.5rem",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <UserCheck size={20} style={{ color: "#a855f7" }} />
            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: 0 }}>
              Role Separation (Read-Only User)
            </h3>
            <ConfidentialBadge size="sm" label="Restricted Role" />
          </div>
          {roUrl && (
            <button
              onClick={handleGenerateReadonlyUser}
              disabled={isGeneratingRo}
              style={{
                fontSize: "0.75rem",
                color: "var(--muted)",
                background: "transparent",
                border: "1px solid var(--card-border)",
                borderRadius: 4,
                padding: "0.25rem 0.6rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
              }}
            >
              <RefreshCw size={11} className={isGeneratingRo ? "animate-spin" : ""} />
              Rotate Credentials
            </button>
          )}
        </div>

        <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1rem", lineHeight: 1.5 }}>
          Create a restricted database role that has read-only (<code style={{ color: "var(--foreground)" }}>SELECT</code>) access to public tables, but cannot write, insert, update, delete, or alter schemas. Perfect for Metabase, business intelligence, or external audit tools.
        </p>

        {roUrl ? (
          <div
            style={{
              background: "var(--bg-inset)",
              border: "1px solid var(--card-border)",
              borderRadius: 8,
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {/* Connection string with mask */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{ fontSize: "0.78rem", color: "#a855f7", fontWeight: 700 }}>
                    READ-ONLY CONNECTION STRING
                  </span>
                  <ConfidentialBadge size="xs" label="Secret URL" />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <button
                    onClick={() => setShowRoSecret(!showRoSecret)}
                    style={{
                      background: "var(--bg-subtle)",
                      border: "1px solid var(--card-border)",
                      borderRadius: 4,
                      padding: "0.25rem 0.6rem",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    {showRoSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                    {showRoSecret ? "Hide" : "Reveal"}
                  </button>
                  <button
                    onClick={() => copyText(roUrl, "readonly-url")}
                    style={{
                      background: "var(--bg-subtle)",
                      border: "1px solid var(--card-border)",
                      borderRadius: 4,
                      padding: "0.25rem 0.6rem",
                      color: copiedKey === "readonly-url" ? "#10b981" : "var(--foreground)",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    {copiedKey === "readonly-url" ? <Check size={12} /> : <Copy size={12} />}
                    {copiedKey === "readonly-url" ? "Copied Secret!" : "Copy URL"}
                  </button>
                </div>
              </div>
              <div
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--card-border)",
                  borderRadius: 6,
                  padding: "0.6rem 0.85rem",
                }}
              >
                <code style={{ fontSize: "0.82rem", fontFamily: "monospace", color: "var(--foreground)", wordBreak: "break-all" }}>
                  {maskDatabaseUrl(roUrl, showRoSecret)}
                </code>
              </div>
            </div>

            {/* Dedicated Role Parameters */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--card-border)",
                  borderRadius: 6,
                  padding: "0.65rem 0.85rem",
                }}
              >
                <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600 }}>ROLE USERNAME</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.2rem" }}>
                  <code style={{ fontSize: "0.82rem" }}>readonly_user</code>
                  <button
                    onClick={() => copyText("readonly_user", "ro-user")}
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)" }}
                  >
                    {copiedKey === "ro-user" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>

              <div
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--card-border)",
                  borderRadius: 6,
                  padding: "0.65rem 0.85rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600 }}>ROLE PASSWORD</span>
                  <ConfidentialBadge size="xs" label="Secret" />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.2rem" }}>
                  <code style={{ fontSize: "0.82rem", fontFamily: "monospace" }}>
                    {showRoSecret ? (roPassword || "••••••••••••") : "••••••••••••••••••••••••"}
                  </code>
                  {roPassword && (
                    <button
                      onClick={() => copyText(roPassword, "ro-pass")}
                      style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)" }}
                      title="Copy secret password"
                    >
                      {copiedKey === "ro-pass" ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div style={{ fontSize: "0.75rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <CheckCircle2 size={13} style={{ color: "#10b981" }} />
              Permissions: <strong style={{ color: "var(--foreground)" }}>SELECT only</strong> on public schema. INSERT, UPDATE, DELETE, and DDL are strictly forbidden.
            </div>
          </div>
        ) : (
          <button
            onClick={handleGenerateReadonlyUser}
            disabled={isGeneratingRo}
            style={{
              padding: "0.55rem 1.25rem",
              borderRadius: 6,
              background: "rgba(168, 85, 247, 0.15)",
              border: "1px solid rgba(168, 85, 247, 0.35)",
              color: "#c084fc",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: isGeneratingRo ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            {isGeneratingRo ? <RefreshCw size={14} className="animate-spin" /> : <KeyRound size={14} />}
            {isGeneratingRo ? "Generating Role..." : "Generate Read-Only Credentials"}
          </button>
        )}
      </div>
    </div>
  );
}
