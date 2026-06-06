"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("../../bot");
const prisma_1 = require("../../../services/prisma");
bot_1.bot.action("support", async (ctx) => {
    await ctx.answerCbQuery();
    const user = await prisma_1.prisma.user.findUnique({
        where: { telegramId: String(ctx.from?.id) },
    });
    const ticket = await prisma_1.prisma.ticket.create({
        data: {
            userId: user.id,
            status: "open",
        },
    });
    await ctx.reply("🎧 تیکت پشتیبانی ایجاد شد. پیام خود را ارسال کنید.");
});
