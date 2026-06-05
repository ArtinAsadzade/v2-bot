import {
  AuditActorType,
  FinancialAuditAction,
  ProductStatus,
  ProvisioningJobStatus,
  ProvisioningLogLevel,
  PurchaseDraftStatus,
  PurchaseStatus,
  ServiceInstanceStatus,
  WalletTransactionDirection,
  WalletTransactionType,
  XrayClientStatus,
} from '@prisma/client';

import { AppError, NotFoundError } from '../../../core/errors/app-error.js';
import { logger } from '../../../core/logger/logger.js';
import { FinanceRepository } from '../../finance/repositories/finance.repository.js';
import { enqueuePurchaseNotification } from '../../lifecycle/queues/lifecycle.queues.js';
import { WalletService } from '../../finance/services/wallet.service.js';
import { ClientIdentityService } from '../../xray/services/client-identity.service.js';
import { detectLinkProtocol } from '../../xray/services/link-protocol.util.js';
import { XrayProvisionService } from '../../xray/services/xray-provision.service.js';
import { ProvisioningRepository } from '../repositories/provisioning.repository.js';

import type { PrismaClient } from '@prisma/client';

export type FinalizePurchaseInput = {
  userId: string;
  draftId: string;
  idempotencyKey: string;
  telegramId?: string;
};

/**
 * Atomic purchase finalization: wallet debit → panel client → links → DB records.
 * Idempotent via idempotencyKey; rolls back wallet on provision failure when possible.
 */
export class PurchaseProvisionService {
  private readonly identity = new ClientIdentityService();
  private readonly xrayProvision = new XrayProvisionService();

  public constructor(private readonly prisma: PrismaClient) {}

  public async finalize(input: FinalizePurchaseInput) {
    const existingPurchase = await this.prisma.purchase.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: {
        serviceInstance: {
          include: {
            xrayClient: { include: { configLinkRows: true, subscriptionLinks: true } },
            product: true,
          },
        },
      },
    });
    if (
      existingPurchase?.status === PurchaseStatus.SUCCEEDED &&
      existingPurchase.serviceInstance?.xrayClient
    ) {
      return this.toResult(existingPurchase.serviceInstance);
    }

    const existing = await new ProvisioningRepository(this.prisma).findServiceByIdempotency(
      input.idempotencyKey,
    );
    if (existing?.status === ServiceInstanceStatus.ACTIVE && existing.xrayClient) {
      return this.toResult(existing);
    }

    const draft = await this.prisma.purchaseDraft.findUnique({
      where: { id: input.draftId },
      include: { product: { include: { node: true } } },
    });
    if (!draft || draft.userId !== input.userId) throw new NotFoundError('Purchase draft');
    if (draft.status === PurchaseDraftStatus.CONVERTED) {
      const service = await new ProvisioningRepository(this.prisma).findServiceByIdempotency(
        input.idempotencyKey,
      );
      if (service) return this.toResult(service);
    }
    if (draft.status === PurchaseDraftStatus.EXPIRED || draft.status === PurchaseDraftStatus.CANCELLED) {
      throw new AppError('Purchase draft is no longer valid', 'DRAFT_INVALID', 409);
    }
    if (draft.expiresAt < new Date()) throw new AppError('Purchase draft expired', 'DRAFT_EXPIRED', 409);

    const product = draft.product;
    if (!product || product.status !== ProductStatus.ACTIVE) {
      throw new AppError('Product is not available', 'PRODUCT_UNAVAILABLE', 409);
    }

    const node = product.node ?? (await new ProvisioningRepository(this.prisma).findActiveNode());
    const panelBaseUrl = node?.baseUrl;
    const durationDays = product.durationDays;
    const trafficGb = draft.trafficGb;

    let purchaseId: string | undefined;
    let debited = false;

    try {
      const purchase = await this.prisma.$transaction(async (tx) => {
        const repository = new ProvisioningRepository(tx);
        const financeRepo = new FinanceRepository(tx);
        await financeRepo.upsertWallet(input.userId);
        const wallet = await financeRepo.lockWallet(input.userId);
        if (!wallet) throw new AppError('Wallet unavailable', 'WALLET_UNAVAILABLE', 409);

        const releaseFrozen =
          draft.status === PurchaseDraftStatus.FUNDS_RESERVED && draft.reservedToman > 0n;
        const available =
          wallet.balance_toman -
          wallet.frozen_balance_toman +
          (releaseFrozen ? draft.reservedToman : 0n);
        if (available < draft.finalAmountToman) {
          throw new AppError('Insufficient wallet balance', 'INSUFFICIENT_BALANCE', 409);
        }

        if (releaseFrozen) {
          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              frozenBalanceToman: { decrement: draft.reservedToman },
              version: { increment: 1 },
            },
          });
        }

        const createdPurchase = await tx.purchase.create({
          data: {
            userId: input.userId,
            productId: product.id,
            status: PurchaseStatus.PENDING,
            amountToman: draft.finalAmountToman,
            trafficGb,
            idempotencyKey: input.idempotencyKey,
            metadata: { draftId: draft.id },
          },
        });
        purchaseId = createdPurchase.id;

        const expiresAt = new Date(Date.now() + durationDays * 86_400_000);
        const serviceInstance = await tx.serviceInstance.create({
          data: {
            userId: input.userId,
            productId: product.id,
            purchaseId: createdPurchase.id,
            nodeId: node?.id ?? null,
            inboundId: product.inboundId,
            status: ServiceInstanceStatus.PROVISIONING,
            trafficLimitGb: trafficGb,
            expiresAt,
            idempotencyKey: input.idempotencyKey,
            metadata: { draftId: draft.id },
          },
        });

        await tx.provisioningJob.create({
          data: {
            serviceInstanceId: serviceInstance.id,
            status: ProvisioningJobStatus.PENDING,
            idempotencyKey: `job:${input.idempotencyKey}`,
            metadata: { purchaseId: createdPurchase.id },
          },
        });

        await tx.purchaseDraft.update({
          where: { id: draft.id },
          data: { status: PurchaseDraftStatus.CONVERTED },
        });

        return { purchase: createdPurchase, serviceInstance, walletId: wallet.id };
      });

      purchaseId = purchase.purchase.id;

      await new WalletService(this.prisma).applyLedger({
        userId: input.userId,
        amountToman: draft.finalAmountToman,
        type: WalletTransactionType.PURCHASE,
        direction: WalletTransactionDirection.DEBIT,
        reason: `Purchase ${product.name}`,
        idempotencyKey: `purchase-debit:${input.idempotencyKey}`,
        referenceId: purchase.purchase.id,
        actorType: AuditActorType.USER,
      });
      debited = true;

      const identity = this.identity.generate({
        userId: input.userId,
        productSlug: product.slug,
        purchaseId: purchase.purchase.id,
        ...(input.telegramId !== undefined ? { telegramId: input.telegramId } : {}),
      });

      const provisioned = await this.xrayProvision.createClient({
        inboundId: product.inboundId,
        identity,
        trafficGb,
        durationDays,
        ...(panelBaseUrl !== undefined ? { baseUrl: panelBaseUrl } : {}),
      });

      const result = await this.prisma.$transaction(async (tx) => {
        const expiresAt = new Date(Date.now() + durationDays * 86_400_000);
        const xrayClient = await tx.xrayClient.create({
          data: {
            userId: input.userId,
            productId: product.id,
            purchaseId: purchase.purchase.id,
            nodeId: node?.id ?? null,
            inboundId: product.inboundId,
            panelClientId: provisioned.panelClientId,
            clientUuid: identity.clientUuid,
            email: identity.email,
            subscriptionId: identity.subscriptionId,
            subscriptionUrl: provisioned.subscriptionUrl,
            configLinks: provisioned.configLinks,
            trafficLimitGb: trafficGb,
            status: XrayClientStatus.ACTIVE,
            expiresAt,
            metadata: identity.tags,
          },
        });

        await tx.configLink.createMany({
          data: provisioned.configLinks.map((url) => ({
            xrayClientId: xrayClient.id,
            protocol: detectLinkProtocol(url),
            url,
          })),
          skipDuplicates: true,
        });
        await tx.subscriptionLink.createMany({
          data: provisioned.subscriptionLinks.map((url, index) => ({
            xrayClientId: xrayClient.id,
            protocol: detectLinkProtocol(url),
            url,
            isPrimary: index === 0,
          })),
          skipDuplicates: true,
        });

        const serviceInstance = await tx.serviceInstance.update({
          where: { id: purchase.serviceInstance.id },
          data: {
            xrayClientId: xrayClient.id,
            status: ServiceInstanceStatus.ACTIVE,
          },
          include: {
            xrayClient: { include: { configLinkRows: true, subscriptionLinks: true } },
            product: true,
          },
        });

        await tx.purchase.update({
          where: { id: purchase.purchase.id },
          data: { status: PurchaseStatus.SUCCEEDED },
        });

        const job = await tx.provisioningJob.findFirst({
          where: { serviceInstanceId: purchase.serviceInstance.id },
        });
        if (job) {
          await tx.provisioningJob.update({
            where: { id: job.id },
            data: { status: ProvisioningJobStatus.SUCCEEDED, completedAt: new Date() },
          });
          await tx.provisioningLog.create({
            data: {
              provisioningJobId: job.id,
              level: ProvisioningLogLevel.INFO,
              message: 'Provisioning completed successfully',
              metadata: { xrayClientId: xrayClient.id },
            },
          });
        }

        await tx.financialAuditLog.create({
          data: {
            action: FinancialAuditAction.PURCHASE_COMPLETED,
            actorType: AuditActorType.USER,
            actorUserId: input.userId,
            userId: input.userId,
            referenceId: purchase.purchase.id,
            metadata: { serviceInstanceId: serviceInstance.id, xrayClientId: xrayClient.id },
          },
        });

        return serviceInstance;
      });

      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { referredById: true },
      });
      await enqueuePurchaseNotification({
        userId: input.userId,
        purchaseId: purchase.purchase.id,
        amountToman: draft.finalAmountToman.toString(),
        idempotencyKey: input.idempotencyKey,
        ...(user?.referredById ? { referrerId: user.referredById } : {}),
      });

      logger.info(
        { purchaseId: purchase.purchase.id, serviceId: result.id, userId: input.userId },
        'purchase provisioned',
      );
      return this.toResult(result);
    } catch (error) {
      await this.handleFailure({
        error,
        userId: input.userId,
        ...(purchaseId !== undefined ? { purchaseId } : {}),
        draftId: draft.id,
        idempotencyKey: input.idempotencyKey,
        amountToman: draft.finalAmountToman,
        debited,
      });
      throw error;
    }
  }

  private async handleFailure(input: {
    error: unknown;
    userId: string;
    purchaseId?: string;
    draftId: string;
    idempotencyKey: string;
    amountToman: bigint;
    debited: boolean;
  }): Promise<void> {
    logger.error(
      { err: input.error, purchaseId: input.purchaseId, userId: input.userId },
      'purchase provisioning failed',
    );

    if (input.purchaseId) {
      await this.prisma.serviceInstance.updateMany({
        where: { purchaseId: input.purchaseId },
        data: { status: ServiceInstanceStatus.FAILED },
      });
      await this.prisma.provisioningJob.updateMany({
        where: { serviceInstance: { purchaseId: input.purchaseId } },
        data: {
          status: ProvisioningJobStatus.FAILED,
          lastError: input.error instanceof Error ? input.error.message : 'unknown',
          nextRetryAt: new Date(Date.now() + 60_000),
        },
      });
    }

    if (input.debited) {
      try {
        await new WalletService(this.prisma).applyLedger({
          userId: input.userId,
          amountToman: input.amountToman,
          type: WalletTransactionType.REFUND,
          direction: WalletTransactionDirection.CREDIT,
          reason: 'Provision failure rollback',
          idempotencyKey: `provision-rollback:${input.idempotencyKey}`,
          referenceId: input.purchaseId,
          actorType: AuditActorType.SYSTEM,
        });
        await this.prisma.financialAuditLog.create({
          data: {
            action: FinancialAuditAction.PROVISION_ROLLBACK,
            actorType: AuditActorType.SYSTEM,
            userId: input.userId,
            referenceId: input.purchaseId ?? null,
            metadata: { draftId: input.draftId },
          },
        });
      } catch (rollbackError) {
        logger.fatal({ err: rollbackError, purchaseId: input.purchaseId }, 'provision rollback failed');
      }
    }
  }

  private toResult(
    service: Awaited<ReturnType<ProvisioningRepository['findServiceByIdempotency']>>,
  ) {
    if (!service) throw new NotFoundError('Service');
    return {
      service: {
        id: service.id,
        status: service.status,
        trafficLimitGb: service.trafficLimitGb,
        usedBytes: service.usedBytes.toString(),
        expiresAt: service.expiresAt.toISOString(),
        product: {
          id: service.product.id,
          name: service.product.name,
          protocol: service.product.protocol,
        },
      },
      subscription: service.xrayClient
        ? {
            subscriptionUrl: service.xrayClient.subscriptionUrl,
            configLinks: service.xrayClient.configLinkRows.map((l) => ({
              protocol: l.protocol,
              url: l.url,
              label: l.label,
            })),
            subscriptionLinks: service.xrayClient.subscriptionLinks.map((l) => ({
              protocol: l.protocol,
              url: l.url,
              isPrimary: l.isPrimary,
            })),
          }
        : null,
    };
  }
}
