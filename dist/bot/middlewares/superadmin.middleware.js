"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSuperAdmin = isSuperAdmin;
const prisma_1 = require("../../services/prisma");
async function isSuperAdmin(telegramId) {
    const user = await prisma_1.prisma.user.findUnique({ where: { telegramId: String(telegramId) }, select: { role: true } });
    return user?.role === "superadmin";
}
