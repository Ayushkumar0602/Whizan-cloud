import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { redisClient } from "../lib/redis.js";
import { evaluateCommandSecurity } from "../lib/container-security.js";
import { signAdminPayload } from "../lib/auth-utils.js";
import { checkVmOnline } from "../lib/vm-status.js";
import { getDeploymentUrl } from "../lib/domain.js";
import { getAuthenticatedGitUrl } from "../lib/github-utils.js";
import { serviceQueue } from "./services.js";
import { buildQueue } from "./deployments.js";
import { StorageService } from "../services/storage.service.js";

const TerminalExecSchema = z.object({
  command: z.string().min(1).max(1000),
});

export async function accountTerminalRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.post("/exec", async (request, reply) => {
    const body = TerminalExecSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        success: false,
        output: "\x1b[31mError: Missing or invalid command payload.\x1b[0m\r\n",
        exitCode: 1,
      });
    }

    const rawCommand = body.data.command.trim();
    if (!rawCommand) {
      return reply.send({ success: true, output: "", exitCode: 0 });
    }

    const { userId, email, role, subscriptionTier } = request.user;

    // Parse tokens respecting quotes
    const tokens = parseCommandLine(rawCommand);
    const cmd = tokens[0]?.toLowerCase() || "";
    const args = tokens.slice(1);

    // ──────────────────────────────────────────────────────────────────────────
    // 1. HELP / MANUAL
    // ──────────────────────────────────────────────────────────────────────────
    if (cmd === "help" || cmd === "?") {
      const output = [
        "\r\n\x1b[1;36mWhizan Cloud Shell v2.5 (compute + storage scope)\x1b[0m",
        "\x1b[90mConnected as: " + email + " (Tenant: " + userId.slice(0, 8) + "...)\x1b[0m",
        "",
        "\x1b[1;33mACCOUNT & SYSTEM OVERVIEW:\x1b[0m",
        "  \x1b[32mwhoami\x1b[0m                     Display authenticated user identity, role & tier",
        "  \x1b[32mstats, top\x1b[0m                 Display aggregate account compute & storage metrics",
        "  \x1b[32mclear\x1b[0m                      Clear the terminal window output",
        "  \x1b[32mexit\x1b[0m                       Close the terminal drawer",
        "",
        "\x1b[1;33mSERVICES & APPLICATIONS:\x1b[0m",
        "  \x1b[32mservices, ls, list\x1b[0m         List all backend microservices owned by your account",
        "  \x1b[32mprojects\x1b[0m                   List all frontend web applications",
        "  \x1b[32mservice <slug|id>\x1b[0m          Inspect comprehensive metadata, port & host mapping",
        "  \x1b[32mproject <slug|id>\x1b[0m          Inspect frontend deployment configuration & domain",
        "  \x1b[32menv <slug|id>\x1b[0m              Safely list environment variable keys (masked values)",
        "",
        "\x1b[1;33mCLOUD OBJECT STORAGE:\x1b[0m",
        "  \x1b[32mstorage, buckets\x1b[0m           List all cloud object storage buckets and sizes",
        "  \x1b[32mstorage info <bucket>\x1b[0m      Inspect bucket metadata, CORS & edge CDN endpoints",
        "  \x1b[32mstorage ls <bucket>\x1b[0m        List files and objects stored inside a bucket",
        "  \x1b[32mstorage usage\x1b[0m              Display storage capacity, operations & bandwidth usage",
        "  \x1b[32mstorage keys\x1b[0m               List active Storage API keys & permissions",
        "  \x1b[32mstorage create <name>\x1b[0m      Create a new bucket (append --public for CDN)",
        "  \x1b[32mstorage rm <name>\x1b[0m          Delete an empty storage bucket",
        "",
        "\x1b[1;33mOPERATIONS & DIAGNOSTICS:\x1b[0m",
        "  \x1b[32mstatus <slug|id>\x1b[0m           Probe real-time HTTP reachability & edge router health",
        "  \x1b[32mredeploy <slug|id>\x1b[0m         Trigger an immediate zero-downtime redeployment",
        "  \x1b[32mrestart <slug|id>\x1b[0m          Restart active container process",
        "  \x1b[32mlogs <slug|id> [lines]\x1b[0m     Display the latest build & runtime logs (default: 30)",
        "  \x1b[32mcurl <slug|url>\x1b[0m            Simulate HTTP HEAD/GET request against your service",
        "  \x1b[32mexec <slug> <cmd...>\x1b[0m       Execute safe diagnostic command inside container",
        "",
        "\x1b[90mSecurity: Out-of-scope host commands are blocked by Whizan Account Guardrails.\x1b[0m\r\n",
      ].join("\r\n");

      return reply.send({ success: true, output, exitCode: 0 });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. WHOAMI
    // ──────────────────────────────────────────────────────────────────────────
    if (cmd === "whoami") {
      const output = [
        "\r\n\x1b[1mAccount Session Info:\x1b[0m",
        `  \x1b[1mEmail:\x1b[0m           ${email}`,
        `  \x1b[1mUser ID:\x1b[0m         ${userId}`,
        `  \x1b[1mRole:\x1b[0m            ${role || "USER"}`,
        `  \x1b[1mSubscription:\x1b[0m    ${subscriptionTier || "HOBBY"}`,
        `  \x1b[1mEmail Verified:\x1b[0m  ${(request.user as any).emailVerified ? "\x1b[32mYes\x1b[0m" : "\x1b[33mPending\x1b[0m"}`,
        `  \x1b[1mTenant Scope:\x1b[0m    Strict User Isolation (${userId})\r\n`,
      ].join("\r\n");

      return reply.send({ success: true, output, exitCode: 0 });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. STATS / METRICS / TOP
    // ──────────────────────────────────────────────────────────────────────────
    if (cmd === "stats" || cmd === "metrics" || cmd === "top") {
      const [serviceCount, projectCount, dbCount, cronCount, functionCount, bucketCount, storageQuota] = await Promise.all([
        prisma.backendService.count({ where: { userId } }),
        prisma.project.count({ where: { userId } }),
        prisma.databaseService.count({ where: { userId } }).catch(() => 0),
        prisma.cronJob.count({ where: { userId } }).catch(() => 0),
        prisma.functionService.count({ where: { userId } }).catch(() => 0),
        prisma.storageBucket.count({ where: { userId } }).catch(() => 0),
        prisma.storageUserQuota.findUnique({ where: { userId } }).catch(() => null),
      ]);

      const userServices = await prisma.backendService.findMany({
        where: { userId },
        select: { cpuLimit: true, memoryLimit: true, autoSleep: true },
      });

      let totalCpu = 0;
      let totalMem = 0;
      userServices.forEach(s => {
        totalCpu += s.cpuLimit || 0.1;
        totalMem += s.memoryLimit || 512;
      });

      const output = [
        "\r\n\x1b[1mAccount Resource Usage Summary:\x1b[0m",
        "  ────────────────────────────────────────────────────────────",
        `  \x1b[1mBackend Services:\x1b[0m       ${serviceCount}`,
        `  \x1b[1mFrontend Projects:\x1b[0m      ${projectCount}`,
        `  \x1b[1mDatabases (PG/MySQL):\x1b[0m   ${dbCount}`,
        `  \x1b[1mEdge Functions:\x1b[0m         ${functionCount}`,
        `  \x1b[1mCron Schedules:\x1b[0m         ${cronCount}`,
        `  \x1b[1mStorage Buckets:\x1b[0m        ${bucketCount}`,
        "  ────────────────────────────────────────────────────────────",
        `  \x1b[1mAllocated vCPUs:\x1b[0m        ${totalCpu.toFixed(1)} vCPU`,
        `  \x1b[1mAllocated RAM:\x1b[0m          ${totalMem >= 1024 ? (totalMem / 1024).toFixed(1) + " GB" : totalMem + " MB"}`,
        `  \x1b[1mStorage Stored:\x1b[0m         ${formatBytes(storageQuota?.usedBytes || 0)} / ${formatBytes(storageQuota?.allocatedBytes || 1073741824)}`,
        `  \x1b[1mScale-to-Zero Policy:\x1b[0m   Enabled (Auto-Sleep on Idle)`,
        `  \x1b[1mNetwork Ingress:\x1b[0m        Cloudflare Edge Router (Zero-Maintenance SSL)\r\n`,
      ].join("\r\n");

      return reply.send({ success: true, output, exitCode: 0 });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. SERVICES / LS / LIST
    // ──────────────────────────────────────────────────────────────────────────
    if (cmd === "services" || cmd === "ls" || cmd === "list") {
      const services = await prisma.backendService.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: {
          deployments: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      if (services.length === 0) {
        return reply.send({
          success: true,
          output: "\r\n\x1b[33mNo backend services found in your account.\x1b[0m Type \x1b[1m'projects'\x1b[0m to list frontend projects or deploy via dashboard.\r\n",
          exitCode: 0,
        });
      }

      // Dynamic slug width to accommodate long service names
      const maxSlugLen = Math.max(22, ...services.map(s => s.slug.length));
      const slugColWidth = Math.min(32, maxSlugLen + 2);

      const columns = [
        { header: "SERVICE SLUG", width: slugColWidth },
        { header: "STACK", width: 12 },
        { header: "PORT", width: 8 },
        { header: "PLAN", width: 8 },
        { header: "STATUS", width: 12 },
        { header: "INGRESS / URL", width: 44 },
      ];

      const rows = services.map(s => {
        const lastDeploy = s.deployments[0];
        let statusText = "○ INACTIVE";
        let statusColor = "\x1b[90m";

        if (lastDeploy) {
          if (lastDeploy.status === "READY") {
            statusText = "● ONLINE";
            statusColor = "\x1b[1;32m";
          } else if (lastDeploy.status === "BUILDING" || lastDeploy.status === "QUEUED") {
            statusText = "◐ BUILDING";
            statusColor = "\x1b[1;33m";
          } else if (lastDeploy.status === "FAILED") {
            statusText = "✖ FAILED";
            statusColor = "\x1b[1;31m";
          }
        }

        const portStr = s.internalPort ? String(s.internalPort) : "Worker";
        const urlStr = s.isPublic ? `https://${s.slug}.whizan.cloud` : `internal:${s.internalPort || 0}`;

        return [
          { text: s.slug, ansiColor: "\x1b[1;36m" },
          { text: s.language || "NODEJS", ansiColor: "\x1b[35m" },
          { text: portStr, ansiColor: "\x1b[37m" },
          { text: s.instanceType || "free", ansiColor: "\x1b[90m" },
          { text: statusText, ansiColor: statusColor },
          { text: urlStr, ansiColor: "\x1b[34m" },
        ];
      });

      const tableOutput = renderTerminalTable(columns, rows);
      const output = `\r\n${tableOutput}\r\n\r\n\x1b[90mTotal: ${services.length} service(s) owned. Type 'service <slug>' for full inspection.\x1b[0m\r\n`;

      return reply.send({ success: true, output, exitCode: 0 });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. PROJECTS
    // ──────────────────────────────────────────────────────────────────────────
    if (cmd === "projects") {
      const projects = await prisma.project.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: {
          deployments: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      if (projects.length === 0) {
        return reply.send({
          success: true,
          output: "\r\n\x1b[33mNo frontend projects found in your account.\x1b[0m\r\n",
          exitCode: 0,
        });
      }

      const maxSlugLen = Math.max(22, ...projects.map(p => p.slug.length));
      const slugColWidth = Math.min(32, maxSlugLen + 2);

      const columns = [
        { header: "PROJECT SLUG", width: slugColWidth },
        { header: "FRAMEWORK", width: 14 },
        { header: "BRANCH", width: 10 },
        { header: "STATUS", width: 12 },
        { header: "LIVE DOMAIN", width: 44 },
      ];

      const rows = projects.map(p => {
        const lastDeploy = p.deployments[0];
        let statusText = "○ INACTIVE";
        let statusColor = "\x1b[90m";

        if (lastDeploy) {
          if (lastDeploy.status === "READY") {
            statusText = "● ACTIVE";
            statusColor = "\x1b[1;32m";
          } else if (lastDeploy.status === "BUILDING" || lastDeploy.status === "QUEUED") {
            statusText = "◐ BUILDING";
            statusColor = "\x1b[1;33m";
          } else if (lastDeploy.status === "FAILED") {
            statusText = "✖ FAILED";
            statusColor = "\x1b[1;31m";
          }
        }

        const url = `https://${p.slug}.whizan.cloud`;
        return [
          { text: p.slug, ansiColor: "\x1b[1;36m" },
          { text: p.framework || "STATIC", ansiColor: "\x1b[35m" },
          { text: p.branch || "main", ansiColor: "\x1b[37m" },
          { text: statusText, ansiColor: statusColor },
          { text: url, ansiColor: "\x1b[34m" },
        ];
      });

      const tableOutput = renderTerminalTable(columns, rows);
      const output = `\r\n${tableOutput}\r\n\r\n\x1b[90mTotal: ${projects.length} project(s) owned. Type 'project <slug>' for full inspection.\x1b[0m\r\n`;

      return reply.send({ success: true, output, exitCode: 0 });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. CLOUD OBJECT STORAGE (storage, buckets, bucket)
    // ──────────────────────────────────────────────────────────────────────────
    if (cmd === "storage" || cmd === "buckets" || cmd === "bucket") {
      let sub = args[0]?.toLowerCase() || "ls";
      let subTarget: string | undefined = args[1];

      if (cmd === "buckets") {
        sub = "ls";
        subTarget = undefined;
      } else if (cmd === "bucket") {
        if (!args[0] || args[0] === "ls") {
          sub = "ls";
          subTarget = undefined;
        } else if (args[0] === "info" || args[0] === "get") {
          sub = "info";
          subTarget = args[1];
        } else {
          // "bucket <name>" -> inspect
          sub = "info";
          subTarget = args[0];
        }
      }

      // ── Subcommand: HELP ──
      if (sub === "help" || sub === "?") {
        const output = [
          "\r\n\x1b[1;36mWhizan Cloud Object Storage — Shell Reference\x1b[0m",
          "  ────────────────────────────────────────────────────────────",
          "  \x1b[32mstorage [ls]\x1b[0m                       List all storage buckets & sizes",
          "  \x1b[32mstorage ls <bucket> [prefix]\x1b[0m       List stored objects & files in a bucket",
          "  \x1b[32mstorage info <bucket>\x1b[0m              Inspect bucket metadata, CORS & CDN endpoints",
          "  \x1b[32mstorage usage\x1b[0m                      Display quota utilization & bandwidth metrics",
          "  \x1b[32mstorage keys\x1b[0m                       List active Storage API keys & scopes",
          "  \x1b[32mstorage create <name> [--public]\x1b[0m   Provision a new bucket (public CDN or private)",
          "  \x1b[32mstorage rm <name> [--force]\x1b[0m        Delete a storage bucket\r\n",
        ].join("\r\n");
        return reply.send({ success: true, output, exitCode: 0 });
      }

      // ── Subcommand: USAGE / QUOTA ──
      if (sub === "usage" || sub === "quota") {
        try {
          const usage = await StorageService.getUsage(userId, subscriptionTier);
          const usedB = usage.quota.usedBytes;
          const allocB = usage.quota.allocatedBytes;
          const reservedB = usage.quota.reservedBytes;
          const availB = usage.quota.availableBytes;
          const pct = usage.quota.usagePercent;

          const bucketCount = await prisma.storageBucket.count({ where: { userId } });

          const output = [
            "\r\n\x1b[1;36mCloud Object Storage — Quota & Capacity Usage\x1b[0m",
            "  ────────────────────────────────────────────────────────────",
            `  \x1b[1mSubscription Tier:\x1b[0m     \x1b[35m${usage.tierDisplayName} (${usage.tier})\x1b[0m`,
            `  \x1b[1mStored Capacity:\x1b[0m       ${formatBytes(usedB)} / ${formatBytes(allocB)}`,
            `  \x1b[1mStorage Bar:\x1b[0m           ${renderProgressBar(pct, 24)}`,
            `  \x1b[1mReserved (In-Flight):\x1b[0m  ${formatBytes(reservedB)}`,
            `  \x1b[1mAvailable Remaining:\x1b[0m   ${formatBytes(availB)}`,
            `  \x1b[1mTotal Objects:\x1b[0m         ${usage.quota.objectsCount.toLocaleString()} object(s)`,
            `  \x1b[1mBuckets Count:\x1b[0m         ${bucketCount} / ${usage.commandLimits.maxBuckets} bucket(s)`,
            "  ────────────────────────────────────────────────────────────",
            `  \x1b[1mRate Limit (RPM):\x1b[0m      ${usage.commandLimits.currentRpm} / ${usage.commandLimits.rateLimitRpm} req/min`,
            `  \x1b[1mDaily Operations:\x1b[0m      ${usage.commandLimits.currentDailyCommands} / ${usage.commandLimits.dailyCommandsQuota} ops/day`,
            `  \x1b[1mMax Single File:\x1b[0m       ${usage.commandLimits.maxFileSizeMb} MB`,
            `  \x1b[1mConcurrent Uploads:\x1b[0m    ${usage.commandLimits.maxConcurrentUploads} parallel parts\r\n`,
          ].join("\r\n");

          return reply.send({ success: true, output, exitCode: 0 });
        } catch (err: any) {
          return reply.send({
            success: false,
            output: `\x1b[31mError fetching storage quota: ${err.message}\x1b[0m\r\n`,
            exitCode: 1,
          });
        }
      }

      // ── Subcommand: KEYS ──
      if (sub === "keys" || sub === "api-keys") {
        try {
          const keys = await prisma.storageApiKey.findMany({
            where: { userId },
            include: { bucket: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
          });

          if (keys.length === 0) {
            return reply.send({
              success: true,
              output: "\r\n\x1b[90mNo Storage API keys found. Generate keys from Dashboard > Storage > API Keys or Whizan CLI.\x1b[0m\r\n",
              exitCode: 0,
            });
          }

          const columns = [
            { header: "KEY ID", width: 14 },
            { header: "NAME", width: 20 },
            { header: "KEY PREFIX", width: 22 },
            { header: "PERMISSION", width: 14 },
            { header: "SCOPE", width: 16 },
            { header: "LAST USED", width: 14 },
          ];

          const rows = keys.map(k => [
            { text: k.id.slice(0, 12), ansiColor: "\x1b[90m" },
            { text: k.name, ansiColor: "\x1b[1;37m" },
            { text: k.keyPrefix, ansiColor: "\x1b[33m" },
            { text: k.permission, ansiColor: k.permission === "READ_WRITE" ? "\x1b[32m" : "\x1b[36m" },
            { text: k.bucket ? k.bucket.name : "ALL BUCKETS", ansiColor: k.bucket ? "\x1b[34m" : "\x1b[35m" },
            { text: k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never", ansiColor: "\x1b[90m" },
          ]);

          const tableOutput = renderTerminalTable(columns, rows);
          const output = `\r\n${tableOutput}\r\n\r\n\x1b[90mTotal: ${keys.length} active key(s). Authentication: Bearer <key> with Whizan Storage API & S3 gateway.\x1b[0m\r\n`;
          return reply.send({ success: true, output, exitCode: 0 });
        } catch (err: any) {
          return reply.send({
            success: false,
            output: `\x1b[31mError fetching storage keys: ${err.message}\x1b[0m\r\n`,
            exitCode: 1,
          });
        }
      }

      // ── Subcommand: CREATE / NEW ──
      if (sub === "create" || sub === "new") {
        const bucketName = args[1];
        if (!bucketName) {
          return reply.send({
            success: false,
            output: "\x1b[31mError: Bucket name required. Usage: storage create <name> [--public]\x1b[0m\r\n",
            exitCode: 1,
          });
        }

        const isPublic = args.includes("--public");
        try {
          const bucket = await StorageService.createBucket({
            userId,
            subscriptionTier,
            name: bucketName,
            isPublic,
            actorEmail: email,
          });

          const output = [
            "\r\n\x1b[1;32m✔ Bucket successfully created!\x1b[0m",
            `  \x1b[1mBucket Name:\x1b[0m    \x1b[1;36m${bucket.name}\x1b[0m`,
            `  \x1b[1mBucket ID:\x1b[0m      ${bucket.id}`,
            `  \x1b[1mVisibility:\x1b[0m     ${bucket.isPublic ? "\x1b[32mPublic CDN (Edge-Cached)\x1b[0m" : "\x1b[33mPrivate (Protected S3/IAM)\x1b[0m"}`,
            bucket.isPublic ? `  \x1b[1mEdge CDN URL:\x1b[0m   https://storage.whizan.cloud/${bucket.name}` : "",
            "\x1b[90mUpload files using the web dashboard, S3 API, or Whizan MCP tooling.\x1b[0m\r\n",
          ].filter(Boolean).join("\r\n");

          return reply.send({ success: true, output, exitCode: 0 });
        } catch (err: any) {
          return reply.send({
            success: false,
            output: `\x1b[31mFailed to create bucket: ${err.message}\x1b[0m\r\n`,
            exitCode: 1,
          });
        }
      }

      // ── Subcommand: RM / DELETE ──
      if (sub === "rm" || sub === "delete") {
        const bucketName = args[1];
        if (!bucketName) {
          return reply.send({
            success: false,
            output: "\x1b[31mError: Bucket name required. Usage: storage rm <name> [--force]\x1b[0m\r\n",
            exitCode: 1,
          });
        }

        const force = args.includes("--force") || args.includes("-f");
        try {
          await StorageService.deleteBucket(userId, bucketName, force, email);
          return reply.send({
            success: true,
            output: `\r\n\x1b[32m✔ Bucket '${bucketName}' successfully deleted.\x1b[0m\r\n`,
            exitCode: 0,
          });
        } catch (err: any) {
          return reply.send({
            success: false,
            output: `\x1b[31mFailed to delete bucket: ${err.message}\x1b[0m\r\n`,
            exitCode: 1,
          });
        }
      }

      // ── Subcommand: INFO / GET / BUCKET ──
      if (sub === "info" || sub === "get" || (sub !== "ls" && sub !== "objects" && subTarget === undefined && sub !== "storage")) {
        const target = sub === "info" || sub === "get" ? subTarget : sub;
        if (!target) {
          return reply.send({
            success: false,
            output: "\x1b[31mError: Bucket name or ID required. Usage: storage info <bucket>\x1b[0m\r\n",
            exitCode: 1,
          });
        }

        try {
          const bucket = await StorageService.getBucket(userId, target);
          const sizeAgg = await prisma.storageObject.aggregate({
            where: { bucketId: bucket.id, deletedAt: null },
            _sum: { size: true },
          });
          const totalStoredBytes = sizeAgg._sum.size || 0n;

          const output = [
            `\r\n\x1b[1;36mStorage Bucket: ${bucket.name}\x1b[0m`,
            "  ────────────────────────────────────────────────────────────",
            `  \x1b[1mBucket ID:\x1b[0m         ${bucket.id}`,
            `  \x1b[1mVisibility:\x1b[0m        ${bucket.isPublic ? "\x1b[32mPublic CDN (Global Edge Cached)\x1b[0m" : "\x1b[33mPrivate (Protected S3/IAM)\x1b[0m"}`,
            `  \x1b[1mObjects Stored:\x1b[0m    ${bucket._count?.objects ?? 0} object(s)`,
            `  \x1b[1mTotal Size:\x1b[0m        ${formatBytes(totalStoredBytes)}`,
            `  \x1b[1mCreated At:\x1b[0m        ${new Date(bucket.createdAt).toLocaleString()}`,
            `  \x1b[1mVersioning:\x1b[0m        ${bucket.versioningEnabled ? "\x1b[32mEnabled\x1b[0m" : "\x1b[90mDisabled\x1b[0m"}`,
            `  \x1b[1mTrash / Soft Del:\x1b[0m  ${bucket.trashEnabled ? `\x1b[32mEnabled (${bucket.trashRetentionDays} days)\x1b[0m` : "\x1b[90mDisabled\x1b[0m"}`,
            "  ────────────────────────────────────────────────────────────",
            `  \x1b[1mPublic CDN URL:\x1b[0m    ${bucket.isPublic ? `https://storage.whizan.cloud/${bucket.name}` : "\x1b[90mNone (Private Bucket)\x1b[0m"}`,
            `  \x1b[1mS3 Gateway:\x1b[0m        https://api.whizan.cloud/api/storage/s3`,
            `  \x1b[1mCORS Origins:\x1b[0m      ${bucket.corsOrigins && bucket.corsOrigins.length > 0 ? bucket.corsOrigins.join(", ") : "*"}\r\n`,
            `\x1b[90mHint: Run 'storage ls ${bucket.name}' to browse stored files.\x1b[0m\r\n`,
          ].join("\r\n");

          return reply.send({ success: true, output, exitCode: 0 });
        } catch (err: any) {
          return reply.send({
            success: false,
            output: `\x1b[31mBucket '${target}' not found: ${err.message}\x1b[0m\r\n`,
            exitCode: 1,
          });
        }
      }

      // ── Subcommand: LS / OBJECTS (with target bucket) ──
      if ((sub === "ls" || sub === "objects") && subTarget) {
        try {
          const prefix = args[2] || undefined;
          const result = await StorageService.listObjects({
            userId,
            bucketIdentifier: subTarget,
            prefix,
            limit: 50,
          });

          if (result.objects.length === 0) {
            return reply.send({
              success: true,
              output: `\r\n\x1b[90mBucket '${result.bucket.name}' is empty (0 objects found${prefix ? ` matching prefix '${prefix}'` : ""}).\x1b[0m\r\n`,
              exitCode: 0,
            });
          }

          const columns = [
            { header: "OBJECT NAME / PATH", width: 34 },
            { header: "SIZE", width: 12 },
            { header: "CONTENT TYPE", width: 18 },
            { header: "ETAG", width: 14 },
            { header: "MODIFIED", width: 16 },
          ];

          const rows = result.objects.map(obj => [
            { text: obj.name, ansiColor: "\x1b[1;37m" },
            { text: formatBytes(obj.size), ansiColor: "\x1b[36m" },
            { text: obj.mimeType || "application/octet-stream", ansiColor: "\x1b[90m" },
            { text: obj.etag ? obj.etag.slice(0, 12) : "-", ansiColor: "\x1b[90m" },
            { text: new Date(obj.updatedAt).toLocaleDateString(), ansiColor: "\x1b[33m" },
          ]);

          const tableOutput = renderTerminalTable(columns, rows);
          const output = `\r\n${tableOutput}\r\n\r\n\x1b[90mShowing ${result.objects.length} of ${result.pagination.total} object(s) in bucket '${result.bucket.name}'.\x1b[0m\r\n`;

          return reply.send({ success: true, output, exitCode: 0 });
        } catch (err: any) {
          return reply.send({
            success: false,
            output: `\x1b[31mFailed to list objects in '${subTarget}': ${err.message}\x1b[0m\r\n`,
            exitCode: 1,
          });
        }
      }

      // ── Subcommand: LS / LIST (Default: List all user buckets) ──
      try {
        const buckets = await StorageService.listBuckets(userId);

        if (buckets.length === 0) {
          const emptyOutput = [
            "\r\n\x1b[90mNo cloud storage buckets found.\x1b[0m",
            "Create your first bucket using: \x1b[32mstorage create <name> [--public]\x1b[0m",
            "Or browse to \x1b[34mhttps://whizan.cloud/dashboard/storage\x1b[0m\r\n",
          ].join("\r\n");
          return reply.send({ success: true, output: emptyOutput, exitCode: 0 });
        }

        // Aggregate sizes for each bucket
        const bucketSizes = await prisma.storageObject.groupBy({
          by: ["bucketId"],
          where: { bucketId: { in: buckets.map(b => b.id) }, deletedAt: null },
          _sum: { size: true },
        });

        const sizeMap = new Map<string, bigint>();
        bucketSizes.forEach(s => sizeMap.set(s.bucketId, s._sum.size || 0n));

        const columns = [
          { header: "BUCKET NAME", width: 22 },
          { header: "VISIBILITY", width: 14 },
          { header: "OBJECTS", width: 10 },
          { header: "STORED SIZE", width: 14 },
          { header: "CREATED", width: 14 },
          { header: "CDN / ENDPOINT", width: 34 },
        ];

        const rows = buckets.map(b => {
          const storedBytes = sizeMap.get(b.id) || 0n;
          const visText = b.isPublic ? "PUBLIC CDN" : "PRIVATE";
          const visColor = b.isPublic ? "\x1b[32m" : "\x1b[33m";
          const endpoint = b.isPublic
            ? `https://storage.whizan.cloud/${b.name}`
            : "s3://whizan-storage/" + b.name;

          return [
            { text: b.name, ansiColor: "\x1b[1;36m" },
            { text: visText, ansiColor: visColor },
            { text: String(b._count?.objects ?? 0), ansiColor: "\x1b[37m" },
            { text: formatBytes(storedBytes), ansiColor: "\x1b[35m" },
            { text: new Date(b.createdAt).toLocaleDateString(), ansiColor: "\x1b[90m" },
            { text: endpoint, ansiColor: "\x1b[34m" },
          ];
        });

        const tableOutput = renderTerminalTable(columns, rows);
        const output = `\r\n${tableOutput}\r\n\r\n\x1b[90mTotal: ${buckets.length} bucket(s). Type 'storage info <bucket>' or 'storage ls <bucket>' for files.\x1b[0m\r\n`;

        return reply.send({ success: true, output, exitCode: 0 });
      } catch (err: any) {
        return reply.send({
          success: false,
          output: `\x1b[31mError listing storage buckets: ${err.message}\x1b[0m\r\n`,
          exitCode: 1,
        });
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 6. SERVICE INSPECTION (service <slug|id> / info <slug|id>)
    // ──────────────────────────────────────────────────────────────────────────
    if (cmd === "service" || (cmd === "info" && args.length > 0)) {
      const target = args[0];
      if (!target) {
        return reply.send({
          success: false,
          output: "\x1b[31mError: Target service identifier required. Usage: service <slug|id>\x1b[0m\r\n",
          exitCode: 1,
        });
      }

      const service = await prisma.backendService.findFirst({
        where: {
          userId,
          OR: [
            { id: target },
            { slug: target },
            { name: target },
          ],
        },
        include: {
          deployments: {
            orderBy: { createdAt: "desc" },
            take: 3,
          },
          envVariables: {
            select: { key: true, createdAt: true },
          },
        },
      });

      if (!service) {
        return reply.send({
          success: false,
          output: `\x1b[31mError: Service '${target}' not found in your account.\x1b[0m Type 'services' to see your services.\r\n`,
          exitCode: 1,
        });
      }

      const lastDeploy = service.deployments[0];
      const envKeys = service.envVariables.map(e => e.key).join(", ") || "None configured";

      const output = [
        `\r\n\x1b[1;36mSERVICE SPECIFICATION: ${service.name} (${service.slug})\x1b[0m`,
        "  ────────────────────────────────────────────────────────────",
        `  \x1b[1mService ID:\x1b[0m          ${service.id}`,
        `  \x1b[1mSlug / Ingress:\x1b[0m      https://${service.slug}.whizan.cloud`,
        `  \x1b[1mLanguage / Stack:\x1b[0m    ${service.language}`,
        `  \x1b[1mInternal Port:\x1b[0m       ${service.internalPort || "Worker (No Port)"}`,
        `  \x1b[1mPublic Access:\x1b[0m       ${service.isPublic ? "\x1b[32mEnabled (Internet Ingress)\x1b[0m" : "Internal Docker Network"}`,
        `  \x1b[1mCompute Plan:\x1b[0m        ${service.instanceType} (${service.cpuLimit} vCPU / ${service.memoryLimit}MB RAM)`,
        `  \x1b[1mAuto-Sleep on Idle:\x1b[0m  ${service.autoSleep ? "Yes (Scale-to-Zero)" : "Always-On"}`,
        `  \x1b[1mGit Repository:\x1b[0m      ${service.githubRepoUrl || "direct-upload"} (Branch: ${service.branch})`,
        `  \x1b[1mInstall Command:\x1b[0m     ${service.installCommand || "(Auto-detected)"}`,
        `  \x1b[1mStart Command:\x1b[0m       ${service.startCommand || "(Auto-detected)"}`,
        `  \x1b[1mEnvironment Keys:\x1b[0m    ${envKeys}`,
        "  ────────────────────────────────────────────────────────────",
        `  \x1b[1mLatest Deployment:\x1b[0m   ${lastDeploy ? `${lastDeploy.id.slice(0, 8)} (${lastDeploy.status}) - ${new Date(lastDeploy.createdAt).toISOString()}` : "None"}`,
        `  \x1b[1mHost Port Mapping:\x1b[0m   ${lastDeploy?.containerPort ? `0.0.0.0:${lastDeploy.containerPort}` : "Idle / Stopped"}`,
        `  \x1b[1mActions Available:\x1b[0m   redeploy ${service.slug} | status ${service.slug} | logs ${service.slug}\r\n`,
      ].join("\r\n");

      return reply.send({ success: true, output, exitCode: 0 });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 7. PROJECT INSPECTION (project <slug|id>)
    // ──────────────────────────────────────────────────────────────────────────
    if (cmd === "project") {
      const target = args[0];
      if (!target) {
        return reply.send({
          success: false,
          output: "\x1b[31mError: Target project identifier required. Usage: project <slug|id>\x1b[0m\r\n",
          exitCode: 1,
        });
      }

      const project = await prisma.project.findFirst({
        where: {
          userId,
          OR: [
            { id: target },
            { slug: target },
            { name: target },
          ],
        },
        include: {
          deployments: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      if (!project) {
        return reply.send({
          success: false,
          output: `\x1b[31mError: Project '${target}' not found in your account.\x1b[0m\r\n`,
          exitCode: 1,
        });
      }

      const lastDeploy = project.deployments[0];
      const output = [
        `\r\n\x1b[1;36mFRONTEND PROJECT: ${project.name} (${project.slug})\x1b[0m`,
        "  ────────────────────────────────────────────────────────────",
        `  \x1b[1mProject ID:\x1b[0m          ${project.id}`,
        `  \x1b[1mLive Domain:\x1b[0m         https://${project.slug}.whizan.cloud`,
        `  \x1b[1mFramework:\x1b[0m           ${project.framework}`,
        `  \x1b[1mGit Repository:\x1b[0m      ${project.githubRepoUrl || "direct-upload"} (Branch: ${project.branch})`,
        `  \x1b[1mBuild Command:\x1b[0m       ${project.buildCommand || "(Default)"}`,
        `  \x1b[1mOutput Directory:\x1b[0m    ${project.outputDir || "dist"}`,
        `  \x1b[1mLast Deployment:\x1b[0m     ${lastDeploy ? `${lastDeploy.id} (${lastDeploy.status})` : "None"}\r\n`,
      ].join("\r\n");

      return reply.send({ success: true, output, exitCode: 0 });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 8. REDEPLOY (redeploy <slug|id>)
    // ──────────────────────────────────────────────────────────────────────────
    if (cmd === "redeploy") {
      const target = args[0];
      if (!target) {
        return reply.send({
          success: false,
          output: "\x1b[31mError: Target identifier required. Usage: redeploy <slug|id>\x1b[0m\r\n",
          exitCode: 1,
        });
      }

      const vmStatus = await checkVmOnline();
      if (!vmStatus.vmOnline) {
        return reply.send({
          success: false,
          output: `\x1b[31mError: Cloud compute worker is currently paused for maintenance.\x1b[0m\r\n`,
          exitCode: 1,
        });
      }

      // Check service first
      const service = await prisma.backendService.findFirst({
        where: {
          userId,
          OR: [{ id: target }, { slug: target }],
        },
      });

      if (service) {
        const deployment = await prisma.serviceDeployment.create({
          data: {
            serviceId: service.id,
            commitHash: "terminal-redeploy",
            commitMessage: `Triggered via Account Terminal by ${email}`,
            branch: service.branch,
            status: "QUEUED",
          },
        });

        const isDirectUpload = !service.githubRepoUrl || service.githubRepoUrl === "direct-upload" || service.githubRepoUrl.trim() === "";
        const repoUrl = isDirectUpload ? "direct-upload" : await getAuthenticatedGitUrl(service.githubRepoUrl, userId);

        await serviceQueue.add("service-build", {
          deploymentId: deployment.id,
          serviceId: service.id,
          repoUrl,
          branch: service.branch,
          rootDir: service.rootDir || ".",
          installCommand: service.installCommand || "",
          startCommand: service.startCommand || "",
          internalPort: service.internalPort ?? 8000,
          isWorker: (service.internalPort ?? 8000) <= 0,
          slug: service.slug,
          language: service.language,
          autoSleep: service.autoSleep,
          instanceType: service.instanceType,
          cpuLimit: service.cpuLimit,
          memoryLimit: service.memoryLimit,
        });

        const output = [
          `\r\n\x1b[1;32m✓ Redeployment Enqueued Successfully!\x1b[0m`,
          `  \x1b[1mTarget Service:\x1b[0m   ${service.name} (${service.slug})`,
          `  \x1b[1mDeployment ID:\x1b[0m    ${deployment.id}`,
          `  \x1b[1mStatus:\x1b[0m           QUEUED → Processing on Whizan Build Worker`,
          `  \x1b[1mLive Stream:\x1b[0m      Call \x1b[1m'logs ${service.slug}'\x1b[0m or inspect in dashboard.\r\n`,
        ].join("\r\n");

        return reply.send({ success: true, output, exitCode: 0 });
      }

      // Check project
      const project = await prisma.project.findFirst({
        where: {
          userId,
          OR: [{ id: target }, { slug: target }],
        },
      });

      if (project) {
        const deployment = await prisma.deployment.create({
          data: {
            projectId: project.id,
            commitHash: "terminal-redeploy",
            commitMessage: `Triggered via Account Terminal by ${email}`,
            branch: project.branch,
            status: "QUEUED",
          },
        });

        const isDirectUpload = !project.githubRepoUrl || project.githubRepoUrl === "direct-upload";
        const repoUrl = isDirectUpload ? "direct-upload" : await getAuthenticatedGitUrl(project.githubRepoUrl, userId);

        await buildQueue.add("build", {
          deploymentId: deployment.id,
          projectId: project.id,
          repoUrl,
          branch: project.branch,
          outputDir: project.outputDir || "dist",
          buildCommand: project.buildCommand || "",
          installCommand: project.installCommand || "",
          slug: project.slug,
          framework: project.framework,
        });

        const output = [
          `\r\n\x1b[1;32m✓ Frontend Project Redeployment Enqueued!\x1b[0m`,
          `  \x1b[1mTarget Project:\x1b[0m   ${project.name} (${project.slug})`,
          `  \x1b[1mDeployment ID:\x1b[0m    ${deployment.id}`,
          `  \x1b[1mStatus:\x1b[0m           QUEUED → Build enqueued\r\n`,
        ].join("\r\n");

        return reply.send({ success: true, output, exitCode: 0 });
      }

      return reply.send({
        success: false,
        output: `\x1b[31mError: Target resource '${target}' not found in your account.\x1b[0m\r\n`,
        exitCode: 1,
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 9. LOGS (logs <slug|id> [lines])
    // ──────────────────────────────────────────────────────────────────────────
    if (cmd === "logs") {
      const target = args[0];
      const count = parseInt(args[1], 10) || 30;

      if (!target) {
        return reply.send({
          success: false,
          output: "\x1b[31mError: Target identifier required. Usage: logs <slug|id> [lines]\x1b[0m\r\n",
          exitCode: 1,
        });
      }

      const service = await prisma.backendService.findFirst({
        where: {
          userId,
          OR: [{ id: target }, { slug: target }],
        },
        include: {
          deployments: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      if (!service || !service.deployments[0]) {
        return reply.send({
          success: false,
          output: `\x1b[31mError: Service '${target}' has no deployment records.\x1b[0m\r\n`,
          exitCode: 1,
        });
      }

      const dId = service.deployments[0].id;
      const listKey = `build-logs:${dId}`;
      const stored = await redisClient.lrange(listKey, -count, -1);
      const cleanLogs = stored.filter(l => l !== "__DONE__");

      if (cleanLogs.length === 0) {
        return reply.send({
          success: true,
          output: `\r\n\x1b[33mNo log entries recorded yet for deployment ${dId.slice(0, 8)}.\x1b[0m\r\n`,
          exitCode: 0,
        });
      }

      const output = [
        `\r\n\x1b[1;36mLOG TAIL: ${service.slug} (Deployment: ${dId.slice(0, 8)} - ${service.deployments[0].status})\x1b[0m`,
        "────────────────────────────────────────────────────────────",
        ...cleanLogs,
        "────────────────────────────────────────────────────────────\r\n",
      ].join("\r\n");

      return reply.send({ success: true, output, exitCode: 0 });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 10. STATUS / PROBE (status <slug|id>)
    // ──────────────────────────────────────────────────────────────────────────
    if (cmd === "status") {
      const target = args[0];
      if (!target) {
        return reply.send({
          success: false,
          output: "\x1b[31mError: Target identifier required. Usage: status <slug|id>\x1b[0m\r\n",
          exitCode: 1,
        });
      }

      const service = await prisma.backendService.findFirst({
        where: {
          userId,
          OR: [{ id: target }, { slug: target }],
        },
        include: {
          deployments: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      if (!service) {
        return reply.send({
          success: false,
          output: `\x1b[31mError: Service '${target}' not found in your account.\x1b[0m\r\n`,
          exitCode: 1,
        });
      }

      const lastDeploy = service.deployments[0];
      const liveUrl = `https://${service.slug}.whizan.cloud`;
      const startTime = Date.now();
      let httpStatus = "Unreachable";
      let latencyMs = 0;

      try {
        const pingRes = await fetch(liveUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(4000),
        });
        httpStatus = `${pingRes.status} ${pingRes.statusText}`;
        latencyMs = Date.now() - startTime;
      } catch (err: any) {
        httpStatus = `Failed (${err.message})`;
        latencyMs = Date.now() - startTime;
      }

      const output = [
        `\r\n\x1b[1;36mHEALTH STATUS: ${service.name} (${service.slug})\x1b[0m`,
        "  ────────────────────────────────────────────────────────────",
        `  \x1b[1mPublic URL:\x1b[0m          ${liveUrl}`,
        `  \x1b[1mEdge Probe Result:\x1b[0m   ${httpStatus.includes("200") ? "\x1b[32m" + httpStatus + "\x1b[0m" : "\x1b[33m" + httpStatus + "\x1b[0m"}`,
        `  \x1b[1mLatency:\x1b[0m             ${latencyMs} ms`,
        `  \x1b[1mDeployment Status:\x1b[0m   ${lastDeploy?.status || "None"}`,
        `  \x1b[1mInternal Port:\x1b[0m       ${service.internalPort || 8000}`,
        `  \x1b[1mHost Mapped Port:\x1b[0m    ${lastDeploy?.containerPort ? lastDeploy.containerPort : "Scale-to-Zero (Awakens on HTTP request)"}\r\n`,
      ].join("\r\n");

      return reply.send({ success: true, output, exitCode: 0 });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 11. ENV VARS (env <slug|id>)
    // ──────────────────────────────────────────────────────────────────────────
    if (cmd === "env") {
      const target = args[0];
      if (!target) {
        return reply.send({
          success: false,
          output: "\x1b[31mError: Target identifier required. Usage: env <slug|id>\x1b[0m\r\n",
          exitCode: 1,
        });
      }

      const service = await prisma.backendService.findFirst({
        where: {
          userId,
          OR: [{ id: target }, { slug: target }],
        },
        include: {
          envVariables: true,
        },
      });

      if (!service) {
        return reply.send({
          success: false,
          output: `\x1b[31mError: Service '${target}' not found in your account.\x1b[0m\r\n`,
          exitCode: 1,
        });
      }

      if (service.envVariables.length === 0) {
        return reply.send({
          success: true,
          output: `\r\n\x1b[33mNo custom environment variables configured for '${service.slug}'.\x1b[0m\r\n`,
          exitCode: 0,
        });
      }

      const rows = service.envVariables.map(e => {
        return `  \x1b[1m${e.key.padEnd(28)}\x1b[0m = \x1b[90m•••••••••••••••• (Encrypted)\x1b[0m`;
      });

      const output = [
        `\r\n\x1b[1;36mCONFIGURED ENVIRONMENT VARIABLES: ${service.slug}\x1b[0m`,
        "  ────────────────────────────────────────────────────────────",
        ...rows,
        "  ────────────────────────────────────────────────────────────",
        "  \x1b[90mValues are encrypted with AES-256-GCM. Manage in Dashboard.\x1b[0m\r\n",
      ].join("\r\n");

      return reply.send({ success: true, output, exitCode: 0 });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 12. CURL (curl <slug|url>)
    // ──────────────────────────────────────────────────────────────────────────
    if (cmd === "curl") {
      let target = args[0];
      if (!target) {
        return reply.send({
          success: false,
          output: "\x1b[31mError: URL or slug required. Usage: curl <slug|url>\x1b[0m\r\n",
          exitCode: 1,
        });
      }

      if (!target.startsWith("http://") && !target.startsWith("https://")) {
        target = `https://${target}.whizan.cloud`;
      }

      // Security check: Only allow *.whizan.cloud domains or localhost
      if (!target.includes(".whizan.cloud") && !target.includes("127.0.0.1") && !target.includes("localhost")) {
        return reply.send({
          success: false,
          output: `\x1b[31m🔒 Security Guardrail: Outbound requests to external non-Whizan domains ('${target}') are blocked in account terminal.\x1b[0m\r\n`,
          exitCode: 1,
        });
      }

      const startTime = Date.now();
      try {
        const res = await fetch(target, { signal: AbortSignal.timeout(5000) });
        const latency = Date.now() - startTime;
        const text = await res.text();
        const snippet = text.slice(0, 1500) + (text.length > 1500 ? "\n\x1b[90m... [truncated]\x1b[0m" : "");

        const output = [
          `\r\n\x1b[1;32mHTTP/1.1 ${res.status} ${res.statusText}\x1b[0m (${latency} ms)`,
          `Content-Type: ${res.headers.get("content-type") || "unknown"}`,
          `Server: Cloudflare Edge`,
          "",
          snippet,
          "",
        ].join("\r\n");

        return reply.send({ success: true, output, exitCode: 0 });
      } catch (err: any) {
        return reply.send({
          success: false,
          output: `\x1b[31mCurl error: ${err.message}\x1b[0m\r\n`,
          exitCode: 1,
        });
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 13. EXEC (exec <slug> <command...>) — Container diagnostics
    // ──────────────────────────────────────────────────────────────────────────
    if (cmd === "exec") {
      const targetSlug = args[0];
      const containerCommand = args.slice(1).join(" ");

      if (!targetSlug || !containerCommand) {
        return reply.send({
          success: false,
          output: "\x1b[31mUsage: exec <slug> <command...>\x1b[0m (e.g. exec slim-skeleton php -v)\r\n",
          exitCode: 1,
        });
      }

      // 1. Guardrail validation
      const securityCheck = evaluateCommandSecurity(containerCommand);
      if (!securityCheck.allowed) {
        return reply.send({
          success: false,
          output: `\x1b[31m🔒 Security Guardrail: Command blocked: ${securityCheck.rule?.reason || "Restricted command."}\x1b[0m\r\n`,
          exitCode: 1,
        });
      }

      // 2. Find service and active deployment
      const service = await prisma.backendService.findFirst({
        where: {
          userId,
          OR: [{ id: targetSlug }, { slug: targetSlug }],
        },
        include: {
          deployments: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      if (!service || !service.deployments[0]) {
        return reply.send({
          success: false,
          output: `\x1b[31mError: Service '${targetSlug}' not found or has no active deployment.\x1b[0m\r\n`,
          exitCode: 1,
        });
      }

      const deploy = service.deployments[0];
      if (deploy.status !== "READY" && deploy.status !== "BUILDING") {
        return reply.send({
          success: false,
          output: `\x1b[33mService '${service.slug}' container is not active (Status: ${deploy.status}). Wake it first by visiting its URL.\x1b[0m\r\n`,
          exitCode: 1,
        });
      }

      // 3. Dispatch to VM worker via Redis
      const replyChannel = `container:exec:reply:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
      const sub = redisClient.duplicate();

      const execResult: any = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          sub.unsubscribe(replyChannel).catch(() => {});
          sub.quit().catch(() => {});
          resolve({
            success: false,
            stdout: "",
            stderr: "Execution timed out after 20 seconds.",
            exitCode: 124,
          });
        }, 20000);

        sub.subscribe(replyChannel, () => {
          const payload = signAdminPayload({
            action: "CONTAINER_EXEC",
            targetType: "service",
            targetId: service.id,
            deploymentId: deploy.id,
            slug: service.slug,
            command: containerCommand,
            replyChannel,
            requestedBy: email,
          });

          redisClient.publish("container:exec", JSON.stringify(payload)).catch((pubErr) => {
            clearTimeout(timeout);
            sub.unsubscribe(replyChannel).catch(() => {});
            sub.quit().catch(() => {});
            resolve({
              success: false,
              stdout: "",
              stderr: `Failed to enqueue command: ${pubErr.message}`,
              exitCode: 1,
            });
          });
        });

        sub.on("message", (channel, message) => {
          if (channel === replyChannel) {
            clearTimeout(timeout);
            sub.unsubscribe(replyChannel).catch(() => {});
            sub.quit().catch(() => {});
            try {
              resolve(JSON.parse(message));
            } catch {
              resolve({ success: false, stdout: "", stderr: "Invalid response from VM", exitCode: 1 });
            }
          }
        });
      });

      const outputLines: string[] = [];
      if (execResult.stdout) outputLines.push(execResult.stdout);
      if (execResult.stderr) outputLines.push(`\x1b[33m${execResult.stderr}\x1b[0m`);

      return reply.send({
        success: execResult.success,
        output: outputLines.join("\n") + "\r\n",
        exitCode: execResult.exitCode ?? (execResult.success ? 0 : 1),
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 14. CLEAR / EXIT
    // ──────────────────────────────────────────────────────────────────────────
    if (cmd === "clear") {
      return reply.send({ success: true, clear: true, output: "", exitCode: 0 });
    }

    if (cmd === "exit" || cmd === "quit") {
      return reply.send({ success: true, exit: true, output: "\x1b[90mSession closed.\x1b[0m\r\n", exitCode: 0 });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 15. SECURITY GUARDRAIL: REJECT UNRECOGNIZED / OUT-OF-SCOPE COMMANDS
    // ──────────────────────────────────────────────────────────────────────────
    const output = [
      `\r\n\x1b[1;31m🔒 Security Guardrail: Command '${cmd}' is out of scope.\x1b[0m`,
      "Whizan Cloud Account Terminal is restricted to scoped platform commands.",
      "",
      "Available commands:",
      "  \x1b[32mhelp\x1b[0m                     Show full command manual",
      "  \x1b[32mservices, ls\x1b[0m             List your backend services",
      "  \x1b[32mprojects\x1b[0m                 List your frontend projects",
      "  \x1b[32mstorage, buckets\x1b[0m         List cloud object storage buckets",
      "  \x1b[32mstorage ls <bkt>\x1b[0m         List objects in a storage bucket",
      "  \x1b[32mstorage info <bkt>\x1b[0m       Inspect bucket details & CDN URL",
      "  \x1b[32mstorage usage\x1b[0m            Show storage capacity & quota bar",
      "  \x1b[32mservice <slug>\x1b[0m           Inspect service configuration",
      "  \x1b[32mstatus <slug>\x1b[0m            Check health & latency",
      "  \x1b[32mredeploy <slug>\x1b[0m          Trigger redeployment",
      "  \x1b[32mlogs <slug>\x1b[0m              Read recent logs",
      "  \x1b[32mstats\x1b[0m                    Show compute & storage summary",
      "  \x1b[32mwhoami\x1b[0m                   Show user profile & tier",
      "  \x1b[32mexec <slug> <cmd>\x1b[0m        Run diagnostic command inside container\r\n",
    ].join("\r\n");

    return reply.send({
      success: false,
      output,
      exitCode: 127,
    });
  });
}

/**
 * Tokenize a command line string into words, respecting single and double quotes
 */
function parseCommandLine(text: string): string[] {
  const result: string[] = [];
  let current = "";
  let inDoubleQuote = false;
  let inSingleQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (/\s/.test(char) && !inDoubleQuote && !inSingleQuote) {
      if (current.length > 0) {
        result.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current.length > 0) {
    result.push(current);
  }

  return result;
}

/**
 * Format a rock-solid tabular grid for terminals with exact column gutters and pre-ANSI padding
 */
function renderTerminalTable(
  columns: { header: string; width: number }[],
  rows: { text: string; ansiColor?: string }[][]
): string {
  // Build header row with uppercase styling and bold white text
  const headerLine = "\x1b[1m" + columns.map(c => `\x1b[37m${c.header.padEnd(c.width)}\x1b[0m`).join("  ") + "\x1b[0m";
  const dividerLen = columns.reduce((acc, c) => acc + c.width, 0) + (columns.length - 1) * 2;
  const dividerLine = `\x1b[90m${"─".repeat(dividerLen)}\x1b[0m`;

  const bodyLines = rows.map(row => {
    return row.map((cell, idx) => {
      const colWidth = columns[idx]?.width || 12;
      // Truncate if exceeds column width
      const cleanText = cell.text || "";
      const truncated = cleanText.length > colWidth ? cleanText.slice(0, colWidth - 1) + "…" : cleanText;
      const padded = truncated.padEnd(colWidth);
      return cell.ansiColor ? `${cell.ansiColor}${padded}\x1b[0m` : padded;
    }).join("  ");
  });

  return [headerLine, dividerLine, ...bodyLines].join("\r\n");
}

/**
 * Format raw bytes into human-readable unit string (B, KB, MB, GB, TB)
 */
function formatBytes(bytes: number | bigint | string | null | undefined): string {
  const b = Number(bytes || 0);
  if (b === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i] || "B"}`;
}

/**
 * Render visual ANSI progress bar
 */
function renderProgressBar(percent: number, width = 20): string {
  const p = Math.max(0, Math.min(100, percent || 0));
  const filled = Math.round((p / 100) * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  const color = p > 90 ? "\x1b[1;31m" : p > 75 ? "\x1b[1;33m" : "\x1b[1;32m";
  return `${color}[${bar}]\x1b[0m ${p.toFixed(1)}%`;
}


