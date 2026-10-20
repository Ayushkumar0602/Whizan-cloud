/**
 * Central API client for the Hostify dashboard.
 * Handles auth token refresh automatically on 401.
 */

export function getApiBase(): string {
  // When running locally in the browser, always prioritize local API on port 8000
  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ) {
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    if (envUrl && (envUrl.includes("localhost") || envUrl.includes("127.0.0.1"))) {
      return envUrl;
    }
    return "http://localhost:8000";
  }

  const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (
    envUrl &&
    !envUrl.includes("onrender.com") &&
    !envUrl.includes("vercel.app") &&
    !envUrl.includes("nip.io")
  ) {
    return envUrl;
  }

  return "https://api.whizan.cloud";
}

export const API_BASE = getApiBase();

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== "undefined") {
    try {
      if (token) {
        localStorage.setItem("hostify_access_token", token);
      } else {
        localStorage.removeItem("hostify_access_token");
      }
    } catch {}
  }
}

export function getAccessToken(): string | null {
  if (!accessToken && typeof window !== "undefined") {
    try {
      accessToken = localStorage.getItem("hostify_access_token");
    } catch {}
  }
  return accessToken;
}

export async function refreshAccessToken(): Promise<string | null> {
  // Deduplicate concurrent refresh requests into a single in-flight promise
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.accessToken) {
        setAccessToken(data.accessToken);
        if (data?.user && typeof window !== "undefined") {
          try {
            localStorage.setItem("hostify_user", JSON.stringify(data.user));
          } catch {}
        }
        return data.accessToken;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

import { apiCache, type CacheOptions } from "./cache";

export interface RequestOptions extends RequestInit, CacheOptions {}

async function executeNetworkFetch<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string>),
  };

  let token = getAccessToken();
  if (!token && path !== "/api/auth/refresh" && path !== "/api/auth/login" && path !== "/api/auth/register" && typeof window !== "undefined") {
    token = await refreshAccessToken().catch(() => null);
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const base = getApiBase();
  let res = await fetch(`${base}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  // Auto-refresh on 401
  if (res.status === 401 && path !== "/api/auth/refresh" && path !== "/api/auth/login" && path !== "/api/auth/register") {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${base}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });
    } else {
      setAccessToken(null);
      throw new Error("UNAUTHORIZED");
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();

  // For non-GET requests (mutations: POST, PUT, PATCH, DELETE)
  if (method !== "GET") {
    const result = await executeNetworkFetch<T>(path, options);
    // Invalidate relevant query caches
    apiCache.handleMutation(path);
    return result;
  }

  // For GET requests: apply in-flight coalescing and caching
  const cacheKey = apiCache.generateKey(method, path);

  // 1. Check if cached data exists (unless forced refresh or bypassing cache)
  if (!options.bypassCache && !options.forceRefresh) {
    const cached = apiCache.get<T>(cacheKey);
    if (cached) {
      if (!cached.isStale) {
        // Fresh hit: 0ms response, 0 network socket
        return cached.data;
      }

      // Stale hit (within SWR window): return stale data immediately, revalidate in background
      if (!apiCache.getInFlight(cacheKey)) {
        const bgRevalidate = executeNetworkFetch<T>(path, options)
          .then((fresh) => {
            apiCache.set(cacheKey, fresh, options.ttlMs);
            return fresh;
          })
          .catch((err) => {
            console.warn(`[Cache] Background revalidation failed for ${path}:`, err);
          })
          .finally(() => {
            apiCache.clearInFlight(cacheKey);
          });
        apiCache.setInFlight(cacheKey, bgRevalidate);
      }

      return cached.data;
    }
  }

  // 2. In-flight request deduplication: return existing promise if already requesting
  const existingInFlight = apiCache.getInFlight<T>(cacheKey);
  if (existingInFlight && !options.forceRefresh) {
    return existingInFlight;
  }

  // 3. Dispatch fresh network request
  const fetchPromise = executeNetworkFetch<T>(path, options)
    .then((data) => {
      if (!options.bypassCache) {
        apiCache.set(cacheKey, data, options.ttlMs);
      }
      return data;
    })
    .catch((err) => {
      // Offline fallback: if network request failed, see if we have ANY cached data
      const fallback = apiCache.get<T>(cacheKey);
      if (fallback) {
        return fallback.data;
      }
      throw err;
    })
    .finally(() => {
      apiCache.clearInFlight(cacheKey);
    });

  apiCache.setInFlight(cacheKey, fetchPromise);
  return fetchPromise;
}

export { apiCache };

// ─── Auth ──────────────────────────────────────────────────────────────────

export const auth = {
  register: (data: { email: string; password: string; name?: string; passcode?: string }) =>
    request<{ accessToken: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  sendOtp: (data: { email: string }) =>
    request<{ ok: boolean; message: string; expiresIn?: number }>("/api/auth/send-otp", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  verifyOtp: (data: { email: string; passcode: string }) =>
    request<{ ok: boolean; verified: boolean }>("/api/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    request<{ accessToken: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  logout: () => request("/api/auth/logout", { method: "POST" }),

  me: () => request<User>("/api/auth/me"),

  updateSubscription: (subscriptionTier: "HOBBY" | "PROFESSIONAL") =>
    request<{ success: boolean; subscriptionTier: string; message: string }>("/api/auth/subscription", {
      method: "PATCH",
      body: JSON.stringify({ subscriptionTier }),
    }),
};

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  owner: string;
  defaultBranch: string;
  htmlUrl: string;
  cloneUrl: string;
  description: string;
  language: string;
  updatedAt: string;
}

export const github = {
  getAuthUrl: () => request<{ url: string }>("/api/auth-url"),
  getStatus: () =>
    request<{
      connected: boolean;
      username?: string;
      avatarUrl?: string;
      name?: string;
      publicRepos?: number;
      totalPrivateRepos?: number;
    }>("/api/github/status"),
  getRepos: () => request<GitHubRepo[]>("/api/github/repos"),
  getBranches: (owner: string, repo: string) =>
    request<string[]>(`/api/github/branches?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`),
  disconnect: () => request("/api/github/disconnect", { method: "POST" }),
};

// ─── Projects ──────────────────────────────────────────────────────────────

export const projects = {
  list: (opts?: RequestOptions) => request<ProjectWithLatestDeploy[]>("/api/projects", opts),

  get: (id: string, opts?: RequestOptions) => request<ProjectWithDeployments>(`/api/projects/${id}`, opts),
  getAnalytics: (id: string, opts?: RequestOptions) => request<any[]>(`/api/projects/${id}/analytics`, opts),

  create: (data: CreateProjectData) =>
    request<Project>("/api/projects", { method: "POST", body: JSON.stringify(data) }),

  update: (id: string, data: Partial<CreateProjectData>) =>
    request<Project>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request(`/api/projects/${id}`, { method: "DELETE" }),
};

// ─── Deployments ───────────────────────────────────────────────────────────

export const deployments = {
  list: (projectId: string) =>
    request<Deployment[]>(`/api/projects/${projectId}/deployments`),

  get: (projectId: string, deploymentId: string) =>
    request<Deployment>(`/api/projects/${projectId}/deployments/${deploymentId}`),

  trigger: (projectId: string, data?: { githubRepoUrl?: string; branch?: string; rootDir?: string; buildCommand?: string; installCommand?: string; outputDir?: string }) =>
    request<Deployment>(`/api/projects/${projectId}/deployments`, {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),

  cancel: (projectId: string, deploymentId: string) =>
    request(`/api/projects/${projectId}/deployments/${deploymentId}/cancel`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  pause: (projectId: string, deploymentId: string) =>
    request(`/api/projects/${projectId}/deployments/${deploymentId}/pause`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  resume: (projectId: string, deploymentId: string) =>
    request<Deployment>(`/api/projects/${projectId}/deployments/${deploymentId}/resume`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  delete: (projectId: string, deploymentId: string) =>
    request(`/api/projects/${projectId}/deployments/${deploymentId}`, { method: "DELETE" }),

  /** Returns an EventSource for live log streaming */
  streamLogs: (deploymentId: string): EventSource => {
    const token = getAccessToken();
    return new EventSource(
      `${API_BASE}/api/projects/deployments/${deploymentId}/logs?token=${token}`
    );
  },
};

// ─── Env Variables ─────────────────────────────────────────────────────────

export const envVars = {
  list: (projectId: string) =>
    request<EnvVariable[]>(`/api/projects/${projectId}/env`),

  set: (projectId: string, data: { key: string; value: string; isSecret?: boolean }) =>
    request(`/api/projects/${projectId}/env`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  setBulk: (projectId: string, envVars: Record<string, any>, isSecret = true) =>
    request<{ success: boolean; count: number; keys: string[] }>(`/api/projects/${projectId}/env/bulk`, {
      method: "POST",
      body: JSON.stringify({ envVars, isSecret }),
    }),

  delete: (projectId: string, key: string) =>
    request(`/api/projects/${projectId}/env/${key}`, { method: "DELETE" }),
};

export const customDomains = {
  list: (projectId: string) => request<any[]>(`/api/projects/${projectId}/domains`),
  add: (projectId: string, domain: string) => 
    request<any>(`/api/projects/${projectId}/domains`, { method: "POST", body: JSON.stringify({ domain }) }),
  delete: (projectId: string, domain: string) => 
    request(`/api/projects/${projectId}/domains/${domain}`, { method: "DELETE" }),
};

// ─── Types ─────────────────────────────────────────────────────────────────

export type User = {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  role?: "ROOT_ADMIN" | "IAM_ADMIN" | "ADMIN" | "DEVOPS_ADMIN" | "SUPPORT_ADMIN" | "USER" | string;
  iamPermissions?: string;
  subscriptionTier?: "HOBBY" | "PROFESSIONAL" | string;
  createdAt: string;
};

export type Project = {
  id: string;
  userId: string;
  name: string;
  slug: string;
  githubRepoUrl: string;
  branch: string;
  rootDir?: string;
  buildCommand: string;
  installCommand: string;
  outputDir: string;
  framework: string;
  customDomain?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectWithLatestDeploy = Project & {
  deployments: Deployment[];
};

export type ProjectWithDeployments = Project & {
  deployments: Deployment[];
};

export type Deployment = {
  id: string;
  projectId: string;
  commitHash: string;
  commitMessage?: string;
  branch: string;
  status: "QUEUED" | "BUILDING" | "READY" | "FAILED" | "CANCELLED" | "PAUSED";
  deploymentType?: "STATIC" | "SSR" | "HYBRID";
  uploadType?: string;
  url?: string;
  containerPort?: number;
  buildStartedAt?: string;
  buildFinishedAt?: string;
  errorMessage?: string;
  createdAt: string;
};

export type EnvVariable = {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  createdAt: string;
};

export type CreateProjectData = {
  name: string;
  slug: string;
  githubRepoUrl: string;
  branch?: string;
  rootDir?: string;
  buildCommand?: string;
  installCommand?: string;
  outputDir?: string;
  framework?: string;
};

// ─── Admin ─────────────────────────────────────────────────────────────────

export const admin = {
  stats: () => request<any>("/api/admin/stats"),
  stopContainer: (deploymentId: string) => request(`/api/admin/deployments/${deploymentId}/stop`, { method: "POST" }),
  deleteDeployment: (deploymentId: string) => request(`/api/admin/deployments/${deploymentId}`, { method: "DELETE" }),
  stopBackendService: (serviceId: string) => request(`/api/admin/services/${serviceId}/stop`, { method: "POST" }),
  deleteBackendService: (serviceId: string) => request(`/api/admin/services/${serviceId}`, { method: "DELETE" }),
  stopDatabase: (databaseId: string) => request(`/api/admin/databases/${databaseId}/stop`, { method: "POST" }),
  deleteDatabase: (databaseId: string) => request(`/api/admin/databases/${databaseId}`, { method: "DELETE" }),
  killContainer: (containerId: string) => request(`/api/admin/containers/${containerId}`, { method: "DELETE" }),
  deleteFile: (path: string) => request(`/api/admin/files/delete`, { method: "POST", body: JSON.stringify({ path }) }),
  pruneDocker: () => request(`/api/admin/system/prune-docker`, { method: "POST" }),
  clearBuildCache: () => request(`/api/admin/system/clear-cache`, { method: "POST" }),
  getLogs: (service: string, type: string) => request<{logs: string}>(`/api/admin/logs/${service}/${type}`),
  getContainerLogs: (containerId: string) => request<{logs: string}>(`/api/admin/containers/${containerId}/logs`),
  getDatabaseStats: () => request<any>(`/api/admin/database/stats`),
  restartService: (service: string) => request(`/api/admin/restart/${service}`, { method: "POST" }),
  terminalExec: (data: {
    command: string;
    cwd?: string;
    remote?: { host: string; port?: number; username: string; password?: string; privateKey?: string };
  }) =>
    request<{ stdout: string; stderr: string; exitCode: number; cwd: string }>("/api/admin/terminal/exec", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ─── Backend Services ────────────────────────────────────────────────────────

export type BackendService = {
  id: string;
  userId: string;
  name: string;
  slug: string;
  githubRepoUrl: string;
  branch: string;
  language: "NODEJS" | "PYTHON" | "GO" | "DOCKERFILE";
  rootDir: string;
  installCommand: string;
  startCommand: string;
  internalPort: number;
  isPublic: boolean;
  autoSleep: boolean;
  instanceType?: "free" | "starter" | "standard" | "pro" | "pro_plus";
  cpuLimit?: number;
  memoryLimit?: number;
  createdAt: string;
  updatedAt: string;
};

export type ServiceDeployment = {
  id: string;
  serviceId: string;
  commitHash: string;
  commitMessage?: string;
  branch: string;
  status: "QUEUED" | "BUILDING" | "READY" | "FAILED" | "CANCELLED" | "PAUSED";
  containerPort?: number;
  buildStartedAt?: string;
  buildFinishedAt?: string;
  errorMessage?: string;
  createdAt: string;
};

export type ServiceEnvVariable = {
  id: string;
  key: string;
  isSecret: boolean;
  createdAt: string;
};

export type ServiceWithLatestDeploy = BackendService & {
  deployments: ServiceDeployment[];
};

export type ServiceWithDetails = BackendService & {
  deployments: ServiceDeployment[];
  envVariables: ServiceEnvVariable[];
};

export type CreateServiceData = {
  name: string;
  slug: string;
  githubRepoUrl: string;
  branch?: string;
  language?: string;
  rootDir?: string;
  installCommand?: string;
  startCommand?: string;
  internalPort?: number;
  isPublic?: boolean;
  autoSleep?: boolean;
  instanceType?: "free" | "starter" | "standard" | "pro" | "pro_plus";
  cpuLimit?: number;
  memoryLimit?: number;
};

export type ContainerMetricPoint = {
  timestamp: string;
  cpuPercent: number;
  memUsageMB: number;
  memLimitMB: number;
  memPercent: number;
  rxBytes: number;
  txBytes: number;
  rxRateKbps: number;
  txRateKbps: number;
  pids: number;
  pidsLimit: number;
};

export type ServiceMetricsResponse = {
  container: string | null;
  status: "running" | "sleeping" | "stopped";
  current: ContainerMetricPoint | null;
  history: ContainerMetricPoint[];
};

export type MeshServiceItem = {
  id: string;
  name: string;
  slug: string;
  internalPort: number;
  internalUrl: string;
  networkAlias: string;
  meshNetwork: string;
  status: "running" | "sleeping" | "stopped";
  ipAddress: string | null;
  isPublic: boolean;
  autoSleep: boolean;
  instanceType?: string;
  cpuLimit?: number;
  memoryLimit?: number;
};

export type MeshPingRequest = {
  targetSlug: string;
  targetPort: number;
  path?: string;
};

export type MeshPingResponse = {
  success: boolean;
  targetUrl: string;
  targetSlug: string;
  targetPort: number;
  statusCode: number;
  latencyMs: number;
  resolvedIp: string;
  dnsOk: boolean;
  timeDnsMs: number;
  timeConnectMs: number;
  headers: Record<string, string>;
  bodyPreview: string;
  errorMessage?: string;
  network: string;
};

export type AiAnalysisResponse = {
  success: boolean;
  analysis: {
    isDeployable: boolean;
    rejectionReason: string | null;
    stack: string;
    framework: string;
    targetType: "service" | "project";
    language: "NODEJS" | "PYTHON" | "GO" | "DOCKERFILE";
    isWorker: boolean;
    recommendedPort: number;
    installCommand: string;
    buildCommand: string;
    startCommand: string;
    requiredEnvVars: Array<{ name: string; description: string; example?: string; required: boolean }>;
    optionalEnvVars: Array<{ name: string; description: string; example?: string; required: boolean }>;
    explanation: string;
  };
};

export const services = {
  list: (opts?: RequestOptions) => request<ServiceWithLatestDeploy[]>("/api/services", opts),
  get: (id: string, opts?: RequestOptions) => request<ServiceWithDetails>(`/api/services/${id}`, opts),
  create: (data: CreateServiceData) => request<BackendService>("/api/services", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CreateServiceData>) => request<BackendService>(`/api/services/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request(`/api/services/${id}`, { method: "DELETE" }),
  deploy: (id: string, data?: { githubRepoUrl?: string; branch?: string; rootDir?: string; installCommand?: string; startCommand?: string }) => request<ServiceDeployment>(`/api/services/${id}/deploy`, { method: "POST", body: JSON.stringify(data || {}) }),
  getDeployment: (id: string, dId: string) => request<ServiceDeployment>(`/api/services/deployments/${dId}`),
  getEnv: (id: string) => request<ServiceEnvVariable[]>(`/api/services/${id}/env`),
  setEnv: (id: string, key: string, value: string, isSecret = true) => request<{id:string}>(`/api/services/${id}/env`, { method: "POST", body: JSON.stringify({ key, value, isSecret }) }),
  setBulkEnv: (id: string, envVars: Record<string, any>, isSecret = true) => request<{ success: boolean; count: number; keys: string[] }>(`/api/services/${id}/env/bulk`, { method: "POST", body: JSON.stringify({ envVars, isSecret }) }),
  deleteEnv: (id: string, key: string) => request(`/api/services/${id}/env/${key}`, { method: "DELETE" }),
  getMetrics: (id: string, opts?: RequestOptions) => request<ServiceMetricsResponse>(`/api/services/${id}/metrics`, opts),
  streamMetrics: (id: string): EventSource => {
    const token = getAccessToken();
    return new EventSource(`${API_BASE}/api/services/${id}/metrics/stream?token=${token}`);
  },
  getMeshCatalog: (opts?: RequestOptions) => request<MeshServiceItem[]>("/api/services/mesh/catalog", opts),
  pingMesh: (data: MeshPingRequest) => request<MeshPingResponse>("/api/services/mesh/ping", { method: "POST", body: JSON.stringify(data) }),
  analyze: (data: { githubRepoUrl?: string; branch?: string; readme?: string }) => request<AiAnalysisResponse>("/api/services/analyze", { method: "POST", body: JSON.stringify(data) }),
};

// ─── Managed Databases ───────────────────────────────────────────────────────

export type ManagedDatabase = {
  id: string;
  userId: string;
  name: string;
  slug: string;
  type: "POSTGRESQL" | "REDIS" | "MYSQL";
  version: string;
  status: "PROVISIONING" | "RUNNING" | "STOPPED" | "RESTARTING" | "FAILED";
  databaseName: string;
  username: string;
  decryptedPassword?: string;
  internalPort: number;
  externalPort?: number;
  volumePath?: string;
  instanceType: string;
  cpuLimit: number;
  memoryLimit: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  internalUrl: string;
  externalUrl: string;
  externalHost: string;
  poolerPort?: number;
  enablePooler?: boolean;
  sslEnabled?: boolean;
  ipWhitelist?: string[];
  readonlyPassword?: string;
  decryptedReadonlyPassword?: string;
  sslUrl?: string;
  pooledUrl?: string;
  internalPooledUrl?: string;
  readonlyUrl?: string;
};

export type CreateDatabaseData = {
  name: string;
  slug?: string;
  type?: "POSTGRESQL" | "REDIS" | "MYSQL";
  version?: string;
  databaseName?: string;
  username?: string;
  instanceType?: "starter" | "standard" | "pro";
};

export type DatabaseMetrics = {
  cpuPercent: number;
  memoryMB: number;
  memoryLimitMB: number;
  isRunning: boolean;
  status: string;
};

export type DatabaseQueryResult = {
  success: boolean;
  rows: Record<string, any>[];
  rowCount: number;
  fields: { name: string; dataTypeID?: number }[];
  command: string;
  executionTimeMs: number;
  error?: string;
  position?: string;
  detail?: string;
  hint?: string;
};

export type DatabaseTableItem = {
  table_name: string;
  rows: number;
  size: string;
  sizeBytes: number;
  columnCount: number;
};

export type DatabaseTablesResponse = {
  tables: DatabaseTableItem[];
  totalTables: number;
  databaseSize: string;
  databaseSizeBytes: number;
};

export type DatabaseColumnSchema = {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: boolean;
  column_default: string | null;
  character_maximum_length: number | null;
  is_primary_key: boolean;
};

export type DatabaseTableDataResponse = {
  rows: Record<string, any>[];
  totalCount: number;
  page: number;
  limit: number;
  columns: string[];
};

export type RedisKeyItem = {
  key: string;
  type: string;
  ttl: number;
};

export type RedisKeysResponse = {
  keys: RedisKeyItem[];
  totalKeys: number;
};

export type RedisKeyDetail = {
  key: string;
  type: string;
  ttl: number;
  value: any;
};

export type DatabaseSlowQuery = {
  query: string;
  calls: number;
  total_time_ms: string;
  mean_time_ms: string;
  min_time_ms: string;
  max_time_ms: string;
  total_rows: number;
};

export type DatabaseRunningQuery = {
  pid: number;
  usename: string;
  client_addr: string;
  state: string;
  duration_seconds: number;
  query: string;
  wait_event_type: string;
  wait_event: string;
};

export type DatabaseConnectionBreakdown = {
  state: string;
  count: number;
};

export type DatabaseInsights = {
  slowQueries: DatabaseSlowQuery[];
  cacheHitRatio: number;
  connectionBreakdown: DatabaseConnectionBreakdown[];
  runningQueries: DatabaseRunningQuery[];
  databaseSize: string;
  databaseSizeBytes: number;
};

export type UrlConnectionTestResult = {
  ok: boolean;
  type: "POSTGRESQL" | "REDIS";
  version?: string;
  database?: string;
  user?: string;
  serverIp?: string;
  serverPort?: number;
  ping?: string;
  keyCount?: number;
  latencyMs: number;
  error?: string;
};

export type UrlDatabaseTableColumn = {
  name: string;
  type: string;
  isNullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
};

export type UrlDatabaseTable = {
  tableName: string;
  schema: string;
  rowCount: number;
  columnCount: number;
  columns: UrlDatabaseTableColumn[];
};

export const databases = {
  list: (opts?: RequestOptions) => request<ManagedDatabase[]>("/api/databases", opts),
  get: (id: string, opts?: RequestOptions) => request<ManagedDatabase>(`/api/databases/${id}`, opts),
  create: (data: CreateDatabaseData) =>
    request<ManagedDatabase>("/api/databases", { method: "POST", body: JSON.stringify(data) }),
  restart: (id: string) =>
    request<{ message: string; status: string }>(`/api/databases/${id}/restart`, { method: "POST" }),
  stop: (id: string) =>
    request<{ message: string }>(`/api/databases/${id}/stop`, { method: "POST" }),
  start: (id: string) =>
    request<{ message: string }>(`/api/databases/${id}/start`, { method: "POST" }),
  wake: (id: string) =>
    request<{ status: string; booting: boolean; message: string }>(`/api/databases/${id}/wake`, { method: "POST" }),
  delete: (id: string) =>
    request<{ message: string }>(`/api/databases/${id}`, { method: "DELETE" }),
  getMetrics: (id: string) => request<DatabaseMetrics>(`/api/databases/${id}/metrics`),
  streamLogs: (id: string): EventSource => {
    const token = getAccessToken();
    return new EventSource(`${getApiBase()}/api/databases/${id}/logs?token=${token}`);
  },

  // Query Runner
  query: (id: string, query: string) =>
    request<DatabaseQueryResult>(`/api/databases/${id}/query`, {
      method: "POST",
      body: JSON.stringify({ query }),
    }),

  // Table Visualizer & Schema
  getTables: (id: string) =>
    request<DatabaseTablesResponse>(`/api/databases/${id}/tables`),

  getTableSchema: (id: string, table: string) =>
    request<{ columns: DatabaseColumnSchema[] }>(`/api/databases/${id}/tables/${encodeURIComponent(table)}/schema`),

  getTableData: (
    id: string,
    table: string,
    params?: { page?: number; limit?: number; sortColumn?: string; sortOrder?: string; search?: string }
  ) => {
    const queryParts: string[] = [];
    if (params?.page) queryParts.push(`page=${params.page}`);
    if (params?.limit) queryParts.push(`limit=${params.limit}`);
    if (params?.sortColumn) queryParts.push(`sortColumn=${encodeURIComponent(params.sortColumn)}`);
    if (params?.sortOrder) queryParts.push(`sortOrder=${params.sortOrder}`);
    if (params?.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
    const qs = queryParts.length ? `?${queryParts.join("&")}` : "";
    return request<DatabaseTableDataResponse>(`/api/databases/${id}/tables/${encodeURIComponent(table)}/data${qs}`);
  },

  insertRow: (id: string, table: string, data: Record<string, any>) =>
    request<{ success: boolean; row: any }>(`/api/databases/${id}/tables/${encodeURIComponent(table)}/row`, {
      method: "POST",
      body: JSON.stringify({ data }),
    }),

  updateRow: (
    id: string,
    table: string,
    primaryKey: { column: string; value: any },
    data: Record<string, any>
  ) =>
    request<{ success: boolean; row: any }>(`/api/databases/${id}/tables/${encodeURIComponent(table)}/row`, {
      method: "PUT",
      body: JSON.stringify({ primaryKey, data }),
    }),

  deleteRow: (id: string, table: string, primaryKey: { column: string; value: any }) =>
    request<{ success: boolean }>(`/api/databases/${id}/tables/${encodeURIComponent(table)}/row`, {
      method: "DELETE",
      body: JSON.stringify({ primaryKey }),
    }),

  createTable: (
    id: string,
    tableName: string,
    columns: Array<{ name: string; type: string; isPrimaryKey?: boolean; isNullable?: boolean; defaultValue?: string }>
  ) =>
    request<{ success: boolean; message: string }>(`/api/databases/${id}/tables`, {
      method: "POST",
      body: JSON.stringify({ tableName, columns }),
    }),

  dropTable: (id: string, table: string) =>
    request<{ success: boolean; message: string }>(`/api/databases/${id}/tables/${encodeURIComponent(table)}`, {
      method: "DELETE",
    }),

  // Redis Key Explorer
  getRedisKeys: (id: string, pattern?: string) =>
    request<RedisKeysResponse>(`/api/databases/${id}/redis/keys${pattern ? `?pattern=${encodeURIComponent(pattern)}` : ""}`),

  getRedisKey: (id: string, key: string) =>
    request<RedisKeyDetail>(`/api/databases/${id}/redis/key?key=${encodeURIComponent(key)}`),

  setRedisKey: (id: string, key: string, value: string, ttl?: number) =>
    request<{ success: boolean }>(`/api/databases/${id}/redis/key`, {
      method: "POST",
      body: JSON.stringify({ key, value, ttl }),
    }),

  deleteRedisKey: (id: string, key: string) =>
    request<{ success: boolean }>(`/api/databases/${id}/redis/key?key=${encodeURIComponent(key)}`, {
      method: "DELETE",
    }),

  // Direct Database URL Tester Methods
  testUrlConnection: (databaseUrl: string) =>
    request<UrlConnectionTestResult>("/api/databases/url-test", {
      method: "POST",
      body: JSON.stringify({ databaseUrl }),
    }),

  getUrlTables: (databaseUrl: string) =>
    request<{ tables: UrlDatabaseTable[] }>("/api/databases/url-tables", {
      method: "POST",
      body: JSON.stringify({ databaseUrl }),
    }),

  runUrlQuery: (databaseUrl: string, query: string) =>
    request<DatabaseQueryResult>("/api/databases/url-query", {
      method: "POST",
      body: JSON.stringify({ databaseUrl, query }),
    }),

  // Production Insights & Performance
  getInsights: (id: string) => request<DatabaseInsights>(`/api/databases/${id}/insights`),

  killQuery: (id: string, pid: number) =>
    request<{ success: boolean; terminated: boolean }>(`/api/databases/${id}/kill-query`, {
      method: "POST",
      body: JSON.stringify({ pid }),
    }),

  resetStats: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/databases/${id}/reset-stats`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  createReadonlyUser: (id: string) =>
    request<{ success: boolean; username: string; password: string; readonlyUrl: string }>(
      `/api/databases/${id}/readonly-user`,
      { method: "POST", body: JSON.stringify({}) }
    ),

  updateSecurity: (
    id: string,
    data: { ipWhitelist?: string[]; sslEnabled?: boolean; enablePooler?: boolean }
  ) =>
    request<{ success: boolean; database: ManagedDatabase }>(`/api/databases/${id}/security`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

export interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreatedApiKey extends ApiKeyItem {
  key: string;
}

export const apiKeysApi = {
  list: (opts?: RequestOptions) => request<ApiKeyItem[]>("/api/auth/api-keys", opts),
  create: (name?: string) =>
    request<CreatedApiKey>("/api/auth/api-keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/api/auth/api-keys/${id}`, {
      method: "DELETE",
    }),
};

// ─── Edge Functions API ──────────────────────────────────────────────────────

export interface FunctionDeployment {
  id: string;
  version: number;
  status: "PENDING" | "BUILDING" | "READY" | "FAILED";
  bundlePath?: string;
  bundleSize?: number;
  buildDurationMs?: number;
  buildLogs?: string;
  createdAt: string;
}

export interface FunctionApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitRpm: number;
  ipWhitelist: string[];
  lastUsedAt: string | null;
  createdAt: string;
  key?: string; // Only present when newly created
}

export interface FunctionEndpointItem {
  id: string;
  serviceId?: string;
  name: string;
  routePath: string;
  httpMethods: string[];
  handlerName: string;
  isPublic: boolean;
  cacheTtlSec?: number;
  memoryLimit?: number;
  timeoutSeconds?: number;
  timeoutMs?: number;
  createdAt?: string;
}

export interface FunctionEnvItem {
  id: string;
  key: string;
  isSecret: boolean;
  createdAt: string;
}

export interface FunctionServiceItem {
  id: string;
  name: string;
  slug: string;
  runtime: "EDGE_TYPESCRIPT" | "NODEJS_20" | "PYTHON_311" | "GOLANG_122";
  entryFile: string;
  timeoutMs: number;
  memoryLimit: number;
  minInstances: number;
  maxConcurrency: number;
  isPublic: boolean;
  corsOrigins: string[];
  createdAt: string;
  updatedAt: string;
  deployments: FunctionDeployment[];
  endpoints: FunctionEndpointItem[];
  apiKeys: FunctionApiKeyItem[];
  envVariables?: FunctionEnvItem[];
  _count?: {
    invocations: number;
  };
  stats?: {
    totalInvocations: number;
    last24hInvocations: number;
    avgDurationMs: number;
    errorCount: number;
  };
}

export interface FunctionTestResult {
  status: number;
  statusText?: string;
  headers: Record<string, string>;
  data: any;
  durationMs: number;
  memoryUsageMb: number;
  logs?: Array<{ level: string; message: string; timestamp: number }>;
}

export interface FunctionMetrics {
  serviceId: string;
  slug: string;
  totalInvocations: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  successCount: number;
  clientErrorCount: number;
  serverErrorCount: number;
  errorRate: number;
  statusCodes: Record<string, number>;
  endpointBreakdown: Array<{
    endpoint: string;
    invocations: number;
    avgDurationMs: number;
    errors: number;
    errorRate: number;
  }>;
  hourlySeries: Array<{
    hour: string;
    invocations: number;
    avgLatencyMs: number;
    errors: number;
  }>;
}

export const functionsApi = {
  list: (opts?: RequestOptions) => request<FunctionServiceItem[]>("/api/functions", opts),
  
  get: (id: string, opts?: RequestOptions) => request<FunctionServiceItem>(`/api/functions/${id}`, opts),

  create: (data: {
    name: string;
    slug: string;
    runtime?: string;
    entryFile?: string;
    timeoutMs?: number;
    memoryLimit?: number;
    minInstances?: number;
    maxConcurrency?: number;
    isPublic?: boolean;
    corsOrigins?: string[];
    initialCode?: string;
    envVars?: Record<string, string>;
  }) =>
    request<{
      functionService: FunctionServiceItem;
      service?: FunctionServiceItem;
      initialApiKey?: { id: string; key: string; prefix?: string; name: string };
      apiKey?: { id: string; key: string; keyPrefix?: string; name: string };
      deployment?: any;
      invocationUrl?: string;
    }>(
      "/api/functions",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    ),

  update: (
    id: string,
    data: Partial<{
      name: string;
      timeoutMs: number;
      memoryLimit: number;
      minInstances: number;
      maxConcurrency: number;
      isPublic: boolean;
      corsOrigins: string[];
      envVars: Record<string, string>;
    }>
  ) =>
    request<{ success: boolean; service: FunctionServiceItem }>(`/api/functions/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/functions/${id}`, {
      method: "DELETE",
    }),

  deploy: (id: string, code: string) =>
    request<{
      success: boolean;
      deployment: FunctionDeployment;
      stats?: { bundleSize: number; durationMs: number };
    }>(`/api/functions/${id}/deploy`, {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  // Endpoints / Functions inside service
  listEndpoints: (id: string) => request<FunctionEndpointItem[]>(`/api/functions/${id}/endpoints`),
  createEndpoint: (
    id: string,
    data: {
      name: string;
      routePath: string;
      httpMethods?: string[];
      handlerName?: string;
      isPublic?: boolean;
      cacheTtlSec?: number;
      memoryLimit?: number;
      timeoutSeconds?: number;
      timeoutMs?: number;
    }
  ) =>
    request<FunctionEndpointItem>(`/api/functions/${id}/endpoints`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateEndpoint: (
    id: string,
    endpointId: string,
    data: Partial<{
      name: string;
      routePath: string;
      httpMethods: string[];
      handlerName: string;
      isPublic: boolean;
      cacheTtlSec: number;
      memoryLimit: number;
      timeoutSeconds: number;
      timeoutMs: number;
    }>
  ) =>
    request<FunctionEndpointItem>(`/api/functions/${id}/endpoints/${endpointId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteEndpoint: (id: string, endpointId: string) =>
    request<{ success: boolean; message: string }>(`/api/functions/${id}/endpoints/${endpointId}`, {
      method: "DELETE",
    }),

  // Central Shared Env Variables
  listEnv: (id: string) =>
    request<Array<{ id: string; key: string; value: string; isSecret: boolean; createdAt: string }>>(
      `/api/functions/${id}/env`
    ),
  setEnv: (id: string, key: string, value: string, isSecret = true) =>
    request<{ success: boolean; key: string }>(`/api/functions/${id}/env`, {
      method: "POST",
      body: JSON.stringify({ key, value, isSecret }),
    }),
  deleteEnv: (id: string, key: string) =>
    request<{ success: boolean; message: string }>(`/api/functions/${id}/env/${key}`, {
      method: "DELETE",
    }),

  // API Keys
  createApiKey: (
    id: string,
    data: {
      name?: string;
      scopes?: string[];
      rateLimitRpm?: number;
      ipWhitelist?: string[];
    }
  ) =>
    request<{ success: boolean; apiKey: FunctionApiKeyItem }>(`/api/functions/${id}/api-keys`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  deleteApiKey: (id: string, keyId: string) =>
    request<{ success: boolean }>(`/api/functions/${id}/api-keys/${keyId}`, {
      method: "DELETE",
    }),

  // Interactive Test
  test: (
    id: string,
    params: {
      path?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: any;
    }
  ) =>
    request<FunctionTestResult>(`/api/functions/${id}/test`, {
      method: "POST",
      body: JSON.stringify(params),
    }),

  // Monitoring Metrics
  getMetrics: (id: string) => request<FunctionMetrics>(`/api/functions/${id}/metrics`),

  // Deployed Source Code
  getCode: (id: string) =>
    request<{ code: string; version: number; status: string }>(`/api/functions/${id}/code`),

  getLogsStreamUrl: (id: string) => `${getApiBase()}/api/functions/${id}/logs`,
  getLogsHistory: (id: string) =>
    request<{ logs: Array<{ timestamp: string; level: string; message: string }> }>(
      `/api/functions/${id}/logs?format=json`
    ),
  pingLogs: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/functions/${id}/logs/ping`, {
      method: "POST",
    }),
};

// ─── CRON & SCHEDULED COMPUTE API ───────────────────────────────────────────

export interface CronJobItem {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  schedule: string;
  timezone: string;
  targetType: "FUNCTION" | "PROJECT" | "SERVICE" | "CONTAINER_EXEC" | "WEBHOOK";
  targetConfig: any;
  misfirePolicy: "SKIP" | "FIRE_LATEST_ONCE" | "CATCH_UP_ALL";
  concurrencyPolicy: "FORBID" | "ALLOW" | "REPLACE" | "QUEUE_SERIALIZE";
  maxConcurrentRuns: number;
  timeoutSeconds: number;
  maxRetries: number;
  retryDelaySeconds: number;
  enabled: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastStatus?: string | null;
  createdAt: string;
  updatedAt: string;
  executions?: CronExecutionItem[];
  _count?: { executions: number; deadLetters: number };
}

export interface CronExecutionItem {
  id: string;
  cronJobId: string;
  triggerType: string;
  status: "SCHEDULED" | "RUNNING" | "SUCCESS" | "FAILED" | "TIMED_OUT" | "SKIPPED_OVERLAP" | "MISFIRE_SKIPPED";
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  exitCode?: number | null;
  httpStatusCode?: number | null;
  errorMessage?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  memoryMbPeak?: number | null;
  cpuMs?: number | null;
  retryAttempt?: number;
}

export interface CronDeadLetterItem {
  id: string;
  cronJobId: string;
  executionId?: string | null;
  failureReason: string;
  payload?: any;
  retryCount: number;
  status: "UNRESOLVED" | "REPLAYED" | "DISCARDED";
  createdAt: string;
  resolvedAt?: string | null;
}

export const cronApi = {
  list: (opts?: RequestOptions) => request<{ ok: boolean; cronJobs: CronJobItem[] }>("/api/crons", opts).then((r) => r.cronJobs || []),
  get: (id: string, opts?: RequestOptions) => request<{ ok: boolean; cronJob: CronJobItem }>(`/api/crons/${id}`, opts).then((r) => r.cronJob),
  create: (data: any) =>
    request<{ ok: boolean; cronJob: CronJobItem }>("/api/crons", {
      method: "POST",
      body: JSON.stringify(data),
    }).then((r) => r.cronJob),
  update: (id: string, data: any) =>
    request<{ ok: boolean; cronJob: CronJobItem }>(`/api/crons/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }).then((r) => r.cronJob),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/api/crons/${id}`, {
      method: "DELETE",
    }),
  trigger: (id: string) =>
    request<{ ok: boolean; message: string; executionId: string }>(`/api/crons/${id}/trigger`, {
      method: "POST",
    }),
  getExecutions: (id: string, page = 1, limit = 15) =>
    request<{ ok: boolean; page: number; limit: number; total: number; totalPages: number; executions: CronExecutionItem[] }>(
      `/api/crons/${id}/executions?page=${page}&limit=${limit}`
    ),
  getExecution: (id: string, execId: string) =>
    request<{ ok: boolean; execution: CronExecutionItem }>(`/api/crons/${id}/executions/${execId}`).then((r) => r.execution),
  getLogsStreamUrl: (id: string, execId: string) => `${getApiBase()}/api/crons/${id}/executions/${execId}/logs/stream`,
  getDeadLetters: (id: string) =>
    request<{ ok: boolean; deadLetters: CronDeadLetterItem[] }>(`/api/crons/${id}/dead-letters`).then((r) => r.deadLetters || []),
  replayDeadLetter: (id: string, dlqId: string) =>
    request<{ ok: boolean; message: string; executionId: string }>(`/api/crons/${id}/dead-letters/${dlqId}/replay`, {
      method: "POST",
    }),
  discardDeadLetter: (id: string, dlqId: string) =>
    request<{ ok: boolean; message: string }>(`/api/crons/${id}/dead-letters/${dlqId}/discard`, {
      method: "POST",
    }),
};

// ─── Whizan Flow Automation API ───────────────────────────────────────────────

export interface WorkflowNodeItem {
  id?: string;
  workflowId?: string;
  nodeKey: string;
  name: string;
  type: string;
  config: Record<string, any>;
  timeoutSeconds?: number;
  maxRetries?: number;
  retryDelaySec?: number;
  continueOnError?: boolean;
  positionX: number;
  positionY: number;
}

export interface WorkflowEdgeItem {
  id?: string;
  workflowId?: string;
  sourceNodeKey: string;
  targetNodeKey: string;
  condition?: string | null;
}

export interface WorkflowItem {
  id: string;
  userId: string;
  projectId?: string | null;
  name: string;
  description?: string | null;
  slug: string;
  visualConfig: Record<string, any>;
  codeDefinition: string;
  enabled: boolean;
  isTemplate: boolean;
  category: string;
  concurrencyPolicy: "FORBID" | "QUEUE" | "ALLOW" | "REPLACE";
  maxConcurrentRuns: number;
  timeoutSeconds: number;
  createdAt: string;
  updatedAt: string;
  nodes?: WorkflowNodeItem[];
  edges?: WorkflowEdgeItem[];
  _count?: { nodes: number; edges: number; runs: number };
  runs?: Array<{
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
  }>;
}

export interface WorkflowRunItem {
  id: string;
  workflowId: string;
  triggerSource: string;
  triggerMetadata: any;
  status: "PENDING" | "RUNNING" | "WAITING_FOR_APPROVAL" | "PAUSED" | "SUCCESS" | "FAILED" | "CANCELLED" | "TIMED_OUT";
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  contextData: any;
  errorMessage?: string | null;
  stepRuns?: WorkflowStepRunItem[];
  approvals?: any[];
  _count?: { stepRuns: number };
}

export interface WorkflowStepRunItem {
  id: string;
  runId: string;
  nodeKey: string;
  nodeType: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  memoizationHash?: string | null;
  outputData?: any;
  exitCode?: number | null;
  httpStatusCode?: number | null;
  stdout?: string | null;
  stderr?: string | null;
  errorMessage?: string | null;
}

export const flowsApi = {
  list: (opts?: RequestOptions) => request<{ ok: boolean; workflows: WorkflowItem[] }>("/api/flows", opts).then((r) => r.workflows || []),
  get: (id: string, opts?: RequestOptions) => request<{ ok: boolean; workflow: WorkflowItem }>(`/api/flows/${id}`, opts).then((r) => r.workflow),
  create: (data: any) =>
    request<{ ok: boolean; workflow: WorkflowItem }>("/api/flows", {
      method: "POST",
      body: JSON.stringify(data),
    }).then((r) => r.workflow),
  update: (id: string, data: any) =>
    request<{ ok: boolean; workflow: WorkflowItem }>(`/api/flows/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }).then((r) => r.workflow),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/api/flows/${id}`, {
      method: "DELETE",
    }),
  trigger: (id: string, metadata?: any) =>
    request<{ ok: boolean; message: string; runId: string }>(`/api/flows/${id}/trigger`, {
      method: "POST",
      body: JSON.stringify({ triggerMetadata: metadata }),
    }),
  getRuns: (id: string, page = 1, limit = 20) =>
    request<{ ok: boolean; page: number; limit: number; total: number; totalPages: number; runs: WorkflowRunItem[] }>(
      `/api/flows/${id}/runs?page=${page}&limit=${limit}`
    ),
  getRun: (id: string, runId: string) =>
    request<{ ok: boolean; run: WorkflowRunItem }>(`/api/flows/${id}/runs/${runId}`).then((r) => r.run),
  getLogsStreamUrl: (id: string, runId: string) => `${getApiBase()}/api/flows/${id}/runs/${runId}/logs/stream`,
  respondApproval: (token: string, approved: boolean, comments?: string) =>
    request<{ ok: boolean; message: string }>(`/api/flows/approvals/${token}/respond`, {
      method: "POST",
      body: JSON.stringify({ approved, comments }),
    }),
  replayRun: (id: string, runId: string) =>
    request<{ ok: boolean; message: string; runId: string }>(`/api/flows/${id}/runs/${runId}/replay`, {
      method: "POST",
    }),
};

export interface SystemStatusResponse {
  vmOnline: boolean;
  status: "ONLINE" | "WAKING_UP" | "MAINTENANCE" | "OFFLINE";
  message: string;
  contactEmail: string;
  contactUrl: string;
  vmHost?: string;
  estimatedSecondsRemaining?: number;
  timestamp: number;
}

export const system = {
  getStatus: (opts?: RequestOptions) =>
    request<SystemStatusResponse>("/api/system/status", { ...opts, ttlMs: 15_000 }),
  wake: (reason?: string) =>
    request<{ status: string; message: string }>("/api/vm/wake", {
      method: "POST",
      body: JSON.stringify({ reason: reason || "dashboard_user_wake" }),
    }),
  sleep: (reason?: string) =>
    request<{ status: string; message: string }>("/api/vm/sleep", {
      method: "POST",
      body: JSON.stringify({ reason: reason || "admin_manual_sleep" }),
    }),
};

export interface AgentChatResponse {
  sessionId: string;
  message: string;
  toolExecutions: Array<{
    name: string;
    parameters: any;
    result?: any;
    error?: string;
  }>;
  pendingAction?: {
    actionId: string;
    toolName: string;
    parameters: any;
    riskTier: string;
    explanation: string;
  } | null;
  clientAction?: {
    type: "NAVIGATE" | "OPEN_URL";
    path?: string;
    url?: string;
  } | null;
  audio?: {
    success: boolean;
    audioBase64?: string;
    format?: string;
    spokenText: string;
    fallbackToBrowserSpeech?: boolean;
  } | null;
}

export const agentApi = {
  chat: (payload: {
    message: string;
    sessionId?: string;
    context?: { pathname?: string; targetId?: string; targetType?: "service" | "project" };
    enableTts?: boolean;
  }) =>
    request<AgentChatResponse>("/api/agent/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /**
   * SSE streaming chat endpoint. Returns the raw Response so the caller
   * can consume the ReadableStream and parse SSE events in real-time.
   */
  streamChat: async (
    payload: {
      message: string;
      sessionId?: string;
      context?: { pathname?: string; targetId?: string; targetType?: "service" | "project" };
      enableTts?: boolean;
    },
    signal?: AbortSignal
  ): Promise<Response> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    let token = getAccessToken();
    if (!token) {
      // Attempt a refresh before streaming
      const res = await fetch(`${getApiBase()}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setAccessToken(data.accessToken);
        token = data.accessToken;
      }
    }

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${getApiBase()}/api/agent/chat/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      credentials: "include",
      signal,
    });

    if (response.status === 401) {
      // Try refresh once
      const refreshRes = await fetch(`${getApiBase()}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setAccessToken(data.accessToken);
        headers["Authorization"] = `Bearer ${data.accessToken}`;

        return fetch(`${getApiBase()}/api/agent/chat/stream`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          credentials: "include",
          signal,
        });
      }
      throw new Error("UNAUTHORIZED");
    }

    if (!response.ok) {
      throw new Error(`Stream error: HTTP ${response.status}`);
    }

    return response;
  },

  approveAction: (payload: {
    actionId: string;
    decision: "APPROVE" | "REJECT";
    modifiedParameters?: Record<string, any>;
  }) =>
    request<{ success: boolean; result?: any; error?: string }>("/api/agent/approve", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getSessions: () =>
    request<Array<{ id: string; title: string; createdAt: string; updatedAt: string }>>("/api/agent/sessions"),

  getSession: (id: string) =>
    request<any>(`/api/agent/sessions/${id}`),

  deleteSession: (id: string) =>
    request<{ success: boolean; message: string }>(`/api/agent/sessions/${id}`, {
      method: "DELETE",
    }),

  tts: (text: string) =>
    request<any>("/api/agent/tts", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
};
