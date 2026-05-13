import type { FastifyRequest } from 'fastify';
import type { ZodSchema } from 'zod';

import { ValidationAppError } from '../errors/app-error.js';

export const parseRequestBody = <T>(schema: ZodSchema<T>, request: FastifyRequest): T => {
  const result = schema.safeParse(request.body);
  if (!result.success) throw new ValidationAppError(result.error.flatten());
  return result.data;
};
