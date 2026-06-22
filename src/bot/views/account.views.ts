import { registerView, callbackFor, actionFor, type UiKeyboard } from "../navigation/panel-ui";
import { createCallbackToken, tokenAction } from "../navigation/callback-tokens";
import { isAdminByTelegramId } from "../middlewares/admin.middleware";
import { UserService } from "../../modules/user/user.service";
import { ProductService } from "../../modules/product/product.service";
import { AdminService } from "../../modules/admin/admin.service";
import { ReferralService } from "../../modules/referral/referral.service";
import {
  FreeAccountService,
  FREE_ACCOUNT_STATUS_LABELS,
  formatFreeAccountDate,
} from "../../modules/free-account/free-account.service";
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
import { accountListViewKeyboard } from "../keyboards/view-keyboards";
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

export function registerAccountViews() {
  registerView("account", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
    const dashboard = await UserService.dashboard(user.id);
    const activeCount = dashboard.activeAccounts.length + dashboard.activeFreeAccounts.length;
    const username = ctx.from?.username ? `@${ctx.from.username}` : user.username ? `@${user.username}` : "ثبت نشده";
    return {
      replyKeyboard: "profile",
      text: joinSections([card(userLabels.myAccounts, [`🆔 Telegram ID: ${user.telegramId}`, `👤 Username: ${username}`, `${uiIcons.wallet} موجودی: ${money(dashboard.user.balance)}`, `${uiIcons.account} اکانت‌های فعال: ${activeCount.toLocaleString("fa-IR")}`, `${uiIcons.invoice} کل خریدها: ${dashboard.recentOrders.length.toLocaleString("fa-IR")}`]), section(sectionTitles.quickActions, ["برای مدیریت حساب، یکی از بخش‌های زیر را انتخاب کنید."])]),
      keyboard: [
        [
          { text: "📦 اکانت‌های من", action: callbackFor("account.details") },
          { text: "💳 کیف پول", action: callbackFor("wallet") },
        ],
        [
          { text: "🎁 دعوت دوستان", action: callbackFor("referral") },
          { text: "🎫 پشتیبانی", action: callbackFor("support") },
        ],
      ],
    };
  });
  registerView("account.details", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
    await FreeAccountService.expireDueAccounts();
    const dashboard = await UserService.dashboard(user.id);
    const activeFreeAccounts = await FreeAccountService.assignedForUser(user.id, true);
    const freeXrayClients = await prisma.xrayClient.findMany({
      where: { userId: user.id, isFreeTest: true, status: { in: ["active", "provisioning", "creating"] }, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    for (const client of freeXrayClients) {
      const exists = await XrayClientService.ensureExistsOrMarkMissing(client).catch(() => ({ exists: true }));
      if (!exists.exists) client.status = "missing_on_panel" as any;
    }
    const visibleFreeXrayClients = freeXrayClients.filter((c) => c.status !== "missing_on_panel" && c.status !== "deleted");
    const purchasedAccounts = dashboard.purchasedAccounts;
    const lines: string[] = [];
    const keyboard: UiKeyboard = [];
    let index = 1;
    for (const item of purchasedAccounts) {
      if (item.xrayClient || item.product.mode === "xray_auto") {
        const client = item.xrayClient;
        if (client) {
          const exists = await XrayClientService.ensureExistsOrMarkMissing(client).catch(() => ({ exists: true }));
          if (!exists.exists) continue;
        }
        const days = client ? Math.max(Math.ceil((client.expiresAt.getTime() - Date.now()) / 86_400_000), 0) : 0;
        lines.push(card(`${uiIcons.product} ${index}. ${item.product.title}`, [`${uiIcons.active} وضعیت: ${normalizeXrayStatus(client?.status)}`, `⏳ اعتبار: ${days.toLocaleString("fa-IR")} روز باقی‌مانده`, `${uiIcons.dashboard} حجم: ${client ? formatXrayBytes(client.usedBytes ?? 0n) : "—"}`, client && !client.isFreeTest ? `${uiIcons.renew} تمدید از جزئیات سرویس` : undefined]));
        if (client)
          keyboard.push([{ text: `🧩 ${item.product.title}`.slice(0, 60), action: callbackFor("account.xray", { xrayClientId: client.id }) }]);
      } else {
        const days = item.expiresAt ? Math.max(Math.ceil((item.expiresAt.getTime() - Date.now()) / 86_400_000), 0) : undefined;
        lines.push(card(`${uiIcons.product} ${index}. ${item.product.title}`, [`${uiIcons.active} وضعیت: ${purchasedAccountStatusLabel(item)}`, `⏳ اعتبار: ${days === undefined ? "نامحدود" : `${days.toLocaleString("fa-IR")} روز باقی‌مانده`}`, `${uiIcons.dashboard} حجم: موجودی دستی`, `${uiIcons.renew} تمدید از جزئیات سرویس`]));
        keyboard.push([{ text: `🧩 ${item.product.title}`.slice(0, 60), action: callbackFor("account", { accountId: item.id }) }]);
      }
      index++;
    }
    for (const client of visibleFreeXrayClients) {
      const days = Math.max(Math.ceil((client.expiresAt.getTime() - Date.now()) / 86_400_000), 0);
      lines.push(card(`${userLabels.freeAccount} ${index}`, [`${uiIcons.active} وضعیت: ${normalizeXrayStatus(client.status)}`, `⏳ اعتبار: ${days.toLocaleString("fa-IR")} روز باقی‌مانده`, `${uiIcons.dashboard} حجم: ${formatXrayBytes(client.trafficBytes, { unlimitedIfZero: true })}`]));
      keyboard.push([{ text: `🆓 اکانت تست ${client.clientEmail}`.slice(0, 60), action: callbackFor("account.xray", { xrayClientId: client.id }) }]);
      index++;
    }
    for (const item of activeFreeAccounts) {
      const days = Math.max(Math.ceil((freeAccountExpiry(item).getTime() - Date.now()) / 86_400_000), 0);
      lines.push(card(`${userLabels.freeAccount} قدیمی ${index}`, [`${statusLabels.active}`, `⏳ اعتبار: ${days.toLocaleString("fa-IR")} روز باقی‌مانده`, `${uiIcons.dashboard} حجم: —`]));
      index++;
    }
    return {
      replyKeyboard: "profile",
      text: joinSections([section(sectionTitles.accounts, ["سرویس‌های فعال شما:"]), lines.join("\n\n") || "هنوز اکانتی برای نمایش وجود ندارد."]),
      keyboard: accountListViewKeyboard(keyboard),
    };
  });
  registerView("account.xray", async (ctx, params) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const client = await prisma.xrayClient.findFirst({ where: { id: params.xrayClientId, userId: user.id }, include: { product: true } });
    if (!client) return { text: "⚠️ سرویس Xray پیدا نشد.", keyboard: [[{ text: "🔙 بازگشت", action: callbackFor("account.details") }]] };
    const exists = await XrayClientService.ensureExistsOrMarkMissing(client).catch(() => ({ exists: true }));
    if (!exists.exists)
      return {
        text: "این سرویس در پنل فعال نیست و از لیست سرویس‌های فعال حذف شد.",
        keyboard: [
          [
            { text: "🔙 بازگشت", action: callbackFor("account.details") },
            { text: "🎫 پشتیبانی", action: callbackFor("support") },
          ],
        ],
      };
    let warning = "";
    let traffic: any = null;
    try {
      traffic = await XrayClientService.traffic(client.clientEmail);
    } catch {
      warning = "\n\n⚠️ اطلاعات مصرف لحظه‌ای در دسترس نیست.";
    }
    try {
      const detail = await XrayClientService.getClient(client.clientEmail);
      const subId = detail.obj?.subId ?? detail.obj?.client?.subId ?? detail.obj?.sub_id;
      if (subId && subId !== client.clientSubId) await prisma.xrayClient.update({ where: { id: client.id }, data: { clientSubId: String(subId) } });
    } catch {}
    const snap = xrayTrafficSnapshot(traffic, client.trafficBytes, client.usedBytes);
    const days = Math.max(Math.ceil((client.expiresAt.getTime() - Date.now()) / 86_400_000), 0);
    const status = client.expiresAt <= new Date() ? "منقضی شده ⛔" : normalizeXrayStatus(client.status);
    return {
      text: `🧩 سرویس Xray\n\n📦 سرویس:\n${client.isFreeTest ? "🆓 اکانت تست" : (client.product?.title ?? "سرویس Xray")}\n\n👤 شناسه:\n${client.clientEmail}\n\n📊 حجم:\n${formatXrayBytes(snap.usedBytes)} / ${formatXrayBytes(snap.totalBytes, { unlimitedIfZero: true })}\n\n📉 باقی‌مانده:\n${formatXrayBytes(snap.remainingBytes, { unlimitedIfZero: snap.totalBytes === 0n })}\n\n⏳ اعتبار:\n${client.expiresAt.toLocaleDateString("fa-IR")}\n${days.toLocaleString("fa-IR")} روز باقی‌مانده\n\n📌 وضعیت:\n${status}${warning}`,
      keyboard: [
        [
          { text: "🔗 دریافت لینک اشتراک", action: `xray:sub:${client.id}` },
          { text: "📲 دریافت QR اشتراک", action: `xray:qr:${client.id}` },
        ],
        client.isFreeTest
          ? [
              { text: "⚙️ دریافت کانفیگ‌ها", action: `xray:configs:${client.id}` },
              { text: "🎫 پشتیبانی", action: callbackFor("support") },
            ]
          : [
              { text: "⚙️ دریافت کانفیگ‌ها", action: `xray:configs:${client.id}` },
              { text: "🔄 تمدید سرویس", action: callbackFor("account.renew", { xrayClientId: client.id }) },
            ],
        [
          { text: "📊 بروزرسانی اطلاعات", action: callbackFor("account.xray", { xrayClientId: client.id }) },
          { text: "🎫 پشتیبانی", action: callbackFor("support") },
        ],
      ],
    };
  });
  registerView("account.renew", async (ctx, params) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [], navigation: { back: false, home: false } };
    const client = await prisma.xrayClient.findFirst({
      where: { id: params.xrayClientId, userId: user.id },
      include: { product: true, order: true, user: true },
    });
    if (!client)
      return {
        text: "این سرویس برای تمدید پیدا نشد.",
        keyboard: [[{ text: "🔙 بازگشت", action: callbackFor("account.details") }]],
        navigation: { back: false, home: false },
      };
    const currentProductTitle = client.product?.title ?? "سرویس Xray";
    // Renewal plans are loaded from ProductService with mode: "xray_auto", isActive: true, deletedAt: null, positive traffic/duration, and stockLimit > soldCount.
    const categories = await ProductService.listRenewalCategories(client.id, client.productId);
    const rows =
      categories.length === 1
        ? categories[0].products.map((product) => [
            {
              text: product.title,
              action: tokenAction("xr:r:s", createCallbackToken(ctx, "renewal", { xrayClientId: client.id, productId: product.id })),
            },
          ])
        : categories.map((category) => [
            {
              text: `📂 ${category.name}`.slice(0, 60),
              action: callbackFor("account.renew.products", { xrayClientId: client.id, categoryId: category.id }),
            },
          ]);
    if (rows.length === 0) {
      return {
        text: `🔄 تمدید سرویس

📦 سرویس فعلی:
${currentProductTitle}

👤 شناسه:
${client.clientEmail}

در حال حاضر پلنی برای تمدید موجود نیست.`,
        keyboard: [
          [{ text: "🛒 فروشگاه", action: callbackFor("shop.categories") }],
          [{ text: "🎫 پشتیبانی", action: callbackFor("support") }],
          [{ text: "🔙 بازگشت", action: callbackFor("account.xray", { xrayClientId: client.id }) }],
        ],
        navigation: { back: false, home: false },
      };
    }
    return {
      text: `🔄 تمدید سرویس

📦 سرویس فعلی:
${currentProductTitle}

👤 شناسه:
${client.clientEmail}

لطفاً پلن تمدید را انتخاب کنید:`,
      keyboard: [...rows, [{ text: "🔙 بازگشت", action: callbackFor("account.xray", { xrayClientId: client.id }) }]],
      navigation: { back: false, home: false },
    };
  });
  registerView("account.renew.products", async (ctx, params) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [], navigation: { back: false, home: false } };
    const client = await prisma.xrayClient.findFirst({
      where: { id: params.xrayClientId, userId: user.id },
      include: { product: true, order: true, user: true },
    });
    if (!client)
      return {
        text: "این سرویس برای تمدید پیدا نشد.",
        keyboard: [[{ text: "🔙 بازگشت", action: callbackFor("account.details") }]],
        navigation: { back: false, home: false },
      };
    const currentProductTitle = client.product?.title ?? "سرویس Xray";
    const available = await ProductService.listRenewalProductsByCategory(params.categoryId, client.id, client.productId);
    if (available.length === 0) {
      return {
        text: `🔄 تمدید سرویس

📦 سرویس فعلی:
${currentProductTitle}

👤 شناسه:
${client.clientEmail}

در حال حاضر پلنی برای تمدید موجود نیست.`,
        keyboard: [
          [{ text: "🛒 فروشگاه", action: callbackFor("shop.categories") }],
          [{ text: "🎫 پشتیبانی", action: callbackFor("support") }],
          [{ text: "🔙 بازگشت", action: callbackFor("account.renew", { xrayClientId: client.id }) }],
        ],
        navigation: { back: false, home: false },
      };
    }
    return {
      text: `🔄 تمدید سرویس

📦 سرویس فعلی:
${currentProductTitle}

👤 شناسه:
${client.clientEmail}

لطفاً پلن تمدید را انتخاب کنید:`,
      keyboard: [
        ...available.map((p) => [
          { text: p.title, action: tokenAction("xr:r:s", createCallbackToken(ctx, "renewal", { xrayClientId: client.id, productId: p.id })) },
        ]),
        [{ text: "🔙 بازگشت", action: callbackFor("account.renew", { xrayClientId: client.id }) }],
      ],
      navigation: { back: false, home: false },
    };
  });
  registerView("account.renew.summary", async (ctx, params) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [], navigation: { back: false, home: false } };
    const quote = await PaymentInvoiceService.buildXrayRenewalQuote(user.id, params.xrayClientId, params.productId);
    const currentDays = Math.max(Math.ceil((quote.client.expiresAt.getTime() - Date.now()) / 86_400_000), 0);
    const newRemainingBytes = quote.remainingBytes + quote.addTrafficBytes;
    return {
      text: `🔄 خلاصه تمدید

📦 سرویس فعلی:
${quote.currentProduct?.title ?? "سرویس Xray"}

👤 شناسه:
${quote.client.clientEmail}

📊 وضعیت فعلی:
مصرف‌شده: ${formatXrayBytes(quote.usedBytes)}
حجم کل فعلی: ${formatXrayBytes(quote.totalBytes, { unlimitedIfZero: true })}
باقی‌مانده: ${formatXrayBytes(quote.remainingBytes)}

⏳ اعتبار فعلی:
${quote.client.expiresAt.toLocaleDateString("fa-IR")}
${currentDays.toLocaleString("fa-IR")} روز باقی‌مانده

➕ پلن تمدید:
${quote.product.title}

📊 حجم اضافه:
${formatXrayBytes(quote.addTrafficBytes)}

📅 مدت اضافه:
${quote.addDays.toLocaleString("fa-IR")} روز

━━━━━━━━━━━━━━━━
نتیجه بعد از تمدید:

📊 حجم کل جدید:
${formatXrayBytes(quote.newTotalBytes)}

📉 باقی‌مانده جدید:
${formatXrayBytes(newRemainingBytes)}

⏳ اعتبار جدید:
${quote.newExpiry.toLocaleDateString("fa-IR")}

💰 مبلغ:
${money(quote.product.price)}${quote.liveOk ? "" : "\n\n⚠️ اطلاعات لحظه‌ای پنل در دسترس نبود؛ محاسبه با داده محلی انجام شد."}`,
      keyboard: [
        [
          {
            text: "💳 پرداخت با کیف پول",
            action: tokenAction("xr:r:w", createCallbackToken(ctx, "renewal", { xrayClientId: quote.client.id, productId: quote.product.id })),
          },
          {
            text: "⚡ پرداخت آنی",
            action: tokenAction("xr:r:i", createCallbackToken(ctx, "renewal", { xrayClientId: quote.client.id, productId: quote.product.id })),
          },
        ],
        [
          {
            text: "🔙 بازگشت",
            action: callbackFor("account.renew.products", { xrayClientId: quote.client.id, categoryId: quote.product.categoryId }),
          },
        ],
      ],
      navigation: { back: false, home: false },
    };
  });
  registerView("account.history", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const dashboard = await UserService.dashboard(user.id);
    return {
      text: `🧾 تاریخچه خرید\n\n${dashboard.recentOrders.map((order) => `• #${shortId(order.id)} · ${order.product.title}\n  مبلغ: ${money(order.finalPaidAmount)} · تاریخ: ${order.createdAt.toLocaleDateString("fa-IR")}`).join("\n") || "هنوز خریدی ثبت نشده است."}\n\n⏳ اکانت‌های منقضی‌شده: ${dashboard.expiredAccounts.length.toLocaleString("fa-IR")}`,
      keyboard: [[{ text: "🛒 خرید جدید", action: callbackFor("shop.categories") }]],
    };
  });
}
