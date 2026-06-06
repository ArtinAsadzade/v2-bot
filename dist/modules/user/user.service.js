"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const prisma_1 = require("../../services/prisma");
const referral_service_1 = require("../referral/referral.service");
class UserService {
    static async findOrCreateUser(ctxOrUser) {
        const tgUser = "id" in ctxOrUser ? ctxOrUser : ctxOrUser.from;
        if (!tgUser?.id) {
            throw new Error("Telegram user is missing from context");
        }
        const user = await prisma_1.prisma.user.upsert({
            where: { telegramId: String(tgUser.id) },
            update: {
                username: tgUser.username ?? null,
                firstName: tgUser.first_name ?? null,
                lastName: tgUser.last_name ?? null,
            },
            create: {
                telegramId: String(tgUser.id),
                username: tgUser.username ?? null,
                firstName: tgUser.first_name ?? null,
                lastName: tgUser.last_name ?? null,
                referralCode: `ref${tgUser.id}`,
            },
        });
        if (!user.referralCode) {
            await referral_service_1.ReferralService.ensureReferralCode(user.id, user.telegramId);
        }
        return user;
    }
    static async getByTelegramId(telegramId) {
        return prisma_1.prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
    }
}
exports.UserService = UserService;
