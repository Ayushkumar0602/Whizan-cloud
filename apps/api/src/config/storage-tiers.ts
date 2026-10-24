// ─── Whizan Cloud Storage — Tier Entitlements & Limits Configuration ─────────

export interface StorageTierConfig {
  tier: "HOBBY" | "PROFESSIONAL";
  displayName: string;
  defaultQuotaBytes: bigint;
  maxFileSizeBytes: bigint;
  rateLimitRpm: number;
  dailyCommandsQuota: number;
  maxBuckets: number;
  maxConcurrentUploads: number;
  multipartMaxParts: number;
  presignedUrlTtlSeconds: number;
  allowedPublicBuckets: boolean;
  retentionDays: number;
}

export const STORAGE_TIER_CONFIGS: Record<"HOBBY" | "PROFESSIONAL", StorageTierConfig> = {
  // Tier A: Hobby Plan
  HOBBY: {
    tier: "HOBBY",
    displayName: "Hobby Plan",
    defaultQuotaBytes: 250_000_000n, // Strict 250 MB (decimal standard = 250,000,000 bytes)
    maxFileSizeBytes: 25_000_000n,    // 25 MB max single file size
    rateLimitRpm: 60,                 // 60 requests per minute
    dailyCommandsQuota: 2_000,        // 2,000 commands/day
    maxBuckets: 10,                   // 10 buckets maximum
    maxConcurrentUploads: 3,          // 3 concurrent in-flight uploads
    multipartMaxParts: 20,            // Up to 20 parts
    presignedUrlTtlSeconds: 900,       // 15 minutes
    allowedPublicBuckets: true,
    retentionDays: 365,
  },

  // Tier B: Professional Plan
  PROFESSIONAL: {
    tier: "PROFESSIONAL",
    displayName: "Professional Plan",
    defaultQuotaBytes: 250_000_000n, // Baseline 250 MB (upgradeable/customizable)
    maxFileSizeBytes: 100_000_000n,   // 100 MB max single file size
    rateLimitRpm: 300,                // 300 requests per minute
    dailyCommandsQuota: 50_000,       // 50,000 commands/day
    maxBuckets: 100,                  // 100 buckets
    maxConcurrentUploads: 10,         // 10 concurrent in-flight uploads
    multipartMaxParts: 1_000,         // Up to 1,000 parts
    presignedUrlTtlSeconds: 1800,     // 30 minutes
    allowedPublicBuckets: true,
    retentionDays: 365 * 5,
  },
};

/**
 * Resolves the active storage tier config for a given user subscription tier.
 * Defaults safely to HOBBY (Tier A) if unspecified or unrecognized.
 */
export function getStorageTierConfig(subscriptionTier?: string | null): StorageTierConfig {
  const normalized = (subscriptionTier || "").toUpperCase();
  if (normalized === "PROFESSIONAL" || normalized === "PRO") {
    return STORAGE_TIER_CONFIGS.PROFESSIONAL;
  }
  return STORAGE_TIER_CONFIGS.HOBBY;
}
