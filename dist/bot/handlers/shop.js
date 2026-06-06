"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("../bot");
const prisma_1 = require("../../services/prisma");
bot_1.bot.action("shop", async (ctx) => {
    const products = await prisma_1.prisma.product.findMany();
    const buttons = products.map((p) => [{ text: `🛒 ${p.title} - ${p.price} تومان`, callback_data: `buy_${p.id}` }]);
    await ctx.answerCbQuery();
    await ctx.reply("🛍 لیست سرویس‌ها:", {
        reply_markup: {
            inline_keyboard: buttons,
        },
    });
});
