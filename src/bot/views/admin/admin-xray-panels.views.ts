import {
  registerView, callbackFor, actionFor, createCallbackToken, tokenAction, isAdminByTelegramId, UserService, ProductService, AdminService, adminShopViewModel, maskAdminSecret, xrayAdminStatusLabel, xrayCenterViewModel, ReferralService, FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate, SupportService, CouponService, BroadcastService, BROADCAST_TARGET_LABELS, PaymentGatewayService, PaymentInvoiceService, maskApiKey, ProductGuideService, ForcedJoinService, PublicPlansService, productNotDeletedWhere, formatXrayBytes, maskToken, normalizeXrayStatus, XrayClientService, XrayPanelService, xrayTrafficSnapshot, XrayDiagnosticsService, type PaymentInvoiceStatus, accountSummaryMessage, errorMessage, walletSummaryMessage, formatToman, accountStatusLabel, divider, formatPageCount, formatStockLabel, formatUserLine, getPageParam, paymentStatusLabel, progressBar, purchasedAccountStatusLabel, resolveFreeAccountExpiry, shortId, walletStatusLabel, yesNoStatus, homeKeyboard, adminDashboardViewKeyboard, card, joinSections, section, sectionTitles, actionLabels, adminLabels, statusLabels, userLabels, uiIcons, MonitoringService, prisma, money, page, pages, userLine, stockLabel, freeAccountExpiry, yesNo, type UiKeyboard
} from "./admin-helpers";

export function registerAdminXrayPanelViews() {
  registerView("admin.xrayPanels", async () => {
    const panels = await prisma.xrayPanelConfig.findMany({ orderBy: { updatedAt: "desc" } });
    return {
      text: joinSections([
        card("📡 وضعیت پنل‌های Xray", [
          panels.length ? `تعداد پنل‌ها: ${panels.length.toLocaleString("fa-IR")}` : "هنوز پنلی ثبت نشده است.",
          "تست اتصال فقط با دکمه‌های همین صفحه اجرا می‌شود.",
        ]),
        section(
          "📋 پنل‌ها",
          panels.map(
            (panel) => `• ${panel.name}
  آدرس پنل: ${panel.apiBaseUrl}
  وضعیت اتصال: ${panel.enabled ? "✅ فعال" : "⛔ غیرفعال"}
  تعداد inbound: ${panel.lastInboundCount.toLocaleString("fa-IR")}
  آخرین تست اتصال: ${panel.lastSuccessAt ? panel.lastSuccessAt.toLocaleString("fa-IR") : "انجام نشده"}
  آخرین خطا: ${panel.lastError ?? "—"}`,
          ),
        ),
      ]),
      keyboard: [
        [
          { text: "➕ افزودن پنل", action: "flow:start:xray_panel_setup:new:name" },
          { text: "🧪 تست همه پنل‌ها", action: "admin:xray:center:test-api" },
        ],
        ...panels.map((panel) => [{ text: `📡 ${panel.name}`.slice(0, 60), action: callbackFor("admin.xrayPanel", { panelId: panel.id }) }]),
        [{ text: "🔙 مرکز Xray", action: callbackFor("admin.xrayCenter") }],
      ],
    };
  });

  registerView("admin.xrayPanel", async (_ctx, params) => {
    const panel = await prisma.xrayPanelConfig.findUnique({ where: { id: params.panelId } });
    if (!panel) return { text: "⚠️ پنل Xray پیدا نشد.", keyboard: [[{ text: "🔙 مرکز Xray", action: callbackFor("admin.xrayCenter") }]] };
    return {
      text: joinSections([
        card(`📡 ${panel.name}`, [
          `آدرس پنل: ${panel.apiBaseUrl}`,
          `وضعیت اتصال: ${panel.enabled ? "✅ فعال" : "⛔ غیرفعال"}`,
          `inbound پیش‌فرض: ${panel.defaultInboundId ?? "انتخاب نشده"}`,
          `تعداد inbound: ${panel.lastInboundCount.toLocaleString("fa-IR")}`,
          `آخرین تست اتصال: ${panel.lastSuccessAt ? panel.lastSuccessAt.toLocaleString("fa-IR") : "انجام نشده"}`,
          `توکن/API key: ${maskAdminSecret(panel.apiToken)}`,
          `آخرین خطا: ${panel.lastError ?? "—"}`,
        ]),
        section("🔐 امنیت", ["توکن کامل هرگز در پنل نمایش داده نمی‌شود."]),
      ]),
      keyboard: [
        [
          { text: "✏️ نام پنل", action: `flow:start:xray_panel_setup:${panel.id}:name` },
          { text: "🌐 آدرس پنل", action: `flow:start:xray_panel_setup:${panel.id}:apiBaseUrl` },
        ],
        [
          { text: "🔑 توکن/API", action: `flow:start:xray_panel_setup:${panel.id}:apiToken` },
          { text: "📥 inbound پیش‌فرض", action: `admin:xray:inbounds:${panel.id}` },
        ],
        [
          { text: "🧪 تست اتصال", action: `admin:xray:test:${panel.id}` },
          { text: "📋 دریافت inboundها", action: `admin:xray:inbounds:${panel.id}` },
        ],
        [
          { text: panel.enabled ? "⛔ غیرفعال" : "✅ فعال", action: `admin:xray:enabled:${panel.id}:${panel.enabled ? "0" : "1"}` },
          { text: "🗑 حذف/آرشیو", action: `admin:xray:danger:${panel.id}` },
        ],
        [
          { text: "🔙 پنل‌ها", action: callbackFor("admin.xrayPanels") },
          { text: "🧩 مرکز Xray", action: callbackFor("admin.xrayCenter") },
        ],
      ],
    };
  });

}
