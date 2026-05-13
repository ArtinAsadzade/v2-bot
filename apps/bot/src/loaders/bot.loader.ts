import { Telegraf } from 'telegraf';

import { botConfig } from '../config/env.js';
import { registerCommands } from '../commands/registry.js';
import { correlationMiddleware } from '../middlewares/correlation.js';
import { createStage } from '../scenes/registry.js';
import { createSessionMiddleware, type BotContext } from '../sessions/session.js';

export const createBot = (): Telegraf<BotContext> => {
  const bot = new Telegraf<BotContext>(botConfig.TELEGRAM_BOT_TOKEN);
  bot.use(createSessionMiddleware());
  bot.use(correlationMiddleware());
  bot.use(createStage().middleware());
  registerCommands(bot);
  return bot;
};
