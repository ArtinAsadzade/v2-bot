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
import { navRow } from "../keyboards/panel-keyboard.helpers";
import { uxCopy } from "../messages/copy";
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

export function registerHomeViews() {
  registerView("home", async (ctx) => {
    const user = ctx.from ? await UserService.findOrCreateUser(ctx) : undefined;
    const isAdmin = ctx.from ? await isAdminByTelegramId(ctx.from.id) : false;
    const dashboard = user ? await UserService.dashboard(user.id) : undefined;
    const activeCount = (dashboard?.activeAccounts.length ?? 0) + (dashboard?.activeFreeAccounts.length ?? 0);
    const expiringCount = (dashboard?.activeAccounts ?? []).filter((item) => {
      const expiresAt = item.xrayClient?.expiresAt ?? item.expiresAt ?? item.productAccount?.expiresAt;
      return expiresAt ? expiresAt.getTime() > Date.now() && expiresAt.getTime() <= Date.now() + 7 * 86_400_000 : false;
    }).length;
    const referralCount = dashboard?.referralCount ?? 0;
    const firstName = ctx.from?.first_name || user?.firstName || "دوست عزیز";
    const keyboard = homeKeyboard(isAdmin);

    return {
      text: joinSections([
        `✨ سلام ${firstName}، خوش آمدی`,
        card("🏠 خانه", [
          `${uiIcons.wallet} موجودی: ${money(user?.balance ?? 0)}`,
          `🧩 سرویس‌های فعال: ${activeCount.toLocaleString("fa-IR")}`,
          `🤝 دعوت‌های موفق: ${referralCount.toLocaleString("fa-IR")}`,
          expiringCount > 0 ? `⏳ نزدیک انقضا: ${expiringCount.toLocaleString("fa-IR")}` : "✅ وضعیت سرویس‌ها پایدار است",
        ]),
        section(sectionTitles.quickActions, ["یکی از گزینه‌های پایین را انتخاب کن؛ همه مسیرها کوتاه و بدون دکمه اضافه چیده شده‌اند."]),
      ]),
      keyboard,
      replyKeyboard: "home",
    };
  });
  registerView("coupon.info", async () => ({
    replyKeyboard: "home",
    text: uxCopy.couponInfo,
    keyboard: [
      [{ text: userLabels.buyService, action: callbackFor("shop.categories") }],
      [{ text: userLabels.myAccounts, action: callbackFor("account") }],
      [{ text: userLabels.home, action: callbackFor("home") }],
    ],
  }));
  registerView("help", async () => ({
    replyKeyboard: "home",
    text: card("📘 راهنما", ["موضوع راهنما را انتخاب کنید."]),
    keyboard: [
      navRow({ text: "🛒 راهنمای خرید", view: "help.buy" }, { text: "🔌 راهنمای اتصال", view: "help.connection" }),
      navRow({ text: "❓ سوالات پرتکرار", view: "help.faq" }, { text: "📜 قوانین استفاده", view: "help.rules" }),
    ],
  }));
  registerView("help.buy", async () => ({ text: card("🛒 راهنمای خرید", ["از خرید سرویس، دسته‌بندی را انتخاب کنید، سرویس را ببینید و پرداخت را کامل کنید."]), keyboard: [navRow({ text: "🛒 خرید سرویس", view: "shop" })] }));
  registerView("help.connection", async () => ({ text: card("🔌 راهنمای اتصال", ["پس از خرید، لینک اشتراک یا کانفیگ را از سرویس‌های من دریافت و در اپلیکیشن وارد کنید."]), keyboard: [navRow({ text: "📦 سرویس‌های من", view: "services" })] }));
  registerView("help.faq", async () => ({ text: card("❓ سوالات پرتکرار", ["اگر پاسخ سؤال خود را پیدا نکردید، از پشتیبانی پیام بدهید."]), keyboard: [navRow({ text: "🆘 پشتیبانی", view: "support" })] }));
  registerView("help.rules", async () => ({ text: card("📜 قوانین استفاده", ["استفاده از سرویس‌ها باید مطابق قوانین سرویس و شرایط اعلام‌شده باشد."]), keyboard: [] }));
  registerView("productGuide", async () => {
    const sections = await ProductGuideService.listActive();
    return {
      replyKeyboard: "home",
      text: `📘 راهنمای محصولات

${divider}

${
  sections.map(
    (section) => `${section.icon || "🔹"} ${section.title}
${section.shortDescription}

${section.body}`,
  ).join(`

${divider}

`) || "در حال حاضر راهنمایی برای نمایش ثبت نشده است."
}

${divider}

اگر سوالی دارید، پشتیبانی در کنار شماست.`,
      keyboard: [[{ text: "🛒 فروشگاه", action: callbackFor("shop.categories") }], [{ text: "🎫 پشتیبانی", action: callbackFor("support") }]],
    };
  });
  registerView("referral", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const stats = await ReferralService.getStats(user.id);
    const botUsername = process.env.BOT_USERNAME ?? "BOT";
    const link = `https://t.me/${botUsername}?start=${user.referralCode}`;
    const nextTarget = Math.max(Math.ceil((stats.totalReferrals + 1) / 5) * 5, 5);
    return {
      text: `🎁 برنامه دعوت دوستان

${divider}

👥 تعداد دعوت‌های موفق
${stats.totalReferrals.toLocaleString("fa-IR")} نفر

💎 پاداش قابل دریافت
${money(stats.pendingAmount)}

📈 فاصله تا پاداش بعدی
${progressBar(stats.totalReferrals % nextTarget, nextTarget)}

🔗 لینک اختصاصی شما
${link}

لینک دعوت خود را با دوستانتان به اشتراک بگذارید. هر کاربری که از طریق این لینک عضو شود، در آمار شما ثبت شده و پاداش‌های مربوطه به حساب شما تعلق می‌گیرد.

✨ هرچه افراد بیشتری دعوت کنید، پاداش‌های بیشتری دریافت خواهید کرد.`,
      keyboard: [
        navRow({ text: "🔗 لینک دعوت من", view: "referral.link" }, { text: "👥 افراد دعوت‌شده", view: "referral.users" }),
        navRow({ text: "💎 پاداش‌های من", view: "referral.rewards", tone: "success" }, { text: "📜 قوانین دعوت", view: "referral.rules" }),
      ],
    };
  });
  registerView("referral.link", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const botUsername = process.env.BOT_USERNAME ?? "BOT";
    return { text: `🔗 لینک دعوت من\n\nhttps://t.me/${botUsername}?start=${user.referralCode}`, keyboard: [] };
  });
  registerView("referral.users", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const stats = await ReferralService.getStats(user.id);
    return { text: card("👥 افراد دعوت‌شده", [`تعداد دعوت موفق: ${stats.totalReferrals.toLocaleString("fa-IR")} نفر`]), keyboard: [] };
  });
  registerView("referral.rewards", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const stats = await ReferralService.getStats(user.id);
    return { text: card("💎 پاداش‌های من", [`قابل دریافت: ${money(stats.pendingAmount)}`, `دریافت‌شده: ${money(stats.claimedAmount)}`]), keyboard: [[{ text: "💎 دریافت پاداش", action: "referral:claim" }]] };
  });
  registerView("referral.rules", async () => ({ text: card("📜 قوانین دعوت", ["دعوت دوستان همان Referral است؛ هر عضویت معتبر از لینک شما در آمار و پاداش ثبت می‌شود."]), keyboard: [] }));
}
