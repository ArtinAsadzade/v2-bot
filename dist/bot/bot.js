"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bot = void 0;
const telegraf_1 = require("telegraf");
const logger_1 = require("../services/logger");
const user_service_1 = require("../modules/user/user.service");
const notification_service_1 = require("../services/notification.service");
const access_control_middleware_1 = require("./middlewares/access-control.middleware");
const forced_join_middleware_1 = require("./middlewares/forced-join.middleware");
if (!process.env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is missing");
}
exports.bot = new telegraf_1.Telegraf(process.env.BOT_TOKEN);
notification_service_1.notificationService.setBot(exports.bot);
(0, notification_service_1.registerNotificationEvents)();
exports.bot.use((0, telegraf_1.session)({
    defaultSession: () => ({ selectedCoupons: {}, navigation: { stack: [] } }),
}));
exports.bot.use(async (ctx, next) => {
    if (ctx.from)
        await user_service_1.UserService.findOrCreateUser(ctx);
    await next();
});
exports.bot.use((0, access_control_middleware_1.accessControlMiddleware)());
exports.bot.use((0, forced_join_middleware_1.forcedJoinMiddleware)());
exports.bot.catch((error, ctx) => {
    logger_1.logger.error("Unhandled bot error", {
        updateId: ctx.update.update_id,
        error: error instanceof Error ? error.message : String(error),
    });
});
