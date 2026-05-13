# V2 Bot Platform

A production-oriented modular monolith for a Persian Telegram commerce bot that sells Xray/V2Ray proxy subscriptions.

## Architecture

- `apps/api`: Fastify API, Telegram bot, queues, domain services, Prisma repositories.
- `apps/admin`: Next.js admin dashboard with TailwindCSS and shadcn-style components.
- `packages/shared`: Shared DTOs, Persian UI copy, domain constants, and validators.
- `prisma`: PostgreSQL schema and migrations owned by the API package.

The backend follows Clean Architecture boundaries: domain entities and ports are isolated from infrastructure adapters such as Prisma, Redis, BullMQ, Telegram, and Xray panel APIs.

## Getting started

```bash
cp .env.example .env
npm install
npm run typecheck
npm run lint
docker compose up -d postgres redis
npm --workspace apps/api run prisma:migrate
npm run dev --workspaces --if-present
```

## Xray panel flow

Products map to existing inbound IDs. Purchases only add clients to selected inbounds; this platform never creates inbounds.
