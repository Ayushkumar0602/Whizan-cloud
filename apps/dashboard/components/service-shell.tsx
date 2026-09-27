"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getAccessToken } from "@/lib/api";
import { Terminal as TerminalIcon, Loader2, RefreshCw, Trash2, ShieldCheck, AlertCircle, Play, CornerDownLeft, Sparkles } from "lucide-react";
import "@xterm/xterm/css/xterm.css";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://whizan-cloud-service.onrender.com";

export function ServiceShell({ serviceId, slug }: { serviceId: string; slug: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting");
  const [containerInfo, setContainerInfo] = useState<{ container: string; workingDir: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const connect = useCallback((cols: number = 100, rows: number = 24) => {
    if (!serviceId) return;

    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    const token = getAccessToken();
    if (!token) {
      setStatus("error");
      setErrorMessage("Not authenticated. Please log in.");
      return;
    }

    setStatus("connecting");
    setErrorMessage(null);

    // Derive WS URL from API_BASE
    const baseClean = API_BASE.replace(/^http/, "ws");
    const wsUrl = `${baseClean}/api/services/${serviceId}/exec?token=${encodeURIComponent(token)}&cols=${cols}&rows=${rows}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "connected") {
          setStatus("connected");
          setContainerInfo({ container: msg.container, workingDir: msg.workingDir });
          if (termRef.current) {
            termRef.current.focus();
            if (fitAddonRef.current) {
              fitAddonRef.current.fit();
              ws.send(JSON.stringify({
                type: "resize",
                cols: termRef.current.cols,
                rows: termRef.current.rows,
              }));
            }
          }
        } else if (msg.type === "output") {
          if (termRef.current) {
            termRef.current.write(msg.data);
          }
        } else if (msg.type === "exit") {
          setStatus("disconnected");
          if (termRef.current) {
            termRef.current.write("\r\n\x1b[33m[Session disconnected: Container process exited]\x1b[0m\r\n");
          }
        } else if (msg.type === "error") {
          setStatus("error");
          setErrorMessage(msg.message);
          if (termRef.current) {
            termRef.current.write(`\r\n\x1b[31m[Error: ${msg.message}]\x1b[0m\r\n`);
          }
        }
      } catch (err) {
        if (termRef.current) {
          termRef.current.write(event.data);
        }
      }
    };

    ws.onerror = () => {
      setStatus("error");
      setErrorMessage("Failed to establish WebSocket connection with container.");
    };

    ws.onclose = (e) => {
      if (e.code !== 1000) {
        setStatus("disconnected");
      }
    };
  }, [serviceId]);

  useEffect(() => {
    let term: any = null;
    let fitAddon: any = null;
    let resizeObserver: ResizeObserver | null = null;
    let isDisposed = false;

    async function initTerminal() {
      if (!containerRef.current) return;

      // 1. Explicitly clear any existing elements from previous mounts (React StrictMode fix)
      containerRef.current.innerHTML = "";

      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");

      if (isDisposed) return;

      term = new Terminal({
        cursorBlink: true,
        cursorStyle: "bar",
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Geist Mono", Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.3,
        scrollback: 5000,
        convertEol: true,
        theme: {
          background: "#080b11",
          foreground: "#e6edf3",
          cursor: "#38bdf8",
          cursorAccent: "#080b11",
          selectionBackground: "#334155",
          black: "#0f172a",
          red: "#ef4444",
          green: "#22c55e",
          yellow: "#eab308",
          blue: "#3b82f6",
          magenta: "#a855f7",
          cyan: "#06b6d4",
          white: "#f8fafc",
          brightBlack: "#475569",
          brightRed: "#f87171",
          brightGreen: "#4ade80",
          brightYellow: "#fde047",
          brightBlue: "#60a5fa",
          brightMagenta: "#c084fc",
          brightCyan: "#22d3ee",
          brightWhite: "#ffffff",
        },
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      // Open terminal in clean container
      term.open(containerRef.current);
      fitAddon.fit();

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      // Handle user typing
      term.onData((data: string) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "input", data }));
        }
      });

      // Handle window/container auto-resizing
      resizeObserver = new ResizeObserver(() => {
        try {
          if (fitAddonRef.current && termRef.current) {
            fitAddonRef.current.fit();
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: "resize",
                cols: termRef.current.cols,
                rows: termRef.current.rows,
              }));
            }
          }
        } catch {}
      });

      resizeObserver.observe(containerRef.current);

      // Connect WebSocket with current dimensions
      connect(term.cols || 100, term.rows || 24);
    }

    initTerminal();

    return () => {
      isDisposed = true;
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (term) {
        try { term.dispose(); } catch {}
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [connect]);

  function handleClear() {
    if (termRef.current) {
      termRef.current.clear();
      termRef.current.focus();
    }
  }

  function handleReconnect() {
    if (termRef.current) {
      termRef.current.reset();
    }
    const cols = termRef.current?.cols || 100;
    const rows = termRef.current?.rows || 24;
    connect(cols, rows);
  }

  function sendQuickCommand(cmd: string) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input", data: `${cmd}\n` }));
      if (termRef.current) termRef.current.focus();
    }
  }

  return (
    <div className="shell-panel">
      {/* macOS Style Window Title Bar */}
      <div className="shell-titlebar">
        {/* Window controls (traffic lights) */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span className="dot dot-close" />
          <span className="dot dot-min" />
          <span className="dot dot-expand" />
          <span style={{ marginLeft: "6px", fontSize: "0.78rem", fontWeight: 600, color: "var(--foreground)", display: "flex", alignItems: "center", gap: "5px" }}>
            <TerminalIcon size={13} style={{ color: "#38bdf8" }} />
            <span>Interactive Web Shell</span>
          </span>
        </div>

        {/* Center Container & Path Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {containerInfo && (
            <div className="container-pill" title={`Working Directory: ${containerInfo.workingDir}`}>
              <ShieldCheck size={11} style={{ color: "#38bdf8" }} />
              <span className="container-name">{containerInfo.container}</span>
              <span className="container-path">{containerInfo.workingDir}</span>
            </div>
          )}
        </div>

        {/* Status Pill & Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          {status === "connecting" && (
            <span className="status-pill status-connecting">
              <Loader2 size={11} className="spin-icon" /> Connecting...
            </span>
          )}
          {status === "connected" && (
            <span className="status-pill status-connected">
              <span className="pulse-dot" /> Live Session (Sandbox)
            </span>
          )}
          {status === "disconnected" && (
            <span className="status-pill status-disconnected">
              Offline
            </span>
          )}
          {status === "error" && (
            <span className="status-pill status-error" title={errorMessage || ""}>
              <AlertCircle size={11} /> Failed
            </span>
          )}

          <button
            onClick={handleClear}
            className="titlebar-btn"
            title="Clear terminal output"
          >
            <Trash2 size={11} /> Clear
          </button>

          {(status === "disconnected" || status === "error") && (
            <button
              onClick={handleReconnect}
              className="titlebar-btn titlebar-btn-primary"
              title="Reconnect to container"
            >
              <RefreshCw size={11} /> Reconnect
            </button>
          )}
        </div>
      </div>

      {/* Quick Helper Shortcuts Bar */}
      <div className="shell-shortcuts">
        <span style={{ fontSize: "0.6875rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <Sparkles size={11} style={{ color: "var(--accent)" }} /> Quick commands:
        </span>
        <button onClick={() => sendQuickCommand("ls -la")} className="shortcut-tag" title="List all files in current directory">ls -la</button>
        <button onClick={() => sendQuickCommand("pwd")} className="shortcut-tag" title="Print working directory">pwd</button>
        <button onClick={() => sendQuickCommand("node -v 2>/dev/null || python3 --version 2>/dev/null || echo 'No runtime'")} className="shortcut-tag" title="Check active runtime version">runtime -v</button>
        <button onClick={() => sendQuickCommand("printenv | grep -E 'PORT|HOST|NODE_ENV|PATH'")} className="shortcut-tag" title="Print filtered environment variables">printenv</button>
        <button onClick={() => sendQuickCommand("top -b -n 1 | head -n 12")} className="shortcut-tag" title="Process monitor snapshot">top</button>
        <button onClick={() => sendQuickCommand("df -h /app")} className="shortcut-tag" title="Disk space usage">df -h</button>
      </div>

      {/* Terminal Viewport */}
      <div className="shell-viewport-wrapper">
        <div className="shell-viewport" ref={containerRef} />
      </div>

      <style>{`
        .shell-panel {
          background: #080b11;
          border: 1px solid var(--card-border);
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
          width: 100%;
        }

        /* macOS Window Title Bar */
        .shell-titlebar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.625rem 1rem;
          background: #0d121c;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          user-select: none;
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
        }
        .dot-close { background: #ff5f56; }
        .dot-min { background: #ffbd2e; }
        .dot-expand { background: #27c93f; }

        .container-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(56, 189, 248, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.2);
          border-radius: 4px;
          padding: 0.2rem 0.55rem;
          font-family: ui-monospace, Menlo, monospace;
          font-size: 0.72rem;
        }
        .container-name {
          color: #38bdf8;
          font-weight: 600;
        }
        .container-path {
          color: #94a3b8;
          padding-left: 0.3rem;
          border-left: 1px solid rgba(255, 255, 255, 0.1);
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.7rem;
          font-weight: 500;
          padding: 0.15rem 0.5rem;
          border-radius: 12px;
        }
        .status-connected {
          background: rgba(34, 197, 94, 0.12);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.25);
        }
        .status-connecting {
          background: rgba(234, 179, 8, 0.12);
          color: #fde047;
          border: 1px solid rgba(234, 179, 8, 0.25);
        }
        .status-disconnected {
          background: rgba(148, 163, 184, 0.12);
          color: #94a3b8;
          border: 1px solid rgba(148, 163, 184, 0.2);
        }
        .status-error {
          background: rgba(239, 68, 68, 0.12);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.25);
        }

        .pulse-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #4ade80;
          box-shadow: 0 0 6px #22c55e;
          animation: livePulse 2s ease-in-out infinite;
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }

        .titlebar-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.25rem 0.6rem;
          font-size: 0.72rem;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .titlebar-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #f1f5f9;
        }
        .titlebar-btn-primary {
          background: rgba(56, 189, 248, 0.15);
          border-color: rgba(56, 189, 248, 0.3);
          color: #38bdf8;
        }
        .titlebar-btn-primary:hover {
          background: rgba(56, 189, 248, 0.25);
          color: #e0f2fe;
        }

        /* Shortcuts Bar */
        .shell-shortcuts {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.35rem 1rem;
          background: #090d14;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          overflow-x: auto;
        }
        .shortcut-tag {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 3px;
          color: #94a3b8;
          font-family: ui-monospace, Menlo, monospace;
          font-size: 0.6875rem;
          padding: 0.18rem 0.5rem;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.12s ease;
        }
        .shortcut-tag:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #f1f5f9;
          border-color: rgba(255, 255, 255, 0.2);
        }

        /* Terminal Viewport Area */
        .shell-viewport-wrapper {
          height: 420px;
          background: #080b11;
          position: relative;
          overflow: hidden;
        }
        .shell-viewport {
          width: 100%;
          height: 100%;
        }
        .shell-viewport .xterm {
          height: 100%;
          padding: 12px 14px;
          box-sizing: border-box;
        }
        .shell-viewport .xterm-viewport {
          background-color: transparent !important;
        }
      `}</style>
    </div>
  );
}
