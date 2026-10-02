"use client";

import { useEffect, useState, useRef, useMemo, use, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Workflow,
  ArrowLeft,
  Play,
  Save,
  RotateCcw,
  Sparkles,
  Plus,
  Trash2,
  Settings,
  Terminal,
  Code2,
  Layout,
  CheckCircle2,
  AlertCircle,
  Clock,
  Check,
  Copy,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  X,
  ExternalLink,
  GitBranch,
  Layers,
  Zap,
  Sliders,
  ChevronDown,
  Activity,
  Server,
  Globe,
  Radio,
  FileCode,
  Info,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import {
  flowsApi,
  getAccessToken,
  type WorkflowItem,
  type WorkflowNodeItem,
  type WorkflowEdgeItem,
  type WorkflowRunItem,
  type WorkflowStepRunItem,
} from "@/lib/api";
import {
  FLOW_NODE_TYPES,
  generateWorkflowDSL,
  parseWorkflowDSL,
} from "@/lib/flow-templates";

export default function FlowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const flowId = resolvedParams.id;
  const searchParams = useSearchParams();
  const router = useRouter();

  // Workflow state
  const [workflow, setWorkflow] = useState<WorkflowItem | null>(null);
  const [nodes, setNodes] = useState<WorkflowNodeItem[]>([]);
  const [edges, setEdges] = useState<WorkflowEdgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // View mode: Visual Canvas vs TypeScript Code DSL
  const [viewMode, setViewMode] = useState<"CANVAS" | "CODE">("CANVAS");
  const [dslCode, setDslCode] = useState<string>("");

  // Canvas pan & zoom
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 80, y: 80 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Selection & Inspector
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"CONFIG" | "POLICIES">("CONFIG");
  const [paletteOpen, setPaletteOpen] = useState(true);

  // Dragging node (smooth pointer tracking)
  const [draggingNodeKey, setDraggingNodeKey] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Connection wire dragging
  const [connectingSourceKey, setConnectingSourceKey] = useState<string | null>(null);
  const [hoveredTargetKey, setHoveredTargetKey] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Quick Add child step helper
  const [quickAddParentKey, setQuickAddParentKey] = useState<string | null>(null);

  // Execution & Live Terminal
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [currentRun, setCurrentRun] = useState<WorkflowRunItem | null>(null);
  const [recentRuns, setRecentRuns] = useState<WorkflowRunItem[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<Array<{ line: string; ts: number }>>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Initial load
  const loadWorkflow = async () => {
    try {
      const wf = await flowsApi.get(flowId);
      setWorkflow(wf);
      setNodes(wf.nodes || []);
      setEdges(wf.edges || []);
      setDslCode(generateWorkflowDSL(wf));
    } catch (err: any) {
      toast.error(err.message || "Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  };

  const loadRuns = async () => {
    try {
      const data = await flowsApi.getRuns(flowId, 1, 10);
      setRecentRuns(data.runs || []);
      const initialRunId = searchParams.get("runId");
      if (initialRunId) {
        const match = data.runs?.find((r) => r.id === initialRunId);
        if (match) {
          setCurrentRun(match);
          setTerminalOpen(true);
        }
      } else if (data.runs && data.runs.length > 0 && !currentRun) {
        setCurrentRun(data.runs[0]);
      }
    } catch {
      // non-critical
    }
  };

  useEffect(() => {
    loadWorkflow();
    loadRuns();
  }, [flowId]);

  // Sync to code when entering CODE mode
  const handleSwitchToCode = () => {
    if (!workflow) return;
    const currentWf = { ...workflow, nodes, edges };
    setDslCode(generateWorkflowDSL(currentWf));
    setViewMode("CODE");
  };

  // Sync code back to canvas
  const handleApplyDsl = () => {
    const parsed = parseWorkflowDSL(dslCode);
    if (!parsed) {
      toast.error("Could not parse DSL code. Please verify syntax.");
      return;
    }
    setNodes(parsed.nodes);
    setEdges(parsed.edges);
    setViewMode("CANVAS");
    toast.success("DSL code synchronized to canvas!");
  };

  // Save Pipeline (supports both PUT and PATCH via flowsApi.update)
  const handleSave = async () => {
    if (!workflow) return;
    setSaving(true);
    try {
      const code = generateWorkflowDSL({ ...workflow, nodes, edges });
      const updated = await flowsApi.update(flowId, {
        name: workflow.name,
        enabled: workflow.enabled,
        category: workflow.category,
        concurrencyPolicy: workflow.concurrencyPolicy,
        timeoutSeconds: workflow.timeoutSeconds,
        codeDefinition: code,
        nodes,
        edges,
      });
      setWorkflow(updated);
      setDslCode(code);
      toast.success("Pipeline saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save pipeline");
    } finally {
      setSaving(false);
    }
  };

  // Trigger Execution
  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await handleSave();
      const res = await flowsApi.trigger(flowId, { source: "CANVAS_STUDIO" });
      toast.success(`Pipeline triggered! Run ID: ${res.runId.slice(0, 8)}`);
      setTerminalOpen(true);
      setTerminalLogs([{ line: `[Whizan-Flow] Enqueued execution run ${res.runId}...\n`, ts: Date.now() }]);

      setTimeout(async () => {
        try {
          const run = await flowsApi.getRun(flowId, res.runId);
          setCurrentRun(run);
          loadRuns();
        } catch {}
      }, 500);
    } catch (err: any) {
      toast.error(err.message || "Failed to trigger pipeline");
    } finally {
      setTriggering(false);
    }
  };

  // ─── LIVE SSE LOG STREAMING WITH AUTO-POLLING FALLBACK ─────────────────────
  useEffect(() => {
    if (!terminalOpen || !currentRun) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    let pollInterval: any = null;

    const startPollingFallback = () => {
      if (pollInterval) return;
      pollInterval = setInterval(async () => {
        try {
          const latestRun = await flowsApi.getRun(flowId, currentRun.id);
          setCurrentRun(latestRun);
          if (latestRun.stepRuns && latestRun.stepRuns.length > 0) {
            const lines: Array<{ line: string; ts: number }> = [];
            for (const step of latestRun.stepRuns) {
              if (step.stdout) lines.push({ line: step.stdout, ts: Date.now() });
              if (step.errorMessage) lines.push({ line: `[Error] ${step.errorMessage}\n`, ts: Date.now() });
            }
            if (lines.length > 0) {
              setTerminalLogs((prev) => (prev.length < lines.length ? lines : prev));
            }
          }
          if (["SUCCESS", "FAILED", "CANCELLED", "TIMED_OUT"].includes(latestRun.status)) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        } catch {}
      }, 2500);
    };

    // Try EventSource
    try {
      const streamUrl = flowsApi.getLogsStreamUrl(flowId, currentRun.id);
      const token = getAccessToken();
      const fullUrl = token ? `${streamUrl}?token=${encodeURIComponent(token)}` : streamUrl;

      const es = new EventSource(fullUrl);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.line) {
            setTerminalLogs((prev) => [...prev, { line: parsed.line, ts: parsed.ts || Date.now() }]);
          }
          if (parsed.runStatus && currentRun) {
            setCurrentRun((prev) => (prev ? { ...prev, status: parsed.runStatus } : prev));
          }
        } catch {
          setTerminalLogs((prev) => [...prev, { line: event.data + "\n", ts: Date.now() }]);
        }
      };

      es.onerror = () => {
        // Switch to polling fallback seamlessly
        startPollingFallback();
      };
    } catch {
      startPollingFallback();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [terminalOpen, currentRun?.id]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

  // Instant Replay with Step Memoization
  const handleReplay = async () => {
    if (!currentRun) return;
    try {
      const res = await flowsApi.replayRun(flowId, currentRun.id);
      toast.success(`⚡ Instant Replay initiated with memoized cache!`);
      setTerminalLogs((prev) => [
        ...prev,
        { line: `\n[Whizan-Flow] ⚡ Instant Replay initiated for Run ${res.runId}\n`, ts: Date.now() },
      ]);
      const newRun = await flowsApi.getRun(flowId, res.runId);
      setCurrentRun(newRun);
      loadRuns();
    } catch (err: any) {
      toast.error(err.message || "Failed to replay run");
    }
  };

  // Human Approval Response
  const handleApproval = async (approved: boolean) => {
    if (!currentRun) return;
    const approval = currentRun.approvals?.[0];
    if (!approval?.token) {
      toast.error("No active approval token found");
      return;
    }
    try {
      await flowsApi.respondApproval(approval.token, approved);
      toast.success(approved ? "Step approved! Resuming pipeline..." : "Step rejected. Halting pipeline.");
      const updated = await flowsApi.getRun(flowId, currentRun.id);
      setCurrentRun(updated);
      loadRuns();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit approval decision");
    }
  };

  // ─── ROBUST GLOBAL POINTER LISTENERS FOR DRAGGING & PANNING ─────────────────
  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (isPanning) {
        setPan({
          x: e.clientX - panStartRef.current.x,
          y: e.clientY - panStartRef.current.y,
        });
        return;
      }

      if (draggingNodeKey) {
        const newX = Math.round((e.clientX - pan.x) / zoom - dragOffsetRef.current.x);
        const newY = Math.round((e.clientY - pan.y) / zoom - dragOffsetRef.current.y);
        setNodes((prev) =>
          prev.map((n) => (n.nodeKey === draggingNodeKey ? { ...n, positionX: newX, positionY: newY } : n))
        );
        return;
      }

      if (connectingSourceKey) {
        setMousePos({
          x: (e.clientX - pan.x) / zoom,
          y: (e.clientY - pan.y) / zoom,
        });
      }
    };

    const handleGlobalPointerUp = () => {
      if (isPanning) setIsPanning(false);
      if (draggingNodeKey) setDraggingNodeKey(null);

      // Complete connection if released over a target node
      if (connectingSourceKey && hoveredTargetKey && connectingSourceKey !== hoveredTargetKey) {
        const exists = edges.some(
          (ed) => ed.sourceNodeKey === connectingSourceKey && ed.targetNodeKey === hoveredTargetKey
        );
        if (!exists) {
          setEdges((prev) => [
            ...prev,
            { sourceNodeKey: connectingSourceKey, targetNodeKey: hoveredTargetKey, condition: "success" },
          ]);
          toast.success(`Connected ${connectingSourceKey} → ${hoveredTargetKey}`);
        }
      }
      setConnectingSourceKey(null);
      setHoveredTargetKey(null);
    };

    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", handleGlobalPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
    };
  }, [isPanning, draggingNodeKey, connectingSourceKey, hoveredTargetKey, pan, zoom, edges]);

  // Node Drag Initiation
  const handleNodePointerDown = (e: React.PointerEvent, nodeKey: string) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".flow-port") || target.closest("button") || target.closest("input")) return;

    e.stopPropagation();
    setSelectedNodeKey(nodeKey);
    setDraggingNodeKey(nodeKey);

    const node = nodes.find((n) => n.nodeKey === nodeKey);
    if (node) {
      dragOffsetRef.current = {
        x: (e.clientX - pan.x) / zoom - node.positionX,
        y: (e.clientY - pan.y) / zoom - node.positionY,
      };
    }
  };

  // Canvas Background Pan Initiation
  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(".flow-node-card") ||
      target.closest(".flow-port") ||
      target.closest("button") ||
      target.closest("input") ||
      target.closest(".flow-palette")
    ) {
      return;
    }

    setIsPanning(true);
    panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    setSelectedNodeKey(null);
  };

  // Output Port Connect Wire Initiation
  const handlePortPointerDown = (e: React.PointerEvent, sourceKey: string) => {
    e.stopPropagation();
    setConnectingSourceKey(sourceKey);
    setMousePos({
      x: (e.clientX - pan.x) / zoom,
      y: (e.clientY - pan.y) / zoom,
    });
  };

  // Add Step from Palette
  const handleAddNode = (type: string, parentKey?: string) => {
    const meta = FLOW_NODE_TYPES[type];
    if (!meta) return;

    const baseKey = meta.label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const uniqueKey = `${baseKey}_${Math.random().toString(36).slice(2, 6)}`;

    let posX = Math.round((-pan.x + 400) / zoom);
    let posY = Math.round((-pan.y + 220) / zoom);

    // If added as child of an existing node, place to the right!
    if (parentKey) {
      const parentNode = nodes.find((n) => n.nodeKey === parentKey);
      if (parentNode) {
        posX = parentNode.positionX + 320;
        posY = parentNode.positionY;
      }
    }

    const newNode: WorkflowNodeItem = {
      nodeKey: uniqueKey,
      name: meta.label,
      type: meta.type,
      config: { ...meta.defaultConfig },
      positionX: Math.max(40, posX),
      positionY: Math.max(40, posY),
      timeoutSeconds: 300,
      maxRetries: 0,
      continueOnError: false,
    };

    setNodes((prev) => [...prev, newNode]);

    // If parentKey exists, wire automatically!
    if (parentKey) {
      setEdges((prev) => [...prev, { sourceNodeKey: parentKey, targetNodeKey: uniqueKey, condition: "success" }]);
    }

    setSelectedNodeKey(uniqueKey);
    setQuickAddParentKey(null);
    toast.success(`Added ${meta.label}`);
  };

  const handleDeleteNode = (nodeKey: string) => {
    setNodes((prev) => prev.filter((n) => n.nodeKey !== nodeKey));
    setEdges((prev) => prev.filter((e) => e.sourceNodeKey !== nodeKey && e.targetNodeKey !== nodeKey));
    if (selectedNodeKey === nodeKey) setSelectedNodeKey(null);
    toast.info(`Deleted step ${nodeKey}`);
  };

  const handleDeleteEdge = (sourceKey: string, targetKey: string) => {
    setEdges((prev) => prev.filter((e) => !(e.sourceNodeKey === sourceKey && e.targetNodeKey === targetKey)));
    toast.info("Transition removed");
  };

  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.nodeKey === selectedNodeKey);
  }, [nodes, selectedNodeKey]);

  const updateSelectedNode = (updates: Partial<WorkflowNodeItem>) => {
    if (!selectedNodeKey) return;
    setNodes((prev) => prev.map((n) => (n.nodeKey === selectedNodeKey ? { ...n, ...updates } : n)));
  };

  const nodeStatusMap = useMemo(() => {
    const map: Record<string, WorkflowStepRunItem> = {};
    if (currentRun?.stepRuns) {
      for (const step of currentRun.stepRuns) {
        map[step.nodeKey] = step;
      }
    }
    return map;
  }, [currentRun]);

  if (loading || !workflow) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div className="spinner" />
        <span style={{ marginLeft: "0.8rem", color: "var(--muted)", fontSize: "0.9rem" }}>Loading Studio...</span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 80px)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* ─── STUDIO TOP TOOLBAR ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.65rem 1.25rem",
          background: "var(--card)",
          borderBottom: "1px solid var(--border)",
          zIndex: 40,
          gap: "1rem",
        }}
      >
        {/* Left: Breadcrumbs & Title */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
          <Link href="/dashboard/flows" className="btn btn-ghost btn-sm" title="Back to Pipelines">
            <ArrowLeft size={15} />
          </Link>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
              <span style={{ fontSize: "1.05rem", fontWeight: 750, color: "var(--foreground)" }}>
                {workflow.name}
              </span>
              <span
                style={{
                  fontSize: "0.65rem",
                  padding: "0.15rem 0.45rem",
                  borderRadius: 4,
                  background: "rgba(99, 102, 241, 0.12)",
                  color: "#818cf8",
                  fontWeight: 650,
                  letterSpacing: "0.03em",
                }}
              >
                {workflow.category}
              </span>
              <span
                style={{
                  fontSize: "0.65rem",
                  padding: "0.15rem 0.45rem",
                  borderRadius: 4,
                  background: workflow.enabled ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.12)",
                  color: workflow.enabled ? "#10b981" : "#f43f5e",
                  fontWeight: 650,
                }}
              >
                {workflow.enabled ? "ACTIVE" : "PAUSED"}
              </span>
            </div>
            <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "monospace" }}>
              {workflow.slug}
            </span>
          </div>
        </div>

        {/* Center: Mode Tabs */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0.2rem",
            background: "var(--bg-inset)",
            borderRadius: 8,
            border: "1px solid var(--border)",
          }}
        >
          <button
            onClick={() => setViewMode("CANVAS")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.35rem 0.85rem",
              borderRadius: 6,
              fontSize: "0.78rem",
              fontWeight: 600,
              background: viewMode === "CANVAS" ? "var(--card)" : "transparent",
              color: viewMode === "CANVAS" ? "var(--foreground)" : "var(--muted)",
              border: "none",
              cursor: "pointer",
              boxShadow: viewMode === "CANVAS" ? "var(--shadow-sm)" : "none",
            }}
          >
            <Layout size={13} />
            Visual Studio
          </button>
          <button
            onClick={handleSwitchToCode}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.35rem 0.85rem",
              borderRadius: 6,
              fontSize: "0.78rem",
              fontWeight: 600,
              background: viewMode === "CODE" ? "var(--card)" : "transparent",
              color: viewMode === "CODE" ? "var(--foreground)" : "var(--muted)",
              border: "none",
              cursor: "pointer",
              boxShadow: viewMode === "CODE" ? "var(--shadow-sm)" : "none",
            }}
          >
            <Code2 size={13} />
            TypeScript DSL
          </button>
        </div>

        {/* Right: Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <button onClick={handleSave} disabled={saving} className="btn btn-secondary btn-sm">
            <Save size={14} className={saving ? "spin-icon" : ""} />
            {saving ? "Saving..." : "Save Pipeline"}
          </button>

          <button
            onClick={() => setTerminalOpen(!terminalOpen)}
            className={`btn btn-sm ${terminalOpen ? "btn-secondary" : "btn-ghost"}`}
          >
            <Terminal size={14} />
            Console
            {currentRun?.status === "RUNNING" && (
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#38bdf8",
                  marginLeft: 4,
                  boxShadow: "0 0 8px #38bdf8",
                }}
              />
            )}
          </button>

          <button onClick={handleTrigger} disabled={triggering} className="btn btn-primary btn-sm">
            <Play size={13} className={triggering ? "spin-icon" : ""} />
            {triggering ? "Starting..." : "Run Flow"}
          </button>
        </div>
      </div>

      {/* ─── STUDIO MAIN WORKSPACE ──────────────────────────────────────────────── */}
      <div style={{ position: "relative", flex: 1, overflow: "hidden", display: "flex" }}>
        {viewMode === "CANVAS" ? (
          <div
            ref={canvasRef}
            className="flow-canvas-container"
            onPointerDown={handleCanvasPointerDown}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              borderRadius: 0,
              cursor: isPanning ? "grabbing" : "default",
            }}
          >
            {/* ─── FLOATING STEP PALETTE (LEFT DOCK) ─────────────────────────────── */}
            <div
              className="flow-palette"
              style={{
                position: "absolute",
                top: 16,
                left: 16,
                zIndex: 35,
                width: paletteOpen ? 240 : 42,
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
                backdropFilter: "blur(14px)",
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                maxHeight: "calc(100% - 32px)",
              }}
            >
              {/* Palette Header */}
              <div
                style={{
                  padding: "0.6rem 0.85rem",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
                onClick={() => setPaletteOpen(!paletteOpen)}
              >
                {paletteOpen ? (
                  <>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                      Step Palette
                    </span>
                    <Plus size={14} style={{ color: "var(--accent)" }} />
                  </>
                ) : (
                  <Plus size={16} style={{ color: "var(--accent)", margin: "0 auto" }} />
                )}
              </div>

              {/* Palette Body */}
              {paletteOpen && (
                <div style={{ overflowY: "auto", padding: "0.6rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  {(["Trigger", "Build & Deploy", "Verification & Testing", "Operations & Routing", "Logic & Control"] as const).map(
                    (cat) => {
                      const items = Object.values(FLOW_NODE_TYPES).filter((n) => n.category === cat);
                      if (items.length === 0) return null;

                      return (
                        <div key={cat}>
                          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: "0.35rem" }}>
                            {cat}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                            {items.map((item) => (
                              <button
                                key={item.type}
                                onClick={() => handleAddNode(item.type)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  padding: "0.45rem 0.65rem",
                                  borderRadius: 6,
                                  background: "var(--bg-inset)",
                                  border: "1px solid var(--border)",
                                  color: "var(--foreground)",
                                  fontSize: "0.76rem",
                                  fontWeight: 550,
                                  cursor: "pointer",
                                  textAlign: "left",
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.borderColor = item.color;
                                  e.currentTarget.style.transform = "translateX(2px)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.borderColor = "var(--border)";
                                  e.currentTarget.style.transform = "none";
                                }}
                              >
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {item.label}
                                </span>
                                <span
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    background: item.color,
                                    flexShrink: 0,
                                    marginLeft: 6,
                                  }}
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              )}
            </div>

            {/* ─── CANVAS CONTROLS (BOTTOM LEFT) ─────────────────────────────────── */}
            <div
              style={{
                position: "absolute",
                bottom: 20,
                left: paletteOpen ? 270 : 70,
                zIndex: 30,
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.35rem",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                boxShadow: "var(--shadow)",
                transition: "left 0.2s ease",
              }}
            >
              <button
                onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}
                className="btn btn-ghost btn-sm"
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>
              <button
                onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
                className="btn btn-ghost btn-sm"
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
              <span style={{ fontSize: "0.72rem", color: "var(--muted)", minWidth: 36, textAlign: "center" }}>
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 80, y: 80 });
                }}
                className="btn btn-ghost btn-sm"
                title="Reset View"
              >
                <Maximize2 size={14} />
              </button>
            </div>

            {/* ─── TRANSFORM GRAPH VIEWPORT ──────────────────────────────────────── */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                width: 5000,
                height: 5000,
                pointerEvents: "none",
              }}
            >
              {/* SVG Edges Layer */}
              <svg
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              >
                <defs>
                  <marker
                    id="flow-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--muted-fg)" />
                  </marker>
                  <marker
                    id="flow-arrow-active"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--accent)" />
                  </marker>
                </defs>

                {/* Existing Edges */}
                {edges.map((edge, idx) => {
                  const srcNode = nodes.find((n) => n.nodeKey === edge.sourceNodeKey);
                  const tgtNode = nodes.find((n) => n.nodeKey === edge.targetNodeKey);
                  if (!srcNode || !tgtNode) return null;

                  const x1 = srcNode.positionX + 260;
                  const y1 = srcNode.positionY + 44;
                  const x2 = tgtNode.positionX;
                  const y2 = tgtNode.positionY + 44;
                  const dx = Math.max(50, Math.abs(x2 - x1) * 0.45);
                  const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

                  const midX = (x1 + x2) / 2;
                  const midY = (y1 + y2) / 2;

                  const srcRunStatus = nodeStatusMap[srcNode.nodeKey]?.status;
                  const isActive = srcRunStatus === "RUNNING";

                  return (
                    <g key={`${edge.sourceNodeKey}-${edge.targetNodeKey}-${idx}`} style={{ pointerEvents: "all" }}>
                      <path
                        d={pathD}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={16}
                        style={{ cursor: "pointer" }}
                        onClick={() => handleDeleteEdge(edge.sourceNodeKey, edge.targetNodeKey)}
                      />
                      <path
                        d={pathD}
                        fill="none"
                        stroke={isActive ? "var(--accent)" : "rgba(148, 163, 184, 0.4)"}
                        strokeWidth={2.5}
                        markerEnd={isActive ? "url(#flow-arrow-active)" : "url(#flow-arrow)"}
                        className={isActive ? "flow-edge-active" : ""}
                      />
                      {edge.condition && (
                        <foreignObject
                          x={midX - 35}
                          y={midY - 12}
                          width={70}
                          height={24}
                          style={{ overflow: "visible" }}
                        >
                          <div
                            style={{
                              fontSize: "0.64rem",
                              fontWeight: 600,
                              padding: "0.15rem 0.45rem",
                              borderRadius: 4,
                              background:
                                edge.condition === "success"
                                  ? "rgba(16, 185, 129, 0.2)"
                                  : edge.condition === "failure"
                                  ? "rgba(244, 63, 94, 0.2)"
                                  : "rgba(99, 102, 241, 0.2)",
                              color:
                                edge.condition === "success"
                                  ? "#10b981"
                                  : edge.condition === "failure"
                                  ? "#f43f5e"
                                  : "#818cf8",
                              border: "1px solid currentColor",
                              textAlign: "center",
                              cursor: "pointer",
                            }}
                            onClick={() => handleDeleteEdge(edge.sourceNodeKey, edge.targetNodeKey)}
                            title="Click to remove transition"
                          >
                            {edge.condition}
                          </div>
                        </foreignObject>
                      )}
                    </g>
                  );
                })}

                {/* In-Flight Dragging Wire */}
                {connectingSourceKey && (
                  <path
                    d={`M ${
                      (nodes.find((n) => n.nodeKey === connectingSourceKey)?.positionX || 0) + 260
                    } ${
                      (nodes.find((n) => n.nodeKey === connectingSourceKey)?.positionY || 0) + 44
                    } C ${
                      (nodes.find((n) => n.nodeKey === connectingSourceKey)?.positionX || 0) + 260 + 60
                    } ${
                      (nodes.find((n) => n.nodeKey === connectingSourceKey)?.positionY || 0) + 44
                    }, ${mousePos.x - 60} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={2.5}
                    strokeDasharray="4 4"
                  />
                )}
              </svg>

              {/* ─── NODE CARDS ────────────────────────────────────────────────────── */}
              {nodes.map((node) => {
                const meta = FLOW_NODE_TYPES[node.type] || FLOW_NODE_TYPES.ACTION_HTTP_REQUEST;
                const isSelected = selectedNodeKey === node.nodeKey;
                const isTargetHovered = hoveredTargetKey === node.nodeKey;
                const stepRun = nodeStatusMap[node.nodeKey];
                const isRunning = stepRun?.status === "RUNNING";
                const isSuccess = stepRun?.status === "SUCCESS";
                const isFailed = stepRun?.status === "FAILED";
                const isWaiting = stepRun?.status === "WAITING_FOR_APPROVAL";

                return (
                  <div
                    key={node.nodeKey}
                    className={`flow-node-card ${isSelected ? "selected" : ""} ${
                      isRunning ? "flow-node-running" : ""
                    }`}
                    style={{
                      left: node.positionX,
                      top: node.positionY,
                      width: 260,
                      borderColor: isTargetHovered
                        ? "#10b981"
                        : isSuccess
                        ? "#10b981"
                        : isFailed
                        ? "#f43f5e"
                        : isWaiting
                        ? "#eab308"
                        : isSelected
                        ? "var(--accent)"
                        : "var(--card-border)",
                      boxShadow: isTargetHovered
                        ? "0 0 0 2px #10b981, 0 12px 30px rgba(16, 185, 129, 0.25)"
                        : undefined,
                      pointerEvents: "all",
                      overflow: "hidden",
                    }}
                    onPointerDown={(e) => handleNodePointerDown(e, node.nodeKey)}
                    onMouseEnter={() => {
                      if (connectingSourceKey && connectingSourceKey !== node.nodeKey) {
                        setHoveredTargetKey(node.nodeKey);
                      }
                    }}
                    onMouseLeave={() => {
                      if (hoveredTargetKey === node.nodeKey) {
                        setHoveredTargetKey(null);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      // If connecting, link it!
                      if (connectingSourceKey && connectingSourceKey !== node.nodeKey) {
                        setEdges((prev) => [
                          ...prev,
                          { sourceNodeKey: connectingSourceKey, targetNodeKey: node.nodeKey, condition: "success" },
                        ]);
                        setConnectingSourceKey(null);
                        setHoveredTargetKey(null);
                        toast.success(`Linked to ${node.nodeKey}`);
                        return;
                      }
                      setSelectedNodeKey(node.nodeKey);
                    }}
                  >
                    {/* Top colored category bar */}
                    <div
                      style={{
                        height: 4,
                        width: "100%",
                        background: meta.color,
                      }}
                    />

                    {/* Input Port (Left) */}
                    <div
                      className="flow-port flow-port-input"
                      title="Input Port (click or release here to link)"
                    />

                    {/* Output Port (Right) */}
                    <div
                      className="flow-port flow-port-output"
                      title="Output Port (drag to connect next step)"
                      onPointerDown={(e) => handlePortPointerDown(e, node.nodeKey)}
                    />

                    {/* Card Interior */}
                    <div style={{ padding: "0.85rem 1.1rem" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "0.4rem",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.64rem",
                            fontWeight: 700,
                            padding: "0.15rem 0.45rem",
                            borderRadius: 4,
                            background: meta.bgGlow,
                            color: meta.color,
                            letterSpacing: "0.04em",
                          }}
                        >
                          {meta.badge}
                        </span>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          {stepRun && (
                            <>
                              {isSuccess && <CheckCircle2 size={14} style={{ color: "#10b981" }} />}
                              {isFailed && <AlertCircle size={14} style={{ color: "#f43f5e" }} />}
                              {isRunning && <span className="spinner" style={{ width: 12, height: 12 }} />}
                              {isWaiting && <Clock size={14} style={{ color: "#eab308" }} />}
                            </>
                          )}

                          {/* Quick Add Child (+) button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setQuickAddParentKey(node.nodeKey);
                            }}
                            className="btn btn-ghost btn-sm"
                            style={{ padding: "0.15rem 0.35rem", fontSize: "0.7rem", color: "var(--muted)" }}
                            title="Add next step"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: "0.88rem",
                          fontWeight: 700,
                          color: "var(--foreground)",
                          marginBottom: "0.25rem",
                        }}
                      >
                        {node.name}
                      </div>

                      <div
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--muted)",
                          fontFamily: "monospace",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>{node.nodeKey}</span>
                        {stepRun?.durationMs && (
                          <span style={{ color: "var(--foreground)" }}>
                            {(stepRun.durationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Add Child Step Popup Modal */}
            {quickAddParentKey && (
              <div
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0, 0, 0, 0.6)",
                  backdropFilter: "blur(4px)",
                  zIndex: 100,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "1rem",
                }}
                onClick={() => setQuickAddParentKey(null)}
              >
                <div
                  className="card"
                  style={{
                    width: "100%",
                    maxWidth: 580,
                    maxHeight: "80vh",
                    overflowY: "auto",
                    padding: "1.25rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Link2 size={16} style={{ color: "var(--accent)" }} />
                      <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>
                        Connect Next Step to &quot;{nodes.find((n) => n.nodeKey === quickAddParentKey)?.name}&quot;
                      </h3>
                    </div>
                    <button onClick={() => setQuickAddParentKey(null)} className="btn btn-ghost btn-sm">
                      <X size={15} />
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                    {Object.values(FLOW_NODE_TYPES).map((n) => (
                      <div
                        key={n.type}
                        onClick={() => handleAddNode(n.type, quickAddParentKey)}
                        style={{
                          padding: "0.65rem 0.8rem",
                          borderRadius: 8,
                          background: "var(--bg-inset)",
                          border: "1px solid var(--border)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = n.color;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "var(--border)";
                        }}
                      >
                        <span style={{ fontSize: "0.8rem", fontWeight: 650, color: "var(--foreground)" }}>
                          {n.label}
                        </span>
                        <span
                          style={{
                            fontSize: "0.6rem",
                            fontWeight: 700,
                            padding: "0.1rem 0.35rem",
                            borderRadius: 4,
                            background: n.bgGlow,
                            color: n.color,
                          }}
                        >
                          {n.badge}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ─── CODE DSL EDITOR ─────────────────────────────────────────────────── */
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              background: "var(--bg-inset)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.65rem 1.25rem",
                background: "var(--card)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Code2 size={16} style={{ color: "var(--accent)" }} />
                <span style={{ fontSize: "0.86rem", fontWeight: 700 }}>TypeScript Workflow DSL</span>
                <span style={{ fontSize: "0.74rem", color: "var(--muted)" }}>
                  (Edit code and click &quot;Apply DSL to Canvas&quot; to update the graph)
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(dslCode);
                    toast.success("DSL code copied to clipboard!");
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  <Copy size={13} />
                  Copy Code
                </button>
                <button onClick={handleApplyDsl} className="btn btn-primary btn-sm">
                  <Check size={13} />
                  Apply DSL to Canvas
                </button>
              </div>
            </div>

            <div style={{ flex: 1, padding: "1rem" }}>
              <textarea
                value={dslCode}
                onChange={(e) => setDslCode(e.target.value)}
                spellCheck={false}
                style={{
                  width: "100%",
                  height: "100%",
                  padding: "1.25rem",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  color: "var(--foreground)",
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: "0.84rem",
                  lineHeight: 1.65,
                  resize: "none",
                  outline: "none",
                }}
              />
            </div>
          </div>
        )}

        {/* ─── SLIDE-OVER NODE INSPECTOR ────────────────────────────────────────── */}
        {selectedNode && viewMode === "CANVAS" && (
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: 390,
              height: "100%",
              background: "var(--background)",
              borderLeft: "1px solid var(--border)",
              boxShadow: "-10px 0 30px rgba(0, 0, 0, 0.4)",
              zIndex: 45,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "1.1rem 1.25rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Settings size={16} style={{ color: "var(--accent)" }} />
                <span style={{ fontSize: "1rem", fontWeight: 700 }}>Step Inspector</span>
              </div>
              <button onClick={() => setSelectedNodeKey(null)} className="btn btn-ghost btn-sm">
                <X size={15} />
              </button>
            </div>

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid var(--border)",
                padding: "0.35rem 1.25rem 0",
                gap: "1rem",
              }}
            >
              <button
                onClick={() => setInspectorTab("CONFIG")}
                style={{
                  padding: "0.5rem 0",
                  fontSize: "0.78rem",
                  fontWeight: 650,
                  color: inspectorTab === "CONFIG" ? "var(--accent)" : "var(--muted)",
                  borderBottom: `2px solid ${inspectorTab === "CONFIG" ? "var(--accent)" : "transparent"}`,
                  background: "transparent",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  cursor: "pointer",
                }}
              >
                Configuration
              </button>
              <button
                onClick={() => setInspectorTab("POLICIES")}
                style={{
                  padding: "0.5rem 0",
                  fontSize: "0.78rem",
                  fontWeight: 650,
                  color: inspectorTab === "POLICIES" ? "var(--accent)" : "var(--muted)",
                  borderBottom: `2px solid ${inspectorTab === "POLICIES" ? "var(--accent)" : "transparent"}`,
                  background: "transparent",
                  borderTop: "none",
                  borderLeft: "none",
                  borderRight: "none",
                  cursor: "pointer",
                }}
              >
                Policies &amp; Retries
              </button>
            </div>

            {/* Form Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.2rem" }}>
              {inspectorTab === "CONFIG" ? (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                      Step Label
                    </label>
                    <input
                      type="text"
                      value={selectedNode.name}
                      onChange={(e) => updateSelectedNode({ name: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "0.55rem 0.75rem",
                        background: "var(--bg-inset)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        color: "var(--foreground)",
                        fontSize: "0.84rem",
                        outline: "none",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                      Unique Node Key
                    </label>
                    <input
                      type="text"
                      value={selectedNode.nodeKey}
                      readOnly
                      style={{
                        width: "100%",
                        padding: "0.55rem 0.75rem",
                        background: "var(--bg-inset)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        color: "var(--muted)",
                        fontSize: "0.82rem",
                        fontFamily: "monospace",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                      Node Action Type
                    </label>
                    <div
                      style={{
                        padding: "0.55rem 0.75rem",
                        borderRadius: 6,
                        background: FLOW_NODE_TYPES[selectedNode.type]?.bgGlow || "var(--bg-inset)",
                        color: FLOW_NODE_TYPES[selectedNode.type]?.color || "var(--foreground)",
                        fontSize: "0.82rem",
                        fontWeight: 700,
                      }}
                    >
                      {FLOW_NODE_TYPES[selectedNode.type]?.label || selectedNode.type}
                    </div>
                    <p style={{ fontSize: "0.74rem", color: "var(--muted)", marginTop: "0.3rem", lineHeight: 1.45 }}>
                      {FLOW_NODE_TYPES[selectedNode.type]?.description}
                    </p>
                  </div>

                  {/* Specialized fields */}
                  {selectedNode.type === "ACTION_RUN_TESTS" && (
                    <div>
                      <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                        Test Execution Command
                      </label>
                      <input
                        type="text"
                        value={selectedNode.config?.command || "npm test"}
                        onChange={(e) =>
                          updateSelectedNode({ config: { ...selectedNode.config, command: e.target.value } })
                        }
                        style={{
                          width: "100%",
                          padding: "0.55rem 0.75rem",
                          background: "var(--bg-inset)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          color: "var(--foreground)",
                          fontSize: "0.82rem",
                          fontFamily: "monospace",
                        }}
                      />
                    </div>
                  )}

                  {selectedNode.type === "ACTION_HEALTH_PROBE" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                      <div>
                        <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                          Probe URL
                        </label>
                        <input
                          type="text"
                          value={selectedNode.config?.url || "http://127.0.0.1:3000/health"}
                          onChange={(e) =>
                            updateSelectedNode({ config: { ...selectedNode.config, url: e.target.value } })
                          }
                          style={{
                            width: "100%",
                            padding: "0.55rem 0.75rem",
                            background: "var(--bg-inset)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            color: "var(--foreground)",
                            fontSize: "0.82rem",
                            fontFamily: "monospace",
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                          Expected Status Code
                        </label>
                        <input
                          type="number"
                          value={selectedNode.config?.expectedStatus || 200}
                          onChange={(e) =>
                            updateSelectedNode({
                              config: { ...selectedNode.config, expectedStatus: Number(e.target.value) },
                            })
                          }
                          style={{
                            width: "100%",
                            padding: "0.55rem 0.75rem",
                            background: "var(--bg-inset)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            color: "var(--foreground)",
                            fontSize: "0.82rem",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {selectedNode.type === "CONTROL_APPROVAL" && (
                    <div>
                      <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                        Approval Gate Prompt Message
                      </label>
                      <textarea
                        value={selectedNode.config?.message || "Approve deployment to live production?"}
                        onChange={(e) =>
                          updateSelectedNode({ config: { ...selectedNode.config, message: e.target.value } })
                        }
                        rows={3}
                        style={{
                          width: "100%",
                          padding: "0.55rem 0.75rem",
                          background: "var(--bg-inset)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          color: "var(--foreground)",
                          fontSize: "0.82rem",
                          resize: "vertical",
                        }}
                      />
                    </div>
                  )}

                  {selectedNode.type === "ACTION_AI_PROMPT" && (
                    <div>
                      <label style={{ display: "block", fontSize: "0.76rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                        Gemini 3.5 Prompt Instructions
                      </label>
                      <textarea
                        value={selectedNode.config?.prompt || "Generate release notes for this production build."}
                        onChange={(e) =>
                          updateSelectedNode({ config: { ...selectedNode.config, prompt: e.target.value } })
                        }
                        rows={3}
                        style={{
                          width: "100%",
                          padding: "0.55rem 0.75rem",
                          background: "var(--bg-inset)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          color: "var(--foreground)",
                          fontSize: "0.82rem",
                          resize: "vertical",
                        }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.85rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 600, color: "var(--muted)", marginBottom: "0.25rem" }}>
                        Timeout (s)
                      </label>
                      <input
                        type="number"
                        value={selectedNode.timeoutSeconds ?? 300}
                        onChange={(e) => updateSelectedNode({ timeoutSeconds: Number(e.target.value) })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.65rem",
                          background: "var(--bg-inset)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          color: "var(--foreground)",
                          fontSize: "0.82rem",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.74rem", fontWeight: 600, color: "var(--muted)", marginBottom: "0.25rem" }}>
                        Max Retries
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={5}
                        value={selectedNode.maxRetries ?? 0}
                        onChange={(e) => updateSelectedNode({ maxRetries: Number(e.target.value) })}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.65rem",
                          background: "var(--bg-inset)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          color: "var(--foreground)",
                          fontSize: "0.82rem",
                        }}
                      />
                    </div>
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem", cursor: "pointer", marginTop: "0.5rem" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(selectedNode.continueOnError)}
                      onChange={(e) => updateSelectedNode({ continueOnError: e.target.checked })}
                    />
                    <span>Continue pipeline on step failure</span>
                  </label>
                </>
              )}

              {/* Delete Button */}
              <div style={{ marginTop: "auto", paddingTop: "1rem" }}>
                <button
                  onClick={() => handleDeleteNode(selectedNode.nodeKey)}
                  className="btn btn-danger btn-sm"
                  style={{ width: "100%" }}
                >
                  <Trash2 size={13} />
                  Delete Step from DAG
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── LIVE SSE EXECUTION TERMINAL ──────────────────────────────────────── */}
        {terminalOpen && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 340,
              background: "rgba(10, 14, 22, 0.98)",
              borderTop: "1px solid var(--border)",
              boxShadow: "0 -10px 35px rgba(0, 0, 0, 0.6)",
              backdropFilter: "blur(16px)",
              zIndex: 50,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Terminal Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.55rem 1.1rem",
                background: "rgba(0, 0, 0, 0.4)",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                  <Terminal size={15} style={{ color: "#38bdf8" }} />
                  <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "#f1f5f9" }}>
                    Live Execution Logs
                  </span>
                </div>

                {currentRun && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span
                      style={{
                        fontSize: "0.68rem",
                        padding: "0.15rem 0.5rem",
                        borderRadius: 4,
                        background:
                          currentRun.status === "SUCCESS"
                            ? "rgba(16, 185, 129, 0.2)"
                            : currentRun.status === "FAILED"
                            ? "rgba(244, 63, 94, 0.2)"
                            : currentRun.status === "WAITING_FOR_APPROVAL"
                            ? "rgba(234, 179, 8, 0.2)"
                            : "rgba(56, 189, 248, 0.2)",
                        color:
                          currentRun.status === "SUCCESS"
                            ? "#10b981"
                            : currentRun.status === "FAILED"
                            ? "#f43f5e"
                            : currentRun.status === "WAITING_FOR_APPROVAL"
                            ? "#eab308"
                            : "#38bdf8",
                        fontWeight: 700,
                      }}
                    >
                      {currentRun.status}
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "monospace" }}>
                      Run ID: {currentRun.id.slice(0, 8)}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                {currentRun?.status === "SUCCESS" && (
                  <button onClick={handleReplay} className="btn btn-secondary btn-sm" title="Replay with cache">
                    <Zap size={13} style={{ color: "#eab308" }} />
                    Instant Replay
                  </button>
                )}
                <span
                  style={{
                    fontSize: "0.68rem",
                    color: "var(--muted)",
                    padding: "0.2rem 0.45rem",
                    borderRadius: 4,
                    background: "rgba(255, 255, 255, 0.05)",
                  }}
                >
                  64KB Ring Buffer Active
                </span>
                <button onClick={() => setTerminalOpen(false)} className="btn btn-ghost btn-sm">
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Human Approval Gate Prompt */}
            {currentRun?.status === "WAITING_FOR_APPROVAL" && (
              <div
                style={{
                  padding: "0.85rem 1.25rem",
                  background: "rgba(234, 179, 8, 0.14)",
                  borderBottom: "1px solid rgba(234, 179, 8, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
                  <Clock size={18} style={{ color: "#eab308" }} />
                  <div>
                    <div style={{ fontSize: "0.86rem", fontWeight: 700, color: "#fef08a" }}>
                      Human Approval Gate Required
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "var(--muted)" }}>
                      {currentRun.approvals?.[0]?.message || "Authorize production router cutover?"}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <button
                    onClick={() => handleApproval(false)}
                    className="btn btn-danger btn-sm"
                  >
                    <X size={13} />
                    Reject Pipeline
                  </button>
                  <button
                    onClick={() => handleApproval(true)}
                    className="btn btn-primary btn-sm"
                    style={{ background: "#10b981", borderColor: "#10b981" }}
                  >
                    <Check size={13} />
                    Approve Execution
                  </button>
                </div>
              </div>
            )}

            {/* Logs Output */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "0.85rem 1.1rem",
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: "0.78rem",
                lineHeight: 1.6,
              }}
            >
              {terminalLogs.length === 0 ? (
                <span style={{ color: "var(--muted)" }}>
                  Connecting to live stream... Step execution logs will appear here.
                </span>
              ) : (
                terminalLogs.map((log, idx) => (
                  <div key={idx} className="log-line">
                    {log.line}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
