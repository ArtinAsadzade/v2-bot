#!/bin/sh
set -e

cd apps/api

echo "[api] Applying Prisma migrations..."
../../node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma

echo "[api] Running database seed..."
node dist/prisma/seed.js

cd ../..

echo "[api] Starting server..."
exec "$@"
