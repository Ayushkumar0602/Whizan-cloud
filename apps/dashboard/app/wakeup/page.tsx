"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Globe, Zap, CheckCircle2 } from "lucide-react";

// Dynamically import GridScan with SSR disabled to ensure WebGL initializes cleanly in the browser
const GridScan = dynamic(() => import("./GridScan"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#08060c",
      }}
    />
  ),
});

function WakeupContent() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug") || "my-service";
  const displaySlug = `${slug}.20.2.136.11.nip.io`;

  const [elapsed, setElapsed] = useState("0.0");
  const [isReady, setIsReady] = useState(false);
  const [stepText, setStepText] = useState("Awakening compute container...");
  const [stepIcon, setStepIcon] = useState("⚡");
  const [progress, setProgress] = useState(20);

  useEffect(() => {
    if (isReady) return;
    const start = Date.now();

    const timer = setInterval(() => {
      const elapsedMs = Date.now() - start;
      setElapsed((elapsedMs / 1000).toFixed(1));

      if (elapsedMs < 1600) {
        setStepText("Awakening compute container...");
        setStepIcon("⚡");
        setProgress(25);
      } else if (elapsedMs < 3600) {
        setStepText("Rehydrating memory & image layers...");
        setStepIcon("📦");
        setProgress(55);
      } else if (elapsedMs < 5800) {
        setStepText("Binding private edge routing mesh...");
        setStepIcon("🌐");
        setProgress(80);
      } else {
        setStepText("Probing HTTP 200 health readiness...");
        setStepIcon("✨");
        setProgress(92);
      }
    }, 100);

    return () => clearInterval(timer);
  }, [isReady]);

  // Background polling to detect when live container responds
  useEffect(() => {
    let active = true;
    let pollAttempts = 0;

    function probe() {
      if (!active || isReady) return;
      pollAttempts++;
      const nextDelay = Math.min(400 * Math.pow(1.15, pollAttempts), 1800);

      setTimeout(() => {
        fetch(typeof window !== "undefined" ? window.location.href : "", {
          method: "HEAD",
          cache: "no-store",
        })
          .then((res) => {
            if (res.status !== 502 && res.status !== 202 && res.status !== 503) {
              if (active) {
                setIsReady(true);
                setProgress(100);
                setStepText("Application is online! Launching...");
                setStepIcon("✅");
                setTimeout(() => {
                  window.location.reload();
                }, 400);
              }
            } else {
              probe();
            }
          })
          .catch(() => probe());
      }, nextDelay);
    }

    probe();

    return () => {
      active = false;
    };
  }, [isReady]);

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#08060c",
        color: "#ffffff",
        fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* 3D Cyberpunk Grid Scan Background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
        }}
      >
        <GridScan
          sensitivity={0.55}
          lineThickness={1}
          linesColor="#2F293A"
          gridScale={0.1}
          scanColor="#FF9FFC"
          scanOpacity={0.4}
          enablePost
          bloomIntensity={0.6}
          chromaticAberration={0.002}
          noiseIntensity={0.01}
          lineJitter={0.1}
          scanGlow={0.5}
          scanSoftness={2}
          enableWebcam={false}
          showPreview={false}
        />
      </div>

      {/* Vignette Depth Overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 50% 50%, rgba(8, 6, 12, 0.2) 0%, rgba(8, 6, 12, 0.75) 75%, rgba(8, 6, 12, 0.95) 100%)",
        }}
      />

      {/* Precise, Clean Centerpiece Information Card */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "90%",
          maxWidth: 460,
          background: "rgba(18, 14, 26, 0.7)",
          backdropFilter: "blur(32px) saturate(180%)",
          WebkitBackdropFilter: "blur(32px) saturate(180%)",
          border: isReady ? "1px solid rgba(255, 159, 252, 0.7)" : "1px solid rgba(255, 159, 252, 0.2)",
          borderRadius: 24,
          padding: "2.4rem 2rem 2rem",
          textAlign: "center",
          boxShadow: isReady
            ? "0 30px 80px -10px rgba(0, 0, 0, 0.9), 0 0 80px rgba(255, 159, 252, 0.4), inset 0 1px 0 rgba(255, 159, 252, 0.4)"
            : "0 25px 70px -10px rgba(0, 0, 0, 0.85), 0 0 50px rgba(255, 159, 252, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
          transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
          transform: isReady ? "scale(1.02)" : "scale(1)",
        }}
      >
        {/* Top Glowing Accent Line */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "25%",
            right: "25%",
            height: 2,
            background: "linear-gradient(90deg, transparent, #FF9FFC, #818cf8, transparent)",
            borderRadius: 2,
            filter: "blur(0.5px)",
          }}
        />

        {/* Status Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            background: isReady ? "rgba(255, 159, 252, 0.18)" : "rgba(255, 159, 252, 0.1)",
            border: isReady ? "1px solid rgba(255, 159, 252, 0.5)" : "1px solid rgba(255, 159, 252, 0.25)",
            borderRadius: 9999,
            padding: "0.28rem 0.8rem",
            marginBottom: "1.2rem",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#FF9FFC",
              boxShadow: "0 0 8px #FF9FFC",
              animation: "pulse 1.8s ease-in-out infinite alternate",
            }}
          />
          <span
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#FF9FFC",
            }}
          >
            {isReady ? "Online • 200 OK" : "Whizan Scale-to-Zero"}
          </span>
        </div>

        {/* Heading */}
        <h1
          style={{
            fontSize: "1.55rem",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: "0.55rem",
            background: "linear-gradient(135deg, #ffffff 40%, #e2e8f0 70%, #FF9FFC 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            lineHeight: 1.25,
          }}
        >
          {isReady ? "Application Live" : "Awakening Service"}
        </h1>

        {/* Precise Subtitle */}
        <p
          style={{
            fontSize: "0.88rem",
            color: "#94a3b8",
            lineHeight: 1.55,
            marginBottom: "1.4rem",
            padding: "0 0.4rem",
          }}
        >
          {isReady
            ? "Container is fully warmed up and active. Launching your application..."
            : "Your container was in eco-standby to save compute resources. Warming up memory & edge routing now."}
        </p>

        {/* Target Domain Chip */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 159, 252, 0.15)",
            borderRadius: 8,
            padding: "0.35rem 0.75rem",
            fontFamily: "var(--font-mono), monospace",
            fontSize: "0.78rem",
            color: "#e2e8f0",
            marginBottom: "1.5rem",
          }}
        >
          <Globe size={13} style={{ color: "#FF9FFC" }} />
          <span>{displaySlug}</span>
        </div>

        {/* Glowing Progress Bar */}
        <div
          style={{
            height: 4,
            background: "rgba(255, 255, 255, 0.08)",
            borderRadius: 9999,
            overflow: "hidden",
            marginBottom: "1.2rem",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              borderRadius: 9999,
              background: "linear-gradient(90deg, #818cf8, #FF9FFC, #38bdf8)",
              boxShadow: "0 0 12px rgba(255, 159, 252, 0.8)",
              transition: "width 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>

        {/* Live Step Status Feed & Elapsed Stopwatch */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(0, 0, 0, 0.35)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 10,
            padding: "0.65rem 0.9rem",
            fontSize: "0.8rem",
            color: "#e2e8f0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", textAlign: "left" }}>
            <span>{stepIcon}</span>
            <span style={{ fontSize: "0.8rem", color: "#cbd5e1" }}>{stepText}</span>
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: "0.74rem",
              color: "#94a3b8",
              background: "rgba(255, 255, 255, 0.06)",
              padding: "0.15rem 0.45rem",
              borderRadius: 4,
            }}
          >
            {elapsed}s
          </span>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0% {
            transform: scale(0.85);
            opacity: 0.6;
          }
          100% {
            transform: scale(1.2);
            opacity: 1;
          }
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
            background: "#08060c",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div className="spinner" />
        </div>
      }
    >
      <WakeupContent />
    </Suspense>
  );
}
