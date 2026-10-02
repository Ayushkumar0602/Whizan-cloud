// ─── Whizan Cloud CLI — Loopback & Configuration Patcher ─────────────────────

import fs from "fs/promises";
import path from "path";

export interface PatchResult {
  patched: boolean;
  filePath?: string;
  original?: string;
  replacement?: string;
  message: string;
}

/**
 * Searches for and patches 127.0.0.1 / localhost bindings in entry files to 0.0.0.0
 */
export async function patchLoopback(workspaceDir: string): Promise<PatchResult> {
  const root = path.resolve(workspaceDir);
  const entryFiles = [
    "index.ts", "server.ts", "app.ts", "src/index.ts", "src/server.ts", "src/app.ts",
    "index.js", "server.js", "app.js", "src/index.js", "src/server.js", "src/app.js",
    "main.py", "app.py",
  ];

  for (const relPath of entryFiles) {
    const fullPath = path.join(root, relPath);
    try {
      const content = await fs.readFile(fullPath, "utf8");

      // Check JS/TS listen pattern
      const jsMatch = content.match(/(\.listen\s*\([^)]*["'])(?:127\.0\.0\.1|localhost)(["'])/);
      if (jsMatch) {
        const updated = content.replace(
          /(\.listen\s*\([^)]*["'])(?:127\.0\.0\.1|localhost)(["'])/g,
          "$10.0.0.0$2"
        );
        await fs.writeFile(fullPath, updated, "utf8");
        return {
          patched: true,
          filePath: relPath,
          message: `Patched loopback binding in ${relPath} to 0.0.0.0`,
        };
      }

      // Check Python host pattern (e.g. uvicorn.run(..., host="127.0.0.1"))
      const pyMatch = content.match(/(host\s*=\s*["'])(?:127\.0\.0\.1|localhost)(["'])/);
      if (pyMatch) {
        const updated = content.replace(
          /(host\s*=\s*["'])(?:127\.0\.0\.1|localhost)(["'])/g,
          "$10.0.0.0$2"
        );
        await fs.writeFile(fullPath, updated, "utf8");
        return {
          patched: true,
          filePath: relPath,
          message: `Patched Python host binding in ${relPath} to 0.0.0.0`,
        };
      }
    } catch {
      // File does not exist, continue
    }
  }

  return {
    patched: false,
    message: "No loopback trap found or no compatible entry file identified.",
  };
}
