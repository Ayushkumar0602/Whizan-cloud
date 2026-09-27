/**
 * Central API client for the Hostify dashboard.
 * Handles auth token refresh automatically on 401.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://whizan-cloud-service.onrender.com";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) return null;
  const data = await res.json();
  accessToken = data.accessToken;
  return accessToken;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  // Auto-refresh on 401
  if (res.status === 401 && path !== "/api/auth/refresh") {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, {
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

// ─── Auth ──────────────────────────────────────────────────────────────────

export const auth = {
  register: (data: { email: string; password: string; name?: string }) =>
    request<{ accessToken: string; user: User }>("/api/auth/register", {
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
  list: () => request<ProjectWithLatestDeploy[]>("/api/projects"),

  get: (id: string) => request<ProjectWithDeployments>(`/api/projects/${id}`),
  getAnalytics: (id: string) => request<any[]>(`/api/projects/${id}/analytics`),

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

  trigger: (projectId: string) =>
    request<Deployment>(`/api/projects/${projectId}/deployments`, {
      method: "POST",
      body: JSON.stringify({}),
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
  createdAt: string;
};

export type Project = {
  id: string;
  userId: string;
  name: string;
  slug: string;
  githubRepoUrl: string;
  branch: string;
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
  killContainer: (containerId: string) => request(`/api/admin/containers/${containerId}`, { method: "DELETE" }),
  deleteFile: (path: string) => request(`/api/admin/files/delete`, { method: "POST", body: JSON.stringify({ path }) }),
  getLogs: (service: string, type: string) => request<{logs: string}>(`/api/admin/logs/${service}/${type}`),
  getContainerLogs: (containerId: string) => request<{logs: string}>(`/api/admin/containers/${containerId}/logs`),
  getDatabaseStats: () => request<any>(`/api/admin/database/stats`),
  restartService: (service: string) => request(`/api/admin/restart/${service}`, { method: "POST" }),
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

export const services = {
  list: () => request<ServiceWithLatestDeploy[]>("/api/services"),
  get: (id: string) => request<ServiceWithDetails>(`/api/services/${id}`),
  create: (data: CreateServiceData) => request<BackendService>("/api/services", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CreateServiceData>) => request<BackendService>(`/api/services/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => request(`/api/services/${id}`, { method: "DELETE" }),
  deploy: (id: string) => request<ServiceDeployment>(`/api/services/${id}/deploy`, { method: "POST" }),
  getDeployment: (id: string, dId: string) => request<ServiceDeployment>(`/api/services/deployments/${dId}`),
  getEnv: (id: string) => request<ServiceEnvVariable[]>(`/api/services/${id}/env`),
  setEnv: (id: string, key: string, value: string, isSecret = true) => request<{id:string}>(`/api/services/${id}/env`, { method: "POST", body: JSON.stringify({ key, value, isSecret }) }),
  deleteEnv: (id: string, key: string) => request(`/api/services/${id}/env/${key}`, { method: "DELETE" }),
  getMetrics: (id: string) => request<ServiceMetricsResponse>(`/api/services/${id}/metrics`),
  streamMetrics: (id: string): EventSource => {
    const token = getAccessToken();
    return new EventSource(`${API_BASE}/api/services/${id}/metrics/stream?token=${token}`);
  },
  getMeshCatalog: () => request<MeshServiceItem[]>("/api/services/mesh/catalog"),
  pingMesh: (data: MeshPingRequest) => request<MeshPingResponse>("/api/services/mesh/ping", { method: "POST", body: JSON.stringify(data) }),
};
