"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerModernHandlers = registerModernHandlers;
const modern_views_1 = require("../views/modern.views");
const panel_ui_1 = require("../navigation/panel-ui");
const flow_engine_1 = require("../flows/flow-engine");
const user_service_1 = require("../../modules/user/user.service");
const referral_service_1 = require("../../modules/referral/referral.service");
const purchase_service_1 = require("../../modules/product/purchase.service");
const deposit_service_1 = require("../../modules/deposit/deposit.service");
const admin_service_1 = require("../../modules/admin/admin.service");
const support_service_1 = require("../../modules/support/support.service");
const free_account_service_1 = require("../../modules/free-account/free-account.service");
const admin_middleware_1 = require("../middlewares/admin.middleware");
function registerModernHandlers(bot) {
    (0, modern_views_1.registerModernViews)();
    (0, flow_engine_1.registerFlowEngine)(bot);
    (0, free_account_service_1.registerFreeAccountEvents)();
    bot.start(async (ctx) => {
        if (!ctx.from)
            return;
        const user = await user_service_1.UserService.findOrCreateUser(ctx);
        const payload = ctx.startPayload;
        if (payload)
            await referral_service_1.ReferralService.linkReferral(user.id, payload);
        await (0, panel_ui_1.renderPanel)(ctx, { id: "home" }, "replace");
    });
    bot.action(/^nav:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (ctx.match[1] === "back")
            return (0, panel_ui_1.goBack)(ctx);
        const state = (0, panel_ui_1.parseNavAction)(`nav:${ctx.match[1]}`);
        if (!state)
            return;
        if (state.id.startsWith("admin") && (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))) {
            await ctx.answerCbQuery("دسترسی غیرمجاز");
            return;
        }
        await (0, panel_ui_1.renderPanel)(ctx, state, "push");
    });
    bot.action(/^buy:confirm:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from)
            return;
        const user = await user_service_1.UserService.getByTelegramId(ctx.from.id);
        if (!user)
            return;
        try {
            const productId = ctx.match[1];
            const coupon = ctx.session.selectedCoupons?.[productId];
            const result = await purchase_service_1.PurchaseService.buyProduct(user.id, productId, coupon);
            delete ctx.session.selectedCoupons?.[productId];
            await ctx.editMessageText(`✅ خرید با موفقیت انجام شد.

محصول: ${result.product.title}
مبلغ اصلی: ${result.originalAmount.toLocaleString("fa-IR")} تومان
تخفیف: ${result.discountAmount.toLocaleString("fa-IR")} تومان
مبلغ پرداختی: ${result.totalAmount.toLocaleString("fa-IR")} تومان

نام کاربری:
${result.account.username}

لینک ساب:
${result.account.subscriptionLink}

لینک کانفیگ:
${result.account.configLink}

تاریخ انقضا: ${result.expiresAt.toLocaleDateString("fa-IR")}`, { reply_markup: { inline_keyboard: [[{ text: "🏠 خانه", callback_data: (0, panel_ui_1.callbackFor)("home") }]] } });
        }
        catch (error) {
            await ctx.editMessageText(`❌ ${error instanceof Error ? error.message : "خرید ناموفق بود"}`, { reply_markup: { inline_keyboard: [[{ text: "⬅️ بازگشت", callback_data: "nav:back" }, { text: "🏠 خانه", callback_data: (0, panel_ui_1.callbackFor)("home") }]] } });
        }
    });
    bot.action(/^deposit:wallet:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from)
            return;
        const flow = ctx.session.flow;
        if (!flow || flow.name !== "deposit_submit" || flow.step !== "wallet") {
            await ctx.reply("ابتدا مبلغ شارژ را وارد کنید.");
            return;
        }
        const user = await user_service_1.UserService.getByTelegramId(ctx.from.id);
        if (!user)
            return;
        try {
            const walletId = ctx.match[1];
            const amount = Number(flow.data.amount);
            const quote = await deposit_service_1.CryptoWalletService.quote(walletId, amount);
            const deposit = await deposit_service_1.DepositService.createDeposit(user.id, amount, walletId);
            flow.step = "receipt";
            flow.data.depositId = deposit.id;
            await ctx.editMessageText(`💳 درخواست شارژ آماده شد\n\nمبلغ شارژ:\n${quote.amount.toLocaleString("fa-IR")} تومان\n\nرمز ارز:\n${quote.wallet.coinName}\n\nشبکه:\n${quote.wallet.networkName}\n\nنرخ:\n${quote.exchangeRate.toLocaleString("fa-IR")} تومان\n\nمبلغ قابل پرداخت:\n${quote.cryptoAmount.toLocaleString("fa-IR", { maximumFractionDigits: 8 })} ${quote.wallet.coinName}\n\nآدرس کیف پول:\n${quote.wallet.walletAddress}\n\n⏳ مهلت پرداخت: ۳۰ دقیقه\n📤 پس از پرداخت، تصویر رسید را ارسال کنید.`, { reply_markup: { inline_keyboard: [[{ text: "❌ لغو", callback_data: "flow:cancel" }]] } });
        }
        catch (error) {
            await ctx.reply(`❌ ${error instanceof Error ? error.message : "ایجاد درخواست شارژ ناموفق بود"}`);
        }
    });
    bot.action("referral:claim", async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from)
            return;
        const user = await user_service_1.UserService.getByTelegramId(ctx.from.id);
        if (!user)
            return;
        try {
            const result = await referral_service_1.ReferralService.claimPendingRewards(user.id);
            await ctx.answerCbQuery(`برداشت شد: ${result.amount.toLocaleString("fa-IR")} تومان`);
        }
        catch (error) {
            await ctx.answerCbQuery(error instanceof Error ? error.message : "برداشت ناموفق بود");
        }
        await (0, panel_ui_1.renderPanel)(ctx, { id: "referral" }, "replace");
    });
    bot.action(/^admin:store:status:(active|inactive)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.setStoreStatus(ctx.match[1], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.store" }, "replace");
    });
    bot.action(/^admin:referral:tier:status:([^:]+):([01])$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await referral_service_1.ReferralService.setTierStatus(ctx.match[1], ctx.match[2] === "1", String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.referrals" }, "replace");
    });
    bot.action(/^admin:referral:tier:delete:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await referral_service_1.ReferralService.deleteTier(ctx.match[1], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.referrals" }, "replace");
    });
    bot.action(/^admin:user:ban:([^:]+):([01])$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.setUserBan(ctx.match[1], ctx.match[2] === "1", String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.user", params: { userId: ctx.match[1] } }, "replace");
    });
    bot.action(/^admin:product:active:([^:]+):([01])$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.setProductActive(ctx.match[1], ctx.match[2] === "1", String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.product", params: { productId: ctx.match[1] } }, "replace");
    });
    bot.action(/^admin:product:delete:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.deleteProduct(ctx.match[1], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.products" }, "replace");
    });
    bot.action(/^admin:product:hard_delete:confirm:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await ctx.reply("⚠️ حذف دائمی محصول غیرقابل بازگشت است. اگر محصول سفارش فعال داشته باشد با تایید نهایی هم حذف می‌شود.", { reply_markup: { inline_keyboard: [[{ text: "تایید حذف دائمی", callback_data: `admin:product:hard_delete:force:${ctx.match[1]}` }, { text: "لغو", callback_data: (0, panel_ui_1.callbackFor)("admin.product", { productId: ctx.match[1] }) }]] } });
    });
    bot.action(/^admin:product:hard_delete:force:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.hardDeleteProduct(ctx.match[1], String(ctx.from.id), true);
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.products" }, "replace");
    });
    bot.action(/^admin:deposit:(approve|reject):(.+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        if (ctx.match[1] === "approve")
            await deposit_service_1.DepositService.approve(ctx.match[2], String(ctx.from.id));
        else
            await deposit_service_1.DepositService.reject(ctx.match[2], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.deposits" }, "replace");
    });
    bot.action(/^admin:ticket:close:(.+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await support_service_1.SupportService.closeTicket(ctx.match[1], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.tickets" }, "replace");
    });
    bot.on("photo", async (ctx, next) => {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        if (photo && (await (0, flow_engine_1.handleActiveFlowPhoto)(ctx, photo.file_id)))
            return;
        return next();
    });
    bot.on("text", async (ctx, next) => {
        if (await (0, flow_engine_1.handleActiveFlowText)(ctx, ctx.message.text.trim()))
            return;
        return next();
    });
}
