"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { auth } from "@/lib/api";
import { toast } from "sonner";
import {
  ShieldAlert,
  Mail,
  CheckCircle2,
  RefreshCw,
  X,
  Lock,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export function EmailVerificationBanner() {
  const { user, updateUser } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpDigits, setOtpDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Focus first input whenever modal opens
  useEffect(() => {
    if (modalOpen) {
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 150);
    }
  }, [modalOpen]);

  // If user is already verified or not logged in, show nothing
  if (!user || user.emailVerified === true) {
    return null;
  }

  async function handleSendVerificationOtp() {
    if (loading) return;
    setLoading(true);
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
      setTimeout(() => otpInputRefs.current[0]?.focus(), 150);
    } catch (err: any) {
      toast.error(err.message || "Failed to dispatch verification email. Please try again.");
    } finally {
      setLoading(false);
    }
  }

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
      handleVerifyCode(fullCode);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const newDigits = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i] || "";
    }
    setOtpDigits(newDigits);

    if (pasted.length === 6) {
      handleVerifyCode(pasted);
    } else {
      otpInputRefs.current[pasted.length]?.focus();
    }
  }

  async function handleVerifyCode(code: string) {
    if (loading) return;
    const cleanCode = code.trim();
    if (cleanCode.length !== 6) {
      toast.error("Please enter all 6 digits of your verification code.");
      return;
    }
    setLoading(true);

    try {
      const res = await auth.verifyEmail({
        passcode: cleanCode,
        email: user?.email,
      });

      if (res.ok) {
        setVerifiedSuccess(true);
        updateUser({ emailVerified: true });
        toast.success("🎉 Email verified successfully! Full console access unlocked.");
        setTimeout(() => {
          setModalOpen(false);
          setVerifiedSuccess(false);
        }, 1200);
      }
    } catch (err: any) {
      toast.error(err.message || "Invalid or expired passcode. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* ─── Modern Glassmorphic Warning Banner ──────────────────────────── */}
      <div className="bg-gradient-to-r from-sky-950/40 via-indigo-950/30 to-purple-950/40 border-b border-sky-500/25 px-4 py-2.5 backdrop-blur-md shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-semibold text-[11px] shadow-sm">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>View-Only Mode</span>
            </span>
            <span className="text-zinc-300">
              Email verification required for <strong className="text-white font-medium">{user.email}</strong>. Mutation, deployment, and database operations remain locked until verified.
            </span>
          </div>

          <button
            onClick={() => {
              setModalOpen(true);
              if (!otpSent) {
                handleSendVerificationOtp();
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-semibold text-xs shadow-md shadow-sky-500/20 hover:shadow-sky-500/30 transition-all active:scale-95 cursor-pointer ml-auto"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Verify Email Now</span>
            <ArrowRight className="w-3 h-3 opacity-80" />
          </button>
        </div>
      </div>

      {/* ─── Modern Premium Verification Modal ────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => !loading && setModalOpen(false)}
        >
          <div
            className="relative w-full max-w-md bg-zinc-950 border border-zinc-800/90 rounded-2xl p-7 shadow-2xl overflow-hidden transition-all text-zinc-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient top light glow */}
            <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-64 h-28 bg-sky-500/15 rounded-full blur-3xl pointer-events-none" />

            {/* Close Button */}
            <button
              onClick={() => !loading && setModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {verifiedSuccess ? (
              <div className="text-center py-8 animate-in zoom-in-95 duration-200">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4 text-emerald-400 shadow-lg shadow-emerald-500/10">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-white tracking-tight">
                  Email Verified!
                </h3>
                <p className="text-xs text-zinc-400 mt-2">
                  Full console mutation access unlocked. Enjoy Whizan Cloud!
                </p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="text-center mb-5">
                  <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-sky-500/15 via-indigo-500/20 to-purple-500/15 border border-sky-500/30 flex items-center justify-center mx-auto mb-3.5 text-sky-400 shadow-md shadow-sky-500/10">
                    <Mail className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight">
                    Verify Your Email
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Enter the 6-digit verification code dispatched to:
                  </p>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-mono font-medium text-sky-300">
                    {user.email}
                  </div>
                </div>

                {/* Security info box */}
                <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-xl p-3 mb-5 text-[11px] text-zinc-300 flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>One-time verification unlocks deployments, databases, and API keys.</span>
                </div>

                {/* Form */}
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-xs text-zinc-300 font-medium">Enter 6-digit Code</span>
                      <button
                        type="button"
                        onClick={handleSendVerificationOtp}
                        disabled={resendCooldown > 0 || loading}
                        className="text-xs text-sky-400 hover:text-sky-300 disabled:opacity-40 font-medium transition-colors cursor-pointer"
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
                          className="w-12 h-13 text-center text-xl font-bold font-mono bg-zinc-900 border border-zinc-700/80 rounded-xl text-white shadow-inner focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 focus:scale-[1.04] transition-all"
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleVerifyCode(otpDigits.join(""))}
                    disabled={loading || otpDigits.join("").length !== 6}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30 active:scale-[0.99] cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Verifying Code...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify & Unlock Full Access</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
