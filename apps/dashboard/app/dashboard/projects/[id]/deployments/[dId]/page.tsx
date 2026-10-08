"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { deployments as deploymentsApi, type Deployment, getAccessToken, getApiBase } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Clock,
  Terminal,
  StopCircle,
  Globe,
  PauseCircle,
  PlayCircle,
  Trash2,
  Copy,
  Check,
  ExternalLink
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { DeployPipeline } from "@/components/deploy-pipeline";

export default function DeploymentPage() {
  const { id, dId } = useParams<{ id: string; dId: string }>();
  const router = useRouter();
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [projectSlug, setProjectSlug] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDeployment = useCallback(async () => {
    try {
      const d = await deploymentsApi.get(id, dId);
      setDeployment(d);
      const { projects } = await import("@/lib/api");
      const p = await projects.get(id);
      setProjectSlug(p.slug);
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
      toast.error("Not authenticated — please refresh");
      return;
    }

    const url = `${getApiBase()}/api/projects/deployments/${dId}/logs?token=${token}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.log === "__DONE__") {
          setStreaming(false);
          es.close();
          loadDeployment();
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }
        setLogs(prev => [...prev, data.log]);
      } catch {
        // malformed event
      }
    };

    es.onerror = () => {
      setStreaming(false);
      es.close();
      loadDeployment();
    };

    pollRef.current = setInterval(loadDeployment, 3000);

    return () => {
      es.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [dId, loadDeployment]);

  async function handleCancel() {
    setCancelling(true);
    try {
      await deploymentsApi.cancel(id, dId);
      toast.success("Deployment cancelled");
      setStreaming(false);
      esRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
      await loadDeployment();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  }

  async function handlePause() {
    if (!confirm("Pause this deployment? The container will stop and resources will be released.")) return;
    setPausing(true);
    try {
      await deploymentsApi.pause(id, dId);
      toast.success("Deployment paused");
      await loadDeployment();
    } catch (err: any) {
      toast.error(err.message || "Failed to pause");
    } finally {
      setPausing(false);
    }
  }

  async function handleResume() {
    setResuming(true);
    try {
      await deploymentsApi.resume(id, dId);
      toast.success("Resuming deployment...");
      setStreaming(true);
      await loadDeployment();
      if (!pollRef.current) {
        pollRef.current = setInterval(loadDeployment, 3000);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to resume");
    } finally {
      setResuming(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this deployment and all recorded logs permanently?")) return;
    setRemoving(true);
    try {
      await deploymentsApi.delete(id, dId);
      toast.success("Deployment deleted");
      router.push(`/dashboard/projects/${id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
      setRemoving(false);
    }
  }

  function copyAllLogs() {
    navigator.clipboard.writeText(logs.join("\n"));
    setCopiedLogs(true);
    toast.success("Logs copied to clipboard");
    setTimeout(() => setCopiedLogs(false), 2000);
  }

  const isActive = deployment?.status === "QUEUED" || deployment?.status === "BUILDING";
  const isReady = deployment?.status === "READY";
  const isPaused = deployment?.status === "PAUSED";
  const isDone = ["READY", "FAILED", "CANCELLED", "PAUSED"].includes(deployment?.status ?? "");

  return (
    <div className="page">
      <Link href={`/dashboard/projects/${id}`} className="breadcrumb">
        <ArrowLeft size={15} /> Back to Project
      </Link>

      {/* Header Card */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div className="deploy-detail-header">
          <div className="deploy-info-group">
            <div className="deploy-kicker">Frontend Deployment Pipeline</div>
            <div className="deploy-title-line">
              <h1 className="deploy-title mono">
                {deployment?.commitHash === "manual"
                  ? "Manual Deployment"
                  : `Revision ${deployment?.commitHash?.slice(0, 7) ?? "…"}`}
              </h1>
              {deployment?.status && <StatusBadge status={deployment.status} />}
            </div>
            {deployment?.commitMessage && (
              <p className="deploy-commit-msg">{deployment.commitMessage.split("\n")[0]}</p>
            )}

            <div className="deploy-meta-chips">
              {deployment?.deploymentType && (
                <span className="deploy-chip mono">
                  <Terminal size={12} /> {deployment.deploymentType}
                </span>
              )}
              {deployment?.createdAt && (
                <span className="deploy-chip">
                  <Clock size={12} /> {format(new Date(deployment.createdAt), "MMM d, yyyy HH:mm:ss")}
                </span>
              )}
              {deployment?.status === "READY" && (
                <span className="deploy-chip" style={{ color: "#10b981" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                  Live Edge Route Active
                </span>
              )}
            </div>
          </div>

          <div className="deploy-actions-group">
            {isActive && (
              <button className="btn btn-danger" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? <><Loader2 size={14} className="spin-icon" /> Cancelling…</> : <><StopCircle size={14} /> Cancel</>}
              </button>
            )}
            {isReady && (
              <button className="btn btn-secondary" onClick={handlePause} disabled={pausing}>
                {pausing ? <><Loader2 size={14} className="spin-icon" /> Pausing…</> : <><PauseCircle size={14} /> Pause</>}
              </button>
            )}
            {isPaused && (
              <button className="btn btn-primary" onClick={handleResume} disabled={resuming}>
                {resuming ? <><Loader2 size={14} className="spin-icon" /> Resuming…</> : <><PlayCircle size={14} /> Resume</>}
              </button>
            )}
            {isDone && (
              <button className="btn btn-danger" onClick={handleDelete} disabled={removing}>
                {removing ? <><Loader2 size={14} className="spin-icon" /> Deleting…</> : <><Trash2 size={14} /> Delete</>}
              </button>
            )}
            {isReady && deployment?.url && (
              <a
                href={deployment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                <Globe size={14} /> Visit Site <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Visual Pipeline Progress */}
      <div style={{ marginBottom: "1.5rem" }}>
        <DeployPipeline
          status={deployment?.status}
          logs={logs}
          isDirectUpload={deployment?.uploadType === "direct" || deployment?.commitHash === "direct"}
        />
      </div>

      {/* Failure Banner */}
      {deployment?.errorMessage && (
        <div className="error-alert-banner">
          <div style={{ fontWeight: 650, marginBottom: "0.25rem" }}>Build Pipeline Failed:</div>
          <div className="mono" style={{ fontSize: "0.82rem" }}>{deployment.errorMessage}</div>
        </div>
      )}

      {/* Modern Terminal View */}
      <div className="terminal-panel-card">
        <div className="terminal-topbar">
          <div className="terminal-title-area">
            <Terminal size={15} />
            <span style={{ fontWeight: 600 }}>Worker Build & Runtime Logs</span>
            {streaming && isActive && (
              <span className="live-stream-badge">
                <span className="live-stream-dot" /> Live Streaming
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

        <div className="terminal-output-body" ref={logsRef} id="build-logs">
          {logs.length === 0 ? (
            <div className="logs-empty-waiting">
              {isActive || streaming ? (
                <>
                  <Loader2 size={16} className="spin-icon text-accent" />
                  <span>Waiting for cloud build-worker to clone and execute steps...</span>
                </>
              ) : (
                <span style={{ color: "var(--muted)" }}>No logs recorded for this deployment.</span>
              )}
            </div>
          ) : (
            logs.map((line, i) => {
              const isErr = line.startsWith("[stderr]") || line.toLowerCase().includes("error") || line.startsWith("✗");
              const isSuccess = line.startsWith("✓") || line.startsWith("✔") || line.includes("successfully");
              return (
                <div key={i} className={`term-line ${isErr ? "term-err" : isSuccess ? "term-success" : ""}`}>
                  <span className="term-num">{String(i + 1).padStart(4, " ")}</span>
                  <span className="term-text">{line}</span>
                </div>
              );
            })
          )}
          {streaming && isActive && logs.length > 0 && (
            <div className="term-line">
              <span className="term-num">{String(logs.length + 1).padStart(4, " ")}</span>
              <span className="term-text text-accent">
                <span className="cursor-blink">█</span> Processing container steps...
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
        .deploy-commit-msg {
          font-size: 0.88rem;
          color: var(--muted);
          margin-top: 0.35rem;
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

        .error-alert-banner {
          background: rgba(244, 63, 94, 0.08);
          border: 1px solid rgba(244, 63, 94, 0.25);
          border-radius: 8px;
          padding: 1rem 1.25rem;
          color: var(--danger);
          margin-bottom: 1.5rem;
        }

        /* Terminal Panel */
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
          background: #0f172a;
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
          .deploy-actions-group {
            width: 100%;
          }
          .deploy-actions-group .btn {
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
}
