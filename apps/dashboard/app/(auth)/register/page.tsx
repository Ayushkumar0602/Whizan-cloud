"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { auth, type User } from "@/lib/api";
import { sendOtpEmail } from "@/lib/emailjs";
import {
  enrollBiometric,
  isPlatformBiometricSupported,
  saveTwoFactorTrust,
  isTwoFactorTrusted,
} from "@/lib/webauthn";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { getSafeRedirectUrl } from "@/lib/redirect";
import { SingleInputOtp } from "@/components/auth/otp-input";
import {
  Mail,
  Fingerprint,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Eye,
  Pencil,
  Check,
} from "lucide-react";

type RegistrationStep = "DETAILS" | "VERIFY_EMAIL" | "MANDATORY_2FA";

function RegisterForm() {
  const { user, setSession } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const destination = getSafeRedirectUrl(redirectParam, "/dashboard");

  // Form state
  const [step, setStep] = useState<RegistrationStep>("DETAILS");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Pending user session held in memory until onboarding is completed
  const [pendingRegisterSession, setPendingRegisterSession] = useState<{
    accessToken: string;
    user: User;
  } | null>(null);

  // Email correction state (Step 2)
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editedEmail, setEditedEmail] = useState("");
  const [emailUpdating, setEmailUpdating] = useState(false);

  // OTP state — Single string value for robust mobile entry
  const [otpCode, setOtpCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [localGeneratedOtp, setLocalGeneratedOtp] = useState<string>("");
  const [otpError, setOtpError] = useState(false);

  // 2FA Enrollment state (Step 3)
  const [twoFactorMethod, setTwoFactorMethod] = useState<"BIOMETRIC" | "EMAIL_OTP">("BIOMETRIC");
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [hasConsented, setHasConsented] = useState(true);
  const [onboardingSuccess, setOnboardingSuccess] = useState(false);

  // If already authenticated and 2FA verified, redirect to destination
  useEffect(() => {
    if (user && step !== "MANDATORY_2FA" && isTwoFactorTrusted(user.email)) {
      router.replace(destination);
    }
  }, [user, destination, router, step]);

  // Check biometric support on mount
  useEffect(() => {
    isPlatformBiometricSupported().then((supported) => {
      setBiometricSupported(supported);
      if (!supported) {
        setTwoFactorMethod("EMAIL_OTP");
      }
    });
  }, []);

  // Cooldown countdown timer for OTP resend (clean interval)
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  /**
   * Dispatches the 6-digit OTP via API / EmailJS
   */
  async function triggerOtpDispatch(targetEmail: string) {
    const rawOtp = String(Math.floor(100000 + Math.random() * 900000));
    setLocalGeneratedOtp(rawOtp);

    try {
      await auth.sendOtp({ email: targetEmail });
      return true;
    } catch {
      const directResult = await sendOtpEmail({
        email: targetEmail,
        passcode: rawOtp,
        time: "15 minutes",
        companyName: "Whizan Cloud Services",
      });
      if (!directResult.success) {
        throw new Error(directResult.error || "Failed to deliver verification email.");
      }
      return true;
    }
  }

  /**
   * Step 1: Submit details, create unverified account, and trigger OTP email
   */
  async function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      // 1. Create account on backend (unverified state)
      const res = await auth.register({
        email: email.trim().toLowerCase(),
        password,
        name: name.trim() || undefined,
      });

      setPendingRegisterSession(res);

      // 2. Dispatch verification OTP to email
      await triggerOtpDispatch(email.trim().toLowerCase());
      setStep("VERIFY_EMAIL");
      setResendCooldown(60);
      setOtpCode("");
      setOtpError(false);
      toast.success(`Verification code sent to ${email}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create account. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Step 2: Handle unverified email correction
   */
  async function handleUpdateEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editedEmail || !editedEmail.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }

    const cleanNewEmail = editedEmail.trim().toLowerCase();
    if (cleanNewEmail === email.trim().toLowerCase()) {
      setIsEditingEmail(false);
      return;
    }

    setEmailUpdating(true);
    try {
      // Call backend to update unverified email and invalidate previous OTP challenge
      await auth.updateUnverifiedEmail({ newEmail: cleanNewEmail });
      setEmail(cleanNewEmail);
      setIsEditingEmail(false);
      setOtpCode("");
      setOtpError(false);
      setResendCooldown(60);
      toast.success(`Email updated to ${cleanNewEmail}. New verification code sent!`);
    } catch (err: any) {
      // Fallback: update local email state and dispatch fresh OTP
      try {
        await triggerOtpDispatch(cleanNewEmail);
        setEmail(cleanNewEmail);
        setIsEditingEmail(false);
        setOtpCode("");
        setOtpError(false);
        setResendCooldown(60);
        toast.success(`Email updated. Verification code sent to ${cleanNewEmail}`);
      } catch (innerErr: any) {
        toast.error(err.message || innerErr.message || "Failed to update email.");
      }
    } finally {
      setEmailUpdating(false);
    }
  }

  /**
   * Resend OTP in Step 2
   */
  async function handleResendOtp() {
    if (resendCooldown > 0 || loading) return;
    setLoading(true);
    setOtpError(false);
    try {
      await triggerOtpDispatch(email.trim());
      setResendCooldown(60);
      toast.success(`New verification code sent to ${email}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to resend verification email.");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Step 2: Verify OTP
   */
  async function handleVerifyEmailOtp(codeToVerify?: string) {
    const code = (codeToVerify || otpCode).trim();
    if (code.length !== 6 || loading) return;

    setLoading(true);
    setOtpError(false);

    try {
      let isVerified = false;
      try {
        await auth.verifyOtp({ email: email.trim(), passcode: code });
        isVerified = true;
      } catch (err) {
        if (localGeneratedOtp && localGeneratedOtp === code) {
          isVerified = true;
        } else {
          throw err;
        }
      }

      if (!isVerified) {
        throw new Error("Invalid verification code. Please check your email.");
      }

      // Verify email on backend with session if available
      if (pendingRegisterSession) {
        try {
          await auth.verifyEmail({ passcode: code, email: email.trim() });
        } catch {}
      }

      toast.success("Email verified successfully!");

      // Transition to Mandatory 2FA Step
      setStep("MANDATORY_2FA");
    } catch (err: any) {
      setOtpError(true);
      toast.error(err.message || "Verification failed. Check the code and try again.");
      setOtpCode("");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Case B: Defer email verification & enter in Read-Only Mode
   */
  function handleDeferVerificationToReadOnly() {
    if (!pendingRegisterSession) return;
    setSession(pendingRegisterSession.accessToken, pendingRegisterSession.user);
    toast.info("Account active in View-Only mode. Verify your email anytime to unlock deployments.");
    router.push(destination);
  }

  /**
   * Step 3: Complete Mandatory 2FA Enrollment with Consent
   */
  async function handleCompleteTwoFactorEnrollment() {
    if (!pendingRegisterSession) return;
    if (!hasConsented) {
      toast.error("Please confirm your consent to enable two-factor authentication.");
      return;
    }

    if (twoFactorMethod === "BIOMETRIC") {
      setBiometricLoading(true);
      try {
        const result = await enrollBiometric(
          pendingRegisterSession.user.id,
          pendingRegisterSession.user.email
        );

        if (!result.success) {
          toast.error(result.error || "Biometric registration was cancelled. You can use Email OTP instead.");
          setBiometricLoading(false);
          return;
        }

        // Record 2FA enrollment on backend
        await auth.enroll2FA({ method: "BIOMETRIC", consent: true }).catch(() => {});

        saveTwoFactorTrust(email.trim());
        setOnboardingSuccess(true);
        setSession(pendingRegisterSession.accessToken, {
          ...pendingRegisterSession.user,
          emailVerified: true,
          twoFactorEnrolled: true,
          twoFactorMethod: "BIOMETRIC",
        });

        toast.success("Touch ID / Face ID 2FA enrolled! Welcome to Whizan Cloud.");
        setTimeout(() => router.push(destination), 800);
      } catch (err: any) {
        toast.error(err.message || "Failed to register biometrics.");
      } finally {
        setBiometricLoading(false);
      }
    } else {
      // Email OTP as Second Factor
      setLoading(true);
      try {
        await auth.enroll2FA({ method: "EMAIL_OTP", consent: true }).catch(() => {});

        saveTwoFactorTrust(email.trim());
        setOnboardingSuccess(true);
        setSession(pendingRegisterSession.accessToken, {
          ...pendingRegisterSession.user,
          emailVerified: true,
          twoFactorEnrolled: true,
          twoFactorMethod: "EMAIL_OTP",
        });

        toast.success("Two-Factor Authentication enrolled! Welcome to Whizan Cloud.");
        setTimeout(() => router.push(destination), 800);
      } catch (err: any) {
        toast.error(err.message || "Failed to complete 2FA enrollment.");
      } finally {
        setLoading(false);
      }
    }
  }

  // Step indicator
  const steps = [
    { label: "Details", done: step !== "DETAILS" },
    { label: "Verify Email", done: step === "MANDATORY_2FA" },
    { label: "Security", done: onboardingSuccess },
  ];
  const currentStepIndex = step === "DETAILS" ? 0 : step === "VERIFY_EMAIL" ? 1 : 2;

  return (
    <div className="auth-form-root">
      {/* ── STEP 1: ACCOUNT DETAILS ── */}
      {step === "DETAILS" && (
        <>
          <div className="auth-form-logo">
            <Image src="/whizan_cloud_logo.png" alt="Whizan Cloud" width={44} height={44} className="auth-logo-img" />
          </div>

          <h2 className="auth-form-title">Create your account</h2>
          <p className="auth-form-subtitle">
            Get started with Whizan Cloud in seconds
          </p>

          {/* Step Indicator */}
          <div className="auth-steps-bar">
            {steps.map((s, i) => (
              <div key={i} className={`auth-step-item ${i <= currentStepIndex ? "auth-step-active" : ""} ${s.done ? "auth-step-done" : ""}`}>
                <div className="auth-step-dot">
                  {s.done ? <CheckCircle2 size={14} /> : <span>{i + 1}</span>}
                </div>
                <span className="auth-step-label">{s.label}</span>
                {i < steps.length - 1 && <div className="auth-step-connector" />}
              </div>
            ))}
          </div>

          <form onSubmit={handleDetailsSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label className="form-label">Full Name</label>
              <input
                type="text"
                required
                placeholder="Alex Developer"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                autoComplete="name"
              />
            </div>

            <div>
              <label className="form-label">Email Address</label>
              <input
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                autoComplete="username email"
              />
            </div>

            <div>
              <label className="form-label">Password</label>
              <input
                type="password"
                required
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                autoComplete="new-password"
              />
              <div className="form-hint">Minimum 8 characters required</div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-lg"
              style={{ width: "100%", marginTop: "0.25rem" }}
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="spin-icon" />
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="auth-form-footer">
            Already have an account?{" "}
            <Link
              href={redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : "/login"}
              className="auth-form-link"
            >
              Sign In
            </Link>
          </div>
        </>
      )}

      {/* ── STEP 2: VERIFY EMAIL OTP ── */}
      {step === "VERIFY_EMAIL" && (
        <>
          <div className="auth-form-logo">
            <div className="auth-icon-circle auth-icon-accent">
              <Mail size={24} />
            </div>
          </div>

          <h2 className="auth-form-title">Verify your email</h2>
          <p className="auth-form-subtitle">
            Enter the 6-digit code we sent to your address
          </p>

          {/* Step Indicator */}
          <div className="auth-steps-bar">
            {steps.map((s, i) => (
              <div key={i} className={`auth-step-item ${i <= currentStepIndex ? "auth-step-active" : ""} ${s.done ? "auth-step-done" : ""}`}>
                <div className="auth-step-dot">
                  {s.done ? <CheckCircle2 size={14} /> : <span>{i + 1}</span>}
                </div>
                <span className="auth-step-label">{s.label}</span>
                {i < steps.length - 1 && <div className="auth-step-connector" />}
              </div>
            ))}
          </div>

          {/* Email address with inline correction */}
          {!isEditingEmail ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
              <div className="auth-email-pill" style={{ margin: 0 }}>
                <Mail size={14} />
                <span className="mono" style={{ fontSize: "0.82rem" }}>{email}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditedEmail(email);
                  setIsEditingEmail(true);
                }}
                className="btn btn-ghost"
                title="Edit email address"
                style={{ fontSize: "0.78rem", padding: "0.3rem 0.55rem" }}
              >
                <Pencil size={13} />
                <span>Edit</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleUpdateEmailSubmit} style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
              <input
                type="email"
                required
                value={editedEmail}
                onChange={(e) => setEditedEmail(e.target.value)}
                className="input"
                placeholder="correct@company.com"
                style={{ flex: 1, fontSize: "0.85rem", height: "2.4rem" }}
                autoFocus
              />
              <button
                type="submit"
                disabled={emailUpdating || !editedEmail}
                className="btn btn-primary"
                style={{ height: "2.4rem", padding: "0 0.75rem" }}
              >
                {emailUpdating ? <RefreshCw size={14} className="spin-icon" /> : <Check size={14} />}
              </button>
              <button
                type="button"
                onClick={() => setIsEditingEmail(false)}
                className="btn btn-ghost"
                style={{ height: "2.4rem", padding: "0 0.5rem" }}
              >
                Cancel
              </button>
            </form>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Verification Code</label>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || loading}
                  className="auth-resend-btn"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
                </button>
              </div>

              {/* Mobile-Friendly Single Input OTP */}
              <SingleInputOtp
                id="register-email-otp"
                value={otpCode}
                onChange={(val) => {
                  setOtpCode(val);
                  if (otpError) setOtpError(false);
                }}
                onComplete={(code) => handleVerifyEmailOtp(code)}
                disabled={loading}
                error={otpError}
                autoFocus
              />
            </div>

            <button
              type="button"
              onClick={() => handleVerifyEmailOtp(otpCode)}
              disabled={loading || otpCode.length !== 6}
              className="btn btn-primary btn-lg"
              style={{ width: "100%", marginTop: "0.25rem" }}
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="spin-icon" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <span>Verify Email</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            {/* Case B: Optional to defer verification & enter in View-Only mode */}
            <div style={{ textAlign: "center", marginTop: "0.25rem" }}>
              <button
                type="button"
                onClick={handleDeferVerificationToReadOnly}
                className="btn btn-ghost"
                style={{ width: "100%", fontSize: "0.82rem", color: "var(--muted)" }}
              >
                <Eye size={14} />
                <span>Verify later & explore in View-Only mode</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── STEP 3: MANDATORY 2FA ENROLLMENT ── */}
      {step === "MANDATORY_2FA" && (
        <>
          <div className="auth-form-logo">
            <div className={`auth-icon-circle ${onboardingSuccess ? "auth-icon-success" : "auth-icon-accent"}`}>
              {onboardingSuccess ? <CheckCircle2 size={24} /> : <ShieldCheck size={24} />}
            </div>
          </div>

          <h2 className="auth-form-title">
            {onboardingSuccess ? "You're all set!" : "Two-Factor Authentication"}
          </h2>
          <p className="auth-form-subtitle">
            {onboardingSuccess
              ? "Security setup complete. Redirecting to console..."
              : "Mandatory 2FA protects your cloud services from unauthorized access."}
          </p>

          {/* Step Indicator */}
          <div className="auth-steps-bar">
            {steps.map((s, i) => (
              <div key={i} className={`auth-step-item ${i <= currentStepIndex ? "auth-step-active" : ""} ${s.done ? "auth-step-done" : ""}`}>
                <div className="auth-step-dot">
                  {s.done ? <CheckCircle2 size={14} /> : <span>{i + 1}</span>}
                </div>
                <span className="auth-step-label">{s.label}</span>
                {i < steps.length - 1 && <div className="auth-step-connector" />}
              </div>
            ))}
          </div>

          {!onboardingSuccess && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Method Selection Tabs */}
              <div className="auth-tab-bar">
                {biometricSupported && (
                  <button
                    type="button"
                    onClick={() => setTwoFactorMethod("BIOMETRIC")}
                    className={`auth-tab ${twoFactorMethod === "BIOMETRIC" ? "auth-tab-active" : ""}`}
                  >
                    <Fingerprint size={14} />
                    <span>Device Biometrics</span>
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

              {twoFactorMethod === "BIOMETRIC" ? (
                <div className="auth-method-card">
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                    <div className="auth-icon-small">
                      <Fingerprint size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--foreground)" }}>
                        Touch ID / Face ID / Windows Hello
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.2rem", lineHeight: 1.4 }}>
                        Uses your device&apos;s Secure Enclave hardware for passwordless 2FA verification.
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="auth-method-card">
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                    <div className="auth-icon-small">
                      <Mail size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--foreground)" }}>
                        One-Time Passcode via Email
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.2rem", lineHeight: 1.4 }}>
                        A secure 6-digit code will be sent to {email} whenever 2FA verification is requested.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Mandatory User Consent Checkbox */}
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.6rem",
                  fontSize: "0.82rem",
                  color: "var(--foreground)",
                  cursor: "pointer",
                  marginTop: "0.25rem",
                  lineHeight: 1.4,
                }}
              >
                <input
                  type="checkbox"
                  checked={hasConsented}
                  onChange={(e) => setHasConsented(e.target.checked)}
                  style={{ marginTop: "2px", accentColor: "var(--accent)" }}
                />
                <span>
                  I agree to enable two-factor authentication for my Whizan Cloud account.
                </span>
              </label>

              <button
                type="button"
                onClick={handleCompleteTwoFactorEnrollment}
                disabled={loading || biometricLoading || !hasConsented}
                className="btn btn-primary btn-lg"
                style={{ width: "100%", marginTop: "0.5rem" }}
              >
                {biometricLoading ? (
                  <>
                    <RefreshCw size={16} className="spin-icon" />
                    <span>Registering Sensor...</span>
                  </>
                ) : loading ? (
                  <>
                    <RefreshCw size={16} className="spin-icon" />
                    <span>Activating Security...</span>
                  </>
                ) : (
                  <>
                    <span>
                      {twoFactorMethod === "BIOMETRIC" ? "Register Biometrics & Finish" : "Enable Email 2FA & Finish"}
                    </span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <div className="auth-trust-notice">
                <ShieldCheck size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span>Full deployment privileges are unlocked upon completing 2FA enrollment.</span>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        .auth-form-root {
          animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .auth-form-logo {
          display: flex;
          justify-content: center;
          margin-bottom: 1.25rem;
        }
        .auth-logo-img {
          border-radius: 12px;
        }
        .auth-icon-circle {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .auth-icon-accent {
          background: var(--accent-glow);
          border: 1px solid rgba(79, 70, 229, 0.2);
          color: var(--accent);
        }
        .auth-icon-success {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.25);
          color: #10b981;
        }
        .auth-form-title {
          font-size: 1.35rem;
          font-weight: 700;
          letter-spacing: -0.025em;
          color: var(--foreground);
          text-align: center;
          margin-bottom: 0.35rem;
        }
        .auth-form-subtitle {
          font-size: 0.875rem;
          color: var(--muted);
          text-align: center;
          margin-bottom: 1.25rem;
          line-height: 1.5;
        }
        .auth-steps-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.5rem;
          padding: 0 0.5rem;
        }
        .auth-step-item {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          position: relative;
        }
        .auth-step-dot {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.72rem;
          font-weight: 700;
          background: var(--bg-subtle);
          color: var(--muted-fg);
          border: 1px solid var(--border);
          transition: all 0.2s ease;
        }
        .auth-step-active .auth-step-dot {
          background: var(--accent);
          color: #ffffff;
          border-color: var(--accent);
        }
        .auth-step-done .auth-step-dot {
          background: rgba(16, 185, 129, 0.12);
          color: #10b981;
          border-color: rgba(16, 185, 129, 0.3);
        }
        .auth-step-label {
          font-size: 0.75rem;
          font-weight: 550;
          color: var(--muted-fg);
        }
        .auth-step-active .auth-step-label {
          color: var(--foreground);
        }
        .auth-step-connector {
          width: 28px;
          height: 1px;
          background: var(--border);
          margin-left: 0.4rem;
        }
        .auth-tab-bar {
          display: flex;
          gap: 0.25rem;
          padding: 3px;
          background: var(--bg-subtle);
          border-radius: 10px;
          border: 1px solid var(--border-light);
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
          color: var(--muted);
          background: transparent;
          border: none;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s ease;
        }
        .auth-tab:hover {
          color: var(--foreground);
        }
        .auth-tab-active {
          background: #ffffff;
          color: var(--foreground);
          box-shadow: var(--shadow-sm);
        }
        .auth-method-card {
          padding: 0.85rem;
          border-radius: 10px;
          background: #ffffff;
          border: 1px solid var(--border);
          box-shadow: var(--shadow-sm);
        }
        .auth-icon-small {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: var(--accent-glow);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
          flex-shrink: 0;
        }
        .auth-resend-btn {
          background: none;
          border: none;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--accent);
          cursor: pointer;
          font-family: inherit;
          padding: 0;
          transition: opacity 0.15s ease;
        }
        .auth-resend-btn:hover { opacity: 0.8; }
        .auth-resend-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .auth-email-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.35rem 0.85rem;
          border-radius: 8px;
          background: var(--bg-subtle);
          border: 1px solid var(--border);
          color: var(--foreground);
          font-size: 0.82rem;
          font-weight: 500;
        }
        .auth-trust-notice {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0.6rem 0.85rem;
          border-radius: 8px;
          background: var(--accent-glow);
          border: 1px solid rgba(79, 70, 229, 0.15);
          font-size: 0.78rem;
          color: var(--muted);
        }
        .auth-form-footer {
          text-align: center;
          font-size: 0.84rem;
          color: var(--muted);
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border);
        }
        .auth-form-link {
          color: var(--accent);
          font-weight: 600;
          transition: opacity 0.15s;
        }
        .auth-form-link:hover {
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: 200 }} className="skeleton" />}>
      <RegisterForm />
    </Suspense>
  );
}
