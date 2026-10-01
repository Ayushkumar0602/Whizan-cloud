"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  Clock,
  Plus,
  Search,
  Filter,
  Terminal,
  Activity,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Zap,
  Server,
  Code,
  Globe,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Cpu,
  Layers,
  Sparkles,
  ArrowRight,
  Eye,
  Check,
  Copy,
  Download,
  Pause,
  Calendar,
  SlidersHorizontal,
  Radio,
  FileText,
  ListFilter,
  LayoutGrid,
  Table as TableIcon,
  Timer,
  ChevronDown,
  Settings2,
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
  { label: "Every 5 Minutes", value: "*/5 * * * *", desc: "Runs every 5 minutes (:00, :05, :10...)" },
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

function getNextRuns(schedule: string, timezone = "UTC", count = 5): Date[] {
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

function getHumanReadableSchedule(schedule: string): string {
  const match = PRESET_SCHEDULES.find((p) => p.value === schedule);
  if (match) return match.label;
  if (schedule === "*/10 * * * *") return "Every 10 minutes";
  if (schedule === "*/30 * * * *") return "Every 30 minutes";
  if (schedule === "0 */2 * * *") return "Every 2 hours";
  if (schedule === "0 */6 * * *") return "Every 6 hours";
  if (schedule === "0 12 * * *") return "Daily at noon";
  return `Custom: ${schedule}`;
}

export default function CronDashboardPage() {
  const [list, setList] = useState<CronJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTarget, setFilterTarget] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [sortBy, setSortBy] = useState<"nextRun" | "lastRun" | "name" | "created">("nextRun");

  // User resources for auto-complete dropdowns
  const [userServices, setUserServices] = useState<any[]>([]);
  const [userFunctions, setUserFunctions] = useState<any[]>([]);
  const [userProjects, setUserProjects] = useState<any[]>([]);

  // Modal State (Create & Edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTabForm, setActiveTabForm] = useState<"general" | "target" | "policies">("general");

  const [formData, setFormData] = useState({
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
    // Target inputs
    serviceId: "",
    command: "python manage.py purge_sessions",
    workDir: "/app",
    user: "root",
    endpointPath: "/cleanup",
    method: "POST" as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    port: 3000,
    webhookUrl: "https://api.example.com/tasks",
    customHeaders: "{\n  \"Content-Type\": \"application/json\"\n}",
    payloadJson: "{\n  \"action\": \"scheduled_sync\"\n}",
  });

  // History & Observability Drawer State
  const [selectedJob, setSelectedJob] = useState<CronJobItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"terminal" | "history" | "config" | "schedule" | "dlq">("terminal");
  const [executions, setExecutions] = useState<CronExecutionItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<CronExecutionItem | null>(null);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [deadLetters, setDeadLetters] = useState<CronDeadLetterItem[]>([]);
  const [loadingDlq, setLoadingDlq] = useState(false);
  const [replayingDlqId, setReplayingDlqId] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);

  // SSE Live Log Streaming
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingLogs, setStreamingLogs] = useState<string[]>([]);
  const sseRef = useRef<EventSource | null>(null);

  // Detect user local timezone on mount
  useEffect(() => {
    try {
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (userTz) {
        setFormData((prev) => ({ ...prev, timezone: userTz }));
      }
    } catch {}
  }, []);

  const fetchJobs = async () => {
    try {
      const data = await cronApi.list();
      setList(data);
    } catch (err: any) {
      toast.error(err.message || "Failed to load scheduled cron jobs");
    } finally {
      setLoading(false);
    }
  };

  const fetchUserResources = async () => {
    try {
      const [svcRes, fnRes, projRes] = await Promise.allSettled([
        services.list(),
        functionsApi.list(),
        projects.list(),
      ]);

      if (svcRes.status === "fulfilled") setUserServices(svcRes.value || []);
      if (fnRes.status === "fulfilled") setUserFunctions(fnRes.value || []);
      if (projRes.status === "fulfilled") setUserProjects(projRes.value || []);
    } catch {
      // Non-critical resource loading
    }
  };

  useEffect(() => {
    fetchJobs();
    fetchUserResources();
  }, []);

  // Live calculated next 5 runs for form preview
  const liveFormNextRuns = useMemo(() => {
    return getNextRuns(formData.schedule, formData.timezone, 5);
  }, [formData.schedule, formData.timezone]);

  // Handle 1-Click Trigger
  const handleTrigger = async (job: CronJobItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTriggeringId(job.id);
    try {
      const res = await cronApi.trigger(job.id);
      toast.success(`Triggered '${job.name}' immediately! Execution ID: ${res.executionId.slice(0, 8)}`);
      await fetchJobs();
      if (selectedJob?.id === job.id && drawerOpen) {
        await loadExecutions(job.id, 1);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to trigger cron job");
    } finally {
      setTriggeringId(null);
    }
  };

  // Toggle Active State
  const handleToggleEnabled = async (job: CronJobItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newStatus = !job.enabled;
    try {
      // Optimistic update
      setList((prev) =>
        prev.map((item) => (item.id === job.id ? { ...item, enabled: newStatus } : item))
      );
      if (selectedJob?.id === job.id) {
        setSelectedJob((prev) => (prev ? { ...prev, enabled: newStatus } : null));
      }
      await cronApi.update(job.id, { enabled: newStatus });
      toast.success(newStatus ? `Activated '${job.name}'` : `Paused '${job.name}'`);
      await fetchJobs();
    } catch (err: any) {
      toast.error(err.message || "Failed to update cron job");
      await fetchJobs();
    }
  };

  // Delete Job
  const handleDelete = async (job: CronJobItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm(`Are you sure you want to delete cron job '${job.name}'? This will cancel all upcoming scheduled executions.`)) return;
    try {
      await cronApi.delete(job.id);
      toast.success(`Deleted '${job.name}'`);
      setList((prev) => prev.filter((item) => item.id !== job.id));
      if (selectedJob?.id === job.id) {
        setDrawerOpen(false);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete cron job");
    }
  };

  // Duplicate / Clone Job
  const handleClone = (job: CronJobItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingJobId(null);
    const tc = job.targetConfig || {};

    setFormData({
      name: `${job.name} (Copy)`,
      description: job.description ? `Copy of ${job.description}` : "",
      schedule: job.schedule,
      timezone: job.timezone,
      targetType: job.targetType,
      misfirePolicy: job.misfirePolicy,
      concurrencyPolicy: job.concurrencyPolicy,
      maxConcurrentRuns: job.maxConcurrentRuns,
      timeoutSeconds: job.timeoutSeconds,
      maxRetries: job.maxRetries,
      retryDelaySeconds: job.retryDelaySeconds,
      enabled: true,
      serviceId: tc.serviceId || tc.projectId || "",
      command: Array.isArray(tc.command) ? tc.command.join(" ") : tc.command || "python manage.py purge_sessions",
      workDir: tc.workDir || "/app",
      user: tc.user || "root",
      endpointPath: tc.endpointPath || tc.routePath || "/cleanup",
      method: tc.method || "POST",
      port: tc.port || 3000,
      webhookUrl: tc.url || "https://api.example.com/tasks",
      customHeaders: tc.headers ? JSON.stringify(tc.headers, null, 2) : "{}",
      payloadJson: tc.payload || tc.body ? JSON.stringify(tc.payload || tc.body, null, 2) : "{}",
    });
    setModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (job: CronJobItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingJobId(job.id);
    const tc = job.targetConfig || {};

    setFormData({
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
    setModalOpen(true);
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingJobId(null);
    let defaultServiceId = "";
    if (userServices.length > 0) defaultServiceId = userServices[0].id || userServices[0].subdomain;
    setFormData((prev) => ({
      ...prev,
      name: "",
      description: "",
      schedule: "0 0 * * *",
      serviceId: defaultServiceId,
      command: "python manage.py purge_sessions",
      endpointPath: "/cleanup",
      method: "POST",
      enabled: true,
    }));
    setActiveTabForm("general");
    setModalOpen(true);
  };

  // Save Job (Create or Update)
  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Please provide a name for the cron job");
      return;
    }

    try {
      cronParser.parseExpression(formData.schedule);
    } catch {
      toast.error("Invalid cron expression. Must follow 5-part format, e.g. '0 0 * * *'");
      return;
    }

    setSaving(true);
    try {
      let targetConfig: any = {};
      let parsedHeaders: any = undefined;
      let parsedPayload: any = undefined;

      try {
        if (formData.customHeaders && formData.customHeaders.trim()) {
          parsedHeaders = JSON.parse(formData.customHeaders);
        }
      } catch {
        toast.error("Headers must be valid JSON");
        setSaving(false);
        return;
      }

      try {
        if (formData.payloadJson && formData.payloadJson.trim()) {
          parsedPayload = JSON.parse(formData.payloadJson);
        }
      } catch {
        toast.error("Payload must be valid JSON");
        setSaving(false);
        return;
      }

      if (formData.targetType === "CONTAINER_EXEC") {
        targetConfig = {
          targetType: "CONTAINER_EXEC",
          serviceId: formData.serviceId || "whizan-api",
          command: formData.command.split(" ").filter(Boolean),
          workDir: formData.workDir || undefined,
          user: formData.user || undefined,
        };
      } else if (formData.targetType === "FUNCTION") {
        targetConfig = {
          targetType: "FUNCTION",
          serviceId: formData.serviceId || "default-fn",
          endpointPath: formData.endpointPath.startsWith("/") ? formData.endpointPath : `/${formData.endpointPath}`,
          method: formData.method,
          payload: parsedPayload,
        };
      } else if (formData.targetType === "SERVICE") {
        targetConfig = {
          targetType: "SERVICE",
          serviceId: formData.serviceId || "default-service",
          routePath: formData.endpointPath.startsWith("/") ? formData.endpointPath : `/${formData.endpointPath}`,
          port: Number(formData.port) || 3000,
          method: formData.method,
          payload: parsedPayload,
        };
      } else if (formData.targetType === "PROJECT") {
        targetConfig = {
          targetType: "PROJECT",
          projectId: formData.serviceId || "default-project",
          routePath: formData.endpointPath.startsWith("/") ? formData.endpointPath : `/${formData.endpointPath}`,
          method: formData.method,
          payload: parsedPayload,
        };
      } else if (formData.targetType === "WEBHOOK") {
        targetConfig = {
          targetType: "WEBHOOK",
          url: formData.webhookUrl,
          method: formData.method,
          headers: parsedHeaders,
          body: parsedPayload,
        };
      }

      const payload = {
        name: formData.name,
        description: formData.description || undefined,
        schedule: formData.schedule,
        timezone: formData.timezone,
        target: targetConfig,
        misfirePolicy: formData.misfirePolicy,
        concurrencyPolicy: formData.concurrencyPolicy,
        maxConcurrentRuns: Number(formData.maxConcurrentRuns) || 1,
        timeoutSeconds: Number(formData.timeoutSeconds) || 300,
        maxRetries: Number(formData.maxRetries) || 0,
        retryDelaySeconds: Number(formData.retryDelaySeconds) || 10,
        enabled: formData.enabled,
      };

      if (editingJobId) {
        await cronApi.update(editingJobId, payload);
        toast.success(`Cron task '${formData.name}' updated!`);
      } else {
        await cronApi.create(payload);
        toast.success(`Cron task '${formData.name}' scheduled with Zero-Idle Macro-Scheduler!`);
      }

      setModalOpen(false);
      await fetchJobs();
    } catch (err: any) {
      toast.error(err.message || "Failed to save cron task");
    } finally {
      setSaving(false);
    }
  };

  // Load executions for drawer
  const loadExecutions = async (jobId: string, page = 1) => {
    setLoadingHistory(true);
    try {
      const res = await cronApi.getExecutions(jobId, page, 20);
      setExecutions(res.executions || []);
      setHistoryTotal(res.total || 0);
      setHistoryPage(page);
      if (res.executions && res.executions.length > 0 && !selectedExecution) {
        setSelectedExecution(res.executions[0]);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load execution logs");
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load Dead Letters for drawer
  const loadDeadLetters = async (jobId: string) => {
    setLoadingDlq(true);
    try {
      const letters = await cronApi.getDeadLetters(jobId);
      setDeadLetters(letters);
    } catch {
      // Non-critical
    } finally {
      setLoadingDlq(false);
    }
  };

  // Open History Drawer
  const openDrawer = (job: CronJobItem, initialTab: typeof drawerTab = "terminal") => {
    setSelectedJob(job);
    setDrawerTab(initialTab);
    setSelectedExecution(null);
    setDrawerOpen(true);
    loadExecutions(job.id, 1);
    loadDeadLetters(job.id);
  };

  // Replay Dead Letter
  const handleReplayDlq = async (dlq: CronDeadLetterItem) => {
    if (!selectedJob) return;
    setReplayingDlqId(dlq.id);
    try {
      const res = await cronApi.replayDeadLetter(selectedJob.id, dlq.id);
      toast.success(`Replayed failed run! Execution ID: ${res.executionId.slice(0, 8)}`);
      await loadDeadLetters(selectedJob.id);
      await loadExecutions(selectedJob.id, 1);
      setDrawerTab("terminal");
    } catch (err: any) {
      toast.error(err.message || "Failed to replay dead letter");
    } finally {
      setReplayingDlqId(null);
    }
  };

  // Discard Dead Letter
  const handleDiscardDlq = async (dlq: CronDeadLetterItem) => {
    if (!selectedJob) return;
    try {
      await cronApi.discardDeadLetter(selectedJob.id, dlq.id);
      toast.success("Dead letter discarded");
      await loadDeadLetters(selectedJob.id);
    } catch (err: any) {
      toast.error(err.message || "Failed to discard dead letter");
    }
  };

  // Copy Logs to Clipboard
  const handleCopyLogs = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    toast.success("Logs copied to clipboard");
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Download Logs as File
  const handleDownloadLogs = (exec: CronExecutionItem) => {
    const content = exec.stdout || exec.errorMessage || "No logs available";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cron-${selectedJob?.name || "job"}-${exec.id.slice(0, 8)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Live SSE Stream Handler for Running Executions
  useEffect(() => {
    if (
      drawerOpen &&
      selectedJob &&
      selectedExecution &&
      (selectedExecution.status === "RUNNING" || selectedExecution.status === "SCHEDULED")
    ) {
      setIsStreaming(true);
      setStreamingLogs([]);

      const streamUrl = cronApi.getLogsStreamUrl(selectedJob.id, selectedExecution.id);
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
  }, [drawerOpen, selectedJob, selectedExecution]);

  // Filtered & Sorted List
  const filteredList = useMemo(() => {
    return list
      .filter((job) => {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          job.name.toLowerCase().includes(query) ||
          job.schedule.toLowerCase().includes(query) ||
          (job.description && job.description.toLowerCase().includes(query)) ||
          JSON.stringify(job.targetConfig).toLowerCase().includes(query);

        const matchesTarget = filterTarget === "ALL" || job.targetType === filterTarget;

        let matchesStatus = true;
        if (filterStatus === "ACTIVE") matchesStatus = job.enabled;
        else if (filterStatus === "PAUSED") matchesStatus = !job.enabled;
        else if (filterStatus === "FAILING") matchesStatus = job.lastStatus === "FAILED";

        return matchesSearch && matchesTarget && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "created") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (sortBy === "lastRun") {
          const timeA = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
          const timeB = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
          return timeB - timeA;
        }
        // Default: nextRun
        if (!a.nextRunAt && !b.nextRunAt) return 0;
        if (!a.nextRunAt) return 1;
        if (!b.nextRunAt) return -1;
        return new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime();
      });
  }, [list, searchQuery, filterTarget, filterStatus, sortBy]);

  // Overall statistics
  const stats = useMemo(() => {
    const total = list.length;
    const active = list.filter((j) => j.enabled).length;
    let totalRuns = 0;
    let successRuns = 0;
    let dlqCount = 0;

    list.forEach((j) => {
      totalRuns += j._count?.executions || 0;
      dlqCount += j._count?.deadLetters || 0;
      if (j.lastStatus === "SUCCESS") successRuns++;
    });

    const successRate = total > 0 ? Math.round((successRuns / total) * 100) : 100;
    return { total, active, totalRuns, successRate, dlqCount };
  }, [list]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ─── HEADER ──────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Cron & Scheduled Compute"
        subtitle="Zero-Idle CPU architecture (< 0.01%), multi-target pipeline dispatch, and enterprise disaster recovery."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={fetchJobs}
              className="p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-white/70 hover:text-white border border-white/10 transition-all cursor-pointer"
              title="Refresh Task List"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-sm font-medium shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Cron Task</span>
            </button>
          </div>
        }
      />

      {/* ─── HIGH-IMPACT RESOURCE KPI CARDS ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Tasks & Event Loop */}
        <div className="p-4 rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] backdrop-blur-md space-y-1 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-white/50 font-medium">
            <span>ACTIVE TASKS</span>
            <Clock className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight flex items-baseline gap-1.5">
            {stats.active}
            <span className="text-sm font-normal text-white/40">/ {stats.total} total</span>
          </div>
          <div className="text-xs text-emerald-400 flex items-center gap-1.5 pt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Zero-Idle Event Loop Online</span>
          </div>
        </div>

        {/* Dynamic OS Timer CPU Overhead */}
        <div className="p-4 rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] backdrop-blur-md space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-xs text-white/50 font-medium">
            <span>IDLE CPU OVERHEAD</span>
            <Cpu className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 tracking-tight">&lt; 0.01%</div>
          <div className="text-xs text-white/50">Dynamic OS sleep vs 86,400 polls</div>
        </div>

        {/* 64KB Circular Ring Buffer */}
        <div className="p-4 rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] backdrop-blur-md space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-xs text-white/50 font-medium">
            <span>LOG MEMORY CAP</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">64 KB</div>
          <div className="text-xs text-purple-300">Circular Byte Ring Buffer (0 OOM)</div>
        </div>

        {/* Disaster Recovery & Health */}
        <div className="p-4 rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] backdrop-blur-md space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-xs text-white/50 font-medium">
            <span>REBOOT RECOVERY</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight flex items-baseline gap-2">
            <span>Self-Healing</span>
            <span className="text-xs text-emerald-400 font-medium">{stats.successRate}% Success</span>
          </div>
          <div className="text-xs text-amber-300">Atomic Redis & DB Rehydration</div>
        </div>
      </div>

      {/* ─── FILTER, SEARCH, SORT & VIEW CONTROLS ────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Search Bar */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Search by name, expression, command..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder-white/40 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end flex-wrap">
            {/* Status Filter */}
            <div className="flex items-center bg-white/[0.02] border border-white/10 rounded-lg p-0.5 text-xs">
              {["ALL", "ACTIVE", "PAUSED", "FAILING"].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer font-medium ${
                    filterStatus === status
                      ? "bg-blue-600/30 text-blue-300 font-semibold"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Sort Selector */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 bg-white/[0.03] border border-white/10 rounded-lg text-xs text-white/80 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="nextRun" className="bg-[#0e121b]">Sort: Next Run</option>
              <option value="lastRun" className="bg-[#0e121b]">Sort: Last Run</option>
              <option value="name" className="bg-[#0e121b]">Sort: Name</option>
              <option value="created" className="bg-[#0e121b]">Sort: Newest</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-white/[0.02] border border-white/10 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                  viewMode === "grid" ? "bg-white/10 text-white" : "text-white/40 hover:text-white"
                }`}
                title="Grid Cards View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                  viewMode === "table" ? "bg-white/10 text-white" : "text-white/40 hover:text-white"
                }`}
                title="Table View"
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Target Type Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          {[
            { id: "ALL", label: "All Pipelines", icon: Layers },
            { id: "CONTAINER_EXEC", label: "Container Exec", icon: Server },
            { id: "FUNCTION", label: "Edge Function", icon: Zap },
            { id: "SERVICE", label: "Backend Service", icon: Activity },
            { id: "PROJECT", label: "Web Project", icon: Globe },
            { id: "WEBHOOK", label: "Webhook", icon: Radio },
          ].map((t) => {
            const Icon = t.icon;
            const isSelected = filterTarget === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setFilterTarget(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? "bg-blue-600/20 border border-blue-500/50 text-blue-300"
                    : "bg-white/[0.02] border border-white/5 text-white/60 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── TASK LIST / CARDS ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="p-16 text-center text-white/40 text-sm animate-pulse flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
          <span>Synchronizing scheduled tasks with Redis macro-scheduler...</span>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="p-16 text-center rounded-2xl border border-white/10 bg-white/[0.01] backdrop-blur-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
            <Clock className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="text-base font-semibold text-white">No scheduled cron tasks match your criteria</div>
            <p className="text-xs text-white/50 max-w-md mx-auto">
              Create a scheduled task to trigger Docker commands, Edge Function microservices, or webhook notifications automatically.
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-500/20 transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Scheduled Task</span>
          </button>
        </div>
      ) : viewMode === "grid" ? (
        /* GRID CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredList.map((job) => {
            const isTriggering = triggeringId === job.id;
            const deadLetterCount = job._count?.deadLetters || 0;

            return (
              <div
                key={job.id}
                onClick={() => openDrawer(job, "terminal")}
                className="group relative p-5 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.03] to-white/[0.01] hover:border-blue-500/40 hover:bg-white/[0.04] transition-all cursor-pointer flex flex-col justify-between gap-4 shadow-sm"
              >
                <div className="space-y-3">
                  {/* Top Badges & Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Target Badge */}
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase bg-white/10 text-white/80 border border-white/10 flex items-center gap-1">
                        {job.targetType === "CONTAINER_EXEC" && <Server className="w-3 h-3 text-cyan-400" />}
                        {job.targetType === "FUNCTION" && <Zap className="w-3 h-3 text-yellow-400" />}
                        {job.targetType === "SERVICE" && <Activity className="w-3 h-3 text-indigo-400" />}
                        {job.targetType === "PROJECT" && <Globe className="w-3 h-3 text-blue-400" />}
                        {job.targetType === "WEBHOOK" && <Radio className="w-3 h-3 text-emerald-400" />}
                        <span>{job.targetType.replace("_", " ")}</span>
                      </span>

                      {/* State Badge */}
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 ${
                          !job.enabled
                            ? "bg-gray-500/10 text-gray-400 border border-gray-500/20"
                            : job.lastStatus === "SUCCESS"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : job.lastStatus === "FAILED"
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        }`}
                      >
                        {!job.enabled ? (
                          <>
                            <Pause className="w-2.5 h-2.5" />
                            <span>PAUSED</span>
                          </>
                        ) : (
                          <>
                            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                            <span>{job.lastStatus || "ACTIVE"}</span>
                          </>
                        )}
                      </span>

                      {/* DLQ Alert Badge */}
                      {deadLetterCount > 0 && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            openDrawer(job, "dlq");
                          }}
                          className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1 hover:bg-rose-500/30"
                          title="Failed runs awaiting resolution"
                        >
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          <span>{deadLetterCount} DLQ</span>
                        </span>
                      )}
                    </div>

                    {/* Schedule Badge */}
                    <div className="font-mono text-xs px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 font-medium">
                      {job.schedule}
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h3 className="font-semibold text-white text-base group-hover:text-blue-300 transition-colors line-clamp-1">
                      {job.name}
                    </h3>
                    {job.description ? (
                      <p className="text-xs text-white/50 line-clamp-2 mt-0.5">{job.description}</p>
                    ) : (
                      <p className="text-xs text-white/30 italic mt-0.5">{getHumanReadableSchedule(job.schedule)}</p>
                    )}
                  </div>

                  {/* Target Command / Route Snippet */}
                  <div className="p-2 rounded-lg bg-black/40 border border-white/5 text-[11px] font-mono text-white/70 overflow-x-auto whitespace-nowrap">
                    {job.targetType === "CONTAINER_EXEC" && (
                      <span>
                        <span className="text-white/40">$ </span>
                        {Array.isArray(job.targetConfig?.command)
                          ? job.targetConfig?.command.join(" ")
                          : job.targetConfig?.command || "No command"}
                      </span>
                    )}
                    {job.targetType === "FUNCTION" && (
                      <span>
                        <span className="text-amber-400">{job.targetConfig?.method || "POST"} </span>
                        {job.targetConfig?.serviceId}
                        <span className="text-white/40">{job.targetConfig?.endpointPath || "/"}</span>
                      </span>
                    )}
                    {job.targetType === "SERVICE" && (
                      <span>
                        <span className="text-indigo-400">{job.targetConfig?.method || "POST"} </span>
                        {job.targetConfig?.serviceId}
                        <span className="text-white/40">{job.targetConfig?.routePath || "/"}</span>
                      </span>
                    )}
                    {job.targetType === "PROJECT" && (
                      <span>
                        <span className="text-blue-400">{job.targetConfig?.method || "GET"} </span>
                        {job.targetConfig?.projectId}
                        <span className="text-white/40">{job.targetConfig?.routePath || "/"}</span>
                      </span>
                    )}
                    {job.targetType === "WEBHOOK" && (
                      <span>
                        <span className="text-emerald-400">{job.targetConfig?.method || "POST"} </span>
                        {job.targetConfig?.url}
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer Timestamps & Action Buttons */}
                <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs text-white/50 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-white/40">Next:</span>
                      {job.nextRunAt && job.enabled ? (
                        <span className="text-white/80 font-medium">
                          {format(new Date(job.nextRunAt), "MMM d, HH:mm")} (
                          {formatDistanceToNow(new Date(job.nextRunAt), { addSuffix: true })})
                        </span>
                      ) : (
                        <span className="text-white/30 italic">Suspended</span>
                      )}
                    </div>
                    {job.lastRunAt && (
                      <div className="text-[11px] text-white/40">
                        Last run {formatDistanceToNow(new Date(job.lastRunAt), { addSuffix: true })}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => handleTrigger(job, e)}
                      disabled={isTriggering}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
                      title="Trigger immediately"
                    >
                      <Play className={`w-3 h-3 ${isTriggering ? "animate-spin" : ""}`} />
                      <span>{isTriggering ? "Running..." : "Run"}</span>
                    </button>

                    <button
                      onClick={(e) => handleToggleEnabled(job, e)}
                      className="px-2.5 py-1.5 bg-white/[0.03] hover:bg-white/[0.08] text-white/70 border border-white/10 rounded-lg text-xs font-medium transition-all cursor-pointer"
                      title={job.enabled ? "Pause task" : "Resume task"}
                    >
                      {job.enabled ? "Pause" : "Resume"}
                    </button>

                    <button
                      onClick={(e) => handleOpenEdit(job, e)}
                      className="p-1.5 text-white/50 hover:text-white hover:bg-white/[0.08] rounded-lg border border-white/5 transition-all cursor-pointer"
                      title="Edit Configuration"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => handleClone(job, e)}
                      className="p-1.5 text-white/50 hover:text-white hover:bg-white/[0.08] rounded-lg border border-white/5 transition-all cursor-pointer"
                      title="Duplicate Task"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => handleDelete(job, e)}
                      className="p-1.5 text-white/40 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                      title="Delete Task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* DENSE TABLE VIEW */
        <div className="rounded-xl border border-white/10 bg-white/[0.01] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.03] border-b border-white/10 text-white/50 font-medium">
                <tr>
                  <th className="p-3">Task Name</th>
                  <th className="p-3">Target Pipeline</th>
                  <th className="p-3">Schedule</th>
                  <th className="p-3">Next Execution</th>
                  <th className="p-3">Last Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/80 font-mono">
                {filteredList.map((job) => {
                  const isTriggering = triggeringId === job.id;
                  return (
                    <tr
                      key={job.id}
                      onClick={() => openDrawer(job, "terminal")}
                      className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <td className="p-3 font-sans font-medium text-white">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              !job.enabled
                                ? "bg-gray-500"
                                : job.lastStatus === "SUCCESS"
                                ? "bg-emerald-400"
                                : job.lastStatus === "FAILED"
                                ? "bg-rose-500"
                                : "bg-blue-400"
                            }`}
                          />
                          <span>{job.name}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-white/10 border border-white/10 text-white/80">
                          {job.targetType}
                        </span>
                      </td>
                      <td className="p-3 text-blue-400">
                        {job.schedule} ({job.timezone})
                      </td>
                      <td className="p-3 text-white/70">
                        {job.nextRunAt && job.enabled ? (
                          format(new Date(job.nextRunAt), "MMM d, HH:mm:ss")
                        ) : (
                          <span className="text-white/30 italic">Suspended</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            job.lastStatus === "SUCCESS"
                              ? "text-emerald-400 bg-emerald-500/10"
                              : job.lastStatus === "FAILED"
                              ? "text-rose-400 bg-rose-500/10"
                              : "text-blue-400 bg-blue-500/10"
                          }`}
                        >
                          {job.lastStatus || "READY"}
                        </span>
                      </td>
                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5 font-sans">
                          <button
                            onClick={(e) => handleTrigger(job, e)}
                            disabled={isTriggering}
                            className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded text-xs transition-all cursor-pointer disabled:opacity-50"
                          >
                            {isTriggering ? "Running..." : "Run"}
                          </button>
                          <button
                            onClick={(e) => handleToggleEnabled(job, e)}
                            className="px-2 py-1 bg-white/[0.04] hover:bg-white/[0.08] text-white/70 rounded text-xs transition-all cursor-pointer"
                          >
                            {job.enabled ? "Pause" : "Resume"}
                          </button>
                          <button
                            onClick={(e) => handleOpenEdit(job, e)}
                            className="p-1 text-white/50 hover:text-white rounded"
                            title="Edit"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(job, e)}
                            className="p-1 text-white/40 hover:text-rose-400 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── CREATE & EDIT TASK MODAL ────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-[#0b0e14] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span>{editingJobId ? "Edit Scheduled Cron Task" : "Create Scheduled Cron Task"}</span>
                </h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Event-driven dynamic OS sleep loop (&lt; 0.01% idle CPU) with microsecond dispatch.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-white/40 hover:text-white p-1 text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex border-b border-white/10 px-5 bg-white/[0.01]">
              {[
                { id: "general", label: "1. Schedule & Basics" },
                { id: "target", label: "2. Target Pipeline" },
                { id: "policies", label: "3. Resilience & Policies" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTabForm(t.id as any)}
                  className={`py-3 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                    activeTabForm === t.id
                      ? "border-blue-500 text-blue-400"
                      : "border-transparent text-white/50 hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveSubmit} className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
              {/* TAB 1: GENERAL & SCHEDULE */}
              {activeTabForm === "general" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/80">Task Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Nightly Database Vacuum & Session Cleanup"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3.5 py-2 bg-white/[0.03] border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/80">Description (Optional)</label>
                    <input
                      type="text"
                      placeholder="Brief note on what this cron does"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3.5 py-2 bg-white/[0.03] border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500 text-sm"
                    />
                  </div>

                  {/* Schedule Presets */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-white/80">Cron Frequency Presets</label>
                      <span className="text-[11px] text-blue-400 font-mono">Standard 5-part cron</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {PRESET_SCHEDULES.map((p) => {
                        const isSelected = formData.schedule === p.value;
                        return (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setFormData({ ...formData, schedule: p.value })}
                            className={`p-2.5 text-left rounded-xl border transition-all cursor-pointer ${
                              isSelected
                                ? "bg-blue-600/20 border-blue-500/60 text-blue-300"
                                : "bg-white/[0.02] border-white/5 text-white/60 hover:bg-white/[0.05]"
                            }`}
                          >
                            <div className="font-semibold text-white text-xs">{p.label}</div>
                            <div className="text-[10px] text-white/40 font-mono mt-0.5">{p.value}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom Cron Input & Timezone */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-white/80">Custom Expression</label>
                      <input
                        type="text"
                        required
                        value={formData.schedule}
                        onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
                        placeholder="0 0 * * *"
                        className="w-full font-mono px-3.5 py-2 bg-white/[0.03] border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-blue-500 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-white/80">Timezone (IANA)</label>
                      <select
                        value={formData.timezone}
                        onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                        className="w-full px-3.5 py-2 bg-white/[0.03] border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 cursor-pointer"
                      >
                        {POPULAR_TIMEZONES.map((tz) => (
                          <option key={tz} value={tz} className="bg-[#0e121b]">
                            {tz}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Live Calculated Next 5 Runs Preview */}
                  <div className="p-3.5 rounded-xl bg-blue-500/5 border border-blue-500/15 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs text-blue-300 font-semibold">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Next 5 Calculated Executions ({formData.timezone})</span>
                    </div>
                    {liveFormNextRuns.length > 0 ? (
                      <div className="space-y-1 font-mono text-xs text-white/70">
                        {liveFormNextRuns.map((date, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[11px]">
                            <span>
                              #{idx + 1}: {format(date, "EEEE, MMM d, yyyy • HH:mm:ss")}
                            </span>
                            <span className="text-white/40">
                              ({formatDistanceToNow(date, { addSuffix: true })})
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-rose-400">Invalid cron expression or timezone.</div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: TARGET PIPELINE */}
              {activeTabForm === "target" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-white/80">Select Target Execution Pipeline</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { type: "CONTAINER_EXEC", label: "Container Exec CLI", desc: "Run bash/python inside container", icon: Server },
                        { type: "FUNCTION", label: "Edge Function", desc: "Sub-5ms V8 isolate invocation", icon: Zap },
                        { type: "SERVICE", label: "Backend Service", desc: "Private Docker mesh route", icon: Activity },
                        { type: "WEBHOOK", label: "Signed Webhook", desc: "External HTTPS with HMAC signature", icon: Radio },
                      ].map((t) => {
                        const Icon = t.icon;
                        const isSelected = formData.targetType === t.type;
                        return (
                          <button
                            key={t.type}
                            type="button"
                            onClick={() => setFormData({ ...formData, targetType: t.type as any })}
                            className={`p-3 text-left rounded-xl border transition-all cursor-pointer ${
                              isSelected
                                ? "bg-blue-600/20 border-blue-500/60 text-blue-300"
                                : "bg-white/[0.02] border-white/5 text-white/60 hover:bg-white/[0.05]"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 font-semibold text-white text-xs">
                              <Icon className="w-3.5 h-3.5" />
                              <span>{t.label}</span>
                            </div>
                            <div className="text-[10px] text-white/40 mt-1">{t.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Target Dynamic Form Fields */}
                  {formData.targetType === "CONTAINER_EXEC" && (
                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-white/80">Target Docker Service</label>
                        {userServices.length > 0 ? (
                          <select
                            value={formData.serviceId}
                            onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs"
                          >
                            <option value="">Select a backend service...</option>
                            {userServices.map((s) => (
                              <option key={s.id} value={s.id || s.subdomain} className="bg-[#0e121b]">
                                {s.name} ({s.subdomain || s.id})
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <input
                          type="text"
                          placeholder="Or enter custom service ID / container name"
                          value={formData.serviceId}
                          onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
                          className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-mono mt-1"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-white/80">CLI Command</label>
                        <input
                          type="text"
                          required
                          placeholder="python manage.py purge_sessions"
                          value={formData.command}
                          onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                          className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-mono"
                        />
                        <p className="text-[10px] text-white/40">Executed directly via Docker socket (/var/run/docker.sock).</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-white/80">Working Directory</label>
                          <input
                            type="text"
                            placeholder="/app"
                            value={formData.workDir}
                            onChange={(e) => setFormData({ ...formData, workDir: e.target.value })}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-white/80">Run as User</label>
                          <input
                            type="text"
                            placeholder="root or node"
                            value={formData.user}
                            onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {formData.targetType === "FUNCTION" && (
                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-white/80">Edge Function Service</label>
                        {userFunctions.length > 0 ? (
                          <select
                            value={formData.serviceId}
                            onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs"
                          >
                            <option value="">Select an Edge Function service...</option>
                            {userFunctions.map((fn) => (
                              <option key={fn.id} value={fn.id} className="bg-[#0e121b]">
                                {fn.name} ({fn.subdomainSlug || fn.id})
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <input
                          type="text"
                          placeholder="Or enter Edge Function Service UUID"
                          value={formData.serviceId}
                          onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
                          className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-mono mt-1"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1 col-span-1">
                          <label className="text-xs font-medium text-white/80">HTTP Method</label>
                          <select
                            value={formData.method}
                            onChange={(e) => setFormData({ ...formData, method: e.target.value as any })}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs"
                          >
                            <option value="POST">POST</option>
                            <option value="GET">GET</option>
                            <option value="PUT">PUT</option>
                            <option value="DELETE">DELETE</option>
                          </select>
                        </div>
                        <div className="space-y-1 col-span-2">
                          <label className="text-xs font-medium text-white/80">Endpoint Route</label>
                          <input
                            type="text"
                            placeholder="/cleanup"
                            value={formData.endpointPath}
                            onChange={(e) => setFormData({ ...formData, endpointPath: e.target.value })}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-white/80">JSON Payload</label>
                        <textarea
                          rows={3}
                          value={formData.payloadJson}
                          onChange={(e) => setFormData({ ...formData, payloadJson: e.target.value })}
                          className="w-full p-2.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  )}

                  {formData.targetType === "SERVICE" && (
                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-white/80">Backend Service</label>
                        <input
                          type="text"
                          placeholder="e.g. whizan-api or service UUID"
                          value={formData.serviceId}
                          onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
                          className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-mono"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-white/80">Method</label>
                          <select
                            value={formData.method}
                            onChange={(e) => setFormData({ ...formData, method: e.target.value as any })}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs"
                          >
                            <option value="POST">POST</option>
                            <option value="GET">GET</option>
                            <option value="PUT">PUT</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-white/80">Internal Port</label>
                          <input
                            type="number"
                            value={formData.port}
                            onChange={(e) => setFormData({ ...formData, port: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-white/80">Route Path</label>
                          <input
                            type="text"
                            value={formData.endpointPath}
                            onChange={(e) => setFormData({ ...formData, endpointPath: e.target.value })}
                            className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {formData.targetType === "WEBHOOK" && (
                    <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-white/80">Webhook URL</label>
                        <input
                          type="url"
                          required
                          placeholder="https://api.example.com/tasks"
                          value={formData.webhookUrl}
                          onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                          className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-white/80">Custom Headers (JSON)</label>
                        <textarea
                          rows={2}
                          value={formData.customHeaders}
                          onChange={(e) => setFormData({ ...formData, customHeaders: e.target.value })}
                          className="w-full p-2.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-white/80">Request Body (JSON)</label>
                        <textarea
                          rows={3}
                          value={formData.payloadJson}
                          onChange={(e) => setFormData({ ...formData, payloadJson: e.target.value })}
                          className="w-full p-2.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: RESILIENCE & POLICIES */}
              {activeTabForm === "policies" && (
                <div className="space-y-4">
                  {/* Misfire Policy */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/80">Misfire Reboot Policy</label>
                    <p className="text-[11px] text-white/40">Action taken if Azure VM was powered off and missed intervals.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {[
                        { id: "SKIP", label: "SKIP (Recommended)", desc: "Discard missed runs to avoid thundering herd" },
                        { id: "FIRE_LATEST_ONCE", label: "FIRE_LATEST_ONCE", desc: "Execute 1 catchup run immediately on boot" },
                        { id: "CATCH_UP_ALL", label: "CATCH_UP_ALL", desc: "Replay all missed ticks sequentially" },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setFormData({ ...formData, misfirePolicy: p.id as any })}
                          className={`p-2.5 text-left rounded-xl border transition-all cursor-pointer ${
                            formData.misfirePolicy === p.id
                              ? "bg-blue-600/20 border-blue-500 text-blue-300"
                              : "bg-white/[0.02] border-white/5 text-white/60 hover:bg-white/[0.05]"
                          }`}
                        >
                          <div className="font-semibold text-white text-xs">{p.label}</div>
                          <div className="text-[10px] text-white/40 mt-1">{p.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Concurrency Policy */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/80">Concurrency Control</label>
                    <select
                      value={formData.concurrencyPolicy}
                      onChange={(e) => setFormData({ ...formData, concurrencyPolicy: e.target.value as any })}
                      className="w-full px-3.5 py-2 bg-white/[0.03] border border-white/10 rounded-xl text-white text-xs focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="FORBID" className="bg-[#0e121b]">FORBID (Skip new run if previous is still active)</option>
                      <option value="ALLOW" className="bg-[#0e121b]">ALLOW (Permit parallel executions)</option>
                      <option value="REPLACE" className="bg-[#0e121b]">REPLACE (Abort running process & start new)</option>
                      <option value="QUEUE_SERIALIZE" className="bg-[#0e121b]">QUEUE_SERIALIZE (Queue sequentially)</option>
                    </select>
                  </div>

                  {/* Timeout & Retries */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-white/80">Timeout (Seconds)</label>
                      <input
                        type="number"
                        min={1}
                        max={3600}
                        value={formData.timeoutSeconds}
                        onChange={(e) => setFormData({ ...formData, timeoutSeconds: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-xl text-white text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-white/80">Max Retries</label>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={formData.maxRetries}
                        onChange={(e) => setFormData({ ...formData, maxRetries: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-xl text-white text-xs font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-white/80">Retry Delay (Sec)</label>
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={formData.retryDelaySeconds}
                        onChange={(e) => setFormData({ ...formData, retryDelaySeconds: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-xl text-white text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Initial State */}
                  <div className="flex items-center gap-3 pt-2">
                    <input
                      type="checkbox"
                      id="enabledToggle"
                      checked={formData.enabled}
                      onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                    />
                    <label htmlFor="enabledToggle" className="text-xs font-medium text-white/80 cursor-pointer">
                      Task Active immediately upon saving
                    </label>
                  </div>
                </div>
              )}

              {/* Modal Footer Actions */}
              <div className="flex justify-between items-center pt-4 border-t border-white/10">
                <div className="flex items-center gap-2">
                  {activeTabForm !== "general" && (
                    <button
                      type="button"
                      onClick={() =>
                        setActiveTabForm(activeTabForm === "policies" ? "target" : "general")
                      }
                      className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.1] text-white/70 rounded-lg text-xs font-medium transition-all cursor-pointer"
                    >
                      Back
                    </button>
                  )}
                  {activeTabForm !== "policies" && (
                    <button
                      type="button"
                      onClick={() =>
                        setActiveTabForm(activeTabForm === "general" ? "target" : "policies")
                      }
                      className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded-lg text-xs font-medium transition-all cursor-pointer"
                    >
                      Next Step →
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.1] text-white/70 rounded-lg text-xs font-medium transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {saving ? "Scheduling..." : editingJobId ? "Save Changes" : "Create Task"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── OBSERVABILITY & MANAGEMENT DRAWER ─────────────────────────────────── */}
      {drawerOpen && selectedJob && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-3xl bg-[#0a0d13] border-l border-white/10 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="space-y-1 min-w-0 pr-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="font-semibold text-white text-sm truncate">{selectedJob.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                      !selectedJob.enabled
                        ? "bg-gray-500/20 text-gray-400"
                        : selectedJob.lastStatus === "SUCCESS"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : selectedJob.lastStatus === "FAILED"
                        ? "bg-rose-500/20 text-rose-400"
                        : "bg-blue-500/20 text-blue-400"
                    }`}
                  >
                    {!selectedJob.enabled ? "PAUSED" : selectedJob.lastStatus || "ACTIVE"}
                  </span>
                </div>
                <div className="text-[11px] text-white/40 font-mono flex items-center gap-2">
                  <span className="text-blue-400">{selectedJob.schedule}</span>
                  <span>•</span>
                  <span>{selectedJob.timezone}</span>
                  <span>•</span>
                  <span>{selectedJob.targetType}</span>
                </div>
              </div>

              {/* Drawer Top Action Bar */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => handleTrigger(selectedJob, e)}
                  disabled={triggeringId === selectedJob.id}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  <Play className={`w-3 h-3 ${triggeringId === selectedJob.id ? "animate-spin" : ""}`} />
                  <span>{triggeringId === selectedJob.id ? "Running..." : "Run Now"}</span>
                </button>

                <button
                  onClick={(e) => handleToggleEnabled(selectedJob, e)}
                  className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-white/70 border border-white/10 rounded-lg text-xs font-medium cursor-pointer"
                >
                  {selectedJob.enabled ? "Pause" : "Resume"}
                </button>

                <button
                  onClick={(e) => handleOpenEdit(selectedJob, e)}
                  className="p-1.5 text-white/50 hover:text-white hover:bg-white/[0.08] rounded-lg border border-white/10 cursor-pointer"
                  title="Edit Settings"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setDrawerOpen(false)}
                  className="text-white/40 hover:text-white p-1.5 text-sm cursor-pointer ml-1"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Drawer Navigation Tabs */}
            <div className="flex border-b border-white/10 bg-white/[0.01] px-4 overflow-x-auto text-xs">
              {[
                { id: "terminal", label: "Terminal Logs", icon: Terminal },
                { id: "history", label: `Execution History (${historyTotal})`, icon: Clock },
                { id: "config", label: "Target Deep Dive", icon: Code },
                { id: "schedule", label: "Upcoming Runs", icon: Calendar },
                { id: "dlq", label: `Dead Letter Queue (${deadLetters.length})`, icon: ShieldAlert },
              ].map((t) => {
                const Icon = t.icon;
                const isSelected = drawerTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setDrawerTab(t.id as any)}
                    className={`flex items-center gap-1.5 py-2.5 px-3 font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                      isSelected
                        ? "border-blue-500 text-blue-400 bg-blue-500/[0.03]"
                        : "border-transparent text-white/50 hover:text-white"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* TAB 1: LIVE TERMINAL LOGS */}
              {drawerTab === "terminal" && (
                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                  {/* Left: Execution Run Selector */}
                  <div className="w-full md:w-60 border-b md:border-b-0 md:border-r border-white/10 overflow-y-auto p-2 space-y-1 bg-white/[0.01]">
                    <div className="text-[10px] font-bold text-white/40 px-2 py-1 uppercase tracking-wider flex items-center justify-between">
                      <span>Recent Runs</span>
                      <button
                        onClick={() => selectedJob && loadExecutions(selectedJob.id, 1)}
                        className="text-white/40 hover:text-white"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>

                    {loadingHistory ? (
                      <div className="p-4 text-center text-xs text-white/40 animate-pulse">Loading runs...</div>
                    ) : executions.length === 0 ? (
                      <div className="p-4 text-center text-xs text-white/40">No runs recorded yet.</div>
                    ) : (
                      executions.map((exec) => {
                        const isSelected = selectedExecution?.id === exec.id;
                        return (
                          <div
                            key={exec.id}
                            onClick={() => setSelectedExecution(exec)}
                            className={`p-2 rounded-xl text-xs transition-all cursor-pointer space-y-1 ${
                              isSelected
                                ? "bg-blue-600/20 border border-blue-500/40 text-white"
                                : "hover:bg-white/[0.04] text-white/70 border border-transparent"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={`font-semibold text-[11px] ${
                                  exec.status === "SUCCESS"
                                    ? "text-emerald-400"
                                    : exec.status === "FAILED"
                                    ? "text-rose-400"
                                    : "text-amber-400"
                                }`}
                              >
                                {exec.status}
                              </span>
                              <span className="text-[10px] text-white/40 font-mono">
                                {exec.durationMs ? `${Math.round(exec.durationMs)}ms` : "..."}
                              </span>
                            </div>
                            <div className="text-[10px] text-white/40 font-mono flex items-center justify-between">
                              <span>{format(new Date(exec.startedAt), "HH:mm:ss")}</span>
                              <span>{exec.triggerType}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Right: Terminal Output */}
                  <div className="flex-1 flex flex-col bg-black/80 overflow-hidden font-mono text-xs">
                    {/* Terminal Top Control Bar */}
                    <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between text-[11px] text-white/40 bg-white/[0.02]">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-3.5 h-3.5 text-blue-400" />
                        <span>TERMINAL LOG (CAPPED 64KB RING BUFFER)</span>
                        {isStreaming && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] animate-pulse">
                            LIVE SSE STREAM
                          </span>
                        )}
                      </div>

                      {selectedExecution && (
                        <div className="flex items-center gap-2">
                          <span>
                            Exit:{" "}
                            <span
                              className={
                                selectedExecution.exitCode === 0 ? "text-emerald-400" : "text-rose-400"
                              }
                            >
                              {selectedExecution.exitCode ?? 0}
                            </span>
                          </span>

                          <button
                            onClick={() =>
                              handleCopyLogs(
                                selectedExecution.stdout || selectedExecution.errorMessage || ""
                              )
                            }
                            className="p-1 text-white/40 hover:text-white"
                            title="Copy logs"
                          >
                            {copiedText ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>

                          <button
                            onClick={() => handleDownloadLogs(selectedExecution)}
                            className="p-1 text-white/40 hover:text-white"
                            title="Download log file"
                          >
                            <Download className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Terminal Stream / Content */}
                    <div className="flex-1 p-4 overflow-y-auto space-y-1 text-white/80 selection:bg-blue-500/30">
                      {isStreaming && streamingLogs.length > 0 ? (
                        <pre className="whitespace-pre-wrap leading-relaxed text-[11px] text-cyan-300">
                          {streamingLogs.join("\n")}
                        </pre>
                      ) : selectedExecution ? (
                        selectedExecution.stdout ? (
                          <pre className="whitespace-pre-wrap leading-relaxed text-[11px] text-emerald-300/90">
                            {selectedExecution.stdout}
                          </pre>
                        ) : selectedExecution.errorMessage ? (
                          <pre className="whitespace-pre-wrap leading-relaxed text-[11px] text-rose-400">
                            {selectedExecution.errorMessage}
                          </pre>
                        ) : (
                          <div className="text-white/30 italic">No output logged for this execution.</div>
                        )
                      ) : (
                        <div className="text-white/30 italic">Select an execution run to inspect output.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: EXECUTION HISTORY TIMELINE */}
              {drawerTab === "history" && (
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>Recorded Executions ({historyTotal})</span>
                    <button
                      onClick={() => selectedJob && loadExecutions(selectedJob.id, historyPage)}
                      className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Refresh</span>
                    </button>
                  </div>

                  {executions.length === 0 ? (
                    <div className="p-8 text-center text-white/40 text-xs">No execution history found.</div>
                  ) : (
                    <div className="space-y-2">
                      {executions.map((exec) => (
                        <div
                          key={exec.id}
                          onClick={() => {
                            setSelectedExecution(exec);
                            setDrawerTab("terminal");
                          }}
                          className="p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                exec.status === "SUCCESS"
                                  ? "bg-emerald-400"
                                  : exec.status === "FAILED"
                                  ? "bg-rose-500"
                                  : "bg-amber-400"
                              }`}
                            />
                            <div>
                              <div className="font-semibold text-white flex items-center gap-2">
                                <span>{exec.status}</span>
                                <span className="text-[10px] font-mono text-white/40 bg-white/5 px-1.5 py-0.5 rounded">
                                  {exec.triggerType}
                                </span>
                              </div>
                              <div className="text-[10px] text-white/40 font-mono mt-0.5">
                                {format(new Date(exec.startedAt), "yyyy-MM-dd HH:mm:ss")}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 font-mono text-right">
                            <div className="text-[11px] text-white/60">
                              <div>{exec.durationMs ? `${Math.round(exec.durationMs)} ms` : "..."}</div>
                              <div className="text-[10px] text-white/40">Exit: {exec.exitCode ?? 0}</div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-white/20" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: TARGET DEEP DIVE */}
              {drawerTab === "config" && (
                <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono">
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
                    <div className="font-semibold text-white text-sm font-sans flex items-center justify-between">
                      <span>Target Configuration</span>
                      <button
                        onClick={() =>
                          handleCopyLogs(JSON.stringify(selectedJob.targetConfig, null, 2))
                        }
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs font-mono"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy JSON</span>
                      </button>
                    </div>

                    <pre className="p-3 rounded-lg bg-black/60 border border-white/5 text-blue-300 text-xs overflow-x-auto">
                      {JSON.stringify(selectedJob.targetConfig, null, 2)}
                    </pre>
                  </div>

                  <div className="grid grid-cols-2 gap-3 font-sans">
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                      <div className="text-white/40 text-[11px]">Misfire Policy</div>
                      <div className="font-semibold text-white text-xs">{selectedJob.misfirePolicy}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                      <div className="text-white/40 text-[11px]">Concurrency Policy</div>
                      <div className="font-semibold text-white text-xs">{selectedJob.concurrencyPolicy}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                      <div className="text-white/40 text-[11px]">Execution Timeout</div>
                      <div className="font-semibold text-white text-xs">{selectedJob.timeoutSeconds}s</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                      <div className="text-white/40 text-[11px]">Automatic Retries</div>
                      <div className="font-semibold text-white text-xs">
                        {selectedJob.maxRetries} attempts ({selectedJob.retryDelaySeconds}s delay)
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: UPCOMING RUNS CALENDAR */}
              {drawerTab === "schedule" && (
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <div className="text-xs text-white/50">
                    Next 10 Scheduled Executions ({selectedJob.timezone})
                  </div>
                  <div className="space-y-2 font-mono text-xs">
                    {getNextRuns(selectedJob.schedule, selectedJob.timezone, 10).map((date, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-blue-400 font-semibold">#{idx + 1}</span>
                          <span className="text-white">{format(date, "EEEE, MMMM d, yyyy • HH:mm:ss")}</span>
                        </div>
                        <span className="text-white/40 text-[11px]">
                          {formatDistanceToNow(date, { addSuffix: true })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 5: DEAD LETTER QUEUE (DLQ) */}
              {drawerTab === "dlq" && (
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>Failed Executions Exceeding Retries ({deadLetters.length})</span>
                    <button
                      onClick={() => selectedJob && loadDeadLetters(selectedJob.id)}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>

                  {loadingDlq ? (
                    <div className="p-8 text-center text-white/40 text-xs animate-pulse">Loading DLQ...</div>
                  ) : deadLetters.length === 0 ? (
                    <div className="p-8 text-center rounded-xl border border-white/5 bg-white/[0.01] space-y-2">
                      <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400" />
                      <div className="text-sm font-semibold text-white">Dead Letter Queue Empty</div>
                      <p className="text-xs text-white/40">No unresolved execution failures detected.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {deadLetters.map((dlq) => {
                        const isReplaying = replayingDlqId === dlq.id;
                        return (
                          <div
                            key={dlq.id}
                            className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-3 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-rose-300 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>{dlq.status}</span>
                              </span>
                              <span className="text-white/40 font-mono text-[11px]">
                                {format(new Date(dlq.createdAt), "yyyy-MM-dd HH:mm:ss")}
                              </span>
                            </div>

                            <p className="text-white/80 font-mono text-[11px] bg-black/40 p-2.5 rounded-lg border border-white/5">
                              {dlq.failureReason}
                            </p>

                            <div className="flex items-center justify-between pt-1">
                              <span className="text-[11px] text-white/40">
                                Retries recorded: {dlq.retryCount}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleDiscardDlq(dlq)}
                                  className="px-2.5 py-1 bg-white/[0.05] hover:bg-white/[0.1] text-white/60 rounded text-xs transition-all cursor-pointer"
                                >
                                  Discard
                                </button>
                                <button
                                  onClick={() => handleReplayDlq(dlq)}
                                  disabled={isReplaying}
                                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                                >
                                  <RotateCcw className={`w-3 h-3 ${isReplaying ? "animate-spin" : ""}`} />
                                  <span>{isReplaying ? "Replaying..." : "Replay Run"}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
