import { registerView, callbackFor, actionFor, type UiKeyboard, type ViewRenderer } from "../navigation/panel-ui";
import { createCallbackToken, tokenAction } from "../navigation/callback-tokens";
import { isAdminByTelegramId } from "../middlewares/admin.middleware";
import { UserService } from "../../modules/user/user.service";
import { ProductService } from "../../modules/product/product.service";
import { AdminService } from "../../modules/admin/admin.service";
import { ReferralService } from "../../modules/referral/referral.service";
import { RewardService, REWARD_STATUS_LABELS, type UserRewardDto } from "../../modules/reward/reward.service";
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
import { accountActionViewKeyboard } from "../keyboards/account.keyboard";
import { navRow } from "../keyboards/panel-keyboard.helpers";
import { card, joinSections, section } from "../ui/layout";
import { uxCopy } from "../messages/copy";
import { sectionTitles } from "../ui/sections";
import { actionLabels, adminLabels, statusLabels, userLabels } from "../ui/labels";
import { uiIcons } from "../ui/icons";
import { MonitoringService } from "../../services/monitoring.service";
import { prisma } from "../../services/prisma";
import { withTimeout } from "../../utils/async";
import { labels } from "../keyboards/design-system";

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

    if (!user) {
      return {
        text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.",
        keyboard: [],
      };
    }

    const dashboard = await UserService.dashboard(user.id);
    const activeCount = dashboard.activeAccounts.length + dashboard.activeFreeAccounts.length;

    return {
      replyKeyboard: "profile",
      text: joinSections([
        card("👤 حساب کاربری", [
          `💰 موجودی کیف پول: ${money(dashboard.user.balance)}`,
          `📦 سرویس فعال: ${activeCount.toLocaleString("fa-IR")}`,
          `📅 تاریخ عضویت: ${user.createdAt.toLocaleDateString("fa-IR")}`,
        ]),
        section(sectionTitles.quickActions, ["از گزینه‌های زیر برای مدیریت حساب، کیف پول و سرویس‌های خود استفاده کنید."]),
      ]),
      keyboard: [
        navRow({ text: "👤 اطلاعات حساب", view: "account.profile" }, { text: labels.orders, view: "services" }),
        navRow(
          { text: "♻️ تمدید سرویس", view: "services.renew", tone: "success" },
          { text: "🎁 جوایز من", view: "account.rewards", tone: "success" },
        ),
        navRow({ text: "🧾 تاریخچه خرید", view: "account.history" }, { text: "💰 کیف پول", view: "wallet" }),
        navRow({ text: "🛒 خرید سرویس جدید", view: "shop", tone: "success" }),
      ],
    };
  });

  registerView("account.rewards", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
    const rewards = await RewardService.listUserRewards(user.id);
    const available = rewards.filter((reward) => reward.status === "available");
    const claimed = rewards.filter((reward) => reward.status === "claimed");
    const needsReview = rewards.filter((reward) => reward.status === "failed" || reward.status === "manual_review");
    const sourceLabel = (reward: UserRewardDto) =>
      reward.source === "prediction" ? "🔮 پیش‌بینی" : reward.source === "referral" ? "🎁 دعوت دوستان" : "🎁 جایزه";
    const valueLabel = (reward: UserRewardDto) =>
      reward.rewardType === "wallet" ? `💰 ${money(reward.walletAmount ?? 0)}` : `📦 ${reward.productTitle ?? "محصول جایزه"}`;
    const lines = rewards
      .slice(0, 10)
      .map((reward, index) =>
        card(`${(index + 1).toLocaleString("fa-IR")}. ${reward.title}`, [
          `منبع: ${sourceLabel(reward)}`,
          `ارزش: ${valueLabel(reward)}`,
          `وضعیت: ${REWARD_STATUS_LABELS[reward.status]}`,
          `تاریخ ایجاد: ${reward.createdAt.toLocaleDateString("fa-IR")}`,
          reward.claimedAt ? `تاریخ دریافت: ${reward.claimedAt.toLocaleDateString("fa-IR")}` : undefined,
        ]),
      );
    const claimRows: UiKeyboard = available
      .slice(0, 8)
      .map((reward) => [{ text: `🎁 دریافت جایزه: ${reward.title}`.slice(0, 60), action: reward.claimAction ?? "reward:noop", tone: "success" }]);
    return {
      replyKeyboard: "profile",
      text: joinSections([
        card("🎁 جوایز من", [
          `🎁 آماده دریافت: ${available.length.toLocaleString("fa-IR")}`,
          `✅ دریافت‌شده: ${claimed.length.toLocaleString("fa-IR")}`,
          `⚠️ نیازمند بررسی: ${needsReview.length.toLocaleString("fa-IR")}`,
        ]),
        lines.join("\n\n") || "فعلاً جایزه‌ای برای دریافت ندارید.\n\nبا دعوت دوستان یا شرکت در پیش‌بینی‌ها می‌توانید جایزه بگیرید.",
      ]),
      keyboard: [
        ...claimRows,
        navRow(
          { text: "🔮 شرکت در پیش‌بینی‌ها", view: "prediction", tone: "primary" },
          { text: "🎁 دعوت دوستان", view: "referral", tone: "success" },
        ),
      ],
    };
  });
  registerView("account.profile", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;

    if (!user) {
      return {
        text: "⚠️ پروفایل شما پیدا نشد.",
        keyboard: [],
      };
    }

    const dashboard = await UserService.dashboard(user.id);

    return {
      text: joinSections([
        card("👤 پروفایل کاربری", [
          `🆔 شناسه کاربر: ${user.telegramId}`,
          `👤 نام: ${user.firstName ?? "ثبت نشده"}`,
          `📛 نام کاربری: ${user.username ? `@${user.username}` : "ثبت نشده"}`,
          `💰 موجودی کیف پول: ${money(dashboard.user.balance)}`,
          `📦 سرویس فعال: ${(dashboard.activeAccounts.length + dashboard.activeFreeAccounts.length).toLocaleString("fa-IR")}`,
          `📅 تاریخ عضویت: ${user.createdAt.toLocaleDateString("fa-IR")}`,
          `🚦 وضعیت حساب: ${user.isBanned ? "محدود شده ⛔" : "فعال ✅"}`,
        ]),
      ]),
      keyboard: [
        navRow({ text: "💰 کیف پول", view: "wallet", tone: "primary" }, { text: labels.orders, view: "services", tone: "primary" }),
        navRow(
          { text: "🎁 جوایز من", view: "account.rewards", tone: "success" },
          { text: "🧾 تاریخچه خرید", view: "account.history", tone: "success" },
        ),
        navRow({ text: "🎫 پشتیبانی", view: "support", tone: "warning" }),
      ],
    };
  });
  const renderServicesActive: ViewRenderer = async (ctx, params) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد. لطفاً /start را ارسال کنید.", keyboard: [] };
    await FreeAccountService.expireDueAccounts();
    const dashboard = await UserService.dashboard(user.id);
    const activeFreeAccounts = await FreeAccountService.assignedForUser(user.id, true);
    const freeXrayClients = await prisma.xrayClient.findMany({
      where: { userId: user.id, isFreeTest: true, status: { in: ["active", "provisioning", "creating"] }, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    const visibleFreeXrayClients = freeXrayClients.filter((c) => c.status !== "missing_on_panel" && c.status !== "deleted");
    const purchasedAccounts = dashboard.activeAccounts;
    const lines: string[] = [];
    const keyboard: UiKeyboard = [];
    let index = 1;
    for (const item of purchasedAccounts) {
      if (item.xrayClient || item.product.mode === "xray_auto") {
        const client = item.xrayClient;
        if (client && ["missing_on_panel", "deleted"].includes(client.status)) continue;
        const days = client ? Math.max(Math.ceil((client.expiresAt.getTime() - Date.now()) / 86_400_000), 0) : 0;
        lines.push(
          card(`${uiIcons.product} ${index}. ${item.product.title}`, [
            `${uiIcons.active} وضعیت: ${normalizeXrayStatus(client?.status)}`,
            `⏳ اعتبار: ${days.toLocaleString("fa-IR")} روز باقی‌مانده`,
            `${uiIcons.dashboard} حجم: ${client ? formatXrayBytes(client.usedBytes ?? 0n) : "—"}`,
            client && !client.isFreeTest ? `${uiIcons.renew} تمدید از جزئیات سرویس` : undefined,
          ]),
        );
        if (client)
          keyboard.push([{ text: `🧩 ${item.product.title}`.slice(0, 60), action: callbackFor("account.xray", { xrayClientId: client.id }) }]);
      } else {
        const days = item.expiresAt ? Math.max(Math.ceil((item.expiresAt.getTime() - Date.now()) / 86_400_000), 0) : undefined;
        lines.push(
          card(`${uiIcons.product} ${index}. ${item.product.title}`, [
            `${uiIcons.active} وضعیت: ${purchasedAccountStatusLabel(item)}`,
            `⏳ اعتبار: ${days === undefined ? "نامحدود" : `${days.toLocaleString("fa-IR")} روز باقی‌مانده`}`,
            `${uiIcons.dashboard} حجم: موجودی دستی`,
            `${uiIcons.renew} تمدید از جزئیات سرویس`,
          ]),
        );
        keyboard.push([{ text: `🧩 ${item.product.title}`.slice(0, 60), action: callbackFor("account", { accountId: item.id }) }]);
      }
      index++;
    }
    for (const client of visibleFreeXrayClients) {
      const days = Math.max(Math.ceil((client.expiresAt.getTime() - Date.now()) / 86_400_000), 0);
      lines.push(
        card(`${userLabels.freeAccount} ${index}`, [
          `${uiIcons.active} وضعیت: ${normalizeXrayStatus(client.status)}`,
          `⏳ اعتبار: ${days.toLocaleString("fa-IR")} روز باقی‌مانده`,
          `${uiIcons.dashboard} حجم: ${formatXrayBytes(client.trafficBytes, { unlimitedIfZero: true })}`,
        ]),
      );
      keyboard.push([{ text: `🆓 اکانت تست ${client.clientEmail}`.slice(0, 60), action: callbackFor("account.xray", { xrayClientId: client.id }) }]);
      index++;
    }
    for (const item of activeFreeAccounts) {
      const days = Math.max(Math.ceil((freeAccountExpiry(item).getTime() - Date.now()) / 86_400_000), 0);
      lines.push(
        card(`${userLabels.freeAccount} قدیمی ${index}`, [
          `${statusLabels.active}`,
          `⏳ اعتبار: ${days.toLocaleString("fa-IR")} روز باقی‌مانده`,
          `${uiIcons.dashboard} حجم: —`,
        ]),
      );
      index++;
    }
    const inactiveCount = dashboard.expiredAccounts.length;
    const currentPage = page(params);
    const perPage = 5;
    const totalPages = Math.max(Math.ceil(lines.length / perPage), 1);
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * perPage;
    const visibleLines = lines.slice(start, start + perPage);
    const visibleKeyboard = keyboard.slice(start, start + perPage);
    const pagination: UiKeyboard = [];
    if (totalPages > 1) {
      pagination.push([
        ...(safePage > 1 ? [{ text: "⬅️ قبلی", action: callbackFor("services.active", { page: safePage - 1 }) }] : []),
        {
          text: `صفحه ${safePage.toLocaleString("fa-IR")}/${totalPages.toLocaleString("fa-IR")}`,
          action: callbackFor("services.active", { page: safePage }),
        },
        ...(safePage < totalPages ? [{ text: "بعدی ➡️", action: callbackFor("services.active", { page: safePage + 1 }) }] : []),
      ]);
    }
    return {
      replyKeyboard: "profile",
      text: joinSections([
        section(sectionTitles.accounts, [
          `✅ فعال: ${lines.length.toLocaleString("fa-IR")}`,
          `⛔ غیرفعال/منقضی: ${inactiveCount.toLocaleString("fa-IR")}`,
          `📄 صفحه ${safePage.toLocaleString("fa-IR")} از ${totalPages.toLocaleString("fa-IR")}`,
        ]),
        visibleLines.join("\n\n") || "هنوز اکانتی برای نمایش وجود ندارد.",
      ]),
      keyboard: accountListViewKeyboard([...visibleKeyboard, ...pagination]),
    };
  };
  registerView("account.details", renderServicesActive);
  registerView("services.active", renderServicesActive);
  registerView("services", async () => ({
    text: joinSections([card(labels.orders, ["بخش موردنظر سرویس‌ها را انتخاب کنید."])]),
    keyboard: [
      navRow({ text: "✅ سرویس‌های فعال", view: "services.active", tone: "success" }, { text: "⛔ سرویس‌های منقضی", view: "services.expired" }),
      navRow({ text: "♻️ تمدید سرویس", view: "services.renew", tone: "success" }, { text: "🛒 خرید سرویس جدید", view: "shop" }),
      navRow({ text: "🛠 مشکل در سرویس", view: "services.issue", tone: "danger" }),
    ],
  }));
  registerView("services.expired", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const dashboard = await UserService.dashboard(user.id);
    return {
      text: joinSections([
        card("⛔ سرویس‌های منقضی", [
          dashboard.expiredAccounts.length ? `${dashboard.expiredAccounts.length.toLocaleString("fa-IR")} سرویس منقضی دارید.` : "سرویس منقضی ندارید.",
        ]),
      ]),
      keyboard: [navRow({ text: "♻️ تمدید سرویس", view: "services.renew", tone: "success" }, { text: "🛒 خرید سرویس جدید", view: "shop" })],
    };
  });
  registerView("services.renew", async (ctx, params) => renderRenewService(ctx, params));
  registerView("services.issue", async () => ({
    text: card("🛠 مشکل در سرویس", ["برای بررسی مشکل اتصال یا سرویس، مسیر پشتیبانی را انتخاب کنید."]),
    keyboard: [
      navRow({ text: "🆘 مشکل اتصال", view: "support.connection", tone: "danger" }, { text: "ارتباط با پشتیبانی", view: "support.contact" }),
    ],
  }));
  registerView("account.xray", async (ctx, params) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const client = await prisma.xrayClient.findFirst({ where: { id: params.xrayClientId, userId: user.id }, include: { product: true } });
    if (!client) return { text: "⚠️ سرویس Xray پیدا نشد.", keyboard: [[{ text: "🔙 بازگشت", action: callbackFor("services") }]] };
    let warning = "";
    try {
      const exists = await withTimeout(XrayClientService.ensureExistsOrMarkMissing(client), 15_000);
      if (!exists.exists)
        return {
          text: "این سرویس در پنل فعال نیست و از لیست سرویس‌های فعال حذف شد.",
          keyboard: [[{ text: "🎫 پشتیبانی", action: callbackFor("support") }]],
        };
    } catch {
      warning = "\n\n⚠️ اطلاعات لحظه‌ای پنل در دسترس نیست؛ اطلاعات ذخیره‌شده نمایش داده شد.";
    }
    let traffic: any = null;
    try {
      traffic = await withTimeout(XrayClientService.traffic(client.clientEmail), 15_000);
    } catch {
      warning = "\n\n⚠️ اطلاعات لحظه‌ای پنل در دسترس نیست؛ اطلاعات ذخیره‌شده نمایش داده شد.";
    }
    try {
      const detail = await withTimeout(XrayClientService.getClient(client.clientEmail), 15_000);
      const subId = detail.obj?.subId ?? detail.obj?.client?.subId ?? detail.obj?.sub_id;
      if (subId && subId !== client.clientSubId) await prisma.xrayClient.update({ where: { id: client.id }, data: { clientSubId: String(subId) } });
    } catch {
      warning = "\n\n⚠️ اطلاعات لحظه‌ای پنل در دسترس نیست؛ اطلاعات ذخیره‌شده نمایش داده شد.";
    }
    const snap = xrayTrafficSnapshot(traffic, client.trafficBytes, client.usedBytes);
    const days = Math.max(Math.ceil((client.expiresAt.getTime() - Date.now()) / 86_400_000), 0);
    const status = client.expiresAt <= new Date() ? "منقضی شده ⛔" : normalizeXrayStatus(client.status);
    // Callback compatibility is provided by accountActionViewKeyboard: xray:sub:${client.id} / xray:configs:${client.id}
    return {
      text: `🧩 سرویس\n\n📦 سرویس:\n${client.isFreeTest ? "🆓 اکانت تست" : (client.product?.title ?? "سرویس Xray")}\n\n👤 شناسه:\n${client.clientEmail}\n\n📊 حجم:\n${formatXrayBytes(snap.usedBytes)} / ${formatXrayBytes(snap.totalBytes, { unlimitedIfZero: true })}\n\n📉 باقی‌مانده:\n${formatXrayBytes(snap.remainingBytes, { unlimitedIfZero: snap.totalBytes === 0n })}\n\n⏳ اعتبار:\n${client.expiresAt.toLocaleDateString("fa-IR")}\n${days.toLocaleString("fa-IR")} روز باقی‌مانده\n\n📌 وضعیت:\n${status}${warning}`,
      keyboard: accountActionViewKeyboard(client.id, { renewable: !client.isFreeTest }),
    };
  });
  const renderRenewService: ViewRenderer = async (ctx, params) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [], navigation: { back: false, home: false } };
    if (!params.xrayClientId) {
      const clients = await prisma.xrayClient.findMany({
        where: { userId: user.id, isFreeTest: false, status: { in: ["active", "provisioning", "creating", "expired"] } },
        include: { product: true },
        orderBy: { expiresAt: "asc" },
        take: 20,
      });
      return {
        text: joinSections([
          "♻️ تمدید سرویس",
          clients.length ? "سرویس موردنظر برای تمدید را انتخاب کنید." : "در حال حاضر سرویس قابل تمدیدی پیدا نشد.",
        ]),
        keyboard: [
          ...clients.map((client) => [
            {
              text: `♻️ ${client.product?.title ?? client.clientEmail}`.slice(0, 60),
              action: callbackFor("services.renew", { xrayClientId: client.id }),
            },
          ]),
          [
            { text: "🧩 سرویس‌های من", action: callbackFor("services") },
            { text: "🛒 خرید سرویس", action: callbackFor("shop") },
          ],
          [{ text: userLabels.home, action: callbackFor("home") }],
        ],
        navigation: { back: false, home: false },
      };
    }
    const client = await prisma.xrayClient.findFirst({
      where: { id: params.xrayClientId, userId: user.id },
      include: { product: true, order: true, user: true },
    });
    if (!client)
      return {
        text: "این سرویس برای تمدید پیدا نشد.",
        keyboard: [],
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
        keyboard: [[{ text: "🛒 فروشگاه", action: callbackFor("shop") }], [{ text: "🎫 پشتیبانی", action: callbackFor("support") }]],
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
      keyboard: [...rows],
      navigation: { back: false, home: false },
    };
  };
  registerView("account.renew", renderRenewService);
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
        keyboard: [],
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
        keyboard: [[{ text: "🛒 فروشگاه", action: callbackFor("shop") }], [{ text: "🎫 پشتیبانی", action: callbackFor("support") }]],
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
      keyboard: [[{ text: "🛒 خرید جدید", action: callbackFor("shop") }]],
    };
  });
}
