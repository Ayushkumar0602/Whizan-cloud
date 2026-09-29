# AGENTS.md — Global Autonomous Agent Instructions for Whizan Cloud Service

This repository houses **Whizan Cloud Service** (control plane, dashboard, build-worker, edge-router, and MCP devops tooling).
When deploying services or frontend applications to Whizan using the `@whizan/mcp-devops` tools, you MUST follow this strict 6-phase protocol.

---

## 🛑 The Mandatory 6-Phase Deployment Protocol

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

### Strict Agent Directives:
1. **Never Deploy Blindly**: You MUST start with `whizan_analyze_workspace` to inspect the project type, language, entry point file, internal port, and environment variables.
2. **Frontend vs Backend Routing**:
   - **Frontend / Web App (Vite, React, Astro, Next.js)**: Call `whizan_create_project`. Set `framework: "VITE"` (or `"NEXTJS"`), and `outputDir: "dist"` (or `".next"` for Next.js). Then call `whizan_deploy_direct` with `targetType: "project"`. NEVER call `whizan_create_service` for frontend apps!
   - **Backend Microservice (Node.js, Python, Go)**: Call `whizan_create_service`. Set `internalPort` and `startCommand`. Then call `whizan_deploy_direct` with `targetType: "service"`.
3. **Never Skip Environment Variables**: If the application requires database credentials, API keys, or secret tokens, you MUST set them using `whizan_set_env_vars` BEFORE starting deployment.
4. **Loopback Binding Trap**: For backends, the application must bind to `0.0.0.0`, NOT `127.0.0.1` or `localhost`. If `127.0.0.1` is detected, patch it to `0.0.0.0` before deployment.
5. **Never Stop at Upload**: `whizan_deploy_direct` only enqueues the build job on the Azure VM build worker. You MUST extract the `deploymentId` and monitor progress.
6. **Poll Build Logs**: Call `whizan_get_build_logs` every 5-10 seconds until `status` is `READY` / `ACTIVE` or `FAILED`. If `FAILED`, read the logs, fix the root cause, and redeploy.
7. **Live Health Check**: Once ready, call `whizan_check_health`.
   - **Protocol rule**: Always use `http://<slug>.20.2.136.11.nip.io` (never `https://`, because the Azure VM Edge Router operates on Port 80 HTTP).
   - Only declare success after `whizan_check_health` returns `ok: true` (HTTP 200/204).
