import {
  registerView, callbackFor, actionFor, createCallbackToken, tokenAction, isAdminByTelegramId, UserService, ProductService, AdminService, adminShopViewModel, maskAdminSecret, xrayAdminStatusLabel, xrayCenterViewModel, ReferralService, FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate, SupportService, CouponService, BroadcastService, BROADCAST_TARGET_LABELS, PaymentGatewayService, PaymentInvoiceService, maskApiKey, ProductGuideService, ForcedJoinService, PublicPlansService, productNotDeletedWhere, formatXrayBytes, maskToken, normalizeXrayStatus, XrayClientService, XrayPanelService, xrayTrafficSnapshot, XrayDiagnosticsService, type PaymentInvoiceStatus, accountSummaryMessage, errorMessage, walletSummaryMessage, formatToman, accountStatusLabel, divider, formatPageCount, formatStockLabel, formatUserLine, getPageParam, paymentStatusLabel, progressBar, purchasedAccountStatusLabel, resolveFreeAccountExpiry, shortId, walletStatusLabel, yesNoStatus, homeKeyboard, adminDashboardViewKeyboard, card, joinSections, section, sectionTitles, actionLabels, adminLabels, statusLabels, userLabels, uiIcons, MonitoringService, prisma, money, page, pages, userLine, stockLabel, freeAccountExpiry, yesNo, type UiKeyboard
} from "./admin-helpers";

export function registerAdminXraySyncViews() {
  registerView("admin.xraySync", async () => {
    const panels = await prisma.xrayPanelConfig.findMany({ where: { enabled: true }, orderBy: { updatedAt: "desc" } });
    return {
      text: joinSections([
        card("🔄 سینک محصولات با 3x-ui", ["برای جلوگیری از تغییر ناخواسته، سینک در چند مرحله و با پیش‌نمایش انجام می‌شود."]),
        section("۱. انتخاب پنل", ["ابتدا پنل مقصد را انتخاب کنید."]),
        section("۲. انتخاب inbound", ["پس از انتخاب پنل، inboundهای همان پنل نمایش داده می‌شوند."]),
        section("۳. پیش‌نمایش قبل از تأیید", [
          "پنل انتخاب‌شده: پس از انتخاب نمایش داده می‌شود.",
          "inbound انتخاب‌شده: پس از انتخاب نمایش داده می‌شود.",
          "محصولات درگیر: قبل از ذخیره بررسی می‌شوند.",
          "حجم پیش‌فرض و مدت پیش‌فرض: از تنظیمات محصول خوانده می‌شود.",
          "تعداد محصولات ساخته/آپدیت‌شونده: قبل از تأیید اعلام می‌شود.",
        ]),
        section("۴. نتیجه", ["ساخته شد، بروزرسانی شد، رد شد، ناموفق و جزئیات خطاها به فارسی نمایش داده می‌شود."]),
      ]),
      keyboard: [
        ...panels.map((panel) => [{ text: `📡 ${panel.name}`.slice(0, 60), action: `admin:xsync:p:${panel.id}` }]),
        [{ text: "👁 نمایش پیش‌نمایش", action: callbackFor("admin.xraySyncPreview") }],
        [{ text: "🔙 مرکز Xray", action: callbackFor("admin.xrayCenter") }],
      ],
    };
  });

  registerView("admin.xraySyncPreview", async () => ({
    text: joinSections([
      card("👁 پیش‌نمایش سینک 3x-ui", [
        "پنل انتخاب‌شده: انتخاب نشده",
        "inbound انتخاب‌شده: انتخاب نشده",
        "محصولات درگیر: هنوز مشخص نشده",
        "حجم پیش‌فرض: بر اساس محصول",
        "مدت پیش‌فرض: بر اساس محصول",
        "تعداد محصولاتی که ساخته/آپدیت می‌شوند: ۰",
      ]),
      section("⚠️ تأیید لازم است", ["تا زمانی که دکمه تأیید نهایی را نزنید، هیچ محصولی تغییر نمی‌کند."]),
    ]),
    keyboard: [[{ text: "✅ تأیید سینک", action: "admin:xray:sync:confirm" }]],
  }));

  registerView("admin.xrayBulkInbound", async (ctx) => {
    const products = await prisma.product.findMany({
      where: {
        mode: "xray_auto",
        AND: [productNotDeletedWhere()],
      },
      include: { category: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });

    const selected = new Set(ctx.session.xrayBulkInbound?.selectedProductIds ?? []);

    return {
      text: joinSections([
        card("📦 بروزرسانی گروهی اینباند محصولات", [
          "مرحله ۱ از ۴: محصولات Xray را انتخاب کنید.",
          `محصولات انتخاب‌شده: ${selected.size.toLocaleString("fa-IR")}`,
          "سپس پنل و inbound مقصد را انتخاب کنید تا پیش‌نمایش قبل از اعمال نمایش داده شود.",
        ]),
      ]),
      keyboard: [
        [
          { text: "✅ انتخاب همه صفحه", action: "admin:xb:all", tone: "success" },
          { text: "🧹 پاک‌کردن انتخاب", action: "admin:xb:clear", tone: "danger" },
        ],
        ...products.map((product) => [
          {
            text: `${selected.has(product.id) ? "✅" : "⬜️"} ${product.title}`.slice(0, 60),
            action: `admin:xb:t:${product.id}`,
            tone: "primary" as const,
          },
        ]),
        [{ text: "➡️ انتخاب پنل", action: callbackFor("admin.xrayBulkInboundPanel"), tone: "success" }],
      ],
    };
  });

  registerView("admin.xrayBulkInboundPanel", async (ctx) => {
    const panels = await prisma.xrayPanelConfig.findMany({ where: { enabled: true }, orderBy: { updatedAt: "desc" } });
    const selectedCount = ctx.session.xrayBulkInbound?.selectedProductIds.length ?? 0;
    return {
      text: card("📡 انتخاب پنل و inbound", [
        `محصولات انتخاب‌شده: ${selectedCount.toLocaleString("fa-IR")}`,
        "مرحله ۲: پنل مقصد را انتخاب کنید. بعد از انتخاب پنل، inboundهای همان پنل نمایش داده می‌شوند.",
      ]),
      keyboard: [
        ...panels.map((panel) => [{ text: `📡 ${panel.name}`.slice(0, 60), action: `admin:xb:p:${panel.id}`, tone: "primary" as const }]),
        [{ text: "🔙 انتخاب محصولات", action: callbackFor("admin.xrayBulkInbound"), tone: "neutral" }],
      ],
    };
  });

  registerView("admin.xrayBulkInboundPreview", async (ctx) => {
    const state = ctx.session.xrayBulkInbound;
    const products = await prisma.product.findMany({
      where: { id: { in: state?.selectedProductIds ?? [] } },
      select: { id: true, title: true, inboundIds: true },
    });
    const panel = state?.panelId ? await prisma.xrayPanelConfig.findUnique({ where: { id: state.panelId } }) : null;
    return {
      text: joinSections([
        card("👁 پیش‌نمایش بروزرسانی گروهی اینباند", [
          `پنل مقصد: ${panel?.name ?? "انتخاب نشده"}`,
          `inbound مقصد: ${state?.inboundId ?? "انتخاب نشده"}`,
          `محصولات درگیر: ${products.length.toLocaleString("fa-IR")}`,
          ...products
            .slice(0, 10)
            .map((product) => `• ${product.title} ← inbound ${state?.inboundId ?? "—"} (قبلی: ${product.inboundIds.join("، ") || "—"})`),
        ]),
        section("⚠️ تأیید لازم است", ["با دکمه تأیید، inbound همه محصولات انتخاب‌شده بروزرسانی می‌شود."]),
      ]),
      keyboard: [
        [{ text: "✅ اعمال بروزرسانی", action: "admin:xb:apply", tone: "success" }],
        [
          { text: "🔙 انتخاب پنل", action: callbackFor("admin.xrayBulkInboundPanel"), tone: "neutral" },
          { text: "🧩 مرکز Xray", action: callbackFor("admin.xrayCenter"), tone: "neutral" },
        ],
      ],
    };
  });

}
