"use client";

import React from "react";
import { Sun, Moon, Laptop } from "lucide-react";
import { useTheme, type ThemePreference } from "@/lib/theme";

interface ThemeToggleProps {
  variant?: "button" | "icon" | "segmented";
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function ThemeToggle({
  variant = "button",
  className = "",
  size = "md",
}: ThemeToggleProps) {
  const { theme, themePreference, setTheme, toggleTheme } = useTheme();

  // 1. Icon-only button (Header, Mobile Header, Collapsed Rail)
  if (variant === "icon") {
    const isDark = theme === "dark";
    const nextThemeLabel = isDark ? "light" : "dark";

    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`theme-icon-btn ${className}`}
        aria-label={`Switch to ${nextThemeLabel} mode`}
        title={`Switch to ${nextThemeLabel} mode`}
      >
        <span className="theme-icon-slot">
          {isDark ? <Sun size={size === "sm" ? 14 : 16} /> : <Moon size={size === "sm" ? 14 : 16} />}
        </span>
      </button>
    );
  }

  // 2. Segmented options (Settings Page)
  if (variant === "segmented") {
    const options: Array<{ value: ThemePreference; label: string; icon: React.ReactNode; desc: string }> = [
      {
        value: "light",
        label: "Light Mode",
        icon: <Sun size={18} className="theme-opt-icon text-amber-500" />,
        desc: "High-contrast, crisp architectural white theme (Default)",
      },
      {
        value: "dark",
        label: "Dark Mode",
        icon: <Moon size={18} className="theme-opt-icon text-indigo-400" />,
        desc: "Refined neutral charcoal theme engineered for extended focus",
      },
      {
        value: "system",
        label: "System Sync",
        icon: <Laptop size={18} className="theme-opt-icon text-sky-400" />,
        desc: "Automatically adapts to your operating system's theme",
      },
    ];

    return (
      <div className={`theme-segmented-cards ${className}`}>
        {options.map((opt) => {
          const isSelected = themePreference === opt.value;
          return (
            <div
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`theme-selection-card ${isSelected ? "theme-selection-card-active" : ""}`}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setTheme(opt.value);
                }
              }}
            >
              <div className="theme-card-top">
                <div className="theme-card-icon-box">{opt.icon}</div>
                <div className={`theme-radio-dot ${isSelected ? "theme-radio-dot-active" : ""}`} />
              </div>
              <div className="theme-card-title">{opt.label}</div>
              <div className="theme-card-desc">{opt.desc}</div>
            </div>
          );
        })}
      </div>
    );
  }

  // 3. Default pill button (Sidebar Bottom)
  const isDark = theme === "dark";
  const targetLabel = isDark ? "Light Mode" : "Dark Mode";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-pill-toggle ${className}`}
      aria-label={`Switch to ${targetLabel}`}
      title={`Switch to ${targetLabel}`}
    >
      <div className="theme-pill-left">
        <span className="theme-pill-icon">
          {isDark ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} className="text-indigo-600" />}
        </span>
        <span className="theme-pill-text">Theme</span>
      </div>
      <span className="theme-pill-badge">
        {isDark ? "Dark" : "Light"}
      </span>
    </button>
  );
}
