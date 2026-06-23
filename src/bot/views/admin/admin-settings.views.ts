import {
  registerView, callbackFor, actionFor, createCallbackToken, tokenAction, isAdminByTelegramId, UserService, ProductService, AdminService, adminShopViewModel, maskAdminSecret, xrayAdminStatusLabel, xrayCenterViewModel, ReferralService, FreeAccountService, FREE_ACCOUNT_STATUS_LABELS, formatFreeAccountDate, SupportService, CouponService, BroadcastService, BROADCAST_TARGET_LABELS, PaymentGatewayService, PaymentInvoiceService, maskApiKey, ProductGuideService, ForcedJoinService, PublicPlansService, productNotDeletedWhere, formatXrayBytes, maskToken, normalizeXrayStatus, XrayClientService, XrayPanelService, xrayTrafficSnapshot, XrayDiagnosticsService, type PaymentInvoiceStatus, accountSummaryMessage, errorMessage, walletSummaryMessage, formatToman, accountStatusLabel, divider, formatPageCount, formatStockLabel, formatUserLine, getPageParam, paymentStatusLabel, progressBar, purchasedAccountStatusLabel, resolveFreeAccountExpiry, shortId, walletStatusLabel, yesNoStatus, homeKeyboard, adminDashboardViewKeyboard, card, joinSections, section, sectionTitles, actionLabels, adminLabels, statusLabels, userLabels, uiIcons, MonitoringService, prisma, money, page, pages, userLine, stockLabel, freeAccountExpiry, yesNo, type UiKeyboard
} from "./admin-helpers";

export function registerAdminSettingsViews() {
  registerView("admin.botSettings", async () => {
    const stats = await AdminService.cryptoWalletStats();
    return {
      replyKeyboard: "settings",
      text: `⚙️ تنظیمات بات

${divider}
🏪 وضعیت فروشگاه: ${stats.setting.storeStatus === "active" ? "فعال ✅" : "غیرفعال ⛔"}
💳 حداقل شارژ: ${money(stats.setting.minimumTopupAmount)}

تنظیمات قابل اجرا فقط با دکمه‌های عملیاتی زیر نمایش داده می‌شوند.`,
      keyboard: [
        [
          { text: "🏪 وضعیت فروشگاه", action: callbackFor("admin.settings") },
          { text: "📢 عضویت اجباری", action: callbackFor("admin.forcedJoin") },
        ],
        [
          { text: "📊 پایش سیستم", action: callbackFor("admin.monitoring") },
          { text: "⚡ درگاه پرداخت", action: callbackFor("admin.paymentGateway") },
        ],
        [{ text: "🔙 پنل مدیریت", action: callbackFor("admin.dashboard") }],
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
  registerView("admin.settings", async () => {
    const stats = await AdminService.cryptoWalletStats();
    return {
      text: joinSections([
        card("⚙️ تنظیمات بات", [
          `وضعیت فروشگاه: ${stats.setting.storeStatus === "active" ? "فعال ✅" : "غیرفعال ⛔"}`,
          "عضویت اجباری: از بخش اختصاصی مدیریت می‌شود",
          "درگاه پرداخت: تنظیمات مالی و پرداخت آنی",
          "پشتیبانی: تیکت‌ها و پاسخ‌گویی",
          "اعلان‌ها: پیام‌رسانی هدفمند",
        ]),
        section("راهنما", ["هر گزینه یک صفحه کاری مشخص دارد و تنظیمات حساس ماسک می‌شوند."]),
      ]),
      keyboard: [
        [
          { text: "🛍 وضعیت فروشگاه", action: callbackFor("admin.store") },
          { text: "🔐 عضویت اجباری", action: callbackFor("admin.forcedJoin") },
        ],
        [
          { text: "💳 پرداخت", action: callbackFor("admin.paymentGateway") },
          { text: "📣 اعلان‌ها", action: callbackFor("admin.notifications") },
        ],
        [
          { text: "💬 پیام‌ها", action: callbackFor("admin.productGuides") },
          { text: "🎫 پشتیبانی", action: callbackFor("admin.tickets") },
        ],
        [
          { text: "🛡 امنیت", action: callbackFor("admin.monitoring") },
          { text: "🔙 پنل مدیریت", action: callbackFor("admin.dashboard") },
        ],
      ],
    };
  });
}
