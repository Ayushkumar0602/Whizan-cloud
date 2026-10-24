import { prisma } from "../lib/prisma.js";
import { StorageService } from "../services/storage.service.js";

export class StorageCleanupEngine {
  /**
   * Identifies and marks stale upload reservations as EXPIRED and releases reserved quota bytes safely.
   */
  static async expireStaleReservations(): Promise<{ expiredCount: number }> {
    const now = new Date();
    const staleReservations = await prisma.storageReservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: now },
      },
      take: 200,
    });

    if (staleReservations.length === 0) {
      return { expiredCount: 0 };
    }

    for (const res of staleReservations) {
      await prisma.$transaction(async (tx) => {
        await tx.storageReservation.update({
          where: { id: res.id },
          data: { status: "EXPIRED" },
        });

        const quota = await tx.storageUserQuota.findUnique({
          where: { userId: res.userId },
        });

        if (quota) {
          const newReserved =
            quota.reservedBytes > res.reservedBytes
              ? quota.reservedBytes - res.reservedBytes
              : 0n;

          await tx.storageUserQuota.update({
            where: { userId: res.userId },
            data: { reservedBytes: newReserved },
          });
        }
      });
    }

    return { expiredCount: staleReservations.length };
  }

  /**
   * Purges soft-deleted objects from trash across all buckets where retention period has elapsed.
   */
  static async purgeExpiredTrash(): Promise<{ purgedCount: number }> {
    const buckets = await prisma.storageBucket.findMany({
      where: { trashEnabled: true },
      select: { id: true, userId: true, trashRetentionDays: true },
    });

    let totalPurged = 0;
    for (const bucket of buckets) {
      const res = await StorageService.purgeTrash(
        bucket.id,
        bucket.userId,
        bucket.trashRetentionDays
      ).catch(() => ({ purgedCount: 0 }));

      totalPurged += res.purgedCount;
    }

    return { purgedCount: totalPurged };
  }

  /**
   * Reconciles all active user storage quotas against database reality.
   */
  static async reconcileAllUserQuotas(): Promise<{ reconciledCount: number }> {
    const quotas = await prisma.storageUserQuota.findMany({
      select: { userId: true },
    });

    for (const q of quotas) {
      await StorageService.reconcileQuota(q.userId).catch((err) => {
        console.warn(`[StorageCleanup] Failed to reconcile quota for user ${q.userId}:`, err);
      });
    }

    return { reconciledCount: quotas.length };
  }
}
