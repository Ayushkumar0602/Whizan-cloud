// ─── Whizan CLI — Cloudflare R2 Storage Management Command ────────────────────

import fs from "fs/promises";
import path from "path";
import { client } from "../core/client.js";
import { colors, Spinner, printError, printKV } from "../utils/terminal-ui.js";

const c = colors;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1000;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export async function storageCommand(args: string[] = []) {
  const sub = args[0]?.toLowerCase();
  const subArgs = args.slice(1);

  switch (sub) {
    // ── Buckets ─────────────────────────────────────────────────────────────
    case "bucket": {
      const action = subArgs[0]?.toLowerCase();
      const actionArgs = subArgs.slice(1);

      if (action === "ls" || action === "list" || !action) {
        const spinner = new Spinner("Fetching storage buckets...").start();
        const buckets = await client.listStorageBuckets().catch((err) => {
          spinner.stop();
          printError(err.message);
          process.exit(1);
        });
        spinner.stop();

        if (!buckets || buckets.length === 0) {
          console.error(`  ${c.dim}No storage buckets created yet. Run 'whizan storage bucket create <name>' to create one.${c.reset}\n`);
          return;
        }

        console.error(`\n  ${c.bold}Whizan Storage Buckets (${buckets.length}):${c.reset}\n`);
        for (const b of buckets) {
          const badge = b.isPublic ? `${c.amber}[PUBLIC]${c.reset}` : `${c.emerald}[PRIVATE]${c.reset}`;
          console.error(`  ${badge} ${c.bold}${b.name}${c.reset} ${c.dim}(${b.id})${c.reset}`);
          console.error(`    ${c.dim}Files:${c.reset} ${b._count?.objects ?? b.fileCount ?? 0}  ${c.dim}Size:${c.reset} ${formatBytes(Number(b.totalBytes || 0))}`);
        }
        console.error("");
        return;
      }

      if (action === "create") {
        const name = actionArgs.find((a) => !a.startsWith("-"));
        if (!name) {
          printError("Usage: whizan storage bucket create <name> [--public] [--desc \"Description\"]");
          process.exit(1);
        }

        const isPublic = actionArgs.includes("--public");
        const descIdx = actionArgs.findIndex((a) => a === "--desc");
        const description = descIdx !== -1 ? actionArgs[descIdx + 1] : undefined;

        const spinner = new Spinner(`Creating bucket '${name}'...`).start();
        const res = await client.createStorageBucket({ name, description, isPublic }).catch((err) => {
          spinner.stop();
          printError(err.message);
          process.exit(1);
        });
        spinner.stop();

        console.error(`\n  ${c.emerald}✔ Bucket '${name}' created successfully!${c.reset}`);
        printKV("Bucket ID", res.bucket.id);
        printKV("Access", res.bucket.isPublic ? "Public" : "Private");
        console.error("");
        return;
      }

      if (action === "rm" || action === "delete") {
        const name = actionArgs.find((a) => !a.startsWith("-"));
        if (!name) {
          printError("Usage: whizan storage bucket rm <bucket-name-or-id> [--force]");
          process.exit(1);
        }
        const force = actionArgs.includes("--force");

        const spinner = new Spinner(`Deleting bucket '${name}'...`).start();
        await client.deleteStorageBucket(name, force).catch((err) => {
          spinner.stop();
          printError(err.message);
          process.exit(1);
        });
        spinner.stop();

        console.error(`\n  ${c.emerald}✔ Bucket '${name}' deleted successfully.${c.reset}\n`);
        return;
      }

      printError(`Unknown bucket action '${action}'. Available: ls, create, rm`);
      break;
    }

    // ── List Objects ────────────────────────────────────────────────────────
    case "ls":
    case "list": {
      const bucket = subArgs[0];
      if (!bucket) {
        // List buckets if no bucket supplied
        return storageCommand(["bucket", "ls"]);
      }

      const prefix = subArgs[1];
      const spinner = new Spinner(`Listing objects in '${bucket}'...`).start();
      const res = await client.listStorageObjects(bucket, prefix).catch((err) => {
        spinner.stop();
        printError(err.message);
        process.exit(1);
      });
      spinner.stop();

      const objects = res.objects || [];
      if (objects.length === 0) {
        console.error(`  ${c.dim}No objects found in bucket '${bucket}'.${c.reset}\n`);
        return;
      }

      console.error(`\n  ${c.bold}Objects in '${bucket}' (${objects.length}):${c.reset}\n`);
      for (const obj of objects) {
        console.error(`  📄 ${c.bold}${obj.name}${c.reset}  ${c.dim}${formatBytes(obj.size)}  ${obj.mimeType}${c.reset}`);
      }
      console.error("");
      break;
    }

    // ── Upload ──────────────────────────────────────────────────────────────
    case "upload": {
      const localPath = subArgs[0];
      const dest = subArgs[1];

      if (!localPath || !dest) {
        printError("Usage: whizan storage upload <local-path> <bucket>/<destination-path>");
        process.exit(1);
      }

      const slashIdx = dest.indexOf("/");
      if (slashIdx === -1) {
        printError("Destination must be in the format: <bucket>/<destination-path>");
        process.exit(1);
      }

      const bucket = dest.slice(0, slashIdx);
      const destPath = dest.slice(slashIdx + 1);

      let fileBuffer: Buffer;
      try {
        fileBuffer = await fs.readFile(path.resolve(localPath));
      } catch (err: any) {
        printError(`Failed to read local file '${localPath}': ${err.message}`);
        process.exit(1);
      }

      const spinner = new Spinner(`Uploading '${localPath}' (${formatBytes(fileBuffer.length)}) to ${dest}...`).start();
      const res = await client.uploadStorageObject(bucket, destPath, fileBuffer).catch((err) => {
        spinner.stop();
        printError(err.message);
        process.exit(1);
      });
      spinner.stop();

      console.error(`\n  ${c.emerald}✔ File uploaded successfully!${c.reset}`);
      printKV("Bucket", bucket);
      printKV("Path", res.object.name);
      printKV("Size", formatBytes(Number(res.object.size)));
      printKV("ETag", res.object.etag || "—");
      console.error("");
      break;
    }

    // ── Download ────────────────────────────────────────────────────────────
    case "download": {
      const src = subArgs[0];
      const localPath = subArgs[1];

      if (!src || !localPath) {
        printError("Usage: whizan storage download <bucket>/<object-path> <local-destination>");
        process.exit(1);
      }

      const slashIdx = src.indexOf("/");
      if (slashIdx === -1) {
        printError("Source object must be in the format: <bucket>/<object-path>");
        process.exit(1);
      }

      const bucket = src.slice(0, slashIdx);
      const objectPath = src.slice(slashIdx + 1);

      const spinner = new Spinner(`Downloading '${src}'...`).start();
      const buffer = await client.downloadStorageObject(bucket, objectPath).catch((err) => {
        spinner.stop();
        printError(err.message);
        process.exit(1);
      });
      spinner.stop();

      const resolvedLocal = path.resolve(localPath);
      await fs.mkdir(path.dirname(resolvedLocal), { recursive: true });
      await fs.writeFile(resolvedLocal, buffer);

      console.error(`\n  ${c.emerald}✔ File downloaded successfully to ${resolvedLocal}!${c.reset} (${formatBytes(buffer.length)})\n`);
      break;
    }

    // ── Delete ──────────────────────────────────────────────────────────────
    case "rm":
    case "delete": {
      const target = subArgs[0];
      if (!target) {
        printError("Usage: whizan storage rm <bucket>/<object-path>");
        process.exit(1);
      }

      const slashIdx = target.indexOf("/");
      if (slashIdx === -1) {
        printError("Target must be in format: <bucket>/<object-path>");
        process.exit(1);
      }

      const bucket = target.slice(0, slashIdx);
      const objectPath = target.slice(slashIdx + 1);

      const spinner = new Spinner(`Deleting '${target}'...`).start();
      await client.deleteStorageObject(bucket, objectPath).catch((err) => {
        spinner.stop();
        printError(err.message);
        process.exit(1);
      });
      spinner.stop();

      console.error(`\n  ${c.emerald}✔ Object '${target}' deleted successfully.${c.reset}\n`);
      break;
    }

    // ── Copy ────────────────────────────────────────────────────────────────
    case "cp":
    case "copy": {
      const src = subArgs[0];
      const dest = subArgs[1];

      if (!src || !dest) {
        printError("Usage: whizan storage cp <src-bucket>/<src-path> <dest-bucket>/<dest-path>");
        process.exit(1);
      }

      const srcSlash = src.indexOf("/");
      const destSlash = dest.indexOf("/");
      if (srcSlash === -1 || destSlash === -1) {
        printError("Paths must be in format <bucket>/<path>");
        process.exit(1);
      }

      const srcBucket = src.slice(0, srcSlash);
      const srcPath = src.slice(srcSlash + 1);
      const destBucket = dest.slice(0, destSlash);
      const destPath = dest.slice(destSlash + 1);

      const spinner = new Spinner(`Copying ${src} -> ${dest}...`).start();
      await client.copyStorageObject(srcBucket, srcPath, destBucket, destPath).catch((err) => {
        spinner.stop();
        printError(err.message);
        process.exit(1);
      });
      spinner.stop();

      console.error(`\n  ${c.emerald}✔ Object copied successfully to ${dest}!${c.reset}\n`);
      break;
    }

    // ── Move ────────────────────────────────────────────────────────────────
    case "mv":
    case "move": {
      const src = subArgs[0];
      const dest = subArgs[1];

      if (!src || !dest) {
        printError("Usage: whizan storage mv <src-bucket>/<src-path> <dest-bucket>/<dest-path>");
        process.exit(1);
      }

      const srcSlash = src.indexOf("/");
      const destSlash = dest.indexOf("/");
      if (srcSlash === -1 || destSlash === -1) {
        printError("Paths must be in format <bucket>/<path>");
        process.exit(1);
      }

      const srcBucket = src.slice(0, srcSlash);
      const srcPath = src.slice(srcSlash + 1);
      const destBucket = dest.slice(0, destSlash);
      const destPath = dest.slice(destSlash + 1);

      const spinner = new Spinner(`Moving ${src} -> ${dest}...`).start();
      await client.moveStorageObject(srcBucket, srcPath, destBucket, destPath).catch((err) => {
        spinner.stop();
        printError(err.message);
        process.exit(1);
      });
      spinner.stop();

      console.error(`\n  ${c.emerald}✔ Object moved successfully to ${dest}!${c.reset}\n`);
      break;
    }

    // ── Bulk Remove ─────────────────────────────────────────────────────────
    case "bulk-rm": {
      const bucket = subArgs[0];
      const prefix = subArgs[1];

      if (!bucket || !prefix) {
        printError("Usage: whizan storage bulk-rm <bucket> <prefix>");
        process.exit(1);
      }

      const spinner = new Spinner(`Finding objects matching '${prefix}' in '${bucket}'...`).start();
      const list = await client.listStorageObjects(bucket, prefix, 100).catch((err) => {
        spinner.stop();
        printError(err.message);
        process.exit(1);
      });

      if (!list.objects || list.objects.length === 0) {
        spinner.stop();
        console.error(`  ${c.dim}No objects found with prefix '${prefix}'.${c.reset}\n`);
        break;
      }

      const paths = list.objects.map((o: any) => o.name);
      spinner.update(`Deleting ${paths.length} objects...`);
      const delRes = await client.bulkDeleteStorageObjects(bucket, paths).catch((err) => {
        spinner.stop();
        printError(err.message);
        process.exit(1);
      });
      spinner.stop();

      console.error(`\n  ${c.emerald}✔ Deleted ${delRes.deletedCount} objects successfully!${c.reset}\n`);
      break;
    }

    // ── Presign URL ─────────────────────────────────────────────────────────
    case "presign": {
      const target = subArgs[0];
      if (!target || !target.includes("/")) {
        printError("Usage: whizan storage presign <bucket>/<path> [--ttl <seconds>]");
        process.exit(1);
      }

      const slashIdx = target.indexOf("/");
      const bucket = target.slice(0, slashIdx);
      const objPath = target.slice(slashIdx + 1);

      const ttlIdx = subArgs.findIndex((a) => a === "--ttl");
      const ttl = ttlIdx !== -1 ? parseInt(subArgs[ttlIdx + 1], 10) : 3600;

      const spinner = new Spinner(`Generating presigned URL for '${target}'...`).start();
      const res = await client.getStoragePresignedDownloadUrl(bucket, objPath, ttl).catch((err) => {
        spinner.stop();
        printError(err.message);
        process.exit(1);
      });
      spinner.stop();

      console.error(`\n  ${c.emerald}✔ Presigned Download URL (valid for ${res.expiresInSeconds}s):${c.reset}\n`);
      console.error(`  ${c.bold}${res.downloadUrl}${c.reset}\n`);
      break;
    }

    // ── Usage ───────────────────────────────────────────────────────────────
    case "usage": {
      const spinner = new Spinner("Fetching storage usage and allocation...").start();
      const res = await client.getStorageUsage().catch((err) => {
        spinner.stop();
        printError(err.message);
        process.exit(1);
      });
      spinner.stop();

      const q = res.quota;
      console.error(`\n  ${c.bold}Whizan Cloud Storage — Quota & Usage${c.reset}\n`);
      printKV("Subscription Plan", `${res.tierDisplayName} (${res.tier})`);
      printKV("Allocated Quota", `${q.allocatedMb} MB (${formatBytes(q.allocatedBytes)})`);
      printKV("Committed Usage", `${q.usedMb} MB (${formatBytes(q.usedBytes)}) [${q.usagePercent}%]`);
      printKV("In-Flight Reserved", `${q.reservedMb} MB (${formatBytes(q.reservedBytes)})`);
      printKV("Available Quota", `${q.availableMb} MB (${formatBytes(q.availableBytes)})`);
      printKV("Stored Objects", String(q.objectsCount));
      printKV("Provider", "Cloudflare R2 (Global Edge CDN)");
      console.error("");
      break;
    }

    // ── Limits ──────────────────────────────────────────────────────────────
    case "limits": {
      const spinner = new Spinner("Fetching tier limits...").start();
      const res = await client.getStorageLimits().catch((err) => {
        spinner.stop();
        printError(err.message);
        process.exit(1);
      });
      spinner.stop();

      console.error(`\n  ${c.bold}Whizan Cloud Storage — Plan Limits (${res.displayName})${c.reset}\n`);
      printKV("Plan Tier", res.tier);
      printKV("Default Quota", formatBytes(res.defaultQuotaBytes));
      printKV("Max Upload Size", formatBytes(res.maxFileSizeBytes));
      printKV("Rate Limit", `${res.rateLimitRpm} req/minute`);
      printKV("Daily Command Quota", `${res.dailyCommandsQuota.toLocaleString()} commands/day`);
      printKV("Max Buckets", String(res.maxBuckets));
      printKV("Max Concurrent Uploads", String(res.maxConcurrentUploads));
      printKV("Presigned URL TTL", `${res.presignedUrlTtlSeconds} seconds`);
      console.error("");
      break;
    }

    default:
      console.error(`
  ${c.bold}Whizan Cloud Storage CLI Commands:${c.reset}

    ${c.whizanCyan}whizan storage usage${c.reset}                          Show 250 MB quota & committed bytes
    ${c.whizanCyan}whizan storage limits${c.reset}                         Display tier command & rate limits
    ${c.whizanCyan}whizan storage bucket ls${c.reset}                      List all storage buckets
    ${c.whizanCyan}whizan storage bucket create <name> [--public]${c.reset} Create a new bucket
    ${c.whizanCyan}whizan storage bucket rm <name> [--force]${c.reset}     Delete a bucket
    ${c.whizanCyan}whizan storage ls <bucket> [prefix]${c.reset}            List objects in a bucket
    ${c.whizanCyan}whizan storage upload <file> <bucket>/<path>${c.reset}   Upload a file
    ${c.whizanCyan}whizan storage download <bucket>/<path> <out>${c.reset} Download an object
    ${c.whizanCyan}whizan storage rm <bucket>/<path>${c.reset}              Delete an object
    ${c.whizanCyan}whizan storage cp <src> <dest>${c.reset}                 Copy an object
    ${c.whizanCyan}whizan storage mv <src> <dest>${c.reset}                 Move an object atomically
    ${c.whizanCyan}whizan storage bulk-rm <bucket> <prefix>${c.reset}       Bulk delete objects matching prefix
    ${c.whizanCyan}whizan storage presign <bucket>/<path>${c.reset}         Generate presigned download URL
`);
      break;
  }
}
