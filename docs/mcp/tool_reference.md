# Whizan DevOps MCP Server — Exhaustive Tool Reference

This document provides a complete parameter reference, schema definition, and execution guide for all **14 MCP tools** exposed by `@whizan/mcp-devops`.

---

## Tool 1: `whizan_auth_status`
Checks authentication status with Whizan Cloud and returns the active developer profile.

* **Input Schema**: `{}` (No parameters)
* **Returns**: Account email, API key prefix, user ID, and cloud tier.

```json
{
  "authenticated": true,
  "user": {
    "id": "usr_99812",
    "email": "developer@company.com",
    "tier": "pro"
  }
}
```

---

## Tool 2: `whizan_login`
Saves or updates the Whizan API key credentials in local configuration (`~/.whizan/config.json`).

* **Input Parameters**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `apiKey` | `string` | **Yes** | Whizan API Key starting with `whz_live_...`. |
  | `apiUrl` | `string` | No | Optional API URL override (defaults to `https://whizan-cloud-service.onrender.com`). |

---

## Tool 3: `whizan_analyze_workspace`
**Phase 1 (Mandatory)**: Performs deep AST and filesystem analysis of the target workspace.

* **Input Parameters**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `workspaceDir` | `string` | **Yes** | Absolute or relative path to project root. |

* **Returns**: Workspace type (`backend`, `frontend`, `monorepo`), framework (`express`, `fastapi`, `vite`, `nextjs`), listening ports (`internalPort`), host bindings (`0.0.0.0` vs `127.0.0.1`), CORS status, and detected `.env` keys.

---

## Tool 4: `whizan_generate_patch`
Generates drop-in code snippets to resolve hosting issues detected during Phase 1.

* **Input Parameters**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `issue` | `string` | **Yes** | Enum: `"port_binding"`, `"cors_setup"`, `"health_check"`, `"package_scripts"`, `"frontend_api_url"`. |
  | `framework` | `string` | No | Framework name (e.g. Express, FastAPI, Vite). |
  | `backendUrl` | `string` | No | Live Whizan backend URL (for rewiring frontend client). |
  | `frontendOrigin` | `string` | No | Frontend origin domain to whitelist in CORS. |

---

## Tool 5: `whizan_create_service`
**Phase 3 (Backend)**: Registers a backend microservice on Whizan Cloud.

* **Input Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `name` | `string` | **Yes** | — | Display name of the backend service. |
  | `slug` | `string` | **Yes** | — | Unique subdomain slug (e.g. `api-server`). |
  | `language` | `string` | No | `"NODEJS"` | Enum: `"NODEJS"`, `"PYTHON"`, `"GO"`, `"DOCKERFILE"`. |
  | `rootDir` | `string` | No | `"."` | Root directory inside workspace. |
  | `installCommand` | `string` | No | `"npm install"` | Command to install dependencies. |
  | `startCommand` | `string` | No | `"npm start"` | Command to start the service container. |
  | `internalPort` | `number` | No | `8000` | Port container listens on inside Docker. |
  | `autoSleep` | `boolean` | No | `false` | Enable scale-to-zero inactivity sleep. |
  | `instanceType` | `string` | No | `"starter"` | Enum: `"free"`, `"starter"`, `"standard"`, `"pro"`. |
  | `envVars` | `object` | No | `{}` | Key-value dictionary of environment variables. |

---

## Tool 6: `whizan_create_project`
**Phase 3 (Frontend)**: Registers a frontend or fullstack web application.

* **Input Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `name` | `string` | **Yes** | — | Display name of the web project. |
  | `slug` | `string` | **Yes** | — | Unique subdomain slug (e.g. `my-app`). |
  | `framework` | `string` | No | `"NEXTJS"` | Enum: `"NEXTJS"`, `"REACT"`, `"VITE"`, `"ASTRO"`, `"CUSTOM"`. |
  | `rootDir` | `string` | No | `"."` | Root directory inside workspace. |
  | `buildCommand` | `string` | No | `"npm run build"` | Command to compile static/SSR assets. |
  | `installCommand` | `string` | No | `"npm install"` | Dependency installation command. |
  | `outputDir` | `string` | No | `"dist"` | Output directory (`"dist"` for Vite/React, `".next"` for Next.js). |
  | `envVars` | `object` | No | `{}` | Key-value dictionary of environment variables. |

---

## Tool 7: `whizan_deploy_direct`
**Phase 4**: Archives workspace files (excluding `node_modules` and `._*`) and uploads via the 2MB Redis chunking engine.

* **Input Parameters**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `targetType` | `string` | **Yes** | Enum: `"service"` or `"project"`. |
  | `targetId` | `string` | **Yes** | The service ID or project ID returned from Phase 3. |
  | `workspaceDir` | `string` | **Yes** | Path to directory to pack and upload. |

* **Returns**: `{ "deploymentId": "dep_abc123", "status": "QUEUED" }`.

---

## Tool 8: `whizan_provision_database`
Provisions a dedicated managed database container with automatic persistent volumes and connection pooling.

* **Input Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `name` | `string` | **Yes** | — | Name of the database. |
  | `type` | `string` | No | `"POSTGRESQL"` | Enum: `"POSTGRESQL"`, `"REDIS"`, `"MYSQL"`. |
  | `instanceType` | `string` | No | `"starter"` | Enum: `"starter"`, `"standard"`, `"pro"`. |
  | `enablePooler` | `boolean` | No | `true` | Enable PgBouncer connection pooling. |

---

## Tool 9: `whizan_get_build_logs`
**Phase 5 (Mandatory)**: Retrieves execution logs and deployment status from the Azure VM worker.

* **Input Parameters**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `deploymentId` | `string` | **Yes** | Deployment ID returned from `whizan_deploy_direct` or `whizan_redeploy`. |

* **Returns**:
  ```json
  {
    "status": "READY",
    "logs": [
      "Container image: node:20-slim",
      "--- Installing dependencies ---",
      "npm install --no-fund --no-audit completed",
      "--- Building ---",
      "Build completed successfully",
      "Container started on port 8000"
    ]
  }
  ```

---

## Tool 10: `whizan_set_env_vars`
**Phase 2**: Encrypts and updates environment variables for a service or project.

* **Input Parameters**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `targetType` | `string` | **Yes** | Enum: `"service"` or `"project"`. |
  | `targetId` | `string` | **Yes** | Service ID or Project ID. |
  | `envVars` | `object` | **Yes** | Key-value dictionary of environment variables. |

---

## Tool 11: `whizan_check_health`
**Phase 6**: Pings the deployed live URL to verify HTTP readiness (HTTP 200).

* **Input Parameters**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `url` | `string` | **Yes** | Full HTTP URL (e.g., `http://<slug>.20.2.136.11.nip.io/health`). |

* **Returns**: `{ "ok": true, "statusCode": 200, "responseTimeMs": 42 }`.

---

## Tool 12: `whizan_redeploy`
Triggers a fresh deployment using cached source archives or a newly specified Git repository.

* **Input Parameters**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `targetType` | `string` | **Yes** | Enum: `"service"` or `"project"`. |
  | `targetId` | `string` | **Yes** | Service ID or Project ID. |
  | `githubRepoUrl` | `string` | No | Optional GitHub URL update. |
  | `branch` | `string` | No | Branch to build (default: `"main"`). |

---

## Tool 13: `whizan_link_git_repo`
Connects a public or private GitHub repository and triggers a deployment pipeline.

* **Input Parameters**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `targetType` | `string` | **Yes** | Enum: `"service"` or `"project"`. |
  | `targetId` | `string` | **Yes** | Service ID or Project ID. |
  | `githubRepoUrl` | `string` | **Yes** | Public/private GitHub repository URL. |
  | `branch` | `string` | No | Branch to track (default: `"main"`). |
  | `deployNow` | `boolean` | No | Immediately enqueue build (default: `true`). |

---

## Tool 14: `whizan_delete_resource`
Completely deletes a service or project entity, gracefully stopping Docker containers and purging disk volumes from the VM.

* **Input Parameters**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `targetType` | `string` | **Yes** | Enum: `"service"` or `"project"`. |
  | `targetId` | `string` | **Yes** | Service ID or Project ID to delete. |
