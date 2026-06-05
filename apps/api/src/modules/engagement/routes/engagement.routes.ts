import { ok } from '@v2bot/shared';

import { ValidationAppError } from '../../../core/errors/app-error.js';
import { EngagementService } from '../services/engagement.service.js';
import { z } from 'zod';

import type { FastifyPluginAsync } from 'fastify';

const userIdParamsSchema = z.object({ userId: z.string().uuid() });

export const engagementRoutes: FastifyPluginAsync = async (app) => {
  app.post('/engagement/:userId/login', async (request) => {
    const parsed = userIdParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    await new EngagementService(app.prisma).recordDailyLogin(parsed.data.userId);
    const profile = await new EngagementService(app.prisma).getProfile(parsed.data.userId);
    return ok(profile);
  });

  app.get('/engagement/:userId', async (request) => {
    const parsed = userIdParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    const profile = await new EngagementService(app.prisma).getProfile(parsed.data.userId);
    return ok(profile);
  });
};
