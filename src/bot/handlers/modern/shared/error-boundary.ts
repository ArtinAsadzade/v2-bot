import type { AppContext } from "../../../../types/bot";
import { MonitoringService } from "../../../../services/monitoring.service";

type ModernHandler = (ctx: AppContext, next?: () => Promise<void>) => Promise<unknown>;

export function withModernHandlerErrorBoundary(name: string, handler: ModernHandler): ModernHandler {
  return async (ctx, next) => {
    try {
      return await handler(ctx, next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      MonitoringService.record({
        type: "TICKET_HANDLER_FAILED",
        section: name,
        description: message,
        telegramId: ctx.from?.id ? String(ctx.from.id) : undefined,
        userId: ctx.state.userId,
        severity: "critical",
        suggestedAction: "لاگ هندلر تلگرام و وضعیت سرویس‌های وابسته را بررسی کنید.",
      });
      throw error;
    }
  };
}
