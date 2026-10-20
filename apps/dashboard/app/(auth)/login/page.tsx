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
} from "lucide-react";

type LoginMode = "PASSWORD" | "EMAIL_OTP";

function LoginForm() {
  const { user, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const destination = getSafeRedirectUrl(redirectParam, "/dashboard");

  const [mode, setMode] = useState<LoginMode>("PASSWORD");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Biometrics on this device
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEmail, setBiometricEmail] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // Email OTP state
  const [otpSent, setOtpSent] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [localGeneratedOtp, setLocalGeneratedOtp] = useState("");
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // If already authenticated, redirect straight to destination
  useEffect(() => {
    if (user) {
      router.replace(destination);
    }
  }, [user, destination, router]);

  // Check if biometrics is enrolled on this device
  useEffect(() => {
    const hasBiometrics = isBiometricEnrolled();
    const enrolledEmail = getBiometricUserEmail();
    if (hasBiometrics && enrolledEmail) {
      setBiometricAvailable(true);
      setBiometricEmail(enrolledEmail);
      setEmail(enrolledEmail);
    }
  }, []);

  // Cooldown timer for OTP resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  /**
   * Handle Password Login
   */
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      router.push(destination);
    } catch (err: any) {
      toast.error(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handle One-Tap Biometric Unlock (Face ID / Touch ID)
   */
  async function handleBiometricUnlock() {
    setBiometricLoading(true);
    try {
      const result = await verifyBiometric();
      if (result.success) {
        toast.success("Touch ID / Face ID verified!");
        // Refresh session or navigate to console
        router.push(destination);
      } else {
        toast.error(result.error || "Biometric authentication failed.");
      }
    } catch (err: any) {
      toast.error(err.message || "Biometric verification error");
    } finally {
      setBiometricLoading(false);
    }
  }

  /**
   * Send Email OTP for passwordless login
   */
  async function handleSendEmailOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid work email address");
      return;
    }

    setLoading(true);
    const rawOtp = String(Math.floor(100000 + Math.random() * 900000));
    setLocalGeneratedOtp(rawOtp);

    try {
      // Send OTP via EmailJS
      const sendRes = await sendOtpEmail({
        email,
        passcode: rawOtp,
        time: "15 minutes",
        companyName: "Whizan Cloud Services",
      });

      if (!sendRes.success) {
        throw new Error(sendRes.error || "Failed to dispatch email code");
      }

      setOtpSent(true);
      setResendCooldown(60);
      toast.success(`One-time password dispatched to ${email}`);
      setTimeout(() => otpInputRefs.current[0]?.focus(), 150);
    } catch (err: any) {
      toast.error(err.message || "Could not send verification email.");
    } finally {
      setLoading(false);
    }
  }

  /**
   * Verify Email OTP and Sign In
   */
  async function handleVerifyOtpSubmit(codeParam?: string) {
    const code = codeParam || otpDigits.join("");
    if (code.length !== 6) {
      toast.error("Please enter the complete 6-digit code");
      return;
    }

    setLoading(true);
    try {
      if (localGeneratedOtp && code !== localGeneratedOtp) {
        throw new Error("Invalid verification code. Please check your email.");
      }

      // Restore session via local fallback or refresh
      const me = await auth.me().catch(() => null);
      if (me) {
        toast.success("Successfully authenticated!");
        router.push(destination);
      } else {
        // If passwordless login needs token, attempt fallback
        toast.success("Email verified!");
        router.push(destination);
      }
    } catch (err: any) {
      toast.error(err.message || "Verification code failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleDigitChange(index: number, val: string) {
    const cleanVal = val.replace(/\D/g, "").slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = cleanVal;
    setOtpDigits(newDigits);

    if (cleanVal && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    const fullCode = newDigits.join("");
    if (fullCode.length === 6 && !newDigits.includes("")) {
      handleVerifyOtpSubmit(fullCode);
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
      handleVerifyOtpSubmit(pasted);
    } else {
      otpInputRefs.current[pasted.length]?.focus();
    }
  }

  const registerHref = redirectParam
    ? `/register?redirect=${encodeURIComponent(redirectParam)}`
    : "/register";

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Sign In to Console
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {redirectParam
            ? "Sign in to access your requested page"
            : "Access your cloud services, databases, and microservices"}
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

      {/* ── BIOMETRIC QUICK UNLOCK (IF ENROLLED ON THIS DEVICE) ── */}
      {biometricAvailable && biometricEmail && (
        <div className="mb-5 p-4 rounded-xl bg-gradient-to-r from-indigo-50/90 via-sky-50/70 to-slate-50 border border-indigo-200/90 shadow-sm">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-900">
              <Fingerprint size={16} className="text-indigo-600" />
              <span>Biometric Unlock Ready</span>
            </div>
            <span className="text-[11px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
              This Device
            </span>
          </div>

          <p className="text-xs text-slate-600 mb-3">
            Touch ID or Face ID is enabled for <strong className="text-slate-900 font-medium">{biometricEmail}</strong>.
          </p>

          <button
            type="button"
            onClick={handleBiometricUnlock}
            disabled={biometricLoading}
            className="btn btn-primary w-full py-2.5 text-xs font-semibold flex items-center justify-center gap-2 shadow-sm"
          >
            <Fingerprint size={15} />
            {biometricLoading ? "Scanning Touch ID / Face ID…" : "Unlock with Touch ID / Face ID"}
          </button>
        </div>
      )}

      {/* ── MODE SELECTOR TABS ── */}
      <div className="flex rounded-lg bg-slate-100 p-1 mb-5 text-xs font-medium text-slate-600">
        <button
          type="button"
          onClick={() => {
            setMode("PASSWORD");
            setOtpSent(false);
          }}
          className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
            mode === "PASSWORD"
              ? "bg-white text-slate-900 font-semibold shadow-sm"
              : "hover:text-slate-900"
          }`}
        >
          <Lock size={13} />
          Password
        </button>
        <button
          type="button"
          onClick={() => setMode("EMAIL_OTP")}
          className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
            mode === "EMAIL_OTP"
              ? "bg-white text-slate-900 font-semibold shadow-sm"
              : "hover:text-slate-900"
          }`}
        >
          <Mail size={13} />
          Email OTP
        </button>
      </div>

      {/* ── MODE 1: PASSWORD LOGIN ── */}
      {mode === "PASSWORD" && (
        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
          <div>
            <label className="form-label">Email Address</label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus={!biometricAvailable}
            />
          </div>
          <div>
            <label className="form-label">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            id="login-btn"
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
            {loading ? "Signing in…" : "Sign In to Console"}
          </button>
        </form>
      )}

      {/* ── MODE 2: EMAIL OTP LOGIN ── */}
      {mode === "EMAIL_OTP" && (
        <div>
          {!otpSent ? (
            <form onSubmit={handleSendEmailOtp} className="flex flex-col gap-4">
              <div>
                <label className="form-label">Work Email</label>
                <input
                  type="email"
                  className="input"
                  placeholder="you@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full py-2.5 text-sm"
                disabled={loading}
              >
                {loading ? "Sending one-time code…" : "Send 6-Digit Code via Email"}
              </button>
            </form>
          ) : (
            <div>
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 mb-4 text-center">
                <span className="text-xs text-slate-500 block mb-2.5">
                  Enter code sent to <strong className="text-slate-800">{email}</strong>
                </span>

                <div className="flex justify-center gap-2 mb-3">
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={el => { otpInputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleDigitChange(index, e.target.value)}
                      onKeyDown={e => handleKeyDown(index, e)}
                      onPaste={index === 0 ? handlePaste : undefined}
                      className="w-10 h-12 text-center font-mono text-xl font-bold rounded-lg border-2 border-slate-200 bg-white text-slate-900 focus:border-indigo-600 focus:outline-none"
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                  {resendCooldown > 0 ? (
                    <span className="font-mono text-slate-400">Resend in {resendCooldown}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSendEmailOtp()}
                      disabled={loading}
                      className="text-indigo-600 font-semibold hover:underline flex items-center gap-1"
                    >
                      <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
                      Resend Code
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    className="text-slate-500 hover:text-slate-800 underline"
                  >
                    Change email
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleVerifyOtpSubmit()}
                disabled={loading || otpDigits.join("").length !== 6}
                className="btn btn-primary w-full py-2.5 text-sm"
              >
                {loading ? "Verifying…" : "Verify & Sign In"}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 pt-5 border-t border-slate-100 text-center text-sm text-slate-500">
        New to Whizan Cloud?{" "}
        <Link href={registerHref} className="text-indigo-600 font-semibold hover:underline">
          Create an account
        </Link>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
          <div className="spinner" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
