/**
 * Utility for resolving public ingress URLs in Dashboard
 * Defaults to the Azure VM IP (20.2.136.11.nip.io) when running in production,
 * or localhost:8080 when running in local development.
 */

export const BASE_ROUTER_DOMAIN =
  process.env.NEXT_PUBLIC_BASE_DOMAIN || "20.2.136.11.nip.io";

export function getServiceIngressUrl(slug: string): string {
  const domain = BASE_ROUTER_DOMAIN;
  if (domain.startsWith("localhost")) {
    return `http://${slug}.${domain.includes(":") ? domain : `${domain}:8080`}`;
  }
  return `http://${slug}.${domain}`;
}

export function getProjectLiveUrl(slug: string, customDomain?: string | null): string {
  if (customDomain) {
    return `https://${customDomain}`;
  }
  return getServiceIngressUrl(slug);
}
