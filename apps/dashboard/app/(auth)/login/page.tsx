"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { auth, setAccessToken } from "@/lib/api";
import { sendOtpEmail } from "@/lib/emailjs";
import {
  isBiometricEnrolled,
  getBiometricUserEmail,
  verifyBiometric,
  isPlatformBiometricSupported,
  isTwoFactorTrusted,
  saveTwoFactorTrust,
} from "@/lib/webauthn";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { getSafeRedirectUrl } from "@/lib/redirect";
import {
  ArrowRight,
  Lock,
  Mail,
  Fingerprint,
  Sparkles,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  Smartphone,
  ArrowLeft,
  Clock,
} from "lucide-react";

type LoginMode = "PASSWORD" | "EMAIL_OTP";
type LoginStage = "ENTER_CREDENTIALS" | "MANDATORY_2FA";

function LoginForm() {
  const { user, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const destination = getSafeRedirectUrl(redirectParam, "/dashboard");

  const [mode, setMode] = useState<LoginMode>("PASSWORD");
  const [stage, setStage] = useState<LoginStage>("ENTER_CREDENTIALS");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Biometrics on this device
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEmail, setBiometricEmail] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // 2FA / OTP state
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

  // Check if biometrics is enrolled on this local hardware device
  useEffect(() => {
    const hasBiometrics = isBiometricEnrolled();
    const enrolledEmail = getBiometricUserEmail();
    if (hasBiometrics && enrolledEmail) {
      setBiometricAvailable(true);
      setBiometricEmail(enrolledEmail);
      if (!email) setEmail(enrolledEmail);
    } else {
      isPlatformBiometricSupported().then(supported => {
        setBiometricAvailable(supported);
      });
    }
  }, [email]);

  // Cooldown timer for OTP resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  /**
   * Dispatches OTP via API (or client-side fallback)
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
   * Enforces mandatory 2-step verification if not trusted in the past 3 days.
   */
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await login(email, password);

      // Check if this device has satisfied 2FA within the 3-day window
      if (isTwoFactorTrusted(email)) {
        toast.success("Welcome back! Trusted device recognized.");
        router.push(destination);
        return;
      }

      // Mandatory 2-Step Verification required
      setStage("MANDATORY_2FA");

      if (biometricAvailable && isBiometricEnrolled()) {
        setTwoFactorMethod("BIOMETRIC");
      } else {
        setTwoFactorMethod("EMAIL_OTP");
        await dispatchOtpToUser(email);
        setResendCooldown(60);
        toast.info("2-Step Verification required: OTP sent to your email.");
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
    setBiometricLoading(true);
    try {
      const result = await verifyBiometric();
      if (result.success) {
        saveTwoFactorTrust(email);
        toast.success("Touch ID / Face ID verified! Device trusted for 3 days.");
        router.push(destination);
      } else {
        toast.error(result.error || "Biometric authentication failed. Please try Email OTP.");
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
      await dispatchOtpToUser(email);
      setResendCooldown(60);
      toast.success(`Verification code dispatched to ${email}`);
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
      handleComplete2FAOtp(fullCode);
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

    const newDigits = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || "";
    }
    setOtpDigits(newDigits);

    if (pasted.length === 6) {
      handleComplete2FAOtp(pasted);
    } else {
      otpInputRefs.current[pasted.length]?.focus();
    }
  }

  /**
   * Complete 2FA via Email OTP
   */
  async function handleComplete2FAOtp(code: string) {
    if (loading) return;
    setLoading(true);

    try {
      let verified = false;
      try {
        const res = await auth.verifyOtp({ email, passcode: code });
        if (res.ok) verified = true;
      } catch {
        if (localGeneratedOtp && code === localGeneratedOtp) {
          verified = true;
        }
      }

      if (!verified) {
        throw new Error("Invalid verification code. Please check your email.");
      }

      // Save 3-day 2FA trust on this local device
      saveTwoFactorTrust(email);
      toast.success("2-Step Verification verified! Device trusted for 3 days.");
      router.push(destination);
    } catch (err: any) {
      toast.error(err.message || "Invalid OTP code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Direct Passwordless Email OTP Login
   */
  async function handleDirectEmailOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fullCode = otpDigits.join("");
    if (fullCode.length !== 6) {
      toast.error("Please enter the complete 6-digit verification code");
      return;
    }

    setLoading(true);
    try {
      const res = await auth.verifyOtp({ email, passcode: fullCode });
      if (!res.ok) {
        throw new Error("Invalid or expired verification code");
      }

      saveTwoFactorTrust(email);
      toast.success("Welcome to Whizan Cloud! Device trusted for 3 days.");
      router.push(destination);
    } catch (err: any) {
      toast.error(err.message || "Failed to authenticate via OTP");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* ─── STAGE 1: ENTER CREDENTIALS ────────────────────────────────────── */}
      {stage === "ENTER_CREDENTIALS" && (
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="text-center mb-8 relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold mb-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              Secure Console Access
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Sign in to Whizan Cloud
            </h1>
            <p className="text-zinc-400 text-xs mt-1.5">
              Enterprise control plane with mandatory hardware 2-factor protection
            </p>
          </div>

          {/* Quick Biometric Unlock Button (If Enrolled) */}
          {biometricAvailable && biometricEmail && (
            <div className="mb-6">
              <button
                type="button"
                onClick={handle2FABiometricVerify}
                disabled={biometricLoading}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-sky-500/20 to-indigo-500/20 hover:from-sky-500/30 hover:to-indigo-500/30 border border-sky-500/40 text-sky-300 font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2.5 shadow-lg shadow-sky-500/10 group cursor-pointer"
              >
                {biometricLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                    <span>Scanning Face ID / Touch ID...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-5 h-5 text-sky-400 group-hover:scale-110 transition-transform" />
                    <span>Unlock with Touch ID / Face ID</span>
                  </>
                )}
              </button>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">
                  or sign in with credentials
                </span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>
            </div>
          )}

          {/* Login Tabs */}
          <div className="flex p-1 bg-zinc-800/60 rounded-xl mb-6 border border-zinc-700/50">
            <button
              type="button"
              onClick={() => setMode("PASSWORD")}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === "PASSWORD"
                  ? "bg-zinc-700/80 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Password + 2FA
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
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === "EMAIL_OTP"
                  ? "bg-zinc-700/80 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              One-Time Email OTP
            </button>
          </div>

          {/* Form: Password */}
          {mode === "PASSWORD" ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-4 py-2.5 pl-10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-zinc-300">
                    Password
                  </label>
                  <span className="text-[11px] text-zinc-500">2FA enforced</span>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-4 py-2.5 pl-10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 text-[11px] text-zinc-400">
                <Clock className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                <span>2-Step validation keeps this device logged in for 3 days.</span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 cursor-pointer"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Continue to 2-Step Verification</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Form: Direct Email OTP */
            <form onSubmit={handleDirectEmailOtpSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Work Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl px-4 py-2.5 pl-10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500 transition-colors"
                  />
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-zinc-300">
                    6-Digit Passcode
                  </label>
                  <button
                    type="button"
                    onClick={() => dispatchOtpToUser(email)}
                    disabled={resendCooldown > 0 || loading || !email}
                    className="text-[11px] text-sky-400 hover:text-sky-300 disabled:opacity-40"
                  >
                    {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : "Send OTP"}
                  </button>
                </div>

                <div className="flex justify-between gap-2" onPaste={handleOtpPaste}>
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
                      onChange={(e) => handleOtpDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="w-11 h-12 text-center text-lg font-bold bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || otpDigits.join("").length !== 6}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 cursor-pointer"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Verify & Enter Console (3 Days)</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer Navigation */}
          <div className="mt-8 pt-6 border-t border-zinc-800 text-center">
            <p className="text-xs text-zinc-400">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-sky-400 hover:text-sky-300 font-semibold ml-1">
                Create Account
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* ─── STAGE 2: MANDATORY 2-STEP VERIFICATION ────────────────────────── */}
      {stage === "MANDATORY_2FA" && (
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center mx-auto mb-3 text-sky-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Two-Factor Authentication
            </h2>
            <p className="text-zinc-400 text-xs mt-1">
              Verify your identity for <span className="text-zinc-200 font-medium">{email}</span>
            </p>
          </div>

          <div className="bg-zinc-800/50 border border-zinc-700/60 rounded-xl p-3.5 mb-6 text-xs text-zinc-300 flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-sky-400 flex-shrink-0" />
            <span>Success will grant trusted 2FA access on this device for <strong>3 days</strong>.</span>
          </div>

          {/* Biometric Option */}
          {twoFactorMethod === "BIOMETRIC" && biometricAvailable && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handle2FABiometricVerify}
                disabled={biometricLoading}
                className="w-full py-4 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2.5 shadow-lg shadow-sky-500/25 cursor-pointer"
              >
                {biometricLoading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Scanning Touch ID / Face ID...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-5 h-5" />
                    <span>Verify with Touch ID / Face ID</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSwitchToEmailOtp}
                className="w-full py-2.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Device lacks sensor? Use Email OTP instead</span>
              </button>
            </div>
          )}

          {/* Email OTP Option */}
          {twoFactorMethod === "EMAIL_OTP" && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-300 font-medium">
                    Enter 6-digit passcode sent to your email
                  </span>
                  <button
                    type="button"
                    onClick={() => dispatchOtpToUser(email)}
                    disabled={resendCooldown > 0 || loading}
                    className="text-[11px] text-sky-400 hover:text-sky-300 disabled:opacity-40"
                  >
                    {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : "Resend OTP"}
                  </button>
                </div>

                <div className="flex justify-between gap-2" onPaste={handleOtpPaste}>
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
                      onChange={(e) => handleOtpDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="w-11 h-12 text-center text-lg font-bold bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                    />
                  ))}
                </div>
              </div>

              {biometricAvailable && (
                <button
                  type="button"
                  onClick={() => setTwoFactorMethod("BIOMETRIC")}
                  className="w-full py-2 text-xs text-sky-400 hover:text-sky-300 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Fingerprint className="w-3.5 h-3.5" />
                  <span>Verify with Touch ID / Face ID instead</span>
                </button>
              )}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setStage("ENTER_CREDENTIALS");
                setOtpDigits(["", "", "", "", "", ""]);
              }}
              className="w-full text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to sign in</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-black flex flex-col justify-center items-center p-4 relative selection:bg-sky-500/30 selection:text-sky-200">
      <div className="w-full max-w-md">
        <Suspense fallback={<div className="h-96 w-full animate-pulse bg-zinc-900 rounded-2xl" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
