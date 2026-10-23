"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  X,
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Plus,
  Loader2,
  History,
  Trash2,
  Copy,
  Check,
  Square,
  StopCircle,
  CheckCircle2,
  AlertCircle,
  Terminal,
  Server,
  Database,
  Globe,
  Zap,
  Activity,
  Layers,
  ChevronDown,
  ChevronUp,
  Cpu,
  Clock,
  Sparkles,
} from "lucide-react";
import { agentApi, type AgentChatResponse } from "@/lib/api";
import { MarkdownView } from "./markdown-view";
import { SummerLogo } from "./summer-logo";

// ─── Types ──────────────────────────────────────────────────────────────────

type AgentState = "idle" | "thinking" | "executing" | "streaming" | "speaking";

interface ActiveStep {
  id: string;
  message: string;
  status: "running" | "done" | "error";
  durationMs?: number;
  toolName?: string;
  toolResult?: any;
  toolError?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: any[];
  pendingAction?: any;
  audioData?: any;
  steps?: ActiveStep[];
  createdAt: string;
}

// ─── Design Tokens (Dynamic Theme-Aware Design System) ─────────────────────────

const T = {
  // Dynamic theme-aware surfaces
  bg: "var(--card)",
  bgSubtle: "var(--bg-inset)",
  bgCard: "var(--card)",
  bgCardHover: "var(--bg-subtle)",
  bgInset: "var(--bg-subtle)",

  // Borders
  border: "var(--border)",
  borderLight: "var(--border-light)",
  borderActive: "rgba(99, 102, 241, 0.4)",

  // Typography
  text: "var(--foreground)",
  textSecondary: "var(--muted)",
  textMuted: "var(--muted-fg)",

  // Brand accents & Aurora gradients
  accent: "var(--accent)",
  accentHover: "var(--accent-hover)",
  accentCyan: "var(--accent-2)",
  accentGradient: "var(--accent-gradient)",
  auroraMesh:
    "radial-gradient(ellipse at 90% 0%, var(--aurora-lavender) 0%, var(--aurora-blue) 35%, transparent 70%)",

  // Semantic status
  success: "var(--success)",
  successBg: "var(--success-bg)",
  successBorder: "var(--success-border)",
  error: "var(--danger)",
  errorBg: "var(--danger-bg)",
  errorBorder: "var(--danger-border)",
  warning: "var(--warning)",
  warningBg: "var(--warning-bg)",
  warningBorder: "var(--warning-border)",

  // Shadows
  shadow: "var(--shadow-lg)",
  cardShadow: "var(--shadow-sm)",
};

// Helper: Pick icon based on tool name
function getToolIcon(name: string = "") {
  const n = name.toLowerCase();
  if (n.includes("exec") || n.includes("terminal") || n.includes("cmd")) return Terminal;
  if (n.includes("database") || n.includes("db")) return Database;
  if (n.includes("service") || n.includes("container")) return Server;
  if (n.includes("health") || n.includes("network") || n.includes("route")) return Globe;
  if (n.includes("function") || n.includes("edge")) return Zap;
  if (n.includes("cron")) return Clock;
  if (n.includes("analytics") || n.includes("inspect")) return Activity;
  return Cpu;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SummerDrawer() {
  const router = useRouter();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; createdAt: string }>>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm **Summer**, your autonomous DevOps copilot on Whizan Cloud.\n\nI can inspect live containers, stream logs, provision databases, trigger deployments, and monitor your cloud fleet. What would you like to run?",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [activeSteps, setActiveSteps] = useState<ActiveStep[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechRecRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Elapsed Timer for Coding Agent Execution ───────────────────────────

  useEffect(() => {
    if (agentState !== "idle") {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [agentState]);

  // ─── Persistence & Keyboard Shortcuts ───────────────────────────────────

  useEffect(() => {
    try {
      if (localStorage.getItem("whizan_summer_is_open") === "true") setIsOpen(true);
      const sid = localStorage.getItem("whizan_summer_session_id");
      if (sid) {
        setCurrentSessionId(sid);
        agentApi
          .getSession(sid)
          .then((data) => {
            if (data?.messages?.length > 0) {
              setMessages(
                data.messages.map((m: any) => ({
                  id: m.id,
                  role: m.role,
                  content: m.content || "",
                  toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
                  createdAt: m.createdAt,
                }))
              );
            }
          })
          .catch(() => {});
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("whizan_summer_is_open", isOpen ? "true" : "false");
    } catch {}
  }, [isOpen]);

  useEffect(() => {
    try {
      if (currentSessionId) localStorage.setItem("whizan_summer_session_id", currentSessionId);
      else localStorage.removeItem("whizan_summer_session_id");
    } catch {}
  }, [currentSessionId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((p) => !p);
      }
      if (e.key === "Escape" && isOpen) {
        stopAudio();
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  useEffect(() => {
    if (!showHistory) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, agentState, activeSteps, showHistory]);

  useEffect(() => {
    if (isOpen) loadSessions();
  }, [isOpen]);

  // ─── Session Management ─────────────────────────────────────────────────

  async function loadSessions() {
    try {
      setSessions((await agentApi.getSessions()) || []);
    } catch {}
  }

  async function selectSession(sid: string) {
    try {
      const data = await agentApi.getSession(sid);
      if (data?.messages) {
        setCurrentSessionId(sid);
        setMessages(
          data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content || "",
            toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
            createdAt: m.createdAt,
          }))
        );
      }
      setShowHistory(false);
    } catch {}
  }

  async function deleteSession(sid: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this session?")) return;
    try {
      await agentApi.deleteSession(sid);
      setSessions((p) => p.filter((s) => s.id !== sid));
      if (currentSessionId === sid) startNewChat();
    } catch {}
  }

  function startNewChat() {
    stopAudio();
    cancelRequest();
    setCurrentSessionId(null);
    setShowHistory(false);
    setActiveSteps([]);
    try {
      localStorage.removeItem("whizan_summer_session_id");
    } catch {}
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content: "Starting a fresh session! What would you like to build, deploy, or inspect?",
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  // ─── Audio ──────────────────────────────────────────────────────────────

  function playSpeech(audioData: any) {
    if (!voiceEnabled || !audioData) return;
    stopAudio();

    if (audioData.audioBase64) {
      try {
        const url = `data:${audioData.format || "audio/wav"};base64,${audioData.audioBase64}`;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onplay = () => setIsSpeaking(true);
        audio.onended = () => setIsSpeaking(false);
        audio.onerror = () => {
          setIsSpeaking(false);
          fallbackSpeech(audioData.spokenText);
        };
        audio.play().catch(() => fallbackSpeech(audioData.spokenText));
      } catch {
        fallbackSpeech(audioData.spokenText);
      }
    } else if (audioData.fallbackToBrowserSpeech && audioData.spokenText) {
      fallbackSpeech(audioData.spokenText);
    }
  }

  function fallbackSpeech(text: string) {
    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 1.05;
      utt.pitch = 1.15;
      const voices = window.speechSynthesis.getVoices();
      const fem = voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Samantha") ||
            v.name.includes("Female") ||
            v.name.includes("Karen") ||
            v.name.includes("Victoria") ||
            v.name.includes("Zira"))
      );
      if (fem) utt.voice = fem;
      utt.onstart = () => setIsSpeaking(true);
      utt.onend = () => setIsSpeaking(false);
      utt.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utt);
    } catch {
      setIsSpeaking(false);
    }
  }

  function stopAudio() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }

  // ─── Speech Recognition (Voice Input) ───────────────────────────────────

  function toggleMic() {
    if (isListening) {
      speechRecRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const rec = new SpeechRec();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";

    rec.onstart = () => setIsListening(true);
    rec.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript;
      if (transcript) {
        setInputPrompt((p) => (p ? `${p} ${transcript}` : transcript));
      }
      setIsListening(false);
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);

    speechRecRef.current = rec;
    rec.start();
  }

  // ─── Abort / Cancel ─────────────────────────────────────────────────────

  function cancelRequest() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setAgentState("idle");
    setActiveSteps((steps) =>
      steps.map((s) => (s.status === "running" ? { ...s, status: "error" } : s))
    );
  }

  // ─── Send Message with SSE Stream & Resilient Sync Fallback ─────────────

  async function handleSendMessage(overrideText?: string) {
    const text = overrideText || inputPrompt;
    if (!text.trim() || agentState !== "idle") return;

    stopAudio();
    setInputPrompt("");
    setShowHistory(false);

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `asst-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      },
      {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      },
    ]);

    setAgentState("thinking");
    setActiveSteps([]);

    const abortController = new AbortController();
    abortRef.current = abortController;

    let assistantText = "";
    let toolCalls: any[] = [];
    let pendingAction: any = null;
    let audioData: any = null;
    const collectedSteps: ActiveStep[] = [];

    let streamSucceeded = false;

    try {
      const response = await agentApi.streamChat(
        {
          message: text,
          sessionId: currentSessionId || undefined,
          context: { pathname: pathname || undefined },
          enableTts: voiceEnabled,
        },
        abortController.signal
      );

      streamSucceeded = true;
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          const match = block.match(/^data:\s*(.+)$/m);
          if (!match) continue;

          let evt: any;
          try {
            evt = JSON.parse(match[1]);
          } catch {
            continue;
          }

          switch (evt.type) {
            case "session":
              if (!currentSessionId && evt.sessionId) {
                setCurrentSessionId(evt.sessionId);
                loadSessions();
              }
              break;

            case "step": {
              const stepId = evt.stepId || `step-${Date.now()}`;
              const existingIdx = collectedSteps.findIndex((s) => s.id === stepId);
              const stepObj: ActiveStep = {
                id: stepId,
                message: evt.message,
                status: evt.status || "running",
                durationMs: evt.durationMs,
                toolName: evt.toolName,
              };
              if (existingIdx >= 0) {
                collectedSteps[existingIdx] = stepObj;
              } else {
                collectedSteps.push(stepObj);
              }
              setActiveSteps([...collectedSteps]);
              setAgentState(evt.toolName ? "executing" : "thinking");
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, steps: [...collectedSteps] } : m
                )
              );
              break;
            }

            case "tool_start": {
              const toolName = evt.toolName || evt.name || "devops_tool";
              const startStep: ActiveStep = {
                id: `tool-${toolName}-${Date.now()}`,
                message: `Executing ${toolName}…`,
                status: "running",
                toolName: toolName,
              };
              collectedSteps.push(startStep);
              setActiveSteps([...collectedSteps]);
              setAgentState("executing");
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, steps: [...collectedSteps] } : m
                )
              );
              break;
            }

            case "tool_result": {
              const toolName = evt.toolName || evt.name;
              const targetIdx = collectedSteps
                .slice()
                .reverse()
                .findIndex((s) => s.toolName === toolName || s.id.includes(toolName));
              if (targetIdx >= 0) {
                const actualIdx = collectedSteps.length - 1 - targetIdx;
                collectedSteps[actualIdx].status = evt.error ? "error" : "done";
                collectedSteps[actualIdx].durationMs = evt.durationMs;
                collectedSteps[actualIdx].toolResult = evt.result;
                collectedSteps[actualIdx].toolError = evt.error;
                setActiveSteps([...collectedSteps]);
              }
              toolCalls.push({
                name: toolName,
                parameters: evt.parameters,
                result: evt.result,
                error: evt.error,
                durationMs: evt.durationMs,
              });
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, steps: [...collectedSteps], toolCalls: [...toolCalls] }
                    : m
                )
              );
              break;
            }

            case "text": {
              const textContent = evt.content ?? evt.delta ?? evt.text ?? "";
              if (evt.content !== undefined) {
                assistantText = evt.content;
              } else if (textContent) {
                assistantText += textContent;
              }
              setAgentState("streaming");
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: assistantText, steps: [...collectedSteps] }
                    : m
                )
              );
              break;
            }

            case "hitl": {
              const act = evt.action || {
                actionId: evt.actionId || evt.id,
                toolName: evt.toolName || evt.name,
                parameters: evt.parameters || evt.args,
                riskTier: evt.riskTier || "TIER_2",
                explanation: evt.explanation || `I need your approval to execute ${evt.toolName || evt.name}.`,
              };
              pendingAction = act;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, pendingAction: act } : m
                )
              );
              break;
            }

            case "navigate":
              if (evt.path) {
                try {
                  localStorage.setItem("whizan_summer_is_open", "true");
                } catch {}
                router.push(evt.path);
              }
              break;

            case "open_url":
              if (evt.url) window.open(evt.url, "_blank");
              break;

            case "audio":
              audioData = evt;
              break;

            case "done":
              if (evt.fullText && (!assistantText || assistantText === "undefined" || assistantText.trim() === "")) {
                assistantText = evt.fullText;
              }
              if (evt.pendingAction && !pendingAction) {
                pendingAction = evt.pendingAction;
              }
              setAgentState("idle");
              break;

            case "error":
              assistantText = assistantText
                ? `${assistantText}\n\n⚠️ **Error**: ${evt.error || evt.message}`
                : `⚠️ **Error**: ${evt.error || evt.message}`;
              collectedSteps.forEach((s) => {
                if (s.status === "running") s.status = "error";
              });
              setActiveSteps([...collectedSteps]);
              break;
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        assistantText = assistantText || "Request cancelled.";
      } else if (!streamSucceeded) {
        // ── Fallback: SSE stream unavailable, fall back to /chat ──
        console.warn("[Summer] SSE stream unavailable, falling back to /chat:", err.message);
        try {
          setAgentState("thinking");
          const step: ActiveStep = {
            id: `step-fallback`,
            message: "Analyzing your request…",
            status: "running",
          };
          collectedSteps.push(step);
          setActiveSteps([...collectedSteps]);

          const res = await agentApi.chat({
            message: text,
            sessionId: currentSessionId || undefined,
            context: { pathname: pathname || undefined },
            enableTts: voiceEnabled,
          });

          if (!currentSessionId && res.sessionId) {
            setCurrentSessionId(res.sessionId);
            loadSessions();
          }

          assistantText = res.message || (res as any).text || (res as any).content || "";
          toolCalls = res.toolExecutions || [];
          pendingAction = res.pendingAction || null;
          audioData = res.audio || null;

          collectedSteps[0].status = "done";
          for (const t of toolCalls) {
            collectedSteps.push({
              id: `tool-fb-${t.name}`,
              message: `Executed ${t.name}`,
              status: t.error ? "error" : "done",
              toolName: t.name,
              toolResult: t.result,
              toolError: t.error,
            });
          }
          setActiveSteps([...collectedSteps]);

          if (res.clientAction?.type === "NAVIGATE" && res.clientAction.path) {
            try {
              localStorage.setItem("whizan_summer_is_open", "true");
            } catch {}
            router.push(res.clientAction.path);
          } else if (res.clientAction?.type === "OPEN_URL" && res.clientAction.url) {
            window.open(res.clientAction.url, "_blank");
          }
        } catch (fallbackErr: any) {
          assistantText = assistantText || `Connection issue: ${fallbackErr.message}`;
        }
      } else {
        assistantText = assistantText || `Stream interrupted: ${err.message}`;
      }
    }

    // Safeguard: Ensure assistantText is never "undefined" or empty
    if (!assistantText || assistantText === "undefined" || assistantText.trim() === "") {
      assistantText = "I have completed your request.";
    }

    // Final message state update
    setMessages((prev) => {
      const exists = prev.find((m) => m.id === assistantMsgId);
      const finalMsg: Message = {
        id: assistantMsgId,
        role: "assistant",
        content: assistantText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        pendingAction: pendingAction || exists?.pendingAction,
        audioData,
        steps: collectedSteps.length > 0 ? collectedSteps : undefined,
        createdAt: new Date().toISOString(),
      };

      if (exists) {
        return prev.map((m) => (m.id === assistantMsgId ? finalMsg : m));
      }
      return [...prev, finalMsg];
    });

    setAgentState("idle");
    abortRef.current = null;

    // Play concise voice audio after completion
    if (audioData && voiceEnabled) {
      playSpeech(audioData);
    }
  }

  function copyMsg(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  }

  // ─── Context-Aware Quick Chips ──────────────────────────────────────────

  const quickChips = (() => {
    const p = pathname || "";
    if (p.includes("/services") || p.includes("/backend")) {
      return [
        { label: "List Services", prompt: "List all my backend services and their live status" },
        { label: "Service Logs", prompt: "Show latest deployment logs for my active services" },
        { label: "Fleet Health", prompt: "Check full fleet health status" },
      ];
    }
    if (p.includes("/databases")) {
      return [
        { label: "List Databases", prompt: "List all my managed databases and connection states" },
        { label: "DB Diagnostics", prompt: "Inspect database resource usage and connections" },
      ];
    }
    if (p.includes("/functions")) {
      return [
        { label: "Edge Functions", prompt: "List all edge functions and active endpoints" },
        { label: "Function Health", prompt: "Check edge function health and latency" },
      ];
    }
    if (p.includes("/cron")) {
      return [
        { label: "Cron Jobs", prompt: "List all scheduled cron jobs and recent execution runs" },
        { label: "Fleet Health", prompt: "Fleet health overview" },
      ];
    }
    return [
      { label: "Fleet Health", prompt: "Give me a full fleet health overview" },
      { label: "Build Logs", prompt: "Show latest deployment build logs" },
      { label: "Diagnostics", prompt: "Inspect any unhealthy or restarting containers" },
    ];
  })();

  // ─── Inline Tool Execution Card (Collapsible Monospace Drawer) ──────────

  function ToolExecutionCard({ tool }: { tool: any }) {
    const [expanded, setExpanded] = useState(false);
    const isErr = !!tool.error;
    const Icon = getToolIcon(tool.name);

    return (
      <div
        style={{
          margin: "5px 0",
          borderRadius: "8px",
          background: T.bgSubtle,
          border: `1px solid ${isErr ? T.errorBorder : T.border}`,
          overflow: "hidden",
          fontSize: "0.75rem",
        }}
      >
        <div
          onClick={() => setExpanded(!expanded)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 10px",
            cursor: "pointer",
            userSelect: "none",
            background: T.bgCard,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <Icon size={12} style={{ color: isErr ? T.error : T.accent }} />
            <span
              style={{
                fontFamily: "ui-monospace, monospace",
                fontWeight: 600,
                color: T.text,
                fontSize: "0.72rem",
              }}
            >
              {tool.name}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {isErr ? (
              <span
                style={{
                  fontSize: "0.64rem",
                  fontWeight: 600,
                  color: T.error,
                  background: T.errorBg,
                  padding: "1px 6px",
                  borderRadius: "6px",
                  border: `1px solid ${T.errorBorder}`,
                }}
              >
                Failed
              </span>
            ) : (
              <span
                style={{
                  fontSize: "0.64rem",
                  fontWeight: 600,
                  color: T.success,
                  background: T.successBg,
                  padding: "1px 6px",
                  borderRadius: "6px",
                  border: `1px solid ${T.successBorder}`,
                }}
              >
                Executed {tool.durationMs ? `(${tool.durationMs}ms)` : ""}
              </span>
            )}
            {expanded ? (
              <ChevronUp size={12} style={{ color: T.textMuted }} />
            ) : (
              <ChevronDown size={12} style={{ color: T.textMuted }} />
            )}
          </div>
        </div>

        {expanded && (
          <div
            style={{
              padding: "8px 10px",
              borderTop: `1px solid ${T.borderLight}`,
              background: "#0f172a",
              color: "#e2e8f0",
            }}
          >
            {tool.parameters && (
              <div style={{ marginBottom: "6px" }}>
                <div
                  style={{
                    fontSize: "0.64rem",
                    color: "#94a3b8",
                    fontFamily: "monospace",
                    marginBottom: "3px",
                    fontWeight: 600,
                  }}
                >
                  PARAMETERS:
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: "6px 8px",
                    borderRadius: "5px",
                    background: "#1e293b",
                    color: "#38bdf8",
                    fontSize: "0.68rem",
                    fontFamily: "ui-monospace, monospace",
                    overflowX: "auto",
                  }}
                >
                  {JSON.stringify(tool.parameters, null, 2)}
                </pre>
              </div>
            )}

            {tool.result && (
              <div>
                <div
                  style={{
                    fontSize: "0.64rem",
                    color: "#94a3b8",
                    fontFamily: "monospace",
                    marginBottom: "3px",
                    fontWeight: 600,
                  }}
                >
                  OUTPUT:
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: "6px 8px",
                    borderRadius: "5px",
                    background: "#1e293b",
                    color: "#f8fafc",
                    fontSize: "0.68rem",
                    fontFamily: "ui-monospace, monospace",
                    overflowX: "auto",
                    maxHeight: "180px",
                  }}
                >
                  {typeof tool.result === "string"
                    ? tool.result
                    : JSON.stringify(tool.result, null, 2)}
                </pre>
              </div>
            )}

            {tool.error && (
              <pre
                style={{
                  margin: 0,
                  padding: "6px 8px",
                  borderRadius: "5px",
                  background: "rgba(225, 29, 72, 0.2)",
                  color: "#fca5a5",
                  fontSize: "0.68rem",
                  fontFamily: "ui-monospace, monospace",
                  overflowX: "auto",
                }}
              >
                {tool.error}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Render Main Panel ──────────────────────────────────────────────────

  return (
    <>
      {/* ── Floating Launcher Button (Clean Light Pill with Soft Aura) ── */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open Summer Copilot"
        style={{
          position: "fixed",
          bottom: "22px",
          right: "22px",
          zIndex: 9990,
          display: "flex",
          alignItems: "center",
          gap: "9px",
          padding: "8px 16px 8px 10px",
          borderRadius: "9999px",
          background: T.bgCard,
          color: T.text,
          fontWeight: 600,
          fontSize: "0.82rem",
          border: `1px solid ${T.border}`,
          boxShadow:
            "0 10px 25px -3px rgba(79, 70, 229, 0.15), 0 4px 6px -2px rgba(15, 23, 42, 0.05)",
          cursor: "pointer",
          transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <SummerLogo size={22} active={agentState !== "idle"} />
        <span style={{ letterSpacing: "-0.01em" }}>Summer</span>
        <kbd
          style={{
            padding: "1px 5px",
            borderRadius: "4px",
            background: T.bgInset,
            color: T.textSecondary,
            fontSize: "0.65rem",
            fontFamily: "ui-monospace, monospace",
            border: `1px solid ${T.border}`,
          }}
        >
          ⌘K
        </kbd>
      </button>

      {/* ── Agent Drawer (NO BACKDROP BLUR, 100% Crisp Visible Screen) ── */}
      {isOpen && (
        <aside
          ref={drawerRef}
          role="dialog"
          aria-label="Summer DevOps Copilot"
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            maxWidth: "520px",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            background: T.bg,
            backgroundImage: T.auroraMesh,
            borderLeft: `1px solid ${T.border}`,
            boxShadow: T.shadow,
            animation: "drawerSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 18px",
              borderBottom: `1px solid ${T.border}`,
              background: "rgba(255, 255, 255, 0.85)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <SummerLogo size={30} active={agentState !== "idle"} />
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "0.92rem",
                    color: T.text,
                    letterSpacing: "-0.015em",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>Summer</span>
                  <span
                    style={{
                      fontSize: "0.62rem",
                      padding: "1px 6px",
                      borderRadius: "6px",
                      background: "rgba(79, 70, 229, 0.08)",
                      color: T.accent,
                      fontWeight: 600,
                    }}
                  >
                    Gemini 3.8 Flash
                  </span>
                </div>
                <div style={{ fontSize: "0.68rem", color: T.textSecondary }}>
                  Autonomous Cloud DevOps Copilot
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {isSpeaking && (
                <button
                  type="button"
                  onClick={stopAudio}
                  title="Stop Voice Output"
                  style={{
                    ...iconBtnStyle,
                    background: "rgba(79, 70, 229, 0.1)",
                    color: T.accent,
                    border: `1px solid ${T.borderActive}`,
                  }}
                >
                  <Square size={13} fill="currentColor" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (voiceEnabled) stopAudio();
                  setVoiceEnabled(!voiceEnabled);
                }}
                title={voiceEnabled ? "Mute Voice (Aoede)" : "Enable Voice (Aoede)"}
                style={{
                  ...iconBtnStyle,
                  color: voiceEnabled ? T.accent : T.textMuted,
                  background: voiceEnabled ? "rgba(79, 70, 229, 0.08)" : "transparent",
                }}
              >
                {voiceEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                title="Conversation History"
                style={{
                  ...iconBtnStyle,
                  color: showHistory ? T.accent : T.textSecondary,
                  background: showHistory ? "rgba(79, 70, 229, 0.08)" : "transparent",
                }}
              >
                <History size={15} />
              </button>
              <button
                type="button"
                onClick={startNewChat}
                title="New Chat Session"
                style={{ ...iconBtnStyle, color: T.textSecondary }}
              >
                <Plus size={15} />
              </button>
              <button
                type="button"
                onClick={() => {
                  stopAudio();
                  setIsOpen(false);
                }}
                title="Close Drawer (Esc)"
                style={{ ...iconBtnStyle, color: T.textSecondary }}
              >
                <X size={15} />
              </button>
            </div>
          </header>

          {/* ── Context & Quick Chips ──────────────────────────────── */}
          {!showHistory && agentState === "idle" && (
            <div
              style={{
                padding: "8px 14px",
                borderBottom: `1px solid ${T.borderLight}`,
                background: "rgba(255, 255, 255, 0.7)",
                display: "flex",
                gap: "6px",
                overflowX: "auto",
                whiteSpace: "nowrap",
              }}
            >
              {quickChips.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSendMessage(c.prompt)}
                  disabled={agentState !== "idle"}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "7px",
                    background: T.bgCard,
                    border: `1px solid ${T.border}`,
                    color: T.textSecondary,
                    fontSize: "0.72rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = T.accent;
                    e.currentTarget.style.color = T.accent;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = T.border;
                    e.currentTarget.style.color = T.textSecondary;
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Body Area (Chat Messages with Inline Agent Activity) ─ */}
          {showHistory ? (
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: T.bg }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "12px",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: "0.85rem", color: T.text }}>
                  Saved Sessions
                </span>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: T.accent,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Back to Chat
                </button>
              </div>
              {sessions.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "40px 10px",
                    color: T.textMuted,
                    fontSize: "0.8rem",
                  }}
                >
                  No prior sessions found.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => selectSession(s.id)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        background:
                          currentSessionId === s.id ? "rgba(79, 70, 229, 0.05)" : "#ffffff",
                        border: `1px solid ${
                          currentSessionId === s.id ? T.borderActive : T.border
                        }`,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ overflow: "hidden", flex: 1, marginRight: "8px" }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: "0.78rem",
                            color: T.text,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {s.title || "Session"}
                        </div>
                        <div style={{ fontSize: "0.65rem", color: T.textMuted, marginTop: "2px" }}>
                          {new Date(s.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => deleteSession(s.id, e)}
                        title="Delete session"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: T.textMuted,
                          cursor: "pointer",
                          padding: "4px",
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Chat Messages List with INLINE Coding Agent Experience */
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              {messages.map((m) => {
                const isCurrentActiveTurn =
                  m.id.startsWith("asst-") &&
                  m.id === messages[messages.length - 1]?.id &&
                  agentState !== "idle";

                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: m.role === "user" ? "flex-end" : "flex-start",
                    }}
                  >
                    {m.role === "user" ? (
                      <div
                        style={{
                          maxWidth: "84%",
                          borderRadius: "14px 14px 2px 14px",
                          padding: "10px 14px",
                          fontSize: "0.84rem",
                          lineHeight: 1.55,
                          background: T.accentGradient,
                          color: "#ffffff",
                          boxShadow: "0 4px 14px rgba(79, 70, 229, 0.25)",
                          wordBreak: "break-word",
                        }}
                      >
                        {m.content}
                      </div>
                    ) : (
                      <div
                        style={{
                          maxWidth: "96%",
                          borderRadius: "12px",
                          padding: "14px 16px",
                          fontSize: "0.84rem",
                          background: T.bgCard,
                          border: `1px solid ${T.border}`,
                          boxShadow: T.cardShadow,
                          color: T.text,
                        }}
                      >
                        {/* ── 1. Live Inline Agent Activity Deck (In Chat!) ── */}
                        {isCurrentActiveTurn && (
                          <div
                            style={{
                              marginBottom: "12px",
                              paddingBottom: "10px",
                              borderBottom: `1px solid ${T.borderLight}`,
                            }}
                          >
                            {/* Live Thinking Status Pill */}
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "7px",
                                padding: "4px 10px",
                                borderRadius: "6px",
                                background: "rgba(79, 70, 229, 0.06)",
                                border: `1px solid ${T.borderActive}`,
                                fontSize: "0.74rem",
                                color: T.accent,
                                fontWeight: 600,
                                marginBottom: "8px",
                              }}
                            >
                              <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                              <span>
                                {agentState === "thinking"
                                  ? "Thinking… Inspecting cloud environment"
                                  : "DevOps Agent Executing…"}
                              </span>
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  color: T.textMuted,
                                  fontFamily: "monospace",
                                  marginLeft: "4px",
                                }}
                              >
                                {elapsedSeconds}s
                              </span>
                            </div>

                            {/* Live Steps being executed in this turn */}
                            {activeSteps.length > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "5px",
                                  marginTop: "4px",
                                }}
                              >
                                {activeSteps.map((step) => {
                                  const Icon = getToolIcon(step.toolName);
                                  return (
                                    <div
                                      key={step.id}
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "7px",
                                        padding: "6px 9px",
                                        borderRadius: "6px",
                                        background: T.bgSubtle,
                                        border: `1px solid ${
                                          step.status === "running"
                                            ? T.borderActive
                                            : T.borderLight
                                        }`,
                                        fontSize: "0.73rem",
                                      }}
                                    >
                                      {step.status === "running" ? (
                                        <Loader2
                                          size={11}
                                          style={{
                                            color: T.accent,
                                            animation: "spin 1s linear infinite",
                                          }}
                                        />
                                      ) : step.status === "done" ? (
                                        <CheckCircle2 size={12} style={{ color: T.success }} />
                                      ) : (
                                        <AlertCircle size={12} style={{ color: T.error }} />
                                      )}
                                      {step.toolName && (
                                        <span
                                          style={{
                                            fontFamily: "monospace",
                                            fontWeight: 600,
                                            color: T.accent,
                                            background: T.bgCard,
                                            padding: "1px 5px",
                                            borderRadius: "4px",
                                            border: `1px solid ${T.border}`,
                                          }}
                                        >
                                          {step.toolName}
                                        </span>
                                      )}
                                      <span
                                        style={{
                                          color: T.textSecondary,
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {step.message}
                                      </span>
                                      {step.durationMs !== undefined && (
                                        <span
                                          style={{
                                            marginLeft: "auto",
                                            fontSize: "0.64rem",
                                            color: T.textMuted,
                                            fontFamily: "monospace",
                                          }}
                                        >
                                          {step.durationMs}ms
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── 2. Completed DevOps Tool Activity (Collapsible in message) ── */}
                        {m.toolCalls && m.toolCalls.length > 0 && !isCurrentActiveTurn && (
                          <div
                            style={{
                              marginBottom: "10px",
                              paddingBottom: "8px",
                              borderBottom: `1px solid ${T.borderLight}`,
                            }}
                          >
                            <div
                              style={{
                                fontSize: "0.68rem",
                                fontWeight: 700,
                                color: T.textSecondary,
                                marginBottom: "4px",
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                              }}
                            >
                              <Terminal size={11} style={{ color: T.accent }} />
                              <span>DEVOPS ACTIONS EXECUTED ({m.toolCalls.length})</span>
                            </div>
                            {m.toolCalls.map((t: any, i: number) => (
                              <ToolExecutionCard key={i} tool={t} />
                            ))}
                          </div>
                        )}

                        {/* ── 3. Streaming or Final Assistant Response ── */}
                        {m.content &&
                        m.content.trim().length > 0 &&
                        m.content !== "undefined" ? (
                          <MarkdownView content={m.content} />
                        ) : isCurrentActiveTurn ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              color: T.textMuted,
                              fontSize: "0.78rem",
                              marginTop: "4px",
                            }}
                          >
                            <span>Synthesizing response</span>
                            <span style={{ animation: "summerPulse 1.2s infinite" }}>…</span>
                          </div>
                        ) : null}

                        {/* ── 4. Human Approval Card ── */}
                        {m.pendingAction && (
                          <div style={{ marginTop: "10px" }}>
                            <ApprovalCardInline
                              pendingAction={m.pendingAction}
                              onResolved={(r) => {
                                // Mark action as resolved on this message
                                setMessages((prev) =>
                                  prev.map((msg) =>
                                    msg.id === m.id
                                      ? {
                                          ...msg,
                                          pendingAction: {
                                            ...msg.pendingAction,
                                            resolved: true,
                                            decision: r.success ? "APPROVED" : "REJECTED",
                                          },
                                        }
                                      : msg
                                  )
                                );

                                // Add execution outcome directly into chat UI without re-prompting the AI in a loop
                                const outcomeText = r.success
                                  ? `✔ **${m.pendingAction?.toolName}** executed successfully.\n\n${typeof r.result === "string" ? r.result : (r.result?.message || JSON.stringify(r.result, null, 2))}`
                                  : `✖ Execution rejected or failed for **${m.pendingAction?.toolName}**: ${r.error || "Action cancelled."}`;

                                setMessages((prev) => [
                                  ...prev,
                                  {
                                    id: `res-${Date.now()}`,
                                    role: "assistant",
                                    content: outcomeText,
                                    createdAt: new Date().toISOString(),
                                  },
                                ]);
                              }}
                            />
                          </div>
                        )}

                        {/* ── 5. Message Actions Footer (Replay & Copy) ── */}
                        {!isCurrentActiveTurn && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              gap: "8px",
                              marginTop: "8px",
                              paddingTop: "6px",
                              borderTop: `1px solid ${T.borderLight}`,
                            }}
                          >
                            {m.audioData && (
                              <button
                                type="button"
                                onClick={() => playSpeech(m.audioData)}
                                title="Replay Voice Summary"
                                style={{ ...tinyBtnStyle }}
                              >
                                <Volume2 size={11} />
                                <span>Replay</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => copyMsg(m.id, m.content)}
                              title="Copy response"
                              style={{
                                ...tinyBtnStyle,
                                color: copiedMsgId === m.id ? T.success : T.textMuted,
                              }}
                            >
                              {copiedMsgId === m.id ? <Check size={11} /> : <Copy size={11} />}
                              <span>{copiedMsgId === m.id ? "Copied" : "Copy"}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* ── Input Bar (Elevated Capsule with Soft Aurora Glow) ── */}
          <footer
            style={{
              padding: "12px 16px",
              borderTop: `1px solid ${T.border}`,
              background: "rgba(255, 255, 255, 0.9)",
              backdropFilter: "blur(12px)",
            }}
          >
            {agentState !== "idle" && (
              <button
                type="button"
                onClick={cancelRequest}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "6px",
                  marginBottom: "8px",
                  borderRadius: "8px",
                  background: T.errorBg,
                  border: `1px solid ${T.errorBorder}`,
                  color: T.error,
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <StopCircle size={13} />
                <span>Cancel Request</span>
              </button>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: T.bgCard,
                border: `1px solid ${T.border}`,
                borderRadius: "10px",
                padding: "6px 8px 6px 14px",
                boxShadow:
                  "0 2px 8px rgba(15, 23, 42, 0.04), 0 0 0 1px rgba(79, 70, 229, 0.04)",
                transition: "all 0.15s ease",
              }}
            >
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => {
                  stopAudio();
                  setInputPrompt(e.target.value);
                }}
                placeholder="Ask Summer to deploy, inspect, or diagnose…"
                disabled={agentState !== "idle"}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: T.text,
                  fontSize: "0.84rem",
                  outline: "none",
                }}
              />

              <button
                type="button"
                onClick={toggleMic}
                title={isListening ? "Listening…" : "Voice Input"}
                style={{
                  ...iconBtnStyle,
                  background: isListening ? T.errorBg : "transparent",
                  color: isListening ? T.error : T.textSecondary,
                  border: isListening ? `1px solid ${T.errorBorder}` : "none",
                }}
              >
                {isListening ? <MicOff size={15} /> : <Mic size={15} />}
              </button>

              <button
                type="submit"
                disabled={!inputPrompt.trim() || agentState !== "idle"}
                title="Send Message"
                style={{
                  background:
                    inputPrompt.trim() && agentState === "idle"
                      ? T.accentGradient
                      : T.bgInset,
                  border: "none",
                  borderRadius: "8px",
                  padding: "7px 11px",
                  color:
                    inputPrompt.trim() && agentState === "idle" ? "#ffffff" : T.textMuted,
                  cursor:
                    inputPrompt.trim() && agentState === "idle" ? "pointer" : "not-allowed",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow:
                    inputPrompt.trim() && agentState === "idle"
                      ? "0 2px 8px rgba(79, 70, 229, 0.3)"
                      : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <Send size={13} />
              </button>
            </form>
          </footer>
        </aside>
      )}

      {/* ── Keyframe Animations ─────────────────────────────────────── */}
      <style jsx global>{`
        @keyframes drawerSlideIn {
          from {
            transform: translateX(100%);
            opacity: 0.4;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes summerPulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.6;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.9;
          }
        }
      `}</style>
    </>
  );
}

// ─── Inline Approval Card (Light Mode) ───────────────────────────────────────

function ApprovalCardInline({
  pendingAction,
  onResolved,
}: {
  pendingAction: any;
  onResolved: (result: { success: boolean; error?: string; result?: any }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED" | null>(null);

  async function handleDecision(choice: "APPROVE" | "REJECT") {
    setLoading(true);
    try {
      const res = await agentApi.approveAction({
        actionId: pendingAction.actionId,
        decision: choice,
      });
      setDecision(choice === "APPROVE" ? "APPROVED" : "REJECTED");
      onResolved({ success: res.success, error: res.error, result: res.result });
    } catch (err: any) {
      onResolved({ success: false, error: err.message });
    } finally {
      setLoading(false);
    }
  }

  const isApproved = decision === "APPROVED" || (pendingAction?.resolved && pendingAction?.decision === "APPROVED");
  const isRejected = decision === "REJECTED" || (pendingAction?.resolved && pendingAction?.decision === "REJECTED");

  if (isApproved) {
    return (
      <div
        style={{
          borderRadius: "8px",
          background: "rgba(5, 150, 105, 0.08)",
          border: "1px solid rgba(5, 150, 105, 0.25)",
          padding: "8px 12px",
          fontSize: "0.76rem",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "#059669",
          fontWeight: 600,
        }}
      >
        <Check size={14} /> Approved & Dispatched: {pendingAction.toolName}
      </div>
    );
  }

  if (isRejected) {
    return (
      <div
        style={{
          borderRadius: "8px",
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.25)",
          padding: "8px 12px",
          fontSize: "0.76rem",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "#dc2626",
          fontWeight: 600,
        }}
      >
        <X size={14} /> Action Cancelled: {pendingAction.toolName}
      </div>
    );
  }

  const paramSummary =
    pendingAction.parameters && Object.keys(pendingAction.parameters).length > 0
      ? JSON.stringify(pendingAction.parameters, null, 2)
      : "";

  return (
    <div
      style={{
        borderRadius: "8px",
        background: "rgba(217, 119, 6, 0.06)",
        border: "1px solid rgba(217, 119, 6, 0.25)",
        padding: "12px 14px",
        fontSize: "0.78rem",
        boxShadow: "0 2px 8px rgba(217, 119, 6, 0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginBottom: "6px",
        }}
      >
        <AlertCircle size={14} style={{ color: "#d97706" }} />
        <span style={{ fontWeight: 700, color: "#d97706" }}>Human Approval Required</span>
        <span
          style={{
            fontSize: "0.64rem",
            padding: "1px 6px",
            borderRadius: "6px",
            background: "rgba(217, 119, 6, 0.15)",
            color: "#b45309",
            fontWeight: 700,
          }}
        >
          {pendingAction.riskTier || "TIER_2"}
        </span>
      </div>
      <p style={{ margin: "0 0 8px", color: "#334155", lineHeight: 1.45, fontWeight: 500 }}>
        {pendingAction.explanation || `Approval required before running ${pendingAction.toolName}.`}
      </p>
      <div
        style={{
          display: "block",
          padding: "6px 10px",
          borderRadius: "6px",
          background: T.bgInset,
          color: T.accent,
          fontSize: "0.72rem",
          fontFamily: "monospace",
          marginBottom: "10px",
          border: "1px solid #e2e8f0",
          wordBreak: "break-all",
          whiteSpace: "pre-wrap",
          maxHeight: "120px",
          overflowY: "auto",
        }}
      >
        <strong>{pendingAction.toolName}</strong>
        {paramSummary ? `\n${paramSummary}` : ""}
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          disabled={loading}
          onClick={() => handleDecision("APPROVE")}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            padding: "8px 14px",
            borderRadius: "6px",
            background: "linear-gradient(180deg, #059669, #047857)",
            color: "#ffffff",
            border: "none",
            fontWeight: 600,
            fontSize: "0.78rem",
            cursor: loading ? "not-allowed" : "pointer",
            boxShadow: "0 1px 3px rgba(5, 150, 105, 0.2)",
          }}
        >
          {loading ? (
            <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Check size={14} />
          )}
          Approve & Run
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => handleDecision("REJECT")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            padding: "8px 14px",
            borderRadius: "6px",
            background: T.bgCard,
            color: T.textSecondary,
            border: `1px solid ${T.border}`,
            fontWeight: 600,
            fontSize: "0.78rem",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          <X size={14} /> Reject
        </button>
      </div>
    </div>
  );
}

// ─── Button Styles ──────────────────────────────────────────────────────────

const iconBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  borderRadius: "7px",
  padding: "6px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "all 0.15s ease",
};

const tinyBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#94a3b8",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "4px",
  fontSize: "0.68rem",
  padding: "3px 6px",
  borderRadius: "5px",
  fontWeight: 500,
};
