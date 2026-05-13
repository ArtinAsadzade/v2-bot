import { ok } from '@v2bot/shared';

import { HealthService } from '../services/health.service.js';

import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ok(await new HealthService(app.prisma, app.redis).check()));
  app.get('/ready', async () => ok({ status: 'ready' }));
};
