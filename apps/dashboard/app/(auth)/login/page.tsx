"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { auth, type User } from "@/lib/api";
import { sendOtpEmail } from "@/lib/emailjs";
import {
  isBiometricEnrolled,
  isBiometricEnrolledForEmail,
  getBiometricUserEmail,
  verifyBiometric,
  isPlatformBiometricSupported,
  isTwoFactorTrusted,
  saveTwoFactorTrust,
} from "@/lib/webauthn";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { getSafeRedirectUrl } from "@/lib/redirect";
import {
  ArrowRight,
  Lock,
  Mail,
  Fingerprint,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";

type LoginMode = "PASSWORD" | "EMAIL_OTP";
type LoginStage = "ENTER_CREDENTIALS" | "MANDATORY_2FA";

function LoginForm() {
  const { user, setSession } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const reasonParam = searchParams.get("reason");
  const destination = getSafeRedirectUrl(redirectParam, "/dashboard");

  const [mode, setMode] = useState<LoginMode>("PASSWORD");
  const [stage, setStage] = useState<LoginStage>("ENTER_CREDENTIALS");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Pending session held in memory while waiting for 2FA
  const [pendingSession, setPendingSession] = useState<{ accessToken: string; user: User } | null>(null);

  // Biometrics availability on this hardware device
  const [platformSupported, setPlatformSupported] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // 2FA / OTP State
  const [twoFactorMethod, setTwoFactorMethod] = useState<"BIOMETRIC" | "EMAIL_OTP">("BIOMETRIC");
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [localGeneratedOtp, setLocalGeneratedOtp] = useState("");
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // If already authenticated and 2FA verified, redirect straight to destination
  useEffect(() => {
    if (user && stage === "ENTER_CREDENTIALS" && isTwoFactorTrusted(user.email)) {
      router.replace(destination);
    }
  }, [user, destination, router, stage]);

  // Show notice if redirected because 2FA expired or was required
  useEffect(() => {
    if (reasonParam === "2fa_required" || reasonParam === "2fa_expired") {
      toast.info("Two-factor verification required. Please verify your identity.");
    }
  }, [reasonParam]);

  // Check hardware biometric capability on mount
  useEffect(() => {
    isPlatformBiometricSupported().then((supported) => {
      setPlatformSupported(supported);
    });
    const enrolledEmail = getBiometricUserEmail();
    if (enrolledEmail && !email) {
      setEmail(enrolledEmail);
    }
  }, [email]);

  // Cooldown timer for OTP resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  /**
   * Dispatches OTP via API (with client-side fallback)
   */
  async function dispatchOtpToUser(targetEmail: string) {
    const rawOtp = String(Math.floor(100000 + Math.random() * 900000));
    setLocalGeneratedOtp(rawOtp);

    try {
      await auth.sendOtp({ email: targetEmail });
      return true;
    } catch {
      const direct = await sendOtpEmail({
        email: targetEmail,
        passcode: rawOtp,
        time: "15 minutes",
        companyName: "Whizan Cloud Services",
      });
      if (!direct.success) {
        throw new Error(direct.error || "Failed to dispatch verification email.");
      }
      return true;
    }
  }

  /**
   * Handle Password Submission
   * Strictly enforces 2FA if device is not trusted in the past 3 days.
   */
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);

    try {
      // Step 1: Validate credentials with backend
      const res = await auth.login({ email: email.trim(), password });

      // Step 2: Check if this device has satisfied 2FA within the 3-day window
      if (isTwoFactorTrusted(email)) {
        setSession(res.accessToken, res.user);
        toast.success("Welcome back! Trusted device recognized.");
        router.push(destination);
        return;
      }

      // Step 3: Mandatory 2FA Enforcement — HOLD SESSION IN MEMORY ONLY
      setPendingSession(res);
      setStage("MANDATORY_2FA");

      // Check if user has biometric enrolled for THIS email on this device
      const hasBiometricForUser = isBiometricEnrolledForEmail(email);
      if (hasBiometricForUser) {
        setTwoFactorMethod("BIOMETRIC");
      } else {
        setTwoFactorMethod("EMAIL_OTP");
        await dispatchOtpToUser(email.trim());
        setResendCooldown(60);
        toast.info("Verification code sent to your email.");
        setTimeout(() => otpInputRefs.current[0]?.focus(), 150);
      }
    } catch (err: any) {
      toast.error(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handle 2FA Biometric Unlock (Touch ID / Face ID)
   */
  async function handle2FABiometricVerify() {
    if (!pendingSession) return;
    setBiometricLoading(true);

    try {
      const result = await verifyBiometric();
      if (result.success) {
        saveTwoFactorTrust(email.trim());
        setSession(pendingSession.accessToken, pendingSession.user);
        toast.success("Identity verified! Device trusted for 3 days.");
        router.push(destination);
      } else {
        toast.error(result.error || "Biometric authentication failed. Try Email OTP.");
      }
    } catch (err: any) {
      toast.error(err.message || "Biometric error. Switch to Email OTP.");
    } finally {
      setBiometricLoading(false);
    }
  }

  /**
   * Switch 2FA method to Email OTP
   */
  async function handleSwitchToEmailOtp() {
    setTwoFactorMethod("EMAIL_OTP");
    setLoading(true);
    try {
      await dispatchOtpToUser(email.trim());
      setResendCooldown(60);
      toast.success(`Verification code sent to ${email}`);
      setTimeout(() => otpInputRefs.current[0]?.focus(), 150);
    } catch (err: any) {
      toast.error(err.message || "Failed to send verification code.");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handle OTP digit changes
   */
  function handleOtpDigitChange(index: number, val: string) {
    if (!/^\d*$/.test(val)) return;

    const newDigits = [...otpDigits];
    newDigits[index] = val.slice(-1);
    setOtpDigits(newDigits);

    if (val && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    const fullCode = newDigits.join("");
    if (fullCode.length === 6) {
      if (stage === "MANDATORY_2FA") {
        handleComplete2FAOtp(fullCode);
      } else if (mode === "EMAIL_OTP") {
        handleDirectEmailOtpSubmitWithCode(fullCode);
      }
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const newDigits = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i] || "";
    }
    setOtpDigits(newDigits);

    if (pasted.length === 6) {
      if (stage === "MANDATORY_2FA") {
        handleComplete2FAOtp(pasted);
      } else if (mode === "EMAIL_OTP") {
        handleDirectEmailOtpSubmitWithCode(pasted);
      }
    } else {
      otpInputRefs.current[pasted.length]?.focus();
    }
  }

  /**
   * Complete 2FA via Email OTP
   */
  async function handleComplete2FAOtp(code: string) {
    if (!pendingSession || loading) return;
    setLoading(true);

    try {
      let verified = false;
      try {
        const res = await auth.verifyOtp({ email: email.trim(), passcode: code.trim() });
        if (res.ok) verified = true;
      } catch {
        if (localGeneratedOtp && code.trim() === localGeneratedOtp.trim()) {
          verified = true;
        }
      }

      if (verified) {
        saveTwoFactorTrust(email.trim());
        setSession(pendingSession.accessToken, pendingSession.user);
        toast.success("Verified! Device trusted for 3 days.");
        router.push(destination);
      } else {
        toast.error("Invalid code. Please check your email and try again.");
        setOtpDigits(["", "", "", "", "", ""]);
        setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to verify code.");
      setOtpDigits(["", "", "", "", "", ""]);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handle Direct Email OTP Submit (Mode: EMAIL_OTP)
   */
  async function handleDirectEmailOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fullCode = otpDigits.join("");
    if (fullCode.length !== 6) {
      toast.error("Please enter the complete 6-digit code.");
      return;
    }
    handleDirectEmailOtpSubmitWithCode(fullCode);
  }

  async function handleDirectEmailOtpSubmitWithCode(code: string) {
    if (loading) return;
    setLoading(true);

    try {
      const res = await auth.login({ email: email.trim(), passcode: code.trim() });
      saveTwoFactorTrust(email.trim());
      setSession(res.accessToken, res.user);
      toast.success("Signed in successfully!");
      router.push(destination);
    } catch (err: any) {
      toast.error(err.message || "Invalid or expired code. Please try again.");
      setOtpDigits(["", "", "", "", "", ""]);
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  }

  // OTP input row component
  const OtpInputRow = ({ onSubmit }: { onSubmit: (code: string) => void }) => (
    <div className="auth-otp-row" onPaste={handleOtpPaste}>
      {otpDigits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { otpInputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleOtpDigitChange(i, e.target.value)}
          onKeyDown={(e) => handleOtpKeyDown(i, e)}
          className="auth-otp-input"
          autoComplete="one-time-code"
        />
      ))}
    </div>
  );

  return (
    <div className="auth-form-root">
      {stage === "ENTER_CREDENTIALS" ? (
        <>
          {/* Logo */}
          <div className="auth-form-logo">
            <Image src="/whizan_cloud_logo.png" alt="Whizan Cloud" width={44} height={44} className="auth-logo-img" />
          </div>

          <h2 className="auth-form-title">Sign in to your account</h2>
          <p className="auth-form-subtitle">
            Enter your credentials to access the console
          </p>

          {/* Quick Biometric Shortcut if enrolled on this device */}
          {platformSupported && isBiometricEnrolled() && (
            <div style={{ marginBottom: "1.5rem" }}>
              <button
                type="button"
                onClick={async () => {
                  const enrolled = getBiometricUserEmail();
                  if (enrolled) setEmail(enrolled);
                  setBiometricLoading(true);
                  try {
                    const res = await verifyBiometric();
                    if (res.success && res.email) {
                      toast.info("Biometric verified! Enter your password to complete login.");
                    } else {
                      toast.error(res.error || "Biometric scan failed");
                    }
                  } finally {
                    setBiometricLoading(false);
                  }
                }}
                disabled={biometricLoading}
                className="auth-biometric-shortcut"
              >
                {biometricLoading ? (
                  <>
                    <RefreshCw size={16} className="spin-icon" style={{ color: "var(--accent)" }} />
                    <span>Scanning...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint size={16} style={{ color: "var(--accent)" }} />
                    <span>Sign in with biometrics</span>
                  </>
                )}
              </button>

              <div className="auth-divider">
                <div className="auth-divider-line" />
                <span className="auth-divider-text">or use credentials</span>
                <div className="auth-divider-line" />
              </div>
            </div>
          )}

          {/* Login Mode Tabs */}
          <div className="auth-tab-bar">
            <button
              type="button"
              onClick={() => setMode("PASSWORD")}
              className={`auth-tab ${mode === "PASSWORD" ? "auth-tab-active" : ""}`}
            >
              <Lock size={14} />
              <span>Password</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("EMAIL_OTP");
                if (email && email.includes("@")) {
                  dispatchOtpToUser(email);
                  setResendCooldown(60);
                }
              }}
              className={`auth-tab ${mode === "EMAIL_OTP" ? "auth-tab-active" : ""}`}
            >
              <Mail size={14} />
              <span>Email OTP</span>
            </button>
          </div>

          {/* Form: Password */}
          {mode === "PASSWORD" ? (
            <form onSubmit={handlePasswordSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="form-label">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="input"
                />
              </div>

              <div>
                <label className="form-label">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input"
                />
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
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Continue</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Form: Direct Email OTP */
            <form onSubmit={handleDirectEmailOtpSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label className="form-label">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="input"
                />
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>6-Digit Code</label>
                  <button
                    type="button"
                    onClick={() => dispatchOtpToUser(email)}
                    disabled={resendCooldown > 0 || loading || !email}
                    className="auth-resend-btn"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Send Code"}
                  </button>
                </div>
                <OtpInputRow onSubmit={(code) => handleDirectEmailOtpSubmitWithCode(code)} />
              </div>

              <button
                type="submit"
                disabled={loading || otpDigits.join("").length !== 6}
                className="btn btn-primary btn-lg"
                style={{ width: "100%", marginTop: "0.25rem" }}
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="spin-icon" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Verify & Sign In</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          <div className="auth-form-footer">
            Don&apos;t have an account?{" "}
            <Link
              href={redirectParam ? `/register?redirect=${encodeURIComponent(redirectParam)}` : "/register"}
              className="auth-form-link"
            >
              Create Account
            </Link>
          </div>
        </>
      ) : (
        /* ── STAGE 2: MANDATORY 2-STEP VERIFICATION ── */
        <>
          <div className="auth-form-logo">
            {twoFactorMethod === "BIOMETRIC" ? (
              <div className="auth-icon-circle auth-icon-accent">
                <Fingerprint size={24} />
              </div>
            ) : (
              <div className="auth-icon-circle auth-icon-accent">
                <ShieldCheck size={24} />
              </div>
            )}
          </div>

          <h2 className="auth-form-title">Two-Factor Verification</h2>
          <p className="auth-form-subtitle">
            {twoFactorMethod === "BIOMETRIC"
              ? "Use your biometric sensor to verify your identity"
              : "Enter the 6-digit code sent to your email"}
          </p>

          <div className="auth-email-pill">
            <Mail size={14} />
            <span className="mono" style={{ fontSize: "0.82rem" }}>{email}</span>
          </div>

          <div className="auth-trust-notice">
            <ShieldCheck size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <span>Verification grants a 3-day trusted session on this device.</span>
          </div>

          {/* Biometric Option */}
          {twoFactorMethod === "BIOMETRIC" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={handle2FABiometricVerify}
                disabled={biometricLoading}
                className="btn btn-primary btn-lg"
                style={{ width: "100%" }}
              >
                {biometricLoading ? (
                  <>
                    <RefreshCw size={16} className="spin-icon" />
                    <span>Scanning...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint size={16} />
                    <span>Verify with Touch ID / Face ID</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSwitchToEmailOtp}
                className="btn btn-ghost"
                style={{ width: "100%" }}
              >
                <Mail size={14} />
                <span>Use Email OTP instead</span>
              </button>
            </div>
          ) : (
            /* Email OTP Option */
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Verification Code</label>
                  <button
                    type="button"
                    onClick={() => {
                      dispatchOtpToUser(email);
                      setResendCooldown(60);
                    }}
                    disabled={resendCooldown > 0 || loading}
                    className="auth-resend-btn"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
                  </button>
                </div>
                <OtpInputRow onSubmit={(code) => handleComplete2FAOtp(code)} />
              </div>

              {platformSupported && isBiometricEnrolledForEmail(email) && (
                <button
                  type="button"
                  onClick={() => setTwoFactorMethod("BIOMETRIC")}
                  className="btn btn-ghost"
                  style={{ width: "100%" }}
                >
                  <Fingerprint size={14} />
                  <span>Switch to biometric</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleComplete2FAOtp(otpDigits.join(""))}
                disabled={loading || otpDigits.join("").length !== 6}
                className="btn btn-primary btn-lg"
                style={{ width: "100%" }}
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="spin-icon" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Verify & Sign In</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          )}

          <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border)", textAlign: "center" }}>
            <button
              type="button"
              onClick={() => {
                setStage("ENTER_CREDENTIALS");
                setPendingSession(null);
                setOtpDigits(["", "", "", "", "", ""]);
              }}
              className="btn btn-ghost"
              style={{ margin: "0 auto" }}
            >
              <ArrowLeft size={14} />
              <span>Back to sign in</span>
            </button>
          </div>
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
          margin-bottom: 1.5rem;
          line-height: 1.5;
        }
        .auth-biometric-shortcut {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.65rem 1rem;
          border-radius: 10px;
          background: #ffffff;
          border: 1px solid var(--border);
          font-size: 0.875rem;
          font-weight: 550;
          color: var(--foreground);
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: inherit;
          box-shadow: var(--shadow-sm);
        }
        .auth-biometric-shortcut:hover {
          border-color: var(--card-border-hover);
          background: var(--bg-inset);
          box-shadow: var(--shadow);
        }
        .auth-divider {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-top: 1.25rem;
        }
        .auth-divider-line {
          flex: 1;
          height: 1px;
          background: var(--border);
        }
        .auth-divider-text {
          font-size: 0.75rem;
          color: var(--muted-fg);
          font-weight: 500;
          white-space: nowrap;
        }
        .auth-tab-bar {
          display: flex;
          gap: 0.25rem;
          padding: 3px;
          background: var(--bg-subtle);
          border-radius: 10px;
          margin-bottom: 1.25rem;
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
        .auth-otp-row {
          display: flex;
          gap: 0.5rem;
          justify-content: space-between;
        }
        .auth-otp-input {
          width: 46px;
          height: 50px;
          text-align: center;
          font-size: 1.25rem;
          font-weight: 700;
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          background: #ffffff;
          border: 1.5px solid var(--card-border);
          border-radius: 10px;
          color: var(--foreground);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          box-shadow: var(--shadow-sm);
        }
        .auth-otp-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
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
          margin: 0 auto 1rem;
          display: flex;
          justify-content: center;
          width: fit-content;
          margin-left: auto;
          margin-right: auto;
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
          margin-bottom: 1.25rem;
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: 200 }} className="skeleton" />}>
      <LoginForm />
    </Suspense>
  );
}
