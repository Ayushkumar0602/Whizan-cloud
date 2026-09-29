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
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(`Failed to create backend service: ${JSON.stringify(err)}`);
    }

    const service: any = await res.json();

    // If env vars are provided, set them
    if (params.envVars && Object.keys(params.envVars).length > 0) {
      for (const [key, value] of Object.entries(params.envVars)) {
        await fetch(`${this.config.apiUrl}/api/services/${service.id}/env`, {
          method: "POST",
          headers: this.getHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ key, value, isSecret: true }),
        }).catch(() => {});
      }
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
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(`Failed to create project: ${JSON.stringify(err)}`);
    }

    const project: any = await res.json();

    if (params.envVars && Object.keys(params.envVars).length > 0) {
      for (const [key, value] of Object.entries(params.envVars)) {
        await fetch(`${this.config.apiUrl}/api/projects/${project.id}/env`, {
          method: "POST",
          headers: this.getHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ key, value, isSecret: true }),
        }).catch(() => {});
      }
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
    envVars: Record<string, string>
  ): Promise<Record<string, boolean>> {
    await this.loadConfig();
    const endpoint = targetType === "service" ? "services" : "projects";
    const results: Record<string, boolean> = {};

    for (const [key, value] of Object.entries(envVars)) {
      const res = await fetch(`${this.config.apiUrl}/api/${endpoint}/${targetId}/env`, {
        method: "POST",
        headers: this.getHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ key, value: String(value), isSecret: true }),
      });
      results[key] = res.ok;
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

  async checkHealth(url: string): Promise<{ ok: boolean; status: number; message: string }> {
    try {
      const res = await fetch(url, { method: "GET", timeout: 8000 } as any);
      return {
        ok: res.status < 400,
        status: res.status,
        message: res.status < 400 ? "Service healthy and reachable." : `Received HTTP status ${res.status}`,
      };
    } catch (err: any) {
      return { ok: false, status: 0, message: `Could not connect to ${url}: ${err.message}` };
    }
  }
}
