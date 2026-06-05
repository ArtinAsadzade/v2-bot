import { defaultSession } from '../sessions/session.js';

import type { BotContext } from '../sessions/session.js';
import type { MiddlewareFn } from 'telegraf';

export const sessionHydrationMiddleware = (): MiddlewareFn<BotContext> => async (ctx, next) => {
  const defaults = defaultSession();
  ctx.session.locale ??= defaults.locale;
  ctx.session.navigation ??= defaults.navigation;
  ctx.session.navigation.stack ??= [];
  ctx.session.flows ??= defaults.flows;
  ctx.session.settings ??= defaults.settings;
  ctx.session.__scenes ??= { cursor: 0 };
  await next();
};
