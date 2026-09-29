import fetch from "node-fetch";
import FormData from "form-data";
import fs from "fs/promises";
import path from "path";
import os from "os";

export interface WhizanConfig {
  apiUrl: string;
  apiKey?: string;
}

const CONFIG_PATH = path.join(os.homedir(), ".whizan", "config.json");

export class WhizanClient {
  private config: WhizanConfig;

  constructor() {
    this.config = {
      apiUrl: process.env.WHIZAN_API_URL || "https://whizan-cloud-service.onrender.com",
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

  async createService(params: {
    name: string;
    slug: string;
    language?: string;
    rootDir?: string;
    installCommand?: string;
    startCommand?: string;
    internalPort?: number;
    isPublic?: boolean;
    autoSleep?: boolean;
    instanceType?: string;
    envVars?: Record<string, string>;
  }): Promise<any> {
    await this.loadConfig();
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
        internalPort: params.internalPort || 8000,
        isPublic: params.isPublic !== undefined ? params.isPublic : true,
        autoSleep: params.autoSleep !== undefined ? params.autoSleep : false,
        instanceType: params.instanceType || "starter",
        envVars: params.envVars,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(`Failed to create backend service: ${JSON.stringify(err)}`);
    }

    const service: any = await res.json();

    // Ensure all env vars are saved via bulk endpoint
    if (params.envVars && Object.keys(params.envVars).length > 0) {
      await this.setEnvVars("service", service.id, params.envVars).catch(() => {});
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
        outputDir: params.outputDir || ".next",
        envVars: params.envVars,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(`Failed to create project: ${JSON.stringify(err)}`);
    }

    const project: any = await res.json();

    if (params.envVars && Object.keys(params.envVars).length > 0) {
      await this.setEnvVars("project", project.id, params.envVars).catch(() => {});
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
    targetType: "service" | "project",
    targetId: string,
    envVars: Record<string, any>
  ): Promise<Record<string, boolean>> {
    await this.loadConfig();
    const endpoint = targetType === "service" ? "services" : "projects";
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

  async getBuildLogs(deploymentId: string): Promise<string[]> {
    await this.loadConfig();
    // Try services deployment logs first, fallback to projects
    let res = await fetch(`${this.config.apiUrl}/api/services/deployments/${deploymentId}/logs`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      res = await fetch(`${this.config.apiUrl}/api/projects/deployments/${deploymentId}/logs`, {
        headers: this.getHeaders(),
      });
    }
    if (!res.ok) return [];
    const text = await res.text();
    return text
      .split("\n")
      .map((line) => line.replace(/^data:\s*/, "").trim())
      .filter((line) => line && line !== "[DONE]");
  }

  async checkHealth(rawUrl: string): Promise<{ ok: boolean; status: number; message: string; effectiveUrl: string }> {
    let url = rawUrl;
    // Azure VM Edge Router listens on Port 80 (HTTP). Port 443 (HTTPS) is not bound.
    // If the client supplies https:// for a nip.io domain or VM IP, automatically normalize to http://.
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
            ? `Service healthy and reachable at ${url}.${rawUrl.startsWith("https://") ? " (Note: Automatically converted https:// to http:// because Edge Router operates on Port 80)." : ""}`
            : `Received HTTP status ${res.status}`,
      };
    } catch (err: any) {
      // In case rawUrl was https and failed, attempt immediate http fallback
      if (rawUrl.startsWith("https://") && url === rawUrl) {
        try {
          const fallbackUrl = rawUrl.replace(/^https:\/\//i, "http://");
          const fallbackRes = await fetch(fallbackUrl, { method: "GET", timeout: 8000 } as any);
          return {
            ok: fallbackRes.status < 400,
            status: fallbackRes.status,
            effectiveUrl: fallbackUrl,
            message: `Service healthy and reachable at ${fallbackUrl}. (Note: HTTPS port 443 was refused; automatically fell back to HTTP port 80).`,
          };
        } catch {}
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
}
