import {
  registerView, callbackFor, actionFor, createCallbackToken, tokenAction, isAdminByTelegramId, UserService, ProductService, AdminService, adminShopViewModel, maskAdminSecret, xrayAdminStatusLabel, xrayCenterViewModel, ReferralService, FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate, SupportService, CouponService, BroadcastService, BROADCAST_TARGET_LABELS, PaymentGatewayService, PaymentInvoiceService, maskApiKey, ProductGuideService, ForcedJoinService, PublicPlansService, productNotDeletedWhere, formatXrayBytes, maskToken, normalizeXrayStatus, XrayClientService, XrayPanelService, xrayTrafficSnapshot, XrayDiagnosticsService, type PaymentInvoiceStatus, accountSummaryMessage, errorMessage, walletSummaryMessage, formatToman, accountStatusLabel, divider, formatPageCount, formatStockLabel, formatUserLine, getPageParam, paymentStatusLabel, progressBar, purchasedAccountStatusLabel, resolveFreeAccountExpiry, shortId, walletStatusLabel, yesNoStatus, homeKeyboard, adminDashboardViewKeyboard, card, joinSections, section, sectionTitles, actionLabels, adminLabels, statusLabels, userLabels, uiIcons, MonitoringService, prisma, money, page, pages, userLine, stockLabel, freeAccountExpiry, yesNo, type UiKeyboard
} from "./admin-helpers";

export function registerAdminCouponViews() {
  registerView("admin.coupons", async (_ctx, params) => {
    const current = page(params);
    const [coupons, total] = await AdminService.listCoupons(current);
    return {
      text: `🎟 مدیریت کوپن‌ها\n\n${coupons.map((coupon) => `• ${coupon.code} · ${coupon.type === "percentage" ? `${(coupon.value || coupon.discountPercent || 0).toLocaleString("fa-IR")}%` : money(coupon.value)} · ${coupon.status} · ${coupon.usedCount.toLocaleString("fa-IR")}/${coupon.maxUses.toLocaleString("fa-IR")} · هر کاربر ${coupon.perUserLimit.toLocaleString("fa-IR")}`).join("\n") || "کوپنی ثبت نشده است."}\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`,
      keyboard: [
        [{ text: "➕ کوپن جدید", action: "flow:start:coupon_create" }],
        ...coupons.map((coupon) => [{ text: `مدیریت ${coupon.code}`, action: callbackFor("admin.coupon", { couponId: coupon.id }) }]),
        [
          { text: "◀️ قبلی", action: callbackFor("admin.coupons", { page: Math.max(current - 1, 1) }) },
          { text: "بعدی ▶️", action: callbackFor("admin.coupons", { page: current + 1 }) },
        ],
      ],
    };
  });
  registerView("admin.coupon", async (_ctx, params) => {
    const direct = await AdminService.couponDetail(params.couponId);
    if (!direct) return { text: "⚠️ کوپن پیدا نشد.", keyboard: [] };
    const expired = direct.expiresAt <= new Date();
    const activeLabel =
      direct.status === "active" && !expired && !direct.deletedAt
        ? "فعال ✅"
        : expired
          ? "⛔ منقضی شده"
          : direct.status === "deleted" || direct.deletedAt
            ? "حذف‌شده"
            : "غیرفعال ⛔";
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
}
