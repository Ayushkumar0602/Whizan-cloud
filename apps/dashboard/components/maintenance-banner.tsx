"use client";

import { useState } from "react";
import Link from "next/link";
import { useSystemStatus } from "@/hooks/useSystemStatus";
import { AlertTriangle, ArrowRight, X, Mail } from "lucide-react";

export function MaintenanceBanner() {
  const { vmOnline, loading } = useSystemStatus();
  const [dismissed, setDismissed] = useState(false);

  // If loading or VM is online, do not render banner
  if (loading || vmOnline || dismissed) {
    return null;
  }

  return (
    <div
      style={{
        background: "linear-gradient(90deg, #fffbeb 0%, #fef3c7 50%, #fffbeb 100%)",
        borderBottom: "1px solid #fde68a",
        color: "#92400e",
        padding: "0.65rem 1.25rem",
        fontSize: "0.86rem",
        position: "sticky",
        top: 0,
        zIndex: 50,
        boxShadow: "0 1px 3px rgba(245, 158, 11, 0.08)",
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <AlertTriangle size={17} style={{ color: "#d97706", flexShrink: 0 }} />
          <span>
            <strong style={{ fontWeight: 600, color: "#78350f" }}>Platform Notice:</strong> Cloud compute nodes (Azure VM)
            are currently powered down. Administration has paused new deployments and serving until further notice.
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link
            href="/dashboard/contact"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 10px",
              borderRadius: "999px",
              background: "#d97706",
              color: "#ffffff",
              fontWeight: 600,
              fontSize: "0.78rem",
              textDecoration: "none",
              transition: "background 0.15s ease",
            }}
          >
            <Mail size={12} /> Contact Administration <ArrowRight size={12} />
          </Link>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            style={{
              background: "transparent",
              border: "none",
              color: "#b45309",
              cursor: "pointer",
              padding: "2px",
              display: "flex",
              alignItems: "center",
            }}
            aria-label="Dismiss banner"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
