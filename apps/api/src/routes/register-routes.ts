import { healthRoutes } from '../modules/health/routes/health.routes.js';
import { userRoutes } from '../modules/users/routes/user.routes.js';

import type { FastifyInstance } from 'fastify';

export const registerRoutes = async (app: FastifyInstance): Promise<void> => {
  await app.register(healthRoutes, { prefix: '/v1' });
  await app.register(userRoutes, { prefix: '/v1' });
};
