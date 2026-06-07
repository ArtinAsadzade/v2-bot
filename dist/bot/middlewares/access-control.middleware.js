"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.accessControlMiddleware = accessControlMiddleware;
const system_service_1 = require("../../modules/system/system.service");
function callbackData(ctx) {
    const update = ctx.update;
    return update.callback_query?.data;
}
function envAdminIds() {
    return (process.env.ADMIN_IDS ?? process.env.ADMINS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
}
function isEnvAdmin(telegramId) {
    return envAdminIds().includes(telegramId);
}
function accessControlMiddleware() {
    return async (ctx, next) => {
        if (!ctx.from) {
            return next();
        }
        const telegramId = String(ctx.from.id);
        const access = await system_service_1.SystemSettingsService.userAccessByTelegramId(telegramId);
        // Ban check
        if (access.isBanned) {
            if (callbackData(ctx)) {
                await ctx.answerCbQuery("حساب شما مسدود شده است").catch(() => undefined);
            }
            await ctx.reply(system_service_1.BLOCKED_USER_MESSAGE).catch(() => undefined);
            return;
        }
        // Admin check
        const isAdmin = isEnvAdmin(telegramId) || access.role === "admin" || access.role === "superadmin";
        // Store status check (only for normal users)
        if (!isAdmin) {
            const storeStatus = await system_service_1.SystemSettingsService.getFinancialSettingsCached();
            if (storeStatus === "inactive") {
                if (callbackData(ctx)) {
                    await ctx.answerCbQuery("فروشگاه موقتاً غیرفعال است").catch(() => undefined);
                }
                await ctx.reply(system_service_1.STORE_DISABLED_MESSAGE).catch(() => undefined);
                return;
            }
        }
        return next();
    };
}
