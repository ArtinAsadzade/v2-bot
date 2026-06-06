import { Markup } from "telegraf";
import type { AppBot } from "../../../types/bot";
import { DepositService, type DepositCurrency } from "../../../modules/deposit/deposit.service";
import { UserService } from "../../../modules/user/user.service";
import { navigationKeyboard } from "../../keyboards/main.keyboard";

export function registerDepositHandlers(bot: AppBot) {
  bot.action("deposit", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.state = { name: "deposit_amount" };
    await ctx.reply("💰 مبلغ شارژ را به تومان وارد کنید:", navigationKeyboard());
  });

  bot.action(/^dep:(usdt|btc):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const currency = ctx.match[1] as DepositCurrency;
    const amount = Number(ctx.match[2]);
    const user = await UserService.findOrCreateUser(ctx);
    const deposit = await DepositService.createDeposit(user.id, amount, currency);
    ctx.session.state = { name: "deposit_receipt", depositId: deposit.id };

    await ctx.reply(
      `💰 درخواست شارژ ایجاد شد\n\n💵 مبلغ: ${amount.toLocaleString("fa-IR")} تومان\n💱 ارز: ${currency.toUpperCase()}\n\n📥 آدرس پرداخت:\n${deposit.wallet}\n\n⏳ مهلت پرداخت: ۳۰ دقیقه\n📤 پس از پرداخت، تصویر رسید را همینجا ارسال کنید.`,
      navigationKeyboard(),
    );
  });

  bot.on("photo", async (ctx, next) => {
    if (ctx.session.state?.name !== "deposit_receipt") return next();
    const user = await UserService.findOrCreateUser(ctx);
    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1]?.file_id;
    if (!fileId) {
      await ctx.reply("رسید معتبر نیست. لطفا تصویر رسید را ارسال کنید.");
      return;
    }

    try {
      await DepositService.submitReceipt(ctx.session.state.depositId, user.id, fileId);
      ctx.session.state = undefined;
      await ctx.reply("⏳ رسید شما ثبت شد و در انتظار تایید ادمین است.", navigationKeyboard());
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : "ثبت رسید ناموفق بود"}`, navigationKeyboard());
    }
  });
}

export function currencyKeyboard(amount: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("USDT (TRC20)", `dep:usdt:${amount}`)],
    [Markup.button.callback("BTC", `dep:btc:${amount}`)],
    [Markup.button.callback("⬅️ بازگشت", "deposit"), Markup.button.callback("❌ لغو", "cancel")],
  ]);
}
