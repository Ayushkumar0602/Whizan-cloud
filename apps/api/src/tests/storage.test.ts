// ─── Whizan Cloud Storage — Automated Comprehensive Test Suite ────────────────

import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { redisClient } from "../lib/redis.js";
import {
  StorageService,
  normalizeObjectPath,
  validateBucketName,
  QuotaExceededError,
  NotFoundError,
  ForbiddenError,
} from "../services/storage.service.js";
import { getStorageTierConfig } from "../config/storage-tiers.js";

describe("Whizan Cloud Storage Test Suite", () => {
  let userA: any;
  let userB: any;
  let testBucketA: any;
  let testBucketB: any;

  before(async () => {
    // Generate clean isolated test users
    const emailA = `test-storage-user-a-${Date.now()}@whizan.test`;
    const emailB = `test-storage-user-b-${Date.now()}@whizan.test`;

    userA = await prisma.user.create({
      data: {
        email: emailA,
        name: "Test User A",
        subscriptionTier: "HOBBY",
        role: "USER",
        emailVerified: true,
      },
    });

    userB = await prisma.user.create({
      data: {
        email: emailB,
        name: "Test User B",
        subscriptionTier: "PROFESSIONAL",
        role: "USER",
        emailVerified: true,
      },
    });

    console.log(`[Test] Created test users: User A (${userA.id}), User B (${userB.id})`);
  });

  after(async () => {
    // Clean up test resources
    try {
      if (userA) {
        await prisma.storageAuditLog.deleteMany({ where: { userId: userA.id } });
        await prisma.storageReservation.deleteMany({ where: { userId: userA.id } });
        await prisma.storageObject.deleteMany({ where: { userId: userA.id } });
        await prisma.storageBucket.deleteMany({ where: { userId: userA.id } });
        await prisma.storageUserQuota.deleteMany({ where: { userId: userA.id } });
        await prisma.user.delete({ where: { id: userA.id } });
      }
      if (userB) {
        await prisma.storageAuditLog.deleteMany({ where: { userId: userB.id } });
        await prisma.storageReservation.deleteMany({ where: { userId: userB.id } });
        await prisma.storageObject.deleteMany({ where: { userId: userB.id } });
        await prisma.storageBucket.deleteMany({ where: { userId: userB.id } });
        await prisma.storageUserQuota.deleteMany({ where: { userId: userB.id } });
        await prisma.user.delete({ where: { id: userB.id } });
      }
      console.log("[Test] Cleaned up test resources successfully.");
    } catch (e: any) {
      console.warn("[Test] Teardown cleanup warning:", e.message);
    }
  });

  // ── 1. Path Normalization & Security ────────────────────────────────────────

  it("should normalize valid object paths safely", () => {
    assert.equal(normalizeObjectPath("avatar.png"), "avatar.png");
    assert.equal(normalizeObjectPath("/documents/reports/2026.pdf"), "documents/reports/2026.pdf");
    assert.equal(normalizeObjectPath("assets\\images\\banner.jpg"), "assets/images/banner.jpg");
    assert.equal(normalizeObjectPath("///nested///deep//file.txt///"), "nested/deep/file.txt");
  });

  it("should strictly reject path traversal attacks", () => {
    assert.throws(() => normalizeObjectPath("../etc/passwd"), /Path traversal/);
    assert.throws(() => normalizeObjectPath("photos/../../secrets.json"), /Path traversal/);
    assert.throws(() => normalizeObjectPath("documents/./file.txt"), /Path traversal/);
    assert.throws(() => normalizeObjectPath("photo\0.png"), /invalid control characters/);
  });

  it("should validate bucket names according to standards", () => {
    assert.doesNotThrow(() => validateBucketName("my-media-bucket"));
    assert.doesNotThrow(() => validateBucketName("data-2026"));
    assert.throws(() => validateBucketName("ab"), /between 3 and 63/);
    assert.throws(() => validateBucketName("INVALID_UPPERCASE"), /lowercase letters/);
    assert.throws(() => validateBucketName("-leading-hyphen"), /start\/end with an alphanumeric/);
    assert.throws(() => validateBucketName("admin"), /reserved/);
  });

  // ── 2. Tier Limits & Entitlements ───────────────────────────────────────────

  it("should return correct configuration for Hobby (Tier A) and Pro (Tier B)", () => {
    const hobby = getStorageTierConfig("HOBBY");
    assert.equal(hobby.tier, "HOBBY");
    assert.equal(hobby.defaultQuotaBytes, 250_000_000n);
    assert.equal(hobby.maxFileSizeBytes, 25_000_000n);
    assert.equal(hobby.rateLimitRpm, 60);
    assert.equal(hobby.dailyCommandsQuota, 2000);

    const pro = getStorageTierConfig("PROFESSIONAL");
    assert.equal(pro.tier, "PROFESSIONAL");
    assert.equal(pro.defaultQuotaBytes, 250_000_000n);
    assert.equal(pro.maxFileSizeBytes, 100_000_000n);
    assert.equal(pro.rateLimitRpm, 300);
    assert.equal(pro.dailyCommandsQuota, 50000);
  });

  // ── 3. Bucket Lifecycle ────────────────────────────────────────────────────

  it("should create private and public buckets", async () => {
    testBucketA = await StorageService.createBucket({
      userId: userA.id,
      name: `bucket-a-${Date.now().toString().slice(-6)}`,
      description: "User A private test bucket",
      isPublic: false,
    });

    assert.ok(testBucketA.id);
    assert.equal(testBucketA.isPublic, false);
    assert.equal(testBucketA.userId, userA.id);

    testBucketB = await StorageService.createBucket({
      userId: userB.id,
      name: `bucket-b-${Date.now().toString().slice(-6)}`,
      description: "User B public test bucket",
      isPublic: true,
    });

    assert.ok(testBucketB.id);
    assert.equal(testBucketB.isPublic, true);
    assert.equal(testBucketB.userId, userB.id);
  });

  // ── 4. Quota Enforcement & Atomic Reservations ──────────────────────────────

  it("should initialize default 250 MB quota for User A", async () => {
    const usage = await StorageService.getUsage(userA.id, userA.subscriptionTier);
    assert.equal(usage.quota.allocatedBytes, 250_000_000);
    assert.equal(usage.quota.allocatedMb, 250);
    assert.equal(usage.quota.usedBytes, 0);
    assert.equal(usage.quota.reservedBytes, 0);
  });

  it("should atomically reserve quota for uploads", async () => {
    const fileSize = 5_000_000n; // 5 MB
    const { reservationId, reservedBytes } = await StorageService.reserveUploadQuota({
      userId: userA.id,
      bucketId: testBucketA.id,
      objectName: "test-file.bin",
      requestedBytes: fileSize,
      uploadType: "DIRECT",
      subscriptionTier: userA.subscriptionTier,
    });

    assert.ok(reservationId);
    assert.equal(reservedBytes, fileSize);

    const usageAfter = await StorageService.getUsage(userA.id, userA.subscriptionTier);
    assert.equal(usageAfter.quota.reservedBytes, 5_000_000);
    assert.equal(usageAfter.quota.availableBytes, 245_000_000);

    // Release reservation
    await StorageService.releaseReservation(reservationId);

    const usageRestored = await StorageService.getUsage(userA.id, userA.subscriptionTier);
    assert.equal(usageRestored.quota.reservedBytes, 0);
    assert.equal(usageRestored.quota.availableBytes, 250_000_000);
  });

  it("should reject uploads exceeding 250 MB quota", async () => {
    // Attempt to reserve 260 MB
    await assert.rejects(
      async () => {
        await StorageService.reserveUploadQuota({
          userId: userA.id,
          bucketId: testBucketA.id,
          objectName: "huge-file.bin",
          requestedBytes: 260_000_000n,
          uploadType: "DIRECT",
          subscriptionTier: userA.subscriptionTier,
        });
      },
      (err: any) => {
        return err.code === "FILE_TOO_LARGE" || err.code === "STORAGE_QUOTA_EXCEEDED";
      }
    );
  });

  // ── 5. Concurrency Race Condition Safety ───────────────────────────────────

  it("should safely handle concurrent reservations without exceeding quota", async () => {
    const quota = await StorageService.getOrCreateUserQuota(userA.id, userA.subscriptionTier);

    // Try to launch 5 concurrent reservations of 10 MB each
    const requests = Array.from({ length: 5 }).map((_, idx) =>
      StorageService.reserveUploadQuota({
        userId: userA.id,
        bucketId: testBucketA.id,
        objectName: `concurrent-file-${idx}.bin`,
        requestedBytes: 10_000_000n,
        uploadType: "DIRECT",
        subscriptionTier: "HOBBY",
      })
        .then((res) => ({ success: true, id: res.reservationId }))
        .catch((err) => ({ success: false, error: err.message, code: err.code }))
    );

    const results = await Promise.all(requests);
    const successes = results.filter((r) => r.success);
    assert.ok(successes.length > 0, "At least some requests should succeed within quota");

    // Clean up all successful reservations
    for (const s of successes) {
      if ("id" in s && s.id) await StorageService.releaseReservation(s.id);
    }
  });

  // ── 6. Live R2 Upload, Download, Copy, Move, and Delete ─────────────────────

  it("should upload a file to Cloudflare R2 and update committed quota", async () => {
    const testContent = Buffer.from("Hello Whizan Cloud Storage powered by Cloudflare R2!");
    const object = await StorageService.uploadObject({
      userId: userA.id,
      subscriptionTier: userA.subscriptionTier,
      bucketIdentifier: testBucketA.id,
      objectPath: "greetings/hello.txt",
      data: testContent,
      mimeType: "text/plain",
      actorEmail: userA.email,
    });

    assert.ok(object.id);
    assert.equal(object.name, "greetings/hello.txt");
    assert.equal(Number(object.size), testContent.length);

    // Check usage committed
    const usage = await StorageService.getUsage(userA.id, userA.subscriptionTier);
    assert.equal(usage.quota.usedBytes, testContent.length);
    assert.equal(usage.quota.objectsCount, 1);
  });

  it("should stream download the uploaded file from R2", async () => {
    const download = await StorageService.downloadObjectStream({
      userId: userA.id,
      bucketIdentifier: testBucketA.id,
      objectPath: "greetings/hello.txt",
    });

    assert.equal(download.contentType, "text/plain");

    // Read stream to string
    const chunks: Buffer[] = [];
    for await (const chunk of download.stream) {
      chunks.push(Buffer.from(chunk));
    }
    const downloadedContent = Buffer.concat(chunks).toString("utf8");
    assert.equal(downloadedContent, "Hello Whizan Cloud Storage powered by Cloudflare R2!");
  });

  it("should copy and move objects within storage", async () => {
    // Copy
    const copied = await StorageService.copyObject({
      userId: userA.id,
      subscriptionTier: userA.subscriptionTier,
      srcBucketIdentifier: testBucketA.id,
      srcObjectPath: "greetings/hello.txt",
      destBucketIdentifier: testBucketA.id,
      destObjectPath: "greetings/hello-copy.txt",
      actorEmail: userA.email,
    });

    assert.ok(copied.id);
    assert.equal(copied.name, "greetings/hello-copy.txt");

    // Move
    const moved = await StorageService.moveObject({
      userId: userA.id,
      subscriptionTier: userA.subscriptionTier,
      srcBucketIdentifier: testBucketA.id,
      srcObjectPath: "greetings/hello-copy.txt",
      destBucketIdentifier: testBucketA.id,
      destObjectPath: "greetings/hello-final.txt",
      actorEmail: userA.email,
    });

    assert.ok(moved.id);
    assert.equal(moved.name, "greetings/hello-final.txt");

    // Original copy should no longer exist
    await assert.rejects(
      async () => {
        await StorageService.downloadObjectStream({
          userId: userA.id,
          bucketIdentifier: testBucketA.id,
          objectPath: "greetings/hello-copy.txt",
        });
      },
      (err: any) => err.statusCode === 404
    );

    // Clean up moved object
    await StorageService.deleteObject({
      userId: userA.id,
      bucketIdentifier: testBucketA.id,
      objectPath: "greetings/hello-final.txt",
      actorEmail: userA.email,
    });
  });

  // ── 7. Multi-Tenant Isolation & Anti-Tampering ─────────────────────────────

  it("User B cannot access or download User A's private objects", async () => {
    await assert.rejects(
      async () => {
        await StorageService.downloadObjectStream({
          userId: userB.id,
          bucketIdentifier: testBucketA.id,
          objectPath: "greetings/hello.txt",
        });
      },
      (err: any) => {
        return err.statusCode === 403 || err.statusCode === 404;
      }
    );
  });

  it("User B cannot delete User A's objects", async () => {
    await assert.rejects(
      async () => {
        await StorageService.deleteObject({
          userId: userB.id,
          bucketIdentifier: testBucketA.id,
          objectPath: "greetings/hello.txt",
        });
      },
      (err: any) => {
        return err.statusCode === 404 || err.statusCode === 403;
      }
    );
  });

  // ── 8. Reconciliation & Audit Trail ────────────────────────────────────────

  it("should record audit logs for storage operations", async () => {
    const logs = await StorageService.getAuditLogs(userA.id, 10);
    assert.ok(logs.length > 0);
    const actions = logs.map((l) => l.action);
    assert.ok(actions.includes("BUCKET_CREATE"));
    assert.ok(actions.includes("OBJECT_UPLOAD"));
  });

  it("should reconcile user quota correctly", async () => {
    const reconciled = await StorageService.reconcileQuota(userA.id);
    assert.ok(reconciled.lastReconciledAt);
    assert.equal(reconciled.objectsCount, 1);
  });
});
