# Phase 2 Telegram Bot Core

## Architecture decisions

- The bot is split into loaders, middleware, commands, actions, scenes, navigation, keyboards, templates, UI components, sessions and service clients so future purchase, wallet and admin flows can be added without large handlers.
- Fastify remains the backend boundary for persistent user data. The bot syncs Telegram identities through `/v1/telegram/users/sync` instead of writing directly to Prisma, keeping business rules in the API.
- Callback data is namespaced and versioned (`v1:namespace:action:value`) to avoid collisions as new modules are added.
- Redis-backed Telegraf sessions store navigation, scenes, flow drafts, user snapshots and settings with an expiration TTL.

## UX decisions

- Persian is the default language and copy is intentionally short, calm and SaaS-like.
- Inline keyboards are grouped into predictable rows with consistent icons and back/home controls.
- The response helper edits callback messages when possible to keep Telegram chats clean.
- Central templates and UI components keep profile cards, empty states, errors, confirmations and loading messages visually consistent.

## Scalability considerations

- The middleware pipeline isolates logging, rate limiting, user sync, locale, admin detection and session concerns.
- Navigation state is persisted per user and supports a stack for breadcrumb-like back behavior.
- Scene helpers include TTL, retry and cancellation hooks so long-running conversations can be safely introduced later.
- API-backed registration uses idempotent upsert logic and unique referral codes for high concurrency.

## Security considerations

- Callback payloads are Zod-validated before dispatch.
- Rate limits slow down spammy update bursts before expensive flows run.
- Referral attribution prevents self-referrals and stores a single referrer/referee relationship.
- Markdown escaping helpers are available for future formatted templates, while current render responses avoid parse-mode footguns by default.

## Current folders

- `apps/bot/src/actions`: centralized callback registry.
- `apps/bot/src/callbacks`: typed callback parser and builder.
- `apps/bot/src/commands`: command loader and command registrations.
- `apps/bot/src/i18n`: localization dictionaries and translation helpers.
- `apps/bot/src/keyboards`: reusable inline keyboard builders and menu keyboards.
- `apps/bot/src/middlewares`: session-safe middleware pipeline.
- `apps/bot/src/navigation`: screen registry and back-stack navigation manager.
- `apps/bot/src/rendering`: response lifecycle helpers.
- `apps/bot/src/scenes`: reusable wizard creation, validation, timeout and cancellation.
- `apps/bot/src/services`: Fastify API integration client.
- `apps/bot/src/templates`: centralized message templates.
- `apps/bot/src/ui`: reusable cards, states, toggles, pagination and confirmation components.
