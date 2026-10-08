"use client";

import Link from "next/link";
import { AlertTriangle, Mail, ExternalLink, X, ArrowRight } from "lucide-react";

export interface VmOfflineModalProps {
  isOpen: boolean;
  onClose: () => void;
  actionType?: "deploy" | "visit" | "terminal" | "general";
  targetName?: string;
  targetUrl?: string | null;
}

export function VmOfflineModal({
  isOpen,
  onClose,
  actionType = "general",
  targetName,
  targetUrl,
}: VmOfflineModalProps) {
  if (!isOpen) return null;

  const isVisit = actionType === "visit";
  const isDeploy = actionType === "deploy";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--card)",
          borderRadius: "var(--radius-lg)",
          maxWidth: 520,
          width: "100%",
          padding: "2rem",
          boxShadow: "0 20px 40px -15px rgba(0, 0, 0, 0.2)",
          border: "1px solid var(--card-border)",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "1.25rem",
            right: "1.25rem",
            background: "transparent",
            border: "none",
            color: "var(--muted)",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            alignItems: "center",
          }}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", marginBottom: "1rem" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "12px",
              background: "rgba(245, 158, 11, 0.12)",
              color: "var(--warning)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={22} />
          </div>
          <div>
            <div style={{ fontSize: "0.8rem", color: "var(--warning)", fontWeight: 700, textTransform: "uppercase" }}>
              Compute Host Offline
            </div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--foreground)" }}>
              {isDeploy ? "Deployments Temporarily Paused" : "Service Temporarily Down"}
            </h3>
          </div>
        </div>

        <p style={{ fontSize: "0.92rem", color: "var(--muted)", lineHeight: 1.55, marginBottom: "1.25rem" }}>
          {isDeploy ? (
            <>
              The administration has temporarily stopped new deployments and serving existing applications until
              further notice. The cloud build-worker cluster is currently powered down for resource optimization.
            </>
          ) : isVisit ? (
            <>
              <strong>{targetName || "This application"}</strong> is hosted on our cloud edge router and container
              engine, which is currently paused by administration. The URL will be temporarily unreachable.
            </>
          ) : (
            <>
              This action requires our cloud compute cluster, which is currently paused by administration until
              further notice.
            </>
          )}
        </p>

        <div
          style={{
            padding: "0.85rem 1rem",
            borderRadius: "var(--radius)",
            background: "var(--bg-subtle)",
            border: "1px solid var(--border)",
            fontSize: "0.84rem",
            color: "var(--foreground)",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "3px" }}>Need this service reactivated?</div>
          <div style={{ color: "var(--muted)" }}>
            Contact the administrator at <code>ayushkumarjais0602@gmail.com</code> or submit a reactivation request.
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {isVisit && targetUrl && (
            <a
              href={targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "0.6rem 1rem",
                borderRadius: "var(--radius)",
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--muted)",
                fontSize: "0.86rem",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Open URL Anyway <ExternalLink size={13} />
            </a>
          )}

          <Link
            href="/dashboard/contact"
            onClick={onClose}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "0.65rem 1.25rem",
              borderRadius: "var(--radius)",
              background: "var(--accent)",
              color: "#ffffff",
              fontSize: "0.88rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <Mail size={15} /> Contact Administration <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
