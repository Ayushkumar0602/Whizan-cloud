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
 * Intelligently generates a natural, concise 1-2 sentence spoken summary for voice narration.
 * Prevents audio cutoffs, eliminates rambling over raw tables, and sounds completely natural.
 */
export async function summarizeForSpokenVoice(rawText: string): Promise<string> {
  const isComplex =
    rawText.includes("|") ||
    rawText.includes("```") ||
    rawText.length > 180 ||
    (rawText.match(/\n[-*]/g) || []).length > 2;

  if (!isComplex) {
    const cleaned = sanitizeForSpeech(rawText);
    return cleaned.length > 0 ? cleaned : "Here is the information you requested.";
  }

  // Fast micro-summarization using gemini-3.5-flash-lite (<800ms)
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
                  text: `You are Summer, a smart and friendly cloud DevOps AI copilot on Whizan Cloud.
Summarize the following cloud response into 1 or 2 natural, conversational spoken sentences for voice narration.
Highlight the primary status, action taken, or outcome concisely and warmly.
Do NOT read tables, markdown pipes, code, or bullet points. Keep it under 35 words.

Response to summarize:
${rawText}`,
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(3500),
      }
    );

    if (res.ok) {
      const data: any = await res.json();
      const summary = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (summary && summary.length > 10) {
        return sanitizeForSpeech(summary);
      }
    }
  } catch (err: any) {
    console.warn("[TTS Summarizer] Fast micro-summary fallback:", err.message);
  }

  // Graceful grammatical sentence boundary extraction (never cut off mid-sentence)
  const cleaned = sanitizeForSpeech(rawText);
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 0) {
    const firstTwo = sentences.slice(0, 2).join(" ").trim();
    if (firstTwo.length > 15) return firstTwo;
  }

  return cleaned.slice(0, 220).trim();
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
 * Synthesizes female audio using gemini-3.8-flash-tts with Aoede prebuilt voice
 * Uses intelligent voice summarization and sticky key rotation
 */
export async function generateSpeechAudio(text: string): Promise<TtsResult> {
  const spokenText = await summarizeForSpokenVoice(text);
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
