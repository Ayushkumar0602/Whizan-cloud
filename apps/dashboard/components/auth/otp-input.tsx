"use client";

import React, { useRef, useState, useEffect } from "react";

interface SingleInputOtpProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  error?: boolean;
  id?: string;
}

/**
 * Mobile-friendly single-input 6-digit OTP Component.
 * Uses a single underlying input covering the visual character boxes to guarantee:
 * - Mobile keyboard NEVER dismisses or flickers while typing
 * - Stable focus with ZERO unmounting or focus-stealing
 * - Native iOS/Android SMS/Email OTP autofill (autoComplete="one-time-code")
 * - Native paste, backspace, and arrow keys
 * - No font-size zoom on iOS Safari (font-size >= 16px)
 */
export function SingleInputOtp({
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = false,
  error = false,
  id = "whz-otp-single-input",
}: SingleInputOtpProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Auto-focus on initial mount if requested
  useEffect(() => {
    if (autoFocus && !disabled) {
      const t = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(t);
    }
  }, [autoFocus, disabled]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Only allow numeric digits, max 6 characters
    const clean = e.target.value.replace(/\D/g, "").slice(0, 6);
    onChange(clean);

    if (clean.length === 6 && onComplete) {
      onComplete(clean);
    }
  }

  function handleBoxClick(e: React.MouseEvent) {
    e.preventDefault();
    if (disabled) return;
    inputRef.current?.focus();
  }

  // Digits array for visual rendering
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || "");

  return (
    <div
      className="whz-otp-container"
      onClick={handleBoxClick}
      style={{
        position: "relative",
        width: "100%",
        display: "flex",
        justifyContent: "space-between",
        gap: "0.5rem",
        cursor: disabled ? "not-allowed" : "text",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* 
        Single logical input overlaid directly on top of the visual boxes.
        Using opacity: 0 and font-size: 16px to prevent iOS Safari auto-zoom.
        Stays permanently mounted to prevent mobile keyboard dismissal.
      */}
      <input
        ref={inputRef}
        id={id}
        name="one-time-code"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        maxLength={6}
        value={value}
        onChange={handleInputChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        disabled={disabled}
        aria-label="6-digit verification code"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          zIndex: 10,
          fontSize: "16px", // CRITICAL for iOS Safari: avoids viewport zoom
          cursor: disabled ? "not-allowed" : "text",
          pointerEvents: disabled ? "none" : "auto",
        }}
      />

      {/* Visual digit boxes */}
      {digits.map((digit, index) => {
        const isBoxActive = isFocused && index === (value.length >= 6 ? 5 : value.length);
        const isFilled = digit.length > 0;

        return (
          <div
            key={index}
            className={`whz-otp-box ${isBoxActive ? "whz-otp-box-active" : ""} ${isFilled ? "whz-otp-box-filled" : ""} ${error ? "whz-otp-box-error" : ""}`}
            style={{
              flex: "1 1 0",
              height: "3.25rem",
              borderRadius: "10px",
              background: disabled ? "var(--bg-inset, #f3f4f6)" : "#ffffff",
              border: error
                ? "1.5px solid #ef4444"
                : isBoxActive
                ? "2px solid var(--accent, #4f46e5)"
                : isFilled
                ? "1.5px solid var(--border, #e5e7eb)"
                : "1px solid var(--border, #e5e7eb)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.35rem",
              fontWeight: 650,
              fontFamily: "var(--font-mono, monospace)",
              color: "var(--foreground, #111827)",
              boxShadow: isBoxActive
                ? "0 0 0 3px rgba(79, 70, 229, 0.12)"
                : "var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05))",
              transition: "border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease",
              position: "relative",
            }}
          >
            {digit}
            {isBoxActive && !digit && (
              <span
                className="whz-otp-cursor"
                style={{
                  display: "inline-block",
                  width: "2px",
                  height: "1.25rem",
                  backgroundColor: "var(--accent, #4f46e5)",
                  animation: "whzBlink 1s infinite",
                  borderRadius: "1px",
                }}
              />
            )}
          </div>
        );
      })}

      <style jsx>{`
        @keyframes whzBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
