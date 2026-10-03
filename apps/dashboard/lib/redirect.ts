/**
 * Validates and sanitizes a redirect target URL.
 * Ensures the target is an internal relative path starting with a single '/'
 * and prevents open-redirect vulnerabilities (e.g. '//evil.com' or 'https://evil.com').
 */
export function getSafeRedirectUrl(
  target: string | null | undefined,
  defaultUrl: string = "/dashboard"
): string {
  if (!target) return defaultUrl;

  try {
    const decoded = decodeURIComponent(target).trim();

    // Must start with a single "/" and NOT "//" or "/\"
    if (
      decoded.startsWith("/") &&
      !decoded.startsWith("//") &&
      !decoded.startsWith("/\\")
    ) {
      // Must not contain a protocol scheme (e.g. /https://...)
      if (!decoded.includes("://")) {
        return decoded;
      }
    }
  } catch {
    // Fall back to default if decode fails
  }

  return defaultUrl;
}
