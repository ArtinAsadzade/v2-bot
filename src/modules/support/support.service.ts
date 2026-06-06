import { prisma } from "../../services/prisma";
import { notificationService } from "../../services/notification.service";
import { eventBus } from "../../services/event-bus.service";

export class SupportService {
  static async createTicket(userId: string) {
    const ticket = await prisma.ticket.create({ data: { userId, status: "open" }, include: { user: true } });
    eventBus.emit("ticket.created", { ticketId: ticket.id, userId, telegramId: ticket.user.telegramId });
    return ticket;
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

    eventBus.emit("ticket.message.created", { ticketId, userId, senderRole: "user", message });
    return ticketMessage;
  }

  static async addAdminReply(ticketId: string, adminTelegramId: string, message: string) {
    const ticketMessage = await prisma.ticketMessage.create({ data: { ticketId, senderId: adminTelegramId, senderRole: "admin", message } });
    const ticket = await this.getTicketWithUser(ticketId);

    if (ticket) {
      await notificationService.notifyUser(ticket.userId, `📨 پاسخ پشتیبانی:\n\n${message}`);
    }

    if (ticket) {
      eventBus.emit("ticket.message.created", { ticketId, userId: ticket.userId, senderRole: "admin", message });
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
      eventBus.emit("ticket.closed", { ticketId, userId: ticket.userId, adminTelegramId });
      await notificationService.notifyUser(ticket.userId, "✅ تیکت پشتیبانی شما بسته شد.");
      return ticket;
    });
  }

  static async getTicketWithUser(ticketId: string) {
    return prisma.ticket.findUnique({ where: { id: ticketId }, include: { user: true, messages: { orderBy: { createdAt: "asc" } } } });
  }
}
