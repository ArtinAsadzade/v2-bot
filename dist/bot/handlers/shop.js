"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerShopHandlers = registerShopHandlers;
const telegraf_1 = require("telegraf");
const product_service_1 = require("../../modules/product/product.service");
const purchase_service_1 = require("../../modules/product/purchase.service");
const user_service_1 = require("../../modules/user/user.service");
const main_keyboard_1 = require("../keyboards/main.keyboard");
function registerShopHandlers(bot) {
    bot.action("shop", async (ctx) => {
        await ctx.answerCbQuery();
        const categories = await product_service_1.ProductService.getCategories();
        const buttons = categories
            .filter((category) => category.products.length > 0)
            .map((category) => [telegraf_1.Markup.button.callback(`📁 ${category.name}`, `cat:${category.id}`)]);
        if (buttons.length === 0) {
            await ctx.reply("در حال حاضر محصول فعالی وجود ندارد.", (0, main_keyboard_1.navigationKeyboard)());
            return;
        }
        buttons.push([telegraf_1.Markup.button.callback("🏠 خانه", "home")]);
        await ctx.reply("🛍 دسته‌بندی مورد نظر را انتخاب کنید:", telegraf_1.Markup.inlineKeyboard(buttons));
    });
    bot.action(/^cat:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const categoryId = ctx.match[1];
        const products = await product_service_1.ProductService.getProductsByCategory(categoryId);
        const buttons = await Promise.all(products.map(async (product) => {
            const stock = await product_service_1.ProductService.availableStock(product.id);
            return [telegraf_1.Markup.button.callback(`🛒 ${product.title} - ${product.price.toLocaleString("fa-IR")} تومان (${stock} عدد)`, `product:${product.id}`)];
        }));
        buttons.push([telegraf_1.Markup.button.callback("⬅️ بازگشت", "shop"), telegraf_1.Markup.button.callback("🏠 خانه", "home")]);
        await ctx.reply("محصول را انتخاب کنید:", telegraf_1.Markup.inlineKeyboard(buttons));
    });
    bot.action(/^product:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const productId = ctx.match[1];
        const product = await product_service_1.ProductService.getProduct(productId);
        if (!product) {
            await ctx.reply("محصول پیدا نشد.", (0, main_keyboard_1.navigationKeyboard)("shop"));
            return;
        }
        const stock = await product_service_1.ProductService.availableStock(product.id);
        await ctx.reply(`📦 ${product.title}\n📁 دسته: ${product.category.name}\n💵 قیمت: ${product.price.toLocaleString("fa-IR")} تومان\n⏳ مدت: ${product.duration} روز\n📊 موجودی: ${stock}`, telegraf_1.Markup.inlineKeyboard([
            [telegraf_1.Markup.button.callback("🎟 وارد کردن کد تخفیف", `coupon:${product.id}`)],
            [telegraf_1.Markup.button.callback("✅ پرداخت با موجودی", `buy:${product.id}`)],
            [telegraf_1.Markup.button.callback("⬅️ بازگشت", `cat:${product.categoryId}`), telegraf_1.Markup.button.callback("🏠 خانه", "home")],
        ]));
    });
    bot.action(/^coupon:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        ctx.session.state = { name: "coupon_code", productId: ctx.match[1] };
        await ctx.reply("🎟 کد تخفیف را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)(`product:${ctx.match[1]}`));
    });
    bot.action(/^buy:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const productId = ctx.match[1];
        const user = await user_service_1.UserService.findOrCreateUser(ctx);
        const couponCode = ctx.session.selectedCoupons?.[productId];
        try {
            const result = await purchase_service_1.PurchaseService.buyProduct(user.id, productId, couponCode);
            if (ctx.session.selectedCoupons)
                delete ctx.session.selectedCoupons[productId];
            await ctx.reply(`✅ خرید موفق\n\n🧾 سفارش: ${result.order.id}\n📦 محصول: ${result.product.title}\n💵 مبلغ پرداختی: ${result.totalAmount.toLocaleString("fa-IR")} تومان\n\n🔐 نام کاربری:\n${result.account.username}\n\n🔑 رمز عبور:\n${result.account.password}\n\n⚙️ کانفیگ:\n${result.account.config}`, (0, main_keyboard_1.navigationKeyboard)());
        }
        catch (error) {
            await ctx.reply(`❌ ${error instanceof Error ? error.message : "خرید ناموفق بود"}`, (0, main_keyboard_1.navigationKeyboard)(`product:${productId}`));
        }
    });
}
