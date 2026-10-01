import { InvocationRequest, InvocationResponse, FunctionContext, LoadedBundle } from "./types.js";
import { FunctionLogger } from "./logger.js";
import { pathToFileURL } from "url";
import fs from "fs";
import path from "path";

export class FunctionSandbox {
  private logger: FunctionLogger;

  constructor(logger: FunctionLogger) {
    this.logger = logger;
  }

  /**
   * Loads an ESM bundle from disk.
   */
  public async loadBundle(serviceId: string, version: number, bundlePath: string): Promise<LoadedBundle> {
    if (!fs.existsSync(bundlePath)) {
      throw new Error(`BUNDLE_FILE_NOT_FOUND: ${bundlePath}`);
    }

    const stat = fs.statSync(bundlePath);
    // Use file URL with cache-busting timestamp to allow hot reloading without restarting node process
    const fileUrl = `${pathToFileURL(bundlePath).href}?v=${version}&t=${Date.now()}`;
    const module = await import(fileUrl);

    // Look for default export, or named export 'handler' or 'onRequest'
    const handler =
      module.default ||
      module.handler ||
      module.onRequest ||
      (typeof module === "function" ? module : null);

    if (!handler || typeof handler !== "function") {
      throw new Error(
        `INVALID_FUNCTION_HANDLER: Entry file must export a default function or named 'handler' function.`
      );
    }

    return {
      serviceId,
      version,
      handler,
      namedExports: module,
      loadedAt: Date.now(),
      lastAccessedAt: Date.now(),
      bundleSizeBytes: stat.size,
    };
  }

  /**
   * Executes an incoming request against a loaded function handler in an isolated context.
   */
  public async execute(
    bundle: LoadedBundle,
    req: InvocationRequest
  ): Promise<InvocationResponse> {
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    const timeoutMs = req.timeoutMs || 10000;
    const memoryLimitMb = req.memoryLimit || 128;
    const envVars = req.envVars || {};
    const secretsToRedact = Object.values(envVars);

    // Update access time for scale-to-zero tracking
    bundle.lastAccessedAt = Date.now();

    // 1. Build standard Web Request object
    const protocol = "http";
    const host = req.headers?.host || `${req.slug}.fn.localhost`;
    const fullUrl = new URL(req.routePath || "/", `${protocol}://${host}`);

    if (req.query) {
      for (const [key, value] of Object.entries(req.query)) {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            value.forEach((v) => fullUrl.searchParams.append(key, v));
          } else {
            fullUrl.searchParams.set(key, String(value));
          }
        }
      }
    }

    // Format headers
    const webHeaders = new Headers();
    if (req.headers) {
      for (const [k, v] of Object.entries(req.headers)) {
        if (v !== undefined) {
          if (Array.isArray(v)) {
            v.forEach((val) => webHeaders.append(k, val));
          } else {
            webHeaders.set(k, String(v));
          }
        }
      }
    }

    const abortController = new AbortController();
    let bodyInit: any = undefined;
    const method = (req.method || "GET").toUpperCase();

    if (method !== "GET" && method !== "HEAD" && req.body !== undefined && req.body !== null) {
      if (typeof req.body === "string" || req.body instanceof Uint8Array) {
        bodyInit = req.body;
      } else {
        bodyInit = JSON.stringify(req.body);
        if (!webHeaders.has("content-type")) {
          webHeaders.set("content-type", "application/json");
        }
      }
    }

    const webRequest = new Request(fullUrl.toString(), {
      method,
      headers: webHeaders,
      body: bodyInit,
      signal: abortController.signal,
    });

    // 2. Build FunctionContext
    const backgroundPromises: Promise<any>[] = [];
    const context: FunctionContext = {
      env: Object.freeze({ ...envVars }),
      params: {},
      waitUntil: (promise: Promise<any>) => {
        backgroundPromises.push(promise.catch((err) => {
          this.logger.log(
            req.serviceId,
            "ERROR",
            `[waitUntil Error]: ${err?.message || err}`,
            secretsToRedact
          );
        }));
      },
      function: {
        serviceId: req.serviceId,
        slug: req.slug,
        version: bundle.version,
      },
    };

    // 3. Intercept console logs to stream with secrets redaction
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args: any[]) => {
      const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
      this.logger.log(req.serviceId, "INFO", msg, secretsToRedact);
      originalLog(...args);
    };

    console.warn = (...args: any[]) => {
      const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
      this.logger.log(req.serviceId, "WARN", msg, secretsToRedact);
      originalWarn(...args);
    };

    console.error = (...args: any[]) => {
      const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
      this.logger.log(req.serviceId, "ERROR", msg, secretsToRedact);
      originalError(...args);
    };

    let timer: NodeJS.Timeout | null = null;

    try {
      // 4. Execute with race against timeout
      const executionPromise = (async () => {
        const cleanPath = (req.routePath || "/").replace(/^\/+/, "").split("/")[0] || "";
        let selectedHandler = bundle.handler;

        if (bundle.namedExports) {
          if (cleanPath) {
            const camelCasePath = cleanPath.replace(/-([a-z0-9])/g, (_, g) => g.toUpperCase());
            const snakeCasePath = cleanPath.replace(/-/g, "_");

            const candidate =
              bundle.namedExports[cleanPath] ||
              bundle.namedExports[camelCasePath] ||
              bundle.namedExports[snakeCasePath];

            if (typeof candidate === "function") {
              selectedHandler = candidate;
            } else if (typeof candidate?.handler === "function") {
              selectedHandler = candidate.handler;
            }
          } else if (typeof bundle.namedExports[method] === "function") {
            selectedHandler = bundle.namedExports[method];
          }
        }

        // Safely project envVars to process.env during execution
        const previousEnv: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(envVars)) {
          previousEnv[k] = process.env[k];
          process.env[k] = v;
        }

        try {
          return await selectedHandler(webRequest, context);
        } finally {
          for (const [k, oldVal] of Object.entries(previousEnv)) {
            if (oldVal === undefined) delete process.env[k];
            else process.env[k] = oldVal;
          }
        }
      })();

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abortController.abort();
          reject(new Error("FUNCTION_TIMEOUT"));
        }, timeoutMs);
      });

      const rawResult = await Promise.race([executionPromise, timeoutPromise]);

      if (timer) clearTimeout(timer);

      // Check heap memory consumption
      const currentHeapMb = process.memoryUsage().heapUsed / (1024 * 1024);
      const usedMemoryMb = Math.max(0.1, (process.memoryUsage().heapUsed - startMemory) / (1024 * 1024));

      if (currentHeapMb > memoryLimitMb * 1.5) {
        this.logger.log(
          req.serviceId,
          "WARN",
          `High memory consumption detected (${currentHeapMb.toFixed(1)}MB vs limit ${memoryLimitMb}MB)`,
          secretsToRedact
        );
      }

      const durationMs = Number((performance.now() - startTime).toFixed(2));

      // 5. Format Response
      if (rawResult instanceof Response) {
        const responseHeaders: Record<string, string> = {};
        rawResult.headers.forEach((v, k) => {
          responseHeaders[k] = v;
        });

        // Determine if body is binary or text
        const contentType = rawResult.headers.get("content-type") || "";
        let bodyText: string | null = null;
        let isBase64 = false;

        if (
          contentType.includes("image/") ||
          contentType.includes("audio/") ||
          contentType.includes("video/") ||
          contentType.includes("application/octet-stream") ||
          contentType.includes("application/pdf")
        ) {
          const buffer = await rawResult.arrayBuffer();
          bodyText = Buffer.from(buffer).toString("base64");
          isBase64 = true;
        } else {
          bodyText = await rawResult.text();
        }

        return {
          statusCode: rawResult.status,
          headers: responseHeaders,
          body: bodyText,
          isBase64,
          durationMs,
          memoryMb: Number(usedMemoryMb.toFixed(2)),
        };
      }

      // If handler returned plain object/value instead of Response
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: typeof rawResult === "string" ? rawResult : JSON.stringify(rawResult),
        isBase64: false,
        durationMs,
        memoryMb: Number(usedMemoryMb.toFixed(2)),
      };
    } catch (err: any) {
      if (timer) clearTimeout(timer);
      const durationMs = Number((performance.now() - startTime).toFixed(2));
      const isTimeout = err?.message === "FUNCTION_TIMEOUT";
      const statusCode = isTimeout ? 504 : 500;
      const errorMessage = isTimeout
        ? `Function execution timed out after ${timeoutMs}ms`
        : err?.message || "Internal Function Error";

      await this.logger.log(
        req.serviceId,
        "ERROR",
        `[Invocation Failed ${statusCode}]: ${errorMessage}\n${err?.stack || ""}`,
        secretsToRedact
      );

      return {
        statusCode,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: isTimeout ? "GATEWAY_TIMEOUT" : "INTERNAL_FUNCTION_ERROR",
          message: errorMessage,
          durationMs,
        }),
        isBase64: false,
        durationMs,
        memoryMb: 0.5,
        error: errorMessage,
      };
    } finally {
      // Restore original console
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;

      // Let background waitUntil tasks complete in background
      if (backgroundPromises.length > 0) {
        Promise.allSettled(backgroundPromises).catch(() => {});
      }
    }
  }
}
