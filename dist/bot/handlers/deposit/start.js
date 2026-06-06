"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pendingDeposits = void 0;
const bot_1 = require("../../bot");
const pendingDeposits = new Map();
exports.pendingDeposits = pendingDeposits;
bot_1.bot.action("deposit", async (ctx) => {
    await ctx.answerCbQuery();
    pendingDeposits.set(ctx.from.id, true);
    await ctx.reply("💰 مقدار شارژ (تومان) را وارد کنید:");
});
bot_1.bot.on("text", async (ctx, next) => {
    if (!pendingDeposits.has(ctx.from.id)) {
        return next();
    }
    const amount = Number(ctx.message.text);
    if (isNaN(amount) || amount <= 0) {
        await ctx.reply("❌ مبلغ معتبر وارد کنید");
        return;
    }
    pendingDeposits.delete(ctx.from.id);
    await ctx.reply("💱 انتخاب ارز:", {
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "USDT (TRC20)",
                        callback_data: `dep_usdt_${amount}`,
                    },
                ],
                [
                    {
                        text: "BTC",
                        callback_data: `dep_btc_${amount}`,
                    },
                ],
            ],
        },
    });
});
