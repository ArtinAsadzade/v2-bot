import { ok } from '@v2bot/shared';
import { z } from 'zod';

import { ValidationAppError } from '../../../core/errors/app-error.js';
import { NotificationService } from '../services/notification.service.js';

import type { FastifyPluginAsync } from 'fastify';

const userIdParamsSchema = z.object({ userId: z.string().uuid() });

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/notifications/:userId', async (request) => {
    const parsed = userIdParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    const rows = await new NotificationService(app.prisma).listForUser(parsed.data.userId);
    return ok(
      rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        status: n.status,
        sentAt: n.sentAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    );
  });
};
