import pino from 'pino';

import { config } from '../../config/index.js';

export const logger = pino({
  level: config.logger.level,
  redact: ['req.headers.authorization', 'req.headers.cookie', 'telegram.botToken', '*.passwordHash'],
  ...(config.app.isDev
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } } }
    : {}),
});
