"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("../../bot");
const prisma_1 = require("../../../services/prisma");
bot_1.bot.on("text", async (ctx, next) => {
    const user = await prisma_1.prisma.user.findUnique({
        where: {
            telegramId: String(ctx.from.id),
        },
    });
    if (!user) {
        return next();
    }
    const ticket = await prisma_1.prisma.ticket.findFirst({
        where: {
            userId: user.id,
            status: "open",
        },
    });
    if (!ticket) {
        return next();
    }
    await prisma_1.prisma.ticketMessage.create({
        data: {
            ticketId: ticket.id,
            senderId: user.id,
            message: ctx.message.text,
        },
    });
    await ctx.reply("📩 پیام شما برای پشتیبانی ارسال شد");
});
