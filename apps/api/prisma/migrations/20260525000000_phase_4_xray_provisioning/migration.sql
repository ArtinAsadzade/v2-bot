-- Phase 4: Xray provisioning, service lifecycle, multi-node foundation

CREATE TYPE "ProductCategory" AS ENUM ('STANDARD', 'PREMIUM', 'TRIAL', 'ENTERPRISE');
CREATE TYPE "PricingStrategy" AS ENUM ('FIXED', 'PER_GB', 'HYBRID');
CREATE TYPE "ServiceInstanceStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'DISABLED', 'DELETED', 'FAILED');
CREATE TYPE "ProvisioningJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "ProvisioningLogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');
CREATE TYPE "LinkProtocol" AS ENUM ('VLESS', 'VMESS', 'TROJAN', 'SHADOWSOCKS', 'HYSTERIA', 'HYSTERIA2', 'OTHER');

ALTER TYPE "FinancialAuditAction" ADD VALUE 'PURCHASE_COMPLETED';
ALTER TYPE "FinancialAuditAction" ADD VALUE 'PROVISION_ROLLBACK';

CREATE TABLE "xray_nodes" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "region" VARCHAR(80),
    "base_url" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "max_clients" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "xray_nodes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "products" ADD COLUMN "category" "ProductCategory" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "products" ADD COLUMN "node_id" UUID;
ALTER TABLE "products" ADD COLUMN "pricing_strategy" "PricingStrategy" NOT NULL DEFAULT 'FIXED';

ALTER TABLE "purchase_drafts" ADD COLUMN "product_id" UUID;

ALTER TABLE "xray_clients" ADD COLUMN "node_id" UUID;
ALTER TABLE "xray_clients" ADD COLUMN "panel_client_id" VARCHAR(128);
ALTER TABLE "xray_clients" ADD COLUMN "metadata" JSONB;

CREATE TABLE "service_instances" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "xray_client_id" UUID,
    "node_id" UUID,
    "inbound_id" INTEGER NOT NULL,
    "status" "ServiceInstanceStatus" NOT NULL DEFAULT 'PROVISIONING',
    "traffic_limit_gb" INTEGER NOT NULL,
    "used_bytes" BIGINT NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "idempotency_key" VARCHAR(160) NOT NULL,
    "last_synced_at" TIMESTAMPTZ(3),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "service_instances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_usage_snapshots" (
    "id" UUID NOT NULL,
    "service_instance_id" UUID NOT NULL,
    "used_bytes" BIGINT NOT NULL,
    "upload_bytes" BIGINT NOT NULL DEFAULT 0,
    "download_bytes" BIGINT NOT NULL DEFAULT 0,
    "remaining_bytes" BIGINT,
    "synced_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    CONSTRAINT "service_usage_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provisioning_jobs" (
    "id" UUID NOT NULL,
    "service_instance_id" UUID NOT NULL,
    "status" "ProvisioningJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "idempotency_key" VARCHAR(160) NOT NULL,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "provisioning_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provisioning_logs" (
    "id" UUID NOT NULL,
    "provisioning_job_id" UUID NOT NULL,
    "level" "ProvisioningLogLevel" NOT NULL DEFAULT 'INFO',
    "message" VARCHAR(500) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "provisioning_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_links" (
    "id" UUID NOT NULL,
    "xray_client_id" UUID NOT NULL,
    "protocol" "LinkProtocol" NOT NULL DEFAULT 'OTHER',
    "url" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "subscription_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "config_links" (
    "id" UUID NOT NULL,
    "xray_client_id" UUID NOT NULL,
    "protocol" "LinkProtocol" NOT NULL DEFAULT 'OTHER',
    "url" TEXT NOT NULL,
    "label" VARCHAR(120),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "config_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_instances_purchase_id_key" ON "service_instances"("purchase_id");
CREATE UNIQUE INDEX "service_instances_xray_client_id_key" ON "service_instances"("xray_client_id");
CREATE UNIQUE INDEX "service_instances_idempotency_key_key" ON "service_instances"("idempotency_key");
CREATE INDEX "service_instances_user_id_status_idx" ON "service_instances"("user_id", "status");
CREATE INDEX "service_instances_status_expires_at_idx" ON "service_instances"("status", "expires_at");
CREATE INDEX "service_instances_node_id_status_idx" ON "service_instances"("node_id", "status");

CREATE INDEX "service_usage_snapshots_service_instance_id_synced_at_idx" ON "service_usage_snapshots"("service_instance_id", "synced_at");

CREATE UNIQUE INDEX "provisioning_jobs_idempotency_key_key" ON "provisioning_jobs"("idempotency_key");
CREATE INDEX "provisioning_jobs_status_next_retry_at_idx" ON "provisioning_jobs"("status", "next_retry_at");
CREATE INDEX "provisioning_jobs_service_instance_id_status_idx" ON "provisioning_jobs"("service_instance_id", "status");

CREATE INDEX "provisioning_logs_provisioning_job_id_created_at_idx" ON "provisioning_logs"("provisioning_job_id", "created_at");

CREATE UNIQUE INDEX "subscription_links_xray_client_id_url_key" ON "subscription_links"("xray_client_id", "url");
CREATE INDEX "subscription_links_xray_client_id_protocol_idx" ON "subscription_links"("xray_client_id", "protocol");

CREATE UNIQUE INDEX "config_links_xray_client_id_url_key" ON "config_links"("xray_client_id", "url");
CREATE INDEX "config_links_xray_client_id_protocol_idx" ON "config_links"("xray_client_id", "protocol");

CREATE INDEX "xray_nodes_is_active_priority_idx" ON "xray_nodes"("is_active", "priority");
CREATE INDEX "xray_nodes_region_idx" ON "xray_nodes"("region");
CREATE INDEX "products_node_id_status_idx" ON "products"("node_id", "status");
CREATE INDEX "purchase_drafts_product_id_idx" ON "purchase_drafts"("product_id");
CREATE INDEX "xray_clients_node_id_status_idx" ON "xray_clients"("node_id", "status");

ALTER TABLE "products" ADD CONSTRAINT "products_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "xray_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_drafts" ADD CONSTRAINT "purchase_drafts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "xray_clients" ADD CONSTRAINT "xray_clients_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "xray_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_instances" ADD CONSTRAINT "service_instances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_instances" ADD CONSTRAINT "service_instances_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_instances" ADD CONSTRAINT "service_instances_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_instances" ADD CONSTRAINT "service_instances_xray_client_id_fkey" FOREIGN KEY ("xray_client_id") REFERENCES "xray_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_instances" ADD CONSTRAINT "service_instances_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "xray_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_usage_snapshots" ADD CONSTRAINT "service_usage_snapshots_service_instance_id_fkey" FOREIGN KEY ("service_instance_id") REFERENCES "service_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "provisioning_jobs" ADD CONSTRAINT "provisioning_jobs_service_instance_id_fkey" FOREIGN KEY ("service_instance_id") REFERENCES "service_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "provisioning_logs" ADD CONSTRAINT "provisioning_logs_provisioning_job_id_fkey" FOREIGN KEY ("provisioning_job_id") REFERENCES "provisioning_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscription_links" ADD CONSTRAINT "subscription_links_xray_client_id_fkey" FOREIGN KEY ("xray_client_id") REFERENCES "xray_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "config_links" ADD CONSTRAINT "config_links_xray_client_id_fkey" FOREIGN KEY ("xray_client_id") REFERENCES "xray_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
