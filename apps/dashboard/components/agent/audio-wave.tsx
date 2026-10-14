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

      const numBars = 16;
      const barWidth = 3;
      const gap = 3;
      const totalWidth = numBars * (barWidth + gap);
      const startX = (canvas.width - totalWidth) / 2;
      const centerY = canvas.height / 2;

      phase += 0.08;

      for (let i = 0; i < numBars; i++) {
        const x = startX + i * (barWidth + gap);
        let height = 4;

        if (isSpeaking) {
          // Dynamic wave oscillation
          const wave = Math.sin(phase + i * 0.45) * Math.cos(phase * 0.7 + i * 0.2);
          height = Math.max(4, Math.abs(wave) * (canvas.height * 0.75));
        }

        const y = centerY - height / 2;

        // Gradient color: Cyan to Purple
        const gradient = ctx.createLinearGradient(0, y, 0, y + height);
        gradient.addColorStop(0, "#00f0ff");
        gradient.addColorStop(0.5, "#a855f7");
        gradient.addColorStop(1, "#ec4899");

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, height, 2);
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
      width={110}
      height={28}
      className={`audio-wave-canvas ${className}`}
      style={{
        display: "block",
        opacity: isSpeaking ? 1 : 0.4,
        transition: "opacity 0.2s ease",
      }}
    />
  );
}
