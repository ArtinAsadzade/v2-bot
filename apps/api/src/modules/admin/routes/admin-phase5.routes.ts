import { ok } from '@v2bot/shared';
import { z } from 'zod';

import { ValidationAppError } from '../../../core/errors/app-error.js';
import { AnalyticsService } from '../../analytics/services/analytics.service.js';
import { NotificationService } from '../../notifications/services/notification.service.js';
import { ReferralService } from '../../referrals/services/referral.service.js';
import { TicketService } from '../../support/services/ticket.service.js';
import { config } from '../../../config/index.js';

import type { FastifyPluginAsync } from 'fastify';

const broadcastSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
  title: z.string().min(1).max(180),
  body: z.string().min(1).max(2000),
  idempotencyKey: z.string().min(8).max(160),
});

export const adminPhase5Routes: FastifyPluginAsync = async (app) => {
  app.post('/admin/notifications/broadcast', async (request) => {
    const parsed = broadcastSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    const service = new NotificationService(app.prisma);
    const results = [];
    for (const userId of parsed.data.userIds) {
      const n = await service.schedule({
        userId,
        type: 'ADMIN_BROADCAST',
        templateKey: 'system_announcement',
        deduplicationKey: `${parsed.data.idempotencyKey}:${userId}`,
        variables: { title: parsed.data.title, body: parsed.data.body },
      });
      results.push(n.id);
    }
    return ok({ scheduled: results.length, notificationIds: results });
  });

  app.get('/admin/analytics/daily', async (request) => {
    const query = z.object({ date: z.string().optional() }).safeParse(request.query);
    const date = query.success && query.data.date ? new Date(query.data.date) : new Date();
    const rows = await new AnalyticsService(app.prisma).getDaily(date);
    return ok(rows);
  });

  app.get('/admin/referrals/:userId', async (request) => {
    const params = z.object({ userId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) throw new ValidationAppError(params.error.flatten());
    const stats = await new ReferralService(app.prisma).getStats(
      params.data.userId,
      config.telegram.botUsername,
    );
    return ok(stats);
  });

  app.get('/admin/tickets', async (request) => {
    const query = z
      .object({ status: z.string().optional(), limit: z.coerce.number().default(50) })
      .safeParse(request.query);
    const tickets = await app.prisma.supportTicket.findMany({
      where: {
        deletedAt: null,
        ...(query.success && query.data.status
          ? { status: query.data.status as never }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.success ? query.data.limit : 50,
    });
    return ok(tickets);
  });

  app.post('/admin/tickets/:ticketId/reply', async (request) => {
    const params = z.object({ ticketId: z.string().uuid() }).safeParse(request.params);
    const body = z
      .object({ adminId: z.string().uuid(), message: z.string().min(1).max(4000) })
      .safeParse(request.body);
    if (!params.success || !body.success) throw new ValidationAppError(body.error?.flatten());
    const message = await new TicketService(app.prisma).reply({
      ticketId: params.data.ticketId,
      authorId: body.data.adminId,
      body: body.data.message,
      isAdmin: true,
    });
    return ok({ id: message.id });
  });

  app.get('/admin/notifications/monitor', async (request) => {
    const query = z.object({ limit: z.coerce.number().default(100) }).safeParse(request.query);
    const rows = await app.prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: query.success ? query.data.limit : 100,
      select: {
        id: true,
        userId: true,
        type: true,
        status: true,
        channel: true,
        createdAt: true,
        sentAt: true,
      },
    });
    return ok(rows);
  });
};
