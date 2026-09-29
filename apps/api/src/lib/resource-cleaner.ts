import { redisClient } from "./redis.js";

/**
 * Publishes a command to the VM worker to stop and remove the Docker container.
 */
export async function stopDeploymentContainer(deploymentId: string): Promise<void> {
  await redisClient.publish(
    "admin:commands",
    JSON.stringify({ action: "STOP_CONTAINER", deploymentId })
  ).catch(() => {});
}

/**
 * Publishes a command to the VM worker to delete the build directory and container.
 */
export async function deleteBuildDir(deploymentId: string): Promise<void> {
  await redisClient.publish(
    "admin:commands",
    JSON.stringify({ action: "DELETE_CONTAINER", deploymentId })
  ).catch(() => {});
}

/**
 * Cleans up all Docker containers, disk build/source files, and edge-router cache for a backend service.
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

  // 2. Publish to VM build-worker to stop/remove containers and remove /tmp files
  await redisClient.publish(
    "admin:commands",
    JSON.stringify({
      action: "DELETE_SERVICE",
      serviceId,
      slug,
      deploymentIds,
    })
  ).catch(() => {});
}

/**
 * Cleans up all Docker containers, disk build/source files, and edge-router cache for a frontend project.
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

  // 2. Publish to VM build-worker
  await redisClient.publish(
    "admin:commands",
    JSON.stringify({
      action: "DELETE_PROJECT",
      projectId,
      slug,
      deploymentIds,
    })
  ).catch(() => {});
}
