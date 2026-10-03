"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { getSafeRedirectUrl } from "@/lib/redirect";

function RegisterForm() {
  const { user, register } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const destination = getSafeRedirectUrl(redirectParam, "/dashboard");

  const [name, setName] = useState("");
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
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await register(email, password, name);
      router.push(destination);
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  const loginHref = redirectParam
    ? `/login?redirect=${encodeURIComponent(redirectParam)}`
    : "/login";

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Create your workspace
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {redirectParam ? "Sign up to access your requested page" : "Get started with Whizan Cloud Services"}
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
          <label className="form-label">Full Name</label>
          <input
            id="name"
            type="text"
            className="input"
            placeholder="Ada Lovelace"
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
        
        <button
          id="register-btn"
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{ marginTop: "0.5rem", width: "100%", padding: "0.68rem 1rem", fontSize: "0.9rem" }}
        >
          {loading ? "Creating workspace…" : "Create Free Workspace"}
        </button>
      </form>

      <div className="mt-6 pt-5 border-t border-slate-100 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href={loginHref} className="text-indigo-600 font-semibold hover:underline">
          Sign in
        </Link>
      </div>
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
