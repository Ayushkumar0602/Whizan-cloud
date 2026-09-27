"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { services, type ContainerMetricPoint, type ServiceMetricsResponse } from "@/lib/api";
import {
  Cpu,
  Activity,
  HardDrive,
  Network,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Play,
  Pause,
  AlertCircle,
  CheckCircle2,
  Server,
  Zap,
  Moon,
} from "lucide-react";
import { toast } from "sonner";
import { getServiceIngressUrl } from "@/lib/domains";

interface ServiceMetricsProps {
  serviceId: string;
  slug: string;
  isPublic?: boolean;
  autoSleep?: boolean;
  instanceType?: string;
  cpuLimit?: number;
  memoryLimit?: number;
}

export function ServiceMetrics({
  serviceId,
  slug,
  isPublic,
  autoSleep,
  instanceType,
  cpuLimit,
  memoryLimit,
}: ServiceMetricsProps) {
  const effectiveCpuLimit = autoSleep ? 0.1 : (cpuLimit || 0.5);
  const effectiveMemoryLimit = autoSleep ? 512 : (memoryLimit || 512);

  const [metrics, setMetrics] = useState<ContainerMetricPoint[]>([]);
  const [current, setCurrent] = useState<ContainerMetricPoint | null>(null);
  const [containerName, setContainerName] = useState<string | null>(null);
  const [status, setStatus] = useState<"running" | "sleeping" | "stopped" | "error">("running");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [wakingUp, setWakingUp] = useState(false);

  // Time window: 30 points (approx 5 mins), 60 points (15 mins), all
  const [timeWindow, setTimeWindow] = useState<"5m" | "15m">("15m");

  const eventSourceRef = useRef<EventSource | null>(null);

  // Initial Snapshot Load
  const fetchSnapshot = async () => {
    try {
      const res: ServiceMetricsResponse = await services.getMetrics(serviceId);
      setStatus(res.status);
      setContainerName(res.container);
      if (res.history && res.history.length > 0) {
        setMetrics(res.history);
      }
      if (res.current) {
        setCurrent(res.current);
      }
    } catch (err: any) {
      console.error("Failed to load initial metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshot();
  }, [serviceId]);

  // Real-Time SSE Stream
  useEffect(() => {
    if (!isLive) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    const es = services.streamMetrics(serviceId);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "init") {
          if (payload.history && Array.isArray(payload.history) && payload.history.length > 0) {
            setMetrics(payload.history);
          }
          if (payload.current) {
            setCurrent(payload.current);
          }
          setLoading(false);
        } else if (payload.type === "tick") {
          if (payload.container) setContainerName(payload.container);
          setStatus(payload.status || "running");
          setStatusMessage(null);
          if (payload.metric) {
            setCurrent(payload.metric);
            setMetrics((prev) => {
              const updated = [...prev, payload.metric];
              // Keep maximum last 60 points in memory
              return updated.length > 60 ? updated.slice(updated.length - 60) : updated;
            });
          }
        } else if (payload.type === "status") {
          setStatus(payload.status);
          setStatusMessage(payload.message || null);
        }
      } catch (err) {
        console.error("Failed to parse SSE metrics:", err);
      }
    };

    es.onerror = () => {
      // EventSource automatically retries connection
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [serviceId, isLive]);

  // Filtered metrics based on selected time window
  const activeMetrics = useMemo(() => {
    const limit = timeWindow === "5m" ? 20 : 60;
    return metrics.slice(-limit);
  }, [metrics, timeWindow]);

  // Aggregate stats
  const stats = useMemo(() => {
    if (activeMetrics.length === 0) {
      return {
        cpuPeak: 0,
        cpuAvg: 0,
        memPeak: 0,
        memAvg: 0,
        maxRxRate: 0,
        maxTxRate: 0,
      };
    }
    const cpuVals = activeMetrics.map((m) => m.cpuPercent);
    const memVals = activeMetrics.map((m) => m.memUsageMB);
    const rxRates = activeMetrics.map((m) => m.rxRateKbps);
    const txRates = activeMetrics.map((m) => m.txRateKbps);

    const cpuPeak = Math.max(...cpuVals);
    const cpuAvg = cpuVals.reduce((a, b) => a + b, 0) / cpuVals.length;
    const memPeak = Math.max(...memVals);
    const memAvg = memVals.reduce((a, b) => a + b, 0) / memVals.length;
    const maxRxRate = Math.max(...rxRates);
    const maxTxRate = Math.max(...txRates);

    return {
      cpuPeak: Number(cpuPeak.toFixed(1)),
      cpuAvg: Number(cpuAvg.toFixed(1)),
      memPeak: Number(memPeak.toFixed(1)),
      memAvg: Number(memAvg.toFixed(1)),
      maxRxRate: Number(maxRxRate.toFixed(1)),
      maxTxRate: Number(maxTxRate.toFixed(1)),
    };
  }, [activeMetrics]);

  // Trigger wake up request for sleeping container
  const handleWakeUp = async () => {
    setWakingUp(true);
    try {
      const url = `${getServiceIngressUrl(slug)}/`;
      await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => {});
      toast.success("Wakeup signal sent. Container starting...");
      setTimeout(fetchSnapshot, 2000);
    } catch {
      toast.error("Failed to send wakeup ping");
    } finally {
      setWakingUp(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* ─── Header & Live Controls ────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          padding: "1rem 1.25rem",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: "rgba(56, 189, 248, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#38bdf8",
            }}
          >
            <Activity size={20} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: 0, color: "var(--foreground)" }}>
                Container Resource Telemetry
              </h2>
              {status === "running" ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.15rem 0.55rem",
                    borderRadius: "100px",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    background: "rgba(16, 185, 129, 0.12)",
                    color: "#10b981",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      backgroundColor: "#10b981",
                      boxShadow: "0 0 8px #10b981",
                    }}
                  />
                  RUNNING
                </span>
              ) : status === "sleeping" ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.15rem 0.55rem",
                    borderRadius: "100px",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    background: "rgba(245, 158, 11, 0.12)",
                    color: "#f59e0b",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                  }}
                >
                  <Moon size={11} />
                  SLEEPING (Scale-to-Zero)
                </span>
              ) : (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.15rem 0.55rem",
                    borderRadius: "100px",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    background: "rgba(239, 68, 68, 0.12)",
                    color: "#ef4444",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                  }}
                >
                  STOPPED
                </span>
              )}
            </div>
            <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0.2rem 0 0 0", fontFamily: "monospace" }}>
              {containerName ? containerName : `service-${slug}`} &bull; {effectiveCpuLimit} vCPU &bull; {effectiveMemoryLimit}MB RAM {autoSleep ? "(Free Tier / Spin Down)" : `(${instanceType || "Dedicated Always-On"})`}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {/* Time range selector */}
          <div
            style={{
              display: "flex",
              background: "var(--bg-inset)",
              borderRadius: "6px",
              padding: "2px",
              border: "1px solid var(--border)",
            }}
          >
            <button
              onClick={() => setTimeWindow("5m")}
              style={{
                border: "none",
                background: timeWindow === "5m" ? "var(--card-bg)" : "transparent",
                color: timeWindow === "5m" ? "var(--foreground)" : "var(--muted)",
                fontSize: "0.75rem",
                padding: "0.25rem 0.6rem",
                borderRadius: "4px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: timeWindow === "5m" ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
              }}
            >
              5m
            </button>
            <button
              onClick={() => setTimeWindow("15m")}
              style={{
                border: "none",
                background: timeWindow === "15m" ? "var(--card-bg)" : "transparent",
                color: timeWindow === "15m" ? "var(--foreground)" : "var(--muted)",
                fontSize: "0.75rem",
                padding: "0.25rem 0.6rem",
                borderRadius: "4px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: timeWindow === "15m" ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
              }}
            >
              15m
            </button>
          </div>

          {/* Pause / Resume Live Stream */}
          <button
            onClick={() => setIsLive(!isLive)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.35rem 0.75rem",
              fontSize: "0.78rem",
              fontWeight: 500,
              background: isLive ? "rgba(16, 185, 129, 0.1)" : "var(--bg-inset)",
              color: isLive ? "#10b981" : "var(--muted)",
              border: isLive ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid var(--border)",
              borderRadius: "6px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {isLive ? (
              <>
                <Pause size={13} />
                <span>Live Stream</span>
              </>
            ) : (
              <>
                <Play size={13} />
                <span>Paused</span>
              </>
            )}
          </button>

          {/* Refresh Snapshot */}
          <button
            onClick={fetchSnapshot}
            disabled={loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              background: "var(--bg-inset)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              color: "var(--foreground)",
              cursor: "pointer",
            }}
            title="Refresh snapshot"
          >
            <RefreshCw size={14} className={loading ? "spin-icon" : ""} />
          </button>
        </div>
      </div>

      {/* Sleeping Container Notice */}
      {status === "sleeping" && (
        <div
          style={{
            padding: "1rem 1.25rem",
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Moon size={20} color="#f59e0b" />
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "#f59e0b" }}>
                Service Container is Currently Sleeping
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.15rem" }}>
                Auto-Sleep suspended this container after inactivity. It will cold-boot automatically on the next request.
              </div>
            </div>
          </div>
          <button
            onClick={handleWakeUp}
            disabled={wakingUp}
            className="btn btn-secondary"
            style={{ fontSize: "0.8rem", padding: "0.4rem 0.9rem" }}
          >
            <Zap size={14} className="text-warning" />
            {wakingUp ? "Waking up..." : "Wake Up Container"}
          </button>
        </div>
      )}

      {/* ─── Metric Cards Grid ────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1rem",
        }}
      >
        {/* 1. CPU Usage Card */}
        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "10px",
            padding: "1.2rem",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              CPU Utilization
            </span>
            <span
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                background: "rgba(16, 185, 129, 0.12)",
                color: "#10b981",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Cpu size={16} />
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "1.85rem", fontWeight: 700, color: "var(--foreground)", fontFamily: "monospace" }}>
              {current?.cpuPercent ?? 0}%
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>of {effectiveCpuLimit} vCPU</span>
          </div>

          {/* Progress Bar */}
          <div
            style={{
              height: "6px",
              background: "var(--bg-inset)",
              borderRadius: "3px",
              overflow: "hidden",
              marginBottom: "0.75rem",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, current?.cpuPercent ?? 0)}%`,
                background: (current?.cpuPercent ?? 0) > 80 ? "#ef4444" : (current?.cpuPercent ?? 0) > 50 ? "#f59e0b" : "#10b981",
                transition: "width 0.4s ease, background 0.3s ease",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--muted)" }}>
            <span>Peak: {stats.cpuPeak}%</span>
            <span>Avg: {stats.cpuAvg}%</span>
            <span>Cap: {effectiveCpuLimit} vCPU</span>
          </div>
        </div>

        {/* 2. RAM Memory Card */}
        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "10px",
            padding: "1.2rem",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Memory (RAM)
            </span>
            <span
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                background: "rgba(56, 189, 248, 0.12)",
                color: "#38bdf8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <HardDrive size={16} />
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "1.85rem", fontWeight: 700, color: "var(--foreground)", fontFamily: "monospace" }}>
              {current?.memUsageMB ?? 0}
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>/ {effectiveMemoryLimit} MB</span>
            <span style={{ fontSize: "0.75rem", color: "var(--muted)", marginLeft: "auto" }}>
              ({(((current?.memUsageMB ?? 0) / effectiveMemoryLimit) * 100).toFixed(1)}%)
            </span>
          </div>

          {/* Progress Bar */}
          <div
            style={{
              height: "6px",
              background: "var(--bg-inset)",
              borderRadius: "3px",
              overflow: "hidden",
              marginBottom: "0.75rem",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, (((current?.memUsageMB ?? 0) / effectiveMemoryLimit) * 100))}%`,
                background: (current?.memPercent ?? 0) > 85 ? "#ef4444" : (current?.memPercent ?? 0) > 65 ? "#f59e0b" : "#38bdf8",
                transition: "width 0.4s ease, background 0.3s ease",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--muted)" }}>
            <span>Peak: {stats.memPeak} MB</span>
            <span>Avg: {stats.memAvg} MB</span>
            <span>Limit: {effectiveMemoryLimit} MB</span>
          </div>
        </div>

        {/* 3. Network I/O Throughput Card */}
        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "10px",
            padding: "1.2rem",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Network I/O
            </span>
            <span
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                background: "rgba(168, 85, 247, 0.12)",
                color: "#a855f7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Network size={16} />
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1.2rem", marginBottom: "0.75rem" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "#38bdf8", display: "flex", alignItems: "center", gap: "0.2rem" }}>
                <ArrowDownLeft size={12} /> Ingress (Rx)
              </div>
              <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--foreground)", fontFamily: "monospace" }}>
                {current?.rxRateKbps ?? 0} <span style={{ fontSize: "0.75rem", fontWeight: 400 }}>KB/s</span>
              </div>
            </div>

            <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: "1.2rem" }}>
              <div style={{ fontSize: "0.72rem", color: "#a855f7", display: "flex", alignItems: "center", gap: "0.2rem" }}>
                <ArrowUpRight size={12} /> Egress (Tx)
              </div>
              <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--foreground)", fontFamily: "monospace" }}>
                {current?.txRateKbps ?? 0} <span style={{ fontSize: "0.75rem", fontWeight: 400 }}>KB/s</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--muted)", paddingTop: "0.25rem", borderTop: "1px solid var(--border)" }}>
            <span>Total Rx: {((current?.rxBytes ?? 0) / 1024 / 1024).toFixed(1)} MB</span>
            <span>Total Tx: {((current?.txBytes ?? 0) / 1024 / 1024).toFixed(1)} MB</span>
          </div>
        </div>

        {/* 4. Process & Sandbox Card */}
        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "10px",
            padding: "1.2rem",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Process Sandbox
            </span>
            <span
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                background: "rgba(59, 130, 246, 0.12)",
                color: "#3b82f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Server size={16} />
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "1.85rem", fontWeight: 700, color: "var(--foreground)", fontFamily: "monospace" }}>
              {current?.pids ?? 0}
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>/ {current?.pidsLimit ?? 128} PIDs</span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: "0.7rem",
                fontWeight: 600,
                color: "#10b981",
                background: "rgba(16, 185, 129, 0.1)",
                padding: "0.15rem 0.5rem",
                borderRadius: "4px",
              }}
            >
              Protected
            </span>
          </div>

          <div
            style={{
              height: "6px",
              background: "var(--bg-inset)",
              borderRadius: "3px",
              overflow: "hidden",
              marginBottom: "0.75rem",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, ((current?.pids ?? 0) / (current?.pidsLimit ?? 128)) * 100)}%`,
                background: "#3b82f6",
                transition: "width 0.4s ease",
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--muted)" }}>
            <span>Fork Bomb Cap: 128</span>
            <span>Security: CapDrop Active</span>
          </div>
        </div>
      </div>

      {/* ─── Real-Time Line Charts ────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          gap: "1.25rem",
        }}
      >
        {/* Chart 1: CPU Utilization History */}
        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "10px",
            padding: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, color: "var(--foreground)" }}>
                CPU Utilization History
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "0.2rem 0 0 0" }}>
                Real-time usage (% of 1 vCPU allocation)
              </p>
            </div>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#10b981", fontFamily: "monospace" }}>
              {current?.cpuPercent ?? 0}%
            </div>
          </div>

          <MetricAreaChart
            data={activeMetrics.map((m) => m.cpuPercent)}
            timestamps={activeMetrics.map((m) => m.timestamp)}
            color="#10b981"
            fillGradientId="cpuGradient"
            unit="%"
            maxValue={100}
          />
        </div>

        {/* Chart 2: Memory (RAM) History */}
        <div
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "10px",
            padding: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, color: "var(--foreground)" }}>
                Memory Usage History
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "0.2rem 0 0 0" }}>
                True resident set size (MB used of 512MB limit)
              </p>
            </div>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#38bdf8", fontFamily: "monospace" }}>
              {current?.memUsageMB ?? 0} MB
            </div>
          </div>

          <MetricAreaChart
            data={activeMetrics.map((m) => m.memUsageMB)}
            timestamps={activeMetrics.map((m) => m.timestamp)}
            color="#38bdf8"
            fillGradientId="memGradient"
            unit=" MB"
            maxValue={current?.memLimitMB ?? 512}
          />
        </div>
      </div>

      {/* Chart 3: Network Throughput Dual Line Chart */}
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "10px",
          padding: "1.25rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0, color: "var(--foreground)" }}>
              Network Transfer Throughput
            </h3>
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "0.2rem 0 0 0" }}>
              Live packet ingress (Rx) vs egress (Tx) bandwidth in KB/s
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", color: "#38bdf8", fontWeight: 500 }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#38bdf8" }} />
              Ingress: {current?.rxRateKbps ?? 0} KB/s
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", color: "#a855f7", fontWeight: 500 }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#a855f7" }} />
              Egress: {current?.txRateKbps ?? 0} KB/s
            </span>
          </div>
        </div>

        <NetworkDualLineChart
          rxData={activeMetrics.map((m) => m.rxRateKbps)}
          txData={activeMetrics.map((m) => m.txRateKbps)}
          timestamps={activeMetrics.map((m) => m.timestamp)}
        />
      </div>
    </div>
  );
}

// ─── Native SVG Area Chart Component ─────────────────────────────────────────

interface MetricAreaChartProps {
  data: number[];
  timestamps: string[];
  color: string;
  fillGradientId: string;
  unit: string;
  maxValue?: number;
}

function MetricAreaChart({ data, timestamps, color, fillGradientId, unit, maxValue }: MetricAreaChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 600;
  const height = 180;
  const padding = { top: 15, right: 15, bottom: 25, left: 35 };

  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const points = useMemo(() => {
    if (data.length === 0) return [];
    const max = maxValue ?? Math.max(10, ...data);
    const step = plotW / Math.max(1, data.length - 1);

    return data.map((val, idx) => {
      const x = padding.left + idx * step;
      const normalized = Math.min(1, Math.max(0, val / max));
      const y = padding.top + plotH - normalized * plotH;
      return { x, y, val, timestamp: timestamps[idx] || "" };
    });
  }, [data, timestamps, plotW, plotH, padding, maxValue]);

  const pathD = useMemo(() => {
    if (points.length < 2) return "";
    return points.reduce((acc, p, idx) => `${acc} ${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, "");
  }, [points]);

  const areaD = useMemo(() => {
    if (points.length < 2) return "";
    const bottomY = padding.top + plotH;
    const firstX = points[0].x.toFixed(1);
    const lastX = points[points.length - 1].x.toFixed(1);
    return `${pathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [points, pathD, padding, plotH]);

  const maxVal = maxValue ?? Math.max(10, ...data);

  return (
    <div style={{ position: "relative", width: "100%", height: `${height}px` }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "100%", overflow: "visible" }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + plotH * (1 - ratio);
          const labelVal = Math.round(ratio * maxVal);
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="var(--border)"
                strokeDasharray="3 3"
                strokeOpacity="0.6"
              />
              <text
                x={padding.left - 6}
                y={y + 3}
                fill="var(--muted)"
                fontSize="9"
                textAnchor="end"
                fontFamily="monospace"
              >
                {labelVal}
              </text>
            </g>
          );
        })}

        {/* Filled Area */}
        {areaD && <path d={areaD} fill={`url(#${fillGradientId})`} />}

        {/* Line Stroke */}
        {pathD && <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}

        {/* Hover Points & Interactive Trigger */}
        {points.map((p, idx) => (
          <circle
            key={idx}
            cx={p.x}
            cy={p.y}
            r={hoverIndex === idx ? 4.5 : 2}
            fill={hoverIndex === idx ? "#ffffff" : color}
            stroke={color}
            strokeWidth={hoverIndex === idx ? 2 : 0}
            style={{ transition: "r 0.15s ease", cursor: "crosshair" }}
            onMouseEnter={() => setHoverIndex(idx)}
          />
        ))}

        {/* Hover vertical crosshair */}
        {hoverIndex !== null && points[hoverIndex] && (
          <line
            x1={points[hoverIndex].x}
            y1={padding.top}
            x2={points[hoverIndex].x}
            y2={padding.top + plotH}
            stroke="var(--foreground)"
            strokeWidth="1"
            strokeDasharray="2 2"
            opacity="0.5"
          />
        )}
      </svg>

      {/* Floating Tooltip */}
      {hoverIndex !== null && points[hoverIndex] && (
        <div
          style={{
            position: "absolute",
            left: `${(points[hoverIndex].x / width) * 100}%`,
            top: `${(points[hoverIndex].y / height) * 100}%`,
            transform: "translate(-50%, -120%)",
            background: "#0b1016",
            border: `1px solid ${color}`,
            borderRadius: "6px",
            padding: "0.3rem 0.55rem",
            fontSize: "0.72rem",
            fontFamily: "monospace",
            color: "#ffffff",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 700, color }}>
            {points[hoverIndex].val}
            {unit}
          </div>
          <div style={{ color: "var(--muted)", fontSize: "0.65rem" }}>
            {points[hoverIndex].timestamp ? new Date(points[hoverIndex].timestamp).toLocaleTimeString() : ""}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dual Line Network Chart Component ───────────────────────────────────────

interface NetworkDualLineChartProps {
  rxData: number[];
  txData: number[];
  timestamps: string[];
}

function NetworkDualLineChart({ rxData, txData, timestamps }: NetworkDualLineChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 600;
  const height = 180;
  const padding = { top: 15, right: 15, bottom: 25, left: 35 };

  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const maxVal = useMemo(() => {
    const all = [...rxData, ...txData];
    return Math.max(10, Math.ceil(Math.max(0, ...all) * 1.2));
  }, [rxData, txData]);

  const step = plotW / Math.max(1, rxData.length - 1);

  const rxPoints = rxData.map((val, idx) => ({
    x: padding.left + idx * step,
    y: padding.top + plotH - (Math.min(maxVal, Math.max(0, val)) / maxVal) * plotH,
    val,
  }));

  const txPoints = txData.map((val, idx) => ({
    x: padding.left + idx * step,
    y: padding.top + plotH - (Math.min(maxVal, Math.max(0, val)) / maxVal) * plotH,
    val,
  }));

  const rxPath = rxPoints.reduce((acc, p, idx) => `${acc} ${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, "");
  const txPath = txPoints.reduce((acc, p, idx) => `${acc} ${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, "");

  return (
    <div style={{ position: "relative", width: "100%", height: `${height}px` }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "100%", overflow: "visible" }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Horizontal gridlines */}
        {[0, 0.33, 0.66, 1].map((ratio) => {
          const y = padding.top + plotH * (1 - ratio);
          const labelVal = Math.round(ratio * maxVal);
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="var(--border)"
                strokeDasharray="3 3"
                strokeOpacity="0.6"
              />
              <text
                x={padding.left - 6}
                y={y + 3}
                fill="var(--muted)"
                fontSize="9"
                textAnchor="end"
                fontFamily="monospace"
              >
                {labelVal}
              </text>
            </g>
          );
        })}

        {/* Rx Line (Cyan) */}
        {rxPath && <path d={rxPath} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}

        {/* Tx Line (Purple) */}
        {txPath && <path d={txPath} fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}

        {/* Hover Points */}
        {rxPoints.map((p, idx) => (
          <circle
            key={`rx-${idx}`}
            cx={p.x}
            cy={p.y}
            r={hoverIndex === idx ? 4 : 2}
            fill="#38bdf8"
            onMouseEnter={() => setHoverIndex(idx)}
            style={{ cursor: "crosshair" }}
          />
        ))}

        {txPoints.map((p, idx) => (
          <circle
            key={`tx-${idx}`}
            cx={p.x}
            cy={p.y}
            r={hoverIndex === idx ? 4 : 2}
            fill="#a855f7"
            onMouseEnter={() => setHoverIndex(idx)}
            style={{ cursor: "crosshair" }}
          />
        ))}

        {/* Crosshair */}
        {hoverIndex !== null && rxPoints[hoverIndex] && (
          <line
            x1={rxPoints[hoverIndex].x}
            y1={padding.top}
            x2={rxPoints[hoverIndex].x}
            y2={padding.top + plotH}
            stroke="var(--foreground)"
            strokeWidth="1"
            strokeDasharray="2 2"
            opacity="0.5"
          />
        )}
      </svg>

      {/* Tooltip */}
      {hoverIndex !== null && rxPoints[hoverIndex] && txPoints[hoverIndex] && (
        <div
          style={{
            position: "absolute",
            left: `${(rxPoints[hoverIndex].x / width) * 100}%`,
            top: "20%",
            transform: "translateX(-50%)",
            background: "#0b1016",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "0.4rem 0.65rem",
            fontSize: "0.72rem",
            fontFamily: "monospace",
            color: "#ffffff",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
            zIndex: 10,
          }}
        >
          <div style={{ color: "#38bdf8", fontWeight: 600 }}>Rx Ingress: {rxPoints[hoverIndex].val} KB/s</div>
          <div style={{ color: "#a855f7", fontWeight: 600 }}>Tx Egress: {txPoints[hoverIndex].val} KB/s</div>
          <div style={{ color: "var(--muted)", fontSize: "0.65rem", marginTop: "0.2rem" }}>
            {timestamps[hoverIndex] ? new Date(timestamps[hoverIndex]).toLocaleTimeString() : ""}
          </div>
        </div>
      )}
    </div>
  );
}
