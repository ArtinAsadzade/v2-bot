import { bot } from "../../bot";
import { prisma } from "../../../services/prisma";
import { WalletService } from "../../../modules/wallet/wallet.service";

const ADMINS = ["123456789"];

bot.action(/approve_dep_(.+)/, async (ctx) => {
  if (!ADMINS.includes(String(ctx.from?.id))) return;

  const depositId = ctx.match[1];

  const deposit = await prisma.deposit.findUnique({
    where: { id: depositId },
  });

  if (!deposit || deposit.status !== "submitted") return;

  await WalletService.credit(deposit.userId, deposit.amount, "Crypto Deposit");

  await prisma.deposit.update({
    where: { id: depositId },
    data: { status: "approved" },
  });

  await ctx.reply("✅ شارژ تایید شد");
});
