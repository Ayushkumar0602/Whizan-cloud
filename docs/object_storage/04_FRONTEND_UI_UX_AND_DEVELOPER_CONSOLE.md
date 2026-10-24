# 04 — Frontend UI/UX Architecture & Developer Console

This document details the frontend implementation, component hierarchy, user experience patterns, and interactive tools built into the **Whizan Cloud Storage Console** (`/dashboard/storage`).

---

## 1. Frontend Architectural Layout

The storage console is built as a responsive single-page application (SPA) within the Next.js App Router (`apps/dashboard/app/dashboard/storage/page.tsx`), orchestrating six specialized sub-components.

```
                           /dashboard/storage (page.tsx)
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
  Top Metrics Overview          Navigation Tabs Bar         Action Controls
  • 250 MB Quota Gauge          • Explorer                   • Sync / Refresh
  • Daily Allowance             • Developer Docs             • Reconcile Quota
  • Object Inventory            • Security Policies          • Bucket Settings
  • Global Edge CDN             • Webhook Triggers           • New Bucket
                                • Trash Bin (30d)
                                • Usage & Health
                                        │
     ┌──────────────┬───────────────────┼───────────────────┬──────────────┐
     ▼              ▼                   ▼                   ▼              ▼
 Explorer       Dev Docs            Policies            Trash Bin      Usage/Health
 Component      Component           Component           Component      Component
 (Files &       (Interactive SDK    (CORS &             (Soft-Delete   (Active Limits &
  Dropzone)      & S3 Reference)     Access Rules)       Restore)       Audit Trail)
```

---

## 2. Component Hierarchy & Responsibilities

### 1. `page.tsx` (Container & State Coordinator)
- Fetches initial storage state: `storageApi.getBuckets()`, `storageApi.getUsage()`, and `storageApi.getObjects()`.
- Calculates real-time quota percentage and allocation progress bar.
- Manages the active navigation tab (`EXPLORER`, `DEVELOPER_DOCS`, `POLICIES`, `WEBHOOKS`, `TRASH`, `USAGE_HEALTH`).
- Houses top-level modals for bucket creation and bucket configuration.

### 2. `storage-explorer.tsx` (File Management & Dropzone)
- **Bucket Sidebar**: Displays all buckets with public/private badges and object count chips.
- **Hierarchical Breadcrumbs**: Enables nested folder navigation (e.g. `documents / invoices / 2026`).
- **Multi-File Drag-and-Drop Dropzone**: Supports direct multi-file dragging from local desktop with automated parallel upload queuing.
- **Search & Filter**: Real-time client-side prefix matching across file names.
- **Object Inspector Drawer**: Right-hand flyout displaying object ID, size, MIME type, direct Edge CDN URL, presigned download button, and raw HTTP metadata.

### 3. `storage-developer-docs.tsx` (Interactive Documentation)
- **API Key Acquisition Assistant**:
  - Automatically checks if the user has an active API key.
  - Features an inline **Generate Storage Key** generator to create keys without leaving the storage screen.
  - Includes a one-click toggle: `Insert my active key in code snippets below`.
- **Snippet Customizer Bar**:
  - Solves code example ambiguity by allowing developers to choose between **Standard Template Mode** (`"my-bucket"`) and **Workspace Buckets Mode** (dynamically inserting one of their live buckets).
- **Tabbed Protocol Guide**:
  - `@whizan/storage-js` SDK: 10 comprehensive copy-pasteable examples.
  - AWS S3 Gateway: AWS CLI commands and Python Boto3 scripts.
  - Image Transformations Playground: Live interactive image preview with sliders for width, height, quality, format, and fit.
  - REST API & cURL: Raw HTTP request specifications.

### 4. `storage-usage-health.tsx` (Active Limits & Audit Trail)
- **Storage Engine & Quota Reconciliation Banner**: Provides an on-demand trigger to synchronize PostgreSQL counters with edge physical storage and reclaim stale upload leases.
- **Active Storage Limits Card**: Replaces traditional marketing comparison tables with direct, technical specifications of the developer's live tier (max file size: 25 MB, rate limit: 60 RPM, daily commands: 2,000/day, concurrent slots: 3, signed URL TTL: 15m, zero egress fees).
- **Security Audit Trail Table**: Displays the last 50 mutating operations with color-coded badges (`UPLOAD`, `DELETE`, `METADATA_UPDATE`).

### 5. `storage-trash-bin.tsx` (Data Recovery)
- Lists all soft-deleted objects with deletion timestamp and original bucket path.
- Provides one-click **Restore** and **Permanently Delete** controls.

### 6. `storage-modals.tsx` (Creation & Settings Dialogs)
- **Create Bucket Modal**: Validates bucket name regex (`[a-z0-9][a-z0-9-]{1,61}[a-z0-9]`), toggles public read access, and configures allowed MIME-type whitelists.
- **Bucket Settings Modal**: Modifies existing bucket visibility and file size ceilings.

---

## 3. UI/UX Design System & Principles

1. **Enterprise White-Label Aesthetics**:
   - Zero third-party vendor names or provider leakages. All features are branded as native Whizan Cloud services ("Global Edge CDN", "Distributed Storage Engine").
2. **Professional Dark Theme Palette**:
   - Built on tailored CSS variables (`--card-bg`, `--card-border`, `--bg-inset`, `--muted`, `--accent`, `--success`).
   - Clean micro-animations: Spinner feedback on buttons during async requests, instant clipboard toast notifications (Sonner), and animated badge indicators.
3. **Typography & Code Readability**:
   - Inter-based clean typography for interface elements.
   - Strict monospace formatting for object paths, SHA hashes, API keys, and code snippets.
4. **Zero AI Slop**:
   - Elimination of superfluous buzzwords or marketing comparisons.
   - Clean, technical, and actionable information presentation.
