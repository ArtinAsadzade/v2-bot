#!/bin/sh
set -e

echo "[api] Running Prisma migrations..."

npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "[api] Running database seed..."
node dist/prisma/seed.js

echo "[api] Starting server..."
exec "$@"