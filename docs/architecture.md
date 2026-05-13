# Architecture decisions

## Clean modular monolith

The platform starts as a modular monolith because it keeps transactional wallet, purchase, and Xray provisioning flows simple while preserving clear module boundaries. Each feature owns services and repositories; infrastructure adapters are injected through ports.

## Package choices

- Fastify provides a small, high-performance API runtime with first-class validation and plugin isolation.
- Telegraf is the maintained Telegram framework used for stateful inline keyboard flows.
- Prisma provides safe migrations, readable schema modeling, and typed database access for PostgreSQL.
- Redis and BullMQ isolate slow notification, traffic sync, and retryable provisioning jobs from user-facing requests.
- Zod validates environment variables, DTOs, and untrusted Telegram/API input.
- Pino gives structured logs with secret redaction.
- Next.js, TailwindCSS, shadcn-style primitives, and Framer Motion support a premium responsive admin panel.

## Scalability decisions

- Purchases use idempotency keys and an append-only wallet ledger to prevent double spending.
- Xray calls live behind `XrayPanelPort`, allowing multiple panel providers or failover implementations.
- Redis-backed queues support notification bursts and periodic traffic synchronization.
- Products reference existing inbound IDs; the platform only creates clients and never mutates inbound topology.
- Database indexes target lookup paths for Telegram IDs, referral codes, service status, and audit windows.

## Security considerations

- Secrets are loaded from environment variables and validated during boot.
- Admin routes are designed for JWT/RBAC enforcement and audit logging.
- Rate limiting and secure HTTP headers are registered globally.
- Telegram input is normalized before persistence and DTOs are validated with Zod.
- Wallet mutations are performed inside database transactions.
