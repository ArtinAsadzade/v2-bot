"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupportService = void 0;
const prisma_1 = require("../../services/prisma");
const notification_service_1 = require("../../services/notification.service");
class SupportService {
    static async createTicket(userId) {
        return prisma_1.prisma.ticket.create({ data: { userId, status: "open" } });
    }
    static async addUserMessage(ticketId, userId, message) {
        const ticketMessage = await prisma_1.prisma.ticketMessage.create({ data: { ticketId, senderId: userId, senderRole: "user", message } });
        const ticket = await prisma_1.prisma.ticket.findUnique({ where: { id: ticketId }, include: { user: true } });
        if (ticket) {
            await notification_service_1.notificationService.notifyAdmins({
                text: `📨 پیام جدید پشتیبانی\n\nشناسه تیکت: ${ticket.id}\nکاربر: ${ticket.user.telegramId}\n\n${message}`,
                actions: [
                    [{ text: "↩️ پاسخ", callbackData: `admin:ticket:${ticket.id}` }],
                    [{ text: "✅ بستن تیکت", callbackData: `admin:ticket:close:${ticket.id}` }],
                ],
            });
        }
        return ticketMessage;
    }
    static async addAdminReply(ticketId, adminTelegramId, message) {
        const ticketMessage = await prisma_1.prisma.ticketMessage.create({ data: { ticketId, senderId: adminTelegramId, senderRole: "admin", message } });
        const ticket = await this.getTicketWithUser(ticketId);
        if (ticket) {
            await notification_service_1.notificationService.notifyUser(ticket.userId, `📨 پاسخ پشتیبانی:\n\n${message}`);
        }
        return ticketMessage;
    }
    static async closeTicket(ticketId, adminTelegramId) {
        return prisma_1.prisma.$transaction(async (tx) => {
            const ticket = await tx.ticket.update({ where: { id: ticketId }, data: { status: "closed" } });
            await tx.ticketMessage.create({ data: { ticketId, senderId: adminTelegramId, senderRole: "admin", message: "تیکت بسته شد." } });
            await tx.auditLog.create({
                data: { actorId: adminTelegramId, action: "ticket.close", metadata: JSON.stringify({ ticketId }) },
            });
            return ticket;
        });
    }
    static async getTicketWithUser(ticketId) {
        return prisma_1.prisma.ticket.findUnique({ where: { id: ticketId }, include: { user: true, messages: { orderBy: { createdAt: "asc" } } } });
    }
}
exports.SupportService = SupportService;
