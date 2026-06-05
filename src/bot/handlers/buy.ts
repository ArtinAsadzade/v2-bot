import { bot } from "../bot";
import { PurchaseService } from "../../modules/product/purchase.service";
import { prisma } from "../../services/prisma";

bot.action(/buy_(.+)/, async (ctx) => {
  const productId = ctx.match[1];
  const telegramId = String(ctx.from?.id);

  const user = await prisma.user.findUnique({
    where: { telegramId },
  });

  try {
    const item = await PurchaseService.buyProduct(user!.id, productId);

    await ctx.reply(`
✅ خرید موفق

🔐 کانفیگ شما:
${item.configLink}

⏳ فعال شد
    `);
  } catch (err: any) {
    await ctx.reply(`❌ ${err.message}`);
  }
});
