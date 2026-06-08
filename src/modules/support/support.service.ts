import { prisma } from "../../services/prisma";
import { notificationService } from "../../services/notification.service";
import { eventBus } from "../../services/event-bus.service";

const divider = "━━━━━━━━━━━━━━";
const shortId = (id: string) => id.slice(-6).toUpperCase();
const ticketAction = (ticketId: string) => `nav:admin.ticket?ticketId=${ticketId}`;
const userTicketAction = (ticketId: string) => `support:chat:${ticketId}`;
const preview = (message: string) => (message.length > 600 ? `${message.slice(0, 600)}…` : message);
const statusLabel = (status: string) => (status === "open" ? "باز" : "بسته");

export class SupportService {
  static async createTicket(userId: string, firstMessage?: string) {
    const ticket = await prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({ data: { userId, status: "open" }, include: { user: true } });
      if (firstMessage?.trim()) {
        await tx.ticketMessage.create({ data: { ticketId: created.id, senderId: userId, senderRole: "user", message: firstMessage.trim() } });
      }
      return created;
    });
    eventBus.emit("ticket.created", { ticketId: ticket.id, userId, telegramId: ticket.user.telegramId });
    return ticket;
  }

  static async getOrCreateOpenTicket(userId: string) {
    const existing = await prisma.ticket.findFirst({ where: { userId, status: "open" }, orderBy: { updatedAt: "desc" }, include: { user: true } });
    if (existing) return existing;
    return this.createTicket(userId);
  }

  static async listUserTickets(userId: string, take = 5) {
    return prisma.ticket.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take, include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } } });
  }

  static async addUserMessage(ticketId: string, userId: string, message: string) {
    const text = message.trim();
    if (!text) throw new Error("متن پیام خالی است");

    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, userId }, include: { user: true } });
    if (!ticket) throw new Error("تیکت پیدا نشد");
    if (ticket.status === "closed") throw new Error("این تیکت بسته شده است. برای ادامه، تیکت را دوباره باز کنید.");

    const ticketMessage = await prisma.$transaction(async (tx) => {
      const created = await tx.ticketMessage.create({ data: { ticketId, senderId: userId, senderRole: "user", message: text } });
      await tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
      return created;
    });

    await notificationService.notifyAdmins({
      text: `🎫 پیام جدید پشتیبانی\n${divider}\n\n🧾 تیکت: #${shortId(ticket.id)}\n👤 کاربر: ${ticket.user.telegramId}${ticket.user.username ? ` (@${ticket.user.username})` : ""}\n🕒 زمان: ${ticketMessage.createdAt.toLocaleString("fa-IR")}\n\n👤 پیام کاربر:\n${preview(text)}`,
      actions: [
        [{ text: "👁 مشاهده تیکت", callbackData: ticketAction(ticket.id) }, { text: "💬 پاسخ", callbackData: `support:admin:chat:${ticket.id}` }],
        [{ text: "✅ بستن تیکت", callbackData: `admin:ticket:close:${ticket.id}` }],
      ],
    });

    eventBus.emit("ticket.message.created", { ticketId, userId, senderRole: "user", message: text });
    return ticketMessage;
  }

  static async addAdminReply(ticketId: string, adminTelegramId: string, message: string) {
    const text = message.trim();
    if (!text) throw new Error("متن پاسخ خالی است");

    const ticket = await this.getTicketWithUser(ticketId);
    if (!ticket) throw new Error("تیکت پیدا نشد");
    if (ticket.status === "closed") throw new Error("این تیکت بسته شده است. ابتدا آن را باز کنید.");

    const ticketMessage = await prisma.$transaction(async (tx) => {
      const created = await tx.ticketMessage.create({ data: { ticketId, senderId: adminTelegramId, senderRole: "admin", message: text } });
      await tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
      return created;
    });

    await notificationService.notifyUser(ticket.userId, {
      text: `🎧 پاسخ پشتیبانی\n${divider}\n\n🧾 تیکت: #${shortId(ticket.id)}\n🕒 زمان: ${ticketMessage.createdAt.toLocaleString("fa-IR")}\n\n👨‍💼 پشتیبانی:\n${preview(text)}\n\nبرای ادامه گفتگو روی دکمه زیر بزنید.`,
      actions: [[{ text: "💬 باز کردن گفتگو", callbackData: userTicketAction(ticket.id) }], [{ text: "✅ بستن تیکت", callbackData: `support:close:${ticket.id}` }]],
    });

    eventBus.emit("ticket.message.created", { ticketId, userId: ticket.userId, senderRole: "admin", message: text });
    return ticketMessage;
  }

  static async closeTicket(ticketId: string, actorId: string, actorRole: "admin" | "user" = "admin") {
    const existing = await this.getTicketWithUser(ticketId);
    if (!existing) throw new Error("تیکت پیدا نشد");
    if (existing.status === "closed") return existing;

    const ticket = await prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({ where: { id: ticketId }, data: { status: "closed", updatedAt: new Date() } });
      await tx.ticketMessage.create({ data: { ticketId, senderId: actorId, senderRole: actorRole, message: actorRole === "admin" ? "تیکت توسط پشتیبانی بسته شد." : "تیکت توسط کاربر بسته شد." } });
      await tx.auditLog.create({ data: { actorId, action: "ticket.close", metadata: JSON.stringify({ ticketId, actorRole, previousStatus: existing.status }) } });
      return updated;
    });

    eventBus.emit("ticket.closed", { ticketId, userId: ticket.userId, actorId, actorRole });
    if (actorRole === "admin") {
      await notificationService.notifyUser(ticket.userId, {
        text: `✅ تیکت #${shortId(ticketId)} توسط پشتیبانی بسته شد.`,
        actions: [[{ text: "👁 مشاهده تیکت", callbackData: userTicketAction(ticketId) }]],
      });
    } else {
      await notificationService.notifyAdmins({ text: `✅ تیکت #${shortId(ticketId)} توسط کاربر بسته شد.`, actions: [[{ text: "👁 مشاهده سابقه", callbackData: ticketAction(ticketId) }]] });
    }
    return ticket;
  }

  static async reopenTicket(ticketId: string, actorId: string, actorRole: "admin" | "user" = "user") {
    const where = actorRole === "user" ? { id: ticketId, userId: actorId } : { id: ticketId };
    const ticket = await prisma.ticket.findFirst({ where, include: { user: true } });
    if (!ticket) throw new Error("تیکت پیدا نشد");
    if (ticket.status === "open") return ticket;

    const reopened = await prisma.$transaction(async (tx) => {
      const updated = await tx.ticket.update({ where: { id: ticketId }, data: { status: "open", updatedAt: new Date() }, include: { user: true } });
      await tx.ticketMessage.create({ data: { ticketId, senderId: actorId, senderRole: actorRole, message: actorRole === "admin" ? "تیکت توسط پشتیبانی دوباره باز شد." : "تیکت دوباره باز شد." } });
      await tx.auditLog.create({ data: { actorId, action: "ticket.reopen", metadata: JSON.stringify({ ticketId, actorRole, previousStatus: ticket.status }) } });
      return updated;
    });

    eventBus.emit("ticket.reopened", { ticketId, userId: reopened.userId, actorId, actorRole });
    if (actorRole === "admin") {
      await notificationService.notifyUser(reopened.userId, {
        text: `🔄 تیکت #${shortId(ticketId)} توسط پشتیبانی دوباره باز شد.\n\nبرای ادامه گفتگو روی دکمه زیر بزنید.`,
        actions: [[{ text: "💬 باز کردن گفتگو", callbackData: userTicketAction(ticketId) }]],
      });
    } else {
      await notificationService.notifyAdmins({
        text: `🔄 تیکت #${shortId(ticketId)} دوباره باز شد.\n\n👤 کاربر: ${reopened.user.telegramId}\n⚡ وضعیت: ${statusLabel(reopened.status)}`,
        actions: [[{ text: "👁 مشاهده تیکت", callbackData: ticketAction(ticketId) }, { text: "💬 ورود به چت", callbackData: `support:admin:chat:${ticketId}` }]],
      });
    }
    return reopened;
  }

  static async getTicketWithUser(ticketId: string) {
    return prisma.ticket.findUnique({ where: { id: ticketId }, include: { user: true, messages: { orderBy: { createdAt: "asc" } } } });
  }
}
