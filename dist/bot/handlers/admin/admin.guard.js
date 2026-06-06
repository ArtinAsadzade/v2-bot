"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = requireAdmin;
const admin_middleware_1 = require("../../middlewares/admin.middleware");
async function requireAdmin(ctx) {
    if (!ctx.from)
        return false;
    const ok = await (0, admin_middleware_1.isAdminByTelegramId)(ctx.from.id);
    if (!ok) {
        await ctx.answerCbQuery?.("Unauthorized").catch(() => undefined);
        return false;
    }
    return true;
}
