import { randomUUID } from 'node:crypto';

import fastify from 'fastify';

import { config } from './config/index.js';
import { correlationIdPlugin } from './plugins/correlation-id.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { prismaPlugin } from './plugins/prisma.js';
import { redisPlugin } from './plugins/redis.js';
import { securityPlugin } from './plugins/security.js';
import { registerRoutes } from './routes/register-routes.js';

export const buildApp = async () => {
  const app = fastify({
    logger: {
      level: config.logger.level,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'telegram.botToken', '*.passwordHash'],
      ...(config.app.isDev
        ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } } }
        : {}),
    },
    genReqId: (request) => String(request.headers['x-request-id'] ?? randomUUID()),
  });

  await app.register(errorHandlerPlugin);
  await app.register(correlationIdPlugin);
  await app.register(securityPlugin);
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await registerRoutes(app);

  return app;
};
