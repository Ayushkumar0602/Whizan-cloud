"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { accountTerminal } from "@/lib/api";
import {
  Terminal as TerminalIcon,
  X,
  Minus,
  Maximize2,
  Minimize2,
  Trash2,
  Sparkles,
  RefreshCw,
  CornerDownLeft,
  ChevronRight,
  ShieldCheck,
  HelpCircle,
  Copy,
  Check
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

const WELCOME_BANNER = `\x1b[1;36m  __          ___     _                  _____ _                 _\x1b[0m
\x1b[1;36m  \\ \\        / / |   (_)                / ____| |               | |\x1b[0m
\x1b[1;36m   \\ \\  /\\  / /| |__  _ ______ _ _ __  | |    | | ___  _   _  __| |\x1b[0m
\x1b[1;36m    \\ \\/  \\/ / | '_ \\| |_  / _\` | '_ \\ | |    | |/ _ \\| | | |/ _\` |\x1b[0m
\x1b[1;36m     \\  /\\  /  | | | | |/ / (_| | | | || |____| | (_) | |_| | (_| |\x1b[0m
\x1b[1;36m      \\/  \\/   |_| |_|_/___\\__,_|_| |_(_)_____|_|\\___/ \\__,_|\\__,_|\x1b[0m

\x1b[1;32m✓ Whizan Cloud Account Terminal v2.4 (Scoped User Shell)\x1b[0m
\x1b[90mTenant isolation active. All operations are strictly scoped to your account.\x1b[0m
Type \x1b[1;33m'help'\x1b[0m for available commands, or try \x1b[1;32m'services'\x1b[0m, \x1b[1;32m'projects'\x1b[0m, \x1b[1;32m'stats'\x1b[0m.
`;

const QUICK_COMMANDS = [
  { label: "help", desc: "Show manual" },
  { label: "services", desc: "List microservices" },
  { label: "projects", desc: "List web projects" },
  { label: "stats", desc: "Compute metrics" },
  { label: "whoami", desc: "User session" },
  { label: "clear", desc: "Clear screen" },
];

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

  const userHandle = user?.email?.split("@")[0] || "user";

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
            timestamp: new Date().toLocaleTimeString(),
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
          timestamp: new Date().toLocaleTimeString(),
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
      const cmds = ["help", "services", "projects", "service", "project", "redeploy", "restart", "logs", "status", "stats", "whoami", "clear"];
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
      className={`account-terminal-drawer ${minimized ? "terminal-minimized" : ""} ${maximized ? "terminal-maximized" : ""}`}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Terminal Title Bar */}
      <div className="terminal-topbar" onClick={e => e.stopPropagation()}>
        {/* Left: Window Dots & Title */}
        <div className="terminal-window-controls">
          <button
            className="window-dot dot-close"
            onClick={onClose}
            title="Close Terminal (Esc)"
          />
          <button
            className="window-dot dot-minimize"
            onClick={() => setMinimized(!minimized)}
            title={minimized ? "Restore Terminal" : "Minimize Terminal"}
          />
          <button
            className="window-dot dot-maximize"
            onClick={() => {
              setMinimized(false);
              setMaximized(!maximized);
            }}
            title={maximized ? "Restore Height" : "Maximize Fullscreen"}
          />

          <div className="terminal-title-label">
            <TerminalIcon size={14} className="terminal-header-icon" />
            <span className="terminal-title-text">Whizan Cloud Shell</span>
            <span className="terminal-scope-tag">Account Scope</span>
          </div>
        </div>

        {/* Center: Session Pill */}
        <div className="terminal-session-pill">
          <span className="session-status-dot" />
          <span className="session-user-text">{userHandle}@whizan.cloud</span>
        </div>

        {/* Right: Actions */}
        <div className="terminal-actions-group">
          <button
            className="terminal-tool-btn"
            onClick={handleCopyAll}
            title="Copy Terminal Output"
          >
            {copied ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
          </button>
          <button
            className="terminal-tool-btn"
            onClick={() => setHistory([])}
            title="Clear Terminal Screen (clear)"
          >
            <Trash2 size={13} />
          </button>
          <button
            className="terminal-tool-btn"
            onClick={() => {
              setMinimized(false);
              setMaximized(!maximized);
            }}
            title={maximized ? "Restore Window" : "Maximize Window"}
          >
            {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            className="terminal-tool-btn terminal-btn-close"
            onClick={onClose}
            title="Close Terminal"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* When Minimized: only the topbar is visible */}
      {!minimized && (
        <>
          {/* Quick Command Chips */}
          <div className="terminal-quick-chips" onClick={e => e.stopPropagation()}>
            <span className="quick-chips-label">Quick Commands:</span>
            {QUICK_COMMANDS.map(q => (
              <button
                key={q.label}
                type="button"
                className="chip-btn"
                onClick={() => executeCommand(q.label)}
                title={q.desc}
              >
                <code>{q.label}</code>
              </button>
            ))}
          </div>

          {/* Terminal Screen / Output Body */}
          <div className="terminal-scroll-area" ref={scrollContainerRef}>
            {/* Initial Welcome Banner */}
            <div className="terminal-output-block">
              <span dangerouslySetInnerHTML={{ __html: ansiToHtml(WELCOME_BANNER) }} />
            </div>

            {/* History Output */}
            {history.map((entry, idx) => (
              <div key={idx} className="terminal-history-item">
                <div className="terminal-history-command">
                  <span className="prompt-symbol">
                    <span className="prompt-user">{userHandle}@whizan</span>
                    <span className="prompt-sep">:</span>
                    <span className="prompt-tilde">~</span>
                    <span className="prompt-dollar">$</span>
                  </span>
                  <span className="command-text">{entry.command}</span>
                  <span className="timestamp-tag">{entry.timestamp}</span>
                </div>
                <div className="terminal-history-output">
                  <span dangerouslySetInnerHTML={{ __html: ansiToHtml(entry.output) }} />
                </div>
              </div>
            ))}

            {/* Active Live Input Line */}
            <div className="terminal-active-line">
              <span className="prompt-symbol">
                <span className="prompt-user">{userHandle}@whizan</span>
                <span className="prompt-sep">:</span>
                <span className="prompt-tilde">~</span>
                <span className="prompt-dollar">$</span>
              </span>

              <div className="terminal-input-wrap">
                <input
                  ref={inputRef}
                  type="text"
                  className="terminal-cli-input"
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  placeholder={loading ? "Executing cloud command..." : "Type 'help' or command..."}
                />
                {loading && <span className="terminal-spinner" />}
              </div>
            </div>

            <div ref={terminalEndRef} style={{ height: "16px" }} />
          </div>
        </>
      )}

      <style>{`
        .account-terminal-drawer {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 440px;
          background: #0b0f17;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 -12px 36px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255, 255, 255, 0.2);
          display: flex;
          flex-direction: column;
          z-index: 9999;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          color: #e6edf3;
          transition: height 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          animation: slideUpTerminal 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideUpTerminal {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }

        .terminal-minimized {
          height: 42px !important;
          overflow: hidden;
        }

        .terminal-maximized {
          height: 86vh !important;
        }

        .terminal-topbar {
          height: 40px;
          min-height: 40px;
          background: #141b26;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 1rem;
          user-select: none;
        }

        .terminal-window-controls {
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }

        .window-dot {
          width: 11px;
          height: 11px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          transition: opacity 0.15s ease;
          padding: 0;
        }

        .window-dot:hover {
          opacity: 0.8;
        }

        .dot-close {
          background: #ff5f56;
          border: 1px solid #e0443e;
        }

        .dot-minimize {
          background: #ffbd2e;
          border: 1px solid #dea123;
        }

        .dot-maximize {
          background: #27c93f;
          border: 1px solid #1aab29;
        }

        .terminal-title-label {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          margin-left: 0.5rem;
        }

        .terminal-header-icon {
          color: #10b981;
        }

        .terminal-title-text {
          font-weight: 600;
          font-size: 0.82rem;
          color: #f0f6fc;
        }

        .terminal-scope-tag {
          font-size: 0.65rem;
          font-weight: 600;
          background: rgba(16, 185, 129, 0.14);
          color: #10b981;
          padding: 0.1rem 0.45rem;
          border-radius: 9999px;
          border: 1px solid rgba(16, 185, 129, 0.25);
          letter-spacing: 0.02em;
        }

        .terminal-session-pill {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          background: rgba(255, 255, 255, 0.05);
          padding: 0.2rem 0.65rem;
          border-radius: 9999px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          font-size: 0.72rem;
          color: #8b949e;
        }

        .session-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 6px #10b981;
        }

        .session-user-text {
          font-weight: 500;
          color: #c9d1d9;
        }

        .terminal-actions-group {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }

        .terminal-tool-btn {
          background: transparent;
          border: none;
          color: #8b949e;
          width: 26px;
          height: 26px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .terminal-tool-btn:hover {
          color: #f0f6fc;
          background: rgba(255, 255, 255, 0.08);
        }

        .terminal-btn-close:hover {
          color: #ff5f56;
          background: rgba(255, 95, 86, 0.12);
        }

        .terminal-quick-chips {
          background: #0f1520;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding: 0.35rem 1rem;
          display: flex;
          align-items: center;
          gap: 0.45rem;
          flex-wrap: wrap;
        }

        .quick-chips-label {
          font-size: 0.7rem;
          color: #6e7681;
          margin-right: 0.2rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .chip-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #58a6ff;
          padding: 0.15rem 0.5rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.72rem;
          transition: all 0.15s ease;
          display: inline-flex;
          align-items: center;
        }

        .chip-btn:hover {
          background: rgba(88, 166, 255, 0.15);
          border-color: rgba(88, 166, 255, 0.35);
          transform: translateY(-1px);
        }

        .terminal-scroll-area {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 0.75rem 1.25rem;
          font-size: 0.83rem;
          line-height: 1.55;
          scroll-behavior: smooth;
        }

        .terminal-scroll-area::-webkit-scrollbar {
          width: 8px;
        }
        .terminal-scroll-area::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 4px;
        }

        .terminal-output-block {
          white-space: pre-wrap;
          word-break: break-all;
          margin-bottom: 0.75rem;
        }

        .terminal-history-item {
          margin-bottom: 0.75rem;
        }

        .terminal-history-command {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #f0f6fc;
        }

        .command-text {
          font-weight: 600;
          color: #f0f6fc;
        }

        .timestamp-tag {
          font-size: 0.68rem;
          color: #6e7681;
          margin-left: auto;
        }

        .terminal-history-output {
          white-space: pre-wrap;
          word-break: break-all;
          color: #c9d1d9;
          margin-top: 0.2rem;
        }

        .terminal-active-line {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.25rem;
        }

        .prompt-symbol {
          display: inline-flex;
          align-items: center;
          gap: 0.15rem;
          font-weight: 600;
          user-select: none;
          flex-shrink: 0;
        }

        .prompt-user {
          color: #10b981;
        }

        .prompt-sep {
          color: #8b949e;
        }

        .prompt-tilde {
          color: #58a6ff;
        }

        .prompt-dollar {
          color: #f0f6fc;
          margin-left: 0.15rem;
        }

        .terminal-input-wrap {
          flex: 1;
          display: flex;
          align-items: center;
          position: relative;
        }

        .terminal-cli-input {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          color: #f0f6fc;
          font-family: inherit;
          font-size: 0.83rem;
          line-height: 1.55;
          padding: 0;
          caret-color: #10b981;
        }

        .terminal-cli-input::placeholder {
          color: #484f58;
        }

        .terminal-spinner {
          width: 12px;
          height: 12px;
          border: 2px solid rgba(16, 185, 129, 0.2);
          border-top-color: #10b981;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          position: absolute;
          right: 0;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Strips ANSI color codes for plain-text copying
 */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Converts ANSI color sequences to styled HTML spans for high-fidelity rendering
 */
function ansiToHtml(text: string): string {
  if (!text) return "";

  // Escape raw HTML entities first
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Color lookup map
  const ansiStyles: Record<string, string> = {
    "1": "font-weight: 600;",
    "2": "opacity: 0.7;",
    "30": "color: #484f58;",
    "31": "color: #ff7b72;",
    "32": "color: #3fb950;",
    "33": "color: #d29922;",
    "34": "color: #58a6ff;",
    "35": "color: #bc8cff;",
    "36": "color: #39c5cf;",
    "37": "color: #f0f6fc;",
    "90": "color: #8b949e;",
    "91": "color: #ffa198;",
    "92": "color: #56d364;",
    "93": "color: #e3b341;",
    "94": "color: #79c0ff;",
    "95": "color: #d2a8ff;",
    "96": "color: #56d4dd;",
    "97": "color: #ffffff;",
  };

  let openSpans = 0;
  let html = escaped.replace(/\x1b\[([0-9;]*)m/g, (_, codeStr) => {
    if (!codeStr || codeStr === "0") {
      let closeTags = "";
      while (openSpans > 0) {
        closeTags += "</span>";
        openSpans--;
      }
      return closeTags;
    }

    const codes = codeStr.split(";");
    let combinedStyle = "";
    codes.forEach((c: string) => {
      if (ansiStyles[c]) combinedStyle += ansiStyles[c];
    });

    if (combinedStyle) {
      openSpans++;
      return `<span style="${combinedStyle}">`;
    }
    return "";
  });

  while (openSpans > 0) {
    html += "</span>";
    openSpans--;
  }

  return html;
}
