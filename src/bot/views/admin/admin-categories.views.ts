import {
  registerView, callbackFor, actionFor, createCallbackToken, tokenAction, isAdminByTelegramId, UserService, ProductService, AdminService, adminShopViewModel, maskAdminSecret, xrayAdminStatusLabel, xrayCenterViewModel, ReferralService, FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate, SupportService, CouponService, BroadcastService, BROADCAST_TARGET_LABELS, PaymentGatewayService, PaymentInvoiceService, maskApiKey, ProductGuideService, ForcedJoinService, PublicPlansService, productNotDeletedWhere, formatXrayBytes, maskToken, normalizeXrayStatus, XrayClientService, XrayPanelService, xrayTrafficSnapshot, XrayDiagnosticsService, type PaymentInvoiceStatus, accountSummaryMessage, errorMessage, walletSummaryMessage, formatToman, accountStatusLabel, divider, formatPageCount, formatStockLabel, formatUserLine, getPageParam, paymentStatusLabel, progressBar, purchasedAccountStatusLabel, resolveFreeAccountExpiry, shortId, walletStatusLabel, yesNoStatus, homeKeyboard, adminDashboardViewKeyboard, card, joinSections, section, sectionTitles, actionLabels, adminLabels, statusLabels, userLabels, uiIcons, MonitoringService, prisma, money, page, pages, userLine, stockLabel, freeAccountExpiry, yesNo, type UiKeyboard
} from "./admin-helpers";

export function registerAdminCategoryViews() {
  registerView("admin.categories", async (_ctx, params) => {
    const current = page(params);
    const [categories, total] = await AdminService.listCategories(current);
    return {
      text: `📂 مدیریت دسته‌بندی‌ها\n\nصفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}\n\n${categories.map((category) => `${category.icon ?? "📂"} ${category.name} · ${yesNo(category.isActive)} · محصول: ${category._count.products.toLocaleString("fa-IR")} · فعال: ${category.activeProductCount.toLocaleString("fa-IR")}`).join("\n") || "دسته‌بندی ثبت نشده است."}`,
      keyboard: [
        [{ text: "➕ دسته‌بندی جدید", action: "flow:start:category_create" }],
        ...categories.map((category) => [
          { text: `${category.icon ?? "📂"} مدیریت ${category.name}`, action: callbackFor("admin.category", { categoryId: category.id }) },
        ]),
        [
          { text: "◀️ قبلی", action: callbackFor("admin.categories", { page: Math.max(current - 1, 1) }) },
          { text: "بعدی ▶️", action: callbackFor("admin.categories", { page: current + 1 }) },
        ],
      ],
    };
  });
  registerView("admin.category", async (_ctx, params) => {
    const productPage = Math.max(Number(params.productPage ?? 1), 1);
    const detail = await AdminService.categoryDetail(params.categoryId, productPage, 6);

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
          { text: "✏️ ویرایش نام", action: `flow:start:category_edit:${detail.category.id}:name` },
          { text: "📝 ویرایش توضیحات", action: `flow:start:category_edit:${detail.category.id}:description` },
        ],
        [
          { text: "🎨 تغییر آیکون", action: `flow:start:category_edit:${detail.category.id}:icon` },
          { text: "🔢 تغییر ترتیب", action: `flow:start:category_edit:${detail.category.id}:order` },
        ],
        [
          {
            text: detail.category.isActive ? "⛔ غیرفعال" : "✅ فعال",
            action: `admin:category:status:${detail.category.id}:${detail.category.isActive ? "0" : "1"}`,
          },
          { text: "📦 محصولات دسته", action: callbackFor("admin.products") },
        ],
        [{ text: "🗑 آرشیو دسته", action: `admin:category:delete:${detail.category.id}` }],
        [
          {
            text: "◀️ محصولات قبلی",
            action: callbackFor("admin.category", { categoryId: detail.category.id, productPage: Math.max(productPage - 1, 1) }),
          },
          { text: "محصولات بعدی ▶️", action: callbackFor("admin.category", { categoryId: detail.category.id, productPage: productPage + 1 }) },
        ],
        [
          { text: "🔙 دسته‌بندی‌ها", action: callbackFor("admin.categories") },
          { text: "🛍 فروشگاه", action: callbackFor("admin.store") },
        ],
      ],
    };
  });
}
