# In-Browser Web Shell / Container Exec (`docker exec` via WebSocket)

> **Context:** This document explains the architecture, security isolation model, and implementation of the In-Browser Web Shell feature in Whizan Cloud Service, enabling interactive terminal sessions inside running backend containers directly from the web browser dashboard.

---

## 🎯 Architectural Goal & User Value

The **In-Browser Web Shell** provides developers with an interactive terminal prompt inside their live running container without requiring SSH keys, open ports (like port 22), or local Docker CLI configurations.

### Common Developer Use Cases:
- **Database Migrations & Seeds:** Running `npx prisma migrate deploy`, `python manage.py migrate`, or creating admin users.
- **Interactive REPLs:** Launching `node`, `python`, or `rails console` to inspect runtime memory or test queries against the production database.
- **Filesystem & Dependency Inspection:** Verifying files in `/app`, checking `package.json`, inspecting generated builds.
- **Mesh Connectivity Diagnostics:** Running `nc -zv hostify-postgres 5432`, `curl`, or checking internal DNS resolution.
- **Environment & Process Monitoring:** Running `printenv`, `top`, or `ps aux`.

---

## 🔒 Security & Multi-Tenant Isolation Model

To strictly fulfill the requirement that **users only have access to their own application container and never to other users' containers or cloud infrastructure**, the following safeguards are implemented:

```
[ Browser / Dashboard ]
         │ (wss:// connection with JWT ?token=...)
         ▼
[ Fastify API WebSocket Gateway ]
   ├── 1. JWT Authentication (verify token -> extract userId)
   ├── 2. Ownership Verification (DB query: service.userId === userId)
   └── 3. Strict Container Resolution (Lookup active READY deployment)
         │
         ▼
[ Docker Engine API (`docker.exec`) ]
   ├── Targets ONLY: /service-{slug}-{shortId}
   ├── WorkingDir: /app/{rootDir}
   └── Sandboxed in Container Namespaces (No host / infrastructure access)
```

### 1. Cryptographic User Authentication
Every WebSocket upgrade request must provide a valid JWT in the query parameter (`?token=...`). Unauthenticated requests are rejected immediately with `401 Unauthorized`.

### 2. Strict Service Ownership Check
The API queries PostgreSQL:
```ts
const service = await prisma.backendService.findFirst({
  where: { id: serviceId, userId: request.user.userId }
});
if (!service) {
  socket.close(4003, "Forbidden");
}
```
If a user attempts to target a service that does not belong to their account, the socket is immediately closed with `4003 Forbidden`.

### 3. Strict Target Container Resolution
The endpoint **never** accepts a container ID from the client. Instead, it deterministically resolves the container by querying:
1. The active `READY` deployment for that verified `serviceId`.
2. Docker containers strictly matching:
   - `Labels["serviceId"] === service.id`
   - `Labels["deploymentId"] === activeDeployment.id`
   - `Name === "/service-${slug}-${shortId}"`
   - `State === "running"`

> [!IMPORTANT]
> **Cloud Infrastructure Protection:** System containers such as `hostify-postgres`, `hostify-redis`, `api`, `build-worker`, and other tenants' containers lack matching `serviceId` labels and can **never** be targeted or accessed.

### 4. Linux Kernel Container Sandboxing & Resource Capping
The container runtime enforces strict kernel-level limits configured in [`apps/build-worker/src/service-runner.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/build-worker/src/service-runner.ts):
- **Memory Ceiling:** Hard limit of 512MB RAM (`Memory: 512 * 1024 * 1024`).
- **CPU Quota:** Hard limit of 1 vCPU (`NanoCPUs: 1000000000`), preventing compute runaway or mining from degrading the host.
- **Process Bomb & Fork Defense:** Maximum of 128 processes (`PidsLimit: 128`). Fork bombs like `:(){ :|:& };:` hit this ceiling immediately and are neutralized without starving host PIDs.
- **Linux Capability Dropping (`CapDrop`):**
  - `NET_ADMIN`: Prevents modifying routing tables, altering network interfaces, or creating unauthorized virtual TUN/TAP devices.
  - `SYS_ADMIN`: Drops root namespace manipulation, mounting filesystems, or inspecting host namespaces.
  - `SYS_RAWIO`: Prevents raw disk and I/O bus tampering.
  - `SYS_PTRACE`: Prevents attaching debuggers or code injection into other container processes.
  - `DAC_OVERRIDE`: Strictly enforces filesystem permission checks.
- **Privilege Escalation Prevention:** `SecurityOpt: ["no-new-privileges:true"]` prevents setuid binaries (e.g. `sudo`, `su`) from gaining root privileges.

---

## 🛡️ Real-Time Command Guardrail & Anti-Abuse Engine

Interactive web shell sessions are protected by a real-time stream interception engine defined in [`apps/api/src/lib/container-security.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/lib/container-security.ts).

### Interception Architecture
```
[ User Types Keystrokes in Web Shell ]
               │
               ▼
[ Fastify WebSocket Gateway ] 
  ├── Keystroke Accumulator (maintains lineBuffer across chunks)
  └── On Enter (`\r` / `\n`):
       ├── Evaluates `evaluateCommandSecurity(fullCommand)`
       ├── IF RESTRICTED:
       │    ├── 1. Sends `\x03` (SIGINT) to Docker shell (discards command before execution)
       │    ├── 2. Emits bright ANSI alert banner to user's terminal with reason & rule ID
       │    └── 3. Emits audit warning log on API server
       └── IF AUTHORIZED:
            └── Passes input directly to Docker PTY
```

### Restricted Rule Catalog
| Category | Rule ID | Example Blocked Commands | Rationale |
| :--- | :--- | :--- | :--- |
| **Out-of-Scope Source Control** | `git-clone-restricted` | `git clone ...`, `git push`, `git remote add`, `svn checkout`, `hg clone` | Containers are for runtime execution. Code must be deployed via Git webhooks / deployment pipeline. |
| **Package Manager Tampering** | `package-manager-install` | `apt-get install ...`, `apk add ...`, `yum install ...`, `pacman -S ...` | Runtime OS installations are disabled. Dependencies must be defined in build configs (`package.json`, `requirements.txt`). |
| **Remote Script Pipe-to-Shell** | `pipe-to-shell` | `curl ... \| bash`, `wget ... \| sh` | Piping remote unvetted scripts directly into shell interpreters is the primary vector for malware and botnets. |
| **Cryptocurrency Mining** | `crypto-mining` | `xmrig`, `minerd`, `cpuminer`, `stratum+tcp://...` | Cryptocurrency mining and background compute abuse strictly violate service terms. |
| **Network Scanning & Pentesting** | `network-scanning` | `nmap`, `masscan`, `zmap`, `hping3`, `sqlmap`, `tcpdump` | Network scanning and packet sniffing are prohibited inside customer containers. |
| **Proxying & Unauthorized Tunnels** | `proxy-tunneling` | `tor`, `openvpn`, `wireguard`, `ngrok`, `chisel`, `socat` | Using container infrastructure as open proxies, anonymization exit nodes, or unauthorized tunnels is blocked. |
| **Reverse Shells & Backdoors** | `reverse-shell` | `nc -lvnp ...`, `bash -i >& /dev/tcp/...` | Reverse shells and raw socket redirection backdoors are intercepted and blocked. |
| **Cloud Metadata Probing** | `cloud-metadata-probe` | `curl 169.254.169.254/...`, `metadata.google.internal` | Probing cloud metadata endpoints to extract host IAM credentials or infrastructure secrets is blocked. |
| **System Destruction & Bombs** | `destructive-commands` | `:(){ :\|:& };:`, `rm -rf /`, `mkfs`, `dd if=/dev/zero of=/dev/sda` | Destructive disk and fork bomb operations are blocked by policy. |
| **Namespace Escaping** | `container-escape` | `nsenter`, `chroot /host`, `mount -t` | Container breakout and filesystem mount attempts are prohibited. |
| **P2P Torrenting** | `p2p-torrenting` | `aria2c`, `transmission-cli`, `rtorrent`, `deluge` | Peer-to-peer file sharing and piracy downloaders are prohibited. |

### Verified Allowed Operations (Developer Scenarios)
Legitimate debugging and maintenance commands execute with zero hindrance:
- File & directory inspection: `ls -la`, `pwd`, `cat .env`, `find .`, `grep -rn`
- Process & resource monitoring: `ps aux`, `top`, `env`
- Language runtimes & tools: `node -v`, `npm test`, `npm run build`, `python -V`
- Database tools & migrations: `npx prisma migrate status`, `npx prisma db seed`
- Safe local testing: `curl http://localhost:8000/api/health`
- Read-only Git inspection: `git status`, `git log -n 5`, `git diff`

---

## 🔌 Implementation Architecture

### 1. Backend (`apps/api`)
- **Plugin:** `@fastify/websocket` v10 (wrapping `ws`).
- **Route:** `GET /api/services/:id/exec` with `{ websocket: true }`.
- **Universal Shell Detection:**
  ```bash
  sh -c "if [ -x /bin/bash ]; then exec /bin/bash; elif [ -x /bin/sh ]; then exec /bin/sh; else exec sh; fi"
  ```
  Seamlessly launches `bash` if available (for full tab completion and history) and falls back to `sh` on minimal images (Alpine, distroless, slim).
- **Terminal Resize Protocol:** Listens for `{ type: "resize", cols, rows }` from the client and calls `exec.resize({ w: cols, h: rows })` to dynamically adapt line wrapping and text editors (`vi`, `nano`, `top`).
- **Lifecycle Cleanup:** On socket disconnection, `stream.destroy()` terminates the container process immediately.

### 2. Frontend (`apps/dashboard`)
- **Component:** [`apps/dashboard/components/service-shell.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/components/service-shell.tsx).
- **Terminal Engine:** `@xterm/xterm` (v5.5.0) paired with `@xterm/addon-fit`.
- **Features:**
  - Modern dark terminal styling matching the dashboard aesthetic.
  - Active container indicator badge (`service-{slug}-{shortId}`).
  - Live status indicator (Connected, Disconnected, Error).
  - Quick action toolbar: `Clear`, `Reconnect`, and quick command shortcuts (`ls -la`, `pwd`, `runtime -v`, `printenv`, `top`).
  - Native auto-resizing via `ResizeObserver`.
- **Tab Integration:** Embedded in [`apps/dashboard/app/dashboard/backend/[id]/page.tsx`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/dashboard/app/dashboard/backend/%5Bid%5D/page.tsx) with a switcher between **"Build & Runtime Logs"** and **"Web Shell (docker exec)"**.
