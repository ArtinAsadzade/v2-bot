import { financeRoutes } from '../modules/finance/routes/finance.routes.js';
import { healthRoutes } from '../modules/health/routes/health.routes.js';
import { telegramUserRoutes } from '../modules/telegram/routes/telegram-user.routes.js';
import { userRoutes } from '../modules/users/routes/user.routes.js';

import type { FastifyInstance } from 'fastify';

export const registerRoutes = async (app: FastifyInstance): Promise<void> => {
  await app.register(healthRoutes, { prefix: '/v1' });
  await app.register(userRoutes, { prefix: '/v1' });
  await app.register(telegramUserRoutes, { prefix: '/v1' });
  await app.register(financeRoutes, { prefix: '/v1' });
};
