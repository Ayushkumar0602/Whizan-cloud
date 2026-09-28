"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { admin } from "@/lib/api";
import {
  Terminal as TerminalIcon,
  Play,
  RotateCcw,
  Trash2,
  Server,
  Globe,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Key,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  Layers,
  Copy,
  Check
} from "lucide-react";
import { useAdminStats } from "../../../../hooks/useAdminStats";
import { toast } from "sonner";

interface CommandLog {
  id: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  cwd: string;
  timestamp: string;
  durationMs: number;
  target: string;
}

interface RemoteVMConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

export default function AdminTerminalPage() {
  const { stats } = useAdminStats();
  const [logs, setLogs] = useState<CommandLog[]>([]);
  const [inputCmd, setInputCmd] = useState("");
  const [currentCwd, setCurrentCwd] = useState("/opt/whizan");
  const [executing, setExecuting] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Target switcher: "local" (host VM) or "remote" (ephemeral remote VM)
  const [targetType, setTargetType] = useState<"local" | "remote">("local");
  const [showRemoteModal, setShowRemoteModal] = useState(false);
  const [remoteConfig, setRemoteConfig] = useState<RemoteVMConfig>({
    host: "",
    port: 22,
    username: "azureuser",
    password: "",
    privateKey: "",
  });

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const vmHostname = stats?.vmStats?.hostname || "whizan-rg";
  const vmIp = "20.2.136.11";

  // Initial welcome message
  useEffect(() => {
    setLogs([
      {
        id: "init",
        command: "uname -a && uptime",
        stdout: `Linux ${vmHostname} 6.8.0-1017-azure #20-Ubuntu SMP x86_64\nSystem operational • Host: ${vmIp} (Default Azure VM)`,
        stderr: "",
        exitCode: 0,
        cwd: "/opt/whizan",
        timestamp: new Date().toLocaleTimeString(),
        durationMs: 4,
        target: `Host VM (${vmIp})`,
      },
    ]);
  }, [vmHostname]);

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleExecute = async (overrideCmd?: string) => {
    const rawCmd = (overrideCmd !== undefined ? overrideCmd : inputCmd).trim();
    if (!rawCmd) return;

    if (rawCmd === "clear") {
      setLogs([]);
      setInputCmd("");
      return;
    }

    setExecuting(true);
    const startMs = Date.now();
    const cmdId = Math.random().toString(36).slice(2, 9);
    const targetLabel = targetType === "local" ? `Host (${vmIp})` : `Remote (${remoteConfig.host || "custom"})`;

    // Save history
    setCommandHistory((prev) => [rawCmd, ...prev.filter((c) => c !== rawCmd)].slice(0, 50));
    setHistoryIndex(-1);
    setInputCmd("");

    try {
      const payload: any = {
        command: rawCmd,
        cwd: currentCwd,
      };

      if (targetType === "remote" && remoteConfig.host) {
        payload.remote = remoteConfig;
      }

      const res = await admin.terminalExec(payload);
      const durationMs = Date.now() - startMs;

      setLogs((prev) => [
        ...prev,
        {
          id: cmdId,
          command: rawCmd,
          stdout: res.stdout || "",
          stderr: res.stderr || "",
          exitCode: res.exitCode,
          cwd: res.cwd || currentCwd,
          timestamp: new Date().toLocaleTimeString(),
          durationMs,
          target: targetLabel,
        },
      ]);

      if (res.cwd) setCurrentCwd(res.cwd);
    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      setLogs((prev) => [
        ...prev,
        {
          id: cmdId,
          command: rawCmd,
          stdout: "",
          stderr: err.message || "Failed to communicate with VM terminal daemon",
          exitCode: 1,
          cwd: currentCwd,
          timestamp: new Date().toLocaleTimeString(),
          durationMs,
          target: targetLabel,
        },
      ]);
    } finally {
      setExecuting(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleExecute();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIdx = Math.min(historyIndex + 1, commandHistory.length - 1);
      setHistoryIndex(nextIdx);
      setInputCmd(commandHistory[nextIdx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setInputCmd(commandHistory[nextIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputCmd("");
      }
    }
  };

  const copyOutput = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Command output copied");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const quickSnippets = [
    { label: "df -h /", cmd: "df -h /", desc: "Check Root Disk" },
    { label: "docker system df", cmd: "docker system df", desc: "Docker Footprint" },
    { label: "docker ps", cmd: "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'", desc: "Active Containers" },
    { label: "pm2 status", cmd: "pm2 status", desc: "PM2 Daemons" },
    { label: "free -h", cmd: "free -h", desc: "Memory Stats" },
    { label: "clear cache", cmd: "sudo rm -rf /opt/whizan-cache/* && echo 'Cache cleared'", desc: "Reclaim 5+ GB" },
    { label: "git status", cmd: "git status", desc: "Repo Status" },
    { label: "pm2 restart all", cmd: "pm2 restart all", desc: "Restart All" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* ─── Top Control Header ────────────────────────────────────────────── */}
      <div className="card" style={{ padding: "1.1rem 1.35rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#10b981",
              }}
            >
              <TerminalIcon size={20} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>VM Command Terminal</h2>
                <span className="badge badge-ready" style={{ fontSize: "0.7rem", padding: "0.15rem 0.5rem" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block", marginRight: 4 }} />
                  Live Host Bridge
                </span>
              </div>
              <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0.15rem 0 0" }}>
                Direct, unconstrained shell execution on your infrastructure. Working directory and environment are preserved.
              </p>
            </div>
          </div>

          {/* Target Host Switcher */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              style={{
                display: "flex",
                background: "var(--bg-inset)",
                borderRadius: 8,
                padding: "0.2rem",
                border: "1px solid var(--card-border)",
              }}
            >
              <button
                onClick={() => setTargetType("local")}
                style={{
                  background: targetType === "local" ? "rgba(255, 255, 255, 0.08)" : "transparent",
                  color: targetType === "local" ? "var(--foreground)" : "var(--muted)",
                  border: "none",
                  padding: "0.3rem 0.75rem",
                  borderRadius: 6,
                  fontSize: "0.76rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <Server size={12} className="text-accent" />
                <span>Host VM ({vmIp})</span>
              </button>

              <button
                onClick={() => {
                  setTargetType("remote");
                  if (!remoteConfig.host) setShowRemoteModal(true);
                }}
                style={{
                  background: targetType === "remote" ? "rgba(255, 255, 255, 0.08)" : "transparent",
                  color: targetType === "remote" ? "var(--foreground)" : "var(--muted)",
                  border: "none",
                  padding: "0.3rem 0.75rem",
                  borderRadius: 6,
                  fontSize: "0.76rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <Globe size={12} style={{ color: "#38bdf8" }} />
                <span>{remoteConfig.host ? remoteConfig.host : "Add Remote VM"}</span>
              </button>
            </div>

            {targetType === "remote" && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowRemoteModal(true)}
                style={{ height: 32, fontSize: "0.74rem" }}
              >
                Configure SSH
              </button>
            )}

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleExecute("clear")}
              title="Clear Terminal Screen"
              style={{ height: 32, fontSize: "0.74rem" }}
            >
              <RotateCcw size={12} /> Clear
            </button>
          </div>
        </div>

        {/* Quick Snippets Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "1rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontWeight: 600, marginRight: "0.2rem" }}>
            Quick Commands:
          </span>
          {quickSnippets.map((s) => (
            <button
              key={s.label}
              onClick={() => handleExecute(s.cmd)}
              disabled={executing}
              className="terminal-quick-chip"
              title={s.desc}
            >
              <code>{s.label}</code>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Real Terminal Window ───────────────────────────────────────────── */}
      <div className="terminal-window">
        {/* Terminal Titlebar */}
        <div className="terminal-titlebar">
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "rgba(255,255,255,0.6)" }}>
            <span className="mono">
              {targetType === "local" ? `azureuser@${vmHostname}:${currentCwd}` : `${remoteConfig.username || "user"}@${remoteConfig.host || "remote"}:${currentCwd}`}
            </span>
          </div>

          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)" }} className="mono">
            /bin/bash
          </div>
        </div>

        {/* Terminal Body Log Stream */}
        <div className="terminal-body" onClick={() => inputRef.current?.focus()}>
          {logs.map((log) => (
            <div key={log.id} className="terminal-log-block">
              {/* Command Prompt Line */}
              <div className="terminal-prompt-line">
                <span className="terminal-user mono">azureuser@{vmHostname}</span>
                <span className="terminal-colon">:</span>
                <span className="terminal-path mono">{log.cwd}</span>
                <span className="terminal-dollar">$</span>
                <span className="terminal-cmd mono">{log.command}</span>

                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.3)" }} className="mono">
                    {log.durationMs}ms
                  </span>
                  {log.exitCode === 0 ? (
                    <span className="badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "#10b981", borderColor: "rgba(16, 185, 129, 0.25)", fontSize: "0.65rem", padding: "0.1rem 0.35rem" }}>
                      code 0
                    </span>
                  ) : (
                    <span className="badge" style={{ background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.25)", fontSize: "0.65rem", padding: "0.1rem 0.35rem" }}>
                      err {log.exitCode}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyOutput(log.id, `${log.stdout}\n${log.stderr}`.trim());
                    }}
                    style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: "0.2rem" }}
                    title="Copy Output"
                  >
                    {copiedId === log.id ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                  </button>
                </div>
              </div>

              {/* Stdout Output */}
              {log.stdout && (
                <pre className="terminal-stdout mono">{log.stdout}</pre>
              )}

              {/* Stderr Output */}
              {log.stderr && (
                <pre className="terminal-stderr mono">{log.stderr}</pre>
              )}
            </div>
          ))}

          {/* Live Executing Prompt Line */}
          <div className="terminal-input-row">
            <span className="terminal-user mono">azureuser@{vmHostname}</span>
            <span className="terminal-colon">:</span>
            <span className="terminal-path mono">{currentCwd}</span>
            <span className="terminal-dollar">$</span>

            <input
              ref={inputRef}
              type="text"
              value={inputCmd}
              onChange={(e) => setInputCmd(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={executing}
              placeholder={executing ? "Running command..." : "Type shell command (e.g. docker ps, git pull, df -h)..."}
              className="terminal-input mono"
              autoFocus
            />

            {executing && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#38bdf8", fontSize: "0.75rem" }} className="mono">
                <div className="spinner" style={{ width: 12, height: 12 }} />
                <span>Executing</span>
              </div>
            )}
          </div>

          <div ref={terminalEndRef} />
        </div>
      </div>

      {/* ─── Remote VM Ephemeral Connection Modal ──────────────────────────── */}
      {showRemoteModal && (
        <div className="modal-backdrop" onClick={() => setShowRemoteModal(false)}>
          <div className="modal-content-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                <Globe size={18} style={{ color: "#38bdf8" }} />
                <h3 className="modal-title" style={{ fontSize: "1rem" }}>Connect Custom / Remote VM</h3>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowRemoteModal(false)}
                style={{ padding: "0.2rem 0.5rem" }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div
                style={{
                  background: "rgba(56, 189, 248, 0.08)",
                  border: "1px solid rgba(56, 189, 248, 0.2)",
                  borderRadius: 8,
                  padding: "0.75rem 0.9rem",
                  fontSize: "0.78rem",
                  color: "#38bdf8",
                  lineHeight: 1.45,
                }}
              >
                <strong>Ephemeral Session:</strong> Credentials entered here are stored strictly in client browser memory and will <u>never</u> be stored in your database or disk.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ fontSize: "0.75rem", color: "var(--muted)", display: "block", marginBottom: "0.3rem" }}>
                    Host IP or Domain
                  </label>
                  <input
                    type="text"
                    className="input mono"
                    placeholder="e.g. 51.140.23.45"
                    value={remoteConfig.host}
                    onChange={(e) => setRemoteConfig({ ...remoteConfig, host: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "0.75rem", color: "var(--muted)", display: "block", marginBottom: "0.3rem" }}>
                    SSH Port
                  </label>
                  <input
                    type="number"
                    className="input mono"
                    placeholder="22"
                    value={remoteConfig.port}
                    onChange={(e) => setRemoteConfig({ ...remoteConfig, port: parseInt(e.target.value) || 22 })}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--muted)", display: "block", marginBottom: "0.3rem" }}>
                  SSH Username
                </label>
                <input
                  type="text"
                  className="input mono"
                  placeholder="azureuser / ubuntu / root"
                  value={remoteConfig.username}
                  onChange={(e) => setRemoteConfig({ ...remoteConfig, username: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--muted)", display: "block", marginBottom: "0.3rem" }}>
                  SSH Password (Optional if key used)
                </label>
                <input
                  type="password"
                  className="input mono"
                  placeholder="••••••••••••"
                  value={remoteConfig.password || ""}
                  onChange={(e) => setRemoteConfig({ ...remoteConfig, password: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--muted)", display: "block", marginBottom: "0.3rem" }}>
                  SSH Private Key (Optional)
                </label>
                <textarea
                  className="input mono"
                  rows={3}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."
                  value={remoteConfig.privateKey || ""}
                  onChange={(e) => setRemoteConfig({ ...remoteConfig, privateKey: e.target.value })}
                  style={{ fontSize: "0.72rem", resize: "vertical" }}
                />
              </div>
            </div>

            <div className="modal-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setRemoteConfig({ host: "", port: 22, username: "azureuser", password: "", privateKey: "" });
                  setTargetType("local");
                  setShowRemoteModal(false);
                  toast.info("Switched to Local Host VM");
                }}
              >
                Reset to Host VM
              </button>

              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  if (!remoteConfig.host) {
                    toast.error("Host IP/Domain required");
                    return;
                  }
                  setShowRemoteModal(false);
                  setTargetType("remote");
                  toast.success(`Connected to remote target ${remoteConfig.host}`);
                  handleExecute("uname -a && uptime");
                }}
              >
                Connect Remote Session
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .terminal-quick-chip {
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          color: var(--foreground);
          padding: 0.22rem 0.55rem;
          border-radius: 6px;
          font-size: 0.72rem;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .terminal-quick-chip:hover {
          background: var(--card-hover);
          border-color: var(--accent);
          color: var(--accent);
        }
        .terminal-window {
          background: #0d1117;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
          display: flex;
          flex-direction: column;
          min-height: 520px;
        }
        .terminal-titlebar {
          background: #161b22;
          padding: 0.65rem 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .terminal-body {
          padding: 1.15rem;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-height: 640px;
          overflow-y: auto;
          cursor: text;
        }
        .terminal-log-block {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .terminal-prompt-line {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.8125rem;
          flex-wrap: wrap;
        }
        .terminal-user {
          color: #10b981;
          font-weight: 650;
        }
        .terminal-colon {
          color: rgba(255, 255, 255, 0.4);
        }
        .terminal-path {
          color: #38bdf8;
          font-weight: 600;
        }
        .terminal-dollar {
          color: rgba(255, 255, 255, 0.6);
          font-weight: 700;
        }
        .terminal-cmd {
          color: #f1f5f9;
          font-weight: 600;
        }
        .terminal-stdout {
          margin: 0;
          color: #cbd5e1;
          font-size: 0.78rem;
          line-height: 1.45;
          white-space: pre-wrap;
          word-break: break-all;
          background: rgba(255, 255, 255, 0.02);
          padding: 0.45rem 0.65rem;
          border-radius: 6px;
        }
        .terminal-stderr {
          margin: 0;
          color: #f87171;
          font-size: 0.78rem;
          line-height: 1.45;
          white-space: pre-wrap;
          word-break: break-all;
          background: rgba(239, 68, 68, 0.06);
          padding: 0.45rem 0.65rem;
          border-radius: 6px;
        }
        .terminal-input-row {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.8125rem;
          padding-top: 0.35rem;
        }
        .terminal-input {
          background: transparent;
          border: none;
          color: #f8fafc;
          font-family: inherit;
          font-size: 0.8125rem;
          flex: 1;
          outline: none;
          padding: 0;
        }
      `}</style>
    </div>
  );
}
