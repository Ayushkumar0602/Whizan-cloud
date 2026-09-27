import React from "react";
import { Lock, ShieldAlert } from "lucide-react";

/**
 * Enterprise Security Utility for Masking & Protecting Confidential Information
 */

/**
 * Masks embedded passwords in database connection strings (PostgreSQL, Redis, MySQL)
 * e.g., postgresql://admin:MySecretPass123@host:port/db -> postgresql://admin:••••••••••••@host:port/db
 */
export function maskDatabaseUrl(url: string | null | undefined, reveal: boolean): string {
  if (!url) return "";
  if (reveal) return url;
  // Replace the password segment between ':' and '@'
  return url.replace(/:([^@/:]+)@/g, ":••••••••••••@");
}

/**
 * Checks if a table column, key, or field name represents secret or confidential information
 */
export function isConfidentialKey(name: string): boolean {
  if (!name) return false;
  return /password|secret|token|hash|salt|api_key|apikey|private_key|privatekey|auth_key|access_token|refresh_token|credentials|credential/i.test(
    name
  );
}

/**
 * Masks a secret value if not explicitly revealed
 */
export function maskSecretValue(value: any, reveal: boolean): string {
  if (value === null || value === undefined) return "null";
  if (reveal) {
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  return "••••••••••••";
}

/**
 * Reusable Confidential Badge for UI elements
 */
export function ConfidentialBadge({
  label = "Confidential • Secret",
  size = "sm",
}: {
  label?: string;
  size?: "xs" | "sm" | "md";
}) {
  const isXs = size === "xs";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        padding: isXs ? "1px 6px" : "2px 8px",
        borderRadius: 4,
        fontSize: isXs ? "0.68rem" : "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.02em",
        color: "#f59e0b",
        background: "rgba(245, 158, 11, 0.12)",
        border: "1px solid rgba(245, 158, 11, 0.28)",
        whiteSpace: "nowrap",
        verticalAlign: "middle",
      }}
    >
      <Lock size={isXs ? 10 : 11} style={{ flexShrink: 0 }} />
      {label}
    </span>
  );
}
