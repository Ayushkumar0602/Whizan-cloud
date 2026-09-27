# Real-Time Resource Metrics (CPU, RAM, Network I/O)

> **Context:** This document outlines the architecture, data pipeline, Docker telemetry calculations, and dashboard visualization for the Real-Time Resource Metrics feature in Whizan Cloud Service.

---

## 🎯 Overview & Value Proposition

Each deployed backend service container is monitored in real-time, providing developers with continuous visibility into their container's compute, memory, and networking behavior:
- **CPU Utilization (%)**: Percentage of the allocated 1.0 vCPU core currently consumed by application workloads.
- **Memory (RAM) Usage (MB / %)**: Real-time Resident Set Size (RSS) memory consumption measured against the 512MB container ceiling (with Linux page cache subtracted for accuracy).
- **Network I/O Throughput (KB/s & MB)**: Ingress (`Rx`) and Egress (`Tx`) packet throughput rate and cumulative transfer volume.
- **Process Sandbox & Stability**: Active Linux PID count (out of the 128 max `PidsLimit` ceiling), detecting process floods or fork attacks.
- **Scale-to-Zero & Auto-Sleep Detection**: Instant detection of sleeping vs active containers with cold-boot wakeup actions.

---

## 🏗️ Architecture & Data Pipeline

```
[ Docker Container Engine ]
          │
          │ (docker.stats: cpu_stats, memory_stats, networks, pids_stats)
          ▼
[ Build Worker Background Daemon ] (every 15s)
          │
          └── Writes metric points to Redis ring buffer:
              `metrics:service:${serviceId}` (LPUSH + LTRIM 0 59, 15m retention)
          
[ Fastify API Service Gateway ]
    ├── REST Endpoint: `GET /api/services/:id/metrics`
    │     ├── Verifies JWT auth & tenant ownership
    │     ├── Fetches live container snapshot + Redis historical points
    │     └── Returns `{ container, status, current, history }`
    │
    └── SSE Real-Time Stream: `GET /api/services/:id/metrics/stream`
          ├── Pushes `{ type: "init", history, current }`
          ├── Runs 1.5s delta timer on live Docker stats
          ├── Pushes `{ type: "tick", metric: { cpu, memory, network, pids } }`
          └── On disconnect: cleans up timer immediately

[ Next.js Dashboard Client ] (`ServiceMetrics` component)
    ├── Live Summary Metric Cards (CPU %, RAM MB, Net KB/s, PIDs)
    ├── Real-Time Area Chart: CPU % with gradient and grid
    ├── Real-Time Area Chart: RAM MB with 512MB limit reference line
    ├── Dual-Line Network Chart: Rx Ingress (Cyan) vs Tx Egress (Purple)
    ├── Time Range Switcher: 5m vs 15m
    └── Live Stream Controls: Pause / Resume / Refresh / Wakeup
```

---

## 🧮 Telemetry Computation Formulas

All container metrics are calculated via [`apps/api/src/lib/container-metrics.ts`](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/apps/api/src/lib/container-metrics.ts):

### 1. CPU Utilization
$$\Delta \text{CPU} = \text{total\_usage}_{t_2} - \text{total\_usage}_{t_1}$$
$$\Delta \text{System} = \text{system\_cpu}_{t_2} - \text{system\_cpu}_{t_1}$$
$$\text{CPU \%} = \left( \frac{\Delta \text{CPU}}{\Delta \text{System}} \right) \times \text{online\_cpus} \times 100$$
*Since customer containers are capped at 1.0 vCPU (`NanoCpus: 1000000000`), 100% represents full saturation of the container's allocated compute quota.*

### 2. True RAM Resident Set Size (RSS)
$$\text{usedBytes} = \text{usage} - \text{inactive\_file}$$
$$\text{memUsageMB} = \frac{\text{usedBytes}}{1024 \times 1024}$$
$$\text{memPercent} = \left( \frac{\text{usedBytes}}{\text{limitBytes}} \right) \times 100$$
*Subtracting inactive filesystem page cache ensures developers see actual process memory without deceptive cache bloat.*

### 3. Network Throughput Rate
$$\text{RxRate (KB/s)} = \frac{\text{rx\_bytes}_{t_2} - \text{rx\_bytes}_{t_1}}{\Delta t \times 1024}$$
$$\text{TxRate (KB/s)} = \frac{\text{tx\_bytes}_{t_2} - \text{tx\_bytes}_{t_1}}{\Delta t \times 1024}$$

---

## 🔒 Security & Multi-Tenancy

- **Authenticated Access:** Both REST and SSE endpoints require JWT token validation.
- **Tenant Isolation:** Container lookups strictly verify `service.userId === request.user.userId`. Users can never inspect containers belonging to other accounts.
- **Resource Protection:** SSE streams are throttled to a safe 1.5s delta polling frequency and cleanly terminate when the browser disconnects.
