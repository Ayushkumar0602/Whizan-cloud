"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { accountTerminal } from "@/lib/api";
import {
  Terminal as TerminalIcon,
  X,
  Maximize2,
  Minimize2,
  Trash2,
  Copy,
  Check,
} from "lucide-react";

interface AccountTerminalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CommandEntry {
  command: string;
  output: string;
  exitCode: number;
  timestamp: string;
}

const WELCOME_BANNER = `Whizan Cloud Shell v2.5 (compute + storage scope)\r\nType 'help' for available commands, or try 'storage', 'services', 'stats'.\r\n`;

export function AccountTerminal({ isOpen, onClose }: AccountTerminalProps) {
  const { user } = useAuth();
  const [history, setHistory] = useState<CommandEntry[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [copied, setCopied] = useState(false);

  // Command history navigation (Arrow Up / Down)
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const userHandle = user?.email?.split("@")[0] || "developer";

  // Auto-scroll to bottom on history change
  useEffect(() => {
    if (isOpen && !minimized) {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [history, isOpen, minimized]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !minimized) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, minimized]);

  // Keyboard shortcut (Escape to close or minimize)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === "Escape") {
        if (maximized) setMaximized(false);
        else if (minimized) setMinimized(false);
        else onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, minimized, maximized, onClose]);

  const executeCommand = useCallback(async (rawCmd: string) => {
    const trimmed = rawCmd.trim();
    if (!trimmed) return;

    // Local clear command
    if (trimmed.toLowerCase() === "clear") {
      setHistory([]);
      setInputVal("");
      setCommandHistory(prev => [trimmed, ...prev.filter(c => c !== trimmed)]);
      setHistoryIndex(-1);
      return;
    }

    // Local exit command
    if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
      onClose();
      return;
    }

    setLoading(true);
    setInputVal("");
    setCommandHistory(prev => [trimmed, ...prev.filter(c => c !== trimmed)]);
    setHistoryIndex(-1);

    try {
      const res = await accountTerminal.exec(trimmed);
      if (res.clear) {
        setHistory([]);
      } else if (res.exit) {
        onClose();
      } else {
        setHistory(prev => [
          ...prev,
          {
            command: trimmed,
            output: res.output,
            exitCode: res.exitCode,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          },
        ]);
      }
    } catch (err: any) {
      setHistory(prev => [
        ...prev,
        {
          command: trimmed,
          output: `\x1b[31mExecution Error: ${err.message || "Failed to communicate with Whizan Cloud API"}\x1b[0m\r\n`,
          exitCode: 1,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [onClose]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      executeCommand(inputVal);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIndex = historyIndex + 1 < commandHistory.length ? historyIndex + 1 : historyIndex;
      setHistoryIndex(nextIndex);
      setInputVal(commandHistory[nextIndex] || "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setInputVal("");
      } else {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setInputVal(commandHistory[nextIndex] || "");
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      // Auto-complete basic commands
      const cmds = [
        "help",
        "storage",
        "buckets",
        "bucket",
        "services",
        "projects",
        "service",
        "project",
        "redeploy",
        "restart",
        "logs",
        "status",
        "stats",
        "whoami",
        "clear",
        "exit",
      ];
      const match = cmds.find(c => c.startsWith(inputVal.toLowerCase()));
      if (match) setInputVal(match);
    }
  };

  const handleCopyAll = () => {
    const rawText = history.map(h => `$ ${h.command}\n${stripAnsi(h.output)}`).join("\n\n");
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      className={`whz-term-drawer ${minimized ? "whz-term-minimized" : ""} ${maximized ? "whz-term-maximized" : ""}`}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Terminal Title Bar */}
      <div className="whz-term-header" onClick={e => e.stopPropagation()}>
        {/* Left: Window Controls & Title */}
        <div className="whz-term-header-left">
          <div className="whz-term-traffic-lights">
            <button
              className="whz-term-dot dot-close"
              onClick={onClose}
              title="Close Terminal (Esc)"
              aria-label="Close"
            />
            <button
              className="whz-term-dot dot-minimize"
              onClick={() => setMinimized(!minimized)}
              title={minimized ? "Restore Terminal" : "Minimize Terminal"}
              aria-label="Minimize"
            />
            <button
              className="whz-term-dot dot-maximize"
              onClick={() => {
                setMinimized(false);
                setMaximized(!maximized);
              }}
              title={maximized ? "Restore Height" : "Maximize Fullscreen"}
              aria-label="Maximize"
            />
          </div>

          <div className="whz-term-title-group">
            <TerminalIcon size={14} className="whz-term-icon" />
            <span className="whz-term-title">Cloud Shell</span>
            <span className="whz-term-badge">account</span>
          </div>
        </div>

        {/* Center: Session Details */}
        <div className="whz-term-session-badge">
          <span className="whz-term-pulse-dot" />
          <span className="whz-term-user-text">{userHandle}@whizan.cloud</span>
        </div>

        {/* Right: Actions */}
        <div className="whz-term-header-right">
          <button
            className="whz-term-btn"
            onClick={handleCopyAll}
            title="Copy Terminal Output"
          >
            {copied ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
            <span className="whz-term-btn-text">{copied ? "Copied" : "Copy"}</span>
          </button>
          <button
            className="whz-term-btn"
            onClick={() => setHistory([])}
            title="Clear Terminal Screen (clear)"
          >
            <Trash2 size={13} />
            <span className="whz-term-btn-text">Clear</span>
          </button>
          <button
            className="whz-term-btn"
            onClick={() => {
              setMinimized(false);
              setMaximized(!maximized);
            }}
            title={maximized ? "Restore Height" : "Maximize"}
          >
            {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            className="whz-term-btn whz-term-btn-close"
            onClick={onClose}
            title="Close Terminal"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Terminal Screen / Output Body */}
      {!minimized && (
        <div className="whz-term-screen" ref={scrollContainerRef}>
          {/* Welcome Banner */}
          <div className="whz-term-banner">
            <span dangerouslySetInnerHTML={{ __html: ansiToHtml(WELCOME_BANNER) }} />
          </div>

          {/* History Entries */}
          {history.map((entry, idx) => (
            <div key={idx} className="whz-term-entry">
              <div className="whz-term-entry-header">
                <div className="whz-term-prompt-line">
                  <span className="whz-term-user">{userHandle}@whizan</span>
                  <span className="whz-term-path">:~$</span>
                  <span className="whz-term-cmd">{entry.command}</span>
                </div>
                <span className="whz-term-time">{entry.timestamp}</span>
              </div>
              <div className="whz-term-entry-body">
                <span dangerouslySetInnerHTML={{ __html: ansiToHtml(entry.output) }} />
              </div>
            </div>
          ))}

          {/* Quick Action Suggestion Chips */}
          <div className="whz-term-chips">
            {[
              { label: "help", cmd: "help" },
              { label: "storage", cmd: "storage" },
              { label: "storage usage", cmd: "storage usage" },
              { label: "storage keys", cmd: "storage keys" },
              { label: "services", cmd: "services" },
              { label: "projects", cmd: "projects" },
              { label: "stats", cmd: "stats" },
            ].map(chip => (
              <button
                key={chip.cmd}
                type="button"
                className="whz-term-chip"
                onClick={() => {
                  setInputVal(chip.cmd);
                  executeCommand(chip.cmd);
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Active Live Input Line */}
          <div className="whz-term-input-row">
            <div className="whz-term-input-prompt">
              <span className="whz-term-user">{userHandle}@whizan</span>
              <span className="whz-term-path">:~$</span>
            </div>

            <div className="whz-term-input-wrapper">
              <input
                ref={inputRef}
                type="text"
                className="whz-term-cli-input"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                placeholder={loading ? "Executing..." : "Type command..."}
              />
              {loading && <span className="whz-term-loading-spinner" />}
            </div>
          </div>

          <div ref={terminalEndRef} style={{ height: "16px" }} />
        </div>
      )}

      <style>{`
        /* Desktop: sits in the right container, never covering the sidebar */
        .whz-term-drawer {
          position: fixed;
          bottom: 0;
          right: 0;
          left: 254px;
          height: 360px;
          background: #090d16;
          border-top: 1px solid #1e293b;
          box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.45);
          display: flex;
          flex-direction: column;
          z-index: 45;
          font-family: ui-monospace, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
          color: #e2e8f0;
          transition: left 0.2s cubic-bezier(0.16, 1, 0.3, 1), height 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          animation: slideUpTerminal 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }

        @keyframes slideUpTerminal {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }

        /* When sidebar is collapsed */
        .dash-shell-collapsed .whz-term-drawer {
          left: 62px;
        }

        .whz-term-minimized {
          height: 38px !important;
        }

        .whz-term-maximized {
          height: calc(100vh - 40px) !important;
        }

        /* Terminal Header Bar */
        .whz-term-header {
          height: 38px;
          min-height: 38px;
          background: #0d131f;
          border-bottom: 1px solid #1e293b;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 0.85rem;
          user-select: none;
        }

        .whz-term-header-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .whz-term-traffic-lights {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .whz-term-dot {
          width: 11px;
          height: 11px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          transition: transform 0.12s ease;
          padding: 0;
        }
        .whz-term-dot:hover {
          transform: scale(1.12);
        }

        .dot-close {
          background: #ef4444;
        }
        .dot-minimize {
          background: #f59e0b;
        }
        .dot-maximize {
          background: #10b981;
        }

        .whz-term-title-group {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          margin-left: 0.25rem;
        }

        .whz-term-icon {
          color: #38bdf8;
        }

        .whz-term-title {
          font-weight: 600;
          font-size: 0.8rem;
          color: #f1f5f9;
          letter-spacing: -0.01em;
        }

        .whz-term-badge {
          font-size: 0.62rem;
          font-weight: 600;
          background: rgba(56, 189, 248, 0.12);
          color: #38bdf8;
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
          border: 1px solid rgba(56, 189, 248, 0.25);
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        /* Center Session Pill */
        .whz-term-session-badge {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(255, 255, 255, 0.04);
          padding: 0.2rem 0.65rem;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 0.72rem;
          color: #94a3b8;
        }

        .whz-term-pulse-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
        }

        .whz-term-user-text {
          font-weight: 500;
          color: #cbd5e1;
        }

        /* Right Actions */
        .whz-term-header-right {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }

        .whz-term-btn {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          height: 25px;
          padding: 0 0.5rem;
          border-radius: 5px;
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          cursor: pointer;
          font-size: 0.72rem;
          font-family: inherit;
          transition: all 0.12s ease;
        }

        .whz-term-btn:hover {
          color: #f8fafc;
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.16);
        }

        .whz-term-btn-close:hover {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.3);
        }

        /* Terminal Screen Viewport */
        .whz-term-screen {
          flex: 1;
          overflow-y: auto;
          overflow-x: auto;
          padding: 0.85rem 1.15rem;
          background: #090d16;
          font-size: 0.8125rem;
          line-height: 1.55;
          color: #cbd5e1;
        }

        .whz-term-banner {
          margin-bottom: 0.85rem;
          color: #94a3b8;
          font-size: 0.8rem;
          white-space: pre-wrap;
          word-break: break-word;
        }

        /* History Entry */
        .whz-term-entry {
          margin-bottom: 0.85rem;
        }

        .whz-term-entry-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.25rem;
        }

        .whz-term-prompt-line {
          display: flex;
          align-items: center;
          gap: 0.2rem;
          font-weight: 500;
        }

        .whz-term-user {
          color: #10b981;
          font-weight: 600;
        }

        .whz-term-path {
          color: #60a5fa;
        }

        .whz-term-cmd {
          color: #f8fafc;
          font-weight: 600;
          margin-left: 0.35rem;
        }

        .whz-term-time {
          font-size: 0.68rem;
          color: #475569;
          font-family: inherit;
        }

        .whz-term-entry-body {
          padding-left: 0.25rem;
          white-space: pre-wrap;
          word-break: break-word;
        }

        /* Quick Suggestion Chips */
        .whz-term-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          margin-top: 0.65rem;
          margin-bottom: 0.25rem;
        }

        .whz-term-chip {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          font-family: inherit;
          font-size: 0.6875rem;
          padding: 0.15rem 0.5rem;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.12s ease;
        }

        .whz-term-chip:hover {
          background: rgba(56, 189, 248, 0.12);
          border-color: rgba(56, 189, 248, 0.3);
          color: #38bdf8;
        }

        /* Active Input Row */
        .whz-term-input-row {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          margin-top: 0.35rem;
        }

        .whz-term-input-prompt {
          display: flex;
          align-items: center;
          gap: 0.2rem;
          flex-shrink: 0;
          font-weight: 500;
        }

        .whz-term-input-wrapper {
          flex: 1;
          display: flex;
          align-items: center;
          position: relative;
        }

        .whz-term-cli-input {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          color: #f8fafc;
          font-family: inherit;
          font-size: 0.8125rem;
          caret-color: #38bdf8;
          padding: 0;
        }

        .whz-term-cli-input::placeholder {
          color: #475569;
        }

        .whz-term-loading-spinner {
          width: 13px;
          height: 13px;
          border: 2px solid rgba(56, 189, 248, 0.2);
          border-top-color: #38bdf8;
          border-radius: 50%;
          animation: termSpin 0.75s linear infinite;
          margin-left: 0.5rem;
          flex-shrink: 0;
        }

        @keyframes termSpin {
          to { transform: rotate(360deg); }
        }

        /* Custom Scrollbar */
        .whz-term-screen::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .whz-term-screen::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.2);
        }
        .whz-term-screen::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 3px;
        }
        .whz-term-screen::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }

        /* Media Queries for responsive positioning */
        @media (max-width: 1023px) {
          .whz-term-drawer {
            left: 0;
            right: 0;
            height: 50vh;
          }
          .dash-shell-collapsed .whz-term-drawer {
            left: 0;
          }
          .whz-term-session-badge {
            display: none;
          }
          .whz-term-btn-text {
            display: none;
          }
        }

        @media (max-width: 640px) {
          .whz-term-drawer {
            left: 0;
            right: 0;
            height: 55vh;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Strips ANSI escape codes from string for clipboard copying
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Lightweight ANSI color to HTML converter
 */
function ansiToHtml(text: string): string {
  if (!text) return "";

  const colorMap: Record<string, string> = {
    "30": "#64748b",
    "31": "#f87171",
    "32": "#4ade80",
    "33": "#facc15",
    "34": "#60a5fa",
    "35": "#c084fc",
    "36": "#38bdf8",
    "37": "#f1f5f9",
    "90": "#94a3b8",
    "91": "#fca5a5",
    "92": "#86efac",
    "93": "#fde047",
    "94": "#93c5fd",
    "95": "#d8b4fe",
    "96": "#67e8f9",
    "97": "#ffffff",
  };

  const lines = text.split("\n");
  const processedLines = lines.map(line => {
    // Escape standard HTML characters
    let escaped = line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Replace ANSI patterns
    // eslint-disable-next-line no-control-regex
    escaped = escaped.replace(/\x1b\[([0-9;]+)m/g, (_, codes) => {
      if (codes === "0") return "</span>";

      const parts = codes.split(";");
      const styles: string[] = [];

      for (const p of parts) {
        if (p === "1") styles.push("font-weight: 700;");
        if (p === "4") styles.push("text-decoration: underline;");
        if (colorMap[p]) styles.push(`color: ${colorMap[p]};`);
      }

      return styles.length > 0 ? `<span style="${styles.join(" ")}">` : "";
    });

    return escaped;
  });

  return processedLines.join("\n");
}
