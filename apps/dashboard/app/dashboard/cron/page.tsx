"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  Clock,
  Plus,
  Search,
  Terminal,
  Activity,
  Play,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Zap,
  Server,
  Code,
  Globe,
  RefreshCw,
  ChevronRight,
  ShieldAlert,
  Cpu,
  Layers,
  Sparkles,
  Check,
  Copy,
  Download,
  Pause,
  Calendar,
  Radio,
  LayoutGrid,
  Table as TableIcon,
  Settings2,
  ExternalLink,
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

  const liveFormNextRuns = useMemo(() => {
    return getNextRuns(formData.schedule, formData.timezone, 5);
  }, [formData.schedule, formData.timezone]);

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

  const handleToggleEnabled = async (job: CronJobItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newStatus = !job.enabled;
    try {
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

  const openDrawer = (job: CronJobItem, initialTab: typeof drawerTab = "terminal") => {
    setSelectedJob(job);
    setDrawerTab(initialTab);
    setSelectedExecution(null);
    setDrawerOpen(true);
    loadExecutions(job.id, 1);
    loadDeadLetters(job.id);
  };

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

  const handleCopyLogs = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    toast.success("Logs copied to clipboard");
    setTimeout(() => setCopiedText(false), 2000);
  };

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
        if (!a.nextRunAt && !b.nextRunAt) return 0;
        if (!a.nextRunAt) return 1;
        if (!b.nextRunAt) return -1;
        return new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime();
      });
  }, [list, searchQuery, filterTarget, filterStatus, sortBy]);

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

  // Target Color Mapping
  const getTargetStyling = (type: string) => {
    switch (type) {
      case "FUNCTION":
        return {
          color: "#f59e0b",
          gradient: "linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)",
          bgBadge: "rgba(245, 158, 11, 0.12)",
          borderBadge: "rgba(245, 158, 11, 0.3)",
          textBadge: "#fbbf24",
          icon: Zap,
        };
      case "CONTAINER_EXEC":
        return {
          color: "#06b6d4",
          gradient: "linear-gradient(90deg, #06b6d4 0%, #38bdf8 100%)",
          bgBadge: "rgba(6, 182, 212, 0.12)",
          borderBadge: "rgba(6, 182, 212, 0.3)",
          textBadge: "#38bdf8",
          icon: Server,
        };
      case "SERVICE":
        return {
          color: "#6366f1",
          gradient: "linear-gradient(90deg, #6366f1 0%, #818cf8 100%)",
          bgBadge: "rgba(99, 102, 241, 0.12)",
          borderBadge: "rgba(99, 102, 241, 0.3)",
          textBadge: "#818cf8",
          icon: Activity,
        };
      case "PROJECT":
        return {
          color: "#38bdf8",
          gradient: "linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)",
          bgBadge: "rgba(56, 189, 248, 0.12)",
          borderBadge: "rgba(56, 189, 248, 0.3)",
          textBadge: "#38bdf8",
          icon: Globe,
        };
      default:
        return {
          color: "#10b981",
          gradient: "linear-gradient(90deg, #10b981 0%, #34d399 100%)",
          bgBadge: "rgba(16, 185, 129, 0.12)",
          borderBadge: "rgba(16, 185, 129, 0.3)",
          textBadge: "#34d399",
          icon: Radio,
        };
    }
  };

  return (
    <div className="page" style={{ maxWidth: 1320, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* ─── HEADER ──────────────────────────────────────────────────────────── */}
      <PageHeader
        title="Cron & Scheduled Compute"
        subtitle="Zero-Idle CPU architecture (< 0.01%), multi-target pipeline dispatch, and enterprise disaster recovery."
        actions={
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              onClick={() => {
                setLoading(true);
                fetchJobs();
              }}
              className="btn btn-secondary"
              title="Refresh Task List"
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={handleOpenCreate}
              className="btn btn-primary btn-lg"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                boxShadow: "0 0 20px var(--accent-glow)",
              }}
            >
              <Plus size={16} /> New Cron Task
            </button>
          </div>
        }
      />

      {/* ─── RESOURCE KPI CARDS ──────────────────────────────────────────────── */}
      <div className="stats-grid" style={{ marginBottom: "2rem" }}>
        <div className="stat-card">
          <div className="stat-label">
            <Clock size={15} style={{ color: "var(--accent)" }} /> Active Tasks
          </div>
          <div className="stat-value" style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
            <span>{stats.active}</span>
            <span style={{ fontSize: "0.9rem", color: "var(--muted)", fontWeight: 500 }}>
              / {stats.total} total
            </span>
          </div>
          <div className="stat-sub" style={{ color: "#10b981", fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block", marginRight: 4 }} className="animate-pulse" />
            Zero-Idle Event Loop Online
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Cpu size={15} style={{ color: "#10b981" }} /> Idle CPU Overhead
          </div>
          <div className="stat-value" style={{ color: "#10b981" }}>
            &lt; 0.01%
          </div>
          <div className="stat-sub">Dynamic OS sleep vs 86,400 polls</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <Layers size={15} style={{ color: "#a855f7" }} /> Log Memory Cap
          </div>
          <div className="stat-value" style={{ color: "var(--foreground)" }}>
            64 KB
          </div>
          <div className="stat-sub" style={{ color: "#c084fc" }}>
            Circular Byte Ring Buffer (0 OOM)
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">
            <ShieldAlert size={15} style={{ color: "#f59e0b" }} /> Reboot Recovery
          </div>
          <div className="stat-value" style={{ color: "var(--foreground)", fontSize: "1.45rem" }}>
            Self-Healing
          </div>
          <div className="stat-sub" style={{ color: "#10b981", fontWeight: 600 }}>
            {stats.successRate}% Success • Atomic Sync
          </div>
        </div>
      </div>

      {/* ─── SEARCH & FILTER CONTROLS BAR ────────────────────────────────────── */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "1.25rem",
          marginBottom: "2rem",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          {/* Search Box */}
          <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 440 }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: "1rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--muted-fg)",
              }}
            />
            <input
              type="text"
              placeholder="Search by name, expression, command..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "0.65rem 1rem 0.65rem 2.6rem",
                background: "var(--bg-inset)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--foreground)",
                fontSize: "0.88rem",
              }}
            />
          </div>

          {/* Right Controls: Status, Sort, Layout */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            {/* Status Pills */}
            <div style={{ display: "flex", gap: "0.4rem", background: "var(--bg-inset)", padding: "0.25rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
              {(["ALL", "ACTIVE", "PAUSED", "FAILING"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  style={{
                    padding: "0.35rem 0.75rem",
                    borderRadius: "4px",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    background: filterStatus === status ? "var(--accent)" : "transparent",
                    color: filterStatus === status ? "#fff" : "var(--muted)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                padding: "0.45rem 0.85rem",
                background: "var(--bg-inset)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--foreground)",
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              <option value="nextRun">Sort: Next Run</option>
              <option value="lastRun">Sort: Last Run</option>
              <option value="name">Sort: Name</option>
              <option value="created">Sort: Newest</option>
            </select>

            {/* View Mode Switcher */}
            <div style={{ display: "flex", background: "var(--bg-inset)", padding: "0.25rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
              <button
                onClick={() => setViewMode("grid")}
                style={{
                  padding: "0.35rem 0.6rem",
                  borderRadius: "4px",
                  border: "none",
                  cursor: "pointer",
                  background: viewMode === "grid" ? "var(--card)" : "transparent",
                  color: viewMode === "grid" ? "var(--foreground)" : "var(--muted)",
                }}
                title="Grid View"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => setViewMode("table")}
                style={{
                  padding: "0.35rem 0.6rem",
                  borderRadius: "4px",
                  border: "none",
                  cursor: "pointer",
                  background: viewMode === "table" ? "var(--card)" : "transparent",
                  color: viewMode === "table" ? "var(--foreground)" : "var(--muted)",
                }}
                title="Table View"
              >
                <TableIcon size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Target Pipeline Filters */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            marginTop: "1rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border)",
            overflowX: "auto",
            alignItems: "center",
          }}
        >
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
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  padding: "0.4rem 0.85rem",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  border: "1px solid",
                  borderColor: isSelected ? "var(--accent)" : "var(--border)",
                  background: isSelected ? "var(--accent-glow)" : "transparent",
                  color: isSelected ? "var(--accent)" : "var(--muted)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
              >
                <Icon size={13} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── TASK LIST / CARDS ──────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ padding: "5rem 0", textAlign: "center", color: "var(--muted)" }}>
          <RefreshCw size={28} className="animate-spin" style={{ margin: "0 auto 1rem", opacity: 0.6 }} />
          <p style={{ fontSize: "0.95rem" }}>Synchronizing cron tasks with Redis macro-scheduler...</p>
        </div>
      ) : filteredList.length === 0 ? (
        <div
          style={{
            background: "var(--card)",
            border: "1px dashed var(--border)",
            borderRadius: "var(--radius)",
            padding: "4rem 2rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--accent-glow)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem",
              color: "var(--accent)",
            }}
          >
            <Clock size={26} />
          </div>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            {searchQuery ? "No matching scheduled tasks found" : "Create your first Scheduled Task"}
          </h3>
          <p
            style={{
              color: "var(--muted)",
              maxWidth: 480,
              margin: "0 auto 1.75rem",
              fontSize: "0.9rem",
              lineHeight: 1.5,
            }}
          >
            Schedule Docker container CLI commands, Edge Function invocations, or backend syncs with zero idle CPU overhead.
          </p>
          <button
            onClick={handleOpenCreate}
            className="btn btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <Sparkles size={16} /> Schedule Task Now
          </button>
        </div>
      ) : viewMode === "grid" ? (
        /* ─── GRID CARDS VIEW ─────────────────────────────────────────────── */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(370px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {filteredList.map((job) => {
            const isTriggering = triggeringId === job.id;
            const deadLetterCount = job._count?.deadLetters || 0;
            const targetStyle = getTargetStyling(job.targetType);
            const TargetIcon = targetStyle.icon;
            const nextRun = getAccurateNextRun(job);

            // Nicely format command / endpoint
            let displayCommand = "";
            let displaySub = "";
            const tc = job.targetConfig || {};

            if (job.targetType === "CONTAINER_EXEC") {
              displayCommand = `$ ${Array.isArray(tc.command) ? tc.command.join(" ") : tc.command || "command"}`;
              const foundSvc = userServices.find((s) => s.id === tc.serviceId || s.subdomain === tc.serviceId);
              displaySub = foundSvc ? foundSvc.name : tc.serviceId || "Docker Service";
            } else if (job.targetType === "FUNCTION") {
              displayCommand = `${tc.method || "POST"} ${tc.endpointPath || "/"}`;
              const foundFn = userFunctions.find((f) => f.id === tc.serviceId || f.slug === tc.serviceId || f.subdomainSlug === tc.serviceId);
              displaySub = foundFn ? foundFn.name : (tc.serviceId ? `fn:${tc.serviceId.slice(0, 10)}...` : "Edge Function");
            } else if (job.targetType === "SERVICE") {
              displayCommand = `${tc.method || "POST"} ${tc.routePath || "/"}`;
              displaySub = `service:${tc.serviceId}${tc.port ? `:${tc.port}` : ""}`;
            } else if (job.targetType === "PROJECT") {
              displayCommand = `${tc.method || "GET"} ${tc.routePath || "/"}`;
              displaySub = `project:${tc.projectId}`;
            } else {
              displayCommand = `${tc.method || "POST"} ${tc.url || ""}`;
              displaySub = "External Webhook";
            }

            return (
              <div
                key={job.id}
                onClick={() => openDrawer(job, "terminal")}
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "1.5rem",
                  cursor: "pointer",
                  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  position: "relative",
                  overflow: "hidden",
                  boxShadow: "var(--shadow)",
                }}
                className="card-hoverable"
              >
                {/* Target Gradient Top Highlight Line */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "3px",
                    background: targetStyle.gradient,
                  }}
                />

                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {/* Top Badges Row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      {/* Target Badge */}
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          padding: "0.25rem 0.55rem",
                          borderRadius: "6px",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          background: targetStyle.bgBadge,
                          border: `1px solid ${targetStyle.borderBadge}`,
                          color: targetStyle.textBadge,
                          letterSpacing: "0.03em",
                        }}
                      >
                        <TargetIcon size={12} />
                        <span>{job.targetType.replace("_", " ")}</span>
                      </span>

                      {/* State Badge */}
                      <span
                        className={`badge ${
                          !job.enabled
                            ? "badge-paused"
                            : job.lastStatus === "SUCCESS"
                            ? "badge-ready"
                            : job.lastStatus === "FAILED"
                            ? "badge-failed"
                            : "badge-building"
                        }`}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: !job.enabled ? "#94a3b8" : job.lastStatus === "SUCCESS" ? "#10b981" : job.lastStatus === "FAILED" ? "#f43f5e" : "#818cf8",
                            display: "inline-block",
                          }}
                          className={job.enabled ? "animate-pulse" : ""}
                        />
                        <span>{!job.enabled ? "PAUSED" : job.lastStatus || "ACTIVE"}</span>
                      </span>

                      {/* DLQ Alert Badge */}
                      {deadLetterCount > 0 && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            openDrawer(job, "dlq");
                          }}
                          className="badge badge-failed"
                          title="Unresolved failures awaiting review"
                          style={{ cursor: "pointer" }}
                        >
                          <AlertTriangle size={11} /> {deadLetterCount} DLQ
                        </span>
                      )}
                    </div>

                    {/* Monospace Schedule Badge */}
                    <div
                      style={{
                        padding: "0.25rem 0.6rem",
                        borderRadius: "6px",
                        fontSize: "0.76rem",
                        fontFamily: "var(--font-geist-mono), monospace",
                        fontWeight: 600,
                        background: "var(--bg-inset)",
                        border: "1px solid var(--border)",
                        color: "var(--accent)",
                      }}
                    >
                      {job.schedule}
                    </div>
                  </div>

                  {/* Task Name & Description */}
                  <div style={{ marginBottom: "1rem" }}>
                    <h3
                      style={{
                        fontSize: "1.05rem",
                        fontWeight: 700,
                        color: "var(--foreground)",
                        letterSpacing: "-0.015em",
                        marginBottom: "0.25rem",
                      }}
                    >
                      {job.name}
                    </h3>
                    <p style={{ fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.45 }}>
                      {job.description || getHumanReadableSchedule(job.schedule)}
                    </p>
                  </div>

                  {/* High-Contrast Command Box */}
                  <div
                    style={{
                      background: "rgba(0, 0, 0, 0.45)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "8px",
                      padding: "0.75rem 0.9rem",
                      marginBottom: "1.25rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.78rem",
                        fontFamily: "var(--font-geist-mono), monospace",
                        color: targetStyle.textBadge,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {displayCommand}
                    </div>
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--muted-fg)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Target: {displaySub}
                    </div>
                  </div>
                </div>

                {/* Footer Next Run & Action Suite */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: "1rem",
                    borderTop: "1px solid var(--border)",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                    <div style={{ fontSize: "0.78rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <Clock size={12} style={{ color: job.enabled ? "#10b981" : "var(--muted)" }} />
                      <span>Next:</span>
                      <strong style={{ color: "var(--foreground)", fontWeight: 600 }}>{nextRun.formatted}</strong>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--muted-fg)" }}>
                      {nextRun.distance}
                    </div>
                  </div>

                  {/* Actions Suite */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => handleTrigger(job, e)}
                      disabled={isTriggering}
                      className="btn btn-sm btn-primary"
                      title="Run immediately"
                      style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
                    >
                      <Play size={12} className={isTriggering ? "animate-spin" : ""} />
                      <span>{isTriggering ? "Running..." : "Run"}</span>
                    </button>

                    <button
                      onClick={(e) => handleToggleEnabled(job, e)}
                      className="btn btn-sm btn-secondary"
                      title={job.enabled ? "Pause task" : "Resume task"}
                      style={{ padding: "0.35rem 0.65rem", fontSize: "0.75rem" }}
                    >
                      {job.enabled ? "Pause" : "Resume"}
                    </button>

                    <button
                      onClick={(e) => handleOpenEdit(job, e)}
                      style={{
                        padding: "0.4rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        background: "var(--bg-inset)",
                        color: "var(--muted)",
                        cursor: "pointer",
                      }}
                      title="Edit Configuration"
                    >
                      <Settings2 size={13} />
                    </button>

                    <button
                      onClick={(e) => handleClone(job, e)}
                      style={{
                        padding: "0.4rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        background: "var(--bg-inset)",
                        color: "var(--muted)",
                        cursor: "pointer",
                      }}
                      title="Duplicate Task"
                    >
                      <Copy size={13} />
                    </button>

                    <button
                      onClick={(e) => handleDelete(job, e)}
                      style={{
                        padding: "0.4rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        background: "var(--bg-inset)",
                        color: "var(--danger)",
                        cursor: "pointer",
                      }}
                      title="Delete Task"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ─── DENSE TABLE VIEW ─────────────────────────────────────────────── */
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
              <thead style={{ background: "var(--bg-inset)", borderBottom: "1px solid var(--border)", color: "var(--muted)", fontSize: "0.75rem", textTransform: "uppercase" }}>
                <tr>
                  <th style={{ padding: "0.85rem 1rem" }}>Task Name</th>
                  <th style={{ padding: "0.85rem 1rem" }}>Pipeline</th>
                  <th style={{ padding: "0.85rem 1rem" }}>Schedule</th>
                  <th style={{ padding: "0.85rem 1rem" }}>Next Run</th>
                  <th style={{ padding: "0.85rem 1rem" }}>Status</th>
                  <th style={{ padding: "0.85rem 1rem", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((job) => {
                  const isTriggering = triggeringId === job.id;
                  const nextRun = getAccurateNextRun(job);
                  return (
                    <tr
                      key={job.id}
                      onClick={() => openDrawer(job, "terminal")}
                      style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", transition: "background 0.15s ease" }}
                      className="hover:bg-white/[0.02]"
                    >
                      <td style={{ padding: "0.85rem 1rem", fontWeight: 600, color: "var(--foreground)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: !job.enabled ? "#94a3b8" : job.lastStatus === "SUCCESS" ? "#10b981" : job.lastStatus === "FAILED" ? "#f43f5e" : "#818cf8",
                            }}
                          />
                          <span>{job.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "0.85rem 1rem" }}>
                        <span className="badge" style={{ background: "var(--bg-inset)", border: "1px solid var(--border)" }}>
                          {job.targetType}
                        </span>
                      </td>
                      <td style={{ padding: "0.85rem 1rem", fontFamily: "var(--font-geist-mono), monospace", color: "var(--accent)" }}>
                        {job.schedule} ({job.timezone})
                      </td>
                      <td style={{ padding: "0.85rem 1rem", color: "var(--foreground)" }}>
                        {nextRun.formatted} ({nextRun.distance})
                      </td>
                      <td style={{ padding: "0.85rem 1rem" }}>
                        <span
                          className={`badge ${
                            !job.enabled ? "badge-paused" : job.lastStatus === "SUCCESS" ? "badge-ready" : "badge-failed"
                          }`}
                        >
                          {!job.enabled ? "PAUSED" : job.lastStatus || "ACTIVE"}
                        </span>
                      </td>
                      <td style={{ padding: "0.85rem 1rem", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
                          <button
                            onClick={(e) => handleTrigger(job, e)}
                            disabled={isTriggering}
                            className="btn btn-sm btn-primary"
                            style={{ padding: "0.25rem 0.55rem", fontSize: "0.72rem" }}
                          >
                            Run
                          </button>
                          <button
                            onClick={(e) => handleToggleEnabled(job, e)}
                            className="btn btn-sm btn-secondary"
                            style={{ padding: "0.25rem 0.55rem", fontSize: "0.72rem" }}
                          >
                            {job.enabled ? "Pause" : "Resume"}
                          </button>
                          <button
                            onClick={(e) => handleOpenEdit(job, e)}
                            style={{ padding: "0.25rem 0.45rem", borderRadius: "4px", border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer" }}
                          >
                            <Settings2 size={13} />
                          </button>
                          <button
                            onClick={(e) => handleDelete(job, e)}
                            style={{ padding: "0.25rem 0.45rem", borderRadius: "4px", border: "1px solid var(--border)", background: "transparent", color: "var(--danger)", cursor: "pointer" }}
                          >
                            <Trash2 size={13} />
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
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0, 0, 0, 0.75)", backdropFilter: "blur(8px)", padding: "1rem" }}>
          <div
            style={{
              background: "#0c1017",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              width: "100%",
              maxWidth: 680,
              maxHeight: "92vh",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-inset)" }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--foreground)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Clock size={18} style={{ color: "var(--accent)" }} />
                  <span>{editingJobId ? "Edit Scheduled Cron Task" : "Create Scheduled Cron Task"}</span>
                </h3>
                <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                  Zero-Idle event loop (&lt; 0.01% CPU) with microsecond dispatch.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: "transparent", border: "none", color: "var(--muted)", fontSize: "1.25rem", cursor: "pointer", padding: "0.25rem" }}
              >
                ✕
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.2)", padding: "0 1.5rem" }}>
              {[
                { id: "general", label: "1. Schedule & Basics" },
                { id: "target", label: "2. Target Pipeline" },
                { id: "policies", label: "3. Resilience & Policies" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTabForm(t.id as any)}
                  style={{
                    padding: "0.85rem 1rem",
                    fontSize: "0.82rem",
                    fontWeight: 650,
                    border: "none",
                    borderBottom: activeTabForm === t.id ? "2px solid var(--accent)" : "2px solid transparent",
                    background: "transparent",
                    color: activeTabForm === t.id ? "var(--accent)" : "var(--muted)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveSubmit} style={{ flex: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* TAB 1: SCHEDULE & BASICS */}
              {activeTabForm === "general" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.4rem" }}>
                      Task Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Nightly Database Vacuum & Session Purge"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input"
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.4rem" }}>
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Brief note on what this cron does"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="input"
                    />
                  </div>

                  {/* Schedule Presets */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--foreground)" }}>
                        Cron Frequency Presets
                      </label>
                      <span style={{ fontSize: "0.75rem", color: "var(--accent)", fontFamily: "var(--font-geist-mono), monospace" }}>
                        Standard 5-part cron
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.5rem" }}>
                      {PRESET_SCHEDULES.map((p) => {
                        const isSelected = formData.schedule === p.value;
                        return (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setFormData({ ...formData, schedule: p.value })}
                            style={{
                              padding: "0.6rem 0.75rem",
                              borderRadius: "8px",
                              textAlign: "left",
                              border: "1px solid",
                              borderColor: isSelected ? "var(--accent)" : "var(--border)",
                              background: isSelected ? "var(--accent-glow)" : "var(--bg-inset)",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: isSelected ? "var(--accent)" : "var(--foreground)" }}>
                              {p.label}
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "var(--muted)", fontFamily: "var(--font-geist-mono), monospace", marginTop: "0.15rem" }}>
                              {p.value}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Expression Input & Timezone */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.4rem" }}>
                        Cron Expression
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.schedule}
                        onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
                        className="input mono"
                        placeholder="0 0 * * *"
                      />
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.4rem" }}>
                        Timezone
                      </label>
                      <select
                        value={formData.timezone}
                        onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                        className="input"
                      >
                        {POPULAR_TIMEZONES.map((tz) => (
                          <option key={tz} value={tz} className="bg-[#0e121b]">
                            {tz}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Next 5 Runs Calculation Preview */}
                  <div
                    style={{
                      background: "rgba(99, 102, 241, 0.06)",
                      border: "1px solid rgba(99, 102, 241, 0.2)",
                      borderRadius: "8px",
                      padding: "0.85rem 1rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.4rem",
                    }}
                  >
                    <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--accent)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <Calendar size={13} /> Next 5 Executions Preview ({formData.timezone})
                    </div>
                    {liveFormNextRuns.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontFamily: "var(--font-geist-mono), monospace", fontSize: "0.75rem", color: "var(--foreground)" }}>
                        {liveFormNextRuns.map((date, idx) => (
                          <div key={idx} style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>#{idx + 1}: {format(date, "EEEE, MMM d, yyyy • HH:mm:ss")}</span>
                            <span style={{ color: "var(--muted)" }}>({formatDistanceToNow(date, { addSuffix: true })})</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.75rem", color: "var(--danger)" }}>Invalid cron expression.</div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: TARGET PIPELINE */}
              {activeTabForm === "target" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.5rem" }}>
                      Execution Pipeline
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
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
                            style={{
                              padding: "0.75rem",
                              borderRadius: "8px",
                              textAlign: "left",
                              border: "1px solid",
                              borderColor: isSelected ? "var(--accent)" : "var(--border)",
                              background: isSelected ? "var(--accent-glow)" : "var(--bg-inset)",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", fontWeight: 600, color: isSelected ? "var(--accent)" : "var(--foreground)" }}>
                              <Icon size={14} />
                              <span>{t.label}</span>
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                              {t.desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {formData.targetType === "CONTAINER_EXEC" && (
                    <div style={{ background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.3rem" }}>
                          Target Container Service
                        </label>
                        {userServices.length > 0 && (
                          <select
                            value={formData.serviceId}
                            onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
                            className="input"
                            style={{ marginBottom: "0.4rem" }}
                          >
                            <option value="">Select an active backend service...</option>
                            {userServices.map((s) => (
                              <option key={s.id} value={s.id || s.subdomain} className="bg-[#0e121b]">
                                {s.name} ({s.subdomain || s.id.slice(0, 8)})
                              </option>
                            ))}
                          </select>
                        )}
                        <input
                          type="text"
                          placeholder="Or enter custom service ID"
                          value={formData.serviceId}
                          onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
                          className="input mono"
                        />
                      </div>

                      <div>
                        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.3rem" }}>
                          Command
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="python manage.py purge_sessions"
                          value={formData.command}
                          onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                          className="input mono"
                        />
                      </div>
                    </div>
                  )}

                  {formData.targetType === "FUNCTION" && (
                    <div style={{ background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.3rem" }}>
                          Edge Function Service
                        </label>
                        {userFunctions.length > 0 && (
                          <select
                            value={formData.serviceId}
                            onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
                            className="input"
                            style={{ marginBottom: "0.4rem" }}
                          >
                            <option value="">Select an Edge Function service...</option>
                            {userFunctions.map((fn) => (
                              <option key={fn.id} value={fn.id} className="bg-[#0e121b]">
                                {fn.name} ({fn.subdomainSlug || fn.id.slice(0, 8)})
                              </option>
                            ))}
                          </select>
                        )}
                        <input
                          type="text"
                          placeholder="Or enter Edge Function UUID"
                          value={formData.serviceId}
                          onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
                          className="input mono"
                        />
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0.5rem" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.3rem" }}>
                            Method
                          </label>
                          <select
                            value={formData.method}
                            onChange={(e) => setFormData({ ...formData, method: e.target.value as any })}
                            className="input"
                          >
                            <option value="POST">POST</option>
                            <option value="GET">GET</option>
                            <option value="PUT">PUT</option>
                            <option value="DELETE">DELETE</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.3rem" }}>
                            Route Path
                          </label>
                          <input
                            type="text"
                            placeholder="/cleanup"
                            value={formData.endpointPath}
                            onChange={(e) => setFormData({ ...formData, endpointPath: e.target.value })}
                            className="input mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {formData.targetType === "WEBHOOK" && (
                    <div style={{ background: "var(--bg-inset)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.3rem" }}>
                          Webhook HTTPS URL
                        </label>
                        <input
                          type="url"
                          required
                          placeholder="https://api.example.com/tasks"
                          value={formData.webhookUrl}
                          onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
                          className="input mono"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: RESILIENCE & POLICIES */}
              {activeTabForm === "policies" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.4rem" }}>
                      Misfire Reboot Policy
                    </label>
                    <select
                      value={formData.misfirePolicy}
                      onChange={(e) => setFormData({ ...formData, misfirePolicy: e.target.value as any })}
                      className="input"
                    >
                      <option value="SKIP" className="bg-[#0e121b]">SKIP (Recommended - Discard backlog on boot)</option>
                      <option value="FIRE_LATEST_ONCE" className="bg-[#0e121b]">FIRE_LATEST_ONCE (1 Catchup execution)</option>
                      <option value="CATCH_UP_ALL" className="bg-[#0e121b]">CATCH_UP_ALL (Sequentially replay all)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.4rem" }}>
                      Concurrency Control
                    </label>
                    <select
                      value={formData.concurrencyPolicy}
                      onChange={(e) => setFormData({ ...formData, concurrencyPolicy: e.target.value as any })}
                      className="input"
                    >
                      <option value="FORBID" className="bg-[#0e121b]">FORBID (Skip new run if active)</option>
                      <option value="ALLOW" className="bg-[#0e121b]">ALLOW (Permit parallel execution)</option>
                      <option value="REPLACE" className="bg-[#0e121b]">REPLACE (Abort running process & start new)</option>
                    </select>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.3rem" }}>
                        Timeout (Sec)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={3600}
                        value={formData.timeoutSeconds}
                        onChange={(e) => setFormData({ ...formData, timeoutSeconds: Number(e.target.value) })}
                        className="input mono"
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.3rem" }}>
                        Max Retries
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={formData.maxRetries}
                        onChange={(e) => setFormData({ ...formData, maxRetries: Number(e.target.value) })}
                        className="input mono"
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.3rem" }}>
                        Retry Delay
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={formData.retryDelaySeconds}
                        onChange={(e) => setFormData({ ...formData, retryDelaySeconds: Number(e.target.value) })}
                        className="input mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Footer Actions */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "1rem", borderTop: "1px solid var(--border)", marginTop: "auto" }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary"
                  style={{ minWidth: 120 }}
                >
                  {saving ? "Saving..." : editingJobId ? "Save Changes" : "Schedule Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── OBSERVABILITY DRAWER ──────────────────────────────────────────────── */}
      {drawerOpen && selectedJob && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", justifyContent: "flex-end", background: "rgba(0, 0, 0, 0.65)", backdropFilter: "blur(4px)" }}>
          <div
            style={{
              width: "100%",
              maxWidth: 780,
              background: "#0c1017",
              borderLeft: "1px solid var(--border)",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              boxShadow: "var(--shadow-hover)",
            }}
          >
            {/* Drawer Header */}
            <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-inset)" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Clock size={16} style={{ color: "var(--accent)" }} />
                  <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--foreground)" }}>{selectedJob.name}</span>
                  <span
                    className={`badge ${
                      !selectedJob.enabled ? "badge-paused" : selectedJob.lastStatus === "SUCCESS" ? "badge-ready" : "badge-failed"
                    }`}
                  >
                    {!selectedJob.enabled ? "PAUSED" : selectedJob.lastStatus || "ACTIVE"}
                  </span>
                </div>
                <div style={{ fontSize: "0.76rem", color: "var(--muted)", fontFamily: "var(--font-geist-mono), monospace", marginTop: "0.25rem" }}>
                  {selectedJob.schedule} • {selectedJob.timezone} • {selectedJob.targetType}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  onClick={(e) => handleTrigger(selectedJob, e)}
                  disabled={triggeringId === selectedJob.id}
                  className="btn btn-sm btn-primary"
                >
                  <Play size={12} className={triggeringId === selectedJob.id ? "animate-spin" : ""} />
                  <span>{triggeringId === selectedJob.id ? "Running..." : "Run Now"}</span>
                </button>
                <button
                  onClick={() => setDrawerOpen(false)}
                  style={{ background: "transparent", border: "none", color: "var(--muted)", fontSize: "1.25rem", cursor: "pointer", padding: "0.25rem" }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Drawer Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "rgba(0,0,0,0.2)", padding: "0 1.5rem", overflowX: "auto" }}>
              {[
                { id: "terminal", label: "Terminal Logs", icon: Terminal },
                { id: "history", label: `Run History (${historyTotal})`, icon: Clock },
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
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      padding: "0.75rem 0.9rem",
                      fontSize: "0.8rem",
                      fontWeight: 650,
                      border: "none",
                      borderBottom: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                      background: "transparent",
                      color: isSelected ? "var(--accent)" : "var(--muted)",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Icon size={13} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Drawer Body */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
              {drawerTab === "terminal" && (
                <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                  {/* Runs List */}
                  <div style={{ width: 220, borderRight: "1px solid var(--border)", overflowY: "auto", padding: "0.75rem", background: "var(--bg-inset)" }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                      Recent Executions
                    </div>
                    {loadingHistory ? (
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)", textAlign: "center", padding: "1rem" }}>Loading...</div>
                    ) : executions.length === 0 ? (
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)", textAlign: "center", padding: "1rem" }}>No runs recorded yet.</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        {executions.map((exec) => {
                          const isSelected = selectedExecution?.id === exec.id;
                          return (
                            <div
                              key={exec.id}
                              onClick={() => setSelectedExecution(exec)}
                              style={{
                                padding: "0.5rem 0.65rem",
                                borderRadius: "6px",
                                border: "1px solid",
                                borderColor: isSelected ? "var(--accent)" : "var(--border)",
                                background: isSelected ? "var(--accent-glow)" : "var(--card)",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.15rem" }}>
                                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: exec.status === "SUCCESS" ? "#10b981" : "#f43f5e" }}>
                                  {exec.status}
                                </span>
                                <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontFamily: "var(--font-geist-mono), monospace" }}>
                                  {exec.durationMs ? `${Math.round(exec.durationMs)}ms` : "..."}
                                </span>
                              </div>
                              <div style={{ fontSize: "0.68rem", color: "var(--muted-fg)", fontFamily: "var(--font-geist-mono), monospace" }}>
                                {format(new Date(exec.startedAt), "HH:mm:ss")} • {exec.triggerType}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Terminal Log Console */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#05080e", overflow: "hidden" }}>
                    {/* Console Header */}
                    <div style={{ padding: "0.5rem 1rem", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.02)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff5f56" }} />
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ffbd2e" }} />
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#27c93f" }} />
                        <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontFamily: "var(--font-geist-mono), monospace", marginLeft: "0.5rem" }}>
                          CAPPED 64KB CIRCULAR BUFFER
                        </span>
                      </div>

                      {selectedExecution && (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <button
                            onClick={() => handleCopyLogs(selectedExecution.stdout || selectedExecution.errorMessage || "")}
                            className="btn btn-ghost"
                            style={{ padding: "0.25rem 0.5rem", fontSize: "0.72rem" }}
                            title="Copy logs"
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            onClick={() => handleDownloadLogs(selectedExecution)}
                            className="btn btn-ghost"
                            style={{ padding: "0.25rem 0.5rem", fontSize: "0.72rem" }}
                            title="Download log file"
                          >
                            <Download size={12} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Console Output */}
                    <div style={{ flex: 1, padding: "1rem", overflowY: "auto", fontFamily: "var(--font-geist-mono), monospace", fontSize: "0.75rem", lineHeight: 1.6 }}>
                      {isStreaming && streamingLogs.length > 0 ? (
                        <pre style={{ color: "#38bdf8", whiteSpace: "pre-wrap" }}>{streamingLogs.join("\n")}</pre>
                      ) : selectedExecution ? (
                        selectedExecution.stdout ? (
                          <pre style={{ color: "#34d399", whiteSpace: "pre-wrap" }}>{selectedExecution.stdout}</pre>
                        ) : selectedExecution.errorMessage ? (
                          <pre style={{ color: "#f43f5e", whiteSpace: "pre-wrap" }}>{selectedExecution.errorMessage}</pre>
                        ) : (
                          <div style={{ color: "var(--muted)", fontStyle: "italic" }}>No log output recorded for this run.</div>
                        )
                      ) : (
                        <div style={{ color: "var(--muted)", fontStyle: "italic" }}>Select an execution run to view output.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {drawerTab === "history" && (
                <div style={{ flex: 1, padding: "1.25rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {executions.map((exec) => (
                    <div
                      key={exec.id}
                      onClick={() => {
                        setSelectedExecution(exec);
                        setDrawerTab("terminal");
                      }}
                      style={{
                        padding: "0.85rem 1rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: exec.status === "SUCCESS" ? "#10b981" : "#f43f5e",
                          }}
                        />
                        <div>
                          <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--foreground)" }}>
                            {exec.status} • {exec.triggerType}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "var(--font-geist-mono), monospace" }}>
                            {format(new Date(exec.startedAt), "yyyy-MM-dd HH:mm:ss")}
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", fontFamily: "var(--font-geist-mono), monospace", fontSize: "0.75rem", color: "var(--muted)" }}>
                        <div>{exec.durationMs ? `${Math.round(exec.durationMs)} ms` : "..."}</div>
                        <div>Exit: {exec.exitCode ?? 0}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {drawerTab === "config" && (
                <div style={{ flex: 1, padding: "1.25rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--foreground)" }}>Target Configuration JSON</span>
                      <button
                        onClick={() => handleCopyLogs(JSON.stringify(selectedJob.targetConfig, null, 2))}
                        className="btn btn-sm btn-secondary"
                      >
                        Copy JSON
                      </button>
                    </div>
                    <pre style={{ background: "var(--bg-inset)", padding: "0.75rem", borderRadius: "6px", fontSize: "0.75rem", color: "var(--accent)", fontFamily: "var(--font-geist-mono), monospace", overflowX: "auto" }}>
                      {JSON.stringify(selectedJob.targetConfig, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {drawerTab === "schedule" && (
                <div style={{ flex: 1, padding: "1.25rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--foreground)", marginBottom: "0.5rem" }}>
                    Next 10 Scheduled Runs ({selectedJob.timezone})
                  </div>
                  {getNextRuns(selectedJob.schedule, selectedJob.timezone, 10).map((date, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "0.75rem 1rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.78rem",
                        fontFamily: "var(--font-geist-mono), monospace",
                      }}
                    >
                      <span style={{ color: "var(--accent)", fontWeight: 600 }}>#{idx + 1} • {format(date, "EEEE, MMMM d, yyyy • HH:mm:ss")}</span>
                      <span style={{ color: "var(--muted)" }}>{formatDistanceToNow(date, { addSuffix: true })}</span>
                    </div>
                  ))}
                </div>
              )}

              {drawerTab === "dlq" && (
                <div style={{ flex: 1, padding: "1.25rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {deadLetters.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--muted)" }}>
                      <CheckCircle2 size={32} style={{ color: "#10b981", margin: "0 auto 0.5rem" }} />
                      <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--foreground)" }}>Dead Letter Queue Empty</div>
                      <p style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>No execution failures have exceeded max retries.</p>
                    </div>
                  ) : (
                    deadLetters.map((dlq) => (
                      <div
                        key={dlq.id}
                        style={{
                          padding: "1rem",
                          borderRadius: "8px",
                          border: "1px solid rgba(244, 63, 94, 0.3)",
                          background: "rgba(244, 63, 94, 0.05)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                          <strong style={{ color: "var(--danger)" }}>{dlq.status}</strong>
                          <span style={{ color: "var(--muted)" }}>{format(new Date(dlq.createdAt), "yyyy-MM-dd HH:mm:ss")}</span>
                        </div>
                        <div style={{ background: "rgba(0,0,0,0.4)", padding: "0.5rem", borderRadius: "6px", fontFamily: "var(--font-geist-mono), monospace", fontSize: "0.72rem", color: "var(--foreground)" }}>
                          {dlq.failureReason}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                          <button
                            onClick={() => handleDiscardDlq(dlq)}
                            className="btn btn-sm btn-secondary"
                          >
                            Discard
                          </button>
                          <button
                            onClick={() => handleReplayDlq(dlq)}
                            disabled={replayingDlqId === dlq.id}
                            className="btn btn-sm btn-primary"
                          >
                            <RotateCcw size={12} className={replayingDlqId === dlq.id ? "animate-spin" : ""} />
                            <span>{replayingDlqId === dlq.id ? "Replaying..." : "Replay"}</span>
                          </button>
                        </div>
                      </div>
                    ))
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
