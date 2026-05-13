import { ok } from '@v2bot/shared';

import { parseRequestBody } from '../../../core/validation/zod.js';
import { TelegramUserService } from '../services/telegram-user.service.js';
import { telegramUserSyncBodySchema } from '../validators/telegram-user.validators.js';

import type { FastifyPluginAsync } from 'fastify';

export const telegramUserRoutes: FastifyPluginAsync = async (app) => {
  app.post('/telegram/users/sync', async (request) => {
    const body = parseRequestBody(telegramUserSyncBodySchema, request);
    const service = new TelegramUserService(app.prisma);
    return ok(await service.sync(body));
  });
};
