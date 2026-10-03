# Whizan CLI & MCP Coexistence and Handshake Architecture

> **Goal**: Seamless, collision-free interoperability between the terminal CLI (`@whizan/cli`) and the IDE AI agent (`@whizan/mcp-devops`), enabling automatic failure handoff, code diagnosis, patching, and redeployment.

---

## 1. Executive Summary & The Problem

When a developer runs `whizan deploy` in the terminal and a deployment fails (e.g., compile error, native dependency missing, loopback trap, database timeout), the developer often turns to their AI coding assistant (Antigravity IDE, Claude Code, Cursor, Windsurf).

Because both the **CLI** and the **MCP Server** can deploy code to Whizan Cloud:
- **Risk 1 (Collision)**: If they do not share the exact same state contract, the AI agent might think the project has never been deployed, creating duplicate services or divergent slug names.
- **Risk 2 (Context Loss)**: If the CLI does not preserve the failed `deploymentId` and error telemetry in `.whizan.json`, the AI agent has to ask the user what failed rather than autonomously inspecting the Azure build logs.
- **Risk 3 (Race Conditions)**: If both attempt redeployments simultaneously or use differing archive packaging/ignore rules, container states can drift.

This document analyzes both engines, details every collision vector, and outlines the **Unified Handshake Protocol** that transforms failures into an automated self-repair loop.

---

## 2. CLI vs. MCP Deployment Mechanism Comparison

Both tools talk to the same **Render Control Plane (`/api/*`)** and Azure VM Docker Build Worker, but they interact differently with the developer:

| Architectural Layer | `@whizan/cli` (Terminal) | `@whizan/mcp-devops` (AI Agent) |
|---|---|---|
| **Primary Actor** | Human developer in bash/zsh | AI Agent (Antigravity, Claude Code, Cursor) |
| **Workspace Analysis** | Static regex + package parsing in `analyzer.ts` | Static audit (`analyze-workspace.ts`) + Gemini LLM guardrail |
| **Authentication** | `~/.whizan/config.json` via `client.ts` | `~/.whizan/config.json` or `process.env.WHIZAN_API_KEY` |
| **State Tracking** | Local `.whizan.json` | Local `.whizan.json` + Control Plane database records |
| **Packaging Engine** | `tar -czf` with default ignores + `.whizanignore` | `tar -czf` with default ignores |
| **Upload API** | `POST /api/services/:id/deploy/upload` | `POST /api/services/:id/deploy/upload` |
| **Log Streaming** | Terminal spinners & line-by-line logs | Polling via `whizan_get_build_logs` JSON responses |
| **Code Modification** | Loopback auto-patching only | Full file read/write, dependency addition, refactoring |

---

## 3. Potential Collision Matrix & Solutions

### Collision Vector 1: Divergent Schema in `.whizan.json`
- **What happens currently**:
  - The CLI writes: `{"name": "...", "slug": "...", "type": "service", "targetId": "..."}`
  - The MCP server checks: `if (localConfig?.targetId && localConfig?.targetType)`
  - **Result**: MCP reads `localConfig.targetType`, which is `undefined` because CLI wrote `type`. MCP assumes no local link exists and falls back to server matching or creating a duplicate!
- **Solution (Canonical Schema Contract)**:
  Both CLI and MCP must write and accept **both** `type` and `targetType` as aliases.
  ```json
  {
    "$schema": "https://whizan.xyz/schema/v1/whizan.json",
    "targetId": "svc_87a12b3c",
    "targetType": "service",
    "type": "service",
    "name": "my-backend",
    "slug": "my-backend",
    "framework": "Express",
    "language": "NODEJS",
    "lastDeploymentId": "dep_98a72b",
    "lastDeploymentStatus": "FAILED",
    "lastDeploymentError": "Cannot find module 'cors'",
    "updatedAt": "2026-10-03T14:30:00Z"
  }
  ```

---

### Collision Vector 2: Duplicate Resource Creation on Cloud
- **What happens**:
  - User runs `whizan deploy`. The CLI registers service `my-api` with ID `svc_123`.
  - Build fails in Phase 5 on Azure VM.
  - User asks Claude Code: *"My deployment failed, deploy it for me."*
  - If MCP does not verify the local `targetId`, it might call `whizan_create_service` with slug `my-api`, causing an HTTP 409 Conflict or creating `my-api-2`.
- **Solution (Strict Target Lock)**:
  - When `.whizan.json` exists with `targetId`, MCP's `whizan_analyze_workspace` and `whizan_create_service` strictly prohibit creating a new service.
  - MCP must mandate calling `whizan_deploy_direct` targeting `svc_123` so the Azure VM build worker replaces the failed container with zero redundancy.

---

### Collision Vector 3: AI Agent Blind to Terminal Build Errors
- **What happens**:
  - When CLI fails, the developer opens Claude Code and says: *"Fix the deployment."*
  - The AI has to ask: *"What was the error message in your terminal?"*
  - The user has to copy-paste terminal logs.
- **Solution (Failure State Telemetry)**:
  - If `whizan deploy` fails on Phase 5 or Phase 6, the CLI immediately saves the failure telemetry into `.whizan.json`:
    ```json
    "lastDeploymentId": "dep_x912b",
    "lastDeploymentStatus": "FAILED",
    "lastFailureReason": "Step 3/5 RUN npm ci failed: Cannot find module 'bcrypt'"
    ```
  - When the AI agent runs `whizan_analyze_workspace`, it automatically reads `lastDeploymentId` and calls `whizan_get_build_logs(lastDeploymentId)`.
  - The AI agent immediately knows the exact line of code that failed with zero copy-pasting from the user!

---

### Collision Vector 4: Differing Ignore Rules During Archive Packaging
- **What happens**:
  - CLI packs with `.whizanignore` + `.gitignore`.
  - MCP packs with `.gitignore` only.
  - An excluded folder in CLI might be packaged by MCP, exceeding the 50MB ceiling.
- **Solution (Synchronized Archive Logic)**:
  - Ensure `packages/mcp-devops/src/utils/archive.ts` and `packages/cli/src/core/archive.ts` share the exact same `DEFAULT_IGNORES` array and `.whizanignore` parser.

---

## 4. The Seamless Failure-to-AI Handshake Protocol

Here is the exact lifecycle when a deployment fails:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Developer runs in Terminal:                              │
│    $ whizan deploy                                          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Azure VM Build Fails (e.g. Missing dependency or syntax) │
│    - CLI detects status: FAILED                             │
│    - CLI writes failure telemetry into .whizan.json         │
│    - CLI displays AI Handoff Prompt:                        │
│      "💡 Hand off to your AI (Antigravity / Claude / Cursor) │
│       Ask: 'Fix Whizan build and redeploy'"                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Developer switches to AI IDE (Antigravity/Claude Code)   │
│    User Prompt: "Fix Whizan build and redeploy"             │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. AI Agent calls MCP `whizan_analyze_workspace`            │
│    - Reads .whizan.json with lastDeploymentId               │
│    - Calls `whizan_get_build_logs(lastDeploymentId)`        │
│    - Pinpoints: "Error: cannot find module 'express-rate'"  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. AI Agent Self-Heals Codebase                             │
│    - Edits package.json to add express-rate-limit           │
│    - Runs test build locally                                │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. AI Agent Redeploys via MCP `whizan_deploy_direct`        │
│    - Reuses targetId from .whizan.json (NO duplicate)       │
│    - Uploads fixed code to Azure VM                         │
│    - Updates .whizan.json to status: READY                  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Developer returns to Terminal                            │
│    $ whizan top  or  $ whizan logs                          │
│    Both CLI and MCP remain in 100% synchronized state!      │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. New CLI Command: `whizan mcp setup`

To make this handshake effortless for any user without manual JSON editing, we will add a 1-click command to the CLI:

```bash
whizan mcp setup
```

**What it does automatically**:
1. Scans the developer's system for installed AI coding tools:
   - **Antigravity IDE** (`~/.gemini/config/mcp_config.json` & `~/.gemini/antigravity-ide/mcp_config.json`)
   - **Claude Code** (`~/.claude.json` / `claude mcp add`)
   - **Cursor** (`~/.cursor/mcp.json` or project `.cursor/mcp.json`)
   - **Windsurf** (`~/.codeium/windsurf/mcp_config.json`)
2. Injects the `@whizan/mcp-devops` configuration with the active auth token from `~/.whizan/config.json`.
3. Confirms:
   ```text
   ✔ Whizan MCP registered in Antigravity IDE
   ✔ Whizan MCP registered in Claude Code
   🚀 You can now ask your AI agent to manage, diagnose, and redeploy Whizan services!
   ```

---

## 6. Implementation Action Plan

### Step 1: Update `.whizan.json` Canonical Contract (Both CLI & MCP) — [COMPLETED]
- Both CLI and MCP now read and write `targetType` AND `type`.
- Saves `lastDeploymentId`, `lastDeploymentStatus`, `lastFailureReason`, and `failedAt` on build completion or failure.

### Step 2: Implement Failure Telemetry in `packages/cli/src/commands/deploy.ts` — [COMPLETED]
- Phase 5 build failure and Phase 6 health probe failure persist error message and deployment ID to `.whizan.json`.
- Displays the dedicated AI Agent Self-Healing Handoff Banner with ready-to-paste prompt.

### Step 3: Implement `whizan mcp setup` in CLI — [COMPLETED]
- Added `packages/cli/src/commands/mcp.ts` with auto-configuration for Antigravity, Claude Code, Cursor, Windsurf, and VS Code.
- Added `whizan mcp info` diagnostic command.
- Wired into `packages/cli/src/index.ts`.

### Step 4: Add Anti-Duplicate Guardrails in MCP Server — [COMPLETED]
- Added `DUPLICATE_PREVENTION` check in `whizan_create_service` and `whizan_create_project`.
- Updated `whizan_analyze_workspace` with failure diagnostic handshake (auto-attaches `lastBuildFailure` logs and redeployment guidance).

### Step 5: Verify Zero-Collision Redeploy End-to-End — [COMPLETED]
- Ran full test suite in `packages/cli/tests/handshake.test.ts` covering initial deploy, build failure, AI analysis, duplicate prevention, self-healing redeploy, and terminal return. 100% passed.

---

## 7. Edge Cases Addressed & Mitigations

| Edge Case | Failure Mode | Mitigation Implemented |
| :--- | :--- | :--- |
| **1. Schema Mismatch** | MCP ignores `type` from CLI and creates duplicate service | Both CLI and MCP write and read both `type` and `targetType` |
| **2. Context Amnesia** | AI Agent has no idea why CLI build failed | CLI writes `lastDeploymentId`, `lastDeploymentStatus: "FAILED"`, and error to `.whizan.json` |
| **3. Duplicate Cloud Service Trap** | Agent calls `whizan_create_service` on failed project | MCP blocks duplicate creation with `DUPLICATE_PREVENTION` guardrail and locks `targetId` |
| **4. Unhealthy Runtime (Phase 6)** | App builds but crashes on start or fails to bind 0.0.0.0 | Phase 6 marks status `UNHEALTHY`, captures error, and triggers AI Self-Healing banner |
| **5. Orphaned Target ID** | Build fails before `.whizan.json` is updated | Phase 4 saves `targetId` immediately upon creation before upload begins |
| **6. Cleanup on Recovery** | Old failure logs linger after successful fix | Successful redeploy via MCP or CLI clears `lastFailureReason` and sets status `ACTIVE` |
| **7. Multi-IDE Compatibility** | User uses Cursor, Claude, Antigravity, or custom IDE | `whizan mcp setup` auto-configures 5 editors and prints manual JSON snippet + `claude mcp add` |
| **8. Port & Loopback Traps** | Server binds to `127.0.0.1` instead of `0.0.0.0` | Handshake prompt instructs AI agent to bind `0.0.0.0` and use `process.env.PORT` |

