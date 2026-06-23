import {
  registerView, callbackFor, actionFor, createCallbackToken, tokenAction, isAdminByTelegramId, UserService, ProductService, AdminService, adminShopViewModel, maskAdminSecret, xrayAdminStatusLabel, xrayCenterViewModel, ReferralService, FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate, SupportService, CouponService, BroadcastService, BROADCAST_TARGET_LABELS, PaymentGatewayService, PaymentInvoiceService, maskApiKey, ProductGuideService, ForcedJoinService, PublicPlansService, productNotDeletedWhere, formatXrayBytes, maskToken, normalizeXrayStatus, XrayClientService, XrayPanelService, xrayTrafficSnapshot, XrayDiagnosticsService, type PaymentInvoiceStatus, accountSummaryMessage, errorMessage, walletSummaryMessage, formatToman, accountStatusLabel, divider, formatPageCount, formatStockLabel, formatUserLine, getPageParam, paymentStatusLabel, progressBar, purchasedAccountStatusLabel, resolveFreeAccountExpiry, shortId, walletStatusLabel, yesNoStatus, homeKeyboard, adminDashboardViewKeyboard, card, joinSections, section, sectionTitles, actionLabels, adminLabels, statusLabels, userLabels, uiIcons, MonitoringService, prisma, money, page, pages, userLine, stockLabel, freeAccountExpiry, yesNo, type UiKeyboard
} from "./admin-helpers";

export function registerAdminUserViews() {
  registerView("admin.users", async (_ctx, params) => {
    const current = page(params);
    const [users, total] = await AdminService.listUsers(current);
    const keyboard = users.map((user) => [
      { text: `👤 ${userLine(user)} · ${money(user.balance)}`, action: callbackFor("admin.user", { userId: user.id }) },
    ]);
    keyboard.push([
      { text: "◀️ قبلی", action: callbackFor("admin.users", { page: Math.max(current - 1, 1) }) },
      { text: "بعدی ▶️", action: callbackFor("admin.users", { page: current + 1 }) },
    ]);
    return { text: `👥 کاربران\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`, keyboard };
  });
  registerView("admin.user", async (_ctx, params) => {
    const profile = await AdminService.userProfile(params.userId);
    if (!profile.user) return { text: "⚠️ کاربر پیدا نشد.", keyboard: [] };
    return {
      text: `👤 خلاصه حساب شما\n\n${userLine(profile.user)}\nموجودی: ${money(profile.user.balance)}\nدعوت موفق: ${profile.referralCount.toLocaleString("fa-IR")}\nوضعیت: ${profile.user.isBanned ? "مسدود" : "فعال"}\n\nخریدهای اخیر:\n${profile.orders.map((order) => `• ${order.product.title} · ${money(order.finalPaidAmount)}`).join("\n") || "خریدی ندارد"}\n\nتراکنش‌های کیف پول:\n${profile.transactions.map((tx) => `• ${tx.description}: ${money(tx.amount)}`).join("\n") || "تراکنشی ندارد"}`,
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
        [{ text: "📜 سوابق مسدودی", action: callbackFor("admin.user.blocks", { userId: profile.user.id }) }],
      ],
    };
  });
  registerView("admin.user.blocks", async (_ctx, params) => {
    const history = await AdminService.userBlockHistory(params.userId);
    return {
      text: `📜 سوابق مسدودی\n\n${history.map((item) => `• ${item.blocked ? "مسدود" : "رفع مسدودی"} · مدیر: ${item.actorId} · ${item.createdAt.toLocaleString("fa-IR")}${item.reason ? ` · ${item.reason}` : ""}`).join("\n") || "سابقه‌ای ثبت نشده است."}`,
      keyboard: [],
    };
  });
}
