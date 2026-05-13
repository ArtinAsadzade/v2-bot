import type { BotContext } from '../sessions/session.js';
import type { Telegraf } from 'telegraf';

export type CommandRegistrar = (bot: Telegraf<BotContext>) => void;

export const commandRegistrars: CommandRegistrar[] = [];

export const registerCommands = (bot: Telegraf<BotContext>): void => {
  commandRegistrars.forEach((register) => register(bot));
};
