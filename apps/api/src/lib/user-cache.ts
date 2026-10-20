/**
 * Shared in-memory user metadata cache for Fastify auth and permission checks
 */
export const userMetaCache = new Map<string, { data: any; cachedAt: number }>();
