import { prisma } from "../../services/prisma";

export class SupportService {
  static async createTicket(userId: string) {
    return prisma.ticket.create({ data: { userId, status: "open" } });
  }

  static async addUserMessage(ticketId: string, userId: string, message: string) {
    return prisma.ticketMessage.create({ data: { ticketId, senderId: userId, senderRole: "user", message } });
  }

  static async addAdminReply(ticketId: string, adminTelegramId: string, message: string) {
    return prisma.ticketMessage.create({ data: { ticketId, senderId: adminTelegramId, senderRole: "admin", message } });
  }

  static async getTicketWithUser(ticketId: string) {
    return prisma.ticket.findUnique({ where: { id: ticketId }, include: { user: true, messages: { orderBy: { createdAt: "asc" } } } });
  }
}
