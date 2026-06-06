"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FreeAccountService = void 0;
exports.registerFreeAccountEvents = registerFreeAccountEvents;
const prisma_1 = require("../../services/prisma");
const event_bus_service_1 = require("../../services/event-bus.service");
const COOLDOWN_DAYS = 30;
const DAY_MS = 86400000;
function assertFreeAccountInput(data) {
    if (!data.username.trim() || !data.subscriptionLink.trim() || !data.configLink.trim())
        throw new Error("اطلاعات اکانت رایگان کامل نیست");
    if (!Number.isInteger(data.durationDays) || data.durationDays <= 0)
        throw new Error("مدت اعتبار اکانت رایگان معتبر نیست");
}
class FreeAccountService {
    static cooldownDays() {
        return COOLDOWN_DAYS;
    }
    static async addToInventory(data, actorId) {
        assertFreeAccountInput(data);
        const account = await prisma_1.prisma.freeAccount.create({
            data: {
                username: data.username.trim(),
                subscriptionLink: data.subscriptionLink.trim(),
                configLink: data.configLink.trim(),
                durationDays: data.durationDays,
                status: "available",
            },
        });
        if (actorId)
            await prisma_1.prisma.auditLog.create({ data: { actorId, action: "free_account.create", metadata: JSON.stringify({ accountId: account.id }) } });
        return account;
    }
    static async updateAccount(accountId, data, actorId) {
        const normalized = {};
        if (data.username !== undefined)
            normalized.username = data.username.trim();
        if (data.subscriptionLink !== undefined)
            normalized.subscriptionLink = data.subscriptionLink.trim();
        if (data.configLink !== undefined)
            normalized.configLink = data.configLink.trim();
        if (data.durationDays !== undefined) {
            if (!Number.isInteger(data.durationDays) || data.durationDays <= 0)
                throw new Error("مدت اعتبار معتبر نیست");
            normalized.durationDays = data.durationDays;
        }
        if (data.status !== undefined) {
            normalized.status = data.status;
            normalized.disabledAt = data.status === "disabled" ? new Date() : null;
        }
        const account = await prisma_1.prisma.freeAccount.update({ where: { id: accountId }, data: normalized });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "free_account.update", metadata: JSON.stringify({ accountId, fields: Object.keys(normalized) }) } });
        return account;
    }
    static async deleteAccount(accountId, actorId) {
        return prisma_1.prisma.$transaction(async (tx) => {
            const assignment = await tx.freeAccountAssignment.findUnique({ where: { accountId } });
            if (assignment)
                throw new Error("اکانت تخصیص‌یافته را نمی‌توان حذف کرد؛ آن را غیرفعال کنید");
            const account = await tx.freeAccount.delete({ where: { id: accountId } });
            await tx.auditLog.create({ data: { actorId, action: "free_account.delete", metadata: JSON.stringify({ accountId }) } });
            return account;
        });
    }
    static async stats() {
        const [available, assigned, disabled, recentAssignments, inventory] = await Promise.all([
            prisma_1.prisma.freeAccount.count({ where: { status: "available" } }),
            prisma_1.prisma.freeAccount.count({ where: { status: "assigned" } }),
            prisma_1.prisma.freeAccount.count({ where: { status: "disabled" } }),
            prisma_1.prisma.freeAccountAssignment.findMany({ include: { user: true, account: true }, orderBy: { createdAt: "desc" }, take: 10 }),
            prisma_1.prisma.freeAccount.findMany({ orderBy: [{ status: "asc" }, { createdAt: "asc" }], take: 20 }),
        ]);
        return { available, assigned, disabled, recentAssignments, inventory };
    }
    static async listInventory(page = 1, take = 10, status) {
        const skip = (page - 1) * take;
        const where = status ? { status } : {};
        return Promise.all([
            prisma_1.prisma.freeAccount.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip, take }),
            prisma_1.prisma.freeAccount.count({ where }),
        ]);
    }
    static async assignmentHistory(page = 1, take = 10) {
        const skip = (page - 1) * take;
        return Promise.all([
            prisma_1.prisma.freeAccountAssignment.findMany({ include: { user: true, account: true }, orderBy: { createdAt: "desc" }, skip, take }),
            prisma_1.prisma.freeAccountAssignment.count(),
        ]);
    }
    static async eligibility(userId) {
        const last = await prisma_1.prisma.freeAccountAssignment.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, include: { account: true } });
        if (!last)
            return { eligible: true, last, nextAvailableAt: undefined };
        const nextAvailableAt = new Date(last.createdAt.getTime() + COOLDOWN_DAYS * DAY_MS);
        return { eligible: nextAvailableAt <= new Date(), last, nextAvailableAt };
    }
    static async assign(userId, reason = "user_claim") {
        const assigned = await prisma_1.prisma.$transaction(async (tx) => {
            const last = await tx.freeAccountAssignment.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
            if (last && Date.now() - last.createdAt.getTime() < COOLDOWN_DAYS * DAY_MS)
                throw new Error("هر کاربر فقط هر ۳۰ روز یک‌بار می‌تواند اکانت رایگان دریافت کند");
            const candidate = await tx.freeAccount.findFirst({ where: { status: "available", assignedTo: null }, orderBy: { createdAt: "asc" } });
            if (!candidate)
                throw new Error("موجودی اکانت رایگان کافی نیست");
            const now = new Date();
            const updated = await tx.freeAccount.updateMany({ where: { id: candidate.id, status: "available", assignedTo: null }, data: { status: "assigned", assignedTo: userId, assignedAt: now } });
            if (updated.count !== 1)
                throw new Error("این اکانت هم‌زمان تخصیص داده شد؛ دوباره تلاش کنید");
            await tx.freeAccountAssignment.create({ data: { userId, accountId: candidate.id, reason } });
            return { ...candidate, status: "assigned", assignedTo: userId, assignedAt: now };
        });
        event_bus_service_1.eventBus.emit("free_account.assigned", { userId, accountId: assigned.id, reason });
        return assigned;
    }
    static async assignedForUser(userId) {
        return prisma_1.prisma.freeAccountAssignment.findMany({ where: { userId }, include: { account: true }, orderBy: { createdAt: "desc" } });
    }
}
exports.FreeAccountService = FreeAccountService;
function registerFreeAccountEvents() {
    // Free test accounts are intentionally independent from referrals, products, categories, and reward tiers.
}
