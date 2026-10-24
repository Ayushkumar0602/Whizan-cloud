import { createClient } from "../packages/storage-js/dist/index.js";

async function main() {
  const apiKey = "whz_live_609fc03836fc6f0dde2de3ebdb658ca12bc8a39da8bae95a";
  const projectUrl = "https://api.whizan.cloud";
  const bucketName = "aj089";

  console.log(`Connecting to ${projectUrl} for bucket '${bucketName}' using SDK...`);
  const storage = createClient(projectUrl, apiKey);

  // 1. List current objects in bucket
  console.log("\n[1] Listing objects in bucket before upload...");
  const listBefore = await storage.from(bucketName).list();
  console.log("Current objects in aj089:", listBefore.data?.map(o => o.name));

  // 2. Upload file via SDK
  const uploadPath = `sdk-verified/welcome-${Date.now()}.txt`;
  const fileContent = Buffer.from(`Whizan Cloud Storage Verification
────────────────────────────────────────────
Bucket: ${bucketName}
SDK: @whizan/storage-js
Key ID: whz_live_609fc03836fc...
Uploaded At: ${new Date().toISOString()}
Status: 100% Production Ready
────────────────────────────────────────────
Hello from the Whizan Cloud Storage Client SDK!`);

  console.log(`\n[2] Uploading '${uploadPath}' (${fileContent.length} bytes) via storage.from("${bucketName}").upload()...`);
  const uploadRes = await storage.from(bucketName).upload(uploadPath, fileContent, {
    contentType: "text/plain",
    cacheControl: "public, max-age=3600",
  });

  if (uploadRes.error) {
    console.error("❌ Upload failed:", uploadRes.error);
    process.exit(1);
  }

  console.log("✅ Upload succeeded!");
  console.log("Uploaded object details:", uploadRes.data);

  // 3. List objects after upload
  console.log("\n[3] Listing objects after upload...");
  const listAfter = await storage.from(bucketName).list();
  console.log("Updated objects in aj089:", listAfter.data?.map(o => ({
    name: o.name,
    size: o.size,
    mimeType: o.mimeType,
    updatedAt: o.updatedAt,
  })));

  // 4. Generate signed download URL
  console.log(`\n[4] Generating 1-hour signed download URL for '${uploadPath}'...`);
  const signedRes = await storage.from(bucketName).createSignedUrl(uploadPath, 3600);
  console.log("✅ Signed Download URL:", signedRes.data?.signedUrl);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
