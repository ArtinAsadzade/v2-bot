import { ok } from '@v2bot/shared';
import { z } from 'zod';

import { ValidationAppError } from '../../../core/errors/app-error.js';
import { TicketService } from '../services/ticket.service.js';
import {
  createTicketSchema,
  replyTicketSchema,
  ticketIdParamsSchema,
  userIdParamsSchema,
} from '../validators/ticket.validators.js';

import type { FastifyPluginAsync } from 'fastify';

export const ticketRoutes: FastifyPluginAsync = async (app) => {
  app.post('/tickets', async (request) => {
    const parsed = createTicketSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    const ticket = await new TicketService(app.prisma).create(parsed.data);
    return ok({
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      category: ticket.category,
      createdAt: ticket.createdAt.toISOString(),
    });
  });

  app.get('/tickets/user/:userId', async (request) => {
    const parsed = userIdParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new ValidationAppError(parsed.error.flatten());
    const tickets = await new TicketService(app.prisma).listForUser(parsed.data.userId);
    return ok(
      tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        category: t.category,
        updatedAt: t.updatedAt.toISOString(),
      })),
    );
  });

  app.get('/tickets/:ticketId', async (request) => {
    const params = ticketIdParamsSchema.safeParse(request.params);
    const query = zUserIdQuery.safeParse(request.query);
    if (!params.success) throw new ValidationAppError(params.error.flatten());
    const thread = await new TicketService(app.prisma).getThread(
      params.data.ticketId,
      query.success ? query.data.userId : undefined,
    );
    return ok({
      id: thread.id,
      subject: thread.subject,
      status: thread.status,
      category: thread.category,
      messages: thread.messages.map((m) => ({
        id: m.id,
        authorId: m.authorId,
        isAdmin: m.isAdmin,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  });

  app.post('/tickets/:ticketId/reply', async (request) => {
    const params = ticketIdParamsSchema.safeParse(request.params);
    const body = replyTicketSchema.safeParse(request.body);
    if (!params.success || !body.success)
      throw new ValidationAppError({
        params: params.success ? undefined : params.error.flatten(),
        body: body.success ? undefined : body.error.flatten(),
      });
    const message = await new TicketService(app.prisma).reply({
      ticketId: params.data.ticketId,
      authorId: body.data.authorId,
      body: body.data.body,
      isAdmin: body.data.isAdmin,
      ...(body.data.attachmentUrl !== undefined ? { attachmentUrl: body.data.attachmentUrl } : {}),
    });
    return ok({ id: message.id, createdAt: message.createdAt.toISOString() });
  });

  app.post('/tickets/:ticketId/close', async (request) => {
    const params = ticketIdParamsSchema.safeParse(request.params);
    const body = zCloseBody.safeParse(request.body);
    if (!params.success || !body.success) {
      throw new ValidationAppError({
        params: params.success ? undefined : params.error.flatten(),
        body: body.success ? undefined : body.error.flatten(),
      });
    }
    const ticket = await new TicketService(app.prisma).close(
      params.data.ticketId,
      body.data.actorId,
      body.data.isAdmin,
    );
    return ok({ id: ticket.id, status: ticket.status });
  });
};

const zUserIdQuery = z.object({ userId: z.string().uuid().optional() });
const zCloseBody = z.object({
  actorId: z.string().uuid(),
  isAdmin: z.boolean().default(false),
});
