import { registerView, callbackFor } from "../navigation/panel-ui";
import { isAdminByTelegramId } from "../middlewares/admin.middleware";
import { UserService } from "../../modules/user/user.service";
import { ReferralService } from "../../modules/referral/referral.service";
import { ProductGuideService } from "../../modules/system/product-guide.service";
import { formatToman } from "../../utils/money";
import { divider, progressBar } from "../../utils/formatters";
import { homeKeyboard } from "../keyboards/common.keyboard";
import { navRow } from "../keyboards/panel-keyboard.helpers";
import { uxCopy } from "../messages/copy";
import { card, joinSections } from "../ui/layout";
import { userLabels } from "../ui/labels";

const money = formatToman;
const buildReferralShare = (referralCode: string) => {
  const botUsername = process.env.BOT_USERNAME ?? "BOT";
  const link = `https://t.me/${botUsername}?start=${referralCode}`;

  const shareText = `🚀 دنبال یه سرویس سریع، پایدار و بدون دردسر می‌گردی؟

همه چیز اینجاست 👇

⚡️ خرید سریع و راحت
🎁 تحویل خودکار و فوری
💳 کیف پول اختصاصی
🔄 تمدید و مدیریت آسان سرویس‌ها
📊 دسترسی به اطلاعات سرویس داخل ربات
🛟 پشتیبانی در مواقع نیاز

فقط چند ثانیه زمان می‌بره تا سرویس خودت رو فعال کنی! 😎

👇 از لینک زیر وارد شو و شروع کن:
${link}
`;

  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`;

  return { link, shareText, shareUrl };
};

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
        card(`👋 سلام ${firstName}`, ["به پنل مدیریت سرویس‌های خود خوش آمدید."]),

        card("📊 وضعیت حساب", [
          `💰 موجودی کیف پول: ${money(user?.balance ?? 0)}`,
          `📦 سرویس‌های فعال: ${activeCount.toLocaleString("fa-IR")}`,
          `🤝 دعوت موفق: ${referralCount.toLocaleString("fa-IR")}`,
          expiringCount > 0 ? `⚠️ ${expiringCount.toLocaleString("fa-IR")} سرویس نزدیک انقضا` : "✅ همه سرویس‌ها فعال هستند",
        ]),

        card("⚡ دسترسی سریع", ["خرید، تمدید، مدیریت سرویس و پشتیبانی از منوی پایین در دسترس است."]),
      ]),
      keyboard,
      replyKeyboard: "home",
    };
  });
  registerView("coupon.info", async () => ({
    replyKeyboard: "home",
    text: uxCopy.couponInfo,
    keyboard: [
      [{ text: userLabels.buyService, action: callbackFor("shop") }],
      [{ text: userLabels.myAccounts, action: callbackFor("account") }],
      [{ text: userLabels.home, action: callbackFor("home") }],
    ],
  }));
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
      keyboard: [[{ text: "🛒 فروشگاه", action: callbackFor("shop") }], [{ text: "🎫 پشتیبانی", action: callbackFor("support") }]],
    };
  });
  registerView("referral", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;

    if (!user) {
      return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    }

    const stats = await ReferralService.getStats(user.id);
    const botUsername = process.env.BOT_USERNAME ?? "BOT";
    const link = `https://t.me/${botUsername}?start=${user.referralCode}`;

    const nextTarget = Math.max(Math.ceil((stats.totalReferrals + 1) / 5) * 5, 5);
    const remaining = Math.max(nextTarget - stats.totalReferrals, 0);

    const { shareUrl } = buildReferralShare(user.referralCode as string);

    return {
      text: joinSections([
        card("🎁 دعوت دوستان", [
          "لینک اختصاصی خودت را برای دوستانت ارسال کن.",
          "هر کاربری که از طریق لینک شما وارد ربات شود، در آمار دعوت شما ثبت می‌شود.",
          "پاداش‌های قابل دریافت از همین بخش قابل مشاهده و برداشت هستند.",
        ]),
        card("📊 وضعیت دعوت‌ها", [
          `👥 دعوت موفق: ${stats.totalReferrals.toLocaleString("fa-IR")} نفر`,
          `💎 پاداش قابل برداشت: ${money(stats.pendingAmount)}`,
          `✅ پاداش برداشت‌شده: ${money(stats.claimedAmount)}`,
          remaining > 0 ? `🎯 تا هدف بعدی: ${remaining.toLocaleString("fa-IR")} دعوت دیگر` : "🎯 هدف فعلی تکمیل شده است.",
          progressBar(stats.totalReferrals % nextTarget, nextTarget),
        ]),
        card("🔗 لینک اختصاصی شما", [link]),
      ]),
      keyboard: [[{ text: "📤 ارسال متن دعوت", url: shareUrl, tone: "success" }]],
    };
  });

  registerView("referral.link", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;
    if (!user?.referralCode) return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    const { link, shareUrl } = buildReferralShare(user.referralCode);
    return {
      text: card("🔗 لینک دعوت", [link]),
      keyboard: [[{ text: "📤 ارسال متن دعوت", url: shareUrl }], [{ text: "🎁 دعوت دوستان", action: callbackFor("referral") }]],
    };
  });
}
