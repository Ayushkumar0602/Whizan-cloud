"use client";

import { useState, useEffect } from "react";
import { admin } from "@/lib/api";
import { Terminal, Copy, Check, Radio } from "lucide-react";
import { toast } from "sonner";

export default function LogsPage() {
  const [logType, setLogType] = useState<{ service: "worker" | "router"; type: "out" | "err" } | null>({
    service: "worker",
    type: "out",
  });
  const [logs, setLogs] = useState<string>("Loading logs...");
  const [isLive, setIsLive] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!logType || !isLive) return;
    setLogs("Fetching live process logs from PM2 daemon...");
    admin.getLogs(logType.service, logType.type)
      .then(data => setLogs(data.logs))
      .catch(() => setLogs("Failed to connect to process logger"));

    const interval = setInterval(() => {
      admin.getLogs(logType.service, logType.type).then(data => setLogs(data.logs));
    }, 2500);
    return () => clearInterval(interval);
  }, [logType, isLive]);

  function copyLogs() {
    navigator.clipboard.writeText(logs);
    setCopied(true);
    toast.success("Logs copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div className="terminal-panel-card">
        <div className="terminal-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
            <Terminal size={16} className="text-accent" />
            <span style={{ fontWeight: 650, fontSize: "0.88rem" }}>Host Daemon Process Logs</span>
            {isLive && logType && (
              <span className="live-stream-badge">
                <span className="live-stream-dot" /> Streaming (2.5s)
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
            <select
              className="input mono"
              style={{ width: "auto", padding: "0.4rem 0.75rem", fontSize: "0.8rem", height: 36 }}
              value={logType ? `${logType.service}:${logType.type}` : ""}
              onChange={e => {
                if (!e.target.value) setLogType(null);
                else {
                  const [s, t] = e.target.value.split(":");
                  setLogType({ service: s as "worker" | "router", type: t as "out" | "err" });
                }
              }}
            >
              <option value="worker:out">Worker Service (Stdout)</option>
              <option value="worker:err">Worker Service (Errors)</option>
              <option value="router:out">Edge Router Proxy (Stdout)</option>
              <option value="router:err">Edge Router Proxy (Errors)</option>
            </select>

            {logType && (
              <button
                onClick={() => setIsLive(!isLive)}
                className={`btn-stream-toggle ${isLive ? "toggle-live" : "toggle-paused"}`}
              >
                {isLive ? "Live: ON" : "Live: PAUSED"}
              </button>
            )}

            <button onClick={copyLogs} className="btn-terminal-copy">
              {copied ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>

        <div className="terminal-output-body">
          {logType ? (
            <pre className="terminal-pre mono">{logs || "No logs output recorded."}</pre>
          ) : (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
              Select a process log stream above to begin streaming.
            </div>
          )}
        </div>
      </div>

      <style>{`
        .terminal-panel-card {
          background: #0f172a;
          border: 1px solid var(--card-border);
          border-radius: var(--radius);
          overflow: hidden;
          box-shadow: var(--shadow);
        }
        .terminal-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.85rem 1.25rem;
          background: var(--card);
          border-bottom: 1px solid var(--card-border);
          gap: 1rem;
          flex-wrap: wrap;
        }
        .live-stream-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.72rem;
          color: #10b981;
          font-weight: 600;
        }
        .live-stream-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 6px #10b981;
          animation: pulseGlow 1.8s infinite;
        }

        .btn-stream-toggle {
          padding: 0.35rem 0.65rem;
          border-radius: 6px;
          font-size: 0.76rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          border: 1px solid transparent;
        }
        .toggle-live {
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
          border-color: rgba(16, 185, 129, 0.3);
        }
        .toggle-paused {
          background: var(--bg-inset);
          color: var(--muted);
          border-color: var(--card-border);
        }

        .btn-terminal-copy {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.35rem 0.65rem;
          border-radius: 6px;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          color: var(--muted);
          font-size: 0.76rem;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-terminal-copy:hover {
          color: var(--foreground);
          background: var(--card-hover);
        }

        .terminal-output-body {
          height: 600px;
          overflow-y: auto;
          padding: 1.25rem;
          background: #0f172a;
        }
        .terminal-pre {
          color: #34d399;
          font-size: 0.8125rem;
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
          margin: 0;
        }
      `}</style>
    </>
  );
}
