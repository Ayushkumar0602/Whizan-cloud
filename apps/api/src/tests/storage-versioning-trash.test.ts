// ─── Whizan Cloud Storage — TDD Suite: Phase 4 (Versioning & Trash) ───────────

import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import {
  StorageService,
  NotFoundError,
  StorageError,
} from "../services/storage.service.js";

describe("Whizan Cloud Storage — Phase 4: Object Versioning & Soft Delete / Trash", () => {
  let user: any;
  let versionedBucket: any;
  let trashBucket: any;

  before(async () => {
    const timestamp = Date.now();
    user = await prisma.user.create({
      data: {
        email: `test-phase4-user-${timestamp}@whizan.test`,
        name: "Phase 4 User",
        subscriptionTier: "PROFESSIONAL",
        role: "USER",
        emailVerified: true,
      },
    });

    await StorageService.getOrCreateUserQuota(user.id, user.subscriptionTier);

    versionedBucket = await StorageService.createBucket({
      userId: user.id,
      name: `ver-bucket-${timestamp}`,
      isPublic: false,
    });

    await (StorageService as any).updateBucket(versionedBucket.id, user.id, {
      versioningEnabled: true,
    });

    trashBucket = await StorageService.createBucket({
      userId: user.id,
      name: `trash-bucket-${timestamp}`,
      isPublic: false,
    });

    await (StorageService as any).updateBucket(trashBucket.id, user.id, {
      trashEnabled: true,
      trashRetentionDays: 30,
    });
  });

  after(async () => {
    try {
      if (user) {
        await prisma.storageObjectVersion.deleteMany({});
        await prisma.storageAuditLog.deleteMany({ where: { userId: user.id } });
        await prisma.storageReservation.deleteMany({ where: { userId: user.id } });
        await prisma.storageObject.deleteMany({ where: { userId: user.id } });
        await prisma.storageBucket.deleteMany({ where: { userId: user.id } });
        await prisma.storageUserQuota.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    } catch (e) {
      console.warn("Cleanup error in phase 4 tests:", e);
    }
  });

  // ─── Test 1: Object Versioning & History ──────────────────────────────────
  it("Phase 4.1: Overwriting an object in a versioned bucket archives historical versions", async () => {
    const objectPath = "notes/versioned-doc.txt";

    // 1. Initial Upload (v1)
    const res1 = await StorageService.createPresignedUploadUrl({
      userId: user.id,
      bucketIdentifier: versionedBucket.id,
      objectPath,
      expectedSizeBytes: 100n,
    });

    const obj1 = await StorageService.commitUpload({
      reservationId: res1.reservationId,
      actualBytes: 100n,
      mimeType: "text/plain",
      etag: "etag-v1",
    });

    assert.equal(obj1.name, objectPath);

    // 2. Overwrite Upload (v2)
    const res2 = await StorageService.createPresignedUploadUrl({
      userId: user.id,
      bucketIdentifier: versionedBucket.id,
      objectPath,
      expectedSizeBytes: 200n,
    });

    const obj2 = await StorageService.commitUpload({
      reservationId: res2.reservationId,
      actualBytes: 200n,
      mimeType: "text/plain",
      etag: "etag-v2",
    });

    assert.equal(obj2.name, objectPath);
    assert.equal(Number(obj2.size), 200);

    // 3. List Versions
    const versions = await (StorageService as any).listObjectVersions(
      versionedBucket.id,
      objectPath,
      user.id
    );

    assert.ok(versions.length >= 1, "Should have archived at least 1 previous version");
    const archivedV1 = versions.find((v: any) => v.etag === "etag-v1");
    assert.ok(archivedV1, "Archived version with etag-v1 must exist");
    assert.equal(Number(archivedV1.size), 100);
  });

  // ─── Test 2: Restore Historical Version ────────────────────────────────────
  it("Phase 4.2: Historical version can be restored as current active object", async () => {
    const objectPath = "notes/versioned-doc.txt";

    const versions = await (StorageService as any).listObjectVersions(
      versionedBucket.id,
      objectPath,
      user.id
    );
    assert.ok(versions.length >= 1);
    const targetVersion = versions[0];

    const restored = await (StorageService as any).restoreObjectVersion(
      versionedBucket.id,
      objectPath,
      targetVersion.version,
      user.id
    );

    assert.equal(restored.name, objectPath);
    assert.equal(restored.etag, targetVersion.etag);
    assert.equal(Number(restored.size), Number(targetVersion.size));
  });

  // ─── Test 3: Soft Delete / Trash Lifecycle ─────────────────────────────────
  it("Phase 4.3: Soft delete marks object in trash and restoreFromTrash recovers it", async () => {
    const objectPath = "documents/annual-report.pdf";

    // 1. Upload Object
    const res = await StorageService.createPresignedUploadUrl({
      userId: user.id,
      bucketIdentifier: trashBucket.id,
      objectPath,
      expectedSizeBytes: 500n,
    });

    await StorageService.commitUpload({
      reservationId: res.reservationId,
      actualBytes: 500n,
      mimeType: "application/pdf",
      etag: "etag-report",
    });

    // 2. Soft delete (move to trash)
    await (StorageService as any).deleteObject({
      userId: user.id,
      bucketIdentifier: trashBucket.id,
      objectPath,
      moveToTrash: true,
    });

    // 3. Verify regular listObjects hides soft-deleted items
    const normalList = await StorageService.listObjects({
      userId: user.id,
      bucketIdentifier: trashBucket.id,
    });
    const foundNormal = normalList.objects.find((o: any) => o.name === objectPath);
    assert.equal(foundNormal, undefined, "Soft-deleted object must not appear in active listings");

    // 4. Verify listTrash returns soft-deleted items
    const trashList = await (StorageService as any).listTrash(trashBucket.id, user.id);
    const foundTrash = trashList.find((o: any) => o.name === objectPath);
    assert.ok(foundTrash, "Object must appear in trash listings");
    assert.ok(foundTrash.deletedAt);

    // 5. Restore from trash
    const restored = await (StorageService as any).restoreFromTrash(
      trashBucket.id,
      objectPath,
      user.id
    );
    assert.equal(restored.name, objectPath);
    assert.equal(restored.deletedAt, null);

    // 6. Verify object is back in normal list
    const finalList = await StorageService.listObjects({
      userId: user.id,
      bucketIdentifier: trashBucket.id,
    });
    const foundFinal = finalList.objects.find((o: any) => o.name === objectPath);
    assert.ok(foundFinal, "Restored object must be back in active listings");
  });
});
