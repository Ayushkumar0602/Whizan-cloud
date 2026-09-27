"use client";
import { useEffect, useState } from "react";
import { projects } from "@/lib/api";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Globe, Users, Activity, BarChart3, TrendingUp, Radio } from "lucide-react";
import { PageHeader } from "@/components/page-header";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function AnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    projects.getAnalytics(id)
      .then(setData)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Loading analytics...</span>
      </div>
    );
  }

  const totalPageViews = data.reduce((acc, curr) => acc + curr.pageViews, 0);
  const totalBandwidth = data.reduce((acc, curr) => acc + curr.bandwidth, 0);
  const totalVisitors = data.reduce((acc, curr) => acc + curr.visitors, 0);

  const maxViews = Math.max(...data.map(d => d.pageViews), 1);

  return (
    <div className="page">
      <Link href={`/dashboard/projects/${id}`} className="breadcrumb">
        <ArrowLeft size={15} /> Back to Project
      </Link>

      <PageHeader
        title="Edge Network Analytics"
        subtitle="Real-time traffic telemetry and bandwidth consumption metrics across edge points of presence."
      />

      <div className="stats-grid" style={{ marginBottom: "2rem" }}>
        <div className="stat-card">
          <div className="stat-label">
            <Globe size={14} className="text-accent" /> Total Page Views
          </div>
          <div className="stat-value">{totalPageViews.toLocaleString()}</div>
          <div className="stat-sub">
            <TrendingUp size={12} color="#10b981" /> Last 30 days
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Users size={14} style={{ color: "#38bdf8" }} /> Unique Visitors
          </div>
          <div className="stat-value">{totalVisitors.toLocaleString()}</div>
          <div className="stat-sub">Unique IP telemetry</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Activity size={14} style={{ color: "#10b981" }} /> Bandwidth Transferred
          </div>
          <div className="stat-value">{formatBytes(totalBandwidth)}</div>
          <div className="stat-sub" style={{ color: "var(--success)" }}>
            Edge caching active
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <div>
            <h3 className="card-title">Daily Traffic Log</h3>
            <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.2rem" }}>
              HTTP request counts and data egress per 24-hour cycle
            </p>
          </div>
          <span className="mono" style={{ fontSize: "0.76rem", color: "var(--muted)" }}>
            30 Day Window
          </span>
        </div>

        {data.length === 0 ? (
          <div className="empty-state" style={{ padding: "3rem 1.5rem" }}>
            <BarChart3 size={32} />
            <h3 style={{ fontSize: "1.1rem", fontWeight: 650, color: "var(--foreground)" }}>No traffic telemetry yet</h3>
            <p>Deploy your frontend app and send requests to populate analytics charts.</p>
          </div>
        ) : (
          <div className="traffic-table-wrap">
            {data.map((day, idx) => {
              const percent = Math.round((day.pageViews / maxViews) * 100);
              return (
                <div key={idx} className="traffic-row">
                  <div className="traffic-date mono">
                    {new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>

                  {/* Relative bar */}
                  <div className="traffic-bar-box">
                    <div
                      className="traffic-bar-fill"
                      style={{ width: `${Math.max(percent, 4)}%` }}
                    />
                  </div>

                  <div className="traffic-metrics-group">
                    <span className="metric-chip">
                      <strong>{day.pageViews.toLocaleString()}</strong> views
                    </span>
                    <span className="metric-chip">
                      <strong>{day.visitors.toLocaleString()}</strong> visits
                    </span>
                    <span className="metric-chip mono" style={{ color: "var(--accent)" }}>
                      {formatBytes(day.bandwidth)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        .traffic-table-wrap {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--card-border);
          border-radius: 8px;
          overflow: hidden;
        }
        .traffic-row {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          padding: 0.85rem 1.25rem;
          border-bottom: 1px solid var(--card-border);
          background: var(--bg-inset);
          font-size: 0.82rem;
        }
        .traffic-row:last-child {
          border-bottom: none;
        }
        .traffic-date {
          width: 70px;
          font-weight: 600;
          color: var(--foreground);
          flex-shrink: 0;
        }
        .traffic-bar-box {
          flex: 1;
          height: 8px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 9999px;
          overflow: hidden;
          min-width: 80px;
        }
        .traffic-bar-fill {
          height: 100%;
          background: var(--accent-gradient);
          border-radius: 9999px;
          transition: width 0.3s ease;
        }
        .traffic-metrics-group {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          flex-shrink: 0;
        }
        .metric-chip {
          color: var(--muted);
          min-width: 70px;
          text-align: right;
        }

        @media (max-width: 640px) {
          .traffic-row {
            flex-direction: column;
            align-items: stretch;
            gap: 0.5rem;
          }
          .traffic-metrics-group {
            justify-content: space-between;
          }
        }
      `}</style>
    </div>
  );
}
