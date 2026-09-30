import crypto from "crypto";

export const ROOT_ADMIN_EMAIL = "aj0892829122@gmail.com";

export const IAM_ROLES = [
  "ROOT_ADMIN",
  "ADMIN",
  "DEVOPS_ADMIN",
  "SUPPORT_ADMIN",
  "USER",
] as const;

export type IamRole = typeof IAM_ROLES[number];

/**
 * Checks if a user is the primary platform Root Admin (Super Admin).
 * Root Admin has irrevocable full system control.
 */
export function isRootAdmin(user: { email?: string; role?: string } | null | undefined): boolean {
  if (!user) return false;
  if (user.email && user.email.toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase()) return true;
  if (user.role?.toUpperCase() === "ROOT_ADMIN") return true;
  return false;
}

/**
 * Checks if a user is a Platform Administrator (at any administrative tier).
 */
export function isUserAdmin(user: { email?: string; role?: string; id?: string } | null | undefined): boolean {
  if (!user) return false;
  if (isRootAdmin(user)) return true;

  const role = user.role?.toUpperCase();
  if (role === "ADMIN" || role === "ROOT_ADMIN" || role === "DEVOPS_ADMIN" || role === "SUPPORT_ADMIN") {
    return true;
  }

  // Environment-configured admin emails
  const rawAdminEmails = process.env.ADMIN_EMAILS || "";
  const adminEmails = rawAdminEmails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (user.email && adminEmails.includes(user.email.toLowerCase())) {
    return true;
  }

  // Local development fallback
  if (process.env.NODE_ENV !== "production" && (user.id === "local-dev-user" || user.email === "dev@localhost")) {
    return true;
  }

  return false;
}

/**
 * Checks if an administrator has a specific IAM capability
 */
export function hasAdminPermission(
  user: { role?: string; iamPermissions?: string | null; email?: string } | null | undefined,
  permission: string
): boolean {
  if (!user) return false;
  if (isRootAdmin(user) || user.role === "ROOT_ADMIN" || user.role === "ADMIN") return true;
  if (!user.iamPermissions || user.iamPermissions === "all") return true;

  const perms = user.iamPermissions.split(",").map((p) => p.trim());
  return perms.includes(permission) || perms.includes("all");
}

/**
 * Git Ref and Branch Validation
 * Rejects branch names containing shell metacharacters or leading dashes (flag injection)
 */
export const SAFE_GIT_REF_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._\-\/]*$/;

export function isValidGitBranch(branch: string): boolean {
  if (!branch || typeof branch !== "string") return false;
  const trimmed = branch.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return false;
  if (trimmed.startsWith("-") || trimmed.includes("..") || trimmed.endsWith(".lock")) return false;
  return SAFE_GIT_REF_REGEX.test(trimmed);
}

/**
 * Slug validation: Must be alphanumeric with hyphens, cannot start or end with a hyphen
 */
export const SAFE_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== "string") return false;
  return SAFE_SLUG_REGEX.test(slug.trim());
}

/**
 * SSRF & Private Network IP Prevention
 * Verifies if a hostname/IP points to loopback, link-local, cloud metadata, or private RFC1918 subnets.
 */
export function isPrivateOrLoopbackHost(hostname: string): boolean {
  if (!hostname) return true;
  const lower = hostname.toLowerCase().trim();

  // Obvious localnames
  if (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "0.0.0.0" ||
    lower === "::1" ||
    lower === "ip6-localhost" ||
    lower === "ip6-loopback" ||
    lower === "169.254.169.254" || // Cloud Metadata
    lower === "metadata.google.internal"
  ) {
    return true;
  }

  // IPv4 regex patterns for private / link-local / loopback
  // 127.0.0.0/8
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  // 10.0.0.0/8
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  // 172.16.0.0/12
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  // 192.168.0.0/16
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;
  // 169.254.0.0/16 (Link Local)
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(lower)) return true;

  // Hex or decimal encoded representations (e.g. 0x7f000001, 2130706433)
  if (/^0x[0-9a-f]+$/i.test(lower) || /^\d+$/.test(lower)) {
    return true;
  }

  return false;
}

/**
 * Checks if a database connection URL targets a restricted/private host
 */
export function isRestrictedDatabaseUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname;
    return isPrivateOrLoopbackHost(host);
  } catch {
    return true; // Malformed URLs are considered restricted
  }
}

/**
 * Signs an administrative command payload using HMAC-SHA256
 */
export function signAdminPayload(payload: Record<string, any>): Record<string, any> {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "whizan_internal_secret";
  const { sig: _, ...dataToSign } = payload;
  const canonical = JSON.stringify(dataToSign, Object.keys(dataToSign).sort());
  const sig = crypto.createHmac("sha256", secret).update(canonical).digest("hex");
  return { ...dataToSign, sig };
}

/**
 * Verifies an HMAC-SHA256 signature on an administrative command payload
 */
export function verifyAdminPayload(payload: Record<string, any>): boolean {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "whizan_internal_secret";
  if (!payload || typeof payload !== "object" || !payload.sig) {
    return false;
  }
  const { sig, ...dataToSign } = payload;
  const canonical = JSON.stringify(dataToSign, Object.keys(dataToSign).sort());
  const expectedSig = crypto.createHmac("sha256", secret).update(canonical).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"));
  } catch {
    return false;
  }
}
