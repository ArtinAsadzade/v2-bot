import { Markup } from 'telegraf';

import { buildCallbackData } from '../callbacks/callback-data.js';

import type { InlineKeyboardMarkup } from 'telegraf/types';

type Button = ReturnType<typeof Markup.button.callback> | ReturnType<typeof Markup.button.url>;

export class InlineKeyboardBuilder {
  private rows: Button[][] = [];

  public row(...buttons: Button[]): this {
    this.rows.push(buttons);
    return this;
  }

  public button(text: string, namespace: Parameters<typeof buildCallbackData>[0], action: string, value?: string): Button {
    return Markup.button.callback(text, buildCallbackData(namespace, action, value));
  }

  public url(text: string, url: string): Button {
    return Markup.button.url(text, url);
  }

  public back(text: string, fallback = 'menu'): Button {
    return this.button(text, 'nav', 'back', fallback);
  }

  public home(text: string): Button {
    return this.button(text, 'nav', 'menu');
  }

  public build(): InlineKeyboardMarkup {
    return Markup.inlineKeyboard(this.rows).reply_markup;
  }
}

export const keyboard = (): InlineKeyboardBuilder => new InlineKeyboardBuilder();
