"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Clock,
  ArrowLeft,
  Play,
  Terminal,
  Activity,
  Copy,
  Check,
  ExternalLink,
  ShieldAlert,
  Globe,
  Cpu,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Download,
  RotateCcw,
  Trash2,
  Zap,
  Server,
  Code,
  Radio,
  RefreshCw,
  Settings2,
  Calendar,
  Pause,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import cronParser from "cron-parser";
import { PageHeader } from "@/components/page-header";
import {
  cronApi,
  services,
  functionsApi,
  projects,
  type CronJobItem,
  type CronExecutionItem,
  type CronDeadLetterItem,
} from "@/lib/api";

const PRESET_SCHEDULES = [
  { label: "Every Minute", value: "* * * * *", desc: "Runs at start of every minute" },
  { label: "Every 5 Minutes", value: "*/5 * * * *", desc: "Runs at :00, :05, :10, :15..." },
  { label: "Every 15 Minutes", value: "*/15 * * * *", desc: "Runs at :00, :15, :30, :45" },
  { label: "Hourly", value: "0 * * * *", desc: "Runs at minute 0 of every hour" },
  { label: "Daily Midnight", value: "0 0 * * *", desc: "Runs once every night at 00:00" },
  { label: "Daily 9:00 AM", value: "0 9 * * *", desc: "Runs every morning at 09:00" },
  { label: "Weekly Sunday", value: "0 0 * * 0", desc: "Runs at 00:00 every Sunday" },
  { label: "Monthly 1st", value: "0 0 1 * *", desc: "Runs at 00:00 on the 1st of month" },
];

const POPULAR_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function getNextRuns(schedule: string, timezone = "UTC", count = 10): Date[] {
  try {
    const interval = cronParser.parseExpression(schedule, { tz: timezone });
    const dates: Date[] = [];
    for (let i = 0; i < count; i++) {
      dates.push(interval.next().toDate());
    }
    return dates;
  } catch {
    return [];
  }
}

function getAccurateNextRun(job: CronJobItem): { date: Date | null; formatted: string; distance: string } {
  if (!job.enabled) {
    return { date: null, formatted: "Suspended", distance: "Paused" };
  }
  try {
    const interval = cronParser.parseExpression(job.schedule, { tz: job.timezone || "UTC" });
    const next = interval.next().toDate();
    return {
      date: next,
      formatted: format(next, "MMM d, HH:mm"),
      distance: `in ${formatDistanceToNow(next)}`,
    };
  } catch {
    if (job.nextRunAt) {
      const d = new Date(job.nextRunAt);
      return {
        date: d,
        formatted: format(d, "MMM d, HH:mm"),
        distance: formatDistanceToNow(d, { addSuffix: true }),
      };
    }
    return { date: null, formatted: "Scheduled", distance: "Upcoming" };
  }
}

export default function CronJobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params?.id as string;

  const [job, setJob] = useState<CronJobItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"terminal" | "history" | "config" | "schedule" | "dlq">("terminal");

  // Executions & History
  const [executions, setExecutions] = useState<CronExecutionItem[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<CronExecutionItem | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyFilter, setHistoryFilter] = useState<string>("ALL");
  const [loadingExecutions, setLoadingExecutions] = useState(false);

  // Dead Letter Queue
  const [deadLetters, setDeadLetters] = useState<CronDeadLetterItem[]>([]);
  const [loadingDlq, setLoadingDlq] = useState(false);
  const [replayingDlqId, setReplayingDlqId] = useState<string | null>(null);

  // Triggering State
  const [triggering, setTriggering] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // SSE Live Log Streaming
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingLogs, setStreamingLogs] = useState<string[]>([]);
  const sseRef = useRef<EventSource | null>(null);

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [userServices, setUserServices] = useState<any[]>([]);
  const [userFunctions, setUserFunctions] = useState<any[]>([]);
  const [editFormData, setEditFormData] = useState({
    name: "",
    description: "",
    schedule: "0 0 * * *",
    timezone: "UTC",
    targetType: "CONTAINER_EXEC" as CronJobItem["targetType"],
    misfirePolicy: "SKIP" as CronJobItem["misfirePolicy"],
    concurrencyPolicy: "FORBID" as CronJobItem["concurrencyPolicy"],
    maxConcurrentRuns: 1,
    timeoutSeconds: 300,
    maxRetries: 3,
    retryDelaySeconds: 10,
    enabled: true,
    serviceId: "",
    command: "",
    workDir: "/app",
    user: "root",
    endpointPath: "/cleanup",
    method: "POST" as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    port: 3000,
    webhookUrl: "https://api.example.com/tasks",
    customHeaders: "{}",
    payloadJson: "{}",
  });

  const fetchJobData = async () => {
    try {
      const data = await cronApi.get(jobId);
      setJob(data);
      if (data.executions && data.executions.length > 0 && !selectedExecution) {
        setSelectedExecution(data.executions[0]);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load cron task details");
    } finally {
      setLoading(false);
    }
  };

  const fetchExecutions = async (page = 1) => {
    setLoadingExecutions(true);
    try {
      const res = await cronApi.getExecutions(jobId, page, 20);
      setExecutions(res.executions || []);
      setHistoryTotal(res.total || 0);
      setHistoryPage(page);
      if (res.executions && res.executions.length > 0 && !selectedExecution) {
        setSelectedExecution(res.executions[0]);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load execution runs");
    } finally {
      setLoadingExecutions(false);
    }
  };

  const fetchDeadLetters = async () => {
    setLoadingDlq(true);
    try {
      const dlqs = await cronApi.getDeadLetters(jobId);
      setDeadLetters(dlqs);
    } catch {
      // Non-critical
    } finally {
      setLoadingDlq(false);
    }
  };

  const fetchResources = async () => {
    try {
      const [svcRes, fnRes] = await Promise.allSettled([
        services.list(),
        functionsApi.list(),
      ]);
      if (svcRes.status === "fulfilled") setUserServices(svcRes.value || []);
      if (fnRes.status === "fulfilled") setUserFunctions(fnRes.value || []);
    } catch {}
  };

  useEffect(() => {
    if (jobId) {
      fetchJobData();
      fetchExecutions(1);
      fetchDeadLetters();
      fetchResources();
    }
  }, [jobId]);

  // Handle 1-Click Trigger
  const handleTrigger = async () => {
    if (!job) return;
    setTriggering(true);
    try {
      const res = await cronApi.trigger(job.id);
      toast.success(`Triggered '${job.name}' immediately! Execution ID: ${res.executionId.slice(0, 8)}`);
      await fetchJobData();
      await fetchExecutions(1);
      setActiveTab("terminal");
    } catch (err: any) {
      toast.error(err.message || "Failed to trigger cron job");
    } finally {
      setTriggering(false);
    }
  };

  // Toggle Active/Pause
  const handleToggleEnabled = async () => {
    if (!job) return;
    const newStatus = !job.enabled;
    try {
      setJob((prev) => (prev ? { ...prev, enabled: newStatus } : null));
      await cronApi.update(job.id, { enabled: newStatus });
      toast.success(newStatus ? `Activated '${job.name}'` : `Paused '${job.name}'`);
      await fetchJobData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update cron job");
      await fetchJobData();
    }
  };

  // Delete Job
  const handleDelete = async () => {
    if (!job) return;
    if (!confirm(`Are you sure you want to delete '${job.name}'? This cannot be undone.`)) return;
    try {
      await cronApi.delete(job.id);
      toast.success(`Deleted '${job.name}'`);
      router.push("/dashboard/cron");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete cron job");
    }
  };

  // Duplicate / Clone
  const handleClone = async () => {
    if (!job) return;
    try {
      const created = await cronApi.create({
        name: `${job.name} (Copy)`,
        description: job.description || undefined,
        schedule: job.schedule,
        timezone: job.timezone,
        target: job.targetConfig,
        misfirePolicy: job.misfirePolicy,
        concurrencyPolicy: job.concurrencyPolicy,
        maxConcurrentRuns: job.maxConcurrentRuns,
        timeoutSeconds: job.timeoutSeconds,
        maxRetries: job.maxRetries,
        retryDelaySeconds: job.retryDelaySeconds,
        enabled: true,
      });
      toast.success(`Duplicated task! Redirecting...`);
      router.push(`/dashboard/cron/${created.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to duplicate task");
    }
  };

  // Open Edit Modal
  const openEditModal = () => {
    if (!job) return;
    const tc = job.targetConfig || {};
    setEditFormData({
      name: job.name,
      description: job.description || "",
      schedule: job.schedule,
      timezone: job.timezone,
      targetType: job.targetType,
      misfirePolicy: job.misfirePolicy,
      concurrencyPolicy: job.concurrencyPolicy,
      maxConcurrentRuns: job.maxConcurrentRuns,
      timeoutSeconds: job.timeoutSeconds,
      maxRetries: job.maxRetries,
      retryDelaySeconds: job.retryDelaySeconds,
      enabled: job.enabled,
      serviceId: tc.serviceId || tc.projectId || "",
      command: Array.isArray(tc.command) ? tc.command.join(" ") : tc.command || "",
      workDir: tc.workDir || "/app",
      user: tc.user || "root",
      endpointPath: tc.endpointPath || tc.routePath || "/cleanup",
      method: tc.method || "POST",
      port: tc.port || 3000,
      webhookUrl: tc.url || "https://api.example.com/tasks",
      customHeaders: tc.headers ? JSON.stringify(tc.headers, null, 2) : "{}",
      payloadJson: tc.payload || tc.body ? JSON.stringify(tc.payload || tc.body, null, 2) : "{}",
    });
    setEditModalOpen(true);
  };

  // Submit Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    setSavingEdit(true);
    try {
      let targetConfig: any = {};
      if (editFormData.targetType === "CONTAINER_EXEC") {
        targetConfig = {
          targetType: "CONTAINER_EXEC",
          serviceId: editFormData.serviceId || "whizan-api",
          command: editFormData.command.split(" ").filter(Boolean),
          workDir: editFormData.workDir || undefined,
          user: editFormData.user || undefined,
        };
      } else if (editFormData.targetType === "FUNCTION") {
        targetConfig = {
          targetType: "FUNCTION",
          serviceId: editFormData.serviceId || "default-fn",
          endpointPath: editFormData.endpointPath.startsWith("/") ? editFormData.endpointPath : `/${editFormData.endpointPath}`,
          method: editFormData.method,
        };
      } else if (editFormData.targetType === "WEBHOOK") {
        targetConfig = {
          targetType: "WEBHOOK",
          url: editFormData.webhookUrl,
          method: editFormData.method,
        };
      } else {
        targetConfig = {
          targetType: editFormData.targetType,
          serviceId: editFormData.serviceId,
          routePath: editFormData.endpointPath,
          port: editFormData.port,
          method: editFormData.method,
        };
      }

      const updated = await cronApi.update(job.id, {
        name: editFormData.name,
        description: editFormData.description || undefined,
        schedule: editFormData.schedule,
        timezone: editFormData.timezone,
        target: targetConfig,
        misfirePolicy: editFormData.misfirePolicy,
        concurrencyPolicy: editFormData.concurrencyPolicy,
        timeoutSeconds: Number(editFormData.timeoutSeconds) || 300,
        maxRetries: Number(editFormData.maxRetries) || 0,
        retryDelaySeconds: Number(editFormData.retryDelaySeconds) || 10,
        enabled: editFormData.enabled,
      });

      setJob(updated);
      toast.success("Task updated successfully!");
      setEditModalOpen(false);
      await fetchJobData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update task");
    } finally {
      setSavingEdit(false);
    }
  };

  // Replay DLQ
  const handleReplayDlq = async (dlq: CronDeadLetterItem) => {
    if (!job) return;
    setReplayingDlqId(dlq.id);
    try {
      const res = await cronApi.replayDeadLetter(job.id, dlq.id);
      toast.success(`Replayed failed run! Execution ID: ${res.executionId.slice(0, 8)}`);
      await fetchDeadLetters();
      await fetchExecutions(1);
      setActiveTab("terminal");
    } catch (err: any) {
      toast.error(err.message || "Failed to replay dead letter");
    } finally {
      setReplayingDlqId(null);
    }
  };

  // Discard DLQ
  const handleDiscardDlq = async (dlq: CronDeadLetterItem) => {
    if (!job) return;
    try {
      await cronApi.discardDeadLetter(job.id, dlq.id);
      toast.success("Dead letter discarded");
      await fetchDeadLetters();
    } catch (err: any) {
      toast.error(err.message || "Failed to discard dead letter");
    }
  };

  // Copy Logs
  const handleCopyLogs = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    toast.success("Logs copied to clipboard");
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Download Logs
  const handleDownloadLogs = (exec: CronExecutionItem) => {
    const content = exec.stdout || exec.errorMessage || "No logs recorded";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cron-${job?.name || "task"}-${exec.id.slice(0, 8)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Live SSE Stream Handler
  useEffect(() => {
    if (
      job &&
      selectedExecution &&
      (selectedExecution.status === "RUNNING" || selectedExecution.status === "SCHEDULED")
    ) {
      setIsStreaming(true);
      setStreamingLogs([]);

      const streamUrl = cronApi.getLogsStreamUrl(job.id, selectedExecution.id);
      const sse = new EventSource(streamUrl);
      sseRef.current = sse;

      sse.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const chunk = parsed.chunk || event.data;
          setStreamingLogs((prev) => [...prev, chunk]);
        } catch {
          setStreamingLogs((prev) => [...prev, event.data]);
        }
      };

      sse.onerror = () => {
        sse.close();
        setIsStreaming(false);
      };

      return () => {
        sse.close();
        setIsStreaming(false);
      };
    } else {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      setIsStreaming(false);
    }
  }, [job, selectedExecution]);

  // Metric Computations
  const computedMetrics = useMemo(() => {
    if (!job) return { total: 0, successRate: 100, avgDuration: 0 };
    const allExecs = executions.length > 0 ? executions : job.executions || [];
    const total = historyTotal || allExecs.length;
    if (total === 0) return { total: 0, successRate: 100, avgDuration: 0 };

    let successCount = 0;
    let totalDuration = 0;
    let measuredCount = 0;

    allExecs.forEach((e) => {
      if (e.status === "SUCCESS") successCount++;
      if (e.durationMs) {
        totalDuration += e.durationMs;
        measuredCount++;
      }
    });

    const successRate = Math.round((successCount / (allExecs.length || 1)) * 100);
    const avgDuration = measuredCount > 0 ? Math.round(totalDuration / measuredCount) : 0;

    return { total, successRate, avgDuration };
  }, [job, executions, historyTotal]);

  const nextRun = job ? getAccurateNextRun(job) : { date: null, formatted: "Suspended", distance: "Paused" };

  if (loading) {
    return (
      <div className="page" style={{ maxWidth: 1320, margin: "0 auto", padding: "4rem 1.5rem", textAlign: "center", color: "var(--muted)" }}>
        <RefreshCw size={32} className="animate-spin" style={{ margin: "0 auto 1.5rem", opacity: 0.6 }} />
        <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--foreground)" }}>Loading Cron Service Metrics...</h3>
        <p style={{ fontSize: "0.88rem", marginTop: "0.5rem" }}>Querying telemetry from Azure Host VM & PostgreSQL</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="page" style={{ maxWidth: 1320, margin: "0 auto", padding: "4rem 1.5rem", textAlign: "center" }}>
        <AlertTriangle size={36} style={{ color: "var(--danger)", margin: "0 auto 1rem" }} />
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--foreground)" }}>Scheduled Task Not Found</h2>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)", margin: "0.5rem 0 1.5rem" }}>
          The requested cron service does not exist or may have been deleted.
        </p>
        <Link href="/dashboard/cron" className="btn btn-primary">
          <ArrowLeft size={15} /> Return to Cron Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 1320, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* ─── BREADCRUMB ──────────────────────────────────────────────────────── */}
      <Link href="/dashboard/cron" className="breadcrumb">
        <ArrowLeft size={14} /> Back to Scheduled Tasks
      </Link>

      {/* ─── PAGE HEADER & ACTIONS ───────────────────────────────────────────── */}
      <PageHeader
        title={job.name}
        subtitle={job.description || `Automated cron execution on schedule: ${job.schedule} (${job.timezone})`}
        actions={
          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={fetchJobData}
              className="btn btn-secondary"
              title="Refresh Telemetry"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>

            <button
              onClick={handleTrigger}
              disabled={triggering}
              className="btn btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", boxShadow: "0 0 16px var(--accent-glow)" }}
            >
              <Play size={14} className={triggering ? "animate-spin" : ""} />
              <span>{triggering ? "Dispatching..." : "Run Now"}</span>
            </button>

            <button
              onClick={handleToggleEnabled}
              className="btn btn-secondary"
            >
              {job.enabled ? (
                <>
                  <Pause size={14} /> <span>Pause</span>
                </>
              ) : (
                <>
                  <Play size={14} /> <span>Resume</span>
                </>
              )}
            </button>

            <button
              onClick={openEditModal}
              className="btn btn-secondary"
              title="Edit Task Configuration"
            >
              <Settings2 size={14} />
            </button>

            <button
              onClick={handleClone}
              className="btn btn-secondary"
              title="Clone / Duplicate Task"
            >
              <Copy size={14} />
            </button>

            <button
              onClick={handleDelete}
              className="btn btn-danger"
              title="Delete Task"
            >
              <Trash2 size={14} />
            </button>
          </div>
        }
      />

      {/* ─── TOP METRICS CARDS ──────────────────────────────────────────────── */}
      <div className="stats-grid" style={{ marginBottom: "2rem" }}>
        <div className="stat-card">
          <div className="stat-label">
            <Clock size={15} style={{ color: "var(--accent)" }} /> Total Runs
          </div>
          <div className="stat-value">{computedMetrics.total}</div>
          <div className="stat-sub">Executed since creation</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <CheckCircle2 size={15} style={{ color: "#10b981" }} /> Success Rate
          </div>
          <div className="stat-value" style={{ color: computedMetrics.successRate >= 90 ? "#10b981" : "#f43f5e" }}>
            {computedMetrics.successRate}%
          </div>
          <div className="stat-sub">{job.lastStatus || "READY"} state</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Activity size={15} style={{ color: "#a855f7" }} /> Avg Duration
          </div>
          <div className="stat-value" style={{ color: "var(--foreground)" }}>
            {computedMetrics.avgDuration} <span style={{ fontSize: "0.9rem", color: "var(--muted)", fontWeight: 500 }}>ms</span>
          </div>
          <div className="stat-sub">Telemetry average</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Calendar size={15} style={{ color: "#f59e0b" }} /> Next Scheduled Execution
          </div>
          <div className="stat-value" style={{ fontSize: "1.3rem", color: "var(--foreground)" }}>
            {nextRun.formatted}
          </div>
          <div className="stat-sub" style={{ color: job.enabled ? "#10b981" : "var(--muted)", fontWeight: 600 }}>
            {nextRun.distance}
          </div>
        </div>
      </div>

      {/* ─── DEDICATED WEBPAGE TABS ─────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          marginBottom: "1.5rem",
          gap: "0.5rem",
          overflowX: "auto",
        }}
      >
        {[
          { id: "terminal", label: "Terminal & Live Logs", icon: Terminal },
          { id: "history", label: `Execution History (${computedMetrics.total})`, icon: Clock },
          { id: "config", label: "Target & Policy Deep Dive", icon: Code },
          { id: "schedule", label: "Upcoming 15 Runs Calendar", icon: Calendar },
          { id: "dlq", label: `Dead Letter Queue (${deadLetters.length})`, icon: ShieldAlert },
        ].map((t) => {
          const Icon = t.icon;
          const isSelected = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.85rem 1.15rem",
                fontSize: "0.85rem",
                fontWeight: 650,
                border: "none",
                borderBottom: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                background: "transparent",
                color: isSelected ? "var(--accent)" : "var(--muted)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                whiteSpace: "nowrap",
              }}
            >
              <Icon size={15} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── TAB CONTENT ─────────────────────────────────────────────────────── */}
      {/* TAB 1: TERMINAL & LIVE LOGS */}
      {activeTab === "terminal" && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            overflow: "hidden",
            boxShadow: "var(--shadow)",
            display: "grid",
            gridTemplateColumns: "260px 1fr",
            minHeight: "560px",
          }}
        >
          {/* Left: Execution Run Selector */}
          <div
            style={{
              borderRight: "1px solid var(--border)",
              background: "var(--bg-inset)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "0.85rem 1rem",
                borderBottom: "1px solid var(--border)",
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--muted)",
                textTransform: "uppercase",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Recent Runs</span>
              <button
                onClick={() => fetchExecutions(1)}
                style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer" }}
              >
                <RefreshCw size={13} className={loadingExecutions ? "animate-spin" : ""} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "0.6rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {executions.length === 0 ? (
                <div style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--muted)", fontSize: "0.8rem" }}>
                  No executions recorded yet. Click &quot;Run Now&quot; to test.
                </div>
              ) : (
                executions.map((exec) => {
                  const isSelected = selectedExecution?.id === exec.id;
                  return (
                    <div
                      key={exec.id}
                      onClick={() => setSelectedExecution(exec)}
                      style={{
                        padding: "0.65rem 0.85rem",
                        borderRadius: "8px",
                        border: "1px solid",
                        borderColor: isSelected ? "var(--accent)" : "transparent",
                        background: isSelected ? "var(--accent-glow)" : "var(--card)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
                        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: exec.status === "SUCCESS" ? "#10b981" : "#f43f5e" }}>
                          {exec.status}
                        </span>
                        <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "var(--font-geist-mono), monospace" }}>
                          {exec.durationMs ? `${Math.round(exec.durationMs)}ms` : "..."}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--muted)", fontFamily: "var(--font-geist-mono), monospace" }}>
                        {format(new Date(exec.startedAt), "HH:mm:ss")} • {exec.triggerType}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Modern Terminal Console */}
          <div style={{ background: "#05080e", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Terminal Header */}
            <div
              style={{
                padding: "0.75rem 1.25rem",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "rgba(255, 255, 255, 0.02)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f56" }} />
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ffbd2e" }} />
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#27c93f" }} />
                <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontFamily: "var(--font-geist-mono), monospace", marginLeft: "0.5rem" }}>
                  64KB CIRCULAR RING BUFFER TERMINAL
                </span>
                {isStreaming && (
                  <span style={{ padding: "0.2rem 0.5rem", borderRadius: "4px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", fontSize: "0.7rem", fontWeight: 700 }} className="animate-pulse">
                    LIVE STREAMING
                  </span>
                )}
              </div>

              {selectedExecution && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono), monospace", color: "var(--muted)" }}>
                    Exit Code:{" "}
                    <strong style={{ color: selectedExecution.exitCode === 0 ? "#10b981" : "#f43f5e" }}>
                      {selectedExecution.exitCode ?? 0}
                    </strong>
                  </span>
                  <button
                    onClick={() => handleCopyLogs(selectedExecution.stdout || selectedExecution.errorMessage || "")}
                    className="btn btn-ghost"
                    style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}
                    title="Copy full logs"
                  >
                    {copiedText ? <Check size={13} style={{ color: "#10b981" }} /> : <Copy size={13} />}
                  </button>
                  <button
                    onClick={() => handleDownloadLogs(selectedExecution)}
                    className="btn btn-ghost"
                    style={{ padding: "0.3rem 0.6rem", fontSize: "0.75rem" }}
                    title="Download log file"
                  >
                    <Download size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Terminal Body */}
            <div
              style={{
                flex: 1,
                padding: "1.25rem",
                overflowY: "auto",
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: "0.82rem",
                lineHeight: 1.65,
              }}
            >
              {isStreaming && streamingLogs.length > 0 ? (
                <pre style={{ color: "#38bdf8", whiteSpace: "pre-wrap" }}>{streamingLogs.join("\n")}</pre>
              ) : selectedExecution ? (
                selectedExecution.stdout ? (
                  <pre style={{ color: "#34d399", whiteSpace: "pre-wrap" }}>{selectedExecution.stdout}</pre>
                ) : selectedExecution.errorMessage ? (
                  <pre style={{ color: "#f43f5e", whiteSpace: "pre-wrap" }}>{selectedExecution.errorMessage}</pre>
                ) : (
                  <div style={{ color: "var(--muted)", fontStyle: "italic" }}>Execution completed without log output.</div>
                )
              ) : (
                <div style={{ color: "var(--muted)", fontStyle: "italic" }}>Select an execution run to inspect stdout / stderr.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EXECUTION HISTORY */}
      {activeTab === "history" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
              <thead style={{ background: "var(--bg-inset)", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontSize: "0.75rem", textTransform: "uppercase" }}>
                <tr>
                  <th style={{ padding: "0.85rem 1rem" }}>Status</th>
                  <th style={{ padding: "0.85rem 1rem" }}>Trigger Type</th>
                  <th style={{ padding: "0.85rem 1rem" }}>Started At</th>
                  <th style={{ padding: "0.85rem 1rem" }}>Duration</th>
                  <th style={{ padding: "0.85rem 1rem" }}>Exit Code</th>
                  <th style={{ padding: "0.85rem 1rem", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {executions.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}>
                      No execution runs recorded yet.
                    </td>
                  </tr>
                ) : (
                  executions.map((exec) => (
                    <tr
                      key={exec.id}
                      onClick={() => {
                        setSelectedExecution(exec);
                        setActiveTab("terminal");
                      }}
                      style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.15s ease" }}
                      className="hover:bg-white/[0.02]"
                    >
                      <td style={{ padding: "0.85rem 1rem" }}>
                        <span className={`badge ${exec.status === "SUCCESS" ? "badge-ready" : "badge-failed"}`}>
                          {exec.status}
                        </span>
                      </td>
                      <td style={{ padding: "0.85rem 1rem", fontFamily: "var(--font-geist-mono), monospace", color: "var(--muted)" }}>
                        {exec.triggerType}
                      </td>
                      <td style={{ padding: "0.85rem 1rem", fontFamily: "var(--font-geist-mono), monospace" }}>
                        {format(new Date(exec.startedAt), "yyyy-MM-dd HH:mm:ss")}
                      </td>
                      <td style={{ padding: "0.85rem 1rem", fontFamily: "var(--font-geist-mono), monospace" }}>
                        {exec.durationMs ? `${Math.round(exec.durationMs)} ms` : "..."}
                      </td>
                      <td style={{ padding: "0.85rem 1rem", fontFamily: "var(--font-geist-mono), monospace" }}>
                        {exec.exitCode ?? 0}
                      </td>
                      <td style={{ padding: "0.85rem 1rem", textAlign: "right" }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedExecution(exec);
                            setActiveTab("terminal");
                          }}
                          className="btn btn-sm btn-secondary"
                        >
                          View Logs
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: TARGET & POLICY DEEP DIVE */}
      {activeTab === "config" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
          {/* Target Payload Card */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1.5rem", boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--foreground)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Code size={16} style={{ color: "var(--accent)" }} />
                <span>Target Pipeline Configuration</span>
              </h3>
              <button
                onClick={() => handleCopyLogs(JSON.stringify(job.targetConfig, null, 2))}
                className="btn btn-sm btn-secondary"
              >
                Copy JSON
              </button>
            </div>
            <pre style={{ background: "var(--bg-inset)", border: "1px solid var(--border)", padding: "1rem", borderRadius: "8px", fontSize: "0.78rem", color: "var(--accent)", fontFamily: "var(--font-geist-mono), monospace", overflowX: "auto" }}>
              {JSON.stringify(job.targetConfig, null, 2)}
            </pre>
          </div>

          {/* Resilience Policies Card */}
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1.5rem", boxShadow: "var(--shadow)" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--foreground)", display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
              <ShieldAlert size={16} style={{ color: "#f59e0b" }} />
              <span>Resilience & Execution Policies</span>
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ padding: "0.85rem", borderRadius: "8px", background: "var(--bg-inset)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>Misfire Reboot Policy</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--foreground)", marginTop: "0.2rem" }}>{job.misfirePolicy}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted-fg)", marginTop: "0.2rem" }}>
                  {job.misfirePolicy === "SKIP"
                    ? "Discards missed executions during Azure VM downtime to avoid thundering herd crashes."
                    : job.misfirePolicy === "FIRE_LATEST_ONCE"
                    ? "Fires 1 catchup execution immediately upon boot, then resumes normal intervals."
                    : "Sequentially replays all missed executions."}
                </div>
              </div>

              <div style={{ padding: "0.85rem", borderRadius: "8px", background: "var(--bg-inset)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>Concurrency Control</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--foreground)", marginTop: "0.2rem" }}>{job.concurrencyPolicy}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted-fg)", marginTop: "0.2rem" }}>
                  Max Concurrent Runs: {job.maxConcurrentRuns}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div style={{ padding: "0.85rem", borderRadius: "8px", background: "var(--bg-inset)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>Timeout</div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--foreground)", marginTop: "0.2rem" }}>{job.timeoutSeconds}s</div>
                </div>
                <div style={{ padding: "0.85rem", borderRadius: "8px", background: "var(--bg-inset)", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>Retry Policy</div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--foreground)", marginTop: "0.2rem" }}>
                    {job.maxRetries} retries ({job.retryDelaySeconds}s delay)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: UPCOMING 15 RUNS CALENDAR */}
      {activeTab === "schedule" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1.5rem", boxShadow: "var(--shadow)" }}>
          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--foreground)", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Calendar size={16} style={{ color: "var(--accent)" }} />
            <span>Next 15 Calculated Runs ({job.timezone})</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {getNextRuns(job.schedule, job.timezone, 15).map((date, idx) => (
              <div
                key={idx}
                style={{
                  padding: "0.85rem 1rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--bg-inset)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.82rem",
                  fontFamily: "var(--font-geist-mono), monospace",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>#{idx + 1}</span>
                  <span style={{ color: "var(--foreground)" }}>{format(date, "EEEE, MMMM d, yyyy • HH:mm:ss")}</span>
                </div>
                <span style={{ color: "var(--muted)" }}>{formatDistanceToNow(date, { addSuffix: true })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: DEAD LETTER QUEUE (DLQ) */}
      {activeTab === "dlq" && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1.5rem", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--foreground)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <ShieldAlert size={16} style={{ color: "var(--danger)" }} />
              <span>Dead Letter Queue ({deadLetters.length} unresolved)</span>
            </div>
            <button onClick={fetchDeadLetters} className="btn btn-sm btn-secondary">
              <RefreshCw size={12} className={loadingDlq ? "animate-spin" : ""} />
            </button>
          </div>

          {deadLetters.length === 0 ? (
            <div style={{ textAlign: "center", padding: "4rem 1rem", color: "var(--muted)" }}>
              <CheckCircle2 size={36} style={{ color: "#10b981", margin: "0 auto 0.75rem" }} />
              <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--foreground)" }}>Dead Letter Queue Clean</div>
              <p style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>No executions for this task have exceeded max retries.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {deadLetters.map((dlq) => (
                <div
                  key={dlq.id}
                  style={{
                    padding: "1.25rem",
                    borderRadius: "8px",
                    border: "1px solid rgba(244, 63, 94, 0.3)",
                    background: "rgba(244, 63, 94, 0.05)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.6rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="badge badge-failed">{dlq.status}</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontFamily: "var(--font-geist-mono), monospace" }}>
                      {format(new Date(dlq.createdAt), "yyyy-MM-dd HH:mm:ss")}
                    </span>
                  </div>
                  <div style={{ background: "rgba(0,0,0,0.5)", padding: "0.75rem", borderRadius: "6px", fontFamily: "var(--font-geist-mono), monospace", fontSize: "0.78rem", color: "var(--foreground)" }}>
                    {dlq.failureReason}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", paddingTop: "0.25rem" }}>
                    <button onClick={() => handleDiscardDlq(dlq)} className="btn btn-sm btn-secondary">
                      Discard
                    </button>
                    <button
                      onClick={() => handleReplayDlq(dlq)}
                      disabled={replayingDlqId === dlq.id}
                      className="btn btn-sm btn-primary"
                    >
                      <RotateCcw size={12} className={replayingDlqId === dlq.id ? "animate-spin" : ""} />
                      <span>{replayingDlqId === dlq.id ? "Replaying..." : "Replay Run"}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── EDIT MODAL ──────────────────────────────────────────────────────── */}
      {editModalOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0, 0, 0, 0.75)", backdropFilter: "blur(8px)", padding: "1rem" }}>
          <div style={{ background: "#0c1017", border: "1px solid var(--border)", borderRadius: "var(--radius)", width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-hover)" }}>
            <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-inset)" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--foreground)" }}>Edit Cron Task Configuration</h3>
              <button onClick={() => setEditModalOpen(false)} style={{ background: "transparent", border: "none", color: "var(--muted)", fontSize: "1.25rem", cursor: "pointer" }}>✕</button>
            </div>
            <form onSubmit={handleSaveEdit} style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.3rem" }}>Task Name</label>
                <input type="text" required value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} className="input" />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.3rem" }}>Schedule Expression</label>
                <input type="text" required value={editFormData.schedule} onChange={(e) => setEditFormData({ ...editFormData, schedule: e.target.value })} className="input mono" />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.3rem" }}>Timezone</label>
                <select value={editFormData.timezone} onChange={(e) => setEditFormData({ ...editFormData, timezone: e.target.value })} className="input">
                  {POPULAR_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz} className="bg-[#0e121b]">{tz}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
                <button type="button" onClick={() => setEditModalOpen(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={savingEdit} className="btn btn-primary">{savingEdit ? "Saving..." : "Save Changes"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
