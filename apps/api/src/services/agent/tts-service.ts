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
  let cleaned = rawText
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
    .replace(/\|[^\n]+\|\n\|[-:| ]+\|\n(?:\|[^\n]+\|\n)*/g, "A summary table has been rendered on your screen. ")
    // Remove excessive newlines
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();

  // If text is excessively long for voice, truncate to first 2-3 sentences (first 320 chars)
  if (cleaned.length > 320) {
    const periodIdx = cleaned.indexOf(".", 200);
    if (periodIdx !== -1 && periodIdx < 350) {
      cleaned = cleaned.slice(0, periodIdx + 1);
    } else {
      cleaned = cleaned.slice(0, 300) + "...";
    }
  }

  return cleaned;
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
 * Uses sticky key rotation: current key is used until it fails, then advances and sticks to the new key.
 */
export async function generateSpeechAudio(text: string): Promise<TtsResult> {
  const spokenText = sanitizeForSpeech(text);
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
