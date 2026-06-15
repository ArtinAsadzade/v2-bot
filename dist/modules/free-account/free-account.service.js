"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FreeAccountService = exports.FreeAccountError = exports.FREE_ACCOUNT_STATUS_LABELS = void 0;
exports.freeAccountExpiresAt = freeAccountExpiresAt;
exports.formatFreeAccountDate = formatFreeAccountDate;
exports.formatRemainingTime = formatRemainingTime;
exports.formatFreeAccountError = formatFreeAccountError;
exports.validateFreeTestActivation = validateFreeTestActivation;
exports.validateFreeTestInboundSelection = validateFreeTestInboundSelection;
exports.registerFreeAccountEvents = registerFreeAccountEvents;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../services/prisma");
const event_bus_service_1 = require("../../services/event-bus.service");
const logger_1 = require("../../services/logger");
const monitoring_service_1 = require("../../services/monitoring.service");
const xray_service_1 = require("../xray/xray.service");
const COOLDOWN_DAYS = 30;
const DAY_MS = 86400000;
exports.FREE_ACCOUNT_STATUS_LABELS = {
    available: "آماده تخصیص",
    assigned: "فعال",
    expired: "منقضی و غیرفعال",
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
function formatFreeAccountDate(date) {
    return date ? date.toLocaleDateString("fa-IR") : "ثبت نشده";
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
        return "دریافت اکانت تست ناموفق بود. لطفاً چند لحظه دیگر دوباره تلاش کنید.";
    if (error.code === "ACTIVE_ACCOUNT") {
        return `⚠️ اکانت تست فعال دارید

━━━━━━━━━━━━━━

شما در حال حاضر یک اکانت تست فعال در اختیار دارید.

برای مشاهده اطلاعات اکانت از بخش «اکانت‌های من» استفاده کنید.

━━━━━━━━━━━━━━`;
    }
    if (error.code === "COOLDOWN") {
        const lastClaimAt = error.details.lastClaimAt instanceof Date ? error.details.lastClaimAt : undefined;
        const nextAvailableAt = error.details.nextAvailableAt instanceof Date ? error.details.nextAvailableAt : undefined;
        return `⏳ محدودیت دریافت اکانت تست

━━━━━━━━━━━━━━

شما در ۳۰ روز گذشته اکانت تست دریافت کرده‌اید.

📅 دریافت قبلی:
${formatFreeAccountDate(lastClaimAt)}

⏳ امکان دریافت مجدد:
${formatFreeAccountDate(nextAvailableAt)}

━━━━━━━━━━━━━━`;
    }
    if (error.code === "NO_INVENTORY") {
        return `🚫 موجودی اکانت تست تکمیل شده است

━━━━━━━━━━━━━━

در حال حاضر تمامی اکانت‌های تست تخصیص داده شده‌اند.

لطفاً بعداً مجدداً مراجعه کنید.

━━━━━━━━━━━━━━`;
    }
    if (error.code === "USER_BLOCKED")
        return "دسترسی حساب شما در حال حاضر محدود شده است. لطفاً با پشتیبانی تماس بگیرید.";
    return "دریافت اکانت تست ناموفق بود. لطفاً چند لحظه دیگر دوباره تلاش کنید.";
}
function isUniqueConstraint(error) {
    return error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
function validateFreeTestActivation(config, panelEnabled) {
    if (!panelEnabled)
        return "اتصال پنل Xray برقرار نیست.";
    if (BigInt(config.trafficBytes) <= 0n)
        return "حجم تست باید بیشتر از صفر باشد.";
    if (config.durationDays <= 0)
        return "مدت اکانت تست باید بیشتر از صفر باشد.";
    if (config.stockLimit <= 0)
        return "موجودی باید بیشتر از صفر باشد.";
    if (!config.inboundIds.length)
        return "ابتدا حداقل یک اینباند انتخاب کنید.";
    return undefined;
}
function validateFreeTestInboundSelection(inbounds, selectedIds) {
    const uniqueIds = [...new Set(selectedIds)];
    if (!uniqueIds.length)
        throw new FreeAccountError("INVALID_INPUT", "حداقل یک اینباند لازم است");
    const liveIds = new Set(inbounds.map((i) => i.id));
    if (uniqueIds.some((id) => !liveIds.has(id)))
        throw new FreeAccountError("INVALID_INPUT", "اینباندهای انتخابی معتبر نیستند");
    return { inboundIds: uniqueIds, inboundSnapshot: (0, xray_service_1.xrayInboundSnapshot)(inbounds, uniqueIds) };
}
const availableInventoryWhere = { status: "available", assignedTo: null, assignment: { is: null } };
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
                assignedTo: null,
                assignedAt: null,
            },
        });
        logger_1.logger.info("Free test account inventory created", { accountId: account.id, actorId, username: account.username, durationDays: account.durationDays });
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
        if (data.status !== undefined) {
            normalized.status = data.status;
            if (data.status === "available") {
                const existingAssignment = await prisma_1.prisma.freeAccountAssignment.findUnique({ where: { accountId } });
                if (existingAssignment)
                    throw new FreeAccountError("INVALID_INPUT", "اکانت تخصیص‌یافته را نمی‌توان دوباره وارد موجودی آماده کرد");
                normalized.assignedTo = null;
                normalized.assignedAt = null;
            }
        }
        const account = await prisma_1.prisma.freeAccount.update({ where: { id: accountId }, data: normalized });
        if (data.status === "expired")
            await prisma_1.prisma.freeAccountAssignment.updateMany({ where: { accountId }, data: { isActive: false } });
        if (data.status === "assigned")
            await prisma_1.prisma.freeAccountAssignment.updateMany({ where: { accountId }, data: { isActive: true } });
        logger_1.logger.info("Free test account inventory updated", { accountId, actorId, fields: Object.keys(normalized), status: account.status });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "free_account.update", metadata: JSON.stringify({ accountId, fields: Object.keys(normalized) }) } });
        return account;
    }
    static async deleteAccount(accountId, actorId) {
        return prisma_1.prisma.$transaction(async (tx) => {
            const assignment = await tx.freeAccountAssignment.findUnique({ where: { accountId } });
            if (assignment)
                await tx.freeAccountAssignment.delete({ where: { accountId } });
            const account = await tx.freeAccount.delete({ where: { id: accountId } });
            await tx.auditLog.create({ data: { actorId, action: "free_account.delete", metadata: JSON.stringify({ accountId, assignmentId: assignment?.id }) } });
            logger_1.logger.info("Free test account inventory deleted", { accountId, actorId, assignmentId: assignment?.id });
            return account;
        });
    }
    static async stats() {
        const now = new Date();
        const monthStart = new Date(now.getTime() - COOLDOWN_DAYS * DAY_MS);
        const [total, available, assigned, expired, monthlyAssignments, uniqueUsers, recentAssignments, inventory] = await Promise.all([
            prisma_1.prisma.freeAccount.count(),
            prisma_1.prisma.freeAccount.count({ where: availableInventoryWhere }),
            prisma_1.prisma.freeAccount.count({ where: { status: "assigned" } }),
            prisma_1.prisma.freeAccount.count({ where: { status: "expired" } }),
            prisma_1.prisma.freeAccountAssignment.count({ where: { createdAt: { gte: monthStart } } }),
            prisma_1.prisma.freeAccountAssignment.findMany({ distinct: ["userId"], select: { userId: true } }),
            prisma_1.prisma.freeAccountAssignment.findMany({ include: { user: true, account: true }, orderBy: { createdAt: "desc" }, take: 10 }),
            prisma_1.prisma.freeAccount.findMany({ include: { assignment: { include: { user: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 20 }),
        ]);
        return { total, available, assigned, expired, monthlyAssignments, uniqueUsers: uniqueUsers.length, recentAssignments, inventory };
    }
    static async listInventory(page = 1, take = 10, status, query) {
        const skip = (page - 1) * take;
        const where = { ...(status === "available" ? availableInventoryWhere : status ? { status } : {}), ...(query ? { username: { contains: query } } : {}) };
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
        await this.expireDueAccounts(now);
        const assignments = await prisma_1.prisma.freeAccountAssignment.findMany({ where: { userId, isActive: true, account: { is: { status: "assigned" } } }, include: { account: true }, orderBy: { createdAt: "desc" }, take: 20 });
        return assignments.filter((item) => {
            const assignedAt = item.assignedAt ?? item.createdAt;
            const expiresAt = item.expiresAt ?? freeAccountExpiresAt(assignedAt, item.account.durationDays);
            return expiresAt > now;
        });
    }
    static async eligibility(userId) {
        const now = new Date();
        await this.expireDueAccounts(now);
        const [user, activeAccount, last, available] = await Promise.all([
            prisma_1.prisma.user.findUnique({ where: { id: userId }, select: { isBanned: true } }),
            this.activeForUser(userId).then((items) => items[0]),
            prisma_1.prisma.freeAccountAssignment.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, include: { account: true } }),
            prisma_1.prisma.freeAccount.count({ where: availableInventoryWhere }),
        ]);
        logger_1.logger.info("Free test account eligibility checked", { userId, isBanned: Boolean(user?.isBanned), hasActiveAccount: Boolean(activeAccount), lastClaimAt: last?.assignedAt ?? last?.createdAt, available });
        if (user?.isBanned)
            return { eligible: false, reason: "blocked", activeAccount, last, nextAvailableAt: undefined, available };
        if (activeAccount)
            return { eligible: false, reason: "active", activeAccount, last, nextAvailableAt: undefined, available };
        if (!last)
            return { eligible: true, activeAccount, last, nextAvailableAt: undefined, available };
        const lastClaimAt = last.assignedAt ?? last.createdAt;
        const nextAvailableAt = new Date(lastClaimAt.getTime() + COOLDOWN_DAYS * DAY_MS);
        return { eligible: nextAvailableAt <= now, reason: nextAvailableAt <= now ? undefined : "cooldown", activeAccount, last, nextAvailableAt, available };
    }
    static async assertEligible(userId) {
        const status = await this.eligibility(userId);
        if (status.reason === "blocked")
            throw new FreeAccountError("USER_BLOCKED", "حساب شما مسدود است و امکان دریافت اکانت تست وجود ندارد");
        if (status.reason === "active")
            throw new FreeAccountError("ACTIVE_ACCOUNT", "شما در حال حاضر یک اکانت تست فعال دارید", { accountId: status.activeAccount?.accountId });
        if (status.reason === "cooldown")
            throw new FreeAccountError("COOLDOWN", "شما در ۳۰ روز گذشته اکانت تست دریافت کرده‌اید", { lastClaimAt: status.last?.assignedAt ?? status.last?.createdAt, nextAvailableAt: status.nextAvailableAt });
        return status;
    }
    static async assign(userId, reason = "user_claim") {
        try {
            logger_1.logger.info("Free test account assignment requested", { userId, reason });
            await this.expireDueAccounts();
            const assigned = await prisma_1.prisma.$transaction(async (tx) => {
                const now = new Date();
                const cutoff = new Date(now.getTime() - COOLDOWN_DAYS * DAY_MS);
                const user = await tx.user.findUnique({ where: { id: userId }, select: { isBanned: true } });
                logger_1.logger.info("Free test account assignment user check", { userId, userFound: Boolean(user), isBanned: Boolean(user?.isBanned) });
                if (!user || user.isBanned)
                    throw new FreeAccountError("USER_BLOCKED", "حساب شما مسدود است و امکان دریافت اکانت تست وجود ندارد");
                const assignedAccounts = await tx.freeAccountAssignment.findMany({ where: { userId, isActive: true, account: { is: { status: "assigned" } } }, include: { account: true }, orderBy: { createdAt: "desc" }, take: 20 });
                const active = assignedAccounts.find((item) => {
                    const assignedAt = item.assignedAt ?? item.createdAt;
                    const expiresAt = item.expiresAt ?? freeAccountExpiresAt(assignedAt, item.account.durationDays);
                    return expiresAt > now;
                });
                logger_1.logger.info("Free test account assignment active-account check", { userId, assignedAccountCount: assignedAccounts.length, activeAccountId: active?.accountId });
                if (active)
                    throw new FreeAccountError("ACTIVE_ACCOUNT", "شما در حال حاضر یک اکانت تست فعال دارید", { accountId: active.accountId });
                const last = await tx.freeAccountAssignment.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
                const lastClaimAt = last ? last.assignedAt ?? last.createdAt : undefined;
                logger_1.logger.info("Free test account assignment cooldown check", { userId, lastClaimAt, cooldownCutoff: cutoff });
                if (lastClaimAt && lastClaimAt > cutoff)
                    throw new FreeAccountError("COOLDOWN", "شما در ۳۰ روز گذشته اکانت تست دریافت کرده‌اید", { lastClaimAt, nextAvailableAt: new Date(lastClaimAt.getTime() + COOLDOWN_DAYS * DAY_MS) });
                const lock = await tx.freeAccountUserLock.findUnique({ where: { userId } });
                logger_1.logger.info("Free test account assignment lock check", { userId, hasLock: Boolean(lock), lockLastClaimAt: lock?.lastClaimAt });
                if (!lock) {
                    await tx.freeAccountUserLock.create({ data: { userId, lastClaimAt: now } });
                }
                else {
                    if (lock.lastClaimAt > cutoff)
                        throw new FreeAccountError("COOLDOWN", "شما در ۳۰ روز گذشته اکانت تست دریافت کرده‌اید", { lastClaimAt: lock.lastClaimAt, nextAvailableAt: new Date(lock.lastClaimAt.getTime() + COOLDOWN_DAYS * DAY_MS) });
                    const locked = await tx.freeAccountUserLock.updateMany({ where: { userId, lastClaimAt: { lte: cutoff } }, data: { lastClaimAt: now } });
                    logger_1.logger.info("Free test account assignment lock acquired", { userId, updatedLocks: locked.count });
                    if (locked.count !== 1)
                        throw new FreeAccountError("RACE_CONDITION", "درخواست شما در حال پردازش است. لطفاً چند لحظه دیگر دوباره تلاش کنید");
                }
                const available = await tx.freeAccount.count({ where: availableInventoryWhere });
                const staleAvailable = await tx.freeAccount.count({ where: { status: "available", assignedTo: { not: null }, assignment: { is: null } } });
                logger_1.logger.info("Free test account assignment availability check", { userId, available, staleAvailable });
                const candidates = await tx.freeAccount.findMany({ where: availableInventoryWhere, orderBy: { createdAt: "asc" }, take: 10 });
                if (!candidates.length)
                    throw new FreeAccountError("NO_INVENTORY", "در حال حاضر موجودی اکانت تست تکمیل شده است");
                for (const candidate of candidates) {
                    const updated = await tx.freeAccount.updateMany({ where: { id: candidate.id, status: "available", assignedTo: null, assignment: { is: null } }, data: { status: "assigned", assignedTo: userId, assignedAt: now } });
                    logger_1.logger.info("Free test account assignment candidate update", { userId, accountId: candidate.id, updated: updated.count });
                    if (updated.count !== 1)
                        continue;
                    const assignment = await tx.freeAccountAssignment.create({ data: { userId, accountId: candidate.id, reason, isActive: true, assignedAt: now, expiresAt: freeAccountExpiresAt(now, candidate.durationDays) } });
                    await tx.freeAccountUserLock.update({ where: { userId }, data: { lastAssignmentId: assignment.id, lastClaimAt: now } });
                    return { ...candidate, status: "assigned", assignedTo: userId, assignedAt: now, assignment };
                }
                throw new FreeAccountError("RACE_CONDITION", "درخواست شما در حال پردازش است. لطفاً چند لحظه دیگر دوباره تلاش کنید");
            });
            logger_1.logger.info("Free test account assigned", { userId, accountId: assigned.id, assignmentId: assigned.assignment.id, reason });
            event_bus_service_1.eventBus.emit("free_account.assigned", { userId, accountId: assigned.id, reason });
            return assigned;
        }
        catch (error) {
            if (isUniqueConstraint(error)) {
                logger_1.logger.warn("Free test account assignment unique constraint", { userId, reason, error: error instanceof Error ? error.message : String(error) });
                throw new FreeAccountError("RACE_CONDITION", "درخواست شما در حال پردازش است. لطفاً چند لحظه دیگر دوباره تلاش کنید");
            }
            logger_1.logger.warn("Free test account assignment failed", { userId, reason, error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }
    static async expireDueAccounts(now = new Date()) {
        const assigned = await prisma_1.prisma.freeAccountAssignment.findMany({ where: { isActive: true, account: { is: { status: "assigned" } } }, include: { account: true }, take: 500 });
        const due = assigned.filter((item) => {
            const assignedAt = item.assignedAt ?? item.createdAt;
            const expiresAt = item.expiresAt ?? freeAccountExpiresAt(assignedAt, item.account.durationDays);
            return expiresAt <= now;
        });
        if (!due.length) {
            logger_1.logger.info("Free test account expiration checked", { checked: assigned.length, expired: 0 });
            return { count: 0 };
        }
        const ids = due.map((item) => item.accountId);
        const [accountResult, assignmentResult] = await prisma_1.prisma.$transaction([
            prisma_1.prisma.freeAccount.updateMany({ where: { id: { in: ids }, status: "assigned" }, data: { status: "expired" } }),
            prisma_1.prisma.freeAccountAssignment.updateMany({ where: { accountId: { in: ids }, isActive: true }, data: { isActive: false } }),
        ]);
        logger_1.logger.info("Free test account expiration checked", { checked: assigned.length, expired: accountResult.count, deactivatedAssignments: assignmentResult.count });
        if (accountResult.count > 0)
            event_bus_service_1.eventBus.emit("free_account.expired", { count: accountResult.count });
        return accountResult;
    }
    static async assignedForUser(userId, onlyActive = false) {
        if (onlyActive)
            await this.expireDueAccounts();
        return prisma_1.prisma.freeAccountAssignment.findMany({ where: { userId, ...(onlyActive ? { isActive: true, account: { is: { status: "assigned" } } } : {}) }, include: { account: true }, orderBy: { createdAt: "desc" } });
    }
    static async getXrayConfig() {
        const config = await prisma_1.prisma.freeTestConfig.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton", enabled: false, trafficBytes: 0n, durationDays: 1, stockLimit: 0, usedCount: 0, inboundIds: [] } });
        return { ...config, available: Math.max(config.stockLimit - config.usedCount, 0) };
    }
    static async updateXrayConfig(data, actorId) {
        const current = await this.getXrayConfig();
        const enabledConfig = await xray_service_1.XrayPanelService.getEnabledConfig();
        const next = { ...current, ...data, trafficBytes: data.trafficGB !== undefined ? (0, xray_service_1.gbToBytes)(data.trafficGB) : current.trafficBytes, stockLimit: data.stockLimit ?? current.stockLimit, durationDays: data.durationDays ?? current.durationDays, inboundIds: data.inboundIds ?? current.inboundIds, limitIp: data.limitIp ?? current.limitIp };
        if (data.limitIp !== undefined && (!Number.isInteger(data.limitIp) || data.limitIp < 0))
            throw new FreeAccountError("INVALID_INPUT", "محدودیت IP معتبر نیست");
        let inboundSnapshot = data.inboundSnapshot ?? current.inboundSnapshot;
        if (data.enabled) {
            const reason = validateFreeTestActivation(next, Boolean(enabledConfig));
            if (reason)
                throw new FreeAccountError(reason.includes("پنل") ? "XRAY_UNAVAILABLE" : "INVALID_INPUT", reason === "ابتدا حداقل یک اینباند انتخاب کنید." ? "ابتدا حداقل یک اینباند را از بخش «🔗 انتخاب اینباندها» انتخاب کنید." : reason);
        }
        if (data.stockLimit !== undefined && data.stockLimit < current.usedCount)
            throw new FreeAccountError("INVALID_INPUT", "موجودی کل نمی‌تواند کمتر از تعداد مصرف‌شده باشد");
        if (data.inboundIds !== undefined) {
            const live = await xray_service_1.XrayClientService.listInbounds();
            const validated = validateFreeTestInboundSelection(live, data.inboundIds);
            inboundSnapshot = validated.inboundSnapshot;
            data.inboundIds = validated.inboundIds;
        }
        else if (data.enabled && next.inboundIds.length) {
            const live = await xray_service_1.XrayClientService.listInbounds();
            validateFreeTestInboundSelection(live, next.inboundIds);
        }
        const patch = { inboundSnapshot };
        if (data.enabled !== undefined)
            patch.enabled = data.enabled;
        if (data.trafficGB !== undefined)
            patch.trafficBytes = (0, xray_service_1.gbToBytes)(data.trafficGB);
        if (data.durationDays !== undefined)
            patch.durationDays = data.durationDays;
        if (data.stockLimit !== undefined)
            patch.stockLimit = data.stockLimit;
        if (data.inboundIds !== undefined)
            patch.inboundIds = data.inboundIds;
        if (data.limitIp !== undefined)
            patch.limitIp = data.limitIp;
        if (data.groupName !== undefined)
            patch.groupName = data.groupName || null;
        const saved = await prisma_1.prisma.freeTestConfig.update({ where: { id: "singleton" }, data: patch });
        await prisma_1.prisma.auditLog.create({ data: { actorId, action: "free_test_config.update", metadata: JSON.stringify({ fields: Object.keys(patch) }) } });
        return saved;
    }
    static async xrayEligibility(userId) {
        const now = new Date();
        const config = await this.getXrayConfig();
        const [user, last, active] = await Promise.all([
            prisma_1.prisma.user.findUnique({ where: { id: userId }, select: { isBanned: true } }),
            prisma_1.prisma.xrayClient.findFirst({ where: { userId, isFreeTest: true }, orderBy: { createdAt: "desc" } }),
            prisma_1.prisma.xrayClient.findFirst({ where: { userId, isFreeTest: true, status: { in: ["active", "provisioning", "creating"] }, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" } }),
        ]);
        const lastClaimAt = last?.createdAt;
        const nextAvailableAt = lastClaimAt ? new Date(lastClaimAt.getTime() + COOLDOWN_DAYS * DAY_MS) : undefined;
        const eligible = Boolean(config.enabled && !user?.isBanned && !active && (!nextAvailableAt || nextAvailableAt <= now) && config.available > 0);
        return { eligible, config, user, last, active, lastClaimAt, nextAvailableAt, available: config.available };
    }
    static async claimXray(userId) {
        const now = new Date();
        const cutoff = new Date(now.getTime() - COOLDOWN_DAYS * DAY_MS);
        let reserved;
        try {
            reserved = await prisma_1.prisma.$transaction(async (tx) => {
                const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, telegramId: true, isBanned: true } });
                if (!user || user.isBanned)
                    throw new FreeAccountError("USER_BLOCKED", "حساب شما مسدود است");
                const config = await tx.freeTestConfig.findUnique({ where: { id: "singleton" } });
                if (!config?.enabled)
                    throw new FreeAccountError("NO_INVENTORY", "اکانت تست فعال نیست");
                if (!config.inboundIds.length || config.trafficBytes <= 0n || config.durationDays <= 0 || config.stockLimit <= 0)
                    throw new FreeAccountError("INVALID_INPUT", "تنظیمات اکانت تست کامل نیست");
                const last = await tx.xrayClient.findFirst({ where: { userId, isFreeTest: true }, orderBy: { createdAt: "desc" } });
                if (last && last.createdAt > cutoff)
                    throw new FreeAccountError("COOLDOWN", "شما در ۳۰ روز گذشته اکانت تست دریافت کرده‌اید", { lastClaimAt: last.createdAt, nextAvailableAt: new Date(last.createdAt.getTime() + COOLDOWN_DAYS * DAY_MS) });
                const stock = await tx.freeTestConfig.updateMany({ where: { id: "singleton", enabled: true, usedCount: { lt: config.stockLimit } }, data: { usedCount: { increment: 1 } } });
                if (stock.count !== 1)
                    throw new FreeAccountError("NO_INVENTORY", "موجودی اکانت تست تکمیل شده است");
                const expiresAt = new Date(now.getTime() + config.durationDays * DAY_MS);
                const client = await tx.xrayClient.create({ data: { userId, telegramId: user.telegramId, isFreeTest: true, clientEmail: `pending-test-${user.telegramId}-${now.getTime()}`, inboundIds: config.inboundIds, limitIp: config.limitIp ?? 0, groupName: config.groupName, expiresAt, trafficBytes: config.trafficBytes, status: "provisioning" } });
                const email = `test-tg${user.telegramId}-${client.id.slice(-6)}`;
                const updated = await tx.xrayClient.update({ where: { id: client.id }, data: { clientEmail: email } });
                await tx.freeAccountUserLock.upsert({ where: { userId }, create: { userId, lastClaimAt: now, lastAssignmentId: client.id }, update: { lastClaimAt: now, lastAssignmentId: client.id } });
                return updated;
            });
            const live = await xray_service_1.XrayClientService.listInbounds();
            const valid = new Set(live.map((i) => i.id));
            if (reserved.inboundIds.some((id) => !valid.has(id)))
                throw new Error("اینباندهای اکانت تست در پنل معتبر نیستند");
            const created = await xray_service_1.XrayClientService.createClient({ email: reserved.clientEmail, trafficBytes: reserved.trafficBytes, expiresAt: reserved.expiresAt, telegramId: reserved.telegramId, inboundIds: reserved.inboundIds, limitIp: reserved.limitIp, groupName: reserved.groupName });
            return prisma_1.prisma.xrayClient.update({ where: { id: reserved.id }, data: { status: "active", clientSubId: created.subId, panelClientId: created.uuid ?? created.id, lastError: null } });
        }
        catch (error) {
            if (reserved?.id) {
                const message = error instanceof Error ? error.message : String(error);
                await prisma_1.prisma.xrayClient.update({ where: { id: reserved.id }, data: { status: "failed", lastError: message } });
                monitoring_service_1.MonitoringService.record({ type: "PAYMENT_DELIVERY_FAILED", section: "Free Test", description: message, userId, severity: "critical", suggestedAction: "اکانت تست رزروشده را در پنل بررسی و دستی بسازید.", metadata: { xrayClientId: reserved.id } });
            }
            throw error;
        }
    }
    static async getAccount(accountId) {
        return prisma_1.prisma.freeAccount.findUnique({ where: { id: accountId }, include: { assignment: { include: { user: true } } } });
    }
}
exports.FreeAccountService = FreeAccountService;
function registerFreeAccountEvents() {
    // Free test accounts are intentionally independent from referrals, products, categories, and reward tiers.
}
