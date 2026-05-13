-- Phase 3 financial infrastructure: wallets, ledger, crypto invoices, pricing, purchase drafts and audit logs.

DO $$ BEGIN
  CREATE TYPE "CurrencyCode" AS ENUM ('TOMAN', 'USDT', 'TON', 'BTC', 'ETH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "WalletTransactionType" AS ENUM ('DEPOSIT', 'PURCHASE', 'REFUND', 'ADMIN_ADJUSTMENT', 'REFERRAL_REWARD', 'BONUS', 'PENALTY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "WalletTransactionStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "WalletTransactionStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "WalletTransactionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
DO $$ BEGIN
  CREATE TYPE "PaymentInvoiceStatus" AS ENUM ('PENDING', 'CONFIRMING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PaymentNetwork" AS ENUM ('TRON', 'TON', 'BITCOIN', 'ETHEREUM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PaymentWebhookStatus" AS ENUM ('RECEIVED', 'VERIFIED', 'REJECTED', 'PROCESSED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "ReferralRewardStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "CouponStatus" AS ENUM ('ACTIVE', 'PAUSED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PricingRuleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PurchaseDraftStatus" AS ENUM ('DRAFT', 'FUNDS_RESERVED', 'CANCELLED', 'EXPIRED', 'CONVERTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "FinancialAuditAction" AS ENUM ('WALLET_CREATED', 'WALLET_CREDITED', 'WALLET_DEBITED', 'WALLET_FROZEN', 'WALLET_UNLOCKED', 'INVOICE_CREATED', 'PAYMENT_VERIFIED', 'PAYMENT_EXPIRED', 'ADMIN_ADJUSTMENT', 'REFERRAL_REWARD_APPLIED', 'PURCHASE_DRAFT_CREATED', 'RECONCILIATION_CHECKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "wallets"
  ADD COLUMN IF NOT EXISTS "frozen_balance_toman" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lifetime_deposits_toman" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lifetime_spending_toman" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "currency" "CurrencyCode" NOT NULL DEFAULT 'TOMAN',
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "wallets_user_id_currency_idx" ON "wallets"("user_id", "currency");

ALTER TABLE "wallet_transactions"
  ADD COLUMN IF NOT EXISTS "user_id" UUID,
  ADD COLUMN IF NOT EXISTS "type" "WalletTransactionType" NOT NULL DEFAULT 'DEPOSIT',
  ADD COLUMN IF NOT EXISTS "balance_before" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "frozen_before" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "frozen_after" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "currency" "CurrencyCode" NOT NULL DEFAULT 'TOMAN',
  ADD COLUMN IF NOT EXISTS "reference_id" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "payment_invoice_id" UUID;
UPDATE "wallet_transactions" wt SET "user_id" = w."user_id" FROM "wallets" w WHERE wt."wallet_id" = w."id" AND wt."user_id" IS NULL;
ALTER TABLE "wallet_transactions" ALTER COLUMN "user_id" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "wallet_transactions_user_id_created_at_idx" ON "wallet_transactions"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "wallet_transactions_type_status_idx" ON "wallet_transactions"("type", "status");
CREATE INDEX IF NOT EXISTS "wallet_transactions_reference_id_idx" ON "wallet_transactions"("reference_id");

CREATE TABLE IF NOT EXISTS "payment_invoices" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" UUID NOT NULL,
  "wallet_id" UUID NOT NULL,
  "provider" VARCHAR(64) NOT NULL,
  "network" "PaymentNetwork" NOT NULL,
  "asset" "CurrencyCode" NOT NULL,
  "fiat_currency" "CurrencyCode" NOT NULL DEFAULT 'TOMAN',
  "requested_toman" BIGINT NOT NULL,
  "asset_amount" DECIMAL(36,18),
  "pay_address" VARCHAR(255),
  "memo" VARCHAR(255),
  "status" "PaymentInvoiceStatus" NOT NULL DEFAULT 'PENDING',
  "confirmations" INTEGER NOT NULL DEFAULT 0,
  "required_confirmations" INTEGER NOT NULL DEFAULT 20,
  "provider_invoice_id" VARCHAR(160),
  "provider_payment_id" VARCHAR(160),
  "tx_hash" VARCHAR(160),
  "idempotency_key" VARCHAR(160) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "paid_at" TIMESTAMPTZ(3),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_invoices_idempotency_key_key" ON "payment_invoices"("idempotency_key");
CREATE INDEX IF NOT EXISTS "payment_invoices_user_id_status_created_at_idx" ON "payment_invoices"("user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "payment_invoices_provider_provider_invoice_id_idx" ON "payment_invoices"("provider", "provider_invoice_id");
CREATE INDEX IF NOT EXISTS "payment_invoices_status_expires_at_idx" ON "payment_invoices"("status", "expires_at");
CREATE INDEX IF NOT EXISTS "payment_invoices_tx_hash_idx" ON "payment_invoices"("tx_hash");

CREATE TABLE IF NOT EXISTS "payment_webhooks" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "provider" VARCHAR(64) NOT NULL,
  "event_id" VARCHAR(180) NOT NULL,
  "invoice_id" UUID,
  "status" "PaymentWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
  "signature" VARCHAR(512),
  "payload_hash" VARCHAR(128) NOT NULL,
  "payload" JSONB NOT NULL,
  "processed_at" TIMESTAMPTZ(3),
  "failure_reason" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_webhooks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_webhooks_provider_event_id_key" ON "payment_webhooks"("provider", "event_id");
CREATE INDEX IF NOT EXISTS "payment_webhooks_invoice_id_created_at_idx" ON "payment_webhooks"("invoice_id", "created_at");
CREATE INDEX IF NOT EXISTS "payment_webhooks_status_created_at_idx" ON "payment_webhooks"("status", "created_at");

CREATE TABLE IF NOT EXISTS "referral_rewards" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "referrer_id" UUID NOT NULL,
  "referee_id" UUID NOT NULL,
  "source_transaction_id" UUID,
  "reward_transaction_id" UUID,
  "percentage_bps" INTEGER NOT NULL,
  "base_amount_toman" BIGINT NOT NULL,
  "reward_amount_toman" BIGINT NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 1,
  "status" "ReferralRewardStatus" NOT NULL DEFAULT 'PENDING',
  "idempotency_key" VARCHAR(160) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "referral_rewards_idempotency_key_key" ON "referral_rewards"("idempotency_key");
CREATE INDEX IF NOT EXISTS "referral_rewards_referrer_id_status_idx" ON "referral_rewards"("referrer_id", "status");

CREATE TABLE IF NOT EXISTS "coupons" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "code" VARCHAR(64) NOT NULL,
  "status" "CouponStatus" NOT NULL DEFAULT 'ACTIVE',
  "discount_bps" INTEGER,
  "discount_amount_toman" BIGINT,
  "max_redemptions" INTEGER,
  "redeemed_count" INTEGER NOT NULL DEFAULT 0,
  "starts_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "coupons_code_key" ON "coupons"("code");
CREATE INDEX IF NOT EXISTS "coupons_status_expires_at_idx" ON "coupons"("status", "expires_at");

CREATE TABLE IF NOT EXISTS "pricing_rules" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "name" VARCHAR(160) NOT NULL,
  "status" "PricingRuleStatus" NOT NULL DEFAULT 'ACTIVE',
  "currency" "CurrencyCode" NOT NULL DEFAULT 'TOMAN',
  "price_per_gb_toman" BIGINT NOT NULL,
  "region" VARCHAR(80),
  "user_segment" VARCHAR(80),
  "priority" INTEGER NOT NULL DEFAULT 100,
  "starts_at" TIMESTAMPTZ(3),
  "ends_at" TIMESTAMPTZ(3),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pricing_rules_status_priority_idx" ON "pricing_rules"("status", "priority");
CREATE INDEX IF NOT EXISTS "pricing_rules_region_user_segment_idx" ON "pricing_rules"("region", "user_segment");
INSERT INTO "pricing_rules" ("name", "price_per_gb_toman", "priority") VALUES ('Default traffic price', 100000, 1000) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS "purchase_drafts" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" UUID NOT NULL,
  "status" "PurchaseDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "traffic_gb" INTEGER NOT NULL,
  "base_amount_toman" BIGINT NOT NULL,
  "discount_toman" BIGINT NOT NULL DEFAULT 0,
  "final_amount_toman" BIGINT NOT NULL,
  "reserved_toman" BIGINT NOT NULL DEFAULT 0,
  "currency" "CurrencyCode" NOT NULL DEFAULT 'TOMAN',
  "pricing_rule_id" UUID,
  "coupon_code" VARCHAR(64),
  "idempotency_key" VARCHAR(160) NOT NULL,
  "metadata" JSONB,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_drafts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_drafts_idempotency_key_key" ON "purchase_drafts"("idempotency_key");
CREATE INDEX IF NOT EXISTS "purchase_drafts_user_id_status_created_at_idx" ON "purchase_drafts"("user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "purchase_drafts_status_expires_at_idx" ON "purchase_drafts"("status", "expires_at");

CREATE TABLE IF NOT EXISTS "financial_audit_logs" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "action" "FinancialAuditAction" NOT NULL,
  "actor_type" "AuditActorType" NOT NULL,
  "actor_user_id" UUID,
  "actor_admin_id" UUID,
  "user_id" UUID,
  "wallet_id" UUID,
  "transaction_id" UUID,
  "invoice_id" UUID,
  "reference_id" VARCHAR(160),
  "ip_address" INET,
  "user_agent" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "financial_audit_logs_action_created_at_idx" ON "financial_audit_logs"("action", "created_at");
CREATE INDEX IF NOT EXISTS "financial_audit_logs_user_id_created_at_idx" ON "financial_audit_logs"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "financial_audit_logs_wallet_id_created_at_idx" ON "financial_audit_logs"("wallet_id", "created_at");
CREATE INDEX IF NOT EXISTS "financial_audit_logs_transaction_id_idx" ON "financial_audit_logs"("transaction_id");

DO $$ BEGIN
  ALTER TABLE "payment_invoices" ADD CONSTRAINT "payment_invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payment_webhooks" ADD CONSTRAINT "payment_webhooks_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "payment_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_payment_invoice_id_fkey" FOREIGN KEY ("payment_invoice_id") REFERENCES "payment_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
