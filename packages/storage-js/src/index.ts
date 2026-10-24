// ─── @whizan/storage-js — Main Entry Point ──────────────────────────────────

import { WhizanStorageClient } from "./client.js";

export * from "./types.js";
export * from "./bucket.js";
export * from "./client.js";

/**
 * Creates a new Whizan Cloud Storage client instance with Supabase-level developer experience.
 *
 * @param url Base URL of the Whizan API (e.g. "https://api.whizan.cloud")
 * @param apiKey API Key or JWT token for authentication
 */
export function createClient(url: string, apiKey: string): WhizanStorageClient {
  return new WhizanStorageClient(url, apiKey);
}
