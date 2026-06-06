"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWalletHandlers = registerWalletHandlers;
const user_service_1 = require("../../modules/user/user.service");
const main_keyboard_1 = require("../keyboards/main.keyboard");
function registerWalletHandlers(bot) {
    bot.action("wallet", async (ctx) => {
        await ctx.answerCbQuery();
        const user = await user_service_1.UserService.findOrCreateUser(ctx);
        await ctx.reply(`💰 کیف پول شما:\n\nموجودی: ${user.balance.toLocaleString("fa-IR")} تومان`, (0, main_keyboard_1.navigationKeyboard)());
    });
}
