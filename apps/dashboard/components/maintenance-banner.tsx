"use client";

import { useState } from "react";
import Link from "next/link";
import { useSystemStatus } from "@/hooks/useSystemStatus";
import { system } from "@/lib/api";
import { toast } from "sonner";
import { Moon, Zap, ArrowRight, X, Loader2 } from "lucide-react";

export function MaintenanceBanner() {
  const { vmOnline, loading, isWakingUp, estimatedSecondsRemaining, refresh } = useSystemStatus();
  const [dismissed, setDismissed] = useState(false);
  const [wakingAction, setWakingAction] = useState(false);

  // If loading or VM is online, do not render banner
  if (loading || vmOnline || dismissed) {
    return null;
  }

  const handleWake = async () => {
    try {
      setWakingAction(true);
      await system.wake("dashboard_banner_wake");
      toast.success("⚡ Wake webhook dispatched! Azure VM is booting (~45s)...");
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to trigger compute wake");
    } finally {
      setWakingAction(false);
    }
  };

  return (
    <div
      style={{
        background: isWakingUp
          ? "linear-gradient(90deg, #ecfdf5 0%, #d1fae5 50%, #ecfdf5 100%)"
          : "linear-gradient(90deg, #eff6ff 0%, #dbeafe 50%, #eff6ff 100%)",
        borderBottom: `1px solid ${isWakingUp ? "#a7f3d0" : "#bfdbfe"}`,
        color: isWakingUp ? "#065f46" : "#1e40af",
        padding: "0.55rem 1.25rem",
        fontSize: "0.85rem",
        position: "sticky",
        top: 0,
        zIndex: 50,
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
        transition: "all 0.3s ease",
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
          {isWakingUp ? (
            <Loader2 size={16} className="animate-spin" style={{ color: "#059669", flexShrink: 0 }} />
          ) : (
            <Moon size={16} style={{ color: "#3b82f6", flexShrink: 0 }} />
          )}
          <span>
            <strong style={{ fontWeight: 600 }}>
              {isWakingUp ? "Compute Awakening:" : "Autonomous Idle Hibernation:"}
            </strong>{" "}
            {isWakingUp
              ? `Azure VM is booting up (~${estimatedSecondsRemaining}s remaining). Services will self-heal automatically.`
              : "Compute node is deallocated to eliminate idle cloud costs ($0.00/hr). All data and containers are safely preserved on disk."}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {!isWakingUp ? (
            <button
              type="button"
              onClick={handleWake}
              disabled={wakingAction}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 12px",
                borderRadius: "999px",
                background: "#2563eb",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "0.78rem",
                border: "none",
                cursor: wakingAction ? "wait" : "pointer",
                boxShadow: "0 1px 2px rgba(37, 99, 235, 0.2)",
              }}
            >
              {wakingAction ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              Wake Node Now
            </button>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 10px",
                borderRadius: "999px",
                background: "#059669",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "0.75rem",
              }}
            >
              Booting (~{estimatedSecondsRemaining}s)
            </span>
          )}

          <button
            type="button"
            onClick={() => setDismissed(true)}
            style={{
              background: "transparent",
              border: "none",
              color: isWakingUp ? "#047857" : "#1d4ed8",
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
