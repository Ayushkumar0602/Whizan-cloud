# Backend Services Architecture Guide

This document outlines the architecture for hosting full-stack Backend Services (Node.js, Python, Go, Docker) on the platform. 

The core philosophy of this implementation is **Complete Isolation**. Backend services are structurally, procedurally, and physically separated from Frontend Hosting (Next.js/React).

## 1. Database Tier (Prisma Schema)
Backend services use dedicated models to avoid polluting the `Project` frontend model with irrelevant data.

- **`BackendService`**: Represents a backend project. Tracks `language`, `startCommand`, `internalPort`, and `isPublic`.
- **`ServiceDeployment`**: Tracks deployment attempts, build status, and the resulting mapped `containerPort`.
- **`ServiceEnvVariable`**: Secure AES-encrypted environment variables specifically for this backend.
- **`BackendLanguage` Enum**: Defines the execution environment (`NODEJS`, `PYTHON`, `GO`, `DOCKERFILE`).

## 2. API Tier (Routes)
All backend-related API calls are isolated in `apps/api/src/routes/services.ts`.

**Endpoints:**
- `POST /api/services` - Create a new backend service.
- `GET /api/services` - List all user services.
- `GET /api/services/:id` - Get service details and deployment history.
- `POST /api/services/:id/deploy` - Trigger a manual build by queuing a `service-build` job in Redis.
- `POST /api/services/:id/env` - Manage encrypted environment variables.

## 3. Execution Tier (The Build Worker)
Instead of relying on the frontend `build` queue which runs `npm run build` and uses a rigid SSR image, backend builds are handled by a dedicated `service-build` queue processor in `build-worker/src/service-worker.ts`.

**The Pipeline:**
1. Clone the GitHub repository.
2. Read the `BackendLanguage`.
3. Dynamically construct a generic execution environment (e.g., pulling `node:20` or `python:3.11`).
4. Run the user's `installCommand` (e.g., `npm install` or `pip install -r requirements.txt`).
5. Execute the user's `startCommand` (e.g., `node server.js`).

## 4. Networking Tier (Docker Private Mesh)
By default, backend services are meant to be consumed securely by the user's frontend.

- **The Global Network**: We will create a Docker network: `whizan-internal-network`.
- **Backend Boot**: When a backend service container starts, it attaches to `whizan-internal-network` and is given an alias matching its slug (e.g., `api-users`).
- **Frontend Boot**: When a Next.js SSR container starts, it *also* attaches to `whizan-internal-network`.
- **The Result**: The frontend code can securely execute `fetch("http://api-users:8000")` over the internal Docker bridge without the backend ever being exposed to the public internet. 
- *(Note: If `isPublic=true`, the `edge-router` will also register the backend in Redis and proxy public subdomains to it).*

---
**Deployment Instructions:**
If deploying this new architecture to a fresh VM, ensure the global Docker network is created prior to launching PM2:
```bash
sudo docker network create whizan-internal-network || true
```
