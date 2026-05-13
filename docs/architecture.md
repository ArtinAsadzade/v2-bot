# Phase 1 architecture

## Backend architecture

The API follows Clean Architecture inside a modular monolith. Feature modules own route adapters, DTO validators, services, and repository ports. Infrastructure adapters live under `src/infrastructure` and are wired at the app/plugin boundary.

## Environment and configuration

`apps/api/src/config/env.ts` is the only API location that parses raw environment variables. It validates development, staging, and production settings with Zod and exposes typed groups for database, Redis, Telegram, Xray API, JWT, and crypto payments.

## Database foundation

The Prisma schema models users, wallets, wallet transactions, products, purchases, referrals, admins, settings, notifications, support tickets, Xray clients, and audit logs. Tables use UUID primary keys, snake_case mapping, timestamps, soft-delete fields where lifecycle deletion is expected, idempotency keys, relations, and query-path indexes.

## Redis and queues

Redis connections are centralized. BullMQ queues are created through a typed factory with retry/backoff defaults. Worker, scheduler, and jobs directories are present but intentionally empty of business jobs.

## API runtime

Fastify is bootstrapped with correlation IDs, Pino request logging, centralized error formatting, security headers, CORS, cookies, JWT, rate limiting, health routes, Prisma lifecycle hooks, Redis lifecycle hooks, and graceful shutdown.

## Bot foundation

The bot app creates a Telegraf instance with session middleware, correlation middleware, a command registry, and a scene registry. No commands or flows are registered in Phase 1.

## Admin foundation

The admin app is a Next.js App Router project configured with TailwindCSS, shadcn metadata, Framer Motion dependency support, strict TypeScript, and no implemented UI pages.
