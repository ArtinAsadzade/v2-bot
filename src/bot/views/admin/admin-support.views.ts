import {
  registerView, callbackFor, actionFor, createCallbackToken, tokenAction, isAdminByTelegramId, UserService, ProductService, AdminService, adminShopViewModel, maskAdminSecret, xrayAdminStatusLabel, xrayCenterViewModel, ReferralService, FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate, SupportService, CouponService, BroadcastService, BROADCAST_TARGET_LABELS, PaymentGatewayService, PaymentInvoiceService, maskApiKey, ProductGuideService, ForcedJoinService, PublicPlansService, productNotDeletedWhere, formatXrayBytes, maskToken, normalizeXrayStatus, XrayClientService, XrayPanelService, xrayTrafficSnapshot, XrayDiagnosticsService, type PaymentInvoiceStatus, accountSummaryMessage, errorMessage, walletSummaryMessage, formatToman, accountStatusLabel, divider, formatPageCount, formatStockLabel, formatUserLine, getPageParam, paymentStatusLabel, progressBar, purchasedAccountStatusLabel, resolveFreeAccountExpiry, shortId, walletStatusLabel, yesNoStatus, homeKeyboard, adminDashboardViewKeyboard, card, joinSections, section, sectionTitles, actionLabels, adminLabels, statusLabels, userLabels, uiIcons, MonitoringService, prisma, money, page, pages, userLine, stockLabel, freeAccountExpiry, yesNo, type UiKeyboard
} from "./admin-helpers";

export function registerAdminSupportViews() {
  registerView("admin.tickets", async (_ctx, params) => {
    const current = page(params);
    const [tickets, total] = await AdminService.listTickets(current);
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
            action: callbackFor("admin.ticket", { ticketId: ticket.id }),
          },
        ]),
        [
          { text: "◀️ قبلی", action: callbackFor("admin.tickets", { page: Math.max(current - 1, 1) }) },
          { text: "بعدی ▶️", action: callbackFor("admin.tickets", { page: current + 1 }) },
        ],
      ],
    };
  });
  registerView("admin.ticket", async (_ctx, params) => {
    const ticket = await SupportService.getTicketWithUser(params.ticketId);
    if (!ticket) return { text: "⚠️ تیکت پیدا نشد.", keyboard: [] };
    const statusAction =
      ticket.status === "open"
        ? { text: "✅ بستن", action: `admin:ticket:close:${ticket.id}` }
        : { text: "🔄 باز کردن مجدد", action: `admin:ticket:reopen:${ticket.id}` };
    return {
      text: `🎫 تیکت #${shortId(ticket.id)}
${divider}

👤 کاربر: ${ticket.user.telegramId}${ticket.user.username ? ` (@${ticket.user.username})` : ""}
⚡ وضعیت: ${ticket.status === "open" ? "باز ✅" : "بسته 🔒"}
🕒 آخرین بروزرسانی: ${ticket.updatedAt.toLocaleString("fa-IR")}

${
  ticket.messages
    .map(
      (message) => `${message.senderRole === "admin" ? "👨‍💼 پشتیبانی" : "👤 کاربر"} · ${message.createdAt.toLocaleString("fa-IR")}
${message.message}`,
    )
    .join("\n\n") || "بدون پیام"
}`,
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
