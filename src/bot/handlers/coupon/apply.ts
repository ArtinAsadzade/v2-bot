import { bot } from "../../bot";
import { prisma } from "../../../services/prisma";

bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  const coupon = await prisma.coupon.findUnique({
    where: { code: text },
  });

  if (!coupon) return;

  if (coupon.usedCount >= coupon.maxUses) {
    return ctx.reply("❌ این کد منقضی شده است");
  }

  await prisma.coupon.update({
    where: { id: coupon.id },
    data: {
      usedCount: { increment: 1 },
    },
  });

  await ctx.reply(`🎟 کد فعال شد: ${coupon.discount}% تخفیف`);
});
