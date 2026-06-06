"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("../bot");
const purchase_service_1 = require("../../modules/product/purchase.service");
const prisma_1 = require("../../services/prisma");
bot_1.bot.action(/buy_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    const telegramId = String(ctx.from?.id);
    const user = await prisma_1.prisma.user.findUnique({
        where: { telegramId },
    });
    try {
        const item = await purchase_service_1.PurchaseService.buyProduct(user.id, productId);
        await ctx.reply(`
✅ خرید موفق

🔐 کانفیگ شما:
${item.configLink}

⏳ فعال شد
    `);
    }
    catch (err) {
        await ctx.reply(`❌ ${err.message}`);
    }
});
