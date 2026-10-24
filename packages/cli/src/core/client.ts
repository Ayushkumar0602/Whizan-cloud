// ─── Whizan Cloud CLI — API Client ───────────────────────────────────────────

import fetch from "node-fetch";
import FormData from "form-data";
import { loadConfig, type WhizanLocalConfig } from "./auth.js";

export class ApiError extends Error {
  statusCode: number;
  data: any;
  constructor(message: string, statusCode: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.data = data;
  }
}

/**
 * Whizan Cloud REST API Client
 * Mirrors the methods from @whizan/mcp-devops WhizanClient
 */
export class WhizanClient {
  private config: WhizanLocalConfig | null = null;

  private async ensureConfig(): Promise<WhizanLocalConfig> {
    if (!this.config) {
      this.config = await loadConfig();
    }
    return this.config;
  }

  private async headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    const cfg = await this.ensureConfig();
    const h: Record<string, string> = { ...extra };
    if (cfg.apiKey) {
      h["Authorization"] = `Bearer ${cfg.apiKey}`;
      h["x-api-key"] = cfg.apiKey;
    }
    return h;
  }

  private async apiUrl(): Promise<string> {
    return (await this.ensureConfig()).apiUrl;
  }

  /** Reload config from disk (useful after login) */
  async reload(): Promise<void> {
    this.config = await loadConfig();
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  async getAuthStatus(): Promise<{ authenticated: boolean; user?: any; message?: string }> {
    const cfg = await this.ensureConfig();
    if (!cfg.apiKey) {
      return { authenticated: false, message: "Not logged in. Run `whizan login`." };
    }
    try {
      const res = await fetch(`${cfg.apiUrl}/api/auth/me`, {
        headers: await this.headers(),
      });
      if (res.status === 401) return { authenticated: false, message: "Invalid or expired API key." };
      if (!res.ok) return { authenticated: false, message: `Auth error: HTTP ${res.status}` };
      const user = await res.json();
      return { authenticated: true, user };
    } catch (err: any) {
      return { authenticated: false, message: `Cannot reach Whizan API: ${err.message}` };
    }
  }

  // ─── System Status ─────────────────────────────────────────────────────────

  async getSystemStatus(): Promise<{
    vmOnline: boolean;
    status: string;
    message: string;
    contactEmail: string;
    contactUrl: string;
  }> {
    const fallback = {
      vmOnline: false,
      status: "MAINTENANCE",
      message: "The administration has temporarily stopped new deployments and serving existing applications until further notice.",
      contactEmail: "ayushkumarjais0602@gmail.com",
      contactUrl: "https://dashboard.whizan.cloud/contact",
    };
    try {
      const res = await fetch(`${await this.apiUrl()}/api/system/status`, {
        headers: await this.headers(),
      });
      if (res.ok) {
        return (await res.json()) as any;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  // ─── Services ──────────────────────────────────────────────────────────────

  async listServices(): Promise<any[]> {
    try {
      const res = await fetch(`${await this.apiUrl()}/api/services`, {
        headers: await this.headers(),
      });
      if (!res.ok) return [];
      return (await res.json()) as any[];
    } catch { return []; }
  }

  async getService(id: string): Promise<any | null> {
    try {
      const res = await fetch(`${await this.apiUrl()}/api/services/${id}`, {
        headers: await this.headers(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  async createService(params: {
    name: string;
    slug: string;
    language?: string;
    rootDir?: string;
    installCommand?: string;
    startCommand?: string;
    internalPort?: number;
    isWorker?: boolean;
    isPublic?: boolean;
    autoSleep?: boolean;
    instanceType?: string;
    envVars?: Record<string, string>;
  }): Promise<any> {
    const isWorker = Boolean(params.isWorker) || (params.internalPort !== undefined && params.internalPort <= 0);
    const res = await fetch(`${await this.apiUrl()}/api/services`, {
      method: "POST",
      headers: await this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: params.name,
        slug: params.slug,
        githubRepoUrl: "direct-upload",
        branch: "main",
        language: params.language || "NODEJS",
        rootDir: params.rootDir || ".",
        installCommand: params.installCommand || "npm install",
        startCommand: params.startCommand || "npm start",
        internalPort: isWorker ? 0 : (params.internalPort || 8000),
        isWorker,
        isPublic: params.isPublic !== undefined ? params.isPublic : true,
        autoSleep: params.autoSleep !== undefined ? params.autoSleep : true,
        instanceType: params.instanceType || "free",
        envVars: params.envVars,
      }),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new ApiError(err.error || `Failed to create service (HTTP ${res.status})`, res.status, err);
    }
    const service: any = await res.json();
    if (params.envVars && Object.keys(params.envVars).length > 0) {
      await this.setEnvVars("service", service.id, params.envVars).catch(() => {});
    }
    return service;
  }

  // ─── Projects ──────────────────────────────────────────────────────────────

  async listProjects(): Promise<any[]> {
    try {
      const res = await fetch(`${await this.apiUrl()}/api/projects`, {
        headers: await this.headers(),
      });
      if (!res.ok) return [];
      return (await res.json()) as any[];
    } catch { return []; }
  }

  async getProject(id: string): Promise<any | null> {
    try {
      const res = await fetch(`${await this.apiUrl()}/api/projects/${id}`, {
        headers: await this.headers(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  async createProject(params: {
    name: string;
    slug: string;
    framework?: string;
    rootDir?: string;
    buildCommand?: string;
    installCommand?: string;
    outputDir?: string;
    envVars?: Record<string, string>;
  }): Promise<any> {
    const isStatic = params.framework === "VITE" || params.framework === "REACT" || params.framework === "ASTRO";
    const outputDir = params.outputDir || (isStatic ? "dist" : ".next");
    const res = await fetch(`${await this.apiUrl()}/api/projects`, {
      method: "POST",
      headers: await this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: params.name,
        slug: params.slug,
        githubRepoUrl: "direct-upload",
        branch: "main",
        framework: params.framework || "NEXTJS",
        rootDir: params.rootDir || ".",
        buildCommand: params.buildCommand || "npm run build",
        installCommand: params.installCommand || "npm install",
        outputDir,
        envVars: params.envVars,
      }),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new ApiError(err.error || `Failed to create project (HTTP ${res.status})`, res.status, err);
    }
    const project: any = await res.json();
    if (params.envVars && Object.keys(params.envVars).length > 0) {
      await this.setEnvVars("project", project.id, params.envVars).catch(() => {});
    }
    return project;
  }

  // ─── Upload & Deploy ───────────────────────────────────────────────────────

  async uploadArchive(targetType: "service" | "project", targetId: string, archiveBuffer: Buffer): Promise<any> {
    const form = new FormData();
    form.append("file", archiveBuffer, {
      filename: `source-${Date.now()}.tar.gz`,
      contentType: "application/gzip",
    });
    const endpoint = targetType === "service"
      ? `services/${targetId}/deploy/upload`
      : `projects/${targetId}/deployments/upload`;
    const res = await fetch(`${await this.apiUrl()}/api/${endpoint}`, {
      method: "POST",
      headers: await this.headers(form.getHeaders()),
      body: form as any,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new ApiError(`Upload failed: ${JSON.stringify(err)}`, res.status, err);
    }
    return res.json();
  }

  // ─── Build Logs ────────────────────────────────────────────────────────────

  async getBuildLogs(deploymentId: string): Promise<{
    deploymentId: string;
    status: string;
    logs: string[];
    errorMessage?: string | null;
    liveUrl?: string | null;
  }> {
    let res = await fetch(`${await this.apiUrl()}/api/services/deployments/${deploymentId}/logs`, {
      headers: await this.headers({ Accept: "application/json" }),
    });
    if (!res.ok && res.status === 404) {
      res = await fetch(`${await this.apiUrl()}/api/projects/deployments/${deploymentId}/logs`, {
        headers: await this.headers({ Accept: "application/json" }),
      });
    }
    if (!res.ok) {
      return { deploymentId, status: "ERROR", logs: [`Failed to retrieve logs: HTTP ${res.status}`] };
    }
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data: any = await res.json();
      return {
        deploymentId,
        status: data.status || "UNKNOWN",
        logs: Array.isArray(data.logs) ? data.logs : [],
        errorMessage: data.errorMessage,
        liveUrl: data.liveUrl,
      };
    }
    const text = await res.text();
    return {
      deploymentId,
      status: "STREAMED",
      logs: text.split("\n").map((l) => l.replace(/^data:\s*/, "").trim()).filter(Boolean),
    };
  }

  // ─── Health Check ──────────────────────────────────────────────────────────

  async checkHealth(urlOrId: string): Promise<{
    ok: boolean;
    status: number;
    message: string;
    effectiveUrl: string;
    isWorker?: boolean;
  }> {
    let url = urlOrId;
    const baseDomain = process.env.BASE_DOMAIN || "whizan.cloud";
    const proto = baseDomain.includes("whizan.cloud") ? "https" : "http";

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      const svc = await this.getService(url);
      if (svc) {
        if (svc.internalPort === 0) {
          const latest = svc.deployments?.[0];
          const alive = latest?.status === "READY";
          return {
            ok: alive,
            status: alive ? 200 : 503,
            isWorker: true,
            effectiveUrl: `worker://service/${svc.slug}`,
            message: alive
              ? `Worker '${svc.name}' is healthy (process running).`
              : `Worker '${svc.name}' is not ready (status: ${latest?.status || "UNKNOWN"}).`,
          };
        }
        url = `${proto}://${svc.slug}.${baseDomain}`;
      } else {
        const proj = await this.getProject(url);
        if (proj) url = `${proto}://${proj.slug}.${baseDomain}`;
      }
    }

    // Auto-normalize https to http for nip.io
    if (url.startsWith("https://") && (url.includes(".nip.io") || url.includes("20.2.136.11"))) {
      url = url.replace(/^https:\/\//i, "http://");
    }

    try {
      const res = await fetch(url, { method: "GET", timeout: 8000 } as any);
      return {
        ok: res.status < 400,
        status: res.status,
        effectiveUrl: url,
        message: res.status < 400
          ? `Healthy at ${url}`
          : `HTTP ${res.status}`,
      };
    } catch (err: any) {
      return { ok: false, status: 0, effectiveUrl: url, message: `Cannot connect: ${err.message}` };
    }
  }

  // ─── Environment Variables ─────────────────────────────────────────────────

  async setEnvVars(
    targetType: "service" | "project",
    targetId: string,
    envVars: Record<string, any>
  ): Promise<Record<string, boolean>> {
    const endpoint = targetType === "service" ? "services" : "projects";
    const results: Record<string, boolean> = {};

    // Try bulk endpoint first
    try {
      const res = await fetch(`${await this.apiUrl()}/api/${endpoint}/${targetId}/env/bulk`, {
        method: "POST",
        headers: await this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ envVars, isSecret: true }),
      });
      if (res.ok) {
        for (const key of Object.keys(envVars)) results[key] = true;
        return results;
      }
    } catch {}

    // Fallback: individual upserts
    for (const [key, rawVal] of Object.entries(envVars)) {
      const value = typeof rawVal === "object" && rawVal !== null ? JSON.stringify(rawVal) : String(rawVal ?? "");
      try {
        const res = await fetch(`${await this.apiUrl()}/api/${endpoint}/${targetId}/env`, {
          method: "POST",
          headers: await this.headers({ "Content-Type": "application/json" }),
          body: JSON.stringify({ key: key.trim(), value, isSecret: true }),
        });
        results[key] = res.ok;
      } catch { results[key] = false; }
    }
    return results;
  }

  async listEnvVars(
    targetType: "service" | "project",
    targetId: string
  ): Promise<any[]> {
    const endpoint = targetType === "service" ? "services" : "projects";
    try {
      const res = await fetch(`${await this.apiUrl()}/api/${endpoint}/${targetId}/env`, {
        headers: await this.headers(),
      });
      if (!res.ok) return [];
      return (await res.json()) as any[];
    } catch {
      return [];
    }
  }

  async deleteEnvVar(
    targetType: "service" | "project",
    targetId: string,
    key: string
  ): Promise<boolean> {
    const endpoint = targetType === "service" ? "services" : "projects";
    try {
      const res = await fetch(`${await this.apiUrl()}/api/${endpoint}/${targetId}/env/${encodeURIComponent(key)}`, {
        method: "DELETE",
        headers: await this.headers(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ─── Redeploy ──────────────────────────────────────────────────────────────

  async redeploy(targetType: "service" | "project", targetId: string): Promise<any> {
    const endpoint = targetType === "service" ? `services/${targetId}/deploy` : `projects/${targetId}/deployments`;
    const res = await fetch(`${await this.apiUrl()}/api/${endpoint}`, {
      method: "POST",
      headers: await this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new ApiError(`Redeploy failed: ${JSON.stringify(err)}`, res.status, err);
    }
    return res.json();
  }

  // ─── Container Exec ────────────────────────────────────────────────────────

  async execContainerCommand(targetType: "service" | "project", targetId: string, command: string): Promise<any> {
    const res = await fetch(`${await this.apiUrl()}/api/containers/exec`, {
      method: "POST",
      headers: await this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ targetType, targetId, command }),
    });
    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new ApiError(data.error || `Exec failed`, res.status, data);
    return data;
  }

  async inspectDeployment(targetType: "project" | "service", targetId: string): Promise<any> {
    const query = new URLSearchParams({ targetType, targetId });
    const res = await fetch(`${await this.apiUrl()}/api/containers/inspect?${query.toString()}`, {
      headers: await this.headers(),
    });
    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new ApiError(data.error || `Inspect failed with HTTP ${res.status}`, res.status, data);
    return data;
  }

  async getAnalytics(targetType: "project" | "service", targetId: string, days = 30): Promise<any> {
    const query = new URLSearchParams({ targetType, targetId, days: String(days) });
    const res = await fetch(`${await this.apiUrl()}/api/containers/analytics?${query.toString()}`, {
      headers: await this.headers(),
    });
    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new ApiError(data.error || `Analytics failed with HTTP ${res.status}`, res.status, data);
    return data;
  }

  // ─── Database ──────────────────────────────────────────────────────────────

  async listDatabases(): Promise<any[]> {
    try {
      const res = await fetch(`${await this.apiUrl()}/api/databases`, {
        headers: await this.headers(),
      });
      if (!res.ok) return [];
      return (await res.json()) as any[];
    } catch {
      return [];
    }
  }

  async getDatabase(id: string): Promise<any | null> {
    try {
      const res = await fetch(`${await this.apiUrl()}/api/databases/${id}`, {
        headers: await this.headers(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async provisionDatabase(params: {
    name: string;
    type?: "POSTGRESQL" | "REDIS" | "MYSQL";
    instanceType?: "starter" | "standard" | "pro";
    enablePooler?: boolean;
  }): Promise<any> {
    const res = await fetch(`${await this.apiUrl()}/api/databases`, {
      method: "POST",
      headers: await this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: params.name,
        type: params.type || "POSTGRESQL",
        instanceType: params.instanceType || "starter",
        enablePooler: params.enablePooler !== undefined ? params.enablePooler : true,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new ApiError(`Database provisioning failed: ${JSON.stringify(err)}`, res.status, err);
    }
    return res.json();
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  async deleteResource(targetType: "service" | "project", targetId: string): Promise<boolean> {
    const endpoint = targetType === "service" ? `services/${targetId}` : `projects/${targetId}`;
    const res = await fetch(`${await this.apiUrl()}/api/${endpoint}`, {
      method: "DELETE",
      headers: await this.headers(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new ApiError(`Delete failed: ${JSON.stringify(err)}`, res.status, err);
    }
    return true;
  }

  // ─── Edge Functions ────────────────────────────────────────────────────────

  async listFunctions(): Promise<any[]> {
    try {
      const res = await fetch(`${await this.apiUrl()}/api/functions`, {
        headers: await this.headers(),
      });
      if (!res.ok) return [];
      return (await res.json()) as any[];
    } catch { return []; }
  }

  async createFunctionService(payload: any): Promise<any> {
    const res = await fetch(`${await this.apiUrl()}/api/functions`, {
      method: "POST",
      headers: await this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new ApiError(data.message || data.error || `HTTP ${res.status}`, res.status, data);
    return data;
  }

  async deployFunction(id: string, code: string): Promise<any> {
    const res = await fetch(`${await this.apiUrl()}/api/functions/${id}/deploy`, {
      method: "POST",
      headers: await this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ code }),
    });
    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new ApiError(data.message || data.error || `HTTP ${res.status}`, res.status, data);
    return data;
  }

  async createFunctionApiKey(id: string, payload: any): Promise<any> {
    const res = await fetch(`${await this.apiUrl()}/api/functions/${id}/keys`, {
      method: "POST",
      headers: await this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new ApiError(data.message || data.error || `HTTP ${res.status}`, res.status, data);
    return data;
  }

  async invokeFunction(
    slug: string,
    options: {
      path?: string;
      method?: string;
      body?: any;
      apiKey?: string;
      headers?: Record<string, string>;
    } = {}
  ): Promise<any> {
    const targetPath = options.path || "/";
    const baseDomain = process.env.BASE_DOMAIN || "whizan.cloud";
    const isWhizanCloud = baseDomain.includes("whizan.cloud");
    const proto = isWhizanCloud ? "https" : "http";
    const routerPort = process.env.ROUTER_PORT || (baseDomain.includes("localhost") ? "8080" : "80");
    const portSuffix = routerPort === "80" || routerPort === "443" || (isWhizanCloud && !process.env.ROUTER_PORT) ? "" : `:${routerPort}`;
    const cleanPath = targetPath.startsWith("/") ? targetPath : "/" + targetPath;
    const url = `${proto}://${slug}.${baseDomain}${portSuffix}${cleanPath}`;

    const headers: Record<string, string> = { ...(options.headers || {}) };
    const cfg = await this.ensureConfig();
    if (options.apiKey) {
      headers["x-api-key"] = options.apiKey;
    } else if (cfg.apiKey) {
      headers["x-api-key"] = cfg.apiKey;
    }

    const fetchOptions: any = {
      method: options.method || (options.body ? "POST" : "GET"),
      headers,
    };
    if (options.body) {
      if (typeof options.body === "string") {
        fetchOptions.body = options.body;
      } else {
        fetchOptions.body = JSON.stringify(options.body);
        if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
      }
    }

    const startTime = Date.now();
    const res = await fetch(url, fetchOptions);
    const durationMs = Date.now() - startTime;
    const contentType = res.headers.get("content-type") || "";

    let data: any;
    if (contentType.includes("application/json")) {
      data = await res.json().catch(() => null);
    } else {
      data = await res.text().catch(() => "");
    }

    return {
      status: res.status,
      ok: res.ok,
      durationMs,
      data,
      url,
    };
  }

  // ─── Cron Jobs ─────────────────────────────────────────────────────────────

  async listCronJobs(): Promise<any[]> {
    const res = await fetch(`${await this.apiUrl()}/api/crons`, {
      headers: await this.headers(),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    return data.cronJobs || [];
  }

  async createCronJob(jobData: any): Promise<any> {
    const res = await fetch(`${await this.apiUrl()}/api/crons`, {
      method: "POST",
      headers: await this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(jobData),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new ApiError(err.error || "Failed to create cron job", res.status, err);
    }
    const data: any = await res.json();
    return data.cronJob;
  }

  async triggerCronJob(id: string): Promise<any> {
    const res = await fetch(`${await this.apiUrl()}/api/crons/${id}/trigger`, {
      method: "POST",
      headers: await this.headers(),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new ApiError(err.error || "Failed to trigger cron", res.status, err);
    }
    return res.json();
  }

  // ─── Storage (Cloudflare R2) ─────────────────────────────────────────────

  async listStorageBuckets(): Promise<any[]> {
    const res = await fetch(`${await this.apiUrl()}/api/storage/v1/buckets`, {
      headers: await this.headers(),
    });
    if (!res.ok) throw new ApiError(`Failed to list buckets: HTTP ${res.status}`, res.status);
    return (await res.json()) as any[];
  }

  async createStorageBucket(params: { name: string; description?: string; isPublic?: boolean }): Promise<any> {
    const res = await fetch(`${await this.apiUrl()}/api/storage/v1/buckets`, {
      method: "POST",
      headers: await this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      throw new ApiError(err.message || err.error || "Failed to create bucket", res.status, err);
    }
    return res.json();
  }

  async deleteStorageBucket(bucketId: string, force = false): Promise<any> {
    const res = await fetch(`${await this.apiUrl()}/api/storage/v1/buckets/${bucketId}?force=${force}`, {
      method: "DELETE",
      headers: await this.headers(),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      throw new ApiError(err.message || err.error || "Failed to delete bucket", res.status, err);
    }
    return res.json();
  }

  async listStorageObjects(bucketId: string, prefix?: string, limit = 50): Promise<any> {
    const params = new URLSearchParams();
    if (prefix) params.set("prefix", prefix);
    params.set("limit", String(limit));
    const res = await fetch(`${await this.apiUrl()}/api/storage/v1/buckets/${bucketId}/objects?${params}`, {
      headers: await this.headers(),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      throw new ApiError(err.message || "Failed to list objects", res.status, err);
    }
    return res.json();
  }

  async uploadStorageObject(bucketId: string, objectPath: string, buffer: Buffer, mimeType?: string): Promise<any> {
    const res = await fetch(`${await this.apiUrl()}/api/storage/v1/buckets/${bucketId}/objects/upload`, {
      method: "POST",
      headers: await this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        objectPath,
        mimeType: mimeType || "application/octet-stream",
        data: buffer.toString("base64"),
      }),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      throw new ApiError(err.message || err.error || "Failed to upload file", res.status, err);
    }
    return res.json();
  }

  async downloadStorageObject(bucketId: string, objectPath: string): Promise<Buffer> {
    const res = await fetch(
      `${await this.apiUrl()}/api/storage/v1/buckets/${bucketId}/objects/download?path=${encodeURIComponent(objectPath)}`,
      { headers: await this.headers() }
    );
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      throw new ApiError(err.message || "Failed to download object", res.status, err);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async deleteStorageObject(bucketId: string, objectPath: string): Promise<any> {
    const res = await fetch(
      `${await this.apiUrl()}/api/storage/v1/buckets/${bucketId}/objects?path=${encodeURIComponent(objectPath)}`,
      {
        method: "DELETE",
        headers: await this.headers(),
      }
    );
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      throw new ApiError(err.message || "Failed to delete object", res.status, err);
    }
    return res.json();
  }

  async copyStorageObject(srcBucket: string, srcPath: string, destBucket: string, destPath: string): Promise<any> {
    const res = await fetch(`${await this.apiUrl()}/api/storage/v1/buckets/${srcBucket}/objects/copy`, {
      method: "POST",
      headers: await this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ srcPath, destBucket, destPath }),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      throw new ApiError(err.message || "Failed to copy object", res.status, err);
    }
    return res.json();
  }

  async getStorageUsage(): Promise<any> {
    const res = await fetch(`${await this.apiUrl()}/api/storage/v1/usage`, {
      headers: await this.headers(),
    });
    if (!res.ok) throw new ApiError(`Failed to fetch storage usage: HTTP ${res.status}`, res.status);
    return res.json();
  }

  async getStorageLimits(): Promise<any> {
    const res = await fetch(`${await this.apiUrl()}/api/storage/v1/limits`, {
      headers: await this.headers(),
    });
    if (!res.ok) throw new ApiError(`Failed to fetch storage limits: HTTP ${res.status}`, res.status);
    return res.json();
  }
}

/** Singleton instance */
export const client = new WhizanClient();
