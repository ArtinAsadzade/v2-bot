"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForcedJoinService = exports.LEAVE_REMINDER_COOLDOWN_MS = exports.LEAVE_REMINDER_COOLDOWN_HOURS = void 0;
const prisma_1 = require("../../services/prisma");
exports.LEAVE_REMINDER_COOLDOWN_HOURS = 12;
exports.LEAVE_REMINDER_COOLDOWN_MS = exports.LEAVE_REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000;
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
    static async findActiveByChatId(chatId) {
        return prisma_1.prisma.forcedJoinChannel.findFirst({ where: { chatId: String(chatId), status: "active" } });
    }
    static async canSendLeaveReminder(userId, channelId) {
        const since = new Date(Date.now() - exports.LEAVE_REMINDER_COOLDOWN_MS);
        const recent = await prisma_1.prisma.forcedJoinLeaveReminderLog.findFirst({ where: { userId, channelId, sentAt: { gte: since } }, orderBy: { sentAt: "desc" } });
        return !recent;
    }
    static async recordLeaveReminder(data) {
        return prisma_1.prisma.forcedJoinLeaveReminderLog.create({ data });
    }
    static async leaveReminderCounts() {
        const groups = await prisma_1.prisma.forcedJoinLeaveReminderLog.groupBy({ by: ["channelId"], _count: { _all: true } });
        return new Map(groups.map((group) => [group.channelId, group._count._all]));
    }
    static async updateBotAdminStatus(channelId, status) {
        return prisma_1.prisma.forcedJoinChannel.update({ where: { id: channelId }, data: { lastBotAdminStatus: status, lastBotAdminCheckedAt: new Date() } });
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
