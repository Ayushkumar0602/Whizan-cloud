import { prisma } from "../../lib/prisma.js";
import { checkVmOnline } from "../../lib/vm-status.js";
import { evaluateToolCall } from "./guardrails.js";
import { SUMMER_TOOL_DEFINITIONS, executeAgentTool } from "./tools-registry.js";
import { generateSpeechAudio, type TtsResult } from "./tts-service.js";

function getGeminiKeys(): string[] {
  const primaryKey = process.env.GEMINI_API_KEY || "AIzaSyDdFPyvtBbofucXU2GvPlLY_yICBZxM76Y";
  const keys = [
    "AIzaSyDdFPyvtBbofucXU2GvPlLY_yICBZxM76Y",
    primaryKey,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
    process.env.GEMINI_API_KEY_6,
    process.env.GEMINI_API_KEY_7,
  ].filter(Boolean) as string[];

  return Array.from(new Set(keys));
}

let keyIndex = 0;

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

const SYSTEM_INSTRUCTION = `You are Summer, the brilliant, friendly, and autonomous DevOps Copilot embedded inside Whizan Cloud Service.
Your mission is to help developers manage, deploy, troubleshoot, inspect, and automate their cloud applications in natural language.

Key Principles:
1. Identity: Warm, concise, highly competent, proactive. Speak as Summer ("I checked your payment service...", "I've prepared a plan...").
2. 3-Tier Safety Guardrails:
   - Informational queries (listing services, inspecting logs, reading metrics) execute automatically.
   - Mutating actions (redeploying, changing environment variables, provisioning databases, restarting containers, in-container exec) require Human-in-the-Loop (HITL) approval. Clearly explain what you plan to do.
   - Destructive commands (rm -rf, DROP DATABASE, crypto miners, reverse shells) are strictly prohibited and auto-blocked.
3. VM Offline Autonomy:
   - When the cloud compute worker VM is offline or in maintenance, you STILL remain 100% operational.
   - You can inspect database records, review past logs, configure environment variables, create cron schedules, and design workflows.
   - If the user asks you to redeploy or run live container commands while the VM is offline, explain the maintenance state calmly and offer to stage the action for when the host is resumed.
4. Presentation:
   - Keep answers crisp, clear, and actionable.
   - Use clean Markdown tables or bullet points for structured data.
   - Never output raw passwords or unmasked secret keys.`;

/**
 * Main conversational ReAct loop for Summer
 */
export async function handleAgentChat(input: AgentChatInput): Promise<AgentChatResponse> {
  const { userId, message, context, enableTts = true } = input;

  // 1. Get or create session
  let session = input.sessionId
    ? await prisma.agentSession.findFirst({
        where: { id: input.sessionId, userId },
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 12,
          },
        },
      })
    : null;

  if (!session) {
    const title = message.slice(0, 40) + (message.length > 40 ? "..." : "");
    session = await prisma.agentSession.create({
      data: {
        userId,
        title,
        context: context ? JSON.stringify(context) : undefined,
      },
      include: { messages: true },
    });
  }

  // 2. Save user message to database
  await prisma.agentMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content: message,
    },
  });

  // 3. Format history for Gemini
  const recentMessages = (session.messages || []).slice().reverse();
  const vmStatus = await checkVmOnline();

  const contents: any[] = [];
  for (const m of recentMessages) {
    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    } else if (m.role === "assistant") {
      contents.push({ role: "model", parts: [{ text: m.content }] });
    }
  }

  // Append current user message with context
  let enrichedPrompt = message;
  if (context?.pathname) {
    enrichedPrompt += `\n[Context: User is currently viewing ${context.pathname}${context.targetId ? `, Target: ${context.targetId}` : ""}. Compute VM status: ${vmStatus.status}]`;
  }
  contents.push({ role: "user", parts: [{ text: enrichedPrompt }] });

  const toolExecutions: AgentChatResponse["toolExecutions"] = [];
  let pendingAction: AgentChatResponse["pendingAction"] = null;
  let clientAction: AgentChatResponse["clientAction"] = null;
  let finalAssistantText = "";

  // 4. Multi-turn ReAct Loop (Up to 4 iterations)
  const MAX_TURNS = 4;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const geminiPayload = {
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents,
      tools: [
        {
          functionDeclarations: SUMMER_TOOL_DEFINITIONS.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    };

    const keys = getGeminiKeys();
    let geminiResponse: any = null;
    const thinkingModels = [
      "gemini-3.8-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-3.7-flash",
      "gemini-3.5-flash",
    ];

    for (const model of thinkingModels) {
      if (geminiResponse) break;

      for (let attempt = 0; attempt < Math.min(keys.length, 2); attempt++) {
        const key = keys[keyIndex % keys.length];
        keyIndex++;

        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(geminiPayload),
            signal: AbortSignal.timeout(8000),
          });

          if (res.ok) {
            geminiResponse = await res.json();
            break;
          }

          // If the model is currently overloaded (503) or rate-limited (429), immediately fall back to next model
          if (res.status === 503 || res.status === 429) {
            console.warn(`[Agent LLM ${model}] Model overloaded (${res.status}), transitioning to fallback...`);
            break;
          }
        } catch (err: any) {
          console.warn(`[Agent LLM ${model}] Attempt ${attempt} failed:`, err.message);
        }
      }
    }

    if (!geminiResponse) {
      finalAssistantText = "I encountered a momentary connection timeout while processing your request. Please try asking again.";
      break;
    }

    const candidate = geminiResponse.candidates?.[0];
    const candidateParts = candidate?.content?.parts || [];

    // Extract text
    const textParts = candidateParts.filter((p: any) => p.text).map((p: any) => p.text);
    if (textParts.length > 0) {
      finalAssistantText = textParts.join("\n");
    }

    // Extract function calls
    const functionCalls = candidateParts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

    if (functionCalls.length === 0) {
      // LLM has finished thinking and answered
      break;
    }

    // Add model's turn to conversation history
    contents.push({ role: "model", parts: candidateParts });

    // Handle tool calls
    const toolResponses: any[] = [];
    let hitlHalted = false;

    for (const call of functionCalls) {
      const { name, args } = call;

      // Evaluate guardrails
      const guardrail = await evaluateToolCall(name, args);

      // Tier 3: Blocked
      if (!guardrail.allowed) {
        toolExecutions.push({
          name,
          parameters: args,
          error: `BLOCKED BY SECURITY POLICY: ${guardrail.reason}`,
        });
        toolResponses.push({
          functionResponse: {
            name,
            response: { error: `Command blocked by security guardrails: ${guardrail.reason}` },
          },
        });
        continue;
      }

      // Tier 2: Human-in-the-Loop Required
      if (guardrail.requiresHitl) {
        // Create pending action in database
        const action = await prisma.agentAction.create({
          data: {
            sessionId: session.id,
            toolName: name,
            parameters: args || {},
            riskTier: guardrail.riskTier,
            status: "PENDING",
          },
        });

        pendingAction = {
          actionId: action.id,
          toolName: name,
          parameters: args,
          riskTier: guardrail.riskTier,
          explanation: `I have prepared a plan to execute "${name}". Please review the parameters and confirm.`,
        };

        if (!finalAssistantText) {
          finalAssistantText = `I've prepared the parameters to run **${name}**. Because this action modifies resources, please review the confirmation card below and click **Approve** to proceed.`;
        }

        toolExecutions.push({
          name,
          parameters: args,
          result: { status: "AWAITING_HUMAN_APPROVAL", actionId: action.id },
        });

        hitlHalted = true;
        break;
      }

      // Tier 1: Informational - Execute immediately
      const result = await executeAgentTool(name, args || {}, userId);
      toolExecutions.push({
        name,
        parameters: args,
        result: result.data,
        error: result.error,
      });

      if (result.clientAction) {
        clientAction = result.clientAction;
      }

      toolResponses.push({
        functionResponse: {
          name,
          response: { output: result.data || result.error },
        },
      });
    }

    if (hitlHalted) {
      break;
    }

    // Append tool observations for next turn
    contents.push({ role: "user", parts: toolResponses });
  }

  // 5. Generate Voice Audio (Gemini 3.8 Flash TTS)
  let audioResult: TtsResult | null = null;
  if (enableTts && finalAssistantText) {
    try {
      audioResult = await generateSpeechAudio(finalAssistantText);
    } catch (err: any) {
      console.warn("[Agent TTS] Failed:", err.message);
    }
  }

  // 6. Save assistant message to database
  await prisma.agentMessage.create({
    data: {
      sessionId: session.id,
      role: "assistant",
      content: finalAssistantText,
      toolCalls: toolExecutions.length > 0 ? JSON.stringify(toolExecutions) : undefined,
    },
  });

  return {
    sessionId: session.id,
    message: finalAssistantText,
    toolExecutions,
    pendingAction,
    clientAction,
    audio: audioResult,
  };
}

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
  const paramsToExecute = modifiedParameters || (action.parameters as Record<string, any>);

  const execution = await executeAgentTool(action.toolName, paramsToExecute, userId);

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
