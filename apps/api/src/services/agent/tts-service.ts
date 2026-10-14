function getGeminiKeys(): string[] {
  const primaryKey = process.env.GEMINI_API_KEY || "AIzaSyDdFPyvtBbofucXU2GvPlLY_yICBZxM76Y";
  const keys = [
    "AIzaSyDdFPyvtBbofucXU2GvPlLY_yICBZxM76Y",
    primaryKey,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ].filter(Boolean) as string[];

  return Array.from(new Set(keys));
}

let keyCursor = 0;

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
 * Synthesizes audio using gemini-3.8-flash-tts
 */
export async function generateSpeechAudio(text: string): Promise<TtsResult> {
  const spokenText = sanitizeForSpeech(text);
  if (!spokenText) {
    return { success: false, spokenText: "", error: "No text to speak" };
  }

  const keys = getGeminiKeys();
  if (keys.length === 0) {
    return {
      success: true,
      spokenText,
      fallbackToBrowserSpeech: true,
    };
  }

  const ttsModels = ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-2.5-flash-preview-tts"];

  for (const model of ttsModels) {
    for (let i = 0; i < Math.min(keys.length, 3); i++) {
      const key = keys[keyCursor % keys.length];
      keyCursor++;

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: spokenText }],
              },
            ],
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          continue;
        }

        const data: any = await res.json();
        const audioPart = data?.candidates?.[0]?.content?.parts?.find(
          (p: any) => p?.inlineData?.mimeType?.startsWith("audio/")
        );

        if (audioPart?.inlineData?.data) {
          return {
            success: true,
            audioBase64: audioPart.inlineData.data,
            format: audioPart.inlineData.mimeType || "audio/mp3",
            spokenText,
            fallbackToBrowserSpeech: false,
          };
        }
      } catch (err: any) {
        console.warn(`[Gemini TTS ${model}] Attempt failed:`, err.message);
      }
    }
  }

  // Gracefully fallback to browser native SpeechSynthesis
  return {
    success: true,
    spokenText,
    fallbackToBrowserSpeech: true,
  };
}
