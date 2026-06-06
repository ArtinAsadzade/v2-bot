"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerModernViews = registerModernViews;
const panel_ui_1 = require("../navigation/panel-ui");
const admin_middleware_1 = require("../middlewares/admin.middleware");
const user_service_1 = require("../../modules/user/user.service");
const product_service_1 = require("../../modules/product/product.service");
const admin_service_1 = require("../../modules/admin/admin.service");
const referral_service_1 = require("../../modules/referral/referral.service");
const free_config_service_1 = require("../../modules/rewards/free-config.service");
const free_account_service_1 = require("../../modules/free-account/free-account.service");
const support_service_1 = require("../../modules/support/support.service");
const money = (value) => `${value.toLocaleString("fa-IR")} تومان`;
const page = (params) => Math.max(Number(params.page ?? 1), 1);
const pages = (total, take) => Math.max(Math.ceil(total / take), 1).toLocaleString("fa-IR");
const userLine = (user) => `${user.firstName ?? "کاربر"} ${user.username ? `@${user.username}` : user.telegramId}`;
function registerModernViews() {
    (0, panel_ui_1.registerView)("home", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.findOrCreateUser(ctx) : undefined;
        const isAdmin = ctx.from ? await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id) : false;
        const keyboard = [
            [{ text: "🛍 فروشگاه", action: (0, panel_ui_1.callbackFor)("shop.categories") }, { text: "👤 حساب من", action: (0, panel_ui_1.callbackFor)("account") }],
            [{ text: "💳 کیف پول", action: (0, panel_ui_1.callbackFor)("wallet") }, { text: "➕ شارژ حساب", action: (0, panel_ui_1.callbackFor)("deposit") }],
            [{ text: "🎧 پشتیبانی", action: (0, panel_ui_1.callbackFor)("support") }, { text: "🎁 دعوت دوستان", action: (0, panel_ui_1.callbackFor)("referral") }],
            [{ text: "🆓 اکانت رایگان", action: (0, panel_ui_1.callbackFor)("freeAccount") }],
        ];
        if (isAdmin)
            keyboard.push([{ text: "⚙️ پنل مدیریت", action: (0, panel_ui_1.callbackFor)("admin.dashboard") }]);
        return { text: `سلام ${ctx.from?.first_name ?? "دوست عزیز"} 🌿\n\nبه پنل هوشمند نیمه شب خوش آمدید.\n\nموجودی شما: ${money(user?.balance ?? 0)}\n\nاز منوی زیر انتخاب کنید:`, keyboard };
    });
    (0, panel_ui_1.registerView)("shop.categories", async () => {
        const categories = await product_service_1.ProductService.getCategories();
        return { text: "🛍 فروشگاه\n\nدسته‌بندی مورد نظر را انتخاب کنید:", keyboard: categories.map((category) => [{ text: `📁 ${category.name} (${category.products.length.toLocaleString("fa-IR")})`, action: (0, panel_ui_1.callbackFor)("shop.products", { categoryId: category.id }) }]) };
    });
    (0, panel_ui_1.registerView)("shop.products", async (_ctx, params) => {
        const products = await product_service_1.ProductService.getProductsByCategory(params.categoryId);
        return { text: "📦 محصولات\n\nیک محصول را برای مشاهده جزئیات انتخاب کنید:", keyboard: products.map((product) => [{ text: `${product.title} — ${money(product.price)}`, action: (0, panel_ui_1.callbackFor)("shop.product", { productId: product.id }) }]) };
    });
    (0, panel_ui_1.registerView)("shop.product", async (_ctx, params) => {
        const product = await product_service_1.ProductService.getProduct(params.productId);
        if (!product)
            return { text: "محصول پیدا نشد.", keyboard: [] };
        const stock = await product_service_1.ProductService.availableStock(product.id);
        return { text: `📦 ${product.title}\n\nدسته‌بندی: ${product.category.name}\nمدت سرویس: ${product.duration.toLocaleString("fa-IR")} روز\nقیمت: ${money(product.price)}\nموجودی: ${stock.toLocaleString("fa-IR")} عدد`, keyboard: [[{ text: "🛒 خرید", action: (0, panel_ui_1.callbackFor)("shop.checkout", { productId: product.id }) }], [{ text: "🎟 ثبت کد تخفیف", action: `flow:start:coupon_code:${product.id}` }]] };
    });
    (0, panel_ui_1.registerView)("shop.checkout", async (ctx, params) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        const product = await product_service_1.ProductService.getProduct(params.productId);
        if (!product || !user)
            return { text: "اطلاعات خرید کامل نیست.", keyboard: [] };
        const coupon = ctx.session.selectedCoupons?.[product.id];
        return { text: `🧾 پیش‌فاکتور\n\nمحصول: ${product.title}\nقیمت: ${money(product.price)}\nکد تخفیف: ${coupon ?? "ثبت نشده"}\nموجودی کیف پول: ${money(user.balance)}\n\nبرای تکمیل خرید تایید کنید.`, keyboard: [[{ text: "✅ تایید خرید", action: `buy:confirm:${product.id}` }], [{ text: "🎟 ثبت کد تخفیف", action: `flow:start:coupon_code:${product.id}` }]] };
    });
    (0, panel_ui_1.registerView)("account", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user)
            return { text: "کاربر پیدا نشد.", keyboard: [] };
        const dashboard = await user_service_1.UserService.dashboard(user.id);
        const activeLines = dashboard.activeAccounts.map((item) => {
            const remainingDays = item.expiresAt ? Math.max(Math.ceil((item.expiresAt.getTime() - Date.now()) / 86400000), 0) : 0;
            return `• ${item.product.title}\n  نام کاربری: ${item.deliveredUsername}\n  تاریخ خرید: ${item.purchaseDate.toLocaleDateString("fa-IR")}\n  انقضا: ${item.expiresAt ? item.expiresAt.toLocaleDateString("fa-IR") : "نامحدود"}\n  روز باقی‌مانده: ${remainingDays.toLocaleString("fa-IR")}`;
        });
        return {
            text: `👤 داشبورد حساب کاربری\n\n💳 موجودی کیف پول: ${money(dashboard.user.balance)}\n📦 اکانت‌های فعال: ${dashboard.activeAccounts.length.toLocaleString("fa-IR")}\n🕘 تاریخچه خرید: ${dashboard.recentOrders.length.toLocaleString("fa-IR")} سفارش\n🎁 دعوت‌ها: ${dashboard.referralCount.toLocaleString("fa-IR")} نفر\n💰 پاداش قابل برداشت: ${money(dashboard.pendingReferralAmount)}\n🆓 پاداش‌های رایگان: ${dashboard.freeRewards.toLocaleString("fa-IR")}\n\n📌 اکانت‌های فعال:\n${activeLines.join("\n\n") || "اکانت فعالی ندارید."}`,
            keyboard: [
                [{ text: "📥 دریافت اطلاعات اکانت", action: (0, panel_ui_1.callbackFor)("account.details") }, { text: "🔄 تمدید", action: (0, panel_ui_1.callbackFor)("shop.categories") }],
                [{ text: "🎧 پشتیبانی", action: (0, panel_ui_1.callbackFor)("support") }, { text: "📜 تاریخچه خرید", action: (0, panel_ui_1.callbackFor)("account.history") }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("account.details", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user)
            return { text: "کاربر پیدا نشد.", keyboard: [] };
        const dashboard = await user_service_1.UserService.dashboard(user.id);
        return {
            text: `🔐 اطلاعات اکانت‌های خریداری‌شده\n\n${dashboard.activeAccounts.map((item) => `📦 ${item.product.title}\nنام کاربری:\n${item.deliveredUsername}\nلینک ساب:\n${item.deliveredSubscriptionLink ?? "ثبت نشده"}\nلینک کانفیگ:\n${item.deliveredConfigLink ?? item.deliveredConfig}\nتاریخ انقضا: ${item.expiresAt ? item.expiresAt.toLocaleDateString("fa-IR") : "نامحدود"}`).join("\n\n") || "اکانت فعالی برای نمایش وجود ندارد."}`,
            keyboard: [[{ text: "🎧 پشتیبانی", action: (0, panel_ui_1.callbackFor)("support") }, { text: "🔄 تمدید", action: (0, panel_ui_1.callbackFor)("shop.categories") }]],
        };
    });
    (0, panel_ui_1.registerView)("account.history", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user)
            return { text: "کاربر پیدا نشد.", keyboard: [] };
        const dashboard = await user_service_1.UserService.dashboard(user.id);
        return { text: `📜 تاریخچه خرید\n\n${dashboard.recentOrders.map((order) => `• ${order.product.title} — ${money(order.finalPaidAmount)} — ${order.createdAt.toLocaleDateString("fa-IR")}`).join("\n") || "هنوز خریدی ثبت نشده است."}\n\n⛔️ اکانت‌های منقضی‌شده: ${dashboard.expiredAccounts.length.toLocaleString("fa-IR")}`, keyboard: [[{ text: "🛍 خرید جدید", action: (0, panel_ui_1.callbackFor)("shop.categories") }]] };
    });
    (0, panel_ui_1.registerView)("wallet", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        return { text: `💳 کیف پول\n\nموجودی فعلی: ${money(user?.balance ?? 0)}\n\nبرای افزایش موجودی، شارژ حساب را انتخاب کنید.`, keyboard: [[{ text: "➕ شارژ حساب", action: (0, panel_ui_1.callbackFor)("deposit") }]] };
    });
    (0, panel_ui_1.registerView)("deposit", async () => ({ text: "➕ شارژ حساب\n\nمبلغ شارژ را در یک مرحله امن وارد کنید. بعد از ایجاد درخواست، رسید را ارسال می‌کنید.", keyboard: [[{ text: "شروع شارژ", action: "flow:start:deposit_submit" }]] }));
    (0, panel_ui_1.registerView)("support", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        const tickets = user ? await support_service_1.SupportService.getTicketWithUser("").catch(() => undefined) : undefined;
        void tickets;
        return { text: "🎧 پشتیبانی\n\nبرای ارتباط با تیم پشتیبانی، یک تیکت جدید بسازید یا پاسخ خود را در جریان تیکت ارسال کنید.", keyboard: [[{ text: "✉️ ایجاد تیکت", action: "flow:start:ticket_reply" }]] };
    });
    (0, panel_ui_1.registerView)("referral", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user)
            return { text: "کاربر پیدا نشد.", keyboard: [] };
        const stats = await referral_service_1.ReferralService.getStats(user.id);
        const botUsername = process.env.BOT_USERNAME ?? "BOT";
        return { text: `🎁 دعوت دوستان\n\nکد دعوت شما: ${user.referralCode ?? "در حال ساخت"}\nلینک دعوت:\nhttps://t.me/${botUsername}?start=${user.referralCode}\n\nدعوت‌های موفق: ${stats.totalReferrals.toLocaleString("fa-IR")}\nپاداش آماده برداشت: ${money(stats.pendingAmount)}`, keyboard: [[{ text: "💰 برداشت پاداش", action: "referral:claim" }], [{ text: "🆓 وضعیت اکانت رایگان", action: (0, panel_ui_1.callbackFor)("freeAccount") }]] };
    });
    (0, panel_ui_1.registerView)("freeAccount", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user)
            return { text: "کاربر پیدا نشد.", keyboard: [] };
        const status = await free_config_service_1.FreeConfigService.getStatus(user.id);
        const assigned = await free_account_service_1.FreeAccountService.assignedForUser(user.id);
        return { text: `🆓 اکانت رایگان\n\nدعوت‌های شما: ${status.referralCount.toLocaleString("fa-IR")} از ${status.requiredReferrals.toLocaleString("fa-IR")}\nاکانت‌های اختصاص‌یافته: ${assigned.length.toLocaleString("fa-IR")}\n\n${assigned.map((item) => `• ${item.product.title}\nنام کاربری: ${item.username}\nرمز: ${item.password}\nکانفیگ: ${item.config}`).join("\n\n") || "هنوز اکانت رایگان اختصاص داده نشده است."}`, keyboard: [[{ text: "🎁 مشاهده دعوت دوستان", action: (0, panel_ui_1.callbackFor)("referral") }]] };
    });
    (0, panel_ui_1.registerView)("admin.dashboard", async () => {
        const stats = await admin_service_1.AdminService.dashboard(true);
        return { text: `⚙️ داشبورد مدیریت\n\n👥 کاربران: ${stats.users.toLocaleString("fa-IR")}\n💰 درآمد: ${money(stats.revenue)}\n🧾 سفارش‌ها: ${stats.orders.toLocaleString("fa-IR")}\n🎧 تیکت‌های فعال: ${stats.openTickets.toLocaleString("fa-IR")}\n💳 واریزی‌های منتظر: ${stats.submittedDeposits.toLocaleString("fa-IR")}`, keyboard: [[{ text: "👥 کاربران", action: (0, panel_ui_1.callbackFor)("admin.users") }, { text: "📦 محصولات", action: (0, panel_ui_1.callbackFor)("admin.products") }], [{ text: "🔐 اکانت‌ها", action: (0, panel_ui_1.callbackFor)("admin.accounts") }, { text: "🎁 اکانت رایگان", action: (0, panel_ui_1.callbackFor)("admin.freeAccounts") }], [{ text: "🎟 کوپن‌ها", action: (0, panel_ui_1.callbackFor)("admin.coupons") }, { text: "💳 واریزی‌ها", action: (0, panel_ui_1.callbackFor)("admin.deposits") }], [{ text: "🧾 سفارش‌ها", action: (0, panel_ui_1.callbackFor)("admin.orders") }, { text: "🎧 تیکت‌ها", action: (0, panel_ui_1.callbackFor)("admin.tickets") }], [{ text: "💎 کریپتو", action: (0, panel_ui_1.callbackFor)("admin.crypto") }, { text: "وضعیت فروشگاه", action: (0, panel_ui_1.callbackFor)("admin.store") }], [{ text: "🎁 پاداش دعوت", action: (0, panel_ui_1.callbackFor)("admin.referrals") }, { text: "📊 آمار", action: (0, panel_ui_1.callbackFor)("admin.analytics") }]] };
    });
    (0, panel_ui_1.registerView)("admin.users", async (_ctx, params) => {
        const current = page(params);
        const [users, total] = await admin_service_1.AdminService.listUsers(current);
        const keyboard = users.map((user) => [{ text: `👤 ${userLine(user)} — ${money(user.balance)}`, action: (0, panel_ui_1.callbackFor)("admin.user", { userId: user.id }) }]);
        keyboard.push([{ text: "قبلی", action: (0, panel_ui_1.callbackFor)("admin.users", { page: Math.max(current - 1, 1) }) }, { text: "بعدی", action: (0, panel_ui_1.callbackFor)("admin.users", { page: current + 1 }) }]);
        return { text: `👥 مدیریت کاربران\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard };
    });
    (0, panel_ui_1.registerView)("admin.user", async (_ctx, params) => {
        const profile = await admin_service_1.AdminService.userProfile(params.userId);
        if (!profile.user)
            return { text: "کاربر پیدا نشد.", keyboard: [] };
        return { text: `👤 پروفایل کاربر\n\n${userLine(profile.user)}\nموجودی: ${money(profile.user.balance)}\nدعوت موفق: ${profile.referralCount.toLocaleString("fa-IR")}\nوضعیت: ${profile.user.isBanned ? "مسدود" : "فعال"}\n\nخریدهای اخیر:\n${profile.orders.map((order) => `• ${order.product.title} — ${money(order.totalAmount)}`).join("\n") || "خریدی ندارد"}\n\nتراکنش‌های کیف پول:\n${profile.transactions.map((tx) => `• ${tx.description}: ${money(tx.amount)}`).join("\n") || "تراکنشی ندارد"}`, keyboard: [[{ text: "➕ افزودن موجودی", action: `flow:start:wallet_adjust:${profile.user.id}:credit` }, { text: "➖ کسر موجودی", action: `flow:start:wallet_adjust:${profile.user.id}:debit` }], [{ text: profile.user.isBanned ? "✅ رفع مسدودی" : "⛔ مسدودسازی", action: `admin:user:ban:${profile.user.id}:${profile.user.isBanned ? "0" : "1"}` }], [{ text: "📜 تاریخچه مسدودی", action: (0, panel_ui_1.callbackFor)("admin.user.blocks", { userId: profile.user.id }) }]] };
    });
    (0, panel_ui_1.registerView)("admin.user.blocks", async (_ctx, params) => {
        const history = await admin_service_1.AdminService.userBlockHistory(params.userId);
        return { text: `📜 تاریخچه مسدودی\n\n${history.map((item) => `• ${item.blocked ? "مسدود" : "رفع مسدودی"} — مدیر: ${item.actorId} — ${item.createdAt.toLocaleString("fa-IR")}${item.reason ? ` — ${item.reason}` : ""}`).join("\n") || "تاریخچه‌ای ثبت نشده است."}`, keyboard: [] };
    });
    (0, panel_ui_1.registerView)("admin.products", async (_ctx, params) => {
        const current = page(params);
        const [products, total] = await admin_service_1.AdminService.listProducts(current);
        const keyboard = products.map((product) => [{ text: `📦 ${product.title} — ${money(product.price)}`, action: (0, panel_ui_1.callbackFor)("admin.product", { productId: product.id }) }]);
        keyboard.push([{ text: "➕ محصول جدید", action: "flow:start:product_create" }]);
        keyboard.push([{ text: "قبلی", action: (0, panel_ui_1.callbackFor)("admin.products", { page: Math.max(current - 1, 1) }) }, { text: "بعدی", action: (0, panel_ui_1.callbackFor)("admin.products", { page: current + 1 }) }]);
        return { text: `📦 مدیریت محصولات\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard };
    });
    (0, panel_ui_1.registerView)("admin.product", async (_ctx, params) => {
        const detail = await admin_service_1.AdminService.productDetail(params.productId);
        if (!detail.product)
            return { text: "محصول پیدا نشد.", keyboard: [] };
        return { text: `📦 ${detail.product.title}\n\nدسته‌بندی: ${detail.product.category.name}\nقیمت: ${money(detail.product.price)}\nمدت: ${detail.product.duration.toLocaleString("fa-IR")} روز\nموجودی قابل فروش: ${detail.available.toLocaleString("fa-IR")}\nفروخته‌شده: ${detail.sold.toLocaleString("fa-IR")}\nوضعیت: ${detail.product.isActive ? "فعال" : "غیرفعال"}`, keyboard: [[{ text: "🔐 افزودن اکانت", action: `flow:start:account_create:${detail.product.id}` }, { text: "💰 تغییر قیمت", action: `flow:start:product_price:${detail.product.id}` }], [{ text: detail.product.isActive ? "غیرفعال‌سازی" : "فعال‌سازی", action: `admin:product:active:${detail.product.id}:${detail.product.isActive ? "0" : "1"}` }, { text: "حذف نرم", action: `admin:product:delete:${detail.product.id}` }], [{ text: "حذف دائمی", action: `admin:product:hard_delete:confirm:${detail.product.id}` }]] };
    });
    (0, panel_ui_1.registerView)("admin.accounts", async () => {
        const stats = await admin_service_1.AdminService.accountStats();
        return { text: `🔐 مدیریت اکانت‌ها\n\nاکانت‌های آماده فروش: ${stats.available.toLocaleString("fa-IR")}\nاکانت‌های فروخته‌شده: ${stats.sold.toLocaleString("fa-IR")}\n\nبرای افزودن اکانت، محصول را انتخاب کنید.`, keyboard: stats.products.map((product) => [{ text: `➕ ${product.title}`, action: `flow:start:account_create:${product.id}` }]) };
    });
    (0, panel_ui_1.registerView)("admin.freeAccounts", async () => {
        const stats = await free_account_service_1.FreeAccountService.stats();
        return { text: `🎁 استخر اکانت رایگان\n\nآماده تخصیص: ${stats.available.toLocaleString("fa-IR")}\nتخصیص‌یافته: ${stats.assigned.toLocaleString("fa-IR")}\n\nاکانت رایگان فقط یک‌بار برای هر کاربر قابل دریافت است و از پاداش دعوت جداست.\n\nبرای افزودن اکانت رایگان، محصول را انتخاب کنید.`, keyboard: stats.products.map((product) => [{ text: `➕ ${product.title}`, action: `flow:start:free_account_create:${product.id}` }]) };
    });
    (0, panel_ui_1.registerView)("admin.crypto", async () => {
        const stats = await admin_service_1.AdminService.cryptoWalletStats();
        return {
            text: `💎 مدیریت پرداخت رمز ارزی\n\nحداقل شارژ کیف پول: ${money(stats.setting.minimumTopupAmount)}\n\n${stats.wallets.map((wallet) => `• ${wallet.coinName} — شبکه ${wallet.networkName}\n  وضعیت: ${wallet.status === "active" ? "فعال" : "غیرفعال"}\n  نرخ خودکار: ${wallet.rateToman > 0 ? money(wallet.rateToman) : "در انتظار دریافت"}\n  آخرین بروزرسانی: ${wallet.lastRateAt ? wallet.lastRateAt.toLocaleString("fa-IR") : "-"}\n  آدرس: ${wallet.walletAddress}`).join("\n\n") || "هنوز کیف پولی ثبت نشده است."}`,
            keyboard: [[{ text: "➕ ثبت/ویرایش کیف پول", action: "flow:start:crypto_wallet_create" }], [{ text: "⚙️ حداقل شارژ", action: "flow:start:minimum_topup" }], [{ text: "وضعیت فروشگاه", action: (0, panel_ui_1.callbackFor)("admin.store") }]],
        };
    });
    (0, panel_ui_1.registerView)("admin.store", async () => {
        const stats = await admin_service_1.AdminService.cryptoWalletStats();
        return { text: `وضعیت فروشگاه\n\nوضعیت فعلی: ${stats.setting.storeStatus === "active" ? "فعال" : "غیرفعال"}\n\nوقتی غیرفعال باشد کاربران عادی به قابلیت‌های فروشگاه دسترسی ندارند اما مدیران همچنان دسترسی دارند.`, keyboard: [[{ text: "فعال", action: "admin:store:status:active" }, { text: "غیرفعال", action: "admin:store:status:inactive" }]] };
    });
    (0, panel_ui_1.registerView)("admin.referrals", async () => {
        const tiers = await referral_service_1.ReferralService.listTiers();
        return { text: `🎁 سطوح پاداش دعوت\n\n${tiers.map((tier) => `• ${tier.threshold.toLocaleString("fa-IR")} دعوت ← ${money(tier.amount)} — ${tier.isActive ? "فعال" : "غیرفعال"}`).join("\n") || "سطحی ثبت نشده است."}`, keyboard: [[{ text: "➕ سطح جدید/ویرایش", action: "flow:start:referral_tier_create" }], ...tiers.map((tier) => [{ text: tier.isActive ? `غیرفعال‌سازی ${tier.threshold}` : `فعال‌سازی ${tier.threshold}`, action: `admin:referral:tier:status:${tier.id}:${tier.isActive ? "0" : "1"}` }, { text: `حذف ${tier.threshold}`, action: `admin:referral:tier:delete:${tier.id}` }])] };
    });
    (0, panel_ui_1.registerView)("admin.analytics", async () => {
        const stats = await admin_service_1.AdminService.dashboard(true);
        return { text: `📊 آمار مدیریتی\n\n💰 درآمد: ${money(stats.revenue)}\n📦 اکانت آماده فروش: ${stats.availableAccounts.toLocaleString("fa-IR")}\n✅ اکانت فروخته‌شده: ${stats.soldAccounts.toLocaleString("fa-IR")}\n🎁 مجموع پاداش دعوت: ${money(stats.referralRewards)}\n🆓 پاداش رایگان: ${stats.freeRewards.toLocaleString("fa-IR")}\n💳 واریزی در انتظار: ${stats.submittedDeposits.toLocaleString("fa-IR")}`, keyboard: [] };
    });
    (0, panel_ui_1.registerView)("admin.coupons", async (_ctx, params) => {
        const current = page(params);
        const [coupons, total] = await admin_service_1.AdminService.listCoupons(current);
        return { text: `🎟 مدیریت کوپن‌ها\n\n${coupons.map((coupon) => `• ${coupon.code} — ${coupon.discountPercent.toLocaleString("fa-IR")}% — ${coupon.usedCount.toLocaleString("fa-IR")}/${coupon.maxUses.toLocaleString("fa-IR")}`).join("\n") || "کوپنی ثبت نشده است."}\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard: [[{ text: "➕ کوپن جدید", action: "flow:start:coupon_create" }], [{ text: "قبلی", action: (0, panel_ui_1.callbackFor)("admin.coupons", { page: Math.max(current - 1, 1) }) }, { text: "بعدی", action: (0, panel_ui_1.callbackFor)("admin.coupons", { page: current + 1 }) }]] };
    });
    (0, panel_ui_1.registerView)("admin.deposits", async (_ctx, params) => {
        const current = page(params);
        const [deposits, total] = await admin_service_1.AdminService.listSubmittedDeposits(current);
        return { text: `💳 مدیریت واریزی‌ها\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard: deposits.map((deposit) => [{ text: `💳 ${deposit.user.telegramId} — ${money(deposit.amount)}`, action: (0, panel_ui_1.callbackFor)("admin.deposit", { depositId: deposit.id }) }]) };
    });
    (0, panel_ui_1.registerView)("admin.deposit", async (_ctx, params) => {
        const deposit = await admin_service_1.AdminService.depositDetail(params.depositId);
        if (!deposit)
            return { text: "واریزی پیدا نشد.", keyboard: [] };
        return { text: `💳 جزئیات واریزی\n\nکاربر: ${deposit.user.telegramId}\nمبلغ: ${money(deposit.amount)}\nارز: ${deposit.cryptoType.toUpperCase()}\nوضعیت: ${deposit.status}\nرسید: ${deposit.receipt ? "ثبت شده" : "ثبت نشده"}`, keyboard: [[{ text: "✅ تایید", action: `admin:deposit:approve:${deposit.id}` }, { text: "❌ رد", action: `admin:deposit:reject:${deposit.id}` }]] };
    });
    (0, panel_ui_1.registerView)("admin.orders", async (_ctx, params) => {
        const current = page(params);
        const [orders, total] = await admin_service_1.AdminService.listRecentOrders(current);
        return { text: `🧾 مدیریت سفارش‌ها\n\n${orders.map((order) => `• ${order.id.slice(-6)} — ${order.user.telegramId} — ${order.product.title} — ${money(order.totalAmount)}`).join("\n") || "سفارشی ثبت نشده است."}\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard: [[{ text: "قبلی", action: (0, panel_ui_1.callbackFor)("admin.orders", { page: Math.max(current - 1, 1) }) }, { text: "بعدی", action: (0, panel_ui_1.callbackFor)("admin.orders", { page: current + 1 }) }]] };
    });
    (0, panel_ui_1.registerView)("admin.tickets", async (_ctx, params) => {
        const current = page(params);
        const [tickets, total] = await admin_service_1.AdminService.listOpenTickets(current);
        return { text: `🎧 تیکت‌های فعال\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard: tickets.map((ticket) => [{ text: `🎧 ${ticket.user.telegramId} — ${ticket.id.slice(-6)}`, action: (0, panel_ui_1.callbackFor)("admin.ticket", { ticketId: ticket.id }) }]) };
    });
    (0, panel_ui_1.registerView)("admin.ticket", async (_ctx, params) => {
        const ticket = await support_service_1.SupportService.getTicketWithUser(params.ticketId);
        if (!ticket)
            return { text: "تیکت پیدا نشد.", keyboard: [] };
        return { text: `🎧 تیکت ${ticket.id.slice(-6)}\nکاربر: ${ticket.user.telegramId}\n\n${ticket.messages.map((message) => `${message.senderRole === "admin" ? "ادمین" : "کاربر"}: ${message.message}`).join("\n") || "بدون پیام"}`, keyboard: [[{ text: "↩️ پاسخ", action: `flow:start:ticket_reply:${ticket.id}` }, { text: "✅ بستن", action: `admin:ticket:close:${ticket.id}` }]] };
    });
}
