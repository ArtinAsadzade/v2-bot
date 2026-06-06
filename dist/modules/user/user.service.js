"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const prisma_1 = require("../../services/prisma");
class UserService {
    static async findOrCreateUser(ctx) {
        const tgUser = ctx.from;
        let user = await prisma_1.prisma.user.findUnique({
            where: { telegramId: String(tgUser.id) },
        });
        if (!user) {
            user = await prisma_1.prisma.user.create({
                data: {
                    telegramId: String(tgUser.id),
                    username: tgUser.username,
                    firstName: tgUser.first_name,
                    lastName: tgUser.last_name,
                },
            });
        }
        return user;
    }
}
exports.UserService = UserService;
