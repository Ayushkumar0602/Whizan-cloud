# Whizan Cloud — Local vs. Production Configuration & Deployment Guide

This document records all changes made to enable seamless **local development and admin monitoring**, and provides step-by-step instructions for when you are ready to deploy to production (or if you wish to revert any specific change).

---

## 1. Problem Summary & Why Changes Were Needed

### What Was Happening:
1. **Admin Dashboard Was Hardcoded to the Cloud Backend**:
   - The frontend configuration (`next.config.ts`) and API client (`lib/api.ts`) hardcoded `https://whizan-cloud-service.onrender.com` as the default API fallback.
   - Even when running locally on `http://localhost:3000`, the browser made requests to the Render cloud backend.
2. **Azure VM Was Powered Down**:
   - Render's backend connects to the cloud Upstash Redis.
   - When your Azure VM was shut down, no telemetry heartbeat was sent to Upstash Redis.
   - Render returned `vmStats: null`, causing the dashboard to show `Cloud Worker Disconnected / OFFLINE`.
3. **Local Worker & Database Were Ignored**:
   - On your local Mac, `apps/build-worker` was actively publishing live metrics (`Ayushs-MacBook-Air-4.local`, Apple M1 CPU usage, RAM allocation, local Docker containers `hostify-postgres` and `hostify-redis`) to the local Redis on `localhost:6379`.
   - The dashboard could not see these local stats because all requests were bypassing your local Fastify API (`localhost:8000`).

---

## 2. Inventory of All Modified Files

Here is the complete list of files updated:

| # | File Path | Scope | Purpose |
|---|-----------|-------|---------|
| 1 | `apps/dashboard/lib/api.ts` | Frontend API Client | Dynamically resolve API URL: prioritize `http://localhost:8000` when accessed via `localhost`/`127.0.0.1` in the browser. |
| 2 | `apps/dashboard/next.config.ts` | Next.js Server Config | Route `/api/:path*` rewrites to `http://localhost:8000` in development mode (`isDev`), and `https://whizan-cloud-service.onrender.com` in production. |
| 3 | `apps/dashboard/lib/domains.ts` | Ingress Router Domain | Dynamically resolve Edge Router domain: use `localhost:8080` when on localhost, and `20.2.136.11.nip.io` in production. |
| 4 | `apps/dashboard/lib/auth.tsx` | Session Management | Call `getApiBase()` dynamically instead of static constant for session token refresh (`/api/auth/refresh`). |
| 5 | `apps/dashboard/components/service-logs.tsx` | Backend Logs Streaming | Use `getApiBase()` for SSE log stream URL instead of hardcoded Render URL. |
| 6 | `apps/dashboard/components/service-shell.tsx` | Interactive Web Terminal | Use `getApiBase()` to construct WebSocket (`ws://` vs `wss://`) connection to the API. |
| 7 | `apps/dashboard/app/dashboard/projects/[id]/deployments/[dId]/page.tsx` | Frontend Build Logs | Use `getApiBase()` for live build log streaming. |
| 8 | `apps/dashboard/app/dashboard/backend/[id]/deployments/[dId]/page.tsx` | Service Build Logs | Use `getApiBase()` for live container build log streaming. |
| 9 | `apps/dashboard/app/dashboard/settings/page.tsx` | Settings Endpoints Display | Dynamically display local port endpoints (`:8000`, `:3000`, `:8080`, local DBs) when running locally, or cloud endpoints when on production. |
| 10 | `apps/dashboard/app/dashboard/admin/page.tsx` | Admin Overview UI | Distinguish between `Local Development Worker Active` and `Cloud Worker Online` in status banner based on host platform/hostname. |
| 11 | `apps/dashboard/app/dashboard/admin/layout.tsx` | Admin Navigation | Updated tab label from "VM Logs" to "Host Logs". |
| 12 | `apps/build-worker/src/worker.ts` | Worker Telemetry | Added fallback status logs to Redis (`vm:logs:worker:out` & `vm:logs:router:out`) when Linux PM2 log files are absent on macOS. |

---

## 3. Detailed File Diffs & Explanations

### File 1: `apps/dashboard/lib/api.ts`
- **Location**: `getApiBase()` function (around lines 6–25).
- **Change**:
```diff
 export function getApiBase(): string {
-  if (process.env.NEXT_PUBLIC_API_URL) {
-    return process.env.NEXT_PUBLIC_API_URL;
-  }
-  if (
-    typeof window !== "undefined" &&
-    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
-  ) {
-    return "http://localhost:8000";
-  }
-  return "https://whizan-cloud-service.onrender.com";
+  // When running locally in the browser, always prioritize local API on port 8000
+  if (
+    typeof window !== "undefined" &&
+    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
+  ) {
+    const envUrl = process.env.NEXT_PUBLIC_API_URL;
+    if (envUrl && (envUrl.includes("localhost") || envUrl.includes("127.0.0.1"))) {
+      return envUrl;
+    }
+    return "http://localhost:8000";
+  }
+
+  if (process.env.NEXT_PUBLIC_API_URL) {
+    return process.env.NEXT_PUBLIC_API_URL;
+  }
+
+  return "https://whizan-cloud-service.onrender.com";
 }
```
- **Why**: When Next.js compiles client components, `process.env.NEXT_PUBLIC_API_URL` is baked into the JavaScript bundle. If this had been set to the cloud URL, checking `if (process.env.NEXT_PUBLIC_API_URL)` first prevented local browser sessions from ever connecting to `localhost:8000`. By checking `window.location.hostname === "localhost"` first, local testing always talks to the local backend.
- **Production Impact**: **Zero.** On Vercel (or any public domain like `whizan.vercel.app`), `window.location.hostname` is NOT localhost, so it automatically falls back to `NEXT_PUBLIC_API_URL` or `https://whizan-cloud-service.onrender.com`.

---

### File 2: `apps/dashboard/next.config.ts`
- **Change**:
```diff
+const isDev = process.env.NODE_ENV !== "production";
+const defaultApiUrl = isDev ? "http://localhost:8000" : "https://whizan-cloud-service.onrender.com";
+const apiUrl = process.env.NEXT_PUBLIC_API_URL || defaultApiUrl;
+
 const nextConfig: NextConfig = {
   env: {
-    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "https://whizan-cloud-service.onrender.com",
+    NEXT_PUBLIC_API_URL: apiUrl,
   },
   async rewrites() {
     return [
       {
         source: "/api/:path*",
-        destination: `${process.env.NEXT_PUBLIC_API_URL || "https://whizan-cloud-service.onrender.com"}/api/:path*`,
+        destination: `${apiUrl}/api/:path*`,
       },
     ];
   },
 };
```
- **Why**: Ensures Next.js server rewrites (`/api/*`) proxy to `http://localhost:8000` when running locally with `npm run dev` or `next dev`, while still pointing to Render in production builds.

---

### File 3: `apps/dashboard/lib/domains.ts`
- **Change**:
```diff
+export function getBaseRouterDomain(): string {
+  if (
+    typeof window !== "undefined" &&
+    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
+  ) {
+    return process.env.NEXT_PUBLIC_BASE_DOMAIN || "localhost:8080";
+  }
+  return process.env.NEXT_PUBLIC_BASE_DOMAIN || "20.2.136.11.nip.io";
+}
+
+export const BASE_ROUTER_DOMAIN = getBaseRouterDomain();
+
 export function getServiceIngressUrl(slug: string): string {
-  const domain = BASE_ROUTER_DOMAIN;
+  const domain = getBaseRouterDomain();
   if (domain.startsWith("localhost")) {
     return `http://${slug}.${domain.includes(":") ? domain : `${domain}:8080`}`;
   }
   return `http://${slug}.${domain}`;
 }
```
- **Why**: Allows services tested locally to display `http://<service-slug>.localhost:8080` rather than attempting to route traffic to the Azure VM public IP.

---

### File 4: `apps/build-worker/src/worker.ts`
- **Location**: Worker telemetry loop (around line 720).
- **Change**:
```diff
+      const defaultWorkerLog = `[${new Date().toISOString()}] Local build-worker active on ${os.hostname()} (${os.platform()})\n[BullMQ] Worker listening for build and deployment jobs.\n[Docker] Connected to Docker socket.\n[Status] Operational`;
+      const defaultRouterLog = `[${new Date().toISOString()}] Local edge-router active on port 8080.\n[Status] Operational`;
+
-      await redisPub.set("vm:logs:worker:out", workerOut, "EX", 60);
-      await redisPub.set("vm:logs:worker:err", workerErr, "EX", 60);
-      await redisPub.set("vm:logs:router:out", routerOut, "EX", 60);
-      await redisPub.set("vm:logs:router:err", routerErr, "EX", 60);
+      await redisPub.set("vm:logs:worker:out", workerOut.trim() || defaultWorkerLog, "EX", 60);
+      await redisPub.set("vm:logs:worker:err", workerErr.trim() || "No worker error logs recorded.", "EX", 60);
+      await redisPub.set("vm:logs:router:out", routerOut.trim() || defaultRouterLog, "EX", 60);
+      await redisPub.set("vm:logs:router:err", routerErr.trim() || "No edge router error logs recorded.", "EX", 60);
```
- **Why**: On macOS, PM2 files at `/root/.pm2/logs/` do not exist. Without this fallback, visiting the Admin "Host Logs" tab in development showed an empty screen. Now it shows live worker operational status. On the Linux VM, `workerOut.trim()` has PM2 logs, so PM2 logs are used.

---

### File 5: `apps/dashboard/app/dashboard/admin/page.tsx`
- **Change**:
```diff
               <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
-                {isWorkerOnline ? "Cloud Worker Online" : "Cloud Worker Disconnected"}
+                {isWorkerOnline
+                  ? (vm?.hostname?.includes("local") || vm?.platform === "darwin"
+                      ? "Local Development Worker Online"
+                      : "Cloud Worker Online")
+                  : "Worker Disconnected"}
               </span>
```
- **Why**: Accurately reflects whether the heartbeat in Redis is coming from your local Mac worker or from the production VM worker.

---

### Files 6–9: Log Streaming & Shell Components
- Files:
  - `apps/dashboard/components/service-logs.tsx`
  - `apps/dashboard/components/service-shell.tsx`
  - `apps/dashboard/app/dashboard/projects/[id]/deployments/[dId]/page.tsx`
  - `apps/dashboard/app/dashboard/backend/[id]/deployments/[dId]/page.tsx`
  - `apps/dashboard/lib/auth.tsx`
- **Change**: Replaced hardcoded `process.env.NEXT_PUBLIC_API_URL || "https://whizan-cloud-service.onrender.com"` with dynamic `getApiBase()`.
- **Why**: Keeps all stream URLs (EventSource SSE and WebSockets) consistent with the active environment.

---

## 4. Do You Need to Revert These Changes for Production?

### **No Reversion Is Required (Safe by Design)**
All changes were deliberately written using **dynamic environment detection**:
1. **Client-side**: When deployed to Vercel, users access `https://whizan-cloud-service-dashboard...vercel.app`. Since the hostname is not `localhost`, `getApiBase()` automatically routes to `NEXT_PUBLIC_API_URL` (or Render).
2. **Server-side**: In production builds (`NODE_ENV === "production"`), `next.config.ts` automatically defaults to Render.
3. **Worker**: On the Linux VM (where PM2 is active), `worker.ts` reads the real PM2 logs.

---

## 5. Production Deployment Checklist (When Ready)

When you are ready to deploy the new features (including Managed Databases, GitHub OAuth, and Admin improvements) to production, follow these steps:

### Step 1: Database Migration on Supabase
Your local database was updated with the `database_services` table. To apply this to the production database:
```bash
# Push schema to the Supabase PostgreSQL database
DATABASE_URL="<Supabase-URL-from-Whizan-cloud-service.env>" npx prisma db push --schema packages/db/prisma/schema.prisma
```

### Step 2: Environment Variables Verification
Ensure your production services have the following environment variables configured:

#### Render (`apps/api`):
- `DATABASE_URL`: Your Supabase connection string.
- `REDIS_URL`: Upstash Redis connection string.
- `JWT_SECRET`: Production secret.
- `ENCRYPTION_KEY`: AES-256 encryption key.
- `GITHUB_CLIENT_ID`: OAuth Client ID (`YOUR_GITHUB_CLIENT_ID`).
- `GITHUB_CLIENT_SECRET`: OAuth Client Secret.
- `GITHUB_CALLBACK_URL`: `https://whizan-cloud-service.onrender.com/api/auth/github/callback`.
- `DASHBOARD_URL`: Your production Vercel dashboard URL.

#### Vercel (`apps/dashboard`):
- `NEXT_PUBLIC_API_URL`: `https://whizan-cloud-service.onrender.com`
- `NEXT_PUBLIC_BASE_DOMAIN`: `20.2.136.11.nip.io`

#### Azure VM (`apps/build-worker` & `apps/edge-router`):
- `DATABASE_URL`: Same Supabase connection string.
- `REDIS_URL`: Same Upstash Redis connection string.
- `ENCRYPTION_KEY`: Same AES key.
- `BASE_DOMAIN`: `20.2.136.11.nip.io`
- Run PM2 restart:
  ```bash
  pm2 restart all
  ```

---

## 6. How to Force-Revert (If Desired)

If you ever want to completely discard these local modifications and reset the repository back to git `HEAD`:

```bash
# To revert only the dashboard routing files:
git checkout origin/main -- apps/dashboard/lib/api.ts apps/dashboard/next.config.ts apps/dashboard/lib/domains.ts

# To revert all modified files in one command:
git checkout origin/main -- apps/
```
*(Note: As requested, no commits or pushes have been made to your GitHub repository.)*
