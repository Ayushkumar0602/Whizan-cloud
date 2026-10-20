# Mandatory 6-Phase Deployment Protocol Guide

To guarantee zero-downtime, predictable, and fully verified deployments across Whizan Cloud Service, AI coding agents interacting with `@whizan/mcp-devops` **MUST STAGE AND EXECUTE DEPLOYMENTS FOLLOWING THIS STRICT 6-PHASE PROTOCOL**.

---

## 🛑 The Protocol Overview

```
Phase 1: AUDIT           Phase 2: ENVIRONMENT      Phase 3: PROVISION
whizan_analyze_workspace ──► whizan_set_env_vars ──► whizan_create_service
                                                      (or create_project)
                                                              │
                                                              ▼
Phase 6: HEALTH CHECK    Phase 5: POLL LOGS        Phase 4: UPLOAD
whizan_check_health   ◄── whizan_get_build_logs  ◄── whizan_deploy_direct
(Must return 200 OK)      (Wait until READY/FAILED)  (Save deploymentId)
```

---

## 📋 Phase-by-Phase Specification

### Phase 1: Audit (`whizan_analyze_workspace`)
* **Objective**: Scan the local workspace directory to auto-discover project topology, framework, listening ports, `127.0.0.1` binding traps, missing CORS middleware, and required environment variables.
* **Mandatory Action**: Run `whizan_analyze_workspace` BEFORE making any API registration calls or code edits.
* **Rule**: If the audit detects `127.0.0.1` or `localhost` binding (e.g. `app.listen(8000, "127.0.0.1")`), use `whizan_generate_patch` or edit the source file to bind to `0.0.0.0`.

---

### Phase 2: Environment Variables (`whizan_set_env_vars`)
* **Objective**: Register, update, or encrypt environment secrets (`DATABASE_URL`, `JWT_SECRET`, API keys) on Whizan Cloud.
* **Mandatory Action**: Call `whizan_set_env_vars` BEFORE starting the deployment build.
* **Rule**: Never deploy backends without required database connection strings or secrets; doing so causes immediate boot crash loops in the container sandbox.

---

### Phase 3: Resource Provisioning (`whizan_create_service` / `whizan_create_project`)
* **Objective**: Register the cloud application entity on Whizan Cloud.
* **Routing Decision Tree**:
  - **Backend Microservices (Node.js, Python, Go, Dockerfile)**: Call `whizan_create_service`. Pass `internalPort` (e.g. `8000`) and `startCommand` (e.g. `npm start`).
  - **Frontend / Web Apps (Vite, React SPA, Next.js, Astro)**: Call `whizan_create_project`. Pass `framework` (`"VITE"`, `"NEXTJS"`, `"REACT"`) and `outputDir` (`"dist"` for Vite/React/Astro or `".next"` for Next.js).
* **Rule**: NEVER call `whizan_create_service` for static/frontend apps, and NEVER call `whizan_create_project` for long-running Node/Python servers.

---

### Phase 4: Direct Upload (`whizan_deploy_direct`)
* **Objective**: Package source files and trigger the build pipeline on the Azure VM worker.
* **Mandatory Action**: Call `whizan_deploy_direct` with `targetType` (`"service"` or `"project"`), `targetId`, and `workspaceDir`.
* **Rule**: Extract and store the returned `deploymentId`. Uploading only enqueues the job; it does NOT mean the build has finished!

---

### Phase 5: Log Polling & Telemetry (`whizan_get_build_logs`)
* **Objective**: Monitor container compilation and deployment logs on the worker VM.
* **Mandatory Action**: Poll `whizan_get_build_logs` every 5 to 10 seconds in a loop until `status` is `READY` / `ACTIVE` or `FAILED`.
* **Rule**: Never report completion to the user while status is `BUILDING` or `QUEUED`. If status is `FAILED`, inspect `logs`, identify the failure cause (e.g., missing package, syntax error), fix the code, and redeploy.

---

### Phase 6: Live Health Check (`whizan_check_health`)
* **Objective**: Perform empirical HTTP verification of the live application URL.
* **Mandatory Action**: Call `whizan_check_health` targeting `https://<slug>.whizan.cloud/health` (or root `/`).
* **Protocol Rule**: Use `https://<slug>.whizan.cloud` secured via Cloudflare Zero-Maintenance Wildcard SSL.
* **Success Criteria**: Only declare deployment success after `whizan_check_health` returns `ok: true` (HTTP 200 or 204).

---

## 🤖 Strict Rules for AI Coding Agents

1. **No Blind Deployments**: Always start with `whizan_analyze_workspace`.
2. **Never Ignore `0.0.0.0`**: If `127.0.0.1` is detected in server listening code, patch it to `0.0.0.0` before deploying.
3. **No Premature Exit**: Never stop execution after `whizan_deploy_direct`. You MUST poll build logs until status is `READY`.
4. **Always Health Check**: Verify live HTTPS 200 status using `whizan_check_health` on `https://<slug>.whizan.cloud` before reporting completion.
