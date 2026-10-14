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
  RotateCcw,
  Radio,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Square,
} from "lucide-react";
import { agentApi, type AgentChatResponse } from "@/lib/api";
import { AudioWave } from "./audio-wave";
import { ToolChip } from "./tool-chip";
import { ApprovalCard } from "./approval-card";
import { MarkdownView } from "./markdown-view";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: any[];
  pendingAction?: AgentChatResponse["pendingAction"];
  audioData?: AgentChatResponse["audio"];
  createdAt: string;
}

export function SummerDrawer() {
  const router = useRouter();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; createdAt: string }>>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome-msg",
      role: "assistant",
      content:
        "Hi! I'm **Summer**, your autonomous DevOps and cloud assistant for Whizan Cloud Service.\n\nI can inspect live containers, diagnose error logs, configure environment variables, provision databases, and deploy services. How can I assist you today?",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechRecognitionRef = useRef<any>(null);

  // Keyboard shortcut listener (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (!showHistory) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, showHistory]);

  // Load user sessions when opened
  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen]);

  async function loadSessions() {
    try {
      const data = await agentApi.getSessions();
      setSessions(data || []);
    } catch {}
  }

  async function selectSession(sessionId: string) {
    try {
      setIsLoading(true);
      const data = await agentApi.getSession(sessionId);
      if (data && data.messages) {
        setCurrentSessionId(sessionId);
        setMessages(
          data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
            createdAt: m.createdAt,
          }))
        );
      }
      setShowHistory(false);
    } catch (err: any) {
      alert("Failed to load session: " + err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteSession(sessionId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this session?")) return;
    try {
      await agentApi.deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentSessionId === sessionId) {
        startNewChat();
      }
    } catch (err: any) {
      alert("Failed to delete session: " + err.message);
    }
  }

  // Audio Playback Handler with Female Aoede Voice
  function playSpeech(audioData?: AgentChatResponse["audio"]) {
    if (!voiceEnabled || !audioData) return;

    stopAudio();

    if (audioData.audioBase64) {
      try {
        const audioUrl = `data:${audioData.format || "audio/wav"};base64,${audioData.audioBase64}`;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onplay = () => setIsSpeaking(true);
        audio.onended = () => setIsSpeaking(false);
        audio.onerror = () => {
          setIsSpeaking(false);
          fallbackSpeech(audioData.spokenText);
        };

        audio.play().catch(() => {
          fallbackSpeech(audioData.spokenText);
        });
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
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.15; // Natural female pitch
      
      // Select female browser voice if available
      const voices = window.speechSynthesis.getVoices();
      const femaleVoice = voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Female") ||
            v.name.includes("Samantha") ||
            v.name.includes("Victoria") ||
            v.name.includes("Karen") ||
            v.name.includes("Zira"))
      );
      if (femaleVoice) {
        utterance.voice = femaleVoice;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } catch {
      setIsSpeaking(false);
    }
  }

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }

  // Voice Dictation
  function toggleSpeechRecognition() {
    if (isListening) {
      speechRecognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    try {
      stopAudio();
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setInputPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  }

  // Send Message
  async function handleSendMessage(textToSend?: string) {
    const text = (textToSend || inputPrompt).trim();
    if (!text || isLoading) return;

    stopAudio();
    setInputPrompt("");

    const userMsgId = `usr-${Date.now()}`;
    const newMessages: Message[] = [
      ...messages,
      {
        id: userMsgId,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      },
    ];

    setMessages(newMessages);
    setIsLoading(true);

    try {
      const res = await agentApi.chat({
        message: text,
        sessionId: currentSessionId || undefined,
        context: {
          pathname,
        },
        enableTts: voiceEnabled,
      });

      if (!currentSessionId && res.sessionId) {
        setCurrentSessionId(res.sessionId);
        loadSessions();
      }

      const assistantMsg: Message = {
        id: `ast-${Date.now()}`,
        role: "assistant",
        content: res.message,
        toolCalls: res.toolExecutions,
        pendingAction: res.pendingAction,
        audioData: res.audio,
        createdAt: new Date().toISOString(),
      };

      setMessages([...newMessages, assistantMsg]);

      // Play female speech
      if (res.audio) {
        playSpeech(res.audio);
      }

      // Handle Client Navigation Directive
      if (res.clientAction?.type === "NAVIGATE" && res.clientAction.path) {
        router.push(res.clientAction.path);
      } else if (res.clientAction?.type === "OPEN_URL" && res.clientAction.url) {
        window.open(res.clientAction.url, "_blank");
      }
    } catch (err: any) {
      setMessages([
        ...newMessages,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `I ran into an issue connecting to the agent service: ${err.message || "Unknown error"}. Please check your connection and try again.`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function startNewChat() {
    stopAudio();
    setCurrentSessionId(null);
    setShowHistory(false);
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content:
          "Starting a fresh conversation! What would you like to inspect, deploy, or configure on Whizan Cloud?",
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function copyMessage(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  }

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* FLOATING TRIGGER PILL (Production-Grade Obsidian & Micro-Glow)      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="summer-trigger-pill"
        aria-label="Open Summer DevOps Copilot"
        style={{
          position: "fixed",
          bottom: "22px",
          right: "22px",
          zIndex: 9990,
          display: "flex",
          alignItems: "center",
          gap: "9px",
          padding: "8px 16px",
          borderRadius: "9999px",
          background: "#0f172a",
          color: "#ffffff",
          fontWeight: 600,
          fontSize: "0.84rem",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          boxShadow:
            "0 12px 28px -4px rgba(15, 23, 42, 0.28), 0 4px 12px -2px rgba(79, 70, 229, 0.2)",
          cursor: "pointer",
          backdropFilter: "blur(16px)",
          transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            boxShadow: "0 0 10px rgba(79, 70, 229, 0.5)",
          }}
        >
          <Sparkles size={12} />
        </div>
        <span>Ask Summer</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 6px",
            borderRadius: "4px",
            background: "rgba(255, 255, 255, 0.1)",
            color: "#cbd5e1",
            fontSize: "0.68rem",
            fontWeight: 500,
            fontFamily: "ui-monospace, monospace",
            border: "1px solid rgba(255, 255, 255, 0.12)",
          }}
        >
          ⌘K
        </div>
      </button>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SLIDE-OVER DRAWER WITH BACKDROP                                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => {
              stopAudio();
              setIsOpen(false);
            }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15, 23, 42, 0.3)",
              backdropFilter: "blur(4px)",
              zIndex: 9998,
            }}
          />

          <aside
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
              background: "#ffffff",
              borderLeft: "1px solid #e2e8f0",
              boxShadow: "-16px 0 48px rgba(15, 23, 42, 0.12)",
              animation: "drawerSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Header */}
            <header
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                borderBottom: "1px solid #e2e8f0",
                background: "#ffffff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "34px",
                    height: "34px",
                    borderRadius: "8px",
                    background: "linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#ffffff",
                    boxShadow: "0 2px 8px rgba(79, 70, 229, 0.25)",
                  }}
                >
                  <Sparkles size={17} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#0f172a" }}>
                      Summer
                    </span>
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        padding: "1px 7px",
                        borderRadius: "10px",
                        background: "rgba(5, 150, 105, 0.08)",
                        color: "#059669",
                        border: "1px solid rgba(5, 150, 105, 0.2)",
                      }}
                    >
                      <span
                        style={{
                          width: "5px",
                          height: "5px",
                          borderRadius: "50%",
                          background: "#059669",
                        }}
                      />
                      Online
                    </span>
                    <span
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        padding: "1px 6px",
                        borderRadius: "10px",
                        background: "#f1f5f9",
                        color: "#475569",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      Aoede Voice
                    </span>
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                    Autonomous DevOps Copilot • Whizan Cloud
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <AudioWave isSpeaking={isSpeaking} />

                <button
                  type="button"
                  onClick={() => {
                    if (voiceEnabled) stopAudio();
                    setVoiceEnabled(!voiceEnabled);
                  }}
                  title={voiceEnabled ? "Mute Voice (Aoede)" : "Enable Female Speech"}
                  style={{
                    background: voiceEnabled ? "rgba(79, 70, 229, 0.08)" : "#f8fafc",
                    border: "1px solid",
                    borderColor: voiceEnabled ? "rgba(79, 70, 229, 0.2)" : "#e2e8f0",
                    borderRadius: "6px",
                    padding: "6px 8px",
                    color: voiceEnabled ? "#4f46e5" : "#94a3b8",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                  }}
                >
                  {voiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                </button>

                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  title="Past Sessions"
                  style={{
                    background: showHistory ? "#0f172a" : "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    padding: "6px 8px",
                    color: showHistory ? "#ffffff" : "#475569",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                  }}
                >
                  <History size={14} />
                  <span>{sessions.length > 0 ? sessions.length : ""}</span>
                </button>

                <button
                  type="button"
                  onClick={startNewChat}
                  title="New Session"
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    padding: "6px",
                    color: "#475569",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Plus size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    stopAudio();
                    setIsOpen(false);
                  }}
                  title="Close (Esc)"
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "6px",
                    padding: "6px",
                    color: "#64748b",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            </header>

            {/* Scope / Context Bar */}
            <div
              style={{
                padding: "8px 16px",
                background: "#f8fafc",
                borderBottom: "1px solid #f1f5f9",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "0.72rem",
                color: "#64748b",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span>Context:</span>
                <span
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    padding: "1px 6px",
                    borderRadius: "4px",
                    fontFamily: "ui-monospace, monospace",
                    color: "#0f172a",
                    fontWeight: 500,
                  }}
                >
                  {pathname || "/dashboard"}
                </span>
              </div>
              <span style={{ color: "#94a3b8" }}>Ready for commands</span>
            </div>

            {/* Quick Action Suggestion Chips */}
            {!showHistory && (
              <div
                style={{
                  padding: "8px 16px",
                  background: "#ffffff",
                  borderBottom: "1px solid #f1f5f9",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  overflowX: "auto",
                  whiteSpace: "nowrap",
                }}
              >
                {[
                  { label: "⚡ Fleet Health", prompt: "Inspect fleet health, services and VM status" },
                  { label: "📜 Build Logs", prompt: "Show latest deployment build logs" },
                  { label: "🔍 Diagnostic Scan", prompt: "Inspect any unhealthy or restarting containers" },
                  { label: "🛡️ Security Rules", prompt: "Explain the guardrail policies and actions" },
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(chip.prompt)}
                    disabled={isLoading}
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      color: "#475569",
                      fontSize: "0.72rem",
                      fontWeight: 500,
                      cursor: isLoading ? "not-allowed" : "pointer",
                      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)",
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            {/* Main Body: Chat or Sessions History */}
            {showHistory ? (
              /* Sessions History View */
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "16px",
                  background: "#ffffff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#0f172a" }}>
                    Conversation History
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowHistory(false)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#4f46e5",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Back to Chat
                  </button>
                </div>

                {sessions.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 10px", color: "#94a3b8", fontSize: "0.82rem" }}>
                    No previous conversations found.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => selectSession(s.id)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "8px",
                          background: currentSessionId === s.id ? "rgba(79, 70, 229, 0.06)" : "#f8fafc",
                          border: currentSessionId === s.id ? "1px solid #c7d2fe" : "1px solid #e2e8f0",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: "10px" }}>
                          <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "#1e293b", textOverflow: "ellipsis", overflow: "hidden" }}>
                            {s.title || "Conversation"}
                          </div>
                          <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: "2px" }}>
                            {new Date(s.createdAt).toLocaleDateString()} at{" "}
                            {new Date(s.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => deleteSession(s.id, e)}
                          title="Delete Session"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#94a3b8",
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
              /* Message Stream View */
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  background: "#fcfdfe",
                }}
              >
                {messages.map((m) => (
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
                          maxWidth: "85%",
                          borderRadius: "12px 12px 2px 12px",
                          padding: "10px 14px",
                          fontSize: "0.85rem",
                          lineHeight: 1.5,
                          background: "#0f172a",
                          color: "#ffffff",
                          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.08)",
                          wordBreak: "break-word",
                        }}
                      >
                        {m.content}
                      </div>
                    ) : (
                      <div
                        style={{
                          maxWidth: "94%",
                          borderRadius: "10px",
                          padding: "12px 16px",
                          fontSize: "0.85rem",
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                          color: "#1e293b",
                        }}
                      >
                        {/* Message Card Header with Replay & Copy */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "8px",
                            paddingBottom: "6px",
                            borderBottom: "1px solid #f1f5f9",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <div
                              style={{
                                width: "18px",
                                height: "18px",
                                borderRadius: "4px",
                                background: "linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#ffffff",
                              }}
                            >
                              <Sparkles size={10} />
                            </div>
                            <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "#0f172a" }}>
                              Summer
                            </span>
                            <span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>
                              {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {m.audioData && (
                              <button
                                type="button"
                                onClick={() => playSpeech(m.audioData)}
                                title="Replay Voice (Female Aoede)"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "#64748b",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  fontSize: "0.68rem",
                                }}
                              >
                                <Volume2 size={12} />
                                <span>Replay</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => copyMessage(m.id, m.content)}
                              title="Copy response"
                              style={{
                                background: "transparent",
                                border: "none",
                                color: copiedMsgId === m.id ? "#10b981" : "#64748b",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "3px",
                                fontSize: "0.68rem",
                              }}
                            >
                              {copiedMsgId === m.id ? <Check size={12} /> : <Copy size={12} />}
                              <span>{copiedMsgId === m.id ? "Copied" : "Copy"}</span>
                            </button>
                          </div>
                        </div>

                        {/* Rich Markdown Output */}
                        <MarkdownView content={m.content} />

                        {/* Tool Executions */}
                        {m.toolCalls && m.toolCalls.length > 0 && (
                          <div style={{ marginTop: "8px", borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
                            {m.toolCalls.map((t, idx) => (
                              <ToolChip key={idx} tool={t} />
                            ))}
                          </div>
                        )}

                        {/* Human-in-the-Loop Action Approval Card */}
                        {m.pendingAction && (
                          <div style={{ marginTop: "8px" }}>
                            <ApprovalCard
                              pendingAction={m.pendingAction}
                              onResolved={(resolution) => {
                                handleSendMessage(
                                  resolution.success
                                    ? `Confirmed: Approved execution of ${m.pendingAction?.toolName}.`
                                    : `Rejected execution: ${resolution.error || "Action cancelled"}.`
                                );
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      width: "fit-content",
                      fontSize: "0.8rem",
                      color: "#4f46e5",
                      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)",
                    }}
                  >
                    <Loader2 size={14} className="animate-spin text-indigo-600" />
                    <span style={{ fontWeight: 500 }}>Summer is thinking & analyzing...</span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Active Voice Bar (Appears when Summer is speaking) */}
            {isSpeaking && (
              <div
                style={{
                  padding: "6px 14px",
                  background: "linear-gradient(90deg, #4f46e5 0%, #06b6d4 100%)",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "0.74rem",
                  fontWeight: 600,
                  boxShadow: "0 -2px 10px rgba(79, 70, 229, 0.2)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <AudioWave isSpeaking={true} />
                  <span>Summer is speaking (Aoede, Female voice)...</span>
                </div>
                <button
                  type="button"
                  onClick={stopAudio}
                  style={{
                    background: "rgba(0, 0, 0, 0.25)",
                    border: "1px solid rgba(255, 255, 255, 0.25)",
                    color: "#ffffff",
                    borderRadius: "4px",
                    padding: "2px 8px",
                    fontSize: "0.68rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <Square size={10} fill="currentColor" />
                  <span>Stop Voice</span>
                </button>
              </div>
            )}

            {/* Bottom Input Area */}
            <footer
              style={{
                padding: "14px 16px",
                borderTop: "1px solid #e2e8f0",
                background: "#ffffff",
              }}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  padding: "6px 8px 6px 12px",
                  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)",
                  transition: "border-color 0.15s ease",
                }}
              >
                <input
                  type="text"
                  value={inputPrompt}
                  onChange={(e) => {
                    stopAudio();
                    setInputPrompt(e.target.value);
                  }}
                  placeholder="Ask Summer to deploy, check logs, query DB, or inspect..."
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    color: "#0f172a",
                    fontSize: "0.85rem",
                    outline: "none",
                  }}
                />

                {/* Mic Dictation */}
                <button
                  type="button"
                  onClick={toggleSpeechRecognition}
                  title={isListening ? "Listening..." : "Dictate with Voice"}
                  style={{
                    background: isListening ? "#fee2e2" : "transparent",
                    border: isListening ? "1px solid #fca5a5" : "none",
                    borderRadius: "6px",
                    padding: "6px",
                    color: isListening ? "#dc2626" : "#64748b",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                </button>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={!inputPrompt.trim() || isLoading}
                  title="Send (Enter)"
                  style={{
                    background: inputPrompt.trim() && !isLoading ? "#0f172a" : "#e2e8f0",
                    border: "none",
                    borderRadius: "6px",
                    padding: "7px 11px",
                    color: inputPrompt.trim() && !isLoading ? "#ffffff" : "#94a3b8",
                    cursor: inputPrompt.trim() && !isLoading ? "pointer" : "not-allowed",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.15s ease",
                  }}
                >
                  <Send size={13} />
                </button>
              </form>

              <div
                style={{
                  marginTop: "6px",
                  fontSize: "0.68rem",
                  color: "#94a3b8",
                  textAlign: "center",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <span>Voice: <strong>Aoede (Female)</strong></span>
                <span>•</span>
                <span>Press <kbd style={{ padding: "1px 4px", background: "#f1f5f9", borderRadius: "3px", border: "1px solid #e2e8f0" }}>Enter ↵</kbd> to send</span>
                <span>•</span>
                <span><kbd style={{ padding: "1px 4px", background: "#f1f5f9", borderRadius: "3px", border: "1px solid #e2e8f0" }}>⌘K</kbd> to toggle</span>
              </div>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}
