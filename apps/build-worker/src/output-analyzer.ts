import fs from "fs";
import path from "path";

export interface AnalysisResult {
  type: "static" | "ssr" | "hybrid";
  staticDir?: string;      // Relative path inside buildDir
  serverEntry?: string;    // Relative path to the SSR entry point
  hasApiRoutes?: boolean;
}

/**
 * Inspects the build output directory to determine if the deployment
 * is static-only, SSR, or hybrid (static + SSR + API routes).
 */
export async function analyzeOutput(
  buildDir: string,
  framework: string,
  rootDir?: string
): Promise<AnalysisResult> {
  const cleanRootDir = rootDir && rootDir !== "." ? rootDir.replace(/^\/+|\/+$/g, "") : "";
  const targetDir = cleanRootDir ? path.join(buildDir, cleanRootDir) : buildDir;

  const exists = (rel: string) => fs.existsSync(path.join(targetDir, rel));
  const relToBuild = (rel: string) => (cleanRootDir ? path.posix.join(cleanRootDir, rel) : rel);

  // ── Next.js ──────────────────────────────────────────────────────────────
  if (framework === "NEXTJS" || exists(".next")) {
    // next build --output=standalone produces .next/standalone/
    if (exists(".next/standalone")) {
      const hasStaticAssets = exists(".next/static");
      const hasApiPagesRoutes = exists(".next/server/pages/api");
      const hasApiAppRoutes = exists(".next/server/app/api");
      const hasApiRoutes = hasApiPagesRoutes || hasApiAppRoutes;

      return {
        type: "hybrid",
        staticDir: hasStaticAssets ? relToBuild(".next/static") : undefined,
        serverEntry: relToBuild(".next/standalone/server.js"),
        hasApiRoutes,
      };
    }

    // next export or static-only: produces /out directory
    if (exists("out")) {
      return { type: "static", staticDir: relToBuild("out") };
    }

    // Standard next build without standalone — treat as SSR
    if (exists(".next/server")) {
      return {
        type: "ssr",
        serverEntry: relToBuild("node_modules/.bin/next"),
        hasApiRoutes: exists(".next/server/pages/api") || exists(".next/server/app/api"),
      };
    }
  }

  // ── Vite / Create React App ───────────────────────────────────────────────
  if (framework === "VITE" || framework === "REACT") {
    if (exists("dist")) return { type: "static", staticDir: relToBuild("dist") };
    if (exists("build")) return { type: "static", staticDir: relToBuild("build") };
  }

  // ── Astro ────────────────────────────────────────────────────────────────
  if (framework === "ASTRO") {
    if (exists("dist")) return { type: "static", staticDir: relToBuild("dist") };
  }

  // ── Generic fallback ─────────────────────────────────────────────────────
  for (const dir of ["dist", "build", "out", "public"]) {
    if (exists(dir)) return { type: "static", staticDir: relToBuild(dir) };
  }

  throw new Error("Could not detect build output. Check your build command and output directory.");
}
