import { prisma } from "../../services/prisma";

export const LEAVE_REMINDER_COOLDOWN_HOURS = 12;
export const LEAVE_REMINDER_COOLDOWN_MS = LEAVE_REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000;

function normalizeInviteLink(inviteLink?: string) {
  const value = inviteLink?.trim();
  return value || null;
}

function channelHasPublicJoinLink(chatId: string) {
  return chatId.startsWith("@") || chatId.startsWith("https://t.me/") || chatId.startsWith("http://t.me/");
}

function validateForcedJoinChannel(data: { chatId: string; title: string; inviteLink?: string }) {
  const chatId = data.chatId.trim();
  const title = data.title.trim();
  const inviteLink = normalizeInviteLink(data.inviteLink);

  if (!chatId || !title) throw new Error("اطلاعات کانال عضویت اجباری کامل نیست");
  if (!inviteLink && !channelHasPublicJoinLink(chatId)) {
    throw new Error("برای کانال خصوصی یا شناسه عددی، لینک عضویت الزامی است");
  }

  return { chatId, title, inviteLink };
}

export class ForcedJoinService {
  static async listActive() {
    return prisma.forcedJoinChannel.findMany({ where: { status: "active" }, orderBy: { createdAt: "asc" } });
  }

  static async listAll() {
    return prisma.forcedJoinChannel.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  }

  static async findActiveByChatId(chatId: string) {
    return prisma.forcedJoinChannel.findFirst({ where: { chatId: String(chatId), status: "active" } });
  }

  static async canSendLeaveReminder(userId: string, channelId: string) {
    const since = new Date(Date.now() - LEAVE_REMINDER_COOLDOWN_MS);
    const recent = await prisma.forcedJoinLeaveReminderLog.findFirst({ where: { userId, channelId, sentAt: { gte: since } }, orderBy: { sentAt: "desc" } });
    return !recent;
  }

  static async recordLeaveReminder(data: { userId: string; channelId: string; telegramId: string; chatId: string }) {
    return prisma.forcedJoinLeaveReminderLog.create({ data });
  }

  static async leaveReminderCounts() {
    const groups = await prisma.forcedJoinLeaveReminderLog.groupBy({ by: ["channelId"], _count: { _all: true } });
    return new Map(groups.map((group) => [group.channelId, group._count._all]));
  }

  static async updateBotAdminStatus(channelId: string, status: string) {
    return prisma.forcedJoinChannel.update({ where: { id: channelId }, data: { lastBotAdminStatus: status, lastBotAdminCheckedAt: new Date() } });
  }

  static async upsert(data: { chatId: string; title: string; inviteLink?: string; status?: "active" | "inactive" }, actorId: string) {
    const { chatId, title, inviteLink } = validateForcedJoinChannel(data);
    const channel = await prisma.forcedJoinChannel.upsert({
      where: { chatId },
      update: { title, inviteLink, status: data.status ?? "active" },
      create: { chatId, title, inviteLink, status: data.status ?? "active" },
    });
    await prisma.auditLog.create({ data: { actorId, action: "forced_join.upsert", metadata: JSON.stringify({ channelId: channel.id, chatId }) } });
    return channel;
  }

  static async setStatus(channelId: string, status: "active" | "inactive", actorId: string) {
    const channel = await prisma.forcedJoinChannel.update({ where: { id: channelId }, data: { status } });
    await prisma.auditLog.create({ data: { actorId, action: "forced_join.status", metadata: JSON.stringify({ channelId, status }) } });
    return channel;
  }

  static async delete(channelId: string, actorId: string) {
    const channel = await prisma.forcedJoinChannel.delete({ where: { id: channelId } });
    await prisma.auditLog.create({ data: { actorId, action: "forced_join.delete", metadata: JSON.stringify({ channelId }) } });
    return channel;
  }
}
