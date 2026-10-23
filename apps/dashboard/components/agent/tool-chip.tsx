"use client";

import React, { useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, Terminal, Copy, Check } from "lucide-react";

interface ToolChipProps {
  tool: {
    name: string;
    parameters: any;
    result?: any;
    error?: string;
  };
}

export function ToolChip({ tool }: ToolChipProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isPending = !tool.result && !tool.error;
  const isError = !!tool.error;

  function copyOutput() {
    const text = tool.result ? JSON.stringify(tool.result, null, 2) : tool.error || "";
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      style={{
        margin: "6px 0",
        borderRadius: "8px",
        background: "var(--card, #ffffff)",
        border: isError ? "1px solid #fecaca" : "1px solid var(--border, #e2e8f0)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
        fontSize: "0.78rem",
        transition: "all 0.2s ease",
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "7px 12px",
          cursor: "pointer",
          background: isError ? "rgba(239, 68, 68, 0.04)" : "var(--bg-inset, #f8fafc)",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "20px",
              height: "20px",
              borderRadius: "5px",
              background: isError ? "rgba(239, 68, 68, 0.1)" : "rgba(79, 70, 229, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: isError ? "#ef4444" : "#4f46e5",
            }}
          >
            <Terminal size={12} />
          </div>
          <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600, color: "var(--foreground, #1e293b)" }}>
            {tool.name}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {isPending && (
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: "#4f46e5",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "rgba(79, 70, 229, 0.08)",
                padding: "2px 7px",
                borderRadius: "10px",
              }}
            >
              <Loader2 size={11} className="animate-spin" />
              Running
            </span>
          )}
          {!isPending && !isError && (
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: "#059669",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "rgba(5, 150, 105, 0.08)",
                padding: "2px 7px",
                borderRadius: "10px",
              }}
            >
              <CheckCircle2 size={11} />
              Done
            </span>
          )}
          {isError && (
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: "#dc2626",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                background: "rgba(220, 38, 38, 0.08)",
                padding: "2px 7px",
                borderRadius: "10px",
              }}
            >
              <AlertCircle size={11} />
              Blocked
            </span>
          )}
          <span style={{ color: "#94a3b8" }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "10px 12px", borderTop: "1px solid #e2e8f0", background: "#090d16" }}>
          {tool.parameters && Object.keys(tool.parameters).length > 0 && (
            <div style={{ marginBottom: "8px" }}>
              <div style={{ fontSize: "0.68rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "3px" }}>
                Inputs
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "6px 8px",
                  borderRadius: "6px",
                  background: "#0f172a",
                  color: "#cbd5e1",
                  fontSize: "0.72rem",
                  fontFamily: "ui-monospace, monospace",
                  overflowX: "auto",
                  border: "1px solid #1e293b",
                }}
              >
                {JSON.stringify(tool.parameters, null, 2)}
              </pre>
            </div>
          )}

          {tool.result && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3px" }}>
                <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Output Result
                </span>
                <button
                  type="button"
                  onClick={copyOutput}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: copied ? "#10b981" : "#94a3b8",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "3px",
                    fontSize: "0.68rem",
                  }}
                >
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "8px 10px",
                  borderRadius: "6px",
                  background: "#0f172a",
                  color: "#e2e8f0",
                  fontSize: "0.72rem",
                  fontFamily: "ui-monospace, monospace",
                  overflowX: "auto",
                  maxHeight: "180px",
                  border: "1px solid #1e293b",
                }}
              >
                {typeof tool.result === "string" ? tool.result : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}

          {tool.error && (
            <div>
              <div style={{ fontSize: "0.68rem", fontWeight: 600, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "3px" }}>
                Policy Guardrail Violation
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "8px 10px",
                  borderRadius: "6px",
                  background: "#1c1015",
                  color: "#fca5a5",
                  fontSize: "0.72rem",
                  fontFamily: "ui-monospace, monospace",
                  overflowX: "auto",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                }}
              >
                {tool.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
