"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationService = void 0;
exports.registerNotificationEvents = registerNotificationEvents;
const prisma_1 = require("./prisma");
const logger_1 = require("./logger");
const event_bus_service_1 = require("./event-bus.service");
class NotificationService {
    setBot(bot) {
        this.bot = bot;
    }
    async notifyAdmins(message) {
        const adminTelegramIds = await this.getAdminTelegramIds();
        await Promise.all(adminTelegramIds.map((telegramId) => this.sendToTelegramId(telegramId, message)));
    }
    async notifyUser(userId, message) {
        const isObjectId = /^[a-f\d]{24}$/i.test(userId);
        const user = await prisma_1.prisma.user.findFirst({
            where: isObjectId ? { OR: [{ id: userId }, { telegramId: userId }] } : { telegramId: userId },
            select: { telegramId: true },
        });
        if (!user) {
            logger_1.logger.warn("Notification user not found", { userId });
            return;
        }
        await this.sendToTelegramId(user.telegramId, message);
    }
    async sendToTelegramId(telegramId, message) {
        if (!this.bot) {
            logger_1.logger.warn("Notification bot is not configured", { telegramId });
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
        }
        catch (error) {
            logger_1.logger.error("Notification delivery failed", {
                telegramId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    normalizeMessage(message) {
        return typeof message === "string" ? { text: message } : message;
    }
    toInlineKeyboard(actions) {
        return {
            inline_keyboard: actions.map((row) => row.map((action) => ({ text: action.text, callback_data: action.callbackData }))),
        };
    }
    async getAdminTelegramIds() {
        const envIds = (process.env.ADMIN_IDS ?? process.env.ADMINS ?? "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);
        const dbAdmins = await prisma_1.prisma.user.findMany({
            where: { role: { in: ["admin", "superadmin"] } },
            select: { telegramId: true },
        });
        return [...new Set([...envIds, ...dbAdmins.map((admin) => admin.telegramId)])];
    }
}
exports.notificationService = new NotificationService();
let notificationEventsRegistered = false;
function registerNotificationEvents() {
    if (notificationEventsRegistered)
        return;
    notificationEventsRegistered = true;
    event_bus_service_1.eventBus.on("deposit.created", async (event) => {
        await exports.notificationService.notifyAdmins({
            text: `💳 درخواست شارژ جدید\n\nشناسه: ${event.depositId}\nمبلغ: ${event.amount.toLocaleString("fa-IR")} تومان\nارز: ${event.cryptoType.toUpperCase()}`,
            actions: [[{ text: "👁 مشاهده", callbackData: `admin:deposits` }]],
        });
    });
    event_bus_service_1.eventBus.on("ticket.created", async (event) => {
        await exports.notificationService.notifyAdmins({
            text: `🎫 تیکت جدید
━━━━━━━━━━━━━━

🧾 شناسه: #${String(event.ticketId).slice(-6).toUpperCase()}
👤 کاربر: ${event.telegramId}

برای مشاهده تاریخچه یا پاسخ مستقیم، یکی از دکمه‌های زیر را انتخاب کنید.`,
            actions: [[{ text: "👁 مشاهده تیکت", callbackData: `nav:admin.ticket?ticketId=${event.ticketId}` }, { text: "💬 ورود به چت", callbackData: `support:admin:chat:${event.ticketId}` }]],
        });
    });
    event_bus_service_1.eventBus.on("referral.reward.claimed", async (event) => {
        await exports.notificationService.notifyUser(event.userId, `🎁 پاداش زیرمجموعه به مبلغ ${event.amount.toLocaleString("fa-IR")} تومان به کیف پول شما اضافه شد.`);
    });
    event_bus_service_1.eventBus.on("free_config.claimed", async (event) => {
        await exports.notificationService.notifyUser(event.userId, {
            text: `🎁 کانفیگ رایگان شما:\n\n${event.config}`,
            actions: [[{ text: "🏠 خانه", callbackData: "nav:home" }]],
        });
    });
}
