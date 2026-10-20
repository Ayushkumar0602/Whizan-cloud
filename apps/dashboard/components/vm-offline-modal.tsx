"use client";

import Link from "next/link";
import { Zap, Play, ExternalLink, X, ArrowRight, ShieldCheck } from "lucide-react";
import { system } from "@/lib/api";

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

  const cleanSlug = (targetName || "my-service").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const wakeupUrl = `/wakeup?slug=${encodeURIComponent(cleanSlug)}&target=${encodeURIComponent(targetUrl || `http://${cleanSlug}.20.2.136.11.nip.io`)}`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(10, 8, 22, 0.72)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--card, #120f24)",
          borderRadius: "var(--radius-lg, 16px)",
          maxWidth: 520,
          width: "100%",
          padding: "2rem",
          boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.6)",
          border: "1px solid rgba(99, 102, 241, 0.3)",
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
              background: "rgba(99, 102, 241, 0.16)",
              color: "#818cf8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Zap size={22} />
          </div>
          <div>
            <div style={{ fontSize: "0.78rem", color: "#a5b4fc", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Eco-Standby Resource Allocation
            </div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--foreground, #ffffff)" }}>
              {isDeploy ? "Awaken Node to Deploy" : isVisit ? "Launch Service from Standby" : "Allocating Compute Resources"}
            </h3>
          </div>
        </div>

        <p style={{ fontSize: "0.92rem", color: "var(--muted, #94a3b8)", lineHeight: 1.55, marginBottom: "1.25rem" }}>
          {isDeploy ? (
            <>
              To ensure peak memory efficiency and $0.00/hr idle optimization, the build node is in eco-standby. 
              Clicking below will awaken the compute host and dispatch your build job.
            </>
          ) : isVisit ? (
            <>
              <strong>{targetName || "This application"}</strong> is resting in eco-standby. 
              Clicking below will spin up the compute host, allocate memory, and route to your live service.
            </>
          ) : (
            <>
              This action requires our cloud compute host, which is resting in eco-standby to save resources.
            </>
          )}
        </p>

        <div
          style={{
            padding: "0.85rem 1rem",
            borderRadius: "var(--radius, 10px)",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            fontSize: "0.84rem",
            color: "var(--foreground, #e2e8f0)",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
          }}
        >
          <ShieldCheck size={18} style={{ color: "#34d399", flexShrink: 0 }} />
          <div>
            Zero-redundancy auto-scaling keeps platform integrity 100% stable with fast cold-boot recovery.
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {isVisit ? (
            <>
              {targetUrl && (
                <a
                  href={targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "0.65rem 1rem",
                    borderRadius: "var(--radius, 8px)",
                    background: "transparent",
                    border: "1px solid var(--border, rgba(255, 255, 255, 0.12))",
                    color: "var(--muted, #94a3b8)",
                    fontSize: "0.86rem",
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                >
                  Direct Edge URL <ExternalLink size={13} />
                </a>
              )}

              <Link
                href={wakeupUrl}
                onClick={onClose}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "0.65rem 1.25rem",
                  borderRadius: "var(--radius, 8px)",
                  background: "linear-gradient(135deg, #4f46e5, #6366f1)",
                  color: "#ffffff",
                  fontSize: "0.88rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  boxShadow: "0 4px 15px rgba(99, 102, 241, 0.4)",
                }}
              >
                <Zap size={15} /> Spin Up & Launch App <ArrowRight size={14} />
              </Link>
            </>
          ) : (
            <button
              onClick={async () => {
                await system.wake("dashboard_action").catch(() => {});
                onClose();
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "0.65rem 1.25rem",
                borderRadius: "var(--radius, 8px)",
                background: "linear-gradient(135deg, #4f46e5, #6366f1)",
                color: "#ffffff",
                fontSize: "0.88rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                boxShadow: "0 4px 15px rgba(99, 102, 241, 0.4)",
              }}
            >
              <Play size={15} /> Awaken Compute Host
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
