"use client";

import React from "react";

interface SummerLogoProps {
  size?: number;
  active?: boolean;
  className?: string;
}

/**
 * Bespoke Summer AI DevOps Copilot Logo
 * Modern iridescent celestial crystal with radiant indigo/cyan energy rings
 * Designed specifically for Whizan Cloud Service standards.
 */
export function SummerLogo({ size = 28, active = false, className = "" }: SummerLogoProps) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {/* Soft radiant ambient glow behind the logo */}
      <div
        style={{
          position: "absolute",
          inset: -4,
          borderRadius: "50%",
          background: active
            ? "radial-gradient(circle, rgba(79, 70, 229, 0.45) 0%, rgba(6, 182, 212, 0.3) 50%, transparent 70%)"
            : "radial-gradient(circle, rgba(79, 70, 229, 0.25) 0%, rgba(6, 182, 212, 0.15) 50%, transparent 70%)",
          filter: "blur(6px)",
          transform: active ? "scale(1.2)" : "scale(1)",
          transition: "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease",
          opacity: active ? 0.9 : 0.6,
          animation: active ? "summerPulse 2s infinite ease-in-out" : "none",
        }}
      />

      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          position: "relative",
          zIndex: 1,
          filter: "drop-shadow(0 2px 6px rgba(79, 70, 229, 0.25))",
        }}
      >
        <defs>
          <linearGradient id="summerGradPrimary" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>

          <linearGradient id="summerGradIris" x1="12" y1="8" x2="36" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="40%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>

          <linearGradient id="summerGradCore" x1="20" y1="20" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#c7d2fe" />
          </linearGradient>

          <linearGradient id="summerRingGrad" x1="6" y1="24" x2="42" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.8" />
          </linearGradient>
        </defs>

        {/* Outer Orbit Ring */}
        <circle
          cx="24"
          cy="24"
          r="20"
          stroke="url(#summerRingGrad)"
          strokeWidth="1.5"
          strokeDasharray="4 2"
          opacity="0.6"
        />

        {/* Four-Point Radiant Star Crystal */}
        <path
          d="M24 4C24 15 33 24 44 24C33 24 24 33 24 44C24 33 15 24 4 24C15 24 24 15 24 4Z"
          fill="url(#summerGradPrimary)"
        />

        {/* Inner Facet / Diamond Overlay with soft blend */}
        <path
          d="M24 11C24 18 30 24 37 24C30 24 24 30 24 37C24 30 18 24 11 24C18 24 24 18 24 11Z"
          fill="url(#summerGradIris)"
          opacity="0.85"
        />

        {/* Luminous Central Spark / Core */}
        <circle cx="24" cy="24" r="4.5" fill="url(#summerGradCore)" />
        <circle cx="24" cy="24" r="2" fill="#ffffff" />

        {/* Satellite Energy Sparkles */}
        <circle cx="34" cy="14" r="1.5" fill="#38bdf8" opacity="0.9" />
        <circle cx="14" cy="34" r="1.5" fill="#a855f7" opacity="0.9" />
      </svg>
    </div>
  );
}
