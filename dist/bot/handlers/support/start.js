"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSupportHandlers = registerSupportHandlers;
const support_service_1 = require("../../../modules/support/support.service");
const user_service_1 = require("../../../modules/user/user.service");
const text_state_1 = require("../text-state");
const main_keyboard_1 = require("../../keyboards/main.keyboard");
function registerSupportHandlers(bot) {
    bot.action("support", async (ctx) => {
        await ctx.answerCbQuery();
        const user = await user_service_1.UserService.findOrCreateUser(ctx);
        const ticket = await support_service_1.SupportService.createTicket(user.id);
        ctx.session.state = { name: "support_message", ticketId: ticket.id };
        await ctx.reply(`🎧 تیکت پشتیبانی ایجاد شد.\nشناسه تیکت: ${ticket.id}\n\nپیام خود را ارسال کنید:`, (0, main_keyboard_1.navigationKeyboard)());
    });
    bot.on("text", text_state_1.handleStateText);
}
