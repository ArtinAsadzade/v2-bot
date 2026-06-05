import { ok } from '@v2bot/shared';

import { ValidationAppError } from '../../../core/errors/app-error.js';
import { config } from '../../../config/index.js';
import { ReferralService } from '../services/referral.service.js';
import { userIdParamsSchema } from '../validators/referral.validators.js';

import type { FastifyPluginAsync } from 'fastify';

export const referralRoutes: FastifyPluginAsync = async (app) => {
  app.get('/referrals/:userId/stats', async (request) => {
    const parsed = userIdParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    const stats = await new ReferralService(app.prisma).getStats(
      parsed.data.userId,
      config.telegram.botUsername,
    );
    return ok(stats);
  });
};
