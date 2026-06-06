import type { MiddlewareFn } from "telegraf";
import { prisma } from "../../services/prisma";
import type { AppContext } from "../../types/bot";

function envAdminIds() {
  return (process.env.ADMIN_IDS ?? process.env.ADMINS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function isAdminByTelegramId(telegramId: string | number) {
  const normalizedId = String(telegramId);
  if (envAdminIds().includes(normalizedId)) return true;

  const user = await prisma.user.findUnique({ where: { telegramId: normalizedId }, select: { role: true } });
  return user?.role === "admin" || user?.role === "superadmin";
}

export const adminOnly: MiddlewareFn<AppContext> = async (ctx, next) => {
  if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) {
    await ctx.answerCbQuery?.("دسترسی غیرمجاز").catch(() => undefined);
    return;
  }
  return next();
};

export const isAdmin = isAdminByTelegramId;
