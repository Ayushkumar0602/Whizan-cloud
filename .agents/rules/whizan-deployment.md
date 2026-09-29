# Whizan Cloud DevOps — Mandatory Deployment Protocol for AI Agents

All AI agents (Antigravity, Cursor, Claude Code, Copilot, Cline) operating with Whizan Cloud Service MUST strictly adhere to this 6-phase deployment protocol. **Never deploy blindly, never skip environment variables, never stop before verifying build logs, and never report success without executing a health check.**

---

## 🛑 The Mandatory 6-Phase Protocol

```
Phase 1: AUDIT           Phase 2: ENVIRONMENT      Phase 3: PROVISION
whizan_analyze_workspace ──► whizan_set_env_vars ──► whizan_create_service
                                                      (or create_project)
                                                              │
                                                              ▼
Phase 6: HEALTH CHECK    Phase 5: POLL LOGS        Phase 4: UPLOAD
whizan_check_health   ◄── whizan_get_build_logs  ◄── whizan_deploy_direct
(Must be 200 OK)          (Wait until READY/FAILED)  (Save deploymentId)
```

---

### Phase 1: Deep Repository Audit (`whizan_analyze_workspace`)
Before creating any cloud resource or triggering any deployment:
1. Run `whizan_analyze_workspace(workspaceDir: ".")`.
2. Inspect the returned report:
   - **Language & Runtime**: `PYTHON`, `NODE`, or `GO`.
   - **Framework**: FastAPI, Flask, Express, Next.js, Vite, etc.
   - **Internal Port**: Identify the port the application listens on (default 8000 for Python, 3000 for Node).
   - **Loopback Trap Check**: The application **MUST** bind to `0.0.0.0`, NOT `127.0.0.1` or `localhost`. If the code contains `127.0.0.1`, patch it to `0.0.0.0` before proceeding.
   - **CORS Readiness**: Ensure the backend allows requests from the frontend origin.
   - **Environment Variables**: Review `referencedInCode` and `missingFromLocalEnv`.

---

### Phase 2: Environment Variable Registration (`whizan_set_env_vars`)
**CRITICAL RULE:** Do NOT trigger a build if environment variables are missing. Missing database URLs, JWT secrets, or cloud keys will cause container crash loops on boot.
1. Inspect local `.env`, `.env.example`, `.env.production`, or ask the user for necessary secrets.
2. If large service account credentials (e.g. `FIREBASE_SERVICE_ACCOUNT_KEY` or database connection strings) are required, format them as valid JSON/strings.
3. Call `whizan_set_env_vars`:
   ```json
   {
     "targetType": "service",
     "targetId": "<serviceId>",
     "envVars": {
       "DATABASE_URL": "...",
       "JWT_SECRET": "...",
       "FIREBASE_SERVICE_ACCOUNT_KEY": "{...}"
     }
   }
   ```
4. Verify that all required variables return `true` before deploying.

---

### Phase 3: Service / Project Provisioning
1. If deploying a backend (API, worker, microservice):
   - Call `whizan_create_service`:
     - `name`: Human-readable name.
     - `language`: `PYTHON`, `NODE`, or `GO`.
     - `internalPort`: Port matching application listen port (e.g. 8000 or 3000).
     - `startCommand`: Explicit start command (e.g. `python -m uvicorn main:app --host 0.0.0.0 --port 8000`).
     - `autoSleep`: `true` for standard/free tier with scale-to-zero; `false` for dedicated always-on.
2. If deploying a frontend (Next.js, Vite, React, Astro):
   - **CRITICAL**: Use `whizan_create_project` (NEVER `whizan_create_service`).
   - `framework`: `NEXTJS`, `REACT`, `VITE`, or `ASTRO`.
   - `buildCommand`: `npm run build` (or matching package.json).
   - `outputDir`: MUST be `"dist"` for Vite, React, Astro; or `".next"` for Next.js.
   - For Phase 4, use `targetType: "project"`.

---

### Phase 4: Direct Upload Packaging (`whizan_deploy_direct`)
1. Call `whizan_deploy_direct(targetType, targetId, workspaceDir)`.
2. The packer automatically filters out `node_modules`, `venv`, `.git`, `.next`, and large build caches.
3. **DO NOT assume the deployment is complete when upload returns.**
   The tool response confirms only that the source archive has been received and queued on the Azure VM build worker.
4. Extract and record the returned `deploymentId`.

---

### Phase 5: Build Log Polling & Diagnostics (`whizan_get_build_logs`)
1. Poll `whizan_get_build_logs(deploymentId)` every 5 to 10 seconds.
2. Inspect `status`:
   - `QUEUED` / `BUILDING`: Wait 5-10s and poll again. Do not report completion.
   - `ACTIVE` / `READY`: Build succeeded! Proceed to Phase 6.
   - `FAILED`: Build failed!
     - Read the `logs` and `errorMessage`.
     - Diagnose the failure (e.g. missing dependency in `requirements.txt` or `package.json`, TypeScript compiler error, start command syntax error).
     - Fix the codebase or update environment variables.
     - Call `whizan_redeploy` or `whizan_deploy_direct` to retry.

---

### Phase 6: Live Health Check (`whizan_check_health`)
1. **HTTP Protocol Invariant**:
   - The Whizan Edge Router on Azure VM listens on **Port 80 (HTTP)**.
   - Port 443 (HTTPS) is not bound for `*.nip.io` domains.
   - **Always use `http://<slug>.20.2.136.11.nip.io`**, NEVER `https://`.
2. Call `whizan_check_health(url)`:
   - Target root `http://<slug>.20.2.136.11.nip.io/` or `/health`.
3. If the app is waking up from auto-sleep (returns 202 or 502 with loading screen), wait 3-5 seconds and retry.
4. Only when `whizan_check_health` returns `ok: true` (HTTP 200/204) is the deployment complete.
5. Report the verified public URL to the user.
