import { registerView, callbackFor, actionFor, type UiKeyboard } from "../navigation/panel-ui";
import { createCallbackToken, tokenAction } from "../navigation/callback-tokens";
import { isAdminByTelegramId } from "../middlewares/admin.middleware";
import { UserService } from "../../modules/user/user.service";
import { ProductService } from "../../modules/product/product.service";
import { AdminService } from "../../modules/admin/admin.service";
import { adminShopViewModel, maskAdminSecret, xrayAdminStatusLabel, xrayCenterViewModel } from "../../modules/admin/admin.view-models";
import { ReferralService } from "../../modules/referral/referral.service";
import { FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate } from "../../modules/free-account/free-account.service";
import { SupportService } from "../../modules/support/support.service";
import { CouponService } from "../../modules/coupon/coupon.service";
import { BroadcastService, BROADCAST_TARGET_LABELS } from "../../modules/broadcast/broadcast.service";
import { PaymentGatewayService, PaymentInvoiceService, maskApiKey } from "../../modules/payment/payment.service";
import { ProductGuideService } from "../../modules/system/product-guide.service";
import { ForcedJoinService } from "../../modules/system/forced-join.service";
import { PublicPlansService } from "../../modules/product/public-plans.service";
import {
  formatXrayBytes,
  maskToken,
  normalizeXrayStatus,
  XrayClientService,
  XrayPanelService,
  xrayTrafficSnapshot,
} from "../../modules/xray/xray.service";
import { XrayDiagnosticsService } from "../../modules/xray/xray-diagnostics.service";
import type { PaymentInvoiceStatus } from "@prisma/client";
import { accountSummaryMessage, errorMessage, walletSummaryMessage } from "../../utils/messages";
import { formatToman } from "../../utils/money";
import {
  accountStatusLabel,
  divider,
  formatPageCount,
  formatStockLabel,
  formatUserLine,
  getPageParam,
  paymentStatusLabel,
  progressBar,
  purchasedAccountStatusLabel,
  resolveFreeAccountExpiry,
  shortId,
  walletStatusLabel,
  yesNoStatus,
} from "../../utils/formatters";
import { homeKeyboard } from "../keyboards/common.keyboard";
import { adminDashboardViewKeyboard } from "../keyboards/view-keyboards";
import { card, joinSections, section } from "../ui/layout";
import { sectionTitles } from "../ui/sections";
import { actionLabels, adminLabels, statusLabels, userLabels } from "../ui/labels";
import { uiIcons } from "../ui/icons";
import { MonitoringService } from "../../services/monitoring.service";
import { prisma } from "../../services/prisma";

const money = formatToman;
const page = getPageParam;
const pages = formatPageCount;
const userLine = formatUserLine;
const stockLabel = formatStockLabel;
const freeAccountExpiry = resolveFreeAccountExpiry;
const yesNo = yesNoStatus;

export function registerAdminViews() {
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
          { text: "📡 وضعیت پنل‌ها", action: callbackFor("admin.xrayPanels") },
          { text: "👥 کاربران Xray", action: callbackFor("admin.xrayClients") },
        ],
        [
          { text: "🔄 همگام‌سازی", action: callbackFor("admin.xraySync") },
          { text: "🧪 تست اتصال", action: "admin:xray:center:test-api" },
        ],
        [
          { text: "📊 گزارش مصرف", action: callbackFor("admin.xrayClients") },
          { text: "⚠️ خطاها", action: callbackFor("admin.xrayClients", { status: "failed" }) },
        ],
        [
          { text: "⚙️ تنظیمات Xray", action: callbackFor("admin.xraySettings") },
          { text: "🔙 پنل مدیریت", action: callbackFor("admin.dashboard") },
        ],
      ],
    };
  });
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
          { text: "➕ افزودن پنل", action: "flow:start:xray_panel_setup" },
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
          `تعداد inbound: ${panel.lastInboundCount.toLocaleString("fa-IR")}`,
          `آخرین تست اتصال: ${panel.lastSuccessAt ? panel.lastSuccessAt.toLocaleString("fa-IR") : "انجام نشده"}`,
          `توکن/API key: ${maskAdminSecret(panel.apiToken)}`,
          `آخرین خطا: ${panel.lastError ?? "—"}`,
        ]),
        section("🔐 امنیت", ["توکن کامل هرگز در پنل نمایش داده نمی‌شود."]),
      ]),
      keyboard: [
        [
          { text: "🧪 تست اتصال", action: "admin:xray:center:test-api" },
          { text: "📥 دریافت inboundها", action: "admin:xray:test" },
        ],
        [
          { text: "✏️ ویرایش نام", action: "flow:start:xray_panel_setup:name" },
          { text: "🌐 ویرایش آدرس", action: "flow:start:xray_panel_setup:apiBaseUrl" },
        ],
        [
          { text: "🔑 ویرایش توکن/API key", action: "flow:start:xray_panel_setup:apiToken" },
          { text: panel.enabled ? "⛔ غیرفعال کردن" : "✅ فعال کردن", action: `admin:xray:enabled:${panel.enabled ? "0" : "1"}` },
        ],
        [{ text: "🗑 حذف/آرشیو", action: callbackFor("admin.xrayPanel", { panelId: panel.id }) }],
        [
          { text: "🔙 وضعیت پنل‌ها", action: callbackFor("admin.xrayPanels") },
          { text: "🧩 مرکز Xray", action: callbackFor("admin.xrayCenter") },
        ],
      ],
    };
  });

  registerView("admin.xraySync", async () => ({
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
      [{ text: "📡 انتخاب پنل", action: callbackFor("admin.xrayPanels") }],
      [{ text: "👁 نمایش پیش‌نمایش", action: callbackFor("admin.xraySyncPreview") }],
      [{ text: "🔙 مرکز Xray", action: callbackFor("admin.xrayCenter") }],
    ],
  }));

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
    keyboard: [[{ text: "✅ تأیید سینک", action: "admin:xray:sync:confirm" }], [{ text: "🔙 سینک محصولات", action: callbackFor("admin.xraySync") }]],
  }));

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
        [{ text: "↩️ بازگشت به مرکز Xray", action: callbackFor("admin.xrayCenter") }],
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
  registerView("admin.dashboard", async () => {
    const [stats, paymentStats] = await Promise.all([AdminService.dashboard(true), PaymentInvoiceService.stats()]);
    const lowInventory = stats.availableAccounts <= 5 ? `⚠️ ${stats.availableAccounts.toLocaleString("fa-IR")} اکانت آماده` : "عادی ✅";
    return {
      replyKeyboard: "admin",
      text: joinSections([
        card(adminLabels.dashboard, [
          `${uiIcons.users} کل کاربران: ${stats.users.toLocaleString("fa-IR")}`,
          `${uiIcons.product} اکانت‌های فعال/فروخته: ${stats.soldAccounts.toLocaleString("fa-IR")}`,
          `${uiIcons.wallet} درآمد امروز: ${money(paymentStats.todayRevenue)}`,
        ]),
        section(sectionTitles.adminMetrics, [
          `⏳ پرداخت‌های در انتظار: ${paymentStats.pending.toLocaleString("fa-IR")}`,
          `${uiIcons.support} تیکت‌های باز: ${stats.openTickets.toLocaleString("fa-IR")}`,
        ]),
        section(sectionTitles.quickActions, ["برای مدیریت، وارد یکی از گروه‌های اصلی شوید."]),
      ]),
      keyboard: adminDashboardViewKeyboard(),
    };
  });
  registerView("admin.store", async () => {
    const stats = await adminShopViewModel();
    return {
      replyKeyboard: "admin",
      text: joinSections([
        card("🛍 داشبورد فروشگاه", [
          `کل محصولات: ${stats.totalProducts.toLocaleString("fa-IR")}`,
          `محصولات فعال: ${stats.activeProducts.toLocaleString("fa-IR")}`,
          `محصولات غیرفعال: ${stats.inactiveProducts.toLocaleString("fa-IR")}`,
          `دسته‌بندی‌ها: ${stats.categories.toLocaleString("fa-IR")}`,
          `موجودی کم: ${stats.lowStockProducts.toLocaleString("fa-IR")}`,
          `محصولات متصل به Xray: ${stats.xrayConnectedProducts.toLocaleString("fa-IR")}`,
        ]),
      ]),
      keyboard: [
        [
          { text: "📦 محصولات", action: callbackFor("admin.products") },
          { text: "🗂 دسته‌بندی‌ها", action: callbackFor("admin.categories") },
        ],
        [
          { text: "➕ افزودن محصول", action: "flow:start:product_create" },
          { text: "➕ افزودن دسته‌بندی", action: "flow:start:category_create" },
        ],
        [
          { text: "✅ محصولات فعال", action: callbackFor("admin.products", { status: "active" }) },
          { text: "⛔ محصولات غیرفعال", action: callbackFor("admin.products", { status: "inactive" }) },
        ],
        [
          { text: "🔎 جستجوی محصول", action: "flow:start:admin_product_search" },
          { text: "🔄 سینک با Xray", action: callbackFor("admin.xraySync") },
        ],
        [{ text: "🔙 پنل مدیریت", action: callbackFor("admin.dashboard") }],
      ],
    };
  });
  registerView("admin.finance", async () => {
    const stats = await PaymentInvoiceService.stats();
    return {
      replyKeyboard: "admin",
      text: `💳 مالی

${divider}
⏳ پرداخت‌های در انتظار: ${stats.pending.toLocaleString("fa-IR")}
✅ پرداخت‌های موفق: ${stats.successful.toLocaleString("fa-IR")}
💰 درآمد امروز: ${money(stats.todayRevenue)}

مدیریت همه ابزارهای مالی از این زیرمنو انجام می‌شود.`,
      keyboard: [
        [
          { text: "⚡ پرداخت آنی", action: callbackFor("admin.paymentGateway") },
          { text: "💎 واریزی‌های رمزارزی", action: callbackFor("admin.deposits") },
        ],
        [
          { text: "💳 کیف پول‌ها", action: callbackFor("admin.wallets") },
          { text: "🎟 کدهای تخفیف", action: callbackFor("admin.coupons") },
        ],
        [
          { text: "🧾 فاکتورها", action: callbackFor("admin.invoices") },
          { text: "💰 تراکنش‌ها", action: callbackFor("admin.transactions") },
        ],
        [{ text: "⚙️ تنظیمات مالی", action: callbackFor("admin.crypto") }],
      ],
    };
  });
  registerView("admin.usersSupport", async () => {
    const stats = await AdminService.dashboard(true);
    return {
      replyKeyboard: "admin",
      text: `👥 کاربران و پشتیبانی

${divider}
👥 کاربران: ${stats.users.toLocaleString("fa-IR")}
🎫 تیکت‌های باز: ${stats.openTickets.toLocaleString("fa-IR")}
🎁 پاداش دعوت: ${money(stats.referralRewards)}

بخش موردنظر را انتخاب کنید.`,
      keyboard: [
        [
          { text: "👥 مدیریت کاربران", action: callbackFor("admin.users") },
          { text: "🎫 تیکت‌ها", action: callbackFor("admin.tickets") },
        ],
        [
          { text: "🎁 پاداش دعوت", action: callbackFor("admin.referrals") },
          { text: "📊 گزارش کاربران", action: callbackFor("admin.analytics") },
        ],
        [{ text: "📢 اطلاع رسانی و محتوا", action: callbackFor("admin.content") }],
      ],
    };
  });
  registerView("admin.content", async () => {
    return {
      replyKeyboard: "admin",
      text: `📢 محتوا و اطلاع‌رسانی

${divider}
ارسال اطلاعیه، راهنمای محصولات و نمایش عمومی پلن‌ها در این بخش گروه‌بندی شده‌اند.`,
      keyboard: [
        [
          { text: "📢 اطلاع‌رسانی", action: callbackFor("admin.notifications") },
          { text: "📘 راهنمای محصولات", action: callbackFor("admin.productGuides") },
        ],
      ],
    };
  });
  registerView("admin.botSettings", async () => {
    const stats = await AdminService.cryptoWalletStats();
    return {
      replyKeyboard: "settings",
      text: `⚙️ تنظیمات بات

${divider}
🏪 وضعیت فروشگاه: ${stats.setting.storeStatus === "active" ? "فعال ✅" : "غیرفعال ⛔"}
💳 حداقل شارژ: ${money(stats.setting.minimumTopupAmount)}

یادداشت: تغییر یوزرنیم فقط از طریق BotFather امکان‌پذیر است.`,
      keyboard: [
        [
          { text: "🏷 نام ربات", action: callbackFor("admin.botSettings") },
          { text: "📝 توضیحات", action: callbackFor("admin.botSettings") },
        ],
        [
          { text: "🖼 عکس پروفایل", action: callbackFor("admin.botSettings") },
          { text: "👤 یوزرنیم", action: callbackFor("admin.botSettings") },
        ],
        [
          { text: "🏪 وضعیت فروشگاه", action: callbackFor("admin.settings") },
          { text: "📢 عضویت اجباری", action: callbackFor("admin.forcedJoin") },
        ],
        [{ text: "🔐 امنیت", action: callbackFor("admin.forcedJoin") }],
      ],
    };
  });
  registerView("admin.monitoring", async () => {
    const [monitoring, gateway] = await Promise.all([MonitoringService.dashboard(), PaymentGatewayService.getConfig()]);
    const recentErrors =
      monitoring.events
        .slice(0, 5)
        .map((event) => `• ${event.severity === "critical" ? "🚨" : "⚠️"} ${event.section}: ${event.description}`)
        .join("\n") || "خطای اخیری ثبت نشده است.";
    return {
      replyKeyboard: "admin",
      text: `🛡 مانیتورینگ سیستم

${divider}
💳 وضعیت درگاه پرداخت: ${gateway.enabled ? "فعال ✅" : "غیرفعال ⛔"}
🔁 Callback پرداخت: ${monitoring.lastCallbackReceived?.lastCallbackAt ? monitoring.lastCallbackReceived.lastCallbackAt.toLocaleString("fa-IR") : "ثبت نشده"}
🗄 MongoDB: قابل بررسی از اجرای پنل ✅
🤖 Telegram API: وابسته به اتصال ربات

🚨 خطاهای اخیر:
${recentErrors}
${divider}
آخرین پرداخت موفق: ${monitoring.lastSuccessfulPayment?.completedAt ? monitoring.lastSuccessfulPayment.completedAt.toLocaleString("fa-IR") : "—"}
آخرین پرداخت ناموفق: ${monitoring.lastFailedPayment?.updatedAt ? monitoring.lastFailedPayment.updatedAt.toLocaleString("fa-IR") : "—"}`,
      keyboard: [
        [
          { text: "🚨 خطاهای اخیر", action: callbackFor("admin.monitoring") },
          { text: "💳 خطاهای پرداخت", action: callbackFor("admin.paymentStats") },
        ],
        [
          { text: "🎫 خطاهای تیکت", action: callbackFor("admin.tickets") },
          { text: "⚙️ وضعیت سرویس‌ها", action: callbackFor("admin.monitoring") },
        ],
        [{ text: "🔄 بروزرسانی", action: callbackFor("admin.monitoring") }],
      ],
    };
  });
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
        [{ text: "🔙 بازگشت", action: callbackFor("admin.dashboard") }],
      ],
    };
  });
  registerView("admin.crypto", async () => {
    const stats = await AdminService.cryptoWalletStats();
    return {
      text: `⚙️ تنظیمات مالی و پرداخت

حداقل شارژ کیف پول: ${money(stats.setting.minimumTopupAmount)}
کیف پول‌های ثبت‌شده: ${stats.wallets.length.toLocaleString("fa-IR")}`,
      keyboard: [
        [{ text: "💳 مدیریت کیف پول‌ها", action: callbackFor("admin.wallets") }],
        [
          { text: "⚙️ حداقل شارژ", action: "flow:start:minimum_topup" },
          { text: "⚙️ وضعیت فروشگاه", action: callbackFor("admin.store") },
        ],
      ],
    };
  });
  registerView("admin.forcedJoin", async (ctx) => {
    const channels = await AdminService.forcedJoinChannels();
    const botInfo = await ctx.telegram.getMe().catch(() => null);
    if (botInfo) {
      await Promise.all(
        channels.map(async (channel) => {
          try {
            const member = await ctx.telegram.getChatMember(channel.chatId, botInfo.id);
            if (member.status !== channel.lastBotAdminStatus) await ForcedJoinService.updateBotAdminStatus(channel.id, member.status);
            channel.lastBotAdminStatus = member.status;
          } catch {
            if (channel.lastBotAdminStatus !== "unknown") await ForcedJoinService.updateBotAdminStatus(channel.id, "unknown").catch(() => undefined);
            channel.lastBotAdminStatus = "unknown";
          }
        }),
      );
    }
    const activeCount = channels.filter((channel) => channel.status === "active").length;
    const inactiveCount = channels.length - activeCount;
    const channelLines = channels
      .map(
        (channel, index) => `• ${index + 1}. ${channel.title}
  شناسه: ${channel.chatId}
  وضعیت: ${channel.status === "active" ? "✅ فعال" : "⛔ غیرفعال"}
  لینک: ${channel.inviteLink || (channel.chatId.startsWith("@") ? `https://t.me/${channel.chatId.slice(1)}` : "ثبت نشده")}
  وضعیت ادمین ربات: ${channel.lastBotAdminStatus ?? "نیازمند بررسی"}${channel.lastBotAdminStatus && channel.lastBotAdminStatus !== "administrator" && channel.lastBotAdminStatus !== "creator" ? " ⚠️" : ""}`,
      )
      .join("\n\n");

    return {
      text: `📢 مدیریت عضویت اجباری

کانال فعال: ${activeCount.toLocaleString("fa-IR")} · غیرفعال: ${inactiveCount.toLocaleString("fa-IR")}

${channelLines || "کانالی ثبت نشده است."}

کاربران بدون ارسال دوباره /start می‌توانند با دکمه «✅ عضو شدم» همان لحظه تایید شوند.`,
      keyboard: [
        [{ text: "➕ افزودن کانال", action: "flow:start:forced_join_create" }],
        ...channels.map((channel) => [
          {
            text: channel.status === "active" ? `غیرفعال‌سازی ${channel.title}` : `فعال‌سازی ${channel.title}`,
            action: `admin:forced_join:status:${channel.id}:${channel.status === "active" ? "inactive" : "active"}`,
          },
          { text: "🗑 حذف", action: `admin:forced_join:delete:${channel.id}` },
        ]),
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
  registerView("admin.referrals", async () => {
    const tiers = await ReferralService.listTiers();
    return {
      text: `🎁 مدیریت دعوت دوستان\n\n${tiers.map((tier) => `• ${tier.threshold.toLocaleString("fa-IR")} دعوت ← ${money(tier.amount)} · ${tier.isActive ? "فعال" : "غیرفعال"}`).join("\n") || "سطحی ثبت نشده است."}`,
      keyboard: [
        [{ text: "➕ سطح جدید/ویرایش", action: "flow:start:referral_tier_create" }],
        ...tiers.map((tier) => [
          {
            text: tier.isActive ? `غیرفعال‌سازی ${tier.threshold}` : `فعال‌سازی ${tier.threshold}`,
            action: `admin:referral:tier:status:${tier.id}:${tier.isActive ? "0" : "1"}`,
          },
          { text: `حذف ${tier.threshold}`, action: `admin:referral:tier:delete:${tier.id}` },
        ]),
      ],
    };
  });
  registerView("admin.analytics", async () => {
    const stats = await AdminService.dashboard(true);
    return {
      text: `📊 آمار عملیاتی\n\n💰 درآمد موفق: ${money(stats.revenue)}\n📦 اکانت آماده فروش: ${stats.availableAccounts.toLocaleString("fa-IR")}\n✅ اکانت فروخته‌شده: ${stats.soldAccounts.toLocaleString("fa-IR")}\n🎁 مجموع پاداش دعوت: ${money(stats.referralRewards)}\n🎁 اکانت تست تخصیص‌یافته: ${stats.freeAccountsAssigned.toLocaleString("fa-IR")}\n💳 واریزی در انتظار: ${stats.submittedDeposits.toLocaleString("fa-IR")}`,
      keyboard: [],
    };
  });
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
  registerView("admin.notifications", async () => {
    const [targets, recent] = await Promise.all([BroadcastService.targetStats(), BroadcastService.recent(5)]);

    const targetLines = targets.map((item) => `• ${item.label}: ${item.count.toLocaleString("fa-IR")} نفر`).join("\n");

    const recentLines =
      recent
        .map(
          (item) =>
            `• ${item.createdAt.toLocaleString("fa-IR")} · ${item.targetLabel}
  ارسال: ${item.sent.toLocaleString("fa-IR")} · تحویل: ${item.delivered.toLocaleString("fa-IR")} · ناموفق: ${item.failed.toLocaleString("fa-IR")}`,
        )
        .join("\n") || "هنوز اطلاع‌رسانی ثبت نشده است.";

    return {
      text: `📢 اطلاع‌رسانی همگانی

از این بخش می‌توانید پیام مدیریتی را برای گروه‌های مشخص ارسال کنید.

آمار مخاطبان:
${targetLines}

آخرین ارسال‌ها:
${recentLines}`,
      keyboard: [
        [
          {
            text: `📣 ${BROADCAST_TARGET_LABELS.all_users}`,
            action: "flow:start:broadcast_create:all_users",
          },
        ],
        [
          {
            text: `✅ ${BROADCAST_TARGET_LABELS.active_customers}`,
            action: "flow:start:broadcast_create:active_customers",
          },
          {
            text: `🕒 ${BROADCAST_TARGET_LABELS.inactive_customers}`,
            action: "flow:start:broadcast_create:inactive_customers",
          },
        ],
        [
          {
            text: `🗄 ${BROADCAST_TARGET_LABELS.users_with_active_accounts}`,
            action: "flow:start:broadcast_create:users_with_active_accounts",
          },
        ],
        [
          {
            text: `📭 ${BROADCAST_TARGET_LABELS.users_without_active_accounts}`,
            action: "flow:start:broadcast_create:users_without_active_accounts",
          },
        ],
      ],
    };
  });
  registerView("admin.settings", async () => {
    const stats = await AdminService.cryptoWalletStats();
    return {
      text: `⚙️ تنظیمات

وضعیت فروشگاه: ${stats.setting.storeStatus === "active" ? "فعال ✅" : "غیرفعال ⛔"}
حداقل شارژ کیف پول: ${money(stats.setting.minimumTopupAmount)}
کیف پول‌ها: ${stats.wallets.length.toLocaleString("fa-IR")}

بخش تنظیمات را انتخاب کنید:`,
      keyboard: [
        [
          { text: "🏪 وضعیت فروشگاه", action: callbackFor("admin.store") },
          { text: "💳 حداقل شارژ", action: "flow:start:minimum_topup" },
        ],
        [
          { text: "💳 کیف پول‌ها", action: callbackFor("admin.wallets") },
          { text: "⚙️ تنظیمات مالی", action: callbackFor("admin.crypto") },
        ],
        [{ text: "📢 عضویت اجباری", action: callbackFor("admin.forcedJoin") }],
        [{ text: "📘 راهنمای محصولات", action: callbackFor("admin.productGuides") }],
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
