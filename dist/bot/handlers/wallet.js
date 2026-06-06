"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("../bot");
const prisma_1 = require("../../services/prisma");
bot_1.bot.action("wallet", async (ctx) => {
    const user = await prisma_1.prisma.user.findUnique({
        where: { telegramId: String(ctx.from?.id) },
    });
    await ctx.answerCbQuery();
    await ctx.reply(`💰 کیف پول شما:
    
موجودی: ${user?.balance || 0} تومان`);
});
