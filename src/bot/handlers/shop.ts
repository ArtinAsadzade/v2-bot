import { Markup } from "telegraf";
import type { AppBot } from "../../types/bot";
import { ProductService } from "../../modules/product/product.service";
import { PurchaseService } from "../../modules/product/purchase.service";
import { UserService } from "../../modules/user/user.service";
import { navigationKeyboard } from "../keyboards/main.keyboard";

export function registerShopHandlers(bot: AppBot) {
  bot.action("shop", async (ctx) => {
    await ctx.answerCbQuery();
    const categories = await ProductService.getCategories();
    const buttons = categories
      .filter((category) => category.products.length > 0)
      .map((category) => [Markup.button.callback(`📁 ${category.name}`, `cat:${category.id}`)]);

    if (buttons.length === 0) {
      await ctx.reply("در حال حاضر محصول فعالی وجود ندارد.", navigationKeyboard());
      return;
    }

    buttons.push([Markup.button.callback("🏠 خانه", "home")]);
    await ctx.reply("🛍 دسته‌بندی مورد نظر را انتخاب کنید:", Markup.inlineKeyboard(buttons));
  });

  bot.action(/^cat:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const categoryId = ctx.match[1];
    const products = await ProductService.getProductsByCategory(categoryId);
    const buttons = await Promise.all(
      products.map(async (product) => {
        const stock = await ProductService.availableStock(product.id);
        return [Markup.button.callback(`🛒 ${product.title} - ${product.price.toLocaleString("fa-IR")} تومان (${stock} عدد)`, `product:${product.id}`)];
      }),
    );
    buttons.push([Markup.button.callback("⬅️ بازگشت", "shop"), Markup.button.callback("🏠 خانه", "home")]);
    await ctx.reply("محصول را انتخاب کنید:", Markup.inlineKeyboard(buttons));
  });

  bot.action(/^product:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const productId = ctx.match[1];
    const product = await ProductService.getProduct(productId);
    if (!product) {
      await ctx.reply("محصول پیدا نشد.", navigationKeyboard("shop"));
      return;
    }

    const stock = await ProductService.availableStock(product.id);
    await ctx.reply(
      `📦 ${product.title}\n📁 دسته: ${product.category.name}\n💵 قیمت: ${product.price.toLocaleString("fa-IR")} تومان\n⏳ مدت: ${product.duration} روز\n📊 موجودی: ${stock}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("🎟 وارد کردن کد تخفیف", `coupon:${product.id}`)],
        [Markup.button.callback("✅ پرداخت با موجودی", `buy:${product.id}`)],
        [Markup.button.callback("⬅️ بازگشت", `cat:${product.categoryId}`), Markup.button.callback("🏠 خانه", "home")],
      ]),
    );
  });

  bot.action(/^coupon:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.state = { name: "coupon_code", productId: ctx.match[1] };
    await ctx.reply("🎟 کد تخفیف را ارسال کنید:", navigationKeyboard(`product:${ctx.match[1]}`));
  });

  bot.action(/^buy:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const productId = ctx.match[1];
    const user = await UserService.findOrCreateUser(ctx);
    const couponCode = ctx.session.selectedCoupons?.[productId];

    try {
      const result = await PurchaseService.buyProduct(user.id, productId, couponCode);
      if (ctx.session.selectedCoupons) delete ctx.session.selectedCoupons[productId];
      await ctx.reply(
        `✅ خرید موفق

🧾 سفارش: ${result.order.id}
📦 محصول: ${result.product.title}
💵 مبلغ اصلی: ${result.originalAmount.toLocaleString("fa-IR")} تومان
🎟 تخفیف: ${result.discountAmount.toLocaleString("fa-IR")} تومان
💳 مبلغ پرداختی: ${result.totalAmount.toLocaleString("fa-IR")} تومان

🔐 نام کاربری:
${result.account.username}

🔗 لینک ساب:
${result.account.subscriptionLink}

⚙️ لینک کانفیگ:
${result.account.configLink}

📅 تاریخ انقضا: ${result.expiresAt.toLocaleDateString("fa-IR")}`,
        navigationKeyboard(),
      );
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : "خرید ناموفق بود"}`, navigationKeyboard(`product:${productId}`));
    }
  });
}
