"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getAccessToken, getApiBase } from "@/lib/api";
import {
  Terminal as TerminalIcon,
  Loader2,
  RefreshCw,
  Trash2,
  ShieldCheck,
  AlertCircle,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Sparkles,
  Command,
} from "lucide-react";
import "@xterm/xterm/css/xterm.css";

export function ServiceShell({ serviceId, slug }: { serviceId: string; slug: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting");
  const [containerInfo, setContainerInfo] = useState<{ container: string; workingDir: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

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

    // Derive WS URL from API base
    const baseClean = getApiBase().replace(/^http/, "ws");
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

      containerRef.current.innerHTML = "";

      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");

      if (isDisposed) return;

      term = new Terminal({
        cursorBlink: true,
        cursorStyle: "bar",
        fontFamily: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.4,
        scrollback: 5000,
        convertEol: true,
        theme: {
          background: "#080c14",
          foreground: "#e2e8f0",
          cursor: "#38bdf8",
          cursorAccent: "#080c14",
          selectionBackground: "rgba(56, 189, 248, 0.25)",
          black: "#0f172a",
          red: "#f87171",
          green: "#4ade80",
          yellow: "#facc15",
          blue: "#60a5fa",
          magenta: "#c084fc",
          cyan: "#38bdf8",
          white: "#f8fafc",
          brightBlack: "#475569",
          brightRed: "#fca5a5",
          brightGreen: "#86efac",
          brightYellow: "#fde047",
          brightBlue: "#93c5fd",
          brightMagenta: "#d8b4fe",
          brightCyan: "#67e8f9",
          brightWhite: "#ffffff",
        },
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

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

      // Handle container resizing
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

  function handleCopyOutput() {
    if (termRef.current) {
      termRef.current.selectAll();
      const selection = termRef.current.getSelection();
      navigator.clipboard.writeText(selection);
      termRef.current.clearSelection();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function sendQuickCommand(cmd: string) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input", data: `${cmd}\n` }));
      if (termRef.current) termRef.current.focus();
    }
  }

  return (
    <div className={`svc-shell-container ${isMaximized ? "svc-shell-fullscreen" : ""}`}>
      {/* Title Bar with macOS Window Controls */}
      <div className="svc-shell-topbar">
        {/* Left: Window Controls + Title */}
        <div className="svc-shell-topbar-left">
          <div className="svc-shell-traffic-lights">
            <span className="svc-shell-dot dot-red" />
            <span className="svc-shell-dot dot-yellow" />
            <span className="svc-shell-dot dot-green" />
          </div>

          <div className="svc-shell-title-box">
            <TerminalIcon size={14} className="svc-shell-cyan-icon" />
            <span className="svc-shell-title-text">Interactive Container Shell</span>
          </div>

          {containerInfo && (
            <div className="svc-shell-container-tag" title={`Container ID: ${containerInfo.container} | Path: ${containerInfo.workingDir}`}>
              <ShieldCheck size={11} style={{ color: "#38bdf8" }} />
              <span className="svc-shell-container-id">{containerInfo.container.slice(0, 12)}</span>
              <span className="svc-shell-container-dir">{containerInfo.workingDir}</span>
            </div>
          )}
        </div>

        {/* Right: Status Pill & Actions */}
        <div className="svc-shell-topbar-right">
          {status === "connecting" && (
            <span className="svc-shell-status-pill status-connecting">
              <Loader2 size={11} className="spin-icon" /> Connecting...
            </span>
          )}
          {status === "connected" && (
            <span className="svc-shell-status-pill status-connected">
              <span className="svc-shell-pulse-led" /> Live Sandbox
            </span>
          )}
          {status === "disconnected" && (
            <span className="svc-shell-status-pill status-disconnected">
              Offline
            </span>
          )}
          {status === "error" && (
            <span className="svc-shell-status-pill status-error" title={errorMessage || ""}>
              <AlertCircle size={11} /> Failed
            </span>
          )}

          <button
            onClick={handleCopyOutput}
            className="svc-shell-btn"
            title="Copy Terminal Selection / Output"
          >
            {copied ? <Check size={12} style={{ color: "#10b981" }} /> : <Copy size={12} />}
            <span className="btn-label">{copied ? "Copied" : "Copy"}</span>
          </button>

          <button
            onClick={handleClear}
            className="svc-shell-btn"
            title="Clear terminal screen"
          >
            <Trash2 size={12} />
            <span className="btn-label">Clear</span>
          </button>

          {(status === "disconnected" || status === "error") && (
            <button
              onClick={handleReconnect}
              className="svc-shell-btn svc-shell-btn-primary"
              title="Reconnect WebSocket"
            >
              <RefreshCw size={12} />
              <span className="btn-label">Reconnect</span>
            </button>
          )}

          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="svc-shell-btn"
            title={isMaximized ? "Restore Height" : "Maximize Screen"}
          >
            {isMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>
      </div>

      {/* Quick Helper Shortcuts Bar */}
      <div className="svc-shell-shortcuts-bar">
        <span className="svc-shell-shortcuts-label">
          <Sparkles size={11} style={{ color: "#38bdf8" }} />
          <span>HELPERS:</span>
        </span>
        <button onClick={() => sendQuickCommand("ls -la")} className="svc-shell-chip">ls -la</button>
        <button onClick={() => sendQuickCommand("pwd")} className="svc-shell-chip">pwd</button>
        <button onClick={() => sendQuickCommand("ps aux")} className="svc-shell-chip">ps aux</button>
        <button onClick={() => sendQuickCommand("printenv | grep -E 'PORT|HOST|NODE_ENV|PATH'")} className="svc-shell-chip">printenv</button>
        <button onClick={() => sendQuickCommand("df -h /app 2>/dev/null || df -h")} className="svc-shell-chip">df -h</button>
        <button onClick={() => sendQuickCommand("node -v 2>/dev/null || python3 --version 2>/dev/null || dotnet --version 2>/dev/null || php -v 2>/dev/null || echo 'OK'")} className="svc-shell-chip">runtime -v</button>
      </div>

      {/* Terminal Viewport */}
      <div className={`svc-shell-viewport-box ${isMaximized ? "viewport-maximized" : ""}`}>
        <div className="svc-shell-viewport" ref={containerRef} />
      </div>

      <style>{`
        .svc-shell-container {
          background: #080c14;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 16px 40px -10px rgba(0, 0, 0, 0.7);
          width: 100%;
          transition: all 0.2s ease;
        }

        .svc-shell-fullscreen {
          position: fixed;
          inset: 1.5rem;
          z-index: 9999;
          border-radius: 14px;
          border: 1px solid rgba(56, 189, 248, 0.35);
          box-shadow: 0 25px 70px rgba(0, 0, 0, 0.95);
        }

        /* Titlebar */
        .svc-shell-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.6rem 1rem;
          background: rgba(15, 23, 42, 0.85);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          user-select: none;
        }

        .svc-shell-topbar-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .svc-shell-traffic-lights {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .svc-shell-dot {
          width: 11px;
          height: 11px;
          border-radius: 50%;
          display: inline-block;
        }
        .dot-red { background: #ff5f56; border: 1px solid rgba(224, 68, 62, 0.6); }
        .dot-yellow { background: #ffbd2e; border: 1px solid rgba(222, 161, 35, 0.6); }
        .dot-green { background: #27c93f; border: 1px solid rgba(26, 171, 41, 0.6); }

        .svc-shell-title-box {
          display: flex;
          align-items: center;
          gap: 0.45rem;
        }

        .svc-shell-cyan-icon {
          color: #38bdf8;
          filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.4));
        }

        .svc-shell-title-text {
          font-size: 0.82rem;
          font-weight: 650;
          color: #f8fafc;
          letter-spacing: -0.01em;
        }

        .svc-shell-container-tag {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(56, 189, 248, 0.08);
          border: 1px solid rgba(56, 189, 248, 0.2);
          border-radius: 5px;
          padding: 0.2rem 0.55rem;
          font-family: ui-monospace, Menlo, monospace;
          font-size: 0.72rem;
        }

        .svc-shell-container-id {
          color: #38bdf8;
          font-weight: 600;
        }

        .svc-shell-container-dir {
          color: #94a3b8;
          padding-left: 0.3rem;
          border-left: 1px solid rgba(255, 255, 255, 0.1);
        }

        /* Topbar Right Actions */
        .svc-shell-topbar-right {
          display: flex;
          align-items: center;
          gap: 0.45rem;
        }

        .svc-shell-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.7rem;
          font-weight: 600;
          padding: 0.2rem 0.6rem;
          border-radius: 9999px;
        }
        .status-connected {
          background: rgba(16, 185, 129, 0.12);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.25);
        }
        .status-connecting {
          background: rgba(245, 158, 11, 0.12);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.25);
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

        .svc-shell-pulse-led {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 6px #10b981;
          animation: svcLivePulse 2s ease-in-out infinite;
        }
        @keyframes svcLivePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }

        .svc-shell-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.22rem 0.6rem;
          font-size: 0.72rem;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 5px;
          color: #94a3b8;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s ease;
        }
        .svc-shell-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #f8fafc;
          border-color: rgba(255, 255, 255, 0.18);
        }

        .svc-shell-btn-primary {
          background: rgba(56, 189, 248, 0.12);
          border-color: rgba(56, 189, 248, 0.3);
          color: #38bdf8;
        }
        .svc-shell-btn-primary:hover {
          background: rgba(56, 189, 248, 0.22);
          color: #e0f2fe;
        }

        /* Shortcuts Bar */
        .svc-shell-shortcuts-bar {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.35rem 1rem;
          background: rgba(2, 6, 23, 0.7);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          overflow-x: auto;
        }

        .svc-shell-shortcuts-label {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          font-size: 0.68rem;
          font-weight: 700;
          color: #64748b;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }

        .svc-shell-chip {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 4px;
          color: #38bdf8;
          font-family: ui-monospace, Menlo, monospace;
          font-size: 0.7rem;
          padding: 0.15rem 0.55rem;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.12s ease;
        }
        .svc-shell-chip:hover {
          background: rgba(56, 189, 248, 0.14);
          color: #f0f9ff;
          border-color: rgba(56, 189, 248, 0.35);
          transform: translateY(-1px);
        }

        /* Viewport Area */
        .svc-shell-viewport-box {
          height: 440px;
          background: #080c14;
          position: relative;
          overflow: hidden;
        }

        .viewport-maximized {
          height: calc(100vh - 120px) !important;
        }

        .svc-shell-viewport {
          width: 100%;
          height: 100%;
        }

        .svc-shell-viewport .xterm {
          height: 100%;
          padding: 12px 14px;
          box-sizing: border-box;
        }

        .svc-shell-viewport .xterm-viewport {
          background-color: transparent !important;
        }

        @media (max-width: 768px) {
          .btn-label {
            display: none;
          }
          .svc-shell-container-tag {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
