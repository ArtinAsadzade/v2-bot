"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForcedJoinService = void 0;
const prisma_1 = require("../../services/prisma");
function normalizeInviteLink(inviteLink) {
    const value = inviteLink?.trim();
    return value || null;
}
function channelHasPublicJoinLink(chatId) {
    return chatId.startsWith("@") || chatId.startsWith("https://t.me/") || chatId.startsWith("http://t.me/");
}
function validateForcedJoinChannel(data) {
    const chatId = data.chatId.trim();
    const title = data.title.trim();
    const inviteLink = normalizeInviteLink(data.inviteLink);
    if (!chatId || !title)
        throw new Error("اطلاعات کانال عضویت اجباری کامل نیست");
    if (!inviteLink && !channelHasPublicJoinLink(chatId)) {
        throw new Error("برای کانال خصوصی یا شناسه عددی، لینک عضویت الزامی است");
    }
    return { chatId, title, inviteLink };
}
class ForcedJoinService {
    static async listActive() {
        return prisma_1.prisma.forcedJoinChannel.findMany({ where: { status: "active" }, orderBy: { createdAt: "asc" } });
    }
    static async listAll() {
        return prisma_1.prisma.forcedJoinChannel.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
    }
    static async upsert(data, actorId) {
        const { chatId, title, inviteLink } = validateForcedJoinChannel(data);
        const channel = await prisma_1.prisma.forcedJoinChannel.upsert({
            where: { chatId },
            update: { title, inviteLink, status: data.status ?? "active" },
            create: { chatId, title, inviteLink, status: data.status ?? "active" },
        });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "forced_join.upsert", metadata: JSON.stringify({ channelId: channel.id, chatId }) } });
        return channel;
    }
    static async setStatus(channelId, status, actorId) {
        const channel = await prisma_1.prisma.forcedJoinChannel.update({ where: { id: channelId }, data: { status } });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "forced_join.status", metadata: JSON.stringify({ channelId, status }) } });
        return channel;
    }
    static async delete(channelId, actorId) {
        const channel = await prisma_1.prisma.forcedJoinChannel.delete({ where: { id: channelId } });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "forced_join.delete", metadata: JSON.stringify({ channelId }) } });
        return channel;
    }
}
exports.ForcedJoinService = ForcedJoinService;
