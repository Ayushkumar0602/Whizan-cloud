// ─── Whizan Cloud CLI — Local Auth & Config Manager ──────────────────────────

import fs from "fs/promises";
import path from "path";
import os from "os";

export interface WhizanLocalConfig {
  apiUrl: string;
  apiKey?: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".whizan");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

/**
 * Load saved credentials from ~/.whizan/config.json
 */
export async function loadConfig(): Promise<WhizanLocalConfig> {
  const config: WhizanLocalConfig = {
    apiUrl: process.env.WHIZAN_API_URL || "https://whizan-cloud-service.onrender.com",
    apiKey: process.env.WHIZAN_API_KEY,
  };

  try {
    const data = await fs.readFile(CONFIG_PATH, "utf8");
    const saved = JSON.parse(data);
    if (saved.apiUrl && !process.env.WHIZAN_API_URL) config.apiUrl = saved.apiUrl;
    if (saved.apiKey && !process.env.WHIZAN_API_KEY) config.apiKey = saved.apiKey;
  } catch {
    // No config file yet — first-time user
  }

  return config;
}

/**
 * Save credentials to ~/.whizan/config.json
 * Creates ~/.whizan/ directory if it doesn't exist
 */
export async function saveConfig(updates: Partial<WhizanLocalConfig>): Promise<void> {
  let existing: WhizanLocalConfig = {
    apiUrl: "https://whizan-cloud-service.onrender.com",
  };

  try {
    const data = await fs.readFile(CONFIG_PATH, "utf8");
    existing = JSON.parse(data);
  } catch {
    // File doesn't exist yet
  }

  const merged = { ...existing, ...updates };

  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf8");
  } catch (err: any) {
    if (err.code === "EACCES") {
      throw new Error(
        `Permission denied writing to ${CONFIG_DIR}. Check file permissions on your home directory.`
      );
    }
    throw err;
  }
}

/**
 * Remove saved credentials
 */
export async function clearConfig(): Promise<void> {
  try {
    await fs.unlink(CONFIG_PATH);
  } catch {
    // Already removed or never existed
  }
}

/**
 * Get the config file path for display purposes
 */
export function getConfigPath(): string {
  return CONFIG_PATH;
}
