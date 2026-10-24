import { createClient } from "../packages/storage-js/dist/index.js";

const apiKey = process.argv[2] || "whz_stg_live_a83bca0e838eb59f43bca3b142d0035ee914ddb3be6e03eb";
const projectUrl = process.argv[3] || "https://api.whizan.cloud";
const primaryBucket = process.argv[4] || "aj089";

console.log("══════════════════════════════════════════════════════════════════════");
console.log("  Whizan Cloud Storage — Exhaustive Live SDK & Gateway Test Suite");
console.log(`  Target: ${projectUrl} | Live Key: ${apiKey.slice(0, 16)}...`);
console.log("══════════════════════════════════════════════════════════════════════\n");

const storage = createClient(projectUrl, apiKey);

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    throw new Error(message);
  } else {
    passedTests++;
    console.log(`  ✅ PASSED: ${message}`);
  }
}

async function runTests() {
  const testRunId = Date.now();
  const tempBucketName = `test-bkt-${testRunId.toString().slice(-6)}`;
  const sampleFilePath = `test-suite-${testRunId}/sample.txt`;
  const copiedFilePath = `test-suite-${testRunId}/sample-copy.txt`;
  const movedFilePath = `test-suite-${testRunId}/sample-moved.txt`;
  const sampleContent = `Test Payload for Whizan Storage [Run: ${testRunId}]\nVerified at: ${new Date().toISOString()}`;

  // ── TEST 1: List Buckets ──────────────────────────────────────────────────
  console.log("Test 1: storage.listBuckets()");
  const listBucketsRes = await storage.listBuckets();
  assert(!listBucketsRes.error, `listBuckets returned error: ${listBucketsRes.error?.message}`);
  assert(Array.isArray(listBucketsRes.data), "listBuckets returned non-array data");
  assert(listBucketsRes.data.some(b => b.name === primaryBucket), `Bucket '${primaryBucket}' found in buckets list`);
  console.log(`       Found ${listBucketsRes.data.length} buckets.`);

  // ── TEST 2: Get Bucket Details ───────────────────────────────────────────
  console.log(`\nTest 2: storage.getBucket("${primaryBucket}")`);
  const getBucketRes = await storage.getBucket(primaryBucket);
  assert(!getBucketRes.error, `getBucket returned error: ${getBucketRes.error?.message}`);
  assert(getBucketRes.data.name === primaryBucket, `getBucket returned correct bucket: ${getBucketRes.data?.name}`);
  console.log(`       Bucket ID: ${getBucketRes.data.id}, Total Files: ${getBucketRes.data.fileCount}`);

  // ── TEST 3: Create Temporary Bucket ──────────────────────────────────────
  console.log(`\nTest 3: storage.createBucket("${tempBucketName}")`);
  const createBktRes = await storage.createBucket(tempBucketName, {
    public: false,
    allowedMimeTypes: ["text/plain", "application/json"],
  });
  assert(!createBktRes.error, `createBucket failed: ${createBktRes.error?.message}`);
  console.log(`       Created bucket: ${createBktRes.data?.name}`);

  // ── TEST 4: Upload / Write File to Primary Bucket ────────────────────────
  console.log(`\nTest 4: storage.from("${primaryBucket}").upload("${sampleFilePath}")`);
  const uploadRes = await storage.from(primaryBucket).upload(sampleFilePath, sampleContent, {
    contentType: "text/plain",
    cacheControl: "public, max-age=3600",
  });
  assert(!uploadRes.error, `upload failed: ${uploadRes.error?.message}`);
  assert(uploadRes.data.path === sampleFilePath, `upload path matches: ${uploadRes.data?.path}`);
  assert(uploadRes.data.size > 0, `upload returned non-zero size: ${uploadRes.data?.size}`);
  console.log(`       Object uploaded successfully. ID: ${uploadRes.data?.id}`);

  // ── TEST 5: List Objects in Folder ───────────────────────────────────────
  console.log(`\nTest 5: storage.from("${primaryBucket}").list("test-suite-${testRunId}")`);
  const listObjectsRes = await storage.from(primaryBucket).list(`test-suite-${testRunId}`);
  assert(!listObjectsRes.error, `list failed: ${listObjectsRes.error?.message}`);
  assert(listObjectsRes.data.some(o => o.name === sampleFilePath), `Uploaded object appears in folder listing`);
  console.log(`       Found ${listObjectsRes.data.length} object(s) in folder.`);

  // ── TEST 6: Read / Download Object & Verify Content ──────────────────────
  console.log(`\nTest 6: storage.from("${primaryBucket}").download("${sampleFilePath}")`);
  const downloadRes = await storage.from(primaryBucket).download(sampleFilePath);
  assert(!downloadRes.error, `download failed: ${downloadRes.error?.message}`);
  const downloadedText = await downloadRes.data.text();
  assert(downloadedText === sampleContent, "Downloaded content exactly matches uploaded bytes");
  console.log(`       Downloaded content verified (${downloadedText.length} bytes).`);

  // ── TEST 7: Modify Object Metadata (Cache-Control & Custom JSON) ──────────
  console.log(`\nTest 7: storage.from("${primaryBucket}").updateMetadata("${sampleFilePath}")`);
  const updateMetaRes = await storage.from(primaryBucket).updateMetadata(sampleFilePath, {
    cacheControl: "public, max-age=86400, immutable",
    contentDisposition: 'attachment; filename="verified-sample.txt"',
    metadata: {
      tester: "antigravity-live-bot",
      version: "2.0.0",
      testRunId: String(testRunId),
    },
  });
  assert(!updateMetaRes.error, `updateMetadata failed: ${updateMetaRes.error?.message}`);
  assert(updateMetaRes.data.cacheControl === "public, max-age=86400, immutable", "Cache-Control updated correctly");
  console.log(`       Metadata updated: Cache-Control=${updateMetaRes.data?.cacheControl}`);

  // ── TEST 8: Read Object Metadata ─────────────────────────────────────────
  console.log(`\nTest 8: storage.from("${primaryBucket}").getMetadata("${sampleFilePath}")`);
  const getMetaRes = await storage.from(primaryBucket).getMetadata(sampleFilePath);
  assert(!getMetaRes.error, `getMetadata failed: ${getMetaRes.error?.message}`);
  assert(getMetaRes.data.metadata?.tester === "antigravity-live-bot", "Custom JSON metadata verified");
  console.log(`       Metadata verified: ${JSON.stringify(getMetaRes.data.metadata)}`);

  // ── TEST 9: Copy Object ──────────────────────────────────────────────────
  console.log(`\nTest 9: storage.from("${primaryBucket}").copy("${sampleFilePath}", "${copiedFilePath}")`);
  const copyRes = await storage.from(primaryBucket).copy(sampleFilePath, copiedFilePath);
  assert(!copyRes.error, `copy failed: ${copyRes.error?.message}`);
  console.log(`       Copy response: ${copyRes.data?.message}`);

  // Verify copy exists
  const listAfterCopy = await storage.from(primaryBucket).list(`test-suite-${testRunId}`);
  assert(listAfterCopy.data.some(o => o.name === copiedFilePath), "Copied file exists in bucket");

  // ── TEST 10: Move / Rename Object ────────────────────────────────────────
  console.log(`\nTest 10: storage.from("${primaryBucket}").move("${copiedFilePath}", "${movedFilePath}")`);
  const moveRes = await storage.from(primaryBucket).move(copiedFilePath, movedFilePath);
  assert(!moveRes.error, `move failed: ${moveRes.error?.message}`);
  console.log(`       Move response: ${moveRes.data?.message}`);

  // Verify moved file exists and source is gone
  const listAfterMove = await storage.from(primaryBucket).list(`test-suite-${testRunId}`);
  assert(listAfterMove.data.some(o => o.name === movedFilePath), "Moved file exists at destination");
  assert(!listAfterMove.data.some(o => o.name === copiedFilePath), "Original copied file was removed after move");

  // ── TEST 11: Create Temporary Presigned Download URL ─────────────────────
  console.log(`\nTest 11: storage.from("${primaryBucket}").createSignedUrl("${movedFilePath}", 1800)`);
  const signedUrlRes = await storage.from(primaryBucket).createSignedUrl(movedFilePath, 1800, {
    download: "moved-sample.txt",
  });
  assert(!signedUrlRes.error, `createSignedUrl failed: ${signedUrlRes.error?.message}`);
  assert(typeof signedUrlRes.data.signedUrl === "string" && signedUrlRes.data.signedUrl.startsWith("http"), "Signed URL is valid HTTPS string");
  console.log(`       Signed URL: ${signedUrlRes.data.signedUrl.slice(0, 80)}...`);

  // ── TEST 12: Get Public CDN URL ──────────────────────────────────────────
  console.log(`\nTest 12: storage.from("${primaryBucket}").getPublicUrl("${movedFilePath}")`);
  const publicUrlRes = storage.from(primaryBucket).getPublicUrl(movedFilePath, {
    width: 300,
    height: 200,
    format: "webp",
  });
  assert(typeof publicUrlRes.data.publicUrl === "string", "getPublicUrl returns string");
  assert(publicUrlRes.data.publicUrl.includes("format=webp"), "Transform parameters appended correctly");
  console.log(`       Public CDN URL: ${publicUrlRes.data.publicUrl}`);

  // ── TEST 13: Delete Objects (Soft-Delete) ────────────────────────────────
  console.log(`\nTest 13: storage.from("${primaryBucket}").remove(["${sampleFilePath}", "${movedFilePath}"])`);
  const removeRes = await storage.from(primaryBucket).remove([sampleFilePath, movedFilePath]);
  assert(!removeRes.error, `remove failed: ${removeRes.error?.message}`);
  assert(removeRes.data.deletedCount === 2, `Expected 2 deleted objects, got: ${removeRes.data?.deletedCount}`);
  console.log(`       Removed ${removeRes.data.deletedCount} object(s).`);

  // Verify objects are no longer listed in active bucket
  const listAfterDelete = await storage.from(primaryBucket).list(`test-suite-${testRunId}`);
  assert(!listAfterDelete.data.some(o => o.name === sampleFilePath || o.name === movedFilePath), "Deleted objects no longer returned in active list");

  // ── TEST 14: Delete Temporary Bucket ─────────────────────────────────────
  console.log(`\nTest 14: storage.deleteBucket("${tempBucketName}")`);
  const delBktRes = await storage.deleteBucket(tempBucketName);
  assert(!delBktRes.error, `deleteBucket failed: ${delBktRes.error?.message}`);
  console.log(`       Temporary bucket deleted successfully.`);

  // ── TEST 15: Storage Quota & Usage ───────────────────────────────────────
  console.log("\nTest 15: storage.getUsage()");
  const usageRes = await storage.getUsage();
  assert(!usageRes.error, `getUsage failed: ${usageRes.error?.message}`);
  assert(usageRes.data.quota && typeof usageRes.data.quota.usedBytes === "number", "Quota usage statistics returned");
  console.log(`       Quota: ${usageRes.data.quota.usedMb} MB used / ${usageRes.data.quota.allocatedMb} MB allocated (${usageRes.data.quota.usagePercent}%).`);

  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log(`  🎉 ALL ${totalTests}/${totalTests} EXHAUSTIVE INTEGRATION TESTS PASSED 100%!`);
  console.log("══════════════════════════════════════════════════════════════════════");
}

runTests().catch(err => {
  console.error("\n💥 Test Suite Aborted with Unhandled Error:", err);
  process.exit(1);
});
