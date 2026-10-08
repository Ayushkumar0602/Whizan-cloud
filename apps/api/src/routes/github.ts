import type { FastifyInstance } from "fastify";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { encrypt, decrypt } from "../lib/crypto.js";

const COOKIE_NAME = "refreshToken";

export async function githubRoutes(fastify: FastifyInstance) {
  // GET /api/github/auth-url — Generate GitHub OAuth Authorization URL
  fastify.get("/auth-url", async (request, reply) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return reply.code(500).send({ error: "GITHUB_CLIENT_ID is not configured" });
    }

    const redirectUri = process.env.GITHUB_CALLBACK_URL || "https://whizan-cloud-service.onrender.com/api/auth/github/callback";
    const scope = "repo,user:email,read:user";
    
    // Pass existing userId in state if user is logged in
    let userId = "";
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const decoded = fastify.jwt.verify(authHeader.replace("Bearer ", "")) as any;
        userId = decoded.userId || "";
      } catch {}
    }

    const stateObj = { userId, timestamp: Date.now() };
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64url");

    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;

    return { url };
  });

  // GET /api/auth/github/callback — GitHub OAuth Callback
  fastify.get("/auth/github/callback", async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };

    if (!code) {
      return reply.code(400).send({ error: "Missing authorization code from GitHub" });
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    const redirectUri = process.env.GITHUB_CALLBACK_URL || "https://whizan-cloud-service.onrender.com/api/auth/github/callback";

    if (!clientId || !clientSecret) {
      return reply.code(500).send({ error: "GitHub OAuth keys not configured on server" });
    }

    try {
      // 1. Exchange code for access token
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData: any = await tokenRes.json();
      if (!tokenData.access_token) {
        return reply.code(400).send({ error: tokenData.error_description || "Failed to exchange code for GitHub token" });
      }

      const accessToken = tokenData.access_token;
      const encryptedToken = encrypt(accessToken);

      // 2. Fetch user profile from GitHub API
      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "Whizan-Cloud-Service",
        },
      });

      if (!userRes.ok) {
        return reply.code(400).send({ error: "Failed to fetch user profile from GitHub" });
      }

      const ghUser: any = await userRes.json();
      let email = ghUser.email;

      if (!email) {
        const emailsRes = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "User-Agent": "Whizan-Cloud-Service",
          },
        });
        if (emailsRes.ok) {
          const emails: any = await emailsRes.json();
          if (Array.isArray(emails)) {
            const primary = emails.find((e: any) => e.primary) || emails[0];
            email = primary?.email;
          }
        }
      }

      if (!email) {
        email = `${ghUser.login}@users.noreply.github.com`;
      }

      // Parse state to check if user was already logged in
      let existingUserId = "";
      if (state) {
        try {
          const parsedState = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
          existingUserId = parsedState.userId || "";
        } catch {}
      }

      let user: any = null;

      if (existingUserId) {
        user = await prisma.user.update({
          where: { id: existingUserId },
          data: {
            githubId: String(ghUser.id),
            githubToken: encryptedToken,
            avatarUrl: ghUser.avatar_url || undefined,
            name: ghUser.name || ghUser.login,
          },
        }).catch(() => null);
      }

      if (!user) {
        // Try finding by githubId or email
        user = await prisma.user.findFirst({
          where: {
            OR: [
              { githubId: String(ghUser.id) },
              { email },
            ],
          },
        });

        if (user) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              githubId: String(ghUser.id),
              githubToken: encryptedToken,
              avatarUrl: ghUser.avatar_url || user.avatarUrl,
              name: user.name || ghUser.name || ghUser.login,
            },
          });
        } else {
          // Create new GitHub user
          user = await prisma.user.create({
            data: {
              email,
              githubId: String(ghUser.id),
              githubToken: encryptedToken,
              avatarUrl: ghUser.avatar_url,
              name: ghUser.name || ghUser.login,
            },
          });
        }
      }

      // Issue refresh token & cookie
      const jwtToken = fastify.jwt.sign({ userId: user.id, email: user.email });
      const refreshToken = crypto.randomBytes(48).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await prisma.refreshToken.create({
        data: { userId: user.id, token: refreshToken, expiresAt },
      });

      reply.setCookie(COOKIE_NAME, refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });

      // Redirect back to frontend dashboard with token in URL hash/query
      const dashboardUrl = process.env.DASHBOARD_URL || "https://whizan-cloud-service-dashboard.vercel.app";
      return reply.redirect(`${dashboardUrl}/dashboard?github=connected&token=${jwtToken}`);
    } catch (err: any) {
      fastify.log.error(err, "GitHub OAuth error");
      const dashboardUrl = process.env.DASHBOARD_URL || "https://whizan-cloud-service-dashboard.vercel.app";
      return reply.redirect(`${dashboardUrl}/dashboard?error=github_failed`);
    }
  });

  // GET /api/github/status — Check GitHub connection status
  fastify.get(
    "/github/status",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { githubId: true, githubToken: true, avatarUrl: true, name: true },
      });

      if (!user || !user.githubToken) {
        return { connected: false };
      }

      try {
        const decryptedToken = decrypt(user.githubToken);
        const ghRes = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${decryptedToken}`,
            "User-Agent": "Whizan-Cloud-Service",
          },
        });

        if (!ghRes.ok) {
          // Token expired or revoked -> clean up
          await prisma.user.update({
            where: { id: userId },
            data: { githubToken: null },
          }).catch(() => {});
          return { connected: false };
        }

        const ghUser: any = await ghRes.json();
        return {
          connected: true,
          username: ghUser.login,
          avatarUrl: user.avatarUrl || ghUser.avatar_url,
          name: ghUser.name || user.name || ghUser.login,
          publicRepos: ghUser.public_repos,
          totalPrivateRepos: ghUser.total_private_repos || 0,
        };
      } catch {
        return { connected: false };
      }
    }
  );

  // GET /api/github/repos — Fetch public AND private GitHub repositories for user
  fastify.get(
    "/github/repos",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { githubToken: true },
      });

      if (!user || !user.githubToken) {
        return reply.code(400).send({ error: "GitHub account not connected. Please connect GitHub first." });
      }

      try {
        const decryptedToken = decrypt(user.githubToken);
        const ghRes = await fetch("https://api.github.com/user/repos?sort=updated&per_page=100&type=all", {
          headers: {
            Authorization: `Bearer ${decryptedToken}`,
            "User-Agent": "Whizan-Cloud-Service",
          },
        });

        if (!ghRes.ok) {
          return reply.code(400).send({ error: "Failed to fetch repositories from GitHub" });
        }

        const repos = await ghRes.json();
        if (!Array.isArray(repos)) {
          return [];
        }

        return repos.map((r: any) => ({
          id: r.id,
          name: r.name,
          fullName: r.full_name,
          private: Boolean(r.private),
          owner: r.owner?.login || "",
          defaultBranch: r.default_branch || "main",
          htmlUrl: r.html_url,
          cloneUrl: r.clone_url,
          description: r.description || "",
          language: r.language || "",
          updatedAt: r.updated_at,
        }));
      } catch (err: any) {
        return reply.code(500).send({ error: err.message || "Error fetching GitHub repos" });
      }
    }
  );

  // GET /api/github/branches — Fetch branches for a specific repository
  fastify.get(
    "/github/branches",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { owner, repo } = request.query as { owner?: string; repo?: string };
      if (!owner || !repo) {
        return reply.code(400).send({ error: "owner and repo parameters are required" });
      }

      const { userId } = request.user;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { githubToken: true },
      });

      if (!user || !user.githubToken) {
        return reply.code(400).send({ error: "GitHub account not connected." });
      }

      try {
        const decryptedToken = decrypt(user.githubToken);
        const branchRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, {
          headers: {
            Authorization: `Bearer ${decryptedToken}`,
            "User-Agent": "Whizan-Cloud-Service",
          },
        });

        if (!branchRes.ok) {
          return reply.code(400).send({ error: "Failed to fetch branches from GitHub" });
        }

        const branches = await branchRes.json();
        if (!Array.isArray(branches)) return ["main"];

        return branches.map((b: any) => b.name);
      } catch (err: any) {
        return ["main"];
      }
    }
  );

  // POST /api/github/disconnect — Disconnect GitHub account
  fastify.post(
    "/github/disconnect",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      await prisma.user.update({
        where: { id: userId },
        data: { githubToken: null, githubId: null },
      }).catch(() => {});
      return { ok: true };
    }
  );
}
