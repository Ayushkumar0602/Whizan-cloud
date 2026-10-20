"use client";

import { useState, useEffect, useRef, Suspense } from "react";
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
import {
  Mail,
  Fingerprint,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Lock,
  User as UserIcon,
} from "lucide-react";

type RegistrationStep = "DETAILS" | "VERIFY_EMAIL" | "BIOMETRIC_SETUP";

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

  // Pending user session held in memory until Biometric step is resolved
  const [pendingRegisterSession, setPendingRegisterSession] = useState<{
    accessToken: string;
    user: User;
  } | null>(null);

  // OTP state
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [localGeneratedOtp, setLocalGeneratedOtp] = useState<string>("");
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Biometrics state
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricSuccess, setBiometricSuccess] = useState(false);

  // If already authenticated and 2FA verified, redirect to destination
  useEffect(() => {
    if (user && step !== "BIOMETRIC_SETUP" && isTwoFactorTrusted(user.email)) {
      router.replace(destination);
    }
  }, [user, destination, router, step]);

  // Check biometric support on mount
  useEffect(() => {
    isPlatformBiometricSupported().then(setBiometricSupported);
  }, []);

  // Cooldown countdown timer for OTP resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  /**
   * Dispatches the 6-digit OTP via EmailJS / API
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
   * Step 1: Submit details and trigger OTP email
   */
  async function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      await triggerOtpDispatch(email.trim());
      setStep("VERIFY_EMAIL");
      setResendCooldown(60);
      toast.success(`Verification code sent to ${email}`);
      setTimeout(() => otpInputRefs.current[0]?.focus(), 150);
    } catch (err: any) {
      toast.error(err.message || "Failed to send verification email.");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Resend OTP
   */
  async function handleResendOtp() {
    if (resendCooldown > 0 || loading) return;
    setLoading(true);
    try {
      await triggerOtpDispatch(email.trim());
      setResendCooldown(60);
      toast.success(`New verification code sent to ${email}`);
      setTimeout(() => otpInputRefs.current[0]?.focus(), 150);
    } catch (err: any) {
      toast.error(err.message || "Failed to resend verification email.");
    } finally {
      setLoading(false);
    }
  }

  /**
   * OTP input handlers
   */
  function handleDigitChange(index: number, val: string) {
    if (!/^\d*$/.test(val)) return;

    const newDigits = [...otpDigits];
    newDigits[index] = val.slice(-1);
    setOtpDigits(newDigits);

    if (val && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    const fullCode = newDigits.join("");
    if (fullCode.length === 6) {
      verifyAndRegister(fullCode);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const newDigits = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i] || "";
    }
    setOtpDigits(newDigits);

    if (pasted.length === 6) {
      verifyAndRegister(pasted);
    } else {
      otpInputRefs.current[pasted.length]?.focus();
    }
  }

  /**
   * Step 2: Verify OTP and Register user on backend
   * CRITICAL: Transitions straight to Step 3 (BIOMETRIC_SETUP) WITHOUT skipping!
   */
  async function verifyAndRegister(codeToVerify?: string) {
    const code = (codeToVerify || otpDigits.join("")).trim();
    if (code.length !== 6) {
      toast.error("Please enter the complete 6-digit code");
      return;
    }

    setLoading(true);
    try {
      // 1. Verify code
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

      // 2. Complete registration on backend
      const res = await auth.register({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
        passcode: code,
      });

      // Save pending session in memory
      setPendingRegisterSession(res);

      toast.success("Email verified and account created!");

      // 3. ALWAYS transition to Biometric Setup step!
      setStep("BIOMETRIC_SETUP");
    } catch (err: any) {
      toast.error(err.message || "Verification failed. Check the code and try again.");
      setOtpDigits(["", "", "", "", "", ""]);
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Step 3: Enroll Biometrics (Face ID / Touch ID / Windows Hello)
   */
  async function handleBiometricEnroll() {
    if (!pendingRegisterSession) return;
    setBiometricLoading(true);

    try {
      const result = await enrollBiometric(
        pendingRegisterSession.user.id,
        pendingRegisterSession.user.email
      );

      if (result.success) {
        setBiometricSuccess(true);
        saveTwoFactorTrust(email.trim());
        setSession(pendingRegisterSession.accessToken, pendingRegisterSession.user);
        toast.success("Biometric security enabled! Welcome to Whizan Cloud.");
        setTimeout(() => {
          router.push(destination);
        }, 800);
      } else {
        toast.error(result.error || "Biometric registration was cancelled.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to register biometrics.");
    } finally {
      setBiometricLoading(false);
    }
  }

  /**
   * Skip biometrics and complete registration with 3-day trust
   */
  function handleSkipBiometrics() {
    if (!pendingRegisterSession) return;
    saveTwoFactorTrust(email.trim());
    setSession(pendingRegisterSession.accessToken, pendingRegisterSession.user);
    toast.success("Welcome to Whizan Cloud! You can set up biometrics later in Settings.");
    router.push(destination);
  }

  // Step indicator
  const steps = [
    { label: "Details", done: step !== "DETAILS" },
    { label: "Verify Email", done: step === "BIOMETRIC_SETUP" },
    { label: "Security", done: biometricSuccess },
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
                  <span>Sending verification code...</span>
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
            Enter the 6-digit code we sent to:
          </p>

          <div className="auth-email-pill">
            <Mail size={14} />
            <span className="mono" style={{ fontSize: "0.82rem" }}>{email}</span>
          </div>

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

              <div className="auth-otp-row" onPaste={handlePaste}>
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpInputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className="auth-otp-input"
                    autoComplete="one-time-code"
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => verifyAndRegister()}
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
                  <span>Verify & Create Account</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("DETAILS");
                setOtpDigits(["", "", "", "", "", ""]);
              }}
              className="btn btn-ghost"
              style={{ width: "100%" }}
            >
              <ArrowLeft size={14} />
              <span>Change email or password</span>
            </button>
          </div>
        </>
      )}

      {/* ── STEP 3: BIOMETRIC REGISTRATION ── */}
      {step === "BIOMETRIC_SETUP" && (
        <>
          <div className="auth-form-logo">
            <div className={`auth-icon-circle ${biometricSuccess ? "auth-icon-success" : "auth-icon-accent"}`}>
              {biometricSuccess ? <CheckCircle2 size={24} /> : <Fingerprint size={24} />}
            </div>
          </div>

          <h2 className="auth-form-title">
            {biometricSuccess ? "You're all set!" : "Set up security"}
          </h2>
          <p className="auth-form-subtitle">
            {biometricSuccess
              ? "Biometric authentication enabled. Redirecting..."
              : biometricSupported
                ? "Enable Touch ID, Face ID, or Windows Hello for quick 2FA on this device."
                : "Your device doesn't support biometrics. You'll use email OTP for 2FA verification."
            }
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

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {biometricSupported && !biometricSuccess && (
              <button
                type="button"
                onClick={handleBiometricEnroll}
                disabled={biometricLoading || biometricSuccess}
                className="btn btn-primary btn-lg"
                style={{ width: "100%" }}
              >
                {biometricLoading ? (
                  <>
                    <RefreshCw size={16} className="spin-icon" />
                    <span>Registering...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint size={16} />
                    <span>Enable Touch ID / Face ID</span>
                  </>
                )}
              </button>
            )}

            {!biometricSuccess && (
              <button
                type="button"
                onClick={handleSkipBiometrics}
                className={biometricSupported ? "btn btn-ghost" : "btn btn-primary btn-lg"}
                style={{ width: "100%" }}
              >
                {biometricSupported ? (
                  <>
                    <span>Skip — use Email OTP</span>
                    <ArrowRight size={14} />
                  </>
                ) : (
                  <>
                    <span>Continue with Email OTP</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            )}
          </div>

          {!biometricSuccess && (
            <div className="auth-trust-notice" style={{ marginTop: "1rem" }}>
              <ShieldCheck size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
              <span>Two-factor verification is mandatory. You can always change your method in Settings.</span>
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
          background: var(--success-bg);
          border: 1px solid var(--success-border);
          color: var(--success);
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
          justify-content: center;
          gap: 0;
          margin-bottom: 1.5rem;
        }
        .auth-step-item {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }
        .auth-step-dot {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          font-weight: 700;
          background: var(--bg-subtle);
          border: 1.5px solid var(--border);
          color: var(--muted-fg);
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .auth-step-active .auth-step-dot {
          background: var(--accent-glow);
          border-color: var(--accent);
          color: var(--accent);
        }
        .auth-step-done .auth-step-dot {
          background: var(--success-bg);
          border-color: var(--success);
          color: var(--success);
        }
        .auth-step-label {
          font-size: 0.72rem;
          font-weight: 600;
          color: var(--muted-fg);
          white-space: nowrap;
        }
        .auth-step-active .auth-step-label {
          color: var(--foreground);
        }
        .auth-step-done .auth-step-label {
          color: var(--success);
        }
        .auth-step-connector {
          width: 24px;
          height: 1.5px;
          background: var(--border);
          margin: 0 0.35rem;
        }
        .auth-step-done + .auth-step-connector,
        .auth-step-active .auth-step-connector {
          background: var(--accent);
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
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          padding: 0.35rem 0.85rem;
          border-radius: 8px;
          background: var(--bg-subtle);
          border: 1px solid var(--border);
          color: var(--foreground);
          font-size: 0.82rem;
          font-weight: 500;
          width: fit-content;
          margin: 0 auto 1rem;
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
