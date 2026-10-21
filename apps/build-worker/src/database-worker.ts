import { Worker, type Job } from "bullmq";
import { PrismaClient } from "@hostify/db";
import { DatabaseRunner, type ProvisionDatabaseOptions } from "./database-runner.js";
import { publishLog } from "./log-streamer.js";
import { decrypt } from "./crypto.js";
import { redisPub, redisOptions, Redis, REDIS_URL } from "./redis.js";

const prisma = new PrismaClient();
const databaseRunner = new DatabaseRunner();

export interface DatabaseJobData {
  action: "provision" | "restart" | "stop" | "start" | "delete";
  databaseId: string;
}

console.log("[Database Worker] Loaded and listening for 'database-job' jobs.");

export const databaseWorker = new Worker<DatabaseJobData>(
  "database-job",
  async (job: Job<DatabaseJobData>) => {
    const { action, databaseId } = job.data;
    const logId = `db-${databaseId}`;

    const log = async (msg: string): Promise<void> => {
      console.log(`[Database:${databaseId}] ${msg}`);
      await publishLog(redisPub, logId, `[${new Date().toISOString().split("T")[1].slice(0, 8)}] ${msg}`);
    };

    const dbRecord = await prisma.databaseService.findUnique({
      where: { id: databaseId },
    });

    if (!dbRecord && action !== "delete") {
      throw new Error(`Database record with ID ${databaseId} not found.`);
    }

    try {
      if (action === "provision" && dbRecord) {
        await log(`🚀 Received request to provision managed ${dbRecord.type} database "${dbRecord.name}"`);

        await prisma.databaseService.update({
          where: { id: databaseId },
          data: { status: "PROVISIONING", errorMessage: null },
        });

        // Decrypt password for container environment
        const decryptedPassword = decrypt(dbRecord.password);
        let decryptedReadonlyPassword: string | undefined = undefined;
        if (dbRecord.readonlyPassword) {
          try {
            decryptedReadonlyPassword = decrypt(dbRecord.readonlyPassword);
          } catch {}
        }

        const runnerOpts: ProvisionDatabaseOptions = {
          id: dbRecord.id,
          slug: dbRecord.slug,
          name: dbRecord.name,
          type: dbRecord.type,
          version: dbRecord.version,
          databaseName: dbRecord.databaseName,
          username: dbRecord.username,
          password: decryptedPassword,
          internalPort: dbRecord.internalPort,
          cpuLimit: dbRecord.cpuLimit,
          memoryLimit: dbRecord.memoryLimit,
          enablePooler: dbRecord.enablePooler,
          sslEnabled: dbRecord.sslEnabled,
          ipWhitelist: dbRecord.ipWhitelist,
          readonlyPassword: decryptedReadonlyPassword,
        };

        const result = await databaseRunner.provision(runnerOpts, log);

        await prisma.databaseService.update({
          where: { id: databaseId },
          data: {
            status: "RUNNING",
            externalPort: result.externalPort,
            poolerPort: result.poolerPort,
            volumePath: result.volumePath,
            errorMessage: null,
          },
        });

        await log(`🌟 Database is live and ready to receive traffic!`);
      } else if (action === "restart" && dbRecord) {
        await log(`🔄 Restarting database "${dbRecord.name}"...`);

        await prisma.databaseService.update({
          where: { id: databaseId },
          data: { status: "RESTARTING" },
        });

        const decryptedPassword = decrypt(dbRecord.password);
        const runnerOpts: ProvisionDatabaseOptions = {
          id: dbRecord.id,
          slug: dbRecord.slug,
          name: dbRecord.name,
          type: dbRecord.type,
          version: dbRecord.version,
          databaseName: dbRecord.databaseName,
          username: dbRecord.username,
          password: decryptedPassword,
          internalPort: dbRecord.internalPort,
          cpuLimit: dbRecord.cpuLimit,
          memoryLimit: dbRecord.memoryLimit,
        };

        await databaseRunner.restart(databaseId, runnerOpts, log);

        await prisma.databaseService.update({
          where: { id: databaseId },
          data: { status: "RUNNING", errorMessage: null },
        });

        await log(`✓ Database successfully restarted and verified healthy.`);
      } else if (action === "stop" && dbRecord) {
        await log(`⏹️ Stopping database "${dbRecord.name}"...`);

        await databaseRunner.stop(databaseId);

        await prisma.databaseService.update({
          where: { id: databaseId },
          data: { status: "STOPPED" },
        });

        await log(`✓ Database container stopped.`);
      } else if (action === "start" && dbRecord) {
        await log(`▶️ Starting database "${dbRecord.name}"...`);

        await prisma.databaseService.update({
          where: { id: databaseId },
          data: { status: "PROVISIONING" },
        });

        const decryptedPassword = decrypt(dbRecord.password);
        let decryptedReadonlyPassword: string | undefined = undefined;
        if (dbRecord.readonlyPassword) {
          try {
            decryptedReadonlyPassword = decrypt(dbRecord.readonlyPassword);
          } catch {}
        }

        const runnerOpts: ProvisionDatabaseOptions = {
          id: dbRecord.id,
          slug: dbRecord.slug,
          name: dbRecord.name,
          type: dbRecord.type,
          version: dbRecord.version,
          databaseName: dbRecord.databaseName,
          username: dbRecord.username,
          password: decryptedPassword,
          externalPort: dbRecord.externalPort,
          internalPort: dbRecord.internalPort,
          cpuLimit: dbRecord.cpuLimit,
          memoryLimit: dbRecord.memoryLimit,
          enablePooler: dbRecord.enablePooler,
          sslEnabled: dbRecord.sslEnabled,
          ipWhitelist: dbRecord.ipWhitelist,
          readonlyPassword: decryptedReadonlyPassword,
        };

        const startResult = await databaseRunner.start(databaseId, runnerOpts);

        await prisma.databaseService.update({
          where: { id: databaseId },
          data: {
            status: "RUNNING",
            errorMessage: null,
            ...(startResult?.externalPort ? { externalPort: startResult.externalPort } : {}),
            ...(startResult?.poolerPort ? { poolerPort: startResult.poolerPort } : {}),
          },
        });

        await redisPub.set(`db:access:${databaseId}`, Date.now()).catch(() => {});
        await log(`✓ Database successfully started and operational.`);
      } else if (action === "delete") {
        await log(`🗑️ Deleting database container and cleaning storage volume...`);

        if (dbRecord) {
          await databaseRunner.delete(databaseId, dbRecord.volumePath, true);
          await prisma.databaseService.delete({ where: { id: databaseId } });
        } else {
          await databaseRunner.delete(databaseId, undefined, true);
        }

        await log(`✓ Database successfully deleted.`);
      }
    } catch (err: any) {
      console.error(`[DatabaseWorker] Error during ${action} for ${databaseId}:`, err);
      await log(`❌ Error during ${action}: ${err.message}`);

      if (dbRecord && action !== "delete") {
        await prisma.databaseService.update({
          where: { id: databaseId },
          data: {
            status: "FAILED",
            errorMessage: err.message,
          },
        }).catch(() => {});
      }
      throw err;
    }
  },
  {
    connection: new Redis(REDIS_URL, redisOptions),
    concurrency: 3,
  }
);

// ── Inactivity Watchdog: Spin down idle databases after 20 minutes ─────────
const dbInactivityInterval = setInterval(async () => {
  try {
    const runningDatabases = await prisma.databaseService.findMany({
      where: { status: "RUNNING" },
    });

    if (runningDatabases.length === 0) return;

    const Docker = (await import("dockerode")).default;
    const docker = new Docker({ socketPath: "/var/run/docker.sock" });

    for (const db of runningDatabases) {
      const accessKey = `db:access:${db.id}`;
      const lastAccessRaw = await redisPub.get(accessKey);
      const lastAccess = lastAccessRaw ? parseInt(lastAccessRaw, 10) : db.updatedAt.getTime();
      const idleMs = Date.now() - lastAccess;

      // 20 minutes threshold = 20 * 60 * 1000 = 1,200,000 ms
      if (idleMs > 20 * 60 * 1000) {
        let hasActiveQueries = false;

        // Check if there are active user queries running in PostgreSQL
        if (db.type === "POSTGRESQL") {
          try {
            const containerName = `whizan-db-${db.id}`;
            const container = docker.getContainer(containerName);
            const exec = await container.exec({
              Cmd: [
                "psql",
                "-U",
                db.username,
                "-d",
                db.databaseName,
                "-t",
                "-c",
                "SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND pid <> pg_backend_pid();",
              ],
              AttachStdout: true,
              AttachStderr: true,
            });

            const stream = await exec.start({ hijack: true, stdin: false });
            let output = "";
            stream.on("data", (chunk: Buffer) => {
              output += chunk.toString();
            });
            await new Promise((resolve) => stream.on("end", resolve));

            const count = parseInt(output.trim(), 10);
            if (!isNaN(count) && count > 0) {
              hasActiveQueries = true;
            }
          } catch {
            // Container exec failed or container unreachable
          }
        }

        if (hasActiveQueries) {
          // Prolong active state because real database queries are running
          await redisPub.set(accessKey, Date.now()).catch(() => {});
          continue;
        }

        console.log(`[Database Scaler] Database ${db.name} (${db.id}) idle for ${Math.round(idleMs / 60000)}m. Stopping container to save RAM...`);
        await publishLog(
          redisPub,
          `db-${db.id}`,
          `💤 [Auto-Sleep] Database ${db.name} was idle for 20m with 0 active connections. Container stopped (0 MB RAM). Data volume preserved.`
        );

        // Gracefully stop container (keeping persistent volume on disk intact)
        await databaseRunner.stop(db.id).catch((err) => {
          console.warn(`[Database Scaler] Error stopping db container:`, err.message);
        });

        await prisma.databaseService.update({
          where: { id: db.id },
          data: { status: "STOPPED" },
        }).catch(() => {});
      }
    }
  } catch (err: any) {
    console.error("[Database Scaler] Inactivity check error:", err.message);
  }
}, 60 * 1000);
