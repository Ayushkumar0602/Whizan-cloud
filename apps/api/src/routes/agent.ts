import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  handleAgentChat,
  handleAgentChatStream,
  handleActionDecision,
} from "../services/agent/agent-service.js";
import { generateSpeechAudio } from "../services/agent/tts-service.js";

const ChatSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().min(1),
  context: z
    .object({
      pathname: z.string().optional(),
      targetId: z.string().optional(),
      targetType: z.enum(["service", "project"]).optional(),
    })
    .optional(),
  enableTts: z.boolean().default(true),
});

const ApproveSchema = z.object({
  actionId: z.string(),
  decision: z.enum(["APPROVE", "REJECT"]),
  modifiedParameters: z.record(z.string(), z.any()).optional(),
});

const TtsSchema = z.object({
  text: z.string().min(1),
});

export async function agentRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  // POST /api/agent/chat
  fastify.post("/chat", async (request, reply) => {
    const parse = ChatSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: parse.error.format() });
    }

    const { userId } = request.user;
    const response = await handleAgentChat({
      userId,
      ...parse.data,
    });

    return reply.send(response);
  });

  // POST /api/agent/chat/stream — Real-time SSE streaming endpoint
  fastify.post("/chat/stream", async (request, reply) => {
    const parse = ChatSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: parse.error.format() });
    }

    const { userId } = request.user;

    // Determine CORS origin — reply.raw bypasses @fastify/cors so we set headers manually
    const reqOrigin = request.headers.origin || "";
    const originAllowed =
      !reqOrigin ||
      reqOrigin === (process.env.DASHBOARD_URL || "http://localhost:3000") ||
      /^https?:\/\/[a-z0-9-]+\.onrender\.com$/.test(reqOrigin) ||
      /^https?:\/\/[a-z0-9-]+\.vercel\.app$/.test(reqOrigin) ||
      /^http:\/\/localhost(:\d+)?$/.test(reqOrigin) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(reqOrigin);

    // Set SSE headers (disable Fastify serialization, write raw)
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Prevent Nginx buffering
      ...(originAllowed && reqOrigin
        ? {
            "Access-Control-Allow-Origin": reqOrigin,
            "Access-Control-Allow-Credentials": "true",
          }
        : {}),
    });

    await handleAgentChatStream(
      { userId, ...parse.data },
      (event) => {
        try {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          // Client disconnected — silently ignore
        }
      }
    );

    reply.raw.end();
  });

  // POST /api/agent/approve
  fastify.post("/approve", async (request, reply) => {
    const parse = ApproveSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: parse.error.format() });
    }

    const { userId } = request.user;
    const res = await handleActionDecision(
      parse.data.actionId,
      userId,
      parse.data.decision,
      parse.data.modifiedParameters
    );

    if (!res.success) {
      return reply.code(400).send(res);
    }

    return reply.send(res);
  });

  // GET /api/agent/sessions
  fastify.get("/sessions", async (request, reply) => {
    const { userId } = request.user;
    const sessions = await prisma.agentSession.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reply.send(sessions);
  });

  // GET /api/agent/sessions/:id
  fastify.get("/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;

    const session = await prisma.agentSession.findFirst({
      where: { id, userId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
        actions: {
          where: { status: "PENDING" },
        },
      },
    });

    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    return reply.send(session);
  });

  // DELETE /api/agent/sessions/:id
  fastify.delete("/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.user;

    const session = await prisma.agentSession.findFirst({
      where: { id, userId },
    });

    if (!session) {
      return reply.code(404).send({ error: "Session not found" });
    }

    await prisma.agentSession.delete({
      where: { id },
    });

    return reply.send({ success: true, message: "Session deleted" });
  });

  // POST /api/agent/tts
  fastify.post("/tts", async (request, reply) => {
    const parse = TtsSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: parse.error.format() });
    }

    const result = await generateSpeechAudio(parse.data.text);
    return reply.send(result);
  });
}
