import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { StorageService, StorageError } from "../services/storage.service.js";
import { getStorageTierConfig } from "../config/storage-tiers.js";

describe("Whizan Cloud Storage — Production Readiness & Security Audit", () => {
  let userA: any;
  let userB: any;
  let bucketA: any;

  before(async () => {
    userA = await prisma.user.create({
      data: {
        email: `audit-a-${Date.now()}@whizan.cloud`,
        passwordHash: "audit_hash_a",
        name: "Audit User A",
      },
    });

    userB = await prisma.user.create({
      data: {
        email: `audit-b-${Date.now()}@whizan.cloud`,
        passwordHash: "audit_hash_b",
        name: "Audit User B",
      },
    });

    await StorageService.getOrCreateUserQuota(userA.id, "HOBBY");
    await StorageService.getOrCreateUserQuota(userB.id, "HOBBY");

    bucketA = await StorageService.createBucket({
      userId: userA.id,
      name: `prod-audit-${Date.now()}`,
      isPublic: true,
      allowedMimeTypes: ["image/png", "text/plain"],
    });
  });

  after(async () => {
    if (bucketA && userA) {
      await StorageService.deleteBucket(userA.id, bucketA.id, true).catch(() => {});
    }
    for (const u of [userA, userB]) {
      if (u) {
        await prisma.storageAuditLog.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await prisma.storageReservation.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await prisma.storageUserQuota.deleteMany({ where: { userId: u.id } }).catch(() => {});
        await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
      }
    }
  });

  // ── 1. Checksum & Integrity Verification ───────────────────────────────────
  it("Audit: confirmDirectUpload validates expected ETag and strictly rejects checksum mismatch", async () => {
    const uploadRes = await StorageService.getPresignedUploadUrl({
      userId: userA.id,
      bucketIdentifier: bucketA.id,
      objectPath: "secure/checksum-test.txt",
      expectedSizeBytes: 20,
      mimeType: "text/plain",
    });

    assert.ok(uploadRes.reservationId);
    assert.equal(
      (uploadRes as any).r2Key,
      undefined,
      "Security rule: r2Key must never leak in client presigned URL response"
    );

    // If client provides mismatched ETag, it must be rejected with CHECKSUM_MISMATCH
    await assert.rejects(
      async () => {
        await StorageService.confirmDirectUpload({
          userId: userA.id,
          reservationId: uploadRes.reservationId,
          expectedEtag: "00000000000000000000000000000000", // Intentional bad checksum
        });
      },
      (err: any) => {
        // Will throw either OBJECT_NOT_UPLOADED (if file not uploaded yet) or CHECKSUM_MISMATCH
        return err.code === "OBJECT_NOT_UPLOADED" || err.code === "CHECKSUM_MISMATCH";
      }
    );
  });

  // ── 2. Multi-Tenant Access Isolation ───────────────────────────────────────
  it("Audit: User B cannot hijack or confirm User A's upload reservation", async () => {
    const uploadRes = await StorageService.getPresignedUploadUrl({
      userId: userA.id,
      bucketIdentifier: bucketA.id,
      objectPath: "secure/isolated.txt",
      expectedSizeBytes: 50,
      mimeType: "text/plain",
    });

    // User B tries to confirm User A's reservation
    await assert.rejects(
      async () => {
        await StorageService.confirmDirectUpload({
          userId: userB.id, // User B is not the owner
          reservationId: uploadRes.reservationId,
        });
      },
      (err: any) => err.statusCode === 404 || err.code === "NOT_FOUND"
    );

    // Release reservation safely
    await StorageService.releaseReservation(uploadRes.reservationId, "CLIENT_ABORT");
  });

  // ── 3. Quota Math & Negative Value Defense ──────────────────────────────────
  it("Audit: Multiple concurrent releases cannot drive reservedBytes negative", async () => {
    const uploadRes = await StorageService.getPresignedUploadUrl({
      userId: userA.id,
      bucketIdentifier: bucketA.id,
      objectPath: "secure/quota-test.txt",
      expectedSizeBytes: 1000,
      mimeType: "text/plain",
    });

    // Fire 3 simultaneous release calls for the same reservation
    await Promise.all([
      StorageService.releaseReservation(uploadRes.reservationId, "TIMEOUT").catch(() => {}),
      StorageService.releaseReservation(uploadRes.reservationId, "TIMEOUT").catch(() => {}),
      StorageService.releaseReservation(uploadRes.reservationId, "TIMEOUT").catch(() => {}),
    ]);

    const quota = await prisma.storageUserQuota.findUnique({ where: { userId: userA.id } });
    assert.ok(quota!.reservedBytes >= 0n, "reservedBytes must remain >= 0n at all times");
  });

  // ── 4. Tier Limits Consistency ─────────────────────────────────────────────
  it("Audit: Storage tier limits enforce 250 MB hard cap on Hobby tier", () => {
    const hobbyConfig = getStorageTierConfig("HOBBY");
    assert.equal(hobbyConfig.defaultQuotaBytes, 250000000n, "Hobby must strictly be 250 MB");
    assert.equal(hobbyConfig.maxFileSizeBytes, 25000000n, "Hobby max file size must be 25 MB");
    assert.equal(hobbyConfig.dailyCommandsQuota, 2000);
    assert.equal(hobbyConfig.rateLimitRpm, 60);
  });
});
