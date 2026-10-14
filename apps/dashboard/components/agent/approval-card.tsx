"use client";

import React, { useState } from "react";
import { ShieldAlert, Check, X, Edit3, Loader2 } from "lucide-react";
import { agentApi } from "@/lib/api";

interface ApprovalCardProps {
  pendingAction: {
    actionId: string;
    toolName: string;
    parameters: any;
    riskTier: string;
    explanation: string;
  };
  onResolved: (result: { success: boolean; data?: any; error?: string }) => void;
}

export function ApprovalCard({ pendingAction, onResolved }: ApprovalCardProps) {
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedParams, setEditedParams] = useState(
    JSON.stringify(pendingAction.parameters || {}, null, 2)
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleDecision(decision: "APPROVE" | "REJECT") {
    setLoading(true);
    setErrorMsg(null);

    let parsedParams: any = undefined;
    if (decision === "APPROVE" && editing) {
      try {
        parsedParams = JSON.parse(editedParams);
      } catch (err: any) {
        setErrorMsg("Invalid JSON parameters format.");
        setLoading(false);
        return;
      }
    }

    try {
      const res = await agentApi.approveAction({
        actionId: pendingAction.actionId,
        decision,
        modifiedParameters: parsedParams,
      });

      onResolved({
        success: res.success,
        data: res.result,
        error: res.error,
      });
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to process decision.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        margin: "12px 0",
        borderRadius: "12px",
        background: "linear-gradient(145deg, rgba(245, 158, 11, 0.08), rgba(15, 23, 42, 0.6))",
        border: "1px solid rgba(245, 158, 11, 0.35)",
        boxShadow: "0 8px 24px rgba(245, 158, 11, 0.12)",
        overflow: "hidden",
        fontSize: "0.82rem",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "rgba(245, 158, 11, 0.12)",
          borderBottom: "1px solid rgba(245, 158, 11, 0.2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <ShieldAlert size={16} style={{ color: "#f59e0b" }} />
          <span style={{ fontWeight: 700, color: "#fef3c7" }}>
            Action Verification Required
          </span>
        </div>
        <span
          style={{
            fontSize: "0.7rem",
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: "12px",
            background: "rgba(245, 158, 11, 0.2)",
            color: "#fbbf24",
            border: "1px solid rgba(245, 158, 11, 0.4)",
          }}
        >
          {pendingAction.riskTier || "TIER_2"} Gate
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: "12px 14px" }}>
        <p style={{ margin: "0 0 10px 0", color: "#e2e8f0", lineHeight: 1.45 }}>
          {pendingAction.explanation}
        </p>

        <div style={{ marginBottom: "10px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "4px",
            }}
          >
            <span style={{ fontSize: "0.72rem", color: "var(--muted, #94a3b8)", fontWeight: 600 }}>
              Action: <code style={{ color: "#00f0ff" }}>{pendingAction.toolName}</code>
            </span>
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              style={{
                background: "transparent",
                border: "none",
                color: editing ? "#a855f7" : "var(--muted, #94a3b8)",
                fontSize: "0.72rem",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                cursor: "pointer",
              }}
            >
              <Edit3 size={11} />
              {editing ? "Cancel Edit" : "Edit Parameters"}
            </button>
          </div>

          {editing ? (
            <textarea
              value={editedParams}
              onChange={(e) => setEditedParams(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                padding: "8px",
                background: "#080c14",
                border: "1px solid rgba(168, 85, 247, 0.4)",
                borderRadius: "6px",
                color: "#e2e8f0",
                fontFamily: "monospace",
                fontSize: "0.74rem",
                outline: "none",
              }}
            />
          ) : (
            <pre
              style={{
                margin: 0,
                padding: "8px",
                background: "#080c14",
                borderRadius: "6px",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                color: "#cbd5e1",
                fontFamily: "monospace",
                fontSize: "0.72rem",
                maxHeight: "120px",
                overflowY: "auto",
              }}
            >
              {JSON.stringify(pendingAction.parameters, null, 2)}
            </pre>
          )}
        </div>

        {errorMsg && (
          <div style={{ color: "#ef4444", fontSize: "0.75rem", marginBottom: "10px" }}>
            {errorMsg}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleDecision("REJECT")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "6px 14px",
              borderRadius: "6px",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              background: "rgba(239, 68, 68, 0.08)",
              color: "#fca5a5",
              fontSize: "0.78rem",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            <X size={13} />
            Reject
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => handleDecision("APPROVE")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "6px 16px",
              borderRadius: "6px",
              border: "none",
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "#ffffff",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
            }}
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Approve & Run
          </button>
        </div>
      </div>
    </div>
  );
}
