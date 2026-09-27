import { prisma } from "./prisma.js";
import { decrypt } from "./crypto.js";

/**
 * Returns an authenticated GitHub clone URL if the user has a valid GitHub token stored.
 * Example: https://github.com/org/private-repo -> https://x-access-token:gho_xyz@github.com/org/private-repo.git
 */
export async function getAuthenticatedGitUrl(
  repoUrl: string,
  userId: string
): Promise<string> {
  if (!repoUrl || !repoUrl.includes("github.com")) return repoUrl;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { githubToken: true },
    });

    if (!user || !user.githubToken) return repoUrl;

    const githubToken = decrypt(user.githubToken);
    if (!githubToken) return repoUrl;

    const urlObj = new URL(repoUrl);
    if (urlObj.hostname === "github.com" && !urlObj.username) {
      urlObj.username = "x-access-token";
      urlObj.password = githubToken;
      return urlObj.toString();
    }
  } catch (err) {
    console.warn("[Git Auth Helper] Could not format authenticated git URL:", err);
  }

  return repoUrl;
}
