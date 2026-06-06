import type { AppContext } from "../../../types/bot";
import { isAdminByTelegramId } from "../../middlewares/admin.middleware";

export async function requireAdmin(ctx: AppContext): Promise<boolean> {
  if (!ctx.from) return false;

  const ok = await isAdminByTelegramId(ctx.from.id);
  if (!ok) {
    await ctx.answerCbQuery?.("Unauthorized").catch(() => undefined);
    return false;
  }

  return true;
}
