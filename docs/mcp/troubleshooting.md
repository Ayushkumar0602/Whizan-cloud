# Whizan DevOps MCP Server — Troubleshooting & Edge Case Guide

This document documents common failure scenarios, edge cases, root causes, and battle-tested solutions encountered when using `@whizan/mcp-devops`.

---

## 1. macOS AppleDouble `._*` Extended Attribute Errors

### Symptom:
During `whizan_get_build_logs`, the deployment fails with exit code 1 and stdout logs show:
```
[stderr] chmod: changing permissions of '/app/docs/._ai-technical.md': Operation not permitted
[stderr] chmod: changing permissions of '/app/create_s3_bucket.js': Operation not permitted
✗ Build failed: Build failed with exit code 1.
```

### Root Cause:
When packing tar archives on macOS, AppleDouble metadata files (`._filename.md`) are created. When unpacked inside Linux Docker containers, invoking `chmod -R 777 /app` while `set -e` is enabled causes `chmod` to emit permission warnings on these extended attribute files, returning exit code 1 and immediately aborting the container build process.

### Solution (Built into `@whizan/mcp-devops` & `build-worker`):
1. **Archive Exclusion (`packages/mcp-devops/src/utils/archive.ts`)**:
   - `DEFAULT_IGNORES` excludes `._*` files.
   - Sets `COPYFILE_DISABLE: "1"` environment variable when invoking `tar -czf` on macOS.
2. **Safe Container Permissions (`apps/build-worker/src/docker-runner.ts`)**:
   - Executes `chmod` safely before turning on `set -e`:
     ```bash
     chmod -R 777 /app 2>/dev/null || true; set -e; ...
     ```

---

## 2. The `127.0.0.1` / `localhost` Loopback Trap

### Symptom:
The backend service builds cleanly and status is marked `READY`, but calling `whizan_check_health` returns `502 Bad Gateway` or times out.

### Root Cause:
The application code explicitly binds to loopback `127.0.0.1` (e.g. `app.listen(8000, "127.0.0.1")`). Inside an isolated Docker container, binding to `127.0.0.1` makes the socket unreachable from the host VM and Edge Router proxy.

### Solution:
Agents must run `whizan_analyze_workspace` in Phase 1. If loopback binding is detected, patch the entry point to bind to `0.0.0.0`:
```javascript
const PORT = process.env.PORT || 8000;
app.listen(PORT, "0.0.0.0", () => console.log(`Listening on 0.0.0.0:${PORT}`));
```

---

## 3. Upstash Redis 10MB Request Payload Ceiling

### Symptom:
`whizan_deploy_direct` fails with `413 Payload Too Large` or Upstash HTTP error `Request body exceeds maximum size of 10485760 bytes`.

### Root Cause:
Base64 encoding increases file payload size by ~33%. Uploading tarballs larger than 7.5 MB raw (40 MB uncompressed) exceeds Upstash Redis's strict 10 MB per-request limit.

### Solution:
`@whizan/mcp-devops` uses a **2MB Staging Chunking Engine**. It automatically slices the tarball into 2MB chunks, uploads them sequentially to `/api/deployments/:id/chunk`, and reassembles them in Redis before enqueuing the build job.

---

## 4. Cloudflare Zero-Maintenance Wildcard SSL & Custom Domain
 
### Behavior:
Deployments are accessible via `https://<slug>.whizan.cloud` with end-to-end SSL termination handled by Cloudflare Edge Proxy.

### Protocol Rule:
* Format health check URLs as `https://<slug>.whizan.cloud`.
* For legacy nip.io endpoints, use `http://<slug>.20.2.136.11.nip.io`.

---

## 5. Azure VM PM2 Process Context (`sudo pm2`)

### Symptom:
Running `pm2 status` as `azureuser` on the Azure VM outputs `[PM2][WARN] No process found`.

### Root Cause:
The Whizan build worker and edge router PM2 daemons run under the `root` superuser context (`/root/.pm2`).

### Solution:
* Always execute PM2 commands using `sudo pm2` on the VM:
  ```bash
  sudo pm2 status
  sudo pm2 logs build-worker --lines 50
  sudo pm2 restart all
  ```

---

## 6. Cold-Boot & VM Reboot Recovery

### Symptom:
When the Azure VM reboots, containers are not running.

### Design Guarantee:
* Source tarballs are permanently stored in `/opt/whizan-sources/services/<id>/source.tar.gz` (never in temporary `/tmp` folders).
* Upon reboot, the Build Worker reads persistent source archives and restarts all registered container instances automatically.

---

## 7. Windows / Antigravity IDE `MODULE_NOT_FOUND` on MCP Startup

### Symptom:
When connecting the Whizan MCP server in Antigravity IDE, Cursor, or VS Code on Windows, the client immediately closes with:
```
Error: Cannot find module 'C:\Users\...\AppData\Local\Programs\Antigravity IDE\packages\mcp-devops\dist\index.js'
  code: 'MODULE_NOT_FOUND',
  requireStack: []
}
connection closed: calling "initialize": client is closing: EOF.
```

### Root Cause:
1. **Relative Path Trap**: The MCP configuration uses a relative path (`"args": ["packages/mcp-devops/dist/index.js"]`). On Windows, IDEs execute subprocesses from their application installation directory (`C:\Users\...\AppData\Local\Programs\Antigravity IDE`), NOT the workspace repository directory.
2. **Missing Build Artifacts**: The repository was cloned from Git without compiling the TypeScript source files. As a result, `packages/mcp-devops/dist/` does not yet exist.

### Solution:
1. **Compile the Package**:
   In PowerShell or Command Prompt, navigate to the cloned repository and build:
   ```bash
   cd packages/mcp-devops
   npm install
   npm run build
   ```
   Ensure `packages/mcp-devops/dist/index.js` exists.

2. **Specify Full Absolute Path in `mcp_config.json`**:
   In `C:\Users\<YourUser>\.gemini\antigravity-ide\mcp_config.json` (or workspace `.cursor/mcp.json`), always provide the absolute path. Use forward slashes (`/`) to avoid Windows backslash escape issues:
   ```json
   {
     "mcpServers": {
       "whizan": {
         "command": "node",
         "args": [
           "C:/Users/HP/Desktop/Whizan-cloud-service/packages/mcp-devops/dist/index.js"
         ],
         "env": {
           "WHIZAN_API_URL": "https://api.whizan.cloud",
           "WHIZAN_API_KEY": "whz_live_YOUR_ACTUAL_KEY_HERE"
         }
       }
     }
   }
   ```
   *(Replace `C:/Users/HP/Desktop/Whizan-cloud-service` with the actual path to the cloned repository on your drive).*

