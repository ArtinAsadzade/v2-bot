#!/bin/sh
set -e

cd apps/api

echo "[api] Applying Prisma migrations..."
../../node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma

echo "[api] Running database seed..."
# Invoke tsx directly — production image has no pnpm, so `prisma db seed` cannot resolve the monorepo seed script.
../../node_modules/.bin/tsx prisma/seed.ts

cd ../..

echo "[api] Starting server..."
exec "$@"
