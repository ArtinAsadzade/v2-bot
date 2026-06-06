"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupportService = void 0;
const prisma_1 = require("../../services/prisma");
class SupportService {
    static async createTicket(userId) {
        return prisma_1.prisma.ticket.create({ data: { userId, status: "open" } });
    }
    static async addUserMessage(ticketId, userId, message) {
        return prisma_1.prisma.ticketMessage.create({ data: { ticketId, senderId: userId, senderRole: "user", message } });
    }
    static async addAdminReply(ticketId, adminTelegramId, message) {
        return prisma_1.prisma.ticketMessage.create({ data: { ticketId, senderId: adminTelegramId, senderRole: "admin", message } });
    }
    static async getTicketWithUser(ticketId) {
        return prisma_1.prisma.ticket.findUnique({ where: { id: ticketId }, include: { user: true, messages: { orderBy: { createdAt: "asc" } } } });
    }
}
exports.SupportService = SupportService;
