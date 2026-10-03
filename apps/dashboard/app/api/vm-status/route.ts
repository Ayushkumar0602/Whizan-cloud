import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // 1. First probe VM Port 80 directly with a 1.5s timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch("http://20.2.136.11:80", {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    }).catch(() => null);
    clearTimeout(timeout);

    if (res && (res.status === 200 || res.status < 500)) {
      return NextResponse.json({
        online: true,
        maintenance: false,
        message: "Whizan Cloud infrastructure is operational",
        timestamp: Date.now(),
      });
    }
  } catch {}

  // 2. Query Render Control Plane API as fallback
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://whizan-cloud-service.onrender.com";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const apiRes = await fetch(`${apiUrl}/api/vm-status`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    }).catch(() => null);
    clearTimeout(timeout);

    if (apiRes && apiRes.ok) {
      const data = await apiRes.json();
      return NextResponse.json(data);
    }
  } catch {}

  // VM is unreachable: Cloud is in maintenance mode
  return NextResponse.json({
    online: false,
    maintenance: true,
    message: "Cloud infrastructure is currently under maintenance for Free Tier users. We will be back online soon!",
    timestamp: Date.now(),
  });
}
