import { Telegraf } from 'telegraf';

import { registerActions } from '../actions/action-registry.js';
import { botConfig } from '../config/env.js';
import { registerCommands } from '../commands/registry.js';
import { adminDetectionMiddleware } from '../middlewares/admin.js';
import { correlationMiddleware } from '../middlewares/correlation.js';
import { registerErrorHandler } from '../middlewares/error.js';
import { localeMiddleware } from '../middlewares/locale.js';
import { loggingMiddleware } from '../middlewares/logging.js';
import { rateLimitMiddleware } from '../middlewares/rate-limit.js';
import { sessionHydrationMiddleware } from '../middlewares/session-hydration.js';
import { userSyncMiddleware } from '../middlewares/user-sync.js';
import { responseMiddleware } from '../rendering/respond.js';
import { createStage } from '../scenes/registry.js';
import { createSessionMiddleware, type BotContext } from '../sessions/session.js';

export const createBot = (): Telegraf<BotContext> => {
  const bot = new Telegraf<BotContext>(botConfig.TELEGRAM_BOT_TOKEN);
  registerErrorHandler(bot);

  bot.use(createSessionMiddleware());
  bot.use(sessionHydrationMiddleware());
  bot.use(correlationMiddleware());
  bot.use(localeMiddleware());
  bot.use(responseMiddleware());
  bot.use(loggingMiddleware());
  bot.use(rateLimitMiddleware());
  bot.use(adminDetectionMiddleware());
  bot.use(userSyncMiddleware());
  bot.use(localeMiddleware());
  bot.use(createStage().middleware());

  registerCommands(bot);
  registerActions(bot);
  return bot;
};
