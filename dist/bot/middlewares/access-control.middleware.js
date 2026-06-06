"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.accessControlMiddleware = accessControlMiddleware;
const system_service_1 = require("../../modules/system/system.service");
const ADMIN_ACTION_PREFIXES = ["admin", "flow:start:product_", "flow:start:account_create", "flow:start:crypto_wallet", "flow:start:minimum_topup", "flow:start:wallet_adjust", "flow:start:free_account_create"];
function callbackData(ctx) {
    const update = ctx.update;
    return update.callback_query?.data;
}
function isAdminAction(ctx) {
    const data = callbackData(ctx);
    return Boolean(data && ADMIN_ACTION_PREFIXES.some((prefix) => data.startsWith(prefix)));
}
function isStart(ctx) {
    return Boolean(ctx.message && "text" in ctx.message && ctx.message.text.startsWith("/start"));
}
function accessControlMiddleware() {
    return async (ctx, next) => {
        if (!ctx.from)
            return next();
        const access = await system_service_1.SystemSettingsService.userAccessByTelegramId(String(ctx.from.id));
        if (access.isBanned) {
            if (callbackData(ctx))
                await ctx.answerCbQuery("حساب شما مسدود است").catch(() => undefined);
            await ctx.reply(system_service_1.BLOCKED_USER_MESSAGE).catch(() => undefined);
            return;
        }
        const isAdmin = access.role === "admin" || access.role === "superadmin";
        if (!isAdmin && !isStart(ctx) && !isAdminAction(ctx)) {
            const storeStatus = await system_service_1.SystemSettingsService.getFinancialSettingsCached();
            if (storeStatus === "inactive") {
                if (callbackData(ctx))
                    await ctx.answerCbQuery("فروشگاه غیرفعال است").catch(() => undefined);
                await ctx.reply(system_service_1.STORE_DISABLED_MESSAGE).catch(() => undefined);
                return;
            }
        }
        return next();
    };
}
