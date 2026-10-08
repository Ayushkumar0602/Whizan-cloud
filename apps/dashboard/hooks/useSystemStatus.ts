"use client";

import { useState, useEffect, useCallback } from "react";
import { system, type SystemStatusResponse } from "@/lib/api";

export function useSystemStatus(pollIntervalMs = 25_000) {
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await system.getStatus();
      setStatus(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to reach system status API");
      // If network fetch fails, assume offline
      setStatus((prev) =>
        prev
          ? { ...prev, vmOnline: false }
          : {
              vmOnline: false,
              status: "MAINTENANCE",
              message:
                "The administration has temporarily stopped new deployments and serving active applications until further notice.",
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
    if (pollIntervalMs > 0) {
      const timer = setInterval(fetchStatus, pollIntervalMs);
      return () => clearInterval(timer);
    }
  }, [fetchStatus, pollIntervalMs]);

  return {
    vmOnline: status?.vmOnline ?? false,
    status: status?.status ?? "MAINTENANCE",
    message: status?.message ?? "",
    contactEmail: status?.contactEmail ?? "ayushkumarjais0602@gmail.com",
    contactUrl: status?.contactUrl ?? "/dashboard/contact",
    vmHost: status?.vmHost,
    loading,
    error,
    refresh: fetchStatus,
  };
}
