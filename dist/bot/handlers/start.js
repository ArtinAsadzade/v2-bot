"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("../bot");
const user_service_1 = require("../../modules/user/user.service");
const messages_1 = require("../../utils/messages");
bot_1.bot.start(async (ctx) => {
    const user = await user_service_1.UserService.findOrCreateUser(ctx);
    await ctx.reply(messages_1.MESSAGES.WELCOME, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "💰 کیف پول", callback_data: "wallet" }],
                [{ text: "🛒 خرید سرویس", callback_data: "shop" }],
                [{ text: "🎧 پشتیبانی", callback_data: "support" }],
            ],
        },
    });
});
