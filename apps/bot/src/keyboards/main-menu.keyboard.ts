import { keyboard } from './inline-keyboard.js';

import type { BotContext } from '../sessions/session.js';
import type { InlineKeyboardMarkup } from 'telegraf/types';

export const mainMenuKeyboard = (ctx: BotContext): InlineKeyboardMarkup =>
  keyboard()
    .row(keyboard().button(ctx.t('menu.buy'), 'nav', 'buy'), keyboard().button(ctx.t('menu.services'), 'nav', 'services'))
    .row(keyboard().button(ctx.t('menu.wallet'), 'nav', 'wallet'), keyboard().button(ctx.t('menu.profile'), 'nav', 'profile'))
    .row(keyboard().button(ctx.t('menu.referral'), 'nav', 'referral'))
    .row(keyboard().button(ctx.t('menu.support'), 'nav', 'support'), keyboard().button(ctx.t('menu.settings'), 'nav', 'settings'))
    .build();

export const backHomeKeyboard = (ctx: BotContext): InlineKeyboardMarkup =>
  keyboard().row(keyboard().back(ctx.t('common.back')), keyboard().home(ctx.t('common.home'))).build();
