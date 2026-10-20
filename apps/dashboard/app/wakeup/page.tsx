"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import GhostFibers from "./GhostFibers";
import { Globe } from "lucide-react";
import { system } from "@/lib/api";

function WakeupContent() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug") || "my-service";
  const targetUrl = searchParams.get("target") || `http://${slug}.20.2.136.11.nip.io`;
  const displaySlug = `${slug}.20.2.136.11.nip.io`;

  const [elapsed, setElapsed] = useState("0.0");
  const [isReady, setIsReady] = useState(false);
  const [stepText, setStepText] = useState("Awakening compute container...");
  const [stepIcon, setStepIcon] = useState("⚡");
  const [progress, setProgress] = useState(20);

  useEffect(() => {
    // Proactively notify control plane to wake the Azure VM if asleep
    system.wake(`wakeup_page_${slug}`).catch(() => {});
  }, [slug]);

  useEffect(() => {
    if (isReady) return;
    const start = Date.now();

    const timer = setInterval(() => {
      const elapsedMs = Date.now() - start;
      setElapsed((elapsedMs / 1000).toFixed(1));

      if (elapsedMs < 6000) {
        setStepText("Awakening Azure VM compute host...");
        setStepIcon("⚡");
        setProgress(25);
      } else if (elapsedMs < 14000) {
        setStepText("Allocating memory & vCPU quota...");
        setStepIcon("📦");
        setProgress(55);
      } else if (elapsedMs < 22000) {
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
      const nextDelay = Math.min(800 * Math.pow(1.1, pollAttempts), 2000);

      setTimeout(() => {
        system.getStatus({ bypassCache: true })
          .then((statusData: any) => {
            if (statusData && statusData.status === "ONLINE") {
              fetch(targetUrl, {
                method: "HEAD",
                cache: "no-store",
                mode: "no-cors",
              })
                .then(() => {
                  if (active) {
                    setIsReady(true);
                    setProgress(100);
                    setStepText("Application is online! Launching...");
                    setStepIcon("✅");
                    setTimeout(() => {
                      window.location.href = targetUrl;
                    }, 400);
                  }
                })
                .catch(() => probe());
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
  }, [isReady, targetUrl]);

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        minHeight: "100vh",
        overflow: "hidden",
        background: "#fafbfc",
        color: "#0f172a",
        fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Aurora Ambient Background Blobs */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background: `
            radial-gradient(ellipse 80% 60% at 50% -20%, rgba(99, 102, 241, 0.12), transparent 70%),
            radial-gradient(ellipse 60% 50% at 85% 40%, rgba(56, 189, 248, 0.1), transparent 60%),
            radial-gradient(ellipse 50% 50% at 15% 70%, rgba(168, 85, 247, 0.08), transparent 60%)
          `,
        }}
      />

      {/* Fullscreen GhostFibers WebGL Canvas in Light Mode */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 1,
          overflow: "hidden",
          opacity: 0.85,
        }}
      >
        <GhostFibers
          lineColor="#818cf8"
          glowColor="#6366f1"
          speed={0.2}
          scale={2}
          rotation={0}
          rotationSpeed={0.2}
          layers={4}
          waveAmplitude={0.015}
          waveFrequency={3}
          waveSpeed={0.15}
          layerSpeed={0.08}
          twist={0.1}
          twistFrequency={5}
          twistSpeed={1.2}
          lineFrequency={5}
          lineSpacing={2}
          lineSharpness={16}
          glowFalloff={10}
          glowIntensity={1.4}
          brightness={1.8}
          blueBoost={1.15}
          vignette={0.4}
          grain={0.02}
          dpr={1}
          lightMode={true}
          fps={60}
          paused={false}
        />
      </div>

      {/* Centerpiece Information Overlay Card */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "90%",
          maxWidth: 480,
          background: "rgba(255, 255, 255, 0.94)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border: isReady ? "1px solid rgba(99, 102, 241, 0.5)" : "1px solid #e2e8f0",
          borderRadius: 24,
          padding: "2.4rem 2rem 2rem",
          textAlign: "center",
          boxShadow: isReady
            ? "0 25px 50px -12px rgba(99, 102, 241, 0.25), 0 0 0 1px rgba(99, 102, 241, 0.2)"
            : "0 20px 40px -12px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.05)",
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
            height: 3,
            background: "linear-gradient(90deg, transparent, #6366f1, #38bdf8, transparent)",
            borderRadius: 3,
          }}
        />

        {/* Status Pill Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            background: isReady ? "rgba(16, 185, 129, 0.1)" : "rgba(99, 102, 241, 0.08)",
            border: isReady ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(99, 102, 241, 0.25)",
            borderRadius: 9999,
            padding: "0.3rem 0.85rem",
            marginBottom: "1.2rem",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: isReady ? "#10b981" : "#6366f1",
              boxShadow: isReady ? "0 0 8px rgba(16, 185, 129, 0.6)" : "0 0 8px rgba(99, 102, 241, 0.6)",
              animation: "pulse 1.8s ease-in-out infinite alternate",
            }}
          />
          <span
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: isReady ? "#059669" : "#4f46e5",
            }}
          >
            {isReady ? "Online • 200 OK" : "Whizan Scale-to-Zero"}
          </span>
        </div>

        {/* Heading */}
        <h1
          style={{
            fontSize: "1.6rem",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: "0.55rem",
            color: "#0f172a",
            lineHeight: 1.25,
          }}
        >
          {isReady ? "Application Live" : "Awakening Service"}
        </h1>

        {/* Precise Subtitle */}
        <p
          style={{
            fontSize: "0.88rem",
            color: "#64748b",
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
            gap: "0.5rem",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "0.4rem 0.85rem",
            fontFamily: "var(--font-mono), monospace",
            fontSize: "0.8rem",
            color: "#334155",
            marginBottom: "1.5rem",
          }}
        >
          <Globe size={13} style={{ color: "#6366f1" }} />
          <span>{displaySlug}</span>
        </div>

        {/* Glowing Progress Bar */}
        <div
          style={{
            height: 6,
            background: "#f1f5f9",
            borderRadius: 9999,
            overflow: "hidden",
            marginBottom: "1.2rem",
            border: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              borderRadius: 9999,
              background: "linear-gradient(90deg, #6366f1, #38bdf8)",
              boxShadow: "0 0 10px rgba(99, 102, 241, 0.4)",
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
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: "0.75rem 1rem",
            fontSize: "0.82rem",
            color: "#0f172a",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", textAlign: "left" }}>
            <span>{stepIcon}</span>
            <span style={{ fontSize: "0.82rem", color: "#334155", fontWeight: 500 }}>{stepText}</span>
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: "0.76rem",
              fontWeight: 600,
              color: "#6366f1",
              background: "rgba(99, 102, 241, 0.08)",
              padding: "0.2rem 0.5rem",
              borderRadius: 6,
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
            background: "#fafbfc",
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
