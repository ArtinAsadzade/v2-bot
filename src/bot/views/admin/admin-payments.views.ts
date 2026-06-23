import {
  registerView, callbackFor, actionFor, createCallbackToken, tokenAction, isAdminByTelegramId, UserService, ProductService, AdminService, adminShopViewModel, maskAdminSecret, xrayAdminStatusLabel, xrayCenterViewModel, ReferralService, FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate, SupportService, CouponService, BroadcastService, BROADCAST_TARGET_LABELS, PaymentGatewayService, PaymentInvoiceService, maskApiKey, ProductGuideService, ForcedJoinService, PublicPlansService, productNotDeletedWhere, formatXrayBytes, maskToken, normalizeXrayStatus, XrayClientService, XrayPanelService, xrayTrafficSnapshot, XrayDiagnosticsService, type PaymentInvoiceStatus, accountSummaryMessage, errorMessage, walletSummaryMessage, formatToman, accountStatusLabel, divider, formatPageCount, formatStockLabel, formatUserLine, getPageParam, paymentStatusLabel, progressBar, purchasedAccountStatusLabel, resolveFreeAccountExpiry, shortId, walletStatusLabel, yesNoStatus, homeKeyboard, adminDashboardViewKeyboard, card, joinSections, section, sectionTitles, actionLabels, adminLabels, statusLabels, userLabels, uiIcons, MonitoringService, prisma, money, page, pages, userLine, stockLabel, freeAccountExpiry, yesNo, type UiKeyboard
} from "./admin-helpers";

export function registerAdminPaymentViews() {
  registerView("admin.transactions", async () => {
    const stats = await AdminService.dashboard(true);
    return {
      text: `💰 تراکنش‌ها

واریزی‌های منتظر بررسی: ${stats.submittedDeposits.toLocaleString("fa-IR")}
سفارش‌ها: ${stats.orders.toLocaleString("fa-IR")}
درآمد موفق: ${money(stats.revenue)}

بخش موردنظر را انتخاب کنید:`,
      keyboard: [
        [
          { text: "💳 واریزی‌ها", action: callbackFor("admin.deposits") },
          { text: "🧾 سفارش‌ها", action: callbackFor("admin.orders") },
        ],
      ],
    };
  });
  registerView("admin.paymentGateway", async () => {
    const [gateway, stats] = await Promise.all([PaymentGatewayService.getConfig(), PaymentInvoiceService.stats()]);
    const connectionLabel =
      gateway.lastConnectionStatus === "success" ? "موفق ✅" : gateway.lastConnectionStatus === "failed" ? "ناموفق ❌" : "تست نشده —";
    const lastInvoiceCreated = stats.recent[0]?.createdAt;
    const lastActualTestStatus =
      gateway.lastConnectionStatus === "success"
        ? "آخرین تست موفق"
        : gateway.lastConnectionStatus === "failed"
          ? "آخرین تست ناموفق"
          : "تست اتصال انجام نشده";
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
${maskApiKey(gateway.apiKey)}

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
${
  gateway.lastConnectionError
    ? `
آخرین خطا:
نیازمند بررسی تنظیمات درگاه است.`
    : ""
}

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
        [
          {
            text: gateway.enabled ? "⏸ فعال/غیرفعال: غیرفعال‌سازی" : "▶️ فعال/غیرفعال: فعال‌سازی",
            action: `admin:payment_gateway:status:${gateway.enabled ? "disabled" : "enabled"}`,
          },
        ],
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
        [
          { text: "🧾 فاکتورها", action: callbackFor("admin.invoices") },
          { text: "📊 آمار پرداخت‌ها", action: callbackFor("admin.paymentStats") },
        ],
        [
          { text: "💎 شارژ رمزارزی", action: callbackFor("admin.deposits") },
          { text: "💰 تراکنش‌ها", action: callbackFor("admin.transactions") },
          { text: "💳 کیف پول‌ها", action: callbackFor("admin.wallets") },
        ],
        [{ text: "↩️ پنل مدیریت", action: callbackFor("admin.dashboard") }],
      ],
    };
  });
  registerView("admin.paymentStats", async () => {
    const stats = await PaymentInvoiceService.stats();
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
      keyboard: [[{ text: "⚡ مدیریت پرداخت آنی", action: callbackFor("admin.paymentGateway") }]],
    };
  });
  registerView("admin.invoices", async (_ctx, params) => {
    const current = page(params);
    const paymentStatuses: PaymentInvoiceStatus[] = ["PENDING", "PAID", "COMPLETED", "CANCELED", "FAILED"];
    const status = paymentStatuses.includes(params.status as PaymentInvoiceStatus) ? (params.status as PaymentInvoiceStatus) : undefined;
    const [invoices, total] = await PaymentInvoiceService.list(current, 8, status);
    const statusLabel = paymentStatusLabel;
    const typeLabel = (value: string) => (value === "WALLET_TOPUP" ? "شارژ کیف پول" : "خرید محصول");
    return {
      text: `🧾 فاکتورهای پرداخت

صفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}
${
  status
    ? `
فیلتر: ${statusLabel(status)}`
    : "\nفیلتر: همه"
}

${
  invoices
    .map(
      (invoice) => `• شناسه: #${shortId(invoice.id)}
  شناسه پرداخت: ${invoice.payId ?? "—"}
  کاربر: ${invoice.user.telegramId}
  مبلغ: ${money(invoice.amount)}
  نوع: ${typeLabel(invoice.type)}
  وضعیت: ${statusLabel(invoice.status)}
  ایجاد: ${invoice.createdAt.toLocaleString("fa-IR")}
  پرداخت: ${invoice.paidAt ? invoice.paidAt.toLocaleString("fa-IR") : "—"}`,
    )
    .join("\n\n") || "فاکتوری ثبت نشده است."
}`,
      keyboard: [
        [
          { text: "همه", action: callbackFor("admin.invoices") },
          { text: "در انتظار", action: callbackFor("admin.invoices", { status: "PENDING" }) },
        ],
        [
          { text: "پرداخت شده", action: callbackFor("admin.invoices", { status: "PAID" }) },
          { text: "تکمیل‌شده", action: callbackFor("admin.invoices", { status: "COMPLETED" }) },
          { text: "لغو شده", action: callbackFor("admin.invoices", { status: "CANCELED" }) },
          { text: "ناموفق", action: callbackFor("admin.invoices", { status: "FAILED" }) },
        ],
        ...invoices.map((invoice) => [{ text: `👁 #${shortId(invoice.id)}`, action: callbackFor("admin.invoice", { invoiceId: invoice.id }) }]),
        [
          { text: "◀️ قبلی", action: callbackFor("admin.invoices", { page: Math.max(current - 1, 1), status }) },
          { text: "بعدی ▶️", action: callbackFor("admin.invoices", { page: current + 1, status }) },
        ],
      ],
    };
  });
  registerView("admin.invoice", async (_ctx, params) => {
    const invoice = await PaymentInvoiceService.detail(params.invoiceId);
    if (!invoice) return { text: "⚠️ فاکتور پرداخت پیدا نشد.", keyboard: [] };
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
      keyboard: [[{ text: "🧾 همه فاکتورها", action: callbackFor("admin.invoices") }]],
    };
  });
  registerView("admin.deposits", async (_ctx, params) => {
    const current = page(params);
    const [deposits, total] = await AdminService.listSubmittedDeposits(current);
    return {
      text: `💰 مدیریت واریزی‌ها\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`,
      keyboard: deposits.map((deposit) => [
        { text: `💳 ${deposit.user.telegramId} · ${money(deposit.amount)}`, action: callbackFor("admin.deposit", { depositId: deposit.id }) },
      ]),
    };
  });
  registerView("admin.deposit", async (_ctx, params) => {
    const deposit = await AdminService.depositDetail(params.depositId);
    if (!deposit) return { text: "⚠️ واریزی پیدا نشد.", keyboard: [] };
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
  registerView("admin.orders", async (_ctx, params) => {
    const current = page(params);
    const [orders, total] = await AdminService.listRecentOrders(current);
    return {
      text: `🧾 سفارش‌ها\n\n${orders.map((order) => `• #${shortId(order.id)} · ${order.user.telegramId} · ${order.product.title} · ${money(order.finalPaidAmount)}`).join("\n") || "سفارشی ثبت نشده است."}\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`,
      keyboard: [
        [
          { text: "◀️ قبلی", action: callbackFor("admin.orders", { page: Math.max(current - 1, 1) }) },
          { text: "بعدی ▶️", action: callbackFor("admin.orders", { page: current + 1 }) },
        ],
      ],
    };
  });
}
