import http from "http";
import crypto from "crypto";
import type { Redis } from "ioredis";
import { CircularRingBuffer } from "./ring-buffer.js";
import type { ExecutionTelemetry } from "./telemetry.js";

export interface CronJobData {
  id: string;
  name: string;
  targetType: "FUNCTION" | "PROJECT" | "SERVICE" | "CONTAINER_EXEC" | "WEBHOOK";
  targetConfig: any;
  timeoutSeconds: number;
  maxRetries: number;
  retryDelaySeconds: number;
  concurrencyPolicy: "FORBID" | "ALLOW" | "REPLACE" | "QUEUE_SERIALIZE";
  maxConcurrentRuns: number;
}

export class TaskDispatcher {
  private redis: Redis;
  private runtimeUrl: string;
  private meshToken: string;
  private apiUrl: string;
  private baseDomain: string;
  private routerPort: number;
  private apiPort: number;

  constructor(
    redis: Redis,
    runtimeUrl = "http://127.0.0.1:9090",
    meshToken = process.env.INTERNAL_MESH_TOKEN || "whizan_mesh_sec_2026_x89q",
    apiUrl = process.env.API_URL || process.env.CONTROL_PLANE_URL || "https://api.whizan.cloud",
    baseDomain = process.env.BASE_DOMAIN || "whizan.cloud",
    routerPort = Number(process.env.ROUTER_PORT) || 80,
    apiPort = Number(process.env.PORT || process.env.API_PORT) || 8000
  ) {
    this.redis = redis;
    this.runtimeUrl = runtimeUrl.replace(/\/$/, "");
    this.meshToken = meshToken;
    this.apiUrl = apiUrl.replace(/\/$/, "");
    const rawDomain = baseDomain.trim();
    this.baseDomain = (
      rawDomain === "api.whizan.cloud" ||
      rawDomain.startsWith("api.") ||
      rawDomain.includes("nip.io") ||
      rawDomain.includes("onrender.com") ||
      rawDomain.includes("vercel.app")
    ) ? "whizan.cloud" : rawDomain;
    this.routerPort = routerPort;
    this.apiPort = apiPort;
  }

  /**
   * Execute task across target pipeline with ring-buffer log capture.
   */
  public async dispatch(
    job: CronJobData,
    executionId: string,
    triggerType: string = "SCHEDULED",
    attempt: number = 0,
    existingRingBuffer?: CircularRingBuffer
  ): Promise<ExecutionTelemetry> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const ringBuffer = existingRingBuffer || new CircularRingBuffer(64 * 1024); // 64 KB memory cap

    const logChannel = `cron:logs:${executionId}`;

    const publishLog = (line: string) => {
      ringBuffer.write(line);
      this.redis.publish(logChannel, JSON.stringify({ executionId, line, ts: Date.now() })).catch(() => {});
    };

    publishLog(`[Whizan-Cron] Triggered ${job.name} (ID: ${job.id}) via ${job.targetType} [Trigger: ${triggerType}]\n`);

    let status: ExecutionTelemetry["status"] = "SUCCESS";
    let exitCode: number | null = 0;
    let httpStatusCode: number | null = 200;
    let errorMessage: string | null = null;

    try {
      switch (job.targetType) {
        case "FUNCTION": {
          const res = await this.executeFunction(job, executionId, publishLog);
          httpStatusCode = res.statusCode;
          if (res.statusCode >= 400) {
            status = "FAILED";
            errorMessage = `Function returned HTTP ${res.statusCode}`;
          }
          break;
        }

        case "CONTAINER_EXEC": {
          const res = await this.executeContainerExec(job, executionId, publishLog);
          exitCode = res.exitCode;
          if (res.exitCode !== 0) {
            status = "FAILED";
            errorMessage = `Container process exited with code ${res.exitCode}`;
          }
          break;
        }

        case "SERVICE": {
          const res = await this.executeInternalService(job, executionId, publishLog);
          httpStatusCode = res.statusCode;
          if (res.statusCode >= 400) {
            status = "FAILED";
            errorMessage = `Service returned HTTP ${res.statusCode}`;
          }
          break;
        }

        case "PROJECT": {
          const res = await this.executeProjectRoute(job, executionId, publishLog);
          httpStatusCode = res.statusCode;
          if (res.statusCode >= 400) {
            status = "FAILED";
            errorMessage = `Web project returned HTTP ${res.statusCode}`;
          }
          break;
        }

        case "WEBHOOK": {
          const res = await this.executeWebhook(job, executionId, publishLog);
          httpStatusCode = res.statusCode;
          if (res.statusCode >= 400) {
            status = "FAILED";
            errorMessage = `Webhook endpoint returned HTTP ${res.statusCode}`;
          }
          break;
        }

        default:
          throw new Error(`Unsupported target type: ${job.targetType}`);
      }
    } catch (err: any) {
      status = "FAILED";
      errorMessage = err.message || "Unknown execution error";
      publishLog(`[Whizan-Cron] Error: ${errorMessage}\n`);
    }

    const durationMs = Date.now() - startTime;
    const finishedAt = new Date().toISOString();

    if (status === "FAILED" && attempt < (job.maxRetries || 0)) {
      const nextAttempt = attempt + 1;
      const delaySec = job.retryDelaySeconds || 5;
      publishLog(`\n[Whizan-Cron] ⚠️ Attempt ${nextAttempt}/${(job.maxRetries || 0) + 1} failed (${errorMessage || "Error"}). Retrying in ${delaySec}s...\n`);
      await new Promise((r) => setTimeout(r, delaySec * 1000));
      return this.dispatch(job, executionId, triggerType, nextAttempt, ringBuffer);
    }

    publishLog(`[Whizan-Cron] Finished in ${durationMs}ms with status ${status}\n`);

    return {
      id: executionId,
      cronJobId: job.id,
      triggerType,
      status,
      startedAt,
      finishedAt,
      durationMs,
      exitCode,
      httpStatusCode,
      errorMessage,
      stdout: ringBuffer.toString(),
      stderr: errorMessage ? errorMessage : null,
      memoryMbPeak: null,
      cpuMs: null,
      retryAttempt: attempt,
    };
  }

  // ─── 1. FUNCTION DISPATCH ──────────────────────────────────────────────────
  private async executeFunction(job: CronJobData, executionId: string, log: (s: string) => void) {
    const { serviceId, endpointPath = "/", method = "POST", payload } = job.targetConfig;
    const targetUrl = `${this.runtimeUrl}/invoke`;

    log(`[Function] Calling V8 isolate for service ${serviceId} at ${endpointPath}\n`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), (job.timeoutSeconds || 300) * 1000);

    try {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-whizan-trigger": "CRON",
          "x-whizan-cron-id": job.id,
          "x-whizan-execution-id": executionId,
          "x-mesh-token": this.meshToken,
        },
        body: JSON.stringify({
          serviceId,
          path: endpointPath,
          method,
          body: payload,
        }),
        signal: controller.signal,
      });

      const text = await res.text();
      log(`[Function] Response (${res.status}): ${text.slice(0, 1024)}\n`);
      return { statusCode: res.status };
    } finally {
      clearTimeout(timeout);
    }
  }

  // ─── 2. DOCKER CONTAINER EXEC (Zero-Dependency Unix Socket) ────────────────
  private async executeContainerExec(
    job: CronJobData,
    executionId: string,
    log: (s: string) => void
  ): Promise<{ exitCode: number }> {
    const { serviceId, command, workDir, user } = job.targetConfig;
    const cmdArray = Array.isArray(command) ? command : ["/bin/sh", "-c", command];

    // Find container ID by service label or name
    const containerId = await this.resolveContainerId(serviceId);
    if (!containerId) {
      throw new Error(`Running container for service ${serviceId} was not found on host`);
    }

    log(`[Docker-Exec] Executing command in container ${containerId.slice(0, 12)}: ${cmdArray.join(" ")}\n`);

    return new Promise<{ exitCode: number }>((resolve, reject) => {
      // Step A: Create Exec Instance via Docker Socket
      const createData = JSON.stringify({
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        Cmd: cmdArray,
        WorkingDir: workDir || undefined,
        User: user || undefined,
      });

      const req = http.request(
        {
          socketPath: "/var/run/docker.sock",
          path: `/containers/${containerId}/exec`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(createData),
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            if (res.statusCode !== 201) {
              return reject(new Error(`Docker exec create failed: ${res.statusCode} - ${body}`));
            }

            const { Id: execId } = JSON.parse(body);

            // Step B: Start Exec Instance & stream logs
            const startReq = http.request(
              {
                socketPath: "/var/run/docker.sock",
                path: `/exec/${execId}/start`,
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Content-Length": Buffer.byteLength(JSON.stringify({ Detach: false, Tty: false })),
                },
              },
              (startRes) => {
                // Docker multiplexed stream header: 8 bytes per frame
                startRes.on("data", (chunk: Buffer) => {
                  let offset = 0;
                  while (offset < chunk.length) {
                    if (chunk.length - offset < 8) {
                      log(chunk.subarray(offset).toString("utf-8"));
                      break;
                    }
                    const size = chunk.readUInt32BE(offset + 4);
                    const payload = chunk.subarray(offset + 8, offset + 8 + size);
                    log(payload.toString("utf-8"));
                    offset += 8 + size;
                  }
                });

                startRes.on("end", async () => {
                  // Step C: Inspect exit code
                  const inspectReq = http.request(
                    {
                      socketPath: "/var/run/docker.sock",
                      path: `/exec/${execId}/json`,
                      method: "GET",
                    },
                    (inspectRes) => {
                      let inspBody = "";
                      inspectRes.on("data", (c) => (inspBody += c));
                      inspectRes.on("end", () => {
                        try {
                          const info = JSON.parse(inspBody);
                          resolve({ exitCode: info.ExitCode ?? 0 });
                        } catch {
                          resolve({ exitCode: 0 });
                        }
                      });
                    }
                  );
                  inspectReq.on("error", () => resolve({ exitCode: 0 }));
                  inspectReq.end();
                });
              }
            );

            startReq.on("error", (err) => reject(err));
            startReq.write(JSON.stringify({ Detach: false, Tty: false }));
            startReq.end();
          });
        }
      );

      req.on("error", (err) => reject(err));
      req.write(createData);
      req.end();
    });
  }

  // ─── 3. INTERNAL SERVICE DISPATCH (Private Mesh & Universal Gateway) ───────
  private async executeInternalService(job: CronJobData, executionId: string, log: (s: string) => void) {
    const { serviceId, routePath = "/", port = 3000, method = "POST", payload, headers } = job.targetConfig;
    const upperMethod = (method || "POST").toUpperCase();
    const isPayloadPermitted = !["GET", "HEAD"].includes(upperMethod);
    const cleanPath = routePath.startsWith("/") ? routePath : `/${routePath}`;

    const reqHeaders: Record<string, string> = {
      "x-whizan-trigger": "CRON",
      "x-whizan-cron-id": job.id,
      "x-whizan-execution-id": executionId,
      "x-mesh-token": this.meshToken,
    };

    if (headers && typeof headers === "object") {
      Object.assign(reqHeaders, headers);
    }

    let stringBody: string | undefined = undefined;
    if (isPayloadPermitted && payload) {
      stringBody = typeof payload === "string" ? payload : JSON.stringify(payload);
      reqHeaders["Content-Type"] = reqHeaders["Content-Type"] || "application/json";
    }

    // 1. Resolve Target Slug
    const slug = await this.resolveTargetSlug("SERVICE", serviceId, job.targetConfig);

    if (slug) {
      log(`[Internal-Mesh] Routing task to service "${slug}" (${cleanPath}) via Universal Gateway\n`);
      const res = await this.sendRoutedHttpRequest(slug, cleanPath, upperMethod, reqHeaders, stringBody, log);
      log(`[Internal-Mesh] Response (${res.statusCode}): ${res.body.slice(0, 1024)}\n`);
      return { statusCode: res.statusCode };
    }

    // Fallback: Direct container network endpoint if slug cannot be resolved
    const targetUrl = `http://service-${serviceId}:${port}${cleanPath}`;
    log(`[Internal-Mesh] Calling direct service endpoint at ${targetUrl}\n`);

    const res = await fetch(targetUrl, {
      method: upperMethod,
      headers: reqHeaders,
      body: stringBody,
    });

    const text = await res.text();
    log(`[Internal-Mesh] Response (${res.status}): ${text.slice(0, 1024)}\n`);
    return { statusCode: res.status };
  }

  // ─── 4. WEB PROJECT ROUTE DISPATCH (Universal Gateway) ─────────────────────
  private async executeProjectRoute(job: CronJobData, executionId: string, log: (s: string) => void) {
    const { projectId, routePath = "/", method = "GET", payload, headers } = job.targetConfig;
    const upperMethod = (method || "GET").toUpperCase();
    const isPayloadPermitted = !["GET", "HEAD"].includes(upperMethod);
    const cleanPath = routePath.startsWith("/") ? routePath : `/${routePath}`;

    const reqHeaders: Record<string, string> = {
      "x-whizan-trigger": "CRON",
      "x-whizan-cron-id": job.id,
      "x-whizan-execution-id": executionId,
    };

    if (headers && typeof headers === "object") {
      Object.assign(reqHeaders, headers);
    }

    let stringBody: string | undefined = undefined;
    if (isPayloadPermitted && payload) {
      stringBody = typeof payload === "string" ? payload : JSON.stringify(payload);
      reqHeaders["Content-Type"] = reqHeaders["Content-Type"] || "application/json";
    }

    // 1. Resolve Target Slug
    const slug = await this.resolveTargetSlug("PROJECT", projectId, job.targetConfig);

    if (slug) {
      log(`[Web-Project] Routing task to project "${slug}" (${cleanPath}) via Universal Gateway\n`);
      const res = await this.sendRoutedHttpRequest(slug, cleanPath, upperMethod, reqHeaders, stringBody, log);
      log(`[Web-Project] Response (${res.statusCode}): ${res.body.slice(0, 1024)}\n`);
      return { statusCode: res.statusCode };
    }

    // Fallback: Direct project container endpoint
    const targetUrl = `http://project-${projectId}:3000${cleanPath}`;
    log(`[Web-Project] Calling direct project route at ${targetUrl}\n`);

    const res = await fetch(targetUrl, {
      method: upperMethod,
      headers: reqHeaders,
      body: stringBody,
    });

    const text = await res.text();
    log(`[Web-Project] Response (${res.status}): ${text.slice(0, 1024)}\n`);
    return { statusCode: res.status };
  }

  // ─── 5. EXTERNAL WEBHOOK WITH HMAC SIGNATURE ──────────────────────────────
  private async executeWebhook(job: CronJobData, executionId: string, log: (s: string) => void) {
    const { url, method = "POST", headers = {}, body } = job.targetConfig;
    const upperMethod = (method || "POST").toUpperCase();
    const isPayloadPermitted = !["GET", "HEAD"].includes(upperMethod);

    let stringBody: string | undefined = undefined;
    if (isPayloadPermitted && body !== undefined && body !== null) {
      if (typeof body === "string") {
        stringBody = body;
      } else if (typeof body === "object") {
        const keys = Object.keys(body);
        if (keys.length > 0) {
          stringBody = JSON.stringify(body);
        }
      }
    }

    // Generate HMAC SHA-256 signature
    const signature = crypto
      .createHmac("sha256", this.meshToken)
      .update(stringBody || "")
      .digest("hex");

    log(`[Webhook] Dispatching signed HTTP ${upperMethod} to ${url}\n`);

    const reqHeaders: Record<string, string> = {
      "User-Agent": "Whizan-Cron/1.0",
      "x-whizan-trigger": "CRON",
      "x-whizan-cron-id": job.id,
      "x-whizan-execution-id": executionId,
      "x-whizan-signature": `sha256=${signature}`,
      ...headers,
    };

    if (stringBody) {
      reqHeaders["Content-Type"] = reqHeaders["Content-Type"] || "application/json";
    }

    const res = await fetch(url, {
      method: upperMethod,
      headers: reqHeaders,
      body: stringBody,
    });

    const text = await res.text();
    log(`[Webhook] Target response (${res.status}): ${text.slice(0, 1024)}\n`);
    return { statusCode: res.status };
  }

  /**
   * Resilient target slug resolver:
   * 1. Inspect targetConfig (serviceSlug, projectSlug, slug).
   * 2. Direct Redis deployment key check (if id itself is a slug).
   * 3. Redis slug cache check (service:slug:<id> or project:slug:<id>).
   * 4. Redis deployment scan (matches serviceId / projectId in deployment JSON).
   * 5. Docker socket container inspection (matches labels: serviceId, projectId, slug).
   * 6. Control Plane API query (/api/crons/resolve-target with mesh token).
   */
  public async resolveTargetSlug(
    targetType: "SERVICE" | "PROJECT",
    targetId: string,
    targetConfig: any = {}
  ): Promise<string | null> {
    if (!targetId) return null;

    // 1. Direct from config
    if (targetConfig.serviceSlug) return targetConfig.serviceSlug;
    if (targetConfig.projectSlug) return targetConfig.projectSlug;
    if (targetConfig.slug) return targetConfig.slug;

    // 2. Direct Redis check: is targetId itself a slug?
    try {
      const direct = await this.redis.get(`deployment:${targetId}`);
      if (direct) return targetId;
    } catch {}

    // 3. Cached slug in Redis
    const cacheKey = targetType === "SERVICE" ? `service:slug:${targetId}` : `project:slug:${targetId}`;
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return cached;
    } catch {}

    // 4. Redis scan: match serviceId/projectId in deployment:* values
    try {
      const keys = await this.redis.keys("deployment:*");
      for (const k of keys) {
        const raw = await this.redis.get(k);
        if (!raw) continue;
        try {
          const info = JSON.parse(raw);
          const matches =
            (targetType === "SERVICE" && (info.serviceId === targetId || info.id === targetId)) ||
            (targetType === "PROJECT" && (info.projectId === targetId || info.id === targetId)) ||
            info.slug === targetId;

          if (matches) {
            const foundSlug = k.replace(/^deployment:/, "");
            await this.redis.set(cacheKey, foundSlug, "EX", 86400).catch(() => {});
            return foundSlug;
          }
        } catch {}
      }
    } catch {}

    // 5. Docker Engine Socket /containers/json?all=1
    try {
      const containers = await this.queryDockerContainers();
      for (const c of containers) {
        const labels = c.Labels || {};
        const matches =
          (targetType === "SERVICE" && (labels.serviceId === targetId || labels.id === targetId)) ||
          (targetType === "PROJECT" && (labels.projectId === targetId || labels.id === targetId)) ||
          labels.slug === targetId;

        if (matches && labels.slug) {
          await this.redis.set(cacheKey, labels.slug, "EX", 86400).catch(() => {});
          return labels.slug;
        }
      }
    } catch {}

    // 6. Control Plane API endpoint fallback
    try {
      const queryUrl = `${this.apiUrl}/api/crons/resolve-target?type=${targetType}&id=${encodeURIComponent(targetId)}`;
      const res = await fetch(queryUrl, {
        headers: { "x-mesh-token": this.meshToken },
      });
      if (res.ok) {
        const body: any = await res.json();
        if (body.slug) {
          await this.redis.set(cacheKey, body.slug, "EX", 86400).catch(() => {});
          return body.slug;
        }
      }
    } catch {}

    return null;
  }

  /**
   * Universal routed HTTP dispatcher:
   * Tier 1: Local Edge Router on loopback (ultra-low latency, auto-wakes sleeping containers).
   * Tier 2: Universal Live Gateway on API port (local or remote).
   * Tier 3: Public Edge HTTPS (<slug>.<baseDomain>).
   */
  private async sendRoutedHttpRequest(
    slug: string,
    routePath: string,
    method: string,
    headers: Record<string, string>,
    body?: string,
    log?: (s: string) => void
  ): Promise<{ statusCode: number; body: string }> {
    const cleanPath = routePath.startsWith("/") ? routePath : `/${routePath}`;
    const targetHost = `${slug}.${this.baseDomain}`;

    const outgoingHeaders: Record<string, string> = {
      ...headers,
      host: targetHost,
      "x-forwarded-host": targetHost,
      "x-forwarded-proto": "https",
      "User-Agent": "Whizan-Cron/1.0",
    };

    if (body && !outgoingHeaders["Content-Type"]) {
      outgoingHeaders["Content-Type"] = "application/json";
    }

    // Tier 1: Local Edge Router on loopback (ultra-low latency, auto-wakes sleeping containers)
    try {
      const edgeRes = await this.doHttpRequest({
        host: "127.0.0.1",
        port: this.routerPort,
        path: cleanPath,
        method,
        headers: outgoingHeaders,
        body,
        timeoutMs: 30000,
      });

      // Handle 202 ALLOCATING_RESOURCES (Container warming up from eco-standby)
      if (
        edgeRes.statusCode === 202 &&
        (edgeRes.body.includes("ALLOCATING_RESOURCES") || edgeRes.body.includes("warming up"))
      ) {
        log?.(`[Router] Service "${slug}" is waking up from eco-standby. Waiting 3s for resources...\n`);
        await new Promise((r) => setTimeout(r, 3000));
        const retryRes = await this.doHttpRequest({
          host: "127.0.0.1",
          port: this.routerPort,
          path: cleanPath,
          method,
          headers: outgoingHeaders,
          body,
          timeoutMs: 30000,
        });
        return retryRes;
      }

      // If response is valid (including 200, 401, 403, 404, etc.), return immediately
      if (edgeRes.statusCode < 500) {
        return edgeRes;
      }
    } catch (edgeErr: any) {
      log?.(`[Router] Loopback attempt to port ${this.routerPort} failed (${edgeErr.message}). Trying Live Gateway fallback...\n`);
    }

    // Tier 2: Universal Live Gateway on API port
    try {
      const gatewayUrl = `http://127.0.0.1:${this.apiPort}/live/${slug}${cleanPath}`;
      const gwRes = await fetch(gatewayUrl, {
        method,
        headers: outgoingHeaders,
        body,
      });
      const gwText = await gwRes.text();

      // If gateway indicates warming up (202), wait and retry once
      if (gwRes.status === 202 && gwText.includes("ALLOCATING_RESOURCES")) {
        log?.(`[LiveGateway] Compute container is warming up. Waiting 3s...\n`);
        await new Promise((r) => setTimeout(r, 3000));
        const gwRetry = await fetch(gatewayUrl, { method, headers: outgoingHeaders, body });
        const retryText = await gwRetry.text();
        return { statusCode: gwRetry.status, body: retryText };
      }

      if (gwRes.status < 500) {
        return { statusCode: gwRes.status, body: gwText };
      }
    } catch (gwErr: any) {
      log?.(`[LiveGateway] Gateway fallback failed (${gwErr.message}). Trying public edge domain...\n`);
    }

    // Tier 3: Public Edge HTTPS
    const publicUrl = `https://${slug}.${this.baseDomain}${cleanPath}`;
    log?.(`[Edge-Public] Dispatching to public endpoint: ${publicUrl}\n`);
    const pubRes = await fetch(publicUrl, {
      method,
      headers: outgoingHeaders,
      body,
    });
    const pubText = await pubRes.text();
    return { statusCode: pubRes.status, body: pubText };
  }

  private doHttpRequest(options: {
    host: string;
    port: number;
    path: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  }): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: options.host,
          port: options.port,
          path: options.path,
          method: options.method,
          headers: options.headers,
          timeout: options.timeoutMs || 30000,
        },
        (res) => {
          let resBody = "";
          res.on("data", (chunk) => (resBody += chunk));
          res.on("end", () => {
            resolve({ statusCode: res.statusCode || 200, body: resBody });
          });
        }
      );

      req.on("timeout", () => {
        req.destroy(new Error(`HTTP request to ${options.host}:${options.port} timed out`));
      });

      req.on("error", (err) => reject(err));

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  /**
   * Helper to query Docker socket for container matching serviceId, projectId, slug or name.
   * If container was stopped or asleep, automatically starts it.
   */
  private async resolveContainerId(targetId: string): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      const req = http.request(
        {
          socketPath: "/var/run/docker.sock",
          path: "/containers/json?all=1",
          method: "GET",
        },
        async (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", async () => {
            try {
              const list = JSON.parse(body);
              if (!Array.isArray(list)) return resolve(null);

              const matched = list.find((c: any) => {
                const labels = c.Labels || {};
                const names = c.Names || [];
                return (
                  labels.serviceId === targetId ||
                  labels.projectId === targetId ||
                  labels.slug === targetId ||
                  c.Id === targetId ||
                  c.Id?.startsWith(targetId) ||
                  names.some((n: string) =>
                    n === `/${targetId}` ||
                    n.includes(targetId) ||
                    n.includes(`service-${targetId}`) ||
                    n.includes(`app-${targetId}`)
                  )
                );
              });

              if (!matched) return resolve(null);

              // If container is exited / sleeping, wake it up immediately
              if (matched.State !== "running") {
                await this.startStoppedContainer(matched.Id);
                // Allow process to bind
                await new Promise((r) => setTimeout(r, 1000));
              }

              return resolve(matched.Id);
            } catch {
              resolve(null);
            }
          });
        }
      );
      req.on("error", () => resolve(null));
      req.end();
    });
  }

  private async startStoppedContainer(containerId: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const req = http.request(
        {
          socketPath: "/var/run/docker.sock",
          path: `/containers/${containerId}/start`,
          method: "POST",
        },
        (res) => {
          resolve(res.statusCode === 204 || res.statusCode === 304);
        }
      );
      req.on("error", () => resolve(false));
      req.end();
    });
  }

  private async queryDockerContainers(): Promise<any[]> {
    return new Promise((resolve) => {
      const req = http.request(
        {
          socketPath: "/var/run/docker.sock",
          path: "/containers/json?all=1",
          method: "GET",
        },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve([]);
            }
          });
        }
      );
      req.on("error", () => resolve([]));
      req.end();
    });
  }
}
