import { Markup } from "telegraf";
import type { AppBot } from "../../../types/bot";
import { CryptoWalletService, DepositService, FinancialSettingsService } from "../../../modules/deposit/deposit.service";
import { UserService } from "../../../modules/user/user.service";
import { navigationKeyboard } from "../../keyboards/main.keyboard";

export function registerDepositHandlers(bot: AppBot) {
  bot.action("deposit", async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.state = { name: "deposit_amount" };
    const setting = await FinancialSettingsService.get();
    await ctx.reply(`💰 مبلغ شارژ را به تومان وارد کنید:\n\nحداقل شارژ: ${setting.minimumTopupAmount.toLocaleString("fa-IR")} تومان`, navigationKeyboard());
  });

  bot.action(/^dep:wallet:([^:]+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const walletId = ctx.match[1];
    const amount = Number(ctx.match[2]);
    const user = await UserService.findOrCreateUser(ctx);
    try {
      const quote = await CryptoWalletService.quote(walletId, amount);
      const deposit = await DepositService.createDeposit(user.id, amount, walletId);
      ctx.session.state = { name: "deposit_receipt", depositId: deposit.id };
      await ctx.reply(
        `💰 درخواست شارژ ایجاد شد\n\nمبلغ شارژ:\n${amount.toLocaleString("fa-IR")} تومان\n\nرمز ارز:\n${quote.wallet.coinName}\n\nشبکه:\n${quote.wallet.networkName}\n\nنرخ:\n${quote.exchangeRate.toLocaleString("fa-IR")} تومان\n\nمبلغ قابل پرداخت:\n${quote.cryptoAmount.toLocaleString("fa-IR", { maximumFractionDigits: 8 })} ${quote.wallet.coinName}\n\nآدرس کیف پول:\n${quote.wallet.walletAddress}\n\n⏳ مهلت پرداخت: ۳۰ دقیقه\n📤 پس از پرداخت، تصویر رسید را همینجا ارسال کنید.`,
        navigationKeyboard(),
      );
    } catch (error) {
      await ctx.reply(`❌ ${error instanceof Error ? error.message : "ایجاد درخواست شارژ ناموفق بود"}`, navigationKeyboard());
    }
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

export async function currencyKeyboard(amount: number) {
  const wallets = await CryptoWalletService.listActive();
  return Markup.inlineKeyboard([
    ...wallets.map((wallet) => [Markup.button.callback(`${wallet.coinName} ${wallet.networkName}`, `dep:wallet:${wallet.id}:${amount}`)]),
    [Markup.button.callback("⬅️ بازگشت", "deposit"), Markup.button.callback("❌ لغو", "cancel")],
  ]);
}
