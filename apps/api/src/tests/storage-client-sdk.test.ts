// ─── Whizan Cloud Storage — Client SDK Verification Test ─────────────────────

import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createClient, WhizanStorageClient, StorageBucketApi } from "../../../../packages/storage-js/dist/index.js";

describe("Whizan Cloud Storage — Client SDK (@whizan/storage-js)", () => {
  it("Instantiates client and configures bucket APIs", () => {
    const client = createClient("https://api.whizan.cloud", "whz_test_key_123");
    assert.ok(client instanceof WhizanStorageClient);

    const bucketApi = client.from("photos");
    assert.ok(bucketApi instanceof StorageBucketApi);
  });

  it("Generates clean public download URLs", () => {
    const client = createClient("https://api.whizan.cloud", "whz_test_key_123");
    const { data } = client.from("media").getPublicUrl("banners/hero.png");

    assert.equal(data.publicUrl, "https://api.whizan.cloud/api/storage/v1/public/media/banners/hero.png");
  });

  it("Generates dynamic on-the-fly image transform URLs", () => {
    const client = createClient("https://api.whizan.cloud", "whz_test_key_123");
    const { data } = client.from("media").getPublicUrl("avatars/user.jpg", {
      width: 250,
      height: 250,
      format: "webp",
      resize: "cover",
      quality: 85,
    });

    assert.ok(data.publicUrl.includes("/render/image/public/media/avatars/user.jpg"));
    assert.ok(data.publicUrl.includes("width=250"));
    assert.ok(data.publicUrl.includes("height=250"));
    assert.ok(data.publicUrl.includes("format=webp"));
    assert.ok(data.publicUrl.includes("quality=85"));
  });
});
