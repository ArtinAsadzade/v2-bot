import {
  registerView, callbackFor, actionFor, createCallbackToken, tokenAction, isAdminByTelegramId, UserService, ProductService, AdminService, adminShopViewModel, maskAdminSecret, xrayAdminStatusLabel, xrayCenterViewModel, ReferralService, FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate, SupportService, CouponService, BroadcastService, BROADCAST_TARGET_LABELS, PaymentGatewayService, PaymentInvoiceService, maskApiKey, ProductGuideService, ForcedJoinService, PublicPlansService, productNotDeletedWhere, formatXrayBytes, maskToken, normalizeXrayStatus, XrayClientService, XrayPanelService, xrayTrafficSnapshot, XrayDiagnosticsService, type PaymentInvoiceStatus, accountSummaryMessage, errorMessage, walletSummaryMessage, formatToman, accountStatusLabel, divider, formatPageCount, formatStockLabel, formatUserLine, getPageParam, paymentStatusLabel, progressBar, purchasedAccountStatusLabel, resolveFreeAccountExpiry, shortId, walletStatusLabel, yesNoStatus, homeKeyboard, adminDashboardViewKeyboard, card, joinSections, section, sectionTitles, actionLabels, adminLabels, statusLabels, userLabels, uiIcons, MonitoringService, prisma, money, page, pages, userLine, stockLabel, freeAccountExpiry, yesNo, type UiKeyboard
} from "./admin-helpers";

export function registerAdminXrayViews() {
  registerView("admin.xrayCenter", async () => {
    const vm = await xrayCenterViewModel();
    return {
      text: joinSections([
        card("🧩 مرکز مدیریت Xray", ["داشبورد عملیات سرویس‌های خودکار"]),
        section("📡 وضعیت پنل", [
          `وضعیت اتصال: ${vm.connectionLabel}`,
          `تعداد پنل‌ها: ${vm.panelCount.toLocaleString("fa-IR")} کل / ${vm.enabledPanelCount.toLocaleString("fa-IR")} فعال`,
          `آخرین بررسی: ${vm.lastCheck ? vm.lastCheck.toLocaleString("fa-IR") : "هنوز انجام نشده"}`,
          vm.recentErrors.length ? `خطاهای اخیر: ${vm.recentErrors.join("، ")}` : "خطای اخیر ثبت نشده است.",
        ]),
        section("👥 کاربران Xray", [
          `فعال: ${vm.clients.active.toLocaleString("fa-IR")}`,
          `منقضی‌شده: ${vm.clients.expired.toLocaleString("fa-IR")}`,
          `در حال ساخت: ${vm.clients.provisioning.toLocaleString("fa-IR")}`,
          `ناموفق: ${vm.clients.failed.toLocaleString("fa-IR")}`,
          `نیازمند بررسی: ${vm.clients.review.toLocaleString("fa-IR")}`,
        ]),
        section("📊 مصرف و ظرفیت", [
          `مصرف کل: ${vm.capacity.used}`,
          `حجم کل تعریف‌شده: ${vm.capacity.total}`,
          `باقی‌مانده تقریبی: ${vm.capacity.remaining}`,
          `سرویس‌های نزدیک انقضا: ${vm.capacity.expiringSoon.toLocaleString("fa-IR")}`,
        ]),
        section("⚠️ خطاها", [
          `خطاهای ساخت سرویس: ${vm.errors.buildErrors.toLocaleString("fa-IR")}`,
          `خطاهای سینک: ${vm.errors.syncErrors.toLocaleString("fa-IR")}`,
          `سرویس‌های نیازمند بررسی: ${vm.errors.review.toLocaleString("fa-IR")}`,
        ]),
      ]),
      keyboard: [
        [
          { text: "📡 پنل‌ها", action: callbackFor("admin.xrayPanels"), tone: "primary" },
          { text: "👥 کاربران Xray", action: callbackFor("admin.xrayClients"), tone: "primary" },
        ],
        [
          { text: "🔄 همگام‌سازی", action: callbackFor("admin.xraySync"), tone: "success" },
          { text: "🧪 تست اتصال", action: "admin:xray:center:test-api", tone: "success" },
        ],
        [
          { text: "📦 بروزرسانی گروهی اینباند", action: callbackFor("admin.xrayBulkInbound"), tone: "primary" },
          { text: "🗺 نگاشت محصولات", action: callbackFor("admin.xrayBulkInbound"), tone: "primary" },
        ],
        [
          { text: "📊 گزارش مصرف", action: callbackFor("admin.xrayClients"), tone: "primary" },
          { text: "⚠️ خطاها", action: callbackFor("admin.xrayClients", { status: "failed" }), tone: "primary" },
        ],
        [{ text: "⚙️ تنظیمات Xray", action: callbackFor("admin.xraySettings"), tone: "primary" }],
      ],
    };
  });
  registerView("admin.xraySettings", async () => {
    const config = await XrayPanelService.getEnabledConfig();
    const anyConfig = config ?? (await prisma.xrayPanelConfig.findFirst({ orderBy: { updatedAt: "desc" } }));
    return {
      text: joinSections([
        card("⚙️ تنظیمات Xray", [
          `📌 وضعیت: ${anyConfig?.enabled ? "✅ فعال" : "⛔ غیرفعال"}`,
          `🌐 آدرس پنل: ${anyConfig?.apiBaseUrl ?? "ثبت نشده"}`,
          `🔑 کلید API/توکن: ${maskToken(anyConfig?.apiToken)}`,
          `🔗 لینک اشتراک: ${anyConfig?.subscriptionBaseUrl ?? "ثبت نشده"}`,
          `📡 اینباند پیش‌فرض/فعال: ${(anyConfig?.lastInboundCount ?? 0).toLocaleString("fa-IR")}`,
          `📊 حجم پیش‌فرض: در فرم محصول Xray تنظیم می‌شود`,
          `📅 مدت پیش‌فرض: در فرم محصول Xray تنظیم می‌شود`,
          `🧪 آخرین تست: ${anyConfig?.lastSuccessAt ? anyConfig.lastSuccessAt.toLocaleString("fa-IR") : "—"}`,
          `⚠️ آخرین خطا: ${anyConfig?.lastError ?? "—"}`,
        ]),
        section("🔐 نکته امنیتی", ["توکن کامل در پنل ادمین نمایش داده نمی‌شود."]),
      ]),
      keyboard: [
        [
          { text: "🌐 آدرس پنل", action: "flow:start:xray_panel_setup:apiBaseUrl" },
          { text: "🔑 کلید API/توکن", action: "flow:start:xray_panel_setup:apiToken" },
        ],
        [
          { text: "📡 اینباند پیش‌فرض", action: "flow:start:xray_panel_setup" },
          { text: "📊 حجم پیش‌فرض", action: callbackFor("admin.products") },
        ],
        [
          { text: "📅 مدت پیش‌فرض", action: callbackFor("admin.products") },
          { text: "🧪 تست اتصال", action: "admin:xray:test" },
        ],
        [
          { text: anyConfig?.enabled ? "⛔ غیرفعال‌سازی" : "✅ فعال‌سازی", action: `admin:xray:enabled:${anyConfig?.enabled ? "0" : "1"}` },
          { text: "💾 ذخیره تنظیمات", action: "flow:start:xray_panel_setup" },
        ],
      ],
    };
  });
  registerView("admin.xrayClients", async (_ctx, params) => {
    const current = page(params);
    const status = ["provisioning", "creating", "active", "failed", "expired", "missing_on_panel", "deleted", "renewal_failed"].includes(
      params.status,
    )
      ? (params.status as any)
      : undefined;
    const productId = params.productId || undefined;
    const [clients, total] = await AdminService.xrayClientList(current, 8, status, productId);
    const statusLabel = xrayAdminStatusLabel(status);
    const filterParams = (nextStatus?: string) => ({ ...(productId ? { productId } : {}), ...(nextStatus ? { status: nextStatus } : {}) });
    return {
      text: joinSections([
        card("👥 کاربران Xray", [
          `فیلتر: ${statusLabel}`,
          `صفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`,
          productId ? `📦 محصول: ${clients[0]?.product?.title ?? productId}` : undefined,
        ]),
        section(
          "📋 فهرست کاربران",
          clients.map((client) => {
            const days = Math.ceil((client.expiresAt.getTime() - Date.now()) / 86_400_000);
            return `• ${client.clientEmail}
  کاربر: ${client.user ? userLine(client.user) : client.telegramId}
  محصول: ${client.isFreeTest ? "اکانت تست" : (client.product?.title ?? "—")}
  وضعیت: ${xrayAdminStatusLabel(client.status)}
  مصرف: ${formatXrayBytes(client.usedBytes ?? 0n)} / ${formatXrayBytes(client.trafficBytes, { unlimitedIfZero: true })}
  انقضا: ${client.expiresAt.toLocaleDateString("fa-IR")} · ${days > 0 ? `${days.toLocaleString("fa-IR")} روز باقی‌مانده` : "منقضی‌شده"}`;
          }),
        ),
      ]),
      keyboard: [
        [
          { text: "✅ فعال", action: callbackFor("admin.xrayClients", filterParams("active")) },
          { text: "🕒 منقضی‌شده", action: callbackFor("admin.xrayClients", filterParams("expired")) },
        ],
        [
          { text: "❌ ناموفق", action: callbackFor("admin.xrayClients", filterParams("failed")) },
          { text: "🔎 جستجوی کاربر", action: callbackFor("admin.xrayClients", filterParams()) },
        ],
        [
          { text: "🔄 همگام‌سازی کاربران", action: "admin:xray:center:cleanup" },
          { text: "↩️ بازگشت به مرکز Xray", action: callbackFor("admin.xrayCenter") },
        ],
        ...clients.map((client) => [
          { text: `👁 ${client.clientEmail}`.slice(0, 60), action: callbackFor("admin.xrayClient", { xrayClientId: client.id }) },
        ]),
        [
          { text: "◀️ قبلی", action: callbackFor("admin.xrayClients", { ...filterParams(status), page: Math.max(current - 1, 1) }) },
          { text: "بعدی ▶️", action: callbackFor("admin.xrayClients", { ...filterParams(status), page: current + 1 }) },
        ],
      ],
    };
  });
  registerView("admin.xrayClient", async (_ctx, params) => {
    const client = await prisma.xrayClient.findUnique({ where: { id: params.xrayClientId }, include: { product: true, user: true } });
    if (!client)
      return { text: "⚠️ کاربر Xray پیدا نشد.", keyboard: [[{ text: "↩️ بازگشت به کاربران Xray", action: callbackFor("admin.xrayClients") }]] };
    const days = Math.ceil((client.expiresAt.getTime() - Date.now()) / 86_400_000);
    return {
      text: joinSections([
        card("👤 جزئیات کاربر Xray", [
          `شناسه/ایمیل: ${client.clientEmail}`,
          `کاربر متصل: ${client.user ? userLine(client.user) : client.telegramId}`,
          `محصول: ${client.isFreeTest ? "اکانت تست" : (client.product?.title ?? "—")}`,
          `وضعیت: ${xrayAdminStatusLabel(client.status)}`,
          `مصرف: ${formatXrayBytes(client.usedBytes ?? 0n)} / ${formatXrayBytes(client.trafficBytes, { unlimitedIfZero: true })}`,
          `تاریخ انقضا: ${client.expiresAt.toLocaleDateString("fa-IR")}`,
          `زمان باقی‌مانده: ${days > 0 ? `${days.toLocaleString("fa-IR")} روز` : "منقضی‌شده"}`,
          `آخرین خطا: ${client.lastError ?? "—"}`,
        ]),
      ]),
      keyboard: [
        [
          { text: "🔗 نمایش لینک اشتراک", action: `xray:sub:${client.id}` },
          { text: "📱 دریافت QR", action: `xray:sub:${client.id}` },
        ],
        [{ text: "⚙️ دریافت کانفیگ‌ها", action: `xray:configs:${client.id}` }],
        [
          { text: "♻️ تمدید سرویس", action: callbackFor("admin.xrayClients", { productId: client.productId ?? undefined }) },
          { text: "🔄 همگام‌سازی کاربر", action: `admin:xray:refresh:${client.id}` },
        ],
        [{ text: "📊 بروزرسانی مصرف", action: `admin:xray:refresh:${client.id}` }],
        [
          { text: "✅ فعال‌سازی", action: `admin:xray:refresh:${client.id}` },
          { text: "⛔ غیرفعال‌سازی", action: callbackFor("admin.xrayClient", { xrayClientId: client.id }) },
        ],
        [{ text: "🗑 حذف از پنل", action: callbackFor("admin.xrayClient", { xrayClientId: client.id }) }],
        [
          { text: "↩️ بازگشت به کاربران Xray", action: callbackFor("admin.xrayClients") },
          { text: "🧩 بازگشت به مرکز Xray", action: callbackFor("admin.xrayCenter") },
        ],
      ],
    };
  });
}
