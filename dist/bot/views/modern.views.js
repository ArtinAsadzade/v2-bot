"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerModernViews = registerModernViews;
const panel_ui_1 = require("../navigation/panel-ui");
const callback_tokens_1 = require("../navigation/callback-tokens");
const admin_middleware_1 = require("../middlewares/admin.middleware");
const user_service_1 = require("../../modules/user/user.service");
const product_service_1 = require("../../modules/product/product.service");
const admin_service_1 = require("../../modules/admin/admin.service");
const referral_service_1 = require("../../modules/referral/referral.service");
const free_account_service_1 = require("../../modules/free-account/free-account.service");
const support_service_1 = require("../../modules/support/support.service");
const coupon_service_1 = require("../../modules/coupon/coupon.service");
const broadcast_service_1 = require("../../modules/broadcast/broadcast.service");
const payment_service_1 = require("../../modules/payment/payment.service");
const product_guide_service_1 = require("../../modules/system/product-guide.service");
const forced_join_service_1 = require("../../modules/system/forced-join.service");
const public_plans_service_1 = require("../../modules/product/public-plans.service");
const xray_service_1 = require("../../modules/xray/xray.service");
const messages_1 = require("../../utils/messages");
const monitoring_service_1 = require("../../services/monitoring.service");
const prisma_1 = require("../../services/prisma");
const divider = "━━━━━━━━━━━━━━━━";
const money = (value) => `${value.toLocaleString("fa-IR")} تومان`;
const page = (params) => Math.max(Number(params.page ?? 1), 1);
const pages = (total, take) => Math.max(Math.ceil(total / take), 1).toLocaleString("fa-IR");
const userLine = (user) => `${user.firstName ?? "کاربر"} ${user.username ? `@${user.username}` : user.telegramId}`;
const stockLabel = (count) => (count > 5 ? "آماده تحویل" : count > 0 ? `فقط ${count.toLocaleString("fa-IR")} عدد` : "ناموجود");
const shortId = (id) => id.slice(-6).toUpperCase();
const freeAccountExpiry = (item) => item.expiresAt ?? (0, free_account_service_1.freeAccountExpiresAt)(item.assignedAt ?? item.createdAt, item.account.durationDays);
const yesNo = (value) => (value ? "فعال ✅" : "غیرفعال ⛔");
const accountStatusLabel = (status) => ({ available: "آماده", reserved: "رزرو", sold: "فروخته", disabled: "غیرفعال", expired: "منقضی" })[status] ?? status;
const walletStatusLabel = (status) => (status === "active" ? "فعال ✅" : "غیرفعال ⛔");
const paymentStatusLabel = (value) => ({ PENDING: "در انتظار بررسی", PAID: "پرداخت‌شده، آماده تحویل", CANCELED: "لغو شده", FAILED: "ناموفق", COMPLETED: "تکمیل شده" }[value] ?? value);
const progressBar = (current, target) => {
    const safeTarget = Math.max(target, 1);
    const filled = Math.min(Math.floor((Math.max(current, 0) / safeTarget) * 10), 10);
    return `${"●".repeat(filled)}${"○".repeat(10 - filled)} ${Math.min(Math.round((current / safeTarget) * 100), 100).toLocaleString("fa-IR")}٪`;
};
const purchasedAccountStatusLabel = (item) => {
    if (item.productAccount?.status === "disabled")
        return "غیرفعال";
    if (item.productAccount?.status === "expired" || !item.isActive || (item.expiresAt && item.expiresAt <= new Date()))
        return "منقضی شده";
    return "فعال";
};
function registerModernViews() {
    (0, panel_ui_1.registerView)("home", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.findOrCreateUser(ctx) : undefined;
        const isAdmin = ctx.from ? await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id) : false;
        const dashboard = user ? await user_service_1.UserService.dashboard(user.id) : undefined;
        const activeCount = (dashboard?.activeAccounts.length ?? 0) + (dashboard?.activeFreeAccounts.length ?? 0);
        const keyboard = [
            [
                { text: "🛒 فروشگاه", action: (0, panel_ui_1.callbackFor)("shop.categories") },
                { text: "📦 اکانت‌های من", action: (0, panel_ui_1.callbackFor)("account.details") },
            ],
            [
                { text: "💳 کیف پول", action: (0, panel_ui_1.callbackFor)("wallet") },
                { text: "🆓 اکانت تست", action: (0, panel_ui_1.callbackFor)("freeAccount") },
            ],
            [
                { text: "📘 راهنما", action: (0, panel_ui_1.callbackFor)("productGuide") },
                { text: "🎫 پشتیبانی", action: (0, panel_ui_1.callbackFor)("support") },
            ],
            [
                { text: "🎁 دعوت دوستان", action: (0, panel_ui_1.callbackFor)("referral") },
                { text: "👤 حساب کاربری", action: (0, panel_ui_1.callbackFor)("account") },
            ],
        ];
        if (isAdmin)
            keyboard.push([{ text: "🛡 پنل مدیریت", action: (0, panel_ui_1.callbackFor)("admin.dashboard") }]);
        return {
            text: `سلام ${ctx.from?.first_name ?? "دوست عزیز"} 🌿

${divider}
🏠 داشبورد کاربر

💰 موجودی کیف پول: ${money(user?.balance ?? 0)}
📦 اکانت‌های فعال: ${activeCount.toLocaleString("fa-IR")}
👥 دعوت‌های موفق: ${(dashboard?.referralCount ?? 0).toLocaleString("fa-IR")} نفر
${divider}

از مسیرهای سریع زیر وارد بخش موردنظر شوید. محصولات فقط از مسیر «فروشگاه ← دسته‌بندی ← محصول» نمایش داده می‌شوند.`,
            keyboard,
            replyKeyboard: "home",
        };
    });
    (0, panel_ui_1.registerView)("admin.xraySettings", async () => {
        const config = await xray_service_1.XrayPanelService.getEnabledConfig();
        const anyConfig = config ?? await prisma_1.prisma.xrayPanelConfig.findFirst({ orderBy: { updatedAt: "desc" } });
        return {
            text: `⚙️ تنظیمات پنل Xray

${divider}
وضعیت: ${anyConfig?.enabled ? "فعال" : "غیرفعال"}
آدرس پنل: ${anyConfig?.apiBaseUrl ?? "ثبت نشده"}
توکن: ${(0, xray_service_1.maskToken)(anyConfig?.apiToken)}
لینک اشتراک: ${anyConfig?.subscriptionBaseUrl ?? "ثبت نشده"}
تعداد اینباندها: ${(anyConfig?.lastInboundCount ?? 0).toLocaleString("fa-IR")}
آخرین تست: ${anyConfig?.lastSuccessAt ? anyConfig.lastSuccessAt.toLocaleString("fa-IR") : "—"}
آخرین خطا: ${anyConfig?.lastError ?? "—"}

توکن کامل هرگز نمایش داده نمی‌شود.`,
            keyboard: [
                [{ text: "🌐 تغییر آدرس پنل", action: "flow:start:xray_panel_setup:apiBaseUrl" }, { text: "🔑 تغییر توکن", action: "flow:start:xray_panel_setup:apiToken" }],
                [{ text: "🔗 تغییر لینک اشتراک", action: "flow:start:xray_panel_setup:subscriptionBaseUrl" }, { text: "✏️ تنظیمات چندخطی", action: "flow:start:xray_panel_setup" }],
                [{ text: "📡 تست اتصال", action: "admin:xray:test" }, { text: anyConfig?.enabled ? "🚫 غیرفعال‌سازی" : "✅ فعال‌سازی", action: `admin:xray:enabled:${anyConfig?.enabled ? "0" : "1"}` }],
                [{ text: "🧩 کلاینت‌های Xray", action: (0, panel_ui_1.callbackFor)("admin.xrayClients") }],
                [{ text: "🔙 بازگشت", action: (0, panel_ui_1.callbackFor)("admin.dashboard") }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.xrayClients", async (_ctx, params) => {
        const current = page(params);
        const status = ["provisioning", "active", "failed", "expired", "missing_on_panel", "deleted", "renewal_failed"].includes(params.status) ? params.status : undefined;
        const productId = params.productId || undefined;
        const [clients, total] = await admin_service_1.AdminService.xrayClientList(current, 8, status, productId);
        const product = productId ? await admin_service_1.AdminService.productDetail(productId).then((detail) => detail.product).catch(() => null) : null;
        const statusLabel = { active: "فعال", provisioning: "در حال ساخت", failed: "ناموفق", expired: "منقضی", missing_on_panel: "حذف‌شده از پنل / نیازمند بررسی" }[status ?? ""] ?? "همه";
        const filterParams = (nextStatus) => ({ ...(productId ? { productId } : {}), ...(nextStatus ? { status: nextStatus } : {}) });
        return {
            text: `${productId ? "🧩 کلاینت‌های ساخته‌شده محصول" : "🧩 کلاینت‌های Xray"}

${divider}
${productId ? `Product:
${product?.title ?? clients[0]?.product?.title ?? productId}\n` : ""}
فیلتر: ${statusLabel}
صفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}

${clients.map((client) => `• ${client.telegramId} · ${client.isFreeTest ? "🆓 اکانت تست" : client.product?.title ?? "سرویس Xray"}
ایمیل: ${client.clientEmail}
وضعیت: ${client.status}
ساخته‌شده: ${client.createdAt.toLocaleString("fa-IR")}
انقضا: ${client.expiresAt.toLocaleDateString("fa-IR")}
اینباندها: ${client.inboundIds.join(", ")}
محدودیت IP: ${(client.limitIp ?? 0).toLocaleString("fa-IR")}
گروه: ${client.groupName ?? "—"}
lastError: ${client.lastError ?? "—"}
${client.status === "missing_on_panel" ? "حذف‌شده از پنل / نیازمند بررسی\n" : ""}`).join("\n\n") || "کلاینتی ثبت نشده است."}`,
            keyboard: [
                [{ text: "همه", action: (0, panel_ui_1.callbackFor)("admin.xrayClients", filterParams()) }, { text: "فعال", action: (0, panel_ui_1.callbackFor)("admin.xrayClients", filterParams("active")) }],
                [{ text: "در حال ساخت", action: (0, panel_ui_1.callbackFor)("admin.xrayClients", filterParams("provisioning")) }, { text: "ناموفق", action: (0, panel_ui_1.callbackFor)("admin.xrayClients", filterParams("failed")) }],
                [{ text: "منقضی", action: (0, panel_ui_1.callbackFor)("admin.xrayClients", filterParams("expired")) }, { text: "حذف‌شده از پنل / نیازمند بررسی", action: (0, panel_ui_1.callbackFor)("admin.xrayClients", filterParams("missing_on_panel")) }],
                ...(productId ? [[{ text: "🔙 بازگشت به محصول", action: (0, panel_ui_1.callbackFor)("admin.product", { productId }) }]] : []),
                ...clients.map((client) => [{ text: `🔄 Refresh ${client.clientEmail.slice(0, 20)}`, action: `admin:xray:refresh:${client.id}` }]),
            ],
        };
    });
    (0, panel_ui_1.registerView)("productGuide", async () => {
        const sections = await product_guide_service_1.ProductGuideService.listActive();
        return {
            replyKeyboard: "home",
            text: `📘 راهنمای محصولات

${divider}

${sections.map((section) => `${section.icon || "🔹"} ${section.title}
${section.shortDescription}

${section.body}`).join(`

${divider}

`) || "در حال حاضر راهنمایی برای نمایش ثبت نشده است."}

${divider}

اگر سوالی دارید، پشتیبانی در کنار شماست.`,
            keyboard: [[{ text: "🛒 فروشگاه", action: (0, panel_ui_1.callbackFor)("shop.categories") }], [{ text: "🎫 پشتیبانی", action: (0, panel_ui_1.callbackFor)("support") }]],
        };
    });
    (0, panel_ui_1.registerView)("shop.categories", async () => {
        const categories = await product_service_1.ProductService.getCategories();
        return {
            replyKeyboard: "shop",
            text: `🛍 فروشگاه نیمه‌شب\n\n${divider}\nدسته‌بندی موردنظر را انتخاب کنید. همه سرویس‌های نمایش‌داده‌شده فعال و آماده تحویل خودکار هستند.`,
            keyboard: [
                [{ text: "🔎 جستجوی محصول", action: "flow:start:product_search" }],
                ...categories.map((category) => [
                    {
                        text: `📁 ${category.name} (${category.products.length.toLocaleString("fa-IR")})`,
                        action: (0, panel_ui_1.callbackFor)("shop.products", { categoryId: category.id }),
                    },
                ]),
            ],
        };
    });
    (0, panel_ui_1.registerView)("shop.products", async (_ctx, params) => {
        const products = await product_service_1.ProductService.getProductsByCategory(params.categoryId);
        return {
            text: `📦 انتخاب سرویس\n\n${divider}\nیک سرویس را انتخاب کنید تا جزئیات، موجودی و پیش‌فاکتور را ببینید.`,
            keyboard: products.map((product) => [
                {
                    text: product.title,
                    action: (0, panel_ui_1.callbackFor)("shop.product", { productId: product.id }),
                },
            ]),
        };
    });
    (0, panel_ui_1.registerView)("shop.searchResults", async (ctx, params) => {
        const query = params.q || ctx.session.productSearchQuery || "";
        const products = await product_service_1.ProductService.searchActiveProducts(query, 10);
        return {
            text: `🔎 نتیجه جستجو\n\nعبارت: ${query || "—"}\n${divider}\n${products.length ? "از نتایج زیر یک محصول را انتخاب کنید:" : "موردی پیدا نشد. لطفاً با نام کوتاه‌تر سرویس یا دسته‌بندی دوباره جستجو کنید."}`,
            keyboard: [
                ...products.map((product) => [
                    {
                        text: product.title,
                        action: (0, panel_ui_1.callbackFor)("shop.product", { productId: product.id }),
                    },
                ]),
                [{ text: "🔎 جستجوی جدید", action: "flow:start:product_search" }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("shop.product", async (ctx, params) => {
        const product = await product_service_1.ProductService.getProduct(params.productId);
        if (!product)
            return { text: (0, messages_1.errorMessage)("محصول در دسترس نیست", "این محصول در حال حاضر قابل خرید نیست.", "لطفاً محصول دیگری را انتخاب کنید."), keyboard: [] };
        const stock = await product_service_1.ProductService.availableStock(product.id);
        ctx.session.recentlyViewedProductIds = [product.id, ...(ctx.session.recentlyViewedProductIds ?? []).filter((id) => id !== product.id)].slice(0, 6);
        return {
            text: `📦 ${product.title}\n\n${divider}\n🏷 دسته‌بندی: ${product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}\n⚙️ نوع محصول: ${product.mode === "xray_auto" ? "ساخت خودکار از پنل Xray" : "موجودی دستی"}\n${product.mode === "xray_auto" ? `📊 حجم: ${(0, xray_service_1.formatXrayBytes)(product.trafficBytes)}\n📅 اعتبار سرویس: ${(product.durationDays ?? product.duration).toLocaleString("fa-IR")} روز` : `📅 اعتبار سرویس: ${product.duration.toLocaleString("fa-IR")} روز`}\n💰 قیمت نهایی: ${money(product.price)}\n🚀 تحویل: فوری و خودکار\n📊 موجودی: ${stockLabel(stock)}\n${divider}\n\nپس از پرداخت، اطلاعات اکانت همین‌جا نمایش داده می‌شود و همیشه از بخش «اکانت‌های من» قابل مشاهده است.`,
            keyboard: [
                ...(stock > 0 ? [[{ text: "✅ ادامه خرید", action: (0, panel_ui_1.callbackFor)("shop.checkout", { productId: product.id }) }]] : []),
                [
                    { text: "🎟 کد تخفیف", action: (0, panel_ui_1.actionFor)("flow:start", "coupon_code", product.id) },
                ],
            ],
        };
    });
    (0, panel_ui_1.registerView)("shop.checkout", async (ctx, params) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        const product = await product_service_1.ProductService.getProduct(params.productId);
        if (!product || !user)
            return { text: "⚠️ اطلاعات خرید کامل نیست. لطفاً دوباره از فروشگاه اقدام کنید.", keyboard: [] };
        const couponCode = ctx.session.selectedCoupons?.[product.id];
        let discountAmount = 0;
        let payableAmount = product.price;
        let couponLine;
        if (couponCode) {
            const validation = await coupon_service_1.CouponService.validateForCheckout({ code: couponCode, userId: user.id, originalAmount: product.price });
            if (validation.ok) {
                discountAmount = validation.discountAmount;
                payableAmount = validation.finalAmount;
                couponLine = validation.coupon.code;
                ctx.session.selectedCoupons = { ...(ctx.session.selectedCoupons ?? {}), [product.id]: validation.coupon.code };
            }
            else {
                delete ctx.session.selectedCoupons?.[product.id];
            }
        }
        const shortage = Math.max(payableAmount - user.balance, 0);
        const gateway = await payment_service_1.PaymentGatewayService.get();
        const keyboard = [];
        if (couponLine)
            keyboard.push([{ text: "🗑 حذف کد تخفیف", action: (0, panel_ui_1.actionFor)("coupon:remove", product.id) }, { text: "🎟 تغییر کد تخفیف", action: (0, panel_ui_1.actionFor)("coupon:change", product.id) }]);
        else
            keyboard.push([{ text: "🎟 افزودن کد تخفیف", action: (0, panel_ui_1.actionFor)("flow:start", "coupon_code", product.id) }]);
        const paymentRow = [{ text: "💳 پرداخت با کیف پول", action: (0, panel_ui_1.actionFor)("buy:confirm", product.id) }];
        if (gateway.enabled)
            paymentRow.push({ text: "⚡ پرداخت آنی", action: (0, panel_ui_1.actionFor)("buy:instant", product.id) });
        keyboard.push(paymentRow, [{ text: "🔙 بازگشت", action: (0, panel_ui_1.callbackFor)("shop.product", { productId: product.id }) }]);
        return {
            text: `🧾 خلاصه سفارش\n\n📦 محصول:\n${product.title}\n\n${couponLine ? `🎟 کد تخفیف:\n${couponLine}\n\n` : ""}💰 مبلغ:\n${money(product.price)}${discountAmount > 0 ? `\n\n🎁 تخفیف:\n${money(discountAmount)}` : ""}\n\n✅ مبلغ نهایی:\n${money(payableAmount)}\n\n💳 موجودی کیف پول:\n${money(user.balance)}${shortage > 0 ? `\n\n⚠️ کسری کیف پول: ${money(shortage)}` : ""}`,
            keyboard,
            navigation: { back: false, home: false },
        };
    });
    (0, panel_ui_1.registerView)("account", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user)
            return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
        const dashboard = await user_service_1.UserService.dashboard(user.id);
        const activeCount = dashboard.activeAccounts.length + dashboard.activeFreeAccounts.length;
        const username = ctx.from?.username ? `@${ctx.from.username}` : user.username ? `@${user.username}` : "ثبت نشده";
        return {
            replyKeyboard: "profile",
            text: `👤 حساب کاربری

${divider}
🆔 Telegram ID: ${user.telegramId}
👤 Username: ${username}
💰 موجودی: ${money(dashboard.user.balance)}
📦 اکانت‌های فعال: ${activeCount.toLocaleString("fa-IR")}
🧾 کل خریدها: ${dashboard.recentOrders.length.toLocaleString("fa-IR")}
${divider}

برای مدیریت حساب، یکی از بخش‌های زیر را انتخاب کنید.`,
            keyboard: [
                [{ text: "📦 اکانت‌های من", action: (0, panel_ui_1.callbackFor)("account.details") }, { text: "💳 کیف پول", action: (0, panel_ui_1.callbackFor)("wallet") }],
                [{ text: "🎁 دعوت دوستان", action: (0, panel_ui_1.callbackFor)("referral") }, { text: "🎫 پشتیبانی", action: (0, panel_ui_1.callbackFor)("support") }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("account.details", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user)
            return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
        await free_account_service_1.FreeAccountService.expireDueAccounts();
        const dashboard = await user_service_1.UserService.dashboard(user.id);
        const activeFreeAccounts = await free_account_service_1.FreeAccountService.assignedForUser(user.id, true);
        const freeXrayClients = await prisma_1.prisma.xrayClient.findMany({ where: { userId: user.id, isFreeTest: true, status: { in: ["active", "provisioning", "creating"] }, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
        for (const client of freeXrayClients) {
            const exists = await xray_service_1.XrayClientService.ensureExistsOrMarkMissing(client).catch(() => ({ exists: true }));
            if (!exists.exists)
                client.status = "missing_on_panel";
        }
        const visibleFreeXrayClients = freeXrayClients.filter((c) => c.status !== "missing_on_panel" && c.status !== "deleted");
        const purchasedAccounts = dashboard.purchasedAccounts;
        const lines = [];
        const keyboard = [];
        let index = 1;
        for (const item of purchasedAccounts) {
            if (item.xrayClient || item.product.mode === "xray_auto") {
                const client = item.xrayClient;
                if (client) {
                    const exists = await xray_service_1.XrayClientService.ensureExistsOrMarkMissing(client).catch(() => ({ exists: true }));
                    if (!exists.exists)
                        continue;
                }
                const days = client ? Math.max(Math.ceil((client.expiresAt.getTime() - Date.now()) / 86400000), 0) : 0;
                lines.push(`${index}. ${item.product.title}\n   وضعیت: ${(0, xray_service_1.normalizeXrayStatus)(client?.status)}\n   اعتبار: ${days.toLocaleString("fa-IR")} روز باقی‌مانده`);
                if (client)
                    keyboard.push([{ text: `🧩 ${item.product.title}`.slice(0, 60), action: (0, panel_ui_1.callbackFor)("account.xray", { xrayClientId: client.id }) }]);
            }
            else {
                const days = item.expiresAt ? Math.max(Math.ceil((item.expiresAt.getTime() - Date.now()) / 86400000), 0) : undefined;
                lines.push(`${index}. ${item.product.title}\n   وضعیت: ${purchasedAccountStatusLabel(item)}\n   اعتبار: ${days === undefined ? "نامحدود" : `${days.toLocaleString("fa-IR")} روز باقی‌مانده`}`);
                keyboard.push([{ text: `🧩 ${item.product.title}`.slice(0, 60), action: (0, panel_ui_1.callbackFor)("account", { accountId: item.id }) }]);
            }
            index++;
        }
        for (const client of visibleFreeXrayClients) {
            const days = Math.max(Math.ceil((client.expiresAt.getTime() - Date.now()) / 86400000), 0);
            lines.push(`${index}. 🆓 اکانت تست\n   وضعیت: ${(0, xray_service_1.normalizeXrayStatus)(client.status)}\n   اعتبار: ${days.toLocaleString("fa-IR")} روز باقی‌مانده`);
            keyboard.push([{ text: `🆓 اکانت تست ${client.clientEmail}`.slice(0, 60), action: (0, panel_ui_1.callbackFor)("account.xray", { xrayClientId: client.id }) }]);
            index++;
        }
        for (const item of activeFreeAccounts) {
            const days = Math.max(Math.ceil((freeAccountExpiry(item).getTime() - Date.now()) / 86400000), 0);
            lines.push(`${index}. اکانت تست قدیمی\n   وضعیت: فعال ✅\n   اعتبار: ${days.toLocaleString("fa-IR")} روز باقی‌مانده`);
            index++;
        }
        return { replyKeyboard: "profile", text: `📦 اکانت‌های من\n\nسرویس‌های فعال شما:\n\n${lines.join("\n\n") || "هنوز اکانتی برای نمایش وجود ندارد."}`, keyboard: [...keyboard, [{ text: "🛒 خرید", action: (0, panel_ui_1.callbackFor)("shop.categories") }, { text: "🎫 پشتیبانی", action: (0, panel_ui_1.callbackFor)("support") }]] };
    });
    (0, panel_ui_1.registerView)("account.xray", async (ctx, params) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user)
            return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
        const client = await prisma_1.prisma.xrayClient.findFirst({ where: { id: params.xrayClientId, userId: user.id }, include: { product: true } });
        if (!client)
            return { text: "⚠️ سرویس Xray پیدا نشد.", keyboard: [[{ text: "🔙 بازگشت", action: (0, panel_ui_1.callbackFor)("account.details") }]] };
        const exists = await xray_service_1.XrayClientService.ensureExistsOrMarkMissing(client).catch(() => ({ exists: true }));
        if (!exists.exists)
            return { text: "این سرویس در پنل فعال نیست و از لیست سرویس‌های فعال حذف شد.", keyboard: [[{ text: "🔙 بازگشت", action: (0, panel_ui_1.callbackFor)("account.details") }, { text: "🎫 پشتیبانی", action: (0, panel_ui_1.callbackFor)("support") }]] };
        let warning = "";
        let traffic = null;
        try {
            traffic = await xray_service_1.XrayClientService.traffic(client.clientEmail);
        }
        catch {
            warning = "\n\n⚠️ اطلاعات مصرف لحظه‌ای در دسترس نیست.";
        }
        try {
            const detail = await xray_service_1.XrayClientService.getClient(client.clientEmail);
            const subId = detail.obj?.subId ?? detail.obj?.client?.subId ?? detail.obj?.sub_id;
            if (subId && subId !== client.clientSubId)
                await prisma_1.prisma.xrayClient.update({ where: { id: client.id }, data: { clientSubId: String(subId) } });
        }
        catch { }
        const snap = (0, xray_service_1.xrayTrafficSnapshot)(traffic, client.trafficBytes, client.usedBytes);
        const days = Math.max(Math.ceil((client.expiresAt.getTime() - Date.now()) / 86400000), 0);
        const status = client.expiresAt <= new Date() ? "منقضی شده ⛔" : (0, xray_service_1.normalizeXrayStatus)(client.status);
        return { text: `🧩 سرویس Xray\n\n📦 سرویس:\n${client.isFreeTest ? "🆓 اکانت تست" : client.product?.title ?? "سرویس Xray"}\n\n👤 شناسه:\n${client.clientEmail}\n\n📊 حجم:\n${(0, xray_service_1.formatXrayBytes)(snap.usedBytes)} / ${(0, xray_service_1.formatXrayBytes)(snap.totalBytes, { unlimitedIfZero: true })}\n\n📉 باقی‌مانده:\n${(0, xray_service_1.formatXrayBytes)(snap.remainingBytes, { unlimitedIfZero: snap.totalBytes === 0n })}\n\n⏳ اعتبار:\n${client.expiresAt.toLocaleDateString("fa-IR")}\n${days.toLocaleString("fa-IR")} روز باقی‌مانده\n\n📌 وضعیت:\n${status}${warning}`, keyboard: [
                [{ text: "🔗 دریافت لینک اشتراک", action: `xray:sub:${client.id}` }, { text: "📲 دریافت QR اشتراک", action: `xray:qr:${client.id}` }],
                client.isFreeTest ? [{ text: "⚙️ دریافت کانفیگ‌ها", action: `xray:configs:${client.id}` }, { text: "🎫 پشتیبانی", action: (0, panel_ui_1.callbackFor)("support") }] : [{ text: "⚙️ دریافت کانفیگ‌ها", action: `xray:configs:${client.id}` }, { text: "🔄 تمدید سرویس", action: (0, panel_ui_1.callbackFor)("account.renew", { xrayClientId: client.id }) }],
                [{ text: "📊 بروزرسانی اطلاعات", action: (0, panel_ui_1.callbackFor)("account.xray", { xrayClientId: client.id }) }, { text: "🎫 پشتیبانی", action: (0, panel_ui_1.callbackFor)("support") }],
                [{ text: "🔙 بازگشت", action: (0, panel_ui_1.callbackFor)("account.details") }],
            ] };
    });
    (0, panel_ui_1.registerView)("account.renew", async (ctx, params) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user)
            return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [], navigation: { back: false, home: false } };
        const client = await prisma_1.prisma.xrayClient.findFirst({ where: { id: params.xrayClientId, userId: user.id }, include: { product: true, order: true, user: true } });
        if (!client)
            return { text: "این سرویس برای تمدید پیدا نشد.", keyboard: [[{ text: "🔙 بازگشت", action: (0, panel_ui_1.callbackFor)("account.details") }]], navigation: { back: false, home: false } };
        const currentProductTitle = client.product?.title ?? "سرویس Xray";
        // Renewal plans are loaded from ProductService with mode: "xray_auto", isActive: true, deletedAt: null, positive traffic/duration, and stockLimit > soldCount.
        const categories = await product_service_1.ProductService.listRenewalCategories(client.id, client.productId);
        const rows = categories.length === 1
            ? categories[0].products.map((product) => [{ text: product.title, action: (0, callback_tokens_1.tokenAction)("xr:r:s", (0, callback_tokens_1.createCallbackToken)(ctx, "renewal", { xrayClientId: client.id, productId: product.id })) }])
            : categories.map((category) => [{ text: `📂 ${category.name}`.slice(0, 60), action: (0, panel_ui_1.callbackFor)("account.renew.products", { xrayClientId: client.id, categoryId: category.id }) }]);
        if (rows.length === 0) {
            return { text: `🔄 تمدید سرویس

📦 سرویس فعلی:
${currentProductTitle}

👤 شناسه:
${client.clientEmail}

در حال حاضر پلنی برای تمدید موجود نیست.`, keyboard: [[{ text: "🛒 فروشگاه", action: (0, panel_ui_1.callbackFor)("shop.categories") }], [{ text: "🎫 پشتیبانی", action: (0, panel_ui_1.callbackFor)("support") }], [{ text: "🔙 بازگشت", action: (0, panel_ui_1.callbackFor)("account.xray", { xrayClientId: client.id }) }]], navigation: { back: false, home: false } };
        }
        return { text: `🔄 تمدید سرویس

📦 سرویس فعلی:
${currentProductTitle}

👤 شناسه:
${client.clientEmail}

لطفاً پلن تمدید را انتخاب کنید:`, keyboard: [...rows, [{ text: "🔙 بازگشت", action: (0, panel_ui_1.callbackFor)("account.xray", { xrayClientId: client.id }) }]], navigation: { back: false, home: false } };
    });
    (0, panel_ui_1.registerView)("account.renew.products", async (ctx, params) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user)
            return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [], navigation: { back: false, home: false } };
        const client = await prisma_1.prisma.xrayClient.findFirst({ where: { id: params.xrayClientId, userId: user.id }, include: { product: true, order: true, user: true } });
        if (!client)
            return { text: "این سرویس برای تمدید پیدا نشد.", keyboard: [[{ text: "🔙 بازگشت", action: (0, panel_ui_1.callbackFor)("account.details") }]], navigation: { back: false, home: false } };
        const currentProductTitle = client.product?.title ?? "سرویس Xray";
        const available = await product_service_1.ProductService.listRenewalProductsByCategory(params.categoryId, client.id, client.productId);
        if (available.length === 0) {
            return { text: `🔄 تمدید سرویس

📦 سرویس فعلی:
${currentProductTitle}

👤 شناسه:
${client.clientEmail}

در حال حاضر پلنی برای تمدید موجود نیست.`, keyboard: [[{ text: "🛒 فروشگاه", action: (0, panel_ui_1.callbackFor)("shop.categories") }], [{ text: "🎫 پشتیبانی", action: (0, panel_ui_1.callbackFor)("support") }], [{ text: "🔙 بازگشت", action: (0, panel_ui_1.callbackFor)("account.renew", { xrayClientId: client.id }) }]], navigation: { back: false, home: false } };
        }
        return { text: `🔄 تمدید سرویس

📦 سرویس فعلی:
${currentProductTitle}

👤 شناسه:
${client.clientEmail}

لطفاً پلن تمدید را انتخاب کنید:`, keyboard: [...available.map((p) => [{ text: p.title, action: (0, callback_tokens_1.tokenAction)("xr:r:s", (0, callback_tokens_1.createCallbackToken)(ctx, "renewal", { xrayClientId: client.id, productId: p.id })) }]), [{ text: "🔙 بازگشت", action: (0, panel_ui_1.callbackFor)("account.renew", { xrayClientId: client.id }) }]], navigation: { back: false, home: false } };
    });
    (0, panel_ui_1.registerView)("account.renew.summary", async (ctx, params) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user)
            return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [], navigation: { back: false, home: false } };
        const quote = await payment_service_1.PaymentInvoiceService.buildXrayRenewalQuote(user.id, params.xrayClientId, params.productId);
        const currentDays = Math.max(Math.ceil((quote.client.expiresAt.getTime() - Date.now()) / 86400000), 0);
        const newRemainingBytes = quote.remainingBytes + quote.addTrafficBytes;
        return { text: `🔄 خلاصه تمدید

📦 سرویس فعلی:
${quote.currentProduct?.title ?? "سرویس Xray"}

👤 شناسه:
${quote.client.clientEmail}

📊 وضعیت فعلی:
مصرف‌شده: ${(0, xray_service_1.formatXrayBytes)(quote.usedBytes)}
حجم کل فعلی: ${(0, xray_service_1.formatXrayBytes)(quote.totalBytes, { unlimitedIfZero: true })}
باقی‌مانده: ${(0, xray_service_1.formatXrayBytes)(quote.remainingBytes)}

⏳ اعتبار فعلی:
${quote.client.expiresAt.toLocaleDateString("fa-IR")}
${currentDays.toLocaleString("fa-IR")} روز باقی‌مانده

➕ پلن تمدید:
${quote.product.title}

📊 حجم اضافه:
${(0, xray_service_1.formatXrayBytes)(quote.addTrafficBytes)}

📅 مدت اضافه:
${quote.addDays.toLocaleString("fa-IR")} روز

━━━━━━━━━━━━━━━━
نتیجه بعد از تمدید:

📊 حجم کل جدید:
${(0, xray_service_1.formatXrayBytes)(quote.newTotalBytes)}

📉 باقی‌مانده جدید:
${(0, xray_service_1.formatXrayBytes)(newRemainingBytes)}

⏳ اعتبار جدید:
${quote.newExpiry.toLocaleDateString("fa-IR")}

💰 مبلغ:
${money(quote.product.price)}${quote.liveOk ? "" : "\n\n⚠️ اطلاعات لحظه‌ای پنل در دسترس نبود؛ محاسبه با داده محلی انجام شد."}`, keyboard: [[{ text: "💳 پرداخت با کیف پول", action: (0, callback_tokens_1.tokenAction)("xr:r:w", (0, callback_tokens_1.createCallbackToken)(ctx, "renewal", { xrayClientId: quote.client.id, productId: quote.product.id })) }, { text: "⚡ پرداخت آنی", action: (0, callback_tokens_1.tokenAction)("xr:r:i", (0, callback_tokens_1.createCallbackToken)(ctx, "renewal", { xrayClientId: quote.client.id, productId: quote.product.id })) }], [{ text: "🔙 بازگشت", action: (0, panel_ui_1.callbackFor)("account.renew.products", { xrayClientId: quote.client.id, categoryId: quote.product.categoryId }) }]], navigation: { back: false, home: false } };
    });
    (0, panel_ui_1.registerView)("account.history", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user)
            return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
        const dashboard = await user_service_1.UserService.dashboard(user.id);
        return {
            text: `🧾 تاریخچه خرید\n\n${dashboard.recentOrders.map((order) => `• #${shortId(order.id)} · ${order.product.title}\n  مبلغ: ${money(order.finalPaidAmount)} · تاریخ: ${order.createdAt.toLocaleDateString("fa-IR")}`).join("\n") || "هنوز خریدی ثبت نشده است."}\n\n⏳ اکانت‌های منقضی‌شده: ${dashboard.expiredAccounts.length.toLocaleString("fa-IR")}`,
            keyboard: [[{ text: "🛒 خرید جدید", action: (0, panel_ui_1.callbackFor)("shop.categories") }]],
        };
    });
    (0, panel_ui_1.registerView)("wallet", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        const dashboard = user ? await user_service_1.UserService.dashboard(user.id) : undefined;
        const recent = dashboard?.walletTransactions.slice(0, 3).map((tx) => `• ${tx.type === "credit" || tx.type === "transfer_in" ? "افزایش" : "کاهش"}: ${money(tx.amount)} · ${tx.createdAt.toLocaleDateString("fa-IR")}`).join("\n") || "تراکنش اخیری ثبت نشده است.";
        return {
            replyKeyboard: "wallet",
            text: `💳 کیف پول

${divider}
💰 موجودی فعلی: ${money(user?.balance ?? 0)}

📜 خلاصه تراکنش‌های اخیر:
${recent}
${divider}

روش شارژ یا گزارش مالی موردنظر را انتخاب کنید.`,
            keyboard: [
                [{ text: "➕ شارژ کیف پول", action: (0, panel_ui_1.callbackFor)("deposit") }, { text: "📜 تاریخچه تراکنش‌ها", action: (0, panel_ui_1.callbackFor)("wallet.history") }],
                [{ text: "⚡ پرداخت آنی", action: "flow:start:instant_topup" }, { text: "💎 شارژ با رمزارز", action: "flow:start:deposit_submit" }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("wallet.history", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user)
            return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
        const dashboard = await user_service_1.UserService.dashboard(user.id);
        return {
            text: `📜 گردش کیف پول\n\n${dashboard.walletTransactions.map((tx) => `${tx.type === "credit" || tx.type === "transfer_in" ? "🟢" : "🔴"} ${tx.description}\n${money(tx.amount)} · ${tx.createdAt.toLocaleString("fa-IR")}`).join("\n\n") || "هنوز تراکنشی ثبت نشده است."}`,
            keyboard: [[{ text: "➕ شارژ کیف پول", action: (0, panel_ui_1.callbackFor)("deposit") }]],
        };
    });
    (0, panel_ui_1.registerView)("deposit", async () => {
        const gateway = await payment_service_1.PaymentGatewayService.get();
        const keyboard = [[{ text: "💎 پرداخت با رمزارز", action: "flow:start:deposit_submit" }]];
        if (gateway.enabled)
            keyboard[0].push({ text: "⚡ پرداخت آنی", action: "flow:start:instant_topup" });
        return {
            text: `➕ شارژ کیف پول

${divider}
💰 مبلغ
در مرحله بعد مبلغ شارژ را وارد می‌کنید.

⚡ روش پرداخت
${gateway.enabled ? "پرداخت آنی و پرداخت با رمزارز فعال هستند." : "در حال حاضر پرداخت با رمزارز فعال است."}

🔒 وضعیت پرداخت
موجودی فقط پس از تأیید نهایی پرداخت به کیف پول اضافه می‌شود.

روش دلخواه را انتخاب کنید.`,
            keyboard,
        };
    });
    (0, panel_ui_1.registerView)("support", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user)
            return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
        const tickets = await support_service_1.SupportService.listUserTickets(user.id);
        const latestOpen = tickets.find((ticket) => ticket.status === "open");
        return {
            replyKeyboard: "support",
            text: `🎫 پشتیبانی

${divider}

💬 برای ارتباط با پشتیبانی وارد گفتگو شوید و پیام خود را ارسال کنید. پاسخ‌ها در همین چت برای شما نمایش داده می‌شود.

📌 وضعیت آخرین تیکت: ${latestOpen ? `باز (#${shortId(latestOpen.id)})` : "تیکت باز ندارید"}

${tickets
                .map((ticket) => `• #${shortId(ticket.id)} · ${ticket.status === "open" ? "باز ✅" : "بسته 🔒"} · ${ticket.updatedAt.toLocaleString("fa-IR")}
  ${ticket.messages[0]?.message ?? "بدون پیام"}`)
                .join("\n") || "هنوز تیکتی ثبت نشده است."}`,
            keyboard: [
                [{ text: latestOpen ? "💬 ادامه گفتگو" : "✉️ ایجاد تیکت جدید", action: "support:chat:start" }],
                ...tickets.slice(0, 3).map((ticket) => [{ text: `👁 تیکت #${shortId(ticket.id)}`, action: `support:chat:${ticket.id}` }]),
            ],
        };
    });
    (0, panel_ui_1.registerView)("referral", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user)
            return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
        const stats = await referral_service_1.ReferralService.getStats(user.id);
        const botUsername = process.env.BOT_USERNAME ?? "BOT";
        const link = `https://t.me/${botUsername}?start=${user.referralCode}`;
        const nextTarget = Math.max(Math.ceil((stats.totalReferrals + 1) / 5) * 5, 5);
        return {
            text: `🎁 دعوت دوستان

${divider}
👥 تعداد دعوت‌ها
${stats.totalReferrals.toLocaleString("fa-IR")} نفر

🎁 پاداش‌های قابل دریافت
${money(stats.pendingAmount)}

📈 پیشرفت تا پاداش بعدی
${progressBar(stats.totalReferrals % nextTarget, nextTarget)}

🔗 لینک دعوت
${link}

کافی است لینک را برای دوستانتان بفرستید. پس از عضویت موفق، پاداش‌ها در همین بخش نمایش داده می‌شوند.`,
            keyboard: [
                [{ text: "💎 دریافت پاداش", action: "referral:claim" }],
                [{ text: "📋 کپی لینک دعوت", action: "referral:copy" }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("freeAccount", async (ctx) => {
        const user = ctx.from ? await user_service_1.UserService.getByTelegramId(ctx.from.id) : undefined;
        if (!user)
            return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
        const e = await free_account_service_1.FreeAccountService.xrayEligibility(user.id);
        const cfg = e.config;
        const blocked = !e.eligible;
        const reason = user.isBanned ? "حساب شما محدود شده است." : !cfg.enabled ? "اکانت تست فعلاً غیرفعال است." : e.active ? "شما یک اکانت تست فعال دارید." : e.nextAvailableAt && e.nextAvailableAt > new Date() ? "شما در ۳۰ روز گذشته اکانت تست دریافت کرده‌اید." : cfg.available <= 0 ? "موجودی اکانت تست تکمیل شده است." : "آماده دریافت";
        return {
            replyKeyboard: "freeAccount",
            text: `🎁 اکانت تست رایگان Xray\n\n${divider}\n\n📌 وضعیت شما:\n${reason}\n\n📅 آخرین دریافت:\n${(0, free_account_service_1.formatFreeAccountDate)(e.lastClaimAt)}\n\n⏳ دریافت بعدی:\n${(0, free_account_service_1.formatFreeAccountDate)(e.nextAvailableAt && e.nextAvailableAt > new Date() ? e.nextAvailableAt : undefined)}\n\n📦 موجودی:\n${cfg.available.toLocaleString("fa-IR")} از ${cfg.stockLimit.toLocaleString("fa-IR")}\n\n📊 حجم تست:\n${(0, xray_service_1.formatXrayBytes)(cfg.trafficBytes)}\n\n📅 مدت:\n${cfg.durationDays.toLocaleString("fa-IR")} روز\n\nاکانت تست به‌صورت خودکار در پنل Xray ساخته می‌شود و از بخش «اکانت‌های من» قابل مشاهده است.`,
            keyboard: blocked ? [[{ text: "📦 اکانت‌های من", action: (0, panel_ui_1.callbackFor)("account.details") }, { text: "🎫 پشتیبانی", action: (0, panel_ui_1.callbackFor)("support") }]] : [[{ text: "✅ دریافت اکانت تست", action: "freeAccount:claim" }]],
        };
    });
    (0, panel_ui_1.registerView)("admin.dashboard", async () => {
        const [stats, paymentStats] = await Promise.all([admin_service_1.AdminService.dashboard(true), payment_service_1.PaymentInvoiceService.stats()]);
        const lowInventory = stats.availableAccounts <= 5 ? `⚠️ ${stats.availableAccounts.toLocaleString("fa-IR")} اکانت آماده` : "عادی ✅";
        return {
            replyKeyboard: "admin",
            text: `📊 داشبورد مدیریت

${divider}
👥 کل کاربران: ${stats.users.toLocaleString("fa-IR")}
📦 اکانت‌های فعال/فروخته: ${stats.soldAccounts.toLocaleString("fa-IR")}
💰 درآمد امروز: ${money(paymentStats.todayRevenue)}
⏳ پرداخت‌های در انتظار: ${paymentStats.pending.toLocaleString("fa-IR")}
🎫 تیکت‌های باز: ${stats.openTickets.toLocaleString("fa-IR")}
🗄 هشدار موجودی کم: ${lowInventory}
🛡 وضعیت سیستم: ساختار مانیتورینگ فعال
${divider}

برای مدیریت، وارد یکی از گروه‌های اصلی شوید.`,
            keyboard: [
                [{ text: "🛒 فروشگاه", action: (0, panel_ui_1.callbackFor)("admin.store") }, { text: "💳 مالی", action: (0, panel_ui_1.callbackFor)("admin.finance") }],
                [{ text: "👥 کاربران و پشتیبانی", action: (0, panel_ui_1.callbackFor)("admin.usersSupport") }, { text: "🛡 مانیتورینگ", action: (0, panel_ui_1.callbackFor)("admin.monitoring") }],
                [{ text: "⚙️ تنظیمات", action: (0, panel_ui_1.callbackFor)("admin.botSettings") }],
                [{ text: "🏠 منوی کاربر", action: (0, panel_ui_1.callbackFor)("home") }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.store", async () => {
        return {
            replyKeyboard: "admin",
            text: `🛒 فروشگاه

${divider}
مدیریت محصولات، دسته‌بندی‌ها، موجودی اکانت‌ها، اکانت تست و راهنمای محصولات از این بخش انجام می‌شود.`,
            keyboard: [
                [{ text: "📦 محصولات", action: (0, panel_ui_1.callbackFor)("admin.products") }, { text: "📂 دسته‌بندی‌ها", action: (0, panel_ui_1.callbackFor)("admin.categories") }],
                [{ text: "🗄 موجودی اکانت‌ها", action: (0, panel_ui_1.callbackFor)("admin.accounts") }, { text: "🧩 کلاینت‌های Xray", action: (0, panel_ui_1.callbackFor)("admin.xrayClients") }],
                [{ text: "⚙️ تنظیمات پنل Xray", action: (0, panel_ui_1.callbackFor)("admin.xraySettings") }, { text: "🆓 اکانت تست", action: (0, panel_ui_1.callbackFor)("admin.freeAccounts") }],
                [{ text: "📘 راهنمای محصولات", action: (0, panel_ui_1.callbackFor)("admin.productGuides") }],
                [{ text: "🏠 منوی کاربر", action: (0, panel_ui_1.callbackFor)("home") }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.finance", async () => {
        const stats = await payment_service_1.PaymentInvoiceService.stats();
        return {
            replyKeyboard: "admin",
            text: `💳 مالی

${divider}
⏳ پرداخت‌های در انتظار: ${stats.pending.toLocaleString("fa-IR")}
✅ پرداخت‌های موفق: ${stats.successful.toLocaleString("fa-IR")}
💰 درآمد امروز: ${money(stats.todayRevenue)}

مدیریت همه ابزارهای مالی از این زیرمنو انجام می‌شود.`,
            keyboard: [
                [{ text: "⚡ پرداخت آنی", action: (0, panel_ui_1.callbackFor)("admin.paymentGateway") }, { text: "💎 واریزی‌های رمزارزی", action: (0, panel_ui_1.callbackFor)("admin.deposits") }],
                [{ text: "💳 کیف پول‌ها", action: (0, panel_ui_1.callbackFor)("admin.wallets") }, { text: "🎟 کدهای تخفیف", action: (0, panel_ui_1.callbackFor)("admin.coupons") }],
                [{ text: "🧾 فاکتورها", action: (0, panel_ui_1.callbackFor)("admin.invoices") }, { text: "💰 تراکنش‌ها", action: (0, panel_ui_1.callbackFor)("admin.transactions") }],
                [{ text: "⚙️ تنظیمات مالی", action: (0, panel_ui_1.callbackFor)("admin.crypto") }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.usersSupport", async () => {
        const stats = await admin_service_1.AdminService.dashboard(true);
        return {
            replyKeyboard: "admin",
            text: `👥 کاربران و پشتیبانی

${divider}
👥 کاربران: ${stats.users.toLocaleString("fa-IR")}
🎫 تیکت‌های باز: ${stats.openTickets.toLocaleString("fa-IR")}
🎁 پاداش دعوت: ${money(stats.referralRewards)}

بخش موردنظر را انتخاب کنید.`,
            keyboard: [
                [{ text: "👥 مدیریت کاربران", action: (0, panel_ui_1.callbackFor)("admin.users") }, { text: "🎫 تیکت‌ها", action: (0, panel_ui_1.callbackFor)("admin.tickets") }],
                [{ text: "🎁 پاداش دعوت", action: (0, panel_ui_1.callbackFor)("admin.referrals") }, { text: "📊 گزارش کاربران", action: (0, panel_ui_1.callbackFor)("admin.analytics") }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.content", async () => {
        return {
            replyKeyboard: "admin",
            text: `📢 محتوا و اطلاع‌رسانی

${divider}
ارسال اطلاعیه، راهنمای محصولات و نمایش عمومی پلن‌ها در این بخش گروه‌بندی شده‌اند.`,
            keyboard: [
                [{ text: "📢 اطلاع‌رسانی", action: (0, panel_ui_1.callbackFor)("admin.notifications") }, { text: "📘 راهنمای محصولات", action: (0, panel_ui_1.callbackFor)("admin.productGuides") }],
                [{ text: "📦 پیام پلن‌ها", action: (0, panel_ui_1.callbackFor)("admin.productGuides") }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.botSettings", async () => {
        const stats = await admin_service_1.AdminService.cryptoWalletStats();
        return {
            replyKeyboard: "settings",
            text: `⚙️ تنظیمات بات

${divider}
🏪 وضعیت فروشگاه: ${stats.setting.storeStatus === "active" ? "فعال ✅" : "غیرفعال ⛔"}
💳 حداقل شارژ: ${money(stats.setting.minimumTopupAmount)}

یادداشت: تغییر یوزرنیم فقط از طریق BotFather امکان‌پذیر است.`,
            keyboard: [
                [{ text: "🏷 نام ربات", action: (0, panel_ui_1.callbackFor)("admin.botSettings") }, { text: "📝 توضیحات", action: (0, panel_ui_1.callbackFor)("admin.botSettings") }],
                [{ text: "🖼 عکس پروفایل", action: (0, panel_ui_1.callbackFor)("admin.botSettings") }, { text: "👤 یوزرنیم", action: (0, panel_ui_1.callbackFor)("admin.botSettings") }],
                [{ text: "🏪 وضعیت فروشگاه", action: (0, panel_ui_1.callbackFor)("admin.settings") }, { text: "📢 عضویت اجباری", action: (0, panel_ui_1.callbackFor)("admin.forcedJoin") }],
                [{ text: "🔐 امنیت", action: (0, panel_ui_1.callbackFor)("admin.forcedJoin") }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.monitoring", async () => {
        const [monitoring, gateway] = await Promise.all([monitoring_service_1.MonitoringService.dashboard(), payment_service_1.PaymentGatewayService.getConfig()]);
        const recentErrors = monitoring.events.slice(0, 5).map((event) => `• ${event.severity === "critical" ? "🚨" : "⚠️"} ${event.section}: ${event.description}`).join("\n") || "خطای اخیری ثبت نشده است.";
        return {
            replyKeyboard: "admin",
            text: `🛡 مانیتورینگ سیستم

${divider}
💳 وضعیت درگاه پرداخت: ${gateway.enabled ? "فعال ✅" : "غیرفعال ⛔"}
🔁 Callback پرداخت: ${monitoring.lastCallbackReceived?.lastCallbackAt ? monitoring.lastCallbackReceived.lastCallbackAt.toLocaleString("fa-IR") : "ثبت نشده"}
🗄 MongoDB: قابل بررسی از اجرای پنل ✅
🤖 Telegram API: وابسته به اتصال ربات

🚨 خطاهای اخیر:
${recentErrors}
${divider}
آخرین پرداخت موفق: ${monitoring.lastSuccessfulPayment?.completedAt ? monitoring.lastSuccessfulPayment.completedAt.toLocaleString("fa-IR") : "—"}
آخرین پرداخت ناموفق: ${monitoring.lastFailedPayment?.updatedAt ? monitoring.lastFailedPayment.updatedAt.toLocaleString("fa-IR") : "—"}`,
            keyboard: [
                [{ text: "🚨 خطاهای اخیر", action: (0, panel_ui_1.callbackFor)("admin.monitoring") }, { text: "💳 خطاهای پرداخت", action: (0, panel_ui_1.callbackFor)("admin.paymentStats") }],
                [{ text: "🎫 خطاهای تیکت", action: (0, panel_ui_1.callbackFor)("admin.tickets") }, { text: "⚙️ وضعیت سرویس‌ها", action: (0, panel_ui_1.callbackFor)("admin.monitoring") }],
                [{ text: "🔄 بروزرسانی", action: (0, panel_ui_1.callbackFor)("admin.monitoring") }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.users", async (_ctx, params) => {
        const current = page(params);
        const [users, total] = await admin_service_1.AdminService.listUsers(current);
        const keyboard = users.map((user) => [
            { text: `👤 ${userLine(user)} · ${money(user.balance)}`, action: (0, panel_ui_1.callbackFor)("admin.user", { userId: user.id }) },
        ]);
        keyboard.push([
            { text: "◀️ قبلی", action: (0, panel_ui_1.callbackFor)("admin.users", { page: Math.max(current - 1, 1) }) },
            { text: "بعدی ▶️", action: (0, panel_ui_1.callbackFor)("admin.users", { page: current + 1 }) },
        ]);
        return { text: `👥 کاربران\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard };
    });
    (0, panel_ui_1.registerView)("admin.user", async (_ctx, params) => {
        const profile = await admin_service_1.AdminService.userProfile(params.userId);
        if (!profile.user)
            return { text: "⚠️ کاربر پیدا نشد.", keyboard: [] };
        return {
            text: `👤 خلاصه حساب شما\n\n${userLine(profile.user)}\nموجودی: ${money(profile.user.balance)}\nدعوت موفق: ${profile.referralCount.toLocaleString("fa-IR")}\nوضعیت: ${profile.user.isBanned ? "مسدود" : "فعال"}\n\nخریدهای اخیر:\n${profile.orders.map((order) => `• ${order.product.title} · ${money(order.totalAmount)}`).join("\n") || "خریدی ندارد"}\n\nتراکنش‌های کیف پول:\n${profile.transactions.map((tx) => `• ${tx.description}: ${money(tx.amount)}`).join("\n") || "تراکنشی ندارد"}`,
            keyboard: [
                [
                    { text: "➕ افزودن موجودی", action: `flow:start:wallet_adjust:${profile.user.id}:credit` },
                    { text: "➖ کسر موجودی", action: `flow:start:wallet_adjust:${profile.user.id}:debit` },
                ],
                [
                    {
                        text: profile.user.isBanned ? "✅ رفع مسدودی" : "⛔ مسدودسازی",
                        action: `admin:user:ban:${profile.user.id}:${profile.user.isBanned ? "0" : "1"}`,
                    },
                ],
                [{ text: "📜 سوابق مسدودی", action: (0, panel_ui_1.callbackFor)("admin.user.blocks", { userId: profile.user.id }) }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.user.blocks", async (_ctx, params) => {
        const history = await admin_service_1.AdminService.userBlockHistory(params.userId);
        return {
            text: `📜 سوابق مسدودی\n\n${history.map((item) => `• ${item.blocked ? "مسدود" : "رفع مسدودی"} · مدیر: ${item.actorId} · ${item.createdAt.toLocaleString("fa-IR")}${item.reason ? ` · ${item.reason}` : ""}`).join("\n") || "سابقه‌ای ثبت نشده است."}`,
            keyboard: [],
        };
    });
    (0, panel_ui_1.registerView)("admin.products", async (_ctx, params) => {
        const current = page(params);
        const [products, total] = await admin_service_1.AdminService.listProducts(current);
        const keyboard = products.map((product) => [
            { text: `📦 ${product.title} · ${money(product.price)}`, action: (0, panel_ui_1.callbackFor)("admin.product", { productId: product.id }) },
        ]);
        keyboard.push([{ text: "➕ محصول جدید", action: "flow:start:product_create" }]);
        keyboard.push([
            { text: "◀️ قبلی", action: (0, panel_ui_1.callbackFor)("admin.products", { page: Math.max(current - 1, 1) }) },
            { text: "بعدی ▶️", action: (0, panel_ui_1.callbackFor)("admin.products", { page: current + 1 }) },
        ]);
        return {
            text: `📦 محصولات

صفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}

${products.map((product) => `• ${product.title}
  دسته‌بندی: ${product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}
  قیمت: ${money(product.price)}
  موجودی: ${product.inventoryCount.toLocaleString("fa-IR")} · فروخته‌شده: ${product.soldCount.toLocaleString("fa-IR")} · فعال: ${product.activeCount.toLocaleString("fa-IR")}`).join("\n\n") || "محصولی ثبت نشده است."}`,
            keyboard,
        };
    });
    (0, panel_ui_1.registerView)("admin.product", async (ctx, params) => {
        const detail = await admin_service_1.AdminService.productDetail(params.productId);
        if (!detail.product)
            return { text: "⚠️ محصول پیدا نشد.", keyboard: [] };
        const isXray = detail.product.mode === "xray_auto";
        const inboundSnapshot = detail.product.inboundSnapshot ? JSON.parse(detail.product.inboundSnapshot) : [];
        if (isXray) {
            return {
                text: `📦 ${detail.product.title}

⚙️ نوع محصول:
ساخت خودکار از پنل Xray

دسته‌بندی: ${detail.product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}
قیمت: ${money(detail.product.price)}
📊 حجم:
${(0, xray_service_1.formatXrayBytes)(detail.product.trafficBytes)}
📅 مدت:
${(detail.product.durationDays ?? detail.product.duration).toLocaleString("fa-IR")} روز
📦 موجودی:
${detail.available.toLocaleString("fa-IR")} از ${(detail.product.stockLimit ?? 0).toLocaleString("fa-IR")}
🌐 محدودیت IP:
${(detail.product.xrayLimitIp ?? 0).toLocaleString("fa-IR")} (${(detail.product.xrayLimitIp ?? 0) === 0 ? "بدون محدودیت" : "IP"})
👥 گروه:
${detail.product.xrayGroupName ?? "بدون گروه"}
فروخته‌شده: ${detail.sold.toLocaleString("fa-IR")}
کلاینت فعال: ${detail.activeCount.toLocaleString("fa-IR")} · ناموفق: ${detail.xrayFailed?.toLocaleString("fa-IR") ?? "۰"} · منقضی: ${detail.expired.toLocaleString("fa-IR")}
وضعیت: ${detail.product.isActive ? "فعال" : "غیرفعال"}

🔗 اینباندها:
${inboundSnapshot.length ? inboundSnapshot.map((i) => `• ${i.remark ?? `inbound-${i.id}`} / ${i.protocol ?? "—"} / ${i.port ?? "—"}`).join("\n") : detail.product.inboundIds.map((id) => `• inbound-${id}`).join("\n")}

تغییر حجم/مدت فقط روی خریدهای بعدی اعمال می‌شود و سرویس‌های قبلی را تغییر نمی‌دهد.
⚠️ تغییر گروه، اینباند و محدودیت IP فقط روی خریدهای جدید اعمال می‌شود.
کلاینت‌های قبلی تغییر نمی‌کنند.`,
                keyboard: [
                    [{ text: "✏️ ویرایش محصول", action: `flow:start:product_edit:${detail.product.id}` }, { text: "📊 تغییر حجم", action: `flow:start:product_edit:${detail.product.id}` }],
                    [{ text: "📅 تغییر مدت", action: `flow:start:product_edit:${detail.product.id}` }, { text: "📦 تغییر موجودی", action: `flow:start:product_edit:${detail.product.id}` }],
                    [{ text: "👥 تغییر گروه", action: (0, callback_tokens_1.tokenAction)("xpg:l:pe", (0, callback_tokens_1.createCallbackToken)(ctx, "xrayPickerProduct", { target: "product_edit", productId: detail.product.id })) }, { text: "🔗 تغییر اینباندها", action: (0, callback_tokens_1.tokenAction)("xpi:l:pe", (0, callback_tokens_1.createCallbackToken)(ctx, "xrayPickerProduct", { target: "product_edit", productId: detail.product.id })) }],
                    [{ text: "🧩 کلاینت‌های ساخته‌شده", action: (0, panel_ui_1.callbackFor)("admin.xrayClients", { productId: detail.product.id }) }],
                    [{ text: detail.product.isActive ? "🚫 غیرفعال" : "✅ فعال", action: `admin:product:active:${detail.product.id}:${detail.product.isActive ? "0" : "1"}` }, { text: "🗑 حذف نرم", action: `admin:product:delete:${detail.product.id}` }],
                    [{ text: "🧨 حذف دائمی", action: `admin:product:hard_delete:confirm:${detail.product.id}` }],
                ],
            };
        }
        return {
            text: `📦 ${detail.product.title}

دسته‌بندی: ${detail.product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}
قیمت: ${money(detail.product.price)}
مدت: ${detail.product.duration.toLocaleString("fa-IR")} روز
موجودی قابل فروش: ${detail.available.toLocaleString("fa-IR")}
فروخته‌شده: ${detail.sold.toLocaleString("fa-IR")}
اکانت فعال: ${detail.activeCount.toLocaleString("fa-IR")}
رزرو: ${detail.reserved.toLocaleString("fa-IR")} · غیرفعال: ${detail.disabled.toLocaleString("fa-IR")} · منقضی: ${detail.expired.toLocaleString("fa-IR")}
وضعیت: ${detail.product.isActive ? "فعال" : "غیرفعال"}`,
            keyboard: [
                [
                    { text: "✏️ ویرایش", action: `flow:start:product_edit:${detail.product.id}` },
                    { text: "📋 کپی محصول", action: `admin:product:duplicate:${detail.product.id}` },
                ],
                [
                    { text: "🔐 افزودن اکانت", action: `flow:start:account_create:${detail.product.id}` },
                    { text: "💰 تغییر قیمت", action: `flow:start:product_price:${detail.product.id}` },
                ],
                [{ text: "🗄 اکانت‌های محصول", action: (0, panel_ui_1.callbackFor)("admin.accounts", { productId: detail.product.id }) }],
                [
                    {
                        text: detail.product.isActive ? "غیرفعال‌سازی" : "فعال‌سازی",
                        action: `admin:product:active:${detail.product.id}:${detail.product.isActive ? "0" : "1"}`,
                    },
                    { text: "🗑 حذف نرم", action: `admin:product:delete:${detail.product.id}` },
                ],
                [{ text: "🧨 حذف دائمی", action: `admin:product:hard_delete:confirm:${detail.product.id}` }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.categories", async (_ctx, params) => {
        const current = page(params);
        const [categories, total] = await admin_service_1.AdminService.listCategories(current);
        return {
            text: `📂 مدیریت دسته‌بندی‌ها\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}\n\n${categories.map((category) => `${category.icon ?? "📂"} ${category.name} · ${yesNo(category.isActive)} · محصول: ${category._count.products.toLocaleString("fa-IR")} · فعال: ${category.activeProductCount.toLocaleString("fa-IR")}`).join("\n") || "دسته‌بندی ثبت نشده است."}`,
            keyboard: [
                [{ text: "➕ دسته‌بندی جدید", action: "flow:start:category_create" }],
                ...categories.map((category) => [
                    { text: `${category.icon ?? "📂"} مدیریت ${category.name}`, action: (0, panel_ui_1.callbackFor)("admin.category", { categoryId: category.id }) },
                ]),
                [
                    { text: "◀️ قبلی", action: (0, panel_ui_1.callbackFor)("admin.categories", { page: Math.max(current - 1, 1) }) },
                    { text: "بعدی ▶️", action: (0, panel_ui_1.callbackFor)("admin.categories", { page: current + 1 }) },
                ],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.category", async (_ctx, params) => {
        const productPage = Math.max(Number(params.productPage ?? 1), 1);
        const detail = await admin_service_1.AdminService.categoryDetail(params.categoryId, productPage, 6);
        if (!detail.category) {
            return { text: "⚠️ دسته‌بندی پیدا نشد.", keyboard: [] };
        }
        return {
            text: `${detail.category.icon ?? "📂"} ${detail.category.name}

توضیحات: ${detail.category.description ?? "—"}
ترتیب نمایش: ${detail.category.displayOrder.toLocaleString("fa-IR")}
وضعیت: ${yesNo(detail.category.isActive)}

📦 محصولات: ${detail.productCount.toLocaleString("fa-IR")}
✅ محصولات فعال: ${detail.activeProductCount.toLocaleString("fa-IR")}
🧾 فروش موفق: ${detail.salesCount.toLocaleString("fa-IR")}

محصولات این دسته:
${detail.products.map((product) => `• ${product.title} · ${product.isActive ? "فعال" : "غیرفعال"} · فروش ${product._count.orders.toLocaleString("fa-IR")}`).join("\n") || "محصولی در این دسته نیست."}`,
            keyboard: [
                [
                    {
                        text: "✏️ ویرایش",
                        action: `flow:start:category_edit:${detail.category.id}`,
                    },
                    {
                        text: detail.category.isActive ? "غیرفعال‌سازی" : "فعال‌سازی",
                        action: `admin:category:status:${detail.category.id}:${detail.category.isActive ? "0" : "1"}`,
                    },
                ],
                [
                    {
                        text: "🗑 حذف نرم",
                        action: `admin:category:delete:${detail.category.id}`,
                    },
                    {
                        text: "🧨 حذف دائمی",
                        action: `admin:category:hard_delete:confirm:${detail.category.id}`,
                    },
                ],
                [
                    {
                        text: "◀️ محصولات قبلی",
                        action: (0, panel_ui_1.callbackFor)("admin.category", {
                            categoryId: detail.category.id,
                            productPage: Math.max(productPage - 1, 1),
                        }),
                    },
                    {
                        text: "محصولات بعدی ▶️",
                        action: (0, panel_ui_1.callbackFor)("admin.category", {
                            categoryId: detail.category.id,
                            productPage: productPage + 1,
                        }),
                    },
                ],
                [
                    {
                        text: "📂 همه دسته‌بندی‌ها",
                        action: (0, panel_ui_1.callbackFor)("admin.categories"),
                    },
                ],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.accounts", async (_ctx, params) => {
        const current = page(params);
        const status = ["available", "reserved", "sold", "disabled", "expired"].includes(params.status)
            ? params.status
            : undefined;
        const productId = params.productId || undefined;
        const [accounts, total] = await admin_service_1.AdminService.listAccounts(current, 8, undefined, status, productId);
        const stats = await admin_service_1.AdminService.accountStats(productId);
        const products = stats.products.slice(0, 10);
        return {
            text: `🗄 مدیریت موجودی اکانت‌ها\n\nکل: ${stats.total.toLocaleString("fa-IR")} · آماده: ${stats.available.toLocaleString("fa-IR")} · رزرو: ${stats.reserved.toLocaleString("fa-IR")} · فروخته: ${stats.sold.toLocaleString("fa-IR")} · غیرفعال: ${stats.disabled.toLocaleString("fa-IR")} · منقضی: ${stats.expired.toLocaleString("fa-IR")}\n${status ? `\nفیلتر وضعیت: ${accountStatusLabel(status)}` : ""}\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}\n\n${accounts.map((account) => `• ${account.username} · ${account.product.title}
  وضعیت: ${accountStatusLabel(account.status)}
  کاربر: ${account.assignedUser ? userLine(account.assignedUser) : "—"}
  تاریخ تخصیص: ${account.assignedDate ? account.assignedDate.toLocaleString("fa-IR") : "—"}`).join("\n") || "اکانتی ثبت نشده است."}`,
            keyboard: [
                [
                    { text: "✅ آماده", action: (0, panel_ui_1.callbackFor)("admin.accounts", { status: "available", productId }) },
                    { text: "⏳ رزرو", action: (0, panel_ui_1.callbackFor)("admin.accounts", { status: "reserved", productId }) },
                    { text: "💰 فروخته", action: (0, panel_ui_1.callbackFor)("admin.accounts", { status: "sold", productId }) },
                ],
                [
                    { text: "⏸ غیرفعال", action: (0, panel_ui_1.callbackFor)("admin.accounts", { status: "disabled", productId }) },
                    { text: "⌛ منقضی", action: (0, panel_ui_1.callbackFor)("admin.accounts", { status: "expired", productId }) },
                    { text: "نمایش همه", action: (0, panel_ui_1.callbackFor)("admin.accounts", { productId }) },
                ],
                ...accounts.map((account) => [{ text: `👁 ${account.username}`, action: (0, panel_ui_1.callbackFor)("admin.account", { accountId: account.id }) }]),
                ...products.map((product) => [{ text: `➕ افزودن به ${product.title}`, action: `flow:start:account_create:${product.id}` }]),
                [
                    { text: "◀️ قبلی", action: (0, panel_ui_1.callbackFor)("admin.accounts", { page: Math.max(current - 1, 1), status, productId }) },
                    { text: "بعدی ▶️", action: (0, panel_ui_1.callbackFor)("admin.accounts", { page: current + 1, status, productId }) },
                ],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.account", async (_ctx, params) => {
        const account = await admin_service_1.AdminService.accountDetail(params.accountId);
        if (!account)
            return { text: "⚠️ اکانت پیدا نشد.", keyboard: [] };
        const history = account.history
            .map((item) => `• ${item.createdAt.toLocaleString("fa-IR")} · ${item.action} · ${item.fromValue ?? "—"} ← ${item.toValue ?? "—"}`)
            .join("\n") || "تاریخچه‌ای ثبت نشده است.";
        return {
            text: `🗄 جزئیات اکانت

👤 نام کاربری: ${account.username}
📦 محصول: ${account.product.title}
📌 وضعیت: ${accountStatusLabel(account.status)}
👥 کاربر: ${account.assignedUser ? userLine(account.assignedUser) : "—"}
📅 تاریخ تخصیص: ${account.assignedDate ? account.assignedDate.toLocaleString("fa-IR") : "—"}

🔗 لینک اشتراک:
${account.subscriptionLink}

⚙️ کانفیگ:
${account.configLink}

📜 تاریخچه:
${history}`,
            keyboard: [
                [
                    { text: "✏️ ویرایش", action: `flow:start:account_edit:${account.id}` },
                    { text: "🚚 انتقال", action: (0, panel_ui_1.callbackFor)("admin.account.move", { accountId: account.id }) },
                ],
                [
                    { text: "✅ آماده", action: `admin:account:status:${account.id}:available` },
                    { text: "⏸ غیرفعال", action: `admin:account:status:${account.id}:disabled` },
                    { text: "⌛ منقضی", action: `admin:account:status:${account.id}:expired` },
                ],
                [
                    { text: "🗑 حذف", action: `admin:account:delete:confirm:${account.id}` },
                    { text: "🗄 موجودی", action: (0, panel_ui_1.callbackFor)("admin.accounts") },
                ],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.account.move", async (_ctx, params) => {
        const account = await admin_service_1.AdminService.accountDetail(params.accountId);
        if (!account)
            return { text: "⚠️ اکانت پیدا نشد.", keyboard: [] };
        const products = await product_service_1.ProductService.listActiveProducts(50);
        return {
            text: `🚚 انتقال اکانت ${account.username}\n\nمحصول فعلی: ${account.product.title}\nمحصول مقصد را انتخاب کنید:`,
            keyboard: [
                ...products
                    .filter((product) => product.id !== account.productId)
                    .map((product) => [{ text: `${product.title} · ${product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}`, action: `admin:account:move_to:${account.id}:${product.id}` }]),
                [{ text: "↩️ بازگشت به اکانت", action: (0, panel_ui_1.callbackFor)("admin.account", { accountId: account.id }) }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.wallets", async (_ctx, params) => {
        const current = page(params);
        const [wallets, total] = await admin_service_1.AdminService.listCryptoWallets(current);
        return {
            text: `💳 مدیریت کیف پول‌ها\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}\n\n${wallets.map((wallet) => `• ${wallet.displayName ?? wallet.coinName} · ${wallet.networkName} · ${walletStatusLabel(wallet.status)}`).join("\n") || "کیف پولی ثبت نشده است."}`,
            keyboard: [
                [{ text: "➕ کیف پول جدید", action: "flow:start:crypto_wallet_create" }],
                ...wallets.map((wallet) => [
                    { text: `👁 ${wallet.displayName ?? wallet.coinName}`, action: (0, panel_ui_1.callbackFor)("admin.wallet", { walletId: wallet.id }) },
                ]),
                [
                    { text: "◀️ قبلی", action: (0, panel_ui_1.callbackFor)("admin.wallets", { page: Math.max(current - 1, 1) }) },
                    { text: "بعدی ▶️", action: (0, panel_ui_1.callbackFor)("admin.wallets", { page: current + 1 }) },
                ],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.wallet", async (_ctx, params) => {
        const detail = await admin_service_1.AdminService.walletDetail(params.walletId);
        if (!detail.wallet)
            return { text: "⚠️ کیف پول پیدا نشد.", keyboard: [] };
        return {
            text: `💳 جزئیات کیف پول\n\nنام: ${detail.wallet.displayName ?? detail.wallet.coinName}\nنماد: ${detail.wallet.coinSymbol ?? detail.wallet.coinName}\nشبکه: ${detail.wallet.networkName}\nوضعیت: ${walletStatusLabel(detail.wallet.status)}\nترتیب: ${detail.wallet.displayOrder.toLocaleString("fa-IR")}\nنرخ: ${detail.wallet.rateToman > 0 ? money(detail.wallet.rateToman) : "—"}\nآخرین نرخ: ${detail.wallet.lastRateAt ? detail.wallet.lastRateAt.toLocaleString("fa-IR") : "—"}\n\nآدرس:\n${detail.wallet.walletAddress}\n\nپرداخت‌های فعال: ${detail.activePayments.toLocaleString("fa-IR")}\nواریزی‌های کل: ${detail.deposits.toLocaleString("fa-IR")}`,
            keyboard: [
                [
                    { text: "✏️ ویرایش", action: `flow:start:crypto_wallet_edit:${detail.wallet.id}` },
                    {
                        text: detail.wallet.status === "active" ? "غیرفعال‌سازی" : "فعال‌سازی",
                        action: `admin:wallet:status:${detail.wallet.id}:${detail.wallet.status === "active" ? "inactive" : "active"}`,
                    },
                ],
                [
                    { text: "🗑 حذف", action: `admin:wallet:delete:confirm:${detail.wallet.id}` },
                    { text: "💳 همه کیف پول‌ها", action: (0, panel_ui_1.callbackFor)("admin.wallets") },
                ],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.freeAccounts", async () => {
        const cfg = await free_account_service_1.FreeAccountService.getXrayConfig();
        const panel = await xray_service_1.XrayPanelService.getEnabledConfig();
        let live = [];
        try {
            live = await xray_service_1.XrayClientService.listInbounds();
        }
        catch { }
        const selected = new Set(cfg.inboundIds);
        const snapshot = cfg.inboundSnapshot ? JSON.parse(cfg.inboundSnapshot) : live.filter((i) => selected.has(i.id));
        return {
            text: `🆓 مدیریت اکانت تست

${divider}

وضعیت: ${cfg.enabled ? "فعال ✅" : "غیرفعال ⛔"}
پنل Xray: ${panel ? "فعال ✅" : "غیرفعال ⛔"}

📊 حجم تست:
${(0, xray_service_1.formatXrayBytes)(cfg.trafficBytes)}

📅 مدت:
${cfg.durationDays.toLocaleString("fa-IR")} روز

📦 موجودی:
${cfg.available.toLocaleString("fa-IR")} از ${cfg.stockLimit.toLocaleString("fa-IR")}
مصرف‌شده: ${cfg.usedCount.toLocaleString("fa-IR")}

🌐 محدودیت IP:
${(cfg.limitIp ?? 0).toLocaleString("fa-IR")} (${(cfg.limitIp ?? 0) === 0 ? "بدون محدودیت" : "IP"})

👥 گروه:
${cfg.groupName ?? "بدون گروه"}

🔗 اینباندهای انتخاب‌شده:
${snapshot.map((i) => `• ${i.remark ?? i.tag ?? i.id} / ${i.protocol ?? "—"} / ${i.port ?? "—"}`).join("\n") || "انتخاب نشده"}

اینباندهای زنده پنل: ${live.length.toLocaleString("fa-IR")}${cfg.inboundIds.length ? "" : "\n\nبرای فعال‌سازی اکانت تست، از دکمه «🔗 انتخاب اینباندها» حداقل یک اینباند انتخاب کنید."}`,
            keyboard: [
                [{ text: "📊 تغییر حجم", action: "flow:start:free_test_config:trafficGB" }, { text: "📅 تغییر مدت", action: "flow:start:free_test_config:durationDays" }],
                [{ text: "📦 تغییر موجودی", action: "flow:start:free_test_config:stockLimit" }, { text: "🌐 تغییر محدودیت IP", action: "flow:start:free_test_config:limitIp" }],
                [{ text: "👥 انتخاب گروه", action: "admin:xray_picker:group:free_test" }, { text: "🔗 انتخاب اینباندها", action: "admin:xray_picker:inbounds:free_test" }],
                [{ text: cfg.enabled ? "🚫 غیرفعال‌سازی" : "✅ فعال‌سازی", action: `admin:free_test:enabled:${cfg.enabled ? "0" : "1"}` }, { text: "🔄 بروزرسانی اینباندها", action: "admin:xray_picker:inbounds:free_test" }],
                [{ text: "🔙 بازگشت", action: (0, panel_ui_1.callbackFor)("admin.dashboard") }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.crypto", async () => {
        const stats = await admin_service_1.AdminService.cryptoWalletStats();
        return {
            text: `⚙️ تنظیمات مالی و پرداخت

حداقل شارژ کیف پول: ${money(stats.setting.minimumTopupAmount)}
کیف پول‌های ثبت‌شده: ${stats.wallets.length.toLocaleString("fa-IR")}`,
            keyboard: [
                [{ text: "💳 مدیریت کیف پول‌ها", action: (0, panel_ui_1.callbackFor)("admin.wallets") }],
                [
                    { text: "⚙️ حداقل شارژ", action: "flow:start:minimum_topup" },
                    { text: "⚙️ وضعیت فروشگاه", action: (0, panel_ui_1.callbackFor)("admin.store") },
                ],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.forcedJoin", async (ctx) => {
        const channels = await admin_service_1.AdminService.forcedJoinChannels();
        const botInfo = await ctx.telegram.getMe().catch(() => null);
        if (botInfo) {
            await Promise.all(channels.map(async (channel) => {
                try {
                    const member = await ctx.telegram.getChatMember(channel.chatId, botInfo.id);
                    if (member.status !== channel.lastBotAdminStatus)
                        await forced_join_service_1.ForcedJoinService.updateBotAdminStatus(channel.id, member.status);
                    channel.lastBotAdminStatus = member.status;
                }
                catch {
                    if (channel.lastBotAdminStatus !== "unknown")
                        await forced_join_service_1.ForcedJoinService.updateBotAdminStatus(channel.id, "unknown").catch(() => undefined);
                    channel.lastBotAdminStatus = "unknown";
                }
            }));
        }
        const activeCount = channels.filter((channel) => channel.status === "active").length;
        const inactiveCount = channels.length - activeCount;
        const channelLines = channels
            .map((channel, index) => `• ${index + 1}. ${channel.title}
  شناسه: ${channel.chatId}
  وضعیت: ${channel.status === "active" ? "✅ فعال" : "⛔ غیرفعال"}
  لینک: ${channel.inviteLink || (channel.chatId.startsWith("@") ? `https://t.me/${channel.chatId.slice(1)}` : "ثبت نشده")}
  وضعیت ادمین ربات: ${channel.lastBotAdminStatus ?? "نیازمند بررسی"}${channel.lastBotAdminStatus && channel.lastBotAdminStatus !== "administrator" && channel.lastBotAdminStatus !== "creator" ? " ⚠️" : ""}`)
            .join("\n\n");
        return {
            text: `📢 مدیریت عضویت اجباری

کانال فعال: ${activeCount.toLocaleString("fa-IR")} · غیرفعال: ${inactiveCount.toLocaleString("fa-IR")}

${channelLines || "کانالی ثبت نشده است."}

کاربران بدون ارسال دوباره /start می‌توانند با دکمه «✅ عضو شدم» همان لحظه تایید شوند.`,
            keyboard: [
                [{ text: "➕ افزودن کانال", action: "flow:start:forced_join_create" }],
                ...channels.map((channel) => [
                    {
                        text: channel.status === "active" ? `غیرفعال‌سازی ${channel.title}` : `فعال‌سازی ${channel.title}`,
                        action: `admin:forced_join:status:${channel.id}:${channel.status === "active" ? "inactive" : "active"}`,
                    },
                    { text: "🗑 حذف", action: `admin:forced_join:delete:${channel.id}` },
                ]),
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.productGuides", async () => {
        const [sections, plansSetting] = await Promise.all([product_guide_service_1.ProductGuideService.listAll(), public_plans_service_1.PublicPlansService.getSetting()]);
        return {
            text: `📘 راهنمای محصولات

${divider}

${sections.map((section, index) => `${index + 1}. ${section.icon} ${section.title}
  توضیح: ${section.shortDescription}
  ترتیب: ${section.displayOrder.toLocaleString("fa-IR")} · وضعیت: ${section.isActive ? "✅ فعال" : "⛔ غیرفعال"}`).join("\n\n") || "هنوز بخشی ثبت نشده است."}

${divider}

نمایش پلن‌ها در گروه‌ها: ${plansSetting.enabled ? "✅ فعال" : "⛔ غیرفعال"}`,
            keyboard: [
                [{ text: "➕ ساخت بخش راهنما", action: "flow:start:product_guide_create" }],
                ...sections.map((section) => [
                    { text: `✏️ ${section.title}`, action: `flow:start:product_guide_edit:${section.id}` },
                    { text: section.isActive ? "⛔ غیرفعال" : "✅ فعال", action: `admin:product_guide:status:${section.id}:${section.isActive ? "0" : "1"}` },
                    { text: "🗑 حذف", action: `admin:product_guide:delete:${section.id}` },
                ]),
                [{ text: plansSetting.enabled ? "⛔ غیرفعال‌سازی /plans" : "✅ فعال‌سازی /plans", action: `admin:public_plans:${plansSetting.enabled ? "disabled" : "enabled"}` }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.referrals", async () => {
        const tiers = await referral_service_1.ReferralService.listTiers();
        return {
            text: `🎁 مدیریت دعوت دوستان\n\n${tiers.map((tier) => `• ${tier.threshold.toLocaleString("fa-IR")} دعوت ← ${money(tier.amount)} · ${tier.isActive ? "فعال" : "غیرفعال"}`).join("\n") || "سطحی ثبت نشده است."}`,
            keyboard: [
                [{ text: "➕ سطح جدید/ویرایش", action: "flow:start:referral_tier_create" }],
                ...tiers.map((tier) => [
                    {
                        text: tier.isActive ? `غیرفعال‌سازی ${tier.threshold}` : `فعال‌سازی ${tier.threshold}`,
                        action: `admin:referral:tier:status:${tier.id}:${tier.isActive ? "0" : "1"}`,
                    },
                    { text: `حذف ${tier.threshold}`, action: `admin:referral:tier:delete:${tier.id}` },
                ]),
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.analytics", async () => {
        const stats = await admin_service_1.AdminService.dashboard(true);
        return {
            text: `📊 آمار عملیاتی\n\n💰 درآمد موفق: ${money(stats.revenue)}\n📦 اکانت آماده فروش: ${stats.availableAccounts.toLocaleString("fa-IR")}\n✅ اکانت فروخته‌شده: ${stats.soldAccounts.toLocaleString("fa-IR")}\n🎁 مجموع پاداش دعوت: ${money(stats.referralRewards)}\n🎁 اکانت تست تخصیص‌یافته: ${stats.freeAccountsAssigned.toLocaleString("fa-IR")}\n💳 واریزی در انتظار: ${stats.submittedDeposits.toLocaleString("fa-IR")}`,
            keyboard: [],
        };
    });
    (0, panel_ui_1.registerView)("admin.coupons", async (_ctx, params) => {
        const current = page(params);
        const [coupons, total] = await admin_service_1.AdminService.listCoupons(current);
        return {
            text: `🎟 مدیریت کوپن‌ها\n\n${coupons.map((coupon) => `• ${coupon.code} · ${coupon.type === "percentage" ? `${(coupon.value || coupon.discountPercent || 0).toLocaleString("fa-IR")}%` : money(coupon.value)} · ${coupon.status} · ${coupon.usedCount.toLocaleString("fa-IR")}/${coupon.maxUses.toLocaleString("fa-IR")} · هر کاربر ${coupon.perUserLimit.toLocaleString("fa-IR")}`).join("\n") || "کوپنی ثبت نشده است."}\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`,
            keyboard: [
                [{ text: "➕ کوپن جدید", action: "flow:start:coupon_create" }],
                ...coupons.map((coupon) => [{ text: `مدیریت ${coupon.code}`, action: (0, panel_ui_1.callbackFor)("admin.coupon", { couponId: coupon.id }) }]),
                [
                    { text: "◀️ قبلی", action: (0, panel_ui_1.callbackFor)("admin.coupons", { page: Math.max(current - 1, 1) }) },
                    { text: "بعدی ▶️", action: (0, panel_ui_1.callbackFor)("admin.coupons", { page: current + 1 }) },
                ],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.coupon", async (_ctx, params) => {
        const direct = await admin_service_1.AdminService.couponDetail(params.couponId);
        if (!direct)
            return { text: "⚠️ کوپن پیدا نشد.", keyboard: [] };
        const expired = direct.expiresAt <= new Date();
        const activeLabel = direct.status === "active" && !expired && !direct.deletedAt ? "فعال ✅" : expired ? "⛔ منقضی شده" : direct.status === "deleted" || direct.deletedAt ? "حذف‌شده" : "غیرفعال ⛔";
        return {
            text: `🎟 جزئیات کوپن ${direct.code}\n\nوضعیت: ${activeLabel}\nفعال/غیرفعال: ${direct.status === "active" && !expired && !direct.deletedAt ? "فعال" : "غیرفعال"}\nانقضا: ${expired ? "⛔ منقضی شده" : "منقضی نشده"}\nexpiresAt: ${direct.expiresAt.toLocaleString("fa-IR")}\nusedCount/maxUses: ${direct.usedCount.toLocaleString("fa-IR")}/${direct.maxUses.toLocaleString("fa-IR")}\nperUserLimit: ${direct.perUserLimit.toLocaleString("fa-IR")}\nminimumPurchaseAmount: ${money(direct.minimumPurchaseAmount)}\nنوع: ${direct.type === "percentage" ? "درصدی" : "مبلغ ثابت"}\nمقدار: ${direct.type === "percentage" ? `${(direct.value || direct.discountPercent || 0).toLocaleString("fa-IR")}%` : money(direct.value)}`,
            keyboard: [
                [
                    { text: "✏️ ویرایش", action: `flow:start:coupon_edit:${direct.id}` },
                    {
                        text: direct.status === "active" ? "⛔ غیرفعال" : "✅ فعال",
                        action: `admin:coupon:status:${direct.id}:${direct.status === "active" ? "inactive" : "active"}`,
                    },
                ],
                [
                    { text: "🗑 حذف نرم", action: `admin:coupon:soft_delete:${direct.id}` },
                    { text: "🧨 حذف دائمی", action: `admin:coupon:hard_delete:${direct.id}` },
                ],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.transactions", async () => {
        const stats = await admin_service_1.AdminService.dashboard(true);
        return {
            text: `💰 تراکنش‌ها

واریزی‌های منتظر بررسی: ${stats.submittedDeposits.toLocaleString("fa-IR")}
سفارش‌ها: ${stats.orders.toLocaleString("fa-IR")}
درآمد موفق: ${money(stats.revenue)}

بخش موردنظر را انتخاب کنید:`,
            keyboard: [
                [
                    { text: "💳 واریزی‌ها", action: (0, panel_ui_1.callbackFor)("admin.deposits") },
                    { text: "🧾 سفارش‌ها", action: (0, panel_ui_1.callbackFor)("admin.orders") },
                ],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.notifications", async () => {
        const [targets, recent] = await Promise.all([broadcast_service_1.BroadcastService.targetStats(), broadcast_service_1.BroadcastService.recent(5)]);
        const targetLines = targets.map((item) => `• ${item.label}: ${item.count.toLocaleString("fa-IR")} نفر`).join("\n");
        const recentLines = recent
            .map((item) => `• ${item.createdAt.toLocaleString("fa-IR")} · ${item.targetLabel}
  ارسال: ${item.sent.toLocaleString("fa-IR")} · تحویل: ${item.delivered.toLocaleString("fa-IR")} · ناموفق: ${item.failed.toLocaleString("fa-IR")}`)
            .join("\n") || "هنوز اطلاع‌رسانی ثبت نشده است.";
        return {
            text: `📢 اطلاع‌رسانی همگانی

از این بخش می‌توانید پیام مدیریتی را برای گروه‌های مشخص ارسال کنید.

آمار مخاطبان:
${targetLines}

آخرین ارسال‌ها:
${recentLines}`,
            keyboard: [
                [
                    {
                        text: `📣 ${broadcast_service_1.BROADCAST_TARGET_LABELS.all_users}`,
                        action: "flow:start:broadcast_create:all_users",
                    },
                ],
                [
                    {
                        text: `✅ ${broadcast_service_1.BROADCAST_TARGET_LABELS.active_customers}`,
                        action: "flow:start:broadcast_create:active_customers",
                    },
                    {
                        text: `🕒 ${broadcast_service_1.BROADCAST_TARGET_LABELS.inactive_customers}`,
                        action: "flow:start:broadcast_create:inactive_customers",
                    },
                ],
                [
                    {
                        text: `🗄 ${broadcast_service_1.BROADCAST_TARGET_LABELS.users_with_active_accounts}`,
                        action: "flow:start:broadcast_create:users_with_active_accounts",
                    },
                ],
                [
                    {
                        text: `📭 ${broadcast_service_1.BROADCAST_TARGET_LABELS.users_without_active_accounts}`,
                        action: "flow:start:broadcast_create:users_without_active_accounts",
                    },
                ],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.settings", async () => {
        const stats = await admin_service_1.AdminService.cryptoWalletStats();
        return {
            text: `⚙️ تنظیمات

وضعیت فروشگاه: ${stats.setting.storeStatus === "active" ? "فعال ✅" : "غیرفعال ⛔"}
حداقل شارژ کیف پول: ${money(stats.setting.minimumTopupAmount)}
کیف پول‌ها: ${stats.wallets.length.toLocaleString("fa-IR")}

بخش تنظیمات را انتخاب کنید:`,
            keyboard: [
                [
                    { text: "🏪 وضعیت فروشگاه", action: (0, panel_ui_1.callbackFor)("admin.store") },
                    { text: "💳 حداقل شارژ", action: "flow:start:minimum_topup" },
                ],
                [
                    { text: "💳 کیف پول‌ها", action: (0, panel_ui_1.callbackFor)("admin.wallets") },
                    { text: "⚙️ تنظیمات مالی", action: (0, panel_ui_1.callbackFor)("admin.crypto") },
                ],
                [{ text: "📢 عضویت اجباری", action: (0, panel_ui_1.callbackFor)("admin.forcedJoin") }],
                [{ text: "📘 راهنمای محصولات", action: (0, panel_ui_1.callbackFor)("admin.productGuides") }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.paymentGateway", async () => {
        const [gateway, stats] = await Promise.all([payment_service_1.PaymentGatewayService.getConfig(), payment_service_1.PaymentInvoiceService.stats()]);
        const connectionLabel = gateway.lastConnectionStatus === "success" ? "موفق ✅" : gateway.lastConnectionStatus === "failed" ? "ناموفق ❌" : "تست نشده —";
        const lastInvoiceCreated = stats.recent[0]?.createdAt;
        const lastActualTestStatus = gateway.lastConnectionStatus === "success" ? "آخرین تست موفق" : gateway.lastConnectionStatus === "failed" ? "آخرین تست ناموفق" : "تست اتصال انجام نشده";
        return {
            replyKeyboard: "admin",
            text: `⚡ مدیریت پرداخت آنی

${divider}

وضعیت:
${gateway.enabled ? "فعال ✅" : "غیرفعال ⛔"}

نام درگاه:
${gateway.gatewayName}

آدرس اتصال درگاه:
${gateway.apiBaseUrl || "—"}

آدرس بازگشت پرداخت:
${gateway.callbackUrl || "—"}

کلید اتصال:
${(0, payment_service_1.maskApiKey)(gateway.apiKey)}

ترتیب نمایش:
${gateway.displayOrder.toLocaleString("fa-IR")}

${divider}

📡 اتصال:
${connectionLabel}

وضعیت تست:
${lastActualTestStatus}

آخرین تست موفق:
${gateway.lastSuccessfulRequest ? gateway.lastSuccessfulRequest.toLocaleString("fa-IR") : "—"}

آخرین تست ناموفق:
${gateway.lastFailedRequest ? gateway.lastFailedRequest.toLocaleString("fa-IR") : "—"}
${gateway.lastConnectionError ? `
آخرین خطا:
نیازمند بررسی تنظیمات درگاه است.` : ""}

آخرین فاکتور ساخته‌شده:
${lastInvoiceCreated ? lastInvoiceCreated.toLocaleString("fa-IR") : "—"}

${divider}

📊 فاکتورها

کل فاکتورها:
${stats.total.toLocaleString("fa-IR")}

تکمیل‌شده:
${stats.successful.toLocaleString("fa-IR")}

پرداخت‌شده در انتظار تحویل:
${stats.paid.toLocaleString("fa-IR")}

ناموفق:
${stats.failed.toLocaleString("fa-IR")}

در انتظار:
${stats.pending.toLocaleString("fa-IR")}

لغوشده:
${stats.cancelled.toLocaleString("fa-IR")}

درآمد امروز:
${money(stats.todayRevenue)}

درآمد ۷ روز اخیر:
${money(stats.weeklyRevenue)}

درآمد ماه جاری:
${money(stats.monthlyRevenue)}`,
            keyboard: [
                [{ text: gateway.enabled ? "⏸ فعال/غیرفعال: غیرفعال‌سازی" : "▶️ فعال/غیرفعال: فعال‌سازی", action: `admin:payment_gateway:status:${gateway.enabled ? "disabled" : "enabled"}` }],
                [
                    { text: "🏷 نام درگاه", action: "flow:start:payment_gateway_update:gatewayName" },
                    { text: "🌐 آدرس اتصال درگاه", action: "flow:start:payment_gateway_update:apiBaseUrl" },
                ],
                [
                    { text: "🔑 کلید اتصال", action: "flow:start:payment_gateway_update:apiKey" },
                    { text: "🔗 آدرس بازگشت پرداخت", action: "flow:start:payment_gateway_update:callbackUrl" },
                ],
                [{ text: "✏️ ویرایش هر فیلد جداگانه ذخیره می‌شود", action: "flow:start:payment_gateway_update:gatewayName" }],
                [{ text: "🧭 راه‌اندازی مرحله‌ای", action: "flow:start:payment_gateway_setup" }],
                [{ text: "📡 تست اتصال", action: "admin:payment_gateway:test" }],
                [{ text: "🧾 فاکتورها", action: (0, panel_ui_1.callbackFor)("admin.invoices") }, { text: "📊 آمار پرداخت‌ها", action: (0, panel_ui_1.callbackFor)("admin.paymentStats") }],
                [{ text: "💎 شارژ رمزارزی", action: (0, panel_ui_1.callbackFor)("admin.deposits") }, { text: "💰 تراکنش‌ها", action: (0, panel_ui_1.callbackFor)("admin.transactions") }, { text: "💳 کیف پول‌ها", action: (0, panel_ui_1.callbackFor)("admin.wallets") }],
                [{ text: "↩️ پنل مدیریت", action: (0, panel_ui_1.callbackFor)("admin.dashboard") }],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.paymentStats", async () => {
        const stats = await payment_service_1.PaymentInvoiceService.stats();
        return {
            text: `📊 آمار پرداخت آنی

${divider}
🧾 کل: ${stats.total.toLocaleString("fa-IR")}
✅ تکمیل‌شده: ${stats.successful.toLocaleString("fa-IR")}
💳 پرداخت‌شده/در انتظار تحویل: ${stats.paid.toLocaleString("fa-IR")}
❌ ناموفق: ${stats.failed.toLocaleString("fa-IR")}
⏳ در انتظار: ${stats.pending.toLocaleString("fa-IR")}
🚫 لغوشده: ${stats.cancelled.toLocaleString("fa-IR")}

💰 درآمد امروز: ${money(stats.todayRevenue)}
📆 درآمد ۷ روز اخیر: ${money(stats.weeklyRevenue)}
🗓 درآمد ماه جاری: ${money(stats.monthlyRevenue)}
📡 وضعیت درگاه: ${stats.gatewayStatus}

آخرین فاکتورها:
${stats.recent.map((invoice) => `• #${shortId(invoice.id)} · ${invoice.user.telegramId} · ${paymentStatusLabel(invoice.status)} · ${money(invoice.amount)}`).join("\n") || "فاکتور پرداختی ثبت نشده است."}`,
            keyboard: [[{ text: "⚡ مدیریت پرداخت آنی", action: (0, panel_ui_1.callbackFor)("admin.paymentGateway") }]],
        };
    });
    (0, panel_ui_1.registerView)("admin.invoices", async (_ctx, params) => {
        const current = page(params);
        const paymentStatuses = ["PENDING", "PAID", "COMPLETED", "CANCELED", "FAILED"];
        const status = paymentStatuses.includes(params.status) ? params.status : undefined;
        const [invoices, total] = await payment_service_1.PaymentInvoiceService.list(current, 8, status);
        const statusLabel = paymentStatusLabel;
        const typeLabel = (value) => value === "WALLET_TOPUP" ? "شارژ کیف پول" : "خرید محصول";
        return {
            text: `🧾 فاکتورهای پرداخت

صفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}
${status ? `
فیلتر: ${statusLabel(status)}` : "\nفیلتر: همه"}

${invoices.map((invoice) => `• شناسه: #${shortId(invoice.id)}
  شناسه پرداخت: ${invoice.payId ?? "—"}
  کاربر: ${invoice.user.telegramId}
  مبلغ: ${money(invoice.amount)}
  نوع: ${typeLabel(invoice.type)}
  وضعیت: ${statusLabel(invoice.status)}
  ایجاد: ${invoice.createdAt.toLocaleString("fa-IR")}
  پرداخت: ${invoice.paidAt ? invoice.paidAt.toLocaleString("fa-IR") : "—"}`).join("\n\n") || "فاکتوری ثبت نشده است."}`,
            keyboard: [
                [
                    { text: "همه", action: (0, panel_ui_1.callbackFor)("admin.invoices") },
                    { text: "در انتظار", action: (0, panel_ui_1.callbackFor)("admin.invoices", { status: "PENDING" }) },
                ],
                [
                    { text: "پرداخت شده", action: (0, panel_ui_1.callbackFor)("admin.invoices", { status: "PAID" }) },
                    { text: "تکمیل‌شده", action: (0, panel_ui_1.callbackFor)("admin.invoices", { status: "COMPLETED" }) },
                    { text: "لغو شده", action: (0, panel_ui_1.callbackFor)("admin.invoices", { status: "CANCELED" }) },
                    { text: "ناموفق", action: (0, panel_ui_1.callbackFor)("admin.invoices", { status: "FAILED" }) },
                ],
                ...invoices.map((invoice) => [{ text: `👁 #${shortId(invoice.id)}`, action: (0, panel_ui_1.callbackFor)("admin.invoice", { invoiceId: invoice.id }) }]),
                [
                    { text: "◀️ قبلی", action: (0, panel_ui_1.callbackFor)("admin.invoices", { page: Math.max(current - 1, 1), status }) },
                    { text: "بعدی ▶️", action: (0, panel_ui_1.callbackFor)("admin.invoices", { page: current + 1, status }) },
                ],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.invoice", async (_ctx, params) => {
        const invoice = await payment_service_1.PaymentInvoiceService.detail(params.invoiceId);
        if (!invoice)
            return { text: "⚠️ فاکتور پرداخت پیدا نشد.", keyboard: [] };
        return {
            text: `🧾 جزئیات فاکتور پرداخت

شناسه فاکتور: ${invoice.id}
شناسه پرداخت: ${invoice.payId ?? "—"}
کاربر: ${invoice.user.telegramId}
نوع: ${invoice.type === "WALLET_TOPUP" ? "شارژ کیف پول" : "خرید محصول"}
وضعیت: ${paymentStatusLabel(invoice.status)}
مبلغ اصلی: ${money(invoice.originalAmount)}
مقدار تخفیف: ${money(invoice.discountAmount)}
کد تخفیف: ${invoice.couponCode ?? invoice.coupon?.code ?? "—"}
مبلغ نهایی: ${money(invoice.amount)}
مبلغ ثبت‌شده درگاه: ${invoice.gatewayAmount ? money(invoice.gatewayAmount) : "—"}
نوع پرداخت: ${invoice.type === "WALLET_TOPUP" ? "پرداخت آنی / شارژ کیف پول" : "پرداخت آنی / خرید محصول"}
محصول: ${invoice.product?.title ?? "—"}
سفارش: ${invoice.orderId ?? "—"}
زمان ایجاد: ${invoice.createdAt.toLocaleString("fa-IR")}
زمان پرداخت: ${invoice.paidAt ? invoice.paidAt.toLocaleString("fa-IR") : "—"}
زمان تکمیل: ${invoice.completedAt ? invoice.completedAt.toLocaleString("fa-IR") : "—"}
تعداد بازگشت پرداخت: ${invoice.callbackCount.toLocaleString("fa-IR")}
آخرین بازگشت پرداخت: ${invoice.lastCallbackAt ? invoice.lastCallbackAt.toLocaleString("fa-IR") : "—"}
وضعیت تحویل: ${invoice.orderId ? "تکمیل شده" : "در انتظار"}
وضعیت اطلاع‌رسانی: ${invoice.notificationStatus ? "ثبت شده" : "—"}

سوابق پرداخت:
${invoice.audits.map((audit) => `• ${audit.createdAt.toLocaleString("fa-IR")} · رویداد ثبت شد`).join("\n") || "رخدادی ثبت نشده است."}`,
            keyboard: [[{ text: "🧾 همه فاکتورها", action: (0, panel_ui_1.callbackFor)("admin.invoices") }]],
        };
    });
    (0, panel_ui_1.registerView)("admin.deposits", async (_ctx, params) => {
        const current = page(params);
        const [deposits, total] = await admin_service_1.AdminService.listSubmittedDeposits(current);
        return {
            text: `💰 مدیریت واریزی‌ها\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`,
            keyboard: deposits.map((deposit) => [
                { text: `💳 ${deposit.user.telegramId} · ${money(deposit.amount)}`, action: (0, panel_ui_1.callbackFor)("admin.deposit", { depositId: deposit.id }) },
            ]),
        };
    });
    (0, panel_ui_1.registerView)("admin.deposit", async (_ctx, params) => {
        const deposit = await admin_service_1.AdminService.depositDetail(params.depositId);
        if (!deposit)
            return { text: "⚠️ واریزی پیدا نشد.", keyboard: [] };
        return {
            text: `💳 جزئیات واریزی\n\nکاربر: ${deposit.user.telegramId}\nمبلغ: ${money(deposit.amount)}\nارز: ${deposit.cryptoType.toUpperCase()}\nوضعیت: ${deposit.status}\nرسید: ${deposit.receipt ? "ثبت شده" : "ثبت نشده"}`,
            keyboard: [
                [
                    { text: "✅ تأیید", action: `admin:deposit:approve:${deposit.id}` },
                    { text: "❌ رد", action: `admin:deposit:reject:${deposit.id}` },
                ],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.orders", async (_ctx, params) => {
        const current = page(params);
        const [orders, total] = await admin_service_1.AdminService.listRecentOrders(current);
        return {
            text: `🧾 سفارش‌ها\n\n${orders.map((order) => `• #${shortId(order.id)} · ${order.user.telegramId} · ${order.product.title} · ${money(order.totalAmount)}`).join("\n") || "سفارشی ثبت نشده است."}\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`,
            keyboard: [
                [
                    { text: "◀️ قبلی", action: (0, panel_ui_1.callbackFor)("admin.orders", { page: Math.max(current - 1, 1) }) },
                    { text: "بعدی ▶️", action: (0, panel_ui_1.callbackFor)("admin.orders", { page: current + 1 }) },
                ],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.tickets", async (_ctx, params) => {
        const current = page(params);
        const [tickets, total] = await admin_service_1.AdminService.listTickets(current);
        const openCount = tickets.filter((ticket) => ticket.status === "open").length;
        return {
            text: `🎫 مدیریت تیکت‌ها
${divider}

📌 تاریخچه گفتگوها، ورود مستقیم به چت و بستن تیکت‌ها از همین بخش انجام می‌شود.

✅ تیکت‌های باز این صفحه: ${openCount.toLocaleString("fa-IR")}
📄 صفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`,
            keyboard: [
                ...tickets.map((ticket) => [
                    {
                        text: `${ticket.status === "open" ? "🟢" : "⚫️"} ${ticket.user.telegramId} · #${shortId(ticket.id)}`,
                        action: (0, panel_ui_1.callbackFor)("admin.ticket", { ticketId: ticket.id }),
                    },
                ]),
                [
                    { text: "◀️ قبلی", action: (0, panel_ui_1.callbackFor)("admin.tickets", { page: Math.max(current - 1, 1) }) },
                    { text: "بعدی ▶️", action: (0, panel_ui_1.callbackFor)("admin.tickets", { page: current + 1 }) },
                ],
            ],
        };
    });
    (0, panel_ui_1.registerView)("admin.ticket", async (_ctx, params) => {
        const ticket = await support_service_1.SupportService.getTicketWithUser(params.ticketId);
        if (!ticket)
            return { text: "⚠️ تیکت پیدا نشد.", keyboard: [] };
        const statusAction = ticket.status === "open"
            ? { text: "✅ بستن", action: `admin:ticket:close:${ticket.id}` }
            : { text: "🔄 باز کردن مجدد", action: `admin:ticket:reopen:${ticket.id}` };
        return {
            text: `🎫 تیکت #${shortId(ticket.id)}
${divider}

👤 کاربر: ${ticket.user.telegramId}${ticket.user.username ? ` (@${ticket.user.username})` : ""}
⚡ وضعیت: ${ticket.status === "open" ? "باز ✅" : "بسته 🔒"}
🕒 آخرین بروزرسانی: ${ticket.updatedAt.toLocaleString("fa-IR")}

${ticket.messages
                .map((message) => `${message.senderRole === "admin" ? "👨‍💼 پشتیبانی" : "👤 کاربر"} · ${message.createdAt.toLocaleString("fa-IR")}
${message.message}`)
                .join("\n\n") || "بدون پیام"}`,
            keyboard: [
                [
                    { text: "💬 ورود به چت", action: `support:admin:chat:${ticket.id}` },
                    { text: "↩️ پاسخ سریع", action: `flow:start:ticket_reply:${ticket.id}` },
                ],
                [statusAction],
            ],
        };
    });
}
