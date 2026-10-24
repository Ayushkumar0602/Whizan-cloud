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
  | `apiUrl` | `string` | No | Optional API URL override (defaults to `https://api.whizan.cloud`). |

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
  | `url` | `string` | **Yes** | Full HTTPS URL (e.g., `https://<slug>.whizan.cloud/health`). |

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

---

## Tool 15: `whizan_exec_container_command`
Executes safe informational or diagnostic commands directly inside a running container with anti-abuse guardrails.

* **Input Parameters**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `targetType` | `string` | **Yes** | Enum: `"service"` or `"project"`. |
  | `targetId` | `string` | **Yes** | Service or Project ID or slug. |
  | `command` | `string` | **Yes** | Command to run (e.g. `ps aux`, `df -h`, `node -v`, `npx prisma status`). |

---

## Tool 16: `whizan_inspect_deployment`
Inspects real-time container status, host port mappings, restart counts, memory limits, and Edge Router mesh routing.

* **Input Parameters**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `targetType` | `string` | **Yes** | Enum: `"service"` or `"project"`. |
  | `targetId` | `string` | **Yes** | Service or Project ID or slug. |

---

## Tool 17: `whizan_get_analytics`
Retrieves bandwidth, unique visitors, and page views for projects, or real-time CPU/memory metrics snapshots for services.

* **Input Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `targetType` | `string` | **Yes** | — | Enum: `"service"` or `"project"`. |
  | `targetId` | `string` | **Yes** | — | Service or Project ID or slug. |
  | `days` | `number` | No | `30` | Historical window in days (1 to 90). |

---

## Tool 18: `whizan_get_application_logs`
Fetches live runtime standard output (`stdout`) and standard error (`stderr`) logs directly from the active or recently exited application container. Essential for diagnosing runtime crashes, database connection timeouts, and unhandled exceptions that occur after the build step completes.

* **Input Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `targetType` | `string` | **Yes** | — | Enum: `"service"` or `"project"`. |
  | `targetId` | `string` | **Yes** | — | Service or Project ID or slug. |
  | `tail` | `number` | No | `200` | Number of most recent log lines (max: 1000). |
  | `timestamps` | `boolean` | No | `false` | Whether to include ISO timestamps for each line. |

---

## Tool 19: `whizan_storage_create_api_key`
Generates a dedicated Storage API Key (`whz_stg_live_...`) with explicit scoping and permissions for applications and agents.

* **Input Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `name` | `string` | **Yes** | — | Descriptive label (e.g. `"Production App Key"`). |
  | `permission` | `string` | No | `"READ_WRITE"` | Enum: `"READ_WRITE"` or `"READ_ONLY"`. |
  | `bucketId` | `string` | No | `undefined` | Optional bucket ID to strictly scope this key to. |

* **Returns**: Key ID, live key secret (`whz_stg_live_...`), prefix, and scoping metadata.

---

## Tool 20: `whizan_storage_list_api_keys`
Lists all Storage API Keys configured for the authenticated user, displaying key ID, name, keyPrefix, permission, and bucket scope.

* **Input Schema**: `{}` (No parameters)

---

## Tool 21: `whizan_storage_list_buckets`
Lists all Cloudflare R2 object storage buckets owned by the authenticated user.

* **Input Schema**: `{}` (No parameters)

---

## Tool 22: `whizan_storage_create_bucket`
Creates a new Cloudflare R2 object storage bucket.

* **Input Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `name` | `string` | **Yes** | — | Bucket name (3-63 characters, lowercase alphanumeric and hyphens). |
  | `description` | `string` | No | — | Optional description of bucket contents. |
  | `isPublic` | `boolean` | No | `false` | Set `true` for public CDN assets, `false` for private authenticated data. |

---

## Tool 23: `whizan_storage_delete_bucket`
Deletes a storage bucket.

* **Input Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `bucket` | `string` | **Yes** | — | Bucket name or ID. |
  | `force` | `boolean` | No | `false` | Set `true` to delete all objects in the bucket before removing it. |

---

## Tool 24: `whizan_storage_list_objects`
Lists and paginates objects stored within a storage bucket.

* **Input Parameters**:
  | Parameter | Type | Required | Default | Description |
  |---|---|---|---|---|
  | `bucket` | `string` | **Yes** | — | Bucket name or ID. |
  | `prefix` | `string` | No | — | Optional path prefix to filter objects. |
  | `limit` | `number` | No | `50` | Maximum objects to return (max: 100). |

---

## Tool 25: `whizan_storage_upload_object`
Uploads a local file from the developer workspace directly to Whizan Cloud Object Storage with atomic quota reservation.

* **Input Parameters**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `bucket` | `string` | **Yes** | Target bucket name or ID. |
  | `localFilePath` | `string` | **Yes** | Local filesystem path to the file to upload. |
  | `destinationPath` | `string` | **Yes** | Destination path inside bucket (e.g. `avatars/user_1.png`). |
  | `mimeType` | `string` | No | Optional MIME content type. |

---

## Tool 26: `whizan_storage_download_object`
Downloads an object from Whizan Cloud Storage to a local filesystem destination in the workspace.

* **Input Parameters**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `bucket` | `string` | **Yes** | Source bucket name or ID. |
  | `objectPath` | `string` | **Yes** | Object path inside bucket. |
  | `localDestinationPath` | `string` | **Yes** | Local filesystem path to write the downloaded object. |

---

## Tool 27: `whizan_storage_delete_object`
Deletes an object from Cloud Storage and releases the user's quota allocation.

* **Input Parameters**:
  | Parameter | Type | Required | Description |
  |---|---|---|---|
  | `bucket` | `string` | **Yes** | Bucket name or ID. |
  | `objectPath` | `string` | **Yes** | Logical object path to delete. |

---

## Tool 28: `whizan_storage_get_usage`
Fetches storage quota allocation (committed bytes, reserved bytes, object count, and tier limits).

* **Input Schema**: `{}` (No parameters)

