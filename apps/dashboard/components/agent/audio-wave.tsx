"use client";

import React, { useEffect, useRef } from "react";

interface AudioWaveProps {
  isSpeaking: boolean;
  className?: string;
}

export function AudioWave({ isSpeaking, className = "" }: AudioWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let phase = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const numBars = 12;
      const barWidth = 2.5;
      const gap = 3;
      const totalWidth = numBars * (barWidth + gap);
      const startX = (canvas.width - totalWidth) / 2;
      const centerY = canvas.height / 2;

      phase += 0.09;

      for (let i = 0; i < numBars; i++) {
        const x = startX + i * (barWidth + gap);
        let height = 3;

        if (isSpeaking) {
          // Organic speech oscillation
          const wave = Math.sin(phase + i * 0.5) * Math.cos(phase * 0.8 + i * 0.25);
          height = Math.max(3, Math.abs(wave) * (canvas.height * 0.8));
        }

        const y = centerY - height / 2;

        // Elegant Indigo-to-Cyan Accent Palette
        if (isSpeaking) {
          const gradient = ctx.createLinearGradient(0, y, 0, y + height);
          gradient.addColorStop(0, "#4f46e5");
          gradient.addColorStop(0.6, "#0284c7");
          gradient.addColorStop(1, "#06b6d4");
          ctx.fillStyle = gradient;
        } else {
          ctx.fillStyle = "#cbd5e1";
        }

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, height, 1.5);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isSpeaking]);

  return (
    <canvas
      ref={canvasRef}
      width={72}
      height={22}
      className={`audio-wave-canvas ${className}`}
      style={{
        display: "block",
        opacity: isSpeaking ? 1 : 0.5,
        transition: "opacity 0.25s ease",
      }}
    />
  );
}
