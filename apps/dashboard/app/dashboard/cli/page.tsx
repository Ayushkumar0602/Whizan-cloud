"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CliRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/mcp?tab=cli");
  }, [router]);

  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
      <div className="spinner" style={{ marginRight: "0.75rem" }} />
      Redirecting to Whizan CLI documentation...
    </div>
  );
}
