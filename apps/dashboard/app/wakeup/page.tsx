"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function WakeupView() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug") || "";
  const displaySlug = slug ? `${slug}.20.2.136.11.nip.io` : "";

  return (
    <div className="wakeup-wrapper">
      {/* Calm Ambient Aurora Background */}
      <div className="aurora-bg">
        <div className="aurora-blob blob-1" />
        <div className="aurora-blob blob-2" />
        <div className="aurora-blob blob-3" />
      </div>

      {/* Minimal Centered Content */}
      <div className="content">
        <div className="pulse-ring">
          <div className="pulse-core" />
        </div>
        <h1>Waking up...</h1>
        <p>Your application is spinning up. It will be ready in a moment.</p>
        <div className="bar">
          <div className="bar-line" />
        </div>
        {displaySlug && <div className="endpoint">{displaySlug}</div>}
      </div>

      <style jsx>{`
        .wakeup-wrapper {
          position: fixed;
          inset: 0;
          background: #000000;
          color: #ffffff;
          font-family: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          -webkit-font-smoothing: antialiased;
        }

        .aurora-bg {
          position: fixed;
          inset: -20%;
          overflow: hidden;
          pointer-events: none;
          filter: blur(110px);
          opacity: 0.7;
        }

        .aurora-blob {
          position: absolute;
          border-radius: 50%;
          mix-blend-mode: screen;
          will-change: transform;
          animation: auroraMove 18s ease-in-out infinite alternate;
        }

        .blob-1 {
          width: 50vw;
          height: 50vw;
          max-width: 580px;
          max-height: 580px;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.45) 0%, rgba(6, 182, 212, 0.2) 55%, transparent 75%);
          top: 15%;
          left: 18%;
          animation-duration: 20s;
        }

        .blob-2 {
          width: 55vw;
          height: 55vw;
          max-width: 620px;
          max-height: 620px;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.45) 0%, rgba(139, 92, 246, 0.2) 55%, transparent 75%);
          bottom: 12%;
          right: 18%;
          animation-duration: 24s;
          animation-delay: -6s;
        }

        .blob-3 {
          width: 42vw;
          height: 42vw;
          max-width: 480px;
          max-height: 480px;
          background: radial-gradient(circle, rgba(6, 182, 212, 0.35) 0%, rgba(59, 130, 246, 0.15) 55%, transparent 75%);
          top: 38%;
          left: 42%;
          animation-duration: 22s;
          animation-delay: -10s;
        }

        @keyframes auroraMove {
          0% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(45px, -35px) scale(1.08);
          }
          100% {
            transform: translate(-35px, 45px) scale(0.96);
          }
        }

        .content {
          position: relative;
          z-index: 10;
          text-align: center;
          max-width: 420px;
          padding: 2.5rem 1.5rem;
        }

        .pulse-ring {
          width: 52px;
          height: 52px;
          margin: 0 auto 2.2rem;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .pulse-ring::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: conic-gradient(from 0deg, #10b981, #06b6d4, #8b5cf6, #10b981);
          animation: spin 3.5s linear infinite;
          filter: blur(5px);
          opacity: 0.85;
        }

        .pulse-ring::after {
          content: "";
          position: absolute;
          inset: 2.5px;
          border-radius: 50%;
          background: #000000;
        }

        .pulse-core {
          position: relative;
          z-index: 2;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 16px #10b981;
          animation: breathe 2.6s ease-in-out infinite alternate;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes breathe {
          0% {
            transform: scale(0.85);
            opacity: 0.55;
            box-shadow: 0 0 8px #10b981;
          }
          100% {
            transform: scale(1.2);
            opacity: 1;
            box-shadow:
              0 0 22px #34d399,
              0 0 36px #06b6d4;
          }
        }

        h1 {
          font-size: 1.55rem;
          font-weight: 500;
          letter-spacing: -0.025em;
          color: #ffffff;
          margin-bottom: 0.55rem;
        }

        p {
          font-size: 0.92rem;
          color: rgba(255, 255, 255, 0.45);
          line-height: 1.55;
          font-weight: 400;
          margin-bottom: 2.2rem;
        }

        .bar {
          width: 130px;
          height: 2px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 2px;
          margin: 0 auto;
          overflow: hidden;
          position: relative;
        }

        .bar-line {
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          width: 45%;
          background: linear-gradient(90deg, transparent, #10b981, #06b6d4, transparent);
          border-radius: 2px;
          animation: sweep 2.2s ease-in-out infinite;
        }

        @keyframes sweep {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(250%);
          }
        }

        .endpoint {
          margin-top: 2rem;
          font-size: 0.78rem;
          color: rgba(255, 255, 255, 0.22);
          font-family: var(--font-mono), monospace;
          letter-spacing: 0.02em;
        }
      `}</style>
    </div>
  );
}

export default function WakeupPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "#000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div className="spinner" />
        </div>
      }
    >
      <WakeupView />
    </Suspense>
  );
}
