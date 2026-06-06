"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdmin = exports.adminOnly = void 0;
exports.isAdminByTelegramId = isAdminByTelegramId;
const prisma_1 = require("../../services/prisma");
function envAdminIds() {
    return (process.env.ADMIN_IDS ?? process.env.ADMINS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
}
async function isAdminByTelegramId(telegramId) {
    const normalizedId = String(telegramId);
    if (envAdminIds().includes(normalizedId))
        return true;
    const user = await prisma_1.prisma.user.findUnique({ where: { telegramId: normalizedId }, select: { role: true } });
    return user?.role === "admin" || user?.role === "superadmin";
}
const adminOnly = async (ctx, next) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) {
        await ctx.answerCbQuery?.("دسترسی غیرمجاز").catch(() => undefined);
        return;
    }
    return next();
};
exports.adminOnly = adminOnly;
exports.isAdmin = isAdminByTelegramId;
