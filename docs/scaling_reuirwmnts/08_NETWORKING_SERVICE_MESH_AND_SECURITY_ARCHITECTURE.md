# 08: NETWORKING, SERVICE MESH & SECURITY ARCHITECTURE SPECIFICATION

---

## 1. Executive Problem Statement & Architectural Audit

In Whizan 1.0, container networking relies on dynamic host port mapping on a single VM host (`20.2.136.11`). An internal algorithm (`findFreePort()`) scans TCP ports between `3001` and `3100` and assigns the first available port to a new Docker container.

This approach creates critical vulnerabilities and scaling blockers:
1. **Port Collisions and Race Conditions**: Under high deployment velocity, two concurrent builds can identify the same "free" port simultaneously, causing the second container to crash with `EADDRINUSE`.
2. **Direct Host Port Exposure**: Ports are bound directly to the public network interface (`0.0.0.0:3005`), allowing attackers to bypass the reverse proxy and directly access internal APIs if VM firewall rules misconfigure.
3. **Insecure Inter-Service Traffic**: Services communicating with each other traverse the public internet via public DNS (`https://api.whizan.cloud`), incurring latency, TLS renegotiation overhead, and bandwidth charges.
4. **Environment Secret Leakage**: Secrets for `PRODUCTION` and `PREVIEW` branches share the same storage scope, risking accidental production database mutations during PR previews.

Whizan 2.0 implements a **Zero-Trust Private Service Mesh** featuring **Envoy Ingress Gateways**, **Virtual Overlay CNI**, **Mutual TLS (mTLS)**, and **Environment-Scoped Secret Isolation**.

```
                           ┌───────────────────────────────┐
                           │   Cloudflare Anycast Edge     │
                           │   • DDoS Protection • WAF     │
                           └───────────────┬───────────────┘
                                           │ Public HTTPS (443)
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    Envoy Layer-7 Ingress Cluster (xDS API)                      │
│                    • Rate Limiting  • Circuit Breaking                          │
└──────────────┬───────────────────────────┬───────────────────────────────┬──────┘
               │ Private CNI Overlay       │ Private CNI Overlay           │
               ▼ (Port 8080)               ▼ (Port 8080)                   ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐ ┌─────────────────┐
│ Web Service Pod A           │ │ Web Service Pod B           │ │ Database Pod    │
│ (Isolated Network Namespace)│ │ (Isolated Network Namespace)│ │ (Port 5432)     │
└──────────────┬──────────────┘ └──────────────┬──────────────┘ └────────┬────────┘
               │                               │                         │
               └───────────────────────────────┴─────────────────────────┘
                                WireGuard / mTLS Private Mesh
                                (http://database.internal:5432)
```

---

## 2. Dynamic Envoy Layer-7 Ingress Architecture

Whizan 2.0 deploys an Envoy proxy ingress cluster configured dynamically via the **Envoy Dynamic Discovery Service (xDS API)**.

### Ingress Capabilities
1. **Dynamic Zero-Reload Route Updates**: Adding, updating, or removing customer routes occurs in real-time via gRPC (Route Discovery Service - RDS) without restarting the proxy or dropping existing TCP connections.
2. **Protocol Support**: Native termination and proxying for **HTTP/1.1**, **HTTP/2**, **HTTP/3 (QUIC)**, **WebSocket**, and **gRPC**.
3. **Circuit Breaking & Outlier Detection**: Automatically isolates unhealthy container replicas if they return 5xx errors for more than 3 consecutive requests, redirecting traffic to healthy pods within 50ms.

### Envoy Dynamic Route Discovery Configuration (`envoy-rds.yaml`)
```yaml
static_resources:
  listeners:
    - name: ingress_listener
      address:
        socket_address: { address: 0.0.0.0, port_value: 443 }
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: ingress_http
                route_config:
                  name: dynamic_whizan_routes
                  virtual_hosts:
                    - name: customer_service_host
                      domains: ["*.whizan.cloud", "*"]
                      routes:
                        - match: { prefix: "/" }
                          route:
                            cluster: dynamic_service_cluster
                            timeout: 60s
                            retry_policy:
                              retry_on: "5xx,connect-failure,reset"
                              num_retries: 3
                              backoff:
                                base_interval: 25ms
                                max_interval: 200ms
```

---

## 3. Elimination of Host Port Hunting via Virtual Overlay CNI

Whizan 2.0 completely deprecates `findFreePort()`. Containers no longer bind to host ports.

### Virtual CNI Architecture
- Every container replica runs in its own isolated Linux network namespace (`netns`).
- Every web service listens on standard **port 8080** internally.
- Replicas receive unique, non-routable private IP addresses within an internal software-defined subnet (e.g. `10.240.0.0/16`).
- Envoy routes directly to replica IP addresses (`10.240.4.18:8080`), eliminating port collisions, race conditions, and port depletion limits.

---

## 4. Private Microservice Mesh (Internal DNS)

Backend microservices frequently need to communicate with one another (e.g. `Payment-API` calling `Order-Service` and querying `Redis`).

### Private Mesh Specification
- **Internal Domain Zone**: Whizan provisions an isolated DNS zone: `*.internal`.
- **Zero Public Exposure**: Services marked as `PRIVATE` or `DATABASE` are not routable from the public internet. External requests receive an immediate `404 Not Found` or `403 Forbidden` at the edge.
- **Direct East-West Routing**:
  ```bash
  # Calling an internal authentication service from a web app
  curl -X POST http://auth-service.internal:8080/v1/tokens/verify
  
  # Connecting to an internal cache
  redis-cli -h cache.internal -p 6379
  ```
- **Encrypted Overlay**: Inter-service traffic across nodes is transparently encrypted at the kernel level using **WireGuard** or **mTLS (Mutual TLS)** with zero configuration required by the user.

---

## 5. Enterprise Secret Management & Scope Isolation

To prevent catastrophic security leaks (such as PR preview builds dropping the production database), Whizan 2.0 enforces **Strict Three-Tier Environment Secret Isolation**:

```
                                  ┌───────────────────────────────┐
                                  │   Whizan Secret Vault Engine  │
                                  │   (AES-256-GCM Key Management)│
                                  └───────────────┬───────────────┘
                                                  │
                 ┌────────────────────────────────┼────────────────────────────────┐
                 ▼                                ▼                                ▼
    ┌─────────────────────────┐      ┌─────────────────────────┐      ┌─────────────────────────┐
    │ Scope: PRODUCTION       │      │ Scope: PREVIEW          │      │ Scope: DEVELOPMENT      │
    │ Branch: main, master    │      │ Branch: feature/*, PRs  │      │ Local CLI / Whizan Dev  │
    │ DATABASE_URL=prod_db    │      │ DATABASE_URL=preview_db │      │ DATABASE_URL=local_db   │
    └─────────────────────────┘      └─────────────────────────┘      └─────────────────────────┘
```

### Security Controls
1. **At-Rest Encryption**: All environment variables and secret files are encrypted using envelope encryption with **AES-256-GCM** backed by Azure Key Vault or AWS KMS.
2. **Preview Environment Password Gates**: PR previews can be protected with an automated authentication barrier (HTTP Basic Auth or single-click Whizan Team OAuth), ensuring staging builds are invisible to search engines and unauthorized viewers.
3. **Non-Root Execution Enforcement**: Container runtime engines enforce `runAsNonRoot: true`. Containers attempting to execute as UID 0 (root) are refused execution, mitigating container breakout vulnerabilities.
