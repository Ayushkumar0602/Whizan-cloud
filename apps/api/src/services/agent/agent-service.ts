import { prisma } from "../../lib/prisma.js";
import { checkVmOnline } from "../../lib/vm-status.js";
import { evaluateToolCall } from "./guardrails.js";
import { SUMMER_TOOL_DEFINITIONS, executeAgentTool } from "./tools-registry.js";
import { generateSpeechAudio, shouldGenerateAudio, type TtsResult } from "./tts-service.js";
import { getActiveKey, rotateToNextKey, getKeyCount } from "./key-pool.js";
import { buildSystemPrompt, type PromptContext } from "./prompt-engine.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AgentChatInput {
  userId: string;
  sessionId?: string;
  message: string;
  context?: {
    pathname?: string;
    targetId?: string;
    targetType?: "service" | "project";
  };
  enableTts?: boolean;
}

export type AgentStreamEvent =
  | { type: "session"; sessionId: string }
  | { type: "step"; message: string }
  | { type: "tool_start"; name: string; parameters: any }
  | { type: "tool_result"; name: string; result?: any; error?: string; durationMs: number }
  | { type: "text"; content: string }
  | { type: "hitl"; actionId: string; toolName: string; parameters: any; riskTier: string; explanation: string }
  | { type: "navigate"; path: string; label?: string }
  | { type: "open_url"; url: string }
  | { type: "done"; fullText: string; toolExecutions: any[]; sessionId: string }
  | { type: "audio"; audioBase64?: string; format?: string; spokenText: string; fallbackToBrowserSpeech?: boolean }
  | { type: "error"; message: string };

/** Legacy synchronous response shape (kept for backward compatibility) */
export interface AgentChatResponse {
  sessionId: string;
  message: string;
  toolExecutions: Array<{
    name: string;
    parameters: any;
    result?: any;
    error?: string;
  }>;
  pendingAction?: {
    actionId: string;
    toolName: string;
    parameters: any;
    riskTier: string;
    explanation: string;
  } | null;
  clientAction?: {
    type: "NAVIGATE" | "OPEN_URL";
    path?: string;
    url?: string;
  } | null;
  audio?: TtsResult | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_REACT_TURNS = 6;
const LLM_TIMEOUT_MS = 20000;

const THINKING_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
];

const VM_DEPENDENT = new Set([
  "run_diagnostic_command",
  "restart_service",
  "redeploy_resource",
]);

// ─── Gemini API Call with Model Fallback & Key Rotation ─────────────────────

async function callGeminiWithFallback(payload: any): Promise<any | null> {
  const totalKeys = getKeyCount();

  for (const model of THINKING_MODELS) {
    for (let attempt = 0; attempt < Math.min(totalKeys, 3); attempt++) {
      const key = getActiveKey();
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        });

        if (res.ok) return await res.json();

        if (res.status === 429 || res.status === 401 || res.status === 403) {
          rotateToNextKey(`LLM ${res.status}`);
          continue;
        }

        if (res.status === 503) {
          console.warn(`[Gemini ${model}] 503 — trying next model`);
          break; // move to next model
        }
      } catch (err: any) {
        console.warn(`[Gemini ${model}] Error: ${err.message}`);
        rotateToNextKey("LLM error");
      }
    }
  }

  return null;
}

// ─── Primary SSE Streaming Handler ──────────────────────────────────────────

/**
 * Executes the full ReAct agent loop, emitting fine-grained SSE events
 * at each step so the client can render live execution telemetry.
 */
export async function handleAgentChatStream(
  input: AgentChatInput,
  emit: (event: AgentStreamEvent) => void
): Promise<void> {
  const { userId, message, context, enableTts = true } = input;

  try {
    // ── 1. Session Management ─────────────────────────────────────────────
    let session = input.sessionId
      ? await prisma.agentSession.findFirst({
          where: { id: input.sessionId, userId },
          include: {
            messages: {
              orderBy: { createdAt: "desc" },
              take: 20,
            },
          },
        })
      : null;

    if (!session) {
      const title = message.slice(0, 40) + (message.length > 40 ? "…" : "");
      session = await prisma.agentSession.create({
        data: {
          userId,
          title,
          context: context ? JSON.stringify(context) : undefined,
        },
        include: { messages: true },
      });
    }

    emit({ type: "session", sessionId: session.id });

    // ── 2. Persist User Message ───────────────────────────────────────────
    await prisma.agentMessage.create({
      data: { sessionId: session.id, role: "user", content: message },
    });

    // ── 3. Build Conversation History ─────────────────────────────────────
    const recent = (session.messages || []).slice().reverse();
    const contents: any[] = [];
    for (const m of recent) {
      if (m.role === "user") {
        contents.push({ role: "user", parts: [{ text: m.content }] });
      } else if (m.role === "assistant") {
        contents.push({ role: "model", parts: [{ text: m.content }] });
      }
    }

    // ── 4. Dynamic System Prompt & VM Check ───────────────────────────────
    const vmStatus = await checkVmOnline();
    const promptCtx: PromptContext = {
      vmOnline: vmStatus.vmOnline,
      vmHost: vmStatus.vmHost,
      pathname: context?.pathname,
      targetId: context?.targetId,
      targetType: context?.targetType,
    };
    const systemPrompt = buildSystemPrompt(promptCtx);

    // Enrich current message with lightweight context annotation
    let enriched = message;
    if (context?.pathname) {
      enriched += `\n[Page: ${context.pathname}${context.targetId ? `, Target: ${context.targetId}` : ""}. VM: ${vmStatus.status}]`;
    }
    contents.push({ role: "user", parts: [{ text: enriched }] });

    // Filter tool definitions (hide VM-dependent tools when offline)
    const activeTools = SUMMER_TOOL_DEFINITIONS.filter(
      (t) => vmStatus.vmOnline || !VM_DEPENDENT.has(t.name)
    );

    // ── 5. ReAct Loop ─────────────────────────────────────────────────────
    const toolExecutions: AgentChatResponse["toolExecutions"] = [];
    let finalText = "";

    emit({ type: "step", message: "Analyzing your request…" });

    for (let turn = 0; turn < MAX_REACT_TURNS; turn++) {
      const geminiPayload = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: [
          {
            functionDeclarations: activeTools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            })),
          },
        ],
        generationConfig: { temperature: 0.2 },
      };

      const geminiRes = await callGeminiWithFallback(geminiPayload);

      if (!geminiRes) {
        emit({
          type: "error",
          message: "Unable to reach the AI service right now. Please try again in a moment.",
        });
        finalText = "I encountered a connection issue while processing your request. Please try again.";
        break;
      }

      const candidate = geminiRes.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      // Extract text parts
      const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text);
      if (textParts.length > 0) {
        finalText = textParts.join("\n");
        emit({ type: "text", content: finalText });
      }

      // Extract function calls
      const fnCalls = parts
        .filter((p: any) => p.functionCall)
        .map((p: any) => p.functionCall);

      if (fnCalls.length === 0) {
        break; // LLM finished reasoning
      }

      // Append model turn to history for next iteration
      contents.push({ role: "model", parts });

      // Process each tool call
      const toolResponses: any[] = [];
      let hitlHalted = false;

      for (const call of fnCalls) {
        const { name, args } = call;

        // ── Guardrail Evaluation ────────────────────────────────────────
        const guardrail = await evaluateToolCall(name, args);

        // Tier 3: Blocked
        if (!guardrail.allowed) {
          const error = `BLOCKED BY SECURITY POLICY: ${guardrail.reason}`;
          emit({ type: "tool_result", name, error, durationMs: 0 });
          toolExecutions.push({ name, parameters: args, error });
          toolResponses.push({
            functionResponse: { name, response: { error } },
          });
          continue;
        }

        // Tier 2: HITL Required
        if (guardrail.requiresHitl) {
          const action = await prisma.agentAction.create({
            data: {
              sessionId: session.id,
              toolName: name,
              parameters: args || {},
              riskTier: guardrail.riskTier,
              status: "PENDING",
            },
          });

          const explanation = `I need your approval to execute **${name}**. This action modifies live resources.`;
          emit({
            type: "hitl",
            actionId: action.id,
            toolName: name,
            parameters: args,
            riskTier: guardrail.riskTier,
            explanation,
          });

          toolExecutions.push({
            name,
            parameters: args,
            result: { status: "AWAITING_HUMAN_APPROVAL", actionId: action.id },
          });

          if (!finalText) {
            finalText = `I've prepared the parameters to run **${name}**. Please review and approve below.`;
            emit({ type: "text", content: finalText });
          }

          hitlHalted = true;
          break;
        }

        // Tier 1: Execute immediately
        emit({ type: "tool_start", name, parameters: args || {} });
        const t0 = Date.now();

        const result = await executeAgentTool(name, args || {}, userId);
        const durationMs = Date.now() - t0;

        emit({
          type: "tool_result",
          name,
          result: result.data,
          error: result.error,
          durationMs,
        });

        toolExecutions.push({
          name,
          parameters: args,
          result: result.data,
          error: result.error,
        });

        // Client-side navigation or external URL
        if (result.clientAction?.type === "NAVIGATE") {
          emit({ type: "navigate", path: result.clientAction.path, label: result.data?.label });
        } else if (result.clientAction?.type === "OPEN_URL") {
          emit({ type: "open_url", url: result.clientAction.url });
        }

        toolResponses.push({
          functionResponse: {
            name,
            response: { output: result.data || result.error },
          },
        });
      }

      if (hitlHalted) break;

      // Feed tool observations back for next reasoning turn
      if (toolResponses.length > 0) {
        contents.push({ role: "user", parts: toolResponses });
        if (turn < MAX_REACT_TURNS - 1) {
          emit({ type: "step", message: "Processing results…" });
        }
      }
    }

    // ── 6. Emit Done ──────────────────────────────────────────────────────
    emit({
      type: "done",
      fullText: finalText,
      toolExecutions,
      sessionId: session.id,
    });

    // ── 7. Persist Assistant Message ──────────────────────────────────────
    await prisma.agentMessage.create({
      data: {
        sessionId: session.id,
        role: "assistant",
        content: finalText,
        toolCalls:
          toolExecutions.length > 0 ? JSON.stringify(toolExecutions) : undefined,
      },
    });

    // ── 8. TTS — Generate & Emit Asynchronously (Non-Blocking) ────────────
    if (enableTts && finalText && shouldGenerateAudio(finalText, toolExecutions)) {
      try {
        const audio = await generateSpeechAudio(finalText, toolExecutions);
        if (audio) {
          emit({
            type: "audio",
            audioBase64: audio.audioBase64,
            format: audio.format,
            spokenText: audio.spokenText,
            fallbackToBrowserSpeech: audio.fallbackToBrowserSpeech,
          });
        }
      } catch (err: any) {
        console.warn("[Agent TTS Stream] Failed:", err.message);
      }
    }
  } catch (err: any) {
    console.error("[Agent Stream Error]", err);
    emit({
      type: "error",
      message: err.message || "An unexpected error occurred.",
    });
  }
}

// ─── Legacy Synchronous Handler (Backward Compatibility) ────────────────────

/**
 * Wraps the streaming handler into a single JSON response.
 * Kept for the existing POST /api/agent/chat endpoint.
 */
export async function handleAgentChat(
  input: AgentChatInput
): Promise<AgentChatResponse> {
  const events: AgentStreamEvent[] = [];
  await handleAgentChatStream(input, (evt) => events.push(evt));

  const sessionEvt = events.find((e) => e.type === "session") as Extract<AgentStreamEvent, { type: "session" }> | undefined;
  const doneEvt = events.find((e) => e.type === "done") as Extract<AgentStreamEvent, { type: "done" }> | undefined;
  const hitlEvt = events.find((e) => e.type === "hitl") as Extract<AgentStreamEvent, { type: "hitl" }> | undefined;
  const navEvt = events.find((e) => e.type === "navigate") as Extract<AgentStreamEvent, { type: "navigate" }> | undefined;
  const urlEvt = events.find((e) => e.type === "open_url") as Extract<AgentStreamEvent, { type: "open_url" }> | undefined;
  const audioEvt = events.find((e) => e.type === "audio") as Extract<AgentStreamEvent, { type: "audio" }> | undefined;
  const errorEvt = events.find((e) => e.type === "error") as Extract<AgentStreamEvent, { type: "error" }> | undefined;

  return {
    sessionId: sessionEvt?.sessionId || "",
    message: doneEvt?.fullText || errorEvt?.message || "",
    toolExecutions: doneEvt?.toolExecutions || [],
    pendingAction: hitlEvt
      ? {
          actionId: hitlEvt.actionId,
          toolName: hitlEvt.toolName,
          parameters: hitlEvt.parameters,
          riskTier: hitlEvt.riskTier,
          explanation: hitlEvt.explanation,
        }
      : null,
    clientAction: navEvt
      ? { type: "NAVIGATE" as const, path: navEvt.path }
      : urlEvt
        ? { type: "OPEN_URL" as const, url: urlEvt.url }
        : null,
    audio: audioEvt
      ? {
          success: true,
          audioBase64: audioEvt.audioBase64,
          format: audioEvt.format,
          spokenText: audioEvt.spokenText || "",
          fallbackToBrowserSpeech: audioEvt.fallbackToBrowserSpeech,
        }
      : null,
  };
}

// ─── HITL Action Decision Handler ───────────────────────────────────────────

/**
 * Handles user Human-in-the-Loop decision (Approve / Reject) for a pending action
 */
export async function handleActionDecision(
  actionId: string,
  userId: string,
  decision: "APPROVE" | "REJECT",
  modifiedParameters?: Record<string, any>
): Promise<{ success: boolean; result?: any; error?: string }> {
  const action = await prisma.agentAction.findFirst({
    where: { id: actionId },
    include: { session: true },
  });

  if (!action) {
    return { success: false, error: "Action not found." };
  }

  if (action.session.userId !== userId) {
    return { success: false, error: "Unauthorized." };
  }

  if (action.status !== "PENDING") {
    return { success: false, error: `Action is already ${action.status}.` };
  }

  if (decision === "REJECT") {
    await prisma.agentAction.update({
      where: { id: actionId },
      data: {
        status: "REJECTED",
        decidedAt: new Date(),
        decisionBy: userId,
      },
    });

    await prisma.agentMessage.create({
      data: {
        sessionId: action.sessionId,
        role: "user",
        content: `[User rejected action "${action.toolName}"]`,
      },
    });

    return { success: true, result: { status: "REJECTED" } };
  }

  // User Approved
  const paramsToExecute =
    modifiedParameters || (action.parameters as Record<string, any>);

  const execution = await executeAgentTool(
    action.toolName,
    paramsToExecute,
    userId
  );

  await prisma.agentAction.update({
    where: { id: actionId },
    data: {
      status: execution.success ? "EXECUTED" : "FAILED",
      decidedAt: new Date(),
      decisionBy: userId,
      parameters: paramsToExecute,
      executionResult: execution.data || execution.error,
    },
  });

  await prisma.agentMessage.create({
    data: {
      sessionId: action.sessionId,
      role: "assistant",
      content: execution.success
        ? `✔ Successfully executed **${action.toolName}**:\n${JSON.stringify(execution.data, null, 2)}`
        : `✖ Failed to execute **${action.toolName}**: ${execution.error}`,
      toolResult: execution.data || execution.error,
    },
  });

  return {
    success: execution.success,
    result: execution.data,
    error: execution.error,
  };
}
