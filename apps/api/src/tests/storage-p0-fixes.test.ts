// ─── Whizan Cloud Storage — TDD Suite: P0 & P1 Fixes + Parity Features ───────

import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { redisClient } from "../lib/redis.js";
import {
  StorageService,
  NotFoundError,
  StorageError,
} from "../services/storage.service.js";

describe("Whizan Cloud Storage — P0/P1 Fixes & Batch Parity Suite", () => {
  let user: any;
  let bucketA: any;
  let bucketB: any;

  before(async () => {
    const timestamp = Date.now();
    user = await prisma.user.create({
      data: {
        email: `test-p0-user-${timestamp}@whizan.test`,
        name: "Test P0 User",
        subscriptionTier: "HOBBY",
        role: "USER",
        emailVerified: true,
      },
    });

    await StorageService.getOrCreateUserQuota(user.id, user.subscriptionTier);

    bucketA = await StorageService.createBucket({
      userId: user.id,
      name: `p0-bucket-a-${timestamp}`,
      isPublic: false,
    });

    bucketB = await StorageService.createBucket({
      userId: user.id,
      name: `p0-bucket-b-${timestamp}`,
      isPublic: false,
    });
  });

  after(async () => {
    try {
      if (user) {
        await prisma.storageAuditLog.deleteMany({ where: { userId: user.id } });
        await prisma.storageReservation.deleteMany({ where: { userId: user.id } });
        await prisma.storageObject.deleteMany({ where: { userId: user.id } });
        await prisma.storageBucket.deleteMany({ where: { userId: user.id } });
        await prisma.storageUserQuota.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
      await prisma.$disconnect();
      redisClient.disconnect();
    } catch (e: any) {
      console.warn("[TDD Test] Teardown warning:", e.message);
    }
  });

  // ── FIX #5: Presigned upload response must NOT leak internal r2Key ─────────
  it("P0: getPresignedUploadUrl must not leak internal r2Key to clients", async () => {
    const presigned = await StorageService.createPresignedUploadUrl({
      userId: user.id,
      bucketIdentifier: bucketA.id,
      objectPath: "secure/document.pdf",
      expectedSizeBytes: 1024n,
      mimeType: "application/pdf",
    });

    assert.ok(presigned.uploadUrl, "Expected uploadUrl to be returned");
    assert.ok(presigned.reservationId, "Expected reservationId to be returned");
    assert.equal(presigned.objectName, "secure/document.pdf");
    // CRITICAL: r2Key must be undefined / omitted
    assert.equal(
      (presigned as any).r2Key,
      undefined,
      "Security leak: r2Key must NOT be exposed in presigned upload response!"
    );

    // Clean up reservation
    await StorageService.releaseReservation(presigned.reservationId);
  });

  // ── FIX #7: reservedBytes must never go negative ───────────────────────────
  it("P0: reservedBytes must never go negative upon release or decrement", async () => {
    // Check initial quota
    const initialQuota = await prisma.storageUserQuota.findUnique({
      where: { userId: user.id },
    });
    assert.ok(initialQuota);

    // Reserve 5000 bytes
    const res1 = await StorageService.reserveUploadQuota({
      userId: user.id,
      bucketId: bucketA.id,
      objectName: "test-quota-neg.bin",
      requestedBytes: 5000n,
      uploadType: "DIRECT",
    });

    // Manually force quota reservedBytes to 1000n to simulate discrepancy/race
    await prisma.storageUserQuota.update({
      where: { userId: user.id },
      data: { reservedBytes: 1000n },
    });

    // Releasing the 5000n reservation should clamp reservedBytes to 0n, NOT -4000n
    await StorageService.releaseReservation(res1.reservationId);

    const updatedQuota = await prisma.storageUserQuota.findUnique({
      where: { userId: user.id },
    });
    assert.ok(updatedQuota);
    assert.ok(
      updatedQuota.reservedBytes >= 0n,
      `reservedBytes must be >= 0n, but got ${updatedQuota.reservedBytes}`
    );
    assert.equal(updatedQuota.reservedBytes, 0n);
  });

  // ── FIX #11: listObjects must combine prefix AND search ───────────────────
  it("P1: listObjects must combine prefix and search instead of overwriting", async () => {
    // Upload test objects in bucketA
    const file1 = Buffer.from("Invoice 2026 January");
    const file2 = Buffer.from("Invoice 2026 February");
    const file3 = Buffer.from("Receipt 2026 January");
    const file4 = Buffer.from("Other document");

    await StorageService.uploadObject({
      userId: user.id,
      bucketIdentifier: bucketA.id,
      objectPath: "finance/invoices/inv-01.txt",
      data: file1,
      mimeType: "text/plain",
    });

    await StorageService.uploadObject({
      userId: user.id,
      bucketIdentifier: bucketA.id,
      objectPath: "finance/invoices/inv-02.txt",
      data: file2,
      mimeType: "text/plain",
    });

    await StorageService.uploadObject({
      userId: user.id,
      bucketIdentifier: bucketA.id,
      objectPath: "finance/receipts/rec-01.txt",
      data: file3,
      mimeType: "text/plain",
    });

    await StorageService.uploadObject({
      userId: user.id,
      bucketIdentifier: bucketA.id,
      objectPath: "misc/other.txt",
      data: file4,
      mimeType: "text/plain",
    });

    // Test 1: Query with prefix only
    const prefixOnly = await StorageService.listObjects({
      userId: user.id,
      bucketIdentifier: bucketA.id,
      prefix: "finance/",
    });
    assert.equal(prefixOnly.objects.length, 3);

    // Test 2: Query with search only
    const searchOnly = await StorageService.listObjects({
      userId: user.id,
      bucketIdentifier: bucketA.id,
      search: "inv",
    });
    assert.equal(searchOnly.objects.length, 2);

    // Test 3: Query with BOTH prefix and search
    // Must find only objects with prefix "finance/" that ALSO match search "inv"
    const prefixAndSearch = await StorageService.listObjects({
      userId: user.id,
      bucketIdentifier: bucketA.id,
      prefix: "finance/invoices/",
      search: "02",
    });
    assert.equal(
      prefixAndSearch.objects.length,
      1,
      "Expected exactly 1 object matching prefix AND search"
    );
    assert.equal(prefixAndSearch.objects[0].name, "finance/invoices/inv-02.txt");
  });

  // ── FIX: Folder listing with delimiter ─────────────────────────────────────
  it("Parity: listObjects with delimiter=/ should return commonPrefixes (folders)", async () => {
    const listing = await StorageService.listObjects({
      userId: user.id,
      bucketIdentifier: bucketA.id,
      delimiter: "/",
    });

    assert.ok(Array.isArray(listing.commonPrefixes), "Expected commonPrefixes array");
    assert.ok(listing.commonPrefixes.includes("finance/"));
    assert.ok(listing.commonPrefixes.includes("misc/"));
  });

  // ── Bulk Delete ────────────────────────────────────────────────────────────
  it("Parity: bulkDeleteObjects removes multiple files atomically and updates quota", async () => {
    const usageBefore = await StorageService.getUsage(user.id);

    const result = await StorageService.bulkDeleteObjects({
      userId: user.id,
      bucketIdentifier: bucketA.id,
      paths: ["finance/invoices/inv-01.txt", "finance/invoices/inv-02.txt"],
    });

    assert.equal(result.deletedCount, 2);

    const usageAfter = await StorageService.getUsage(user.id);
    assert.equal(
      usageAfter.quota.objectsCount,
      usageBefore.quota.objectsCount - 2
    );

    // Verify they no longer exist
    const check = await StorageService.listObjects({
      userId: user.id,
      bucketIdentifier: bucketA.id,
      prefix: "finance/invoices/",
    });
    assert.equal(check.objects.length, 0);
  });

  // ── Object Metadata Update & Retrieval ────────────────────────────────────
  it("Parity: updateObjectMetadata and getObjectMetadata works seamlessly", async () => {
    const updated = await StorageService.updateObjectMetadata({
      userId: user.id,
      bucketIdentifier: bucketA.id,
      path: "misc/other.txt",
      cacheControl: "public, max-age=86400",
      contentDisposition: "attachment; filename=\"custom.txt\"",
      metadata: { author: "Whizan Dev", category: "reports" },
    });

    assert.equal(updated.cacheControl, "public, max-age=86400");
    assert.equal(updated.contentDisposition, "attachment; filename=\"custom.txt\"");
    assert.deepEqual((updated.metadata as any)?.author, "Whizan Dev");

    const fetched = await StorageService.getObjectMetadata({
      userId: user.id,
      bucketIdentifier: bucketA.id,
      path: "misc/other.txt",
    });

    assert.equal(fetched.name, "misc/other.txt");
    assert.equal(fetched.cacheControl, "public, max-age=86400");
  });

  // ── Paginated deleteBucket ────────────────────────────────────────────────
  it("P1: deleteBucket with force=true correctly cleans up all objects without OOM", async () => {
    // Add multiple objects to bucketB
    for (let i = 0; i < 5; i++) {
      await StorageService.uploadObject({
        userId: user.id,
        bucketIdentifier: bucketB.id,
        objectPath: `batch/file-${i}.txt`,
        data: Buffer.from(`Sample test file #${i}`),
        mimeType: "text/plain",
      });
    }

    const res = await StorageService.deleteBucket(user.id, bucketB.id, true);
    assert.ok(res.success);

    // Verify bucket no longer exists
    await assert.rejects(
      async () => {
        await StorageService.getBucket(user.id, bucketB.id);
      },
      (err: any) => err.statusCode === 404
    );
  });
});
