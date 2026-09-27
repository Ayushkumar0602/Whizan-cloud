import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { PrismaClient } from "@hostify/db";
import { DatabaseRunner, type ProvisionDatabaseOptions } from "./database-runner.js";
import { publishLog } from "./log-streamer.js";
import { decrypt } from "./crypto.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const redisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times: number) {
    return Math.min(times * 100, 3000);
  },
  reconnectOnError() {
    return true;
  },
};

const redisPub = new Redis(REDIS_URL, redisOptions);
redisPub.on("error", (err) => {
  if (err.message?.includes("Connection is closed")) return;
  console.warn("[Database RedisPub warn]", err.message);
});

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

        await databaseRunner.start(databaseId, runnerOpts);

        await prisma.databaseService.update({
          where: { id: databaseId },
          data: { status: "RUNNING", errorMessage: null },
        });

        await log(`✓ Database successfully started.`);
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
