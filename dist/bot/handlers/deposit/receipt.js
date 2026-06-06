"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("../../bot");
const prisma_1 = require("../../../services/prisma");
bot_1.bot.on("photo", async (ctx) => {
    const user = await prisma_1.prisma.user.findUnique({
        where: {
            telegramId: String(ctx.from.id),
        },
    });
    if (!user) {
        return ctx.reply("❌ کاربر یافت نشد");
    }
    const deposit = await prisma_1.prisma.deposit.findFirst({
        where: {
            userId: user.id,
            status: "pending",
        },
        orderBy: {
            createdAt: "desc",
        },
    });
    if (!deposit) {
        return ctx.reply("❌ درخواست شارژ فعالی پیدا نشد");
    }
    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;
    await prisma_1.prisma.deposit.update({
        where: {
            id: deposit.id,
        },
        data: {
            receipt: fileId,
            status: "submitted",
        },
    });
    await ctx.reply("⏳ رسید شما ثبت شد و در انتظار تایید ادمین است.");
});
