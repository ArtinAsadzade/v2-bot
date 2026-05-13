import { Markup, Telegraf } from 'telegraf';
import { fa, toman } from '@v2bot/shared';
import { env } from '../../config/env.js';
import { prisma } from '../database/prisma.js';
import { UserService } from '../../modules/users/user.service.js';

const mainKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback(`🛍 ${fa.marketplace}`, 'marketplace'), Markup.button.callback(`🧾 ${fa.services}`, 'services')],
  [Markup.button.callback(`💳 ${fa.wallet}`, 'wallet'), Markup.button.callback(`👤 ${fa.profile}`, 'profile')],
  [Markup.button.callback(`🎧 ${fa.support}`, 'support')],
]);

const clean = (value?: string) => value?.replace(/[<>]/g, '').trim();

export const createBot = () => {
  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);
  const users = new UserService(prisma);

  bot.start(async (ctx) => {
    const payload = ctx.payload?.trim();
    const user = await users.ensureTelegramUser({
      telegramId: String(ctx.from.id),
      username: clean(ctx.from.username),
      firstName: clean(ctx.from.first_name),
      lastName: clean(ctx.from.last_name),
      refCode: payload || undefined,
    });

    await ctx.reply(
      `${fa.mainMenuTitle}\n\nکد دعوت شما: \`${user.referralCode}\`\nهمه چیز برای خرید امن و سریع آماده است.`,
      { parse_mode: 'Markdown', ...mainKeyboard },
    );
  });

  bot.action('wallet', async (ctx) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { telegramId: String(ctx.from.id) },
      include: { wallet: true },
    });
    await ctx.editMessageText(
      `💳 کیف پول\n\nموجودی فعلی: ${toman.format(Number(user.wallet?.balanceToman ?? 0))} تومان\n\nبرای شارژ، تیکت ارسال کنید یا از پرداخت رمزارزی استفاده کنید.`,
      Markup.inlineKeyboard([[Markup.button.callback(`↩️ ${fa.back}`, 'home')]]),
    );
  });

  bot.action('marketplace', async (ctx) => {
    const products = await prisma.product.findMany({ where: { status: 'ACTIVE' }, take: 8 });
    const rows = products.map((product) => [
      Markup.button.callback(`✨ ${product.name} · ${toman.format(Number(product.pricePerGb))} تومان/GB`, `product:${product.id}`),
    ]);
    await ctx.editMessageText('🛍 انتخاب سرویس\n\nیک پلن را انتخاب کنید؛ محاسبه قیمت در مرحله بعد انجام می‌شود.', {
      ...Markup.inlineKeyboard([...rows, [Markup.button.callback(`↩️ ${fa.back}`, 'home')]]),
    });
  });

  bot.action('home', async (ctx) => {
    await ctx.editMessageText(`${fa.mainMenuTitle}\n\nاز منوی زیر مسیرتان را انتخاب کنید.`, mainKeyboard);
  });

  return bot;
};
