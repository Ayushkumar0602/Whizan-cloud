/**
 * Utility for resolving public ingress URLs in Dashboard.
 * Always resolves to the deployed cloud domain (whizan.cloud)
 * to ensure all links in the application lead to live deployed services.
 */

export function getBaseRouterDomain(): string {
  const envDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN?.trim();
  if (
    !envDomain ||
    envDomain.includes("localhost") ||
    envDomain.includes("127.0.0.1") ||
    envDomain.includes("nip.io") ||
    envDomain.includes("onrender.com") ||
    envDomain.includes("vercel.app") ||
    envDomain === "api.whizan.cloud" ||
    envDomain.startsWith("api.")
  ) {
    return "whizan.cloud";
  }
  return envDomain;
}

export const BASE_ROUTER_DOMAIN = getBaseRouterDomain();

/**
 * Returns the public ingress URL for a backend service or worker directly on Edge Router
 */
export function getServiceIngressUrl(slug: string): string {
  const domain = getBaseRouterDomain();
  const proto = domain.includes("whizan.cloud") ? "https" : "http";
  return `${proto}://${slug}.${domain}`;
}

/**
 * Returns the Always-On 24/7 Universal Gateway URL hosted on Render Control Plane.
 * Resilient against cold Azure VM states ($0.00/hr deallocation), automatically waking the VM
 * and showing the GhostFibers resource allocation screen before redirecting.
 */
export function getGatewayLiveUrl(slug: string, isFn = false, path = ""): string {
  const cleanPath = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  let apiBase = process.env.NEXT_PUBLIC_API_URL?.trim() || "https://api.whizan.cloud";
  if (
    apiBase.includes("onrender.com") ||
    apiBase.includes("vercel.app") ||
    apiBase.includes("nip.io")
  ) {
    apiBase = "https://api.whizan.cloud";
  }
  apiBase = apiBase.replace(/\/+$/, "");
  if (isFn) {
    return `${apiBase}/live/fn/${slug}${cleanPath}`;
  }
  return `${apiBase}/live/${slug}${cleanPath}`;
}

/**
 * Normalizes any deployment URL.
 * Automatically resolves to the resilient Always-On Gateway URL (or custom domain)
 * so that visits safely awaken the VM from eco-standby ($0.00/hr) without hanging or timing out.
 */
export function formatDeployedUrl(
  rawUrl: string | null | undefined,
  slug: string,
  customDomain?: string | null
): string {
  if (customDomain) {
    return customDomain.startsWith("http") ? customDomain : `https://${customDomain}`;
  }

  // Resilient Always-On Live Gateway ensures 100% uptime and auto-wake from VM hibernation
  return getGatewayLiveUrl(slug);
}

/**
 * Returns the production live URL for a frontend project
 */
export function getProjectLiveUrl(slug: string, customDomain?: string | null): string {
  if (customDomain) {
    return customDomain.startsWith("http") ? customDomain : `https://${customDomain}`;
  }
  return getGatewayLiveUrl(slug);
}

/**
 * Returns the primary subdomain ingress URL for an Edge Function (.fn.<domain>)
 */
export function getFunctionIngressUrl(slug: string, path = ""): string {
  const domain = getBaseRouterDomain();
  const cleanPath = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  const proto = domain.includes("whizan.cloud") ? "https" : "http";
  return `${proto}://${slug}.fn.${domain}${cleanPath}`;
}

/**
 * Returns the fallback path-based ingress URL for an Edge Function (/fn/<slug>)
 */
export function getFunctionPathUrl(slug: string, path = ""): string {
  const domain = getBaseRouterDomain();
  const cleanPath = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  const proto = domain.includes("whizan.cloud") ? "https" : "http";
  return `${proto}://${domain}/fn/${slug}${cleanPath}`;
}


