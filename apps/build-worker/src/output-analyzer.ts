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
  rootDir?: string,
  outputDir?: string
): Promise<AnalysisResult> {
  const cleanRootDir = rootDir && rootDir !== "." ? rootDir.replace(/^\/+|\/+$/g, "") : "";
  const targetDir = cleanRootDir ? path.join(buildDir, cleanRootDir) : buildDir;

  const exists = (rel: string) => fs.existsSync(path.join(targetDir, rel));
  const relToBuild = (rel: string) => (cleanRootDir ? path.posix.join(cleanRootDir, rel) : rel);

  // ── Explicit outputDir if specified and exists (e.g. "dist", "build", "out") ──
  if (outputDir && outputDir !== ".next" && exists(outputDir)) {
    return { type: "static", staticDir: relToBuild(outputDir) };
  }

  // ── Vite / Create React App / Astro (Strictly Static by default) ────────────
  if (framework === "VITE" || framework === "REACT") {
    if (exists("dist")) return { type: "static", staticDir: relToBuild("dist") };
    if (exists("build")) return { type: "static", staticDir: relToBuild("build") };
  }

  if (framework === "ASTRO") {
    if (exists("dist")) return { type: "static", staticDir: relToBuild("dist") };
  }

  // ── Next.js (Only if framework is NEXTJS or standalone/server artifacts exist) ──
  const isExplicitNext = framework === "NEXTJS";
  const hasNextBuildArtifacts = exists(".next/server") || exists(".next/standalone");

  if (isExplicitNext || (framework === "CUSTOM" && hasNextBuildArtifacts) || (!["VITE", "REACT", "ASTRO"].includes(framework) && hasNextBuildArtifacts)) {
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
    if (exists(".next/server") || exists(".next")) {
      return {
        type: "ssr",
        serverEntry: relToBuild("node_modules/.bin/next"),
        hasApiRoutes: exists(".next/server/pages/api") || exists(".next/server/app/api"),
      };
    }
  }

  // ── Generic fallback for static directories ───────────────────────────────
  for (const dir of ["dist", "build", "out", "public"]) {
    if (exists(dir)) return { type: "static", staticDir: relToBuild(dir) };
  }

  // ── Static HTML frontend fallback (index.html at project root) ─────────────
  if (exists("index.html")) {
    return { type: "static", staticDir: relToBuild(".") };
  }

  throw new Error("Could not detect build output. Check your build command and output directory.");
}
