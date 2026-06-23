import {
  registerView, callbackFor, actionFor, createCallbackToken, tokenAction, isAdminByTelegramId, UserService, ProductService, AdminService, adminShopViewModel, maskAdminSecret, xrayAdminStatusLabel, xrayCenterViewModel, ReferralService, FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate, SupportService, CouponService, BroadcastService, BROADCAST_TARGET_LABELS, PaymentGatewayService, PaymentInvoiceService, maskApiKey, ProductGuideService, ForcedJoinService, PublicPlansService, productNotDeletedWhere, formatXrayBytes, maskToken, normalizeXrayStatus, XrayClientService, XrayPanelService, xrayTrafficSnapshot, XrayDiagnosticsService, type PaymentInvoiceStatus, accountSummaryMessage, errorMessage, walletSummaryMessage, formatToman, accountStatusLabel, divider, formatPageCount, formatStockLabel, formatUserLine, getPageParam, paymentStatusLabel, progressBar, purchasedAccountStatusLabel, resolveFreeAccountExpiry, shortId, walletStatusLabel, yesNoStatus, homeKeyboard, adminDashboardViewKeyboard, card, joinSections, section, sectionTitles, actionLabels, adminLabels, statusLabels, userLabels, uiIcons, MonitoringService, prisma, money, page, pages, userLine, stockLabel, freeAccountExpiry, yesNo, type UiKeyboard
} from "./admin-helpers";

export function registerAdminProductViews() {
  registerView("admin.products", async (_ctx, params) => {
    const current = page(params);
    const status = ["active", "inactive"].includes(params.status) ? (params.status as "active" | "inactive") : undefined;
    const [products, total] = await AdminService.listProducts(current, 8, undefined, status);
    const statusText = status === "active" ? "✅ محصولات فعال" : status === "inactive" ? "⛔ محصولات غیرفعال" : "همه محصولات";
    const keyboard = [
      [
        { text: "📋 فهرست محصولات", action: callbackFor("admin.products") },
        { text: "➕ افزودن محصول", action: "flow:start:product_create" },
      ],
      [
        { text: "🔎 جستجوی محصول", action: "flow:start:admin_product_search" },
        { text: "✅ محصولات فعال", action: callbackFor("admin.products", { status: "active" }) },
      ],
      [
        { text: "⛔ محصولات غیرفعال", action: callbackFor("admin.products", { status: "inactive" }) },
        { text: "⚠️ کم‌موجودی/ناموجود", action: callbackFor("admin.products") },
      ],
      ...products.map((product) => [{ text: `📦 ${product.title}`.slice(0, 60), action: callbackFor("admin.product", { productId: product.id }) }]),
      [
        { text: "◀️ قبلی", action: callbackFor("admin.products", { page: Math.max(current - 1, 1), status }) },
        { text: "بعدی ▶️", action: callbackFor("admin.products", { page: current + 1, status }) },
      ],
      [{ text: "↩️ بازگشت به فروشگاه", action: callbackFor("admin.store") }],
    ];
    return {
      text: joinSections([
        card("📦 مدیریت محصولات", [`فیلتر: ${statusText}`, `صفحه ${current.toLocaleString("fa-IR")} از ${pages(total, 8)}`]),
        section(
          "📋 محصولات",
          products.map((product) => {
            const duration = product.mode === "xray_auto" ? (product.durationDays ?? product.duration) : product.duration;
            const traffic = product.mode === "xray_auto" ? formatXrayBytes(product.trafficBytes) : "—";
            return `• ${product.title}
  دسته‌بندی: ${product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}
  قیمت: ${money(product.price)}
  مدت: ${duration.toLocaleString("fa-IR")} روز
  حجم: ${traffic}
  نوع: ${product.mode === "xray_auto" ? "Xray خودکار" : "موجودی دستی"}
  موجودی: ${product.inventoryCount.toLocaleString("fa-IR")} · فروخته‌شده: ${product.soldCount.toLocaleString("fa-IR")}
  وضعیت: ${product.isActive ? "✅ فعال" : "⛔ غیرفعال"}`;
          }),
        ),
      ]),
      keyboard,
    };
  });
  registerView("admin.product", async (ctx, params) => {
    const detail = await AdminService.productDetail(params.productId);
    if (!detail.product) return { text: "⚠️ محصول پیدا نشد.", keyboard: [] };
    const isXray = detail.product.mode === "xray_auto";
    const inboundSnapshot = detail.product.inboundSnapshot
      ? (JSON.parse(detail.product.inboundSnapshot) as Array<{ id: number; remark?: string; protocol?: string; port?: number }>)
      : [];
    if (isXray) {
      return {
        text: `📦 ${detail.product.title}

⚙️ نوع محصول:
ساخت خودکار از پنل Xray

دسته‌بندی: ${detail.product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}
قیمت: ${money(detail.product.price)}
📊 حجم:
${formatXrayBytes(detail.product.trafficBytes)}
📅 مدت:
${(detail.product.durationDays ?? detail.product.duration) === 0 ? "نامحدود" : `${(detail.product.durationDays ?? detail.product.duration).toLocaleString("fa-IR")} روز`}
📦 موجودی:
${(detail.product.stockLimit ?? 0) === 0 ? "ناموجود" : `${detail.available.toLocaleString("fa-IR")} از ${(detail.product.stockLimit ?? 0).toLocaleString("fa-IR")}`}
🌐 محدودیت IP:
${(detail.product.xrayLimitIp ?? 0) === 0 ? "نامحدود" : `${(detail.product.xrayLimitIp ?? 0).toLocaleString("fa-IR")} IP`}
👥 گروه:
${detail.product.xrayGroupName ?? "بدون گروه"}
فروخته‌شده: ${detail.sold.toLocaleString("fa-IR")}
کلاینت فعال: ${detail.activeCount.toLocaleString("fa-IR")} · ناموفق: ${(detail as any).xrayFailed?.toLocaleString("fa-IR") ?? "۰"} · منقضی: ${detail.expired.toLocaleString("fa-IR")}
وضعیت: ${detail.product.isActive ? "فعال" : "غیرفعال"}

🔗 اینباندها:
${inboundSnapshot.length ? inboundSnapshot.map((i) => `• ${i.remark ?? `inbound-${i.id}`} / ${i.protocol ?? "—"} / ${i.port ?? "—"}`).join("\n") : detail.product.inboundIds.map((id) => `• inbound-${id}`).join("\n")}

تغییر حجم/مدت فقط روی خریدهای بعدی اعمال می‌شود و سرویس‌های قبلی را تغییر نمی‌دهد.
⚠️ تغییر گروه، اینباند و محدودیت IP فقط روی خریدهای جدید اعمال می‌شود.
کلاینت‌های قبلی تغییر نمی‌کنند.`,
        keyboard: [
          [
            { text: "✏️ ویرایش عنوان", action: `flow:start:product_edit:${detail.product.id}:title` },
            { text: "💰 تغییر قیمت", action: `flow:start:product_edit:${detail.product.id}:price` },
          ],
          [
            { text: "📂 تغییر دسته", action: `flow:start:product_edit:${detail.product.id}:category` },
            { text: "📊 تغییر حجم", action: `flow:start:product_edit:${detail.product.id}:trafficGB` },
          ],
          [
            { text: "📅 تغییر مدت", action: `flow:start:product_edit:${detail.product.id}:durationDays` },
            { text: "📦 تغییر موجودی", action: `flow:start:product_edit:${detail.product.id}:stockLimit` },
          ],
          [
            { text: "🌐 تغییر محدودیت IP", action: `flow:start:product_edit:${detail.product.id}:limitIp` },
            { text: "♻️ ریست تعداد فروخته‌شده", action: `flow:start:product_edit:${detail.product.id}:soldCount` },
          ],
          [
            {
              text: "👥 تغییر گروه",
              action: tokenAction(
                "xpg:l:pe",
                createCallbackToken(ctx, "xrayPickerProduct", { target: "product_edit", productId: detail.product.id }),
              ),
            },
            {
              text: "🔗 تغییر اینباندها",
              action: tokenAction(
                "xpi:l:pe",
                createCallbackToken(ctx, "xrayPickerProduct", { target: "product_edit", productId: detail.product.id }),
              ),
            },
          ],
          [
            { text: "🔗 اتصال به Xray", action: callbackFor("admin.xrayClients", { productId: detail.product.id }) },
            { text: "🔄 سینک با 3x-ui", action: callbackFor("admin.xraySync") },
          ],
          [
            {
              text: detail.product.isActive ? "⛔ غیرفعال" : "✅ فعال",
              action: `admin:product:active:${detail.product.id}:${detail.product.isActive ? "0" : "1"}`,
            },
          ],
          [{ text: "🧪 تست ساخت سرویس", action: `admin:xray:refresh:${detail.product.id}` }],
          [{ text: "🗑 آرشیو محصول", action: `admin:product:delete:${detail.product.id}` }],
          [
            { text: "🔙 محصولات", action: callbackFor("admin.products") },
            { text: "🛍 فروشگاه", action: callbackFor("admin.store") },
          ],
        ],
      };
    }
    return {
      text: `📦 ${detail.product.title}

دسته‌بندی: ${detail.product.category?.name ?? "دسته‌بندی نامعتبر یا حذف‌شده"}
قیمت: ${money(detail.product.price)}
مدت: ${detail.product.duration.toLocaleString("fa-IR")} روز
موجودی قابل فروش: ${detail.available.toLocaleString("fa-IR")}
فروخته‌شده: ${detail.sold.toLocaleString("fa-IR")}
اکانت فعال: ${detail.activeCount.toLocaleString("fa-IR")}
رزرو: ${detail.reserved.toLocaleString("fa-IR")} · غیرفعال: ${detail.disabled.toLocaleString("fa-IR")} · منقضی: ${detail.expired.toLocaleString("fa-IR")}
وضعیت: ${detail.product.isActive ? "فعال" : "غیرفعال"}`,
      keyboard: [
        [
          { text: "✏️ ویرایش عنوان", action: `flow:start:product_edit:${detail.product.id}:title` },
          { text: "💰 تغییر قیمت", action: `flow:start:product_edit:${detail.product.id}:price` },
        ],
        [
          { text: "🔐 افزودن اکانت", action: `flow:start:account_create:${detail.product.id}` },
          { text: "📅 تغییر مدت", action: `flow:start:product_edit:${detail.product.id}:duration` },
        ],
        [
          { text: "🗂 تغییر دسته‌بندی", action: `flow:start:product_edit:${detail.product.id}:category` },
          { text: "🗄 اکانت‌های محصول", action: callbackFor("admin.accounts", { productId: detail.product.id }) },
        ],
        [
          {
            text: detail.product.isActive ? "⛔ غیرفعال" : "✅ فعال",
            action: `admin:product:active:${detail.product.id}:${detail.product.isActive ? "0" : "1"}`,
          },
        ],
        [{ text: "🗑 آرشیو محصول", action: `admin:product:delete:${detail.product.id}` }],
        [
          { text: "🔙 محصولات", action: callbackFor("admin.products") },
          { text: "🛍 فروشگاه", action: callbackFor("admin.store") },
        ],
      ],
    };
  });
  registerView("admin.freeAccounts", async () => {
    const cfg = await FreeAccountService.getXrayConfig();
    const panel = await XrayPanelService.getEnabledConfig();
    let live: any[] = [];
    try {
      live = await XrayClientService.listInbounds();
    } catch {}
    const selected = new Set(cfg.inboundIds);
    const snapshot = cfg.inboundSnapshot ? JSON.parse(cfg.inboundSnapshot) : live.filter((i) => selected.has(i.id));
    return {
      text: `🆓 مدیریت اکانت تست

${divider}

وضعیت: ${cfg.enabled ? "فعال ✅" : "غیرفعال ⛔"}
پنل Xray: ${panel ? "فعال ✅" : "غیرفعال ⛔"}

📊 حجم تست:
${formatXrayBytes(cfg.trafficBytes)}

📅 مدت:
${cfg.durationDays.toLocaleString("fa-IR")} روز

📦 موجودی:
${cfg.available.toLocaleString("fa-IR")} از ${cfg.stockLimit.toLocaleString("fa-IR")}
مصرف‌شده: ${cfg.usedCount.toLocaleString("fa-IR")}

🌐 محدودیت IP:
${(cfg.limitIp ?? 0).toLocaleString("fa-IR")} (${(cfg.limitIp ?? 0) === 0 ? "بدون محدودیت" : "IP"})

👥 گروه:
${cfg.groupName ?? "بدون گروه"}

🔗 اینباندهای انتخاب‌شده:
${snapshot.map((i: any) => `• ${i.remark ?? i.tag ?? i.id} / ${i.protocol ?? "—"} / ${i.port ?? "—"}`).join("\n") || "انتخاب نشده"}

اینباندهای زنده پنل: ${live.length.toLocaleString("fa-IR")}${cfg.inboundIds.length ? "" : "\n\nبرای فعال‌سازی اکانت تست، از دکمه «🔗 انتخاب اینباندها» حداقل یک اینباند انتخاب کنید."}`,
      keyboard: [
        [
          { text: "📊 تغییر حجم", action: "flow:start:free_test_config:trafficGB" },
          { text: "📅 تغییر مدت", action: "flow:start:free_test_config:durationDays" },
        ],
        [
          { text: "📦 تغییر موجودی", action: "flow:start:free_test_config:stockLimit" },
          { text: "🌐 تغییر محدودیت IP", action: "flow:start:free_test_config:limitIp" },
        ],
        [
          { text: "👥 انتخاب گروه", action: "admin:xray_picker:group:free_test" },
          { text: "🔗 انتخاب اینباندها", action: "admin:xray_picker:inbounds:free_test" },
        ],
        [
          { text: cfg.enabled ? "🚫 غیرفعال‌سازی" : "✅ فعال‌سازی", action: `admin:free_test:enabled:${cfg.enabled ? "0" : "1"}` },
          { text: "🔄 بروزرسانی اینباندها", action: "admin:xray_picker:inbounds:free_test" },
        ],
        [{ text: "🔙 بازگشت به فروشگاه", action: callbackFor("admin.store") }],
      ],
    };
  });
  registerView("admin.productGuides", async () => {
    const [sections, plansSetting] = await Promise.all([ProductGuideService.listAll(), PublicPlansService.getSetting()]);
    return {
      text: `📘 راهنمای محصولات

${divider}

${
  sections
    .map(
      (section, index) => `${index + 1}. ${section.icon} ${section.title}
  توضیح: ${section.shortDescription}
  ترتیب: ${section.displayOrder.toLocaleString("fa-IR")} · وضعیت: ${section.isActive ? "✅ فعال" : "⛔ غیرفعال"}`,
    )
    .join("\n\n") || "هنوز بخشی ثبت نشده است."
}
`,
      keyboard: [
        [{ text: "➕ ساخت بخش راهنما", action: "flow:start:product_guide_create" }],
        ...sections.map((section) => [
          { text: `✏️ ${section.title}`, action: `flow:start:product_guide_edit:${section.id}` },
          { text: section.isActive ? "⛔ غیرفعال" : "✅ فعال", action: `admin:product_guide:status:${section.id}:${section.isActive ? "0" : "1"}` },
          { text: "🗑 حذف", action: `admin:product_guide:delete:${section.id}` },
        ]),
      ],
    };
  });
}
