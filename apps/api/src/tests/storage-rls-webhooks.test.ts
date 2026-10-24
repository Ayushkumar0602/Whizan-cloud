// ─── Whizan Cloud Storage — TDD Suite: Phase 2 (RLS, Webhooks, CORS) ──────────

import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import {
  StorageService,
  NotFoundError,
  StorageError,
} from "../services/storage.service.js";

describe("Whizan Cloud Storage — Phase 2: RLS Policies, Webhooks & CORS", () => {
  let user: any;
  let otherUser: any;
  let bucket: any;

  before(async () => {
    const timestamp = Date.now();
    user = await prisma.user.create({
      data: {
        email: `test-phase2-owner-${timestamp}@whizan.test`,
        name: "Phase 2 Owner",
        subscriptionTier: "HOBBY",
        role: "USER",
        emailVerified: true,
      },
    });

    otherUser = await prisma.user.create({
      data: {
        email: `test-phase2-other-${timestamp}@whizan.test`,
        name: "Phase 2 Other",
        subscriptionTier: "HOBBY",
        role: "USER",
        emailVerified: true,
      },
    });

    await StorageService.getOrCreateUserQuota(user.id, user.subscriptionTier);
    await StorageService.getOrCreateUserQuota(otherUser.id, otherUser.subscriptionTier);

    bucket = await StorageService.createBucket({
      userId: user.id,
      name: `phase2-bucket-${timestamp}`,
      isPublic: false,
    });
  });

  after(async () => {
    try {
      if (user) {
        await prisma.storageWebhook.deleteMany({ where: { userId: user.id } });
        await prisma.storageBucketPolicy.deleteMany({ where: { bucketId: bucket.id } });
        await prisma.storageAuditLog.deleteMany({ where: { userId: user.id } });
        await prisma.storageReservation.deleteMany({ where: { userId: user.id } });
        await prisma.storageObject.deleteMany({ where: { bucketId: bucket.id } });
        await prisma.storageBucket.deleteMany({ where: { userId: user.id } });
        await prisma.storageUserQuota.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
      if (otherUser) {
        await prisma.storageUserQuota.deleteMany({ where: { userId: otherUser.id } });
        await prisma.user.delete({ where: { id: otherUser.id } });
      }
    } catch (e) {
      console.warn("Cleanup error in phase 2 tests:", e);
    }
  });

  // ─── Test 1: Bucket CORS Configuration ─────────────────────────────────────
  it("Phase 2.1: Bucket CORS configuration can be updated and retrieved", async () => {
    const updated = await (StorageService as any).updateBucket(bucket.id, user.id, {
      corsOrigins: ["https://example.com", "https://app.whizan.test"],
      corsMaxAge: 7200,
    });

    assert.equal(updated.id, bucket.id);
    assert.deepEqual(updated.corsOrigins, ["https://example.com", "https://app.whizan.test"]);
    assert.equal(updated.corsMaxAge, 7200);

    const fetched = await StorageService.getBucket(bucket.id, user.id);
    assert.deepEqual((fetched as any).corsOrigins, ["https://example.com", "https://app.whizan.test"]);
    assert.equal((fetched as any).corsMaxAge, 7200);
  });

  // ─── Test 2: Bucket Policy Lifecycle (Create, List, Toggle, Delete) ───────
  it("Phase 2.2: Bucket RLS policies can be created, listed, and toggled", async () => {
    // 1. Create SELECT policy for prefix 'public-docs/'
    const policy1 = await (StorageService as any).createPolicy({
      bucketId: bucket.id,
      userId: user.id,
      name: "Allow public-docs read",
      operation: "SELECT",
      definition: {
        allowedPrefix: "public-docs/",
      },
    });

    assert.ok(policy1.id);
    assert.equal(policy1.name, "Allow public-docs read");
    assert.equal(policy1.operation, "SELECT");
    assert.equal(policy1.isEnabled, true);

    // 2. Create INSERT policy with max file size
    const policy2 = await (StorageService as any).createPolicy({
      bucketId: bucket.id,
      userId: user.id,
      name: "Allow uploads up to 1MB in uploads/",
      operation: "INSERT",
      definition: {
        allowedPrefix: "uploads/",
        maxSizeBytes: 1048576,
      },
    });
    assert.ok(policy2.id);

    // 3. List policies
    const policies = await (StorageService as any).listPolicies(bucket.id, user.id);
    assert.equal(policies.length, 2);

    // 4. Toggle/Update policy
    const toggled = await (StorageService as any).updatePolicy(policy1.id, user.id, {
      isEnabled: false,
    });
    assert.equal(toggled.isEnabled, false);

    // Re-enable for subsequent evaluation test
    await (StorageService as any).updatePolicy(policy1.id, user.id, {
      isEnabled: true,
    });
  });

  // ─── Test 3: Policy Evaluation Engine ──────────────────────────────────────
  it("Phase 2.3: StorageService.evaluatePolicy evaluates prefix and size constraints", async () => {
    // Policy 1: operation="SELECT", allowedPrefix="public-docs/"
    // Matching prefix
    const canReadDocs = await (StorageService as any).evaluatePolicy({
      userId: otherUser.id,
      bucketId: bucket.id,
      operation: "SELECT",
      objectPath: "public-docs/spec.pdf",
    });
    assert.equal(canReadDocs.allowed, true);

    // Non-matching prefix
    const canReadSecret = await (StorageService as any).evaluatePolicy({
      userId: otherUser.id,
      bucketId: bucket.id,
      operation: "SELECT",
      objectPath: "private/secret.key",
    });
    assert.equal(canReadSecret.allowed, false);

    // Policy 2: operation="INSERT", allowedPrefix="uploads/", maxSizeBytes=1048576
    // Upload within limits
    const canUploadSmall = await (StorageService as any).evaluatePolicy({
      userId: otherUser.id,
      bucketId: bucket.id,
      operation: "INSERT",
      objectPath: "uploads/image.png",
      sizeBytes: 500000,
    });
    assert.equal(canUploadSmall.allowed, true);

    // Upload exceeding maxSizeBytes limit
    const canUploadLarge = await (StorageService as any).evaluatePolicy({
      userId: otherUser.id,
      bucketId: bucket.id,
      operation: "INSERT",
      objectPath: "uploads/huge.zip",
      sizeBytes: 2000000,
    });
    assert.equal(canUploadLarge.allowed, false);

    // Owner always has full access regardless of restrictive policies
    const ownerAccess = await (StorageService as any).evaluatePolicy({
      userId: user.id,
      bucketId: bucket.id,
      operation: "SELECT",
      objectPath: "private/secret.key",
    });
    assert.equal(ownerAccess.allowed, true);
  });

  // ─── Test 4: Webhook Management & HMAC-SHA256 Signature Generation ─────────
  it("Phase 2.4: Storage webhooks can be registered and HMAC signature validated", async () => {
    const testSecret = "whz_whsec_" + crypto.randomBytes(16).toString("hex");

    // 1. Create webhook
    const webhook = await (StorageService as any).createWebhook({
      userId: user.id,
      bucketId: bucket.id,
      events: ["OBJECT_UPLOAD", "OBJECT_DELETE"],
      url: "https://api.example.com/storage-events",
      secret: testSecret,
    });

    assert.ok(webhook.id);
    assert.equal(webhook.userId, user.id);
    assert.equal(webhook.url, "https://api.example.com/storage-events");
    assert.equal(webhook.isActive, true);
    assert.deepEqual(webhook.events, ["OBJECT_UPLOAD", "OBJECT_DELETE"]);

    // 2. List webhooks
    const webhooks = await (StorageService as any).listWebhooks(user.id);
    assert.ok(webhooks.length >= 1);
    const found = webhooks.find((w: any) => w.id === webhook.id);
    assert.ok(found);

    // 3. Test HMAC-SHA256 signature generator
    const payload = JSON.stringify({
      id: "evt_test_123",
      event: "OBJECT_UPLOAD",
      bucket: bucket.name,
      object: "photos/banner.png",
      timestamp: Date.now(),
    });

    const signature = (StorageService as any).signWebhookPayload(payload, testSecret);
    assert.ok(signature.startsWith("sha256="));

    const expectedHash = crypto.createHmac("sha256", testSecret).update(payload).digest("hex");
    assert.equal(signature, `sha256=${expectedHash}`);

    // 4. Update webhook
    const updated = await (StorageService as any).updateWebhook(webhook.id, user.id, {
      isActive: false,
    });
    assert.equal(updated.isActive, false);

    // 5. Delete webhook
    const deleted = await (StorageService as any).deleteWebhook(webhook.id, user.id);
    assert.equal(deleted.id, webhook.id);
  });
});
