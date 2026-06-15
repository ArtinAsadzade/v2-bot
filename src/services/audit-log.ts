import { logger } from "./logger";

export type AuditLogStatus = "started" | "received" | "resolved" | "success" | "sent" | "blocked" | "failed" | "skipped";

export type AuditLogInput = {
  area: string;
  action: string;
  status: AuditLogStatus | string;
  entityId?: string | number | null;
  error?: unknown;
  metadata?: Record<string, unknown>;
};

function errorMessage(error: unknown): string | undefined {
  if (error === undefined || error === null) return undefined;
  return error instanceof Error ? error.message : String(error);
}

export function auditLog(input: AuditLogInput) {
  const { area, action, status, entityId, error, metadata } = input;
  const meta = {
    area,
    action,
    status,
    ...(entityId === undefined || entityId === null ? {} : { entityId: String(entityId) }),
    ...metadata,
    ...(error === undefined ? {} : { error: errorMessage(error) }),
  };

  const message = `${area}.${action}.${status}`;
  if (status === "failed") logger.error(message, meta);
  else if (status === "blocked") logger.warn(message, meta);
  else logger.info(message, meta);
}
