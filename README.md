# V2 Bot Platform — Phase 1 Foundation

Production-grade modular monorepo foundation for a Persian Telegram platform that will sell Xray/V2Ray proxy subscriptions in later phases.

> Phase 1 intentionally contains infrastructure, architecture, persistence, observability, queue, API, bot, and admin foundations only. Business flows, Telegram commerce flows, and admin pages are not implemented yet.

## Architecture decisions

### Clean modular monolith

The backend starts as a modular monolith because wallet, purchase, referral, support, and Xray provisioning will need strong transactional boundaries. Code is organized by feature modules while infrastructure adapters (Prisma, Redis, BullMQ, Telegram, Xray API) stay behind ports and factories.

### Monorepo packages

- `apps/api` — Fastify API bootstrap, plugins, config, Prisma, Redis, queues, modules.
- `apps/bot` — Telegraf bootstrap with sessions, middleware, command loader, and scene registry.
- `apps/admin-panel` — Next.js App Router, TailwindCSS, shadcn configuration, Framer Motion dependency foundation.
- `packages/shared` — constants, Zod schemas, response helpers, Persian utilities.
- `packages/configs` — shared ESLint and TypeScript configuration.
- `packages/types` — cross-package type contracts.
- `packages/ui` — shared UI primitives/utilities for future admin components.
- `infra/docker` — production-oriented Docker build assets.

### Package choices

Fastify is used for a fast plugin-oriented API runtime. Prisma gives typed PostgreSQL access and migrations. Redis + BullMQ provide retryable background processing. Zod validates environment variables and DTO boundaries. Pino provides structured logging with redaction and request correlation. Telegraf is installed only as a bot foundation. Next.js, TailwindCSS, shadcn configuration, and Framer Motion prepare the admin application without implementing pages.

### Scalability considerations

The platform uses feature modules, repository interfaces, service classes, dependency injection by constructor, append-only wallet transactions, UUID identifiers, idempotency keys, explicit indexes, and queue factories. This keeps the codebase easy to split into services later while preserving simple deployment for Phase 1.

### Security considerations

Secrets are validated centrally and never read directly outside the config layer. The API registers Helmet, CORS, rate limiting, signed cookie preparation, JWT setup, password hashing with Argon2id plus pepper, structured error responses, correlation IDs, and audit-log ports for future sensitive operations.

## Folder structure

```text
apps/
  api/
    prisma/
      migrations/
      schema.prisma
    src/
      config/
      core/
      infrastructure/
      modules/
      plugins/
      routes/
  bot/
    src/
      commands/
      config/
      core/
      loaders/
      middlewares/
      scenes/
      sessions/
  admin-panel/
    app/
    components/
    lib/
packages/
  shared/
  configs/
  types/
  ui/
infra/
  docker/
```

## Getting started

### Full stack with Docker (recommended)

```bash
cp .env.example .env
# Edit .env and set TELEGRAM_BOT_TOKEN (required) plus JWT/crypto secrets

docker compose up --build
```

This starts PostgreSQL, Redis, API, Telegram bot, and admin panel. On first boot the API container automatically runs Prisma migrations and seed.

| Service      | URL                        |
| ------------ | -------------------------- |
| API health   | http://localhost:4000/health |
| Admin panel  | http://localhost:3000      |

Verify the bot by sending `/start` in Telegram after the stack is healthy.

### Local development (without Docker for apps)

```bash
cp .env.example .env
corepack enable
pnpm install
docker compose up -d postgres redis
pnpm --filter @v2bot/api prisma:migrate
pnpm --filter @v2bot/api prisma:seed
pnpm dev
```

## Quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
```
