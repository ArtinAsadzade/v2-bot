"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("../../bot");
const prisma_1 = require("../../../services/prisma");
bot_1.bot.on("text", async (ctx, next) => {
    const code = ctx.message.text.trim().toUpperCase();
    const coupon = await prisma_1.prisma.coupon.findFirst({
        where: {
            code,
        },
    });
    if (!coupon) {
        return next();
    }
    if (coupon.usedCount >= coupon.maxUses) {
        await ctx.reply("❌ ظرفیت استفاده از این کد به پایان رسیده است");
        return;
    }
    if (coupon.expiresAt < new Date()) {
        await ctx.reply("❌ این کد تخفیف منقضی شده است");
        return;
    }
    await prisma_1.prisma.coupon.update({
        where: {
            id: coupon.id,
        },
        data: {
            usedCount: {
                increment: 1,
            },
        },
    });
    await ctx.reply(`🎟 کد تخفیف اعمال شد\n\nمقدار تخفیف: ${coupon.discount}%`);
});
