import { ok } from '@v2bot/shared';

import { NotFoundError, ValidationAppError } from '../../../core/errors/app-error.js';
import { PrismaUserRepository } from '../repositories/prisma-user.repository.js';
import { UserService } from '../services/user.service.js';
import { findUserByTelegramParamsSchema } from '../validators/user.validators.js';

import type { FastifyPluginAsync } from 'fastify';

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.get('/users/telegram/:telegramId', async (request) => {
    const parsed = findUserByTelegramParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    const service = new UserService(new PrismaUserRepository(app.prisma));
    const user = await service.findByTelegramId(parsed.data.telegramId);
    if (!user) throw new NotFoundError('User');
    return ok(user);
  });
};
