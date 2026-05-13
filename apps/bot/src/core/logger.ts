import pino from 'pino';

import { botConfig } from '../config/env.js';

export const logger = pino({ level: botConfig.LOG_LEVEL, redact: ['TELEGRAM_BOT_TOKEN'] });
