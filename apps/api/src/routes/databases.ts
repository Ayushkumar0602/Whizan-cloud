import type { FastifyPluginAsync } from "fastify";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import * as crypto from "crypto";
import { Client as PgClient } from "pg";
import { prisma } from "../lib/prisma.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { redisClient, redisSub } from "../lib/redis.js";
import { isRestrictedDatabaseUrl } from "../lib/auth-utils.js";

const BASE_DOMAIN = process.env.BASE_DOMAIN ?? "localhost";

const databaseQueue = new Queue("database-job", {
  connection: redisClient,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

let dockerInstance: any = null;
async function getDocker() {
  if (dockerInstance) return dockerInstance;
  try {
    const Docker = (await import("dockerode")).default;
    dockerInstance = new Docker({ socketPath: "/var/run/docker.sock" });
    return dockerInstance;
  } catch {
    return null;
  }
}

export const databaseRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Authentication Prehandler ──────────────────────────────────────────────
  fastify.addHook("preHandler", async (request: any, reply) => {
    // Public wake endpoint can be triggered without auth
    if (request.url.includes("/public/") && request.url.includes("/wake")) {
      return;
    }

    // SSE log endpoint sends auth token in query params
    if (request.url.includes("/logs") && request.query?.token) {
      try {
        const decoded = (fastify as any).jwt.verify(request.query.token) as any;
        request.user = decoded;
        return;
      } catch {
        return reply.code(401).send({ error: "Invalid token" });
      }
    }
    return (fastify as any).authenticate(request, reply);
  });

  // ── Helper: Format Connection URLs ────────────────────────────────────────
  function formatDatabaseUrls(db: any) {
    let plainPassword = "";
    try {
      plainPassword = decrypt(db.password);
    } catch {
      plainPassword = "••••••••";
    }

    let plainReadonlyPassword = "";
    if (db.readonlyPassword) {
      try {
        plainReadonlyPassword = decrypt(db.readonlyPassword);
      } catch {}
    }

    const host =
      process.env.DB_PUBLIC_HOST ||
      process.env.EXTERNAL_DB_HOST ||
      (BASE_DOMAIN && BASE_DOMAIN !== "localhost" ? BASE_DOMAIN : "20.2.136.11");
    const internalPort = db.internalPort || (db.type === "REDIS" ? 6379 : 5432);
    const externalPort = db.externalPort;
    const poolerPort = db.poolerPort;

    let internalUrl = "";
    let externalUrl = "";
    let sslUrl = "";
    let pooledUrl = "";
    let internalPooledUrl = "";
    let readonlyUrl = "";

    if (db.type === "POSTGRESQL") {
      internalUrl = `postgresql://${db.username}:${plainPassword}@${db.slug}:${internalPort}/${db.databaseName}`;
      externalUrl = externalPort
        ? `postgresql://${db.username}:${plainPassword}@${host}:${externalPort}/${db.databaseName}`
        : "";
      sslUrl = externalUrl ? `${externalUrl}?sslmode=require` : "";

      if (poolerPort) {
        pooledUrl = `postgresql://${db.username}:${plainPassword}@${host}:${poolerPort}/${db.databaseName}?pgbouncer=true`;
      }
      if (db.enablePooler) {
        internalPooledUrl = `postgresql://${db.username}:${plainPassword}@${db.slug}-pooler:5432/${db.databaseName}?pgbouncer=true`;
      }
      if (plainReadonlyPassword && externalPort) {
        readonlyUrl = `postgresql://readonly_user:${plainReadonlyPassword}@${host}:${externalPort}/${db.databaseName}`;
      }
    } else if (db.type === "REDIS") {
      internalUrl = `redis://default:${plainPassword}@${db.slug}:${internalPort}`;
      externalUrl = externalPort ? `redis://default:${plainPassword}@${host}:${externalPort}` : "";
    } else if (db.type === "MYSQL") {
      internalUrl = `mysql://${db.username}:${plainPassword}@${db.slug}:${internalPort}/${db.databaseName}`;
      externalUrl = externalPort
        ? `mysql://${db.username}:${plainPassword}@${host}:${externalPort}/${db.databaseName}`
        : "";
    }

    return {
      ...db,
      decryptedPassword: plainPassword,
      decryptedReadonlyPassword: plainReadonlyPassword || undefined,
      internalUrl,
      externalUrl,
      sslUrl,
      pooledUrl,
      internalPooledUrl,
      readonlyUrl,
      externalHost: host,
    };
  }

  // ── GET /api/databases — List all user databases ───────────────────────────
  fastify.get("/", async (request: any) => {
    const { userId, role } = request.user;
    const query = request.query as { all?: string };
    const where = role === "ADMIN" && query?.all === "true" ? {} : { userId };

    const databases = await prisma.databaseService.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return databases.map((db) => formatDatabaseUrls(db));
  });

  // ── POST /api/databases — Create and provision database ────────────────────
  fastify.post("/", async (request: any, reply) => {
    const userId = request.user.userId;
    const {
      name,
      slug: customSlug,
      type = "POSTGRESQL",
      version = "16",
      databaseName,
      username,
      instanceType = "starter",
    } = request.body as {
      name: string;
      slug?: string;
      type?: "POSTGRESQL" | "REDIS" | "MYSQL";
      version?: string;
      databaseName?: string;
      username?: string;
      instanceType?: string;
    };

    if (!name || name.trim().length === 0) {
      return reply.code(400).send({ error: "Database name is required" });
    }

    // Generate clean slug
    const cleanName = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const baseSlug = customSlug
      ? customSlug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      : `db-${cleanName}`;

    // Ensure slug uniqueness
    let finalSlug = baseSlug;
    let suffix = 1;
    while (await prisma.databaseService.findUnique({ where: { slug: finalSlug } })) {
      finalSlug = `${baseSlug}-${suffix}`;
      suffix++;
    }

    // Credentials & Naming
    const cleanDbName = databaseName
      ? databaseName.replace(/[^a-zA-Z0-9_]/g, "_")
      : type === "REDIS"
      ? ""
      : `${cleanName.replace(/-/g, "_")}_db`;

    const cleanUsername = username
      ? username.replace(/[^a-zA-Z0-9_]/g, "_")
      : type === "REDIS"
      ? "default"
      : `${cleanName.replace(/-/g, "_")}_user`;

    // Generate high-entropy 24-char password
    const rawPassword = crypto.randomBytes(18).toString("base64url");
    const encryptedPassword = encrypt(rawPassword);

    // Resource limits & Portfolio Forced-Idleness enforcement
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true },
    });
    const isUserAdmin =
      userRecord?.role === "ADMIN" ||
      userRecord?.role === "ROOT_ADMIN" ||
      userRecord?.email === "aj0892829122@gmail.com";

    // Non-admin users are strictly locked to starter tier (0.5 vCPU, 512MB RAM, 20m auto-sleep)
    let effectiveInstanceType = "starter";
    let cpuLimit = 0.5;
    let memoryLimit = 512;

    if (isUserAdmin) {
      effectiveInstanceType = instanceType || "starter";
      if (effectiveInstanceType === "standard") {
        cpuLimit = 1.0;
        memoryLimit = 1024;
      } else if (effectiveInstanceType === "pro") {
        cpuLimit = 2.0;
        memoryLimit = 2048;
      }
    }

    const internalPort = type === "REDIS" ? 6379 : type === "MYSQL" ? 3306 : 5432;

    const newDb = await prisma.databaseService.create({
      data: {
        userId,
        name: name.trim(),
        slug: finalSlug,
        type,
        version: String(version),
        status: "PROVISIONING",
        databaseName: cleanDbName,
        username: cleanUsername,
        password: encryptedPassword,
        internalPort,
        volumePath: "", // populated by worker on provision
        instanceType: effectiveInstanceType,
        cpuLimit,
        memoryLimit,
      },
    });

    // Enqueue provisioning job in BullMQ
    await databaseQueue.add("database-job", {
      action: "provision",
      databaseId: newDb.id,
    });

    return reply.code(201).send(formatDatabaseUrls(newDb));
  });

  // ── GET /api/databases/:id — Get single database ───────────────────────────
  fastify.get("/:id", async (request: any, reply) => {
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const db = await prisma.databaseService.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database service not found" });
    }

    return formatDatabaseUrls(db);
  });

  // ── POST /api/databases/:id/restart — Restart database ─────────────────────
  fastify.post("/:id/restart", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    await prisma.databaseService.update({
      where: { id },
      data: { status: "RESTARTING" },
    });

    await databaseQueue.add("database-job", {
      action: "restart",
      databaseId: id,
    });

    return { message: "Database restart initiated", status: "RESTARTING" };
  });

  // ── POST /api/databases/:id/stop — Stop database ───────────────────────────
  fastify.post("/:id/stop", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    await databaseQueue.add("database-job", {
      action: "stop",
      databaseId: id,
    });

    return { message: "Database stop initiated" };
  });

  // ── POST /api/databases/:id/start — Start database ─────────────────────────
  fastify.post("/:id/start", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    await databaseQueue.add("database-job", {
      action: "start",
      databaseId: id,
    });

    return { message: "Database start initiated" };
  });

  // ── GET & POST /api/databases/:id/wake — Wake up sleeping database ───────────
  const handleWake = async (request: any, reply: any) => {
    const userId = request.user?.userId;
    const { id } = request.params as { id: string };

    const db = await prisma.databaseService.findFirst({
      where: { id, ...(userId ? { userId } : {}) },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    if (db.status === "RUNNING") {
      await redisClient.set(`db:access:${db.id}`, Date.now()).catch(() => {});
      return { status: "RUNNING", booting: false, message: "Database is active and operational." };
    }

    const isRunning = await ensureDatabaseRunning(db);
    if (isRunning) {
      return { status: "RUNNING", booting: false, message: "Database is active and operational." };
    }

    return reply.code(202).send({
      status: "PROVISIONING",
      booting: true,
      message: "Database is booting up. Please retry in a few seconds.",
    });
  };

  fastify.get("/:id/wake", handleWake);
  fastify.post("/:id/wake", handleWake);

  // ── GET /api/databases/public/:slug/wake — Public wakeup ping by slug ────────
  fastify.get("/public/:slug/wake", async (request: any, reply: any) => {
    const { slug } = request.params as { slug: string };
    const db = await prisma.databaseService.findUnique({
      where: { slug },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    if (db.status === "RUNNING") {
      await redisClient.set(`db:access:${db.id}`, Date.now()).catch(() => {});
      return { status: "RUNNING", booting: false, message: "Database is operational." };
    }

    const isRunning = await ensureDatabaseRunning(db);
    if (isRunning) {
      return { status: "RUNNING", booting: false, message: "Database is operational." };
    }

    return reply.code(202).send({
      status: "PROVISIONING",
      booting: true,
      message: "Database is booting up. Please retry in a few seconds.",
    });
  });

  // ── DELETE /api/databases/:id — Delete database ────────────────────────────
  fastify.delete("/:id", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    await databaseQueue.add("database-job", {
      action: "delete",
      databaseId: id,
    });

    return { message: "Database deletion initiated" };
  });

  // ── GET /api/databases/:id/logs — Real-time & Historical SSE Logs ──────────
  fastify.get("/:id/logs", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    });

    const sendEvent = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const logId = `db-${id}`;

    // 1. Send historical logs
    const history = await redisClient.lrange(`build-logs:${logId}`, 0, -1).catch(() => []);
    history.forEach((line) => {
      sendEvent("log", { line });
    });

    // 2. Subscribe to live stream
    const channel = `logs:${logId}`;
    const sub = redisSub.duplicate();
    await sub.subscribe(channel);

    sub.on("message", (_ch: string, message: string) => {
      sendEvent("log", { line: message });
    });

    // Keepalive ping every 15s
    const pingTimer = setInterval(() => {
      sendEvent("ping", { ts: Date.now() });
    }, 15000);

    request.raw.on("close", () => {
      clearInterval(pingTimer);
      sub.unsubscribe(channel).catch(() => {});
      sub.quit().catch(() => {});
    });
  });

  // ── GET /api/databases/:id/metrics — Real-time CPU & RAM stats ─────────────
  fastify.get("/:id/metrics", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    try {
      const docker = await getDocker();
      if (!docker) {
        return {
          cpuPercent: 0,
          memoryMB: 0,
          memoryLimitMB: db.memoryLimit,
          isRunning: false,
          status: db.status,
        };
      }

      const containerName = `whizan-db-${id}`;
      const container = docker.getContainer(containerName);
      const inspect = await container.inspect().catch(() => null);

      if (!inspect || !inspect.State.Running) {
        return {
          cpuPercent: 0,
          memoryMB: 0,
          memoryLimitMB: db.memoryLimit,
          isRunning: false,
          status: db.status,
        };
      }

      const stats = (await container.stats({ stream: false })) as any;
      const memBytes = (stats.memory_stats?.usage || 0) - (stats.memory_stats?.stats?.cache || 0);
      const memoryMB = Math.round(memBytes / (1024 * 1024));

      let cpuPercent = 0;
      const cpuDelta =
        (stats.cpu_stats?.cpu_usage?.total_usage || 0) -
        (stats.precpu_stats?.cpu_usage?.total_usage || 0);
      const systemDelta =
        (stats.cpu_stats?.system_cpu_usage || 0) -
        (stats.precpu_stats?.system_cpu_usage || 0);
      const numCpus = stats.cpu_stats?.online_cpus || 1;

      if (systemDelta > 0 && cpuDelta > 0) {
        cpuPercent = Math.round((cpuDelta / systemDelta) * numCpus * 100 * 10) / 10;
      }

      return {
        cpuPercent,
        memoryMB: Math.max(0, memoryMB),
        memoryLimitMB: db.memoryLimit,
        isRunning: true,
        status: db.status,
      };
    } catch {
      return {
        cpuPercent: 0,
        memoryMB: 0,
        memoryLimitMB: db.memoryLimit,
        isRunning: false,
        status: db.status,
      };
    }
  });

  // ── Database Auto-Wakeup Helper ──────────────────────────────────────────
  async function ensureDatabaseRunning(db: any): Promise<boolean> {
    if (db.status === "RUNNING") {
      await redisClient.set(`db:access:${db.id}`, Date.now()).catch(() => {});
      return true;
    }

    console.log(`[Database Auto-Wakeup] Database ${db.name} (${db.id}) is ${db.status}. Triggering wakeup...`);
    await prisma.databaseService.update({
      where: { id: db.id },
      data: { status: "PROVISIONING", errorMessage: null },
    });

    await databaseQueue.add("database-job", {
      action: "start",
      databaseId: db.id,
    });

    // Wait up to 15 seconds for container to start and become RUNNING
    const startWait = Date.now();
    while (Date.now() - startWait < 15000) {
      await new Promise((r) => setTimeout(r, 600));
      const current = await prisma.databaseService.findUnique({
        where: { id: db.id },
        select: { status: true },
      });
      if (current?.status === "RUNNING") {
        await redisClient.set(`db:access:${db.id}`, Date.now()).catch(() => {});
        return true;
      }
    }

    return false;
  }

  // ── Database Connection Helpers ──────────────────────────────────────────
  async function getPgClientForDb(db: any) {
    let plainPassword = "";
    try {
      plainPassword = decrypt(db.password);
    } catch {
      plainPassword = db.password;
    }

    const hostEnv =
      process.env.DB_HOST ||
      process.env.DB_PUBLIC_HOST ||
      process.env.EXTERNAL_DB_HOST ||
      (BASE_DOMAIN && BASE_DOMAIN !== "localhost" ? BASE_DOMAIN : "20.2.136.11");

    // Potential host candidates to connect to:
    // 1. Host from env / BASE_DOMAIN
    // 2. 20.2.136.11 (Cluster public IP)
    // 3. 127.0.0.1 (local connection on the VM)
    // 4. db.slug (internal docker mesh network)
    const hostCandidates = [
      { host: hostEnv, port: db.externalPort || 5432 },
      { host: "20.2.136.11", port: db.externalPort || 5432 },
      { host: "127.0.0.1", port: db.externalPort || 5432 },
      { host: db.slug, port: 5432 },
    ].filter((c, idx, arr) => c.host && arr.findIndex(x => x.host === c.host && x.port === c.port) === idx);

    let lastError: any = null;

    for (const target of hostCandidates) {
      // First try with ssl: { rejectUnauthorized: false }, then try non-SSL
      const sslConfigs = db.sslEnabled !== false
        ? [{ rejectUnauthorized: false }, false]
        : [false, { rejectUnauthorized: false }];

      for (const sslOption of sslConfigs) {
        try {
          const client = new PgClient({
            host: target.host,
            port: target.port,
            user: db.username,
            password: plainPassword,
            database: db.databaseName,
            statement_timeout: 30000,
            connectionTimeoutMillis: 5000,
            ssl: sslOption || undefined,
          });

          await client.connect();
          return client;
        } catch (err: any) {
          lastError = err;
        }
      }
    }

    throw new Error(`Failed to connect to PostgreSQL: ${lastError?.message || "Connection timeout"}`);
  }

  function getRedisClientForDb(db: any) {
    let plainPassword = "";
    try {
      plainPassword = decrypt(db.password);
    } catch {
      plainPassword = db.password;
    }
    const host =
      process.env.DB_HOST ||
      process.env.DB_PUBLIC_HOST ||
      process.env.EXTERNAL_DB_HOST ||
      (BASE_DOMAIN !== "localhost" ? BASE_DOMAIN : "localhost");
    const port = db.externalPort || 6379;
    return new Redis({
      host,
      port,
      password: plainPassword || undefined,
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      lazyConnect: true,
    });
  }

  // ── POST /api/databases/:id/query — Run arbitrary SQL / Redis query ───────
  fastify.post("/:id/query", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };
    const { query } = request.body as { query: string };

    if (!query || typeof query !== "string" || !query.trim()) {
      return reply.code(400).send({ error: "Query cannot be empty" });
    }

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    if (db.status !== "RUNNING") {
      const isRunning = await ensureDatabaseRunning(db);
      if (!isRunning) {
        return reply.code(202).send({
          booting: true,
          error: "Database is booting up from sleep mode. Please retry your query in a few moments.",
        });
      }
    }

    await redisClient.set(`db:access:${db.id}`, Date.now()).catch(() => {});

    if (db.type === "POSTGRESQL") {
      let client;
      try {
        client = await getPgClientForDb(db);
      } catch (err: any) {
        return reply.code(502).send({ success: false, error: err.message });
      }

      try {
        const startTime = process.hrtime.bigint();
        const res = await client.query(query);
        const endTime = process.hrtime.bigint();
        const executionTimeMs = Math.round(Number(endTime - startTime) / 10000) / 100;

        const resultsArray = Array.isArray(res) ? res : [res];
        const lastResult = resultsArray[resultsArray.length - 1];

        return {
          success: true,
          rows: lastResult.rows || [],
          rowCount: lastResult.rowCount ?? (lastResult.rows ? lastResult.rows.length : 0),
          fields: (lastResult.fields || []).map((f: any) => ({
            name: f.name,
            dataTypeID: f.dataTypeID,
          })),
          command: lastResult.command || "QUERY",
          executionTimeMs,
        };
      } catch (err: any) {
        return reply.code(400).send({
          success: false,
          error: err.message,
          position: err.position,
          detail: err.detail,
          hint: err.hint,
        });
      } finally {
        await client.end().catch(() => {});
      }
    } else if (db.type === "REDIS") {
      const redis = getRedisClientForDb(db);
      try {
        await redis.connect();
        const startTime = process.hrtime.bigint();
        const parts = query.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
        const command = parts[0]?.toLowerCase() || "";
        if (!command) {
          return reply.code(400).send({ error: "Empty command" });
        }
        const args = parts.slice(1).map((p) => p.replace(/^["']|["']$/g, ""));
        const rawRes = await (redis as any).call(command, ...args);
        const endTime = process.hrtime.bigint();
        const executionTimeMs = Math.round(Number(endTime - startTime) / 10000) / 100;

        return {
          success: true,
          rows: Array.isArray(rawRes)
            ? rawRes.map((item, idx) => ({ index: idx, value: typeof item === "object" ? JSON.stringify(item) : String(item) }))
            : [{ result: typeof rawRes === "object" ? JSON.stringify(rawRes) : String(rawRes) }],
          rawResult: rawRes,
          command: command.toUpperCase(),
          executionTimeMs,
          rowCount: Array.isArray(rawRes) ? rawRes.length : 1,
          fields: [{ name: "result" }],
        };
      } catch (err: any) {
        return reply.code(400).send({
          success: false,
          error: err.message,
        });
      } finally {
        redis.disconnect();
      }
    } else {
      return reply.code(400).send({ error: `Query runner not supported for engine ${db.type}` });
    }
  });

  // ── GET /api/databases/:id/insights — Query performance & system metrics ───
  fastify.get("/:id/insights", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    if (db.status !== "RUNNING" || db.type !== "POSTGRESQL") {
      const isRunning = await ensureDatabaseRunning(db);
      if (!isRunning || db.type !== "POSTGRESQL") {
        return {
          slowQueries: [],
          cacheHitRatio: 100,
          connectionBreakdown: [],
          runningQueries: [],
          databaseSize: "0 MB",
          databaseSizeBytes: 0,
          booting: db.status !== "RUNNING",
        };
      }
    }

    await redisClient.set(`db:access:${db.id}`, Date.now()).catch(() => {});

    let client: PgClient | null = null;
    try {
      client = await getPgClientForDb(db);
    } catch (err: any) {
      return reply.code(502).send({ error: `Connection failed: ${err.message}` });
    }

    try {
      // 1. Slow queries from pg_stat_statements (if extension available)
      let slowQueries: any[] = [];
      try {
        const slowRes = await client.query(`
          SELECT 
            query,
            calls::int,
            total_exec_time::numeric(10, 2) as total_time_ms,
            mean_exec_time::numeric(10, 2) as mean_time_ms,
            min_exec_time::numeric(10, 2) as min_time_ms,
            max_exec_time::numeric(10, 2) as max_time_ms,
            rows::int as total_rows
          FROM pg_stat_statements
          WHERE query NOT ILIKE '%pg_stat_statements%'
          ORDER BY mean_exec_time DESC
          LIMIT 15;
        `);
        slowQueries = slowRes.rows;
      } catch {
        slowQueries = [];
      }

      // 2. Buffer Cache Hit Ratio
      let cacheHitRatio = 99.5;
      try {
        const cacheRes = await client.query(`
          SELECT 
            COALESCE(round((sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100)::numeric, 2), 100) as ratio
          FROM pg_statio_user_tables;
        `);
        cacheHitRatio = parseFloat(cacheRes.rows[0]?.ratio || "100");
      } catch {}

      // 3. Active Connection Breakdown
      let connectionBreakdown: any[] = [];
      try {
        const connRes = await client.query(`
          SELECT 
            COALESCE(state, 'connecting') as state, 
            count(*)::int as count 
          FROM pg_stat_activity 
          WHERE pid <> pg_backend_pid() 
          GROUP BY state;
        `);
        connectionBreakdown = connRes.rows;
      } catch {}

      // 4. Currently Running Queries / Wait Events
      let runningQueries: any[] = [];
      try {
        const runRes = await client.query(`
          SELECT 
            pid::int,
            usename,
            client_addr::text,
            state,
            ROUND(EXTRACT(EPOCH FROM (now() - query_start))::numeric, 2) as duration_seconds,
            query,
            COALESCE(wait_event_type, 'None') as wait_event_type,
            COALESCE(wait_event, 'None') as wait_event
          FROM pg_stat_activity
          WHERE state != 'idle' AND pid <> pg_backend_pid()
          ORDER BY duration_seconds DESC
          LIMIT 15;
        `);
        runningQueries = runRes.rows;
      } catch {}

      // 5. Database Disk Size
      let databaseSize = "0 MB";
      let databaseSizeBytes = 0;
      try {
        const sizeRes = await client.query(`
          SELECT 
            pg_database_size(current_database()) as size_bytes,
            pg_size_pretty(pg_database_size(current_database())) as size_pretty;
        `);
        databaseSizeBytes = parseInt(sizeRes.rows[0]?.size_bytes || "0", 10);
        databaseSize = sizeRes.rows[0]?.size_pretty || "0 MB";
      } catch {}

      return {
        slowQueries,
        cacheHitRatio,
        connectionBreakdown,
        runningQueries,
        databaseSize,
        databaseSizeBytes,
      };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    } finally {
      await client?.end().catch(() => {});
    }
  });

  // ── POST /api/databases/:id/kill-query — Terminate a running backend process ─
  fastify.post("/:id/kill-query", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };
    const { pid } = request.body as { pid: number };

    if (!pid || typeof pid !== "number") {
      return reply.code(400).send({ error: "Valid query PID is required" });
    }

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db || db.type !== "POSTGRESQL") {
      return reply.code(404).send({ error: "PostgreSQL database not found" });
    }

    let client: PgClient | null = null;
    try {
      client = await getPgClientForDb(db);
      const res = await client.query(`SELECT pg_terminate_backend($1) as terminated;`, [pid]);
      return { success: true, terminated: res.rows[0]?.terminated ?? true };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    } finally {
      await client?.end().catch(() => {});
    }
  });

  // ── POST /api/databases/:id/reset-stats — Reset pg_stat_statements ─────────
  fastify.post("/:id/reset-stats", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db || db.type !== "POSTGRESQL") {
      return reply.code(404).send({ error: "PostgreSQL database not found" });
    }

    let client: PgClient | null = null;
    try {
      client = await getPgClientForDb(db);
      await client.query(`SELECT pg_stat_statements_reset();`);
      return { success: true, message: "Performance metrics reset." };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    } finally {
      await client?.end().catch(() => {});
    }
  });

  // ── POST /api/databases/:id/readonly-user — Create/get dedicated read-only role
  fastify.post("/:id/readonly-user", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db || db.type !== "POSTGRESQL") {
      return reply.code(404).send({ error: "PostgreSQL database not found" });
    }

    const readonlyPass = crypto.randomBytes(16).toString("base64url");
    const encryptedPass = encrypt(readonlyPass);

    let client: PgClient | null = null;
    try {
      client = await getPgClientForDb(db);
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'readonly_user') THEN
            CREATE ROLE readonly_user WITH LOGIN PASSWORD '${readonlyPass}';
          ELSE
            ALTER ROLE readonly_user WITH PASSWORD '${readonlyPass}';
          END IF;
        END
        $$;
        GRANT CONNECT ON DATABASE "${db.databaseName}" TO readonly_user;
        GRANT USAGE ON SCHEMA public TO readonly_user;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_user;
      `);

      await prisma.databaseService.update({
        where: { id },
        data: { readonlyPassword: encryptedPass },
      });

      const host = process.env.DB_PUBLIC_HOST || process.env.EXTERNAL_DB_HOST || BASE_DOMAIN;
      const readonlyUrl = `postgresql://readonly_user:${readonlyPass}@${host}:${db.externalPort}/${db.databaseName}`;

      return {
        success: true,
        username: "readonly_user",
        password: readonlyPass,
        readonlyUrl,
      };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message });
    } finally {
      await client?.end().catch(() => {});
    }
  });

  // ── PUT /api/databases/:id/security — Configure IP Whitelist & SSL ─────────
  fastify.put("/:id/security", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };
    const { ipWhitelist, sslEnabled, enablePooler } = request.body as {
      ipWhitelist?: string[];
      sslEnabled?: boolean;
      enablePooler?: boolean;
    };

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    const updated = await prisma.databaseService.update({
      where: { id },
      data: {
        ...(Array.isArray(ipWhitelist) ? { ipWhitelist } : {}),
        ...(typeof sslEnabled === "boolean" ? { sslEnabled } : {}),
        ...(typeof enablePooler === "boolean" ? { enablePooler } : {}),
      },
    });

    return {
      success: true,
      database: formatDatabaseUrls(updated),
    };
  });

  // ── GET /api/databases/:id/tables — List all tables with stats ─────────────
  fastify.get("/:id/tables", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    if (db.status !== "RUNNING") {
      const isRunning = await ensureDatabaseRunning(db);
      if (!isRunning) {
        return { tables: [], totalTables: 0, databaseSize: "0 kB", databaseSizeBytes: 0, booting: true };
      }
    }

    await redisClient.set(`db:access:${db.id}`, Date.now()).catch(() => {});

    if (db.type === "POSTGRESQL") {
      let client;
      try {
        client = await getPgClientForDb(db);
      } catch (err: any) {
        return reply.code(502).send({ error: err.message });
      }

      try {
        const query = `
          SELECT
            t.table_name,
            GREATEST(0, COALESCE(c.reltuples::bigint, 0)) AS estimated_rows,
            pg_size_pretty(pg_total_relation_size(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))) AS pretty_size,
            pg_total_relation_size(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name)) AS size_bytes,
            (
              SELECT count(*)::int
              FROM information_schema.columns col
              WHERE col.table_schema = t.table_schema AND col.table_name = t.table_name
            ) AS column_count
          FROM information_schema.tables t
          LEFT JOIN pg_class c ON c.relname = t.table_name
          WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
          ORDER BY t.table_name ASC;
        `;
        const result = await client.query(query);

        // Fetch exact counts for each table
        const tablesWithCounts = await Promise.all(
          result.rows.map(async (row) => {
            try {
              const countRes = await client.query(`SELECT count(*)::int as count FROM "${row.table_name}"`);
              return {
                table_name: row.table_name,
                rows: countRes.rows[0]?.count ?? Number(row.estimated_rows) ?? 0,
                size: row.pretty_size || "0 kB",
                sizeBytes: Number(row.size_bytes) || 0,
                columnCount: Number(row.column_count) || 0,
              };
            } catch {
              return {
                table_name: row.table_name,
                rows: Number(row.estimated_rows) || 0,
                size: row.pretty_size || "0 kB",
                sizeBytes: Number(row.size_bytes) || 0,
                columnCount: Number(row.column_count) || 0,
              };
            }
          })
        );

        let dbSize = "N/A";
        let dbSizeBytes = 0;
        try {
          const sizeRes = await client.query(
            `SELECT pg_size_pretty(pg_database_size($1)) as db_size, pg_database_size($1) as db_size_bytes`,
            [db.databaseName]
          );
          dbSize = sizeRes.rows[0]?.db_size || "N/A";
          dbSizeBytes = Number(sizeRes.rows[0]?.db_size_bytes) || 0;
        } catch {}

        return {
          tables: tablesWithCounts,
          totalTables: tablesWithCounts.length,
          databaseSize: dbSize,
          databaseSizeBytes: dbSizeBytes,
        };
      } finally {
        await client.end().catch(() => {});
      }
    } else if (db.type === "REDIS") {
      const redis = getRedisClientForDb(db);
      try {
        await redis.connect();
        const dbsize = await redis.dbsize();
        const info = await redis.info("memory");
        const match = info.match(/used_memory_human:([^\r\n]+)/);
        const memUsed = match ? match[1] : "N/A";
        return {
          tables: [{ table_name: "keyspace", rows: dbsize, size: memUsed, sizeBytes: 0, columnCount: 2 }],
          totalTables: 1,
          databaseSize: memUsed,
          databaseSizeBytes: 0,
        };
      } catch (err: any) {
        return reply.code(502).send({ error: err.message });
      } finally {
        redis.disconnect();
      }
    }

    return { tables: [], totalTables: 0, databaseSize: "0 kB", databaseSizeBytes: 0 };
  });

  // ── GET /api/databases/:id/tables/:table/schema — Get table columns ────────
  fastify.get("/:id/tables/:table/schema", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id, table } = request.params as { id: string; table: string };

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    if (db.status !== "RUNNING") {
      const isRunning = await ensureDatabaseRunning(db);
      if (!isRunning) {
        return reply.code(202).send({ columns: [], booting: true, error: "Database is booting up..." });
      }
    }

    await redisClient.set(`db:access:${db.id}`, Date.now()).catch(() => {});

    if (db.type === "POSTGRESQL") {
      let client;
      try {
        client = await getPgClientForDb(db);
      } catch (err: any) {
        return reply.code(502).send({ error: err.message });
      }

      try {
        const query = `
          SELECT 
            c.column_name,
            c.data_type,
            c.udt_name,
            c.is_nullable = 'YES' AS is_nullable,
            c.column_default,
            c.character_maximum_length,
            COALESCE(
              (
                SELECT true
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                  AND tc.table_name = c.table_name
                  AND kcu.column_name = c.column_name
                LIMIT 1
              ), false
            ) AS is_primary_key
          FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = $1
          ORDER BY c.ordinal_position ASC;
        `;
        const result = await client.query(query, [table]);
        return { columns: result.rows };
      } finally {
        await client.end().catch(() => {});
      }
    }

    return { columns: [] };
  });

  // ── GET /api/databases/:id/tables/:table/data — Get table data rows ────────
  fastify.get("/:id/tables/:table/data", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id, table } = request.params as { id: string; table: string };
    const query = request.query as {
      page?: string;
      limit?: string;
      sortColumn?: string;
      sortOrder?: string;
      search?: string;
    };

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    if (db.status !== "RUNNING") {
      const isRunning = await ensureDatabaseRunning(db);
      if (!isRunning) {
        return reply.code(202).send({ rows: [], total: 0, booting: true, error: "Database is booting up..." });
      }
    }

    await redisClient.set(`db:access:${db.id}`, Date.now()).catch(() => {});

    if (db.type === "POSTGRESQL") {
      let client;
      try {
        client = await getPgClientForDb(db);
      } catch (err: any) {
        return reply.code(502).send({ error: err.message });
      }

      try {
        // Validate table exists
        const checkTable = await client.query(
          "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1",
          [table]
        );
        if (checkTable.rows.length === 0) {
          return reply.code(404).send({ error: `Table '${table}' not found` });
        }

        const validColumns = checkTable.rows.map((r) => r.column_name);

        const page = Math.max(1, parseInt(query.page || "1", 10));
        const limit = Math.min(200, Math.max(1, parseInt(query.limit || "50", 10)));
        const offset = (page - 1) * limit;

        let orderClause = "";
        if (query.sortColumn && validColumns.includes(query.sortColumn)) {
          const dir = (query.sortOrder || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
          orderClause = `ORDER BY "${query.sortColumn}" ${dir}`;
        }

        let whereClause = "";
        const searchParams: any[] = [];
        if (query.search && query.search.trim()) {
          const textCols = checkTable.rows
            .filter((r) =>
              ["character varying", "text", "varchar", "character"].includes(r.data_type)
            )
            .map((r) => r.column_name);
          if (textCols.length > 0) {
            const conditions = textCols.map((col, idx) => `"${col}"::text ILIKE $${idx + 1}`);
            whereClause = `WHERE ${conditions.join(" OR ")}`;
            searchParams.push(...textCols.map(() => `%${query.search!.trim()}%`));
          }
        }

        const countSql = `SELECT count(*)::int as total FROM "${table}" ${whereClause}`;
        const countRes = await client.query(countSql, searchParams);
        const totalCount = countRes.rows[0]?.total ?? 0;

        const dataSql = `SELECT * FROM "${table}" ${whereClause} ${orderClause} LIMIT $${
          searchParams.length + 1
        } OFFSET $${searchParams.length + 2}`;
        const dataRes = await client.query(dataSql, [...searchParams, limit, offset]);

        return {
          rows: dataRes.rows,
          totalCount,
          page,
          limit,
          columns: validColumns,
        };
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      } finally {
        await client.end().catch(() => {});
      }
    }

    return { rows: [], totalCount: 0, page: 1, limit: 50, columns: [] };
  });

  // ── POST /api/databases/:id/tables/:table/row — Insert row into table ──────
  fastify.post("/:id/tables/:table/row", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id, table } = request.params as { id: string; table: string };
    const { data } = request.body as { data: Record<string, any> };

    if (!data || Object.keys(data).length === 0) {
      return reply.code(400).send({ error: "Row data is required" });
    }

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    if (db.status !== "RUNNING") {
      const isRunning = await ensureDatabaseRunning(db);
      if (!isRunning) {
        return reply.code(202).send({ booting: true, error: "Database is booting up..." });
      }
    }

    await redisClient.set(`db:access:${db.id}`, Date.now()).catch(() => {});

    if (db.type === "POSTGRESQL") {
      let client;
      try {
        client = await getPgClientForDb(db);
      } catch (err: any) {
        return reply.code(502).send({ error: err.message });
      }

      try {
        // Filter out empty strings for auto-increment or null columns
        const cleanData: Record<string, any> = {};
        for (const [k, v] of Object.entries(data)) {
          if (v !== "" && v !== undefined && v !== null) {
            cleanData[k] = v;
          }
        }

        const keys = Object.keys(cleanData);
        if (keys.length === 0) {
          const res = await client.query(`INSERT INTO "${table}" DEFAULT VALUES RETURNING *`);
          return { success: true, row: res.rows[0] };
        }

        const values = Object.values(cleanData);
        const quotedCols = keys.map((k) => `"${k}"`).join(", ");
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");

        const sql = `INSERT INTO "${table}" (${quotedCols}) VALUES (${placeholders}) RETURNING *`;
        const res = await client.query(sql, values);
        return { success: true, row: res.rows[0] };
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      } finally {
        await client.end().catch(() => {});
      }
    }

    return reply.code(400).send({ error: "Not supported for this database type" });
  });

  // ── PUT /api/databases/:id/tables/:table/row — Update row in table ─────────
  fastify.put("/:id/tables/:table/row", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id, table } = request.params as { id: string; table: string };
    const { primaryKey, data } = request.body as {
      primaryKey: { column: string; value: any };
      data: Record<string, any>;
    };

    if (!primaryKey?.column || primaryKey.value === undefined) {
      return reply.code(400).send({ error: "Primary key column and value required" });
    }

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    if (db.status !== "RUNNING") {
      const isRunning = await ensureDatabaseRunning(db);
      if (!isRunning) {
        return reply.code(202).send({ booting: true, error: "Database is booting up..." });
      }
    }

    await redisClient.set(`db:access:${db.id}`, Date.now()).catch(() => {});

    if (db.type === "POSTGRESQL") {
      let client;
      try {
        client = await getPgClientForDb(db);
      } catch (err: any) {
        return reply.code(502).send({ error: err.message });
      }

      try {
        const keys = Object.keys(data).filter((k) => k !== primaryKey.column);
        if (keys.length === 0) {
          return reply.code(400).send({ error: "No fields to update" });
        }

        const values = keys.map((k) => data[k]);
        const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
        values.push(primaryKey.value);

        const sql = `UPDATE "${table}" SET ${setClauses} WHERE "${primaryKey.column}" = $${values.length} RETURNING *`;
        const res = await client.query(sql, values);
        return { success: true, row: res.rows[0] };
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      } finally {
        await client.end().catch(() => {});
      }
    }

    return reply.code(400).send({ error: "Not supported" });
  });

  // ── DELETE /api/databases/:id/tables/:table/row — Delete row from table ────
  fastify.delete("/:id/tables/:table/row", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id, table } = request.params as { id: string; table: string };
    const { primaryKey } = request.body as {
      primaryKey: { column: string; value: any };
    };

    if (!primaryKey?.column || primaryKey.value === undefined) {
      return reply.code(400).send({ error: "Primary key column and value required" });
    }

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    if (db.status !== "RUNNING") {
      const isRunning = await ensureDatabaseRunning(db);
      if (!isRunning) {
        return reply.code(202).send({ booting: true, error: "Database is booting up..." });
      }
    }

    await redisClient.set(`db:access:${db.id}`, Date.now()).catch(() => {});

    if (db.type === "POSTGRESQL") {
      let client;
      try {
        client = await getPgClientForDb(db);
      } catch (err: any) {
        return reply.code(502).send({ error: err.message });
      }

      try {
        const sql = `DELETE FROM "${table}" WHERE "${primaryKey.column}" = $1`;
        await client.query(sql, [primaryKey.value]);
        return { success: true };
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      } finally {
        await client.end().catch(() => {});
      }
    }

    return reply.code(400).send({ error: "Not supported" });
  });

  // ── POST /api/databases/:id/tables — Create Table ──────────────────────────
  fastify.post("/:id/tables", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };
    const { tableName, columns } = request.body as {
      tableName: string;
      columns: Array<{
        name: string;
        type: string;
        isPrimaryKey?: boolean;
        isNullable?: boolean;
        defaultValue?: string;
      }>;
    };

    if (!tableName || !Array.isArray(columns) || columns.length === 0) {
      return reply.code(400).send({ error: "Table name and columns required" });
    }

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    if (db.status !== "RUNNING") {
      const isRunning = await ensureDatabaseRunning(db);
      if (!isRunning) {
        return reply.code(202).send({ booting: true, error: "Database is booting up..." });
      }
    }

    await redisClient.set(`db:access:${db.id}`, Date.now()).catch(() => {});

    if (db.type === "POSTGRESQL") {
      let client;
      try {
        client = await getPgClientForDb(db);
      } catch (err: any) {
        return reply.code(502).send({ error: err.message });
      }

      try {
        const colDefs = columns.map((c) => {
          let def = `"${c.name}" ${c.type}`;
          if (c.isPrimaryKey) def += " PRIMARY KEY";
          if (c.isNullable === false) def += " NOT NULL";
          if (c.defaultValue && c.defaultValue.trim()) def += ` DEFAULT ${c.defaultValue.trim()}`;
          return def;
        });

        const sql = `CREATE TABLE "${tableName}" (\n  ${colDefs.join(",\n  ")}\n)`;
        await client.query(sql);
        return { success: true, message: `Table '${tableName}' created successfully` };
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      } finally {
        await client.end().catch(() => {});
      }
    }

    return reply.code(400).send({ error: "Not supported" });
  });

  // ── DELETE /api/databases/:id/tables/:table — Drop Table ───────────────────
  fastify.delete("/:id/tables/:table", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id, table } = request.params as { id: string; table: string };

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db) {
      return reply.code(404).send({ error: "Database not found" });
    }

    if (db.status !== "RUNNING") {
      const isRunning = await ensureDatabaseRunning(db);
      if (!isRunning) {
        return reply.code(202).send({ booting: true, error: "Database is booting up..." });
      }
    }

    await redisClient.set(`db:access:${db.id}`, Date.now()).catch(() => {});

    if (db.type === "POSTGRESQL") {
      let client;
      try {
        client = await getPgClientForDb(db);
      } catch (err: any) {
        return reply.code(502).send({ error: err.message });
      }

      try {
        await client.query(`DROP TABLE "${table}" CASCADE`);
        return { success: true, message: `Table '${table}' dropped` };
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      } finally {
        await client.end().catch(() => {});
      }
    }

    return reply.code(400).send({ error: "Not supported" });
  });

  // ── Redis Key Management Endpoints ─────────────────────────────────────────
  fastify.get("/:id/redis/keys", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };
    const { pattern = "*" } = request.query as { pattern?: string };

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db || db.type !== "REDIS") {
      return reply.code(404).send({ error: "Redis database not found" });
    }

    const redis = getRedisClientForDb(db);
    try {
      await redis.connect();
      const keys = await redis.keys(pattern);
      const keyDetails = await Promise.all(
        keys.slice(0, 100).map(async (k) => {
          const [type, ttl] = await Promise.all([redis.type(k), redis.ttl(k)]);
          return { key: k, type, ttl };
        })
      );
      return { keys: keyDetails, totalKeys: keys.length };
    } catch (err: any) {
      return reply.code(502).send({ error: err.message });
    } finally {
      redis.disconnect();
    }
  });

  fastify.get("/:id/redis/key", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };
    const { key } = request.query as { key: string };

    if (!key) return reply.code(400).send({ error: "Key required" });

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db || db.type !== "REDIS") return reply.code(404).send({ error: "Redis not found" });

    const redis = getRedisClientForDb(db);
    try {
      await redis.connect();
      const [type, ttl] = await Promise.all([redis.type(key), redis.ttl(key)]);
      let value: any = null;
      if (type === "string") value = await redis.get(key);
      else if (type === "hash") value = await redis.hgetall(key);
      else if (type === "list") value = await redis.lrange(key, 0, 100);
      else if (type === "set") value = await redis.smembers(key);

      return { key, type, ttl, value };
    } catch (err: any) {
      return reply.code(502).send({ error: err.message });
    } finally {
      redis.disconnect();
    }
  });

  fastify.post("/:id/redis/key", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };
    const { key, value, ttl } = request.body as { key: string; value: string; ttl?: number };

    if (!key) return reply.code(400).send({ error: "Key required" });

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db || db.type !== "REDIS") return reply.code(404).send({ error: "Redis not found" });

    const redis = getRedisClientForDb(db);
    try {
      await redis.connect();
      if (ttl && ttl > 0) {
        await redis.set(key, value, "EX", ttl);
      } else {
        await redis.set(key, value);
      }
      return { success: true };
    } catch (err: any) {
      return reply.code(502).send({ error: err.message });
    } finally {
      redis.disconnect();
    }
  });

  fastify.delete("/:id/redis/key", async (request: any, reply) => {
    const userId = request.user.userId;
    const { id } = request.params as { id: string };
    const { key } = request.query as { key: string };

    if (!key) return reply.code(400).send({ error: "Key required" });

    const db = await prisma.databaseService.findFirst({
      where: { id, userId },
    });

    if (!db || db.type !== "REDIS") return reply.code(404).send({ error: "Redis not found" });

    const redis = getRedisClientForDb(db);
    try {
      await redis.connect();
      await redis.del(key);
      return { success: true };
    } catch (err: any) {
      return reply.code(502).send({ error: err.message });
    } finally {
      redis.disconnect();
    }
  });

  // ── POST /api/databases/url-test — Test raw database connection URL ──────────
  fastify.post("/url-test", async (request: any, reply) => {
    const { databaseUrl } = request.body as { databaseUrl?: string };
    if (!databaseUrl || typeof databaseUrl !== "string" || !databaseUrl.trim()) {
      return reply.code(400).send({ error: "databaseUrl is required" });
    }

    const trimmedUrl = databaseUrl.trim();
    const isRedis = trimmedUrl.startsWith("redis://") || trimmedUrl.startsWith("rediss://");
    const isPostgres = trimmedUrl.startsWith("postgres://") || trimmedUrl.startsWith("postgresql://");

    if (!isPostgres && !isRedis) {
      return reply.code(400).send({ error: "Unsupported database URL scheme. Supported: postgresql://, redis://" });
    }

    if (request.user?.role !== "ADMIN" && isRestrictedDatabaseUrl(trimmedUrl)) {
      return reply.code(403).send({
        error: "Security Policy: Direct connection to loopback, private RFC1918 subnets, or cloud metadata endpoints (169.254.169.254) is blocked to prevent SSRF.",
      });
    }

    const start = Date.now();

    if (isPostgres) {
      const client = new PgClient({
        connectionString: trimmedUrl,
        statement_timeout: 10000,
        connectionTimeoutMillis: 7000,
        ssl: trimmedUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
      });

      try {
        await client.connect();
        const res = await client.query(`
          SELECT 
            version() as version, 
            current_database() as database, 
            current_user as user, 
            inet_server_addr() as server_ip,
            inet_server_port() as server_port
        `);
        const latencyMs = Date.now() - start;
        const row = res.rows[0] || {};
        return {
          ok: true,
          type: "POSTGRESQL",
          version: row.version,
          database: row.database,
          user: row.user,
          serverIp: row.server_ip,
          serverPort: row.server_port,
          latencyMs,
        };
      } catch (err: any) {
        return reply.code(400).send({
          ok: false,
          error: err.message,
          code: err.code,
        });
      } finally {
        await client.end().catch(() => {});
      }
    } else if (isRedis) {
      const redis = new Redis(trimmedUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
        lazyConnect: true,
      });

      try {
        await redis.connect();
        const ping = await redis.ping();
        const info = await redis.info();
        const latencyMs = Date.now() - start;
        const versionMatch = info.match(/redis_version:([^\r\n]+)/);
        const dbSize = await redis.dbsize();
        return {
          ok: true,
          type: "REDIS",
          ping,
          version: versionMatch ? versionMatch[1] : "unknown",
          keyCount: dbSize,
          latencyMs,
        };
      } catch (err: any) {
        return reply.code(400).send({
          ok: false,
          error: err.message,
        });
      } finally {
        redis.disconnect();
      }
    }
  });

  // ── POST /api/databases/url-tables — List tables and columns from URL ────────
  fastify.post("/url-tables", async (request: any, reply) => {
    const { databaseUrl } = request.body as { databaseUrl?: string };
    if (!databaseUrl || typeof databaseUrl !== "string") {
      return reply.code(400).send({ error: "databaseUrl is required" });
    }

    const trimmedUrl = databaseUrl.trim();
    if (!trimmedUrl.startsWith("postgres://") && !trimmedUrl.startsWith("postgresql://")) {
      return reply.code(400).send({ error: "Table exploration currently supports PostgreSQL URLs" });
    }

    if (request.user?.role !== "ADMIN" && isRestrictedDatabaseUrl(trimmedUrl)) {
      return reply.code(403).send({
        error: "Security Policy: Direct connection to loopback, private RFC1918 subnets, or cloud metadata endpoints (169.254.169.254) is blocked to prevent SSRF.",
      });
    }

    const client = new PgClient({
      connectionString: trimmedUrl,
      statement_timeout: 20000,
      connectionTimeoutMillis: 7000,
      ssl: trimmedUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
    });

    try {
      await client.connect();

      // 1. Get all tables and approximate row count
      const tablesRes = await client.query(`
        SELECT 
          t.table_name,
          t.table_schema,
          COALESCE(c.reltuples::bigint, 0) AS approximate_row_count
        FROM information_schema.tables t
        LEFT JOIN pg_class c ON c.relname = t.table_name
        WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
          AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name ASC
      `);

      // 2. Get column information
      const columnsRes = await client.query(`
        SELECT 
          c.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          CASE WHEN kcu.column_name IS NOT NULL THEN true ELSE false END as is_primary_key
        FROM information_schema.columns c
        LEFT JOIN information_schema.table_constraints tc 
          ON tc.table_name = c.table_name 
          AND tc.table_schema = c.table_schema 
          AND tc.constraint_type = 'PRIMARY KEY'
        LEFT JOIN information_schema.key_column_usage kcu 
          ON kcu.table_name = c.table_name 
          AND kcu.table_schema = c.table_schema 
          AND kcu.constraint_name = tc.constraint_name 
          AND kcu.column_name = c.column_name
        WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY c.table_name, c.ordinal_position
      `);

      const columnsByTable: Record<string, any[]> = {};
      for (const col of columnsRes.rows) {
        if (!columnsByTable[col.table_name]) {
          columnsByTable[col.table_name] = [];
        }
        columnsByTable[col.table_name].push({
          name: col.column_name,
          type: col.data_type,
          isNullable: col.is_nullable === "YES",
          defaultValue: col.column_default,
          isPrimaryKey: col.is_primary_key === true,
        });
      }

      const tables = tablesRes.rows.map((row) => ({
        tableName: row.table_name,
        schema: row.table_schema,
        rowCount: Math.max(0, parseInt(row.approximate_row_count, 10)),
        columnCount: (columnsByTable[row.table_name] || []).length,
        columns: columnsByTable[row.table_name] || [],
      }));

      return { tables };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    } finally {
      await client.end().catch(() => {});
    }
  });

  // ── POST /api/databases/url-query — Run query against raw database URL ──────
  fastify.post("/url-query", async (request: any, reply) => {
    const { databaseUrl, query } = request.body as { databaseUrl?: string; query?: string };
    if (!databaseUrl || typeof databaseUrl !== "string") {
      return reply.code(400).send({ error: "databaseUrl is required" });
    }
    if (!query || typeof query !== "string" || !query.trim()) {
      return reply.code(400).send({ error: "Query is required" });
    }

    const trimmedUrl = databaseUrl.trim();
    const isRedis = trimmedUrl.startsWith("redis://") || trimmedUrl.startsWith("rediss://");
    const isPostgres = trimmedUrl.startsWith("postgres://") || trimmedUrl.startsWith("postgresql://");

    if (!isPostgres && !isRedis) {
      return reply.code(400).send({ error: "Unsupported database URL scheme" });
    }

    if (request.user?.role !== "ADMIN" && isRestrictedDatabaseUrl(trimmedUrl)) {
      return reply.code(403).send({
        error: "Security Policy: Direct connection to loopback, private RFC1918 subnets, or cloud metadata endpoints (169.254.169.254) is blocked to prevent SSRF.",
      });
    }

    const start = Date.now();

    if (isPostgres) {
      const client = new PgClient({
        connectionString: trimmedUrl,
        statement_timeout: 60000,
        connectionTimeoutMillis: 8000,
        ssl: trimmedUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
      });

      try {
        await client.connect();
        const res = await client.query(query);
        const executionTimeMs = Date.now() - start;

        // In case multiple statements were executed
        const lastResult = Array.isArray(res) ? res[res.length - 1] : res;
        const rows = lastResult?.rows || [];
        const fields = (lastResult?.fields || []).map((f: any) => ({
          name: f.name,
          dataType: String(f.dataTypeID),
        }));
        const totalAffected = Array.isArray(res)
          ? res.reduce((acc, r) => acc + (r.rowCount || 0), 0)
          : (res.rowCount ?? rows.length);

        return {
          rows,
          fields,
          rowCount: totalAffected,
          executionTimeMs,
          statementCount: Array.isArray(res) ? res.length : 1,
        };
      } catch (err: any) {
        return reply.code(400).send({
          error: err.message,
          position: err.position,
          detail: err.detail,
        });
      } finally {
        await client.end().catch(() => {});
      }
    } else if (isRedis) {
      const redis = new Redis(trimmedUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
        lazyConnect: true,
      });

      try {
        await redis.connect();
        const parts = query.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
        if (!parts.length) throw new Error("Empty command");
        const command = (parts[0] || "").toLowerCase();
        const args = parts.slice(1).map((arg) => arg.replace(/^["']|["']$/g, ""));

        if (typeof (redis as any)[command] !== "function") {
          throw new Error(`Unknown or unsupported Redis command: ${command}`);
        }

        const rawResult = await (redis as any)[command](...args);
        const executionTimeMs = Date.now() - start;

        let rows: any[] = [];
        if (Array.isArray(rawResult)) {
          rows = rawResult.map((val, idx) => ({ index: idx, value: val }));
        } else if (typeof rawResult === "object" && rawResult !== null) {
          rows = Object.entries(rawResult).map(([k, v]) => ({ key: k, value: v }));
        } else {
          rows = [{ result: rawResult }];
        }

        const fields = rows.length > 0 ? Object.keys(rows[0]).map((k) => ({ name: k, dataType: "string" })) : [];

        return {
          rows,
          fields,
          rowCount: rows.length,
          executionTimeMs,
        };
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      } finally {
        redis.disconnect();
      }
    }
  });
};

