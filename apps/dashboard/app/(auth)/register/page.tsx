"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { auth } from "@/lib/api";
import { sendOtpEmail } from "@/lib/emailjs";
import {
  enrollBiometric,
  isPlatformBiometricSupported,
  saveTwoFactorTrust,
} from "@/lib/webauthn";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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
  Sparkles,
  Lock,
} from "lucide-react";

type RegistrationStep = "DETAILS" | "VERIFY_EMAIL" | "BIOMETRIC_SETUP";

function RegisterForm() {
  const { user, register } = useAuth();
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

  // OTP state
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutes
  const [localGeneratedOtp, setLocalGeneratedOtp] = useState<string>("");
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Biometrics state
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricSuccess, setBiometricSuccess] = useState(false);

  // If already authenticated and not in biometric setup, redirect straight to destination
  useEffect(() => {
    if (user && step !== "BIOMETRIC_SETUP") {
      router.replace(destination);
    }
  }, [user, destination, router, step]);

  // Check biometric support on mount
  useEffect(() => {
    isPlatformBiometricSupported().then(setBiometricSupported);
  }, []);

  // Countdown timer for OTP
  useEffect(() => {
    if (step !== "VERIFY_EMAIL") return;
    const interval = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
      setResendCooldown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  // Format time (mm:ss)
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  /**
   * Generates and dispatches the 6-digit OTP via EmailJS
   */
  async function triggerOtpDispatch(targetEmail: string) {
    const rawOtp = String(Math.floor(100000 + Math.random() * 900000));
    setLocalGeneratedOtp(rawOtp);

    // Try backend /send-otp first
    try {
      await auth.sendOtp({ email: targetEmail });
      return true;
    } catch {
      // Direct client-side EmailJS dispatch fallback
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
      await triggerOtpDispatch(email);
      setStep("VERIFY_EMAIL");
      setTimeLeft(900);
      setResendCooldown(60);
      toast.success(`Verification code dispatched to ${email}`);
      // Focus first OTP input
      setTimeout(() => otpInputRefs.current[0]?.focus(), 150);
    } catch (err: any) {
      toast.error(err.message || "Failed to send verification email. Please check your address.");
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
      await triggerOtpDispatch(email);
      setResendCooldown(60);
      setTimeLeft(900);
      setOtpDigits(["", "", "", "", "", ""]);
      toast.success("A new verification code was sent to your email.");
      setTimeout(() => otpInputRefs.current[0]?.focus(), 150);
    } catch (err: any) {
      toast.error(err.message || "Failed to resend code");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handles digit input & auto-advances focus
   */
  function handleDigitChange(index: number, val: string) {
    // Only numeric
    const cleanVal = val.replace(/\D/g, "").slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = cleanVal;
    setOtpDigits(newDigits);

    if (cleanVal && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    // If all 6 digits filled, automatically attempt verification
    const fullCode = newDigits.join("");
    if (fullCode.length === 6 && !newDigits.includes("")) {
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

    const newDigits = [...otpDigits];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setOtpDigits(newDigits);

    if (pasted.length === 6) {
      otpInputRefs.current[5]?.focus();
      verifyAndRegister(pasted);
    } else {
      otpInputRefs.current[pasted.length]?.focus();
    }
  }

  /**
   * Step 2: Verify OTP and Register user
   */
  async function verifyAndRegister(codeToVerify?: string) {
    const code = codeToVerify || otpDigits.join("");
    if (code.length !== 6) {
      toast.error("Please enter the complete 6-digit code");
      return;
    }

    setLoading(true);
    try {
      // 1. Verify code
      let isVerified = false;
      try {
        await auth.verifyOtp({ email, passcode: code });
        isVerified = true;
      } catch (err) {
        // Fallback check against local OTP if API is offline
        if (localGeneratedOtp && localGeneratedOtp === code) {
          isVerified = true;
        } else {
          throw err;
        }
      }

      if (!isVerified) {
        throw new Error("Invalid verification code. Please check your email.");
      }

      // 2. Complete user registration
      await register(email, password, name, code);
      saveTwoFactorTrust(email);
      toast.success("Email verified and workspace created!");

      // 3. Move to biometric registration step if device supports it
      const hasBiometrics = await isPlatformBiometricSupported();
      if (hasBiometrics) {
        setStep("BIOMETRIC_SETUP");
      } else {
        router.push(destination);
      }
    } catch (err: any) {
      toast.error(err.message || "Verification failed. Check the code and try again.");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Step 3: Enroll Biometrics (Face ID / Touch ID / Windows Hello)
   */
  async function handleBiometricEnroll() {
    setBiometricLoading(true);
    try {
      const result = await enrollBiometric(user?.id || "local-user", email);
      if (result.success) {
        setBiometricSuccess(true);
        toast.success("Biometric security enabled for this device!");
        setTimeout(() => {
          router.push(destination);
        }, 1200);
      } else {
        toast.error(result.error || "Biometric registration failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to register biometrics");
    } finally {
      setBiometricLoading(false);
    }
  }

  const loginHref = redirectParam
    ? `/login?redirect=${encodeURIComponent(redirectParam)}`
    : "/login";

  return (
    <>
      {/* ── STEP 1: ACCOUNT DETAILS ── */}
      {step === "DETAILS" && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Create your workspace
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {redirectParam
                ? "Sign up to access your requested page"
                : "Get started with Whizan Cloud Services"}
            </p>
          </div>

          {redirectParam && (
            <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-lg p-2.5 mb-5 text-xs text-slate-700 flex items-center gap-2">
              <span className="text-indigo-600 font-semibold">Destination:</span>
              <code className="text-indigo-800 font-mono text-[11px] bg-white px-1.5 py-0.5 rounded border border-indigo-100">
                {destination}
              </code>
            </div>
          )}

          <form onSubmit={handleDetailsSubmit} className="flex flex-col gap-4">
            <div>
              <label className="form-label">Full Name</label>
              <input
                id="name"
                type="text"
                className="input"
                placeholder="Alex Developer"
                value={name}
                onChange={e => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="form-label">Work Email</label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input
                id="password"
                type="password"
                className="input"
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
              <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
              <span>We'll verify your email with a 6-digit OTP before account creation.</span>
            </div>

            <button
              id="register-btn"
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                marginTop: "0.5rem",
                width: "100%",
                padding: "0.68rem 1rem",
                fontSize: "0.9rem",
              }}
            >
              {loading ? "Sending verification code…" : "Continue with Email Verification"}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link href={loginHref} className="text-indigo-600 font-semibold hover:underline">
              Sign in
            </Link>
          </div>
        </>
      )}

      {/* ── STEP 2: EMAIL OTP VERIFICATION ── */}
      {step === "VERIFY_EMAIL" && (
        <div>
          <div className="mb-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-3 text-indigo-600 shadow-sm">
              <Mail size={24} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Verify your email
            </h1>
            <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
              We sent a 6-digit one-time password to{" "}
              <strong className="text-slate-800 font-semibold">{email}</strong>
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-5 mb-5 shadow-inner">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 text-center mb-3">
              Enter 6-Digit Passcode
            </label>

            <div className="flex justify-center gap-2 sm:gap-3 mb-4">
              {otpDigits.map((digit, index) => (
                <input
                  key={index}
                  ref={el => { otpInputRefs.current[index] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleDigitChange(index, e.target.value)}
                  onKeyDown={e => handleKeyDown(index, e)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  className="w-10 h-12 sm:w-12 sm:h-14 text-center font-mono text-xl sm:text-2xl font-bold rounded-lg border-2 border-slate-200 bg-white text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all shadow-sm"
                />
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span>Code expires in: <strong className="font-mono text-slate-700">{formatTime(timeLeft)}</strong></span>
              {resendCooldown > 0 ? (
                <span className="text-slate-400 font-mono">Resend in {resendCooldown}s</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading}
                  className="text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 hover:underline"
                >
                  <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                  Resend OTP
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => verifyAndRegister()}
            disabled={loading || otpDigits.join("").length !== 6}
            className="btn btn-primary w-full py-2.5 text-sm"
          >
            {loading ? "Verifying code…" : "Verify & Create Account"}
          </button>

          <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100 text-xs">
            <button
              type="button"
              onClick={() => {
                setStep("DETAILS");
                setOtpDigits(["", "", "", "", "", ""]);
              }}
              className="text-slate-500 hover:text-slate-800 flex items-center gap-1"
            >
              <ArrowLeft size={13} />
              Change email
            </button>
            <Link href={loginHref} className="text-indigo-600 font-semibold hover:underline">
              Back to sign in
            </Link>
          </div>
        </div>
      )}

      {/* ── STEP 3: BIOMETRIC SETUP (FACE ID / TOUCH ID) ── */}
      {step === "BIOMETRIC_SETUP" && (
        <div className="text-center">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-indigo-500 to-sky-400 flex items-center justify-center mx-auto mb-4 text-white shadow-lg shadow-indigo-200 animate-pulse">
            <Fingerprint size={32} />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-1">
            Secure Console with Biometrics
          </h1>
          <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto">
            Register your device's Touch ID, Face ID, or Windows Hello to unlock your Whizan Console with a single tap.
          </p>

          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 mb-6 text-left text-xs space-y-2.5">
            <div className="flex items-start gap-2.5 text-slate-700">
              <Sparkles size={16} className="text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900 block font-semibold">Instant Console Unlock</strong>
                Bypass password prompts whenever you enter your console on this browser.
              </div>
            </div>
            <div className="flex items-start gap-2.5 text-slate-700">
              <Lock size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900 block font-semibold">Local Hardware Enclave</strong>
                Your biometric keys never leave your device and cannot be phished.
              </div>
            </div>
          </div>

          {biometricSuccess ? (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-3 text-sm flex items-center justify-center gap-2 mb-4 font-semibold">
              <CheckCircle2 size={18} className="text-emerald-600" />
              Biometrics enrolled! Redirecting to console…
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleBiometricEnroll}
                disabled={biometricLoading}
                className="btn btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2"
              >
                <Fingerprint size={16} />
                {biometricLoading ? "Prompting device biometrics…" : "Enable Touch ID / Face ID"}
              </button>

              <button
                type="button"
                onClick={() => router.push(destination)}
                className="btn btn-secondary w-full py-2 text-xs text-slate-600 hover:text-slate-900"
              >
                Skip for now & go to console <ArrowRight size={13} className="ml-1 inline" />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
          <div className="spinner" />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
