"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: ResolvedTheme;
  themePreference: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = "whizan-theme";

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") {
    return getSystemTheme();
  }
  return preference;
}

function applyThemeToDocument(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  root.setAttribute("data-theme", resolved);
  if (resolved === "dark") {
    root.classList.remove("light");
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
  }
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Default is strictly "light" mode for first-time visitors unless explicitly saved
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>("light");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [mounted, setMounted] = useState(false);

  // Initialize theme from localStorage on client mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null;
      if (saved === "dark" || saved === "light" || saved === "system") {
        setThemePreferenceState(saved);
        const resolved = resolveTheme(saved);
        setResolvedTheme(resolved);
        applyThemeToDocument(resolved);
      } else {
        // First-time users strictly default to light mode
        setThemePreferenceState("light");
        setResolvedTheme("light");
        applyThemeToDocument("light");
      }
    } catch {
      // Fallback to light
      applyThemeToDocument("light");
    } finally {
      setMounted(true);
    }
  }, []);

  // Listen for system theme changes if user explicitly chose "system"
  useEffect(() => {
    if (!mounted || themePreference !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const newResolved = mediaQuery.matches ? "dark" : "light";
      setResolvedTheme(newResolved);
      applyThemeToDocument(newResolved);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [mounted, themePreference]);

  // Sync across tabs
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue) {
        const nextPref = e.newValue as ThemePreference;
        if (nextPref === "dark" || nextPref === "light" || nextPref === "system") {
          setThemePreferenceState(nextPref);
          const resolved = resolveTheme(nextPref);
          setResolvedTheme(resolved);
          applyThemeToDocument(resolved);
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setTheme = useCallback((newPref: ThemePreference) => {
    setThemePreferenceState(newPref);
    const resolved = resolveTheme(newPref);
    setResolvedTheme(resolved);
    applyThemeToDocument(resolved);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, newPref);
      window.dispatchEvent(new Event("whizan:theme-changed"));
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    // If currently dark, switch to light; otherwise switch to dark
    const nextPref: ThemePreference = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(nextPref);
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider
      value={{
        theme: resolvedTheme,
        themePreference,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: "light",
      themePreference: "light",
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return context;
}
