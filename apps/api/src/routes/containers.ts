import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { redisClient } from "../lib/redis.js";
import { evaluateCommandSecurity } from "../lib/container-security.js";
import { signAdminPayload } from "../lib/auth-utils.js";
import { checkVmOnline } from "../lib/vm-status.js";
import { getDeploymentUrl } from "../lib/domain.js";

const ExecSchema = z.object({
  targetType: z.enum(["project", "service"]),
  targetId: z.string().min(1),
  command: z.string().min(1).max(500),
});

export async function containerRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  // POST /api/containers/exec — Execute diagnostic command inside container
  fastify.post("/exec", async (request, reply) => {
    const body = ExecSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const { userId, role } = request.user;
    const { targetType, targetId, command } = body.data;

    const vmStatus = await checkVmOnline();
    if (!vmStatus.vmOnline) {
      const userName = (request.user as any)?.name || request.user?.email?.split("@")[0] || "Developer";
      return reply.code(503).send({
        error: "VM_OFFLINE_MAINTENANCE",
        code: "MAINTENANCE_PAUSED",
        message: `Dear ${userName}, the request cannot be processed because the administration has temporarily stopped new deployments and serving existing applications until further notice.`,
        contactEmail: vmStatus.contactEmail,
        contactUrl: vmStatus.contactUrl,
      });
    }

    // 1. Guardrail validation
    const securityCheck = evaluateCommandSecurity(command);
    if (!securityCheck.allowed) {
      return reply.code(403).send({
        error: `Command blocked by Whizan Container Guardrail: ${securityCheck.rule?.reason || "Restricted command."}`,
        rule: securityCheck.rule?.name,
      });
    }

    // Additional informational guardrails (block destructive / modification commands)
    const destructiveRegex = /\b(?:rm\s+(-[a-zA-Z]*r[a-zA-Z]*|-rf|--recursive)|unlink|shred|truncate|dd\s+if=|mkfs|shutdown|reboot|poweroff|halt|init\s+0)\b/i;
    if (destructiveRegex.test(command)) {
      return reply.code(403).send({
        error: "Command blocked: File deletion and system power commands are strictly prohibited in container diagnostics.",
      });
    }

    // 2. Verify target ownership and find active deployment (supports both UUID and slug)
    let slug = "";
    let deploymentId = "";

    if (targetType === "project") {
      const project = await prisma.project.findFirst({
        where: role === "ADMIN"
          ? { OR: [{ id: targetId }, { slug: targetId }] }
          : { userId, OR: [{ id: targetId }, { slug: targetId }] },
        include: { deployments: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      if (!project) return reply.code(404).send({ error: "Project not found or unauthorized." });
      const deploy = project.deployments[0];
      if (!deploy || (deploy.status !== "READY" && deploy.status !== "BUILDING")) {
        return reply.code(400).send({ error: "Project does not have an active deployment." });
      }
      slug = project.slug;
      deploymentId = deploy.id;
    } else {
      const service = await prisma.backendService.findFirst({
        where: role === "ADMIN"
          ? { OR: [{ id: targetId }, { slug: targetId }] }
          : { userId, OR: [{ id: targetId }, { slug: targetId }] },
        include: { deployments: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      if (!service) return reply.code(404).send({ error: "Service not found or unauthorized." });
      const deploy = service.deployments[0];
      if (!deploy || (deploy.status !== "READY" && deploy.status !== "BUILDING")) {
        return reply.code(400).send({ error: "Service does not have an active deployment." });
      }
      slug = service.slug;
      deploymentId = deploy.id;
    }

    // 3. Dispatch to VM worker via Redis
    const replyChannel = `container:exec:reply:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    const sub = redisClient.duplicate();

    return new Promise((resolve) => {
      let timeout = setTimeout(() => {
        sub.unsubscribe(replyChannel).catch(() => {});
        sub.quit().catch(() => {});
        resolve({
          success: false,
          error: "Command execution timed out after 20 seconds. The container might be unreachably slow or locked.",
          stdout: "",
          stderr: "Timeout",
          exitCode: 124,
        });
      }, 20000);

      sub.subscribe(replyChannel, () => {
        const payload = signAdminPayload({
          action: "CONTAINER_EXEC",
          targetType,
          targetId,
          deploymentId,
          slug,
          command,
          replyTo: replyChannel,
        });
        redisClient.publish("admin:commands", JSON.stringify(payload));
      });

      sub.on("message", (channel, message) => {
        if (channel === replyChannel) {
          clearTimeout(timeout);
          sub.unsubscribe(replyChannel).catch(() => {});
          sub.quit().catch(() => {});
          try {
            resolve(JSON.parse(message));
          } catch {
            resolve({ success: true, stdout: message, stderr: "", exitCode: 0 });
          }
        }
      });
    });
  });

  // GET /api/containers/logs — Real-time stdout/stderr application logs from running/exited container
  fastify.get("/logs", async (request, reply) => {
    const { targetType, targetId, tail = "200", timestamps } = request.query as {
      targetType?: string;
      targetId?: string;
      tail?: string;
      timestamps?: string;
    };

    if (!targetType || !targetId) {
      return reply.code(400).send({ error: "targetType ('project' | 'service') and targetId are required." });
    }

    const { userId, role } = request.user;
    let slug = "";
    let deploymentId = "";

    if (targetType === "project") {
      const project = await prisma.project.findFirst({
        where: role === "ADMIN"
          ? { OR: [{ id: targetId }, { slug: targetId }] }
          : { userId, OR: [{ id: targetId }, { slug: targetId }] },
        include: { deployments: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      if (!project) return reply.code(404).send({ error: "Project not found or unauthorized." });
      const deploy = project.deployments[0];
      slug = project.slug;
      deploymentId = deploy?.id || "";
    } else {
      const service = await prisma.backendService.findFirst({
        where: role === "ADMIN"
          ? { OR: [{ id: targetId }, { slug: targetId }] }
          : { userId, OR: [{ id: targetId }, { slug: targetId }] },
        include: { deployments: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      if (!service) return reply.code(404).send({ error: "Service not found or unauthorized." });
      const deploy = service.deployments[0];
      slug = service.slug;
      deploymentId = deploy?.id || "";
    }

    const replyChannel = `container:logs:reply:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    const sub = redisClient.duplicate();

    return new Promise((resolve) => {
      let timeout = setTimeout(() => {
        sub.unsubscribe(replyChannel).catch(() => {});
        sub.quit().catch(() => {});
        resolve({
          success: false,
          logs: "Log fetch request timed out. Compute node may be offline or initializing.",
          containerId: null,
        });
      }, 8000);

      sub.subscribe(replyChannel, () => {
        const payload = signAdminPayload({
          action: "CONTAINER_LOGS",
          targetType,
          targetId,
          deploymentId,
          slug,
          tail,
          timestamps: timestamps === "true",
          replyTo: replyChannel,
        });
        redisClient.publish("admin:commands", JSON.stringify(payload));
      });

      sub.on("message", (channel, message) => {
        if (channel === replyChannel) {
          clearTimeout(timeout);
          sub.unsubscribe(replyChannel).catch(() => {});
          sub.quit().catch(() => {});
          try {
            resolve(JSON.parse(message));
          } catch {
            resolve({ success: true, logs: message, containerId: null });
          }
        }
      });
    });
  });

  // GET /api/containers/inspect — Inspect runtime deployment and container info
  fastify.get("/inspect", async (request, reply) => {
    const { targetType, targetId } = request.query as { targetType?: string; targetId?: string };
    if (!targetType || !targetId) {
      return reply.code(400).send({ error: "targetType ('project' | 'service') and targetId are required." });
    }

    const { userId, role } = request.user;
    let slug = "";
    let deploymentId = "";
    let dbInfo: any = {};

    if (targetType === "project") {
      const project = await prisma.project.findFirst({
        where: role === "ADMIN"
          ? { OR: [{ id: targetId }, { slug: targetId }] }
          : { userId, OR: [{ id: targetId }, { slug: targetId }] },
        include: {
          deployments: { orderBy: { createdAt: "desc" }, take: 1 },
          envVariables: { select: { key: true } },
        },
      });
      if (!project) return reply.code(404).send({ error: "Project not found or unauthorized." });
      const deploy = project.deployments[0];
      slug = project.slug;
      deploymentId = deploy?.id || "";
      dbInfo = {
        name: project.name,
        slug: project.slug,
        framework: project.framework,
        branch: project.branch,
        url: deploy?.url || getDeploymentUrl(project.slug),
        status: deploy?.status || "UNKNOWN",
        deploymentType: deploy?.deploymentType || "STATIC",
        containerPort: deploy?.containerPort,
        envKeys: project.envVariables.map((e) => e.key),
      };
    } else {
      const service = await prisma.backendService.findFirst({
        where: role === "ADMIN"
          ? { OR: [{ id: targetId }, { slug: targetId }] }
          : { userId, OR: [{ id: targetId }, { slug: targetId }] },
        include: {
          deployments: { orderBy: { createdAt: "desc" }, take: 1 },
          envVariables: { select: { key: true } },
        },
      });
      if (!service) return reply.code(404).send({ error: "Service not found or unauthorized." });
      const deploy = service.deployments[0];
      slug = service.slug;
      deploymentId = deploy?.id || "";
      dbInfo = {
        name: service.name,
        slug: service.slug,
        language: service.language,
        internalPort: service.internalPort,
        isWorker: service.internalPort === 0,
        url: getDeploymentUrl(service.slug, service.internalPort === 0),
        status: deploy?.status || "UNKNOWN",
        instanceType: service.instanceType,
        autoSleep: service.autoSleep,
        envKeys: service.envVariables.map((e) => e.key),
      };
    }

    if (!deploymentId) {
      return { ...dbInfo, container: null, message: "No deployments recorded yet." };
    }

    const replyChannel = `container:inspect:reply:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    const sub = redisClient.duplicate();

    const containerInfo: any = await new Promise((resolve) => {
      let timeout = setTimeout(() => {
        sub.unsubscribe(replyChannel).catch(() => {});
        sub.quit().catch(() => {});
        resolve({ found: false, message: "Container inspection query timed out." });
      }, 6000);

      sub.subscribe(replyChannel, () => {
        const payload = signAdminPayload({
          action: "CONTAINER_INSPECT",
          targetType,
          targetId,
          deploymentId,
          slug,
          replyTo: replyChannel,
        });
        redisClient.publish("admin:commands", JSON.stringify(payload));
      });

      sub.on("message", (channel, message) => {
        if (channel === replyChannel) {
          clearTimeout(timeout);
          sub.unsubscribe(replyChannel).catch(() => {});
          sub.quit().catch(() => {});
          try {
            resolve(JSON.parse(message));
          } catch {
            resolve({ found: false, message });
          }
        }
      });
    });

    return {
      targetType,
      targetId,
      ...dbInfo,
      container: containerInfo,
    };
  });

  // GET /api/containers/analytics — Unified analytics endpoint
  fastify.get("/analytics", async (request, reply) => {
    const { targetType, targetId, days = "30" } = request.query as { targetType?: string; targetId?: string; days?: string };
    if (!targetType || !targetId) {
      return reply.code(400).send({ error: "targetType ('project' | 'service') and targetId are required." });
    }

    const { userId, role } = request.user;
    const numDays = Math.max(1, Math.min(90, parseInt(days, 10) || 30));
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - numDays);

    if (targetType === "project") {
      const project = await prisma.project.findFirst({
        where: role === "ADMIN" ? { id: targetId } : { id: targetId, userId }
      });
      if (!project) return reply.code(404).send({ error: "Project not found or unauthorized." });

      const records = await prisma.projectAnalytics.findMany({
        where: { projectId: targetId, date: { gte: sinceDate } },
        orderBy: { date: "asc" },
      });

      const totalPageViews = records.reduce((acc, r) => acc + r.pageViews, 0);
      const totalVisitors = records.reduce((acc, r) => acc + r.visitors, 0);
      const totalBandwidthBytes = records.reduce((acc, r) => acc + r.bandwidth, 0);

      return {
        targetType: "project",
        targetId,
        name: project.name,
        slug: project.slug,
        timeframeDays: numDays,
        summary: {
          totalPageViews,
          totalVisitors,
          totalBandwidthBytes,
          totalBandwidthMB: Math.round(totalBandwidthBytes / (1024 * 1024) * 100) / 100,
        },
        dailyData: records,
      };
    } else {
      const service = await prisma.backendService.findFirst({
        where: role === "ADMIN" ? { id: targetId } : { id: targetId, userId }
      });
      if (!service) return reply.code(404).send({ error: "Service not found or unauthorized." });

      const rawHistory = await redisClient.lrange(`metrics:service:${targetId}`, 0, 59).catch(() => []);
      const history = rawHistory.map((h) => {
        try { return JSON.parse(h); } catch { return null; }
      }).filter(Boolean);

      const latest = history[history.length - 1] || null;

      return {
        targetType: "service",
        targetId,
        name: service.name,
        slug: service.slug,
        status: service.autoSleep ? "Scale-to-Zero Enabled" : "Always-On",
        latestSnapshot: latest,
        recentMinuteSamples: history.slice(-15),
      };
    }
  });
}
