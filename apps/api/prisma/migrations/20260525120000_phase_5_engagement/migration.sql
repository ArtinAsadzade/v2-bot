-- Phase 5: engagement, notifications, tickets, analytics, events

CREATE TYPE "TicketCategory" AS ENUM ('PAYMENT', 'TECHNICAL', 'ACCOUNT', 'GENERAL');
CREATE TYPE "NotificationType" AS ENUM (
  'SERVICE_EXPIRING', 'SERVICE_EXPIRED', 'TRAFFIC_WARNING', 'DEPOSIT_SUCCESS',
  'PURCHASE_CONFIRMATION', 'REFERRAL_REWARD', 'SYSTEM_ANNOUNCEMENT', 'ADMIN_BROADCAST', 'INACTIVITY_REMINDER'
);
CREATE TYPE "ReferralAttributionSource" AS ENUM ('TELEGRAM_START', 'LINK', 'MANUAL', 'OTHER');
CREATE TYPE "SystemEventType" AS ENUM (
  'USER_CREATED', 'REFERRAL_ACTIVATED', 'PURCHASE_COMPLETED', 'SERVICE_EXPIRING',
  'SERVICE_EXPIRED', 'PAYMENT_SUCCESS', 'TICKET_CREATED', 'NOTIFICATION_SENT'
);
CREATE TYPE "SystemEventStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');
CREATE TYPE "UserActivityType" AS ENUM (
  'DAILY_LOGIN', 'COMMAND', 'PURCHASE', 'TICKET_CREATED', 'REFERRAL_SHARED', 'NOTIFICATION_OPENED'
);
CREATE TYPE "AnalyticsMetricKey" AS ENUM (
  'ACTIVE_USERS', 'PURCHASES', 'REFERRAL_CONVERSIONS', 'RENEWALS', 'NOTIFICATIONS_SENT', 'TICKETS_CREATED'
);

ALTER TABLE "referrals" ADD COLUMN "source" "ReferralAttributionSource" NOT NULL DEFAULT 'TELEGRAM_START';

ALTER TABLE "referral_rewards"
  ADD COLUMN "fixed_bonus_toman" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "release_at" TIMESTAMPTZ(3);

CREATE INDEX "referral_rewards_status_release_at_idx" ON "referral_rewards"("status", "release_at");

CREATE TABLE "referral_attribution_logs" (
  "id" UUID NOT NULL,
  "inviter_id" UUID NOT NULL,
  "invited_id" UUID NOT NULL,
  "source" "ReferralAttributionSource" NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_attribution_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "referral_attribution_logs_inviter_id_invited_id_key" ON "referral_attribution_logs"("inviter_id", "invited_id");
CREATE INDEX "referral_attribution_logs_inviter_id_created_at_idx" ON "referral_attribution_logs"("inviter_id", "created_at");
CREATE INDEX "referral_attribution_logs_invited_id_idx" ON "referral_attribution_logs"("invited_id");
ALTER TABLE "referral_attribution_logs" ADD CONSTRAINT "referral_attribution_logs_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_attribution_logs" ADD CONSTRAINT "referral_attribution_logs_invited_id_fkey" FOREIGN KEY ("invited_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD COLUMN "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM_ANNOUNCEMENT',
  ADD COLUMN "template_key" VARCHAR(80),
  ADD COLUMN "deduplication_key" VARCHAR(160),
  ADD COLUMN "reference_type" VARCHAR(80),
  ADD COLUMN "reference_id" VARCHAR(160);

CREATE UNIQUE INDEX "notifications_user_id_deduplication_key_key" ON "notifications"("user_id", "deduplication_key");
CREATE INDEX "notifications_type_status_created_at_idx" ON "notifications"("type", "status", "created_at");

CREATE TABLE "notification_logs" (
  "id" UUID NOT NULL,
  "notification_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "status" "NotificationStatus" NOT NULL,
  "error_message" TEXT,
  "provider_ref" VARCHAR(160),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notification_logs_notification_id_created_at_idx" ON "notification_logs"("notification_id", "created_at");
CREATE INDEX "notification_logs_user_id_created_at_idx" ON "notification_logs"("user_id", "created_at");
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_tickets"
  ADD COLUMN "category" "TicketCategory" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "sla_due_at" TIMESTAMPTZ(3);
CREATE INDEX "support_tickets_category_status_idx" ON "support_tickets"("category", "status");

ALTER TABLE "support_ticket_messages" ADD COLUMN "attachment_url" VARCHAR(512);

CREATE TABLE "user_activity_logs" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "activity" "UserActivityType" NOT NULL,
  "score_delta" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_activity_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "user_activity_logs_user_id_activity_created_at_idx" ON "user_activity_logs"("user_id", "activity", "created_at");
CREATE INDEX "user_activity_logs_activity_created_at_idx" ON "user_activity_logs"("activity", "created_at");
ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "engagement_scores" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "activity_score" INTEGER NOT NULL DEFAULT 0,
  "level" INTEGER NOT NULL DEFAULT 1,
  "streak_days" INTEGER NOT NULL DEFAULT 0,
  "last_login_at" TIMESTAMPTZ(3),
  "last_streak_at" TIMESTAMPTZ(3),
  "reward_placeholder" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "engagement_scores_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "engagement_scores_user_id_key" ON "engagement_scores"("user_id");
CREATE INDEX "engagement_scores_level_activity_score_idx" ON "engagement_scores"("level", "activity_score");
ALTER TABLE "engagement_scores" ADD CONSTRAINT "engagement_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "system_events" (
  "id" UUID NOT NULL,
  "type" "SystemEventType" NOT NULL,
  "status" "SystemEventStatus" NOT NULL DEFAULT 'PENDING',
  "idempotency_key" VARCHAR(160) NOT NULL,
  "aggregate_type" VARCHAR(80),
  "aggregate_id" VARCHAR(160),
  "payload" JSONB NOT NULL,
  "processed_at" TIMESTAMPTZ(3),
  "failure_reason" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "system_events_idempotency_key_key" ON "system_events"("idempotency_key");
CREATE INDEX "system_events_type_status_created_at_idx" ON "system_events"("type", "status", "created_at");
CREATE INDEX "system_events_aggregate_type_aggregate_id_idx" ON "system_events"("aggregate_type", "aggregate_id");

CREATE TABLE "analytics_daily" (
  "id" UUID NOT NULL,
  "bucket_date" DATE NOT NULL,
  "metric" "AnalyticsMetricKey" NOT NULL,
  "value" BIGINT NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "analytics_daily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "analytics_daily_bucket_date_metric_key" ON "analytics_daily"("bucket_date", "metric");
CREATE INDEX "analytics_daily_bucket_date_idx" ON "analytics_daily"("bucket_date");
