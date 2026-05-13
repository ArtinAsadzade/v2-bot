import { session } from 'telegraf';

import type { Context, MiddlewareFn, SessionStore } from 'telegraf';

export type BotSession = {
  correlationId?: string;
  sceneState?: Record<string, unknown>;
};

export type BotContext = Context & { session: BotSession };

export const createSessionMiddleware = (): MiddlewareFn<BotContext> =>
  session({ defaultSession: () => ({}) }) as MiddlewareFn<BotContext>;

export type ExternalSessionStore = SessionStore<BotSession>;
