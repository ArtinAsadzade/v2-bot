import {
  registerView, callbackFor, actionFor, createCallbackToken, tokenAction, isAdminByTelegramId, UserService, ProductService, AdminService, adminShopViewModel, maskAdminSecret, xrayAdminStatusLabel, xrayCenterViewModel, ReferralService, FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate, SupportService, CouponService, BroadcastService, BROADCAST_TARGET_LABELS, PaymentGatewayService, PaymentInvoiceService, maskApiKey, ProductGuideService, ForcedJoinService, PublicPlansService, productNotDeletedWhere, formatXrayBytes, maskToken, normalizeXrayStatus, XrayClientService, XrayPanelService, xrayTrafficSnapshot, XrayDiagnosticsService, type PaymentInvoiceStatus, accountSummaryMessage, errorMessage, walletSummaryMessage, formatToman, accountStatusLabel, divider, formatPageCount, formatStockLabel, formatUserLine, getPageParam, paymentStatusLabel, progressBar, purchasedAccountStatusLabel, resolveFreeAccountExpiry, shortId, walletStatusLabel, yesNoStatus, homeKeyboard, adminDashboardViewKeyboard, card, joinSections, section, sectionTitles, actionLabels, adminLabels, statusLabels, userLabels, uiIcons, MonitoringService, prisma, money, page, pages, userLine, stockLabel, freeAccountExpiry, yesNo, type UiKeyboard
} from "./admin-helpers";

export function registerAdminWalletViews() {
  registerView("admin.accounts", async (_ctx, params) => {
    const current = page(params);
    const status = ["available", "reserved", "sold", "disabled", "expired"].includes(params.status)
      ? (params.status as "available" | "reserved" | "sold" | "disabled" | "expired")
      : undefined;
    const productId = params.productId || undefined;
    const [accounts, total] = await AdminService.listAccounts(current, 8, undefined, status, productId);
    const stats = await AdminService.accountStats(productId);
    const products = stats.products.slice(0, 10);
    return {
      text: `🗄 مدیریت موجودی اکانت‌ها\n\nکل: ${stats.total.toLocaleString("fa-IR")} · آماده: ${stats.available.toLocaleString("fa-IR")} · رزرو: ${stats.reserved.toLocaleString("fa-IR")} · فروخته: ${stats.sold.toLocaleString("fa-IR")} · غیرفعال: ${stats.disabled.toLocaleString("fa-IR")} · منقضی: ${stats.expired.toLocaleString("fa-IR")}\n${status ? `\nفیلتر وضعیت: ${accountStatusLabel(status)}` : ""}\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}\n\n${
        accounts
          .map(
            (account) => `• ${account.username} · ${account.product.title}
  وضعیت: ${accountStatusLabel(account.status)}
  کاربر: ${account.assignedUser ? userLine(account.assignedUser) : "—"}
  تاریخ تخصیص: ${account.assignedDate ? account.assignedDate.toLocaleString("fa-IR") : "—"}`,
          )
          .join("\n") || "اکانتی ثبت نشده است."
      }`,
      keyboard: [
        [
          { text: "✅ آماده", action: callbackFor("admin.accounts", { status: "available", productId }) },
          { text: "⏳ رزرو", action: callbackFor("admin.accounts", { status: "reserved", productId }) },
          { text: "💰 فروخته", action: callbackFor("admin.accounts", { status: "sold", productId }) },
        ],
        [
          { text: "⏸ غیرفعال", action: callbackFor("admin.accounts", { status: "disabled", productId }) },
          { text: "⌛ منقضی", action: callbackFor("admin.accounts", { status: "expired", productId }) },
          { text: "نمایش همه", action: callbackFor("admin.accounts", { productId }) },
        ],
        ...accounts.map((account) => [{ text: `👁 ${account.username}`, action: callbackFor("admin.account", { accountId: account.id }) }]),
        ...products.map((product) => [{ text: `➕ افزودن به ${product.title}`, action: `flow:start:account_create:${product.id}` }]),
        [
          { text: "◀️ قبلی", action: callbackFor("admin.accounts", { page: Math.max(current - 1, 1), status, productId }) },
          { text: "بعدی ▶️", action: callbackFor("admin.accounts", { page: current + 1, status, productId }) },
        ],
      ],
    };
  });
  registerView("admin.account", async (_ctx, params) => {
    const account = await AdminService.accountDetail(params.accountId);
    if (!account) return { text: "⚠️ اکانت پیدا نشد.", keyboard: [] };
    const history =
      account.history
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
          { text: "🚚 انتقال", action: callbackFor("admin.account.move", { accountId: account.id }) },
        ],
        [
          { text: "✅ آماده", action: `admin:account:status:${account.id}:available` },
          { text: "⏸ غیرفعال", action: `admin:account:status:${account.id}:disabled` },
          { text: "⌛ منقضی", action: `admin:account:status:${account.id}:expired` },
        ],
        [
          { text: "🗑 حذف", action: `admin:account:delete:confirm:${account.id}` },
          { text: "🗄 موجودی", action: callbackFor("admin.accounts") },
        ],
      ],
    };
  });
  registerView("admin.account.move", async (_ctx, params) => {
    const account = await AdminService.accountDetail(params.accountId);
    if (!account) return { text: "⚠️ اکانت پیدا نشد.", keyboard: [] };
    const products = await ProductService.listActiveProducts(50);
    return {
      text: `🚚 انتقال اکانت ${account.username}\n\nمحصول فعلی: ${account.product.title}\nمحصول مقصد را انتخاب کنید:`,
      keyboard: [
        ...products
          .filter((product) => product.id !== account.productId)
          .map((product) => [
            {
              text: `${product.title} · ${product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}`,
              action: `admin:account:move_to:${account.id}:${product.id}`,
            },
          ]),
        [{ text: "↩️ بازگشت به اکانت", action: callbackFor("admin.account", { accountId: account.id }) }],
      ],
    };
  });
  registerView("admin.wallets", async (_ctx, params) => {
    const current = page(params);
    const [wallets, total] = await AdminService.listCryptoWallets(current);
    return {
      text: `💳 مدیریت کیف پول‌ها\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}\n\n${wallets.map((wallet) => `• ${wallet.displayName ?? wallet.coinName} · ${wallet.networkName} · ${walletStatusLabel(wallet.status)}`).join("\n") || "کیف پولی ثبت نشده است."}`,
      keyboard: [
        [{ text: "➕ کیف پول جدید", action: "flow:start:crypto_wallet_create" }],
        ...wallets.map((wallet) => [
          { text: `👁 ${wallet.displayName ?? wallet.coinName}`, action: callbackFor("admin.wallet", { walletId: wallet.id }) },
        ]),
        [
          { text: "◀️ قبلی", action: callbackFor("admin.wallets", { page: Math.max(current - 1, 1) }) },
          { text: "بعدی ▶️", action: callbackFor("admin.wallets", { page: current + 1 }) },
        ],
      ],
    };
  });
  registerView("admin.wallet", async (_ctx, params) => {
    const detail = await AdminService.walletDetail(params.walletId);
    if (!detail.wallet) return { text: "⚠️ کیف پول پیدا نشد.", keyboard: [] };
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
          { text: "💳 همه کیف پول‌ها", action: callbackFor("admin.wallets") },
        ],
      ],
    };
  });
}
