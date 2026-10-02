# Whizan Flow Automation Documentation Index

Welcome to the documentation suite for **Whizan Flow**, the unified automation engine, visual studio, and cloud orchestration platform for Whizan Cloud Service.

---

## 📚 Documentation Suite

### 1. [Complete Implementation & Studio Guide](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/automation/flow_studio_and_engine_implementation.md)
* **Filename:** `flow_studio_and_engine_implementation.md`
* **Audience:** Core Engineers, Fullstack Developers, DevOps Operators
* **Contents:**
  * End-to-end architecture (Canvas Studio ↔ Fastify API ↔ Supabase PostgreSQL ↔ Redis Streams ↔ Execution Engine & Build Workers).
  * Database schema & Supabase session pooler migration gotchas (`port 5432`).
  * DAG resolution engine (Kahn's in-degree topological sorting), 64KB Circular Byte Ring Buffer, and step memoization ($SHA256$).
  * Native execution handlers for all 10 actions and 3 control gates.
  * Cold-Boot Reconciler & VM reboot resilience (`XCLAIM`/`XPENDING`).
  * Visual Studio Canvas: n8n-style visible card parameters, direct Configure buttons, full inspector forms for all 18 node types.
  * Dual-Pane Split View (Canvas 55% + Code DSL 45%) and live bidirectional debounced auto-sync.
  * Multi-format DSL parser (Whizan TypeScript DSL, Raw JSON, and exported n8n workflow JSON).
  * One-click topological DAG auto-layout algorithm (`autoLayoutDAG`).
  * Fastify API endpoints and SSE log streaming with explicit CORS headers.
  * Production deployment runbook for Vercel and Azure VM.

---

### 2. [Technical Architecture & Low-Level Design (LLD)](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/automation/automation_technical.md)
* **Filename:** `automation_technical.md`
* **Audience:** Systems Architects, Engine Developers
* **Contents:**
  * Unified automation topology and system philosophy.
  * Event ingestion stream (`flow:trigger:stream`) and worker consumer groups (`flow:step:stream`).
  * Heterogeneous worker execution fleet (Docker, V8 Isolates, Private Mesh, LLMs).
  * State checkpointing, state machines, and cryptographic secret encryption (AES-256-GCM).

---

### 3. [Non-Technical Overview & Business Value](file:///Users/ayushjaiswal/Desktop/Hosting%20copy/docs/automation/automation_non_technical.md)
* **Filename:** `automation_non_technical.md`
* **Audience:** Product Managers, Engineering Leads, Stakeholders
* **Contents:**
  * What is Whizan Flow and why it unifies CI/CD pipelines with business workflows.
  * Real-world use cases (Zero-Downtime Deployments, Automated Rollbacks, AI Release Notes, Multi-Cloud Backup).
  * Comparison against traditional tools (GitHub Actions, n8n, Zapier, Temporal).
