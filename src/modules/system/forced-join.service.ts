import { prisma } from "../../services/prisma";

export class ForcedJoinService {
  static async listActive() {
    return prisma.forcedJoinChannel.findMany({ where: { status: "active" }, orderBy: { createdAt: "asc" } });
  }

  static async listAll() {
    return prisma.forcedJoinChannel.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  }

  static async upsert(data: { chatId: string; title: string; inviteLink?: string; status?: "active" | "inactive" }, actorId: string) {
    const chatId = data.chatId.trim();
    const title = data.title.trim();
    if (!chatId || !title) throw new Error("اطلاعات کانال عضویت اجباری کامل نیست");
    const channel = await prisma.forcedJoinChannel.upsert({
      where: { chatId },
      update: { title, inviteLink: data.inviteLink?.trim() || null, status: data.status ?? "active" },
      create: { chatId, title, inviteLink: data.inviteLink?.trim() || null, status: data.status ?? "active" },
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
