"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdmin = isAdmin;
const prisma_1 = require("../services/prisma");
async function isAdmin(telegramId) {
    const user = await prisma_1.prisma.user.findUnique({
        where: {
            telegramId,
        },
    });
    return user?.role === "admin" || user?.role === "superadmin";
}
