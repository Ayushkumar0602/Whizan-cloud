"use client";

import React, { useState } from "react";
import { CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, Terminal } from "lucide-react";

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

  const isPending = !tool.result && !tool.error;
  const isError = !!tool.error;

  return (
    <div
      style={{
        margin: "6px 0",
        borderRadius: "8px",
        background: "rgba(255, 255, 255, 0.03)",
        border: isError ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(255, 255, 255, 0.08)",
        overflow: "hidden",
        fontSize: "0.78rem",
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          cursor: "pointer",
          background: isError ? "rgba(239, 68, 68, 0.06)" : "rgba(255, 255, 255, 0.02)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Terminal size={13} style={{ color: "var(--whizan-cyan, #00f0ff)" }} />
          <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#e2e8f0" }}>
            {tool.name}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {isPending && (
            <span style={{ color: "#a855f7", display: "flex", alignItems: "center", gap: "4px" }}>
              <Loader2 size={12} className="animate-spin" />
              Running...
            </span>
          )}
          {!isPending && !isError && (
            <span style={{ color: "#10b981", display: "flex", alignItems: "center", gap: "4px" }}>
              <CheckCircle2 size={12} />
              Done
            </span>
          )}
          {isError && (
            <span style={{ color: "#ef4444", display: "flex", alignItems: "center", gap: "4px" }}>
              <AlertCircle size={12} />
              Blocked / Error
            </span>
          )}
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
          {tool.parameters && Object.keys(tool.parameters).length > 0 && (
            <div style={{ marginBottom: "6px" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--muted, #94a3b8)", marginBottom: "2px" }}>
                Parameters:
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "6px",
                  borderRadius: "4px",
                  background: "#080c14",
                  color: "#cbd5e1",
                  fontSize: "0.72rem",
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(tool.parameters, null, 2)}
              </pre>
            </div>
          )}

          {tool.result && (
            <div>
              <div style={{ fontSize: "0.7rem", color: "#10b981", marginBottom: "2px" }}>Output:</div>
              <pre
                style={{
                  margin: 0,
                  padding: "6px",
                  borderRadius: "4px",
                  background: "#080c14",
                  color: "#e2e8f0",
                  fontSize: "0.72rem",
                  maxHeight: "140px",
                  overflowY: "auto",
                }}
              >
                {typeof tool.result === "string" ? tool.result : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}

          {tool.error && (
            <div style={{ color: "#ef4444", fontSize: "0.74rem" }}>
              <strong>Error:</strong> {tool.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
