import { logger } from "../../services/logger";

export function paymentLog(event: string, metadata: Record<string, unknown> = {}) {
  logger.info(event, { event, ...metadata });
}
