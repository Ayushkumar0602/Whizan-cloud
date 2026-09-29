import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";

const execFileAsync = promisify(execFile);

// Default patterns to exclude from direct uploads
const DEFAULT_IGNORES = [
  // Dependencies & Virtual Environments
  "node_modules",
  "venv",
  ".venv",
  "env",
  "ENV",
  "virtualenv",
  ".yarn",
  ".pnpm-store",
  "vendor",

  // Version Control & Metadata
  ".git",
  ".svn",
  ".hg",
  ".DS_Store",
  "._*",
  "Thumbs.db",

  // Python Artifacts
  "__pycache__",
  "*.pyc",
  "*.pyo",
  "*.pyd",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",

  // Build Outputs & Framework Caches
  ".next",
  "dist",
  "build",
  "out",
  ".turbo",
  ".cache",
  ".volumes",
  ".nuxt",
  ".svelte-kit",
  ".astro",

  // Headless Browser Downloads (Playwright / Puppeteer)
  "ms-playwright",
  ".local-browsers",

  // Environment Secrets & Logs
  ".env",
  ".env.local",
  ".env.*.local",
  "*.log",
  "npm-debug.log*",
  "yarn-debug.log*",
  "yarn-error.log*",

  // Nested Archives & Large Binary Media
  "*.tar.gz",
  "*.tgz",
  "*.zip",
  "*.rar",
  "*.mov",
  "*.mp4",
  "*.avi",
  "*.mkv",
  "*.iso",
  "*.dmg",
  "*.parquet",
];

/**
 * Parses user's .gitignore file if present and combines with default ignores
 */
export async function getIgnorePatterns(
  workspaceDir: string,
  targetType?: "service" | "project"
): Promise<string[]> {
  const ignoreSet = new Set<string>(DEFAULT_IGNORES);

  // If packing for a frontend project, omit backend-specific folders if present
  if (targetType === "project") {
    ignoreSet.add("backend");
    ignoreSet.add("server");
  } else if (targetType === "service") {
    ignoreSet.add("frontend");
    ignoreSet.add("client");
  }

  const gitignorePath = path.join(workspaceDir, ".gitignore");

  try {
    const content = await fs.readFile(gitignorePath, "utf8");
    content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .forEach((pat) => {
        // Strip leading/trailing slashes for tar --exclude
        const clean = pat.replace(/^\/+|\/+$/g, "");
        if (clean) ignoreSet.add(clean);
      });
  } catch {
    // No .gitignore, fallback to default patterns
  }

  return Array.from(ignoreSet);
}

/**
 * Creates a gzipped tarball (.tar.gz) of the given directory,
 * respecting .gitignore and default exclusion rules.
 * Returns the tarball as a Buffer.
 */
export async function packDirectory(
  workspaceDir: string,
  targetType?: "service" | "project"
): Promise<Buffer> {
  const resolvedDir = path.resolve(workspaceDir);
  const tempArchive = path.join(os.tmpdir(), `whizan-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tar.gz`);

  const ignores = await getIgnorePatterns(resolvedDir, targetType);
  const excludeArgs = ignores.flatMap((pat) => ["--exclude", pat]);

  try {
    // Pack all contents of resolvedDir into tempArchive
    await execFileAsync("tar", [
      "-czf",
      tempArchive,
      ...excludeArgs,
      "-C",
      resolvedDir,
      ".",
    ], {
      env: { ...process.env, COPYFILE_DISABLE: "1" }
    });

    const buffer = await fs.readFile(tempArchive);

    const MAX_ARCHIVE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB ceiling
    if (buffer.length > MAX_ARCHIVE_SIZE_BYTES) {
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1);
      throw new Error(
        `Upload payload too large (${sizeMB} MB). Whizan direct upload is intended for source code only (max 50 MB).\n` +
        `Please ensure bulky folders like venv/, datasets, or model weights are added to your .gitignore.`
      );
    }

    return buffer;
  } finally {
    // Clean up temporary archive file
    await fs.rm(tempArchive, { force: true }).catch(() => {});
  }
}
