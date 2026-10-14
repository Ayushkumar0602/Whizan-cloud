/**
 * Sticky Gemini API Key Pool with Automatic Failover
 * 
 * Rules:
 * 1. Randomly selects an initial active key at startup.
 * 2. Uses the active key for ALL requests until it fails (401, 403, 429 quota exceeded).
 * 3. On failure, advances to the next key in the pool.
 * 4. Once a fallback key succeeds, that key becomes the new persistent active key until IT fails.
 */

const DEFAULT_POOL = [
  "AIzaSyCevvEyTYzOiMnuTqird0ODBV08pt-w5uM",
  "AQ.Ab8RN6I2CFdE0JixSI58VzNYvnUhzYIKP3zMtyRJywmoeb0Yvg",
  "AQ.Ab8RN6KRI_SewANB8XvOd8W-UfIvnF_fII-YMDPidoxIhCwa8g",
  "AIzaSyDdFPyvtBbofucXU2GvPlLY_yICBZxM76Y",
];

function buildKeyList(): string[] {
  const envKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY_5,
  ].filter(Boolean) as string[];

  // Merge default pool and env keys without duplicates
  const combined = Array.from(new Set([...DEFAULT_POOL, ...envKeys]));
  return combined.filter((k) => typeof k === "string" && k.length > 10);
}

const keyList = buildKeyList();

// Start with a randomly selected key
let currentKeyIndex = Math.floor(Math.random() * (keyList.length || 1));

export function getActiveKey(): string {
  if (keyList.length === 0) return "";
  return keyList[currentKeyIndex % keyList.length];
}

export function rotateToNextKey(reason?: string): string {
  if (keyList.length <= 1) return getActiveKey();
  const oldIndex = currentKeyIndex;
  currentKeyIndex = (currentKeyIndex + 1) % keyList.length;
  console.warn(
    `[Gemini KeyPool] Rotated from key ${oldIndex} to key ${currentKeyIndex}${
      reason ? ` (Reason: ${reason})` : ""
    }. Key ${currentKeyIndex} is now the sticky active key.`
  );
  return getActiveKey();
}

export function getAllKeys(): string[] {
  return [...keyList];
}

export function getKeyCount(): number {
  return keyList.length;
}
