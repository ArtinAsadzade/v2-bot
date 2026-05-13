-- Phase 1 database foundation: UUID based, audited, indexed core tables.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BANNED', 'DELETED');
CREATE TYPE "WalletTransactionDirection" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "WalletTransactionStatus" AS ENUM ('PENDING', 'SETTLED', 'FAILED', 'REVERSED');
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'REWARDED', 'CANCELED');
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'ADMIN', 'SUPPORT', 'FINANCE', 'OPERATOR');
CREATE TYPE "NotificationChannel" AS ENUM ('TELEGRAM', 'EMAIL', 'IN_APP');
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'WAITING_ADMIN', 'WAITING_USER', 'CLOSED');
CREATE TYPE "XrayClientStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXPIRED', 'DELETED');
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'ADMIN', 'SYSTEM');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "telegram_id" VARCHAR(32) NOT NULL,
  "username" VARCHAR(64),
  "first_name" VARCHAR(128),
  "last_name" VARCHAR(128),
  "language_code" VARCHAR(16),
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "referral_code" VARCHAR(32) NOT NULL,
  "referred_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wallets" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" UUID NOT NULL,
  "balance_toman" BIGINT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wallet_transactions" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "wallet_id" UUID NOT NULL,
  "direction" "WalletTransactionDirection" NOT NULL,
  "status" "WalletTransactionStatus" NOT NULL DEFAULT 'PENDING',
  "amount_toman" BIGINT NOT NULL,
  "balance_after" BIGINT NOT NULL,
  "reason" VARCHAR(160) NOT NULL,
  "provider" VARCHAR(64),
  "provider_ref" VARCHAR(128),
  "idempotency_key" VARCHAR(128) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "products" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "name" VARCHAR(160) NOT NULL,
  "slug" VARCHAR(180) NOT NULL,
  "description" TEXT,
  "inbound_id" INTEGER NOT NULL,
  "protocol" VARCHAR(32) NOT NULL,
  "price_toman" BIGINT NOT NULL,
  "traffic_gb" INTEGER NOT NULL,
  "duration_days" INTEGER NOT NULL,
  "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchases" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
  "amount_toman" BIGINT NOT NULL,
  "traffic_gb" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "referrals" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "referrer_id" UUID NOT NULL,
  "referee_id" UUID NOT NULL,
  "purchase_id" UUID,
  "reward_toman" BIGINT NOT NULL DEFAULT 0,
  "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admins" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "email" VARCHAR(255) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "display_name" VARCHAR(160) NOT NULL,
  "role" "AdminRole" NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_login_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "settings" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "key" VARCHAR(120) NOT NULL,
  "value" JSONB NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" UUID NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
  "title" VARCHAR(180) NOT NULL,
  "body" TEXT NOT NULL,
  "payload" JSONB,
  "scheduled_at" TIMESTAMPTZ(3),
  "sent_at" TIMESTAMPTZ(3),
  "read_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_tickets" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" UUID NOT NULL,
  "subject" VARCHAR(180) NOT NULL,
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "closed_at" TIMESTAMPTZ(3),
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_ticket_messages" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "ticket_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "is_admin" BOOLEAN NOT NULL DEFAULT false,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "xray_clients" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "purchase_id" UUID NOT NULL,
  "inbound_id" INTEGER NOT NULL,
  "client_uuid" UUID NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "subscription_id" VARCHAR(128) NOT NULL,
  "subscription_url" TEXT NOT NULL,
  "config_links" TEXT[] NOT NULL,
  "traffic_limit_gb" INTEGER NOT NULL,
  "used_bytes" BIGINT NOT NULL DEFAULT 0,
  "status" "XrayClientStatus" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "last_synced_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "xray_clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "actor_type" "AuditActorType" NOT NULL,
  "actor_user_id" UUID,
  "actor_admin_id" UUID,
  "action" VARCHAR(120) NOT NULL,
  "entity" VARCHAR(120) NOT NULL,
  "entity_id" VARCHAR(120),
  "ip_address" INET,
  "user_agent" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");
CREATE INDEX "users_status_created_at_idx" ON "users"("status", "created_at");
CREATE INDEX "users_referred_by_id_idx" ON "users"("referred_by_id");
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");
CREATE INDEX "wallet_transactions_status_created_at_idx" ON "wallet_transactions"("status", "created_at");
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");
CREATE INDEX "products_status_protocol_idx" ON "products"("status", "protocol");
CREATE INDEX "products_inbound_id_idx" ON "products"("inbound_id");
CREATE UNIQUE INDEX "purchases_idempotency_key_key" ON "purchases"("idempotency_key");
CREATE INDEX "purchases_user_id_created_at_idx" ON "purchases"("user_id", "created_at");
CREATE INDEX "purchases_product_id_status_idx" ON "purchases"("product_id", "status");
CREATE UNIQUE INDEX "referrals_referrer_id_referee_id_key" ON "referrals"("referrer_id", "referee_id");
CREATE INDEX "referrals_referrer_id_status_idx" ON "referrals"("referrer_id", "status");
CREATE INDEX "referrals_referee_id_idx" ON "referrals"("referee_id");
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");
CREATE INDEX "admins_role_is_active_idx" ON "admins"("role", "is_active");
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");
CREATE INDEX "notifications_user_id_status_idx" ON "notifications"("user_id", "status");
CREATE INDEX "notifications_channel_scheduled_at_idx" ON "notifications"("channel", "scheduled_at");
CREATE INDEX "support_tickets_user_id_status_idx" ON "support_tickets"("user_id", "status");
CREATE INDEX "support_tickets_status_priority_created_at_idx" ON "support_tickets"("status", "priority", "created_at");
CREATE INDEX "support_ticket_messages_ticket_id_created_at_idx" ON "support_ticket_messages"("ticket_id", "created_at");
CREATE UNIQUE INDEX "xray_clients_purchase_id_key" ON "xray_clients"("purchase_id");
CREATE UNIQUE INDEX "xray_clients_client_uuid_key" ON "xray_clients"("client_uuid");
CREATE UNIQUE INDEX "xray_clients_email_key" ON "xray_clients"("email");
CREATE UNIQUE INDEX "xray_clients_subscription_id_key" ON "xray_clients"("subscription_id");
CREATE INDEX "xray_clients_user_id_status_idx" ON "xray_clients"("user_id", "status");
CREATE INDEX "xray_clients_inbound_id_status_idx" ON "xray_clients"("inbound_id", "status");
CREATE INDEX "xray_clients_expires_at_idx" ON "xray_clients"("expires_at");
CREATE INDEX "audit_logs_actor_type_created_at_idx" ON "audit_logs"("actor_type", "created_at");
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_id_fkey" FOREIGN KEY ("referred_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_fkey" FOREIGN KEY ("referee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "xray_clients" ADD CONSTRAINT "xray_clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "xray_clients" ADD CONSTRAINT "xray_clients_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "xray_clients" ADD CONSTRAINT "xray_clients_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_admin_id_fkey" FOREIGN KEY ("actor_admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
