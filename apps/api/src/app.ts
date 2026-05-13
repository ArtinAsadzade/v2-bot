import { randomUUID } from 'node:crypto';

import fastify from 'fastify';

import { logger } from './core/logger/logger.js';
import { correlationIdPlugin } from './plugins/correlation-id.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { prismaPlugin } from './plugins/prisma.js';
import { redisPlugin } from './plugins/redis.js';
import { securityPlugin } from './plugins/security.js';
import { registerRoutes } from './routes/register-routes.js';

export const buildApp = async () => {
  const app = fastify({
    loggerInstance: logger,
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
