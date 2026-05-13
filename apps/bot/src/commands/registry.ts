import { navigation } from '../navigation/navigation-manager.js';
import { welcomeTemplate } from '../templates/messages.js';

import type { BotContext } from '../sessions/session.js';
import type { Telegraf } from 'telegraf';

export type CommandRegistrar = (bot: Telegraf<BotContext>) => void;

const startCommand: CommandRegistrar = (bot) => {
  bot.start(async (ctx) => {
    const payload = ctx.message && 'text' in ctx.message ? ctx.message.text.split(/\s+/u)[1]?.trim() : undefined;
    if (payload && !ctx.session.flows.startPayload) {
      ctx.session.flows.startPayload = { name: 'referral', step: 'received', data: { code: payload }, expiresAt: Date.now() + 600_000, retries: 0 };
    }
    await ctx.reply(welcomeTemplate(ctx));
    await navigation.go(ctx, 'menu', undefined, false);
  });
};

const menuCommand: CommandRegistrar = (bot) => {
  bot.command('menu', async (ctx) => navigation.go(ctx, 'menu', undefined, false));
};

const profileCommand: CommandRegistrar = (bot) => {
  bot.command('profile', async (ctx) => navigation.go(ctx, 'profile', undefined, false));
};

export const commandRegistrars: CommandRegistrar[] = [startCommand, menuCommand, profileCommand];

export const registerCommands = (bot: Telegraf<BotContext>): void => {
  commandRegistrars.forEach((register) => register(bot));
};
