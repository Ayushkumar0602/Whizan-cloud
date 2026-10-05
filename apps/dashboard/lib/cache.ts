/**
 * High-performance In-Memory & Session Caching Engine for Whizan Cloud.
 *
 * Capabilities:
 * 1. In-Flight Request Deduplication: Coalesces concurrent identical HTTP calls to a single network socket.
 * 2. Stale-While-Revalidate (SWR): Returns instant (0ms) cached data while background-revalidating.
 * 3. Automatic Mutation Invalidation: Write operations (POST, PUT, PATCH, DELETE) automatically purge stale query caches.
 * 4. Session Storage Tier: Hydrates initial paints in 0ms on page refresh or tab switch.
 * 5. Fine-grained cache control: Supports per-request TTL, bypassCache, forceRefresh, and manual invalidation.
 */

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

export interface CacheOptions {
  ttlMs?: number;
  bypassCache?: boolean;
  forceRefresh?: boolean;
  staleWhileRevalidate?: boolean;
}

const DEFAULT_TTL_MS = 30_000; // 30 seconds default TTL for list and detail queries
const SWR_WINDOW_MS = 5 * 60_000; // 5 minutes window for stale-while-revalidate
const STORAGE_PREFIX = "whz_cache_v1:";

class ApiCacheEngine {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private inFlightRequests = new Map<string, Promise<any>>();
  private listeners = new Map<string, Set<(data: any) => void>>();

  /**
   * Generates a normalized cache key from HTTP method and path
   */
  public generateKey(method: string, path: string): string {
    return `${method.toUpperCase()}:${path.trim()}`;
  }

  /**
   * Checks if an in-flight request already exists for this key
   */
  public getInFlight<T>(key: string): Promise<T> | undefined {
    return this.inFlightRequests.get(key);
  }

  /**
   * Registers a pending in-flight promise
   */
  public setInFlight<T>(key: string, promise: Promise<T>): void {
    this.inFlightRequests.set(key, promise);
  }

  /**
   * Cleans up an in-flight promise once completed or rejected
   */
  public clearInFlight(key: string): void {
    this.inFlightRequests.delete(key);
  }

  /**
   * Gets a cached entry, checking memory first and then sessionStorage
   */
  public get<T>(key: string): { data: T; isStale: boolean } | null {
    // 1. Check memory cache first
    let entry = this.memoryCache.get(key);

    // 2. Fall back to sessionStorage snapshot if available
    if (!entry && typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${key}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.timestamp === "number") {
            entry = parsed;
            // Promote back into memory cache
            this.memoryCache.set(key, entry!);
          }
        }
      } catch {
        // Ignore sessionStorage quota or access errors
      }
    }

    if (!entry) return null;

    const age = Date.now() - entry.timestamp;

    // Fresh hit
    if (age <= entry.ttlMs) {
      return { data: entry.data, isStale: false };
    }

    // Stale but within SWR window
    if (age <= SWR_WINDOW_MS) {
      return { data: entry.data, isStale: true };
    }

    // Truly expired — delete and return null
    this.delete(key);
    return null;
  }

  /**
   * Stores data in cache with TTL and optional session persistence
   */
  public set<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttlMs,
    };

    this.memoryCache.set(key, entry);

    // Save lightweight serializable snapshot to sessionStorage
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(entry));
      } catch {
        // Storage quota might be exceeded
      }
    }

    // Notify active subscribers of new data
    this.notifySubscribers(key, data);
  }

  /**
   * Deletes a specific cache key
   */
  public delete(key: string): void {
    this.memoryCache.delete(key);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      } catch {}
    }
  }

  /**
   * Invalidates any cache key matching a prefix or regex pattern
   * E.g. invalidatePrefix("/api/projects") clears /api/projects and /api/projects/:id
   */
  public invalidate(prefixOrPattern: string | RegExp): void {
    const keysToDelete: string[] = [];

    for (const key of this.memoryCache.keys()) {
      if (typeof prefixOrPattern === "string") {
        if (key.includes(prefixOrPattern)) {
          keysToDelete.push(key);
        }
      } else if (prefixOrPattern.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const k of keysToDelete) {
      this.delete(k);
    }

    // Also purge matching keys from sessionStorage
    if (typeof window !== "undefined") {
      try {
        const toRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const itemKey = sessionStorage.key(i);
          if (itemKey && itemKey.startsWith(STORAGE_PREFIX)) {
            const stripped = itemKey.slice(STORAGE_PREFIX.length);
            if (
              (typeof prefixOrPattern === "string" && stripped.includes(prefixOrPattern)) ||
              (prefixOrPattern instanceof RegExp && prefixOrPattern.test(stripped))
            ) {
              toRemove.push(itemKey);
            }
          }
        }
        for (const rem of toRemove) {
          sessionStorage.removeItem(rem);
        }
      } catch {}
    }
  }

  /**
   * Clears the entire cache
   */
  public clear(): void {
    this.memoryCache.clear();
    this.inFlightRequests.clear();
    if (typeof window !== "undefined") {
      try {
        const toRemove: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith(STORAGE_PREFIX)) toRemove.push(k);
        }
        for (const k of toRemove) sessionStorage.removeItem(k);
      } catch {}
    }
  }

  /**
   * Allows components to subscribe to background cache updates
   */
  public subscribe<T>(key: string, callback: (data: T) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);

    return () => {
      const set = this.listeners.get(key);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this.listeners.delete(key);
      }
    };
  }

  private notifySubscribers(key: string, data: any): void {
    const set = this.listeners.get(key);
    if (set && set.size > 0) {
      set.forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error("[Cache] Subscriber callback error:", e);
        }
      });
    }
  }

  /**
   * Automatically invalidates relevant caches based on mutation path
   */
  public handleMutation(path: string): void {
    if (path.includes("/api/projects")) {
      this.invalidate("/api/projects");
      this.invalidate("/api/services"); // cross-cutting services catalog
    } else if (path.includes("/api/services")) {
      this.invalidate("/api/services");
    } else if (path.includes("/api/functions")) {
      this.invalidate("/api/functions");
    } else if (path.includes("/api/databases")) {
      this.invalidate("/api/databases");
    } else if (path.includes("/api/crons")) {
      this.invalidate("/api/crons");
    } else if (path.includes("/api/flows")) {
      this.invalidate("/api/flows");
    } else if (path.includes("/api/auth/api-keys")) {
      this.invalidate("/api/auth/api-keys");
    } else if (path.includes("/api/auth")) {
      this.invalidate("/api/auth");
    }
  }
}

export const apiCache = new ApiCacheEngine();
