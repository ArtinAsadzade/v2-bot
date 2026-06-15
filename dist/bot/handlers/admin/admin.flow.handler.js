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
function parseKeyValueLines(text) {
    return Object.fromEntries(text
        .split(/\n+/)
        .map((line) => line.split(/[:=：]/, 2).map((part) => part.trim()))
        .filter((parts) => parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1])));
}
function optionalPositiveInteger(value) {
    if (!value)
        return undefined;
    return asPositiveInteger(value);
}
function parseActive(value) {
    if (!value)
        return undefined;
    return ["1", "true", "active", "فعال", "بله"].includes(value.toLowerCase()) ? true : ["0", "false", "inactive", "غیرفعال", "خیر"].includes(value.toLowerCase()) ? false : undefined;
}
function parseAccountStatus(value) {
    if (!value)
        return undefined;
    const normalized = value.toLowerCase();
    return ["available", "reserved", "sold", "disabled", "expired"].includes(normalized) ? normalized : undefined;
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
            const product = await product_service_1.ProductService.create({ mode: "manual_inventory", categoryName: text, title: String(flow.data.title), price: Number(flow.data.price), duration: Number(flow.data.duration) });
            await admin_service_1.AdminService.audit(String(ctx.from?.id ?? "system"), "product.create", { productId: product.id });
            (0, admin_flow_1.resetFlow)(ctx);
            await ctx.reply(`✅ محصول ${product.title} ساخته شد.`, (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return true;
        }
    }
    if (flow.flow === "category_create" || flow.flow === "category_edit") {
        const data = parseKeyValueLines(text);
        const name = data.title ?? data.name ?? data["عنوان"] ?? (flow.flow === "category_create" ? text : undefined);
        const category = await admin_service_1.AdminService.saveCategory({
            name: name ?? "",
            description: data.description ?? data["توضیحات"],
            icon: data.icon ?? data.emoji ?? data["آیکون"],
            displayOrder: optionalPositiveInteger(data.order ?? data.sort ?? data["ترتیب"]),
            isActive: parseActive(data.active ?? data.status ?? data["وضعیت"]),
        }, String(ctx.from?.id ?? "system"), flow.flow === "category_edit" ? String(flow.data.categoryId) : undefined);
        (0, admin_flow_1.resetFlow)(ctx);
        await ctx.reply(`✅ دسته‌بندی ${category.name} ذخیره شد.`, (0, main_keyboard_1.navigationKeyboard)(`admin:category:${category.id}`));
        return true;
    }
    if (flow.flow === "product_edit") {
        const data = parseKeyValueLines(text);
        const price = optionalPositiveInteger(data.price ?? data["قیمت"]);
        const duration = optionalPositiveInteger(data.duration ?? data["مدت"]);
        const updated = await admin_service_1.AdminService.updateProduct(String(flow.data.productId), {
            title: data.title ?? data.name ?? data["عنوان"],
            categoryId: data.categoryId ?? data["دسته"],
            price,
            duration,
            isActive: parseActive(data.active ?? data.status ?? data["وضعیت"]),
        }, String(ctx.from?.id ?? "system"));
        (0, admin_flow_1.resetFlow)(ctx);
        await ctx.reply(`✅ محصول ${updated.title} ذخیره شد.`, (0, main_keyboard_1.navigationKeyboard)(`admin:product:${updated.id}`));
        return true;
    }
    if (flow.flow === "account_edit") {
        const data = parseKeyValueLines(text);
        const updated = await admin_service_1.AdminService.updateAccount(String(flow.data.accountId), {
            username: data.username ?? data["نام کاربری"],
            subscriptionLink: data.subscriptionLink ?? data.sub ?? data["ساب"],
            configLink: data.configLink ?? data.config ?? data["کانفیگ"],
            productId: data.productId ?? data.product ?? data["محصول"],
            status: parseAccountStatus(data.status ?? data["وضعیت"]),
        }, String(ctx.from?.id ?? "system"));
        (0, admin_flow_1.resetFlow)(ctx);
        await ctx.reply(`✅ اکانت ${updated.username} ذخیره شد.`, (0, main_keyboard_1.navigationKeyboard)(`admin:account:${updated.id}`));
        return true;
    }
    if (flow.flow === "wallet_create" || flow.flow === "wallet_edit") {
        const data = parseKeyValueLines(text);
        const active = parseActive(data.active ?? data.status ?? data["وضعیت"]);
        const walletData = {
            coinName: data.coinName ?? data.coin ?? data["نام ارز"],
            coinSymbol: data.coinSymbol ?? data.symbol ?? data["نماد"],
            networkName: data.networkName ?? data.network ?? data["شبکه"],
            displayName: data.displayName ?? data.display ?? data["نام نمایشی"],
            walletAddress: data.walletAddress ?? data.address ?? data["آدرس"],
            displayOrder: optionalPositiveInteger(data.order ?? data.sort ?? data["ترتیب"]),
            status: active === undefined ? undefined : active ? "active" : "inactive",
        };
        const wallet = await admin_service_1.AdminService.saveCryptoWallet(flow.flow === "wallet_create" ? { ...walletData, coinName: walletData.coinName ?? "", networkName: walletData.networkName ?? "", walletAddress: walletData.walletAddress ?? "" } : walletData, String(ctx.from?.id ?? "system"), flow.flow === "wallet_edit" ? String(flow.data.walletId) : undefined);
        (0, admin_flow_1.resetFlow)(ctx);
        await ctx.reply(`✅ کیف پول ${wallet.coinName}/${wallet.networkName} ذخیره شد.`, (0, main_keyboard_1.navigationKeyboard)(`admin:wallet:${wallet.id}`));
        return true;
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
            flow.step = "subscriptionLink";
            await ctx.reply("🔗 لینک ساب اکانت را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return true;
        }
        if (flow.step === "subscriptionLink") {
            flow.data.subscriptionLink = text;
            flow.step = "configLink";
            await ctx.reply("⚙️ لینک کانفیگ را ارسال کنید:", (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return true;
        }
        if (flow.step === "configLink") {
            const account = await product_service_1.ProductService.addAccount(String(flow.data.productId), { username: String(flow.data.username), subscriptionLink: String(flow.data.subscriptionLink), configLink: text });
            await admin_service_1.AdminService.audit(String(ctx.from?.id ?? "system"), "product_account.create", { accountId: account.id, productId: flow.data.productId });
            (0, admin_flow_1.resetFlow)(ctx);
            await ctx.reply(`✅ اکانت ${account.username} اضافه شد.`, (0, main_keyboard_1.navigationKeyboard)("admin:dashboard"));
            return true;
        }
    }
    return false;
}
