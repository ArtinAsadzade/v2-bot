"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerModernHandlers = registerModernHandlers;
const modern_views_1 = require("../views/modern.views");
const panel_ui_1 = require("../navigation/panel-ui");
const flow_engine_1 = require("../flows/flow-engine");
const user_service_1 = require("../../modules/user/user.service");
const referral_service_1 = require("../../modules/referral/referral.service");
const purchase_service_1 = require("../../modules/product/purchase.service");
const product_service_1 = require("../../modules/product/product.service");
const deposit_service_1 = require("../../modules/deposit/deposit.service");
const admin_service_1 = require("../../modules/admin/admin.service");
const coupon_service_1 = require("../../modules/coupon/coupon.service");
const support_service_1 = require("../../modules/support/support.service");
const free_account_service_1 = require("../../modules/free-account/free-account.service");
const payment_service_1 = require("../../modules/payment/payment.service");
const admin_middleware_1 = require("../middlewares/admin.middleware");
const reply_keyboard_1 = require("../keyboards/reply.keyboard");
const design_system_1 = require("../keyboards/design-system");
const messages_1 = require("../../utils/messages");
const monitoring_service_1 = require("../../services/monitoring.service");
const product_guide_service_1 = require("../../modules/system/product-guide.service");
const public_plans_service_1 = require("../../modules/product/public-plans.service");
const xray_service_1 = require("../../modules/xray/xray.service");
const prisma_1 = require("../../services/prisma");
function registerModernHandlers(bot) {
    (0, modern_views_1.registerModernViews)();
    (0, flow_engine_1.registerFlowEngine)(bot);
    async function handleQuickReplyNavigation(ctx, text) {
        const target = (0, reply_keyboard_1.quickReplyTarget)(text);
        if (!target)
            return false;
        if (target === "refresh") {
            const stack = ctx.session.navigation?.stack ?? [];
            const current = stack[stack.length - 1] ?? { id: "home" };
            await (0, panel_ui_1.renderPanel)(ctx, current, "replace", panel_ui_1.RenderMode.SEND_NEW);
            return true;
        }
        if (target === "claimFree") {
            await (0, panel_ui_1.renderPanel)(ctx, { id: "freeAccount" }, "replace");
            return true;
        }
        if (target === "newTicket") {
            if (!ctx.from)
                return true;
            const user = await user_service_1.UserService.getByTelegramId(ctx.from.id);
            if (!user)
                return true;
            const ticket = await support_service_1.SupportService.getOrCreateOpenTicket(user.id);
            ctx.session.liveTicketId = ticket.id;
            ctx.session.liveTicketRole = "user";
            await ctx.reply(`💬 گفتگوی پشتیبانی فعال شد

تیکت: #${ticket.id.slice(-6).toUpperCase()}

پیام خود را ارسال کنید.`, { reply_markup: { inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: (0, panel_ui_1.actionFor)("support:close", ticket.id) }], [{ text: "🏠 خانه", callback_data: (0, panel_ui_1.callbackFor)("home") }]] } });
            return true;
        }
        if (target.id.startsWith("admin") && (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))) {
            await ctx.reply("⛔ دسترسی غیرمجاز");
            return true;
        }
        if (target.id === "home") {
            ctx.session.liveTicketId = undefined;
            ctx.session.liveTicketRole = undefined;
            ctx.session.flow = undefined;
        }
        await (0, panel_ui_1.renderPanel)(ctx, target, "replace");
        return true;
    }
    // Temporary compatibility redirects for old inline buttons. New visible buttons must use callbackFor()/nav:* actions.
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
    bot.action("free_config", async (ctx) => {
        await ctx.answerCbQuery("این بخش به اکانت تست منتقل شد");
        await (0, panel_ui_1.renderPanel)(ctx, { id: "freeAccount" }, "replace");
    });
    bot.action("free_config:claim", async (ctx) => {
        await ctx.answerCbQuery("برای دریافت از اکانت تست استفاده کنید");
        await (0, panel_ui_1.renderPanel)(ctx, { id: "freeAccount" }, "replace");
    });
    const publicPlansCooldown = new Map();
    async function handlePublicPlansCommand(ctx) {
        const chatId = ctx.chat?.id;
        if (!chatId)
            return;
        const isPrivate = ctx.chat?.type === "private";
        if (isPrivate) {
            await (0, panel_ui_1.renderPanel)(ctx, { id: "shop.categories" }, "replace");
            return;
        }
        const setting = await public_plans_service_1.PublicPlansService.getSetting();
        if (!setting.enabled) {
            if (isPrivate)
                await ctx.reply("نمایش پلن‌ها در گروه‌ها فعلاً غیرفعال است.");
            return;
        }
        const now = Date.now();
        if (!isPrivate && (publicPlansCooldown.get(chatId) ?? 0) > now - 60000)
            return;
        publicPlansCooldown.set(chatId, now);
        const categories = await public_plans_service_1.PublicPlansService.listPublicPlans();
        const botInfo = await ctx.telegram.getMe();
        const planLines = categories.map((category) => `📂 ${category.name}\n\n${category.products.map((product) => {
            const duration = product.mode === "xray_auto" ? (product.durationDays ?? product.duration) : product.duration;
            const traffic = product.mode === "xray_auto" && product.trafficBytes ? `\nحجم: ${(Number(product.trafficBytes) / 1073741824).toLocaleString("fa-IR")} GB` : "";
            return `▫️ ${product.title}${traffic}\nمدت: ${duration.toLocaleString("fa-IR")} روز\nقیمت: ${product.price.toLocaleString("fa-IR")} تومان\nموجودی: ${product.availableStock.toLocaleString("fa-IR")}`;
        }).join("\n\n")}`).join("\n\n━━━━━━━━━━━━━━\n\n");
        const text = `🛒 پلن‌های فعال فروشگاه\n\n━━━━━━━━━━━━━━\n\n${planLines || "در حال حاضر پلن آماده فروشی وجود ندارد."}\n\n━━━━━━━━━━━━━━\nبرای خرید و مشاهده جزئیات، وارد ربات شوید.`;
        await ctx.reply(text.slice(0, 3900), { reply_markup: { inline_keyboard: [[{ text: "🛒 خرید سرویس", url: `https://t.me/${botInfo.username}?start=shop` }]] } });
    }
    bot.command(["plans", "plan", "products"], handlePublicPlansCommand);
    const userCommands = [
        ["menu", { id: "home" }],
        ["shop", { id: "shop.categories" }],
        ["wallet", { id: "wallet" }],
        ["accounts", { id: "account.details" }],
        ["support", { id: "support" }],
        [["help", "guide"], { id: "productGuide" }],
        ["referral", { id: "referral" }],
    ];
    for (const [command, state] of userCommands) {
        bot.command(command, async (ctx) => {
            await (0, panel_ui_1.renderPanel)(ctx, state, "replace");
        });
    }
    const adminCommands = [
        ["admin", { id: "admin.dashboard" }],
        ["store", { id: "admin.store" }],
        ["finance", { id: "admin.finance" }],
        ["payments", { id: "admin.finance" }],
        ["tickets", { id: "admin.tickets" }],
        ["settings", { id: "admin.botSettings" }],
        ["monitoring", { id: "admin.monitoring" }],
        ["stats", { id: "admin.analytics" }],
    ];
    for (const [command, state] of adminCommands) {
        bot.command(command, async (ctx) => {
            if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id))) {
                await ctx.reply("⛔ این دستور مخصوص مدیران است. اگر فکر می‌کنید اشتباهی رخ داده، با پشتیبانی تماس بگیرید.");
                return;
            }
            await (0, panel_ui_1.renderPanel)(ctx, state, "replace");
        });
    }
    bot.start(async (ctx) => {
        if (!ctx.from)
            return;
        const user = await user_service_1.UserService.findOrCreateUser(ctx);
        const payload = ctx.startPayload;
        if (payload === "shop") {
            await (0, panel_ui_1.renderPanel)(ctx, { id: "shop.categories" }, "replace");
            return;
        }
        if (payload)
            await referral_service_1.ReferralService.linkReferral(user.id, payload);
        await (0, panel_ui_1.renderPanel)(ctx, { id: "home" }, "replace");
    });
    bot.action(/^nav:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (ctx.match[1] === "back")
            return (0, panel_ui_1.goBack)(ctx);
        const state = (0, panel_ui_1.parseNavAction)(`nav:${ctx.match[1]}`);
        if (!state) {
            monitoring_service_1.MonitoringService.record({ type: "BUTTON_DATA_INVALID", section: "Telegram Callback", description: `Invalid nav callback: nav:${ctx.match[1]}`, telegramId: ctx.from?.id ? String(ctx.from.id) : undefined, userId: ctx.state.userId, severity: "warning", suggestedAction: "callback_data دکمه‌های منتشرشده را بررسی کنید." });
            return;
        }
        if (state.id.startsWith("admin") && (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))) {
            await ctx.answerCbQuery("دسترسی غیرمجاز");
            return;
        }
        await (0, panel_ui_1.renderPanel)(ctx, state, "push", panel_ui_1.RenderMode.EDIT_CURRENT);
    });
    bot.action(/^cat:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        await (0, panel_ui_1.renderPanel)(ctx, { id: "shop.products", params: { categoryId: ctx.match[1] } }, "replace", panel_ui_1.RenderMode.EDIT_CURRENT);
    });
    bot.action(/^product:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        await (0, panel_ui_1.renderPanel)(ctx, { id: "shop.product", params: { productId: ctx.match[1] } }, "replace", panel_ui_1.RenderMode.EDIT_CURRENT);
    });
    async function ownedXrayClient(ctx, id) {
        if (!ctx.from)
            return null;
        const user = await user_service_1.UserService.getByTelegramId(ctx.from.id);
        if (!user)
            return null;
        return prisma_1.prisma.xrayClient.findFirst({ where: { id, userId: user.id }, include: { product: true } });
    }
    bot.action(/^xray:sub:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const client = await ownedXrayClient(ctx, ctx.match[1]);
        if (!client)
            return void await ctx.reply("⚠️ سرویس پیدا نشد.");
        try {
            const url = await xray_service_1.XrayClientService.subscriptionUrl(client);
            await xray_service_1.XrayClientService.subLinks(client.clientSubId).catch(() => null);
            await ctx.reply(`🔗 لینک اشتراک شما\n\n${url}\n\nاین لینک را داخل برنامه‌هایی مثل v2rayNG, Streisand, Hiddify یا Nekobox وارد کنید.`, { reply_markup: { inline_keyboard: [[{ text: "📲 نمایش QR", callback_data: `xray:qr:${client.id}` }, { text: "⚙️ دریافت کانفیگ‌ها", callback_data: `xray:configs:${client.id}` }], [{ text: "🔙 بازگشت", callback_data: (0, panel_ui_1.callbackFor)("account.xray", { xrayClientId: client.id }) }]] } });
        }
        catch (error) {
            await ctx.reply(`⚠️ لینک اشتراک در دسترس نیست\n\n${error instanceof Error ? error.message : "خطای نامشخص"}`);
        }
    });
    bot.action(/^xray:qr:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const client = await ownedXrayClient(ctx, ctx.match[1]);
        if (!client)
            return void await ctx.reply("⚠️ سرویس پیدا نشد.");
        try {
            const url = await xray_service_1.XrayClientService.subscriptionUrl(client);
            const qr = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(url)}`;
            await ctx.replyWithPhoto(qr, { caption: "📲 QR لینک اشتراک\n\nبا اسکن این کد، لینک اشتراک شما در برنامه قابل افزودن است." });
        }
        catch (error) {
            await ctx.reply(`⚠️ ساخت QR ناموفق بود\n\n${error instanceof Error ? error.message : "خطای نامشخص"}`);
        }
    });
    bot.action(/^xray:configs:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery("در حال دریافت کانفیگ‌ها...");
        const client = await ownedXrayClient(ctx, ctx.match[1]);
        if (!client)
            return void await ctx.reply("⚠️ سرویس پیدا نشد.");
        try {
            const raw = await xray_service_1.XrayClientService.links(client.clientEmail);
            const configs = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\r?\n/).filter(Boolean) : Object.values(raw ?? {}).flat().map(String);
            if (!configs.length)
                return void await ctx.reply("⚠️ کانفیگی از پنل دریافت نشد.");
            for (let i = 0; i < configs.length; i++)
                await ctx.reply(`⚙️ کانفیگ ${i + 1}\n\n${configs[i]}`);
            await ctx.reply(`✅ تمام کانفیگ‌های شما ارسال شد.\n\nتعداد کانفیگ‌ها:\n${configs.length.toLocaleString("fa-IR")}`, { reply_markup: { inline_keyboard: [[{ text: "🔗 لینک اشتراک", callback_data: `xray:sub:${client.id}` }, { text: "🔙 بازگشت", callback_data: (0, panel_ui_1.callbackFor)("account.xray", { xrayClientId: client.id }) }]] } });
        }
        catch (error) {
            await ctx.reply(`⚠️ دریافت کانفیگ‌ها ناموفق بود\n\n${error instanceof Error ? error.message : "خطای نامشخص"}`);
        }
    });
    bot.action(/^xray:renew:wallet:([^:]+):([^:]+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from)
            return;
        const user = await user_service_1.UserService.getByTelegramId(ctx.from.id);
        if (!user)
            return;
        try {
            await ctx.editMessageText("⏳ در حال تمدید سرویس از کیف پول...", { reply_markup: { inline_keyboard: [] } });
            const renewal = await payment_service_1.PaymentInvoiceService.renewXrayWithWallet(user.id, ctx.match[1], ctx.match[2]);
            await ctx.reply(`✅ سرویس با موفقیت تمدید شد.\n\nاعتبار جدید: ${renewal.newExpiry.toLocaleDateString("fa-IR")}`, { reply_markup: { inline_keyboard: [[{ text: "🧩 مشاهده سرویس", callback_data: (0, panel_ui_1.callbackFor)("account.xray", { xrayClientId: ctx.match[1] }) }]] } });
        }
        catch (error) {
            await ctx.reply(`⚠️ تمدید ناموفق بود\n\n${error instanceof Error ? error.message : "خطای نامشخص"}`);
        }
    });
    bot.action(/^xray:renew:instant:([^:]+):([^:]+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from)
            return;
        const user = await user_service_1.UserService.getByTelegramId(ctx.from.id);
        if (!user)
            return;
        try {
            const invoice = await payment_service_1.PaymentInvoiceService.createXrayRenewalInvoice(user.id, ctx.match[1], ctx.match[2]);
            await ctx.reply(`🧾 فاکتور تمدید آماده شد\n\n💰 مبلغ: ${invoice.amount.toLocaleString("fa-IR")} تومان\n\nبرای پرداخت روی دکمه زیر بزنید.`, { reply_markup: { inline_keyboard: [[{ text: "⚡ پرداخت", url: invoice.paymentLink ?? "" }], [{ text: "🔙 بازگشت", callback_data: (0, panel_ui_1.callbackFor)("account.xray", { xrayClientId: ctx.match[1] }) }]] } });
        }
        catch (error) {
            await ctx.reply(`⚠️ ایجاد فاکتور تمدید ناموفق بود\n\n${error instanceof Error ? error.message : "خطای نامشخص"}`);
        }
    });
    bot.action(/^coupon:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        await (0, panel_ui_1.renderPanel)(ctx, { id: "shop.product", params: { productId: ctx.match[1] } }, "replace", panel_ui_1.RenderMode.EDIT_CURRENT);
        await ctx.reply("برای اعمال کد تخفیف از دکمه «🎟 اعمال کد تخفیف» در صفحه محصول استفاده کنید.");
    });
    bot.action(/^coupon:remove:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const productId = ctx.match[1];
        if (ctx.session.selectedCoupons?.[productId]) {
            delete ctx.session.selectedCoupons[productId];
            await ctx.reply("✅ کد تخفیف از فاکتور حذف شد.");
        }
        else {
            await ctx.reply("کد تخفیفی روی این فاکتور فعال نیست.");
        }
        await (0, panel_ui_1.renderPanel)(ctx, { id: "shop.checkout", params: { productId } }, "replace", panel_ui_1.RenderMode.EDIT_CURRENT);
    });
    bot.action(/^buy:(?!confirm:|instant:)(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        await (0, panel_ui_1.renderPanel)(ctx, { id: "shop.checkout", params: { productId: ctx.match[1] } }, "replace", panel_ui_1.RenderMode.EDIT_CURRENT);
    });
    bot.action(/^buy:confirm:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from)
            return;
        const user = await user_service_1.UserService.getByTelegramId(ctx.from.id);
        if (!user)
            return;
        const productId = ctx.match[1];
        try {
            await ctx.editMessageText("⏳ در حال بررسی موجودی کیف پول و آماده‌سازی اکانت...", { reply_markup: { inline_keyboard: [] } });
            const coupon = ctx.session.selectedCoupons?.[productId];
            const result = await purchase_service_1.PurchaseService.buyProduct(user.id, productId, coupon);
            delete ctx.session.selectedCoupons?.[productId];
            await ctx.editMessageText("✅ خرید با موفقیت تکمیل شد. اطلاعات اکانت در پیام بعدی ارسال شد.", { reply_markup: { inline_keyboard: [] } });
            await ctx.reply((0, messages_1.purchaseSuccessMessage)({
                productTitle: result.product.title,
                username: result.account.username,
                subscriptionLink: result.account.subscriptionLink,
                config: result.account.configLink,
                expiresAt: result.expiresAt,
            }), { reply_markup: { inline_keyboard: [[{ text: "📦 اکانت‌های من", callback_data: (0, panel_ui_1.callbackFor)("account.details") }, { text: "🛒 خرید مجدد", callback_data: (0, panel_ui_1.callbackFor)("shop.categories") }], [{ text: "🏠 خانه", callback_data: (0, panel_ui_1.callbackFor)("home") }]] } });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "در انجام درخواست مشکلی پیش آمد. لطفاً چند لحظه دیگر دوباره تلاش کنید.";
            if (/کد تخفیف|کوپن|تخفیف/.test(message)) {
                await ctx.reply(`⚠️ کد تخفیف دیگر قابل استفاده نیست\n\nاین کد بعد از اعمال اولیه منقضی یا مصرف شده است.`, { reply_markup: { inline_keyboard: [[{ text: "🎟 کد تخفیف جدید", callback_data: (0, panel_ui_1.actionFor)("flow:start", "coupon_code", productId) }, { text: "🗑 حذف کد تخفیف", callback_data: (0, panel_ui_1.actionFor)("coupon:remove", productId) }], [{ text: "🔙 بازگشت", callback_data: (0, panel_ui_1.callbackFor)("shop.checkout", { productId }) }]] } });
            }
            else {
                await ctx.reply(`⚠️ خرید تکمیل نشد\n\n${message}`, { reply_markup: { inline_keyboard: [[{ text: "💳 شارژ کیف پول", callback_data: (0, panel_ui_1.callbackFor)("deposit") }, { text: "⬅️ بازگشت به پیش‌فاکتور", callback_data: (0, panel_ui_1.callbackFor)("shop.checkout", { productId }) }], [{ text: "🎫 پشتیبانی", callback_data: (0, panel_ui_1.callbackFor)("support") }]] } });
            }
        }
    });
    function freeTestInboundKeyboard(inbounds, selectedIds) {
        const selected = new Set(selectedIds);
        const rows = inbounds.map((inbound) => [{ text: `${selected.has(inbound.id) ? "☑" : "☐"} ${inbound.remark ?? inbound.tag ?? `inbound-${inbound.id}`} | ${inbound.protocol ?? "—"} · port ${inbound.port ?? "—"}`, callback_data: `admin:free_test:inbound:toggle:${inbound.id}` }]);
        rows.push([{ text: "✅ ذخیره اینباندها", callback_data: "admin:free_test:inbounds:save" }]);
        rows.push([{ text: "🔄 بروزرسانی لیست", callback_data: "admin:free_test:inbounds" }, { text: "🔙 بازگشت", callback_data: (0, panel_ui_1.callbackFor)("admin.freeAccounts") }]);
        return { inline_keyboard: rows };
    }
    async function showFreeTestInboundSelector(ctx) {
        const [cfg, inbounds] = await Promise.all([free_account_service_1.FreeAccountService.getXrayConfig(), xray_service_1.XrayClientService.listInbounds()]);
        const selectedIds = cfg.inboundIds.filter((id) => inbounds.some((inbound) => inbound.id === id));
        ctx.session.freeTestInboundSelection = { inboundOptions: JSON.stringify(inbounds), selectedIds };
        const selected = new Set(selectedIds);
        await ctx.reply(`🔗 انتخاب اینباندهای اکانت تست\n\n${inbounds.map((i) => `${selected.has(i.id) ? "☑" : "☐"} ${i.remark ?? i.tag ?? `inbound-${i.id}`} | ${i.protocol ?? "—"}\n${i.protocol ?? "—"} · port ${i.port ?? "—"}`).join("\n\n") || "⚠️ هیچ اینباند زنده‌ای از پنل دریافت نشد."}`, { reply_markup: freeTestInboundKeyboard(inbounds, selectedIds) });
    }
    bot.action("admin:xray:test", async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return;
        const result = await xray_service_1.XrayPanelService.testConnection();
        await ctx.reply(result.ok ? `✅ اتصال موفق\nتعداد اینباندها: ${result.inboundCount.toLocaleString("fa-IR")}` : `⚠️ اتصال ناموفق\n${result.error}`);
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.xraySettings" }, "replace");
    });
    bot.action("admin:free_test:inbounds", async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return;
        try {
            await showFreeTestInboundSelector(ctx);
        }
        catch (error) {
            await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "دریافت اینباندها ناموفق بود"}`);
        }
    });
    bot.action(/^admin:free_test:inbound:toggle:(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return;
        const state = ctx.session.freeTestInboundSelection;
        if (!state)
            return showFreeTestInboundSelector(ctx);
        const id = Number(ctx.match[1]);
        const inbounds = JSON.parse(state.inboundOptions);
        if (!inbounds.some((inbound) => inbound.id === id))
            return void await ctx.reply("⚠️ اینباند انتخابی در لیست زنده وجود ندارد.");
        state.selectedIds = state.selectedIds.includes(id) ? state.selectedIds.filter((item) => item !== id) : [...state.selectedIds, id];
        await ctx.editMessageReplyMarkup(freeTestInboundKeyboard(inbounds, state.selectedIds)).catch(() => undefined);
    });
    bot.action("admin:free_test:inbounds:save", async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return;
        const state = ctx.session.freeTestInboundSelection;
        if (!state?.selectedIds.length)
            return void await ctx.reply("⚠️ حداقل یک اینباند لازم است");
        try {
            await free_account_service_1.FreeAccountService.updateXrayConfig({ inboundIds: state.selectedIds }, String(ctx.from.id));
            ctx.session.freeTestInboundSelection = undefined;
            await ctx.reply("✅ اینباندهای اکانت تست ذخیره شدند.");
            await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.freeAccounts" }, "replace");
        }
        catch (error) {
            await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "ذخیره اینباندها ناموفق بود"}`);
        }
    });
    bot.action(/^admin:free_test:enabled:(0|1)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return;
        try {
            await free_account_service_1.FreeAccountService.updateXrayConfig({ enabled: ctx.match[1] === "1" }, String(ctx.from.id));
        }
        catch (error) {
            await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "خطا"}`);
        }
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.freeAccounts" }, "replace");
    });
    bot.action(/^admin:xray:enabled:(0|1)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return;
        const config = await prisma_1.prisma.xrayPanelConfig.findFirst({ orderBy: { updatedAt: "desc" } });
        if (!config)
            return void await ctx.reply("ابتدا تنظیمات پنل Xray را ثبت کنید.");
        await prisma_1.prisma.xrayPanelConfig.update({ where: { id: config.id }, data: { enabled: ctx.match[1] === "1" } });
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.xraySettings" }, "replace");
    });
    bot.action(/^admin:xray:refresh:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return;
        try {
            const detail = await admin_service_1.AdminService.refreshXrayClient(ctx.match[1]);
            await ctx.reply(`✅ اطلاعات پنل دریافت شد\n${detail.client.clientEmail}`);
        }
        catch (error) {
            await ctx.reply(`⚠️ دریافت اطلاعات پنل ناموفق بود\n${error instanceof Error ? error.message : "خطای نامشخص"}`);
        }
    });
    bot.action(/^buy:instant:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from)
            return;
        const user = await user_service_1.UserService.getByTelegramId(ctx.from.id);
        if (!user)
            return;
        const productId = ctx.match[1];
        try {
            await ctx.editMessageText("⏳ در حال ایجاد فاکتور پرداخت آنی...", { reply_markup: { inline_keyboard: [] } });
            const product = await product_service_1.ProductService.getProduct(productId);
            const coupon = ctx.session.selectedCoupons?.[productId];
            const invoice = await payment_service_1.PaymentInvoiceService.createProductInvoice(user.id, productId, coupon);
            delete ctx.session.selectedCoupons?.[productId];
            await ctx.editMessageText("✅ فاکتور پرداخت آنی ساخته شد. جزئیات پرداخت در پیام بعدی ارسال شد.", { reply_markup: { inline_keyboard: [] } });
            await ctx.reply(`🧾 فاکتور پرداخت آماده شد

📦 سرویس:
${product?.title ?? "-"}

💰 مبلغ:
${invoice.originalAmount.toLocaleString("fa-IR")} تومان
🎟 تخفیف:
${invoice.discountAmount.toLocaleString("fa-IR")} تومان${invoice.couponCode ? `
🏷 کد تخفیف:
${invoice.couponCode}` : ""}
✅ مبلغ نهایی:
${invoice.amount.toLocaleString("fa-IR")} تومان

⚡ روش پرداخت:
پرداخت آنی

برای ادامه، روی دکمه پرداخت بزنید.`, (0, design_system_1.InvoiceActionKeyboard)(invoice.paymentLink ?? "", (0, panel_ui_1.callbackFor)("shop.checkout", { productId })));
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "ایجاد پرداخت ناموفق بود";
            if (/کد تخفیف|کوپن|تخفیف/.test(message)) {
                await ctx.reply(`⚠️ کد تخفیف دیگر قابل استفاده نیست\n\nاین کد بعد از اعمال اولیه منقضی یا مصرف شده است.`, { reply_markup: { inline_keyboard: [[{ text: "🎟 کد تخفیف جدید", callback_data: (0, panel_ui_1.actionFor)("flow:start", "coupon_code", productId) }, { text: "🗑 حذف کد تخفیف", callback_data: (0, panel_ui_1.actionFor)("coupon:remove", productId) }], [{ text: "🔙 بازگشت", callback_data: (0, panel_ui_1.callbackFor)("shop.checkout", { productId }) }]] } });
            }
            else {
                await ctx.reply(`⚠️ ایجاد فاکتور ممکن نیست\n\n${message}`, { reply_markup: { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: (0, panel_ui_1.callbackFor)("shop.checkout", { productId }) }, { text: "🎫 پشتیبانی", callback_data: (0, panel_ui_1.callbackFor)("support") }]] } });
            }
        }
    });
    bot.action(/^admin:product_guide:status:([^:]+):([01])$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery("وضعیت راهنما ذخیره شد");
        await product_guide_service_1.ProductGuideService.setActive(ctx.match[1], ctx.match[2] === "1", String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.productGuides" }, "replace");
    });
    bot.action(/^admin:product_guide:delete:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery("حذف شد");
        await product_guide_service_1.ProductGuideService.delete(ctx.match[1], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.productGuides" }, "replace");
    });
    bot.action(/^admin:public_plans:(enabled|disabled)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery("تنظیمات ذخیره شد");
        await public_plans_service_1.PublicPlansService.setEnabled(ctx.match[1] === "enabled", String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.productGuides" }, "replace");
    });
    bot.action(/^admin:payment_gateway:status:(enabled|disabled)$/, async (ctx) => {
        await ctx.answerCbQuery();
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return void (await ctx.answerCbQuery("دسترسی غیرمجاز"));
        try {
            await payment_service_1.PaymentGatewayService.setEnabled(ctx.match[1] === "enabled", String(ctx.from.id));
            await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.paymentGateway" }, "replace");
        }
        catch (error) {
            await ctx.reply(`❌ ${error instanceof Error ? error.message : "تغییر وضعیت درگاه ناموفق بود"}`);
        }
    });
    bot.action("admin:payment_gateway:test", async (ctx) => {
        await ctx.answerCbQuery("در حال تست اتصال...");
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return void (await ctx.answerCbQuery("دسترسی غیرمجاز"));
        const result = await payment_service_1.PaymentGatewayService.testConnection(String(ctx.from.id));
        await ctx.reply(`${result.message}

جزئیات:
${result.ok ? JSON.stringify(result.details) : result.error}`);
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.paymentGateway" }, "replace");
    });
    bot.action(/^favorite:toggle:(.+)$/, async (ctx) => {
        await ctx.answerCbQuery("علاقه‌مندی‌ها فعلاً از منو حذف شده است");
        await (0, panel_ui_1.renderPanel)(ctx, { id: "shop.product", params: { productId: ctx.match[1] } }, "replace", panel_ui_1.RenderMode.EDIT_CURRENT);
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
            await ctx.reply(`💳 درخواست پرداخت آماده شد

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
📤 پس از پرداخت، تصویر رسید را همین‌جا ارسال کنید.`, { reply_markup: { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: (0, panel_ui_1.actionFor)("flow:back", "deposit", "amount") }, { text: "🏠 خانه", callback_data: (0, panel_ui_1.callbackFor)("home") }], [{ text: "❌ لغو عملیات", callback_data: "flow:cancel" }]] } });
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
            const client = await free_account_service_1.FreeAccountService.claimXray(user.id);
            await ctx.reply(`🎉 اکانت تست Xray شما آماده است

━━━━━━━━━━━━━━━━

👤 شناسه سرویس:
${client.clientEmail}

⏳ اعتبار:
${client.expiresAt.toLocaleDateString("fa-IR")}

📦 این سرویس به بخش «اکانت‌های من» اضافه شد.`, {
                reply_markup: { inline_keyboard: [[{ text: "📦 مشاهده اکانت", callback_data: (0, panel_ui_1.callbackFor)("account.xray", { xrayClientId: client.id }) }], [{ text: "🏠 خانه", callback_data: (0, panel_ui_1.callbackFor)("home") }]] },
            });
        }
        catch (error) {
            const failedProvision = !(error instanceof free_account_service_1.FreeAccountError);
            await ctx.reply(failedProvision ? "درخواست ثبت شد اما ساخت اکانت تست نیازمند بررسی است." : (0, free_account_service_1.formatFreeAccountError)(error), { reply_markup: { inline_keyboard: [[{ text: "📦 اکانت‌های من", callback_data: (0, panel_ui_1.callbackFor)("account.details") }], [{ text: "🎫 پشتیبانی", callback_data: (0, panel_ui_1.callbackFor)("support") }]] } });
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
                    [{ text: "✏️ ویرایش", callback_data: (0, panel_ui_1.actionFor)("flow:start", "free_account_edit", account.id) }],
                    [{ text: "✅ آماده", callback_data: (0, panel_ui_1.actionFor)("admin:free_account:status", account.id, "available") }, { text: "🚫 منقضی/غیرفعال", callback_data: (0, panel_ui_1.actionFor)("admin:free_account:status", account.id, "expired") }],
                    [{ text: "🗑 حذف", callback_data: (0, panel_ui_1.actionFor)("admin:free_account:delete", account.id) }],
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
    bot.action("referral:copy", async (ctx) => {
        await ctx.answerCbQuery("لینک دعوت ارسال شد");
        if (!ctx.from)
            return;
        const user = await user_service_1.UserService.getByTelegramId(ctx.from.id);
        if (!user)
            return;
        const botUsername = process.env.BOT_USERNAME ?? (await ctx.telegram.getMe()).username ?? "BOT";
        const link = `https://t.me/${botUsername}?start=${user.referralCode}`;
        await ctx.reply(`🔗 لینک دعوت شما:

${link}

این لینک را برای دوستانتان ارسال کنید.`);
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
    bot.action(/^forced_join:verify:([^:]+)$/, async (ctx) => {
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

پیام خود را ارسال کنید. محدودیتی در تعداد پیام‌ها وجود ندارد.`, { reply_markup: { inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: (0, panel_ui_1.actionFor)("support:close", ticket.id) }], [{ text: "🏠 خانه", callback_data: (0, panel_ui_1.callbackFor)("home") }]] } });
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
پیام بعدی خود را ارسال کنید.`, { reply_markup: { inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: (0, panel_ui_1.actionFor)("support:close", ticket.id) }], [{ text: "📜 مشاهده تاریخچه", callback_data: (0, panel_ui_1.callbackFor)("support") }]] } });
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

پاسخ خود را ارسال کنید. هر پیام جداگانه برای کاربر ارسال می‌شود.`, { reply_markup: { inline_keyboard: [[{ text: "👁 مشاهده تاریخچه", callback_data: (0, panel_ui_1.callbackFor)("admin.ticket", { ticketId: ticket.id }) }, { text: "✅ بستن", callback_data: (0, panel_ui_1.actionFor)("admin:ticket:close", ticket.id) }], [{ text: "🛡 پنل مدیریت", callback_data: (0, panel_ui_1.callbackFor)("admin.dashboard") }]] } });
    });
    bot.action(/^admin:store:status:(active|inactive)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.setStoreStatus(ctx.match[1], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.store" }, "replace");
    });
    bot.action(/^admin:category:status:([^:]+):([01])$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.setCategoryActive(ctx.match[1], ctx.match[2] === "1", String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.category", params: { categoryId: ctx.match[1] } }, "replace");
    });
    bot.action(/^admin:category:delete:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.deleteCategory(ctx.match[1], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.categories" }, "replace");
    });
    bot.action(/^admin:category:hard_delete:confirm:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await ctx.reply("⚠️ حذف دائمی دسته‌بندی غیرقابل بازگشت است و محصولات وابسته را هم حذف می‌کند.", { reply_markup: { inline_keyboard: [[{ text: "تایید حذف دائمی", callback_data: (0, panel_ui_1.actionFor)("admin:category:hard_delete:force", ctx.match[1]) }, { text: "لغو", callback_data: (0, panel_ui_1.callbackFor)("admin.category", { categoryId: ctx.match[1] }) }]] } });
    });
    bot.action(/^admin:category:hard_delete:force:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.hardDeleteCategory(ctx.match[1], String(ctx.from.id), true);
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.categories" }, "replace");
    });
    bot.action(/^admin:account:status:([^:]+):(available|reserved|sold|disabled|expired)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.setAccountStatus(ctx.match[1], ctx.match[2], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.account", params: { accountId: ctx.match[1] } }, "replace");
    });
    bot.action(/^admin:account:move_to:([^:]+):([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        const account = await admin_service_1.AdminService.moveAccount(ctx.match[1], ctx.match[2], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.account", params: { accountId: account.id } }, "replace");
    });
    bot.action(/^admin:account:delete:confirm:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await ctx.reply("⚠️ این اکانت از موجودی حذف شود؟", { reply_markup: { inline_keyboard: [[{ text: "تایید حذف", callback_data: (0, panel_ui_1.actionFor)("admin:account:delete:force", ctx.match[1]) }, { text: "لغو", callback_data: (0, panel_ui_1.callbackFor)("admin.account", { accountId: ctx.match[1] }) }]] } });
    });
    bot.action(/^admin:account:delete:force:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.deleteAccount(ctx.match[1], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.accounts" }, "replace");
    });
    bot.action(/^admin:wallet:status:([^:]+):(active|inactive)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await admin_service_1.AdminService.setCryptoWalletStatus(ctx.match[1], ctx.match[2], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.wallet", params: { walletId: ctx.match[1] } }, "replace");
    });
    bot.action(/^admin:wallet:delete:confirm:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        await ctx.reply("⚠️ این کیف پول حذف شود؟ اگر پرداخت فعال داشته باشد حذف انجام نمی‌شود.", { reply_markup: { inline_keyboard: [[{ text: "تایید حذف", callback_data: (0, panel_ui_1.actionFor)("admin:wallet:delete:force", ctx.match[1]) }, { text: "لغو", callback_data: (0, panel_ui_1.callbackFor)("admin.wallet", { walletId: ctx.match[1] }) }]] } });
    });
    bot.action(/^admin:wallet:delete:force:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        try {
            await admin_service_1.AdminService.deleteCryptoWallet(ctx.match[1], String(ctx.from.id));
            await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.wallets" }, "replace");
        }
        catch (error) {
            await ctx.reply(error instanceof Error ? `⚠️ ${error.message}` : "⚠️ حذف کیف پول ناموفق بود.");
            await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.wallet", params: { walletId: ctx.match[1] } }, "replace");
        }
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
    bot.action(/^admin:product:duplicate:([^:]+)$/, async (ctx) => {
        if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
            return ctx.answerCbQuery("دسترسی غیرمجاز");
        await ctx.answerCbQuery();
        const product = await admin_service_1.AdminService.duplicateProduct(ctx.match[1], String(ctx.from.id));
        await (0, panel_ui_1.renderPanel)(ctx, { id: "admin.product", params: { productId: product.id } }, "replace");
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
        await ctx.reply("⚠️ حذف دائمی محصول غیرقابل بازگشت است. اگر محصول سفارش فعال داشته باشد با تایید نهایی هم حذف می‌شود.", { reply_markup: { inline_keyboard: [[{ text: "تایید حذف دائمی", callback_data: (0, panel_ui_1.actionFor)("admin:product:hard_delete:force", ctx.match[1]) }, { text: "لغو", callback_data: (0, panel_ui_1.callbackFor)("admin.product", { productId: ctx.match[1] }) }]] } });
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
        if (await handleQuickReplyNavigation(ctx, text))
            return;
        if (await (0, flow_engine_1.handleActiveFlowText)(ctx, text))
            return;
        if (ctx.session.liveTicketId && ctx.session.liveTicketRole) {
            try {
                if (ctx.session.liveTicketRole === "admin") {
                    if (!ctx.from || !(await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id)))
                        return next();
                    await support_service_1.SupportService.addAdminReply(ctx.session.liveTicketId, String(ctx.from.id), text);
                    await ctx.reply("✅ پاسخ ارسال شد. برای ادامه گفتگو، پیام بعدی را ارسال کنید.", { reply_markup: { inline_keyboard: [[{ text: "👁 مشاهده تیکت", callback_data: (0, panel_ui_1.callbackFor)("admin.ticket", { ticketId: ctx.session.liveTicketId }) }, { text: "✅ بستن", callback_data: (0, panel_ui_1.actionFor)("admin:ticket:close", ctx.session.liveTicketId) }]] } });
                    return;
                }
                const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
                if (!user)
                    return next();
                await support_service_1.SupportService.addUserMessage(ctx.session.liveTicketId, user.id, text);
                await ctx.reply("📩 پیام شما ارسال شد. برای ادامه گفتگو، پیام بعدی را ارسال کنید.", { reply_markup: { inline_keyboard: [[{ text: "✅ بستن تیکت", callback_data: (0, panel_ui_1.actionFor)("support:close", ctx.session.liveTicketId) }], [{ text: "🏠 خانه", callback_data: (0, panel_ui_1.callbackFor)("home") }]] } });
                return;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                monitoring_service_1.MonitoringService.record({ type: "TICKET_HANDLER_FAILED", section: "Ticket Handler", description: message, telegramId: ctx.from?.id ? String(ctx.from.id) : undefined, userId: ctx.state.userId, severity: "critical", suggestedAction: "وضعیت تیکت، دسترسی پیام‌رسانی ربات و دیتابیس را بررسی کنید.", metadata: { ticketId: ctx.session.liveTicketId, role: ctx.session.liveTicketRole } });
                await ctx.reply(`⚠️ ${error instanceof Error ? error.message : "ارسال پیام ناموفق بود."}`);
                return;
            }
        }
        return next();
    });
}
