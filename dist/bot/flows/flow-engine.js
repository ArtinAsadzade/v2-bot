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
const referral_service_1 = require("../../modules/referral/referral.service");
const admin_middleware_1 = require("../middlewares/admin.middleware");
const money = (value) => `${value.toLocaleString("fa-IR")} تومان`;
function currentReturnTo(ctx) {
    const stack = ctx.session.navigation?.stack ?? [];
    return stack[stack.length - 1] ?? { id: "home" };
}
async function flowPrompt(ctx, text, keyboard = []) {
    await ctx.reply(text, { ...(0, panel_ui_1.panelKeyboard)(keyboard, { back: false, home: true, cancel: true }) });
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
        prompt: async () => {
            const setting = await deposit_service_1.FinancialSettingsService.get();
            return `💳 مبلغ شارژ را به تومان وارد کنید:\n\nحداقل شارژ: ${money(setting.minimumTopupAmount)}\n\nفقط عدد را ارسال کنید؛ مثال: 250000`;
        },
        async handleText(ctx, text) {
            if (ctx.session.flow?.step === "amount") {
                const amount = Number(text.replace(/[,،\s]/g, ""));
                try {
                    await deposit_service_1.FinancialSettingsService.validateTopupAmount(amount);
                }
                catch (error) {
                    return { text: error instanceof Error ? error.message : "مبلغ معتبر نیست. یک عدد به تومان وارد کنید:" };
                }
                const wallets = await deposit_service_1.CryptoWalletService.listActive();
                if (wallets.length === 0)
                    return { text: "در حال حاضر کیف پول فعالی برای پرداخت ثبت نشده است." };
                ctx.session.flow.data.amount = amount;
                ctx.session.flow.step = "wallet";
                return {
                    text: `مبلغ شارژ: ${money(amount)}\n\nرمز ارز پرداخت را انتخاب کنید:`,
                    nextStep: "wallet",
                    keyboard: wallets.map((wallet) => [{ text: `${wallet.coinName} ${wallet.networkName}`, action: `deposit:wallet:${wallet.id}` }]),
                };
            }
            return { text: "لطفا رمز ارز را فقط از دکمه‌های نمایش داده‌شده انتخاب کنید." };
        },
        async handlePhoto(ctx, fileId) {
            const user = await requireUser(ctx);
            const depositId = String(ctx.session.flow?.data.depositId ?? "");
            if (!depositId)
                return { text: "ابتدا مبلغ شارژ را وارد کنید." };
            await deposit_service_1.DepositService.submitReceipt(depositId, user.id, fileId);
            return {
                done: true,
                text: "✅ رسید شما ثبت شد. تیم مالی در کوتاه‌ترین زمان پرداخت را بررسی می‌کند و نتیجه از همین ربات اطلاع‌رسانی می‌شود.",
                returnTo: { id: "wallet" },
            };
        },
    },
    ticket_reply: {
        firstStep: "message",
        prompt: "🎧 پیام خود را برای پشتیبانی بنویسید:\n\nاگر درباره خرید یا شارژ است، مبلغ یا شماره سفارش را هم ارسال کنید.",
        async handleText(ctx, text) {
            const ticketIdFromFlow = ctx.session.flow?.data.ticketId ? String(ctx.session.flow.data.ticketId) : undefined;
            if (ticketIdFromFlow && ctx.from && (await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id))) {
                const ticket = await support_service_1.SupportService.getTicketWithUser(ticketIdFromFlow);
                if (ticket?.status === "closed")
                    await support_service_1.SupportService.reopenTicket(ticketIdFromFlow, String(ctx.from.id), "admin");
                await support_service_1.SupportService.addAdminReply(ticketIdFromFlow, String(ctx.from.id), text.trim());
                return { done: true, text: "✅ پاسخ پشتیبانی ارسال شد.", returnTo: { id: "admin.ticket", params: { ticketId: ticketIdFromFlow } } };
            }
            const user = await requireUser(ctx);
            const ticketId = ticketIdFromFlow ?? (await support_service_1.SupportService.createTicket(user.id)).id;
            await support_service_1.SupportService.addUserMessage(ticketId, user.id, text.trim());
            return { done: true, text: "✅ تیکت شما ثبت شد. پاسخ پشتیبانی در همین گفتگو برایتان ارسال می‌شود.", returnTo: { id: "support" } };
        },
    },
    coupon_code: {
        firstStep: "code",
        prompt: "🎟 کد تخفیف را وارد کنید:",
        async handleText(ctx, text) {
            var _a;
            const user = await requireUser(ctx);
            const productId = String(ctx.session.flow?.data.productId ?? "");
            try {
                await coupon_service_1.CouponService.validateForUser(text.trim(), user.id);
                (_a = ctx.session).selectedCoupons ?? (_a.selectedCoupons = {});
                ctx.session.selectedCoupons[productId] = text.trim().toUpperCase();
                return {
                    done: true,
                    text: "✅ کد تخفیف روی پیش‌فاکتور اعمال شد.",
                    returnTo: { id: "shop.checkout", params: { productId } },
                };
            }
            catch (error) {
                return {
                    text: error instanceof Error ? `❌ ${error.message}` : "❌ کد تخفیف معتبر نیست.",
                };
            }
        },
    },
    product_search: {
        firstStep: "query",
        prompt: "🔎 نام سرویس یا دسته‌بندی موردنظر را وارد کنید:\n\nمثلاً: Premium، یک‌ماهه، نام کشور یا نام دسته‌بندی",
        async handleText(ctx, text) {
            const query = text.trim();
            if (query.length < 2)
                return { text: "برای جستجوی دقیق‌تر، حداقل دو حرف وارد کنید:" };
            ctx.session.productSearchQuery = query;
            return { done: true, text: "✅ نتایج جستجو آماده شد.", returnTo: { id: "shop.searchResults", params: { q: query } } };
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
            await product_service_1.ProductService.create({
                categoryName: String(flow.data.categoryName),
                title: String(flow.data.title),
                price: Number(flow.data.price),
                duration,
            });
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
                flow.step = "subscriptionLink";
                return { text: "لینک ساب اکانت را وارد کنید:", nextStep: "subscriptionLink" };
            }
            if (flow.step === "subscriptionLink") {
                flow.data.subscriptionLink = text.trim();
                flow.step = "configLink";
                return { text: "لینک کانفیگ را وارد کنید:", nextStep: "configLink" };
            }
            const productId = String(flow.data.productId);
            await product_service_1.ProductService.addAccount(productId, {
                username: String(flow.data.username),
                subscriptionLink: String(flow.data.subscriptionLink),
                configLink: text.trim(),
            });
            return { done: true, text: "✅ اکانت به موجودی محصول اضافه شد.", returnTo: { id: "admin.product", params: { productId } } };
        },
    },
    free_account_create: {
        firstStep: "username",
        prompt: "🎁 نام کاربری اکانت تست رایگان را وارد کنید:",
        async handleText(ctx, text) {
            const flow = ctx.session.flow;
            if (flow.step === "username") {
                flow.data.username = text.trim();
                flow.step = "subscriptionLink";
                return { text: "لینک اشتراک اکانت تست را وارد کنید:", nextStep: "subscriptionLink" };
            }
            if (flow.step === "subscriptionLink") {
                flow.data.subscriptionLink = text.trim();
                flow.step = "configLink";
                return { text: "لینک کانفیگ اکانت تست را وارد کنید:", nextStep: "configLink" };
            }
            if (flow.step === "configLink") {
                flow.data.configLink = text.trim();
                flow.step = "durationDays";
                return { text: "مدت اعتبار اکانت تست را به روز وارد کنید:", nextStep: "durationDays" };
            }
            const durationDays = Number(text.replace(/[,،\s]/g, ""));
            if (!Number.isInteger(durationDays) || durationDays <= 0)
                return { text: "مدت اعتبار معتبر نیست. یک عدد مثبت وارد کنید:" };
            await free_account_service_1.FreeAccountService.addToInventory({
                username: String(flow.data.username),
                subscriptionLink: String(flow.data.subscriptionLink),
                configLink: String(flow.data.configLink),
                durationDays,
            }, String(ctx.from?.id ?? "admin"));
            return { done: true, text: "✅ اکانت تست رایگان به موجودی مستقل اضافه شد.", returnTo: { id: "admin.freeAccounts" } };
        },
    },
    free_account_edit: {
        firstStep: "fields",
        prompt: async (ctx) => {
            const accountId = String(ctx.session.flow?.data.accountId ?? "");
            const account = accountId ? await free_account_service_1.FreeAccountService.getAccount(accountId) : undefined;
            if (!account)
                return "⚠️ اکانت تست پیدا نشد.";
            return `✏️ ویرایش اکانت تست

هر فیلدی را که می‌خواهید تغییر کند در یک خط بفرستید. فیلدهای مجاز:

username: ${account.username}
subscriptionLink: ${account.subscriptionLink}
configLink: ${account.configLink}
durationDays: ${account.durationDays}
status: ${account.status}

وضعیت‌های مجاز: available، assigned، expired`;
        },
        async handleText(ctx, text) {
            const flow = ctx.session.flow;
            const data = Object.fromEntries(text
                .split(/\n+/)
                .map((line) => line.split(/[:=：]/, 2).map((part) => part.trim()))
                .filter((parts) => parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1])));
            const durationText = data.durationDays ?? data.duration ?? data["مدت"];
            const durationDays = durationText ? Number(durationText.replace(/[,،\s]/g, "")) : undefined;
            const status = data.status ?? data["وضعیت"];
            await free_account_service_1.FreeAccountService.updateAccount(String(flow.data.accountId), {
                username: data.username ?? data["نام کاربری"],
                subscriptionLink: data.subscriptionLink ?? data.sub ?? data["لینک اشتراک"],
                configLink: data.configLink ?? data.config ?? data["لینک کانفیگ"],
                durationDays,
                status: status === "available" || status === "assigned" || status === "expired" ? status : undefined,
            }, String(ctx.from?.id ?? "admin"));
            return { done: true, text: "✅ اکانت تست با موفقیت ویرایش شد.", returnTo: { id: "admin.freeAccounts" } };
        },
    },
    coupon_create: {
        firstStep: "code",
        prompt: "🎟 کد کوپن را وارد کنید:",
        async handleText(ctx, text) {
            const flow = ctx.session.flow;
            if (flow.step === "code") {
                flow.data.code = text.trim();
                flow.step = "type";
                return { text: "نوع کوپن را وارد کنید (درصدی / ثابت):", nextStep: "type" };
            }
            if (flow.step === "type") {
                flow.data.type = text.includes("ثابت") || text.toLowerCase() === "fixed" ? "fixed" : "percentage";
                flow.step = "value";
                return { text: flow.data.type === "fixed" ? "مبلغ تخفیف را به تومان وارد کنید:" : "درصد تخفیف را وارد کنید:", nextStep: "value" };
            }
            if (flow.step === "value") {
                const value = Number(text.replace(/[,،\s]/g, ""));
                if (!Number.isInteger(value) || value <= 0 || (flow.data.type === "percentage" && value > 100))
                    return { text: "مقدار تخفیف معتبر نیست:" };
                flow.data.value = value;
                flow.step = "maxUses";
                return { text: "حداکثر تعداد استفاده کل را وارد کنید:", nextStep: "maxUses" };
            }
            if (flow.step === "maxUses") {
                const maxUses = Number(text.replace(/[,،\s]/g, ""));
                if (!Number.isInteger(maxUses) || maxUses <= 0)
                    return { text: "تعداد معتبر نیست:" };
                flow.data.maxUses = maxUses;
                flow.step = "perUserLimit";
                return { text: "حداکثر استفاده هر کاربر را وارد کنید:", nextStep: "perUserLimit" };
            }
            if (flow.step === "perUserLimit") {
                const perUserLimit = Number(text.replace(/[,،\s]/g, ""));
                if (!Number.isInteger(perUserLimit) || perUserLimit <= 0)
                    return { text: "محدودیت هر کاربر معتبر نیست:" };
                flow.data.perUserLimit = perUserLimit;
                flow.step = "minimumPurchaseAmount";
                return { text: "حداقل مبلغ خرید را به تومان وارد کنید (برای بدون حداقل، 0):", nextStep: "minimumPurchaseAmount" };
            }
            if (flow.step === "minimumPurchaseAmount") {
                const minimumPurchaseAmount = Number(text.replace(/[,،\s]/g, ""));
                if (!Number.isInteger(minimumPurchaseAmount) || minimumPurchaseAmount < 0)
                    return { text: "حداقل مبلغ خرید معتبر نیست:" };
                flow.data.minimumPurchaseAmount = minimumPurchaseAmount;
                flow.step = "days";
                return { text: "اعتبار کوپن چند روز باشد؟", nextStep: "days" };
            }
            const days = Number(text.replace(/[,،\s]/g, ""));
            if (!Number.isInteger(days) || days <= 0)
                return { text: "تعداد روز معتبر نیست:" };
            await coupon_service_1.CouponService.createAdvanced({
                code: String(flow.data.code),
                type: flow.data.type === "fixed" ? "fixed" : "percentage",
                value: Number(flow.data.value),
                maxUses: Number(flow.data.maxUses),
                perUserLimit: Number(flow.data.perUserLimit),
                minimumPurchaseAmount: Number(flow.data.minimumPurchaseAmount),
                expiresAt: new Date(Date.now() + days * 86400000),
            }, String(ctx.from?.id ?? "admin"));
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
    crypto_wallet_create: {
        firstStep: "coin",
        prompt: `💎 نام رمز ارز را وارد کنید (${deposit_service_1.CryptoWalletService.supportedCoins().join(" / ")}):`,
        async handleText(ctx, text) {
            const flow = ctx.session.flow;
            if (flow.step === "coin") {
                flow.data.coinName = text.trim().toUpperCase();
                flow.step = "network";
                return { text: "🌐 نام شبکه را وارد کنید (مثلا TRC20):", nextStep: "network" };
            }
            if (flow.step === "network") {
                flow.data.networkName = text.trim();
                flow.step = "address";
                return { text: "🏦 آدرس کیف پول را وارد کنید:", nextStep: "address" };
            }
            if (flow.step === "address") {
                flow.data.walletAddress = text.trim();
                flow.step = "status";
                return { text: "وضعیت کیف پول را وارد کنید (فعال / غیرفعال):", nextStep: "status" };
            }
            const status = text.includes("غیر") || text.toLowerCase() === "inactive" ? "inactive" : "active";
            await admin_service_1.AdminService.saveCryptoWallet({ coinName: String(flow.data.coinName), networkName: String(flow.data.networkName), walletAddress: String(flow.data.walletAddress), status }, String(ctx.from?.id ?? "admin"));
            return { done: true, text: "✅ کیف پول رمز ارزی ذخیره شد. نرخ به‌صورت خودکار دریافت می‌شود.", returnTo: { id: "admin.crypto" } };
        },
    },
    minimum_topup: {
        firstStep: "amount",
        prompt: "💳 حداقل شارژ کیف پول را به تومان وارد کنید:",
        async handleText(ctx, text) {
            const amount = Number(text.replace(/[,،\s]/g, ""));
            if (!Number.isInteger(amount) || amount <= 0)
                return { text: "مبلغ معتبر نیست. فقط عدد مثبت وارد کنید:" };
            await admin_service_1.AdminService.setMinimumTopupAmount(amount, String(ctx.from?.id ?? "admin"));
            return { done: true, text: "✅ حداقل شارژ کیف پول ذخیره شد.", returnTo: { id: "admin.crypto" } };
        },
    },
    referral_tier_create: {
        firstStep: "threshold",
        prompt: "🎁 تعداد دعوت مورد نیاز برای سطح پاداش را وارد کنید:",
        async handleText(ctx, text) {
            const flow = ctx.session.flow;
            if (flow.step === "threshold") {
                const threshold = Number(text.replace(/[,،\s]/g, ""));
                if (!Number.isInteger(threshold) || threshold <= 0)
                    return { text: "تعداد دعوت معتبر نیست:" };
                flow.data.threshold = threshold;
                flow.step = "amount";
                return { text: "مبلغ پاداش را به تومان وارد کنید:", nextStep: "amount" };
            }
            const amount = Number(text.replace(/[,،\s]/g, ""));
            if (!Number.isInteger(amount) || amount <= 0)
                return { text: "مبلغ معتبر نیست:" };
            await referral_service_1.ReferralService.upsertTier(Number(flow.data.threshold), amount, String(ctx.from?.id ?? "admin"));
            return { done: true, text: "✅ سطح پاداش دعوت ذخیره شد.", returnTo: { id: "admin.referrals" } };
        },
    },
    store_status: {
        firstStep: "status",
        prompt: "وضعیت فروشگاه را وارد کنید (فعال / غیرفعال):",
        async handleText(ctx, text) {
            const status = text.includes("غیر") || text.toLowerCase() === "inactive" ? "inactive" : "active";
            await admin_service_1.AdminService.setStoreStatus(status, String(ctx.from?.id ?? "admin"));
            return { done: true, text: "✅ وضعیت فروشگاه ذخیره شد.", returnTo: { id: "admin.store" } };
        },
    },
    forced_join_create: {
        firstStep: "chatId",
        prompt: "📢 شناسه کانال عضویت اجباری را وارد کنید (مثلاً @channel یا -100...):",
        async handleText(ctx, text) {
            const flow = ctx.session.flow;
            if (flow.step === "chatId") {
                flow.data.chatId = text.trim();
                flow.step = "title";
                return { text: "عنوان نمایشی کانال را وارد کنید:", nextStep: "title" };
            }
            if (flow.step === "title") {
                flow.data.title = text.trim();
                flow.step = "inviteLink";
                return { text: "لینک عضویت کانال را وارد کنید (اگر عمومی است لینک t.me):", nextStep: "inviteLink" };
            }
            await admin_service_1.AdminService.saveForcedJoinChannel({ chatId: String(flow.data.chatId), title: String(flow.data.title), inviteLink: text.trim(), status: "active" }, String(ctx.from?.id ?? "admin"));
            return { done: true, text: "✅ کانال عضویت اجباری ذخیره شد.", returnTo: { id: "admin.forcedJoin" } };
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
function isFlowName(value) {
    return Object.prototype.hasOwnProperty.call(definitions, value);
}
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
    await flowPrompt(ctx, result.text, result.keyboard);
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
    await flowPrompt(ctx, result.text, result.keyboard);
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
        if (!isFlowName(name)) {
            await ctx.answerCbQuery("جریان نامعتبر است");
            return;
        }
        if (name === "coupon_code")
            return startFlow(ctx, "coupon_code", { productId: ctx.match[2] });
        if (name === "account_create")
            return startFlow(ctx, "account_create", { productId: ctx.match[2] });
        if (name === "free_account_create" || name === "free_account_edit") {
            if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id))) {
                await ctx.answerCbQuery("دسترسی غیرمجاز");
                return;
            }
            if (name === "free_account_create")
                return startFlow(ctx, "free_account_create", { productId: ctx.match[2] });
            return startFlow(ctx, "free_account_edit", { accountId: ctx.match[2] });
        }
        if (name === "ticket_reply")
            return startFlow(ctx, "ticket_reply", { ticketId: ctx.match[2] });
        if (name === "wallet_adjust")
            return startFlow(ctx, "wallet_adjust", { userId: ctx.match[2], mode: ctx.match[3] });
        if (name === "product_price")
            return startFlow(ctx, "product_price", { productId: ctx.match[2] });
        return startFlow(ctx, name);
    });
}
