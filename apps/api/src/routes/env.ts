import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { encrypt, decrypt } from "../lib/crypto.js";

const FlexibleEnvValue = z.any().transform((v) => {
  if (typeof v === "object" && v !== null) return JSON.stringify(v);
  return String(v ?? "");
});

const EnvSchema = z.object({
  key: z.string().min(1).regex(/^[a-zA-Z0-9_.-]+$/, "Keys must contain alphanumeric characters, underscores, hyphens, or dots"),
  value: FlexibleEnvValue,
  isSecret: z.boolean().default(true),
});

const BulkEnvSchema = z.object({
  envVars: z.record(z.string(), z.any()),
  isSecret: z.boolean().default(true),
});

export async function envRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  // GET /api/projects/:id/env
  fastify.get("/:id/env", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.user;

    const project = await prisma.project.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
    });
    if (!project) return reply.code(404).send({ error: "Project not found" });

    const vars = await prisma.envVariable.findMany({ where: { projectId: id } });

    return vars.map((v: typeof vars[number]) => ({
      id: v.id,
      key: v.key,
      value: v.isSecret ? "***" : decrypt(v.value),
      isSecret: v.isSecret,
      createdAt: v.createdAt,
    }));
  });

  // POST /api/projects/:id/env
  fastify.post("/:id/env", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.user;
    const body = EnvSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const project = await prisma.project.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
    });
    if (!project) return reply.code(404).send({ error: "Project not found" });

    const encryptedValue = encrypt(body.data.value);

    const envVar = await prisma.envVariable.upsert({
      where: { projectId_key: { projectId: id, key: body.data.key } },
      update: { value: encryptedValue, isSecret: body.data.isSecret },
      create: { projectId: id, key: body.data.key, value: encryptedValue, isSecret: body.data.isSecret },
    });

    return reply.code(201).send({ id: envVar.id, key: envVar.key, isSecret: envVar.isSecret });
  });

  // POST /api/projects/:id/env/bulk
  fastify.post("/:id/env/bulk", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = request.user;
    const body = BulkEnvSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const project = await prisma.project.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
    });
    if (!project) return reply.code(404).send({ error: "Project not found" });

    const isSecret = body.data.isSecret ?? true;
    const entries = Object.entries(body.data.envVars);

    const savedKeys: string[] = [];
    const operations = entries.map(([rawKey, rawVal]) => {
      const key = String(rawKey).trim();
      const valStr = typeof rawVal === "object" && rawVal !== null ? JSON.stringify(rawVal) : String(rawVal ?? "");
      const encryptedValue = encrypt(valStr);
      savedKeys.push(key);
      return prisma.envVariable.upsert({
        where: { projectId_key: { projectId: id, key } },
        update: { value: encryptedValue, isSecret },
        create: { projectId: id, key, value: encryptedValue, isSecret },
      });
    });

    if (operations.length > 0) {
      await prisma.$transaction(operations);
    }

    return reply.code(200).send({
      success: true,
      count: savedKeys.length,
      keys: savedKeys,
    });
  });

  // DELETE /api/projects/:id/env/:key
  fastify.delete("/:id/env/:key", async (request, reply) => {
    const { id, key } = request.params as { id: string; key: string };
    const { userId, role } = request.user;

    const project = await prisma.project.findFirst({
      where: role === "ADMIN" ? { id } : { id, userId },
    });
    if (!project) return reply.code(404).send({ error: "Project not found" });

    await prisma.envVariable.deleteMany({ where: { projectId: id, key } });
    return reply.send({ ok: true });
  });
}
