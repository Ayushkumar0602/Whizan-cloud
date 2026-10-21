import Docker from "dockerode";
import path from "path";
import fs from "fs/promises";
import net from "net";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface ProvisionDatabaseOptions {
  id: string;
  slug: string;
  name: string;
  type: "POSTGRESQL" | "REDIS" | "MYSQL";
  version: string;
  databaseName: string;
  username: string;
  password: string;
  externalPort?: number | null;
  internalPort: number;
  cpuLimit: number;
  memoryLimit: number;
  enablePooler?: boolean;
  sslEnabled?: boolean;
  ipWhitelist?: string[];
  readonlyPassword?: string;
}

export interface ProvisionDatabaseResult {
  externalPort: number;
  poolerPort?: number;
  containerName: string;
  volumePath: string;
}

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export class DatabaseRunner {
  private getVolumeBasePath(): string {
    if (process.env.DB_VOLUME_BASE_DIR) {
      return process.env.DB_VOLUME_BASE_DIR;
    }
    // On macOS local development, use project's .volumes directory; on Linux VM, use /opt/whizan/volumes
    return process.platform === "darwin"
      ? path.resolve(process.cwd(), ".volumes")
      : "/opt/whizan/volumes";
  }

  /**
   * Generates a 10-year self-signed TLS certificate pair for database SSL encryption in transit
   */
  private async ensureTlsCerts(certDir: string): Promise<{ certFile: string; keyFile: string }> {
    await fs.mkdir(certDir, { recursive: true });
    const certFile = path.join(certDir, "server.crt");
    const keyFile = path.join(certDir, "server.key");

    try {
      await fs.access(certFile);
      await fs.access(keyFile);
      return { certFile, keyFile };
    } catch {}

    try {
      await execFileAsync("openssl", [
        "req",
        "-new",
        "-x509",
        "-days",
        "3650",
        "-nodes",
        "-text",
        "-out",
        certFile,
        "-keyout",
        keyFile,
        "-subj",
        "/CN=whizan.db/O=Whizan Cloud",
      ]);
      if (process.platform === "linux") {
        await fs.chown(certDir, 70, 70).catch(() => {});
        await fs.chown(certFile, 70, 70).catch(() => {});
        await fs.chown(keyFile, 70, 70).catch(() => {});
      }
      await fs.chmod(keyFile, 0o600).catch(() => {});
      await fs.chmod(certFile, 0o644).catch(() => {});
    } catch (err: any) {
      console.warn("[DatabaseRunner] Notice: TLS cert auto-generation skipped:", err.message);
    }

    return { certFile, keyFile };
  }

  /**
   * Provision a stateful, persistent database container (Render / Railway grade).
   */
  async provision(
    options: ProvisionDatabaseOptions,
    onLog: (line: string) => Promise<void>
  ): Promise<ProvisionDatabaseResult> {
    const containerName = `whizan-db-${options.id}`;
    const networkName = "whizan-internal-network";

    await onLog(`Starting provisioning of ${options.type} ${options.version} (${options.name})...`);

    // 1. Ensure Docker internal mesh network exists
    try {
      const netObj = docker.getNetwork(networkName);
      await netObj.inspect();
    } catch {
      try {
        await docker.createNetwork({
          Name: networkName,
          Driver: "bridge",
          CheckDuplicate: true,
        });
        await onLog(`🌐 Initialized internal mesh network (${networkName})`);
      } catch {}
    }

    // 2. Prepare persistent host storage path
    const baseDir = this.getVolumeBasePath();
    const dbDir = path.join(baseDir, `db-${options.id}`);
    const volumePath = path.join(dbDir, "data");
    await fs.mkdir(volumePath, { recursive: true });
    if (process.platform === "linux") {
      await fs.chown(dbDir, 70, 70).catch(() => {});
      await fs.chown(volumePath, 70, 70).catch(() => {});
    }
    await fs.chmod(volumePath, 0o777).catch(() => {});
    await onLog(`💾 Allocated dedicated persistent host storage: ${volumePath}`);

    // 3. Resource limits
    const cpuLimit = options.cpuLimit || 0.5;
    const memoryLimitMB = options.memoryLimit || 512;
    const nanoCpus = Math.round(cpuLimit * 1_000_000_000);
    const memoryBytes = memoryLimitMB * 1024 * 1024;

    // 4. Resolve Docker image & engine tuning
    let image = "postgres:16-alpine";
    let internalContainerPort = options.internalPort || 5432;
    let env: string[] = [];
    let cmd: string[] | undefined = undefined;
    let containerDataMount = "/var/lib/postgresql/data";
    const binds = [`${volumePath}:${containerDataMount}`];

    if (options.type === "POSTGRESQL") {
      const v = options.version === "15" ? "15-alpine" : "16-alpine";
      image = `postgres:${v}`;
      internalContainerPort = 5432;
      containerDataMount = "/var/lib/postgresql/data";
      env = [
        `POSTGRES_DB=${options.databaseName}`,
        `POSTGRES_USER=${options.username}`,
        `POSTGRES_PASSWORD=${options.password}`,
        `PGDATA=/var/lib/postgresql/data/pgdata`,
      ];

      // Auto-generate and mount SSL/TLS certificates
      const certsDir = path.join(baseDir, `db-${options.id}`, "certs");
      await this.ensureTlsCerts(certsDir);
      binds.push(`${certsDir}:/var/lib/postgresql/certs:ro`);

      // Hardware-aware memory tuning based on assigned RAM
      const sharedBuffers = Math.max(64, Math.round(memoryLimitMB * 0.25)) + "MB";
      const effectiveCacheSize = Math.max(128, Math.round(memoryLimitMB * 0.75)) + "MB";
      const maintenanceWorkMem = Math.max(32, Math.min(256, Math.round(memoryLimitMB * 0.1))) + "MB";
      const workMem = Math.max(4, Math.round(memoryLimitMB / 64)) + "MB";
      const maxConnections = Math.min(300, Math.max(50, Math.round(memoryLimitMB / 4)));

      cmd = [
        "postgres",
        "-c", `shared_buffers=${sharedBuffers}`,
        "-c", `effective_cache_size=${effectiveCacheSize}`,
        "-c", `maintenance_work_mem=${maintenanceWorkMem}`,
        "-c", `work_mem=${workMem}`,
        "-c", `max_connections=${maxConnections}`,
        "-c", "checkpoint_completion_target=0.9",
        "-c", "wal_buffers=16MB",
        "-c", "autovacuum_vacuum_scale_factor=0.05",
        "-c", "shared_preload_libraries=pg_stat_statements",
        "-c", "pg_stat_statements.track=all",
        "-c", "pg_stat_statements.max=10000",
        "-c", "track_io_timing=on",
        "-c", "ssl=on",
        "-c", "ssl_cert_file=/var/lib/postgresql/certs/server.crt",
        "-c", "ssl_key_file=/var/lib/postgresql/certs/server.key",
      ];

      await onLog(`⚙️ Applied production tuning: shared_buffers=${sharedBuffers}, effective_cache=${effectiveCacheSize}, work_mem=${workMem}, max_connections=${maxConnections}`);
    } else if (options.type === "REDIS") {
      const v = options.version === "6" ? "6-alpine" : "7-alpine";
      image = `redis:${v}`;
      internalContainerPort = 6379;
      containerDataMount = "/data";
      cmd = ["redis-server", "--requirepass", options.password, "--appendonly", "yes"];
      env = [];
    } else if (options.type === "MYSQL") {
      image = "mysql:8.0";
      internalContainerPort = 3306;
      containerDataMount = "/var/lib/mysql";
      env = [
        `MYSQL_DATABASE=${options.databaseName}`,
        `MYSQL_USER=${options.username}`,
        `MYSQL_PASSWORD=${options.password}`,
        `MYSQL_ROOT_PASSWORD=${options.password}`,
      ];
    }

    // 5. Ensure Docker image is pulled
    await onLog(`Fetching official container image ${image}...`);
    try {
      const stream = await docker.pull(image);
      await new Promise((resolve, reject) => {
        docker.modem.followProgress(stream, (err, res) => (err ? reject(err) : resolve(res)));
      });
      await onLog(`✓ Image ${image} ready.`);
    } catch (pullErr: any) {
      await onLog(`Notice: Using local cache for image ${image} (${pullErr.message})`);
    }

    // 6. Clean up any stale container with the same name
    try {
      const existing = docker.getContainer(containerName);
      await existing.stop({ t: 2 }).catch(() => {});
      await existing.remove({ force: true }).catch(() => {});
    } catch {}

    // 7. Allocate a free host port for external client connections (preserve preferred port if available)
    const externalPort = await this.findFreePort(options.externalPort || undefined);
    await onLog(`🔌 Mapped public external port: ${externalPort} -> internal ${internalContainerPort}`);
    await onLog(`🛡️ Resource allocations: ${cpuLimit} vCPU, ${memoryLimitMB}MB RAM.`);

    // 8. Create container with volume mount and network alias
    const container = await docker.createContainer({
      name: containerName,
      Image: image,
      Cmd: cmd,
      Env: env,
      Labels: {
        whizanDatabaseId: options.id,
        slug: options.slug,
        type: options.type,
        service: "managed-database",
      },
      ExposedPorts: {
        [`${internalContainerPort}/tcp`]: {},
      },
      HostConfig: {
        Binds: binds,
        PortBindings: {
          [`${internalContainerPort}/tcp`]: [{ HostPort: String(externalPort) }],
        },
        Memory: memoryBytes,
        NanoCpus: nanoCpus,
        PidsLimit: 256,
        SecurityOpt: ["no-new-privileges:true"],
        RestartPolicy: { Name: "unless-stopped" },
        NetworkMode: networkName,
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [networkName]: {
            Aliases: [options.slug, containerName],
          },
        },
      },
    });

    // 9. Stream startup logs to callback
    try {
      const logStream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true,
      });

      docker.modem.demuxStream(
        logStream,
        {
          write(chunk: Buffer) {
            const lines = chunk.toString().split("\n").filter(Boolean);
            lines.forEach((l) => onLog(l).catch(() => {}));
          },
        } as any,
        {
          write(chunk: Buffer) {
            const lines = chunk.toString().split("\n").filter(Boolean);
            lines.forEach((l) => onLog(`[log] ${l}`).catch(() => {}));
          },
        } as any
      );
    } catch {}

    // 10. Start the container
    await onLog(`Launching database container ${containerName}...`);
    await container.start();

    // 11. Wait for database engine to be fully ready and accepting connections
    await onLog(`Performing health checks on ${options.type}...`);
    await this.waitForDatabaseReady(container, options, externalPort, internalContainerPort, 60000);
    await onLog(`✅ ${options.type} database is healthy, initialized, and accepting connections!`);

    // 12. Optional: Provision PgBouncer connection pooler for PostgreSQL
    let poolerPort: number | undefined = undefined;
    if (options.type === "POSTGRESQL" && options.enablePooler !== false) {
      poolerPort = await this.provisionPgBouncer(options, networkName, onLog);
    }

    return {
      externalPort,
      poolerPort,
      containerName,
      volumePath,
    };
  }

  /**
   * Provisions a dedicated PgBouncer sidecar for high-concurrency connection pooling
   */
  private async provisionPgBouncer(
    options: ProvisionDatabaseOptions,
    networkName: string,
    onLog: (line: string) => Promise<void>
  ): Promise<number | undefined> {
    const poolerContainerName = `whizan-db-pooler-${options.id}`;
    const poolerAlias = `${options.slug}-pooler`;
    const poolerPort = await this.findFreePort();

    await onLog(`🔄 Initializing PgBouncer connection pooler for serverless & high-concurrency traffic...`);

    // Clean up any stale pooler container
    try {
      const existing = docker.getContainer(poolerContainerName);
      await existing.stop({ t: 2 }).catch(() => {});
      await existing.remove({ force: true }).catch(() => {});
    } catch {}

    try {
      const container = await docker.createContainer({
        name: poolerContainerName,
        Image: "edoburu/pgbouncer:latest",
        Env: [
          `DATABASE_URL=postgres://${options.username}:${options.password}@${options.slug}:5432/${options.databaseName}`,
          `DB_USER=${options.username}`,
          `DB_PASSWORD=${options.password}`,
          `DB_HOST=${options.slug}`,
          `DB_PORT=5432`,
          `DB_NAME=${options.databaseName}`,
          `LISTEN_PORT=5432`,
          `POOL_MODE=transaction`,
          `MAX_CLIENT_CONN=1000`,
          `DEFAULT_POOL_SIZE=25`,
          `MIN_POOL_SIZE=5`,
          `RESERVE_POOL_SIZE=5`,
          `AUTH_TYPE=scram-sha-256`,
          `SERVER_TLS_SSLMODE=prefer`,
          `ADMIN_USERS=${options.username}`,
          `IGNORE_STARTUP_PARAMETERS=extra_float_digits,statement_timeout,search_path`,
        ],
        Labels: {
          whizanDatabaseId: options.id,
          role: "pooler",
          service: "managed-database-pooler",
        },
        ExposedPorts: {
          "5432/tcp": {},
        },
        HostConfig: {
          PortBindings: {
            "5432/tcp": [{ HostPort: String(poolerPort) }],
          },
          Memory: 128 * 1024 * 1024,
          NanoCpus: 250_000_000,
          RestartPolicy: { Name: "unless-stopped" },
          NetworkMode: networkName,
        },
        NetworkingConfig: {
          EndpointsConfig: {
            [networkName]: {
              Aliases: [poolerAlias, poolerContainerName],
            },
          },
        },
      });

      await container.start();
      await onLog(`⚡ PgBouncer pooler online on port ${poolerPort} (transaction-mode pooling up to 1,000 clients)`);
      return poolerPort;
    } catch (err: any) {
      await onLog(`Notice: PgBouncer pooler initialization skipped: ${err.message}`);
      return undefined;
    }
  }

  /**
   * Health check poller: checks if DB is accepting actual connections
   */
  private async waitForDatabaseReady(
    container: Docker.Container,
    options: ProvisionDatabaseOptions,
    externalPort: number,
    internalPort: number,
    timeoutMs: number = 60000
  ): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      // 1. Check if container is still running
      const inspect = await container.inspect().catch(() => null);
      if (!inspect || !inspect.State.Running) {
        throw new Error(
          `Database container crashed or exited during initialization with code ${
            inspect?.State.ExitCode ?? "unknown"
          }`
        );
      }

      // 2. Perform engine-specific readiness check
      let isReady = false;

      if (options.type === "POSTGRESQL") {
        const checkCmd = [
          "pg_isready",
          "-h",
          "localhost",
          "-p",
          "5432",
          "-U",
          options.username,
          "-d",
          options.databaseName,
        ];
        const res = await this.execInContainer(container, checkCmd);
        if (res.exitCode === 0) {
          isReady = true;
        }
      } else if (options.type === "REDIS") {
        const checkCmd = ["redis-cli", "-a", options.password, "ping"];
        const res = await this.execInContainer(container, checkCmd);
        if (res.output.includes("PONG") || res.exitCode === 0) {
          isReady = true;
        }
      } else {
        // Fallback TCP probe on external port
        isReady = await this.probeTcpPort(externalPort);
      }

      if (isReady) {
        if (options.type === "POSTGRESQL") {
          // Initialize performance extensions & config
          await this.execInContainer(container, [
            "psql",
            "-U",
            options.username,
            "-d",
            options.databaseName,
            "-c",
            "ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';",
          ]).catch(() => {});

          await this.execInContainer(container, [
            "psql",
            "-U",
            options.username,
            "-d",
            options.databaseName,
            "-c",
            'CREATE EXTENSION IF NOT EXISTS pg_stat_statements; CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pgcrypto;',
          ]).catch(() => {});

          // Initialize read-only user if configured
          if (options.readonlyPassword) {
            const roSql = `
              DO $$
              BEGIN
                IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'readonly_user') THEN
                  CREATE ROLE readonly_user WITH LOGIN PASSWORD '${options.readonlyPassword}';
                ELSE
                  ALTER ROLE readonly_user WITH PASSWORD '${options.readonlyPassword}';
                END IF;
              END
              $$;
              GRANT CONNECT ON DATABASE "${options.databaseName}" TO readonly_user;
              GRANT USAGE ON SCHEMA public TO readonly_user;
              GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
              ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_user;
            `;
            await this.execInContainer(container, [
              "psql",
              "-U",
              options.username,
              "-d",
              options.databaseName,
              "-c",
              roSql,
            ]).catch(() => {});
          }
        }
        return;
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    throw new Error(`Timeout after ${Math.round(timeoutMs / 1000)}s waiting for database to become ready.`);
  }

  /**
   * Safely restarts a database container and waits for it to become ready
   */
  async restart(
    id: string,
    options: ProvisionDatabaseOptions,
    onLog?: (line: string) => Promise<void>
  ): Promise<void> {
    const containerName = `whizan-db-${id}`;
    const poolerName = `whizan-db-pooler-${id}`;
    const container = docker.getContainer(containerName);

    if (onLog) await onLog(`Gracefully restarting database ${containerName}...`);
    await container.restart({ t: 10 });
    await docker.getContainer(poolerName).restart({ t: 5 }).catch(() => {});

    if (onLog) await onLog(`Awaiting database readiness...`);
    const inspect = await container.inspect();
    const internalPort = options.internalPort || (options.type === "REDIS" ? 6379 : 5432);
    const hostBindings = inspect.HostConfig?.PortBindings?.[`${internalPort}/tcp`];
    const externalPort = hostBindings?.[0]?.HostPort ? parseInt(hostBindings[0].HostPort, 10) : 0;

    await this.waitForDatabaseReady(container, options, externalPort, internalPort, 45000);
    if (onLog) await onLog(`✓ Database restarted successfully.`);
  }

  /**
   * Stops a database container
   */
  async stop(id: string): Promise<void> {
    const containerName = `whizan-db-${id}`;
    const poolerName = `whizan-db-pooler-${id}`;
    await docker.getContainer(poolerName).stop({ t: 5 }).catch(() => {});
    const container = docker.getContainer(containerName);
    await container.stop({ t: 10 }).catch(() => {});
  }

  /**
   * Starts an existing stopped database container
   */
  async start(id: string, options: ProvisionDatabaseOptions): Promise<{ externalPort: number; poolerPort: number }> {
    const containerName = `whizan-db-${id}`;
    const poolerName = `whizan-db-pooler-${id}`;
    const container = docker.getContainer(containerName);
    
    try {
      await container.start();
      await docker.getContainer(poolerName).start().catch(() => {});
    } catch (err: any) {
      if (err.statusCode === 404 || err.message?.includes("No such container") || err.message?.includes("not found")) {
        console.log(`[DatabaseRunner] Container ${containerName} not found in Docker. Re-provisioning container over existing persistent volume...`);
        const result = await this.provision(options, async (line) => console.log(`[Database:${id}] ${line}`));
        return { externalPort: result.externalPort, poolerPort: result.poolerPort || 0 };
      }
      if (err.statusCode !== 304 && !err.message?.includes("already started")) {
        throw err;
      }
    }

    const inspect = await container.inspect().catch(() => null);
    const internalPort = options.internalPort || (options.type === "REDIS" ? 6379 : 5432);
    const hostBindings = inspect?.HostConfig?.PortBindings?.[`${internalPort}/tcp`];
    const externalPort = hostBindings?.[0]?.HostPort ? parseInt(hostBindings[0].HostPort, 10) : (options.externalPort || 0);

    await this.waitForDatabaseReady(container, options, externalPort, internalPort, 45000);
    return { externalPort, poolerPort: 0 };
  }

  /**
   * Deletes a database container and purges its persistent data volume,
   * cleaning all Redis keys and verifying that no database resources remain.
   */
  async delete(id: string, volumePath?: string, purgeVolume = true): Promise<void> {
    const containerName = `whizan-db-${id}`;
    const poolerName = `whizan-db-pooler-${id}`;
    try {
      const pooler = docker.getContainer(poolerName);
      await pooler.stop({ t: 2 }).catch(() => {});
      await pooler.remove({ force: true, v: true }).catch(() => {});
    } catch {}

    try {
      const container = docker.getContainer(containerName);
      await container.stop({ t: 5 }).catch(() => {});
      await container.remove({ force: true, v: true }).catch(() => {});
    } catch {}

    const pathsToClean = [
      volumePath,
      path.join("/opt/whizan/volumes", id),
      path.join("/opt/whizan-volumes", id),
    ].filter(Boolean) as string[];

    if (purgeVolume) {
      for (const p of pathsToClean) {
        try {
          await fs.rm(p, { recursive: true, force: true }).catch(() => {});
        } catch (err: any) {
          console.warn(`[DatabaseRunner] Failed to clean volume ${p}:`, err.message);
        }
      }
    }

    // Clean Redis keys
    try {
      const { redisPub } = await import("./redis.js");
      await redisPub.del(`db:access:${id}`).catch(() => {});
      await redisPub.del(`build-logs:db-${id}`).catch(() => {});
      await redisPub.del(`db:logs:${id}`).catch(() => {});
    } catch {}

    // Verification check: ensure container is 100% gone
    const allContainers = await docker.listContainers({ all: true }).catch(() => []);
    const stillRunning = allContainers.filter((c: any) =>
      c.Names?.some((n: string) => n === `/${containerName}` || n === `/${poolerName}`)
    );
    if (stillRunning.length > 0) {
      throw new Error(`Database container ${containerName} is still present and could not be removed.`);
    }
  }

  /**
   * Fetches real-time CPU & Memory statistics for the database container
   */
  async getMetrics(id: string): Promise<{
    cpuPercent: number;
    memoryMB: number;
    memoryLimitMB: number;
    isRunning: boolean;
  }> {
    const containerName = `whizan-db-${id}`;
    try {
      const container = docker.getContainer(containerName);
      const inspect = await container.inspect();
      const isRunning = inspect.State.Running;

      if (!isRunning) {
        return { cpuPercent: 0, memoryMB: 0, memoryLimitMB: 0, isRunning: false };
      }

      const stats = (await container.stats({ stream: false })) as any;
      const memBytes = (stats.memory_stats?.usage || 0) - (stats.memory_stats?.stats?.cache || 0);
      const memLimitBytes = stats.memory_stats?.limit || 1;
      const memoryMB = Math.round(memBytes / (1024 * 1024));
      const memoryLimitMB = Math.round(memLimitBytes / (1024 * 1024));

      // Calculate CPU percent
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
        memoryLimitMB,
        isRunning,
      };
    } catch {
      return { cpuPercent: 0, memoryMB: 0, memoryLimitMB: 0, isRunning: false };
    }
  }

  /**
   * Helper: executes a command inside the container and returns stdout/stderr
   */
  private async execInContainer(
    container: Docker.Container,
    cmd: string[]
  ): Promise<{ exitCode: number; output: string }> {
    try {
      const exec = await container.exec({
        Cmd: cmd,
        AttachStdout: true,
        AttachStderr: true,
      });
      const stream = await exec.start({ Detach: false });
      let output = "";
      await new Promise<void>((resolve) => {
        stream.on("data", (chunk: Buffer) => {
          output += chunk.toString("utf8");
        });
        stream.on("end", () => resolve());
        stream.on("error", () => resolve());
      });
      const inspect = await exec.inspect();
      return { exitCode: inspect.ExitCode ?? 1, output };
    } catch {
      return { exitCode: 1, output: "" };
    }
  }

  /**
   * Helper: checks if a TCP port is open and accepting socket connections
   */
  private probeTcpPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, "127.0.0.1");
    });
  }

  /**
   * Helper: finds an open port on the host (prefers dedicated 15000-20000 range for cloud security groups)
   */
  private async findFreePort(preferredPort?: number): Promise<number> {
    const rangeStart = parseInt(process.env.DB_PORT_RANGE_START || "15000", 10);
    const rangeEnd = parseInt(process.env.DB_PORT_RANGE_END || "20000", 10);

    const targetPort =
      preferredPort ||
      (rangeEnd > rangeStart
        ? Math.floor(Math.random() * (rangeEnd - rangeStart + 1)) + rangeStart
        : 0);

    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          const randomServer = net.createServer();
          randomServer.listen(0, () => {
            const port = (randomServer.address() as net.AddressInfo).port;
            randomServer.close(() => resolve(port));
          });
        } else {
          reject(err);
        }
      });
      server.listen(targetPort, () => {
        const port = (server.address() as net.AddressInfo).port;
        server.close(() => resolve(port));
      });
    });
  }
}
