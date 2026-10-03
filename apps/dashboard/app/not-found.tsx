import Link from "next/link";
import { ArrowLeft, Compass, Globe } from "lucide-react";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fafbfc",
        color: "#0f172a",
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
            radial-gradient(circle at 50% -10%, rgba(99, 102, 241, 0.12), transparent 50%),
            radial-gradient(circle at 85% 40%, rgba(56, 189, 248, 0.1), transparent 45%),
            radial-gradient(circle at 15% 70%, rgba(168, 85, 247, 0.08), transparent 45%)
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
          background: "rgba(255, 255, 255, 0.94)",
          backdropFilter: "blur(20px)",
          border: "1px solid #e2e8f0",
          borderRadius: 24,
          padding: "3rem 2rem 2.5rem",
          boxShadow: "0 20px 45px -12px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "rgba(99, 102, 241, 0.08)",
            border: "1px solid rgba(99, 102, 241, 0.2)",
            color: "var(--accent)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "1.25rem",
          }}
        >
          <Compass size={28} />
        </div>

        <div
          style={{
            fontSize: "0.76rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--accent)",
            marginBottom: "0.4rem",
          }}
        >
          Error 404 • Not Found
        </div>

        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "#0f172a",
            margin: "0 0 0.75rem 0",
          }}
        >
          Page does not exist
        </h1>

        <p
          style={{
            fontSize: "0.9rem",
            color: "#64748b",
            lineHeight: 1.6,
            margin: "0 0 2rem 0",
          }}
        >
          The page or resource you requested could not be located. It may have been moved, renamed, or deleted.
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/dashboard"
            className="btn btn-primary btn-lg"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <ArrowLeft size={16} /> Return to Console
          </Link>
          <Link
            href="/"
            className="btn btn-secondary btn-lg"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <Globe size={16} /> Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
