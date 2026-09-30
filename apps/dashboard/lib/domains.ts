/**
 * Utility for resolving public ingress URLs in Dashboard.
 * Always resolves to the deployed cloud domain (20.2.136.11.nip.io)
 * to ensure all links in the application lead to live deployed services.
 */

export function getBaseRouterDomain(): string {
  const envDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN;
  if (envDomain && !envDomain.includes("localhost") && !envDomain.includes("127.0.0.1")) {
    return envDomain;
  }
  return "20.2.136.11.nip.io";
}

export const BASE_ROUTER_DOMAIN = getBaseRouterDomain();

/**
 * Returns the public ingress URL for a backend service or worker
 */
export function getServiceIngressUrl(slug: string): string {
  const domain = getBaseRouterDomain();
  return `http://${slug}.${domain}`;
}

/**
 * Normalizes any deployment URL, automatically replacing stale/local development URLs
 * with the live cloud ingress URL.
 */
export function formatDeployedUrl(
  rawUrl: string | null | undefined,
  slug: string,
  customDomain?: string | null
): string {
  if (customDomain) {
    return customDomain.startsWith("http") ? customDomain : `https://${customDomain}`;
  }

  // If no URL or if URL contains localhost/127.0.0.1, always resolve to live cloud domain
  if (!rawUrl || rawUrl.includes("localhost") || rawUrl.includes("127.0.0.1")) {
    return getServiceIngressUrl(slug);
  }

  // If already a valid cloud URL, format with protocol
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }

  return `http://${rawUrl}`;
}

/**
 * Returns the production live URL for a frontend project
 */
export function getProjectLiveUrl(slug: string, customDomain?: string | null): string {
  if (customDomain) {
    return customDomain.startsWith("http") ? customDomain : `https://${customDomain}`;
  }
  return getServiceIngressUrl(slug);
}
