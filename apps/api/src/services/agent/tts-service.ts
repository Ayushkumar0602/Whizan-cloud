import { getActiveKey, rotateToNextKey, getKeyCount } from "./key-pool.js";

export interface TtsResult {
  success: boolean;
  audioBase64?: string;
  format?: string;
  spokenText: string;
  error?: string;
  fallbackToBrowserSpeech?: boolean;
}

/**
 * Clean up text for natural spoken narration (removes markdown tables, raw URLs, code blocks)
 * Keeps screen text unchanged while formatting voice output
 */
export function sanitizeForSpeech(rawText: string): string {
  return rawText
    // Remove markdown code blocks
    .replace(/```[\s\S]*?```/g, "Code block omitted.")
    // Remove markdown inline code
    .replace(/`([^`]+)`/g, "$1")
    // Remove markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove markdown image embeds ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    // Remove markdown headers
    .replace(/#{1,6}\s+/g, "")
    // Remove bold/italics
    .replace(/[*_]{1,3}/g, "")
    // Remove markdown tables
    .replace(/\|[^\n]+\|\n\|[-:| ]+\|\n(?:\|[^\n]+\|\n)*/g, "A detailed summary table is displayed on your screen. ")
    // Remove list dashes
    .replace(/^\s*[-*]\s+/gm, "")
    // Remove excessive newlines
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Intelligently generates a descriptive, natural spoken overview explaining what was done and the final result.
 * Avoids raw table pipes and code blocks while providing clear, comprehensive verbal context.
 */
export async function summarizeForSpokenVoice(rawText: string, toolExecutions?: any[]): Promise<string> {
  const isComplex =
    rawText.includes("|") ||
    rawText.includes("```") ||
    rawText.length > 200 ||
    (rawText.match(/\n[-*]/g) || []).length > 2 ||
    (toolExecutions && toolExecutions.length > 0);

  const toolsRan = toolExecutions && toolExecutions.length > 0
    ? toolExecutions.map((t: any) => t.name || t.tool || "tool").join(", ")
    : "none";

  if (!isComplex) {
    const cleaned = sanitizeForSpeech(rawText);
    return cleaned.length > 0 ? cleaned : "Here is the information you requested.";
  }

  // Micro-summarization using gemini-3.5-flash-lite (<800ms)
  try {
    const key = getActiveKey();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are Summer, an expert DevOps AI on Whizan Cloud.
Generate a short, information-full, and concise spoken summary for voice narration.
- Briefly mention what diagnostic actions or tools you executed (if any).
- Directly state the key outcome, health status, or core answer with high information density.
- Keep it natural, conversational, and concise (exactly 2 to 3 crisp sentences, under 55 words).
- Do NOT read raw code, markdown table pipes, json brackets, URLs, or hashes.
- Speak in complete, fluid sentences suitable for voice narration.

Tools executed: ${toolsRan}

Full response:
${rawText}`,
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(4000),
      }
    );

    if (res.ok) {
      const data: any = await res.json();
      const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (summary && summary.length > 15) {
        return sanitizeForSpeech(summary);
      }
    }
  } catch (err: any) {
    console.warn("[TTS Summarizer] Micro-summary fallback:", err.message);
  }

  // Graceful grammatical sentence boundary extraction (2-3 sentences, never cut off mid-sentence)
  const cleaned = sanitizeForSpeech(rawText);
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 0) {
    const conciseSlice = sentences.slice(0, 3).join(" ").trim();
    if (conciseSlice.length > 25) return conciseSlice;
  }

  return cleaned.slice(0, 240).trim();
}

/**
 * Enriches spoken text with natural vocal cues, emotional empathy, warmth, or excitement.
 * This is ONLY sent to the TTS speech model; the on-screen text remains completely clean.
 */
export function buildExpressiveVocalPrompt(spokenText: string): string {
  const lower = spokenText.toLowerCase();
  let emotionDirection = "[warmly, friendly, with a pleasant natural cadence]";

  if (
    lower.includes("error") ||
    lower.includes("blocked") ||
    lower.includes("failed") ||
    lower.includes("warning") ||
    lower.includes("unhealthy") ||
    lower.includes("issue")
  ) {
    emotionDirection = "[softly, with genuine empathy and reassuring care] <short pause>";
  } else if (
    lower.includes("success") ||
    lower.includes("active") ||
    lower.includes("healthy") ||
    lower.includes("deployed") ||
    lower.includes("ready") ||
    lower.includes("great news") ||
    lower.includes("online")
  ) {
    emotionDirection = "[brightly, with genuine excitement and warmth] <short pause>";
  } else if (
    lower.includes("approve") ||
    lower.includes("confirm") ||
    lower.includes("verification") ||
    lower.includes("review") ||
    lower.includes("parameters")
  ) {
    emotionDirection = "[attentive, calm, clear and helpful] <short pause>";
  }

  return `${emotionDirection} ${spokenText} <short pause>`;
}

/**
 * Determines whether TTS audio should be generated for this response.
 * Prevents audio on simple acknowledgments, navigations, HITL prompts, and short follow-ups.
 * Only substantive task completion summaries get voiced.
 */
export function shouldGenerateAudio(text: string, toolExecutions?: any[]): boolean {
  if (!text) return false;

  // Don't speak very short acknowledgments
  if (text.length < 50) return false;

  const lower = text.toLowerCase();

  // Don't speak navigation confirmations
  if (lower.includes("navigating to") && text.length < 120) return false;

  // Don't speak HITL approval prompts (the user needs to read and decide)
  if (
    (lower.includes("approve") || lower.includes("confirm")) &&
    (lower.includes("review") || lower.includes("parameters"))
  ) {
    return false;
  }

  // Don't speak if it's just a follow-up question
  if (lower.endsWith("?") && text.length < 100) return false;

  // Don't speak simple one-liners with no tool executions
  if (!toolExecutions?.length && text.length < 80) return false;

  // Speak substantive task completions, fleet overviews, diagnostic results
  return true;
}

/**
 * Synthesizes female audio using gemini-3.8-flash-tts with Aoede prebuilt voice
 * Uses intelligent voice summarization and sticky key rotation
 */
export async function generateSpeechAudio(text: string, toolExecutions?: any[]): Promise<TtsResult> {
  const spokenText = await summarizeForSpokenVoice(text, toolExecutions);
  if (!spokenText) {
    return { success: false, spokenText: "", error: "No text to speak" };
  }

  // Prepend emotional voice acting directions (for female voice synthesis only)
  const expressiveVocalPrompt = buildExpressiveVocalPrompt(spokenText);

  const ttsModels = ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-2.5-flash-preview-tts"];
  const totalKeys = getKeyCount();

  for (const model of ttsModels) {
    for (let attempt = 0; attempt < Math.min(totalKeys, 4); attempt++) {
      const key = getActiveKey();

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: expressiveVocalPrompt }],
              },
            ],
            generationConfig: {
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    // Aoede: Premium natural female voice
                    voiceName: "Aoede",
                  },
                },
              },
            },
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (res.ok) {
          const data: any = await res.json();
          const audioPart = data?.candidates?.[0]?.content?.parts?.find(
            (p: any) => p?.inlineData?.mimeType?.startsWith("audio/")
          );

          if (audioPart?.inlineData?.data) {
            // SUCCESS! Current key remains sticky.
            return {
              success: true,
              audioBase64: audioPart.inlineData.data,
              format: audioPart.inlineData.mimeType || "audio/wav",
              spokenText,
              fallbackToBrowserSpeech: false,
            };
          }
        }

        // If rate-limited or auth error, rotate to next key and stick with it
        if (res.status === 429 || res.status === 401 || res.status === 403) {
          rotateToNextKey(`TTS response HTTP ${res.status}`);
          continue;
        }

        // If model unavailable, move to next model
        if (res.status === 503) {
          break;
        }
      } catch (err: any) {
        console.warn(`[Gemini TTS ${model}] Key failed:`, err.message);
        rotateToNextKey(`TTS error: ${err.message}`);
      }
    }
  }

  // Gracefully fallback to browser native SpeechSynthesis with female voice
  return {
    success: true,
    spokenText,
    fallbackToBrowserSpeech: true,
  };
}
