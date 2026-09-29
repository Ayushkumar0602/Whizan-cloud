"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Bot, Cpu, Power, Play, RotateCcw, Maximize2, Minimize2,
  Sparkles, TerminalIcon, Trash2, RefreshCw,
  FileText, Folder, FolderOpen, ChevronRight, ChevronDown,
  Globe, X, ExternalLink, FolderCode,
} from "lucide-react";
import { toast } from "sonner";

interface FileEntry { name: string; type: "file" | "dir"; size: number; }

function getApiBase() {
  if (typeof window === "undefined") return "http://localhost:8000";
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" ? "http://localhost:8000" : `https://api.${h}`;
}

function fileColor(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const m: Record<string, string> = {
    ts: "#3178c6", tsx: "#61dafb", js: "#f7df1e", jsx: "#61dafb",
    json: "#4ade80", md: "#94a3b8", css: "#38bdf8", html: "#f97316",
    py: "#3b82f6", sh: "#22c55e", yaml: "#a855f7", yml: "#a855f7",
    env: "#ec4899", toml: "#f59e0b", lock: "#64748b",
  };
  return m[ext] ?? "#64748b";
}

function fmtSize(b: number) {
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)}K`;
  return `${(b / 1048576).toFixed(1)}M`;
}

function TinyBtn({ children, onClick, title }: { children: React.ReactNode; onClick?: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
      color: "#94a3b8", cursor: "pointer", borderRadius: 5, padding: "3px 7px",
      fontSize: "0.72rem", display: "flex", alignItems: "center", gap: 3,
    }}>
      {children}
    </button>
  );
}

function FileNode({ entry, depth, fullPath, isExpanded, cache, expandedDirs, onToggleDir, onClickFile }: {
  entry: FileEntry; depth: number; fullPath: string; isExpanded: boolean;
  cache: Record<string, FileEntry[]>; expandedDirs: Set<string>;
  onToggleDir: (p: string) => void; onClickFile: (p: string, name: string) => void;
}) {
  const pl = 8 + depth * 14;
  const isDir = entry.type === "dir";
  return (
    <div>
      <div role="button" tabIndex={0}
        onClick={() => isDir ? onToggleDir(fullPath) : onClickFile(fullPath, entry.name)}
        onKeyDown={e => e.key === "Enter" && (isDir ? onToggleDir(fullPath) : onClickFile(fullPath, entry.name))}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: `3px 8px 3px ${pl}px`, cursor: "pointer", borderRadius: 4,
          fontSize: "0.79rem", color: isDir ? "#e2e8f0" : "#94a3b8",
          transition: "background 0.1s", userSelect: "none",
        }}>
        {isDir ? (
          <>
            {isExpanded ? <ChevronDown size={11} style={{ opacity: 0.4, flexShrink: 0 }} /> : <ChevronRight size={11} style={{ opacity: 0.4, flexShrink: 0 }} />}
            {isExpanded ? <FolderOpen size={13} style={{ color: "#f59e0b", flexShrink: 0 }} /> : <Folder size={13} style={{ color: "#f59e0b", flexShrink: 0 }} />}
          </>
        ) : (
          <>
            <span style={{ width: 11, flexShrink: 0 }} />
            <FileText size={13} style={{ color: fileColor(entry.name), flexShrink: 0 }} />
          </>
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{entry.name}</span>
        {!isDir && <span style={{ fontSize: "0.68rem", color: "#475569", flexShrink: 0 }}>{fmtSize(entry.size)}</span>}
      </div>
      {isDir && isExpanded && (
        <FileTree path={fullPath} cache={cache} expandedDirs={expandedDirs}
          onToggleDir={onToggleDir} onClickFile={onClickFile} depth={depth + 1} />
      )}
    </div>
  );
}

function FileTree({ path, cache, expandedDirs, onToggleDir, onClickFile, depth = 0 }: {
  path: string; cache: Record<string, FileEntry[]>; expandedDirs: Set<string>;
  onToggleDir: (p: string) => void; onClickFile: (p: string, name: string) => void; depth?: number;
}) {
  const entries = cache[path];
  if (!entries) return <div style={{ paddingLeft: 8 + (depth + 1) * 14, padding: "4px 10px", fontSize: "0.72rem", color: "#374151" }}>Loading…</div>;
  if (!entries.length) return <div style={{ paddingLeft: 8 + (depth + 1) * 14, padding: "4px 10px", fontSize: "0.72rem", color: "#374151" }}>(empty)</div>;
  return (
    <div>
      {entries.map(e => (
        <FileNode key={e.name} entry={e} depth={depth} fullPath={`${path}/${e.name}`}
          isExpanded={expandedDirs.has(`${path}/${e.name}`)} cache={cache}
          expandedDirs={expandedDirs} onToggleDir={onToggleDir} onClickFile={onClickFile} />
      ))}
    </div>
  );
}

function FileModal({ name, content, onClose }: { name: string; content: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, width: "min(840px,100%)", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "#e2e8f0" }}>
            <FileText size={14} style={{ color: fileColor(name) }} />{name}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer" }}><X size={16} /></button>
        </div>
        <pre style={{ margin: 0, padding: "1rem", overflow: "auto", fontSize: "0.8rem", lineHeight: 1.6, color: "#e2e8f0", fontFamily: 'ui-monospace,"Geist Mono",Menlo,Monaco,Consolas,monospace', flex: 1, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {content || "(empty file)"}
        </pre>
      </div>
    </div>
  );
}

export default function OpenCodePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<{ running?: boolean } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);

  const [dirCache, setDirCache] = useState<Record<string, FileEntry[]>>({});
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [fileModal, setFileModal] = useState<{ name: string; content: string } | null>(null);

  const [detectedPorts, setDetectedPorts] = useState<number[]>([]);
  const [previewPort, setPreviewPort] = useState<number | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  const fetchStatus = useCallback(async () => {
    try { const r = await fetch(`${getApiBase()}/api/local-opencode/status`); if (r.ok) setStatus(await r.json()); } catch {}
  }, []);

  const fetchPorts = useCallback(async () => {
    try {
      const r = await fetch(`${getApiBase()}/api/local-opencode/ports`);
      if (r.ok) { const d = await r.json(); setDetectedPorts((d.ports || []).filter((p: number) => p > 1023 && p !== 22)); }
    } catch {}
  }, []);

  const loadDir = useCallback(async (path: string) => {
    try {
      const r = await fetch(`${getApiBase()}/api/local-opencode/files?path=${encodeURIComponent(path)}`);
      if (r.ok) { const d = await r.json(); setDirCache(prev => ({ ...prev, [path]: d.entries || [] })); }
    } catch {}
  }, []);

  const handleToggleDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) { next.delete(path); } else { next.add(path); if (!dirCache[path]) loadDir(path); }
      return next;
    });
  }, [dirCache, loadDir]);

  const handleClickFile = useCallback(async (path: string, name: string) => {
    try {
      const r = await fetch(`${getApiBase()}/api/local-opencode/readfile?path=${encodeURIComponent(path)}`);
      if (r.ok) { const d = await r.json(); setFileModal({ name, content: d.content }); }
      else toast.error("Could not read file");
    } catch { toast.error("Failed to read file"); }
  }, []);

  useEffect(() => {
    fetchStatus();
    loadDir("/workspace");
    fetchPorts();
    const si = setInterval(fetchStatus, 10_000);
    const pi = setInterval(fetchPorts, 5_000);
    return () => { clearInterval(si); clearInterval(pi); };
  }, [fetchStatus, loadDir, fetchPorts]);

  useEffect(() => {
    if (!containerRef.current) return;
    let term: any, fitAddon: any, resizeObs: ResizeObserver | undefined, disposed = false;
    (async () => {
      const [{ Terminal: T }, { FitAddon: F }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !containerRef.current) return;
      await import("@xterm/xterm/css/xterm.css");
      term = new T({
        cursorBlink: true, cursorStyle: "bar",
        fontFamily: 'ui-monospace,"Geist Mono",Menlo,Monaco,Consolas,monospace',
        fontSize: 13, lineHeight: 1.35, scrollback: 5000, convertEol: true,
        theme: {
          background: "#080b11", foreground: "#e6edf3", cursor: "#38bdf8", cursorAccent: "#080b11",
          selectionBackground: "#334155", black: "#0f172a", red: "#ef4444", green: "#22c55e",
          yellow: "#eab308", blue: "#3b82f6", magenta: "#a855f7", cyan: "#06b6d4", white: "#f8fafc",
          brightBlack: "#475569", brightRed: "#f87171", brightGreen: "#4ade80", brightYellow: "#fde047",
          brightBlue: "#60a5fa", brightMagenta: "#c084fc", brightCyan: "#22d3ee", brightWhite: "#ffffff",
        },
      });
      fitAddon = new F();
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      fitAddon.fit();
      termRef.current = term; fitAddonRef.current = fitAddon;

      const base = getApiBase();
      const wsProto = base.startsWith("https") ? "wss:" : "ws:";
      const host = base.replace(/^https?:\/\//, "");
      const ws = new WebSocket(`${wsProto}//${host}/api/local-opencode/terminal?cols=${term.cols}&rows=${term.rows}`);
      wsRef.current = ws;
      ws.onopen = () => { setConnected(true); term.focus(); ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows })); };
      ws.onmessage = async e => {
        if (typeof e.data === "string") term.write(e.data);
        else if (e.data instanceof Blob) term.write(await e.data.text());
        else if (e.data instanceof ArrayBuffer) term.write(new TextDecoder().decode(e.data));
      };
      ws.onclose = () => { setConnected(false); term.write("\r\n\x1b[33m[Disconnected — click Reconnect]\x1b[0m\r\n"); };
      ws.onerror = () => setConnected(false);
      term.onData((d: string) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data: d })); });
      if (window.ResizeObserver && containerRef.current) {
        resizeObs = new ResizeObserver(() => {
          fitAddon?.fit();
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        });
        resizeObs.observe(containerRef.current);
      }
    })();
    return () => { disposed = true; resizeObs?.disconnect(); wsRef.current?.close(); wsRef.current = null; term?.dispose(); };
  }, []);

  function sendCommand(cmd: string) {
    if (wsRef.current?.readyState === WebSocket.OPEN) { wsRef.current.send(JSON.stringify({ type: "input", data: cmd + "\n" })); termRef.current?.focus(); }
    else toast.error("Terminal disconnected. Click Reconnect.");
  }

  async function handleStart() {
    setActionInProgress(true);
    try {
      const r = await fetch(`${getApiBase()}/api/local-opencode/start`, { method: "POST" });
      const d = await r.json();
      if (r.ok) { toast.success("Container started"); await fetchStatus(); window.location.reload(); }
      else toast.error(d.error || "Failed to start");
    } catch (e: any) { toast.error(e.message); } finally { setActionInProgress(false); }
  }

  async function handleStop() {
    if (!confirm("Stop the container? Active sessions will close.")) return;
    setActionInProgress(true);
    try { const r = await fetch(`${getApiBase()}/api/local-opencode/stop`, { method: "POST" }); if (r.ok) { toast.success("Container stopped"); await fetchStatus(); } }
    catch (e: any) { toast.error(e.message); } finally { setActionInProgress(false); }
  }

  return (
    <div style={{
      ...(fullscreen ? { position: "fixed", inset: 0, zIndex: 100 } : { height: "100vh" }),
      display: "flex", flexDirection: "column", background: "#05070d", overflow: "hidden",
      fontFamily: "var(--font-sans, Inter, system-ui, sans-serif)",
    }}>
      {/* Header */}
      {!fullscreen && (
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.6rem 1.25rem", background: "rgba(8,11,17,0.97)", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#0ea5e9,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bot size={18} color="#fff" />
            </div>
            <span style={{ fontWeight: 700, fontSize: "1.05rem", letterSpacing: "-0.02em", color: "#f1f5f9" }}>OpenCode AI Studio</span>
            <span style={{ fontSize: "0.71rem", padding: "2px 8px", borderRadius: 999, background: "rgba(56,189,248,0.12)", color: "#38bdf8", border: "1px solid rgba(56,189,248,0.25)", fontWeight: 600 }}>Local Docker</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "rgba(15,23,42,0.7)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, fontSize: "0.77rem" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: status?.running ? "#22c55e" : "#ef4444", boxShadow: status?.running ? "0 0 6px #22c55e" : "none" }} />
              <span style={{ color: status?.running ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{status?.running ? "Running" : "Stopped"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 6, fontSize: "0.77rem", color: "#a5b4fc" }}>
              <Cpu size={13} style={{ color: "#818cf8" }} />
              <code style={{ fontFamily: "inherit" }}>gemini-3.5-flash-lite</code>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "rgba(15,23,42,0.5)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, fontSize: "0.77rem", color: "#64748b" }}>
              <FolderCode size={13} style={{ color: "#38bdf8" }} />
              <code style={{ fontFamily: "inherit" }}>/workspace</code>
            </div>
            {status?.running ? (
              <button onClick={handleStop} disabled={actionInProgress} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", cursor: "pointer", fontSize: "0.77rem", fontWeight: 600, opacity: actionInProgress ? 0.5 : 1 }}>
                <Power size={12} /> Stop
              </button>
            ) : (
              <button onClick={handleStart} disabled={actionInProgress} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#4ade80", cursor: "pointer", fontSize: "0.77rem", fontWeight: 600, opacity: actionInProgress ? 0.5 : 1 }}>
                <Play size={12} /> Start Container
              </button>
            )}
          </div>
        </header>
      )}

      {/* Main 3-panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* Left: File Explorer */}
        {!fullscreen && (
          <aside style={{ width: 220, flexShrink: 0, background: "#080b11", borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "0.55rem 0.75rem", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.09em" }}>Explorer</span>
              <button onClick={() => { setDirCache({}); loadDir("/workspace"); }} title="Refresh" style={{ background: "none", border: "none", color: "#374151", cursor: "pointer", borderRadius: 4, padding: 2, display: "flex" }} onMouseEnter={e => (e.currentTarget.style.color = "#94a3b8")} onMouseLeave={e => (e.currentTarget.style.color = "#374151")}>
                <RefreshCw size={11} />
              </button>
            </div>
            <div style={{ overflow: "auto", flex: 1, paddingTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", fontSize: "0.79rem" }}>
                <FolderOpen size={13} style={{ color: "#38bdf8" }} />
                <span style={{ color: "#94a3b8", fontWeight: 600 }}>workspace</span>
              </div>
              <FileTree path="/workspace" cache={dirCache} expandedDirs={expandedDirs} onToggleDir={handleToggleDir} onClickFile={handleClickFile} depth={0} />
            </div>
          </aside>
        )}

        {/* Center: Terminal */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          <div style={{ background: "#0d1117", padding: "7px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", opacity: 0.8 }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b", opacity: 0.8 }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981", opacity: 0.8 }} />
              <span style={{ marginLeft: 8, fontSize: "0.78rem", color: "#64748b", display: "flex", alignItems: "center", gap: 5 }}>
                <TerminalIcon size={12} style={{ color: "#38bdf8" }} />
                bash — /workspace (whizan-local-opencode)
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <button onClick={() => sendCommand("opencode")} title="Launch OpenCode AI" style={{ display: "flex", alignItems: "center", gap: 5, background: "linear-gradient(135deg,#0284c7,#4f46e5)", color: "#fff", border: "none", borderRadius: 5, padding: "3px 10px", fontSize: "0.76rem", fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(14,165,233,0.25)" }}>
                <Sparkles size={12} /> Launch OpenCode
              </button>
              <TinyBtn onClick={() => sendCommand("opencode --version")} title="Check version">ver</TinyBtn>
              <TinyBtn onClick={() => { termRef.current?.clear(); termRef.current?.focus(); }} title="Clear terminal"><Trash2 size={12} /></TinyBtn>
              <TinyBtn onClick={() => window.location.reload()} title="Reconnect"><RotateCcw size={12} /></TinyBtn>
              <TinyBtn onClick={() => setFullscreen(f => !f)} title={fullscreen ? "Exit fullscreen" : "Fullscreen"}>
                {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              </TinyBtn>
            </div>
          </div>
          <div ref={containerRef} style={{ flex: 1, padding: "8px 12px", background: "#080b11", overflow: "hidden" }} />
        </div>

        {/* Right: Port Preview */}
        {!fullscreen && previewPort !== null && (
          <aside style={{ width: 390, flexShrink: 0, background: "#080b11", borderLeft: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "0.55rem 0.75rem", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.77rem" }}>
                <Globe size={13} style={{ color: "#38bdf8" }} />
                <span style={{ fontWeight: 600, color: "#94a3b8" }}>Port {previewPort}</span>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 5px #22c55e" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button onClick={() => setPreviewKey(k => k + 1)} title="Reload" style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", display: "flex", borderRadius: 4, padding: 2 }}><RefreshCw size={12} /></button>
                <a href={`${getApiBase()}/api/local-opencode/proxy/${previewPort}/`} target="_blank" rel="noopener noreferrer" style={{ color: "#475569", display: "flex", borderRadius: 4, padding: 2 }}><ExternalLink size={12} /></a>
                <button onClick={() => setPreviewPort(null)} title="Close" style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", display: "flex", borderRadius: 4, padding: 2 }}><X size={12} /></button>
              </div>
            </div>
            <iframe key={previewKey} src={`${getApiBase()}/api/local-opencode/proxy/${previewPort}/`} style={{ flex: 1, border: "none", background: "#fff" }} title={`Preview port ${previewPort}`} />
          </aside>
        )}
      </div>

      {/* Bottom Status Bar */}
      {!fullscreen && (
        <footer style={{ background: "rgba(5,7,13,0.98)", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "4px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.72rem", color: "#374151", flexShrink: 0, gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? "#22c55e" : "#f59e0b", boxShadow: connected ? "0 0 5px #22c55e" : "none" }} />
              {connected ? "PTY Live" : "Connecting…"}
            </span>
            <span style={{ color: "#1f2937" }}>•</span>
            <span>whizan-local-opencode</span>
            <span style={{ color: "#1f2937" }}>•</span>
            <span style={{ color: "#22c55e" }}>gemini-3.5-flash-lite</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {detectedPorts.length > 0 ? (
              <>
                <Globe size={11} /><span>Ports:</span>
                {detectedPorts.map(p => (
                  <button key={p}
                    onClick={() => { if (previewPort === p) setPreviewPort(null); else { setPreviewPort(p); setPreviewKey(k => k + 1); } }}
                    style={{ padding: "1px 8px", borderRadius: 4, cursor: "pointer", background: previewPort === p ? "rgba(56,189,248,0.18)" : "rgba(255,255,255,0.05)", border: previewPort === p ? "1px solid rgba(56,189,248,0.4)" : "1px solid rgba(255,255,255,0.1)", color: previewPort === p ? "#38bdf8" : "#475569", fontSize: "0.72rem", fontFamily: "monospace", display: "flex", alignItems: "center", gap: 4, transition: "all 0.15s" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 4px #22c55e" }} />
                    :{p}
                  </button>
                ))}
              </>
            ) : (
              <span style={{ color: "#1f2937" }}>No ports detected — run a server to see it here</span>
            )}
          </div>
        </footer>
      )}

      {fileModal && <FileModal name={fileModal.name} content={fileModal.content} onClose={() => setFileModal(null)} />}
    </div>
  );
}
