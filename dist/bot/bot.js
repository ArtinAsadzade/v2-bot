"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bot = void 0;
const telegraf_1 = require("telegraf");
const logger_1 = require("../services/logger");
const user_service_1 = require("../modules/user/user.service");
const admin_flow_handler_1 = require("./handlers/admin/admin.flow.handler");
const notification_service_1 = require("../services/notification.service");
const support_service_1 = require("../modules/support/support.service");
if (!process.env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is missing");
}
exports.bot = new telegraf_1.Telegraf(process.env.BOT_TOKEN);
notification_service_1.notificationService.setBot(exports.bot);
(0, notification_service_1.registerNotificationEvents)();
// ---------------- SESSION ----------------
exports.bot.use((0, telegraf_1.session)({
    defaultSession: () => ({ selectedCoupons: {} }),
}));
// ---------------- USER INIT ----------------
exports.bot.use(async (ctx, next) => {
    if (ctx.from) {
        await user_service_1.UserService.findOrCreateUser(ctx);
    }
    await next();
});
// ---------------- ADMIN LIVE CHAT ----------------
exports.bot.on("text", async (ctx, next) => {
    if (!ctx.session.liveTicketId || !ctx.from || !(ctx.message && "text" in ctx.message))
        return next();
    await support_service_1.SupportService.addAdminReply(ctx.session.liveTicketId, String(ctx.from.id), ctx.message.text.trim());
    await ctx.reply("✅ پیام در چت تیکت ارسال شد.");
});
// ---------------- ADMIN FLOW ----------------
exports.bot.on("text", async (ctx, next) => {
    const handled = await (0, admin_flow_handler_1.handleAdminFlow)(ctx);
    if (handled)
        return;
    return next();
});
// ---------------- ERROR HANDLER ----------------
exports.bot.catch((error, ctx) => {
    logger_1.logger.error("Unhandled bot error", {
        updateId: ctx.update.update_id,
        error: error instanceof Error ? error.message : String(error),
    });
});
