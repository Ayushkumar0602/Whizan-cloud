"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { services, getAccessToken } from "@/lib/api";
import { Terminal, Loader2, Globe, RefreshCw, Pause, Play } from "lucide-react";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://whizan-cloud-service.onrender.com";

export function ServiceLogs({ dId, serviceId }: { dId: string, serviceId: string }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(true);
  const logsRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  const connectStream = useCallback((isLive: boolean = false) => {
    if (!dId) return;
    if (esRef.current) esRef.current.close();

    const token = getAccessToken();
    if (!token) {
      toast.error("Not authenticated");
      return;
    }

    setStreaming(true);
    const liveParam = isLive ? "&live=true" : "";
    const url = `${API_BASE}/api/services/deployments/${dId}/logs?token=${token}${liveParam}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const { log } = JSON.parse(e.data);
        if (log === "__DONE__") {
          setStreaming(false);
          es.close();
        } else {
          setLogs(prev => [...prev, log]);
        }
      } catch (err) {}
    };

    es.onerror = () => {
      setStreaming(false);
      es.close();
    };
  }, [dId]);

  useEffect(() => {
    setLogs([]);
    connectStream(false);
    return () => {
      if (esRef.current) esRef.current.close();
    };
  }, [dId, connectStream]);

  if (!dId) return <div style={{ color: "var(--muted)", padding: "2rem", textAlign: "center" }}>No deployment selected.</div>;

  return (
    <div className="logs-panel" style={{ margin: 0, width: "100%" }}>
      <div className="logs-toolbar">
        <div className="logs-title">
          <Terminal size={14} /> Live Terminal logs
        </div>
        {streaming ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.8rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Loader2 size={12} className="spin-icon" /> <span className="live-badge">Live Tail Active</span>
            </div>
            <button
              onClick={() => {
                if (esRef.current) esRef.current.close();
                setStreaming(false);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                padding: "0.2rem 0.5rem",
                fontSize: "0.7rem",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--card-border)",
                borderRadius: "4px",
                color: "var(--muted)",
                cursor: "pointer",
              }}
              title="Pause live tail"
            >
              <Pause size={10} /> Pause
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.8rem" }}>
            <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>Live tail paused</span>
            <button
              onClick={() => {
                connectStream(true);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                padding: "0.2rem 0.6rem",
                fontSize: "0.75rem",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid var(--card-border)",
                borderRadius: "4px",
                color: "var(--foreground)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title="Resume live tailing for running container"
            >
              <RefreshCw size={11} /> Re-stream
            </button>
          </div>
        )}
      </div>
      <div className="logs-body" ref={logsRef}>
        {logs.length === 0 && !streaming ? (
          <div className="logs-waiting">No logs captured.</div>
        ) : (
          logs.map((log, i) => {
            const isError = log.includes("❌") || log.toLowerCase().includes("failed") || log.toLowerCase().includes("error:") || log.includes("fatal:");
            const isStderr = log.startsWith("[stderr]");
            const isSuccess = log.includes("✓") || log.includes("✅");
            const isInfo = log.startsWith("🛡️") || log.startsWith("ℹ️") || log.startsWith("💡") || log.startsWith("🧹") || log.startsWith("📋");
            const lineClass = isError ? "log-error" : isStderr ? "log-stderr" : isSuccess ? "log-success" : isInfo ? "log-info" : "";

            return (
              <div key={i} className={`log-line ${lineClass}`}>
                <span className="log-num">{String(i + 1).padStart(4, " ")}</span>
                <span className="log-text">{log}</span>
              </div>
            );
          })
        )}
        {streaming && logs.length > 0 && (
          <div className="log-line">
             <span className="log-num">{String(logs.length + 1).padStart(4, " ")}</span>
             <span className="log-text" style={{ color: "var(--accent)" }}><span className="blinking-cursor">█</span> Processing...</span>
          </div>
        )}
      </div>
      <style>{`
        .logs-panel { background: #000000; border: 1px solid var(--card-border); border-radius: 6px; overflow: hidden; box-shadow: var(--shadow); width: 100%; }
        .logs-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.625rem 1rem; background: var(--card); border-bottom: 1px solid var(--card-border);
        }
        .logs-title { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; font-weight: 500; color: var(--muted); }
        .live-badge { font-size: 0.6875rem; color: var(--success); animation: pulse 2s ease-in-out infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        .blinking-cursor { animation: blink 1s step-end infinite; }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .logs-count { font-size: 0.75rem; color: var(--muted); }
        .logs-body { height: 400px; overflow-y: auto; padding: 0.5rem 0; font-family: var(--font-geist-mono), Menlo, monospace; }
        .logs-waiting { display: flex; align-items: center; gap: 0.625rem; color: var(--muted); font-size: 0.8125rem; padding: 2rem 1.25rem; }
        .log-line { display: flex; font-size: 0.75rem; line-height: 1.65; }
        .log-line:hover { background: rgba(255,255,255,0.05); }
        .log-num { color: #334155; padding: 0 1rem; user-select: none; flex-shrink: 0; min-width: 3.5rem; text-align: right; white-space: pre; }
        .log-text { color: #e2e8f0; word-break: break-word; flex: 1; padding-right: 1rem; }
        .log-stderr .log-text { color: #fbbf24; }
        .log-success .log-text { color: #4ade80; }
        .log-error .log-text { color: #f87171; font-weight: 500; }
        .log-info .log-text { color: #60a5fa; }
      `}</style>
    </div>
  );
}
