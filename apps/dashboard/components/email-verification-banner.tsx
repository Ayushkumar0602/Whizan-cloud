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
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

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

    const newDigits = [...otpDigits];
    for (let i = 0; i < 6; i++) {
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
    setLoading(true);

    try {
      const res = await auth.verifyEmail({ passcode: code });
      if (res.ok) {
        updateUser({ emailVerified: true });
        setModalOpen(false);
        toast.success("🎉 Email verified successfully! Full console mutation access unlocked.");
      }
    } catch (err: any) {
      toast.error(err.message || "Invalid or expired passcode. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* ─── Persistent Warning Banner Across All Pages ──────────────────── */}
      <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-amber-200">
            <span className="p-1 rounded bg-amber-500/20 text-amber-400 flex-shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </span>
            <span>
              <strong>Action Required: Email Verification Pending.</strong> Your account is currently restricted to <strong>View-Only mode</strong>. You cannot deploy services, create databases, or modify settings until verified.
            </span>
          </div>
          <button
            onClick={() => {
              setModalOpen(true);
              if (!otpSent) {
                handleSendVerificationOtp();
              }
            }}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer ml-auto"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Verify Email Now</span>
          </button>
        </div>
      </div>

      {/* ─── Verification Modal Dialog ────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-3 text-amber-400">
                <Mail className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                Mandatory Email Verification
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                A 6-digit verification code has been dispatched to:
              </p>
              <p className="text-sm font-semibold text-amber-300 mt-1 font-mono">
                {user.email}
              </p>
            </div>

            <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-3 mb-5 text-[11px] text-zinc-300 flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span>One-time verification unlocks deployments, databases, and API keys.</span>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-400 font-medium">Enter 6-digit OTP</span>
                  <button
                    type="button"
                    onClick={handleSendVerificationOtp}
                    disabled={resendCooldown > 0 || loading}
                    className="text-[11px] text-sky-400 hover:text-sky-300 disabled:opacity-40"
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
                      className="w-11 h-12 text-center text-lg font-bold bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleVerifyCode(otpDigits.join(""))}
                disabled={loading || otpDigits.join("").length !== 6}
                className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-zinc-950" />
                ) : (
                  <>
                    <span>Verify & Unlock Full Access</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
