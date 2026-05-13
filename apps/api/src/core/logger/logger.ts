import pino from 'pino';

import { config } from '../../config/index.js';

export const logger = pino({
  level: config.logger.level,
  redact: ['req.headers.authorization', 'req.headers.cookie', 'telegram.botToken', '*.passwordHash'],
  transport: config.app.isDev ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } } : undefined,
});
