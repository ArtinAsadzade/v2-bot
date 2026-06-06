"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startFlow = startFlow;
exports.handleActiveFlowText = handleActiveFlowText;
exports.handleActiveFlowPhoto = handleActiveFlowPhoto;
exports.registerFlowEngine = registerFlowEngine;
const panel_ui_1 = require("../navigation/panel-ui");
const user_service_1 = require("../../modules/user/user.service");
const product_service_1 = require("../../modules/product/product.service");
const coupon_service_1 = require("../../modules/coupon/coupon.service");
const deposit_service_1 = require("../../modules/deposit/deposit.service");
const support_service_1 = require("../../modules/support/support.service");
const admin_service_1 = require("../../modules/admin/admin.service");
const free_account_service_1 = require("../../modules/free-account/free-account.service");
const money = (value) => `${value.toLocaleString("fa-IR")} تومان`;
function currentReturnTo(ctx) {
    const stack = ctx.session.navigation?.stack ?? [];
    return stack[stack.length - 1] ?? { id: "home" };
}
async function flowPrompt(ctx, text) {
    await ctx.reply(text, { ...(0, panel_ui_1.panelKeyboard)([], { back: false, home: true, cancel: true }) });
}
function requireUser(ctx) {
    if (!ctx.from)
        throw new Error("کاربر پیدا نشد");
    return user_service_1.UserService.getByTelegramId(ctx.from.id).then((user) => {
        if (!user)
            throw new Error("کاربر پیدا نشد");
        return user;
    });
}
const definitions = {
    deposit_submit: {
        firstStep: "amount",
        prompt: "💳 مبلغ شارژ را به تومان وارد کنید:",
        async handleText(ctx, text) {
            const user = await requireUser(ctx);
            if (ctx.session.flow?.step === "amount") {
                const amount = Number(text.replace(/[,،\s]/g, ""));
                if (!Number.isInteger(amount) || amount <= 0)
                    return { text: "مبلغ معتبر نیست. یک عدد به تومان وارد کنید:" };
                ctx.session.flow.data.amount = amount;
                ctx.session.flow.step = "currency";
                return { text: "نوع ارز را وارد کنید: usdt یا btc", nextStep: "currency" };
            }
            if (ctx.session.flow?.step === "currency") {
                const cryptoType = text.trim().toLowerCase();
                if (cryptoType !== "usdt" && cryptoType !== "btc")
                    return { text: "ارز معتبر نیست. فقط usdt یا btc را وارد کنید:" };
                const deposit = await deposit_service_1.DepositService.createDeposit(user.id, Number(ctx.session.flow.data.amount), cryptoType);
                ctx.session.flow.step = "receipt";
                ctx.session.flow.data.depositId = deposit.id;
                return { text: `درخواست شارژ ساخته شد.\nمبلغ: ${money(deposit.amount)}\nآدرس کیف پول:\n${deposit.wallet}\n\nاکنون تصویر رسید را ارسال کنید.`, nextStep: "receipt" };
            }
            return { text: "لطفا تصویر رسید را ارسال کنید." };
        },
        async handlePhoto(ctx, fileId) {
            const user = await requireUser(ctx);
            const depositId = String(ctx.session.flow?.data.depositId ?? "");
            if (!depositId)
                return { text: "ابتدا مبلغ شارژ را وارد کنید." };
            await deposit_service_1.DepositService.submitReceipt(depositId, user.id, fileId);
            return { done: true, text: "✅ رسید شما ثبت شد و پس از بررسی، کیف پول به‌روزرسانی می‌شود.", returnTo: { id: "wallet" } };
        },
    },
    ticket_reply: {
        firstStep: "message",
        prompt: "🎧 متن پیام پشتیبانی را وارد کنید:",
        async handleText(ctx, text) {
            const user = await requireUser(ctx);
            const ticketId = ctx.session.flow?.data.ticketId ? String(ctx.session.flow.data.ticketId) : (await support_service_1.SupportService.createTicket(user.id)).id;
            await support_service_1.SupportService.addUserMessage(ticketId, user.id, text.trim());
            return { done: true, text: "✅ پیام شما ثبت شد. پاسخ پشتیبانی در همین ربات ارسال می‌شود.", returnTo: { id: "support" } };
        },
    },
    coupon_code: {
        firstStep: "code",
        prompt: "🎟 کد تخفیف را وارد کنید:",
        async handleText(ctx, text) {
            var _a;
            const user = await requireUser(ctx);
            const productId = String(ctx.session.flow?.data.productId ?? "");
            await coupon_service_1.CouponService.validateForUser(text, user.id);
            (_a = ctx.session).selectedCoupons ?? (_a.selectedCoupons = {});
            ctx.session.selectedCoupons[productId] = text.trim().toUpperCase();
            return { done: true, text: "✅ کد تخفیف روی پیش‌فاکتور اعمال شد.", returnTo: { id: "shop.checkout", params: { productId } } };
        },
    },
    product_create: {
        firstStep: "category",
        prompt: "📦 نام دسته‌بندی محصول را وارد کنید:",
        async handleText(ctx, text) {
            const flow = ctx.session.flow;
            if (flow.step === "category") {
                flow.data.categoryName = text.trim();
                flow.step = "title";
                return { text: "نام محصول را وارد کنید:", nextStep: "title" };
            }
            if (flow.step === "title") {
                flow.data.title = text.trim();
                flow.step = "price";
                return { text: "قیمت محصول را به تومان وارد کنید:", nextStep: "price" };
            }
            if (flow.step === "price") {
                const price = Number(text.replace(/[,،\s]/g, ""));
                if (!Number.isInteger(price) || price < 0)
                    return { text: "قیمت معتبر نیست. دوباره وارد کنید:" };
                flow.data.price = price;
                flow.step = "duration";
                return { text: "مدت سرویس را به روز وارد کنید:", nextStep: "duration" };
            }
            const duration = Number(text.replace(/[,،\s]/g, ""));
            if (!Number.isInteger(duration) || duration <= 0)
                return { text: "مدت معتبر نیست. دوباره وارد کنید:" };
            await product_service_1.ProductService.create({ categoryName: String(flow.data.categoryName), title: String(flow.data.title), price: Number(flow.data.price), duration });
            return { done: true, text: "✅ محصول جدید ثبت شد.", returnTo: { id: "admin.products" } };
        },
    },
    account_create: {
        firstStep: "username",
        prompt: "🔐 نام کاربری اکانت را وارد کنید:",
        async handleText(ctx, text) {
            const flow = ctx.session.flow;
            if (flow.step === "username") {
                flow.data.username = text.trim();
                flow.step = "password";
                return { text: "رمز عبور اکانت را وارد کنید:", nextStep: "password" };
            }
            if (flow.step === "password") {
                flow.data.password = text.trim();
                flow.step = "config";
                return { text: "کانفیگ یا توضیحات تحویل را وارد کنید:", nextStep: "config" };
            }
            const productId = String(flow.data.productId);
            await product_service_1.ProductService.addAccount(productId, { username: String(flow.data.username), password: String(flow.data.password), config: text.trim() });
            return { done: true, text: "✅ اکانت به موجودی محصول اضافه شد.", returnTo: { id: "admin.product", params: { productId } } };
        },
    },
    free_account_create: {
        firstStep: "username",
        prompt: "🎁 نام کاربری اکانت رایگان را وارد کنید:",
        async handleText(ctx, text) {
            const flow = ctx.session.flow;
            if (flow.step === "username") {
                flow.data.username = text.trim();
                flow.step = "password";
                return { text: "رمز عبور اکانت رایگان را وارد کنید:", nextStep: "password" };
            }
            if (flow.step === "password") {
                flow.data.password = text.trim();
                flow.step = "config";
                return { text: "کانفیگ اکانت رایگان را وارد کنید:", nextStep: "config" };
            }
            await free_account_service_1.FreeAccountService.addToPool(String(flow.data.productId), { username: String(flow.data.username), password: String(flow.data.password), config: text.trim() });
            return { done: true, text: "✅ اکانت به استخر رایگان اضافه شد.", returnTo: { id: "admin.freeAccounts" } };
        },
    },
    coupon_create: {
        firstStep: "code",
        prompt: "🎟 کد کوپن را وارد کنید:",
        async handleText(ctx, text) {
            const flow = ctx.session.flow;
            if (flow.step === "code") {
                flow.data.code = text.trim();
                flow.step = "percent";
                return { text: "درصد تخفیف را وارد کنید:", nextStep: "percent" };
            }
            if (flow.step === "percent") {
                const percent = Number(text);
                if (!Number.isInteger(percent) || percent < 1 || percent > 100)
                    return { text: "درصد معتبر نیست:" };
                flow.data.percent = percent;
                flow.step = "maxUses";
                return { text: "حداکثر تعداد استفاده را وارد کنید:", nextStep: "maxUses" };
            }
            if (flow.step === "maxUses") {
                const maxUses = Number(text);
                if (!Number.isInteger(maxUses) || maxUses <= 0)
                    return { text: "تعداد معتبر نیست:" };
                flow.data.maxUses = maxUses;
                flow.step = "days";
                return { text: "اعتبار کوپن چند روز باشد؟", nextStep: "days" };
            }
            const days = Number(text);
            if (!Number.isInteger(days) || days <= 0)
                return { text: "تعداد روز معتبر نیست:" };
            await coupon_service_1.CouponService.create(String(flow.data.code), Number(flow.data.percent), new Date(Date.now() + days * 86400000), Number(flow.data.maxUses));
            return { done: true, text: "✅ کوپن جدید ساخته شد.", returnTo: { id: "admin.coupons" } };
        },
    },
    product_price: {
        firstStep: "price",
        prompt: "💰 قیمت جدید محصول را به تومان وارد کنید:",
        async handleText(ctx, text) {
            const price = Number(text.replace(/[,،\s]/g, ""));
            if (!Number.isInteger(price) || price < 0)
                return { text: "قیمت معتبر نیست:" };
            const productId = String(ctx.session.flow?.data.productId);
            await admin_service_1.AdminService.updateProductPrice(productId, price, String(ctx.from?.id ?? "admin"));
            return { done: true, text: "✅ قیمت محصول به‌روزرسانی شد.", returnTo: { id: "admin.product", params: { productId } } };
        },
    },
    wallet_adjust: {
        firstStep: "amount",
        prompt: "💳 مبلغ تغییر موجودی را به تومان وارد کنید:",
        async handleText(ctx, text) {
            const amount = Number(text.replace(/[,،\s]/g, ""));
            if (!Number.isInteger(amount) || amount <= 0)
                return { text: "مبلغ معتبر نیست:" };
            const flow = ctx.session.flow;
            const signedAmount = flow.data.mode === "debit" ? -amount : amount;
            await admin_service_1.AdminService.adjustUserBalance(String(flow.data.userId), signedAmount, "تغییر موجودی توسط مدیر", String(ctx.from?.id ?? "admin"));
            return { done: true, text: "✅ موجودی کاربر به‌روزرسانی شد.", returnTo: { id: "admin.user", params: { userId: String(flow.data.userId) } } };
        },
    },
};
async function startFlow(ctx, name, data = {}) {
    const definition = definitions[name];
    if (!definition)
        throw new Error("جریان پیدا نشد");
    ctx.session.flow = { name, step: definition.firstStep, data, returnTo: currentReturnTo(ctx) };
    await flowPrompt(ctx, typeof definition.prompt === "function" ? await definition.prompt(ctx) : definition.prompt);
}
async function handleActiveFlowText(ctx, text) {
    const flow = ctx.session.flow;
    if (!flow)
        return false;
    const result = await definitions[flow.name].handleText?.(ctx, text);
    if (!result)
        return false;
    if (result.done) {
        ctx.session.flow = undefined;
        await ctx.reply(result.text);
        await (0, panel_ui_1.renderPanel)(ctx, result.returnTo ?? flow.returnTo ?? { id: "home" }, "replace");
        return true;
    }
    await flowPrompt(ctx, result.text);
    return true;
}
async function handleActiveFlowPhoto(ctx, fileId) {
    const flow = ctx.session.flow;
    if (!flow)
        return false;
    const result = await definitions[flow.name].handlePhoto?.(ctx, fileId);
    if (!result)
        return false;
    if (result.done) {
        ctx.session.flow = undefined;
        await ctx.reply(result.text);
        await (0, panel_ui_1.renderPanel)(ctx, result.returnTo ?? flow.returnTo ?? { id: "home" }, "replace");
        return true;
    }
    await flowPrompt(ctx, result.text);
    return true;
}
function registerFlowEngine(bot) {
    bot.action("flow:cancel", async (ctx) => {
        ctx.session.flow = undefined;
        await ctx.answerCbQuery("لغو شد");
        await (0, panel_ui_1.renderPanel)(ctx, currentReturnTo(ctx), "replace");
    });
    bot.action(/^flow:start:([^:]+)(?::([^:]+))?(?::([^:]+))?$/, async (ctx) => {
        await ctx.answerCbQuery();
        const name = ctx.match[1];
        if (name === "coupon_code")
            return startFlow(ctx, "coupon_code", { productId: ctx.match[2] });
        if (name === "account_create")
            return startFlow(ctx, "account_create", { productId: ctx.match[2] });
        if (name === "free_account_create")
            return startFlow(ctx, "free_account_create", { productId: ctx.match[2] });
        if (name === "ticket_reply")
            return startFlow(ctx, "ticket_reply", { ticketId: ctx.match[2] });
        if (name === "wallet_adjust")
            return startFlow(ctx, "wallet_adjust", { userId: ctx.match[2], mode: ctx.match[3] });
        if (name === "product_price")
            return startFlow(ctx, "product_price", { productId: ctx.match[2] });
        return startFlow(ctx, name);
    });
}
