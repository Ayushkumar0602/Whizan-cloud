"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Activity,
  Globe,
  Users,
  HardDrive,
  Clock,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Search,
  Check,
  Copy,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { projects, type AdvancedAnalyticsData } from "@/lib/api";

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function ProjectAnalyticsPage() {
  const { id } = useParams<{ id: string }>();

  const [data, setData] = useState<AdvancedAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeframe, setTimeframe] = useState<"1h" | "24h" | "7d" | "30d">("24h");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [chartMode, setChartMode] = useState<"throughput" | "latency">("throughput");
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [logFilter, setLogFilter] = useState<"all" | "errors" | "waf">("all");
  const [copiedUrl, setCopiedUrl] = useState(false);

  const fetchAnalytics = useCallback(
    async (tf: "1h" | "24h" | "7d" | "30d", isBackground = false) => {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);

      try {
        const res = await projects.getAdvancedAnalytics(id, tf);
        setData(res);
      } catch (err: any) {
        if (!isBackground) {
          toast.error("Failed to load project analytics", {
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
        <div className="skeleton" style={{ height: 320, borderRadius: 14, marginBottom: "2rem" }} />
      </div>
    );
  }

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
  };

  const statusBreakdown = data?.statusBreakdown || { status2xx: 0, status3xx: 0, status4xx: 0, status5xx: 0 };
  const timeSeries = data?.timeSeries || [];
  const topEndpoints = data?.topEndpoints || [];
  const methodBreakdown = data?.methodBreakdown || {};
  const dailyLogs = data?.dailyLogs || [];

  const maxViews = Math.max(...dailyLogs.map((d: any) => d.pageViews || 0), 1);
  const maxReqValue = Math.max(...timeSeries.map((d) => d.requests), 1);
  const maxLatValue = Math.max(...timeSeries.map((d) => d.maxDurationMs || d.avgDurationMs), 1);

  const chartWidth = 900;
  const chartHeight = 220;
  const paddingX = 40;
  const paddingY = 25;
  const usableWidth = chartWidth - paddingX * 2;
  const usableHeight = chartHeight - paddingY * 2;

  const pointsCount = timeSeries.length;
  const stepX = pointsCount > 1 ? usableWidth / (pointsCount - 1) : usableWidth;

  const latencyPoints = timeSeries.map((d, i) => {
    const x = paddingX + i * stepX;
    const y = chartHeight - paddingY - (d.avgDurationMs / (maxLatValue || 1)) * usableHeight;
    return { x, y, data: d };
  });

  const latencySvgPath =
    latencyPoints.length > 0
      ? `M ${latencyPoints[0].x} ${latencyPoints[0].y} ` +
        latencyPoints
          .slice(1)
          .map((p) => `L ${p.x} ${p.y}`)
          .join(" ")
      : "";

  const latencyAreaSvgPath =
    latencyPoints.length > 0
      ? `${latencySvgPath} L ${latencyPoints[latencyPoints.length - 1].x} ${chartHeight - paddingY} L ${latencyPoints[0].x} ${chartHeight - paddingY} Z`
      : "";

  return (
    <div className="page" style={{ padding: "2rem 2.5rem 4rem" }}>
      {/* Breadcrumb & Navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <Link href={`/dashboard/projects/${id}`} className="breadcrumb" style={{ margin: 0 }}>
          <ArrowLeft size={14} /> Back to Project Overview
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

      {/* Header with Timeframe Pill Buttons */}
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
              Edge Network & Web Analytics
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
              Ultra-Low Latency Edge
            </span>
          </div>
          <p className="page-subtitle" style={{ marginTop: "0.35rem", fontSize: "0.86rem", color: "var(--muted)" }}>
            Real-time traffic telemetry, page views, egress bandwidth, and WAF protection for your frontend deployment.
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
        {/* Card 1: Total Requests / Views */}
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

        {/* Card 2: Unique Visitors */}
        <div className="stat-card">
          <div className="stat-label">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <Users size={14} style={{ color: "#0284c7" }} /> Unique Visitors
            </span>
          </div>
          <div className="stat-value" style={{ marginTop: "0.4rem", fontSize: "1.8rem" }}>
            {kpis.uniqueIps.toLocaleString()}
          </div>
          <div className="stat-sub" style={{ marginTop: "0.35rem", color: "var(--muted)" }}>
            Unique client IP addresses
          </div>
        </div>

        {/* Card 3: Avg Latency */}
        <div className="stat-card">
          <div className="stat-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <Clock size={14} style={{ color: "#8b5cf6" }} /> Edge Latency
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

        {/* Card 4: Bandwidth Transferred */}
        <div className="stat-card">
          <div className="stat-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <HardDrive size={14} style={{ color: "#10b981" }} /> Bandwidth
            </span>
            <span style={{ fontSize: "0.72rem", color: "var(--success)", fontWeight: 600 }}>Edge Cache Active</span>
          </div>
          <div className="stat-value" style={{ marginTop: "0.4rem", fontSize: "1.8rem" }}>
            {formatBytes(kpis.totalBandwidthBytes)}
          </div>
          <div className="stat-sub" style={{ marginTop: "0.35rem", color: "var(--muted)" }}>
            Total data egress transferred
          </div>
        </div>

        {/* Card 5: Threat Defense & WAF */}
        <div className="stat-card">
          <div className="stat-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <ShieldCheck size={14} style={{ color: "#06b6d4" }} /> Security
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

      {/* Main Interactive Chart Card */}
      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.75rem", borderRadius: "14px" }}>
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
            <h3 style={{ fontSize: "1.05rem", fontWeight: 650, margin: 0, color: "var(--foreground)" }}>
              {chartMode === "throughput" ? "Traffic Throughput & Response Distribution" : "Latency Curve (ms)"}
            </h3>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0.2rem 0 0" }}>
              {chartMode === "throughput"
                ? "Breakdown across 2xx Success, 3xx Redirect, 4xx Client, and 5xx Server responses"
                : "Edge response latency distribution over time"}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
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
                onClick={() => setChartMode("throughput")}
                style={{
                  border: "none",
                  background: chartMode === "throughput" ? "var(--card)" : "transparent",
                  color: chartMode === "throughput" ? "var(--foreground)" : "var(--muted)",
                  fontSize: "0.78rem",
                  fontWeight: chartMode === "throughput" ? 600 : 500,
                  padding: "0.3rem 0.75rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                Throughput
              </button>
              <button
                onClick={() => setChartMode("latency")}
                style={{
                  border: "none",
                  background: chartMode === "latency" ? "var(--card)" : "transparent",
                  color: chartMode === "latency" ? "var(--foreground)" : "var(--muted)",
                  fontSize: "0.78rem",
                  fontWeight: chartMode === "latency" ? 600 : 500,
                  padding: "0.3rem 0.75rem",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                Latency
              </button>
            </div>

            {chartMode === "throughput" && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.75rem" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "2px", background: "#10b981" }} /> 2xx
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "2px", background: "#38bdf8" }} /> 3xx
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "2px", background: "#f59e0b" }} /> 4xx
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "2px", background: "#ef4444" }} /> 5xx
                </span>
              </div>
            )}
          </div>
        </div>

        {/* SVG Chart */}
        <div style={{ position: "relative", width: "100%", height: chartHeight }}>
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
              <span>No real-time edge telemetry recorded yet for this timeframe.</span>
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              style={{ width: "100%", height: "100%", overflow: "visible" }}
              onMouseLeave={() => setHoveredPointIndex(null)}
            >
              <defs>
                <linearGradient id="latencyGlowProj" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                const y = chartHeight - paddingY - pct * usableHeight;
                const labelVal =
                  chartMode === "throughput"
                    ? Math.round(pct * maxReqValue)
                    : `${Math.round(pct * maxLatValue)}ms`;
                return (
                  <g key={idx}>
                    <line
                      x1={paddingX}
                      y1={y}
                      x2={chartWidth - paddingX}
                      y2={y}
                      stroke="var(--border)"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                      opacity="0.6"
                    />
                    <text
                      x={paddingX - 8}
                      y={y + 3}
                      textAnchor="end"
                      fontSize="9"
                      fill="var(--muted)"
                      opacity="0.8"
                    >
                      {labelVal}
                    </text>
                  </g>
                );
              })}

              {/* Stacked bars */}
              {chartMode === "throughput" &&
                timeSeries.map((d, i) => {
                  const x = paddingX + i * stepX;
                  const barWidth = Math.max(2, Math.min(12, stepX * 0.7));

                  const h2xx = (d.status2xx / maxReqValue) * usableHeight;
                  const h3xx = (d.status3xx / maxReqValue) * usableHeight;
                  const h4xx = (d.status4xx / maxReqValue) * usableHeight;
                  const h5xx = (d.status5xx / maxReqValue) * usableHeight;

                  const yBase = chartHeight - paddingY;
                  const y2xx = yBase - h2xx;
                  const y3xx = y2xx - h3xx;
                  const y4xx = y3xx - h4xx;
                  const y5xx = y4xx - h5xx;

                  const isHovered = hoveredPointIndex === i;

                  return (
                    <g
                      key={i}
                      onMouseEnter={() => setHoveredPointIndex(i)}
                      style={{ cursor: "pointer" }}
                    >
                      <rect
                        x={x - stepX / 2}
                        y={paddingY}
                        width={stepX}
                        height={usableHeight}
                        fill="transparent"
                      />

                      {d.status2xx > 0 && (
                        <rect
                          x={x - barWidth / 2}
                          y={y2xx}
                          width={barWidth}
                          height={h2xx}
                          fill="#10b981"
                          rx={d.requests === d.status2xx ? 2 : 0}
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
                          rx={2}
                          opacity={isHovered ? 1 : 0.85}
                        />
                      )}

                      {isHovered && (
                        <line
                          x1={x}
                          y1={paddingY}
                          x2={x}
                          y2={chartHeight - paddingY}
                          stroke="var(--accent)"
                          strokeWidth="1.5"
                          strokeDasharray="2 2"
                        />
                      )}
                    </g>
                  );
                })}

              {/* Latency Curve */}
              {chartMode === "latency" && (
                <g>
                  {latencyAreaSvgPath && (
                    <path d={latencyAreaSvgPath} fill="url(#latencyGlowProj)" />
                  )}
                  {latencySvgPath && (
                    <path
                      d={latencySvgPath}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  )}
                  {latencyPoints.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={hoveredPointIndex === i ? 5 : 2.5}
                      fill={hoveredPointIndex === i ? "var(--foreground)" : "var(--accent)"}
                      stroke="var(--card)"
                      strokeWidth="1.5"
                      style={{ cursor: "pointer", transition: "r 0.1s ease" }}
                      onMouseEnter={() => setHoveredPointIndex(i)}
                    />
                  ))}
                </g>
              )}
            </svg>
          )}

          {/* Tooltip Overlay */}
          {hoveredPointIndex !== null && timeSeries[hoveredPointIndex] && (
            <div
              style={{
                position: "absolute",
                top: 8,
                right: 12,
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "0.6rem 0.85rem",
                boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                fontSize: "0.78rem",
                pointerEvents: "none",
                zIndex: 10,
                minWidth: 170,
              }}
            >
              <div style={{ fontWeight: 650, color: "var(--foreground)", marginBottom: 4 }}>
                {new Date(timeSeries[hoveredPointIndex].timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", color: "var(--muted)" }}>
                <span>Requests:</span>
                <strong style={{ color: "var(--foreground)" }}>
                  {timeSeries[hoveredPointIndex].requests.toLocaleString()}
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", color: "#10b981" }}>
                <span>2xx Success:</span>
                <strong>{timeSeries[hoveredPointIndex].status2xx}</strong>
              </div>
              {timeSeries[hoveredPointIndex].status4xx > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", color: "#f59e0b" }}>
                  <span>4xx Client:</span>
                  <strong>{timeSeries[hoveredPointIndex].status4xx}</strong>
                </div>
              )}
              {timeSeries[hoveredPointIndex].status5xx > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", color: "#ef4444" }}>
                  <span>5xx Error:</span>
                  <strong>{timeSeries[hoveredPointIndex].status5xx}</strong>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  color: "var(--muted)",
                  marginTop: 3,
                  borderTop: "1px solid var(--border)",
                  paddingTop: 3,
                }}
              >
                <span>Avg Latency:</span>
                <strong style={{ color: "var(--accent)" }}>
                  {timeSeries[hoveredPointIndex].avgDurationMs}ms
                </strong>
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
                Top Visited Routes
              </h3>
              <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0.15rem 0 0" }}>
                Paths receiving the highest volume of client visits
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
              Protocol & Status Breakdown
            </h3>
            <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0.15rem 0 0" }}>
              Status responses and HTTP verbs handled by the Edge Router
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

      {/* 30-Day Historical Traffic Logs from Postgres (Preserved for Long-Term Insights) */}
      {dailyLogs.length > 0 && (
        <div className="card" style={{ padding: "1.5rem", marginBottom: "1.75rem", borderRadius: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
            <div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 650, margin: 0, color: "var(--foreground)" }}>
                30-Day Daily Traffic History
              </h3>
              <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0.2rem 0 0" }}>
                Historical page view trends and egress data aggregated daily in PostgreSQL
              </p>
            </div>
            <span className="mono" style={{ fontSize: "0.76rem", color: "var(--muted)" }}>
              30 Day Snapshot
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {dailyLogs.map((day: any, idx: number) => {
              const percent = Math.round(((day.pageViews || 0) / maxViews) * 100);
              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.5rem 0",
                    borderBottom: idx < dailyLogs.length - 1 ? "1px solid var(--card-border-subtle)" : "none",
                  }}
                >
                  <div className="mono" style={{ minWidth: 90, fontSize: "0.78rem", color: "var(--muted)" }}>
                    {new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>

                  <div style={{ flex: 1, height: 8, background: "var(--bg-subtle)", borderRadius: 4, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.max(percent, 4)}%`,
                        height: "100%",
                        background: "var(--accent)",
                        borderRadius: 4,
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", fontSize: "0.78rem" }}>
                    <span>
                      <strong>{(day.pageViews || 0).toLocaleString()}</strong> views
                    </span>
                    <span>
                      <strong>{(day.visitors || 0).toLocaleString()}</strong> visits
                    </span>
                    <span className="mono" style={{ color: "var(--accent)", minWidth: 70, textAlign: "right" }}>
                      {formatBytes(day.bandwidth || 0)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
              Individual requests passing through the edge router (last 40 hits)
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
                placeholder="Search path, IP..."
                style={{
                  fontSize: "0.78rem",
                  padding: "0.4rem 0.65rem 0.4rem 2rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--bg-subtle)",
                  color: "var(--foreground)",
                  width: 180,
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
              No recent requests recorded in this window
            </h4>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)", maxWidth: 440, marginInline: "auto" }}>
              Send requests to your frontend application to see edge telemetry stream in live.
            </p>

            {data?.slug && (
              <div style={{ marginTop: "1.25rem" }}>
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
                  Copy curl test command
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
