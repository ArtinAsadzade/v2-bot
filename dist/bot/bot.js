"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bot = void 0;
const telegraf_1 = require("telegraf");
const logger_1 = require("../services/logger");
const user_service_1 = require("../modules/user/user.service");
const admin_flow_handler_1 = require("./handlers/admin/admin.flow.handler");
const notification_service_1 = require("../services/notification.service");
if (!process.env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is missing");
}
exports.bot = new telegraf_1.Telegraf(process.env.BOT_TOKEN);
notification_service_1.notificationService.setBot(exports.bot);
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
// ---------------- ADMIN FLOW (🔥 ADD THIS HERE) ----------------
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
