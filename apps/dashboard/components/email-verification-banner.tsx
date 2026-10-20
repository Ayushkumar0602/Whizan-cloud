"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { auth } from "@/lib/api";
import { toast } from "sonner";
import { SingleInputOtp } from "@/components/auth/otp-input";
import {
  enrollBiometric,
  isPlatformBiometricSupported,
  saveTwoFactorTrust,
} from "@/lib/webauthn";
import {
  ShieldAlert,
  Mail,
  CheckCircle2,
  RefreshCw,
  X,
  Lock,
  ArrowRight,
  Fingerprint,
  ShieldCheck,
  Pencil,
  Check,
} from "lucide-react";

export function EmailVerificationBanner() {
  const { user, updateUser } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState(false);

  // Email correction state
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editedEmail, setEditedEmail] = useState("");
  const [emailUpdating, setEmailUpdating] = useState(false);

  // Modal Stage: "VERIFY_CODE" -> "ENROLL_2FA" -> "COMPLETED"
  const [modalStage, setModalStage] = useState<"VERIFY_CODE" | "ENROLL_2FA" | "COMPLETED">("VERIFY_CODE");
  const [twoFactorMethod, setTwoFactorMethod] = useState<"BIOMETRIC" | "EMAIL_OTP">("BIOMETRIC");
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [hasConsented, setHasConsented] = useState(true);

  // Check platform biometrics
  useEffect(() => {
    isPlatformBiometricSupported().then((supported) => {
      setBiometricSupported(supported);
      if (!supported) {
        setTwoFactorMethod("EMAIL_OTP");
      }
    });
  }, []);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // If user is already verified or not logged in, show nothing
  if (!user || user.emailVerified === true) {
    return null;
  }

  async function handleSendVerificationOtp() {
    if (loading) return;
    setLoading(true);
    setOtpError(false);
    try {
      const res = await auth.sendVerificationOtp();
      if (res.alreadyVerified) {
        updateUser({ emailVerified: true });
        setModalOpen(false);
        toast.success("Your email is already verified!");
        return;
      }
      setOtpSent(true);
      setResendCooldown(60);
      toast.success(`Verification code dispatched to ${user?.email}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to dispatch verification email. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!editedEmail || !editedEmail.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }

    const clean = editedEmail.trim().toLowerCase();
    if (clean === user?.email.toLowerCase()) {
      setIsEditingEmail(false);
      return;
    }

    setEmailUpdating(true);
    try {
      await auth.updateUnverifiedEmail({ newEmail: clean });
      updateUser({ email: clean });
      setIsEditingEmail(false);
      setOtpCode("");
      setOtpError(false);
      setResendCooldown(60);
      toast.success(`Email updated to ${clean}. Verification code dispatched!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update email address.");
    } finally {
      setEmailUpdating(false);
    }
  }

  async function handleVerifyCode(code: string) {
    if (loading) return;
    const cleanCode = code.trim();
    if (cleanCode.length !== 6) return;
    setLoading(true);
    setOtpError(false);

    try {
      const res = await auth.verifyEmail({
        passcode: cleanCode,
        email: user?.email,
      });

      if (res.ok) {
        updateUser({ emailVerified: true });
        toast.success("Email verified successfully!");

        // If user already has 2FA enrolled, complete immediately
        if (user?.twoFactorEnrolled) {
          setModalStage("COMPLETED");
          setTimeout(() => setModalOpen(false), 1200);
        } else {
          // Advance to mandatory 2FA enrollment stage
          setModalStage("ENROLL_2FA");
        }
      }
    } catch (err: any) {
      setOtpError(true);
      toast.error(err.message || "Invalid or expired passcode. Please try again.");
      setOtpCode("");
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete2FAEnrollment() {
    if (!user || !hasConsented) {
      toast.error("Please confirm your consent to enable two-factor authentication.");
      return;
    }

    if (twoFactorMethod === "BIOMETRIC") {
      setBiometricLoading(true);
      try {
        const result = await enrollBiometric(user.id, user.email);
        if (!result.success) {
          toast.error(result.error || "Biometric registration was cancelled. You can select Email OTP instead.");
          setBiometricLoading(false);
          return;
        }

        await auth.enroll2FA({ method: "BIOMETRIC", consent: true }).catch(() => {});
        saveTwoFactorTrust(user.email);
        updateUser({ twoFactorEnrolled: true, twoFactorMethod: "BIOMETRIC" });
        setModalStage("COMPLETED");
        toast.success("Touch ID / Face ID 2FA enrolled! Full access unlocked.");
        setTimeout(() => setModalOpen(false), 1200);
      } catch (err: any) {
        toast.error(err.message || "Failed to register biometrics.");
      } finally {
        setBiometricLoading(false);
      }
    } else {
      setLoading(true);
      try {
        await auth.enroll2FA({ method: "EMAIL_OTP", consent: true }).catch(() => {});
        saveTwoFactorTrust(user.email);
        updateUser({ twoFactorEnrolled: true, twoFactorMethod: "EMAIL_OTP" });
        setModalStage("COMPLETED");
        toast.success("Two-Factor Authentication enrolled! Full access unlocked.");
        setTimeout(() => setModalOpen(false), 1200);
      } catch (err: any) {
        toast.error(err.message || "Failed to complete 2FA enrollment.");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <>
      {/* ─── Modern White/Subtle Warning Banner ──────────────────────────── */}
      <div
        style={{
          background: "#fffbeb",
          borderBottom: "1px solid #fde68a",
          padding: "0.6rem 1rem",
          fontSize: "0.82rem",
          color: "#92400e",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              padding: "0.15rem 0.5rem",
              borderRadius: "6px",
              background: "#fef3c7",
              border: "1px solid #fcd34d",
              fontWeight: 700,
              fontSize: "0.72rem",
              color: "#b45309",
            }}
          >
            <ShieldAlert size={12} />
            <span>View-Only Mode</span>
          </span>
          <span>
            Email verification required for <strong>{user.email}</strong>. Deployments and mutations remain locked until verified.
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            setModalOpen(true);
            setModalStage("VERIFY_CODE");
            if (!otpSent) {
              handleSendVerificationOtp();
            }
          }}
          className="btn btn-primary"
          style={{
            padding: "0.35rem 0.85rem",
            fontSize: "0.78rem",
            fontWeight: 600,
            borderRadius: "7px",
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
          }}
        >
          <Mail size={13} />
          <span>Verify Email Now</span>
          <ArrowRight size={13} />
        </button>
      </div>

      {/* ─── Modern White Verification Modal ────────────────────────────── */}
      {modalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(4px)",
            animation: "fadeIn 0.2s ease-out",
          }}
          onClick={() => !loading && !biometricLoading && setModalOpen(false)}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: "420px",
              background: "#ffffff",
              border: "1px solid var(--border, #e5e7eb)",
              borderRadius: "16px",
              padding: "1.75rem",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              color: "var(--foreground, #111827)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => !loading && !biometricLoading && setModalOpen(false)}
              className="btn btn-ghost"
              style={{
                position: "absolute",
                top: "1rem",
                right: "1rem",
                padding: "0.35rem",
                borderRadius: "8px",
              }}
            >
              <X size={16} />
            </button>

            {/* STAGE 1: VERIFY CODE */}
            {modalStage === "VERIFY_CODE" && (
              <>
                <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "12px",
                      background: "var(--accent-glow, rgba(79, 70, 229, 0.08))",
                      border: "1px solid rgba(79, 70, 229, 0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 0.75rem",
                      color: "var(--accent, #4f46e5)",
                    }}
                  >
                    <Mail size={22} />
                  </div>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
                    Verify Your Email
                  </h3>
                  <p style={{ fontSize: "0.82rem", color: "var(--muted, #6b7280)", marginTop: "0.25rem" }}>
                    Enter the 6-digit code dispatched to:
                  </p>

                  {/* Email with inline correction */}
                  {!isEditingEmail ? (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", marginTop: "0.5rem" }}>
                      <span
                        className="mono"
                        style={{
                          fontSize: "0.82rem",
                          fontWeight: 600,
                          padding: "0.25rem 0.65rem",
                          borderRadius: "6px",
                          background: "var(--bg-subtle, #f9fafb)",
                          border: "1px solid var(--border, #e5e7eb)",
                        }}
                      >
                        {user.email}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditedEmail(user.email);
                          setIsEditingEmail(true);
                        }}
                        className="btn btn-ghost"
                        title="Edit email address"
                        style={{ padding: "0.25rem", fontSize: "0.75rem" }}
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleUpdateEmail} style={{ display: "flex", gap: "0.35rem", marginTop: "0.5rem" }}>
                      <input
                        type="email"
                        required
                        value={editedEmail}
                        onChange={(e) => setEditedEmail(e.target.value)}
                        className="input"
                        placeholder="correct@company.com"
                        style={{ flex: 1, height: "2.2rem", fontSize: "0.82rem" }}
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={emailUpdating || !editedEmail}
                        className="btn btn-primary"
                        style={{ height: "2.2rem", padding: "0 0.65rem" }}
                      >
                        {emailUpdating ? <RefreshCw size={13} className="spin-icon" /> : <Check size={13} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingEmail(false)}
                        className="btn btn-ghost"
                        style={{ height: "2.2rem", padding: "0 0.5rem", fontSize: "0.78rem" }}
                      >
                        Cancel
                      </button>
                    </form>
                  )}
                </div>

                <div
                  style={{
                    background: "var(--bg-subtle, #f9fafb)",
                    border: "1px solid var(--border, #e5e7eb)",
                    borderRadius: "10px",
                    padding: "0.65rem 0.85rem",
                    marginBottom: "1.25rem",
                    fontSize: "0.78rem",
                    color: "var(--muted, #6b7280)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <Lock size={14} style={{ color: "var(--accent, #4f46e5)", flexShrink: 0 }} />
                  <span>One-time verification unlocks deployments, databases, and microservices.</span>
                </div>

                {/* Single Input OTP */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                      <label className="form-label" style={{ marginBottom: 0, fontSize: "0.82rem" }}>Verification Code</label>
                      <button
                        type="button"
                        onClick={handleSendVerificationOtp}
                        disabled={resendCooldown > 0 || loading}
                        className="auth-resend-btn"
                        style={{ fontSize: "0.78rem" }}
                      >
                        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
                      </button>
                    </div>

                    <SingleInputOtp
                      id="banner-verify-otp"
                      value={otpCode}
                      onChange={(val) => {
                        setOtpCode(val);
                        if (otpError) setOtpError(false);
                      }}
                      onComplete={(code) => handleVerifyCode(code)}
                      disabled={loading}
                      error={otpError}
                      autoFocus
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleVerifyCode(otpCode)}
                    disabled={loading || otpCode.length !== 6}
                    className="btn btn-primary btn-lg"
                    style={{ width: "100%", marginTop: "0.25rem" }}
                  >
                    {loading ? (
                      <>
                        <RefreshCw size={15} className="spin-icon" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify Email</span>
                        <ArrowRight size={15} />
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* STAGE 2: MANDATORY 2FA ENROLLMENT */}
            {modalStage === "ENROLL_2FA" && (
              <>
                <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "12px",
                      background: "rgba(16, 185, 129, 0.1)",
                      border: "1px solid rgba(16, 185, 129, 0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 0.75rem",
                      color: "#10b981",
                    }}
                  >
                    <ShieldCheck size={24} />
                  </div>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
                    Enable Two-Factor Authentication
                  </h3>
                  <p style={{ fontSize: "0.82rem", color: "var(--muted, #6b7280)", marginTop: "0.25rem" }}>
                    Mandatory security requirement before modifying cloud resources.
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {/* Method Tabs */}
                  <div className="auth-tab-bar">
                    {biometricSupported && (
                      <button
                        type="button"
                        onClick={() => setTwoFactorMethod("BIOMETRIC")}
                        className={`auth-tab ${twoFactorMethod === "BIOMETRIC" ? "auth-tab-active" : ""}`}
                      >
                        <Fingerprint size={14} />
                        <span>Biometrics</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setTwoFactorMethod("EMAIL_OTP")}
                      className={`auth-tab ${twoFactorMethod === "EMAIL_OTP" ? "auth-tab-active" : ""}`}
                    >
                      <Mail size={14} />
                      <span>Email OTP</span>
                    </button>
                  </div>

                  <div
                    style={{
                      padding: "0.85rem",
                      borderRadius: "10px",
                      background: "var(--bg-subtle, #f9fafb)",
                      border: "1px solid var(--border, #e5e7eb)",
                      fontSize: "0.82rem",
                      color: "var(--muted, #6b7280)",
                    }}
                  >
                    {twoFactorMethod === "BIOMETRIC" ? (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}>
                        <Fingerprint size={16} style={{ color: "var(--accent)", flexShrink: 0, marginTop: "2px" }} />
                        <span>Verifies your identity using Touch ID, Face ID, or Windows Hello.</span>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}>
                        <Mail size={16} style={{ color: "var(--accent)", flexShrink: 0, marginTop: "2px" }} />
                        <span>Sends a 6-digit one-time code to {user.email} upon sign in.</span>
                      </div>
                    )}
                  </div>

                  {/* Consent checkbox */}
                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.6rem",
                      fontSize: "0.82rem",
                      color: "var(--foreground)",
                      cursor: "pointer",
                      lineHeight: 1.4,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={hasConsented}
                      onChange={(e) => setHasConsented(e.target.checked)}
                      style={{ marginTop: "2px", accentColor: "var(--accent)" }}
                    />
                    <span>I agree to enable two-factor authentication for my Whizan Cloud account.</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleComplete2FAEnrollment}
                    disabled={loading || biometricLoading || !hasConsented}
                    className="btn btn-primary btn-lg"
                    style={{ width: "100%", marginTop: "0.25rem" }}
                  >
                    {biometricLoading ? (
                      <>
                        <RefreshCw size={15} className="spin-icon" />
                        <span>Scanning sensor...</span>
                      </>
                    ) : loading ? (
                      <>
                        <RefreshCw size={15} className="spin-icon" />
                        <span>Activating...</span>
                      </>
                    ) : (
                      <>
                        <span>{twoFactorMethod === "BIOMETRIC" ? "Register Biometrics & Unlock" : "Enable Email 2FA & Unlock"}</span>
                        <ArrowRight size={15} />
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* STAGE 3: COMPLETED */}
            {modalStage === "COMPLETED" && (
              <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "16px",
                    background: "rgba(16, 185, 129, 0.12)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 1rem",
                    color: "#10b981",
                  }}
                >
                  <CheckCircle2 size={28} />
                </div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
                  Account Fully Verified!
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--muted, #6b7280)", marginTop: "0.4rem" }}>
                  Email verified and two-factor authentication enabled. Full console access unlocked.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .auth-tab-bar {
          display: flex;
          gap: 0.25rem;
          padding: 3px;
          background: var(--bg-subtle, #f9fafb);
          border-radius: 10px;
          border: 1px solid var(--border-light, #e5e7eb);
        }
        .auth-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.5rem 0.75rem;
          border-radius: 8px;
          font-size: 0.82rem;
          font-weight: 550;
          color: var(--muted, #6b7280);
          background: transparent;
          border: none;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s ease;
        }
        .auth-tab:hover {
          color: var(--foreground, #111827);
        }
        .auth-tab-active {
          background: #ffffff;
          color: var(--foreground, #111827);
          box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.05));
        }
        .auth-resend-btn {
          background: none;
          border: none;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--accent, #4f46e5);
          cursor: pointer;
          font-family: inherit;
          padding: 0;
          transition: opacity 0.15s ease;
        }
        .auth-resend-btn:hover { opacity: 0.8; }
        .auth-resend-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>
    </>
  );
}
