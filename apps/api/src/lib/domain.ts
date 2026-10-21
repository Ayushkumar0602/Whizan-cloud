/**
 * Central domain resolution and sanitization for Whizan Cloud Service.
 * Ensures wildcard customer deployments always resolve to *.whizan.cloud
 * and guards against misconfigurations like BASE_DOMAIN="api.whizan.cloud" or legacy domains.
 */

export function getBaseDomain(): string {
  const raw = (process.env.BASE_DOMAIN || "whizan.cloud").trim().toLowerCase();
  if (
    !raw ||
    raw === "api.whizan.cloud" ||
    raw === "dashboard.whizan.cloud" ||
    raw.startsWith("api.") ||
    raw.startsWith("dashboard.") ||
    raw.includes("onrender.com") ||
    raw.includes("vercel.app") ||
    raw.includes("nip.io")
  ) {
    return "whizan.cloud";
  }
  return raw;
}

export function getDeploymentUrl(slug: string, isWorker = false): string {
  if (isWorker) return "worker://internal";
  const domain = getBaseDomain();
  const proto = domain.includes("whizan.cloud") ? "https" : "http";
  return `${proto}://${slug}.${domain}`;
}

export function getFunctionUrl(slug: string, path = ""): string {
  const domain = getBaseDomain();
  const cleanPath = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  const proto = domain.includes("whizan.cloud") ? "https" : "http";
  return `${proto}://${slug}.${domain}${cleanPath}`;
}

export function getFunctionHttpsUrl(slug: string, path = ""): string {
  return getFunctionUrl(slug, path);
}
