import type { MiddlewareFn } from "telegraf";
import type { AppContext } from "../../types/bot";
import { BLOCKED_USER_MESSAGE, STORE_DISABLED_MESSAGE, SystemSettingsService } from "../../modules/system/system.service";

function callbackData(ctx: AppContext): string | undefined {
  const update = ctx.update as {
    callback_query?: { data?: string };
  };

  return update.callback_query?.data;
}

function envAdminIds(): string[] {
  return (process.env.ADMIN_IDS ?? process.env.ADMINS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function isEnvAdmin(telegramId: string): boolean {
  return envAdminIds().includes(telegramId);
}

export function accessControlMiddleware(): MiddlewareFn<AppContext> {
  return async (ctx, next) => {
    if (!ctx.from) {
      return next();
    }

    const telegramId = String(ctx.from.id);

    const access = await SystemSettingsService.userAccessByTelegramId(telegramId);

    // Ban check
    if (access.isBanned) {
      if (callbackData(ctx)) {
        await ctx.answerCbQuery("حساب شما مسدود شده است").catch(() => undefined);
      }

      await ctx.reply(BLOCKED_USER_MESSAGE).catch(() => undefined);
      return;
    }

    // Admin check
    const isAdmin = isEnvAdmin(telegramId) || access.role === "admin" || access.role === "superadmin";

    // Store status check (only for normal users)
    if (!isAdmin) {
      const storeStatus = await SystemSettingsService.getFinancialSettingsCached();

      if (storeStatus === "inactive") {
        if (callbackData(ctx)) {
          await ctx.answerCbQuery("فروشگاه موقتاً غیرفعال است").catch(() => undefined);
        }

        await ctx.reply(STORE_DISABLED_MESSAGE).catch(() => undefined);
        return;
      }
    }

    return next();
  };
}
