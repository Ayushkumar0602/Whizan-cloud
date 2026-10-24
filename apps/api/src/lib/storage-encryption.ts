import crypto from "crypto";

const MASTER_SALT = "whizan_storage_salt_2026";

function getDerivedKey(): Buffer {
  const masterSecret =
    process.env.STORAGE_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    "whizan_storage_master_secret_2026";
  return crypto.scryptSync(masterSecret, MASTER_SALT, 32);
}

/**
 * Encrypts a raw Storage API Key using authenticated AES-256-GCM.
 * Formats output as: "ivHex:authTagHex:ciphertextHex"
 */
export function encryptStorageKey(rawSecret: string): string {
  const iv = crypto.randomBytes(12); // Recommended 96-bit IV for GCM
  const key = getDerivedKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(rawSecret, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts a Storage API Key with auth tag validation.
 */
export function decryptStorageKey(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted key format");
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const key = getDerivedKey();

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
