import type { MiddlewareFn } from "telegraf";
import type { AppContext } from "../../types/bot";
import { BLOCKED_USER_MESSAGE, STORE_DISABLED_MESSAGE, SystemSettingsService } from "../../modules/system/system.service";

const ADMIN_ACTION_PREFIXES = ["admin", "flow:start:product_", "flow:start:account_create", "flow:start:crypto_wallet", "flow:start:minimum_topup", "flow:start:wallet_adjust", "flow:start:free_account_create"];

function callbackData(ctx: AppContext): string | undefined {
  const update = ctx.update as { callback_query?: { data?: string } };
  return update.callback_query?.data;
}

function isAdminAction(ctx: AppContext) {
  const data = callbackData(ctx);
  return Boolean(data && ADMIN_ACTION_PREFIXES.some((prefix) => data.startsWith(prefix)));
}

function isStart(ctx: AppContext) {
  return Boolean(ctx.message && "text" in ctx.message && ctx.message.text.startsWith("/start"));
}

export function accessControlMiddleware(): MiddlewareFn<AppContext> {
  return async (ctx, next) => {
    if (!ctx.from) return next();
    const access = await SystemSettingsService.userAccessByTelegramId(String(ctx.from.id));
    if (access.isBanned) {
      if (callbackData(ctx)) await ctx.answerCbQuery("حساب شما مسدود است").catch(() => undefined);
      await ctx.reply(BLOCKED_USER_MESSAGE).catch(() => undefined);
      return;
    }

    const isAdmin = access.role === "admin" || access.role === "superadmin";
    if (!isAdmin && !isStart(ctx) && !isAdminAction(ctx)) {
      const storeStatus = await SystemSettingsService.getFinancialSettingsCached();
      if (storeStatus === "inactive") {
        if (callbackData(ctx)) await ctx.answerCbQuery("فروشگاه غیرفعال است").catch(() => undefined);
        await ctx.reply(STORE_DISABLED_MESSAGE).catch(() => undefined);
        return;
      }
    }

    return next();
  };
}
