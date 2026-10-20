"use client";

import { useState, useEffect, useCallback } from "react";
import { system, type SystemStatusResponse } from "@/lib/api";

export function useSystemStatus(pollIntervalMs = 20_000) {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await system.getStatus({ bypassCache: true });
      setStatus(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to reach system status API");
      setStatus((prev) =>
        prev
          ? { ...prev, vmOnline: false }
          : {
              vmOnline: false,
              status: "OFFLINE",
              message:
                "Cloud compute node is in auto-hibernation to eliminate idle hosting costs ($0.00/hr). Wakes on demand.",
              contactEmail: "ayushkumarjais0602@gmail.com",
              contactUrl: "/dashboard/contact",
              timestamp: Date.now(),
            }
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Fast polling if currently waking up, else normal interval
    const interval = status?.status === "WAKING_UP" ? 3000 : pollIntervalMs;
    if (interval > 0) {
      const timer = setInterval(fetchStatus, interval);
      return () => clearInterval(timer);
    }
  }, [fetchStatus, pollIntervalMs, status?.status]);

  return {
    vmOnline: status?.vmOnline ?? false,
    status: status?.status ?? "OFFLINE",
    isWakingUp: status?.status === "WAKING_UP",
    estimatedSecondsRemaining: status?.estimatedSecondsRemaining ?? 55,
    message: status?.message ?? "",
    contactEmail: status?.contactEmail ?? "ayushkumarjais0602@gmail.com",
    contactUrl: status?.contactUrl ?? "/dashboard/contact",
    vmHost: status?.vmHost,
    loading,
    error,
    refresh: fetchStatus,
  };
}
