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
  User as UserIcon,
  Clock,
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
      toast.success(`Verification code dispatched to ${email}`);
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
      await triggerOtpDispatch(email.trim());
      setResendCooldown(60);
      toast.success(`New verification code dispatched to ${email}`);
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

      toast.success("Email verified and account registered!");

      // 3. ALWAYS transition to Biometric Setup step!
      setStep("BIOMETRIC_SETUP");
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
        }, 1000);
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
    toast.success("Welcome to Whizan Cloud! 2-Step Verification set to Email OTP.");
    router.push(destination);
  }

  return (
    <div className="w-full">
      {/* ── STEP 1: ACCOUNT DETAILS ── */}
      {step === "DETAILS" && (
        <div className="relative w-full max-w-md mx-auto bg-zinc-950/90 border border-zinc-800/90 rounded-2xl p-8 shadow-2xl backdrop-blur-xl text-zinc-100 overflow-hidden">
          {/* Ambient top light glow */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-36 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />

          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Developer Cloud Console</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Create your Account
            </h2>
            <p className="text-xs text-zinc-400 mt-1.5">
              Deploy containers, edge functions, and databases in seconds
            </p>
          </div>

          <form onSubmit={handleDetailsSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Full Name
              </label>
              <div className="relative flex items-center">
                <UserIcon className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  required
                  placeholder="Alex Developer"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 transition-all font-normal"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Work Email Address
              </label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 transition-all font-normal"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Password
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 transition-all font-normal"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 text-xs text-zinc-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>We'll verify your email with a 6-digit OTP before account creation.</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30 active:scale-[0.99] cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Dispatching verification code...</span>
                </>
              ) : (
                <>
                  <span>Continue with Email Verification</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-zinc-400">
            Already have an account?{" "}
            <Link
              href={redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : "/login"}
              className="text-white hover:text-sky-400 font-semibold transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      )}

      {/* ── STEP 2: VERIFY EMAIL OTP ── */}
      {step === "VERIFY_EMAIL" && (
        <div className="relative w-full max-w-md mx-auto bg-zinc-950/90 border border-zinc-800/90 rounded-2xl p-8 shadow-2xl backdrop-blur-xl text-zinc-100 overflow-hidden">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-36 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />

          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500/15 via-indigo-500/20 to-purple-500/15 border border-sky-500/30 flex items-center justify-center mx-auto mb-3.5 text-sky-400 shadow-lg shadow-sky-500/10">
              <Mail className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Verify Your Email Address
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Enter the 6-digit code dispatched to:
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono font-medium text-sky-300">
              {email}
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs text-zinc-300 font-medium">Enter 6-digit Passcode</span>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || loading}
                  className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-40 font-medium cursor-pointer"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
                </button>
              </div>

              <div className="flex justify-between gap-2" onPaste={handlePaste}>
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      otpInputRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className="w-12 h-13 text-center text-xl font-bold font-mono bg-zinc-900 border border-zinc-700/80 rounded-xl text-white focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 focus:scale-[1.04] transition-all"
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => verifyAndRegister()}
              disabled={loading || otpDigits.join("").length !== 6}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30 active:scale-[0.99] cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <span>Verify Email & Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setStep("DETAILS")}
              className="w-full text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer pt-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Change email or password</span>
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: BIOMETRIC REGISTRATION PROMPT ── */}
      {step === "BIOMETRIC_SETUP" && (
        <div className="relative w-full max-w-md mx-auto bg-zinc-950/90 border border-zinc-800/90 rounded-2xl p-8 shadow-2xl backdrop-blur-xl text-zinc-100 overflow-hidden animate-in fade-in duration-300">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-36 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />

          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-sky-500/20 via-indigo-500/25 to-purple-500/20 border border-sky-500/35 flex items-center justify-center mx-auto mb-4 text-sky-400 shadow-xl shadow-sky-500/15 animate-pulse">
              <Fingerprint className="w-9 h-9" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Set Up Biometric Authentication
            </h2>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
              Enable Touch ID, Face ID, or Windows Hello for instant 1-tap 2FA on this device. Future logins won't require manual OTPs.
            </p>
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={handleBiometricEnroll}
              disabled={biometricLoading || biometricSuccess}
              className="w-full py-4 px-4 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2.5 shadow-lg shadow-sky-500/25 active:scale-[0.99] cursor-pointer"
            >
              {biometricLoading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Registering Sensor...</span>
                </>
              ) : biometricSuccess ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                  <span>Sensor Registered! Redirecting...</span>
                </>
              ) : (
                <>
                  <Fingerprint className="w-5 h-5" />
                  <span>Register Touch ID / Face ID</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSkipBiometrics}
              className="w-full py-2.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Skip for now (Use Email OTP on this device)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-black flex flex-col justify-center items-center p-4 relative selection:bg-sky-500/30 selection:text-sky-200">
      <div className="w-full max-w-md">
        <Suspense fallback={<div className="h-96 w-full animate-pulse bg-zinc-900 rounded-2xl" />}>
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
