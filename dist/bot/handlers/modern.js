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
const coupon_service_1 = require("../../modules/coupon/coupon.service");
const support_service_1 = require("../../modules/support/support.service");
const free_account_service_1 = require("../../modules/free-account/free-account.service");
const admin_middleware_1 = require("../middlewares/admin.middleware");
function registerModernHandlers(bot) {
    (0, modern_views_1.registerModernViews)();
    (0, flow_engine_1.registerFlowEngine)(bot);
    const legacyViews = new Map([
        ["home", { id: "home" }],
        ["shop", { id: "shop.categories" }],
        ["wallet", { id: "wallet" }],
        ["deposit", { id: "deposit" }],
        ["support", { id: "support" }],
        ["referral", { id: "referral" }],
        ["account", { id: "account" }],
        ["freeAccount", { id: "freeAccount" }],
        ["admin:dashboard", { id: "admin.dashboard" }],
        ["admin:deposits", { id: "admin.deposits" }],
        ["admin:tickets", { id: "admin.tickets" }],
        ["admin:users", { id: "admin.users" }],
        ["admin:coupons", { id: "admin.coupons" }],
    ]);
    for (const [action, state] of legacyViews.entries()) {
        bot.action(action, async (ctx) => {
            await ctx.answerCbQuery();
            if (state.id.startsWith("admin") && (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))) {
                await ctx.answerCbQuery("دسترسی غیرمجاز");
                return;
            }
            ctx.session.flow = undefined;
            if (action === "home") {
                ctx.session.liveTicketId = undefined;
                ctx.session.liveTicketRole = undefined;
            }
            await (0, panel_ui_1.renderPanel)(ctx, state, "replace");
        });
    }
    bot.action("cancel", async (ctx) => {
        ctx.session.flow = undefined;
        ctx.session.liveTicketId = undefined;
        ctx.session.liveTicketRole = undefined;
        await ctx.answerCbQuery("لغو شد");
        await (0, panel_ui_1.renderPanel)(ctx, { id: "home" }, "replace");
    });
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
            await ctx.editMessageText("⏳ در حال بررسی موجودی کیف پول و آماده‌سازی اکانت...", { reply_markup: { inline_keyboard: [] } });
            const coupon = ctx.session.selectedCoupons?.[productId];
            const result = await purchase_service_1.PurchaseService.buyProduct(user.id, productId, coupon);
            delete ctx.session.selectedCoupons?.[productId];
            await ctx.editMessageText(`🎉 خرید با موفقیت انجام شد

📦 محصول:
${result.product.title}

💰 مبلغ اصلی: ${result.originalAmount.toLocaleString("fa-IR")} تومان
🎟 تخفیف: ${result.discountAmount.toLocaleString("fa-IR")} تومان
✅ مبلغ پرداختی: ${result.totalAmount.toLocaleString("fa-IR")} تومان
📅 اعتبار تا: ${result.expiresAt.toLocaleDateString("fa-IR")}

👤 نام کاربری:
${result.account.username}

🔗 لینک اشتراک:
${result.account.subscriptionLink}

🧩 لینک کانفیگ:
${result.account.configLink}

این اطلاعات در بخش «اکانت‌های من» نیز همیشه در دسترس است.`, { reply_markup: { inline_keyboard: [[{ text: "📦 اکانت‌های من", callback_data: (0, panel_ui_1.callbackFor)("account.details") }, { text: "🎧 پشتیبانی", callback_data: (0, panel_ui_1.callbackFor)("support") }], [{ text: "🏠 منوی اصلی", callback_data: (0, panel_ui_1.callbackFor)("home") }]] } });
        }
        catch (error) {
            await ctx.editMessageText(`⚠️ خرید تکمیل نشد

${error instanceof Error ? error.message : "در انجام درخواست مشکلی پیش آمد. لطفاً چند لحظه دیگر دوباره تلاش کنید."}`, { reply_markup: { inline_keyboard: [[{ text: "💳 شارژ کیف پول", callback_data: (0, panel_ui_1.callbackFor)("deposit") }, { text: "⬅️ بازگشت به پیش‌فاکتور", callback_data: "nav:back" }], [{ text: "🎧 پشتیبانی", callback_data: (0, panel_ui_1.callbackFor)("support") }]] } });
        }
    });
    bot.action(/^favorite:toggle:(.+)$/, async (ctx) => {
        var _a;
        await ctx.answerCbQuery();
        const productId = ctx.match[1];
        (_a = ctx.session).favoriteProducts ?? (_a.favoriteProducts = {});
        if (ctx.session.favoriteProducts[productId]) {
            delete ctx.session.favoriteProducts[productId];
            await ctx.answerCbQuery("از علاقه‌مندی‌ها حذف شد");
        }
        else {
            ctx.session.favoriteProducts[productId] = true;
            await ctx.answerCbQuery("به علاقه‌مندی‌ها اضافه شد");
        }
        await (0, panel_ui_1.renderPanel)(ctx, { id: "shop.product", params: { productId } }, "replace");
    });
    bot.action(/^deposit:wallet:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from)
            return;
        const flow = ctx.session.flow;
        if (!flow || flow.name !== "deposit_submit" || flow.step !== "wallet") {
            await ctx.reply("لطفاً ابتدا مبلغ شارژ کیف پول را وارد کنید.");
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
            await ctx.editMessageText(`💳 درخواست پرداخت آماده شد

مبلغ شارژ:
${quote.amount.toLocaleString("fa-IR")} تومان

رمز ارز:
${quote.wallet.coinName}

شبکه:
${quote.wallet.networkName}

قیمت دلاری هر ${quote.wallet.coinName}:
${quote.coinUsdPrice ? `${quote.coinUsdPrice.toLocaleString("fa-IR")} دلار` : "نرخ ذخیره‌شده"}

نرخ دلار به تومان:
${quote.usdTomanRate ? `${quote.usdTomanRate.toLocaleString("fa-IR")} تومان` : "نرخ ذخیره‌شده"}

قیمت تومان هر ${quote.wallet.coinName}:
${quote.exchangeRate.toLocaleString("fa-IR")} تومان

مبلغ نهایی قابل پرداخت:
${quote.cryptoAmount.toLocaleString("fa-IR", { maximumFractionDigits: 8 })} ${quote.wallet.coinName}

آدرس کیف پول:
${quote.wallet.walletAddress}

⏳ مهلت پرداخت: ۳۰ دقیقه
📤 پس از پرداخت، تصویر رسید را همین‌جا ارسال کنید.`, { reply_markup: { inline_keyboard: [[{ text: "❌ لغو عملیات", callback_data: "flow:cancel" }]] } });
        }
        catch (error) {
            await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "ایجاد درخواست شارژ ناموفق بود. لطفاً دوباره تلاش کنید."}`);
        }
    });
    bot.action("freeAccount:claim", async (ctx) => {
        await ctx.answerCbQuery("در حال آماده‌سازی اکانت تست...");
        if (!ctx.from)
            return;
        const user = await user_service_1.UserService.getByTelegramId(ctx.from.id);
        if (!user)
            return;
        try {
            const account = await free_account_service_1.FreeAccountService.assign(user.id, "user_claim");
            await ctx.reply(`🎉 اکانت تست شما آماده است

━━━━━━━━━━━━━━━━

👤 نام کاربری:
${account.username}

🔗 لینک اشتراک:
${account.subscriptionLink}

⚙️ لینک کانفیگ:
${account.configLink}

⏳ اعتبار:
${account.durationDays.toLocaleString("fa-IR")} روز

📅 تاریخ انقضا:
${account.assignment.expiresAt.toLocaleDateString("fa-IR")}

━━━━━━━━━━━━━━━━

📦 این اکانت به بخش «اکانت‌های من» اضافه شد و در هر زمان می‌توانید اطلاعات آن را مشاهده کنید.`, {
                reply_markup: { inline_keyboard: [[{ text: "📦 اکانت‌های من", callback_data: (0, panel_ui_1.callbackFor)("account.details") }], [{ text: "🏠 منوی اصلی", callback_data: (0, panel_ui_1.callbackFor)("home") }]] },
            });
        }
        catch (error) {
            const keyboard = error instanceof free_account_service_1.FreeAccountError && error.code === "ACTIVE_ACCOUNT"
                ? [[{ text: "📦 اکانت‌های من", callback_data: (0, panel_ui_1.callbackFor)("account.details") }], [{ text: "🏠 منوی اصلی", callback_data: (0, panel_ui_1.callbackFor)("home") }]]
                : [[{ text: "🏠 منوی اصلی", callback_data: (0, panel_ui_1.callbackFor)("home") }]];
            await ctx.reply((0, free_account_service_1.formatFreeAccountError)(error), { reply_markup: { inline_keyboard: keyboard } });
        }
    });
    bot.action(/^admin:free_account:view:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        const account = await free_account_service_1.FreeAccountService.getAccount(ctx.match[1]);
        if (!account) {
            await ctx.reply("⚠️ اکانت تست پیدا نشد.");
            return;
        }
        const assignment = account.assignment;
        const expiresAt = assignment ? assignment.expiresAt ?? (0, free_account_service_1.freeAccountExpiresAt)(assignment.assignedAt ?? assignment.createdAt, account.durationDays) : undefined;
        await ctx.reply(`🆓 جزئیات اکانت تست

━━━━━━━━━━━━━━━━

👤 نام کاربری:
${account.username}

🔗 لینک اشتراک:
${account.subscriptionLink}

⚙️ لینک کانفیگ:
${account.configLink}

⏳ مدت اعتبار: ${account.durationDays.toLocaleString("fa-IR")} روز
📌 وضعیت: ${free_account_service_1.FREE_ACCOUNT_STATUS_LABELS[account.status]}
👥 کاربر دریافت‌کننده: ${assignment?.user.telegramId ?? "—"}
📅 تاریخ تخصیص: ${(0, free_account_service_1.formatFreeAccountDate)(assignment?.assignedAt ?? assignment?.createdAt)}
📅 تاریخ انقضا: ${(0, free_account_service_1.formatFreeAccountDate)(expiresAt)}

━━━━━━━━━━━━━━━━`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "✏️ ویرایش", callback_data: `flow:start:free_account_edit:${account.id}` }],
                    [{ text: "✅ آماده", callback_data: `admin:free_account:status:${account.id}:available` }, { text: "🚫 منقضی/غیرفعال", callback_data: `admin:free_account:status:${account.id}:expired` }],
                    [{ text: "🗑 حذف", callback_data: `admin:free_account:delete:${account.id}` }],
                    [{ text: "🔙 مدیریت اکانت تست", callback_data: (0, panel_ui_1.callbackFor)("admin.freeAccounts") }],
                ],
            },
        });
    });
    bot.action(/^admin:free_account:status:([^:]+):(available|assigned|expired)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery("وضعیت به‌روزرسانی شد");
        try {
            await free_account_service_1.FreeAccountService.updateAccount(ctx.match[1], { status: ctx.match[2] }, String(ctx.from.id));
        }
        catch (error) {
            await ctx.reply(error instanceof Error ? `⚠️ ${error.message}` : "⚠️ ویرایش وضعیت ناموفق بود.");
            return;
        }
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.freeAccounts" }, "replace");
    });
    bot.action(/^admin:free_account:delete:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery("حذف شد");
        await free_account_service_1.FreeAccountService.deleteAccount(ctx.match[1], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.freeAccounts" }, "replace");
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
    bot.action("forced_join:verify", async (ctx) => {
        await ctx.answerCbQuery("عضویت شما تایید شد ✅");
        await (0, panel_ui_1.renderPanel)(ctx, { id: "home" }, "replace");
    });
    bot.action("support:chat:start", async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from)
            return;
        const user = await user_service_1.UserService.getByTelegramId(ctx.from.id);
        if (!user)
            return;
        const ticket = await support_service_1.SupportService.getOrCreateOpenTicket(user.id);
        ctx.session.liveTicketId = ticket.id;
        ctx.session.liveTicketRole = "user";
        await ctx.reply(`💬 گفتگوی پشتیبانی فعال شد

تیکت: #${ticket.id.slice(-6).toUpperCase()}

پیام خود را ارسال کنید. محدودیتی در تعداد پیام‌ها وجود ندارد.`, { reply_markup: { inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: `support:close:${ticket.id}` }], [{ text: "🏠 منوی اصلی", callback_data: (0, panel_ui_1.callbackFor)("home") }]] } });
    });
    bot.action(/^support:chat:([^:]+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from)
            return;
        const user = await user_service_1.UserService.getByTelegramId(ctx.from.id);
        if (!user)
            return;
        const ticket = await support_service_1.SupportService.getTicketWithUser(ctx.match[1]);
        if (!ticket || ticket.userId !== user.id) {
            await ctx.reply("⚠️ تیکت پیدا نشد.");
            return;
        }
        if (ticket.status === "closed")
            await support_service_1.SupportService.reopenTicket(ticket.id, user.id, "user");
        ctx.session.liveTicketId = ticket.id;
        ctx.session.liveTicketRole = "user";
        await ctx.reply(`💬 گفتگو باز شد

تیکت: #${ticket.id.slice(-6).toUpperCase()}
پیام بعدی خود را ارسال کنید.`, { reply_markup: { inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: `support:close:${ticket.id}` }], [{ text: "📜 مشاهده تاریخچه", callback_data: (0, panel_ui_1.callbackFor)("support") }]] } });
    });
    bot.action(/^support:close:([^:]+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from)
            return;
        const user = await user_service_1.UserService.getByTelegramId(ctx.from.id);
        if (!user)
            return;
        const ticket = await support_service_1.SupportService.getTicketWithUser(ctx.match[1]);
        if (!ticket || ticket.userId !== user.id)
            return ctx.reply("⚠️ تیکت پیدا نشد.");
        await support_service_1.SupportService.closeTicket(ticket.id, user.id, "user");
        ctx.session.liveTicketId = undefined;
        ctx.session.liveTicketRole = undefined;
        await (0, panel_ui_1.renderPanel)(ctx, { id: "support" }, "replace");
    });
    bot.action(/^support:admin:chat:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        let ticket = await support_service_1.SupportService.getTicketWithUser(ctx.match[1]);
        if (!ticket)
            return ctx.reply("⚠️ تیکت پیدا نشد.");
        if (ticket.status === "closed") {
            await support_service_1.SupportService.reopenTicket(ticket.id, String(ctx.from.id), "admin");
            ticket = await support_service_1.SupportService.getTicketWithUser(ticket.id);
            if (!ticket)
                return ctx.reply("⚠️ تیکت پیدا نشد.");
        }
        ctx.session.liveTicketId = ticket.id;
        ctx.session.liveTicketRole = "admin";
        await ctx.reply(`💬 چت ادمین فعال شد

تیکت: #${ticket.id.slice(-6).toUpperCase()}
کاربر: ${ticket.user.telegramId}

پاسخ خود را ارسال کنید. هر پیام جداگانه برای کاربر ارسال می‌شود.`, { reply_markup: { inline_keyboard: [[{ text: "👁 مشاهده تاریخچه", callback_data: (0, panel_ui_1.callbackFor)("admin.ticket", { ticketId: ticket.id }) }, { text: "✅ بستن", callback_data: `admin:ticket:close:${ticket.id}` }], [{ text: "🏠 پنل مدیریت", callback_data: (0, panel_ui_1.callbackFor)("admin.dashboard") }]] } });
    });
    bot.action(/^admin:store:status:(active|inactive)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.setStoreStatus(ctx.match[1], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.store" }, "replace");
    });
    bot.action(/^admin:coupon:status:([^:]+):(active|inactive)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await coupon_service_1.CouponService.setStatus(ctx.match[1], ctx.match[2], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.coupon", params: { couponId: ctx.match[1] } }, "replace");
    });
    bot.action(/^admin:coupon:(soft_delete|hard_delete):([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        if (ctx.match[1] === "soft_delete")
            await coupon_service_1.CouponService.softDelete(ctx.match[2], String(ctx.from.id));
        else
            await coupon_service_1.CouponService.hardDelete(ctx.match[2], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.coupons" }, "replace");
    });
    bot.action(/^admin:forced_join:status:([^:]+):(active|inactive)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.setForcedJoinStatus(ctx.match[1], ctx.match[2], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.forcedJoin" }, "replace");
    });
    bot.action(/^admin:forced_join:delete:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.deleteForcedJoinChannel(ctx.match[1], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.forcedJoin" }, "replace");
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
        try {
            if (ctx.match[1] === "approve")
                await deposit_service_1.DepositService.approve(ctx.match[2], String(ctx.from.id));
            else
                await deposit_service_1.DepositService.reject(ctx.match[2], String(ctx.from.id));
        }
        catch (error) {
            await ctx.answerCbQuery(error instanceof Error ? error.message : "عملیات ناموفق بود");
        }
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.deposits" }, "replace");
    });
    bot.action(/^admin:ticket:([a-f\d]{24})$/i, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.ticket", params: { ticketId: ctx.match[1] } }, "push");
    });
    bot.action(/^admin:ticket:close:(.+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await support_service_1.SupportService.closeTicket(ctx.match[1], String(ctx.from.id), "admin");
        if (ctx.session.liveTicketId === ctx.match[1]) {
            ctx.session.liveTicketId = undefined;
            ctx.session.liveTicketRole = undefined;
        }
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.ticket", params: { ticketId: ctx.match[1] } }, "replace");
    });
    bot.action(/^admin:ticket:reopen:(.+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await support_service_1.SupportService.reopenTicket(ctx.match[1], String(ctx.from.id), "admin");
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.ticket", params: { ticketId: ctx.match[1] } }, "replace");
    });
    bot.on("photo", async (ctx, next) => {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        if (photo && (await (0, flow_engine_1.handleActiveFlowPhoto)(ctx, photo.file_id)))
            return;
        return next();
    });
    bot.on("text", async (ctx, next) => {
        const text = ctx.message.text.trim();
        if (await (0, flow_engine_1.handleActiveFlowText)(ctx, text))
            return;
        if (ctx.session.liveTicketId && ctx.session.liveTicketRole) {
            try {
                if (ctx.session.liveTicketRole === "admin") {
                    if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
                        return next();
                    await support_service_1.SupportService.addAdminReply(ctx.session.liveTicketId, String(ctx.from.id), text);
                    await ctx.reply("✅ پاسخ ارسال شد. برای ادامه گفتگو، پیام بعدی را ارسال کنید.", { reply_markup: { inline_keyboard: [[{ text: "👁 مشاهده تیکت", callback_data: (0, panel_ui_1.callbackFor)("admin.ticket", { ticketId: ctx.session.liveTicketId }) }, { text: "✅ بستن", callback_data: `admin:ticket:close:${ctx.session.liveTicketId}` }]] } });
                    return;
                }
                const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
                if (!user)
                    return next();
                await support_service_1.SupportService.addUserMessage(ctx.session.liveTicketId, user.id, text);
                await ctx.reply("📩 پیام شما ارسال شد. برای ادامه گفتگو، پیام بعدی را ارسال کنید.", { reply_markup: { inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: `support:close:${ctx.session.liveTicketId}` }], [{ text: "🏠 منوی اصلی", callback_data: (0, panel_ui_1.callbackFor)("home") }]] } });
                return;
            }
            catch (error) {
                await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "ارسال پیام ناموفق بود."}`);
                return;
            }
        }
        return next();
    });
}
