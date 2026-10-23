"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, ArrowLeft } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error caught by boundary:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--background)",
        color: "var(--foreground)",
        fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif",
        position: "relative",
        overflow: "hidden",
        padding: "1.5rem",
      }}
    >
      {/* Aurora Ambient Mesh */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `
            radial-gradient(circle at 50% -10%, rgba(244, 63, 94, 0.08), transparent 50%),
            radial-gradient(circle at 85% 40%, rgba(99, 102, 241, 0.08), transparent 45%),
            radial-gradient(circle at 15% 70%, rgba(56, 189, 248, 0.06), transparent 45%)
          `,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 480,
          width: "100%",
          textAlign: "center",
          background: "var(--card)",
          backdropFilter: "blur(20px)",
          border: "1px solid var(--border)",
          borderRadius: 24,
          padding: "3rem 2rem 2.5rem",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "rgba(244, 63, 94, 0.08)",
            border: "1px solid rgba(244, 63, 94, 0.2)",
            color: "var(--danger)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "1.25rem",
          }}
        >
          <AlertTriangle size={28} />
        </div>

        <div
          style={{
            fontSize: "0.76rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--danger)",
            marginBottom: "0.4rem",
          }}
        >
          Unexpected Runtime Error
        </div>

        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "var(--foreground)",
            margin: "0 0 0.75rem 0",
          }}
        >
          Something went wrong
        </h1>

        <p
          style={{
            fontSize: "0.9rem",
            color: "var(--muted)",
            lineHeight: 1.6,
            margin: "0 0 1.5rem 0",
          }}
        >
          {error.message || "An unexpected error occurred while rendering this interface. You can try refreshing or returning to Console."}
        </p>

        {error.digest && (
          <div
            style={{
              background: "var(--bg-inset)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "0.4rem 0.75rem",
              fontSize: "0.76rem",
              fontFamily: "var(--font-geist-mono), monospace",
              color: "var(--muted)",
              marginBottom: "1.75rem",
              display: "inline-block",
            }}
          >
            Digest: {error.digest}
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => reset()}
            className="btn btn-primary btn-lg"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <RotateCcw size={16} /> Try Again
          </button>
          <Link
            href="/dashboard"
            className="btn btn-secondary btn-lg"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <ArrowLeft size={16} /> Return to Console
          </Link>
        </div>
      </div>
    </div>
  );
}
