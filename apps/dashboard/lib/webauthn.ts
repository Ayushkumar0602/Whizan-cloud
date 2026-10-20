/**
 * WebAuthn Biometric Authentication (Touch ID / Face ID / Windows Hello)
 * Secured directly via local hardware platform authenticator (Secure Enclave / TPM).
 */

const STORAGE_KEYS = {
  ENROLLED: "whizan_biometric_enrolled",
  USER_EMAIL: "whizan_biometric_user_email",
  USER_ID: "whizan_biometric_user_id",
  CREDENTIAL_ID: "whizan_biometric_credential_id",
  ENROLLED_AT: "whizan_biometric_enrolled_at",
};

/**
 * Checks if the browser and operating system support local biometric authenticators
 * (Touch ID on macOS/iOS, Windows Hello, or Android Fingerprint/Face).
 */
export async function isPlatformBiometricSupported(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return false;
  }
  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      return Boolean(available);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Checks if this local device has already enrolled a biometric credential
 */
export function isBiometricEnrolled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEYS.ENROLLED) === "true";
  } catch {
    return false;
  }
}

/**
 * Gets the email associated with the local device's biometric credential
 */
export function getBiometricUserEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEYS.USER_EMAIL);
  } catch {
    return null;
  }
}

/**
 * Checks if biometric credential belongs to a specific user email
 */
export function isBiometricEnrolledForEmail(email: string): boolean {
  if (typeof window === "undefined" || !email) return false;
  try {
    const isEnrolled = localStorage.getItem(STORAGE_KEYS.ENROLLED) === "true";
    const enrolledEmail = localStorage.getItem(STORAGE_KEYS.USER_EMAIL);
    return isEnrolled && enrolledEmail?.toLowerCase().trim() === email.toLowerCase().trim();
  } catch {
    return false;
  }
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Registers local device biometrics (Face ID / Touch ID / Windows Hello)
 */
export async function enrollBiometric(
  userId: string,
  email: string
): Promise<{ success: boolean; error?: string }> {
  const supported = await isPlatformBiometricSupported();
  if (!supported) {
    return {
      success: false,
      error: "Platform biometrics (Touch ID / Face ID) is not supported or not enabled on this device.",
    };
  }

  try {
    // Generate random 32-byte cryptographic challenge
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    // Encode user ID as ArrayBuffer
    const enc = new TextEncoder();
    const userHandle = enc.encode(userId || email);

    // Host domain without port for WebAuthn RP
    const hostDomain = window.location.hostname;

    const createOptions: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: "Whizan Cloud Services",
        id: hostDomain === "localhost" ? undefined : hostDomain,
      },
      user: {
        id: userHandle,
        name: email,
        displayName: email.split("@")[0] || "Whizan Developer",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },   // ES256 (P-256) - standard for Touch ID / Face ID
        { type: "public-key", alg: -257 }, // RS256 - standard for Windows Hello
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform", // Enforces built-in Touch ID / Face ID / Windows Hello
        userVerification: "required",        // Demands biometric verification (not just presence)
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    };

    const credential = (await navigator.credentials.create({
      publicKey: createOptions,
    })) as PublicKeyCredential | null;

    if (!credential) {
      return { success: false, error: "Biometric registration was cancelled or timed out." };
    }

    const credIdBase64 = bufferToBase64(credential.rawId);

    // Save registration securely in local device storage
    localStorage.setItem(STORAGE_KEYS.ENROLLED, "true");
    localStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);
    localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
    localStorage.setItem(STORAGE_KEYS.CREDENTIAL_ID, credIdBase64);
    localStorage.setItem(STORAGE_KEYS.ENROLLED_AT, new Date().toISOString());

    return { success: true };
  } catch (err: any) {
    console.error("[WebAuthn] Enrollment error:", err);
    if (err.name === "NotAllowedError") {
      return { success: false, error: "Biometric authentication prompt was dismissed." };
    }
    return { success: false, error: err.message || "Failed to register biometric credential." };
  }
}

/**
 * Prompts the user to verify Touch ID / Face ID / Windows Hello to unlock console access
 */
export async function verifyBiometric(): Promise<{
  success: boolean;
  email?: string;
  error?: string;
}> {
  const isEnrolled = isBiometricEnrolled();
  if (!isEnrolled) {
    return { success: false, error: "No biometric credential registered on this device." };
  }

  const credIdBase64 = localStorage.getItem(STORAGE_KEYS.CREDENTIAL_ID);
  const email = localStorage.getItem(STORAGE_KEYS.USER_EMAIL) || "";

  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const hostDomain = window.location.hostname;

    const requestOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      rpId: hostDomain === "localhost" ? undefined : hostDomain,
      userVerification: "required",
      timeout: 60000,
    };

    if (credIdBase64) {
      requestOptions.allowCredentials = [
        {
          type: "public-key",
          id: base64ToBuffer(credIdBase64),
          transports: ["internal"],
        },
      ];
    }

    const assertion = (await navigator.credentials.get({
      publicKey: requestOptions,
    })) as PublicKeyCredential | null;

    if (!assertion) {
      return { success: false, error: "Biometric verification was cancelled." };
    }

    return { success: true, email };
  } catch (err: any) {
    console.error("[WebAuthn] Verification error:", err);
    if (err.name === "NotAllowedError") {
      return { success: false, error: "Biometric prompt was cancelled or not recognized." };
    }
    return { success: false, error: err.message || "Biometric verification failed." };
  }
}

/**
 * Removes local biometric enrollment from this device
 */
export function removeBiometric(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEYS.ENROLLED);
    localStorage.removeItem(STORAGE_KEYS.USER_EMAIL);
    localStorage.removeItem(STORAGE_KEYS.USER_ID);
    localStorage.removeItem(STORAGE_KEYS.CREDENTIAL_ID);
    localStorage.removeItem(STORAGE_KEYS.ENROLLED_AT);
  } catch {}
}

// ─── 3-Day 2-Step / Biometric Trust Session ──────────────────────────────────
export const TWO_FACTOR_TRUST_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 Days

/**
 * Checks if 2-step verification is satisfied for this email on this local device (valid for 3 days)
 */
export function isTwoFactorTrusted(email: string): boolean {
  if (typeof window === "undefined" || !email) return false;
  try {
    const raw = localStorage.getItem(`whz_2fa_trust_${email.toLowerCase().trim()}`);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return typeof parsed?.expiresAt === "number" && parsed.expiresAt > Date.now();
  } catch {
    return false;
  }
}

/**
 * Saves 3-day 2FA trust timestamp for this device
 */
export function saveTwoFactorTrust(email: string): void {
  if (typeof window === "undefined" || !email) return;
  try {
    const payload = {
      verifiedAt: Date.now(),
      expiresAt: Date.now() + TWO_FACTOR_TRUST_DURATION_MS,
    };
    localStorage.setItem(`whz_2fa_trust_${email.toLowerCase().trim()}`, JSON.stringify(payload));
  } catch {}
}

/**
 * Clears 2FA trust
 */
export function clearTwoFactorTrust(email: string): void {
  if (typeof window === "undefined" || !email) return;
  try {
    localStorage.removeItem(`whz_2fa_trust_${email.toLowerCase().trim()}`);
  } catch {}
}

