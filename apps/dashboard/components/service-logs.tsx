"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { getAccessToken, getApiBase } from "@/lib/api";
import {
  Terminal,
  Loader2,
  RefreshCw,
  Pause,
  Play,
  Copy,
  Check,
  Search,
  Trash2,
  Maximize2,
  Minimize2,
  ArrowDownCircle,
  Filter,
} from "lucide-react";
import { toast } from "sonner";

export function ServiceLogs({ dId, serviceId }: { dId: string; serviceId: string }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(true);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterText, setFilterText] = useState("");
  const [isMaximized, setIsMaximized] = useState(false);

  const logsRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (autoScroll && logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

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
    const url = `${getApiBase()}/api/services/deployments/${dId}/logs?token=${token}${liveParam}`;
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

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scrollToBottom = () => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  };

  const filteredLogs = useMemo(() => {
    if (!filterText.trim()) return logs;
    const q = filterText.toLowerCase();
    return logs.filter(l => l.toLowerCase().includes(q));
  }, [logs, filterText]);

  if (!dId) {
    return (
      <div style={{ color: "var(--muted)", padding: "3rem", textAlign: "center", fontSize: "0.85rem" }}>
        No deployment selected.
      </div>
    );
  }

  return (
    <div className={`svc-logs-card ${isMaximized ? "svc-logs-fullscreen" : ""}`}>
      {/* Top Header Bar */}
      <div className="svc-logs-header">
        {/* Left: Window Controls + Title */}
        <div className="svc-logs-header-left">
          <div className="svc-logs-traffic-lights">
            <span className="svc-logs-dot dot-red" />
            <span className="svc-logs-dot dot-yellow" />
            <span className="svc-logs-dot dot-green" />
          </div>

          <div className="svc-logs-title-group">
            <Terminal size={14} className="svc-logs-cyan-icon" />
            <span className="svc-logs-title-text">Container Build & Runtime Logs</span>
            <span className="svc-logs-count-badge">{filteredLogs.length} lines</span>
          </div>

          {streaming ? (
            <span className="svc-logs-status-tag status-live">
              <span className="svc-logs-pulse-led" /> Live Streaming
            </span>
          ) : (
            <span className="svc-logs-status-tag status-paused">
              Stream Paused
            </span>
          )}
        </div>

        {/* Right Actions */}
        <div className="svc-logs-header-right">
          {/* Search / Filter input */}
          <div className="svc-logs-search-wrap">
            <Search size={12} className="svc-logs-search-icon" />
            <input
              type="text"
              className="svc-logs-search-input"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              placeholder="Filter logs..."
            />
            {filterText && (
              <button
                type="button"
                className="svc-logs-clear-search"
                onClick={() => setFilterText("")}
              >
                ✕
              </button>
            )}
          </div>

          <label className="svc-logs-toggle-label" title="Automatically scroll to latest logs">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll(e.target.checked)}
              className="svc-logs-checkbox"
            />
            <span>Auto-scroll</span>
          </label>

          {streaming ? (
            <button
              onClick={() => {
                if (esRef.current) esRef.current.close();
                setStreaming(false);
              }}
              className="svc-logs-btn"
              title="Pause live log streaming"
            >
              <Pause size={11} />
              <span className="btn-text">Pause</span>
            </button>
          ) : (
            <button
              onClick={() => connectStream(true)}
              className="svc-logs-btn svc-logs-btn-primary"
              title="Resume live streaming"
            >
              <RefreshCw size={11} />
              <span className="btn-text">Re-stream</span>
            </button>
          )}

          <button
            onClick={scrollToBottom}
            className="svc-logs-btn"
            title="Scroll to bottom"
          >
            <ArrowDownCircle size={12} />
          </button>

          <button
            onClick={handleCopyLogs}
            className="svc-logs-btn"
            title="Copy all logs"
          >
            {copied ? <Check size={12} style={{ color: "#10b981" }} /> : <Copy size={12} />}
            <span className="btn-text">{copied ? "Copied" : "Copy"}</span>
          </button>

          <button
            onClick={() => setLogs([])}
            className="svc-logs-btn"
            title="Clear display logs"
          >
            <Trash2 size={12} />
          </button>

          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="svc-logs-btn"
            title={isMaximized ? "Restore Height" : "Maximize Screen"}
          >
            {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>

      {/* Logs Viewport */}
      <div className={`svc-logs-viewport ${isMaximized ? "logs-maximized" : ""}`} ref={logsRef}>
        {filteredLogs.length === 0 && !streaming ? (
          <div className="svc-logs-empty">
            {filterText ? `No logs matched filter "${filterText}".` : "No logs recorded for this deployment."}
          </div>
        ) : filteredLogs.length === 0 && streaming ? (
          <div className="svc-logs-empty">
            <Loader2 size={16} className="spin-icon" style={{ color: "#38bdf8" }} />
            <span>Streaming build & container events from cluster...</span>
          </div>
        ) : (
          filteredLogs.map((log, i) => {
            const isError = log.includes("❌") || log.toLowerCase().includes("failed") || log.toLowerCase().includes("error:") || log.includes("fatal:");
            const isStderr = log.startsWith("[stderr]");
            const isSuccess = log.includes("✓") || log.includes("✅") || log.toLowerCase().includes("ready") || log.toLowerCase().includes("listening");
            const isInfo = log.startsWith("🛡️") || log.startsWith("ℹ️") || log.startsWith("💡") || log.startsWith("🧹") || log.startsWith("📋");
            const lineClass = isError ? "log-err" : isStderr ? "log-warn" : isSuccess ? "log-ok" : isInfo ? "log-cyan" : "";

            return (
              <div key={i} className={`svc-log-row ${lineClass}`}>
                <span className="svc-log-lineno">{String(i + 1).padStart(4, " ")}</span>
                <span className="svc-log-text">{log}</span>
              </div>
            );
          })
        )}

        {streaming && filteredLogs.length > 0 && (
          <div className="svc-log-row log-running">
            <span className="svc-log-lineno">{String(filteredLogs.length + 1).padStart(4, " ")}</span>
            <span className="svc-log-text" style={{ color: "#38bdf8", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <span className="svc-log-cursor">█</span> Container stream active...
            </span>
          </div>
        )}
      </div>

      <style>{`
        .svc-logs-card {
          background: #080c14;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 16px 40px -10px rgba(0, 0, 0, 0.7);
          width: 100%;
          transition: all 0.2s ease;
        }

        .svc-logs-fullscreen {
          position: fixed;
          inset: 1.5rem;
          z-index: 9999;
          border-radius: 14px;
          border: 1px solid rgba(56, 189, 248, 0.35);
          box-shadow: 0 25px 70px rgba(0, 0, 0, 0.95);
        }

        .svc-logs-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.6rem 1rem;
          background: rgba(15, 23, 42, 0.85);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          user-select: none;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .svc-logs-header-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .svc-logs-traffic-lights {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .svc-logs-dot {
          width: 11px;
          height: 11px;
          border-radius: 50%;
          display: inline-block;
        }
        .dot-red { background: #ff5f56; border: 1px solid rgba(224, 68, 62, 0.6); }
        .dot-yellow { background: #ffbd2e; border: 1px solid rgba(222, 161, 35, 0.6); }
        .dot-green { background: #27c93f; border: 1px solid rgba(26, 171, 41, 0.6); }

        .svc-logs-title-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .svc-logs-cyan-icon {
          color: #38bdf8;
          filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.4));
        }

        .svc-logs-title-text {
          font-size: 0.82rem;
          font-weight: 650;
          color: #f8fafc;
          letter-spacing: -0.01em;
        }

        .svc-logs-count-badge {
          font-size: 0.68rem;
          color: #64748b;
          font-family: ui-monospace, Menlo, monospace;
          background: rgba(255, 255, 255, 0.04);
          padding: 0.1rem 0.45rem;
          border-radius: 4px;
        }

        .svc-logs-status-tag {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.68rem;
          font-weight: 600;
          padding: 0.15rem 0.55rem;
          border-radius: 9999px;
        }
        .status-live {
          background: rgba(16, 185, 129, 0.12);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.25);
        }
        .status-paused {
          background: rgba(148, 163, 184, 0.12);
          color: #94a3b8;
          border: 1px solid rgba(148, 163, 184, 0.2);
        }

        .svc-logs-pulse-led {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 6px #10b981;
          animation: logsLivePulse 2s ease-in-out infinite;
        }
        @keyframes logsLivePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }

        /* Header Right Actions */
        .svc-logs-header-right {
          display: flex;
          align-items: center;
          gap: 0.45rem;
        }

        .svc-logs-search-wrap {
          display: flex;
          align-items: center;
          background: rgba(2, 6, 23, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 5px;
          padding: 0.2rem 0.5rem;
          gap: 0.35rem;
        }

        .svc-logs-search-icon {
          color: #64748b;
        }

        .svc-logs-search-input {
          background: transparent;
          border: none;
          outline: none;
          color: #f8fafc;
          font-size: 0.72rem;
          font-family: inherit;
          width: 100px;
          transition: width 0.15s ease;
        }
        .svc-logs-search-input:focus {
          width: 140px;
        }
        .svc-logs-search-input::placeholder {
          color: #475569;
        }

        .svc-logs-clear-search {
          background: transparent;
          border: none;
          color: #64748b;
          cursor: pointer;
          font-size: 0.65rem;
          padding: 0;
        }

        .svc-logs-toggle-label {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.72rem;
          color: #94a3b8;
          cursor: pointer;
          user-select: none;
          margin-right: 0.2rem;
        }

        .svc-logs-checkbox {
          accent-color: #38bdf8;
          cursor: pointer;
        }

        .svc-logs-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.22rem 0.55rem;
          font-size: 0.72rem;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 5px;
          color: #94a3b8;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s ease;
        }
        .svc-logs-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #f8fafc;
          border-color: rgba(255, 255, 255, 0.2);
        }

        .svc-logs-btn-primary {
          background: rgba(56, 189, 248, 0.12);
          border-color: rgba(56, 189, 248, 0.3);
          color: #38bdf8;
        }
        .svc-logs-btn-primary:hover {
          background: rgba(56, 189, 248, 0.22);
          color: #e0f2fe;
        }

        /* Viewport */
        .svc-logs-viewport {
          height: 440px;
          overflow-y: auto;
          overflow-x: auto;
          padding: 0.6rem 0;
          font-family: ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace;
          font-size: 0.76rem;
          line-height: 1.65;
          background: #080c14;
        }

        .logs-maximized {
          height: calc(100vh - 120px) !important;
        }

        .svc-logs-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          color: #64748b;
          padding: 3rem 1.5rem;
          font-size: 0.8125rem;
        }

        .svc-log-row {
          display: flex;
          align-items: flex-start;
          transition: background 0.1s ease;
        }
        .svc-log-row:hover {
          background: rgba(255, 255, 255, 0.035);
        }

        .svc-log-lineno {
          color: #334155;
          padding: 0 0.85rem 0 0.75rem;
          user-select: none;
          flex-shrink: 0;
          min-width: 3.2rem;
          text-align: right;
          white-space: pre;
          border-right: 1px solid rgba(255, 255, 255, 0.05);
        }

        .svc-log-text {
          color: #cbd5e1;
          word-break: break-word;
          flex: 1;
          padding: 0 1rem;
        }

        .log-warn .svc-log-text { color: #facc15; }
        .log-ok .svc-log-text { color: #4ade80; }
        .log-err .svc-log-text { color: #f87171; font-weight: 500; }
        .log-cyan .svc-log-text { color: #38bdf8; }

        .svc-log-cursor {
          animation: logsBlink 1s step-end infinite;
        }
        @keyframes logsBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        /* Custom Scrollbar */
        .svc-logs-viewport::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .svc-logs-viewport::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
        }
        .svc-logs-viewport::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 3px;
        }
        .svc-logs-viewport::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }

        @media (max-width: 768px) {
          .btn-text {
            display: none;
          }
          .svc-logs-search-wrap {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
