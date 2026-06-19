import type { AppContext } from "../../../../types/bot";
import { isAdminByTelegramId } from "../../../middlewares/admin.middleware";

export async function requireAdmin(ctx: AppContext, unauthorizedText = "دسترسی غیرمجاز") {
  if (ctx.from && (await isAdminByTelegramId(ctx.from.id))) return true;
  await ctx.answerCbQuery(unauthorizedText).catch(() => undefined);
  return false;
}
