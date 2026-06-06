"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("../../bot");
const CRYPTO_WALLETS = {
    USDT: "TRC20-WALLET-ADDRESS",
    BTC: "BTC-WALLET-ADDRESS",
};
bot_1.bot.action("deposit", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply("💰 مبلغ شارژ (تومان) را وارد کنید:");
    bot_1.bot.on("text", async (msgCtx) => {
        const amount = Number(msgCtx.message.text);
        if (isNaN(amount))
            return;
        await msgCtx.reply("💱 انتخاب ارز:", {
            reply_markup: {
                inline_keyboard: [[{ text: "USDT (TRC20)", callback_data: `dep_usdt_${amount}` }], [{ text: "BTC", callback_data: `dep_btc_${amount}` }]],
            },
        });
    });
});
