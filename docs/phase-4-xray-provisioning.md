# Phase 4 — Xray Provisioning & Service Lifecycle

## Architecture

- **XrayHttpClient**: centralized 3x-ui API adapter (Bearer auth, retry, rate limit, Zod validation, mock mode).
- **XrayProvisionService**: creates clients in **pre-configured inbounds only** (never creates inbounds).
- **XrayTrafficService** / **XraySubscriptionService**: traffic sync and link regeneration.
- **PurchaseProvisionService**: atomic finalize flow (wallet debit → panel client → links → DB).
- **ServiceLifecycleService**: renew, suspend, resume, delete, regenerate links.
- **BullMQ** `xray-sync` queue: traffic sync, expiration checks, provision retries.

## Database

New tables: `xray_nodes`, `service_instances`, `service_usage_snapshots`, `provisioning_jobs`, `provisioning_logs`, `subscription_links`, `config_links`.

Products map to `inbound_id` + optional `node_id`. Admin creates inbounds manually in 3x-ui.

## Env

| Variable | Description |
|----------|-------------|
| `XRAY_API_BASE_URL` | 3x-ui panel URL |
| `XRAY_API_TOKEN` | Bearer token |
| `XRAY_API_TIMEOUT_MS` | HTTP timeout |
| `XRAY_API_MOCK` | `true` for local mock (no real panel) |
| `XRAY_RATE_LIMIT_PER_SEC` | Client-side rate limit |

## API Routes

- `GET /v1/products` — list active products
- `POST /v1/purchases/drafts` — requires `productId`
- `POST /v1/purchases/finalize` — complete purchase + provision
- `GET /v1/services/:userId` — user services
- `POST /v1/services/:userId/:serviceId/sync-traffic` — manual sync
- Lifecycle: renew, suspend, resume, regenerate-links, delete

## Commands

```bash
pnpm --filter @v2bot/api prisma:generate
pnpm --filter @v2bot/api prisma:migrate
pnpm typecheck
```

## Known Gaps

- Telegram push notifications queue not wired
- Admin panel UI for product/inbound mapping
- Automated integration tests (mock client ready)
- QR code generation in bot (URL buttons provided; QR lib optional)
