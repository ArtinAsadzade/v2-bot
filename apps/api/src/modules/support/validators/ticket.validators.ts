import { z } from 'zod';

export const userIdParamsSchema = z.object({ userId: z.string().uuid() });
export const ticketIdParamsSchema = z.object({ ticketId: z.string().uuid() });

export const createTicketSchema = z.object({
  userId: z.string().uuid(),
  subject: z.string().min(3).max(180),
  body: z.string().min(10).max(4000),
  category: z.enum(['PAYMENT', 'TECHNICAL', 'ACCOUNT', 'GENERAL']).default('GENERAL'),
  idempotencyKey: z.string().min(8).max(160),
});

export const replyTicketSchema = z.object({
  authorId: z.string().uuid(),
  body: z.string().min(1).max(4000),
  isAdmin: z.boolean().default(false),
  attachmentUrl: z.string().url().optional(),
});

export const adminReplySchema = replyTicketSchema.extend({ isAdmin: z.literal(true) });
