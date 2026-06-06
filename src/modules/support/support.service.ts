import { prisma } from "../../services/prisma";
import { notificationService } from "../../services/notification.service";

export class SupportService {
  static async createTicket(userId: string) {
    return prisma.ticket.create({ data: { userId, status: "open" } });
  }

  static async addUserMessage(ticketId: string, userId: string, message: string) {
    const ticketMessage = await prisma.ticketMessage.create({ data: { ticketId, senderId: userId, senderRole: "user", message } });
    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: { user: true } });

    if (ticket) {
      await notificationService.notifyAdmins({
        text: `📨 پیام جدید پشتیبانی\n\nشناسه تیکت: ${ticket.id}\nکاربر: ${ticket.user.telegramId}\n\n${message}`,
        actions: [
          [{ text: "↩️ پاسخ", callbackData: `admin:ticket:${ticket.id}` }],
          [{ text: "✅ بستن تیکت", callbackData: `admin:ticket:close:${ticket.id}` }],
        ],
      });
    }

    return ticketMessage;
  }

  static async addAdminReply(ticketId: string, adminTelegramId: string, message: string) {
    const ticketMessage = await prisma.ticketMessage.create({ data: { ticketId, senderId: adminTelegramId, senderRole: "admin", message } });
    const ticket = await this.getTicketWithUser(ticketId);

    if (ticket) {
      await notificationService.notifyUser(ticket.userId, `📨 پاسخ پشتیبانی:\n\n${message}`);
    }

    return ticketMessage;
  }

  static async closeTicket(ticketId: string, adminTelegramId: string) {
    return prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.update({ where: { id: ticketId }, data: { status: "closed" } });
      await tx.ticketMessage.create({ data: { ticketId, senderId: adminTelegramId, senderRole: "admin", message: "تیکت بسته شد." } });
      await tx.auditLog.create({
        data: { actorId: adminTelegramId, action: "ticket.close", metadata: JSON.stringify({ ticketId }) },
      });
      return ticket;
    });
  }

  static async getTicketWithUser(ticketId: string) {
    return prisma.ticket.findUnique({ where: { id: ticketId }, include: { user: true, messages: { orderBy: { createdAt: "asc" } } } });
  }
}
