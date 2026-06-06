import { isAdminByTelegramId } from "../middlewares/admin.middleware";

export async function requireAdmin(ctx: any) {
  if (!ctx.from) return false;

  const ok = await isAdminByTelegramId(ctx.from.id);
  if (!ok) {
    await ctx.answerCbQuery?.("Unauthorized").catch(() => {});
    return false;
  }

  return true;
}
