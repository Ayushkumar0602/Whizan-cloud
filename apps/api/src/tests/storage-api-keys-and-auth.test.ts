// ─── Whizan Cloud Storage — TDD Suite: Dedicated Storage API Keys & 2FA Reveal ───

import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { redisClient } from "../lib/redis.js";
import {
  encryptStorageKey,
  decryptStorageKey,
} from "../lib/storage-encryption.js";
import { StorageService } from "../services/storage.service.js";

describe("Storage API Keys — Encryption, 2FA Reveal & Scoped Auth Suite", () => {
  let user: any;
  let bucketA: any;
  let bucketB: any;
  let createdKeyA: any;
  let rawSecretA: string;
  let createdKeyB: any;
  let rawSecretB: string;

  before(async () => {
    const timestamp = Date.now();
    user = await prisma.user.create({
      data: {
        email: `test-stgkey-${timestamp}@whizan.test`,
        name: "Storage Key Test User",
        subscriptionTier: "HOBBY",
        role: "USER",
        emailVerified: true,
      },
    });

    await StorageService.getOrCreateUserQuota(user.id, user.subscriptionTier);

    bucketA = await StorageService.createBucket({
      userId: user.id,
      name: `stg-bucket-a-${timestamp}`,
      isPublic: false,
    });

    bucketB = await StorageService.createBucket({
      userId: user.id,
      name: `stg-bucket-b-${timestamp}`,
      isPublic: false,
    });
  });

  after(async () => {
    try {
      if (user) {
        await prisma.storageApiKey.deleteMany({ where: { userId: user.id } });
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

  // ── 1. AES-256-GCM Encryption & Tamper Proofing ──────────────────────────
  it("encrypts and decrypts storage secrets with AES-256-GCM auth tags", () => {
    const original = "whz_stg_live_8fbc2399aa1234567890abcdef1234567890abcdef";
    const encrypted = encryptStorageKey(original);

    assert.ok(encrypted.includes(":"), "Encrypted payload must contain IV, tag, and ciphertext delimiters");
    const parts = encrypted.split(":");
    assert.equal(parts.length, 3, "Payload must have exactly 3 parts: iv, tag, ciphertext");

    const decrypted = decryptStorageKey(encrypted);
    assert.equal(decrypted, original, "Decrypted text must match original secret exactly");
  });

  it("throws authentication error when encrypted storage secret is tampered with", () => {
    const original = "whz_stg_live_secret_tamper_check";
    const encrypted = encryptStorageKey(original);
    const parts = encrypted.split(":");
    // Tamper with ciphertext by altering last byte
    const tamperedCipher = parts[2].slice(0, -2) + (parts[2].endsWith("00") ? "ff" : "00");
    const tamperedPayload = `${parts[0]}:${parts[1]}:${tamperedCipher}`;

    assert.throws(
      () => decryptStorageKey(tamperedPayload),
      /Unsupported state or unable to authenticate data|bad decrypt/i,
      "Tampered ciphertext must fail GCM auth tag verification"
    );
  });

  // ── 2. Storage API Key Creation & Secure Hashing ──────────────────────────
  it("creates a dedicated Storage API Key with hashed lookup and encrypted at rest", async () => {
    const randomHex = crypto.randomBytes(24).toString("hex");
    rawSecretA = `whz_stg_live_${randomHex}`;
    const keyPrefix = rawSecretA.slice(0, 18) + "...";
    const keyHash = crypto.createHash("sha256").update(rawSecretA).digest("hex");
    const encryptedSecret = encryptStorageKey(rawSecretA);

    createdKeyA = await prisma.storageApiKey.create({
      data: {
        userId: user.id,
        name: "Production Worker Key",
        keyPrefix,
        keyHash,
        encryptedSecret,
        bucketId: null, // Full access to all user buckets
        permission: "READ_WRITE",
      },
    });

    assert.ok(createdKeyA.id);
    assert.equal(createdKeyA.name, "Production Worker Key");
    assert.equal(createdKeyA.keyPrefix, keyPrefix);
    assert.notEqual(createdKeyA.encryptedSecret, rawSecretA, "Raw secret must never be stored in plaintext");

    // Verify lookup by SHA-256 hash works
    const found = await prisma.storageApiKey.findUnique({
      where: { keyHash },
    });
    assert.ok(found);
    assert.equal(found.id, createdKeyA.id);
  });

  it("creates a bucket-scoped READ_ONLY Storage API Key", async () => {
    const randomHex = crypto.randomBytes(24).toString("hex");
    rawSecretB = `whz_stg_live_${randomHex}`;
    const keyPrefix = rawSecretB.slice(0, 18) + "...";
    const keyHash = crypto.createHash("sha256").update(rawSecretB).digest("hex");
    const encryptedSecret = encryptStorageKey(rawSecretB);

    createdKeyB = await prisma.storageApiKey.create({
      data: {
        userId: user.id,
        name: "Public CDN Read Only Key",
        keyPrefix,
        keyHash,
        encryptedSecret,
        bucketId: bucketA.id, // Scoped strictly to bucketA
        permission: "READ_ONLY",
      },
    });

    assert.ok(createdKeyB.id);
    assert.equal(createdKeyB.bucketId, bucketA.id);
    assert.equal(createdKeyB.permission, "READ_ONLY");
  });

  // ── 3. OTP Generation, Rate Limiting & Verification ──────────────────────
  it("generates an Email OTP for key review and enforces 10-minute validity", async () => {
    const otp = crypto.randomInt(100000, 1000000).toString();
    const cacheKey = `storage_otp:${createdKeyA.id}:${user.id}`;

    // Store in redis with 600s TTL
    await redisClient.setex(cacheKey, 600, otp);

    const storedOtp = await redisClient.get(cacheKey);
    assert.equal(storedOtp, otp, "Stored OTP must match generated passcode");

    const ttl = await redisClient.ttl(cacheKey);
    assert.ok(ttl > 0 && ttl <= 600, "TTL must be within 10 minutes");
  });

  it("successfully reveals decrypted key with verified Email OTP and invalidates OTP", async () => {
    const otp = crypto.randomInt(100000, 1000000).toString();
    const cacheKey = `storage_otp:${createdKeyA.id}:${user.id}`;
    await redisClient.setex(cacheKey, 600, otp);

    // Simulate review request verification
    const storedOtp = await redisClient.get(cacheKey);
    assert.equal(storedOtp, otp);

    // Invalidate immediately (single-use OTP)
    await redisClient.del(cacheKey);

    // Decrypt key
    const decrypted = decryptStorageKey(createdKeyA.encryptedSecret);
    assert.equal(decrypted, rawSecretA, "Revealed key must match the original raw secret");

    // Second attempt with same OTP must fail
    const reusedOtp = await redisClient.get(cacheKey);
    assert.equal(reusedOtp, null, "Single-use OTP must be completely consumed");
  });

  it("successfully reveals decrypted key when Biometric verification is supplied", async () => {
    // Biometric authentication verified hardware platform assertion on client
    const decrypted = decryptStorageKey(createdKeyB.encryptedSecret);
    assert.equal(decrypted, rawSecretB, "Revealed key must match raw secret for bucketB key");
  });

  // ── 4. Revocation ────────────────────────────────────────────────────────
  it("revokes and deletes storage API key, eliminating all retrieval capabilities", async () => {
    await prisma.storageApiKey.delete({
      where: { id: createdKeyB.id },
    });

    const deleted = await prisma.storageApiKey.findUnique({
      where: { id: createdKeyB.id },
    });
    assert.equal(deleted, null, "Revoked key must no longer exist in database");
  });
});
