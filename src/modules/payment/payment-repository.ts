import type { Prisma } from "@prisma/client";
import { logger } from "../../services/logger";
import { prisma } from "../../services/prisma";
import type { AuditData, TxClient } from "./payment.types";

export type DbClient = TxClient | typeof prisma;

export async function rawPaymentInvoiceProjection(invoiceId: string) {
  try {
    const result = await prisma.$runCommandRaw({
      find: "PaymentInvoice",
      filter: { _id: { $oid: invoiceId } },
      projection: { _id: 1, status: 1, payId: 1 },
      limit: 1,
    });
    const cursor =
      result && typeof result === "object" && "cursor" in result ? (result as { cursor?: { firstBatch?: unknown[] } }).cursor : undefined;
    const document = cursor?.firstBatch?.[0];
    return document && typeof document === "object" ? (document as Record<string, unknown>) : null;
  } catch (error) {
    logger.info("PAYMENT_INVOICE_RAW_PROJECTION_FAILED", {
      event: "PAYMENT_INVOICE_RAW_PROJECTION_FAILED",
      invoiceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function audit(tx: DbClient, data: AuditData) {
  try {
    if (data.invoiceId) {
      await tx.paymentAuditLog.create({
        data: {
          userId: data.userId ?? undefined,
          invoiceId: data.invoiceId,
          action: data.action,
          metadata: data.metadata
            ? JSON.stringify({ ...data.metadata, actorId: data.actorId })
            : data.actorId
              ? JSON.stringify({ actorId: data.actorId })
              : undefined,
        },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: data.actorId ?? data.userId ?? "system",
        action: data.action,
        metadata: JSON.stringify({ invoiceId: data.invoiceId, userId: data.userId, ...(data.metadata ?? {}) }),
      },
    });
  } catch (error) {
    logger.error("PAYMENT_AUDIT_LOG_FAILED", {
      event: "PAYMENT_AUDIT_LOG_FAILED",
      action: data.action,
      invoiceId: data.invoiceId,
      userId: data.userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export type { Prisma };
