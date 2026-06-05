import { bot } from "../../bot";
import { prisma } from "../../../services/prisma";

bot.on("text", async (ctx, next) => {
  const code = ctx.message.text.trim().toUpperCase();

  const coupon = await prisma.coupon.findFirst({
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

  await prisma.coupon.update({
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
