import crypto from "crypto";

/**
 * Signs an administrative command payload using HMAC-SHA256
 */
export function signAdminPayload(payload: Record<string, any>): Record<string, any> {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "whizan_internal_secret";
  const { sig: _, ...dataToSign } = payload;
  const canonical = JSON.stringify(dataToSign, Object.keys(dataToSign).sort());
  const sig = crypto.createHmac("sha256", secret).update(canonical).digest("hex");
  return { ...dataToSign, sig };
}

/**
 * Verifies an HMAC-SHA256 signature on an administrative command payload
 */
export function verifyAdminPayload(payload: Record<string, any>): boolean {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "whizan_internal_secret";
  if (!payload || typeof payload !== "object" || !payload.sig) {
    return false;
  }
  const { sig, ...dataToSign } = payload;
  const canonical = JSON.stringify(dataToSign, Object.keys(dataToSign).sort());
  const expectedSig = crypto.createHmac("sha256", secret).update(canonical).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"));
  } catch {
    return false;
  }
}
