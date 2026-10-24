// ─── Whizan Cloud Storage — TDD Suite: Phase 3 (Image Transformations) ─────────

import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { ImageTransformService } from "../services/image-transform.service.js";

describe("Whizan Cloud Storage — Phase 3: Image Transformations Engine", () => {
  // Generate a test 400x300 PNG in memory
  let samplePngBuffer: Buffer;

  it("Setup: generate a valid sample image buffer for testing", async () => {
    samplePngBuffer = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    assert.ok(samplePngBuffer.length > 0);
  });

  // ─── Test 1: Resize Image (Dimensions & Fit) ──────────────────────────────
  it("Phase 3.1: Resizes image to exact target dimensions", async () => {
    const transformed = await ImageTransformService.transformBuffer(samplePngBuffer, {
      width: 150,
      height: 150,
      resize: "cover",
    });

    const meta = await sharp(transformed.buffer).metadata();
    assert.equal(meta.width, 150);
    assert.equal(meta.height, 150);
  });

  // ─── Test 2: Format Conversion (WebP / AVIF) ──────────────────────────────
  it("Phase 3.2: Converts format to WebP with custom quality", async () => {
    const transformed = await ImageTransformService.transformBuffer(samplePngBuffer, {
      format: "webp",
      quality: 80,
    });

    assert.equal(transformed.mimeType, "image/webp");
    const meta = await sharp(transformed.buffer).metadata();
    assert.equal(meta.format, "webp");
  });

  // ─── Test 3: Cache Key Hashing ─────────────────────────────────────────────
  it("Phase 3.3: Generates deterministic and collision-resistant cache keys", () => {
    const key1 = ImageTransformService.getCacheKey("photos", "avatar.png", {
      width: 200,
      height: 200,
      format: "webp",
    });

    const key2 = ImageTransformService.getCacheKey("photos", "avatar.png", {
      format: "webp",
      height: 200,
      width: 200,
    });

    const key3 = ImageTransformService.getCacheKey("photos", "avatar.png", {
      width: 300,
      height: 300,
      format: "webp",
    });

    assert.equal(key1, key2, "Keys with same parameters in different order must match");
    assert.notEqual(key1, key3, "Keys with different parameters must not match");
    assert.ok(key1.startsWith("storage:img:"));
  });

  // ─── Test 4: Security Bounds & Dimension Protection ───────────────────────
  it("Phase 3.4: Rejects decompression bombs or out-of-bound dimensions", async () => {
    // Width > 4000px must be rejected to prevent memory exhaustion
    await assert.rejects(
      async () => {
        await ImageTransformService.transformBuffer(samplePngBuffer, {
          width: 8000,
        });
      },
      {
        message: /Dimension exceeds maximum allowed limit/i,
      }
    );

    // Negative dimensions must be rejected
    await assert.rejects(
      async () => {
        await ImageTransformService.transformBuffer(samplePngBuffer, {
          width: -50,
        });
      },
      {
        message: /Invalid dimension/i,
      }
    );
  });
});
