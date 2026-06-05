import { Redis } from 'ioredis';
import { Scenes, session } from 'telegraf';

import { botConfig } from '../config/env.js';

import type { Context, MiddlewareFn } from 'telegraf';
import type { AsyncSessionStore } from 'telegraf/session';

export type LocaleCode = 'fa' | 'en';

export type NavigationEntry = {
  screen: string;
  params?: Record<string, string>;
  messageId?: number;
  enteredAt: number;
};

export type FlowState = {
  name: string;
  step: string;
  data: Record<string, unknown>;
  expiresAt: number;
  retries: number;
};

export interface BotSceneSessionData extends Scenes.WizardSessionData {
  expiresAt?: number;
  retries?: number;
}

export type BotSession = {
  correlationId?: string;
  locale: LocaleCode;
  isAdmin?: boolean;
  user?: {
    id: string;
    telegramId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    language: LocaleCode;
    referralCode: string;
    referralCount: number;
    createdAt: string;
  };
  navigation: {
    stack: NavigationEntry[];
    current?: NavigationEntry;
    rootMessageId?: number;
  };
  flows: Record<string, FlowState>;
  settings: {
    language: LocaleCode;
    notifications: boolean;
    preferredProtocol?: string;
    compactUi: boolean;
  };
};

export interface BotContext extends Context {
  session: BotSession & Scenes.SceneSession<BotSceneSessionData>;
  scene: Scenes.SceneContextScene<BotContext, BotSceneSessionData>;
  wizard: Scenes.WizardContextWizard<BotContext>;
  locale: LocaleCode;
  t: (key: string, params?: Record<string, string | number | undefined>) => string;
  replyOrEdit: (text: string, extra?: Record<string, unknown>) => Promise<unknown>;
}

export const defaultSession = (): BotSession & Scenes.SceneSession<BotSceneSessionData> => ({
  locale: 'fa',
  navigation: { stack: [] },
  flows: {},
  settings: { language: 'fa', notifications: true, compactUi: false },
  __scenes: { cursor: 0 },
});

class RedisSessionStore implements AsyncSessionStore<BotSession & Scenes.SceneSession<BotSceneSessionData>> {
  public constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
  ) {}

  public async get(key: string): Promise<(BotSession & Scenes.SceneSession<BotSceneSessionData>) | undefined> {
    const raw = await this.redis.get(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as BotSession & Scenes.SceneSession<BotSceneSessionData>;
  }

  public async set(key: string, value: BotSession & Scenes.SceneSession<BotSceneSessionData>): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', this.ttlSeconds);
  }

  public async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

export const createSessionStore = (): AsyncSessionStore<BotSession & Scenes.SceneSession<BotSceneSessionData>> => {
  const redis = new Redis(botConfig.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 3 });
  return new RedisSessionStore(redis, botConfig.SESSION_TTL_SECONDS);
};

export const createSessionMiddleware = (): MiddlewareFn<BotContext> =>
  session({ store: createSessionStore(), defaultSession }) as MiddlewareFn<BotContext>;

export const updateSession = (ctx: BotContext, updater: (session: BotContext['session']) => void): void => {
  updater(ctx.session);
};

export type ExternalSessionStore = AsyncSessionStore<BotSession & Scenes.SceneSession<BotSceneSessionData>>;
