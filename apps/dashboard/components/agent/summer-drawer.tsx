"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Sparkles,
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
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { agentApi, type AgentChatResponse } from "@/lib/api";
import { MarkdownView } from "./markdown-view";

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

// ─── Design Tokens ──────────────────────────────────────────────────────────

const T = {
  bg: "#0c0f1a",
  bgSecondary: "#131726",
  bgGlass: "rgba(19, 23, 38, 0.92)",
  bgCard: "rgba(255, 255, 255, 0.03)",
  bgCardHover: "rgba(255, 255, 255, 0.06)",
  border: "rgba(255, 255, 255, 0.06)",
  borderActive: "rgba(99, 102, 241, 0.3)",
  text: "#f1f5f9",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accent: "#6366f1",
  accentCyan: "#22d3ee",
  accentGradient: "linear-gradient(135deg, #6366f1, #22d3ee)",
  success: "#10b981",
  error: "#ef4444",
  warning: "#f59e0b",
  radius: "12px",
  shadow: "0 24px 80px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255,255,255,0.05)",
};

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
      content: "Hi! I'm **Summer**, your autonomous DevOps copilot for Whizan Cloud.\n\nI can inspect containers, diagnose logs, configure environments, provision databases, and deploy services. How can I help?",
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

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechRecRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ─── Persistence & Keyboard Shortcuts ───────────────────────────────────

  useEffect(() => {
    try {
      if (localStorage.getItem("whizan_summer_is_open") === "true") setIsOpen(true);
      const sid = localStorage.getItem("whizan_summer_session_id");
      if (sid) {
        setCurrentSessionId(sid);
        agentApi.getSession(sid).then((data) => {
          if (data?.messages?.length > 0) {
            setMessages(data.messages.map((m: any) => ({
              id: m.id, role: m.role, content: m.content,
              toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
              createdAt: m.createdAt,
            })));
          }
        }).catch(() => {});
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("whizan_summer_is_open", isOpen ? "true" : "false"); } catch {}
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
    try { setSessions((await agentApi.getSessions()) || []); } catch {}
  }

  async function selectSession(sid: string) {
    try {
      const data = await agentApi.getSession(sid);
      if (data?.messages) {
        setCurrentSessionId(sid);
        setMessages(data.messages.map((m: any) => ({
          id: m.id, role: m.role, content: m.content,
          toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
          createdAt: m.createdAt,
        })));
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
    try { localStorage.removeItem("whizan_summer_session_id"); } catch {}
    setMessages([{
      id: `welcome-${Date.now()}`,
      role: "assistant",
      content: "Starting fresh! What would you like to inspect, deploy, or configure?",
      createdAt: new Date().toISOString(),
    }]);
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
        audio.onerror = () => { setIsSpeaking(false); fallbackSpeech(audioData.spokenText); };
        audio.play().catch(() => fallbackSpeech(audioData.spokenText));
      } catch { fallbackSpeech(audioData.spokenText); }
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
      const fem = voices.find((v) => v.lang.startsWith("en") && (v.name.includes("Samantha") || v.name.includes("Female") || v.name.includes("Karen") || v.name.includes("Victoria")));
      if (fem) utt.voice = fem;
      utt.onstart = () => setIsSpeaking(true);
      utt.onend = () => setIsSpeaking(false);
      utt.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utt);
    } catch { setIsSpeaking(false); }
  }

  function stopAudio() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }

  // ─── Voice Dictation ────────────────────────────────────────────────────

  function toggleMic() {
    if (isListening) { speechRecRef.current?.stop(); setIsListening(false); return; }
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    try {
      stopAudio();
      const rec = new SR();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";
      rec.onstart = () => setIsListening(true);
      rec.onend = () => setIsListening(false);
      rec.onerror = () => setIsListening(false);
      rec.onresult = (e: any) => {
        const t = e.results?.[0]?.[0]?.transcript;
        if (t) setInputPrompt((p) => (p ? `${p} ${t}` : t));
      };
      speechRecRef.current = rec;
      rec.start();
    } catch { setIsListening(false); }
  }

  // ─── Cancel In-Flight Request ───────────────────────────────────────────

  function cancelRequest() {
    abortRef.current?.abort();
    abortRef.current = null;
    setAgentState("idle");
    setActiveSteps([]);
  }

  // ─── SSE Streaming Send ─────────────────────────────────────────────────

  async function handleSendMessage(textToSend?: string) {
    const text = (textToSend || inputPrompt).trim();
    if (!text || agentState !== "idle") return;

    stopAudio();
    setInputPrompt("");
    setActiveSteps([]);
    setAgentState("thinking");

    const userMsgId = `usr-${Date.now()}`;
    const updatedMessages: Message[] = [
      ...messages,
      { id: userMsgId, role: "user", content: text, createdAt: new Date().toISOString() },
    ];
    setMessages(updatedMessages);

    const abortController = new AbortController();
    abortRef.current = abortController;

    const assistantMsgId = `ast-${Date.now()}`;
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
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop()!;

        for (const chunk of chunks) {
          if (!chunk.startsWith("data: ")) continue;
          let event: any;
          try { event = JSON.parse(chunk.slice(6)); } catch { continue; }

          switch (event.type) {
            case "session":
              if (!currentSessionId && event.sessionId) {
                setCurrentSessionId(event.sessionId);
                loadSessions();
              }
              break;

            case "step": {
              const step: ActiveStep = {
                id: `step-${Date.now()}-${Math.random()}`,
                message: event.message,
                status: "running",
              };
              collectedSteps.push(step);
              setActiveSteps([...collectedSteps]);
              setAgentState("executing");
              break;
            }

            case "tool_start": {
              const step: ActiveStep = {
                id: `tool-${event.name}-${Date.now()}`,
                message: `Calling ${event.name}…`,
                status: "running",
                toolName: event.name,
              };
              collectedSteps.push(step);
              setActiveSteps([...collectedSteps]);
              setAgentState("executing");
              break;
            }

            case "tool_result": {
              const idx = collectedSteps.findIndex(
                (s) => s.toolName === event.name && s.status === "running"
              );
              if (idx >= 0) {
                collectedSteps[idx] = {
                  ...collectedSteps[idx],
                  status: event.error ? "error" : "done",
                  durationMs: event.durationMs,
                  toolResult: event.result,
                  toolError: event.error,
                };
                setActiveSteps([...collectedSteps]);
              }
              toolCalls.push({
                name: event.name,
                parameters: {},
                result: event.result,
                error: event.error,
              });
              break;
            }

            case "text":
              assistantText = event.content;
              setAgentState("streaming");
              // Update or create assistant message
              setMessages((prev) => {
                const exists = prev.find((m) => m.id === assistantMsgId);
                if (exists) {
                  return prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, content: assistantText } : m
                  );
                }
                return [
                  ...prev,
                  {
                    id: assistantMsgId,
                    role: "assistant" as const,
                    content: assistantText,
                    createdAt: new Date().toISOString(),
                  },
                ];
              });
              break;

            case "hitl":
              pendingAction = {
                actionId: event.actionId,
                toolName: event.toolName,
                parameters: event.parameters,
                riskTier: event.riskTier,
                explanation: event.explanation,
              };
              break;

            case "navigate":
              try { localStorage.setItem("whizan_summer_is_open", "true"); } catch {}
              router.push(event.path);
              break;

            case "open_url":
              window.open(event.url, "_blank");
              break;

            case "done":
              assistantText = event.fullText || assistantText;
              toolCalls = event.toolExecutions || toolCalls;
              // Mark all running steps as done
              collectedSteps.forEach((s) => { if (s.status === "running") s.status = "done"; });
              setActiveSteps([...collectedSteps]);
              break;

            case "audio":
              audioData = event;
              break;

            case "error":
              assistantText = assistantText || event.message;
              collectedSteps.forEach((s) => { if (s.status === "running") s.status = "error"; });
              setActiveSteps([...collectedSteps]);
              break;
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        assistantText = assistantText || "Request cancelled.";
      } else if (!streamSucceeded) {
        // ── Fallback: SSE stream failed (CORS, 404, not deployed yet) ──
        // Seamlessly fall back to the legacy synchronous /chat endpoint
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

          // Synthesize events from the synchronous response
          if (!currentSessionId && res.sessionId) {
            setCurrentSessionId(res.sessionId);
            loadSessions();
          }

          assistantText = res.message || "";
          toolCalls = res.toolExecutions || [];
          pendingAction = res.pendingAction || null;
          audioData = res.audio || null;

          // Synthesize step telemetry from tool executions
          collectedSteps[0].status = "done";
          for (const t of toolCalls) {
            collectedSteps.push({
              id: `tool-fb-${t.name}`,
              message: `Called ${t.name}`,
              status: t.error ? "error" : "done",
              toolName: t.name,
            });
          }
          setActiveSteps([...collectedSteps]);

          // Handle navigation
          if (res.clientAction?.type === "NAVIGATE" && res.clientAction.path) {
            try { localStorage.setItem("whizan_summer_is_open", "true"); } catch {}
            router.push(res.clientAction.path);
          } else if (res.clientAction?.type === "OPEN_URL" && res.clientAction.url) {
            window.open(res.clientAction.url, "_blank");
          }
        } catch (fallbackErr: any) {
          assistantText = assistantText || `Connection error: ${fallbackErr.message}`;
        }
      } else {
        assistantText = assistantText || `Stream error: ${err.message}`;
      }
    }

    // Final message update
    setMessages((prev) => {
      const exists = prev.find((m) => m.id === assistantMsgId);
      const finalMsg: Message = {
        id: assistantMsgId,
        role: "assistant",
        content: assistantText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        pendingAction,
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

    // Play audio only after stream completes
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
    if (p.includes("/services")) {
      return [
        { label: "List Services", prompt: "List all my backend services with their status" },
        { label: "Check Logs", prompt: "Show latest deployment logs for my services" },
        { label: "Fleet Health", prompt: "Give me a full fleet health overview" },
      ];
    }
    if (p.includes("/databases")) {
      return [
        { label: "List Databases", prompt: "List all my provisioned databases" },
        { label: "Fleet Health", prompt: "Fleet overview with database status" },
      ];
    }
    if (p.includes("/functions")) {
      return [
        { label: "Edge Functions", prompt: "List all my edge functions and endpoints" },
        { label: "Fleet Health", prompt: "Fleet overview" },
      ];
    }
    if (p.includes("/cron")) {
      return [
        { label: "Cron Jobs", prompt: "List all my cron jobs and their last status" },
        { label: "Fleet Health", prompt: "Fleet overview" },
      ];
    }
    return [
      { label: "Fleet Health", prompt: "Give me a full fleet health overview" },
      { label: "Build Logs", prompt: "Show latest deployment build logs" },
      { label: "Diagnostics", prompt: "Inspect any unhealthy or restarting containers" },
    ];
  })();

  // ─── Inline Step Tracker ────────────────────────────────────────────────

  function renderStepTracker() {
    if (activeSteps.length === 0 && agentState === "idle") return null;

    return (
      <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: "4px" }}>
        {activeSteps.map((step) => (
          <div
            key={step.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "5px 10px",
              borderRadius: "8px",
              background: T.bgCard,
              fontSize: "0.75rem",
              color: T.textSecondary,
              transition: "all 0.2s ease",
            }}
          >
            {step.status === "running" && (
              <Loader2 size={12} style={{ color: T.accent, animation: "spin 1s linear infinite" }} />
            )}
            {step.status === "done" && <CheckCircle2 size={12} style={{ color: T.success }} />}
            {step.status === "error" && <AlertCircle size={12} style={{ color: T.error }} />}
            <span style={{ flex: 1 }}>{step.message}</span>
            {step.durationMs !== undefined && (
              <span style={{ fontSize: "0.65rem", color: T.textMuted }}>
                {step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}
              </span>
            )}
          </div>
        ))}
        {agentState === "thinking" && activeSteps.length === 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "5px 10px",
              borderRadius: "8px",
              background: T.bgCard,
              fontSize: "0.75rem",
              color: T.accent,
            }}
          >
            <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
            <span>Summer is thinking…</span>
          </div>
        )}
      </div>
    );
  }

  // ─── Inline Tool Chip ───────────────────────────────────────────────────

  function ToolChipInline({ tool }: { tool: any }) {
    const [expanded, setExpanded] = useState(false);
    const isErr = !!tool.error;
    return (
      <div style={{ margin: "4px 0", borderRadius: "8px", background: T.bgSecondary, border: `1px solid ${isErr ? "rgba(239,68,68,0.2)" : T.border}`, overflow: "hidden", fontSize: "0.75rem" }}>
        <div
          onClick={() => setExpanded(!expanded)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", cursor: "pointer", userSelect: "none" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Terminal size={11} style={{ color: isErr ? T.error : T.accent }} />
            <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600, color: T.text }}>{tool.name}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {isErr ? (
              <span style={{ fontSize: "0.65rem", fontWeight: 600, color: T.error, background: "rgba(239,68,68,0.1)", padding: "1px 6px", borderRadius: "8px" }}>Blocked</span>
            ) : (
              <span style={{ fontSize: "0.65rem", fontWeight: 600, color: T.success, background: "rgba(16,185,129,0.1)", padding: "1px 6px", borderRadius: "8px" }}>Done</span>
            )}
            {expanded ? <ChevronUp size={12} style={{ color: T.textMuted }} /> : <ChevronDown size={12} style={{ color: T.textMuted }} />}
          </div>
        </div>
        {expanded && (
          <div style={{ padding: "8px 10px", borderTop: `1px solid ${T.border}`, background: T.bg }}>
            {tool.result && (
              <pre style={{ margin: 0, padding: "6px 8px", borderRadius: "6px", background: T.bgSecondary, color: T.textSecondary, fontSize: "0.7rem", fontFamily: "ui-monospace, monospace", overflowX: "auto", maxHeight: "160px", border: `1px solid ${T.border}` }}>
                {typeof tool.result === "string" ? tool.result : JSON.stringify(tool.result, null, 2)}
              </pre>
            )}
            {tool.error && (
              <pre style={{ margin: 0, padding: "6px 8px", borderRadius: "6px", background: "rgba(239,68,68,0.05)", color: "#fca5a5", fontSize: "0.7rem", fontFamily: "ui-monospace, monospace", overflowX: "auto", border: "1px solid rgba(239,68,68,0.15)" }}>
                {tool.error}
              </pre>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open Summer Copilot"
        style={{
          position: "fixed", bottom: "20px", right: "20px", zIndex: 9990,
          display: "flex", alignItems: "center", gap: "8px",
          padding: "8px 16px", borderRadius: "9999px",
          background: T.bg, color: T.text,
          fontWeight: 600, fontSize: "0.82rem",
          border: `1px solid ${T.border}`,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(99, 102, 241, 0.15)",
          cursor: "pointer", backdropFilter: "blur(16px)",
          transition: "all 0.2s ease",
        }}
      >
        <div style={{
          width: "20px", height: "20px", borderRadius: "50%",
          background: T.accentGradient,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 12px rgba(99, 102, 241, 0.4)",
        }}>
          <Sparkles size={11} color="#fff" />
        </div>
        <span>Summer</span>
        <kbd style={{
          padding: "1px 5px", borderRadius: "4px",
          background: "rgba(255,255,255,0.08)", color: T.textMuted,
          fontSize: "0.65rem", fontFamily: "ui-monospace, monospace",
          border: `1px solid ${T.border}`,
        }}>⌘K</kbd>
      </button>

      {/* Drawer Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => { stopAudio(); setIsOpen(false); }}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0, 0, 0, 0.4)",
              backdropFilter: "blur(6px)",
              zIndex: 9998,
            }}
          />

          <aside
            role="dialog"
            aria-label="Summer DevOps Copilot"
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0,
              width: "100%", maxWidth: "480px", zIndex: 9999,
              display: "flex", flexDirection: "column",
              background: T.bg,
              borderLeft: `1px solid ${T.border}`,
              boxShadow: T.shadow,
              animation: "drawerSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* ── Header ─────────────────────────────────────────────── */}
            <header style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: `1px solid ${T.border}`,
              background: T.bgSecondary,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: "30px", height: "30px", borderRadius: "8px",
                  background: T.accentGradient,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 2px 8px rgba(99, 102, 241, 0.3)",
                }}>
                  <Sparkles size={15} color="#fff" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", color: T.text }}>Summer</div>
                  <div style={{ fontSize: "0.68rem", color: T.textMuted }}>DevOps Copilot</div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                {isSpeaking && (
                  <button type="button" onClick={stopAudio} title="Stop Voice"
                    style={{ ...iconBtnStyle, background: "rgba(99,102,241,0.15)", color: T.accent, border: `1px solid ${T.borderActive}` }}>
                    <Square size={12} fill="currentColor" />
                  </button>
                )}
                <button type="button" onClick={() => { if (voiceEnabled) stopAudio(); setVoiceEnabled(!voiceEnabled); }}
                  title={voiceEnabled ? "Mute Voice" : "Enable Voice"}
                  style={{ ...iconBtnStyle, color: voiceEnabled ? T.accent : T.textMuted, background: voiceEnabled ? "rgba(99,102,241,0.1)" : "transparent" }}>
                  {voiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                </button>
                <button type="button" onClick={() => setShowHistory(!showHistory)} title="History"
                  style={{ ...iconBtnStyle, color: showHistory ? T.text : T.textMuted, background: showHistory ? "rgba(255,255,255,0.08)" : "transparent" }}>
                  <History size={14} />
                </button>
                <button type="button" onClick={startNewChat} title="New Chat"
                  style={{ ...iconBtnStyle, color: T.textMuted }}>
                  <Plus size={14} />
                </button>
                <button type="button" onClick={() => { stopAudio(); setIsOpen(false); }} title="Close"
                  style={{ ...iconBtnStyle, color: T.textMuted }}>
                  <X size={14} />
                </button>
              </div>
            </header>

            {/* ── Quick Chips (only when idle) ────────────────────────── */}
            {!showHistory && agentState === "idle" && (
              <div style={{
                padding: "8px 14px",
                borderBottom: `1px solid ${T.border}`,
                display: "flex", gap: "6px", overflowX: "auto", whiteSpace: "nowrap",
              }}>
                {quickChips.map((c, i) => (
                  <button key={i} type="button" onClick={() => handleSendMessage(c.prompt)}
                    disabled={agentState !== "idle"}
                    style={{
                      padding: "4px 10px", borderRadius: "8px",
                      background: T.bgCard, border: `1px solid ${T.border}`,
                      color: T.textSecondary, fontSize: "0.72rem", fontWeight: 500,
                      cursor: "pointer", whiteSpace: "nowrap",
                      transition: "all 0.15s ease",
                    }}>
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            {/* ── Live Step Tracker ───────────────────────────────────── */}
            {agentState !== "idle" && renderStepTracker()}

            {/* ── Body ───────────────────────────────────────────────── */}
            {showHistory ? (
              <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: T.bg }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.85rem", color: T.text }}>History</span>
                  <button type="button" onClick={() => setShowHistory(false)}
                    style={{ background: "transparent", border: "none", color: T.accent, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}>
                    Back
                  </button>
                </div>
                {sessions.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 10px", color: T.textMuted, fontSize: "0.8rem" }}>
                    No conversations yet.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {sessions.map((s) => (
                      <div key={s.id} onClick={() => selectSession(s.id)}
                        style={{
                          padding: "10px 12px", borderRadius: "8px",
                          background: currentSessionId === s.id ? "rgba(99,102,241,0.08)" : T.bgCard,
                          border: `1px solid ${currentSessionId === s.id ? T.borderActive : T.border}`,
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
                          transition: "all 0.15s ease",
                        }}>
                        <div style={{ overflow: "hidden", flex: 1, marginRight: "8px" }}>
                          <div style={{ fontWeight: 600, fontSize: "0.78rem", color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.title || "Conversation"}
                          </div>
                          <div style={{ fontSize: "0.65rem", color: T.textMuted, marginTop: "2px" }}>
                            {new Date(s.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <button type="button" onClick={(e) => deleteSession(s.id, e)} title="Delete"
                          style={{ background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", padding: "4px" }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Chat Messages */
              <div style={{
                flex: 1, overflowY: "auto", padding: "14px",
                display: "flex", flexDirection: "column", gap: "10px",
                background: T.bg,
              }}>
                {messages.map((m) => (
                  <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                    {m.role === "user" ? (
                      <div style={{
                        maxWidth: "82%", borderRadius: "12px 12px 2px 12px",
                        padding: "10px 14px", fontSize: "0.82rem", lineHeight: 1.55,
                        background: T.accentGradient, color: "#fff",
                        boxShadow: "0 2px 12px rgba(99, 102, 241, 0.2)",
                        wordBreak: "break-word",
                      }}>
                        {m.content}
                      </div>
                    ) : (
                      <div style={{
                        maxWidth: "94%", borderRadius: "10px",
                        padding: "10px 14px", fontSize: "0.82rem",
                        background: T.bgSecondary, border: `1px solid ${T.border}`,
                        color: T.text,
                      }}>
                        <MarkdownView content={m.content} />

                        {/* Tool calls */}
                        {m.toolCalls && m.toolCalls.length > 0 && (
                          <div style={{ marginTop: "8px", borderTop: `1px solid ${T.border}`, paddingTop: "6px" }}>
                            {m.toolCalls.map((t: any, i: number) => (
                              <ToolChipInline key={i} tool={t} />
                            ))}
                          </div>
                        )}

                        {/* HITL Approval */}
                        {m.pendingAction && (
                          <div style={{ marginTop: "8px" }}>
                            <ApprovalCardInline
                              pendingAction={m.pendingAction}
                              onResolved={(r) => handleSendMessage(
                                r.success
                                  ? `Confirmed: Approved execution of ${m.pendingAction?.toolName}.`
                                  : `Rejected execution: ${r.error || "Cancelled"}.`
                              )}
                            />
                          </div>
                        )}

                        {/* Message footer: copy + replay voice */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", marginTop: "6px", paddingTop: "4px", borderTop: `1px solid ${T.border}` }}>
                          {m.audioData && (
                            <button type="button" onClick={() => playSpeech(m.audioData)} title="Replay Voice"
                              style={{ ...tinyBtnStyle }}>
                              <Volume2 size={11} />
                              <span>Replay</span>
                            </button>
                          )}
                          <button type="button" onClick={() => copyMsg(m.id, m.content)} title="Copy"
                            style={{ ...tinyBtnStyle, color: copiedMsgId === m.id ? T.success : T.textMuted }}>
                            {copiedMsgId === m.id ? <Check size={11} /> : <Copy size={11} />}
                            <span>{copiedMsgId === m.id ? "Copied" : "Copy"}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* ── Input Area ─────────────────────────────────────────── */}
            <footer style={{ padding: "12px 14px", borderTop: `1px solid ${T.border}`, background: T.bgSecondary }}>
              {agentState !== "idle" && (
                <button type="button" onClick={cancelRequest}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                    gap: "6px", padding: "6px", marginBottom: "8px",
                    borderRadius: "8px", background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.2)", color: T.error,
                    fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                  }}>
                  <StopCircle size={13} />
                  <span>Cancel Request</span>
                </button>
              )}
              <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: T.bgCard, border: `1px solid ${T.border}`,
                  borderRadius: "10px", padding: "5px 6px 5px 12px",
                  transition: "border-color 0.15s ease",
                }}>
                <input
                  type="text"
                  value={inputPrompt}
                  onChange={(e) => { stopAudio(); setInputPrompt(e.target.value); }}
                  placeholder="Ask Summer…"
                  disabled={agentState !== "idle"}
                  style={{
                    flex: 1, background: "transparent", border: "none",
                    color: T.text, fontSize: "0.82rem", outline: "none",
                  }}
                />
                <button type="button" onClick={toggleMic}
                  title={isListening ? "Listening…" : "Voice Input"}
                  style={{
                    ...iconBtnStyle,
                    background: isListening ? "rgba(239,68,68,0.15)" : "transparent",
                    color: isListening ? T.error : T.textMuted,
                    border: isListening ? "1px solid rgba(239,68,68,0.3)" : "none",
                  }}>
                  {isListening ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
                <button type="submit"
                  disabled={!inputPrompt.trim() || agentState !== "idle"}
                  title="Send"
                  style={{
                    background: inputPrompt.trim() && agentState === "idle" ? T.accentGradient : "rgba(255,255,255,0.05)",
                    border: "none", borderRadius: "8px",
                    padding: "7px 10px",
                    color: inputPrompt.trim() && agentState === "idle" ? "#fff" : T.textMuted,
                    cursor: inputPrompt.trim() && agentState === "idle" ? "pointer" : "not-allowed",
                    fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.15s ease",
                  }}>
                  <Send size={13} />
                </button>
              </form>
            </footer>
          </aside>
        </>
      )}

      {/* ── Keyframe Animations ─────────────────────────────────────── */}
      <style jsx global>{`
        @keyframes drawerSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

// ─── Inline Approval Card ─────────────────────────────────────────────────

function ApprovalCardInline({ pendingAction, onResolved }: {
  pendingAction: any;
  onResolved: (result: { success: boolean; error?: string }) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleDecision(decision: "APPROVE" | "REJECT") {
    setLoading(true);
    try {
      const res = await agentApi.approveAction({ actionId: pendingAction.actionId, decision });
      onResolved({ success: res.success, error: res.error });
    } catch (err: any) {
      onResolved({ success: false, error: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      borderRadius: "8px", background: "rgba(245, 158, 11, 0.06)",
      border: "1px solid rgba(245, 158, 11, 0.15)", padding: "10px 12px",
      fontSize: "0.78rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
        <AlertCircle size={13} style={{ color: T.warning }} />
        <span style={{ fontWeight: 700, color: T.warning }}>Approval Required</span>
        <span style={{ fontSize: "0.65rem", padding: "1px 6px", borderRadius: "8px", background: "rgba(245,158,11,0.1)", color: T.warning, fontWeight: 600 }}>
          {pendingAction.riskTier}
        </span>
      </div>
      <p style={{ margin: "0 0 8px", color: T.textSecondary, lineHeight: 1.4 }}>{pendingAction.explanation}</p>
      <code style={{ display: "block", padding: "4px 8px", borderRadius: "6px", background: T.bg, color: T.accent, fontSize: "0.72rem", fontFamily: "monospace", marginBottom: "8px" }}>
        {pendingAction.toolName}
      </code>
      <div style={{ display: "flex", gap: "8px" }}>
        <button type="button" disabled={loading} onClick={() => handleDecision("APPROVE")}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
            padding: "6px 12px", borderRadius: "6px",
            background: "linear-gradient(180deg, #059669, #047857)", color: "#fff",
            border: "none", fontWeight: 600, fontSize: "0.75rem", cursor: loading ? "not-allowed" : "pointer",
          }}>
          {loading ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={12} />}
          Approve
        </button>
        <button type="button" disabled={loading} onClick={() => handleDecision("REJECT")}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
            padding: "6px 12px", borderRadius: "6px",
            background: T.bgCard, color: T.textSecondary,
            border: `1px solid ${T.border}`, fontWeight: 600, fontSize: "0.75rem", cursor: loading ? "not-allowed" : "pointer",
          }}>
          <X size={12} /> Reject
        </button>
      </div>
    </div>
  );
}

// ─── Shared Styles ──────────────────────────────────────────────────────────

const iconBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  borderRadius: "6px",
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
  color: T.textMuted,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "3px",
  fontSize: "0.65rem",
  padding: "2px 4px",
  borderRadius: "4px",
};
