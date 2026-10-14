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
  Bot,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  Clock,
  Terminal,
  Server,
  Database,
  Layers,
} from "lucide-react";
import { agentApi, type AgentChatResponse } from "@/lib/api";
import { AudioWave } from "./audio-wave";
import { ToolChip } from "./tool-chip";
import { ApprovalCard } from "./approval-card";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: any[];
  pendingAction?: AgentChatResponse["pendingAction"];
  createdAt: string;
}

export function SummerDrawer() {
  const router = useRouter();
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; createdAt: string }>>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome-msg",
      role: "assistant",
      content:
        "Hi! I'm **Summer**, your autonomous DevOps and cloud assistant for Whizan Cloud Service.\n\nI can inspect containers, diagnose errors, configure environment variables, provision databases, and deploy services. How can I help you today?",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);

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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Load user sessions on mount
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

  // Audio Playback Handler
  function playSpeech(audioData?: AgentChatResponse["audio"]) {
    if (!voiceEnabled || !audioData) return;

    // Stop prior audio
    stopAudio();

    if (audioData.audioBase64) {
      try {
        const audioUrl = `data:${audioData.format || "audio/mp3"};base64,${audioData.audioBase64}`;
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
      utterance.pitch = 1.05;
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

  // Speech Recognition (Dictation)
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
      stopAudio(); // Stop audio playback when speaking
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
        createdAt: new Date().toISOString(),
      };

      setMessages([...newMessages, assistantMsg]);

      // Play speech
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

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* FLOATING TRIGGER BUTTON (Always visible at bottom right)           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="summer-floating-trigger"
        aria-label="Open Summer Agent"
        style={{
          position: "fixed",
          bottom: "22px",
          right: "22px",
          zIndex: 9990,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 18px",
          borderRadius: "9999px",
          background: "linear-gradient(135deg, rgba(0, 240, 255, 0.9), rgba(168, 85, 247, 0.95))",
          color: "#050811",
          fontWeight: 700,
          fontSize: "0.85rem",
          border: "1px solid rgba(255, 255, 255, 0.3)",
          boxShadow: "0 8px 32px rgba(0, 240, 255, 0.35), 0 2px 10px rgba(168, 85, 247, 0.4)",
          cursor: "pointer",
          backdropFilter: "blur(12px)",
          transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <Sparkles size={16} className="text-black animate-pulse" />
        <span>Ask Summer</span>
        <span
          style={{
            fontSize: "0.68rem",
            padding: "2px 6px",
            borderRadius: "6px",
            background: "rgba(0, 0, 0, 0.25)",
            color: "#ffffff",
            fontWeight: 600,
            marginLeft: "2px",
          }}
        >
          ⌘K
        </span>
      </button>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SLIDE-OVER DRAWER                                                   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isOpen && (
        <aside
          role="dialog"
          aria-label="Summer DevOps Copilot"
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            maxWidth: "480px",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            background: "linear-gradient(180deg, #090e17 0%, #050811 100%)",
            borderLeft: "1px solid rgba(0, 240, 255, 0.2)",
            boxShadow: "-12px 0 48px rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(24px)",
          }}
        >
          {/* Header */}
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 18px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              background: "rgba(255, 255, 255, 0.02)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #00f0ff, #a855f7)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#050811",
                  boxShadow: "0 0 16px rgba(0, 240, 255, 0.4)",
                }}
              >
                <Sparkles size={16} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "#f8fafc" }}>
                    Summer
                  </span>
                  <span
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      padding: "1px 6px",
                      borderRadius: "10px",
                      background: "rgba(0, 240, 255, 0.15)",
                      color: "#00f0ff",
                      border: "1px solid rgba(0, 240, 255, 0.3)",
                    }}
                  >
                    3.8 Flash
                  </span>
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--muted, #94a3b8)" }}>
                  Autonomous DevOps Copilot
                </div>
              </div>
            </div>

            {/* Audio Wave & Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <AudioWave isSpeaking={isSpeaking} />

              <button
                type="button"
                onClick={() => {
                  if (voiceEnabled) stopAudio();
                  setVoiceEnabled(!voiceEnabled);
                }}
                title={voiceEnabled ? "Mute Voice" : "Enable Live Audio"}
                style={{
                  background: voiceEnabled ? "rgba(0, 240, 255, 0.1)" : "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "6px",
                  padding: "6px",
                  color: voiceEnabled ? "#00f0ff" : "#64748b",
                  cursor: "pointer",
                }}
              >
                {voiceEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>

              <button
                type="button"
                onClick={startNewChat}
                title="New Chat"
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "6px",
                  padding: "6px",
                  color: "#cbd5e1",
                  cursor: "pointer",
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
                title="Close"
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "6px",
                  padding: "6px",
                  color: "#cbd5e1",
                  cursor: "pointer",
                }}
              >
                <X size={15} />
              </button>
            </div>
          </header>

          {/* Quick Action Suggestion Chips */}
          <div
            style={{
              padding: "8px 16px",
              background: "rgba(255, 255, 255, 0.015)",
              borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
              display: "flex",
              gap: "6px",
              overflowX: "auto",
              whiteSpace: "nowrap",
            }}
          >
            {[
              { label: "⚡ Fleet Status", prompt: "Show fleet status and VM health" },
              { label: "🔍 Unhealthy Services", prompt: "Inspect any unhealthy or restarting services" },
              { label: "📜 Deployment Logs", prompt: "Check latest deployment build logs" },
              { label: "💡 Capabilities", prompt: "What actions can you execute on my behalf?" },
            ].map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(chip.prompt)}
                disabled={isLoading}
                style={{
                  padding: "4px 10px",
                  borderRadius: "14px",
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  color: "#94a3b8",
                  fontSize: "0.72rem",
                  cursor: isLoading ? "not-allowed" : "pointer",
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Message Timeline */}
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
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: m.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "88%",
                    borderRadius: "12px",
                    padding: "10px 14px",
                    fontSize: "0.84rem",
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    background:
                      m.role === "user"
                        ? "linear-gradient(135deg, rgba(0, 240, 255, 0.2), rgba(168, 85, 247, 0.25))"
                        : "rgba(255, 255, 255, 0.04)",
                    color: m.role === "user" ? "#f1f5f9" : "#e2e8f0",
                    border:
                      m.role === "user"
                        ? "1px solid rgba(0, 240, 255, 0.3)"
                        : "1px solid rgba(255, 255, 255, 0.07)",
                  }}
                >
                  {m.content}
                </div>

                {/* Render Tool Executions if any */}
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div style={{ width: "88%", marginTop: "4px" }}>
                    {m.toolCalls.map((t, idx) => (
                      <ToolChip key={idx} tool={t} />
                    ))}
                  </div>
                )}

                {/* Render Pending Action Approval Card if any */}
                {m.pendingAction && (
                  <div style={{ width: "88%", marginTop: "6px" }}>
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
            ))}

            {isLoading && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  background: "rgba(255, 255, 255, 0.03)",
                  width: "fit-content",
                  fontSize: "0.8rem",
                  color: "#a855f7",
                }}
              >
                <Sparkles size={14} className="animate-spin" />
                <span>Summer is thinking & analyzing...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Input Box */}
          <footer
            style={{
              padding: "14px 16px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              background: "rgba(5, 8, 17, 0.8)",
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
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "12px",
                padding: "6px 8px 6px 12px",
              }}
            >
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => {
                  stopAudio();
                  setInputPrompt(e.target.value);
                }}
                placeholder="Ask Summer anything... (e.g. check logs, deploy, restart)"
                disabled={isLoading}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: "#f8fafc",
                  fontSize: "0.84rem",
                  outline: "none",
                }}
              />

              {/* Mic Dictation */}
              <button
                type="button"
                onClick={toggleSpeechRecognition}
                title={isListening ? "Listening..." : "Dictate with Voice"}
                style={{
                  background: isListening ? "rgba(239, 68, 68, 0.2)" : "transparent",
                  border: isListening ? "1px solid rgba(239, 68, 68, 0.5)" : "none",
                  borderRadius: "6px",
                  padding: "6px",
                  color: isListening ? "#ef4444" : "#94a3b8",
                  cursor: "pointer",
                }}
              >
                {isListening ? <MicOff size={15} /> : <Mic size={15} />}
              </button>

              {/* Submit */}
              <button
                type="submit"
                disabled={!inputPrompt.trim() || isLoading}
                title="Send"
                style={{
                  background: inputPrompt.trim() && !isLoading
                    ? "linear-gradient(135deg, #00f0ff, #a855f7)"
                    : "rgba(255, 255, 255, 0.08)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  color: inputPrompt.trim() && !isLoading ? "#050811" : "#64748b",
                  cursor: inputPrompt.trim() && !isLoading ? "pointer" : "not-allowed",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Send size={14} />
              </button>
            </form>
          </footer>
        </aside>
      )}
    </>
  );
}
