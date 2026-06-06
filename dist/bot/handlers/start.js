"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showHome = showHome;
exports.registerStartHandlers = registerStartHandlers;
const user_service_1 = require("../../modules/user/user.service");
const referral_service_1 = require("../../modules/referral/referral.service");
const messages_1 = require("../../utils/messages");
const main_keyboard_1 = require("../keyboards/main.keyboard");
const admin_middleware_1 = require("../middlewares/admin.middleware");
async function showHome(ctx) {
    if (!ctx.from)
        return;
    const isAdmin = await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id);
    await ctx.reply(messages_1.MESSAGES.HOME, (0, main_keyboard_1.homeKeyboard)(isAdmin));
}
function registerStartHandlers(bot) {
    bot.start(async (ctx) => {
        if (!ctx.from)
            return;
        const user = await user_service_1.UserService.findOrCreateUser(ctx);
        const payload = ctx.startPayload;
        if (payload)
            await referral_service_1.ReferralService.linkReferral(user.id, payload);
        await ctx.reply(messages_1.MESSAGES.WELCOME, (0, main_keyboard_1.homeKeyboard)(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)));
    });
    bot.action("home", async (ctx) => {
        ctx.session.state = undefined;
        ctx.session.adminFlow = undefined;
        ctx.session.liveTicketId = undefined;
        await ctx.answerCbQuery();
        await showHome(ctx);
    });
    bot.action("cancel", async (ctx) => {
        ctx.session.state = undefined;
        ctx.session.adminFlow = undefined;
        ctx.session.liveTicketId = undefined;
        await ctx.answerCbQuery("لغو شد");
        await ctx.reply(messages_1.MESSAGES.CANCELLED, (0, main_keyboard_1.homeKeyboard)(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)));
    });
}
