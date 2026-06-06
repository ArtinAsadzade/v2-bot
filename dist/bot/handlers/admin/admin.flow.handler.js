"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAdminFlow = handleAdminFlow;
const coupon_service_1 = require("../../../modules/coupon/coupon.service");
const product_service_1 = require("../../../modules/product/product.service");
const admin_flow_1 = require("./admin.flow");
async function handleAdminFlow(ctx) {
    const flow = (0, admin_flow_1.getFlow)(ctx);
    if (!flow)
        return false;
    const text = ctx.message && "text" in ctx.message ? ctx.message.text.trim() : undefined;
    if (!text)
        return false;
    if (flow.flow === "product_create") {
        if (flow.step === "title") {
            flow.data.title = text;
            flow.step = "price";
            await ctx.reply("💰 قیمت را ارسال کنید:");
            return true;
        }
        if (flow.step === "price") {
            const price = Number(text);
            if (!Number.isInteger(price) || price <= 0) {
                await ctx.reply("❌ قیمت معتبر نیست.");
                return true;
            }
            flow.data.price = price;
            flow.step = "category";
            await ctx.reply("📂 نام دسته‌بندی را ارسال کنید:");
            return true;
        }
        if (flow.step === "category") {
            const product = await product_service_1.ProductService.create({ categoryName: text, title: String(flow.data.title), price: Number(flow.data.price), duration: Number(flow.data.duration ?? 30) });
            (0, admin_flow_1.resetFlow)(ctx);
            await ctx.reply(`✅ محصول ${product.title} ساخته شد.`);
            return true;
        }
    }
    if (flow.flow === "coupon_create") {
        if (flow.step === "code") {
            flow.data.code = text;
            flow.step = "discount";
            await ctx.reply("📉 درصد تخفیف را ارسال کنید:");
            return true;
        }
        if (flow.step === "discount") {
            flow.data.discountPercent = Number(text);
            flow.step = "maxUses";
            await ctx.reply("🔁 تعداد استفاده مجاز را ارسال کنید:");
            return true;
        }
        if (flow.step === "maxUses") {
            flow.data.maxUses = Number(text);
            flow.step = "days";
            await ctx.reply("📆 تعداد روزهای اعتبار را ارسال کنید:");
            return true;
        }
        if (flow.step === "days") {
            const days = Number(text);
            const coupon = await coupon_service_1.CouponService.create(String(flow.data.code), Number(flow.data.discountPercent), new Date(Date.now() + days * 86400000), Number(flow.data.maxUses));
            (0, admin_flow_1.resetFlow)(ctx);
            await ctx.reply(`✅ کوپن ${coupon.code} ساخته شد.`);
            return true;
        }
    }
    if (flow.flow === "account_create") {
        const [username, password, config] = text.split("|").map((part) => part.trim());
        if (!username || !password || !config) {
            await ctx.reply("فرمت اکانت معتبر نیست. نمونه: نام‌کاربری|رمزعبور|کانفیگ");
            return true;
        }
        await product_service_1.ProductService.addAccount(String(flow.data.productId), { username, password, config });
        (0, admin_flow_1.resetFlow)(ctx);
        await ctx.reply("✅ اکانت اضافه شد.");
        return true;
    }
    return false;
}
