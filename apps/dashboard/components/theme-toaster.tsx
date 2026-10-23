"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/lib/theme";

export function ThemeToaster() {
  const { theme } = useTheme();
  return <Toaster richColors theme={theme} position="top-right" closeButton />;
}
