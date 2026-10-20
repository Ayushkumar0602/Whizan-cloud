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
  ShieldAlert,
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
      toast.info("2-Factor verification required. Please verify your identity to access the console.");
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
    if (!pendingSession) return;
    setBiometricLoading(true);

    try {
      const result = await verifyBiometric();
      if (result.success) {
        saveTwoFactorTrust(email.trim());
        setSession(pendingSession.accessToken, pendingSession.user);
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
      await dispatchOtpToUser(email.trim());
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
        toast.success("2-Step Verification verified! Device trusted for 3 days.");
        router.push(destination);
      } else {
        toast.error("Invalid passcode. Please check your email.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to verify 2FA code.");
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
      toast.error("Please enter the complete 6-digit passcode.");
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
      toast.success("Signed in successfully! Device trusted for 3 days.");
      router.push(destination);
    } catch (err: any) {
      toast.error(err.message || "Invalid or expired passcode. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      {stage === "ENTER_CREDENTIALS" ? (
        <div className="relative w-full max-w-md mx-auto bg-zinc-950/90 border border-zinc-800/90 rounded-2xl p-8 shadow-2xl backdrop-blur-xl text-zinc-100 overflow-hidden">
          {/* Ambient top light glow */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-36 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-xs font-semibold mb-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Hardware-Backed Security</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Sign in to Whizan Cloud
            </h2>
            <p className="text-xs text-zinc-400 mt-1.5">
              Enterprise control plane with mandatory 2-factor protection
            </p>
          </div>

          {/* Quick Biometric Shortcut if enrolled on this device */}
          {platformSupported && isBiometricEnrolled() && (
            <div className="mb-6">
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
                className="w-full py-3 px-4 rounded-xl bg-zinc-900 border border-zinc-700/80 hover:border-sky-500/50 hover:bg-zinc-850 text-white font-medium text-xs transition-all flex items-center justify-center gap-2 group cursor-pointer shadow-sm"
              >
                {biometricLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                    <span>Scanning Face ID / Touch ID...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
                    <span>Hardware Sensor Active on this Device</span>
                  </>
                )}
              </button>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">
                  sign in with credentials
                </span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>
            </div>
          )}

          {/* Login Tabs */}
          <div className="flex p-1 bg-zinc-900 border border-zinc-800 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => setMode("PASSWORD")}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === "PASSWORD"
                  ? "bg-zinc-800 text-white shadow-sm"
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
                  ? "bg-zinc-800 text-white shadow-sm"
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
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 transition-all font-normal"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-zinc-300">
                    Password
                  </label>
                  <span className="text-[11px] text-zinc-400">2FA Enforced</span>
                </div>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 transition-all font-normal"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 text-[11px] text-zinc-400">
                <Clock className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                <span>2-Step validation keeps this device logged in for 3 days.</span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30 active:scale-[0.99] cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Verifying Credentials...</span>
                  </>
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
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 transition-all font-normal"
                  />
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
                    className="text-[11px] text-sky-400 hover:text-sky-300 disabled:opacity-40 font-medium"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Send Code"}
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
                      className="w-12 h-13 text-center text-xl font-bold font-mono bg-zinc-900 border border-zinc-700/80 rounded-xl text-white focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 focus:scale-[1.04] transition-all"
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || otpDigits.join("").length !== 6}
                className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30 active:scale-[0.99] cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Verify Code & Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-xs text-zinc-400">
            Don't have an account?{" "}
            <Link
              href={redirectParam ? `/register?redirect=${encodeURIComponent(redirectParam)}` : "/register"}
              className="text-white hover:text-sky-400 font-semibold transition-colors"
            >
              Create Account
            </Link>
          </div>
        </div>
      ) : (
        /* ── STAGE 2: MANDATORY 2-STEP VERIFICATION ── */
        <div className="relative w-full max-w-md mx-auto bg-zinc-950/95 border border-zinc-800/90 rounded-2xl p-8 shadow-2xl backdrop-blur-xl text-zinc-100 overflow-hidden">
          {/* Ambient top light glow */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-36 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500/15 via-indigo-500/20 to-purple-500/15 border border-sky-500/30 flex items-center justify-center mx-auto mb-3.5 text-sky-400 shadow-lg shadow-sky-500/10">
              {twoFactorMethod === "BIOMETRIC" ? (
                <Fingerprint className="w-7 h-7" />
              ) : (
                <ShieldCheck className="w-7 h-7" />
              )}
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              Two-Factor Authentication
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              {twoFactorMethod === "BIOMETRIC"
                ? "Scan your hardware biometric sensor to verify identity"
                : "Enter the 6-digit passcode dispatched to your email"}
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono font-medium text-sky-300">
              {email}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/60 flex items-center gap-2.5 text-xs text-zinc-400 mb-6">
            <Clock className="w-4 h-4 text-sky-400 shrink-0" />
            <span>Successful verification grants a 3-day trusted session on this device.</span>
          </div>

          {/* Biometric Option */}
          {twoFactorMethod === "BIOMETRIC" ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={handle2FABiometricVerify}
                disabled={biometricLoading}
                className="w-full py-4 px-4 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2.5 shadow-lg shadow-sky-500/25 active:scale-[0.99] cursor-pointer"
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
                className="w-full py-2.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Device lacks sensor? Use Email OTP instead</span>
              </button>
            </div>
          ) : (
            /* Email OTP Option */
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs text-zinc-300 font-medium">
                    Enter 6-digit Code
                  </span>
                  <button
                    type="button"
                    onClick={() => dispatchOtpToUser(email)}
                    disabled={resendCooldown > 0 || loading}
                    className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-40 font-medium cursor-pointer"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
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
                      className="w-12 h-13 text-center text-xl font-bold font-mono bg-zinc-900 border border-zinc-700/80 rounded-xl text-white focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 focus:scale-[1.04] transition-all"
                    />
                  ))}
                </div>
              </div>

              {platformSupported && isBiometricEnrolledForEmail(email) && (
                <button
                  type="button"
                  onClick={() => setTwoFactorMethod("BIOMETRIC")}
                  className="w-full py-2 text-xs text-sky-400 hover:text-sky-300 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Fingerprint className="w-3.5 h-3.5" />
                  <span>Switch back to Face ID / Touch ID</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleComplete2FAOtp(otpDigits.join(""))}
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
                    <span>Verify & Access Console</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-zinc-800/80 text-center">
            <button
              type="button"
              onClick={() => {
                setStage("ENTER_CREDENTIALS");
                setPendingSession(null);
                setOtpDigits(["", "", "", "", "", ""]);
              }}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
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
