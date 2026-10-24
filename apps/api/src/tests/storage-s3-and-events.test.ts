import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { StorageService } from "../services/storage.service.js";
import { StorageS3Service } from "../services/storage-s3.service.js";
import { storageEvents, type StorageEventPayload } from "../services/storage-events.service.js";
import { StorageCleanupEngine } from "../cron/storage-cleanup.js";

describe("Whizan Cloud Storage — Phase 5 (S3 Gateway & Events) & Phase 6 (Cleanup Cron)", () => {
  let user: any;
  let bucket: any;

  before(async () => {
    user = await prisma.user.create({
      data: {
        email: `s3-test-${Date.now()}@whizan.cloud`,
        passwordHash: "test_hash",
        name: "S3 & Events Tester",
      },
    });

    await StorageService.getOrCreateUserQuota(user.id, "HOBBY");

    bucket = await StorageService.createBucket({
      userId: user.id,
      name: `s3-bkt-${Date.now()}`,
      isPublic: true,
      trashEnabled: true,
      trashRetentionDays: 0, // 0 days retention to test immediate expiration purging
    });
  });

  after(async () => {
    if (bucket && user) {
      await StorageService.deleteBucket(user.id, bucket.id, true).catch(() => {});
    }
    if (user) {
      await prisma.storageAuditLog.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.storageUserQuota.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
  });

  // ── S3 XML Generation ───────────────────────────────────────────────────────
  it("Phase 5A: buildListBucketResultXml generates AWS S3 compliant XML", () => {
    const xml = StorageS3Service.buildListBucketResultXml({
      bucketName: "my-test-bucket",
      prefix: "assets/",
      delimiter: "/",
      maxKeys: 1000,
      isTruncated: false,
      objects: [
        {
          name: "assets/logo.png",
          size: 2048n,
          etag: "9b308f",
          updatedAt: new Date("2026-10-24T12:00:00Z"),
        },
      ],
      commonPrefixes: ["assets/icons/"],
    });

    assert.ok(xml.includes("<ListBucketResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\">"));
    assert.ok(xml.includes("<Name>my-test-bucket</Name>"));
    assert.ok(xml.includes("<Prefix>assets/</Prefix>"));
    assert.ok(xml.includes("<Key>assets/logo.png</Key>"));
    assert.ok(xml.includes("<Size>2048</Size>"));
    assert.ok(xml.includes("<ETag>\"9b308f\"</ETag>"));
    assert.ok(xml.includes("<CommonPrefixes><Prefix>assets/icons/</Prefix></CommonPrefixes>"));
  });

  // ── S3 Gateway CRUD ────────────────────────────────────────────────────────
  it("Phase 5A: S3 Gateway PutObject, HeadObject, GetObject, ListObjects, and DeleteObject", async () => {
    const testData = Buffer.from("Hello S3 Compatible World!");

    // 1. PutObject
    const putRes = await StorageS3Service.putObject({
      userId: user.id,
      bucketName: bucket.name,
      key: "s3-docs/hello.txt",
      data: testData,
      contentType: "text/plain",
    });

    assert.ok(putRes.etag, "PutObject must return ETag");
    assert.equal(putRes.size, testData.length);

    // 2. HeadObject
    const headRes = await StorageS3Service.headObject({
      userId: user.id,
      bucketName: bucket.name,
      key: "s3-docs/hello.txt",
    });

    assert.equal(headRes.contentLength, testData.length);
    assert.equal(headRes.contentType, "text/plain");
    assert.ok(headRes.etag);

    // 3. GetObject
    const getRes = await StorageS3Service.getObject({
      userId: user.id,
      bucketName: bucket.name,
      key: "s3-docs/hello.txt",
    });

    assert.equal(getRes.contentType, "text/plain");
    const downloadedBuffer = await streamToBuffer(getRes.stream);
    assert.equal(downloadedBuffer.toString(), "Hello S3 Compatible World!");

    // 4. ListObjectsV2
    const listRes = await StorageS3Service.listObjectsV2({
      userId: user.id,
      bucketName: bucket.name,
      prefix: "s3-docs/",
    });

    assert.ok(listRes.xml.includes("<Key>s3-docs/hello.txt</Key>"));

    // 5. DeleteObject
    await StorageS3Service.deleteObject({
      userId: user.id,
      bucketName: bucket.name,
      key: "s3-docs/hello.txt",
    });

    // Verify deletion
    await assert.rejects(async () => {
      await StorageS3Service.headObject({
        userId: user.id,
        bucketName: bucket.name,
        key: "s3-docs/hello.txt",
      });
    });
  });

  // ── Real-Time Storage Events ───────────────────────────────────────────────
  it("Phase 5B: Real-time storage events are emitted on upload and delete", async () => {
    const eventsReceived: StorageEventPayload[] = [];
    const unsubscribe = storageEvents.onEvent((event) => {
      if (event.userId === user.id) {
        eventsReceived.push(event);
      }
    });

    try {
      // 1. Upload triggers "storage:object:created"
      await StorageService.uploadObject({
        userId: user.id,
        bucketIdentifier: bucket.id,
        objectPath: "events-test/file.txt",
        data: Buffer.from("Event test content"),
        mimeType: "text/plain",
      });

      // 2. Delete triggers "storage:object:deleted"
      await StorageService.deleteObject({
        userId: user.id,
        bucketIdentifier: bucket.id,
        objectPath: "events-test/file.txt",
        permanent: true,
      });

      assert.ok(eventsReceived.length >= 2, "Expected at least 2 events");
      const createdEvent = eventsReceived.find((e) => e.eventType === "storage:object:created");
      const deletedEvent = eventsReceived.find((e) => e.eventType === "storage:object:deleted");

      assert.ok(createdEvent, "Expected storage:object:created event");
      assert.equal(createdEvent.path, "events-test/file.txt");

      assert.ok(deletedEvent, "Expected storage:object:deleted event");
      assert.equal(deletedEvent.path, "events-test/file.txt");
    } finally {
      unsubscribe();
    }
  });

  // ── Background Cleanup Cron Engine ─────────────────────────────────────────
  it("Phase 6: StorageCleanupEngine expires stale reservations and purges expired trash", async () => {
    // 1. Create a stale reservation (expires in past)
    const staleReservation = await prisma.storageReservation.create({
      data: {
        userId: user.id,
        bucketId: bucket.id,
        objectName: "stale/orphan.bin",
        reservedBytes: 50000n,
        expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
        status: "PENDING",
      },
    });

    // Update user quota reservedBytes to reflect it
    await prisma.storageUserQuota.update({
      where: { userId: user.id },
      data: { reservedBytes: { increment: 50000n } },
    });

    const quotaBefore = await prisma.storageUserQuota.findUnique({ where: { userId: user.id } });
    assert.ok(quotaBefore!.reservedBytes >= 50000n);

    // Run cleanup
    const result = await StorageCleanupEngine.expireStaleReservations();
    assert.ok(result.expiredCount >= 1, "Expected at least 1 expired reservation");

    // Verify reservation status is EXPIRED
    const checkRes = await prisma.storageReservation.findUnique({
      where: { id: staleReservation.id },
    });
    assert.equal(checkRes?.status, "EXPIRED");

    // 2. Soft-delete an object and test purgeExpiredTrash
    const softDeleted = await StorageService.uploadObject({
      userId: user.id,
      bucketIdentifier: bucket.id,
      objectPath: "trash-purge/file.txt",
      data: Buffer.from("Temporary trash data"),
      mimeType: "text/plain",
    });

    await StorageService.deleteObject({
      userId: user.id,
      bucketIdentifier: bucket.id,
      objectPath: "trash-purge/file.txt",
      moveToTrash: true,
    });

    // Run trash purge
    const purgeResult = await StorageCleanupEngine.purgeExpiredTrash();
    assert.ok(purgeResult.purgedCount >= 1, "Expected at least 1 purged object from trash");
  });
});

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
