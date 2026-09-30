# AGENTS.md — Global Autonomous Agent Instructions for Whizan Cloud Service

This repository houses **Whizan Cloud Service** (control plane, dashboard, build-worker, edge-router, and MCP devops tooling).
When deploying services or frontend applications to Whizan using the `@whizan/mcp-devops` tools, you MUST follow this strict protocol.

---

## 🛑 The Mandatory 6-Phase Deployment Protocol

```
Phase 1: AUDIT & CONTEXT SYNC  Phase 2: ENVIRONMENT      Phase 3: PROVISION OR REDEPLOY
whizan_analyze_workspace     ──► whizan_set_env_vars ──► Reuse existing targetId OR
                                                         whizan_create_project/service
                                                                    │
                                                                    ▼
Phase 6: HEALTH CHECK          Phase 5: POLL LOGS        Phase 4: UPLOAD
whizan_check_health         ◄── whizan_get_build_logs  ◄── whizan_deploy_direct
(Must be 200 OK)                (Wait until READY/ACTIVE)  (Zero-redundancy cleanup)
```

---

### Strict Agent Directives:

1. **Phase 1: Audit & Cross-Chat Context Discovery**:
   - You MUST start with `whizan_analyze_workspace` to inspect the project type, language, entry point file, internal port, environment variables, local `.whizan.json`, and Whizan Cloud server records.
   - **Cross-Chat Context Rule**: When a user asks to deploy or redeploy in a fresh chat session with no previous context:
     - `whizan_analyze_workspace` inspects `.whizan.json` in the workspace root AND searches server records for a matching project or service.
     - If an `existingDeployment` is detected: **DO NOT CREATE A NEW PROJECT OR SERVICE**. Ask the user for confirmation to redeploy to the existing deployment ID (`targetId`), then proceed directly to `whizan_deploy_direct` or `whizan_redeploy`.
     - Never alter slugs or create duplicate resources for an existing codebase.

2. **Compute Allocation & Subscription Tiers (Strict Policy)**:
   - **Agents MUST NOT decide compute and RAM allocations arbitrarily**.
   - User subscriptions have two tiers: **Hobby** and **Professional**.
   - **Hobby Tier**:
     - Frontend projects run on standard Edge routing / CDN.
     - Backend microservices are **strictly locked to free tier**: `0.1 vCPU`, `512MB RAM`, and `autoSleep=true`.
     - Databases are **strictly locked to starter tier**: `0.5 vCPU`, `512MB RAM`.
     - Agents are strictly prohibited from selecting custom or higher instance types on the Hobby plan.
   - **Professional Tier**:
     - Users can choose upgraded instances (`starter`, `standard`, `pro`, `pro_plus`) directly from the dashboard hosting pages.

3. **Frontend vs Backend Routing**:
   - **Frontend / Web App (Vite, React, Astro, Next.js)**: Call `whizan_create_project`. Set `framework: "VITE"` (or `"NEXTJS"`), and `outputDir: "dist"` (or `".next"` for Next.js). Then call `whizan_deploy_direct` with `targetType: "project"`. NEVER call `whizan_create_service` for frontend apps!
   - **Backend Microservice (Node.js, Python, Go)**: Call `whizan_create_service`. Set `internalPort` and `startCommand`. Then call `whizan_deploy_direct` with `targetType: "service"`.

4. **Never Skip Environment Variables**: If the application requires database credentials, API keys, or secret tokens, you MUST set them using `whizan_set_env_vars` BEFORE starting deployment.

5. **Loopback Binding Trap**: For backends, the application must bind to `0.0.0.0`, NOT `127.0.0.1` or `localhost`. If `127.0.0.1` is detected, patch it to `0.0.0.0` before deployment.

6. **Phase 4 & 5: Upload, Zero-Redundancy Cleanup & Log Polling**:
   - `whizan_deploy_direct` uploads the source archive and enqueues the build job on Azure VM.
   - **Zero Redundancy**: Upon new deployment cutover, previous Docker containers, obsolete build packages, node_modules, Redis chunks, and old deployment database records are automatically purged.
   - You MUST extract the `deploymentId` and call `whizan_get_build_logs` every 5-10 seconds until `status` is `READY` / `ACTIVE` or `FAILED`. Never declare completion early.

7. **Phase 6: Live Health Check**:
   - Once build finishes with `READY` or `ACTIVE`, call `whizan_check_health`.
   - **Protocol rule**: Always use `http://<slug>.20.2.136.11.nip.io` (never `https://`, because the Azure VM Edge Router operates on Port 80 HTTP).
   - Only declare success after `whizan_check_health` returns `ok: true` (HTTP 200/204).
