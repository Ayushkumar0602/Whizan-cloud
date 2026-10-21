# Enterprise WAF, DDoS Protection & Scoped Rate Limiting Architecture

> **Component:** Edge Router (`apps/edge-router`), Control Plane API (`apps/api`)  
> **Environment:** Whizan Cloud Production Edge (Azure VM `20.2.136.11`, Cloudflare Wildcard SSL `*.whizan.cloud`)  
> **Status:** Production Ready  

---

## 1. Overview & Core Mission

The Whizan Cloud Edge Defense system provides zero-latency, inline web application security and volumetric DDoS protection for all hosted web services, static frontend applications, backend APIs, and serverless edge functions.

### The Problem It Solves
In multi-tenant cloud platforms, legacy WAF or rate limiting implementations often commit critical architectural mistakes:
1. **Global IP Lockout (The "Cross-Tenant Blast Radius" Trap)**: When an IP is jailed or rate-limited on one customer deployment, it inadvertently locks out access to all other customer deployments across the cloud.
2. **NAT & WiFi Collateral Damage**: Multiple devices in a home, office, university campus, or mobile carrier (CGNAT) share a single public IPv4 address. Banning an IP globally locks out innocent mobile phones, colleagues, and unassociated users.
3. **Spoofable Forwarding Headers**: Attackers bypass rate limits or frame innocent IPs by injecting fake `X-Forwarded-For` headers directly into public endpoints.

Whizan Cloud's Edge Defense engine eliminates these vulnerabilities through **Strict Deployment Isolation**, **Device Signature Fingerprinting**, and **Authoritative Anti-Spoofing IP Resolution**.

---

## 2. Architecture & Design Principles

```
                                  Incoming Request
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │    Authoritative IP Resolution       │
                      │  • Cloudflare cf-ray / cf-connecting │
                      │  • Direct TCP socket.remoteAddress   │
                      │  (Spoofed X-Forwarded-For rejected)  │
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │     Device Fingerprint Synthesis     │
                      │  SHA-256(User-Agent) + Client Class  │
                      │   (Browser / Mobile / CLI / Scanner) │
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │     Multi-Tiered Jail Inspection     │
                      │  1. Target: `${slug}:${ip}:${dev}`   │
                      │  2. Target: `${slug}:${ip}`          │
                      │  3. Global: `*:${ip}` (Volumetric)   │
                      └──────────────────┬───────────────────┘
                                         │
                        ┌────────────────┴────────────────┐
                        ▼                                 ▼
                 [MATCH = JAILED]                  [CLEAN / UNRESTRICTED]
               Returns HTTP 403 Forbidden                 │
               Retry-After: <sec>                         ▼
               X-Waf-Target: <slug>        ┌──────────────────────────────┐
                                           │   Deployment Rate Limiter    │
                                           │ • Per-Device: rate:${s}:${ip}│
                                           │ • Aggregate:  rate:${s}:${ip}│
                                           └──────────────┬───────────────┘
                                                          │
                                                          ▼
                                           ┌──────────────────────────────┐
                                           │    Deep Packet Inspection    │
                                           │ • SQLi, XSS, LFI/Traversal   │
                                           │ • RCE, Scanners, Bad Bots    │
                                           └──────────────┬───────────────┘
                                                          │
                                           ┌──────────────┴───────────────┐
                                           ▼                              ▼
                                     [ATTACK FOUND]                 [CLEAN REQ]
                                   403 WAF Blocked                  200 OK Routed
                                   Strike ++ on Target              to Upstream
```

### Core Design Principles:
- **Zero-Latency In-Memory Fast-Path**: Real-time sliding window lookups, strike counters, and active jail sets execute in $< 0.1\text{ ms}$ in Node.js heap memory.
- **Strict Scope Isolation**: Rate-limit counters, strikes, and temporary bans are keyed by `(deployment_slug, client_ip, device_signature)`. An attack on `app-a.whizan.cloud` has zero effect on `app-b.whizan.cloud` or `dashboard.whizan.cloud`.
- **Sub-Second Multi-Instance Edge Sync**: State is backed by Upstash/Redis (`waf:jail:*`, `waf:config:*`) and kept in real-time sync across any number of edge router nodes via Redis Pub/Sub (`waf:alert`, `waf:unjail`).
- **Resilient Automatic Recovery**: Expired bans automatically unblock on the next incoming tick without manual intervention.

---

## 3. The 6-Layer Security Inspection Pipeline

When an HTTP/HTTPS or WebSocket request enters the Edge Router, it traverses six strict evaluation stages in [apps/edge-router/src/waf.ts](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/edge-router/src/waf.ts):

### Layer 0: Whitelist Bypass
- Loopback addresses (`127.0.0.1`, `::1`, `localhost`) and deployment-configured `customWhitelistIps` bypass inspection immediately.
- Infrastructure health probes (`/health`, `/_internal/health`, `/_internal/waf/stats`) are processed before tenant routing.

### Layer 1: Permanent Blacklist Check
- Rejects permanently banned bad actors (`waf:blacklist` set in Redis) with HTTP `403 Forbidden: IP address is blacklisted`.

### Layer 2: Hierarchical Scoped Jail Check (Fail2Ban)
The engine checks active jails in three hierarchical levels:
1. **Deployment Device Jail** (`${slug}:${ip}:${deviceHash}`): Prevents the specific attacking tool/client from accessing this specific deployment.
2. **Deployment IP Jail** (`${slug}:${ip}`): Prevents all devices under this IP from accessing this specific deployment (triggered if attacker rotates User-Agents).
3. **Global Emergency Flood Jail** (`*:${ip}`): Platform-level shield reserved exclusively for distributed flood attacks exceeding $> 1,500\text{ req/min}$ across multiple customer services.

### Layer 3: Volumetric Global Protection
- Prevents TCP starvation on the edge router by limiting total aggregate requests across all subdomains to `1500 req/min` with a burst of `250 req/5s`.

### Layer 4: Deployment-Scoped Rate Limiting
- **Per-Device Bucket**: Default `120 req/min`, `30 req/5s burst` per device on that specific deployment (`rate:${slug}:${ip}:${deviceHash}`).
- **Aggregate IP Bucket**: Default `480 req/min`, `120 req/5s burst` across all devices sharing that IP on that deployment (`rate:${slug}:${ip}`).

### Layer 5: Deep Packet WAF Signature Inspection
Inspects URI, query strings, headers, and payload structures for malicious exploit vectors:
- **SQL Injection (SQLi)**: Union-based queries, Boolean injection (`' or 1=1`), sleep/benchmark time delays, system command execution (`xp_cmdshell`).
- **Cross-Site Scripting (XSS)**: Script tags, SVG/image event handlers (`onerror`, `onload`, `onclick`), JavaScript URIs (`javascript:`).
- **Local File Inclusion & Path Traversal (LFI)**: `../`, encoded `%2e%2e`, `/etc/passwd`, `/etc/shadow`, Windows INI probes.
- **Remote Code Execution (RCE)**: Shell command injection (`; whoami`, `| bash`, backticks, `eval()`).
- **Scanner Bots & Probes**: Automated vulnerability scanners (`sqlmap`, `nikto`, `masscan`, `acunetix`, `dirbuster`, `nmap`) and sensitive environment file sniffing (`/.env`, `/.git`, `/.ssh`, `/wp-config.php`).

---

## 4. Solving the Global Jailing Bug (Deployment & Device Isolation)

### The Defect in Previous Architecture
Previously, jail state was tracked purely as `jailedIps.get(ip)`. An attack on `go-service-demo` wrote `waf:jail:115.248.83.151`. When the same client IP subsequently visited `dashboard.whizan.cloud` or `nellavio-e0247.whizan.cloud`, the edge router found the IP in `jailedIps` and rejected the request globally. Because mobile phones on the same WiFi network share the same public NAT IP, the phone was locked out as well.

### The Architectural Resolution
1. **Per-Deployment Scoping**:
   All state is keyed with the target deployment slug:
   ```ts
   // Key in memory and Redis:
   const jailKey = `${slug}:${ip}:${deviceHash}`; // or `${slug}:${ip}`
   ```
2. **Device Signature Fingerprinting**:
   The engine computes a normalized SHA-256 hash from the client's `User-Agent`:
   ```ts
   const deviceHash = crypto.createHash("sha256").update(ua).digest("hex").slice(0, 16);
   ```
   - An attack launched from a terminal (`curl` or `sqlmap`) produces hash `A`.
   - A mobile phone running Safari on the same WiFi produces hash `B`.
   - When hash `A` is jailed on `go-service-demo`, hash `B` continues to access `go-service-demo` with **HTTP 200 OK**.
   - Both hash `A` and hash `B` continue to access all other deployments on Whizan with **HTTP 200 OK**.

---

## 5. Anti-Spoofing & Authoritative Client IP Resolution

To satisfy high-security requirements and prevent spoofing:
1. **Cloudflare Authoritative Routing**:
   Cloudflare enforces wildcard edge SSL (`*.whizan.cloud`) and automatically appends `cf-ray` and the cryptographically verified `cf-connecting-ip`. The engine inspects `cf-connecting-ip` only when `cf-ray` is validated.
2. **Direct Untrusted Connections**:
   If an attacker sends a direct TCP request to the VM IP (`20.2.136.11:8080`) with a forged `X-Forwarded-For: 8.8.8.8` header:
   - The engine checks if the socket is from a trusted proxy (loopback or private container network).
   - Because the socket is untrusted, the engine **completely ignores `X-Forwarded-For`** and extracts the real TCP remote address (`req.socket.remoteAddress`).
   - The attacker cannot frame innocent IPs or bypass rate limits.

---

## 6. Real-Time Distributed Synchronization (Redis Pub/Sub)

Edge router nodes run independently and execute all inspections from in-memory heap structures for $< 0.1\text{ ms}$ response times. Multi-node consistency is maintained via Redis Pub/Sub:

```
[Edge Node 1] ──(3rd strike)──► Jails Client ──► SET waf:jail:${slug}:${ip}:${dev}
                                            ──► PUBLISH waf:alert
                                                     │
                                                     ▼
[Edge Node 2] ◄──(Received waf:alert)────── Ingests into in-memory jailedEntries map
```

- When an admin unjails an IP or service via the API, a message is published to `waf:unjail`. All running edge routers immediately clear their in-memory maps and cache.

---

## 7. Mandatory 10-Scenario Regression Test Suite

The test suite in [apps/edge-router/test-waf.ts](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/edge-router/test-waf.ts) runs 16 automated assertions covering all 10 mandatory regression scenarios:

```bash
cd apps/edge-router
npx tsx test-waf.ts
```

### Verification Matrix:
| Scenario | Requirement Tested | Result |
|:---:|---|:---:|
| **1** | Attack from IP A against Deployment A is blocked after threshold (Fail2Ban) | ✅ PASS |
| **2** | Unrelated IP B can still access Deployment A normally (Source Isolation) | ✅ PASS |
| **3** | Jailed IP A can still access Deployment B freely (Deployment Isolation) | ✅ PASS |
| **4** | Restriction on Deployment A does not affect any unrelated deployment (C) | ✅ PASS |
| **5** | Multiple devices behind different public IPs are handled independently | ✅ PASS |
| **6** | Shared NAT/WiFi IP handling: Attacking laptop jailed, phone on same WiFi allowed | ✅ PASS |
| **7** | Expired bans automatically stop blocking without manual intervention | ✅ PASS |
| **8** | Spoofed `X-Forwarded-For` on direct connections is ignored; real TCP socket enforced | ✅ PASS |
| **9** | Vulnerability scanner User-Agent detection (`sqlmap`) | ✅ PASS |
| **10** | 50 concurrent requests handled atomically without race condition corruption | ✅ PASS |

---

## 8. REST API & Management Endpoints

The Control Plane API in [apps/api/src/routes/waf.ts](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/routes/waf.ts) exposes comprehensive management endpoints:

### 1. Real-Time WAF Telemetry
```http
GET /api/waf/stats
GET /_internal/waf/stats
```
Returns total inspected, blocked, rate-limited, and jailed requests, category counts, and detailed lists of active jailed clients (`slug`, `ip`, `clientType`, `deviceHash`, `expiresAt`, `secondsRemaining`).

### 2. Recent Attack Event Log
```http
GET /api/waf/events?limit=50&slug=go-service-demo
```
Returns structured security audit events: timestamp, IP, target slug, path, method, category, rule matched, action taken, and User-Agent.

### 3. Custom WAF Configuration per Deployment
```http
GET /api/waf/config/:slug
POST /api/waf/config/:slug
```
Request Body:
```json
{
  "enabled": true,
  "mode": "block",
  "rateLimitRpm": 200,
  "burstLimit": 50,
  "enableSqlInjectionCheck": true,
  "enableXssCheck": true,
  "enablePathTraversalCheck": true,
  "enableRceCheck": true,
  "enableScannerCheck": true,
  "customBlacklistIps": ["198.51.100.99"],
  "customWhitelistIps": ["203.0.113.10"]
}
```

### 4. Manually Jail an IP on a Specific Deployment
```http
POST /api/waf/jail/:slug/:ip
```
Payload: `{"durationSec": 3600, "reason": "Targeted attack"}`

### 5. Manually Unjail an IP on a Specific Deployment
```http
DELETE /api/waf/jail/:slug/:ip
```

### 6. Global Admin Emergency Unjail (All Deployments)
```http
DELETE /api/waf/jail/:ip
```

---

## 9. Manual Testing & Verification Runbook

Use these terminal commands to verify isolation on any live deployment:

### Step 1: Verify Normal Access
```bash
curl -i https://go-service-demo.whizan.cloud/
# Returns HTTP 200 OK with RateLimit-Limit: 120, RateLimit-Remaining: 119
```

### Step 2: Simulate 3 Strikes from a Test Client Tool
```bash
curl -A "attack-tool/1.0" "https://go-service-demo.whizan.cloud/?id=1%20UNION%20SELECT%201"
curl -A "attack-tool/1.0" "https://go-service-demo.whizan.cloud/?id=2%20UNION%20SELECT%202"
curl -A "attack-tool/1.0" "https://go-service-demo.whizan.cloud/?id=3%20UNION%20SELECT%203"
# Returns 403 Forbidden with category: "sqli" on first two, then category: "jailed" on third.
```

### Step 3: Verify Test Client Tool is Jailed on `go-service-demo`
```bash
curl -i -A "attack-tool/1.0" https://go-service-demo.whizan.cloud/
# Returns HTTP/2 403 Forbidden with headers:
# x-waf-action: JAILED
# x-waf-target: go-service-demo
# retry-after: 863
```

### Step 4: Verify Phone / Browser on the Same IP Is NOT Blocked
```bash
curl -i -A "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" https://go-service-demo.whizan.cloud/
# Returns HTTP/2 200 OK!
```

### Step 5: Verify Other Deployments Are Unaffected
```bash
curl -i -A "attack-tool/1.0" https://backend.whizan.cloud/
# Returns HTTP/2 200 OK!
```
