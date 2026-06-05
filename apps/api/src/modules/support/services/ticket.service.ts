import {
  SupportTicketStatus,
  SystemEventType,
  TicketCategory,
  UserActivityType,
} from '@prisma/client';

import { NotFoundError, ValidationAppError } from '../../../core/errors/app-error.js';
import { eventBus } from '../../../infrastructure/events/event-bus.js';
import { EngagementService } from '../../engagement/services/engagement.service.js';
import { enqueueTicketProcessing } from '../queues/ticket.queues.js';

import type { PrismaClient } from '@prisma/client';

const SLA_HOURS = 24;

export class TicketService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async create(input: {
    userId: string;
    subject: string;
    body: string;
    category: TicketCategory;
    idempotencyKey: string;
  }) {
    const recent = await this.prisma.supportTicket.count({
      where: {
        userId: input.userId,
        createdAt: { gte: new Date(Date.now() - 3_600_000) },
        deletedAt: null,
      },
    });
    if (recent >= 5) {
      throw new ValidationAppError({ ticket: ['rate limit exceeded'] });
    }

    const existing = await this.prisma.supportTicket.findFirst({
      where: { userId: input.userId, subject: input.subject, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && Date.now() - existing.createdAt.getTime() < 60_000) {
      throw new ValidationAppError({ ticket: ['duplicate action'] });
    }

    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          userId: input.userId,
          subject: input.subject,
          category: input.category,
          status: SupportTicketStatus.OPEN,
          slaDueAt: new Date(Date.now() + SLA_HOURS * 3_600_000),
        },
      });
      await tx.supportTicketMessage.create({
        data: { ticketId: created.id, authorId: input.userId, body: input.body, isAdmin: false },
      });
      return created;
    });

    await new EngagementService(this.prisma).logActivity(
      input.userId,
      UserActivityType.TICKET_CREATED,
      5,
    );
    await enqueueTicketProcessing({ ticketId: ticket.id, action: 'created' });
    await eventBus.emit({
      type: SystemEventType.TICKET_CREATED,
      idempotencyKey: `ticket:${input.idempotencyKey}`,
      aggregateType: 'ticket',
      aggregateId: ticket.id,
      payload: { ticketId: ticket.id, userId: input.userId, subject: input.subject },
    });
    return ticket;
  }

  public async reply(input: {
    ticketId: string;
    authorId: string;
    body: string;
    isAdmin: boolean;
    attachmentUrl?: string;
  }) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: input.ticketId, deletedAt: null },
    });
    if (!ticket) throw new NotFoundError('Ticket');
    if (!input.isAdmin && ticket.userId !== input.authorId) {
      throw new ValidationAppError({ ticket: ['forbidden'] });
    }

    const message = await this.prisma.supportTicketMessage.create({
      data: {
        ticketId: input.ticketId,
        authorId: input.authorId,
        body: input.body,
        isAdmin: input.isAdmin,
        attachmentUrl: input.attachmentUrl ?? null,
      },
    });

    const status = input.isAdmin
      ? SupportTicketStatus.WAITING_USER
      : SupportTicketStatus.WAITING_ADMIN;
    await this.prisma.supportTicket.update({
      where: { id: input.ticketId },
      data: { status },
    });
    await enqueueTicketProcessing({
      ticketId: input.ticketId,
      action: input.isAdmin ? 'admin-reply' : 'user-reply',
    });
    return message;
  }

  public async listForUser(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 1 },
      },
    });
  }

  public async getThread(ticketId: string, userId?: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: {
        id: ticketId,
        deletedAt: null,
        ...(userId ? { userId } : {}),
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) throw new NotFoundError('Ticket');
    return ticket;
  }

  public async close(ticketId: string, actorId: string, isAdmin: boolean) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, deletedAt: null },
    });
    if (!ticket) throw new NotFoundError('Ticket');
    if (!isAdmin && ticket.userId !== actorId) {
      throw new ValidationAppError({ ticket: ['forbidden'] });
    }
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: SupportTicketStatus.CLOSED, closedAt: new Date() },
    });
  }
}
