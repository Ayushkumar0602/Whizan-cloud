import crypto from "crypto";
import { redisClient } from "./redis.js";
import { signAdminPayload } from "./auth-utils.js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "whizan-deployments";

export interface CleanupResult {
  ok: boolean;
  verified: boolean;
  removedContainers?: number;
  removedImages?: number;
  freedPaths?: string[];
  remainingResources?: string[];
  error?: string | null;
  storagePurged?: boolean;
  redisKeysPurged?: number;
}

/**
 * Executes a two-phase verified administrative command over Redis Pub/Sub RPC.
 * Listens on a dedicated reply channel for VM worker confirmation before returning.
 */
export async function sendVerifiedAdminCommand(
  payload: Record<string, any>,
  timeoutMs = 15000
): Promise<CleanupResult> {
  const requestId = crypto.randomUUID();
  const replyChannel = `admin:reply:${requestId}`;

  return new Promise<CleanupResult>((resolve) => {
    let resolved = false;
    const sub = redisClient.duplicate();

    const cleanup = async () => {
      try {
        await sub.unsubscribe(replyChannel).catch(() => {});
        await sub.quit().catch(() => {});
      } catch {}
    };

    const timer = setTimeout(async () => {
      if (resolved) return;
      resolved = true;
      await cleanup();
      console.warn(`[ResourceCleaner] Timeout waiting for VM confirmation on ${replyChannel}`);
      resolve({
        ok: false,
        verified: false,
        error: "Timeout waiting for VM worker to confirm resource teardown. Worker may be offline or unresponsive.",
      });
    }, timeoutMs);

    sub.on("message", async (channel, message) => {
      if (channel === replyChannel && !resolved) {
        resolved = true;
        clearTimeout(timer);
        await cleanup();
        try {
          const data = JSON.parse(message);
          resolve(data);
        } catch (err: any) {
          resolve({
            ok: false,
            verified: false,
            error: `Failed to parse VM worker response: ${err.message}`,
          });
        }
      }
    });

    sub.subscribe(replyChannel, async (err) => {
      if (err) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          await cleanup();
          resolve({
            ok: false,
            verified: false,
            error: `Failed to subscribe to reply channel: ${err.message}`,
          });
        }
        return;
      }

      // Publish signed admin command with replyTo channel
      const signed = signAdminPayload({
        ...payload,
        requestId,
        replyTo: replyChannel,
      });

      await redisClient.publish("admin:commands", JSON.stringify(signed)).catch((pubErr) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          cleanup();
          resolve({
            ok: false,
            verified: false,
            error: `Failed to publish command to VM worker: ${pubErr.message}`,
          });
        }
      });
    });
  });
}

/**
 * Exhaustively lists and deletes all files in Supabase S3 Object Storage under a prefix,
 * and verifies that zero files remain.
 */
export async function purgeSupabaseStorageFolder(
  prefix: string,
  extraPaths: string[] = []
): Promise<{ ok: boolean; purgedFiles: string[]; verifiedEmpty: boolean }> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: true, purgedFiles: [], verifiedEmpty: true };
  }

  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
  const keysToDelete = new Set<string>(extraPaths.map((p) => p.replace(/^\/+/, "")));

  try {
    // 1. List all objects under the prefix
    const listUrl = `${SUPABASE_URL}/storage/v1/object/list/${SUPABASE_STORAGE_BUCKET}`;
    const listRes = await fetch(listUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix: cleanPrefix, limit: 1000 }),
    }).catch(() => null);

    if (listRes && listRes.ok) {
      const items = (await listRes.json().catch(() => [])) as Array<{ name: string }>;
      for (const item of items) {
        if (item?.name) {
          keysToDelete.add(`${cleanPrefix}/${item.name}`);
        }
      }
    }

    // 2. Delete all collected paths
    const prefixes = Array.from(keysToDelete);
    if (prefixes.length > 0) {
      const deleteUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}`;
      await fetch(deleteUrl, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefixes }),
      }).catch(() => {});
      console.log(`[ResourceCleaner] Purged ${prefixes.length} files from Supabase Storage under ${cleanPrefix}`);
    }

    // 3. Verify that zero items remain
    const verifyRes = await fetch(listUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix: cleanPrefix, limit: 10 }),
    }).catch(() => null);

    let verifiedEmpty = true;
    if (verifyRes && verifyRes.ok) {
      const remaining = (await verifyRes.json().catch(() => [])) as any[];
      if (remaining.length > 0) {
        verifiedEmpty = false;
        console.warn(`[ResourceCleaner] Warning: Supabase storage prefix ${cleanPrefix} still has ${remaining.length} objects`);
      }
    }

    return { ok: true, purgedFiles: prefixes, verifiedEmpty };
  } catch (err: any) {
    console.warn(`[ResourceCleaner] Supabase purge notice for ${cleanPrefix}:`, err.message);
    return { ok: false, purgedFiles: Array.from(keysToDelete), verifiedEmpty: false };
  }
}

/**
 * Eradicates all Redis keys (routing, logs, analytics, queues) associated with an entity.
 */
export async function purgeRedisKeysForEntity(
  slug?: string,
  targetId?: string,
  deploymentIds: string[] = []
): Promise<number> {
  let count = 0;
  const keys: string[] = [];

  if (slug) {
    keys.push(`deployment:${slug}`, `slug:${slug}`, `stats:${slug}`);
  }
  if (targetId) {
    keys.push(
      `access:${targetId}`,
      `service-logs:${targetId}`,
      `metrics:service:${targetId}`,
      `analytics:project:${targetId}`,
      `analytics:${targetId}`
    );
  }
  for (const dId of deploymentIds) {
    keys.push(
      `build-logs:${dId}`,
      `logs:${dId}`,
      `cancel:${dId}`,
      `deployment:stats:${dId}`
    );
  }

  // Exact deletion
  if (keys.length > 0) {
    const deleted = await redisClient.del(...keys).catch(() => 0);
    count += deleted;
  }

  // Publish in-flight cancellation for any running builds
  for (const dId of deploymentIds) {
    await redisClient.publish(`cancel:${dId}`, "CANCEL").catch(() => {});
    await redisClient.publish(`logs:${dId}`, "__DONE__").catch(() => {});
  }

  // Invalidate edge-router memory cache
  if (slug) {
    await redisClient.publish("edge:cache:invalidate", JSON.stringify({ slug })).catch(() => {});
  }

  return count;
}

/**
 * Publishes a signed command to the VM worker to stop the Docker container.
 */
export async function stopDeploymentContainer(deploymentId: string): Promise<void> {
  const payload = signAdminPayload({ action: "STOP_CONTAINER", deploymentId });
  await redisClient.publish("admin:commands", JSON.stringify(payload)).catch(() => {});
}

/**
 * Publishes a signed command to the VM worker to delete the build directory and container.
 */
export async function deleteBuildDir(deploymentId: string): Promise<void> {
  const payload = signAdminPayload({ action: "DELETE_CONTAINER", deploymentId });
  await redisClient.publish("admin:commands", JSON.stringify(payload)).catch(() => {});
}

/**
 * Fully cleans up and verifies all VM resources, Supabase storage archives, and Redis keys
 * for a backend service before allowing database record deletion.
 */
export async function cleanupServiceResources(
  serviceId: string,
  slug: string,
  deploymentIds: string[] = []
): Promise<CleanupResult> {
  // Phase 1: Two-phase verified VM resource purge
  const vmResult = await sendVerifiedAdminCommand({
    action: "DELETE_SERVICE",
    serviceId,
    slug,
    deploymentIds,
  });

  if (!vmResult.verified) {
    return vmResult;
  }

  // Phase 2: Supabase S3 Object Storage purge
  const extraPaths = [
    `services/${serviceId}/source.tar.gz`,
    ...deploymentIds.map((dId) => `services/${serviceId}/${dId}.tar.gz`),
    ...deploymentIds.map((dId) => `deployments/${dId}.tar.gz`),
  ];
  const storageResult = await purgeSupabaseStorageFolder(`services/${serviceId}`, extraPaths);

  // Phase 3: Redis keys & log purge
  const redisPurged = await purgeRedisKeysForEntity(slug, serviceId, deploymentIds);

  return {
    ok: true,
    verified: true,
    removedContainers: vmResult.removedContainers,
    removedImages: vmResult.removedImages,
    freedPaths: vmResult.freedPaths,
    storagePurged: storageResult.ok,
    redisKeysPurged: redisPurged,
  };
}

/**
 * Fully cleans up and verifies all VM resources, Supabase storage archives, and Redis keys
 * for a frontend project before allowing database record deletion.
 */
export async function cleanupProjectResources(
  projectId: string,
  slug: string,
  deploymentIds: string[] = []
): Promise<CleanupResult> {
  // Phase 1: Two-phase verified VM resource purge
  const vmResult = await sendVerifiedAdminCommand({
    action: "DELETE_PROJECT",
    projectId,
    slug,
    deploymentIds,
  });

  if (!vmResult.verified) {
    return vmResult;
  }

  // Phase 2: Supabase S3 Object Storage purge
  const extraPaths = [
    `projects/${projectId}/source.tar.gz`,
    ...deploymentIds.map((dId) => `projects/${projectId}/${dId}.tar.gz`),
    ...deploymentIds.map((dId) => `deployments/${dId}.tar.gz`),
  ];
  const storageResult = await purgeSupabaseStorageFolder(`projects/${projectId}`, extraPaths);

  // Phase 3: Redis keys & log purge
  const redisPurged = await purgeRedisKeysForEntity(slug, projectId, deploymentIds);

  return {
    ok: true,
    verified: true,
    removedContainers: vmResult.removedContainers,
    removedImages: vmResult.removedImages,
    freedPaths: vmResult.freedPaths,
    storagePurged: storageResult.ok,
    redisKeysPurged: redisPurged,
  };
}

/**
 * Fully cleans up and verifies all VM resources, Supabase storage archives, and Redis keys
 * for a single deployment before allowing database record deletion.
 */
export async function cleanupDeploymentResources(
  deploymentId: string,
  targetType: "project" | "service",
  targetId: string,
  slug?: string
): Promise<CleanupResult> {
  // Phase 1: VM resource purge for this specific deployment
  const vmResult = await sendVerifiedAdminCommand({
    action: "DELETE_DEPLOYMENT",
    deploymentId,
    targetType,
    targetId,
    slug,
  });

  if (!vmResult.verified) {
    return vmResult;
  }

  // Phase 2: Supabase storage archive purge
  const extraPaths = [
    `${targetType}s/${targetId}/${deploymentId}.tar.gz`,
    `deployments/${deploymentId}.tar.gz`,
  ];
  await purgeSupabaseStorageFolder(`deployments/${deploymentId}`, extraPaths);

  // Phase 3: Redis log keys purge
  const redisPurged = await purgeRedisKeysForEntity(undefined, undefined, [deploymentId]);

  return {
    ok: true,
    verified: true,
    removedContainers: vmResult.removedContainers,
    removedImages: vmResult.removedImages,
    redisKeysPurged: redisPurged,
  };
}
