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
      [{ text: userLabels.buyService, action: callbackFor("shop.categories") }],
      [{ text: userLabels.myAccounts, action: callbackFor("account") }],
      [{ text: userLabels.home, action: callbackFor("home") }],
    ],
  }));
  registerView("help", async () => ({
    replyKeyboard: "home",
    text: joinSections([
      card("📚 مرکز راهنما", [
        "راهنمای کامل استفاده از سرویس‌های V2Ray / Xray",
        "",
        "اینجا می‌تونید آموزش خرید، اتصال، پرداخت، برنامه‌های پیشنهادی، قوانین سرویس و رفع مشکلات رایج رو ساده و کامل ببینید.",
        "",
        "برای شروع یکی از گزینه‌های زیر رو انتخاب کنید 👇",
      ]),
    ]),
    keyboard: [
      navRow({ text: "🟢 خرید سرویس", view: "help.buy", tone: "success" }, { text: "🔵 آموزش اتصال", view: "help.connection", tone: "primary" }),
      navRow({ text: "🟣 سوالات متداول", view: "help.faq" }, { text: "🟠 قوانین سرویس", view: "help.rules" }),
      navRow({ text: "🔴 پشتیبانی", view: "support", tone: "danger" }),
    ],
  }));

  registerView("help.buy", async () => ({
    text: card("🛒 راهنمای خرید سرویس", [
      "خرید سرویس داخل ربات کاملاً خودکار و ساده انجام می‌شود.",
      "",
      "1️⃣ وارد بخش فروشگاه شوید.",
      "2️⃣ پلن موردنظر خود را انتخاب کنید.",
      "3️⃣ توضیحات پلن را با دقت مطالعه کنید.",
      "4️⃣ روش پرداخت را انتخاب کنید.",
      "5️⃣ پرداخت را کامل انجام دهید.",
      "6️⃣ سرویس بعد از پرداخت موفق، به‌صورت خودکار تحویل داده می‌شود.",
      "",
      "━━━━━━━━━━━━━━",
      "",
      "💳 روش‌های پرداخت خرید:",
      "",
      "🔹 پرداخت آنی",
      "در این روش، بعد از پرداخت موفق، سرویس مستقیم و خودکار برای شما فعال می‌شود.",
      "",
      "🔹 پرداخت با کیف پول",
      "اگر کیف پول شما موجودی داشته باشد، می‌توانید خرید را از کیف پول انجام دهید.",
      "در این روش هم سرویس به‌صورت خودکار تحویل داده می‌شود.",
      "",
      "━━━━━━━━━━━━━━",
      "",
      "👛 شارژ کیف پول:",
      "",
      "کیف پول به دو روش شارژ می‌شود:",
      "",
      "1️⃣ شارژ آنی",
      "بعد از زدن دکمه پرداخت، وارد یک ربات واسط می‌شوید.",
      "ربات مبلغ دقیق و شماره کارت را نمایش می‌دهد.",
      "",
      "⚠️ مبلغ باید دقیقاً همان عددی باشد که ربات نمایش داده است.",
      "لطفاً مبلغ را رند نکنید و کمتر یا بیشتر واریز نکنید؛ چون پرداخت تأیید نمی‌شود.",
      "",
      "بعد از کارت‌به‌کارت، معمولاً طی چند دقیقه پرداخت بررسی و کیف پول شارژ می‌شود.",
      "",
      "2️⃣ شارژ با رمز ارز",
      "مبلغ را به تومان وارد می‌کنید، سپس ولت یا شبکه موردنظر را انتخاب می‌کنید.",
      "بعد از انتقال ارز به ولت نمایش داده‌شده، رسید تراکنش را ارسال می‌کنید.",
      "پس از تأیید تیم مالی، مبلغ به کیف پول ربات شما اضافه می‌شود.",
      "",
      "⚡ نکته مهم:",
      "چه با پرداخت آنی خرید کنید، چه با کیف پول، محصول بعد از پرداخت موفق به‌صورت خودکار تحویل داده می‌شود.",
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
      "برای اتصال بهتر و دریافت بروزرسانی‌ها، حتماً از لینک ساب استفاده کنید.",
      "",
      "✅ لینک ساب چیست؟",
      "لینک ساب یک لینک اشتراک است که همه کانفیگ‌های سرویس شما داخل آن قرار دارد.",
      "",
      "چرا لینک ساب مهم است؟",
      "• اگر کانفیگ‌ها آپدیت شوند، شما هم آپدیت را دریافت می‌کنید.",
      "• اگر لوکیشن جدید اضافه شود، داخل برنامه شما نمایش داده می‌شود.",
      "• اگر کانفیگی تغییر کند یا حذف شود، با بروزرسانی ساب اصلاح می‌شود.",
      "• نیازی نیست کانفیگ‌ها را دانه‌دانه وارد کنید.",
      "",
      "━━━━━━━━━━━━━━",
      "",
      "مراحل اتصال:",
      "",
      "1️⃣ وارد بخش «سرویس‌های من» شوید.",
      "2️⃣ سرویس خریداری‌شده را باز کنید.",
      "3️⃣ لینک اشتراک یا همان لینک ساب را دریافت کنید.",
      "4️⃣ لینک ساب را باز کنید.",
      "5️⃣ صفحه را تا پایین اسکرول کنید.",
      "6️⃣ با توجه به سیستم عامل گوشی خود، برنامه مناسب را انتخاب کنید.",
      "7️⃣ برنامه باز می‌شود و لینک ساب به‌صورت خودکار داخل آن وارد می‌شود.",
      "",
      "━━━━━━━━━━━━━━",
      "",
      "🍏 برنامه‌های پیشنهادی آیفون:",
      "• Shadowrocket",
      "• V2Box",
      "• Streisand",
      "• V2RayTun",
      "• NPV Tunnel",
      "• Happ",
      "",
      "🤖 برنامه‌های پیشنهادی اندروید:",
      "• V2Box",
      "• V2RayNG",
      "• Sing-box",
      "• V2RayTun",
      "• NPV Tunnel",
      "• Happ",
      "",
      "📌 بعد از وارد کردن لینک ساب، داخل برنامه گزینه Update / Refresh را بزنید.",
      "",
      "⚠️ پیشنهاد مهم:",
      "کانفیگ تکی وارد نکنید؛ همیشه لینک ساب را وارد کنید تا بروزرسانی‌ها را دریافت کنید.",
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
    text: card("❓ سوالات پرتکرار", [
      "❔ سرویس‌ها چه نوعی هستند؟",
      "سرویس‌ها بر پایه V2Ray / Xray ارائه می‌شوند و بسته به پلن، شامل چندین لوکیشن مختلف هستند.",
      "",
      "❔ مولتی‌لوکیشن یعنی چه؟",
      "یعنی داخل یک سرویس، چند لوکیشن مختلف قرار دارد و می‌توانید بین آن‌ها جابه‌جا شوید.",
      "",
      "❔ چرا باید از لینک ساب استفاده کنم؟",
      "چون با لینک ساب، آپدیت کانفیگ‌ها، تغییرات سرورها و لوکیشن‌های جدید را راحت‌تر دریافت می‌کنید.",
      "",
      "❔ بعد از خرید، سرویس کجا نمایش داده می‌شود؟",
      "سرویس شما در بخش «سرویس‌های من» قرار می‌گیرد.",
      "",
      "❔ تحویل سرویس چقدر طول می‌کشد؟",
      "بعد از پرداخت موفق، سرویس به‌صورت خودکار تحویل داده می‌شود.",
      "",
      "❔ اگر سرویس قطع شد چه کار کنم؟",
      "ابتدا لینک ساب را داخل برنامه آپدیت کنید.",
      "اگر مشکل حل نشد، از بخش «سرویس‌های من» لینک ساب جدید دریافت کنید.",
      "اگر باز هم مشکل داشتید، با پشتیبانی در ارتباط باشید.",
      "",
      "❔ آیا سرویس روی همه اینترنت‌ها یکسان کار می‌کند؟",
      "خیر. عملکرد سرویس به اپراتور، منطقه، نوع اینترنت و شرایط شبکه شما بستگی دارد.",
      "",
      "❔ قبل از خرید پلن اقتصادی چه کاری انجام دهم؟",
      "بهتر است ابتدا اشتراک تست دریافت کنید.",
      "اگر کانفیگ‌های مستقیم تست برای اینترنت شما درست کار کردند، می‌توانید پلن اقتصادی تهیه کنید.",
    ]),
    keyboard: [navRow({ text: "🆘 پشتیبانی", view: "support" })],
  }));

  registerView("help.rules", async () => ({
    text: card("📜 قوانین استفاده", [
      "⚠️ لطفاً پیش از خرید پلن‌های اقتصادی، این توضیحات را با دقت مطالعه کنید.",
      "",
      "🔹 پلن‌های اقتصادی به‌صورت مولتی‌لوکیشن، تک‌کاربره و ۳۰ روزه ارائه می‌شوند.",
      "",
      "🔹 تک‌کاربره یعنی استفاده از سرویس فقط برای یک نفر مجاز است.",
      "استفاده همزمان چند کاربر از یک سرویس مجاز نیست.",
      "",
      "🔹 تمامی کانفیگ‌های موجود در ساب پلن‌های اقتصادی مستقیم یا تک‌پرچم هستند.",
      "",
      "🔹 پیشنهاد می‌شود قبل از خرید، حتماً اشتراک تست دریافت کنید.",
      "",
      "اگر کانفیگ‌های مستقیم موجود در اشتراک تست برای اینترنت شما به‌درستی کار می‌کنند، می‌توانید با اطمینان پلن اقتصادی تهیه کنید.",
      "",
      "🔹 عملکرد سرویس به شرایط اینترنت، اپراتور، منطقه و محدودیت‌های شبکه شما وابسته است.",
      "",
      "به همین دلیل ممکن است کیفیت اتصال برای کاربران مختلف متفاوت باشد.",
      "",
      "🔹 مسئولیت بررسی سازگاری سرویس با اینترنت هر منطقه، قبل از خرید، بر عهده کاربر است.",
      "",
      "🔹 عودت وجه فقط در صورتی امکان‌پذیر است که اختلال یا مشکل فنی از سمت مجموعه ما تأیید شود.",
      "",
      "در غیر این صورت، به دلیل تفاوت شرایط اینترنت کاربران، امکان بازگشت وجه وجود نخواهد داشت.",
      "",
      "🌹 با تشکر از همراهی و درک شما.",
    ]),
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
