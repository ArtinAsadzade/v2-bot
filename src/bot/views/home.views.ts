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

  const shareText = `🚀 دنبال یک سرویس سریع، پایدار و آماده استفاده هستی؟

اینجا می‌تونی خیلی راحت سرویس موردنیازت رو انتخاب کنی، پرداخت رو انجام بدی و اطلاعات سرویس رو فوری تحویل بگیری.

✅ خرید سریع و ساده
✅ تحویل خودکار بعد از پرداخت
✅ مدیریت سرویس‌ها از داخل ربات
✅ کیف پول اختصاصی
✅ تمدید آسان سرویس
✅ پشتیبانی در صورت نیاز

برای شروع از لینک زیر وارد شو 👇
${link}`;

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
      [{ text: userLabels.buyService, action: callbackFor("shop.categories") }],
      [{ text: userLabels.myAccounts, action: callbackFor("account") }],
      [{ text: userLabels.home, action: callbackFor("home") }],
    ],
  }));
  registerView("help", async () => ({
    replyKeyboard: "home",
    text: joinSections([card("📚 مرکز راهنما", ["راهنمای کامل استفاده از سرویس‌ها", "آموزش خرید، اتصال و رفع مشکلات متداول"])]),
    keyboard: [
      navRow({ text: "🟢 خرید سرویس", view: "help.buy", tone: "success" }, { text: "🔵 آموزش اتصال", view: "help.connection", tone: "primary" }),
      navRow({ text: "🟣 سوالات متداول", view: "help.faq" }, { text: "🟠 قوانین سرویس", view: "help.rules" }),
      navRow({ text: "🔴 پشتیبانی", view: "support", tone: "danger" }),
    ],
  }));
  registerView("help.buy", async () => ({
    text: card("🛒 راهنمای خرید سرویس", [
      "1️⃣ وارد فروشگاه شوید",
      "2️⃣ سرویس موردنظر را انتخاب کنید",
      "3️⃣ پرداخت را انجام دهید",
      "4️⃣ سرویس بلافاصله فعال می‌شود",
      "",
      "⚡ تحویل کاملاً خودکار و فوری است.",
    ]),
    keyboard: [
      navRow({
        text: "🛒 ورود به فروشگاه",
        view: "shop",
        tone: "success",
      }),
    ],
  }));
  registerView("help.connection", async () => ({
    text: card("🔌 راهنمای اتصال", [
      "1️⃣ وارد بخش سرویس‌های من شوید",
      "2️⃣ سرویس موردنظر را باز کنید",
      "3️⃣ لینک اشتراک یا کانفیگ را دریافت کنید",
      "4️⃣ آن را در برنامه وارد نمایید",
      "",
      "📱 تمامی اپلیکیشن‌های V2Ray و Clash پشتیبانی می‌شوند.",
    ]),
    keyboard: [
      navRow({
        text: "📦 سرویس‌های من",
        view: "services",
        tone: "primary",
      }),
    ],
  }));
  registerView("help.faq", async () => ({
    text: card("❓ سوالات پرتکرار", ["اگر پاسخ سؤال خود را پیدا نکردید، از پشتیبانی پیام بدهید."]),
    keyboard: [navRow({ text: "🆘 پشتیبانی", view: "support" })],
  }));
  registerView("help.rules", async () => ({
    text: card("📜 قوانین استفاده", ["استفاده از سرویس‌ها باید مطابق قوانین سرویس و شرایط اعلام‌شده باشد."]),
    keyboard: [],
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
      keyboard: [[{ text: "🛒 فروشگاه", action: callbackFor("shop.categories") }], [{ text: "🎫 پشتیبانی", action: callbackFor("support") }]],
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
      keyboard: [
        [{ text: "📤 ارسال متن دعوت", url: shareUrl, tone: "success" }],
        navRow({ text: "👥 دعوت‌شده‌ها", view: "referral.users" }, { text: "💎 پاداش‌ها", view: "referral.rewards", tone: "primary" }),
        navRow({ text: "📜 قوانین دعوت", view: "referral.rules" }, { text: "🏠 خانه", view: "home" }),
      ],
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

  registerView("referral.users", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;

    if (!user) {
      return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    }

    const stats = await ReferralService.getStats(user.id);
    const { shareUrl } = buildReferralShare(user.referralCode as string);

    return {
      text: card("👥 دعوت‌شده‌ها", [
        `✅ تعداد دعوت‌های موفق: ${stats.totalReferrals.toLocaleString("fa-IR")} نفر`,
        "دعوت زمانی ثبت می‌شود که کاربر از لینک اختصاصی شما وارد ربات شود.",
      ]),
      keyboard: [[{ text: "📤 ارسال متن دعوت", url: shareUrl }], [{ text: "🎁 دعوت دوستان", action: callbackFor("referral") }]],
    };
  });

  registerView("referral.rewards", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;

    if (!user) {
      return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    }

    const stats = await ReferralService.getStats(user.id);
    const { shareUrl } = buildReferralShare(user.referralCode as string);

    return {
      text: card("💎 پاداش‌های دعوت", [
        `💰 قابل برداشت: ${money(stats.pendingAmount)}`,
        `✅ برداشت‌شده: ${money(stats.claimedAmount)}`,
        stats.pendingAmount > 0 ? "برای انتقال پاداش به کیف پول، دکمه دریافت پاداش را بزنید." : "در حال حاضر پاداش قابل برداشتی ندارید.",
      ]),
      keyboard: stats.pendingAmount > 0 ? [[{ text: "💎 دریافت پاداش", action: "referral:claim" }]] : [[{ text: "📤 دعوت دوستان", url: shareUrl }]],
    };
  });

  registerView("referral.rules", async (ctx) => {
    const user = ctx.from ? await UserService.getByTelegramId(ctx.from.id) : undefined;

    if (!user) {
      return { text: "⚠️ پروفایل شما پیدا نشد.", keyboard: [] };
    }

    const { shareUrl } = buildReferralShare(user.referralCode as string);

    return {
      text: card("📜 قوانین دعوت", [
        "هر کاربر فقط یک‌بار می‌تواند به عنوان دعوت‌شده ثبت شود.",
        "دعوت فقط زمانی معتبر است که کاربر از لینک اختصاصی شما وارد ربات شود.",
        "پاداش‌های تأییدشده در بخش پاداش‌ها نمایش داده می‌شوند.",
        "در صورت ثبت دعوت غیرواقعی یا سوءاستفاده، پاداش قابل تأیید نخواهد بود.",
      ]),
      keyboard: [[{ text: "📤 ارسال متن دعوت", url: shareUrl }], [{ text: "🎁 دعوت دوستان", action: callbackFor("referral") }]],
    };
  });
}
