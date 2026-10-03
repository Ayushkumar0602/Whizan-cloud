"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { getSafeRedirectUrl } from "@/lib/redirect";
import { ArrowRight, Lock, Mail } from "lucide-react";

function LoginForm() {
  const { user, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const destination = getSafeRedirectUrl(redirectParam, "/dashboard");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // If already authenticated, redirect straight to destination
  useEffect(() => {
    if (user) {
      router.replace(destination);
    }
  }, [user, destination, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      router.push(destination);
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  const registerHref = redirectParam
    ? `/register?redirect=${encodeURIComponent(redirectParam)}`
    : "/register";

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Welcome back
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {redirectParam ? "Sign in to continue to your requested page" : "Sign in to the Whizan Cloud Services console"}
        </p>
      </div>

      {redirectParam && (
        <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-lg p-2.5 mb-5 text-xs text-slate-700 flex items-center gap-2">
          <span className="text-indigo-600 font-semibold">Destination:</span>
          <code className="text-indigo-800 font-mono text-[11px] bg-white px-1.5 py-0.5 rounded border border-indigo-100">{destination}</code>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            autoFocus
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="form-label" style={{ marginBottom: 0 }}>Password</label>
          </div>
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
          style={{ marginTop: "0.5rem", width: "100%", padding: "0.68rem 1rem", fontSize: "0.9rem" }}
        >
          {loading ? "Signing in…" : "Sign In to Console"}
        </button>
      </form>

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
