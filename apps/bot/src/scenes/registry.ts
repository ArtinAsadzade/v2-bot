import { Scenes } from 'telegraf';

import type { BotContext } from '../sessions/session.js';

export const createStage = (): Scenes.Stage<BotContext> => new Scenes.Stage<BotContext>([]);
