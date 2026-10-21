"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Activity,
  Zap,
  ShieldCheck,
  ShieldAlert,
  Server,
  Cpu,
  HardDrive,
  Globe,
  Clock,
  RefreshCw,
  Search,
  Check,
  Copy,
  TrendingUp,
  BarChart2,
  Sliders,
  Layers,
  Sparkles,
  Info,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { services, type AdvancedAnalyticsData } from "@/lib/api";

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatAxisNumber(val: number): string {
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (val >= 1_000) return (val / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return Math.round(val).toString();
}

function formatTickTime(ts: number, timeframe: "1h" | "24h" | "7d" | "30d"): string {
  const d = new Date(ts);
  if (timeframe === "1h") {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (timeframe === "24h") {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// Cardinal / Catmull-Rom spline generator for smooth, continuous curves
function getSmoothSplinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return path;
}

export default function ServiceAnalyticsPage() {
  const { id } = useParams<{ id: string }>();

  const [data, setData] = useState<AdvancedAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeframe, setTimeframe] = useState<"1h" | "24h" | "7d" | "30d">("24h");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Graph Visualization Controls
  const [activeTab, setActiveTab] = useState<"throughput" | "latency" | "compute" | "waf">("throughput");
  const [renderType, setRenderType] = useState<"area" | "bars">("area");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const [searchFilter, setSearchFilter] = useState("");
  const [logFilter, setLogFilter] = useState<"all" | "errors" | "waf">("all");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [testingPing, setTestingPing] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);

  const fetchAnalytics = useCallback(
    async (tf: "1h" | "24h" | "7d" | "30d", isBackground = false) => {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);

      try {
        const res = await services.getAnalytics(id, tf);
        setData(res);
      } catch (err: any) {
        if (!isBackground) {
          toast.error("Failed to load telemetry analytics", {
            description: err.message || "Could not query edge analytics engine",
          });
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id]
  );

  useEffect(() => {
    fetchAnalytics(timeframe);
  }, [fetchAnalytics, timeframe]);

  // Auto-refresh interval (every 10s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchAnalytics(timeframe, true);
    }, 10_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAnalytics, timeframe]);

  const handleCopyCurl = (slug: string) => {
    const cmd = `curl -i https://${slug}.whizan.cloud/`;
    navigator.clipboard.writeText(cmd);
    setCopiedUrl(true);
    toast.success("Curl command copied to clipboard!");
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleSendPing = async (slug: string) => {
    setTestingPing(true);
    try {
      await fetch(`https://${slug}.whizan.cloud/`, { mode: "no-cors" });
      toast.success("Test ping dispatched to Edge Router!");
      setTimeout(() => fetchAnalytics(timeframe, true), 1500);
    } catch {
      toast.info("Test request initiated (check recent requests momentarily)");
      setTimeout(() => fetchAnalytics(timeframe, true), 2000);
    } finally {
      setTestingPing(false);
    }
  };

  // Filtered recent requests
  const filteredRequests = useMemo(() => {
    if (!data?.recentRequests) return [];
    return data.recentRequests.filter((req) => {
      if (logFilter === "errors" && req.statusCode < 400) return false;
      if (logFilter === "waf" && !req.isWafBlocked) return false;
      if (searchFilter) {
        const q = searchFilter.toLowerCase();
        return (
          req.path.toLowerCase().includes(q) ||
          req.clientIp.toLowerCase().includes(q) ||
          req.method.toLowerCase().includes(q) ||
          String(req.statusCode).includes(q)
        );
      }
      return true;
    });
  }, [data?.recentRequests, logFilter, searchFilter]);

  const kpis = data?.kpis || {
    totalRequests: 0,
    requestRatePerMin: 0,
    avgLatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    maxLatencyMs: 0,
    successRate: 100,
    errorRate: 0,
    totalBandwidthBytes: 0,
    uniqueIps: 0,
    wafMitigations: 0,
    currentCpuPercent: 0,
    currentMemoryMb: 0,
    cpuLimit: 0.1,
    memoryLimitMb: 512,
  };

  const statusBreakdown = data?.statusBreakdown || { status2xx: 0, status3xx: 0, status4xx: 0, status5xx: 0 };
  const timeSeries = data?.timeSeries || [];
  const topEndpoints = data?.topEndpoints || [];
  const methodBreakdown = data?.methodBreakdown || {};
  const computeHistory = data?.computeHistory || [];

  // Check if traffic is recent to offer intelligent zoom recommendation
  const hasRecentTrafficConcentration = useMemo(() => {
    if (timeframe === "1h" || timeSeries.length < 10) return false;
    const totalReqs = timeSeries.reduce((acc, d) => acc + d.requests, 0);
    if (totalReqs === 0) return false;
    // Check if > 80% of traffic is in the last 15% of buckets
    const tailSlice = Math.max(1, Math.floor(timeSeries.length * 0.15));
    const tailReqs = timeSeries.slice(-tailSlice).reduce((acc, d) => acc + d.requests, 0);
    return tailReqs / totalReqs > 0.8;
  }, [timeSeries, timeframe]);

  // Chart Geometry & Mathematical Scaling
  const chartWidth = 960;
  const chartHeight = 280;
  const paddingLeft = 60;
  const paddingRight = 35;
  const paddingTop = 30;
  const paddingBottom = 45;
  const usableWidth = chartWidth - paddingLeft - paddingRight;
  const usableHeight = chartHeight - paddingTop - paddingBottom;
  const yBase = chartHeight - paddingBottom;

  const pointsCount = timeSeries.length;
  const stepX = pointsCount > 1 ? usableWidth / (pointsCount - 1) : usableWidth;

  // Maximum scale bounds
  const maxReq = Math.max(...timeSeries.map((d) => d.requests), 1);
  const maxLat = Math.max(...timeSeries.map((d) => Math.max(d.maxDurationMs || 0, d.avgDurationMs || 0)), 50);
  const maxCpu = Math.max(100, ...(computeHistory.map((c) => c.cpuPercent || 0)));
  const maxMem = kpis.memoryLimitMb || 512;

  // Crosshair Mouse Tracker
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || pointsCount === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const svgX = xRatio * chartWidth;
    const rawIdx = (svgX - paddingLeft) / stepX;
    const clampedIdx = Math.max(0, Math.min(pointsCount - 1, Math.round(rawIdx)));

    setHoveredIndex(clampedIdx);
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
    setMousePos(null);
  };

  // Compute curve points for Throughput mode
  const throughputPoints = useMemo(() => {
    return timeSeries.map((d, i) => {
      const x = paddingLeft + i * stepX;
      const y = yBase - (d.requests / maxReq) * usableHeight;
      return { x, y, data: d };
    });
  }, [timeSeries, maxReq, stepX, paddingLeft, yBase, usableHeight]);

  const throughputSpline = useMemo(() => getSmoothSplinePath(throughputPoints), [throughputPoints]);
  const throughputArea = useMemo(() => {
    if (throughputPoints.length === 0) return "";
    return `${throughputSpline} L ${throughputPoints[throughputPoints.length - 1].x.toFixed(1)} ${yBase} L ${throughputPoints[0].x.toFixed(1)} ${yBase} Z`;
  }, [throughputSpline, throughputPoints, yBase]);

  // 2xx layer points
  const points2xx = useMemo(() => {
    return timeSeries.map((d, i) => {
      const x = paddingLeft + i * stepX;
      const y = yBase - (d.status2xx / maxReq) * usableHeight;
      return { x, y };
    });
  }, [timeSeries, maxReq, stepX, paddingLeft, yBase, usableHeight]);
  const spline2xx = useMemo(() => getSmoothSplinePath(points2xx), [points2xx]);
  const area2xx = useMemo(() => {
    if (points2xx.length === 0) return "";
    return `${spline2xx} L ${points2xx[points2xx.length - 1].x.toFixed(1)} ${yBase} L ${points2xx[0].x.toFixed(1)} ${yBase} Z`;
  }, [spline2xx, points2xx, yBase]);

  // 4xx layer points
  const points4xx = useMemo(() => {
    return timeSeries.map((d, i) => {
      const x = paddingLeft + i * stepX;
      const y = yBase - (d.status4xx / maxReq) * usableHeight;
      return { x, y };
    });
  }, [timeSeries, maxReq, stepX, paddingLeft, yBase, usableHeight]);
  const spline4xx = useMemo(() => getSmoothSplinePath(points4xx), [points4xx]);

  // Latency points
  const latencyPoints = useMemo(() => {
    return timeSeries.map((d, i) => {
      const x = paddingLeft + i * stepX;
      const yAvg = yBase - ((d.avgDurationMs || 0) / maxLat) * usableHeight;
      const yMax = yBase - ((d.maxDurationMs || 0) / maxLat) * usableHeight;
      return { x, yAvg, yMax, data: d };
    });
  }, [timeSeries, maxLat, stepX, paddingLeft, yBase, usableHeight]);

  const latencyAvgSpline = useMemo(
    () => getSmoothSplinePath(latencyPoints.map((p) => ({ x: p.x, y: p.yAvg }))),
    [latencyPoints]
  );
  const latencyAvgArea = useMemo(() => {
    if (latencyPoints.length === 0) return "";
    return `${latencyAvgSpline} L ${latencyPoints[latencyPoints.length - 1].x.toFixed(1)} ${yBase} L ${latencyPoints[0].x.toFixed(1)} ${yBase} Z`;
  }, [latencyAvgSpline, latencyPoints, yBase]);

  // Compute container points
  const computeStepX = computeHistory.length > 1 ? usableWidth / (computeHistory.length - 1) : usableWidth;
  const cpuPoints = useMemo(() => {
    return computeHistory.map((c, i) => {
      const x = paddingLeft + i * computeStepX;
      const y = yBase - ((c.cpuPercent || 0) / maxCpu) * usableHeight;
      return { x, y, data: c };
    });
  }, [computeHistory, maxCpu, computeStepX, paddingLeft, yBase, usableHeight]);
  const cpuSpline = useMemo(() => getSmoothSplinePath(cpuPoints), [cpuPoints]);
  const cpuArea = useMemo(() => {
    if (cpuPoints.length === 0) return "";
    return `${cpuSpline} L ${cpuPoints[cpuPoints.length - 1].x.toFixed(1)} ${yBase} L ${cpuPoints[0].x.toFixed(1)} ${yBase} Z`;
  }, [cpuSpline, cpuPoints, yBase]);

  // Equidistant X-axis tick positions
  const xTicks = useMemo(() => {
    if (pointsCount === 0) return [];
    const ticksCount = Math.min(6, pointsCount);
    const indices: number[] = [];
    for (let i = 0; i < ticksCount; i++) {
      const idx = Math.round((i / (ticksCount - 1)) * (pointsCount - 1));
      indices.push(idx);
    }
    return Array.from(new Set(indices)).map((idx) => ({
      idx,
      x: paddingLeft + idx * stepX,
      timestamp: timeSeries[idx]?.timestamp || 0,
    }));
  }, [pointsCount, stepX, paddingLeft, timeSeries]);

  if (loading && !data) {
    return (
      <div className="page" style={{ padding: "3rem 2.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "2rem" }}>
          <div className="skeleton" style={{ width: 140, height: 24, borderRadius: 6 }} />
        </div>
        <div className="skeleton" style={{ width: "35%", height: 38, marginBottom: 12, borderRadius: 8 }} />
        <div className="skeleton" style={{ width: "55%", height: 18, marginBottom: 32, borderRadius: 6 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 110, borderRadius: 12 }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: 360, borderRadius: 14, marginBottom: "2rem" }} />
      </div>
    );
  }

  const currentHoveredPoint = hoveredIndex !== null ? timeSeries[hoveredIndex] : null;

  return (
    <div className="page" style={{ padding: "2rem 2.5rem 4rem" }}>
      {/* Breadcrumb & Navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <Link href={`/dashboard/backend/${id}`} className="breadcrumb" style={{ margin: 0 }}>
          <ArrowLeft size={14} /> Back to Service Overview
        </Link>

        {/* Live Auto-Refresh Indicator & Action Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`btn-secondary${autoRefresh ? " active-refresh-btn" : ""}`}
            style={{
              fontSize: "0.78rem",
              padding: "0.4rem 0.75rem",
              borderRadius: "20px",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: autoRefresh ? "#10b981" : "#94a3b8",
                boxShadow: autoRefresh ? "0 0 8px #10b981" : "none",
                display: "inline-block",
              }}
            />
            {autoRefresh ? "Live Telemetry ON" : "Live Telemetry OFF"}
          </button>

          <button
            onClick={() => fetchAnalytics(timeframe, true)}
            disabled={refreshing}
            className="btn-secondary"
            style={{
              padding: "0.4rem 0.65rem",
              borderRadius: "8px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
            }}
            title="Refresh now"
          >
            <RefreshCw size={14} className={refreshing ? "spin-animation" : ""} />
          </button>
        </div>
      </div>

      {/* Page Header with Timeframe Pill Buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1.25rem",
          marginBottom: "1.75rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <h1 className="page-title" style={{ margin: 0, fontSize: "1.65rem", fontWeight: 700 }}>
              Telemetry & Edge Analytics
            </h1>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 650,
                padding: "0.2rem 0.55rem",
                borderRadius: "12px",
                background: "rgba(79, 70, 229, 0.08)",
                color: "var(--accent)",
                border: "1px solid rgba(79, 70, 229, 0.2)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Zero-Overhead In-Memory
            </span>
          </div>
          <p className="page-subtitle" style={{ marginTop: "0.35rem", fontSize: "0.86rem", color: "var(--muted)" }}>
            High-precision edge router telemetry, real-time HTTP throughput, latency percentiles, and container resource utilization.
          </p>
        </div>

        {/* Timeframe selector */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: "var(--bg-subtle)",
            padding: "3px",
            borderRadius: "10px",
            border: "1px solid var(--border)",
          }}
        >
          {(["1h", "24h", "7d", "30d"] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              style={{
                border: "none",
                background: timeframe === tf ? "var(--card)" : "transparent",
                color: timeframe === tf ? "var(--foreground)" : "var(--muted)",
                fontWeight: timeframe === tf ? 600 : 500,
                fontSize: "0.8rem",
                padding: "0.35rem 0.85rem",
                borderRadius: "7px",
                cursor: "pointer",
                boxShadow: timeframe === tf ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Top 5 KPI Metrics Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "1rem",
          marginBottom: "1.75rem",
        }}
      >
        {/* Card 1: Total Requests */}
        <div className="stat-card">
          <div className="stat-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <Globe size={14} className="text-accent" /> Total Requests
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: kpis.errorRate === 0 ? "var(--success)" : "var(--warning)",
                background: kpis.errorRate === 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(217, 119, 6, 0.1)",
                padding: "0.15rem 0.45rem",
                borderRadius: "4px",
              }}
            >
              {kpis.successRate}% Success
            </span>
          </div>
          <div className="stat-value" style={{ marginTop: "0.4rem", fontSize: "1.8rem" }}>
            {kpis.totalRequests.toLocaleString()}
          </div>
          <div className="stat-sub" style={{ marginTop: "0.35rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <TrendingUp size={12} color="#10b981" />
            <span>{kpis.requestRatePerMin} req/min avg rate</span>
          </div>
        </div>

        {/* Card 2: Latency Distribution */}
        <div className="stat-card">
          <div className="stat-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <Clock size={14} style={{ color: "#0284c7" }} /> Avg Latency
            </span>
            <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontWeight: 550 }}>
              Peak: {kpis.maxLatencyMs}ms
            </span>
          </div>
          <div className="stat-value" style={{ marginTop: "0.4rem", fontSize: "1.8rem" }}>
            {kpis.avgLatencyMs}{" "}
            <span style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--muted)" }}>ms</span>
          </div>
          <div className="stat-sub" style={{ marginTop: "0.35rem", color: "var(--muted)" }}>
            P95: <strong style={{ color: "var(--foreground)" }}>{kpis.p95LatencyMs}ms</strong> • P99:{" "}
            <strong style={{ color: "var(--foreground)" }}>{kpis.p99LatencyMs}ms</strong>
          </div>
        </div>

        {/* Card 3: Container Compute Utilization */}
        <div className="stat-card">
          <div className="stat-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <Cpu size={14} style={{ color: "#8b5cf6" }} /> Container Load
            </span>
            <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontWeight: 550 }}>
              Quota: {kpis.cpuLimit || 0.1} vCPU
            </span>
          </div>
          <div className="stat-value" style={{ marginTop: "0.4rem", fontSize: "1.8rem" }}>
            {kpis.currentCpuPercent}%{" "}
            <span style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--muted)" }}>CPU</span>
          </div>
          <div className="stat-sub" style={{ marginTop: "0.35rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", marginBottom: 3 }}>
              <span>RAM: {kpis.currentMemoryMb} MB</span>
              <span>{Math.round(((kpis.currentMemoryMb || 0) / (kpis.memoryLimitMb || 512)) * 100)}%</span>
            </div>
            <div style={{ width: "100%", height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.min(100, Math.round(((kpis.currentMemoryMb || 0) / (kpis.memoryLimitMb || 512)) * 100))}%`,
                  height: "100%",
                  background: "#8b5cf6",
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
        </div>

        {/* Card 4: Bandwidth & Data Egress */}
        <div className="stat-card">
          <div className="stat-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <HardDrive size={14} style={{ color: "#10b981" }} /> Data Transferred
            </span>
            <span style={{ fontSize: "0.72rem", color: "var(--success)", fontWeight: 600 }}>Edge Egress</span>
          </div>
          <div className="stat-value" style={{ marginTop: "0.4rem", fontSize: "1.8rem" }}>
            {formatBytes(kpis.totalBandwidthBytes)}
          </div>
          <div className="stat-sub" style={{ marginTop: "0.35rem", color: "var(--muted)" }}>
            From <strong style={{ color: "var(--foreground)" }}>{kpis.uniqueIps}</strong> unique client IP addresses
          </div>
        </div>

        {/* Card 5: WAF & Threat Mitigations */}
        <div className="stat-card">
          <div className="stat-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <ShieldCheck size={14} style={{ color: "#06b6d4" }} /> Threat Defense
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 650,
                color: "#0284c7",
                background: "rgba(2, 132, 199, 0.08)",
                padding: "0.15rem 0.45rem",
                borderRadius: "4px",
              }}
            >
              IP Jail Active
            </span>
          </div>
          <div className="stat-value" style={{ marginTop: "0.4rem", fontSize: "1.8rem" }}>
            {kpis.wafMitigations}{" "}
            <span style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--muted)" }}>blocked</span>
          </div>
          <div className="stat-sub" style={{ marginTop: "0.35rem", color: "var(--muted)" }}>
            DDoS, Rate Limit & WAF Shielded
          </div>
        </div>
      </div>

      {/* Adaptive Recommendation Banner when traffic is concentrated */}
      {hasRecentTrafficConcentration && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(90deg, rgba(79, 70, 229, 0.08) 0%, rgba(59, 130, 246, 0.04) 100%)",
            border: "1px solid rgba(79, 70, 229, 0.2)",
            borderRadius: "10px",
            padding: "0.75rem 1.25rem",
            marginBottom: "1.5rem",
            fontSize: "0.82rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <Sparkles size={16} color="var(--accent)" />
            <span>
              <strong>Recent Traffic Spike Detected:</strong> Over 80% of your requests occurred in the last hour.
              Switch to <strong>1H</strong> for granular 1-minute breakdown.
            </span>
          </div>
          <button
            onClick={() => setTimeframe("1h")}
            className="btn-primary"
            style={{ fontSize: "0.76rem", padding: "0.3rem 0.75rem", borderRadius: "6px", cursor: "pointer" }}
          >
            Switch to 1H View
          </button>
        </div>
      )}

      {/* Main Interactive Graph Visualizer Card */}
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.75rem", borderRadius: "14px", position: "relative" }}>
        {/* Graph Header: Visualization Tabs & View Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
            borderBottom: "1px solid var(--border)",
            paddingBottom: "1rem",
            marginBottom: "1.25rem",
          }}
        >
          {/* Multi-Graph Category Tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              onClick={() => setActiveTab("throughput")}
              style={{
                border: "none",
                background: activeTab === "throughput" ? "var(--foreground)" : "var(--bg-subtle)",
                color: activeTab === "throughput" ? "#ffffff" : "var(--muted)",
                fontSize: "0.8rem",
                fontWeight: 600,
                padding: "0.45rem 0.9rem",
                borderRadius: "8px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                transition: "all 0.15s ease",
              }}
            >
              <BarChart2 size={14} />
              Traffic Throughput
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "0.1rem 0.35rem",
                  borderRadius: "4px",
                  background: activeTab === "throughput" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.06)",
                }}
              >
                {formatAxisNumber(kpis.totalRequests)}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("latency")}
              style={{
                border: "none",
                background: activeTab === "latency" ? "var(--foreground)" : "var(--bg-subtle)",
                color: activeTab === "latency" ? "#ffffff" : "var(--muted)",
                fontSize: "0.8rem",
                fontWeight: 600,
                padding: "0.45rem 0.9rem",
                borderRadius: "8px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                transition: "all 0.15s ease",
              }}
            >
              <Zap size={14} />
              Response Latency
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "0.1rem 0.35rem",
                  borderRadius: "4px",
                  background: activeTab === "latency" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.06)",
                }}
              >
                {kpis.avgLatencyMs}ms
              </span>
            </button>

            <button
              onClick={() => setActiveTab("compute")}
              style={{
                border: "none",
                background: activeTab === "compute" ? "var(--foreground)" : "var(--bg-subtle)",
                color: activeTab === "compute" ? "#ffffff" : "var(--muted)",
                fontSize: "0.8rem",
                fontWeight: 600,
                padding: "0.45rem 0.9rem",
                borderRadius: "8px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                transition: "all 0.15s ease",
              }}
            >
              <Cpu size={14} />
              Container Compute Load
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "0.1rem 0.35rem",
                  borderRadius: "4px",
                  background: activeTab === "compute" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.06)",
                }}
              >
                {kpis.currentCpuPercent}%
              </span>
            </button>

            <button
              onClick={() => setActiveTab("waf")}
              style={{
                border: "none",
                background: activeTab === "waf" ? "var(--foreground)" : "var(--bg-subtle)",
                color: activeTab === "waf" ? "#ffffff" : "var(--muted)",
                fontSize: "0.8rem",
                fontWeight: 600,
                padding: "0.45rem 0.9rem",
                borderRadius: "8px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                transition: "all 0.15s ease",
              }}
            >
              <ShieldCheck size={14} />
              Threat Mitigations
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "0.1rem 0.35rem",
                  borderRadius: "4px",
                  background: activeTab === "waf" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.06)",
                }}
              >
                {kpis.wafMitigations}
              </span>
            </button>
          </div>

          {/* Right Controls: Render Mode (Area vs Bars) + Legend */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {activeTab === "throughput" && (
              <div
                style={{
                  display: "inline-flex",
                  background: "var(--bg-subtle)",
                  padding: "2px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                }}
              >
                <button
                  onClick={() => setRenderType("area")}
                  style={{
                    border: "none",
                    background: renderType === "area" ? "var(--card)" : "transparent",
                    color: renderType === "area" ? "var(--foreground)" : "var(--muted)",
                    fontSize: "0.75rem",
                    fontWeight: renderType === "area" ? 600 : 500,
                    padding: "0.25rem 0.65rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  Area Curve
                </button>
                <button
                  onClick={() => setRenderType("bars")}
                  style={{
                    border: "none",
                    background: renderType === "bars" ? "var(--card)" : "transparent",
                    color: renderType === "bars" ? "var(--foreground)" : "var(--muted)",
                    fontSize: "0.75rem",
                    fontWeight: renderType === "bars" ? 600 : 500,
                    padding: "0.25rem 0.65rem",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  Stacked Bars
                </button>
              </div>
            )}

            {/* Legend indicators */}
            {activeTab === "throughput" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.74rem" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} /> 2xx
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#38bdf8" }} /> 3xx
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} /> 4xx
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} /> 5xx
                </span>
              </div>
            )}
            {activeTab === "latency" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.74rem" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <span style={{ width: 12, height: 2, background: "#10b981" }} /> Avg Latency
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <span style={{ width: 12, height: 2, background: "#f59e0b", borderTop: "2px dashed #f59e0b" }} /> Peak Spike
                </span>
              </div>
            )}
            {activeTab === "compute" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.74rem" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <span style={{ width: 12, height: 2, background: "#8b5cf6" }} /> CPU Load (%)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Live Metrics Ribbon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1.5rem",
            fontSize: "0.78rem",
            color: "var(--muted)",
            marginBottom: "0.85rem",
            paddingLeft: paddingLeft,
          }}
        >
          {activeTab === "throughput" && (
            <>
              <span>
                Peak Interval: <strong style={{ color: "var(--foreground)" }}>{formatAxisNumber(maxReq)} reqs</strong>
              </span>
              <span>
                2xx Success: <strong style={{ color: "#10b981" }}>{statusBreakdown.status2xx.toLocaleString()}</strong>
              </span>
              <span>
                4xx Client: <strong style={{ color: "#f59e0b" }}>{statusBreakdown.status4xx.toLocaleString()}</strong>
              </span>
              <span>
                5xx Error: <strong style={{ color: "#ef4444" }}>{statusBreakdown.status5xx.toLocaleString()}</strong>
              </span>
            </>
          )}
          {activeTab === "latency" && (
            <>
              <span>
                Current Avg: <strong style={{ color: "#10b981" }}>{kpis.avgLatencyMs}ms</strong>
              </span>
              <span>
                P95 Percentile: <strong style={{ color: "var(--foreground)" }}>{kpis.p95LatencyMs}ms</strong>
              </span>
              <span>
                Peak Latency: <strong style={{ color: "#f59e0b" }}>{kpis.maxLatencyMs}ms</strong>
              </span>
            </>
          )}
          {activeTab === "compute" && (
            <>
              <span>
                Current CPU: <strong style={{ color: "#8b5cf6" }}>{kpis.currentCpuPercent}%</strong>
              </span>
              <span>
                RAM Usage: <strong style={{ color: "var(--foreground)" }}>{kpis.currentMemoryMb} MB</strong> / {kpis.memoryLimitMb || 512} MB
              </span>
              <span>
                Allocation Quota: <strong style={{ color: "var(--foreground)" }}>{kpis.cpuLimit || 0.1} vCPU</strong>
              </span>
            </>
          )}
        </div>

        {/* SVG Graph Visualizer Canvas */}
        <div style={{ position: "relative", width: "100%", height: chartHeight, userSelect: "none" }}>
          {timeSeries.length === 0 ? (
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--muted)",
                fontSize: "0.85rem",
              }}
            >
              <Activity size={28} style={{ opacity: 0.35, marginBottom: "0.5rem" }} />
              <span>No telemetry buckets recorded yet for this timeframe window.</span>
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              style={{ width: "100%", height: "100%", overflow: "visible" }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <defs>
                {/* Total Throughput Gradient */}
                <linearGradient id="glowThroughput" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.32" />
                  <stop offset="50%" stopColor="#4f46e5" stopOpacity="0.10" />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                </linearGradient>

                {/* 2xx Success Gradient */}
                <linearGradient id="glow2xx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>

                {/* Latency Gradient */}
                <linearGradient id="glowLatency" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0284c7" stopOpacity="0.30" />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                </linearGradient>

                {/* Compute CPU Gradient */}
                <linearGradient id="glowCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid Lines & Y-Axis Labels */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                const y = yBase - pct * usableHeight;
                let label = "";
                if (activeTab === "throughput" || activeTab === "waf") {
                  label = formatAxisNumber(pct * maxReq);
                } else if (activeTab === "latency") {
                  label = `${formatAxisNumber(pct * maxLat)}ms`;
                } else if (activeTab === "compute") {
                  label = `${Math.round(pct * maxCpu)}%`;
                }

                return (
                  <g key={idx}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={chartWidth - paddingRight}
                      y2={y}
                      stroke="var(--border)"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                      opacity={idx === 0 ? 0.9 : 0.55}
                    />
                    <text
                      x={paddingLeft - 10}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="10"
                      fontWeight="500"
                      fill="var(--muted)"
                    >
                      {label}
                    </text>
                  </g>
                );
              })}

              {/* Solid Baseline Axis */}
              <line
                x1={paddingLeft}
                y1={yBase}
                x2={chartWidth - paddingRight}
                y2={yBase}
                stroke="var(--border)"
                strokeWidth="1.5"
              />

              {/* X-Axis Time Ticks and Labels */}
              {xTicks.map((tick, i) => (
                <g key={i}>
                  <line
                    x1={tick.x}
                    y1={yBase}
                    x2={tick.x}
                    y2={yBase + 5}
                    stroke="var(--border)"
                    strokeWidth="1.5"
                  />
                  <text
                    x={tick.x}
                    y={yBase + 18}
                    textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
                    fontSize="10"
                    fill="var(--muted)"
                    fontWeight="500"
                  >
                    {formatTickTime(tick.timestamp, timeframe)}
                  </text>
                </g>
              ))}

              {/* ─────────────────────────────────────────────────────────────
                  MODE 1: THROUGHPUT (Area or Bars)
                  ───────────────────────────────────────────────────────────── */}
              {activeTab === "throughput" && renderType === "area" && (
                <g>
                  {/* Total requests smooth area */}
                  {throughputArea && <path d={throughputArea} fill="url(#glowThroughput)" />}
                  {/* 2xx success area layer */}
                  {area2xx && <path d={area2xx} fill="url(#glow2xx)" />}

                  {/* Main Throughput smooth curve */}
                  {throughputSpline && (
                    <path
                      d={throughputSpline}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  )}

                  {/* 2xx curve */}
                  {spline2xx && (
                    <path
                      d={spline2xx}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="1.8"
                      strokeDasharray="4 2"
                      opacity="0.85"
                    />
                  )}

                  {/* 4xx curve if client errors occurred */}
                  {statusBreakdown.status4xx > 0 && spline4xx && (
                    <path
                      d={spline4xx}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1.8"
                      opacity="0.9"
                    />
                  )}

                  {/* Peak Marker Points on curves with non-zero requests */}
                  {throughputPoints.map((p, i) => {
                    if (p.data.requests === 0) return null;
                    const isHovered = hoveredIndex === i;
                    return (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={isHovered ? 6 : p.data.requests > maxReq * 0.5 ? 4 : 2.5}
                        fill={isHovered ? "var(--foreground)" : "var(--accent)"}
                        stroke="#ffffff"
                        strokeWidth="2"
                        style={{ transition: "r 0.15s ease" }}
                      />
                    );
                  })}
                </g>
              )}

              {/* Stacked Bars Mode */}
              {activeTab === "throughput" && renderType === "bars" && (
                <g>
                  {timeSeries.map((d, i) => {
                    const x = paddingLeft + i * stepX;
                    const barWidth = Math.max(4, Math.min(22, stepX * 0.8));

                    const hTotal = (d.requests / maxReq) * usableHeight;
                    const h2xx = (d.status2xx / maxReq) * usableHeight;
                    const h3xx = (d.status3xx / maxReq) * usableHeight;
                    const h4xx = (d.status4xx / maxReq) * usableHeight;
                    const h5xx = (d.status5xx / maxReq) * usableHeight;

                    const y2xx = yBase - h2xx;
                    const y3xx = y2xx - h3xx;
                    const y4xx = y3xx - h4xx;
                    const y5xx = y4xx - h5xx;

                    const isHovered = hoveredIndex === i;

                    return (
                      <g key={i}>
                        {d.status2xx > 0 && (
                          <rect
                            x={x - barWidth / 2}
                            y={y2xx}
                            width={barWidth}
                            height={h2xx}
                            fill="#10b981"
                            rx={d.requests === d.status2xx ? 3 : 0}
                            opacity={isHovered ? 1 : 0.85}
                          />
                        )}
                        {d.status3xx > 0 && (
                          <rect
                            x={x - barWidth / 2}
                            y={y3xx}
                            width={barWidth}
                            height={h3xx}
                            fill="#38bdf8"
                            opacity={isHovered ? 1 : 0.85}
                          />
                        )}
                        {d.status4xx > 0 && (
                          <rect
                            x={x - barWidth / 2}
                            y={y4xx}
                            width={barWidth}
                            height={h4xx}
                            fill="#f59e0b"
                            opacity={isHovered ? 1 : 0.85}
                          />
                        )}
                        {d.status5xx > 0 && (
                          <rect
                            x={x - barWidth / 2}
                            y={y5xx}
                            width={barWidth}
                            height={h5xx}
                            fill="#ef4444"
                            rx={3}
                            opacity={isHovered ? 1 : 0.85}
                          />
                        )}
                      </g>
                    );
                  })}
                </g>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  MODE 2: RESPONSE LATENCY
                  ───────────────────────────────────────────────────────────── */}
              {activeTab === "latency" && (
                <g>
                  {latencyAvgArea && <path d={latencyAvgArea} fill="url(#glowLatency)" />}
                  {latencyAvgSpline && (
                    <path
                      d={latencyAvgSpline}
                      fill="none"
                      stroke="#0284c7"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  )}
                  {/* Max latency peak line */}
                  {getSmoothSplinePath(latencyPoints.map((p) => ({ x: p.x, y: p.yMax }))) && (
                    <path
                      d={getSmoothSplinePath(latencyPoints.map((p) => ({ x: p.x, y: p.yMax })))}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1.8"
                      strokeDasharray="4 3"
                    />
                  )}

                  {latencyPoints.map((p, i) => {
                    if (!p.data.requests) return null;
                    const isHovered = hoveredIndex === i;
                    return (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.yAvg}
                        r={isHovered ? 5.5 : 2.5}
                        fill={isHovered ? "var(--foreground)" : "#0284c7"}
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                    );
                  })}
                </g>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  MODE 3: CONTAINER COMPUTE LOAD
                  ───────────────────────────────────────────────────────────── */}
              {activeTab === "compute" && (
                <g>
                  {cpuArea && <path d={cpuArea} fill="url(#glowCpu)" />}
                  {cpuSpline && (
                    <path
                      d={cpuSpline}
                      fill="none"
                      stroke="#8b5cf6"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  )}
                  {cpuPoints.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={3}
                      fill="#8b5cf6"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  ))}
                </g>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  MODE 4: WAF THREAT MITIGATIONS
                  ───────────────────────────────────────────────────────────── */}
              {activeTab === "waf" && (
                <g>
                  {timeSeries.map((d, i) => {
                    const x = paddingLeft + i * stepX;
                    const barWidth = Math.max(6, Math.min(24, stepX * 0.8));
                    const hWaf = (d.wafMitigations / Math.max(1, kpis.wafMitigations)) * usableHeight;
                    const yWaf = yBase - hWaf;
                    if (d.wafMitigations === 0) return null;
                    return (
                      <rect
                        key={i}
                        x={x - barWidth / 2}
                        y={yWaf}
                        width={barWidth}
                        height={hWaf}
                        fill="#06b6d4"
                        rx={3}
                      />
                    );
                  })}
                </g>
              )}

              {/* Interactive Crosshair Tracking Line */}
              {hoveredIndex !== null && timeSeries[hoveredIndex] && (
                <g>
                  <line
                    x1={paddingLeft + hoveredIndex * stepX}
                    y1={paddingTop}
                    x2={paddingLeft + hoveredIndex * stepX}
                    y2={yBase}
                    stroke="var(--accent)"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                    opacity="0.85"
                  />
                  {throughputPoints[hoveredIndex] && (
                    <circle
                      cx={throughputPoints[hoveredIndex].x}
                      cy={throughputPoints[hoveredIndex].y}
                      r="6"
                      fill="var(--accent)"
                      stroke="#ffffff"
                      strokeWidth="2.5"
                    />
                  )}
                </g>
              )}
            </svg>
          )}

          {/* Floating Interactive HUD Tooltip */}
          {currentHoveredPoint && mousePos && (
            <div
              style={{
                position: "absolute",
                left: Math.min(mousePos.x + 15, chartWidth - 220),
                top: Math.max(10, mousePos.y - 120),
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "0.75rem 0.95rem",
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                fontSize: "0.78rem",
                pointerEvents: "none",
                zIndex: 20,
                minWidth: 190,
              }}
            >
              <div style={{ fontWeight: 700, color: "var(--foreground)", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                <span>
                  {new Date(currentHoveredPoint.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span className="mono" style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                  {new Date(currentHoveredPoint.timestamp).toLocaleDateString([], { month: "short", day: "numeric" })}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", color: "var(--muted)", margin: "3px 0" }}>
                <span>Total Requests:</span>
                <strong style={{ color: "var(--foreground)" }}>
                  {currentHoveredPoint.requests.toLocaleString()}
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", color: "#10b981", margin: "2px 0" }}>
                <span>2xx Success:</span>
                <strong>{currentHoveredPoint.status2xx}</strong>
              </div>

              {currentHoveredPoint.status4xx > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", color: "#f59e0b", margin: "2px 0" }}>
                  <span>4xx Client Error:</span>
                  <strong>{currentHoveredPoint.status4xx}</strong>
                </div>
              )}

              {currentHoveredPoint.status5xx > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", color: "#ef4444", margin: "2px 0" }}>
                  <span>5xx Server Error:</span>
                  <strong>{currentHoveredPoint.status5xx}</strong>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  color: "var(--muted)",
                  marginTop: 4,
                  borderTop: "1px solid var(--border)",
                  paddingTop: 4,
                }}
              >
                <span>Avg Latency:</span>
                <strong style={{ color: "var(--accent)" }}>{currentHoveredPoint.avgDurationMs}ms</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", color: "var(--muted)", margin: "2px 0" }}>
                <span>Peak Spike:</span>
                <strong style={{ color: "#f59e0b" }}>{currentHoveredPoint.maxDurationMs}ms</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Two Column Layout: Top Active Endpoints & Protocol Breakdown */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
          gap: "1.5rem",
          marginBottom: "1.75rem",
        }}
      >
        {/* Top Active Endpoints */}
        <div className="card" style={{ padding: "1.5rem", borderRadius: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: 650, margin: 0, color: "var(--foreground)" }}>
                Top Active Endpoints
              </h3>
              <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0.15rem 0 0" }}>
                Routes receiving the highest volume of client requests
              </p>
            </div>
            <span style={{ fontSize: "0.74rem", color: "var(--muted)" }}>
              {topEndpoints.length} Routes
            </span>
          </div>

          {topEndpoints.length === 0 ? (
            <div style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
              No endpoints accessed yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {topEndpoints.map((ep, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", maxWidth: "75%" }}>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 650,
                          color: "var(--muted)",
                          minWidth: 18,
                        }}
                      >
                        #{i + 1}
                      </span>
                      <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ep.path}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <strong style={{ fontSize: "0.84rem" }}>{ep.requests.toLocaleString()}</strong>
                      <span style={{ fontSize: "0.74rem", color: "var(--muted)", minWidth: 42, textAlign: "right" }}>
                        {ep.percentage}%
                      </span>
                    </div>
                  </div>

                  <div style={{ width: "100%", height: 5, background: "var(--bg-subtle)", borderRadius: 3, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.min(100, ep.percentage)}%`,
                        height: "100%",
                        background: "var(--accent-gradient)",
                        borderRadius: 3,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* HTTP Methods & Status Code Breakdown */}
        <div className="card" style={{ padding: "1.5rem", borderRadius: "14px" }}>
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 650, margin: 0, color: "var(--foreground)" }}>
              HTTP Protocol & Status Breakdown
            </h3>
            <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0.15rem 0 0" }}>
              Distribution of incoming methods and status response codes
            </p>
          </div>

          <div style={{ marginTop: "1.25rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "0.4rem" }}>
              <span>HTTP Status Responses</span>
              <span className="mono" style={{ color: "var(--muted)" }}>
                {kpis.totalRequests.toLocaleString()} total
              </span>
            </div>

            <div
              style={{
                width: "100%",
                height: 10,
                borderRadius: 5,
                background: "var(--bg-subtle)",
                overflow: "hidden",
                display: "flex",
              }}
            >
              {kpis.totalRequests > 0 ? (
                <>
                  <div
                    style={{
                      width: `${(statusBreakdown.status2xx / kpis.totalRequests) * 100}%`,
                      background: "#10b981",
                    }}
                    title={`2xx Success: ${statusBreakdown.status2xx}`}
                  />
                  <div
                    style={{
                      width: `${(statusBreakdown.status3xx / kpis.totalRequests) * 100}%`,
                      background: "#38bdf8",
                    }}
                    title={`3xx Redirect: ${statusBreakdown.status3xx}`}
                  />
                  <div
                    style={{
                      width: `${(statusBreakdown.status4xx / kpis.totalRequests) * 100}%`,
                      background: "#f59e0b",
                    }}
                    title={`4xx Client Error: ${statusBreakdown.status4xx}`}
                  />
                  <div
                    style={{
                      width: `${(statusBreakdown.status5xx / kpis.totalRequests) * 100}%`,
                      background: "#ef4444",
                    }}
                    title={`5xx Server Error: ${statusBreakdown.status5xx}`}
                  />
                </>
              ) : (
                <div style={{ width: "100%", background: "var(--border)" }} />
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "0.5rem",
                marginTop: "0.75rem",
                textAlign: "center",
              }}
            >
              <div style={{ background: "var(--bg-subtle)", padding: "0.4rem", borderRadius: "6px" }}>
                <div style={{ fontSize: "0.68rem", color: "#10b981", fontWeight: 600 }}>2xx Success</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: 2 }}>{statusBreakdown.status2xx}</div>
              </div>
              <div style={{ background: "var(--bg-subtle)", padding: "0.4rem", borderRadius: "6px" }}>
                <div style={{ fontSize: "0.68rem", color: "#38bdf8", fontWeight: 600 }}>3xx Redirect</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: 2 }}>{statusBreakdown.status3xx}</div>
              </div>
              <div style={{ background: "var(--bg-subtle)", padding: "0.4rem", borderRadius: "6px" }}>
                <div style={{ fontSize: "0.68rem", color: "#f59e0b", fontWeight: 600 }}>4xx Client</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: 2 }}>{statusBreakdown.status4xx}</div>
              </div>
              <div style={{ background: "var(--bg-subtle)", padding: "0.4rem", borderRadius: "6px" }}>
                <div style={{ fontSize: "0.68rem", color: "#ef4444", fontWeight: 600 }}>5xx Server</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, marginTop: 2 }}>{statusBreakdown.status5xx}</div>
              </div>
            </div>
          </div>

          {/* HTTP Methods pills */}
          <div>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--muted)", marginBottom: "0.5rem" }}>
              HTTP Methods Distribution
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {Object.keys(methodBreakdown).length === 0 ? (
                <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>No HTTP verbs recorded yet</span>
              ) : (
                Object.entries(methodBreakdown).map(([method, count]) => {
                  let badgeColor = "#4f46e5";
                  if (method === "GET") badgeColor = "#10b981";
                  if (method === "POST") badgeColor = "#3b82f6";
                  if (method === "PUT" || method === "PATCH") badgeColor = "#8b5cf6";
                  if (method === "DELETE") badgeColor = "#ef4444";

                  return (
                    <div
                      key={method}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.45rem",
                        padding: "0.35rem 0.65rem",
                        borderRadius: "6px",
                        background: "var(--bg-subtle)",
                        border: "1px solid var(--border)",
                        fontSize: "0.78rem",
                      }}
                    >
                      <span style={{ fontWeight: 700, color: badgeColor }}>{method}</span>
                      <span className="mono" style={{ color: "var(--foreground)", fontWeight: 600 }}>
                        {count.toLocaleString()}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Live Request Stream & Diagnostic Inspector */}
      <div className="card" style={{ padding: "1.5rem", borderRadius: "14px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "1.25rem",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 650, margin: 0, color: "var(--foreground)" }}>
                Live Request Stream & Inspector
              </h3>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#10b981",
                  display: "inline-block",
                  boxShadow: "0 0 6px #10b981",
                }}
              />
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0.2rem 0 0" }}>
              Recent requests passing through the edge router ring-buffer (last 40 hits)
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              <Search
                size={14}
                style={{ position: "absolute", left: 10, color: "var(--muted)", pointerEvents: "none" }}
              />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search path, IP, status..."
                style={{
                  fontSize: "0.78rem",
                  padding: "0.4rem 0.65rem 0.4rem 2rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--bg-subtle)",
                  color: "var(--foreground)",
                  width: 190,
                }}
              />
            </div>

            <div
              style={{
                display: "inline-flex",
                background: "var(--bg-subtle)",
                padding: "2px",
                borderRadius: "8px",
                border: "1px solid var(--border)",
              }}
            >
              <button
                onClick={() => setLogFilter("all")}
                style={{
                  border: "none",
                  background: logFilter === "all" ? "var(--card)" : "transparent",
                  color: logFilter === "all" ? "var(--foreground)" : "var(--muted)",
                  fontSize: "0.75rem",
                  fontWeight: logFilter === "all" ? 600 : 500,
                  padding: "0.25rem 0.6rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                All
              </button>
              <button
                onClick={() => setLogFilter("errors")}
                style={{
                  border: "none",
                  background: logFilter === "errors" ? "var(--card)" : "transparent",
                  color: logFilter === "errors" ? "#ef4444" : "var(--muted)",
                  fontSize: "0.75rem",
                  fontWeight: logFilter === "errors" ? 600 : 500,
                  padding: "0.25rem 0.6rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                Errors Only
              </button>
              <button
                onClick={() => setLogFilter("waf")}
                style={{
                  border: "none",
                  background: logFilter === "waf" ? "var(--card)" : "transparent",
                  color: logFilter === "waf" ? "#0284c7" : "var(--muted)",
                  fontSize: "0.75rem",
                  fontWeight: logFilter === "waf" ? 600 : 500,
                  padding: "0.25rem 0.6rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                WAF Blocked
              </button>
            </div>
          </div>
        </div>

        {/* Requests Table */}
        {filteredRequests.length === 0 ? (
          <div
            style={{
              padding: "3rem 1.5rem",
              textAlign: "center",
              background: "var(--bg-subtle)",
              borderRadius: "10px",
              border: "1px dashed var(--border)",
            }}
          >
            <Activity size={32} style={{ opacity: 0.3, margin: "0 auto 0.75rem" }} />
            <h4 style={{ margin: "0 0 0.35rem", fontSize: "0.95rem", color: "var(--foreground)" }}>
              No recent requests matching criteria
            </h4>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)", maxWidth: 440, marginInline: "auto" }}>
              Send an HTTP request to your service endpoint to see it stream live into this inspector.
            </p>

            {data?.slug && (
              <div style={{ marginTop: "1.25rem", display: "inline-flex", gap: "0.5rem" }}>
                <button
                  onClick={() => handleSendPing(data.slug)}
                  disabled={testingPing}
                  className="btn-primary"
                  style={{ fontSize: "0.8rem", padding: "0.45rem 0.9rem", borderRadius: "8px", cursor: "pointer" }}
                >
                  {testingPing ? "Pinging Service..." : "Send Test Ping"}
                </button>
                <button
                  onClick={() => handleCopyCurl(data.slug)}
                  className="btn-secondary"
                  style={{
                    fontSize: "0.8rem",
                    padding: "0.45rem 0.9rem",
                    borderRadius: "8px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  {copiedUrl ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  Copy curl command
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>Time</th>
                  <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>Method</th>
                  <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>Path</th>
                  <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>Latency</th>
                  <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>Egress</th>
                  <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>Client IP</th>
                  <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>Client Type</th>
                  <th style={{ padding: "0.6rem 0.75rem", fontWeight: 600, textAlign: "right" }}>Security</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req, i) => {
                  let statusBg = "rgba(16, 185, 129, 0.1)";
                  let statusColor = "#10b981";
                  if (req.statusCode >= 300 && req.statusCode < 400) {
                    statusBg = "rgba(56, 189, 248, 0.1)";
                    statusColor = "#0284c7";
                  } else if (req.statusCode >= 400 && req.statusCode < 500) {
                    statusBg = "rgba(245, 158, 11, 0.1)";
                    statusColor = "#d97706";
                  } else if (req.statusCode >= 500) {
                    statusBg = "rgba(239, 68, 68, 0.1)";
                    statusColor = "#dc2626";
                  }

                  let methodColor = "#4f46e5";
                  if (req.method === "GET") methodColor = "#10b981";
                  if (req.method === "POST") methodColor = "#3b82f6";
                  if (req.method === "DELETE") methodColor = "#ef4444";
                  if (req.method === "PUT" || req.method === "PATCH") methodColor = "#8b5cf6";

                  const lat = req.durationMs;
                  let latColor = "#10b981";
                  if (lat > 150) latColor = "#f59e0b";
                  if (lat > 500) latColor = "#ef4444";

                  return (
                    <tr
                      key={req.id || i}
                      style={{
                        borderBottom: "1px solid var(--card-border-subtle)",
                        transition: "background 0.12s ease",
                      }}
                      className="hover:bg-slate-50"
                    >
                      <td style={{ padding: "0.55rem 0.75rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {formatDistanceToNow(new Date(req.timestamp), { addSuffix: true })}
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem" }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: "0.72rem",
                            color: methodColor,
                            padding: "0.15rem 0.4rem",
                            borderRadius: "4px",
                            background: "var(--bg-subtle)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {req.method}
                        </span>
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem", maxWidth: 220 }}>
                        <span
                          className="mono"
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "block",
                            color: "var(--foreground)",
                            fontWeight: 500,
                          }}
                          title={req.path}
                        >
                          {req.path}
                        </span>
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem" }}>
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 650,
                            padding: "0.15rem 0.45rem",
                            borderRadius: "4px",
                            background: statusBg,
                            color: statusColor,
                          }}
                        >
                          {req.statusCode}
                        </span>
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem" }}>
                        <span style={{ color: latColor, fontWeight: 600 }}>{req.durationMs}ms</span>
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem", color: "var(--muted)" }}>
                        {formatBytes(req.bytesSent)}
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem" }}>
                        <span className="mono" style={{ fontSize: "0.75rem" }}>
                          {req.clientIp}
                        </span>
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem", textTransform: "capitalize", color: "var(--muted)" }}>
                        {req.clientType}
                      </td>
                      <td style={{ padding: "0.55rem 0.75rem", textAlign: "right" }}>
                        {req.isWafBlocked ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              fontSize: "0.7rem",
                              fontWeight: 650,
                              color: "#dc2626",
                              background: "rgba(220, 38, 38, 0.1)",
                              padding: "0.15rem 0.45rem",
                              borderRadius: "4px",
                            }}
                          >
                            <ShieldAlert size={12} /> BLOCKED
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              color: "#059669",
                              background: "rgba(16, 185, 129, 0.08)",
                              padding: "0.15rem 0.45rem",
                              borderRadius: "4px",
                            }}
                          >
                            <ShieldCheck size={12} /> PASSED
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        .spin-animation {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .active-refresh-btn {
          border-color: rgba(16, 185, 129, 0.35) !important;
          background: rgba(16, 185, 129, 0.06) !important;
          color: #059669 !important;
        }
      `}</style>
    </div>
  );
}
