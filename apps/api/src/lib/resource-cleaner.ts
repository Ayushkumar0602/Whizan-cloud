import { redisClient } from "./redis.js";
import { signAdminPayload } from "./auth-utils.js";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "whizan-deployments";

/**
 * Removes archives from Supabase S3 Object Storage if configured
 */
async function purgeSupabaseStoragePrefix(prefixes: string[]): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || prefixes.length === 0) return;
  try {
    const url = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}`;
    await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes }),
    }).catch(() => {});
  } catch (err: any) {
    console.warn("[ResourceCleaner] Supabase storage purge notice:", err.message);
  }
}

/**
 * Publishes a signed command to the VM worker to stop and remove the Docker container.
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
 * Cleans up all Docker containers, disk build/source files, Supabase archives, and edge-router cache for a backend service.
 */
export async function cleanupServiceResources(
  serviceId: string,
  slug: string,
  deploymentIds: string[] = []
): Promise<void> {
  // 1. Clear edge-router routing key
  if (slug) {
    await redisClient.del(`deployment:${slug}`).catch(() => {});
  }

  // 2. Clean Supabase storage objects for this service
  const prefixes = [`services/${serviceId}`];
  for (const dId of deploymentIds) {
    prefixes.push(`services/${serviceId}/${dId}.tar.gz`);
  }
  purgeSupabaseStoragePrefix(prefixes).catch(() => {});

  // 3. Publish signed command to VM build-worker
  const payload = signAdminPayload({
    action: "DELETE_SERVICE",
    serviceId,
    slug,
    deploymentIds,
  });
  await redisClient.publish("admin:commands", JSON.stringify(payload)).catch(() => {});
}

/**
 * Cleans up all Docker containers, disk build/source files, Supabase archives, and edge-router cache for a frontend project.
 */
export async function cleanupProjectResources(
  projectId: string,
  slug: string,
  deploymentIds: string[] = []
): Promise<void> {
  // 1. Clear edge-router routing key
  if (slug) {
    await redisClient.del(`deployment:${slug}`).catch(() => {});
  }

  // 2. Clean Supabase storage objects for this project
  const prefixes = [`projects/${projectId}`];
  for (const dId of deploymentIds) {
    prefixes.push(`projects/${projectId}/${dId}.tar.gz`);
  }
  purgeSupabaseStoragePrefix(prefixes).catch(() => {});

  // 3. Publish signed command to VM build-worker
  const payload = signAdminPayload({
    action: "DELETE_PROJECT",
    projectId,
    slug,
    deploymentIds,
  });
  await redisClient.publish("admin:commands", JSON.stringify(payload)).catch(() => {});
}
