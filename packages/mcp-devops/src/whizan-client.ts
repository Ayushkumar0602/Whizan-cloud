import fetch from "node-fetch";
import FormData from "form-data";
import fs from "fs/promises";
import path from "path";
import os from "os";

export class WhizanApiError extends Error {
  statusCode: number;
  data: any;

  constructor(message: string, statusCode: number, data: any) {
    super(message);
    this.name = "WhizanApiError";
    this.statusCode = statusCode;
    this.data = data;
  }
}

export interface WhizanConfig {
  apiUrl: string;
  apiKey?: string;
}

const CONFIG_PATH = path.join(os.homedir(), ".whizan", "config.json");

export class WhizanClient {
  private config: WhizanConfig;

  constructor() {
    this.config = {
      apiUrl: process.env.WHIZAN_API_URL || "https://api.whizan.cloud",
      apiKey: process.env.WHIZAN_API_KEY,
    };
  }

  async loadConfig(): Promise<void> {
    try {
      const data = await fs.readFile(CONFIG_PATH, "utf8");
      const saved = JSON.parse(data);
      if (saved.apiUrl && !process.env.WHIZAN_API_URL) this.config.apiUrl = saved.apiUrl;
      if (saved.apiKey && !process.env.WHIZAN_API_KEY) this.config.apiKey = saved.apiKey;
    } catch {
      // Config file doesn't exist yet
    }
  }

  async saveConfig(updates: Partial<WhizanConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
    await fs.writeFile(CONFIG_PATH, JSON.stringify(this.config, null, 2), "utf8");
  }

  async clearConfig(): Promise<void> {
    try {
      await fs.unlink(CONFIG_PATH);
    } catch { }
    this.config.apiKey = undefined;
  }

  static getConfigPath(): string {
    return CONFIG_PATH;
  }

  getApiUrl(): string {
    return this.config.apiUrl;
  }

  getHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
      headers["x-api-key"] = this.config.apiKey;
    }
    return headers;
  }

  async getAuthStatus(): Promise<any> {
    await this.loadConfig();
    if (!this.config.apiKey) {
      return { authenticated: false, message: "No API key configured. Provide WHIZAN_API_KEY or run whizan_login." };
    }

    try {
      const res = await fetch(`${this.config.apiUrl}/api/auth/me`, {
        headers: this.getHeaders(),
      });
      if (res.status === 401) {
        return { authenticated: false, message: "Invalid or expired API key." };
      }
      if (!res.ok) {
        return { authenticated: false, message: `Auth error: HTTP ${res.status}` };
      }
      const user = await res.json();
      return { authenticated: true, user, apiUrl: this.config.apiUrl };
    } catch (err: any) {
      return { authenticated: false, message: `Could not reach Whizan API at ${this.config.apiUrl}: ${err.message}` };
    }
  }

  async getSystemStatus(): Promise<{
    vmOnline: boolean;
    status: string;
    message: string;
    contactEmail: string;
    contactUrl: string;
  }> {
    await this.loadConfig();
    const fallback = {
      vmOnline: false,
      status: "MAINTENANCE",
      message: "The administration has temporarily stopped new deployments and serving existing applications until further notice.",
      contactEmail: "ayushkumarjais0602@gmail.com",
      contactUrl: "https://dashboard.whizan.cloud/contact",
    };
    try {
      const res = await fetch(`${this.config.apiUrl}/api/system/status`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        return (await res.json()) as any;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  async listProjects(): Promise<any[]> {
    await this.loadConfig();
    try {
      const res = await fetch(`${this.config.apiUrl}/api/projects`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) return [];
      return (await res.json()) as any[];
    } catch {
      return [];
    }
  }

  async listServices(): Promise<any[]> {
    await this.loadConfig();
    try {
      const res = await fetch(`${this.config.apiUrl}/api/services`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) return [];
      return (await res.json()) as any[];
    } catch {
      return [];
    }
  }

  async getProject(id: string): Promise<any | null> {
    await this.loadConfig();
    try {
      const res = await fetch(`${this.config.apiUrl}/api/projects/${id}`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async getService(id: string): Promise<any | null> {
    await this.loadConfig();
    try {
      const res = await fetch(`${this.config.apiUrl}/api/services/${id}`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
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
    guardrailRejectReason?: string;
  }): Promise<any> {
    await this.loadConfig();
    const isWorker = Boolean(params.isWorker) || (params.internalPort !== undefined && params.internalPort <= 0);
    const res = await fetch(`${this.config.apiUrl}/api/services`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
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
        autoSleep: params.autoSleep !== undefined ? params.autoSleep : false,
        instanceType: params.instanceType || "starter",
        envVars: params.envVars,
        guardrailRejectReason: params.guardrailRejectReason,
      }),
    });

    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.error || `Failed to create backend service (HTTP ${res.status})`, res.status, err);
    }

    const service: any = await res.json();

    // Ensure all env vars are saved via bulk endpoint
    if (params.envVars && Object.keys(params.envVars).length > 0) {
      await this.setEnvVars("service", service.id, params.envVars).catch(() => { });
    }

    return service;
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
    await this.loadConfig();
    const isStaticFrontend = params.framework === "VITE" || params.framework === "REACT" || params.framework === "ASTRO";
    const resolvedOutputDir = params.outputDir && (params.outputDir !== ".next" || !isStaticFrontend)
      ? params.outputDir
      : (isStaticFrontend ? "dist" : ".next");

    const res = await fetch(`${this.config.apiUrl}/api/projects`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: params.name,
        slug: params.slug,
        githubRepoUrl: "direct-upload",
        branch: "main",
        framework: params.framework || "NEXTJS",
        rootDir: params.rootDir || ".",
        buildCommand: params.buildCommand || "npm run build",
        installCommand: params.installCommand || "npm install",
        outputDir: resolvedOutputDir,
        envVars: params.envVars,
      }),
    });

    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.error || `Failed to create project (HTTP ${res.status})`, res.status, err);
    }

    const project: any = await res.json();

    if (params.envVars && Object.keys(params.envVars).length > 0) {
      await this.setEnvVars("project", project.id, params.envVars).catch(() => { });
    }

    return project;
  }

  async uploadServiceArchive(serviceId: string, archiveBuffer: Buffer): Promise<any> {
    await this.loadConfig();
    const form = new FormData();
    form.append("file", archiveBuffer, {
      filename: `source-${Date.now()}.tar.gz`,
      contentType: "application/gzip",
    });

    const res = await fetch(`${this.config.apiUrl}/api/services/${serviceId}/deploy/upload`, {
      method: "POST",
      headers: this.getHeaders(form.getHeaders()),
      body: form as any,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(`Direct upload deployment failed: ${JSON.stringify(err)}`);
    }

    return res.json();
  }

  async uploadProjectArchive(projectId: string, archiveBuffer: Buffer): Promise<any> {
    await this.loadConfig();
    const form = new FormData();
    form.append("file", archiveBuffer, {
      filename: `source-${Date.now()}.tar.gz`,
      contentType: "application/gzip",
    });

    const res = await fetch(`${this.config.apiUrl}/api/projects/${projectId}/deployments/upload`, {
      method: "POST",
      headers: this.getHeaders(form.getHeaders()),
      body: form as any,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(`Direct upload deployment failed: ${JSON.stringify(err)}`);
    }

    return res.json();
  }

  async provisionDatabase(params: {
    name: string;
    type?: "POSTGRESQL" | "REDIS" | "MYSQL";
    instanceType?: "starter" | "standard" | "pro";
    enablePooler?: boolean;
  }): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/databases`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: params.name,
        type: params.type || "POSTGRESQL",
        instanceType: params.instanceType || "starter",
        enablePooler: params.enablePooler !== undefined ? params.enablePooler : true,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(`Database provisioning failed: ${JSON.stringify(err)}`);
    }

    return res.json();
  }

  async setEnvVars(
    targetType: "service" | "project" | "function",
    targetId: string,
    envVars: Record<string, any>
  ): Promise<Record<string, boolean>> {
    await this.loadConfig();
    const endpoint = targetType === "function" ? "functions" : (targetType === "service" ? "services" : "projects");
    const results: Record<string, boolean> = {};

    // 1. Try single-request bulk endpoint
    try {
      const bulkRes = await fetch(`${this.config.apiUrl}/api/${endpoint}/${targetId}/env/bulk`, {
        method: "POST",
        headers: this.getHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ envVars, isSecret: true }),
      });

      if (bulkRes.ok) {
        for (const key of Object.keys(envVars)) {
          results[key] = true;
        }
        return results;
      }
    } catch {
      // Fall through to individual upserts
    }

    // 2. Fallback: Sequential upsert with proper value stringification
    for (const [rawKey, rawVal] of Object.entries(envVars)) {
      const key = String(rawKey).trim();
      const valStr = typeof rawVal === "object" && rawVal !== null ? JSON.stringify(rawVal) : String(rawVal ?? "");
      try {
        const res = await fetch(`${this.config.apiUrl}/api/${endpoint}/${targetId}/env`, {
          method: "POST",
          headers: this.getHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ key, value: valStr, isSecret: true }),
        });
        results[key] = res.ok;
      } catch {
        results[key] = false;
      }
    }
    return results;
  }

  async getBuildLogs(deploymentId: string): Promise<{ deploymentId: string; status: string; logs: string[]; errorMessage?: string | null; liveUrl?: string | null }> {
    await this.loadConfig();
    // Try services deployment logs first with JSON accept header
    let res = await fetch(`${this.config.apiUrl}/api/services/deployments/${deploymentId}/logs`, {
      headers: this.getHeaders({ Accept: "application/json" }),
    });
    if (!res.ok && res.status === 404) {
      res = await fetch(`${this.config.apiUrl}/api/projects/deployments/${deploymentId}/logs`, {
        headers: this.getHeaders({ Accept: "application/json" }),
      });
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        deploymentId,
        status: "ERROR",
        logs: [`[Failed to retrieve logs from server: HTTP ${res.status} ${errText}]`],
      };
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
    const lines = text
      .split("\n")
      .map((line) => line.replace(/^data:\s*/, "").trim())
      .filter((line) => line && line !== "[DONE]" && line !== "__DONE__");

    return {
      deploymentId,
      status: "STREAMED",
      logs: lines,
    };
  }

  async checkHealth(rawUrlOrId: string): Promise<{ ok: boolean; status: number; message: string; effectiveUrl: string; isWorker?: boolean }> {
    let url = rawUrlOrId;

    // If a service/project ID or slug was passed instead of a full HTTP URL
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      const baseDomain = process.env.BASE_DOMAIN || "whizan.cloud";
      const svc = await this.getService(url);
      if (svc) {
        // If it's a background queue worker with internalPort: 0
        if (svc.internalPort === 0) {
          const latestDeploy = svc.deployments?.[0];
          const isAlive = latestDeploy?.status === "READY";
          return {
            ok: isAlive,
            status: isAlive ? 200 : 503,
            isWorker: true,
            effectiveUrl: `worker://service/${svc.slug}`,
            message: isAlive
              ? `✓ Background queue worker '${svc.name}' is healthy and running (process liveness confirmed).`
              : `Background queue worker '${svc.name}' is not ready (current status: ${latestDeploy?.status || "UNKNOWN"}).`,
          };
        }
        const proto = baseDomain.includes("whizan.cloud") ? "https" : "http";
        url = `${proto}://${svc.slug}.${baseDomain}`;
      } else {
        const proj = await this.getProject(url);
        if (proj) {
          const proto = baseDomain.includes("whizan.cloud") ? "https" : "http";
          url = `${proto}://${proj.slug}.${baseDomain}`;
        }
      }
    }

    // Whizan Cloud Edge Router listens on Port 80 (HTTP). Port 443 (HTTPS) is not bound.
    // If the client supplies https:// for a nip.io domain or cluster IP, automatically normalize to http://.
    if (url.startsWith("https://") && (url.includes(".nip.io") || url.includes("20.2.136.11"))) {
      url = url.replace(/^https:\/\//i, "http://");
    }

    try {
      const res = await fetch(url, { method: "GET", timeout: 8000 } as any);
      return {
        ok: res.status < 400,
        status: res.status,
        effectiveUrl: url,
        message:
          res.status < 400
            ? `Service healthy and reachable at ${url}.${rawUrlOrId.startsWith("https://") ? " (Note: Automatically converted https:// to http:// because Edge Router operates on Port 80)." : ""}`
            : `Received HTTP status ${res.status}`,
      };
    } catch (err: any) {
      // In case rawUrl was https and failed, attempt immediate http fallback
      if (rawUrlOrId.startsWith("https://") && url === rawUrlOrId) {
        try {
          const fallbackUrl = rawUrlOrId.replace(/^https:\/\//i, "http://");
          const fallbackRes = await fetch(fallbackUrl, { method: "GET", timeout: 8000 } as any);
          return {
            ok: fallbackRes.status < 400,
            status: fallbackRes.status,
            effectiveUrl: fallbackUrl,
            message: `Service healthy and reachable at ${fallbackUrl}. (Note: HTTPS port 443 was refused; automatically fell back to HTTP port 80).`,
          };
        } catch { }
      }
      return { ok: false, status: 0, effectiveUrl: url, message: `Could not connect to ${url}: ${err.message}` };
    }
  }

  async redeploy(
    targetType: "service" | "project",
    targetId: string,
    options?: { githubRepoUrl?: string; branch?: string; commitMessage?: string }
  ): Promise<any> {
    await this.loadConfig();
    const endpoint = targetType === "service" ? `services/${targetId}/deploy` : `projects/${targetId}/deployments`;
    const res = await fetch(`${this.config.apiUrl}/api/${endpoint}`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(options || {}),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(`Redeployment failed: ${JSON.stringify(err)}`);
    }

    return res.json();
  }

  async linkGitRepo(
    targetType: "service" | "project",
    targetId: string,
    githubRepoUrl: string,
    branch = "main",
    deployNow = true
  ): Promise<any> {
    await this.loadConfig();
    // Update repository setting on the service or project
    const updateEndpoint = targetType === "service" ? `services/${targetId}` : `projects/${targetId}`;
    const updateMethod = targetType === "service" ? "PUT" : "PATCH";

    const updateRes = await fetch(`${this.config.apiUrl}/api/${updateEndpoint}`, {
      method: updateMethod,
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ githubRepoUrl, branch }),
    });

    if (!updateRes.ok) {
      const err = await updateRes.json().catch(() => ({ error: `HTTP ${updateRes.status}` }));
      throw new Error(`Failed to update Git repository: ${JSON.stringify(err)}`);
    }

    const updatedEntity = await updateRes.json();

    let deployment = null;
    if (deployNow) {
      deployment = await this.redeploy(targetType, targetId, {
        githubRepoUrl,
        branch,
        commitMessage: `Linked and deployed from ${githubRepoUrl}`,
      });
    }

    return {
      entity: updatedEntity,
      deployment,
    };
  }

  async deleteResource(targetType: "service" | "project", targetId: string): Promise<boolean> {
    await this.loadConfig();
    const endpoint = targetType === "service" ? `services/${targetId}` : `projects/${targetId}`;
    const res = await fetch(`${this.config.apiUrl}/api/${endpoint}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(`Failed to delete ${targetType}: ${JSON.stringify(err)}`);
    }

    return true;
  }

  async execContainerCommand(params: {
    targetType: "project" | "service";
    targetId: string;
    command: string;
  }): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number; error?: string }> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/containers/exec`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(params),
    });

    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) {
      throw new Error(data.error || `Container exec failed with HTTP ${res.status}`);
    }
    return data;
  }

  async inspectDeployment(params: {
    targetType: "project" | "service";
    targetId: string;
  }): Promise<any> {
    await this.loadConfig();
    const query = new URLSearchParams({
      targetType: params.targetType,
      targetId: params.targetId,
    });
    const res = await fetch(`${this.config.apiUrl}/api/containers/inspect?${query.toString()}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) {
      throw new Error(data.error || `Inspect failed with HTTP ${res.status}`);
    }
    return data;
  }

  async getAnalytics(params: {
    targetType: "project" | "service";
    targetId: string;
    days?: number;
  }): Promise<any> {
    await this.loadConfig();
    const query = new URLSearchParams({
      targetType: params.targetType,
      targetId: params.targetId,
      days: String(params.days || 30),
    });
    const res = await fetch(`${this.config.apiUrl}/api/containers/analytics?${query.toString()}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) {
      throw new Error(data.error || `Analytics query failed with HTTP ${res.status}`);
    }
    return data;
  }

  async getApplicationLogs(params: {
    targetType: "project" | "service";
    targetId: string;
    tail?: number;
    timestamps?: boolean;
  }): Promise<{ success: boolean; logs: string; containerId: string | null; error?: string }> {
    await this.loadConfig();
    const query = new URLSearchParams({
      targetType: params.targetType,
      targetId: params.targetId,
      tail: String(params.tail || 200),
      timestamps: params.timestamps ? "true" : "false",
    });
    const res = await fetch(`${this.config.apiUrl}/api/containers/logs?${query.toString()}`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) {
      throw new Error(data.error || `Failed to fetch application logs: HTTP ${res.status}`);
    }
    return data;
  }

  // ─── Edge Functions API ─────────────────────────────────────────────────────

  async listFunctions(): Promise<any[]> {
    await this.loadConfig();
    try {
      const res = await fetch(`${this.config.apiUrl}/api/functions`, {
        headers: this.getHeaders(),
      });
      if (!res.ok) return [];
      return (await res.json()) as any[];
    } catch {
      return [];
    }
  }

  async getFunction(id: string): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/functions/${id}`, {
      headers: this.getHeaders(),
    });
    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  }

  async createFunctionService(payload: any): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/functions`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  }

  async deployFunction(id: string, code: string): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/functions/${id}/deploy`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ code }),
    });
    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  }

  async createFunctionApiKey(id: string, payload: any): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/functions/${id}/keys`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  }

  async getFunctionEndpoints(id: string): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/functions/${id}/endpoints`, {
      headers: this.getHeaders(),
    });
    const data: any = await res.json().catch(() => []);
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  }

  async configureFunctionEndpoint(
    id: string,
    payload: {
      endpointId?: string;
      routePath: string;
      name?: string;
      isPublic: boolean;
      httpMethods?: string[];
      memoryLimit?: number;
      timeoutSeconds?: number;
      handlerName?: string;
    }
  ): Promise<any> {
    await this.loadConfig();
    const cleanPath = payload.routePath.startsWith("/") ? payload.routePath : `/${payload.routePath}`;

    // If endpointId is provided, update directly
    if (payload.endpointId) {
      const res = await fetch(`${this.config.apiUrl}/api/functions/${id}/endpoints/${payload.endpointId}`, {
        method: "PUT",
        headers: this.getHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      return data;
    }

    // Otherwise check if an endpoint already exists for routePath
    const existing = await this.getFunctionEndpoints(id).catch(() => []);
    const match = Array.isArray(existing) ? existing.find((e: any) => e.routePath.toLowerCase() === cleanPath.toLowerCase()) : null;

    if (match) {
      const res = await fetch(`${this.config.apiUrl}/api/functions/${id}/endpoints/${match.id}`, {
        method: "PUT",
        headers: this.getHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      return data;
    }

    // If not found, create new endpoint
    const res = await fetch(`${this.config.apiUrl}/api/functions/${id}/endpoints`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
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
    }
  ): Promise<any> {
    await this.loadConfig();
    const targetPath = options.path || "/";
    const baseDomain = process.env.BASE_DOMAIN || "whizan.cloud";
    const isWhizanCloud = baseDomain.includes("whizan.cloud");
    const proto = isWhizanCloud ? "https" : "http";
    const routerPort = process.env.ROUTER_PORT || (baseDomain.includes("localhost") ? "8080" : "80");
    const portSuffix = routerPort === "80" || routerPort === "443" || (isWhizanCloud && !process.env.ROUTER_PORT) ? "" : `:${routerPort}`;
    const cleanPath = targetPath.startsWith("/") ? targetPath : "/" + targetPath;
    const url = `${proto}://${slug}.${baseDomain}${portSuffix}${cleanPath}`;

    const headers: Record<string, string> = {
      ...(options.headers || {}),
    };
    if (options.apiKey) {
      headers["x-api-key"] = options.apiKey;
    } else if (this.config.apiKey) {
      headers["x-api-key"] = this.config.apiKey;
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

    const startTime = performance.now();
    const res = await fetch(url, fetchOptions);
    const durationMs = Number((performance.now() - startTime).toFixed(2));
    const contentType = res.headers.get("content-type") || "";
    let data: any;
    if (contentType.includes("application/json")) {
      data = await res.json().catch(() => null);
    } else {
      data = await res.text();
    }

    return {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      data,
      durationMs,
      url,
    };
  }

  async getFunctionLogs(id: string): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/functions/${id}`, {
      headers: this.getHeaders(),
    });
    const fn: any = await res.json();
    return {
      serviceId: id,
      name: fn.name,
      slug: fn.slug,
      deployments: fn.deployments,
      endpoints: fn.endpoints,
    };
  }

  // ─── CRON & SCHEDULED JOBS ────────────────────────────────────────────────
  async listCronJobs(): Promise<any[]> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/crons`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.error || "Failed to list cron jobs", res.status, err);
    }
    const data: any = await res.json();
    return data.cronJobs || [];
  }

  async createCronJob(jobData: {
    name: string;
    description?: string;
    schedule: string;
    timezone?: string;
    target: any;
    misfirePolicy?: "SKIP" | "FIRE_LATEST_ONCE" | "CATCH_UP_ALL";
    concurrencyPolicy?: "FORBID" | "ALLOW" | "REPLACE" | "QUEUE_SERIALIZE";
    maxConcurrentRuns?: number;
    timeoutSeconds?: number;
    maxRetries?: number;
    retryDelaySeconds?: number;
    enabled?: boolean;
  }): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/crons`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(jobData),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.error || "Failed to create cron job", res.status, err);
    }
    const data: any = await res.json();
    return data.cronJob;
  }

  async triggerCronJob(id: string): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/crons/${id}/trigger`, {
      method: "POST",
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.error || "Failed to trigger cron job", res.status, err);
    }
    return res.json();
  }

  async getCronHistory(id: string, limit = 10): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/crons/${id}/executions?limit=${limit}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.error || "Failed to get cron history", res.status, err);
    }
    return res.json();
  }

  // ─── Whizan Flow Automation Methods ──────────────────────────────────────────

  async createWorkflow(payload: any): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/flows`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.error || "Failed to create workflow", res.status, err);
    }
    const data: any = await res.json();
    return data.workflow;
  }

  async listWorkflows(): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/flows`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.error || "Failed to list workflows", res.status, err);
    }
    const data: any = await res.json();
    return data.workflows;
  }

  async getWorkflow(id: string): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/flows/${id}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.error || "Failed to fetch workflow", res.status, err);
    }
    const data: any = await res.json();
    return data.workflow;
  }

  async triggerWorkflow(id: string, metadata?: any): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/flows/${id}/trigger`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ triggerMetadata: metadata }),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.error || "Failed to trigger workflow", res.status, err);
    }
    return res.json();
  }

  async getWorkflowRun(workflowId: string, runId: string): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/flows/${workflowId}/runs/${runId}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.error || "Failed to fetch workflow run", res.status, err);
    }
    const data: any = await res.json();
    return data.run;
  }

  async respondWorkflowApproval(token: string, approved: boolean, comments?: string): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/flows/approvals/${token}/respond`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ approved, comments }),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.error || "Failed to respond to workflow approval", res.status, err);
    }
    return res.json();
  }

  async replayWorkflowRun(workflowId: string, runId: string): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/flows/${workflowId}/runs/${runId}/replay`, {
      method: "POST",
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.error || "Failed to replay workflow run", res.status, err);
    }
    return res.json();
  }

  // ─── Storage (Cloudflare R2) ─────────────────────────────────────────────

  async listStorageBuckets(): Promise<any[]> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/storage/v1/buckets`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.error || "Failed to list buckets", res.status, err);
    }
    return (await res.json()) as any[];
  }

  async createStorageBucket(params: { name: string; description?: string; isPublic?: boolean }): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/storage/v1/buckets`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.message || err.error || "Failed to create bucket", res.status, err);
    }
    return res.json();
  }

  async deleteStorageBucket(bucketId: string, force = false): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/storage/v1/buckets/${bucketId}?force=${force}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.message || err.error || "Failed to delete bucket", res.status, err);
    }
    return res.json();
  }

  async listStorageObjects(bucketId: string, prefix?: string, limit = 50): Promise<any> {
    await this.loadConfig();
    const params = new URLSearchParams();
    if (prefix) params.set("prefix", prefix);
    params.set("limit", String(limit));
    const res = await fetch(`${this.config.apiUrl}/api/storage/v1/buckets/${bucketId}/objects?${params}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.message || "Failed to list objects", res.status, err);
    }
    return res.json();
  }

  async uploadStorageObject(bucketId: string, objectPath: string, buffer: Buffer, mimeType?: string): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/storage/v1/buckets/${bucketId}/objects/upload`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        objectPath,
        mimeType: mimeType || "application/octet-stream",
        data: buffer.toString("base64"),
      }),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.message || err.error || "Failed to upload file", res.status, err);
    }
    return res.json();
  }

  async downloadStorageObject(bucketId: string, objectPath: string): Promise<Buffer> {
    await this.loadConfig();
    const res = await fetch(
      `${this.config.apiUrl}/api/storage/v1/buckets/${bucketId}/objects/download?path=${encodeURIComponent(objectPath)}`,
      { headers: this.getHeaders() }
    );
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.message || "Failed to download object", res.status, err);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async deleteStorageObject(bucketId: string, objectPath: string): Promise<any> {
    await this.loadConfig();
    const res = await fetch(
      `${this.config.apiUrl}/api/storage/v1/buckets/${bucketId}/objects?path=${encodeURIComponent(objectPath)}`,
      {
        method: "DELETE",
        headers: this.getHeaders(),
      }
    );
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.message || "Failed to delete object", res.status, err);
    }
    return res.json();
  }

  async getStorageUsage(): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/storage/v1/usage`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.error || "Failed to get storage usage", res.status, err);
    }
    return res.json();
  }

  async getStorageLimits(): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/storage/v1/limits`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new WhizanApiError(err.error || "Failed to get storage limits", res.status, err);
    }
    return res.json();
  }

  async createStorageApiKey(params: {
    name: string;
    permission?: "READ_WRITE" | "READ_ONLY";
    bucketId?: string;
  }): Promise<{ success: boolean; key: any }> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/storage/v1/keys`, {
      method: "POST",
      headers: this.getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        name: params.name,
        permission: params.permission || "READ_WRITE",
        bucketId: params.bucketId || undefined,
      }),
    });

    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) {
      throw new WhizanApiError(data.message || data.error || "Failed to create Storage API Key", res.status, data);
    }
    return data;
  }

  async listStorageApiKeys(): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/storage/v1/keys`, {
      method: "GET",
      headers: this.getHeaders(),
    });

    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) {
      throw new WhizanApiError(data.message || data.error || "Failed to list Storage API Keys", res.status, data);
    }
    return data;
  }

  async deleteStorageApiKey(keyId: string): Promise<any> {
    await this.loadConfig();
    const res = await fetch(`${this.config.apiUrl}/api/storage/v1/keys/${encodeURIComponent(keyId)}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });

    const data: any = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    if (!res.ok) {
      throw new WhizanApiError(data.message || data.error || "Failed to revoke Storage API Key", res.status, data);
    }
    return data;
  }
}

