import type { AppBot } from "../../../../types/bot";
import { renderPanel, callbackFor, actionFor } from "../../../navigation/panel-ui";
import { DepositService } from "../../../../modules/deposit/deposit.service";
import { AdminService } from "../../../../modules/admin/admin.service";
import { isAdminByTelegramId } from "../../../middlewares/admin.middleware";
import { adminDangerConfirmKeyboard } from "../../../keyboards/admin-danger.keyboard";
import { adminDangerConfirmMessage } from "../../../messages/admin.messages";

export function registerAdminPaymentsHandlers(bot: AppBot) {
  bot.action(/^admin:wallet:status:([^:]+):(active|inactive)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await AdminService.setCryptoWalletStatus(ctx.match[1], ctx.match[2] as "active" | "inactive", String(ctx.from.id));
    await renderPanel(ctx, { id: "admin.wallet", params: { walletId: ctx.match[1] } }, "replace");
  });

  bot.action(/^admin:wallet:delete:confirm:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    await ctx.reply(
      adminDangerConfirmMessage({ action: "حذف کیف پول", item: ctx.match[1], note: "اگر پرداخت فعال داشته باشد حذف انجام نمی‌شود." }),
      adminDangerConfirmKeyboard(actionFor("admin:wallet:delete:force", ctx.match[1]), callbackFor("admin.wallet", { walletId: ctx.match[1] })),
    );
  });

  bot.action(/^admin:wallet:delete:force:([^:]+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    try {
      await AdminService.deleteCryptoWallet(ctx.match[1], String(ctx.from.id));
      await renderPanel(ctx, { id: "admin.wallets" }, "replace");
    } catch (error) {
      await ctx.reply(error instanceof Error ? `⚠️ ${error.message}` : "⚠️ حذف کیف پول ناموفق بود.");
      await renderPanel(ctx, { id: "admin.wallet", params: { walletId: ctx.match[1] } }, "replace");
    }
  });

  bot.action(/^admin:deposit:(approve|reject):(.+)$/, async (ctx) => {
    if (!ctx.from || !(await isAdminByTelegramId(ctx.from.id))) return ctx.answerCbQuery("دسترسی غیرمجاز");
    await ctx.answerCbQuery();
    try {
      if (ctx.match[1] === "approve") await DepositService.approve(ctx.match[2], String(ctx.from.id));
      else await DepositService.reject(ctx.match[2], String(ctx.from.id));
    } catch (error) {
      await ctx.answerCbQuery(error instanceof Error ? error.message : "عملیات ناموفق بود");
    }
    await renderPanel(ctx, { id: "admin.deposits" }, "replace");
  });
}
