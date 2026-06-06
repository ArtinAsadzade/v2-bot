"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAdminFlow = handleAdminFlow;
const coupon_service_1 = require("../../../modules/coupon/coupon.service");
const product_service_1 = require("../../../modules/product/product.service");
const admin_service_1 = require("../../../modules/admin/admin.service");
const admin_flow_1 = require("./admin.flow");
const main_keyboard_1 = require("../../keyboards/main.keyboard");
function asPositiveInteger(value) {
    const number = Number(value.replace(/[,،]/g, ""));
    return Number.isInteger(number) && number > 0 ? number : undefined;
}
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
            await ctx.reply("💰 قیمت محصول را به تومان ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return true;
        }
        if (flow.step === "price") {
            const price = asPositiveInteger(text);
            if (!price) {
                await ctx.reply("❌ قیمت معتبر نیست. فقط عدد مثبت ارسال کنید.", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
                return true;
            }
            flow.data.price = price;
            flow.step = "duration";
            await ctx.reply("⏳ مدت سرویس را به روز ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return true;
        }
        if (flow.step === "duration") {
            const duration = asPositiveInteger(text);
            if (!duration) {
                await ctx.reply("❌ مدت معتبر نیست. فقط عدد مثبت ارسال کنید.", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
                return true;
            }
            flow.data.duration = duration;
            flow.step = "category";
            await ctx.reply("📂 نام دسته‌بندی را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return true;
        }
        if (flow.step === "category") {
            const product = await product_service_1.ProductService.create({ categoryName: text, title: String(flow.data.title), price: Number(flow.data.price), duration: Number(flow.data.duration) });
            await admin_service_1.AdminService.audit(String(ctx.from?.id ?? "system"), "product.create", { productId: product.id });
            (0, admin_flow_1.resetFlow)(ctx);
            await ctx.reply(`✅ محصول ${product.title} ساخته شد.`, (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return true;
        }
    }
    if (flow.flow === "coupon_create") {
        if (flow.step === "code") {
            flow.data.code = text;
            flow.step = "discount";
            await ctx.reply("📉 درصد تخفیف را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return true;
        }
        if (flow.step === "discount") {
            const discountPercent = asPositiveInteger(text);
            if (!discountPercent || discountPercent > 100) {
                await ctx.reply("❌ درصد تخفیف باید عددی بین ۱ تا ۱۰۰ باشد.", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
                return true;
            }
            flow.data.discountPercent = discountPercent;
            flow.step = "maxUses";
            await ctx.reply("🔁 تعداد استفاده مجاز را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return true;
        }
        if (flow.step === "maxUses") {
            const maxUses = asPositiveInteger(text);
            if (!maxUses) {
                await ctx.reply("❌ تعداد استفاده معتبر نیست.", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
                return true;
            }
            flow.data.maxUses = maxUses;
            flow.step = "days";
            await ctx.reply("📆 تعداد روزهای اعتبار را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return true;
        }
        if (flow.step === "days") {
            const days = asPositiveInteger(text);
            if (!days) {
                await ctx.reply("❌ تعداد روز معتبر نیست.", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
                return true;
            }
            const coupon = await coupon_service_1.CouponService.create(String(flow.data.code), Number(flow.data.discountPercent), new Date(Date.now() + days * 86400000), Number(flow.data.maxUses));
            await admin_service_1.AdminService.audit(String(ctx.from?.id ?? "system"), "coupon.create", { couponId: coupon.id, code: coupon.code });
            (0, admin_flow_1.resetFlow)(ctx);
            await ctx.reply(`✅ کوپن ${coupon.code} ساخته شد.`, (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return true;
        }
    }
    if (flow.flow === "account_create") {
        if (flow.step === "username") {
            flow.data.username = text;
            flow.step = "password";
            await ctx.reply("🔑 رمز عبور اکانت را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return true;
        }
        if (flow.step === "password") {
            flow.data.password = text;
            flow.step = "config";
            await ctx.reply("⚙️ متن کانفیگ را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return true;
        }
        if (flow.step === "config") {
            const account = await product_service_1.ProductService.addAccount(String(flow.data.productId), { username: String(flow.data.username), password: String(flow.data.password), config: text });
            await admin_service_1.AdminService.audit(String(ctx.from?.id ?? "system"), "product_account.create", { accountId: account.id, productId: flow.data.productId });
            (0, admin_flow_1.resetFlow)(ctx);
            await ctx.reply(`✅ اکانت ${account.username} اضافه شد.`, (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return true;
        }
    }
    return false;
}
