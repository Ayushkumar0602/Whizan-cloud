"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import GhostFibers from "./GhostFibers";
import { Globe } from "lucide-react";

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
        minHeight: "100vh",
        overflow: "hidden",
        background: "#0c0a18",
        color: "#ffffff",
        fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "100%", height: "600px", position: "relative" }}>
        <GhostFibers
          lineColor="#140E35"
          glowColor="#3437A0"
          speed={0.2}
          scale={2}
          rotation={0}
          rotationSpeed={0.25}
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
          glowIntensity={1.6}
          brightness={2}
          blueBoost={1.25}
          vignette={0.8}
          grain={0.05}
          dpr={1}
          lightMode={false}
          fps={60}
          paused={false}
        />

        {/* Centerpiece Information Overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              pointerEvents: "auto",
              width: "90%",
              maxWidth: 460,
              background: "rgba(16, 13, 33, 0.76)",
              backdropFilter: "blur(32px) saturate(180%)",
              WebkitBackdropFilter: "blur(32px) saturate(180%)",
              border: isReady ? "1px solid rgba(99, 102, 241, 0.7)" : "1px solid rgba(52, 55, 160, 0.35)",
              borderRadius: 24,
              padding: "2.4rem 2rem 2rem",
              textAlign: "center",
              boxShadow: isReady
                ? "0 30px 80px -10px rgba(0, 0, 0, 0.9), 0 0 80px rgba(52, 55, 160, 0.5), inset 0 1px 0 rgba(99, 102, 241, 0.4)"
                : "0 25px 70px -10px rgba(0, 0, 0, 0.85), 0 0 50px rgba(52, 55, 160, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
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
                background: "linear-gradient(90deg, transparent, #3437A0, #6366f1, transparent)",
                borderRadius: 2,
                filter: "blur(0.5px)",
              }}
            />

            {/* Status Pill Badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                background: isReady ? "rgba(99, 102, 241, 0.2)" : "rgba(52, 55, 160, 0.2)",
                border: isReady ? "1px solid rgba(99, 102, 241, 0.6)" : "1px solid rgba(52, 55, 160, 0.45)",
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
                  background: isReady ? "#38bdf8" : "#818cf8",
                  boxShadow: isReady ? "0 0 8px #38bdf8" : "0 0 8px #818cf8",
                  animation: "pulse 1.8s ease-in-out infinite alternate",
                }}
              />
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: isReady ? "#38bdf8" : "#a5b4fc",
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
                background: "linear-gradient(135deg, #ffffff 40%, #c7d2fe 75%, #818cf8 100%)",
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
                border: "1px solid rgba(52, 55, 160, 0.35)",
                borderRadius: 8,
                padding: "0.35rem 0.75rem",
                fontFamily: "var(--font-mono), monospace",
                fontSize: "0.78rem",
                color: "#e2e8f0",
                marginBottom: "1.5rem",
              }}
            >
              <Globe size={13} style={{ color: "#818cf8" }} />
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
                  background: "linear-gradient(90deg, #3437A0, #6366f1, #38bdf8)",
                  boxShadow: "0 0 14px rgba(99, 102, 241, 0.9)",
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
                background: "rgba(10, 8, 22, 0.65)",
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
            background: "#0c0a18",
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
