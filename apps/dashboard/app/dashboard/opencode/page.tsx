"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function OpenCodeRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="page-loading" style={{ minHeight: "60vh" }}>
      <Loader2 size={24} className="spin-icon" style={{ color: "var(--accent)" }} />
      <span style={{ fontSize: "0.875rem", color: "var(--muted)", marginTop: "0.5rem" }}>
        Returning to Console...
      </span>
    </div>
  );
}
