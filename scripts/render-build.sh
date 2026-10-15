#!/usr/bin/env bash
set -e

echo "🚀 [Render Build] Starting lean API build for Whizan Cloud Service..."

# Navigate to repo root if started from apps/api
if [ -f "../../package.json" ]; then
  cd ../../
fi

echo "📦 [Render Build] Installing API & DB dependencies (skipping unused frontend workspaces)..."
npm install --workspace=api --workspace=@hostify/db --include-workspace-root --prefer-offline --no-audit --no-fund

echo "🔧 [Render Build] Generating Prisma Client..."
cd packages/db
npx prisma generate
cd ../..

echo "🏗️ [Render Build] Compiling TypeScript API..."
cd apps/api
npm run build

echo "✅ [Render Build] API build complete!"
