"use client";

import React, { useState } from "react";
import { ShieldCheck, Check, X, Edit3, Loader2, AlertTriangle } from "lucide-react";
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
      } catch {
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
        borderRadius: "10px",
        background: "var(--card, #ffffff)",
        border: "1px solid rgba(245, 158, 11, 0.3)",
        boxShadow: "0 4px 16px rgba(245, 158, 11, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04)",
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
          background: "linear-gradient(180deg, rgba(254, 243, 199, 0.15) 0%, rgba(254, 243, 199, 0.05) 100%)",
          borderBottom: "1px solid rgba(245, 158, 11, 0.2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "6px",
              background: "rgba(245, 158, 11, 0.12)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#d97706",
            }}
          >
            <ShieldCheck size={14} />
          </div>
          <div>
            <span style={{ fontWeight: 700, color: "#d97706", fontSize: "0.82rem" }}>
              Human Approval Required
            </span>
          </div>
        </div>
        <span
          style={{
            fontSize: "0.68rem",
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: "12px",
            background: "rgba(245, 158, 11, 0.1)",
            color: "#d97706",
            border: "1px solid rgba(245, 158, 11, 0.25)",
          }}
        >
          {pendingAction.riskTier || "TIER_2"}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: "12px 14px" }}>
        <p style={{ margin: "0 0 8px 0", color: "var(--foreground, #334155)", lineHeight: 1.5 }}>
          {pendingAction.explanation}
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "0.74rem",
            color: "var(--muted, #64748b)",
            marginBottom: "6px",
          }}
        >
          <span>Target action:</span>
          <code
            style={{
              background: "var(--bg-inset, #f1f5f9)",
              color: "var(--accent, #4f46e5)",
              padding: "1px 6px",
              borderRadius: "4px",
              fontFamily: "ui-monospace, monospace",
              fontWeight: 600,
            }}
          >
            {pendingAction.toolName}
          </code>
        </div>

        {/* Parameters Section */}
        <div style={{ marginTop: "10px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "4px",
            }}
          >
            <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>
              Parameters
            </span>
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "transparent",
                border: "none",
                color: "#4f46e5",
                fontSize: "0.72rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Edit3 size={11} />
              <span>{editing ? "Cancel Edit" : "Edit JSON"}</span>
            </button>
          </div>

          {editing ? (
            <textarea
              rows={4}
              value={editedParams}
              onChange={(e) => setEditedParams(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "6px",
                background: "#0f172a",
                color: "#f8fafc",
                fontSize: "0.74rem",
                fontFamily: "ui-monospace, monospace",
                border: "1px solid #334155",
                outline: "none",
                resize: "vertical",
              }}
            />
          ) : (
            <pre
              style={{
                margin: 0,
                padding: "8px 10px",
                borderRadius: "6px",
                background: "#090d16",
                color: "#cbd5e1",
                fontSize: "0.72rem",
                fontFamily: "ui-monospace, monospace",
                overflowX: "auto",
                border: "1px solid #1e293b",
              }}
            >
              {JSON.stringify(pendingAction.parameters || {}, null, 2)}
            </pre>
          )}
        </div>

        {errorMsg && (
          <div
            style={{
              marginTop: "8px",
              padding: "6px 10px",
              borderRadius: "6px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              fontSize: "0.72rem",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <AlertTriangle size={12} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px" }}>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleDecision("APPROVE")}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "7px 12px",
              borderRadius: "6px",
              background: "linear-gradient(180deg, #059669 0%, #047857 100%)",
              color: "#ffffff",
              border: "none",
              fontWeight: 600,
              fontSize: "0.78rem",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 1px 3px rgba(4, 120, 87, 0.3)",
            }}
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            <span>Approve & Execute</span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => handleDecision("REJECT")}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              padding: "7px 12px",
              borderRadius: "6px",
              background: "var(--bg-inset, #f1f5f9)",
              color: "var(--muted, #475569)",
              border: "1px solid var(--border, #cbd5e1)",
              fontWeight: 600,
              fontSize: "0.78rem",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            <X size={13} />
            <span>Reject</span>
          </button>
        </div>
      </div>
    </div>
  );
}
