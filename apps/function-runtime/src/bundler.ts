import * as esbuild from "esbuild";
import crypto from "crypto";
import fs from "fs";
import path from "path";

export interface BundleResult {
  bundlePath: string;
  bundleHash: string;
  bundleSizeBytes: number;
}

export class FunctionBundler {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir =
      baseDir ||
      process.env.FUNCTIONS_BASE_DIR ||
      path.resolve(process.cwd(), "functions-storage");
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Bundles raw code string or an entry file into an optimized, standalone ESM bundle.
   */
  public async bundleCode(
    serviceId: string,
    version: number,
    input: { rawCode?: string; entryFilePath?: string }
  ): Promise<BundleResult> {
    const versionDir = path.join(this.baseDir, serviceId, `v${version}`);
    if (!fs.existsSync(versionDir)) {
      fs.mkdirSync(versionDir, { recursive: true });
    }

    // Ensure directory is recognized as ESM by Node.js
    const pkgJsonPath = path.join(this.baseDir, serviceId, "package.json");
    if (!fs.existsSync(pkgJsonPath)) {
      fs.writeFileSync(pkgJsonPath, JSON.stringify({ type: "module" }, null, 2), "utf8");
    }

    const bundleOutputPath = path.join(versionDir, "bundle.mjs");
    let entryPoint = input.entryFilePath;

    let tempSourceFile: string | null = null;
    if (input.rawCode) {
      tempSourceFile = path.join(versionDir, "source.ts");
      fs.writeFileSync(tempSourceFile, input.rawCode, "utf8");
      entryPoint = tempSourceFile;
    }

    if (!entryPoint || !fs.existsSync(entryPoint)) {
      throw new Error(`ENTRY_POINT_NOT_FOUND: ${entryPoint}`);
    }

    try {
      await esbuild.build({
        entryPoints: [entryPoint],
        bundle: true,
        format: "esm",
        platform: "node",
        target: "es2022",
        outfile: bundleOutputPath,
        minify: true,
        treeShaking: true,
        banner: {
          js: `// Whizan Edge Function v${version}\n`,
        },
        external: [
          "node:*",
          "fs",
          "path",
          "crypto",
          "http",
          "https",
          "url",
          "buffer",
          "stream",
          "util",
          "os",
          "events",
          "net",
          "tls",
          "zlib",
        ],
      });

      const bundleBuffer = fs.readFileSync(bundleOutputPath);
      const bundleHash = crypto.createHash("sha256").update(bundleBuffer).digest("hex");
      const bundleSizeBytes = bundleBuffer.length;

      // Clean up temporary source file if created
      if (tempSourceFile && fs.existsSync(tempSourceFile)) {
        try {
          fs.unlinkSync(tempSourceFile);
        } catch {}
      }

      // Enforce strict disk pruning: keep only latest 3 versions for this service
      this.pruneOldVersions(serviceId, 3);

      return {
        bundlePath: bundleOutputPath,
        bundleHash,
        bundleSizeBytes,
      };
    } catch (err: any) {
      throw new Error(`BUNDLING_FAILED: ${err.message}`);
    }
  }

  /**
   * Prunes older version directories on disk to maintain zero disk bloat.
   */
  public pruneOldVersions(serviceId: string, keepCount = 3): void {
    try {
      const serviceDir = path.join(this.baseDir, serviceId);
      if (!fs.existsSync(serviceDir)) return;

      const entries = fs.readdirSync(serviceDir, { withFileTypes: true });
      const versionDirs = entries
        .filter((e) => e.isDirectory() && e.name.startsWith("v"))
        .map((e) => {
          const vNum = parseInt(e.name.slice(1), 10);
          return { name: e.name, version: isNaN(vNum) ? 0 : vNum };
        })
        .sort((a, b) => b.version - a.version); // descending

      if (versionDirs.length > keepCount) {
        const toDelete = versionDirs.slice(keepCount);
        for (const dir of toDelete) {
          const fullPath = path.join(serviceDir, dir.name);
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      }
    } catch (err: any) {
      console.warn(`[FunctionBundler] Failed to prune old versions for ${serviceId}:`, err.message);
    }
  }
}
