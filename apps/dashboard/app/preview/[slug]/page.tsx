"use client";

import React, { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MaintenancePage from "@/app/maintenance/page";

export default function PreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);

  const targetUrl = `http://${slug}.20.2.136.11.nip.io`;

  useEffect(() => {
    let active = true;

    async function checkStatus() {
      try {
        const res = await fetch("/api/vm-status?t=" + Date.now(), { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.online) {
            if (active) {
              setIsOnline(true);
              // Transparently navigate to the live deployment
              window.location.replace(targetUrl);
              return;
            }
          }
        }
      } catch {}

      if (active) {
        setLoading(false);
        setIsOnline(false);
      }
    }

    checkStatus();

    return () => {
      active = false;
    };
  }, [slug, targetUrl]);

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        background: "#f8fafc",
        fontFamily: "var(--font-geist-sans), sans-serif",
        color: "#475569"
      }}>
        <div style={{
          width: "36px",
          height: "36px",
          border: "3px solid #e2e8f0",
          borderTopColor: "#3b82f6",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite"
        }} />
        <span style={{ fontSize: "0.88rem", fontWeight: 500 }}>Connecting to Whizan Cloud Edge...</span>
        <style jsx>{`
          @keyframes spin {
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // VM is OFF: Render the application-standard Maintenance Webpage
  return <MaintenancePage initialSlug={slug} />;
}
