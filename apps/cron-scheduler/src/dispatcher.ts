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

  constructor(
    redis: Redis,
    runtimeUrl = "http://127.0.0.1:9090",
    meshToken = process.env.INTERNAL_MESH_TOKEN || "whizan_mesh_sec_2026_x89q"
  ) {
    this.redis = redis;
    this.runtimeUrl = runtimeUrl.replace(/\/$/, "");
    this.meshToken = meshToken;
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

  // ─── 3. INTERNAL SERVICE DISPATCH (Private Mesh) ───────────────────────────
  private async executeInternalService(job: CronJobData, executionId: string, log: (s: string) => void) {
    const { serviceId, routePath = "/", port = 3000, method = "POST", payload } = job.targetConfig;
    const upperMethod = (method || "POST").toUpperCase();
    const isPayloadPermitted = !["GET", "HEAD"].includes(upperMethod);

    // Internal Docker network routing
    const targetUrl = `http://service-${serviceId}:${port}${routePath.startsWith("/") ? routePath : `/${routePath}`}`;

    log(`[Internal-Mesh] Calling service endpoint at ${targetUrl}\n`);

    const reqHeaders: Record<string, string> = {
      "x-whizan-trigger": "CRON",
      "x-whizan-cron-id": job.id,
      "x-whizan-execution-id": executionId,
      "x-mesh-token": this.meshToken,
    };

    let stringBody: string | undefined = undefined;
    if (isPayloadPermitted && payload) {
      stringBody = typeof payload === "string" ? payload : JSON.stringify(payload);
      reqHeaders["Content-Type"] = "application/json";
    }

    const res = await fetch(targetUrl, {
      method: upperMethod,
      headers: reqHeaders,
      body: stringBody,
    });

    const text = await res.text();
    log(`[Internal-Mesh] Response (${res.status}): ${text.slice(0, 1024)}\n`);
    return { statusCode: res.status };
  }

  // ─── 4. WEB PROJECT ROUTE DISPATCH ─────────────────────────────────────────
  private async executeProjectRoute(job: CronJobData, executionId: string, log: (s: string) => void) {
    const { projectId, routePath = "/", method = "GET", payload } = job.targetConfig;
    const upperMethod = (method || "GET").toUpperCase();
    const isPayloadPermitted = !["GET", "HEAD"].includes(upperMethod);
    const targetUrl = `http://project-${projectId}:3000${routePath.startsWith("/") ? routePath : `/${routePath}`}`;

    log(`[Web-Project] Calling project route at ${targetUrl}\n`);

    const reqHeaders: Record<string, string> = {
      "x-whizan-trigger": "CRON",
      "x-whizan-cron-id": job.id,
      "x-whizan-execution-id": executionId,
    };

    let stringBody: string | undefined = undefined;
    if (isPayloadPermitted && payload) {
      stringBody = typeof payload === "string" ? payload : JSON.stringify(payload);
      reqHeaders["Content-Type"] = "application/json";
    }

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
   * Helper to query Docker socket for container matching serviceId
   */
  private async resolveContainerId(serviceId: string): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      const req = http.request(
        {
          socketPath: "/var/run/docker.sock",
          path: `/containers/json?filters=${encodeURIComponent(JSON.stringify({ name: [serviceId] }))}`,
          method: "GET",
        },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => {
            try {
              const list = JSON.parse(body);
              if (Array.isArray(list) && list.length > 0) {
                return resolve(list[0].Id);
              }
              resolve(null);
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
}
