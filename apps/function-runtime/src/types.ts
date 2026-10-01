export interface InvocationRequest {
  serviceId: string;
  slug: string;
  version?: number;
  routePath?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: any;
  clientIp?: string;
  envVars?: Record<string, string>;
  timeoutMs?: number;
  memoryLimit?: number;
}

export interface InvocationResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string | null;
  isBase64: boolean;
  durationMs: number;
  memoryMb: number;
  error?: string;
}

export interface FunctionContext {
  env: Record<string, string>;
  params: Record<string, string>;
  waitUntil: (promise: Promise<any>) => void;
  function: {
    serviceId: string;
    slug: string;
    version: number;
  };
}

export interface LoadedBundle {
  serviceId: string;
  version: number;
  handler: (request: Request, context: FunctionContext) => Promise<Response> | Response;
  namedExports?: Record<string, any>;
  loadedAt: number;
  lastAccessedAt: number;
  bundleSizeBytes: number;
}
