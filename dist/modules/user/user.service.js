"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const prisma_1 = require("../../services/prisma");
const event_bus_service_1 = require("../../services/event-bus.service");
const referral_service_1 = require("../referral/referral.service");
class UserService {
    static async findOrCreateUser(ctxOrUser) {
        const tgUser = "id" in ctxOrUser ? ctxOrUser : ctxOrUser.from;
        if (!tgUser?.id)
            throw new Error("Telegram user is missing from context");
        const existing = await prisma_1.prisma.user.findUnique({ where: { telegramId: String(tgUser.id) } });
        const user = existing
            ? await prisma_1.prisma.user.update({ where: { id: existing.id }, data: { username: tgUser.username ?? null, firstName: tgUser.first_name ?? null, lastName: tgUser.last_name ?? null } })
            : await prisma_1.prisma.user.create({ data: { telegramId: String(tgUser.id), username: tgUser.username ?? null, firstName: tgUser.first_name ?? null, lastName: tgUser.last_name ?? null, referralCode: `ref${tgUser.id}` } });
        if (!existing)
            event_bus_service_1.eventBus.emit("user.created", { userId: user.id, telegramId: user.telegramId, referralCode: user.referralCode });
        if (!user.referralCode)
            await referral_service_1.ReferralService.ensureReferralCode(user.id, user.telegramId);
        return user;
    }
    static async getByTelegramId(telegramId) {
        return prisma_1.prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
    }
}
exports.UserService = UserService;
