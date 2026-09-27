"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { services, type ServiceDeployment, getAccessToken } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Clock,
  Terminal,
  Globe,
  Radio,
  ExternalLink,
  Copy,
  Check
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { getServiceIngressUrl } from "@/lib/domains";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function BackendDeploymentLogsPage() {
  const { id, dId } = useParams<{ id: string; dId: string }>();
  const router = useRouter();
  const [deployment, setDeployment] = useState<ServiceDeployment | null>(null);
  const [serviceSlug, setServiceSlug] = useState<string>("");
  const [isPublic, setIsPublic] = useState(false);
  const [internalPort, setInternalPort] = useState(8000);
  const [logs, setLogs] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(true);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDeployment = useCallback(async () => {
    try {
      const d = await services.getDeployment(id, dId);
      setDeployment(d);
      const s = await services.get(id);
      setServiceSlug(s.slug);
      setIsPublic(s.isPublic);
      setInternalPort(s.internalPort);
      return d;
    } catch {
      // ignore
    }
  }, [id, dId]);

  useEffect(() => {
    if (autoScroll && logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  useEffect(() => {
    loadDeployment();
    const token = getAccessToken();
    if (!token) {
      toast.error("Not authenticated");
      return;
    }

    const url = `${API_BASE}/api/services/deployments/${dId}/logs?token=${token}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const { log } = JSON.parse(e.data);
        if (log === "__DONE__") {
          setStreaming(false);
          es.close();
          loadDeployment();
        } else {
          setLogs(prev => [...prev, log]);
        }
      } catch (err) {}
    };

    es.onerror = () => {
      setStreaming(false);
      es.close();
    };

    return () => es.close();
  }, [dId, loadDeployment]);

  useEffect(() => {
    if (streaming) {
      pollRef.current = setInterval(loadDeployment, 4000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [streaming, loadDeployment]);

  if (!deployment) {
    return (
      <div className="page-loading">
        <div className="spinner" />
        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Loading deployment...</span>
      </div>
    );
  }

  function buildDuration() {
    if (!deployment?.buildStartedAt) return null;
    const end = deployment.buildFinishedAt ? new Date(deployment.buildFinishedAt) : new Date();
    const secs = Math.round((end.getTime() - new Date(deployment.buildStartedAt).getTime()) / 1000);
    return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }

  function copyAllLogs() {
    navigator.clipboard.writeText(logs.join("\n"));
    setCopiedLogs(true);
    toast.success("Logs copied to clipboard");
    setTimeout(() => setCopiedLogs(false), 2000);
  }

  return (
    <div className="page">
      <Link href={`/dashboard/backend/${id}`} className="breadcrumb">
        <ArrowLeft size={15} /> Back to Service
      </Link>

      {/* Header Card */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="deploy-detail-header">
          <div>
            <div className="deploy-kicker">Docker Container Build</div>
            <div className="deploy-title-line">
              <h1 className="deploy-title mono">
                Build #{deployment.id.slice(0, 8)}
              </h1>
              <StatusBadge status={deployment.status} />
            </div>

            <div className="deploy-meta-chips">
              <span className="deploy-chip">
                <Clock size={12} /> {format(new Date(deployment.createdAt), "MMM d, h:mm a")}
              </span>
              <span className="deploy-chip mono">
                Git: {deployment.commitHash.substring(0, 7)}
              </span>
              {buildDuration() && (
                <span className="deploy-chip">
                  Duration: {buildDuration()}
                </span>
              )}
            </div>
          </div>

          <div className="deploy-actions-group">
            {deployment.status === "READY" && isPublic && (
              <a
                href={getServiceIngressUrl(serviceSlug)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                <Globe size={14} /> Open Public URL <ExternalLink size={12} />
              </a>
            )}
            {deployment.status === "READY" && !isPublic && (
              <div className="mesh-indicator-badge mono">
                <Radio size={13} className="text-accent" />
                <span>Internal: http://{serviceSlug}:{internalPort}</span>
              </div>
            )}
          </div>
        </div>

        {deployment.errorMessage && (
          <div className="error-alert-banner" style={{ marginTop: "1.25rem", marginBottom: 0 }}>
            <div style={{ fontWeight: 650, marginBottom: "0.25rem" }}>Container Startup Error:</div>
            <div className="mono" style={{ fontSize: "0.82rem" }}>{deployment.errorMessage}</div>
          </div>
        )}
      </div>

      {/* Terminal View */}
      <div className="terminal-panel-card">
        <div className="terminal-topbar">
          <div className="terminal-title-area">
            <Terminal size={15} />
            <span style={{ fontWeight: 600 }}>Container Build & Runtime Logs</span>
            {streaming && (
              <span className="live-stream-badge">
                <span className="live-stream-dot" /> Streaming
              </span>
            )}
          </div>

          <div className="terminal-actions-area">
            <label className="autoscroll-toggle">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={e => setAutoScroll(e.target.checked)}
              />
              <span>Auto-scroll</span>
            </label>

            <button onClick={copyAllLogs} className="btn-terminal-copy">
              {copiedLogs ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
              <span>{copiedLogs ? "Copied" : "Copy Logs"}</span>
            </button>
          </div>
        </div>

        <div className="terminal-output-body" ref={logsRef}>
          {logs.length === 0 && !streaming ? (
            <div className="logs-empty-waiting">
              No logs captured for this deployment.
            </div>
          ) : logs.length === 0 && streaming ? (
            <div className="logs-empty-waiting">
              <Loader2 size={16} className="spin-icon text-accent" />
              <span>Streaming container output from build-worker...</span>
            </div>
          ) : (
            logs.map((log, i) => {
              const isErr = log.startsWith("[stderr]") || log.toLowerCase().includes("error");
              const isSuccess = log.startsWith("✓") || log.startsWith("✔") || log.includes("healthy") || log.includes("started");
              return (
                <div key={i} className={`term-line ${isErr ? "term-err" : isSuccess ? "term-success" : ""}`}>
                  <span className="term-num">{String(i + 1).padStart(4, " ")}</span>
                  <span className="term-text">{log}</span>
                </div>
              );
            })
          )}
          {streaming && logs.length > 0 && (
            <div className="term-line">
              <span className="term-num">{String(logs.length + 1).padStart(4, " ")}</span>
              <span className="term-text text-accent">
                <span className="cursor-blink">█</span> Container running...
              </span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .deploy-detail-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1.5rem;
          flex-wrap: wrap;
        }
        .deploy-kicker {
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted);
          font-weight: 700;
        }
        .deploy-title-line {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-top: 0.25rem;
          flex-wrap: wrap;
        }
        .deploy-title {
          font-size: 1.65rem;
          font-weight: 750;
          color: var(--foreground);
          letter-spacing: -0.02em;
        }
        .deploy-meta-chips {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.65rem;
          flex-wrap: wrap;
        }
        .deploy-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.75rem;
          color: var(--muted);
          background: var(--bg-inset);
          padding: 0.2rem 0.55rem;
          border-radius: 6px;
          border: 1px solid var(--card-border);
        }
        .deploy-actions-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .mesh-indicator-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.5rem 0.85rem;
          border-radius: 8px;
          background: var(--bg-inset);
          border: 1px solid var(--card-border);
          font-size: 0.78rem;
          color: var(--foreground);
        }

        .error-alert-banner {
          background: rgba(244, 63, 94, 0.08);
          border: 1px solid rgba(244, 63, 94, 0.25);
          border-radius: 8px;
          padding: 1rem 1.25rem;
          color: var(--danger);
        }

        /* Terminal Panel */
        .terminal-panel-card {
          background: #05070b;
          border: 1px solid var(--card-border);
          border-radius: var(--radius);
          overflow: hidden;
          box-shadow: var(--shadow);
        }
        .terminal-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1.25rem;
          background: var(--card);
          border-bottom: 1px solid var(--card-border);
          flex-wrap: wrap;
          gap: 0.75rem;
        }
        .terminal-title-area {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          font-size: 0.84rem;
          color: var(--foreground);
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

        .terminal-actions-area {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .autoscroll-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.75rem;
          color: var(--muted);
          cursor: pointer;
        }
        .btn-terminal-copy {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.3rem 0.65rem;
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
          height: 540px;
          overflow-y: auto;
          padding: 0.75rem 0;
          font-family: var(--font-geist-mono), monospace;
          background: #05070b;
        }
        .logs-empty-waiting {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          height: 100%;
          color: var(--muted);
          font-size: 0.84rem;
        }
        .term-line {
          display: flex;
          font-size: 0.76rem;
          line-height: 1.6;
        }
        .term-line:hover {
          background: rgba(255, 255, 255, 0.04);
        }
        .term-num {
          color: #334155;
          padding: 0 0.85rem;
          user-select: none;
          flex-shrink: 0;
          min-width: 4rem;
          text-align: right;
        }
        .term-text {
          color: #e2e8f0;
          word-break: break-word;
          flex: 1;
          padding-right: 1rem;
        }
        .term-err .term-text {
          color: #fb7185;
        }
        .term-success .term-text {
          color: #34d399;
        }

        .cursor-blink {
          animation: blink 1s step-end infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        @media (max-width: 768px) {
          .deploy-detail-header {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>
    </div>
  );
}
