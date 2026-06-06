"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const prisma_1 = require("../../services/prisma");
class UserService {
    static async findOrCreateUser(ctxOrUser) {
        const tgUser = "id" in ctxOrUser ? ctxOrUser : ctxOrUser.from;
        if (!tgUser?.id) {
            throw new Error("Telegram user is missing from context");
        }
        return prisma_1.prisma.user.upsert({
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
            },
        });
    }
    static async getByTelegramId(telegramId) {
        return prisma_1.prisma.user.findUnique({ where: { telegramId: String(telegramId) } });
    }
}
exports.UserService = UserService;
