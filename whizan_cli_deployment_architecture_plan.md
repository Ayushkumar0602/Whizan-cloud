# Whizan CLI (`@whizan/cli`) — Complete Specification

> **Phase**: CLI Deployment Engine  
> **Goal**: Firebase/Vercel-style terminal deployments for every service type on Whizan Cloud

---

## 1. Complete Command Map

| Command | Purpose | Aliases |
|---|---|---|
| `whizan login` | Browser OAuth or token-based authentication | `whizan auth` |
| `whizan logout` | Remove saved credentials | — |
| `whizan whoami` | Show auth status, plan tier, email | `whizan status` |
| `whizan init` | Generate `.whizan.json` in current directory (interactive) | `whizan setup` |
| `whizan deploy` | Full deploy pipeline (audit → pack → upload → logs → health) | `whizan up` |
| `whizan redeploy` | Re-deploy existing linked project without re-creating | — |
| `whizan logs` | Stream build or container logs | `whizan logs --tail` |
| `whizan env set KEY=VAL` | Set environment variables | `whizan env add` |
| `whizan env ls` | List environment variables | `whizan env list` |
| `whizan env rm KEY` | Delete environment variable | — |
| `whizan db create NAME` | Provision managed database | — |
| `whizan db ls` | List databases | — |
| `whizan fn deploy` | Deploy edge function | — |
| `whizan fn invoke PATH` | Invoke edge function | — |
| `whizan fn ls` | List functions | — |
| `whizan cron create` | Create scheduled cron job | — |
| `whizan cron ls` | List cron jobs | — |
| `whizan cron trigger ID` | Manually trigger cron job | — |
| `whizan exec -- CMD` | Run command inside live container | — |
| `whizan ps` | List all services, projects, functions for current user | — |
| `whizan link` | Link current directory to existing Whizan deployment | — |
| `whizan unlink` | Remove `.whizan.json` linkage | — |
| `whizan delete` | Delete a service or project | `whizan rm` |
| `whizan open` | Open live URL in browser | — |
| `whizan --help` | Show help | `whizan -h` |

---

## 2. Authentication Edge Cases

### Flow 1: Browser-Based OAuth (Default)
```
User runs: whizan login
  → CLI spins up ephemeral HTTP server on localhost random port
  → Opens browser to https://dashboard.whizan.cloud/mcp/connect?port=PORT
  → User clicks "Authorize" on dashboard
  → Dashboard POSTs token back to localhost:PORT/callback?token=xxx&email=xxx
  → CLI saves to ~/.whizan/config.json
  → CLI verifies token with GET /api/auth/me
```

| Edge Case | What Happens | CLI Behavior |
|---|---|---|
| **EC-AUTH-1**: User has no browser (headless server, SSH session, Docker) | `xdg-open` / `open` command fails silently | Print the URL and say "Visit this URL manually". Also suggest `whizan login -t YOUR_TOKEN` as fallback. |
| **EC-AUTH-2**: Browser opens but user never clicks "Authorize" | 3-minute timeout fires | Print timeout message with token fallback instructions. Exit code 1. |
| **EC-AUTH-3**: Firewall blocks localhost loopback (corporate network) | Local HTTP server can't receive callback | Print URL. Suggest `whizan login -t TOKEN` manual flow. |
| **EC-AUTH-4**: Port collision (another process on the random port) | `listen(0)` picks a random free port, collision virtually impossible | If `EADDRINUSE`, retry with a new random port up to 3 times. |
| **EC-AUTH-5**: `~/.whizan/` directory doesn't exist | First-time user | `fs.mkdir(recursive: true)` before writing `config.json`. |
| **EC-AUTH-6**: `config.json` exists with stale/expired token | Token returns 401 from `/api/auth/me` | Print "Session expired. Re-authenticating..." and restart login flow. |
| **EC-AUTH-7**: User runs `whizan login -t BAD_TOKEN` | Invalid API key | Verify with `/api/auth/me`, get 401. Print clear error: "Invalid API key. Generate one at dashboard URL." Exit 1. |
| **EC-AUTH-8**: Multiple user accounts | User logged in as account A, wants to deploy for account B | `whizan login` always overwrites `~/.whizan/config.json`. User can re-run login. `whizan whoami` shows current identity. |
| **EC-AUTH-9**: Windows path separators | `~/.whizan/config.json` uses backslashes on Windows | Use `path.join(os.homedir(), '.whizan', 'config.json')` everywhere. Never hardcode `/`. |
| **EC-AUTH-10**: Permission denied writing to home directory | Rare on personal machines, possible on shared servers | Catch `EACCES`, print "Cannot write to ~/.whizan/. Check file permissions." |

### Flow 2: Token-Based Login
```
whizan login -t whz_live_abc123
  → Save directly to ~/.whizan/config.json
  → Verify with GET /api/auth/me
  → Print success or failure
```

---

## 3. Stack Detection Rules (Comprehensive)

The CLI must detect the project type with **zero user input** in most cases. Detection is performed by scanning the filesystem root and reading key manifest files.

### Detection Decision Tree
```
START → Scan files in project root
  │
  ├─ Has `Dockerfile`?
  │    └─ YES → Check if also has frontend indicators (package.json with react/next/vite)
  │         ├─ YES → Containerized Web App (whizan_create_project, framework: CUSTOM)
  │         └─ NO  → Containerized Backend (whizan_create_service, language: DOCKERFILE)
  │
  ├─ Has `package.json`?
  │    └─ Parse dependencies:
  │         ├─ Has `next` dep?
  │         │    └─ Next.js SSR Project (whizan_create_project, framework: NEXTJS)
  │         ├─ Has `vite` or `@vitejs/*` dep?
  │         │    └─ Static Web App (whizan_create_project, framework: VITE, outputDir: dist)
  │         ├─ Has `react-scripts` dep?
  │         │    └─ CRA React App (whizan_create_project, framework: REACT, outputDir: build)
  │         ├─ Has `astro` dep?
  │         │    └─ Astro App (whizan_create_project, framework: ASTRO, outputDir: dist)
  │         ├─ Has `svelte` or `@sveltejs/kit` dep?
  │         │    └─ SvelteKit App (whizan_create_project, framework: CUSTOM)
  │         ├─ Has `nuxt` dep?
  │         │    └─ Nuxt.js App (whizan_create_project, framework: CUSTOM)
  │         ├─ Has `express` / `fastify` / `@nestjs/core` / `koa` / `hono` dep?
  │         │    └─ Node.js Backend (whizan_create_service, language: NODEJS)
  │         ├─ Has ONLY devDependencies (no express/next/vite)?
  │         │    └─ Possibly a library → Show warning, ask user for target type
  │         └─ Has `start` script?
  │              └─ Generic Node.js Service (whizan_create_service, language: NODEJS)
  │
  ├─ Has `requirements.txt` / `pyproject.toml` / `Pipfile`?
  │    └─ Parse for framework:
  │         ├─ Contains `fastapi` → FastAPI Backend (language: PYTHON, startCmd: uvicorn)
  │         ├─ Contains `django` → Django Backend (language: PYTHON, startCmd: gunicorn)
  │         ├─ Contains `flask` → Flask Backend (language: PYTHON, startCmd: gunicorn)
  │         ├─ Contains `celery` → Background Worker (language: PYTHON, isWorker: true, port: 0)
  │         └─ Has `main.py` → Generic Python (language: PYTHON)
  │
  ├─ Has `go.mod`?
  │    └─ Go Backend (language: GO, scan for port in main.go)
  │
  ├─ Has `Cargo.toml`?
  │    └─ Rust Backend (language: DOCKERFILE, auto-generate multi-stage Dockerfile)
  │
  ├─ Has `pom.xml` / `build.gradle` / `build.gradle.kts`?
  │    └─ Java/Kotlin Backend (language: DOCKERFILE, Spring Boot detection)
  │
  ├─ Has `composer.json`?
  │    └─ PHP/Laravel Backend (language: DOCKERFILE)
  │
  ├─ Has `Gemfile`?
  │    └─ Ruby/Rails Backend (language: DOCKERFILE)
  │
  ├─ Has `index.html` only (no package.json)?
  │    └─ Static HTML Site (whizan_create_project, framework: CUSTOM, outputDir: .)
  │
  ├─ Has `function.json` / `.whizan.json` with type=function?
  │    └─ Edge Function (whizan_create_function_service)
  │
  └─ NONE of the above
       └─ Unknown project → CLI asks user: "What type of project is this?"
```

### Detection Edge Cases

| Edge Case | Scenario | CLI Behavior |
|---|---|---|
| **EC-DETECT-1**: Empty directory | User runs `whizan deploy` in empty folder | "No project files found. Run `whizan init` first or navigate to your project." Exit 1. |
| **EC-DETECT-2**: Monorepo (`apps/` + `packages/`) | Turborepo, Nx, Lerna workspace | Detect monorepo. Ask: "This looks like a monorepo. Which app do you want to deploy?" List subdirectories under `apps/` for selection. Use `--dir apps/api` flag to specify. |
| **EC-DETECT-3**: Both `client/` and `server/` directories | Fullstack repo with separate frontend and backend | Ask: "Deploy frontend (`client/`), backend (`server/`), or both?" If `--dir server` flag provided, skip prompt. |
| **EC-DETECT-4**: `package.json` has BOTH `next` and `express` | Fullstack Next.js with custom Express server | Detect as Next.js project (framework: NEXTJS). Next.js custom server patterns are handled natively by Whizan's `next start`. |
| **EC-DETECT-5**: Project has `vite.config.ts` but no `vite` dependency | Possible stale config or different bundler | Rely on `package.json` dependencies, not config file existence. Warn: "Found `vite.config.ts` but `vite` is not in dependencies." |
| **EC-DETECT-6**: TypeScript project without `build` script | `ts` files but no compilation step defined | Warn: "No build script found. Whizan will attempt `npx tsc` for compilation." |
| **EC-DETECT-7**: `Dockerfile` AND `docker-compose.yml` | Multi-container setup | Only use `Dockerfile` for single-service deployment. Ignore `docker-compose.yml`. Warn: "Whizan deploys single containers. `docker-compose.yml` will be ignored." |
| **EC-DETECT-8**: `.whizan.json` exists with stale `targetId` | Previous deployment was deleted from dashboard | CLI calls `GET /api/services/{id}` or `GET /api/projects/{id}`. If 404, warn: "Previous deployment not found on server. Creating fresh deployment." Remove stale `.whizan.json` values. |
| **EC-DETECT-9**: `Procfile` present (Heroku-style) | User migrating from Heroku | Parse `Procfile` for `web:` line to extract start command. Use it as `startCommand`. |
| **EC-DETECT-10**: Bun / Deno project (`bunfig.toml`, `deno.json`) | Non-Node.js JavaScript runtime | Detect and use `DOCKERFILE` language with runtime-specific Dockerfile generation. Warn: "Bun/Deno detected. Whizan will build via Dockerfile." |
| **EC-DETECT-11**: `package.json` has no `name` field | Missing or malformed package.json | Generate slug from directory name: `path.basename(cwd)`. Slugify: lowercase, replace spaces with hyphens, strip special chars. |
| **EC-DETECT-12**: Multiple `package.json` in nested dirs | Scanned a wrong package.json | Only read `package.json` in the root of the target directory. Never traverse upward. |
| **EC-DETECT-13**: `.gitignore` is missing | No exclusion rules for tarball packing | Use built-in DEFAULT_IGNORES list (node_modules, .git, .env, dist, .next, __pycache__, venv, etc.). |

---

## 4. `whizan deploy` Complete User Flow

### Happy Path
```
$ cd my-express-api
$ whizan deploy

  Whizan Cloud CLI v1.0.0

  [1/6] 🔐 Checking authentication...
  ✔ Logged in as dev@example.com (Hobby plan)

  [2/6] 🔍 Analyzing workspace...
  ✔ Stack: Node.js (Express) on port 3000
  ✔ Loopback binding: 0.0.0.0 (Clean)
  ✔ Health endpoint: GET /health found
  ✔ Environment: 2 variables referenced (DATABASE_URL, JWT_SECRET)
  
  ⚠ 2 required environment variables detected:
    DATABASE_URL — PostgreSQL connection string
    JWT_SECRET — JSON Web Token signing key

  ? Enter DATABASE_URL: postgresql://user:pass@host/db
  ? Enter JWT_SECRET: my-super-secret-key

  [3/6] 📦 Packing workspace...
  ✔ Archive created (1.4 MB, 847 files, skipped node_modules/.git/.env)

  [4/6] 🚀 Deploying to Whizan Cloud...
  ✔ Service "my-express-api" created (ID: svc_abc123)
  ✔ Source uploaded. Build enqueued (Deployment: dep_xyz789)

  [5/6] 🛠️ Building...
  ├─ Installing dependencies (npm ci)...
  ├─ Step 1/5: FROM node:20-alpine
  ├─ Step 2/5: COPY package*.json ./
  ├─ Step 3/5: RUN npm ci --only=production
  ├─ Step 4/5: COPY . .
  ├─ Step 5/5: CMD ["npm", "start"]
  ├─ Container started on host port 49221
  ✔ Build complete: ACTIVE

  [6/6] 🌐 Health check...
  ✔ HTTP 200 OK (https://my-express-api.whizan.cloud) — 142ms

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🎉 Deploy successful!
  🔗 https://my-express-api.whizan.cloud
  📋 Dashboard: https://dashboard.whizan.cloud/dashboard/services/svc_abc123
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Redeployment Flow (`.whizan.json` exists)
```
$ whizan deploy

  [1/6] 🔐 Authenticated as dev@example.com
  [2/6] 🔍 Existing deployment detected!
        Service: my-express-api (svc_abc123)
        Last deployed: 2 hours ago
  
  ? Redeploy to existing service? (Y/n) Y

  [3/6] 📦 Packing workspace... ✔ (1.4 MB)
  [4/6] 🚀 Uploading... ✔ Build enqueued (dep_new456)
  [5/6] 🛠️ Building... ✔ ACTIVE
  [6/6] 🌐 Health check... ✔ 200 OK (128ms)

  🎉 Redeployed successfully!
  🔗 https://my-express-api.whizan.cloud
```

---

## 5. Deployment Edge Cases (All Types)

### 5A. Network & Port Edge Cases

| Edge Case | Scenario | CLI Behavior |
|---|---|---|
| **EC-NET-1**: App binds to `127.0.0.1` or `localhost` | Express: `app.listen(3000, '127.0.0.1')` | CLI detects via regex scan. **Auto-patch**: Show warning and offer to generate a patch. If `--yes` flag, auto-apply. Otherwise prompt. |
| **EC-NET-2**: App uses hardcoded port (not `process.env.PORT`) | `app.listen(5000)` instead of `process.env.PORT` | Warn: "App uses hardcoded port 5000. Whizan will set PORT=5000 in container environment, but recommend using `process.env.PORT`." Set `internalPort: 5000`. |
| **EC-NET-3**: No port at all (background worker) | Celery worker, BullMQ processor, Kafka consumer | Detect from `.whizan.json` (`isWorker: true`) or AI analyzer. Set `internalPort: 0`. Health check uses process liveness instead of HTTP probe. |
| **EC-NET-4**: Multiple ports exposed | Express on 3000 AND WebSocket on 3001 | Warn: "Multiple ports detected. Whizan routes HTTP traffic to the primary port." Use first detected port. User can override with `--port 3001`. |
| **EC-NET-5**: HTTPS hardcoded in health check URL | User tries `https://slug.20.2.136.11.nip.io` | Auto-normalize `https://` to `http://` for `.nip.io` domains. Edge Router runs on port 80. |
| **EC-NET-6**: CORS not configured | Backend API without cors middleware | Warn: "No CORS middleware detected. If a frontend will call this API from a browser, add cors configuration." |

### 5B. Environment Variable Edge Cases

| Edge Case | Scenario | CLI Behavior |
|---|---|---|
| **EC-ENV-1**: `.env` file exists locally but should not be uploaded | Contains `DATABASE_URL=postgres://prod:secret@host/db` | `.env` is ALWAYS excluded from tarball (in DEFAULT_IGNORES). Values are set via `whizan_set_env_vars` API. |
| **EC-ENV-2**: Code references `DATABASE_URL` but no `.env` file exists | New clone, no local env setup | AI analyzer detects it as required. CLI prompts: "Enter DATABASE_URL:" during deploy. |
| **EC-ENV-3**: `.env.example` exists | Project provides env template | Parse `.env.example` to discover variable names and example values. Pre-populate prompts with examples. |
| **EC-ENV-4**: Env var value contains special characters (`=`, `"`, newlines) | `PRIVATE_KEY="-----BEGIN RSA KEY-----\n..."` | Stringify values properly. Use JSON body in API call. Warn if value looks like a multi-line key. |
| **EC-ENV-5**: User wants to skip env var prompts | `whizan deploy --yes` or `-y` | Skip prompts. Use values from `.env` if it exists locally (read but don't upload). If required vars are still missing, fail with clear error. |
| **EC-ENV-6**: Env vars already set on server from previous deploy | Redeployment scenario | CLI checks existing env vars via API before prompting. Only prompt for NEW or CHANGED variables. |

### 5C. Build & Upload Edge Cases

| Edge Case | Scenario | CLI Behavior |
|---|---|---|
| **EC-BUILD-1**: Archive exceeds 50 MB limit | Large datasets, model weights, or media in source | Fail with: "Source archive is 127 MB (limit: 50 MB). Add large files to `.gitignore` or `.whizanignore`." |
| **EC-BUILD-2**: No `.gitignore` file | New project without ignore rules | Use DEFAULT_IGNORES (node_modules, .git, .env, dist, __pycache__, venv, etc.). Still pack correctly. |
| **EC-BUILD-3**: `.whizanignore` file exists | User wants custom exclusion rules beyond .gitignore | Parse `.whizanignore` with same syntax as `.gitignore`. Merge with DEFAULT_IGNORES and `.gitignore`. |
| **EC-BUILD-4**: Build fails on Azure VM (npm install error, TypeScript error) | Broken dependencies, missing native modules | Log streamer shows exact error. CLI exits with code 1 and message: "Build failed. Check logs above." |
| **EC-BUILD-5**: Build succeeds but container crashes immediately | Missing start script, wrong entry point, segfault | Health check fails. CLI polls build logs → sees status FAILED or container restart loop. Print: "Container crashed after starting. Run `whizan logs` for details." |
| **EC-BUILD-6**: Network timeout during upload | Slow internet, Render API cold start (30s spin-up) | Implement retry with exponential backoff (3 attempts). Show progress: "Upload attempt 1/3..." |
| **EC-BUILD-7**: API returns 401 during upload | Token expired mid-deploy | Print: "Authentication expired. Run `whizan login` and retry." Exit 1. |
| **EC-BUILD-8**: API returns 409 (slug already taken) | Another user already has that slug | Auto-append random suffix: `my-api` → `my-api-x7k2`. Inform user of new slug. |
| **EC-BUILD-9**: `tar` command not found | Windows without Git Bash or WSL | Fallback to Node.js native `zlib` + `tar-stream` npm package for in-memory tarball creation. |
| **EC-BUILD-10**: Symlinks in project directory | `node_modules/.bin/` or custom symlinks | Use `tar -h` flag to follow symlinks. Or exclude symlinked directories if they point outside the workspace. |

### 5D. Next.js Specific Edge Cases

| Edge Case | Scenario | CLI Behavior |
|---|---|---|
| **EC-NEXT-1**: `next.config.js` has `output: 'export'` with dynamic routes | `/blog/[slug]` pages without `generateStaticParams()` | **CRITICAL**: Detect this combination. Warn: "Dynamic routes like `/blog/[slug]` cannot be statically exported. Remove `output: 'export'` from next.config. Whizan hosts Next.js SSR natively." |
| **EC-NEXT-2**: Next.js uses API routes (`/api/*`) | Server-side API endpoints | Deploy as SSR container (never static export). Set framework: NEXTJS, outputDir: .next. |
| **EC-NEXT-3**: Next.js uses Server Actions | `'use server'` directive in components | Same as EC-NEXT-2. SSR container required. |
| **EC-NEXT-4**: Next.js with `output: 'standalone'` | Optimized standalone build | Detect and use. Ideal for Whizan container deployment. |
| **EC-NEXT-5**: Next.js app with custom port | `next start -p 8080` in start script | Parse port from start script. Set `internalPort: 8080`. |

### 5E. Python Specific Edge Cases

| Edge Case | Scenario | CLI Behavior |
|---|---|---|
| **EC-PY-1**: No `requirements.txt` (uses `pyproject.toml` with Poetry) | Modern Python project | Detect `pyproject.toml`. Generate install command: `pip install poetry && poetry install`. |
| **EC-PY-2**: No `requirements.txt` (uses `Pipfile`) | Pipenv project | Detect `Pipfile`. Generate install command: `pip install pipenv && pipenv install`. |
| **EC-PY-3**: FastAPI without `uvicorn` in requirements | Missing ASGI server | Warn: "FastAPI requires uvicorn. Adding `uvicorn` to install command." |
| **EC-PY-4**: Django with `manage.py` | Django project structure | Detect Django. Start command: `gunicorn project.wsgi:application --bind 0.0.0.0:8000`. Port: 8000. |
| **EC-PY-5**: Python version mismatch | Code requires Python 3.12 but base image uses 3.11 | Check `pyproject.toml` `[tool.python]` or `.python-version` file. Use matching base Docker image. |

### 5F. Worker / Non-HTTP Service Edge Cases

| Edge Case | Scenario | CLI Behavior |
|---|---|---|
| **EC-WORKER-1**: Service has no HTTP endpoint | Celery worker, BullMQ processor | Detect from `.whizan.json` (`isWorker: true`) or AI analysis. Set `internalPort: 0`. |
| **EC-WORKER-2**: Worker needs database connection | Celery needs Redis URL | Prompt for `REDIS_URL` / `CELERY_BROKER_URL`. Offer: "Want to provision a Redis database on Whizan? (Y/n)" |
| **EC-WORKER-3**: Health check for non-HTTP service | Can't ping an HTTP endpoint | Use process liveness check via `whizan_check_health` with targetId instead of URL. Verify container is running (not restarting). |

---

## 6. Monorepo & Multi-Directory Edge Cases

| Edge Case | Scenario | CLI Behavior |
|---|---|---|
| **EC-MONO-1**: User runs `whizan deploy` at monorepo root | `apps/` and `packages/` directories detected | List subdirectories: "Which app do you want to deploy?" with selectable list. Or accept `--dir apps/api`. |
| **EC-MONO-2**: `apps/api` has its own `package.json` but depends on `packages/shared` | Workspace dependency | Pack the ENTIRE monorepo root (all `apps/` and `packages/`). Set `rootDir: apps/api` in the service config so the build worker knows the entry point. |
| **EC-MONO-3**: `client/` and `server/` at root | Not a Turborepo, just manual split | Ask which to deploy. Or `whizan deploy --dir server`. |
| **EC-MONO-4**: `.whizan.json` at monorepo root with multiple services | User deployed both `api` and `dashboard` previously | Store array in `.whizan.json`: `{ "deployments": [ { "dir": "apps/api", "targetId": "svc_x" }, { "dir": "apps/dashboard", "targetId": "prj_y" } ] }`. Auto-match by current `--dir`. |
| **EC-MONO-5**: Turborepo with shared `tsconfig` and `eslint-config` packages | Build depends on sibling packages | Tarball must include the entire workspace root. Build worker runs `npm install` at root, then builds the specific app. |

---

## 7. OS & Platform Edge Cases

| Edge Case | Platform | CLI Behavior |
|---|---|---|
| **EC-OS-1**: Windows path separators | `C:\Users\dev\project` | Use `path.join()` and `path.resolve()` everywhere. Never construct paths with string concatenation. |
| **EC-OS-2**: Windows lacks `tar` command | No native tar on older Windows | Bundle `tar-stream` npm package as fallback. Detect with `which tar` / `where tar`. |
| **EC-OS-3**: WSL (Windows Subsystem for Linux) | Linux paths inside Windows | Works natively. `os.homedir()` returns `/home/user`. `~/.whizan/config.json` works correctly. |
| **EC-OS-4**: macOS Apple Silicon (M1/M2/M3) | ARM64 architecture | No issue for CLI. Docker builds on Azure VM use x86_64. No local Docker needed. |
| **EC-OS-5**: Linux without desktop (no browser for login) | Ubuntu server via SSH | `xdg-open` fails silently. Print URL for manual copy. Suggest `whizan login -t TOKEN`. |
| **EC-OS-6**: Node.js < 20 | Older Node versions | Check `process.version` at startup. If < 20, print: "Whizan CLI requires Node.js 20 or later. Current: vXX." Exit 1. |
| **EC-OS-7**: npm / npx not in PATH | Rare but possible on custom environments | If running via `npx whizan`, npm is already available. For global install, `npm install -g @whizan/cli`. |

---

## 8. Existing Deployment & Linking Edge Cases

| Edge Case | Scenario | CLI Behavior |
|---|---|---|
| **EC-LINK-1**: `.whizan.json` exists and targetId is valid | Normal redeploy case | Skip `create_service` / `create_project`. Go directly to `deploy_direct`. |
| **EC-LINK-2**: `.whizan.json` exists but targetId was deleted on server | User deleted from dashboard | `GET /api/services/{id}` returns 404. Warn: "Previous deployment was deleted. Creating a new one." Remove stale `.whizan.json`. |
| **EC-LINK-3**: No `.whizan.json` but server has a service with matching slug | User deployed from another machine or via MCP | CLI calls `listServices()` and `listProjects()`, match by slug (derived from directory name). Ask: "Found existing deployment 'my-api' on Whizan. Link to it? (Y/n)" |
| **EC-LINK-4**: User wants to deploy same code to a DIFFERENT slug | Creating a staging vs production environment | `whizan deploy --name my-api-staging` overrides auto-detected name. Creates new service/project. |
| **EC-LINK-5**: `whizan link` to manually link | User wants to connect to existing deployment without re-deploying | `whizan link svc_abc123` → Writes `.whizan.json` with targetId, targetType, slug. Subsequent `whizan deploy` uses this. |
| **EC-LINK-6**: `.whizan.json` checked into git | Team member clones and runs deploy | Shared `.whizan.json` contains slug and targetId. If targetId belongs to a different user, API returns 403. CLI asks: "This project is linked to another account. Create your own deployment? (Y/n)" |

---

## 9. Edge Function Deployment Edge Cases

| Edge Case | Scenario | CLI Behavior |
|---|---|---|
| **EC-FN-1**: No `function.json` or `.whizan.json` with type=function | User runs `whizan fn deploy handler.js` | Create function service from file. CLI generates name from filename: `handler`. Prompt for public/private. |
| **EC-FN-2**: Function code imports npm packages | `import Stripe from 'stripe'` | Warn: "Edge functions run in isolated V8 runtime. Only standard Web APIs and built-in modules are available. External npm imports may not work." |
| **EC-FN-3**: Function exceeds memory/timeout limits | Large computation in serverless function | Default: 128MB memory, 30s timeout. CLI warns if function code looks heavy. User can adjust with `--memory 256 --timeout 60`. |
| **EC-FN-4**: Public vs private function security | Webhook (public) vs user data API (private) | CLI asks: "Should this function be publicly accessible? (Y/n)". If private, auto-generate API key via `whizan_create_function_api_key`. Print key once. |
| **EC-FN-5**: Function already deployed, user updates code | Redeployment of existing function | Detect existing function by name/slug. Call `deployFunction(id, newCode)` instead of creating new. |

---

## 10. Database Provisioning Edge Cases

| Edge Case | Scenario | CLI Behavior |
|---|---|---|
| **EC-DB-1**: User on Hobby plan requests `pro` tier | Subscription restriction | API returns 403 or error. CLI: "Pro tier databases require a Professional subscription. Current plan: Hobby. Provisioning with starter tier instead." |
| **EC-DB-2**: User provisions database, wants to auto-bind to service | `whizan db create my-pg --bind my-api` | After provisioning, CLI calls `whizan_set_env_vars` to inject `DATABASE_URL` into the specified service. |
| **EC-DB-3**: Database name collision | Name already taken | API returns 409. CLI auto-appends suffix: `my-pg` → `my-pg-a3k1`. |
| **EC-DB-4**: User wants to see connection string | After `whizan db create` | Print connection string ONCE in terminal. Warn: "Save this connection string securely. It will not be shown again." |

---

## 11. Interactive Prompt vs Non-Interactive Mode

| Flag | Behavior |
|---|---|
| `--yes` / `-y` | Skip all confirmation prompts. Use defaults and auto-detected values. |
| `--name NAME` | Override auto-detected project name / slug. |
| `--dir PATH` | Deploy a specific subdirectory (for monorepos). |
| `--port PORT` | Override detected internal port. |
| `--type service\|project` | Force deployment type instead of auto-detection. |
| `--env KEY=VAL` | Set env var inline (repeatable: `--env A=1 --env B=2`). |
| `--no-health-check` | Skip the final health check verification. |
| `--json` | Output structured JSON instead of pretty terminal UI (for CI/CD pipelines). |
| `--verbose` | Show full build logs without truncation. |

### CI/CD Pipeline Usage
```bash
# GitHub Actions / GitLab CI
npx whizan deploy --yes --json --env DATABASE_URL=$DATABASE_URL --env JWT_SECRET=$JWT_SECRET
```

---

## 12. Error Recovery & Retry Matrix

| Error Condition | Retry? | User Action |
|---|---|---|
| Network timeout on upload | Yes, 3 attempts with exponential backoff | Automatic |
| API 401 (Unauthorized) | No | `whizan login` |
| API 409 (Slug conflict) | Yes, with auto-suffix | Automatic |
| API 429 (Rate limited) | Yes, after `Retry-After` header delay | Automatic |
| API 500 (Server error) | Yes, 2 retries | If persists: "Whizan API is experiencing issues. Try again later." |
| Build FAILED status | No | Fix code, run `whizan deploy` again |
| Health check fails (non-200) | Retry 3 times with 5s delay | If persists: "Deployment is live but not responding. Run `whizan logs` to diagnose." |
| `tar` command not found | No, use JS fallback | Automatic Node.js tarball creation |
| Disk full (can't create temp archive) | No | "Insufficient disk space. Free up space and retry." |

---

## 13. Package Structure

```
packages/cli/
├── bin/
│   └── whizan.js                 # #!/usr/bin/env node entry
├── src/
│   ├── index.ts                  # Command router (maps argv to handlers)
│   ├── commands/
│   │   ├── deploy.ts             # Full 6-phase deploy pipeline
│   │   ├── init.ts               # Interactive .whizan.json generator
│   │   ├── login.ts              # Browser OAuth + token auth
│   │   ├── logout.ts             # Clear credentials
│   │   ├── whoami.ts             # Show auth status
│   │   ├── logs.ts               # Stream build/container logs
│   │   ├── env.ts                # env set/ls/rm
│   │   ├── db.ts                 # db create/ls
│   │   ├── fn.ts                 # fn deploy/invoke/ls
│   │   ├── cron.ts               # cron create/ls/trigger
│   │   ├── exec.ts               # exec -- CMD
│   │   ├── ps.ts                 # List all resources
│   │   ├── link.ts               # Link/unlink .whizan.json
│   │   ├── delete.ts             # Delete resource
│   │   └── open.ts               # Open live URL in browser
│   ├── core/
│   │   ├── analyzer.ts           # Stack detection engine
│   │   ├── archive.ts            # Tarball packer (tar + JS fallback)
│   │   ├── auth.ts               # ~/.whizan/config.json manager
│   │   ├── client.ts             # Whizan API client (reuse WhizanClient)
│   │   ├── log-streamer.ts       # SSE/polling log receiver
│   │   └── patcher.ts            # Loopback auto-patcher
│   └── utils/
│       ├── terminal-ui.ts        # Spinners, banners, progress bars, colors
│       ├── prompts.ts            # Interactive prompts (enquirer/clack)
│       └── slug.ts               # Name → slug converter
├── package.json
└── tsconfig.json
```

### `package.json` (key fields):
```json
{
  "name": "@whizan/cli",
  "version": "1.0.0",
  "bin": {
    "whizan": "dist/bin/whizan.js",
    "whz": "dist/bin/whizan.js"
  },
  "files": ["dist", "README.md"]
}
```

---

## 14. Code Reuse Strategy

The CLI will **import and reuse** existing modules from `@whizan/mcp-devops` (the MCP package) rather than duplicating code:

| Module | Source | Reuse Strategy |
|---|---|---|
| `WhizanClient` | `mcp-devops/src/whizan-client.ts` | Copy to `cli/src/core/client.ts` (same API methods, same endpoints) |
| `analyzeWorkspace()` | `mcp-devops/src/tools/analyze-workspace.ts` | Copy to `cli/src/core/analyzer.ts` |
| `packDirectory()` | `mcp-devops/src/utils/archive.ts` | Copy to `cli/src/core/archive.ts`, add JS fallback for Windows |
| `generatePatch()` | `mcp-devops/src/tools/generate-patch.ts` | Copy for loopback patching |
| Auth / Config | `mcp-devops/src/index.ts` (login handler) | Refactor into `cli/src/commands/login.ts` |
| Terminal UI | `mcp-devops/src/utils/terminal-ui.ts` | Copy and extend with progress bars and prompts |

> **Note**: We copy rather than import across packages because the CLI (`@whizan/cli`) and MCP server (`@whizan/mcp-devops`) are distributed as separate npm packages with independent dependency trees. The CLI needs a lighter dependency set (no `@modelcontextprotocol/sdk`).

---

## 15. Implementation Status

| Phase | What Was Built | Files | Status |
|---|---|---|---|
| **Phase 1** | Package scaffold, `bin/whizan.js`, command router, `login`, `logout`, `whoami`, `ps` | `index.ts`, `login.ts`, `logout.ts`, `whoami.ts`, `auth.ts`, `ps.ts` | ✅ **Completed** |
| **Phase 2** | Stack analyzer, archive packer, loopback auto-patcher, `whizan deploy` full 6-phase pipeline | `analyzer.ts`, `archive.ts`, `patcher.ts`, `deploy.ts`, `client.ts` | ✅ **Completed** |
| **Phase 3** | Log streaming (`--tail`), health check probe, env var management (`set`, `ls`, `rm`) | `logs.ts`, `env.ts`, `client.ts` | ✅ **Completed** |
| **Phase 4** | Database provisioning (`create`, `ls`, auto-bind), edge functions (`deploy`, `invoke`, `ls`), cron jobs (`create`, `ls`, `trigger`) | `db.ts`, `fn.ts`, `cron.ts` | ✅ **Completed** |
| **Phase 5** | Container exec (`exec -- CMD`), project linking (`init`, `link`, `unlink`), resource deletion (`delete`), browser launch (`open`) | `exec.ts`, `init.ts`, `link.ts`, `delete.ts`, `open.ts` | ✅ **Completed** |
| **Phase 6** | `package.json`, complete `README.md` documentation, clean TypeScript build & end-to-end verification | `package.json`, `README.md`, `dist/*` | ✅ **Completed** |

---

### Implementation & Verification Summary
- **Binary & CLI Entrypoint**: Executable at `packages/cli/dist/bin/whizan.js` (aliased to `whizan` and `whz`).
- **Compilation**: TypeScript compiled with zero errors (`tsc -p tsconfig.json`).
- **Full Parity**: Provides complete parity with the `@whizan/mcp-devops` server for terminal-first developers and CI/CD pipelines.
