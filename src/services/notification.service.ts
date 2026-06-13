import type { InlineKeyboardMarkup } from "telegraf/types";
import type { AppBot } from "../types/bot";
import { prisma } from "./prisma";
import { logger } from "./logger";
import { eventBus } from "./event-bus.service";
import { screenMessage, successMessage } from "../utils/messages";

export type NotificationAction = {
  text: string;
  callbackData: string;
};

export type NotificationMessage =
  | string
  | {
      text: string;
      photo?: string;
      actions?: NotificationAction[][];
    };

class NotificationService {
  private bot?: AppBot;

  setBot(bot: AppBot) {
    this.bot = bot;
  }

  async notifyAdmins(message: NotificationMessage) {
    const adminTelegramIds = await this.getAdminTelegramIds();
    await Promise.all(adminTelegramIds.map((telegramId) => this.sendToTelegramId(telegramId, message)));
  }

  async notifyUser(userId: string, message: NotificationMessage) {
    const isObjectId = /^[a-f\d]{24}$/i.test(userId);
    const user = await prisma.user.findFirst({
      where: isObjectId ? { OR: [{ id: userId }, { telegramId: userId }] } : { telegramId: userId },
      select: { telegramId: true },
    });

    if (!user) {
      logger.warn("Notification user not found", { userId });
      return;
    }

    await this.sendToTelegramId(user.telegramId, message);
  }

  private async sendToTelegramId(telegramId: string, message: NotificationMessage) {
    if (!this.bot) {
      logger.warn("Notification bot is not configured", { telegramId });
      return;
    }

    const payload = this.normalizeMessage(message);
    const extra = payload.actions ? { reply_markup: this.toInlineKeyboard(payload.actions) } : undefined;

    try {
      if (payload.photo) {
        await this.bot.telegram.sendPhoto(Number(telegramId), payload.photo, { caption: payload.text, ...extra });
        return;
      }

      await this.bot.telegram.sendMessage(Number(telegramId), payload.text, extra);
    } catch (error) {
      logger.error("Notification delivery failed", {
        telegramId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private normalizeMessage(message: NotificationMessage) {
    return typeof message === "string" ? { text: message } : message;
  }

  private toInlineKeyboard(actions: NotificationAction[][]): InlineKeyboardMarkup {
    return {
      inline_keyboard: actions.map((row) => row.map((action) => ({ text: action.text, callback_data: action.callbackData }))),
    };
  }

  private async getAdminTelegramIds() {
    const envIds = (process.env.ADMIN_IDS ?? process.env.ADMINS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const dbAdmins = await prisma.user.findMany({
      where: { role: { in: ["admin", "superadmin"] } },
      select: { telegramId: true },
    });

    return [...new Set([...envIds, ...dbAdmins.map((admin) => admin.telegramId)])];
  }
}

export const notificationService = new NotificationService();

let notificationEventsRegistered = false;

export function registerNotificationEvents() {
  if (notificationEventsRegistered) return;
  notificationEventsRegistered = true;

  eventBus.on("deposit.created", async (event) => {
    await notificationService.notifyAdmins({
      text: screenMessage({ tone: "PAYMENT", title: "درخواست شارژ جدید", description: "یک درخواست شارژ برای بررسی ثبت شده است.", body: `شناسه: ${event.depositId}\nمبلغ: ${event.amount.toLocaleString("fa-IR")} تومان\nارز: ${event.cryptoType.toUpperCase()}`, actionHint: "برای بررسی، دکمه مشاهده را انتخاب کنید." }),
      actions: [[{ text: "👁 مشاهده", callbackData: `admin:deposits` }]],
    });
  });

  eventBus.on("ticket.created", async (event) => {
    await notificationService.notifyAdmins({
      text: `🎫 تیکت جدید
━━━━━━━━━━━━━━

🧾 شناسه: #${String(event.ticketId).slice(-6).toUpperCase()}
👤 کاربر: ${event.telegramId}

برای مشاهده تاریخچه یا پاسخ مستقیم، یکی از دکمه‌های زیر را انتخاب کنید.`,
      actions: [[{ text: "👁 مشاهده تیکت", callbackData: `nav:admin.ticket?ticketId=${event.ticketId}` }, { text: "💬 ورود به چت", callbackData: `support:admin:chat:${event.ticketId}` }]],
    });
  });

  eventBus.on("referral.reward.claimed", async (event) => {
    await notificationService.notifyUser(event.userId, successMessage("پاداش دعوت اضافه شد", `مبلغ ${event.amount.toLocaleString("fa-IR")} تومان به کیف پول شما اضافه شد.`, "برای مشاهده جزئیات به بخش کیف پول بروید."));
  });

  eventBus.on("payment.delivery.failed", async (event) => {
    await notificationService.notifyAdmins({
      text: screenMessage({ tone: "WARNING", title: "تحویل پرداخت نیازمند بررسی است", description: "پرداخت ثبت شده اما تحویل خودکار کامل نشده است.", body: `فاکتور: ${event.invoiceId}\nکاربر: ${event.userId}`, actionHint: "لطفاً فاکتور را از پنل مدیریت بررسی کنید." }),
      actions: [[{ text: "👁 مشاهده فاکتور", callbackData: `nav:admin.invoice?invoiceId=${event.invoiceId}` }]],
    });
  });

  eventBus.on("free_config.claimed", async (event) => {
    await notificationService.notifyUser(event.userId, {
      text: `🎁 کانفیگ رایگان شما:\n\n${event.config}`,
      actions: [[{ text: "🏠 خانه", callbackData: "nav:home" }]],
    });
  });
}

