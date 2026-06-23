import {
  registerView, callbackFor, actionFor, createCallbackToken, tokenAction, isAdminByTelegramId, UserService, ProductService, AdminService, adminShopViewModel, maskAdminSecret, xrayAdminStatusLabel, xrayCenterViewModel, ReferralService, FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate, SupportService, CouponService, BroadcastService, BROADCAST_TARGET_LABELS, PaymentGatewayService, PaymentInvoiceService, maskApiKey, ProductGuideService, ForcedJoinService, PublicPlansService, productNotDeletedWhere, formatXrayBytes, maskToken, normalizeXrayStatus, XrayClientService, XrayPanelService, xrayTrafficSnapshot, XrayDiagnosticsService, type PaymentInvoiceStatus, accountSummaryMessage, errorMessage, walletSummaryMessage, formatToman, accountStatusLabel, divider, formatPageCount, formatStockLabel, formatUserLine, getPageParam, paymentStatusLabel, progressBar, purchasedAccountStatusLabel, resolveFreeAccountExpiry, shortId, walletStatusLabel, yesNoStatus, homeKeyboard, adminDashboardViewKeyboard, card, joinSections, section, sectionTitles, actionLabels, adminLabels, statusLabels, userLabels, uiIcons, MonitoringService, prisma, money, page, pages, userLine, stockLabel, freeAccountExpiry, yesNo, type UiKeyboard
} from "./admin-helpers";

export function registerAdminDashboardViews() {
  registerView("admin.dashboard", async () => {
    const [stats, paymentStats] = await Promise.all([AdminService.dashboard(true), PaymentInvoiceService.stats()]);
    const lowInventory = stats.availableAccounts <= 5 ? `⚠️ ${stats.availableAccounts.toLocaleString("fa-IR")} اکانت آماده` : "عادی ✅";
    return {
      replyKeyboard: "admin",
      text: joinSections([
        card(adminLabels.dashboard, [
          `${uiIcons.users} کل کاربران: ${stats.users.toLocaleString("fa-IR")}`,
          `${uiIcons.product} اکانت‌های فعال/فروخته: ${stats.soldAccounts.toLocaleString("fa-IR")}`,
          `${uiIcons.wallet} درآمد امروز: ${money(paymentStats.todayRevenue)}`,
        ]),
        section(sectionTitles.adminMetrics, [
          `⏳ پرداخت‌های در انتظار: ${paymentStats.pending.toLocaleString("fa-IR")}`,
          `${uiIcons.support} تیکت‌های باز: ${stats.openTickets.toLocaleString("fa-IR")}`,
        ]),
        section(sectionTitles.quickActions, ["برای مدیریت، وارد یکی از گروه‌های اصلی شوید."]),
      ]),
      keyboard: adminDashboardViewKeyboard(),
    };
  });
  registerView("admin.store", async () => {
    const stats = await adminShopViewModel();
    return {
      replyKeyboard: "admin",
      text: joinSections([
        card("🛍 داشبورد فروشگاه", [
          `کل محصولات: ${stats.totalProducts.toLocaleString("fa-IR")}`,
          `محصولات فعال: ${stats.activeProducts.toLocaleString("fa-IR")}`,
          `محصولات غیرفعال: ${stats.inactiveProducts.toLocaleString("fa-IR")}`,
          `دسته‌بندی‌ها: ${stats.categories.toLocaleString("fa-IR")}`,
          `موجودی کم: ${stats.lowStockProducts.toLocaleString("fa-IR")}`,
          `محصولات متصل به Xray: ${stats.xrayConnectedProducts.toLocaleString("fa-IR")}`,
        ]),
      ]),
      keyboard: [
        [
          { text: "📦 محصولات", action: callbackFor("admin.products") },
          { text: "🗂 دسته‌بندی‌ها", action: callbackFor("admin.categories") },
        ],
        [
          { text: "➕ افزودن محصول", action: "flow:start:product_create" },
          { text: "➕ افزودن دسته‌بندی", action: "flow:start:category_create" },
        ],
        [
          { text: "✅ محصولات فعال", action: callbackFor("admin.products", { status: "active" }) },
          { text: "⛔ محصولات غیرفعال", action: callbackFor("admin.products", { status: "inactive" }) },
        ],
        [
          { text: "🔎 جستجوی محصول", action: "flow:start:admin_product_search" },
          { text: "🔄 سینک با Xray", action: callbackFor("admin.xraySync") },
        ],
        [
          { text: "🆓 اکانت تست", action: callbackFor("admin.freeAccounts") },
          { text: "📦 بروزرسانی گروهی اینباند", action: callbackFor("admin.xrayBulkInbound") },
        ],
        [{ text: "🔙 پنل مدیریت", action: callbackFor("admin.dashboard") }],
      ],
    };
  });
  registerView("admin.finance", async () => {
    const stats = await PaymentInvoiceService.stats();
    return {
      replyKeyboard: "admin",
      text: `💳 مالی

${divider}
⏳ پرداخت‌های در انتظار: ${stats.pending.toLocaleString("fa-IR")}
✅ پرداخت‌های موفق: ${stats.successful.toLocaleString("fa-IR")}
💰 درآمد امروز: ${money(stats.todayRevenue)}

مدیریت همه ابزارهای مالی از این زیرمنو انجام می‌شود.`,
      keyboard: [
        [
          { text: "⚡ پرداخت آنی", action: callbackFor("admin.paymentGateway") },
          { text: "💎 واریزی‌های رمزارزی", action: callbackFor("admin.deposits") },
        ],
        [
          { text: "💳 کیف پول‌ها", action: callbackFor("admin.wallets") },
          { text: "🎟 کدهای تخفیف", action: callbackFor("admin.coupons") },
        ],
        [
          { text: "🧾 فاکتورها", action: callbackFor("admin.invoices") },
          { text: "💰 تراکنش‌ها", action: callbackFor("admin.transactions") },
        ],
        [{ text: "⚙️ تنظیمات مالی", action: callbackFor("admin.crypto") }],
      ],
    };
  });
  registerView("admin.usersSupport", async () => {
    const stats = await AdminService.dashboard(true);
    return {
      replyKeyboard: "admin",
      text: `👥 کاربران و پشتیبانی

${divider}
👥 کاربران: ${stats.users.toLocaleString("fa-IR")}
🎫 تیکت‌های باز: ${stats.openTickets.toLocaleString("fa-IR")}
🎁 پاداش دعوت: ${money(stats.referralRewards)}

بخش موردنظر را انتخاب کنید.`,
      keyboard: [
        [
          { text: "👥 مدیریت کاربران", action: callbackFor("admin.users") },
          { text: "🎫 تیکت‌ها", action: callbackFor("admin.tickets") },
        ],
        [
          { text: "🎁 پاداش دعوت", action: callbackFor("admin.referrals") },
          { text: "📊 گزارش کاربران", action: callbackFor("admin.analytics") },
        ],
        [{ text: "📢 اطلاع رسانی و محتوا", action: callbackFor("admin.content") }],
      ],
    };
  });
  registerView("admin.content", async () => {
    return {
      replyKeyboard: "admin",
      text: `📢 محتوا و اطلاع‌رسانی

${divider}
ارسال اطلاعیه، راهنمای محصولات و نمایش عمومی پلن‌ها در این بخش گروه‌بندی شده‌اند.`,
      keyboard: [
        [
          { text: "📢 اطلاع‌رسانی", action: callbackFor("admin.notifications") },
          { text: "📘 راهنمای محصولات", action: callbackFor("admin.productGuides") },
        ],
      ],
    };
  });
  registerView("admin.monitoring", async () => {
    const [monitoring, gateway] = await Promise.all([MonitoringService.dashboard(), PaymentGatewayService.getConfig()]);
    const recentErrors =
      monitoring.events
        .slice(0, 5)
        .map((event) => `• ${event.severity === "critical" ? "🚨" : "⚠️"} ${event.section}: ${event.description}`)
        .join("\n") || "خطای اخیری ثبت نشده است.";
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
        [
          { text: "🚨 خطاهای اخیر", action: callbackFor("admin.monitoring") },
          { text: "💳 خطاهای پرداخت", action: callbackFor("admin.paymentStats") },
        ],
        [
          { text: "🎫 خطاهای تیکت", action: callbackFor("admin.tickets") },
          { text: "⚙️ وضعیت سرویس‌ها", action: callbackFor("admin.monitoring") },
        ],
        [{ text: "🔄 بروزرسانی", action: callbackFor("admin.monitoring") }],
      ],
    };
  });
}
