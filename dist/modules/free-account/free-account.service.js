"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FreeAccountService = exports.FreeAccountError = exports.FREE_ACCOUNT_STATUS_LABELS = void 0;
exports.freeAccountExpiresAt = freeAccountExpiresAt;
exports.formatRemainingTime = formatRemainingTime;
exports.formatFreeAccountError = formatFreeAccountError;
exports.registerFreeAccountEvents = registerFreeAccountEvents;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../services/prisma");
const event_bus_service_1 = require("../../services/event-bus.service");
const COOLDOWN_DAYS = 30;
const DAY_MS = 86400000;
exports.FREE_ACCOUNT_STATUS_LABELS = {
    available: "آماده تخصیص",
    assigned: "فعال",
    expired: "منقضی‌شده",
};
class FreeAccountError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.code = code;
        this.details = details;
    }
}
exports.FreeAccountError = FreeAccountError;
function assertFreeAccountInput(data) {
    if (!data.username.trim() || !data.subscriptionLink.trim() || !data.configLink.trim())
        throw new FreeAccountError("INVALID_INPUT", "اطلاعات اکانت تست کامل نیست");
    if (!Number.isInteger(data.durationDays) || data.durationDays <= 0)
        throw new FreeAccountError("INVALID_INPUT", "مدت اعتبار اکانت تست معتبر نیست");
}
function freeAccountExpiresAt(assignedAt, durationDays) {
    return new Date(assignedAt.getTime() + durationDays * DAY_MS);
}
function formatRemainingTime(target, now = new Date()) {
    const remaining = Math.max(target.getTime() - now.getTime(), 0);
    const days = Math.floor(remaining / DAY_MS);
    const hours = Math.ceil((remaining % DAY_MS) / 3600000);
    if (days <= 0)
        return `${hours.toLocaleString("fa-IR")} ساعت`;
    return `${days.toLocaleString("fa-IR")} روز و ${hours.toLocaleString("fa-IR")} ساعت`;
}
function formatFreeAccountError(error) {
    if (!(error instanceof FreeAccountError))
        return error instanceof Error ? error.message : "دریافت اکانت تست ناموفق بود. لطفاً دوباره تلاش کنید.";
    if (error.code === "ACTIVE_ACCOUNT") {
        return "⚠️ شما در حال حاضر یک اکانت تست فعال دارید.\n\n📦 برای مشاهده اطلاعات اکانت از بخش «اکانت‌های من» استفاده کنید.";
    }
    if (error.code === "COOLDOWN") {
        const lastClaimAt = error.details.lastClaimAt instanceof Date ? error.details.lastClaimAt : undefined;
        const nextAvailableAt = error.details.nextAvailableAt instanceof Date ? error.details.nextAvailableAt : undefined;
        return `⚠️ شما در ۳۰ روز گذشته اکانت تست دریافت کرده‌اید.\n\n📅 تاریخ دریافت قبلی:\n${lastClaimAt ? lastClaimAt.toLocaleString("fa-IR") : "ثبت نشده"}\n\n⏳ زمان باقی‌مانده تا دریافت مجدد:\n${nextAvailableAt ? formatRemainingTime(nextAvailableAt) : "پس از تکمیل دوره ۳۰ روزه"}`;
    }
    return `⚠️ ${error.message}`;
}
function isUniqueConstraint(error) {
    return error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === "P2002";
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
                throw new FreeAccountError("INVALID_INPUT", "مدت اعتبار معتبر نیست");
            normalized.durationDays = data.durationDays;
        }
        if (data.status !== undefined)
            normalized.status = data.status;
        const account = await prisma_1.prisma.freeAccount.update({ where: { id: accountId }, data: normalized });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "free_account.update", metadata: JSON.stringify({ accountId, fields: Object.keys(normalized) }) } });
        return account;
    }
    static async deleteAccount(accountId, actorId) {
        return prisma_1.prisma.$transaction(async (tx) => {
            const assignment = await tx.freeAccountAssignment.findUnique({ where: { accountId } });
            if (assignment)
                throw new Error("اکانت تخصیص‌یافته را نمی‌توان حذف کرد؛ تاریخچه آن باید برای حسابرسی باقی بماند");
            const account = await tx.freeAccount.delete({ where: { id: accountId } });
            await tx.auditLog.create({ data: { actorId, action: "free_account.delete", metadata: JSON.stringify({ accountId }) } });
            return account;
        });
    }
    static async stats() {
        const now = new Date();
        const monthStart = new Date(now.getTime() - COOLDOWN_DAYS * DAY_MS);
        const [total, available, assigned, expired, monthlyAssignments, uniqueUsers, recentAssignments, inventory] = await Promise.all([
            prisma_1.prisma.freeAccount.count(),
            prisma_1.prisma.freeAccount.count({ where: { status: "available" } }),
            prisma_1.prisma.freeAccount.count({ where: { status: "assigned" } }),
            prisma_1.prisma.freeAccount.count({ where: { status: "expired" } }),
            prisma_1.prisma.freeAccountAssignment.count({ where: { createdAt: { gte: monthStart } } }),
            prisma_1.prisma.freeAccountAssignment.findMany({ distinct: ["userId"], select: { userId: true } }),
            prisma_1.prisma.freeAccountAssignment.findMany({ include: { user: true, account: true }, orderBy: { createdAt: "desc" }, take: 10 }),
            prisma_1.prisma.freeAccount.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 20 }),
        ]);
        return { total, available, assigned, expired, monthlyAssignments, uniqueUsers: uniqueUsers.length, recentAssignments, inventory };
    }
    static async listInventory(page = 1, take = 10, status, query) {
        const skip = (page - 1) * take;
        const where = { ...(status ? { status } : {}), ...(query ? { username: { contains: query } } : {}) };
        return Promise.all([
            prisma_1.prisma.freeAccount.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip, take }),
            prisma_1.prisma.freeAccount.count({ where }),
        ]);
    }
    static async assignmentHistory(page = 1, take = 10, query) {
        const skip = (page - 1) * take;
        const where = query ? { OR: [{ user: { is: { telegramId: { contains: query } } } }, { account: { is: { username: { contains: query } } } }] } : {};
        return Promise.all([
            prisma_1.prisma.freeAccountAssignment.findMany({ where, include: { user: true, account: true }, orderBy: { createdAt: "desc" }, skip, take }),
            prisma_1.prisma.freeAccountAssignment.count({ where }),
        ]);
    }
    static async activeForUser(userId) {
        const now = new Date();
        const assignments = await prisma_1.prisma.freeAccountAssignment.findMany({ where: { userId, account: { is: { status: "assigned" } } }, include: { account: true }, orderBy: { createdAt: "desc" }, take: 20 });
        return assignments.filter((item) => {
            const assignedAt = item.assignedAt ?? item.createdAt;
            const expiresAt = item.expiresAt ?? freeAccountExpiresAt(assignedAt, item.account.durationDays);
            return expiresAt > now;
        });
    }
    static async eligibility(userId) {
        const now = new Date();
        const [user, activeAccount, last] = await Promise.all([
            prisma_1.prisma.user.findUnique({ where: { id: userId }, select: { isBanned: true } }),
            this.activeForUser(userId).then((items) => items[0]),
            prisma_1.prisma.freeAccountAssignment.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, include: { account: true } }),
        ]);
        if (user?.isBanned)
            return { eligible: false, reason: "blocked", activeAccount, last, nextAvailableAt: undefined };
        if (activeAccount)
            return { eligible: false, reason: "active", activeAccount, last, nextAvailableAt: undefined };
        if (!last)
            return { eligible: true, activeAccount, last, nextAvailableAt: undefined };
        const lastClaimAt = last.assignedAt ?? last.createdAt;
        const nextAvailableAt = new Date(lastClaimAt.getTime() + COOLDOWN_DAYS * DAY_MS);
        return { eligible: nextAvailableAt <= now, reason: nextAvailableAt <= now ? undefined : "cooldown", activeAccount, last, nextAvailableAt };
    }
    static async assertEligible(userId) {
        const status = await this.eligibility(userId);
        if (status.reason === "blocked")
            throw new FreeAccountError("USER_BLOCKED", "حساب شما مسدود است و امکان دریافت اکانت تست وجود ندارد");
        if (status.reason === "active")
            throw new FreeAccountError("ACTIVE_ACCOUNT", "شما در حال حاضر یک اکانت تست فعال دارید", { accountId: status.activeAccount?.accountId });
        if (status.reason === "cooldown")
            throw new FreeAccountError("COOLDOWN", "شما در ۳۰ روز گذشته اکانت تست دریافت کرده‌اید", { lastClaimAt: status.last?.assignedAt, nextAvailableAt: status.nextAvailableAt });
        return status;
    }
    static async assign(userId, reason = "user_claim") {
        try {
            const assigned = await prisma_1.prisma.$transaction(async (tx) => {
                const now = new Date();
                const cutoff = new Date(now.getTime() - COOLDOWN_DAYS * DAY_MS);
                const user = await tx.user.findUnique({ where: { id: userId }, select: { isBanned: true } });
                if (!user || user.isBanned)
                    throw new FreeAccountError("USER_BLOCKED", "حساب شما مسدود است و امکان دریافت اکانت تست وجود ندارد");
                const assignedAccounts = await tx.freeAccountAssignment.findMany({ where: { userId, account: { is: { status: "assigned" } } }, include: { account: true }, orderBy: { createdAt: "desc" }, take: 20 });
                const active = assignedAccounts.find((item) => {
                    const assignedAt = item.assignedAt ?? item.createdAt;
                    const expiresAt = item.expiresAt ?? freeAccountExpiresAt(assignedAt, item.account.durationDays);
                    return expiresAt > now;
                });
                if (active)
                    throw new FreeAccountError("ACTIVE_ACCOUNT", "شما در حال حاضر یک اکانت تست فعال دارید", { accountId: active.accountId });
                const last = await tx.freeAccountAssignment.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
                const lastClaimAt = last ? last.assignedAt ?? last.createdAt : undefined;
                if (lastClaimAt && lastClaimAt > cutoff)
                    throw new FreeAccountError("COOLDOWN", "شما در ۳۰ روز گذشته اکانت تست دریافت کرده‌اید", { lastClaimAt, nextAvailableAt: new Date(lastClaimAt.getTime() + COOLDOWN_DAYS * DAY_MS) });
                const lock = await tx.freeAccountUserLock.findUnique({ where: { userId } });
                if (!lock) {
                    await tx.freeAccountUserLock.create({ data: { userId, lastClaimAt: now } });
                }
                else {
                    if (lock.lastClaimAt > cutoff)
                        throw new FreeAccountError("COOLDOWN", "شما در ۳۰ روز گذشته اکانت تست دریافت کرده‌اید", { lastClaimAt: lock.lastClaimAt, nextAvailableAt: new Date(lock.lastClaimAt.getTime() + COOLDOWN_DAYS * DAY_MS) });
                    const locked = await tx.freeAccountUserLock.updateMany({ where: { userId, lastClaimAt: { lte: cutoff } }, data: { lastClaimAt: now } });
                    if (locked.count !== 1)
                        throw new FreeAccountError("RACE_CONDITION", "درخواست شما در حال پردازش است. لطفاً چند لحظه دیگر دوباره تلاش کنید");
                }
                const candidate = await tx.freeAccount.findFirst({ where: { status: "available", assignedTo: null }, orderBy: { createdAt: "asc" } });
                if (!candidate)
                    throw new FreeAccountError("NO_INVENTORY", "در حال حاضر موجودی اکانت تست تمام شده است");
                const updated = await tx.freeAccount.updateMany({ where: { id: candidate.id, status: "available", assignedTo: null }, data: { status: "assigned", assignedTo: userId, assignedAt: now } });
                if (updated.count !== 1)
                    throw new FreeAccountError("RACE_CONDITION", "این اکانت هم‌زمان تخصیص داده شد؛ لطفاً دوباره تلاش کنید");
                const assignment = await tx.freeAccountAssignment.create({ data: { userId, accountId: candidate.id, reason, assignedAt: now, expiresAt: freeAccountExpiresAt(now, candidate.durationDays) } });
                await tx.freeAccountUserLock.update({ where: { userId }, data: { lastAssignmentId: assignment.id, lastClaimAt: now } });
                return { ...candidate, status: "assigned", assignedTo: userId, assignedAt: now, assignment };
            });
            event_bus_service_1.eventBus.emit("free_account.assigned", { userId, accountId: assigned.id, reason });
            return assigned;
        }
        catch (error) {
            if (isUniqueConstraint(error))
                throw new FreeAccountError("RACE_CONDITION", "درخواست شما در حال پردازش است. لطفاً چند لحظه دیگر دوباره تلاش کنید");
            throw error;
        }
    }
    static async expireDueAccounts(now = new Date()) {
        const assigned = await prisma_1.prisma.freeAccountAssignment.findMany({ where: { account: { is: { status: "assigned" } } }, include: { account: true }, take: 500 });
        const due = assigned.filter((item) => {
            const assignedAt = item.assignedAt ?? item.createdAt;
            const expiresAt = item.expiresAt ?? freeAccountExpiresAt(assignedAt, item.account.durationDays);
            return expiresAt <= now;
        });
        if (!due.length)
            return { count: 0 };
        const ids = due.map((item) => item.accountId);
        const result = await prisma_1.prisma.freeAccount.updateMany({ where: { id: { in: ids }, status: "assigned" }, data: { status: "expired" } });
        if (result.count > 0)
            event_bus_service_1.eventBus.emit("free_account.expired", { count: result.count });
        return result;
    }
    static async assignedForUser(userId) {
        return prisma_1.prisma.freeAccountAssignment.findMany({ where: { userId }, include: { account: true }, orderBy: { createdAt: "desc" } });
    }
}
exports.FreeAccountService = FreeAccountService;
function registerFreeAccountEvents() {
    // Free test accounts are intentionally independent from referrals, products, categories, and reward tiers.
}
